/* =====================================================================
   v25 NETWORK SOLDIERS
   NetPlayer — a friend's soldier inside the HOST's match. Steered by the UserCmds his client sends: the same Human
               movement and Arsenal weapon rules as the local player, a soldier model like a bot, and the host decides
               every hit, kill and respawn.
   Ghost     — anyone else as seen on a CLIENT: the host's player, bots, other friends. Pure display, drawn ~100 ms in
               the past between two snapshots so movement stays smooth whatever the packet timing.
   ===================================================================== */
class NetPlayer extends Human {
  constructor(game, team, name, peer, opts = {}) {
    super(game, team, name, false);
    this.peer = peer; this.isNet = true; this.aimPitch = 0; this.walkPhase = 0; this.stepPitch = rand(0.92, 1.08);
    this.hipMode = opts.hipMode === 'shotgun' ? 'shotgun' : 'precise';
    this.loadout = NetPlayer.validLoadout(opts.loadout); this.nextLoadout = null;
    this.arsenal = new Arsenal(game, this); this.arsenal.remote = true; this.arsenal.init(loadoutDefs(game.mode, this.loadout));
    this.model = game.app.soldiers.create(team, this.def.model || this.def.id); game.scene.add(this.model.root); this.modelGun = this.def.id;
    if (team === game.player.team) this.tag = Bot.prototype._makeTag.call(this);
    this.pending = new Map(); this.ackSeq = 0; this.holeT = 0; this.respawnT = 0;
  }
  static validLoadout(l) {
    const ok = (id, slot) => id && WEAPON_DATABASE[id] && WEAPON_DATABASE[id].slot === slot;
    return { primary: l && ok(l.primary, 'primary') ? l.primary : 'm4a1', secondary: l && ok(l.secondary, 'secondary') ? l.secondary : 'p226' };
  }
  gear() { return this.arsenal; }
  get def() { return this.arsenal.current.def; }
  get ammo() { return this.arsenal.current.ammo || 0; }
  get muzzlePos() { this.model.root.updateMatrixWorld(); return this.model.muzzle.getWorldPosition(new THREE.Vector3()); }
  lookDir(out) { const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
  // footsteps / landings are positional and muffled through walls, like a bot's
  _sfx(kind, surface, loud) {
    const g = this.game, p = TMP_V3.copy(this.motor.pos).setY(this.motor.pos.y + 0.1), d = p.distanceTo(g.camera.position);
    if (d > 34) return;
    if (kind !== 'step') { g.audio.land(p, surface, loud); return; }
    const occluded = d > 3 && !g.collision.segmentClear(g.camera.position, TMP_V4.copy(p).setY(p.y + 0.5));
    g.audio.footstep(p, surface, loud, { pitch: this.stepPitch, occluded });
  }

  // Commands arrive in packets (each carries the last few, so one lost packet costs nothing), possibly out of order:
  // they are kept by sequence number and replayed strictly in order.
  pushCmds(list) { for (const c of list) if (c.seq > this.ackSeq && !this.pending.has(c.seq)) this.pending.set(c.seq, c); }
  // Every command is simulated exactly once, in order, with the same fixed step the client used — never invented. None
  // arrived yet (jitter): the soldier waits this tick (his own client already predicted it). A backlog is worked off two
  // per tick. So the host replays the client's input stream exactly: same position, same shots, same spread.
  // A missing number (packet lost or still in flight) is waited for up to 4 ticks (~33 ms), then skipped.
  step(h) {
    const n = this.pending.size > 4 ? 2 : 1;
    let ran = 0;
    for (let i = 0; i < n; i++) {
      let cmd = this.pending.get(this.ackSeq + 1);
      if (!cmd) {
        if (!this.pending.size) break;
        if (this.ackSeq && ++this.holeT < 4) break; // (first commands of a session: start from the oldest one at once)
        cmd = this.pending.get(Math.min(...this.pending.keys()));
      }
      this.holeT = 0; this.pending.delete(cmd.seq); ran++;
      if (this.alive) { this.yaw = cmd.yaw; this.pitch = cmd.pitch; this.aimPitch = cmd.pitch; this.aimDY = cmd.ay; this.aimDP = cmd.ap; }
      this.curSeq = cmd.seq; this.viewT = cmd.vt; // the command being simulated (tests compare it with the client's) · v29: its view time
      this.fixedUpdate(h, cmd);
      this.arsenal.tick(h, cmd);
      if (cmd.btn & BTN.INTERACT) this.game.netInteract(this); // v30: E — relic / weapon pickup, decided here on the host
      this.ackSeq = cmd.seq;
    }
    if (!ran) { this.motor.prevPos.copy(this.motor.pos); this.stalls = (this.stalls || 0) + 1; }
  }

  update(dt, alpha) {
    if (!this.alive) return;
    if (this.spawnProtect > 0) this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    const m = this.motor, M = this.model, w = this.arsenal.current;
    if (this.modelGun !== w.def.id) { this.modelGun = w.def.id; this.game.app.soldiers.setWeapon(M, w.def.model || w.def.id); }
    M.root.position.lerpVectors(m.prevPos, m.pos, alpha); M.root.rotation.y = this.yaw;
    animateSoldier(this, dt, m.horizontalSpeed(), m.crouching, this.aimPitch, w.reloading || m.climbing);
    if (this.tag) { this.tag.position.set(M.root.position.x, M.root.position.y + 2.1, M.root.position.z); this.tag.visible = this.tag.position.distanceTo(this.game.camera.position) < 70; }
  }

  onDamaged(amount, attacker, fromPos) { if (this.game.net) this.game.net.onRemoteDamaged(this, amount, fromPos); }
  die(dir, force) {
    Bot.prototype.die.call(this, dir, force);
    this.arsenal.exitADS(); this.arsenal.trigger = false;
  }
  respawn(point, yaw) {
    if (this.nextLoadout) { this.loadout = this.nextLoadout; this.nextLoadout = null; this.arsenal.rebuild(loadoutDefs(this.game.mode, this.loadout)); }
    this.motor.teleport(point); this.life = (this.life || 0) + 1;
    this.yaw = yaw; this.pitch = 0; this.aimPitch = 0; this.hp = 100; this.alive = true; this.spawnProtect = CFG.spawnProtect; this.carrying = false;
    this.slideT = 0; this.mantleT = 0; this.damageLog.clear();
    this.arsenal.resetLoadout();
    this.model.root.visible = true; this.model.head.visible = true; this.model.root.position.copy(this.motor.pos); if (this.tag) this.tag.visible = true;
  }
  remove() {
    this.alive = false; this.removed = true; this.game.scene.remove(this.model.root);
    if (this.tag) { this.game.scene.remove(this.tag); this.tag.material.map.dispose(); }
  }
}
NetPlayer.prototype.flinch = Bot.prototype.flinch;

class Ghost extends Combatant {
  constructor(game, info) {
    super(game, info.team === 'bravo' ? 'bravo' : 'alpha', safeName(info.name), false);
    this.netId = info.id; this.kind = info.kind; this.isBot = info.kind === 'bot'; this.isNet = info.kind !== 'bot';
    this.aimPitch = 0; this.walkPhase = Math.random() * 6; this.buf = []; this.speed = 0; this.weaponId = NET_WEAPONS[info.w] || 'm4a1';
    this.model = game.app.soldiers.create(info.team, WEAPON_DEFS[this.weaponId].model || this.weaponId); game.scene.add(this.model.root);
    this.alive = false; this.model.root.visible = false; this.life = -1;
    if (info.team === game.player.team) this.tag = Bot.prototype._makeTag.call(this);
  }
  get def() { return WEAPON_DEFS[this.weaponId]; }
  get muzzlePos() { this.model.root.updateMatrixWorld(); return this.model.muzzle.getWorldPosition(new THREE.Vector3()); }
  lookDir(out) { const cp = Math.cos(this.aimPitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.aimPitch), -Math.cos(this.yaw) * cp); }

  // one entity record from a snapshot taken at host time t
  push(t, e) {
    if (e.life !== this.life) { this.life = e.life; this.buf.length = 0; if (e.alive) this._show(true); } // respawned: no sliding in from the old spot
    if (!e.alive) { if (this.alive && !this.dying) this._show(false); this.alive = false; return; }
    this.dying = false; this.alive = true;
    const b = this.buf; if (b.length && t <= b[b.length - 1].t) return;
    b.push({ t, x: e.x, y: e.y, z: e.z, yaw: e.yaw, pitch: e.pitch, crouch: e.crouch, reload: e.reload }); while (b.length > 40) b.shift();
    if (NET_WEAPONS[e.w] && NET_WEAPONS[e.w] !== this.weaponId) { this.weaponId = NET_WEAPONS[e.w]; this.game.app.soldiers.setWeapon(this.model, this.def.model || this.weaponId); }
    this.spawnProtect = e.protect ? 1 : 0;
  }
  _show(on) { this.model.root.visible = on; this.model.head.visible = true; if (this.tag) this.tag.visible = on; }
  // render time = latest host time − interpolation delay; hold the last pose briefly if packets stop
  update(dt, renderT) {
    const b = this.buf; if (!this.alive || !b.length) return;
    let a = b[0], c = b[b.length - 1], k = 0;
    if (renderT <= a.t) c = a;
    else if (renderT < c.t) { let i = 1; while (b[i].t < renderT) i++; a = b[i - 1]; c = b[i]; k = (renderT - a.t) / Math.max(1e-4, c.t - a.t); }
    else a = c;
    const m = this.motor, ox = m.pos.x, oz = m.pos.z;
    m.pos.set(lerp(a.x, c.x, k), lerp(a.y, c.y, k), lerp(a.z, c.z, k)); m.prevPos.copy(m.pos); m.crouching = (k < 0.5 ? a : c).crouch;
    this.yaw = a.yaw + wrapAngle(c.yaw - a.yaw) * k; this.aimPitch = lerp(a.pitch, c.pitch, k);
    this.speed = damp(this.speed, Math.hypot(m.pos.x - ox, m.pos.z - oz) / Math.max(1e-3, dt), 10, dt);
    const M = this.model; M.root.position.copy(m.pos); M.root.rotation.y = this.yaw;
    animateSoldier(this, dt, Math.min(this.speed, 9), m.crouching, this.aimPitch, (k < 0.5 ? a : c).reload);
    if (this.tag) { this.tag.position.set(m.pos.x, m.pos.y + 2.1, m.pos.z); this.tag.visible = this.tag.position.distanceTo(this.game.camera.position) < 70; }
  }
  die(dir, force) { this.dying = true; Bot.prototype.die.call(this, dir, force); this.buf.length = 0; }
  flinch(part, dir, dmg) { Bot.prototype.flinch.call(this, part, dir, dmg); }
  onDamaged() {}
  respawn() {}
}
