/* =====================================================================
   v28 FRIENDS — friend codes, online status, room invites. Free, no accounts.
   · The first time the friends panel is opened the game registers an anonymous player (id + random secret, kept in
     this browser's localStorage) and gets an 8-digit friend code. Tables live in Supabase (sf2-tactical) and are closed
     to the public API; every call goes through functions that check the secret (supabase/v28_friends.sql).
   · Every 5 s a heartbeat (sf2_poll) reports where we are (大廳 / 房間 / 對戰中, and our room code for friends to join)
     and returns the friend list with their status plus any room invites waiting for us.
   · An invite / friend request also "pokes" the friend's inbox channel (Realtime broadcast), so his game asks the
     server right away instead of within 5 s. A poke carries nothing — the server decides what is real.
   ===================================================================== */
const FRIEND_ST = { hub: '在大廳', room: '在房間', playing: '對戰中' };
const fmtFriend = (c) => (c ? c.slice(0, 4) + ' ' + c.slice(4) : '');
const FRIEND_KEY = 'sf2.friendId';

class Friends {
  constructor(app) {
    this.app = app; this.me = null; this.list = []; this.ok = false; this.err = ''; this.onChange = null;
    this.pokes = new Map(); this.seenIncoming = null; this.started = null;
  }
  get hasId() { return !!this._load(); }
  _load() { try { const m = JSON.parse(localStorage.getItem(FRIEND_KEY) || 'null'); if (m && m.id && m.secret && /^\d{8}$/.test(m.code)) return m; } catch (e) { /* storage off */ } return null; }
  // register lazily: a player who never opens the friends panel never creates a server record
  start() {
    if (!this.started) this.started = this._init().catch((e) => { this.started = null; this.err = '連不上好友伺服器（需要網路）'; this._changed(); throw e; });
    return this.started;
  }
  async _init() {
    this.sb = await supa();
    this.me = this._load() || await this._register();
    const ch = this.sb.channel('sf2:inbox:' + this.me.id, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'poke' }, () => this.pollSoon());
    subscribed(ch).catch(() => {}); this.inbox = ch;
    await this.poll();
    clearInterval(this.timer); this.timer = setInterval(() => this.poll(), 5000);
    addEventListener('pagehide', () => this.bye());
    return this;
  }
  async _register() {
    const { data, error } = await this.sb.rpc('sf2_register', { p_name: Settings.data.nick || '玩家' });
    if (error || !data || !data.id) throw new Error(error ? error.message : 'register');
    try { localStorage.setItem(FRIEND_KEY, JSON.stringify(data)); } catch (e) { /* storage off: this session only */ }
    return data;
  }
  async rpc(fn, args = {}) {
    const { data, error } = await this.sb.rpc(fn, { p_id: this.me.id, p_secret: this.me.secret, ...args });
    if (error) throw new Error(error.message); return data;
  }
  _changed() { if (this.onChange) this.onChange(); }
  // where we are, as friends see it
  _where() {
    const a = this.app, r = a.room, inMatch = !!a.match && ['loading', 'shot', 'playing', 'paused', 'ended'].includes(a.state);
    return { st: inMatch ? 'playing' : r ? 'room' : 'hub', room: r && r.online ? r.code : null };
  }
  async poll() {
    if (!this.me || this.polling) return; this.polling = true;
    try {
      const w = this._where();
      const d = await this.rpc('sf2_poll', { p_status: w.st, p_room: w.room, p_name: Settings.data.nick || null });
      this.list = (Array.isArray(d.friends) ? d.friends : []).slice(0, 200).map((f) => ({
        id: String(f.id), name: safeName(f.name, '玩家'), code: /^\d{8}$/.test(f.code) ? f.code : '', state: ['friend', 'incoming', 'outgoing'].includes(f.state) ? f.state : 'friend',
        online: !!f.online, st: Object.prototype.hasOwnProperty.call(FRIEND_ST, f.st) ? f.st : null, room: parseCode(f.room) }));
      this.ok = true; this.err = '';
      const inc = this.list.filter((f) => f.state === 'incoming');
      if (this.seenIncoming) for (const f of inc) if (!this.seenIncoming.has(f.id)) this.app.roomToast(`${f.name} 想加你為好友 · 打開「好友」接受`);
      this.seenIncoming = new Set(inc.map((f) => f.id));
      for (const inv of Array.isArray(d.invites) ? d.invites.slice(0, 5) : []) { const room = parseCode(inv.room); if (room) this.app.onFriendInvite({ from: String(inv.from), name: safeName(inv.name, '好友'), room }); }
    } catch (e) {
      if (/sf2 auth/.test(e.message) && !this.reReg) { this.reReg = true; try { localStorage.removeItem(FRIEND_KEY); } catch (x) { /* */ } this.me = await this._register().catch(() => this.me); } // the server forgot us: start over
      else this.err = '連不上好友伺服器';
    } finally { this.polling = false; this._changed(); }
  }
  pollSoon() { clearTimeout(this.soonT); this.soonT = setTimeout(() => this.poll(), 250); }
  // nudge a friend's game to ask the server now (his inbox channel; joined once per friend and kept)
  async poke(id) {
    try {
      let p = this.pokes.get(id); if (!p) { p = subscribed(this.sb.channel('sf2:inbox:' + id, { config: { broadcast: { self: false } } })); this.pokes.set(id, p); }
      const ch = await p; await ch.send({ type: 'broadcast', event: 'poke', payload: {} });
    } catch (e) { this.pokes.delete(id); }
  }
  async add(code) { const r = await this.rpc('sf2_add_friend', { p_code: code }); if (r && r.ok && r.other) this.poke(String(r.other)); await this.poll(); return r || { ok: false, why: '失敗' }; }
  async respond(id, yes) { await this.rpc('sf2_respond', { p_other: id, p_accept: !!yes }); this.poke(id); await this.poll(); }
  async remove(id) { await this.rpc('sf2_remove_friend', { p_other: id }); this.poke(id); await this.poll(); }
  async invite(id, room) { const r = await this.rpc('sf2_invite', { p_to: id, p_room: room }); if (r && r.ok) this.poke(id); return r || { ok: false, why: '失敗' }; }
  // leaving the page: show offline at once (keepalive request survives the unload)
  bye() {
    if (!this.me) return;
    try { fetch(ONLINE.url + '/rest/v1/rpc/sf2_bye', { method: 'POST', keepalive: true, headers: { apikey: ONLINE.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: this.me.id, p_secret: this.me.secret }) }); } catch (e) { /* best effort */ }
  }
  get friends() { return this.list.filter((f) => f.state === 'friend').sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name)); }
  get incoming() { return this.list.filter((f) => f.state === 'incoming'); }
  get outgoing() { return this.list.filter((f) => f.state === 'outgoing'); }
}
