/* =====================================================================
   v26 ONLINE — play with friends on other computers, free.
   · Supabase Realtime (project sf2-tactical, free plan) only helps two browsers FIND each other: the lobby channel lists
     open rooms (presence), a room channel carries the WebRTC handshake (offer / answer / ICE candidates).
   · The game itself flows peer-to-peer over two WebRTC DataChannels per friend: 'r' reliable + ordered (events),
     'u' unreliable + unordered (commands, snapshots — a late copy is useless, the next one replaces it).
   · Both transports expose the LoopbackTransport interface (send / onMessage / onLeave), so NetHost / NetClient are
     unchanged. A friend who cannot connect directly (strict NAT) needs a TURN relay: add one to ONLINE.ice.
   ===================================================================== */
const ONLINE = {
  url: 'https://xdacaaxopfntdwpvrdky.supabase.co',
  key: 'sb_publishable_MSc9txrWU-lZSOvIFpcyXw_gJns4kXO', // publishable key: made to be public, and this project grants it no table access
  lib: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm',
  ice: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }],
  maxPlayers: 8,
};
let _supa = null;
function supa() {
  if (!_supa) _supa = import(ONLINE.lib).then(({ createClient }) => createClient(ONLINE.url, ONLINE.key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 40 } } }));
  return _supa;
}
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const roomCode = () => Array.from({ length: 5 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');
const netRid = () => Math.random().toString(36).slice(2, 10);
const subscribed = (ch) => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('TIMED_OUT')), 15000); ch.subscribe((s) => { if (s === 'SUBSCRIBED') { clearTimeout(to); res(ch); } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(to); rej(new Error(s)); } }); });
const PUBLIC_URL = 'https://weiweiweiweiweiweiweiwei.github.io/sf2-tactical-prototype/'; // friends open the online copy, never your local file
const inviteLink = (code) => (location.protocol === 'file:' ? PUBLIC_URL : location.href.split(/[?#]/)[0]) + '?room=' + code;

// Every open room is one presence entry on the shared lobby channel; it disappears by itself when the host leaves.
class RoomDirectory {
  constructor() { this.ch = null; this.rooms = []; this.onChange = null; this.mine = null; this.opening = null; }
  open() {
    if (!this.opening) this.opening = (async () => {
      const sb = await supa(), ch = sb.channel('sf2:lobby', { config: { presence: { key: netRid() } } });
      ch.on('presence', { event: 'sync' }, () => {
        const all = Object.values(ch.presenceState()).flat().filter((r) => r && r.code && r.v === NET_VERSION);
        this.rooms = all.filter((r) => !this.mine || r.code !== this.mine.code).sort((a, b) => b.t - a.t);
        if (this.onChange) this.onChange(this.rooms);
      });
      this.ch = await subscribed(ch);
      if (this.mine) await ch.track(this.mine);
      return this;
    })().catch((e) => { this.opening = null; throw e; });
    return this.opening;
  }
  async announce(info) { this.mine = Object.assign({ v: NET_VERSION, t: Date.now() }, info); await this.open(); await this.ch.track(this.mine); }
  async update(patch) { if (!this.mine || !this.ch) return; Object.assign(this.mine, patch); await this.ch.track(this.mine); }
  async withdraw() { this.mine = null; if (this.ch) await this.ch.untrack(); }
}

// Shared DataChannel helpers
function rtcSend(dc, data, reliable, stats) {
  if (!dc || dc.readyState !== 'open') return;
  if (!reliable && dc.bufferedAmount > 256 * 1024) { stats.dropped++; return; } // congested: skip stale state, never queue it
  const bin = data instanceof ArrayBuffer, payload = bin ? data : JSON.stringify(data);
  try { dc.send(payload); stats.sent++; stats.bytesOut += bin ? data.byteLength : payload.length; } catch (e) { stats.dropped++; }
}
function rtcParse(data) { if (typeof data !== 'string') return data; try { return JSON.parse(data); } catch (e) { return null; } }

class RtcHostTransport {
  constructor(code) {
    this.id = 'host'; this.room = code; this.peers = new Map(); this.onMessage = null; this.onLeave = null;
    this.stats = { sent: 0, recv: 0, bytesOut: 0, dropped: 0, lost: 0 };
    this.ready = this._open();
  }
  async _open() {
    const sb = await supa(), ch = sb.channel('sf2:room:' + this.room, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'sig' }, ({ payload }) => this._sig(payload).catch((e) => console.warn('[net] signalling', e)));
    this.ch = await subscribed(ch);
    return this;
  }
  _signal(to, msg) { if (this.ch) this.ch.send({ type: 'broadcast', event: 'sig', payload: Object.assign(msg, { from: 'host', to }) }); }
  async _sig(m) {
    if (!m || m.to !== 'host' || !m.from) return;
    const p = this.peers.get(m.from);
    if (m.t === 'hello') {
      if (p) return;
      if (this.peers.size >= ONLINE.maxPlayers - 1) { this._signal(m.from, { t: 'full' }); return; }
      await this._newPeer(m.from);
    } else if (m.t === 'answer' && p) { await p.pc.setRemoteDescription(m.sdp); for (const c of p.ice.splice(0)) await p.pc.addIceCandidate(c).catch(() => {}); }
    else if (m.t === 'ice' && p && m.cand) { if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.cand).catch(() => {}); else p.ice.push(m.cand); }
    else if (m.t === 'bye') this._drop(m.from);
  }
  async _newPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: ONLINE.ice }), p = { id, pc, ice: [], open: false };
    this.peers.set(id, p);
    p.r = pc.createDataChannel('r', { ordered: true }); p.u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
    for (const dc of [p.r, p.u]) {
      dc.binaryType = 'arraybuffer';
      dc.onmessage = (e) => { this.stats.recv++; const d = rtcParse(e.data); if (d && this.onMessage) this.onMessage(id, d); };
      dc.onopen = () => { if (p.r.readyState === 'open' && p.u.readyState === 'open') { p.open = true; clearTimeout(p.timer); } };
      dc.onclose = () => this._drop(id);
    }
    pc.onicecandidate = (e) => { if (e.candidate) this._signal(id, { t: 'ice', cand: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._drop(id); };
    p.timer = setTimeout(() => { if (!p.open) this._drop(id); }, 20000);
    await pc.setLocalDescription(await pc.createOffer());
    this._signal(id, { t: 'offer', sdp: pc.localDescription.toJSON() });
  }
  send(to, data, reliable = true) {
    const list = to === '*' ? this.peers.values() : [this.peers.get(to)];
    for (const p of list) if (p && p.open) rtcSend(reliable ? p.r : p.u, data, reliable, this.stats);
  }
  _drop(id) {
    const p = this.peers.get(id); if (!p) return;
    this.peers.delete(id); clearTimeout(p.timer); try { p.pc.close(); } catch (e) { /* closed */ }
    if (p.open && this.onLeave) this.onLeave(id);
  }
  close() {
    for (const id of [...this.peers.keys()]) { this._signal(id, { t: 'bye' }); this._drop(id); }
    this.onMessage = null; this.onLeave = null; if (this.ch) { this.ch.unsubscribe(); this.ch = null; }
  }
}

class RtcClientTransport {
  constructor(code) {
    this.id = netRid(); this.room = code; this.pc = null; this.ice = []; this.isOpen = false; this.closed = false;
    this.onMessage = null; this.onLeave = null; this.onOpen = null; this.onStatus = null; this.onError = null;
    this.stats = { sent: 0, recv: 0, bytesOut: 0, dropped: 0, lost: 0 };
  }
  async start() {
    this._status('連線到配對伺服器…');
    const sb = await supa(), ch = sb.channel('sf2:room:' + this.room, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'sig' }, ({ payload }) => this._sig(payload).catch((e) => this._fail('連線交握失敗：' + e.message)));
    this.ch = await subscribed(ch);
    this._status(`尋找房間 ${this.room} 的房主…`);
    const hello = () => { if (!this.pc && !this.closed) this._signal({ t: 'hello' }); };
    hello(); this.helloTimer = setInterval(hello, 1500);
    this.giveUp = setTimeout(() => { if (!this.isOpen) this._fail(this.pc ? '無法和房主建立直接連線（雙方的網路環境阻擋點對點連線）' : `找不到房間 ${this.room}，或房主已經離開`); }, 15000);
  }
  _status(s) { if (this.onStatus) this.onStatus(s); }
  _signal(msg) { if (this.ch) this.ch.send({ type: 'broadcast', event: 'sig', payload: Object.assign(msg, { from: this.id, to: 'host' }) }); }
  async _sig(m) {
    if (!m || m.to !== this.id || this.closed) return;
    if (m.t === 'offer' && !this.pc) {
      clearInterval(this.helloTimer); this._status('找到房主，建立點對點連線…');
      const pc = this.pc = new RTCPeerConnection({ iceServers: ONLINE.ice });
      pc.onicecandidate = (e) => { if (e.candidate) this._signal({ t: 'ice', cand: e.candidate.toJSON() }); };
      pc.ondatachannel = (e) => {
        const dc = e.channel; dc.binaryType = 'arraybuffer'; this[dc.label] = dc;
        dc.onmessage = (ev) => { this.stats.recv++; const d = rtcParse(ev.data); if (d && this.onMessage) this.onMessage('host', d); };
        dc.onopen = () => { if (this.r && this.u && this.r.readyState === 'open' && this.u.readyState === 'open' && !this.isOpen) { this.isOpen = true; clearTimeout(this.giveUp); this._status('已連線，等待房主回應…'); if (this.onOpen) this.onOpen(); } };
        dc.onclose = () => this._lost();
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this._lost(); };
      await pc.setRemoteDescription(m.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      this._signal({ t: 'answer', sdp: pc.localDescription.toJSON() });
      for (const c of this.ice.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (m.t === 'ice' && m.cand) { if (this.pc && this.pc.remoteDescription) await this.pc.addIceCandidate(m.cand).catch(() => {}); else this.ice.push(m.cand); }
    else if (m.t === 'full') this._fail('房間已滿（最多 ' + ONLINE.maxPlayers + ' 人）');
    else if (m.t === 'bye') this._lost();
  }
  send(to, data, reliable = true) { rtcSend(reliable ? this.r : this.u, data, reliable, this.stats); }
  _lost() { if (this.closed) return; const was = this.isOpen; this.close(false); if (was) { if (this.onLeave) this.onLeave('host'); } else this._fail('連線中斷'); }
  _fail(why) { if (this.closed) return; this.close(false); if (this.onError) this.onError(why); }
  close(bye = true) {
    if (this.closed) return; this.closed = true;
    if (bye) this._signal({ t: 'bye' });
    clearInterval(this.helloTimer); clearTimeout(this.giveUp);
    try { if (this.pc) this.pc.close(); } catch (e) { /* closed */ }
    if (this.ch) { this.ch.unsubscribe(); this.ch = null; }
  }
}

// A hidden tab gets no animation frames, so a host who switches windows would freeze the match for everyone. While the
// page is hidden during an online match, a worker's timer (not throttled like page timers) keeps the simulation going.
class BackgroundTicker {
  constructor(onTick) {
    this.onTick = onTick; this.worker = null;
    document.addEventListener('visibilitychange', () => this.sync());
  }
  sync(active) {
    const want = document.hidden && (active ?? this.active);
    if (want && !this.worker) {
      const src = 'let t=null;onmessage=(e)=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),16)}';
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.onTick(); this.worker.postMessage(1);
    } else if (!want && this.worker) { this.worker.terminate(); this.worker = null; }
  }
  set(active) { this.active = active; this.sync(active); }
}
