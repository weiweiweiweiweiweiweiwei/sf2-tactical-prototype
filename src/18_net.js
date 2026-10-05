/* =====================================================================
   v25 NETWORK — host-authoritative multiplayer.
   · The HOST runs the real match (bots, hits, kills, score). Each friend is a NetPlayer in it, steered by his UserCmds.
   · A CLIENT simulates only its own soldier (prediction, same code as the host), draws everyone else as Ghosts from
     30 Hz snapshots, and shows hits / kills when the host reports them.
   · Transport: LoopbackTransport links tabs of one browser (BroadcastChannel) with artificial lag / jitter / loss for
     testing; WebRTC + a signalling service take its place in v26 with the same send / onMessage interface; from v27 a
     match talks through its room's RoomLink (18c_room.js), so the connection outlives the match.
   ===================================================================== */
const NET_VERSION = 30;
const NET_WEAPONS = Object.keys(WEAPON_DEFS), NET_WI = Object.fromEntries(NET_WEAPONS.map((k, i) => [k, i]));
const NET_PHASES = ['loading', 'freeze', 'live', 'roundEnd', 'over'];
const NET_SNAP_HZ = 30, NET_CMD_EVERY = 2, NET_INTERP = 0.1; // snapshots / s · send a cmd packet every 2nd tick (60 Hz) · ghosts drawn 100 ms behind
const NET_REWIND_MAX = 0.4; // v29 lag compensation: at most 400 ms back (≈ 150 ms ping each way + 100 ms interpolation; slower links are not trusted)

class LoopbackTransport {
  constructor(room, opts = {}) {
    this.id = Math.random().toString(36).slice(2, 10); this.room = room;
    this.lag = (+opts.lag || 0) / 1000; this.jitter = (+opts.jitter || 0) / 1000; this.loss = +opts.loss || 0;
    this.ch = new BroadcastChannel('sf2net:' + room); this.onMessage = null; this.lastRel = new Map();
    this.stats = { sent: 0, recv: 0, bytesOut: 0, lost: 0 };
    this.ch.onmessage = (e) => this._recv(e.data);
  }
  // reliable = ordered and never dropped (events); unreliable = may be lost (cmds, snapshots — the next one replaces it)
  send(to, data, reliable = true) {
    this.stats.sent++; this.stats.bytesOut += data instanceof ArrayBuffer ? data.byteLength : JSON.stringify(data).length;
    this.ch.postMessage({ from: this.id, to, rel: reliable, data });
  }
  _recv(m) {
    if (m.to !== '*' && m.to !== this.id) return;
    if (!m.rel && this.loss > 0 && Math.random() < this.loss) { this.stats.lost++; return; }
    let at = performance.now() / 1000 + this.lag + Math.random() * this.jitter;
    if (m.rel) { const last = this.lastRel.get(m.from) || 0; if (at < last) at = last; this.lastRel.set(m.from, at); }
    const deliver = () => { this.stats.recv++; if (this.onMessage) this.onMessage(m.from, m.data); };
    const ms = (at - performance.now() / 1000) * 1000;
    if (ms > 0.5) setTimeout(deliver, ms); else deliver();
  }
  close() { this.onMessage = null; this.ch.close(); }
}

// Binary packets for the two high-rate streams. Everything else is small JSON (reliable events).
const NetCodec = {
  CMD: 1, SNAP: 2, CMD_SIZE: 26, ENT_SIZE: 22, SHOT_SIZE: 27,
  encodeCmds(list) {
    const v = new DataView(new ArrayBuffer(2 + list.length * 26)); v.setUint8(0, 1); v.setUint8(1, list.length);
    let o = 2;
    for (const c of list) { v.setUint32(o, c.seq); v.setInt8(o + 4, c.f); v.setInt8(o + 5, c.r); v.setUint16(o + 6, c.btn); v.setUint8(o + 8, c.sw); v.setUint8(o + 9, c.zoom); v.setFloat32(o + 10, c.yaw); v.setFloat32(o + 14, c.pitch); v.setInt16(o + 18, clamp(Math.round(c.ay * 10000), -32000, 32000)); v.setInt16(o + 20, clamp(Math.round(c.ap * 10000), -32000, 32000)); v.setFloat32(o + 22, c.vt || 0); o += 26; }
    return v.buffer;
  },
  decodeCmds(buf) {
    const v = new DataView(buf), n = Math.min(v.getUint8(1), Math.floor((buf.byteLength - 2) / 26)), out = []; let o = 2;
    for (let i = 0; i < n; i++, o += 26) {
      const c = new UserCmd(); c.seq = v.getUint32(o); c.f = clamp(v.getInt8(o + 4), -1, 1); c.r = clamp(v.getInt8(o + 5), -1, 1); c.btn = v.getUint16(o + 6); c.sw = v.getUint8(o + 8); c.zoom = Math.min(3, v.getUint8(o + 9));
      c.yaw = v.getFloat32(o + 10); c.pitch = clamp(v.getFloat32(o + 14), -1.6, 1.6); if (!Number.isFinite(c.yaw)) c.yaw = 0; if (!Number.isFinite(c.pitch)) c.pitch = 0; c.ay = v.getInt16(o + 18) / 10000; c.ap = v.getInt16(o + 20) / 10000;
      c.vt = v.getFloat32(o + 22); if (!Number.isFinite(c.vt)) c.vt = 0;
      out.push(c);
    }
    return out;
  },
  // per-client snapshot: shared header + this client's own authoritative extras + every soldier + recent shots
  encodeSnap(s) {
    const v = new DataView(new ArrayBuffer(29 + 17 + 1 + s.ents.length * 22 + 1 + s.shots.length * 27)); let o = 0;
    v.setUint8(o, 2); v.setUint32(o + 1, s.tick); v.setFloat32(o + 5, s.time); v.setUint32(o + 9, s.ack); v.setInt16(o + 13, s.scoreA); v.setInt16(o + 15, s.scoreB);
    v.setFloat32(o + 17, s.timeLeft); v.setUint8(o + 21, s.phase); v.setFloat32(o + 22, s.phaseT); v.setUint8(o + 26, s.winsA); v.setUint8(o + 27, s.winsB); v.setUint8(o + 28, s.round); o = 29;
    v.setFloat32(o, s.vx); v.setFloat32(o + 4, s.vy); v.setFloat32(o + 8, s.vz); v.setUint8(o + 12, s.hp); v.setUint16(o + 13, s.ammo); v.setUint16(o + 15, s.reserve); o += 17;
    v.setUint8(o++, s.ents.length);
    for (const e of s.ents) {
      v.setUint16(o, e.id); v.setUint8(o + 2, e.flags); v.setUint8(o + 3, e.w); v.setUint8(o + 4, e.life & 255);
      v.setFloat32(o + 5, e.x); v.setFloat32(o + 9, e.y); v.setFloat32(o + 13, e.z);
      v.setInt16(o + 17, Math.round(wrapAngle(e.yaw) * 10000)); v.setInt16(o + 19, Math.round(clamp(e.pitch, -1.6, 1.6) * 10000)); v.setUint8(o + 21, clamp(Math.round(e.hp), 0, 255)); o += 22;
    }
    v.setUint8(o++, s.shots.length);
    for (const h of s.shots) { v.setUint16(o, h.id); v.setUint8(o + 2, h.w); for (let i = 0; i < 3; i++) { v.setFloat32(o + 3 + i * 4, h.from[i]); v.setFloat32(o + 15 + i * 4, h.to[i]); } o += 27; }
    return v.buffer;
  },
  decodeSnap(buf) {
    const v = new DataView(buf); let o = 0;
    const s = { tick: v.getUint32(1), time: v.getFloat32(5), ack: v.getUint32(9), scoreA: v.getInt16(13), scoreB: v.getInt16(15), timeLeft: v.getFloat32(17), phase: v.getUint8(21), phaseT: v.getFloat32(22), winsA: v.getUint8(26), winsB: v.getUint8(27), round: v.getUint8(28) };
    o = 29; s.vx = v.getFloat32(o); s.vy = v.getFloat32(o + 4); s.vz = v.getFloat32(o + 8); s.hp = v.getUint8(o + 12); s.ammo = v.getUint16(o + 13); s.reserve = v.getUint16(o + 15); o += 17;
    const n = v.getUint8(o++); s.ents = [];
    for (let i = 0; i < n; i++, o += 22) {
      const f = v.getUint8(o + 2);
      s.ents.push({ id: v.getUint16(o), alive: !!(f & 1), crouch: !!(f & 2), reload: !!(f & 4), protect: !!(f & 8), w: v.getUint8(o + 3), life: v.getUint8(o + 4),
        x: v.getFloat32(o + 5), y: v.getFloat32(o + 9), z: v.getFloat32(o + 13), yaw: v.getInt16(o + 17) / 10000, pitch: v.getInt16(o + 19) / 10000, hp: v.getUint8(o + 21) });
    }
    const ns = v.getUint8(o++); s.shots = [];
    for (let i = 0; i < ns; i++, o += 27) { const f = [], t = []; for (let k = 0; k < 3; k++) { f.push(v.getFloat32(o + 3 + k * 4)); t.push(v.getFloat32(o + 15 + k * 4)); } s.shots.push({ id: v.getUint16(o), w: v.getUint8(o + 2), from: f, to: t }); }
    return s;
  },
};

// What any soldier looks like on the wire (the local player of the host, a bot, or a NetPlayer).
function netEntity(m, c) {
  const p = c.isPlayer, w = p ? m.weapons.current : c.arsenal ? c.arsenal.current : null, def = w ? w.def : c.def;
  const reload = w ? w.reloading : c.reloadT > 0;
  return { id: c.netId, flags: (c.alive ? 1 : 0) | (c.motor.crouching ? 2 : 0) | (reload ? 4 : 0) | (c.spawnProtect > 0 ? 8 : 0), w: NET_WI[def.id] ?? 0, life: c.life || 0,
    x: c.motor.pos.x, y: c.motor.pos.y, z: c.motor.pos.z, yaw: c.yaw, pitch: p ? c.pitch : c.isNet ? c.pitch : c.aimPitch || 0, hp: c.alive ? c.hp : 0 };
}
const v3arr = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const netV3 = (a) => (Array.isArray(a) && a.length === 3 && a.every((x) => Number.isFinite(+x) && Math.abs(+x) < 1e4) ? new THREE.Vector3(+a[0], +a[1], +a[2]) : null);
// names and room fields come from other people's browsers: never let them carry markup into the page
const safeName = (s, d = 'Player') => String(s ?? '').replace(/[<>&"'`\\]/g, '').trim().slice(0, 14) || d;
const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => `&#${c.charCodeAt(0)};`);

class NetHost {
  constructor(app, match, transport) {
    this.role = 'host'; this.app = app; this.m = match; this.t = transport; this.peers = new Map(); this.snapT = 0; this.tick = 0; this.shots = [];
    match.net = this; match.humans = match.humans || []; match.netSeq = Math.max(match.netSeq || 0, ...match.combatants.map((c) => c.netId || 0));
    transport.onMessage = (from, d) => this._msg(from, d);
    transport.onLeave = (peer) => this._drop(peer, '離開了房間');
    this.onRoster = null; // v26: room list player count
    match.player.name = (app.netOpts && app.netOpts.name) || Settings.data.nick || '房主';
    transport.send('*', { k: 'host', v: NET_VERSION, room: transport.room });
  }
  _msg(from, d) {
    if (d instanceof ArrayBuffer) {
      const np = this.peers.get(from);
      if (np && new DataView(d).getUint8(0) === NetCodec.CMD) {
        np.pushCmds(NetCodec.decodeCmds(d)); np.heardT = this.m.time;
        if (!np.gotDrops) { np.gotDrops = true; for (const g of this.m.drops) this.t.send(from, { k: 'drop', id: g.id, w: NET_WI[g.def.id] ?? 0, a: g.ammo, r: g.reserve, p: v3arr(g.body.position), v: [0, 0, 0] }); } // v30: his game is running now — the guns already on the ground
      }
      return;
    }
    if (!d || typeof d !== 'object') return;
    if (d.k === 'join') this._join(from, d);
    else if (d.k === 'hello') this.t.send(from, { k: 'host', v: NET_VERSION, room: this.t.room });
    else if (d.k === 'leave') this._drop(from, '離開了房間');
    else if (d.k === 'loadout') { const np = this.peers.get(from); if (np) np.nextLoadout = NetPlayer.validLoadout(d); }
    else if (d.k === 'ping') { this.t.send(from, { k: 'pong', t: d.t }); const np = this.peers.get(from); if (np) np.heardT = this.m.time; }
  }
  get players() { return 1 + this.peers.size; }
  _balance() { const n = (t) => this.m.combatants.filter((c) => !c.isBot && c.team === t).length; return n('bravo') <= n('alpha') ? 'bravo' : 'alpha'; }
  _join(from, d) {
    if (d.v !== NET_VERSION) { this.t.send(from, { k: 'reject', why: '版本不同，請重新整理頁面' }); return; }
    const m = this.m;
    if (!this.peers.has(from)) {
      if (m.phase === 'over') { this.t.send(from, { k: 'reject', why: '這場對戰已經結束' }); return; } // v29: every mode works online
      const team = d.team === 'alpha' || d.team === 'bravo' ? d.team : this._balance();
      const bot = m.bots.filter((b) => b.team === team).pop(); if (bot) this._removeBot(bot); // a friend takes a bot's place
      const np = new NetPlayer(m, team, safeName(d.name, 'Friend'), from, d);
      np.netId = ++m.netSeq; np.heardT = m.time; m.humans.push(np); m.combatants.push(np); this.peers.set(from, np);
      const sp = m.pickSpawn(team); np.respawn(sp, sp.spawnYaw ?? m.spawns[team].yaw);
      m.applyEnvIntensity();
      for (const [peer] of this.peers) if (peer !== from) this.t.send(peer, { k: 'roster', add: this._info(np) });
      this.app.hud.toast(`${np.name} 加入了對戰（${team === 'alpha' ? '藍隊' : '紅隊'}）`);
      if (this.onRoster) this.onRoster();
    }
    const np = this.peers.get(from), c = m.config;
    this.t.send(from, { k: 'welcome', v: NET_VERSION, you: np.netId, team: np.team, name: np.name, life: np.life, pos: v3arr(np.motor.pos), yaw: np.yaw,
      cfg: { map: c.map, mode: c.mode, rule: c.rule, ruleCfg: c.ruleCfg, difficulty: c.difficulty, allies: c.allies, enemies: c.enemies },
      roster: m.combatants.filter((x) => x !== np && !x.removed).map((x) => this._info(x)), phase: m.phase, time: m.time });
  }
  _info(c) { const def = c.isPlayer ? this.m.weapons.current.def : c.def; return { id: c.netId, team: c.team, name: c.name, kind: c.isBot ? 'bot' : 'human', w: NET_WI[def.id] ?? 0 }; }
  _removeBot(b) {
    const m = this.m; b.removed = true; b.alive = false; b.respawnT = Infinity; m.scene.remove(b.model.root); if (b.tag) m.scene.remove(b.tag); if (b.glint) m.scene.remove(b.glint);
    m.bots.splice(m.bots.indexOf(b), 1); m.combatants.splice(m.combatants.indexOf(b), 1);
    for (const [peer] of this.peers) this.t.send(peer, { k: 'roster', remove: b.netId });
  }
  _drop(peer, why) {
    const np = this.peers.get(peer), m = this.m; if (!np) return;
    this.peers.delete(peer); np.remove(); m.humans.splice(m.humans.indexOf(np), 1); m.combatants.splice(m.combatants.indexOf(np), 1);
    for (const [p] of this.peers) this.t.send(p, { k: 'roster', remove: np.netId });
    if (m.phase !== 'over') this.app.hud.toast(`${np.name} ${why}`);
    if (this.onRoster) this.onRoster();
  }

  // fixed step: remote humans run their next commands
  step(h) { for (const np of this.m.humans) np.step(h); }
  // per frame: snapshots at 30 Hz, silent peers dropped after 10 s
  frame(dt) {
    const m = this.m;
    for (const [peer, np] of this.peers) if (m.time - np.heardT > 10) this._drop(peer, '連線中斷');
    if (!this.peers.size) { this.shots.length = 0; return; } // v27: every room match has a NetHost — alone, it sends nothing
    this._record();
    // v30: a dropped gun tumbles differently on every computer — while it moves (first 3 s) the host's pose wins
    for (const d of m.drops) {
      if (d.t > 3.2 || d.t < (d.syncT || 0)) continue;
      d.syncT = (d.syncT || 0) + 0.4; const b = d.body, e = { k: 'dpos', id: d.id, p: v3arr(b.position), q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].map((x) => +x.toFixed(4)), v: v3arr(b.velocity) };
      for (const [peer] of this.peers) this.t.send(peer, e, false);
    }
    // v29: the mode's state (relic, zones …) 10× a second; each friend gets his own view (his capture progress)
    this.ruleT = (this.ruleT || 0) - dt;
    if (this.ruleT <= 0 && m.rules.netState) { this.ruleT = 0.1; for (const [peer, np] of this.peers) this.t.send(peer, { k: 'rs', s: m.rules.netState(np) }, false); }
    if (m.builder.mechs.length && (this.mechT = (this.mechT || 0) - dt) <= 0) { this.mechT = 0.1; const s = m.builder.mechs[0].netState(); for (const [peer] of this.peers) this.t.send(peer, { k: 'mech', s }, false); } // v46 trams / drawbridge
    this.snapT -= dt; if (this.snapT > 0) return;
    this.snapT = Math.max(0, this.snapT + 1 / NET_SNAP_HZ); this.tick++;
    const ents = m.combatants.filter((c) => !c.removed).map((c) => netEntity(m, c)), shots = this.shots.splice(0);
    const base = { tick: this.tick, time: m.time, scoreA: m.score.alpha, scoreB: m.score.bravo, timeLeft: m.timeLeft, phase: NET_PHASES.indexOf(m.phase), phaseT: m.phase === 'freeze' ? m.freezeT : m.roundEndT || 0,
      winsA: m.roundWins.alpha, winsB: m.roundWins.bravo, round: m.round & 255 };
    for (const [peer, np] of this.peers) {
      const w = np.arsenal.current;
      const s = Object.assign({}, base, { ack: np.ackSeq, vx: np.motor.vel.x, vy: np.motor.vel.y, vz: np.motor.vel.z, hp: np.alive ? Math.max(0, Math.round(np.hp)) : 0, ammo: w.ammo || 0, reserve: w.reserveAmmo || 0,
        ents, shots: shots.filter((h) => h.id !== np.netId).slice(-60) }); // his own shots are already on his screen
      this.t.send(peer, NetCodec.encodeSnap(s), false);
    }
  }
  // v29 lag compensation. Every soldier's pose is remembered (~60 per second, last second); a friend's shot is checked
  // against everyone where HE saw them — his command says which host time his screen showed (cmd.vt), at most 250 ms ago.
  _record() {
    const t = this.m.time;
    for (const c of this.m.combatants) {
      const H = c.lagH || (c.lagH = []), last = H[H.length - 1];
      if (last && t - last.t < 0.015) continue;
      H.push({ t, x: c.motor.pos.x, y: c.motor.pos.y, z: c.motor.pos.z, cr: c.motor.crouching, yaw: c.yaw, alive: c.alive }); if (H.length > 70) H.shift();
    }
  }
  // move everyone (but the shooter) back to time vt; returns what restore() needs. Soldiers who were dead then — or
  // respawned since — are left where they are.
  rewind(shooter) {
    const m = this.m, vt = shooter.viewT; if (!vt || window.__noRewind) return null; // (__noRewind: tools/_lagcomp.mjs compares)
    const T = clamp(vt, m.time - NET_REWIND_MAX, m.time), moved = [];
    for (const c of m.combatants) {
      if (c === shooter || !c.alive || !c.lagH || c.lagH.length < 2) continue;
      const H = c.lagH; if (T >= H[H.length - 1].t) continue;
      let i = H.length - 1; while (i > 0 && H[i - 1].t > T) i--;
      const a = H[Math.max(0, i - 1)], b = H[i], k = b.t > a.t ? clamp((T - a.t) / (b.t - a.t), 0, 1) : 1;
      if (!a.alive || !b.alive || Math.hypot(b.x - a.x, b.z - a.z) > 2) continue; // dead, or a teleport (respawn) in between
      const p = c.motor.pos; moved.push({ c, x: p.x, y: p.y, z: p.z, cr: c.motor.crouching, yaw: c.yaw });
      p.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)); c.motor.crouching = k < 0.5 ? a.cr : b.cr; c.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
    }
    this.rewound = (this.rewound || 0) + moved.length;
    return moved;
  }
  restore(moved) { if (moved) for (const s of moved) { s.c.motor.pos.set(s.x, s.y, s.z); s.c.motor.crouching = s.cr; s.c.yaw = s.yaw; } }

  // hooks called by the match
  // v30: grenades and dropped guns
  onNade(n, pos, vel) { const e = { k: 'nade', id: n.id, w: NET_WI[n.def.id] ?? 0, o: n.owner.netId || 0, p: v3arr(pos), v: v3arr(vel) }; for (const [peer, np] of this.peers) if (np !== n.owner) this.t.send(peer, e); }
  onBoom(n, pos) { if (!this.peers.size) return; const e = { k: 'boom', id: n.id, w: NET_WI[n.def.id] ?? 0, o: n.owner.netId || 0, p: v3arr(pos) }; for (const [peer] of this.peers) this.t.send(peer, e); }
  onDrop(d, pos, vel) { if (!this.peers.size) return; const e = { k: 'drop', id: d.id, w: NET_WI[d.def.id] ?? 0, a: d.ammo, r: d.reserve, p: v3arr(pos), v: v3arr(vel) }; for (const [peer] of this.peers) this.t.send(peer, e); }
  onUndrop(d) { for (const [peer] of this.peers) this.t.send(peer, { k: 'undrop', id: d.id }); }
  onPickup(np, i, def, ammo, reserve) { this.t.send(np.peer, { k: 'got', i, w: NET_WI[def.id] ?? 0, a: ammo, r: reserve }); }
  onRound(ev, a, b) { for (const [peer] of this.peers) this.t.send(peer, ev === 'start' ? { k: 'round', ev, n: a } : { k: 'round', ev, w: a || null, why: String(b || '').slice(0, 30) }); }
  onShot(c, from, to, def) { if (this.peers.size && this.shots.length < 120) this.shots.push({ id: c.netId, w: NET_WI[def.id] ?? 0, from: [from.x, from.y, from.z], to: [to.x, to.y, to.z] }); }
  onHit(attacker, victim, kind, point) { if (attacker.isNet && attacker.peer) this.t.send(attacker.peer, { k: 'hit', kind, pt: point ? v3arr(point) : null }); }
  onRemoteDamaged(np, amount, from) { this.t.send(np.peer, { k: 'dmg', amt: Math.round(amount), hp: Math.max(0, Math.round(np.hp)), from: v3arr(from) }); }
  onFlash(np, s) { this.t.send(np.peer, { k: 'flash', s: +s.toFixed(3) }); }
  onKill(victim, killer, def, head, dir, opts) {
    const e = { k: 'kill', v: victim.netId, kr: killer ? killer.netId : 0, w: def.id, head: !!head, col: !!opts.collateral, wall: !!opts.wall, pr: !!opts.pierce, dir: [+dir.x.toFixed(3), +dir.z.toFixed(3)] };
    for (const [peer] of this.peers) this.t.send(peer, e);
  }
  onEnd(winner) { for (const [peer] of this.peers) this.t.send(peer, { k: 'end', winner: winner || null }); }
  // v27: the host leaving a match ends it for everyone (nobody else has its state); with a room the link closes, the room stays
  close(why = '房主結束了這場對戰') { if (this.m.phase !== 'over') for (const [peer] of this.peers) this.t.send(peer, { k: 'end', winner: null, why }); this.t.close(); if (this.m.net === this) this.m.net = null; }
}

class NetClient {
  constructor(app, transport, opts = {}) {
    this.role = 'client'; this.app = app; this.t = transport; this.opts = opts; this.m = null; this.hostId = null; this.ready = false;
    this.ghosts = new Map(); this.hist = new Array(256); this.sent = []; this.stepN = 0; this.lastTick = 0; this.hostClock = null; this.corr = { n: 0, snaps: 0, max: 0 };
    this.rtt = 0; this.pingT = 0;
    // v27: a room member knows the match settings (cfg) and his team before the host is ready, and builds the map meanwhile;
    // `welcomed` settles when the host's match takes him in ({ reject } if it will not)
    this.cfg = opts.cfg || null; this.team = opts.team || null;
    this.welcomed = new Promise((res) => { this._welcomed = res; });
    transport.onMessage = (from, d) => this._msg(from, d);
    transport.onLeave = () => this._hostLost();
  }
  _hostLost() {
    if (this.m && this.ready && this.m.phase !== 'over') { this.m.app.hud.toast('與房主的連線中斷'); this.m.winner = null; this.m.phase = 'live'; this.m.endMatch(null); }
    else { this._welcomed({ reject: '與房主的連線中斷' }); if (!this.m && !this.opts.room) this.app.netError('與房主的連線中斷'); }
  }
  start() {
    const join = () => { if (this.hostId) return; this.t.send('*', { k: 'join', v: NET_VERSION, name: this.opts.name, team: this.opts.team, hipMode: Settings.data.hipMode, ...this._loadout() }); };
    join(); this.joinTimer = setInterval(join, 1000);
    // v27: while this side still builds its map the host already has our soldier — keep him from timing us out (10 s)
    this.keepTimer = setInterval(() => { if (this.hostId && !this.ready) this.t.send(this.hostId, { k: 'ping', t: performance.now() }); }, 2000);
  }
  _loadout() { const l = Settings.data.loadouts[Settings.data.lobby.loadout | 0] || Settings.data.loadouts[0]; return { loadout: { primary: l.primary, secondary: l.secondary } }; }
  _msg(from, d) {
    if (d instanceof ArrayBuffer) { if (this.ready && from === this.hostId && new DataView(d).getUint8(0) === NetCodec.SNAP) this._snap(NetCodec.decodeSnap(d)); return; }
    if (!d || typeof d !== 'object') return;
    if (d.k === 'welcome') {
      if (this.hostId) return; this.hostId = from; clearInterval(this.joinTimer); this.welcome = d; this.team = d.team;
      if (!this.cfg) { this.cfg = d.cfg; this.app.startNetMatch(this); } // v25 loopback join: the map is built only now, from the host's settings
      this._welcomed(d); return;
    }
    if (d.k === 'reject') { clearInterval(this.joinTimer); this._welcomed({ reject: d.why }); if (!this.opts.room) this.app.netError(d.why); return; }
    if (d.k === 'host' && !this.hostId) { this.t.send(from, { k: 'join', v: NET_VERSION, name: this.opts.name, team: this.opts.team, hipMode: Settings.data.hipMode, ...this._loadout() }); return; }
    if (from !== this.hostId || !this.ready) return;
    const m = this.m;
    if (d.k === 'pong') { const w = this.rttWin || (this.rttWin = []); w.push(performance.now() - d.t); if (w.length > 5) w.shift(); this.rtt = w.slice().sort((a, b) => a - b)[w.length >> 1]; return; } // median of the last 5: one hitch does not stick
    if (d.k === 'kill') this._kill(d);
    else if (d.k === 'hit') {
      const kind = d.kind; m.app.hud.hitmarker(kind); if (kind !== 'shield') m.stats.hits++;
      if (kind !== 'body' || m.time - m.lastHitSnd > 0.04) { m.audio.hit(kind); m.lastHitSnd = m.time; }
      if (d.pt && kind !== 'shield') m.effects.blood(new THREE.Vector3(...d.pt), m.camera.getWorldDirection(new THREE.Vector3()), kind === 'head' ? 18 : 10);
    } else if (d.k === 'dmg') { const p = m.player; if (p.alive) { p.hp = d.hp; p.onDamaged(d.amt, null, new THREE.Vector3(...d.from)); } }
    else if (d.k === 'flash') { m.app.post.flash(d.s, 0.6 + 4.2 * d.s); m.audio.deafen(d.s * 0.9, 1 + 3 * d.s); }
    else if (d.k === 'roster') { if (d.add) this._ghost(d.add); if (d.remove) this._unghost(d.remove); }
    else if (d.k === 'round') { if (d.ev === 'start') m.clientRoundStart(d.n | 0); else if (d.ev === 'end') m.clientRoundEnd(d.w === 'alpha' || d.w === 'bravo' ? d.w : null, String(d.why || '').slice(0, 30)); }
    else if (d.k === 'mech') { const mc = m.builder.mechs[0]; if (mc) mc.applyNet(d.s); } // v46 trams / drawbridge
    else if (d.k === 'nade') m.clientNade(d);
    else if (d.k === 'boom') m.clientBoom(d);
    else if (d.k === 'drop') m.clientDrop(d);
    else if (d.k === 'undrop') m.clientUndrop(d.id | 0);
    else if (d.k === 'dpos') m.clientDropPose(d);
    else if (d.k === 'got') m.clientGot(d);
    else if (d.k === 'rs') { if (m.rules.applyNet && d.s && typeof d.s === 'object') { try { m.rules.applyNet(d.s); } catch (e) { console.warn('[net] rule state', e); } } }
    else if (d.k === 'end') { if (d.why) m.app.hud.toast(String(d.why).slice(0, 30)); m.winner = d.winner === 'alpha' || d.winner === 'bravo' ? d.winner : null; m.phase = 'live'; m.endMatch(m.winner); }
  }

  // the match is built: create every other soldier as a ghost and drop our soldier where the host spawned it
  attach(m) {
    this.m = m; const w = this.welcome;
    for (const info of w.roster) this._ghost(info);
    m.player.team = w.team === 'bravo' ? 'bravo' : 'alpha'; m.player.netId = w.you; m.player.life = w.life;
    m.phase = w.phase === 'live' ? 'live' : 'freeze'; m.freezeT = 0;
    m.player.respawn(new THREE.Vector3(...w.pos), w.yaw); m.player.life = w.life; m.player.spawnProtect = CFG.spawnProtect;
    this.ready = true; clearInterval(this.keepTimer);
    this._unload = () => this.t.send(this.hostId, { k: 'leave' }); addEventListener('beforeunload', this._unload);
  }
  _ghost(info) { if (this.ghosts.has(info.id) || !this.m) return; const g = new Ghost(this.m, info); this.ghosts.set(info.id, g); this.m.combatants.push(g); }
  _unghost(id) { const g = this.ghosts.get(id); if (!g) return; this.ghosts.delete(id); g.alive = false; this.m.scene.remove(g.model.root); if (g.tag) this.m.scene.remove(g.tag); this.m.combatants.splice(this.m.combatants.indexOf(g), 1); }
  byId(id) { return id === this.m.player.netId ? this.m.player : this.ghosts.get(id) || null; }

  // after each local fixed step: remember where prediction put us for this command, send commands at 60 Hz
  afterLocalStep(cmd) {
    cmd.vt = this.hostClock === null ? 0 : this.hostClock - NET_INTERP; // v29: what our screen shows right now, in host time
    const p = this.m.player.motor.pos; this.hist[cmd.seq & 255] = { seq: cmd.seq, x: p.x, y: p.y, z: p.z };
    this.sent.push(new UserCmd().copy(cmd)); if (this.sent.length > 4) this.sent.shift();
    if (++this.stepN % NET_CMD_EVERY === 0) this.t.send(this.hostId, NetCodec.encodeCmds(this.sent), false);
  }
  queueLoadout(l) { if (this.ready) this.t.send(this.hostId, { k: 'loadout', primary: l.primary, secondary: l.secondary }); }

  _snap(s) {
    if (s.tick <= this.lastTick) return; this.lastTick = s.tick;
    const m = this.m, p = m.player;
    this.hostClock = this.hostClock === null || Math.abs(s.time - this.hostClock) > 0.3 ? s.time : this.hostClock + (s.time - this.hostClock) * 0.1;
    m.score.alpha = s.scoreA; m.score.bravo = s.scoreB; m.timeLeft = s.timeLeft; m.roundWins.alpha = s.winsA; m.roundWins.bravo = s.winsB; m.round = s.round;
    const ph = NET_PHASES[s.phase] || 'live';
    if (ph !== m.phase && m.phase !== 'over') {
      if (m.phase === 'freeze' && ph === 'live') { m.app.hud.freeze(false); m.app.hud.announce('FIGHT!', `${RULES[m.rule].name} · 連線對戰`); }
      m.phase = ph;
    }
    if (ph === 'freeze') m.freezeT = s.phaseT;
    for (const e of s.ents) {
      if (e.id === p.netId) { this._self(s, e); continue; }
      const g = this.ghosts.get(e.id); if (g) g.push(s.time, e);
    }
    for (const h of s.shots) { const c = this.ghosts.get(h.id), def = WEAPON_DEFS[NET_WEAPONS[h.w]]; if (c && def) m.thirdPersonShot(c, def, new THREE.Vector3(...h.from), new THREE.Vector3(...h.to)); }
  }
  // our own soldier: respawns and health come from the host; position is predicted here and only nudged back if it drifted
  _self(s, e) {
    const m = this.m, p = m.player;
    if (e.alive && e.life !== ((p.life || 0) & 255)) { p.respawn(new THREE.Vector3(e.x, e.y, e.z), e.yaw); p.life = e.life; m.app.hud.showDeath(false); this.hist.fill(undefined); return; }
    if (!p.alive || !e.alive) return;
    p.hp = Math.min(p.hp, e.hp) || e.hp;
    const h = this.hist[s.ack & 255]; if (!h || h.seq !== s.ack) return;
    const dx = e.x - h.x, dy = e.y - h.y, dz = e.z - h.z, err = Math.hypot(dx, dy, dz); this.corr.snaps++;
    if (err < 0.03) return;
    this.corr.n++; this.corr.max = Math.max(this.corr.max, err);
    const mo = p.motor, k = err > 2 ? 1 : 0.35; // far off (blocked by someone, or a teleport): snap; otherwise ease toward the host
    mo.pos.x += dx * k; mo.pos.y += dy * k; mo.pos.z += dz * k; mo.prevPos.x += dx * k; mo.prevPos.y += dy * k; mo.prevPos.z += dz * k;
    if (k === 1) mo.vel.set(s.vx, s.vy, s.vz);
    for (const r of this.hist) if (r && r.seq > s.ack) { r.x += dx * k; r.y += dy * k; r.z += dz * k; } // later predictions carry the same correction
  }
  _kill(d) {
    const m = this.m, victim = this.byId(d.v), killer = d.kr ? this.byId(d.kr) : null, def = WEAPON_DEFS[d.w] || WEAPON_DEFS.m4a1;
    if (!victim) return;
    const dir = new THREE.Vector3(d.dir[0], 0, d.dir[1]); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    m.remoteKill(victim, killer, def, d.head, dir.normalize(), { collateral: d.col, wall: d.wall, pierce: d.pr });
  }
  // per frame: draw everyone at host time − 100 ms
  frame(dt) {
    if (!this.ready) return;
    this.pingT -= dt; if (this.pingT <= 0) { this.pingT = 1; this.t.send(this.hostId, { k: 'ping', t: performance.now() }); }
    if (this.hostClock === null) return;
    this.hostClock += dt;
    const rt = this.hostClock - NET_INTERP;
    for (const g of this.ghosts.values()) g.update(dt, rt);
  }
  close() {
    if (this.hostId) this.t.send(this.hostId, { k: 'leave' }); clearInterval(this.joinTimer); clearInterval(this.keepTimer); this.t.close(); if (this.m && this.m.net === this) this.m.net = null;
    if (this._unload) removeEventListener('beforeunload', this._unload); this._welcomed({ reject: '已離開' });
  }
}
