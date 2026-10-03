/* =====================================================================
   v27 ROOMS — like SF2: a room exists before, between and after matches.
   · 建立房間 opens a room at once: a 6-digit code and the host's WebRTC transport listening for friends. Friends join the
     ROOM, not a match: they show up in the team lists, pick a team, and the host starts every match for everyone.
   · The connection belongs to the room and outlives each match. A match talks through a RoomLink (the transport's
     send / onMessage / onLeave interface; closing it leaves the room open); room messages (ROOM_KEYS) stay here.
   · When the host leaves the room, the member who joined first opens the same code as the new host and the others
     reconnect to him. A match in progress ends for everyone (nobody else has its state).
   ===================================================================== */
const ROOM_KEYS = new Set(['rhello', 'rwelcome', 'rreject', 'rstate', 'rteam', 'rst', 'rleave', 'rcount', 'rcancel', 'rgo', 'rchat']);
// v31 chat: { n name, c team colour, t text, tm team-only, sys system line } — text is shown with textContent only
const chatText = (t) => String(t ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
function chatSafe(m) {
  if (!m || typeof m !== 'object') return null; const t = chatText(m.t); if (!t) return null;
  return { n: m.sys ? '' : safeName(m.n, '玩家'), c: m.c === 'bravo' ? 'bravo' : m.c === 'alpha' ? 'alpha' : null, t, tm: !!m.tm, sys: !!m.sys };
}
const ROOM_ST = { room: 'READY', loading: '載入中', playing: '對戰中', ended: '結算中' };

// the room's settings as the host sends them, and as a member accepts them (a broken or hostile value can never reach Match)
function roomCfgOut() {
  const L = Settings.data.lobby;
  return { map: L.map, mode: L.mode, rule: L.rule, difficulty: L.difficulty, allies: L.allies, enemies: L.enemies, ruleCfg: { [L.rule]: L.ruleCfg[L.rule] || RULES[L.rule].def } };
}
function roomCfgSafe(c) {
  c = c && typeof c === 'object' ? c : {};
  const rule = Object.prototype.hasOwnProperty.call(RULES, c.rule) ? c.rule : 'tdm', R = RULES[rule], rc = (c.ruleCfg && c.ruleCfg[rule]) || {};
  return { map: clamp(c.map | 0, 0, MAPS.length - 1), mode: Object.prototype.hasOwnProperty.call(MODES, c.mode) ? c.mode : 'general', rule, difficulty: clamp(c.difficulty | 0, 0, DIFFICULTY.length - 1),
    allies: clamp(c.allies | 0, 1, 12), enemies: clamp(c.enemies | 0, 1, 12),
    ruleCfg: { [rule]: { target: R.targets.includes(rc.target) ? rc.target : R.def.target, time: R.times.includes(rc.time) ? rc.time : R.def.time } } };
}

// One match's view of the room connection.
class RoomLink {
  constructor(t) { this.t = t; this.onMessage = null; this.onLeave = null; this.closed = false; }
  get id() { return this.t.id; }
  get room() { return this.t.room; }
  get stats() { return this.t.stats; }
  get isOpen() { return !!this.t.isOpen; }
  send(to, d, rel = true) { if (!this.closed) this.t.send(to, d, rel); }
  close() { this.closed = true; this.onMessage = null; this.onLeave = null; }
}

class RoomSession {
  constructor(app, code) {
    this.app = app; this.code = code; this.members = []; this.cfg = null; this.mcfg = null; this.phase = 'room';
    this.t = null; this.link = null; this.online = false; this.closed = false; this.pub = false; this.myId = null; this.chat = [];
  }
  _addChat(m) { this.chat.push(m); if (this.chat.length > 60) this.chat.shift(); this.app.onChat(this, m); }
  _route(from, d) {
    if (d && !(d instanceof ArrayBuffer) && ROOM_KEYS.has(d.k)) { try { this._room(from, d); } catch (e) { console.warn('[room]', e); } }
    else if (this.link && this.link.onMessage) this.link.onMessage(from, d);
  }
  newLink() { if (this.link) this.link.close(); return (this.link = new RoomLink(this.t)); }
  dropLink() { if (this.link) this.link.close(); this.link = null; }
  get me() { return this.members.find((m) => m.id === this.myId) || null; }
  humans(team) { return this.members.filter((m) => m.team === team); }
}

class RoomHost extends RoomSession {
  // opts.code + opts.migrate: a member taking over a room whose host left (same code; the others reconnect to him)
  constructor(app, opts = {}) {
    super(app, opts.code || roomCode()); this.role = 'host'; this.myId = 'host'; this.pub = !!opts.pub; this.order = 1; this.migrate = !!opts.migrate;
    this.members = [{ id: 'host', name: safeName(Settings.data.nick, '房主'), team: 'alpha', host: true, st: 'room', order: 0 }];
    this.ready = this._open();
  }
  async _open() {
    for (let i = 0; i < 4; i++) {
      const t = new RtcHostTransport(this.code, { probe: true });
      try { await t.ready; } catch (e) {
        t.close();
        if (e.message !== 'TAKEN' || this.migrate || this.closed) throw e;
        this.code = roomCode(); continue; // that code is someone else's room: draw another
      }
      if (this.closed) { t.close(); return this; }
      this.t = t; this.online = true;
      t.onMessage = (from, d) => this._route(from, d);
      t.onLeave = (id) => { if (this.link && this.link.onLeave) this.link.onLeave(id); this._remove(id, '離開了房間'); };
      this._changed();
      return this;
    }
    throw new Error('TAKEN');
  }
  _room(from, d) {
    if (d.k === 'rhello') { this._hello(from, d); return; }
    const m = this.members.find((x) => x.id === from); if (!m) return;
    if (d.k === 'rchat') { // one line per 0.4 s per player; the host re-sends it (team lines only to that team)
      const now = performance.now(), t = chatText(d.t); if (!t || now - (m.chatT || 0) < 400) return; m.chatT = now;
      this._deliver({ n: m.name, c: m.team, t, tm: !!d.tm, sys: false }, from); return;
    }
    if (d.k === 'rteam') { if (this.phase === 'room' && (d.team === 'alpha' || d.team === 'bravo') && m.team !== d.team) { m.team = d.team; this._changed(); } }
    else if (d.k === 'rst') { if (Object.prototype.hasOwnProperty.call(ROOM_ST, d.st) && m.st !== d.st) { m.st = d.st; this._changed(); } }
    else if (d.k === 'rleave') this._remove(from, '離開了房間');
  }
  _hello(from, d) {
    if (d.v !== NET_VERSION) { this.t.send(from, { k: 'rreject', why: '遊戲版本不同：請雙方都按 Ctrl+F5 重新整理頁面' }); return; }
    let m = this.members.find((x) => x.id === from);
    if (!m) {
      if (this.members.length >= ONLINE.maxPlayers) { this.t.send(from, { k: 'rreject', why: `房間已滿（最多 ${ONLINE.maxPlayers} 人）` }); return; }
      // friends land on the host's team (play together against bots); one click on the other team switches
      const team = d.team === 'alpha' || d.team === 'bravo' ? d.team : this.humans('alpha').length < Math.max(2, Settings.data.lobby.allies) ? 'alpha' : 'bravo';
      m = { id: from, name: safeName(d.name, '朋友'), team, host: false, st: 'room', order: this.order++ };
      this.members.push(m); this.app.roomToast(`${m.name} 進入了房間`); this.sys(`${m.name} 進入了房間`, from);
    }
    this.t.send(from, { k: 'rwelcome', you: from, ...this._state(), chat: this.chat.filter((x) => !x.tm).slice(-15) });
    this._changed();
  }
  _remove(id, why) {
    const i = this.members.findIndex((x) => x.id === id); if (i < 1) return;
    const [m] = this.members.splice(i, 1); this.app.roomToast(`${m.name} ${why}`); this.sys(`${m.name} ${why}`); this._changed();
  }
  // a chat line for everyone it is meant for (not back to its sender — he showed it already)
  _deliver(msg, except = null) {
    const host = this.members[0];
    if (!msg.tm || msg.c === host.team || except === 'host') { if (except !== 'host') this._addChat(msg); }
    if (this.t) for (const m of this.members) if (m.id !== 'host' && m.id !== except && (!msg.tm || m.team === msg.c)) this.t.send(m.id, { k: 'rchat', ...msg });
  }
  say(text, team = false) { const t = chatText(text); if (!t) return false; const me = this.members[0]; this._addChat({ n: me.name, c: me.team, t, tm: team, sys: false, me: true }); this._deliver({ n: me.name, c: me.team, t, tm: team, sys: false }, 'host'); return true; }
  sys(text, except = null) { this._deliver({ n: '', c: null, t: chatText(text), tm: false, sys: true }, except); }
  _state() { return { code: this.code, phase: this.phase, cfg: roomCfgOut(), mcfg: this.mcfg, members: this.members, pub: this.pub }; }
  // something changed: tell the members (one message per burst of changes) and redraw the room
  _changed() { this.broadcast(); this.app.onRoomChange(this); }
  broadcast() {
    clearTimeout(this.bT);
    this.bT = setTimeout(() => {
      if (this.t && !this.closed) this.t.send('*', { k: 'rstate', ...this._state() });
      if (this.pub && this.online) this._announce();
    }, 60);
  }
  countdown() { if (this.t) this.t.send('*', { k: 'rcount' }); }
  cancel() { if (this.t) this.t.send('*', { k: 'rcancel' }); }
  go(cfg) { this.phase = 'playing'; this.mcfg = cfg; this.members[0].st = 'loading'; if (this.t) this.t.send('*', { k: 'rgo', cfg }); this._changed(); }
  status(st) { const me = this.members[0]; if (me.st !== st) { me.st = st; this._changed(); } }
  matchOver() { if (this.phase !== 'room') { this.phase = 'room'; this.mcfg = null; this._changed(); } }
  setPublic(on) { this.pub = !!on; if (this.pub) this._announce(); else this.app.dir.withdraw().catch(() => {}); this._changed(); }
  _announce() {
    const L = Settings.data.lobby;
    this.app.dir.announce({ code: this.code, host: this.members[0].name, map: MAPS[L.map].name, mode: RULES[L.rule].name, players: this.members.length, max: ONLINE.maxPlayers, phase: this.phase }).catch(() => {});
  }
  close() {
    if (this.closed) return; this.closed = true; this.dropLink(); clearTimeout(this.bT);
    if (this.pub) this.app.dir.withdraw().catch(() => {});
    if (this.t) { this.t.onLeave = null; this.t.onMessage = null; this.t.close(); } this.online = false; // leaving: no "X left" for everyone
  }
}

class RoomGuest extends RoomSession {
  // opts.rejoin: reconnecting after the host left (waits longer — the next host first checks the code is really free)
  constructor(app, code, opts = {}) { super(app, code); this.role = 'guest'; this.team = opts.team || null; this.rejoin = !!opts.rejoin; this.entered = false; this.onStatus = null; }
  start() {
    const t = this.t = new RtcClientTransport(this.code, { wait: this.rejoin ? 25000 : 15000 });
    t.onStatus = (s) => { if (this.onStatus) this.onStatus(s); };
    t.onOpen = () => {
      this.online = true; t.send('host', { k: 'rhello', v: NET_VERSION, name: Settings.data.nick, team: this.team });
      this.wT = setTimeout(() => { if (!this.entered) this._fail('房主沒有回應（對方可能是舊版本，請雙方都重新整理頁面）'); }, 10000);
    };
    t.onMessage = (from, d) => this._route(from, d);
    t.onLeave = () => { if (this.link && this.link.onLeave) this.link.onLeave('host'); this._hostGone(); };
    t.onError = (why) => this._fail(why);
    t.start().catch((e) => this._fail('連不上配對伺服器：' + e.message));
  }
  _room(from, d) {
    if (d.k === 'rwelcome') {
      this.myId = String(d.you); this._apply(d);
      if (Array.isArray(d.chat) && !this.chat.length) for (const x of d.chat.slice(-15)) { const m = chatSafe(x); if (m) this.chat.push(m); }
      if (!this.entered) { this.entered = true; clearTimeout(this.wT); this.app.onRoomEnter(this); }
      return;
    }
    if (d.k === 'rreject') { this._fail(String(d.why || '房主拒絕加入').slice(0, 40)); return; }
    if (!this.entered) return;
    if (d.k === 'rstate') { this._apply(d); this.app.onRoomChange(this); }
    else if (d.k === 'rcount') this.app.guestCountdown(true);
    else if (d.k === 'rcancel') this.app.guestCountdown(false);
    else if (d.k === 'rgo') { this.phase = 'playing'; this.mcfg = roomCfgSafe(d.cfg); this.app.startGuestMatch(); }
    else if (d.k === 'rchat') { const m = chatSafe(d); if (m) this._addChat(m); }
  }
  _apply(d) {
    this.code = parseCode(d.code) || this.code; this.phase = d.phase === 'playing' ? 'playing' : 'room'; this.pub = !!d.pub;
    this.cfg = roomCfgSafe(d.cfg); this.mcfg = d.mcfg ? roomCfgSafe(d.mcfg) : null;
    this.members = (Array.isArray(d.members) ? d.members : []).slice(0, 16).map((m) => ({ id: String(m.id), name: safeName(m.name), team: m.team === 'bravo' ? 'bravo' : 'alpha', host: !!m.host,
      st: Object.prototype.hasOwnProperty.call(ROOM_ST, m.st) ? m.st : 'room', order: m.order | 0 }));
    const me = this.me; if (me) this.team = me.team;
  }
  setTeam(team) { if (this.t && this.phase === 'room') this.t.send('host', { k: 'rteam', team }); }
  say(text, team = false) {
    const t = chatText(text), me = this.me; if (!t || !this.t || !this.online || !this.entered) return false;
    this.t.send('host', { k: 'rchat', t, tm: team }); this._addChat({ n: me ? me.name : safeName(Settings.data.nick), c: this.team, t, tm: team, sys: false, me: true }); return true;
  }
  status(st) { const me = this.me; if (me) me.st = st; if (this.t && this.online && !this.closed) this.t.send('host', { k: 'rst', st }); }
  leave() {
    if (this.closed) return; this.closed = true; this.dropLink(); clearTimeout(this.wT);
    const t = this.t; if (!t) return;
    if (this.online) t.send('host', { k: 'rleave' });
    setTimeout(() => t.close(), 150); // let the goodbye leave before the connection closes
  }
  _hostGone() { if (this.closed) return; this.closed = true; this.dropLink(); clearTimeout(this.wT); this.app.onRoomHostLost(this); }
  _fail(why) { if (this.closed) return; this.closed = true; this.dropLink(); clearTimeout(this.wT); if (this.t) this.t.close(false); this.app.onRoomFail(this, why); }
  // who takes over when the host leaves: the member who joined first (every member decides the same from the same list)
  successor() { return this.members.filter((m) => !m.host).sort((a, b) => a.order - b.order)[0] || null; }
}
