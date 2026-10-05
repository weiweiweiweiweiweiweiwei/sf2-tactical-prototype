const RELOAD_MOVE = 0.8, FALL_SAFE = 3.5, FALL_LETHAL = 11; // metres: below 3.5 m no damage, then linear, 11 m+ = death

/* =====================================================================
   COMBATANT — shared by the player and every bot: motor, 6-zone
   hitboxes (head / chest / stomach / thigh / shin / foot), stats,
   damage log for assists, spawn protection.
   ===================================================================== */
class Combatant {
  constructor(game, team, name, isPlayer) {
    this.game = game; this.team = team; this.name = name; this.isPlayer = isPlayer;
    // v24: bots accelerate / brake at ~60 % of the player's rate — with the player's instant stops their A-D strafes and dodges looked like teleports
    this.motor = new CharacterMotor(game.collision, { radius: CFG.player.radius, height: CFG.player.height, crouchHeight: CFG.player.crouchHeight, accelK: isPlayer ? 1 : 0.6, frictionK: isPlayer ? 1 : 0.6 });
    this.alive = true; this.hp = 100; this.spawnProtect = 0; this.respawnT = 0; this.yaw = 0;
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0; this.headshots = 0;
    this.damageLog = new Map(); this.lastPart = 'chest'; this.holdE = false; this.carrying = false;
    this.hitboxes = ['head', 'chest', 'stomach', 'thigh', 'shin', 'foot'].map((part) => ({ part, min: new THREE.Vector3(), max: new THREE.Vector3() }));
  }
  get enemyTeam() { return this.team === 'alpha' ? 'bravo' : 'alpha'; }
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  eyeHeight() { return this.motor.crouching ? CFG.player.crouchEye : CFG.player.eye; }
  eyePos(out) { return out.set(this.motor.pos.x, this.motor.pos.y + this.eyeHeight(), this.motor.pos.z); }
  chestPos(out) { return out.set(this.motor.pos.x, this.motor.pos.y + (this.motor.crouching ? 0.8 : 1.25), this.motor.pos.z); }
  onAttack() { this.spawnProtect = 0; this.lastAttackT = this.game.time; }
  resetStats() { this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0; this.headshots = 0; this.damageLog.clear(); }

  updateHitboxes() {
    const p = this.motor.pos, H = this.motor.crouching ? CFG.player.crouchHeight / CFG.player.height : 1, eye = this.eyeHeight();
    const set = (hb, r, y0, y1, fwd = 0) => {
      const fx = -Math.sin(this.yaw) * fwd, fz = -Math.cos(this.yaw) * fwd;
      hb.min.set(p.x - r + Math.min(0, fx), p.y + y0, p.z - r + Math.min(0, fz)); hb.max.set(p.x + r + Math.max(0, fx), p.y + y1, p.z + r + Math.max(0, fz));
    };
    const [hd, ch, st, th, sh, ft] = this.hitboxes;
    set(hd, 0.14, eye - 0.13, eye + 0.16);
    set(ch, 0.26, 1.12 * H, eye - 0.13);
    set(st, 0.24, 0.86 * H, 1.12 * H);
    set(th, 0.21, 0.47 * H, 0.86 * H);
    set(sh, 0.18, 0.11 * H, 0.47 * H);
    set(ft, 0.17, 0, 0.11 * H, 0.1);
  }
}

/* =====================================================================
   v25 HUMAN — a soldier steered by UserCmds: sprint / edge-guard, crouch, tactical slide, mantle, ladders, footsteps.
   The local Player and a remote NetPlayer (simulated on the host) both run this exact code.
   ===================================================================== */
class Human extends Combatant {
  constructor(game, team, name, isPlayer) {
    super(game, team, name, isPlayer);
    this.pitch = 0;
    this.slideT = 0; this.slideCd = 0; this.slideK = 0; this.slideV0 = 0; this.slideDir = new THREE.Vector3(); this.crouchHeld = false; // v14 tactical slide
    this.mantleT = 0; this.mantleK = 0; this.mFrom = new THREE.Vector3(); this.mTo = new THREE.Vector3(); // v15 mantle
    this.punch = 0; this.punchV = 0; this.fovPunch = 0;
    this.stepDist = 0; this.sprinting = false; this.sprintBlock = 0;
  }
  gear() { return this.game.weapons; } // the arsenal whose current weapon sets the move speed (NetPlayer: its own)
  _sfx(kind, surface, loud) { const a = this.game.audio; if (kind === 'step') a.footstep(null, surface, loud); else a.land(null, surface, loud); }

  // v15 MANTLE: is there a ledge right in front whose top is `lo..hi` above the feet, with room to stand on it?
  _ledge(lo, hi) {
    const m = this.motor, w = this.game.collision, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), r = m.radius;
    if (w.fits(m.pos.x + fx * 0.45, m.pos.y + lo * 0.6, m.pos.z + fz * 0.45, r * 0.8, 0.3)) return null; // nothing in front at knee/hip height
    for (const d of [0.62, 0.85]) {
      const x = m.pos.x + fx * d, z = m.pos.z + fz * d, g = w.groundBelow(x, m.pos.y + hi + 0.05, z, r * 0.7, hi - lo + 0.1, 0.02);
      if (!g || g.steep) continue;
      const rise = g.y - m.pos.y;
      if (rise < lo || rise > hi) continue;
      if (!w.fits(x, g.y + 0.03, z, r, m.standHeight) || !w.fits(m.pos.x, g.y + 0.03, m.pos.z, r * 0.9, 0.9)) continue; // stand on top + head room over the lip
      return new THREE.Vector3(x, g.y + 0.02, z);
    }
    return null;
  }
  _startMantle(to) {
    this.mantleT = 0.32; this.mFrom.copy(this.motor.pos); this.mTo.copy(to); this.sprinting = false; this.slideT = 0;
    this.motor.vel.set(0, 0, 0); this.motor.jumpBufferT = 0; this.punchV -= 0.35;
    this._sfx('land', 'concrete', 0.45); this.game.emitNoise(this.motor.pos, 10, this.team);
  }

  fixedUpdate(h, cmd) {
    const m = this.motor, P = CFG.player, g = this.game;
    if (!this.alive) { m.step(h, 0, 0, 0); this.holdE = false; return; }
    const frozen = !g.canMove(), btn = frozen ? 0 : cmd.btn;
    this.holdE = g.canAct() && !!(btn & BTN.USE);
    if (btn & BTN.JUMP) m.requestJump();
    if (this.mantleT > 0) { // up first, then over the lip
      m.prevPos.copy(m.pos); this.mantleT -= h;
      const k = 1 - Math.max(0, this.mantleT) / 0.32, ky = 1 - Math.pow(1 - Math.min(1, k * 1.7), 2), kx = Math.max(0, (k - 0.3) / 0.7);
      m.pos.set(lerp(this.mFrom.x, this.mTo.x, kx * kx * (3 - 2 * kx)), lerp(this.mFrom.y, this.mTo.y + 0.04, ky), lerp(this.mFrom.z, this.mTo.z, kx * kx * (3 - 2 * kx)));
      m.grounded = false; m.vel.set(0, 0, 0);
      if (this.mantleT <= 0) { m.pos.copy(this.mTo); m.grounded = true; m.vel.set(-Math.sin(this.yaw) * 1.6, 0, -Math.cos(this.yaw) * 1.6); }
      return;
    }
    const fwdHeld = !frozen && cmd.f > 0;
    if (!frozen && fwdHeld && !m.climbing && !m.crouching) {
      if (m.grounded && m.jumpBufferT > 0) { const t = this._ledge(0.5, 1.45); if (t) { this._startMantle(t); return; } } // vault / mantle instead of jumping
      else if (!m.grounded && m.vel.y < 3.5) { const t = this._ledge(0.25, 1.15); if (t) { this._startMantle(t); return; } } // jump-grab a higher ledge
    }
    const f = frozen ? 0 : cmd.f, r = frozen ? 0 : cmd.r;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let wx = -s * f + c * r, wz = -c * f - s * r; const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
    // ladders: W/S drive the vertical axis (facing away from the ladder inverts W, so walking off the top climbs down)
    const lad = g.collision.ladders.length ? g.collision.ladderAt(m.pos.x, m.pos.y, m.pos.z, m.radius) : null;
    if (lad) { const facing = -s * -lad.nx + -c * -lad.nz; m.climbInput = f * (facing < -0.3 ? -1 : 1); } else m.climbInput = 0;
    const crouchKey = !!(btn & BTN.CROUCH);
    // v14 TACTICAL SLIDE (COD): crouch while sprinting → 0.72 s slide with a speed burst, low camera + roll, A/D steer; jump cancels it keeping momentum
    if (this.slideCd > 0) this.slideCd -= h;
    if (crouchKey && !this.crouchHeld && this.sprinting && m.grounded && !lad && m.horizontalSpeed() > 5.5 && this.slideCd <= 0 && this.slideT <= 0) {
      const hs0 = m.horizontalSpeed(); this.slideT = 0.72; this.slideDir.set(m.vel.x / hs0, 0, m.vel.z / hs0); this.slideV0 = Math.max(hs0 * 1.18, 8.4);
      m.setCrouch(true); m.vel.x = this.slideDir.x * this.slideV0; m.vel.z = this.slideDir.z * this.slideV0; this.sprinting = false; this.fovPunch = 4;
      this._sfx('land', m.surface, 0.75); g.emitNoise(m.pos, 13, this.team);
    }
    this.crouchHeld = crouchKey;
    if (this.slideT > 0) {
      this.slideT -= h;
      const k = 1 - Math.max(0, this.slideT) / 0.72, ang = r * 1.1 * h, cs = Math.cos(ang), sn = Math.sin(ang), dx = this.slideDir.x, dz = this.slideDir.z;
      this.slideDir.set(dx * cs - dz * sn, 0, dx * sn + dz * cs);
      m.setCrouch(true); this.sprinting = false; m.edgeGuard = false;
      m.step(h, this.slideDir.x, this.slideDir.z, lerp(this.slideV0, 2.6, k * k));
      if (m.jumped || !m.grounded || this.slideT <= 0) { this.slideT = 0; this.slideCd = 0.75; }
      return;
    }
    m.setCrouch(crouchKey);
    const shift = !!(btn & BTN.SPRINT);
    const ws = this.gear(), w = ws.current;
    if (this.sprintBlock > 0) this.sprintBlock -= h;
    const intent = shift && f > 0; if (!intent) this.adsSprintLock = false;
    this.sprinting = intent && !this.adsSprintLock && !m.crouching && !w.reloading && this.sprintBlock <= 0 && !(w.kind === 'grenade' && w.state !== 'idle'); // v45: W+Shift while aimed drops the sight and sprints (any gun)
    m.edgeGuard = shift && m.grounded;
    let speed = w.moveSpeed * (this.carrying ? 0.88 : 1);
    if (m.crouching) speed *= P.crouchMult; else if (this.sprinting) speed *= P.sprintMult;
    if (ws.ads) speed *= w.adsMove ?? 1;
    if (w.reloading) speed *= RELOAD_MOVE; // v34: reloading = slower walk, no sprint
    m.step(h, wx, wz, len > 0 ? speed : 0);
    if (m.climbing) { if (m.climbDist > 0.6) { m.climbDist = 0; this._sfx('step', 'ladder', 0.6); g.emitNoise(m.pos, 9, this.team); } return; }
    const hs = m.horizontalSpeed();
    if (m.grounded && hs > 3.0 && !m.crouching) {
      this.stepDist += hs * h;
      if (this.stepDist > (this.sprinting ? 2.5 : 2.1)) { this.stepDist = 0; this._sfx('step', m.surface, this.sprinting ? 0.7 : 0.55); g.emitNoise(m.pos, this.sprinting ? 17 : 11, this.team); }
    } else if (!m.grounded) this.stepDist = 1.4;
    if (m.landSpeed > 3.5) { this._sfx('land', m.surface, m.landSpeed / 9); this.punchV += Math.min(m.landSpeed, 14) * -0.012; g.emitNoise(m.pos, 14, this.team); }
    // v34 fall damage (Source / UE-style, fixed HP): drop height h = v² / 2g; safe up to FALL_SAFE m, lethal at FALL_LETHAL m
    if (m.landSpeed > 11 && this.alive) { const hgt = m.landSpeed * m.landSpeed / (-2 * CFG.gravity), dmg = Math.round((hgt - FALL_SAFE) / (FALL_LETHAL - FALL_SAFE) * 100);
      if (dmg > 0) { g.applyDamage(this, dmg, 'legs', this, WEAPON_DEFS.fall, null, null, { fall: true }); if (this.isPlayer) g.audio.land(null, m.surface, 1.4); } }
  }
}

/* =====================================================================
   PLAYER — the local human: mouse look, view punch & camera recoil, death camera, round-mode spectating.
   ===================================================================== */
class Player extends Human {
  constructor(game) {
    super(game, 'alpha', 'YOU', true);
    this.recoilPitch = 0; this.recoilYaw = 0; this.recoilHold = 0; this.recoilTP = 0; this.recoilTY = 0; this.shake = 0;
    this.eyeH = CFG.player.eye;
    this.streak = 0; this.multi = 0; this.lastKillT = -10; this.killer = null; this.spectating = null; this.deathT = 0;
    this.renderPos = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  look(dx, dy) {
    if (!this.alive) return;
    const ws = this.game.weapons, cam = this.game.camera;
    let k = Settings.data.sens * 0.022 * THREE.MathUtils.DEG2RAD;
    if (ws.ads) k *= Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(ws.baseFov / 2)) * Settings.data.zoomSens;
    // SPRAY CONTROL: pulling the mouse against the recoil first cancels the recoil offset (so the view does not
    // sink below your target when the recoil recovers after you let go); any extra movement aims normally.
    let dp = -dy * k, dyaw = -dx * k;
    if (dp < 0 && this.recoilTP > 0) { const use = Math.min(this.recoilTP, -dp); this.recoilTP -= use; this.recoilPitch -= use; dp += use; }
    if (this.recoilTY !== 0 && Math.sign(dyaw) === -Math.sign(this.recoilTY)) { const use = Math.min(Math.abs(this.recoilTY), Math.abs(dyaw)) * Math.sign(this.recoilTY); this.recoilTY -= use; this.recoilYaw -= use; dyaw += use; }
    this.yaw += dyaw; this.pitch = clamp(this.pitch + dp, -1.54, 1.54);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  applyView() {
    const cam = this.game.camera;
    const sh = this.shake > 0 ? this.shake : 0;
    this._euler.set(this.pitch + this.recoilPitch + this.punch + (sh ? rand(-sh, sh) * 0.02 : 0), this.yaw + this.recoilYaw + (sh ? rand(-sh, sh) * 0.02 : 0), this.slideK * 0.075, 'YXZ');
    cam.quaternion.setFromEuler(this._euler); cam.updateMatrixWorld();
  }

  // TRUE CAMERA RECOIL: every shot rotates the CAMERA (pitch/yaw offset) — the crosshair never leaves the screen
  // centre, the whole world kicks up. The camera snaps to the kick in ~25 ms; while the trigger is held nothing
  // recovers (you must pull down = spray control); after you stop, the un-compensated rest settles back smoothly.
  addRecoil(p, y) { this.recoilTP += p; this.recoilTY += y; this.recoilHold = 0.12; }
  resetRecoil() { this.recoilPitch = 0; this.recoilYaw = 0; this.recoilTP = 0; this.recoilTY = 0; this.recoilHold = 0; }

  update(dt) {
    const w = this.game.weapons.current, rec = (w && w.def.recoilRecovery) || 8;
    const firing = this.recoilHold > 0 || (this.game.weapons.trigger && this.game.weapons.current.auto && this.game.weapons.current.ammo > 0);
    this.recoilHold = Math.max(0, this.recoilHold - dt);
    if (!firing) { const lam = rec * 0.8; this.recoilTP = damp(this.recoilTP, 0, lam, dt); this.recoilTY = damp(this.recoilTY, 0, lam, dt); }
    this.recoilPitch = damp(this.recoilPitch, this.recoilTP, 42, dt); this.recoilYaw = damp(this.recoilYaw, this.recoilTY, 42, dt);
    this.punchV += (-this.punch * 160 - this.punchV * 16) * dt; this.punch += this.punchV * dt;
    this.fovPunch = damp(this.fovPunch, 0, 10, dt); this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.spawnProtect > 0) this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.eyeH = damp(this.eyeH, this.motor.crouching ? CFG.player.crouchEye - (this.slideT > 0 ? 0.12 : 0) : CFG.player.eye, 16, dt);
    this.slideK = damp(this.slideK, this.slideT > 0 ? 1 : 0, 10, dt);
    this.mantleK = damp(this.mantleK, this.mantleT > 0 ? 1 : 0, 18, dt);
    if (!this.alive) this.deathT += dt;
  }

  updateCamera(alpha) {
    const m = this.motor, cam = this.game.camera;
    this.renderPos.lerpVectors(m.prevPos, m.pos, alpha);
    if (this.alive) {
      cam.position.set(this.renderPos.x, this.renderPos.y + this.eyeH + m.stepOffset, this.renderPos.z);
      this.applyView(); return;
    }
    const spec = this.spectating;
    if (spec && spec.alive) { // round mode: first-person spectate of a living teammate
      const pt = spec.aimPitch || 0, fwd = 0.32 * Math.cos(pt);
      spec.eyePos(cam.position); // camera pushed ahead of his face (his head mesh is hidden) so his own model never blocks the view
      cam.position.x += -Math.sin(spec.yaw) * fwd; cam.position.z += -Math.cos(spec.yaw) * fwd; cam.position.y += 0.03 + Math.sin(pt) * 0.32;
      this._euler.set(pt, spec.yaw, 0, 'YXZ'); cam.quaternion.setFromEuler(this._euler); cam.updateMatrixWorld();
      return;
    }
    const k = clamp(this.deathT / 0.6, 0, 1);
    cam.position.set(this.renderPos.x, this.renderPos.y + lerp(this.eyeH, 0.4, k), this.renderPos.z);
    if (this.killer && this.killer.alive) {
      const kp = this.killer.eyePos(TMP_V1), dx = kp.x - cam.position.x, dy = kp.y - cam.position.y, dz = kp.z - cam.position.z;
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
      this.yaw += wrapAngle(ty - this.yaw) * Math.min(1, 0.08 * k); this.pitch = lerp(this.pitch, tp, 0.08 * k);
    }
    this._euler.set(this.pitch, this.yaw, lerp(0, 0.5, k), 'YXZ'); cam.quaternion.setFromEuler(this._euler); cam.updateMatrixWorld();
  }

  onDamaged(amount, attacker, fromPos) {
    const dx = fromPos.x - this.motor.pos.x, dz = fromPos.z - this.motor.pos.z, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.game.app.hud.damage(amount, Math.atan2(dx * c + dz * -s, dx * -s + dz * -c));
    this.game.audio.hurt(); this.punchV += 0.9 + amount * 0.02; this.fovPunch = -1.5;
  }

  // Spectating a teammate hides his head/helmet mesh; the previous target gets it back.
  setSpectate(bot) {
    if (this.spectating && this.spectating.model) { this.spectating.model.head.visible = true; if (this.spectating.tag) this.spectating.tag.userData.hide = false; }
    this.spectating = bot || null;
    if (bot && bot.model) { bot.model.head.visible = false; if (bot.tag) bot.tag.userData.hide = true; }
  }

  die(attacker) {
    this.alive = false; this.hp = 0; this.killer = attacker; this.deathT = 0; this.sprinting = false; this.holdE = false;
    this.respawnT = CFG.respawn; this.motor.setCrouch(false); this.motor.climbInput = 0;
    this.game.weapons.exitADS(); this.game.weapons.trigger = false; this.game.audio.death();
  }

  respawn(point, yaw) {
    const g = this.game;
    const queued = g.nextSpawnLoadoutIndex !== null && g.nextSpawnLoadoutIndex !== g.loadoutIndex; // F1–F3 queue: the new kit is issued only now
    if (queued) g.loadoutIndex = g.nextSpawnLoadoutIndex;
    const kit = loadoutDefs(g.mode, Settings.data.loadouts[g.loadoutIndex]);
    // v45: always respawn with the set's own guns — a weapon picked up from the floor does not carry over
    if (queued || kit.map((d) => d.id).join() !== g.weapons.weapons.map((w) => w.def.id).join()) g.weapons.rebuild(kit);
    if (queued) g.app.hud.toast(`已換上配裝 ${LOADOUT_KEYS[g.loadoutIndex]}`);
    g.nextSpawnLoadoutIndex = null;
    this.setSpectate(null);
    this.motor.teleport(point); this.life = (this.life || 0) + 1;
    this.yaw = yaw; this.pitch = 0; this.resetRecoil(); this.punch = 0; this.punchV = 0; this.shake = 0; this.slideT = 0; this.slideK = 0; this.mantleT = 0; this.mantleK = 0;
    this.hp = 100; this.alive = true; this.spawnProtect = CFG.spawnProtect; this.eyeH = CFG.player.eye; this.killer = null; this.carrying = false;
    this.damageLog.clear();
    this.game.weapons.resetLoadout(); this.game.app.hud.setWeapon(this.game.weapons);
  }
}

