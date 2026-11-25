// Friends store: the same rules as the old Supabase functions (supabase/v28_friends.sql), kept in one JSON file.
// No accounts: a player is an id + random secret (only its SHA-256 is stored) + an 8-digit friend code.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest('hex');
const cleanName = (p) => (String(p ?? '').replace(/[<>&"'`\\]/g, '').trim() || '玩家').slice(0, 14);
const ONLINE_MS = 70e3, INVITE_MS = 120e3, INVITE_DROP_MS = 600e3;
const isRoom = (r) => typeof r === 'string' && /^\d{6}$/.test(r);
const pairKey = (x, y) => (x < y ? x + '|' + y : y + '|' + x);

export class FriendStore {
  constructor(file) {
    this.file = file; this.players = new Map(); this.byCode = new Map(); this.pairs = new Map(); this.invites = [];
    this.saveT = null; this._load();
  }
  _load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const p of d.players || []) { this.players.set(p.id, p); this.byCode.set(p.code, p.id); }
      for (const f of d.friends || []) this.pairs.set(pairKey(f.a, f.b), f);
    } catch (e) { if (e.code !== 'ENOENT') console.error('[friends] could not read', this.file, e.message); }
  }
  // write at most once a second, atomically (temp file + rename) so a crash never leaves half a file
  _save() {
    if (this.saveT) return;
    this.saveT = setTimeout(() => {
      this.saveT = null;
      const body = JSON.stringify({ players: [...this.players.values()], friends: [...this.pairs.values()] });
      const tmp = this.file + '.tmp';
      try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(tmp, body); fs.renameSync(tmp, this.file); }
      catch (e) { console.error('[friends] save failed', e.message); }
    }, 1000);
  }
  // on shutdown: write now, including everyone's last_seen
  flush() {
    clearTimeout(this.saveT); this.saveT = null;
    const body = JSON.stringify({ players: [...this.players.values()], friends: [...this.pairs.values()] }), tmp = this.file + '.tmp';
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(tmp, body); fs.renameSync(tmp, this.file); } catch (e) { console.error('[friends] save failed', e.message); }
  }
  _auth(id, secret) {
    const p = this.players.get(String(id ?? ''));
    if (!p || p.secret_hash !== sha(secret)) throw new Error('sf2 auth');
    return p;
  }
  _others(id) { const out = []; for (const f of this.pairs.values()) if (f.a === id || f.b === id) out.push(f); return out; }

  register({ p_name }) {
    const secret = crypto.randomBytes(24).toString('hex');
    for (let i = 0; i < 30; i++) {
      const code = String(10000000 + Math.floor(Math.random() * 90000000));
      if (this.byCode.has(code)) continue;
      const id = crypto.randomUUID(), now = Date.now();
      this.players.set(id, { id, secret_hash: sha(secret), code, name: cleanName(p_name), status: 'hub', room: null, last_seen: now, created_at: now });
      this.byCode.set(code, id); this._save();
      return { id, secret, code };
    }
    throw new Error('no free friend code');
  }
  poll({ p_id, p_secret, p_status, p_room, p_name }) {
    const me = this._auth(p_id, p_secret), now = Date.now();
    me.last_seen = now; me.status = ['hub', 'room', 'playing'].includes(p_status) ? p_status : 'hub';
    me.room = isRoom(p_room) ? p_room : null; if (p_name != null) me.name = cleanName(p_name);
    const friends = this._others(me.id).map((f) => {
      const o = this.players.get(f.a === me.id ? f.b : f.a); if (!o) return null;
      const on = f.accepted && o.last_seen > now - ONLINE_MS;
      return { id: o.id, name: o.name, code: o.code, state: f.accepted ? 'friend' : f.requester === me.id ? 'outgoing' : 'incoming', online: on, st: on ? o.status : null, room: on ? o.room : null };
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const mine = this.invites.filter((v) => v.to === me.id); this.invites = this.invites.filter((v) => v.to !== me.id);
    const invites = mine.filter((v) => v.at > now - INVITE_MS && this.players.has(v.from)).map((v) => ({ from: v.from, name: this.players.get(v.from).name, room: v.room }));
    return { friends, invites }; // last_seen is not worth a disk write every 5 s per player: saved with the next real change
  }
  add_friend({ p_id, p_secret, p_code }) {
    const me = this._auth(p_id, p_secret), other = this.byCode.get(String(p_code ?? '').replace(/\D/g, ''));
    if (!other) return { ok: false, why: '找不到這個好友代碼' };
    if (other === me.id) return { ok: false, why: '這是你自己的好友代碼' };
    const k = pairKey(me.id, other), r = this.pairs.get(k);
    if (r) {
      if (r.accepted) return { ok: false, why: '你們已經是好友了' };
      if (r.requester === me.id) return { ok: false, why: '已經送出邀請，等待對方確認' };
      r.accepted = true; this._save(); return { ok: true, result: 'accepted', other };
    }
    let pending = 0; for (const f of this.pairs.values()) if (f.requester === me.id && !f.accepted) pending++;
    if (pending >= 30) return { ok: false, why: '等待確認的好友邀請太多了' };
    const [a, b] = me.id < other ? [me.id, other] : [other, me.id];
    this.pairs.set(k, { a, b, requester: me.id, accepted: false, created_at: Date.now() }); this._save();
    return { ok: true, result: 'sent', other };
  }
  respond({ p_id, p_secret, p_other, p_accept }) {
    const me = this._auth(p_id, p_secret), k = pairKey(me.id, String(p_other ?? '')), r = this.pairs.get(k);
    if (r && r.requester === String(p_other) && !r.accepted) { if (p_accept) r.accepted = true; else this.pairs.delete(k); this._save(); }
    return { ok: true };
  }
  remove_friend({ p_id, p_secret, p_other }) {
    const me = this._auth(p_id, p_secret);
    if (this.pairs.delete(pairKey(me.id, String(p_other ?? '')))) this._save();
    return { ok: true };
  }
  invite({ p_id, p_secret, p_to, p_room }) {
    const me = this._auth(p_id, p_secret), to = String(p_to ?? '');
    if (!isRoom(p_room)) return { ok: false, why: '房間代碼不正確' };
    const r = this.pairs.get(pairKey(me.id, to)); if (!r || !r.accepted) return { ok: false, why: '只能邀請好友' };
    const now = Date.now();
    this.invites = this.invites.filter((v) => !(v.from === me.id && v.to === to) && v.at > now - INVITE_DROP_MS);
    this.invites.push({ from: me.id, to, room: p_room, at: now });
    return { ok: true };
  }
  bye({ p_id, p_secret }) {
    try { const me = this._auth(p_id, p_secret); me.last_seen = Date.now() - 3600e3; me.room = null; } catch (e) { /* unknown player: nothing to do */ }
    return null;
  }
}
// the game calls these by their old Supabase names
export const RPC = { sf2_register: 'register', sf2_poll: 'poll', sf2_add_friend: 'add_friend', sf2_respond: 'respond', sf2_remove_friend: 'remove_friend', sf2_invite: 'invite', sf2_bye: 'bye' };
