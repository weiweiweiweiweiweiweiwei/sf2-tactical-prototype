/* =====================================================================
   BOTS — soldiers for both teams + BotAI finite-state machine.
   NO WALLHACKS: a bot only knows what it SEES (120° cone + raycast
   line of sight), HEARS (approximate direction/distance, never an
   exact position) or what the game mode openly tells every player.
   States: PATROL (waypoint network / search route) · HOLD (scan) ·
           ALERT→INVESTIGATE / FLANK · ENGAGE (always strafing) · COVER ·
           SEARCH · MELEE · OBJECTIVE. Getting hit triggers a dodge
           (side-slide or crouch) — v5.
   ===================================================================== */
const BOT_NAMES = {
  alpha: ['Falcon', 'Eagle', 'Tiger', 'Bear', 'Shadow', 'Ranger', 'Hunter', 'Blaze', 'Storm', 'Frost', 'Ace'],
  bravo: ['Viper', 'Ghost', 'Raven', 'Cobra', 'Wolf', 'Hawk', 'Jackal', 'Scorpion', 'Reaper', 'Mamba', 'Vulture', 'Kraken'],
};
const FOV_COS = Math.cos(THREE.MathUtils.degToRad(60)); // 120° vision cone

// Soldier body animation shared by bots, remote humans on the host and ghosts on a client (v25): walk cycle blended into a
// one-knee kneel (right thigh forward, left knee on the ground) when crouching, aim pitch, flinch springs, spawn-shield glow.
function animateSoldier(c, dt, hs, crouching, aimPitch, armsDown) {
  const M = c.model;
  c.walkPhase = (c.walkPhase || 0) + dt * hs * 2.4;
  const amp = clamp(hs / 4.5, 0, 1), sw = Math.sin(c.walkPhase) * amp * 0.7, ck = c.crouchK = damp(c.crouchK || 0, crouching ? 1 : 0, 14, dt);
  M.legs[0].hip.rotation.x = lerp(sw, 0.12, ck); M.legs[1].hip.rotation.x = lerp(-sw, 1.45, ck);
  M.legs[0].knee.rotation.x = lerp(Math.max(0, -Math.sin(c.walkPhase)) * amp * 0.9, -1.62, ck); M.legs[1].knee.rotation.x = lerp(Math.max(0, Math.sin(c.walkPhase)) * amp * 0.9, -1.45, ck);
  const hipY = lerp(0.92, 0.52, ck); M.legs[0].hip.position.y = M.legs[1].hip.position.y = hipY;
  M.torso.position.y = hipY + Math.abs(Math.cos(c.walkPhase)) * 0.025 * amp * (1 - ck);
  M.arms.rotation.x = damp(M.arms.rotation.x, aimPitch, 12, dt); M.head.rotation.x = M.arms.rotation.x * 0.6;
  const fl = c.fl;
  if (fl) { // damped springs for the flinch
    for (const [a, v] of [['x', 'vx'], ['z', 'vz'], ['h', 'vh']]) { fl[v] += (-fl[a] * 160 - fl[v] * 16) * dt; fl[a] += fl[v] * dt; }
    M.torso.rotation.x = fl.x * 0.75; M.torso.rotation.z = fl.z * 0.6; M.head.rotation.x += fl.h * 0.55;
  }
  if (armsDown) M.arms.rotation.x = damp(M.arms.rotation.x, -0.5, 10, dt);
  // v34: no spawn-protection glow on the body (user: no white flashing on enemies) — hits on a protected soldier still show the shield spark
}
const PREF_RANGE = { sniper: [30, 75], rifle: [10, 34], lmg: [12, 38], smg: [6, 22], shotgun: [2, 9], pistol: [5, 18], knife: [0, 2] };

class Bot extends Combatant {
  constructor(game, team, idx, weaponId) {
    super(game, team, BOT_NAMES[team][idx % BOT_NAMES[team].length], false);
    this.idx = idx; this.isBot = true; this.aimPitch = 0; this.walkPhase = Math.random() * 6; this.stepDist = 0; this.spottedT = -10; this.stepPitch = rand(0.9, 1.12);
    this.model = game.app.soldiers.create(team, WEAPON_DEFS[weaponId].model || weaponId);
    game.scene.add(this.model.root);
    this.setWeapon(weaponId);
    if (team === game.player.team) this.tag = this._makeTag();
    this.ai = new BotAI(this, game);
  }

  setWeapon(id) {
    this.weaponId = id; this.def = WEAPON_DEFS[id]; this.ammo = this.def.mag || 0; this.reloadT = 0;
    this.game.app.soldiers.setWeapon(this.model, this.def.model || id);
    this.nades = { he: 0, flash: 0 };
  }

  _makeTag() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const ctx = c.getContext('2d');
    ctx.font = 'bold 34px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(this.name, 128, 32); ctx.fillStyle = '#8fc8ff'; ctx.fillText(this.name, 128, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.scale.set(0.1, 0.025, 1); s.renderOrder = 20; s.userData.noAO = true; this.game.scene.add(s);
    return s;
  }

  // v8 SCOPE GLINT (COD): a sniper aiming at the player flashes a lens glint — constant screen size, hidden behind walls.
  _glint() {
    const ai = this.ai, pl = this.game.player, show = pl.alive && ai.target === pl && (ai.state === 'ENGAGE' || ai.state === 'COVER') && ai.seeTarget;
    if (!show && !this.glint) return;
    if (!this.glint) {
      const mat = new THREE.SpriteMaterial({ map: this.game.app.tex.dot(), color: new THREE.Color(1.5, 1.6, 2.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false });
      this.glint = new THREE.Sprite(mat); this.glint.renderOrder = 15; this.glint.userData.noAO = true; this.game.scene.add(this.glint);
    }
    let k = 0;
    if (show) {
      const e = this.eyePos(TMP_V1), f = this.lookDir(TMP_V2), to = pl.eyePos(TMP_V3).sub(e), d = to.length(), c = f.dot(to) / (d || 1);
      if (d > 14 && c > 0.965) k = (c - 0.965) / 0.035;
      this.glint.position.copy(e).addScaledVector(f, 0.32); this.glint.position.y -= 0.035;
    }
    this.glint.visible = k > 0.02;
    if (this.glint.visible) { const s = (0.018 + 0.03 * k) * (0.75 + 0.25 * Math.sin(this.game.time * 9 + this.idx)); this.glint.scale.set(s, s, 1); this.glint.material.opacity = 0.45 + 0.55 * k; }
  }

  get muzzlePos() { this.model.root.updateMatrixWorld(); return this.model.muzzle.getWorldPosition(new THREE.Vector3()); }
  lookDir(out) { const cp = Math.cos(this.aimPitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.aimPitch), -Math.cos(this.yaw) * cp); }

  onDamaged(amount, attacker, fromPos) { this.ai.onDamaged(attacker, fromPos); }
  // v9 hit reaction: the upper body jolts away from the bullet (head snaps back on a headshot), then springs back.
  flinch(part, dir, dmg) {
    const k = clamp(dmg / 30, 0.35, 1.2), fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const back = dir.x * fx + dir.z * fz, side = dir.x * rx + dir.z * rz;
    this.fl = this.fl || { x: 0, z: 0, h: 0, vx: 0, vz: 0, vh: 0 };
    this.fl.vx += -back * 9 * k; this.fl.vz += -side * 7 * k; if (part === 'head') this.fl.vh += -(Math.abs(back) > 0.3 ? Math.sign(back) : -1) * 14 * k;
  }

  die(dir, force) {
    this.alive = false; this.hp = 0; this.respawnT = CFG.respawn; this.holdE = false; this.motor.climbInput = 0;
    this.model.head.visible = true;
    const corpse = SkeletonUtils.clone(this.model.root); // v22: skinned soldier — rebinds the clone to its own bones
    corpse.position.set(0, 0, 0); corpse.rotation.set(0, 0, 0);
    corpse.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material === this.model.mat) o.material = camoMat(this.model.mat.clone()); if (o.material.emissive) o.material.emissive.setRGB(0, 0, 0); } });
    const hd = dir.clone().setY(0); if (hd.lengthSq() < 1e-4) hd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const N = (n) => corpse.getObjectByName(n), hips = [N('hip0'), N('hip1')], torso = N('torso'), knees = [N('knee0'), N('knee1')], head = N('head'), arms = N('arms');
    const limp = knees[0] && knees[1] && head && arms ? { t: 0, hips, knees, torso, head, arms, h0: hips.map((h) => h.rotation.x), k0: knees.map((n) => n.rotation.x), a0: arms.rotation.x, hd0: head.rotation.x, t0: torso.rotation.x,
      hipT: [rand(-0.35, 0.65), rand(-0.35, 0.65)], kneeT: [-rand(0.25, 1.15), -rand(0.25, 1.15)], armT: -rand(0.8, 1.35), armZ: rand(-0.35, 0.35), headT: rand(-0.55, 0.6), headZ: rand(-0.6, 0.6), torsoT: rand(-0.3, 0.25) } : null;
    this.game.physics.spawnCorpse(corpse, this.motor.pos, this.yaw, hd.normalize(), force, limp);
    this.model.root.visible = false; if (this.tag) this.tag.visible = false; if (this.glint) this.glint.visible = false;
  }

  respawn(point, yaw) {
    this.motor.teleport(point); this.life = (this.life || 0) + 1;
    this.yaw = yaw + rand(-0.3, 0.3); this.hp = 100; this.alive = true; this.spawnProtect = CFG.spawnProtect; this.carrying = false;
    this.ammo = this.def.mag || 0; this.reloadT = 0; this.damageLog.clear();
    this.nades = this.game.mode === 'general' ? { he: 1, flash: 1 } : { he: 0, flash: 0 };
    this.model.root.visible = true; this.model.head.visible = true; this.model.root.position.copy(this.motor.pos); if (this.tag) this.tag.visible = true;
    this.ai.reset();
  }

  fixedUpdate(h) {
    if (!this.alive) return;
    const ai = this.ai, frozen = !this.game.canMove(), m = this.motor;
    if (!m.climbing) m.setCrouch(!frozen && ai.crouchT > 0);
    m.step(h, frozen ? 0 : ai.wishX, frozen ? 0 : ai.wishZ, frozen ? 0 : ai.wishSpeed * (this.carrying ? 0.88 : 1));
    if (!frozen && ai.wantJump) { m.requestJump(); ai.wantJump = false; }
    if (m.climbing) { if (m.climbDist > 0.6) { m.climbDist = 0; this._step('ladder', 0.9); } return; }
    const hs = m.horizontalSpeed();
    if (m.grounded && hs > 2.4 && !m.crouching) {
      this.stepDist += hs * h;
      if (this.stepDist > (hs > 4.2 ? 2.2 : 1.9)) { this.stepDist = 0; this._step(m.surface, hs > 4.2 ? 1.15 : 0.85); }
    } else if (hs < 0.3) this.stepDist = 0.8; // standing still = silent; the next step comes soon after starting to move
  }
  // Individual, strictly positional footsteps (HRTF left/right, inverse-distance, muffled through walls).
  _step(surface, loud) {
    const g = this.game, p = TMP_V3.copy(this.motor.pos).setY(this.motor.pos.y + 0.1), d = p.distanceTo(g.camera.position);
    if (d > 34) return;
    const occluded = d > 3 && !g.collision.segmentClear(g.camera.position, TMP_V4.copy(p).setY(p.y + 0.5));
    g.audio.footstep(p, surface, loud, { pitch: this.stepPitch, occluded });
  }

  update(dt, alpha) {
    if (!this.alive) return;
    if (this.spawnProtect > 0) this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = this.def.mag; }
    this.ai.update(dt);
    const m = this.motor, M = this.model;
    M.root.position.lerpVectors(m.prevPos, m.pos, alpha); M.root.rotation.y = this.yaw;
    animateSoldier(this, dt, m.horizontalSpeed(), m.crouching, this.aimPitch, this.reloadT > 0 || m.climbing);
    // v34: scope glint removed (it read as a flashing white blob)
    if (this.tag) { this.tag.position.set(M.root.position.x, M.root.position.y + 2.1, M.root.position.z); this.tag.visible = !this.tag.userData.hide && this.tag.position.distanceTo(this.game.camera.position) < 70; }
  }
}

class BotAI {
  constructor(bot, game) {
    this.bot = bot; this.game = game; this.wishX = 0; this.wishZ = 0; this.wishSpeed = 0; this.wantJump = false;
    // personality: every bot searches its own lane, at its own pace, with its own route preferences
    const B = game.def.bounds, zSpan = (B.maxZ - B.minZ) / 2;
    this.lane = ((bot.idx * 0.618 + (bot.team === 'alpha' ? 0.13 : 0.41)) % 1) * 1.6 - 0.8; // -0.8..0.8 of the half-width
    this.laneZ = (B.minZ + B.maxZ) / 2 + this.lane * zSpan;
    this.aggro = rand(0.35, 1); this.caution = rand(0.15, 0.85); this.pace = rand(0.82, 1.0); this.routeSeed = 1 + Math.floor(Math.random() * 9999);
    this.reset();
  }
  get D() { return DIFFICULTY[this.game.config.difficulty] || DIFFICULTY[1]; }

  reset() {
    if (this.ride) { this.ride.done(); this.ride = null; }
    this.state = 'PATROL'; this.path = []; this.pathIdx = 0; this.goal = null; this.target = null; this.goalKind = null;
    this.lastKnown = new THREE.Vector3(); this.lastSeenT = -10; this.seeTarget = false; this.alertT = 0;
    this.reactT = 0; this.engageT = 0; this.burstLeft = 0; this.burstGapT = 0; this.shotT = 0; this.settleT = 0;
    this.perceiveT = rand(0, 0.12); this.stuckT = 0; this.progress = new THREE.Vector3(1e9, 0, 0);
    this.searchT = 0; this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0; this.repathT = 0; this.blindT = 0;
    this.meleeCd = 0; this.nadeChecked = true; this.wishX = this.wishZ = this.wishSpeed = 0;
    this.holdT = 0; this.scanBase = this.bot.yaw; this.scanPhase = Math.random() * 6; this.departT = rand(0, 2.4) * (0.5 + this.caution);
    this.pendingSound = null; this.coverCd = 0; this.coverT = 0; this.peekPos = null; this.lastHurtT = -10; this.lookT = 0; this.lookYaw = null;
    this.avoid = { t: 0, x: 0, z: 0 }; this.objT = 0; this.cornerT = 0; this.bot.holdE = false; this.bot.motor.climbInput = 0; this.aware = new Map();
    this.dodgeT = 0; this.dodgeCd = 0; this.dodgeX = 0; this.dodgeZ = 0; this.crouchT = 0; this.flankGoal = null; this.suppressCd = 0;
  }

  setPath(target, noisy = true) {
    if (this.bot.motor.climbing && this.pathIdx < this.path.length) return; // never re-plan halfway up a ladder
    this.goal = target.clone(); this.path = this.game.nav.findPath(this.bot.motor.pos, target, noisy ? this.routeSeed : 0);
    if (this.path.length && this.path[0].distanceTo(this.bot.motor.pos) < 1.2) this.path.shift();
    this.pathIdx = 0; this.stuckT = 0;
  }

  /* ------------------------------ senses ------------------------------ */
  // Hearing gives only a rough estimate of where the sound came from (error grows with distance).
  hear(pos, radius, kind = 'noise') {
    if (!this.bot.alive || this.state === 'ENGAGE' || this.state === 'MELEE' || this.state === 'COVER' || this.state === 'FLANK' || this.bot.carrying) return;
    const d = this.bot.motor.pos.distanceTo(pos);
    if (d > radius || (this.state === 'OBJECTIVE' && d > 22)) return; // on an objective run, only nearby contacts matter
    const err = clamp(d * (kind === 'step' ? 0.2 : 0.3), 1.2, 12), a = Math.random() * Math.PI * 2, r = err * Math.sqrt(Math.random());
    const est = new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
    if (this.state === 'INVESTIGATE' && this.goal && this.goal.distanceTo(est) < 6) return;
    this.pendingSound = { pos: est, t: rand(0.35, 0.9) + this.caution * 0.3 };
    // ALERT: freeze the patrol for a beat and turn toward the noise before moving on it
    if (this.state === 'PATROL' || this.state === 'HOLD') { const my = this.bot.motor.pos; this.lookYaw = Math.atan2(-(est.x - my.x), -(est.z - my.z)); this.lookT = 0.9; this.alertT = 3; }
  }

  onDamaged(attacker, fromPos) {
    this.alertT = 4; this.lastHurtT = this.game.time;
    if (this.state === 'ENGAGE' || this.state === 'COVER') { this._dodge(fromPos); return; }
    if (this.state === 'MELEE') return;
    // knows roughly WHERE the shot came from, not exactly who/where: turn toward that direction and look
    const d = this.bot.motor.pos.distanceTo(fromPos), err = clamp(d * 0.18, 0.5, 7), a = Math.random() * 6.283;
    const est = new THREE.Vector3(fromPos.x + Math.cos(a) * err, fromPos.y, fromPos.z + Math.sin(a) * err);
    const dx = est.x - this.bot.motor.pos.x, dz = est.z - this.bot.motor.pos.z;
    this.lookYaw = Math.atan2(-dx, -dz); this.lookT = 1.2;
    this.lastKnown.copy(est);
    if (this.state !== 'OBJECTIVE' || Math.random() < 0.6) { this.state = 'INVESTIGATE'; this.goalKind = 'hurt'; this.setPath(est); }
    this._dodge(fromPos);
  }

  // HIT DODGE: an emergency side-slide perpendicular to the incoming fire (toward the clearer side), or a crouch.
  _dodge(fromPos) {
    if (this.dodgeCd > 0 || !this.bot.alive || this.bot.motor.climbing) return;
    this.dodgeCd = rand(1.8, 3.2);
    const my = this.bot.motor.pos, dx = fromPos.x - my.x, dz = fromPos.z - my.z, L = Math.hypot(dx, dz) || 1;
    if (Math.random() < 0.38) { this.crouchT = rand(0.7, 1.4); return; }
    let px = -dz / L, pz = dx / L;
    const o = new THREE.Vector3(my.x, my.y + 0.9, my.z), col = this.game.collision;
    const hl = col.raycast(o, new THREE.Vector3(px, 0, pz), 2.5), hr = col.raycast(o, new THREE.Vector3(-px, 0, -pz), 2.5);
    const left = hl ? hl.t : 2.5, right = hr ? hr.t : 2.5;
    if (right > left + 0.3 || (Math.abs(right - left) <= 0.3 && Math.random() < 0.5)) { px = -px; pz = -pz; }
    this.dodgeX = px; this.dodgeZ = pz; this.dodgeT = rand(0.4, 0.65); this.strafeDir = 0; this.strafeT = 0;
    if (Math.random() < 0.12) this.wantJump = true;
  }

  // v8 NEAR MISS: no damage, but the crack gives a rough direction — fighting bots dodge, the rest turn, dodge and move on it.
  onSuppressed(fromPos) {
    if (!this.bot.alive || this.suppressCd > 0) return;
    this.suppressCd = 0.8; this.alertT = 3;
    if (this.state === 'ENGAGE' || this.state === 'COVER') { if (Math.random() < 0.35) this._dodge(fromPos); return; }
    if (this.state === 'MELEE' || this.bot.carrying) return;
    const my = this.bot.motor.pos, d = my.distanceTo(fromPos), err = clamp(d * 0.2, 0.6, 8), a = Math.random() * 6.283;
    const est = new THREE.Vector3(fromPos.x + Math.cos(a) * err, fromPos.y, fromPos.z + Math.sin(a) * err);
    this.lookYaw = Math.atan2(-(est.x - my.x), -(est.z - my.z)); this.lookT = 1.0; this.lastKnown.copy(est); this.pendingSound = null;
    this._dodge(fromPos);
    if (this.state !== 'OBJECTIVE' || Math.random() < 0.5) this._approach(est, 'hurt');
  }

  // Approach a sound / last-known position: aggressive bots swing wide and FLANK (per-bot side), the rest go straight in.
  _approach(est, kind) {
    const bot = this.bot, my = bot.motor.pos, d = my.distanceTo(est);
    if (d > 22 && Math.random() < (0.3 + this.aggro * 0.35) * (this.game.rules.botGoal && this.game.rules.botGoal(bot) ? 0.35 : 1)) {
      const dx = est.x - my.x, dz = est.z - my.z, L = Math.hypot(dx, dz) || 1, side = (bot.idx % 2 ? 1 : -1) * (Math.random() < 0.8 ? 1 : -1), off = clamp(d * 0.45, 10, 26);
      const fp = new THREE.Vector3(est.x - (dx / L) * d * 0.35 - (dz / L) * off * side, est.y, est.z - (dz / L) * d * 0.35 + (dx / L) * off * side);
      const n = this.game.nav.nearest(fp, false);
      if (n && n.p.distanceTo(est) > 6 && n.p.distanceTo(my) > 6) { this.flankGoal = est.clone(); this.state = 'FLANK'; this.goalKind = kind; this.setPath(n.p); return; }
    }
    this.state = 'INVESTIGATE'; this.goalKind = kind; this.setPath(est);
  }

  blind(dur) { this.blindT = Math.max(this.blindT, dur); this.burstLeft = 0; }

  // Vision: strict 120° cone around where the bot is LOOKING + raycast line of sight (walls, crates, glass and smoke block).
  visible(t) {
    const bot = this.bot, eye = bot.eyePos(new THREE.Vector3()), head = t.eyePos(new THREE.Vector3());
    const dx = head.x - eye.x, dy = head.y - eye.y, dz = head.z - eye.z, dist = Math.hypot(dx, dy, dz);
    if (dist > this.D.view * (this.game.def.viewMult || 1) * (bot.def.kind === 'sniper' ? 1.45 : 1)) return false;
    const f = bot.lookDir(TMP_V1);
    if ((f.x * dx + f.y * dy + f.z * dz) / (dist || 1) < FOV_COS) return false; // outside the cone: sneaking behind a bot works
    const chest = t.chestPos(new THREE.Vector3()), fx = this.game.effects, col = this.game.collision;
    if (!fx.smokeBlocks(eye, head) && col.segmentClear(eye, head)) return true;
    return !fx.smokeBlocks(eye, chest) && col.segmentClear(eye, chest);
  }

  perceive() {
    const bot = this.bot, g = this.game;
    if (this.blindT > 0) { this.seeTarget = false; return; }
    const enemies = g.combatants.filter((c) => c.alive && c.team !== bot.team && c.spawnProtect <= 0);
    enemies.sort((a, b) => a.motor.pos.distanceToSquared(bot.motor.pos) - b.motor.pos.distanceToSquared(bot.motor.pos));
    let found = null;
    if (this.target && this.target.alive && enemies.includes(this.target) && this.visible(this.target)) found = this.target;
    else {
      // NOTICING takes time: fast for a near enemy in the centre of view (or one who moves / shoots), slow for a
      // distant, still, crouched enemy at the edge of the 120° cone — you can cross a far lane unseen.
      const aw = this.aware, f = bot.lookDir(TMP_V4), e = bot.eyePos(TMP_V3), step = 0.1;
      for (const [c, v] of aw) { const nv = v - step * 0.45; if (nv <= 0 || !c.alive) aw.delete(c); else aw.set(c, nv); }
      for (let i = 0; i < Math.min(5, enemies.length); i++) {
        const t = enemies[i];
        if (!this.visible(t)) continue;
        const dx = t.motor.pos.x - e.x, dz = t.motor.pos.z - e.z, dist = Math.hypot(dx, dz) || 1, cosA = (f.x * dx + f.z * dz) / dist / Math.hypot(f.x, f.z);
        let rate = 3.6 * (1 - clamp((dist - 8) / this.D.view, 0, 0.85)) * (0.3 + 0.7 * clamp((cosA - FOV_COS) / (1 - FOV_COS), 0, 1));
        if (t.motor.horizontalSpeed() > 2.2) rate *= 1.6; else if (t.motor.horizontalSpeed() < 0.4) rate *= 0.7;
        if (t.motor.crouching) rate *= 0.6;
        if (g.time - (t.lastAttackT || -9) < 1.2) rate *= 2.6; // muzzle flash gives you away
        if (dist < 4) rate *= 3;
        const v = Math.min(1.3, (aw.get(t) || 0) + rate * step * 1.5); aw.set(t, v);
        if (v >= 1) { found = t; break; }
        if (v > 0.45 && this.lookT <= 0 && this.state !== 'ENGAGE') { this.lookYaw = Math.atan2(-dx, -dz); this.lookT = 0.6; } // "was that something?" — glance over
      }
    }
    this.seeTarget = !!found;
    if (!found) return;
    if (found !== this.target || (this.state !== 'ENGAGE' && this.state !== 'MELEE' && this.state !== 'COVER')) {
      const dist = bot.motor.pos.distanceTo(found.motor.pos), moving = found.motor.horizontalSpeed() > 2 ? 0.85 : 1.15, crouch = found.motor.crouching ? 1.15 : 1;
      this.reactT = this.D.react * rand(0.8, 1.3) * moving * crouch + dist * 0.005; this.engageT = 0; this.burstLeft = 0; this.burstGapT = 0; this.settleT = this.D.settle * rand(0.8, 1.2);
      if (dist > 9 && dist < 26 && Math.random() < this.D.nade * 0.6) { this.lastKnown.copy(found.motor.pos); this._maybeNade(true); }
    }
    this.target = found; this.lastKnown.copy(found.motor.pos); this.lastSeenT = g.time; this.nadeChecked = false; this.pendingSound = null;
    if (bot.def.kind === 'knife') { if (this.state !== 'MELEE') { this.state = 'MELEE'; this.repathT = 0; } }
    else if (this.state !== 'ENGAGE' && this.state !== 'COVER') { this.state = 'ENGAGE'; this.path = []; }
    if (bot.team === g.player.team) found.spottedT = g.time;
  }

  /* ------------------------------ movement ------------------------------ */
  _turnTo(yawTarget, rate, dt) { const d = wrapAngle(yawTarget - this.bot.yaw), s = rate * dt; this.bot.yaw = wrapAngle(this.bot.yaw + clamp(d, -s, s)); return Math.abs(d); }

  // Raycast feelers ahead (chest height): steer around obstacles the coarse nav grid does not know about.
  _avoidance(dx, dz) {
    const g = this.game, m = this.bot.motor, now = g.time, a = this.avoid;
    if (now < a.t) return a;
    a.t = now + 0.08; a.x = 0; a.z = 0;
    const o = new THREE.Vector3(m.pos.x, m.pos.y + 0.95, m.pos.z), L = 1.1 + m.horizontalSpeed() * 0.18, d = new THREE.Vector3();
    const probe = (ang) => {
      const c = Math.cos(ang), s = Math.sin(ang); d.set(dx * c - dz * s, 0, dx * s + dz * c);
      const h = g.collision.raycast(o, d, L, false);
      let v = h && h.normal.y < 0.5 ? h.t / L : 1;
      const T = g.collision.terrain; // terrain too steep to walk up counts as a wall (chest-height feelers miss slopes)
      if (T && v === 1) { const ax = m.pos.x + d.x * L, az = m.pos.z + d.z * L; if (T.heightAt(ax, az) - m.pos.y > L * MAX_SLOPE * 0.9 && T.slopeAt(ax, az) > MAX_SLOPE) v = 0.35; }
      return v;
    };
    const f = probe(0);
    if (f < 1) {
      const l = probe(0.6), r = probe(-0.6), side = l > r ? 1 : -1, k = (1 - f) * 1.6;
      a.x = -dz * side * k; a.z = dx * side * k; // perpendicular toward the clearer side
    }
    return a;
  }

  _follow(speed, dt, face = true, scan = false) {
    const m = this.bot.motor;
    while (this.pathIdx < this.path.length) {
      const t = this.path[this.pathIdx], dx = t.x - m.pos.x, dz = t.z - m.pos.z, dy = t.y - m.pos.y;
      if (dx * dx + dz * dz < 0.3 && Math.abs(dy) < 1.6) { this.pathIdx++; this._corner(); continue; }
      const prev = this.pathIdx > 0 ? this.path[this.pathIdx - 1] : null;
      m.climbInput = (t.ladder || (prev && prev.ladder)) ? (dy > 0.02 ? 1 : dy < -0.3 ? -1 : m.climbing ? 1 : 0) : 0; // keep climbing until over the lip
      const d = Math.hypot(dx, dz) || 1; let wx = dx / d, wz = dz / d;
      if (!m.climbing) { const av = this._avoidance(wx, wz); wx += av.x; wz += av.z; const l = Math.hypot(wx, wz) || 1; wx /= l; wz /= l; }
      this.wishX = wx; this.wishZ = wz; this.wishSpeed = this.cornerT > 0 ? speed * 0.35 : speed;
      if (face) {
        let yaw = Math.atan2(-dx, -dz);
        if (scan) { this.scanPhase += dt * (0.9 + this.caution); yaw += Math.sin(this.scanPhase) * (0.45 + this.caution * 0.35); } // head on a swivel
        this._turnTo(yaw, 5, dt);
      }
      return true;
    }
    m.climbInput = 0; this.wishX = this.wishZ = this.wishSpeed = 0; return false;
  }
  // Sharp turn in the route = a corner: slow down and check it (cautious bots more often).
  _corner() {
    const p = this.path, i = this.pathIdx;
    if (i < 1 || i + 1 >= p.length) return;
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const ang = Math.abs(wrapAngle(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z)));
    if (ang > 0.8 && Math.random() < 0.3 + this.caution * 0.6) this.cornerT = rand(0.35, 0.9);
  }

  _stuckCheck(dt) {
    const m = this.bot.motor; this.stuckT += dt;
    if (this.stuckT > 1.4) {
      if (m.pos.distanceTo(this.progress) < 0.5 && this.wishSpeed > 0 && !m.climbing) {
        this.path = []; this.pathIdx = 0; this.wantJump = true; this.avoid.t = 0; this.strafeDir = -this.strafeDir;
      } else if (m.climbing && m.pos.distanceTo(this.progress) < 0.3) { // wedged on a ladder: let go and re-plan
        this.path = []; this.pathIdx = 0; m.climbInput = 0; m.requestJump();
      }
      this.progress.copy(m.pos); this.stuckT = 0;
    }
  }

  // Carpet search: pick an unchecked area in this bot's own lane, pushing toward the enemy side, away from teammates' goals.
  _searchGoal() {
    const g = this.game, bot = this.bot, B = g.def.bounds, mid = (B.minX + B.maxX) / 2, halfX = (B.maxX - B.minX) / 2, side = bot.team === 'alpha' ? 1 : -1;
    const intel = g.intel[bot.team], mates = g.bots.filter((b) => b !== bot && b.alive && b.team === bot.team);
    const push = clamp(0.25 + this.aggro * 0.5 + g.time / 240, 0, 1), sc0 = Math.max(1, halfX / 100);
    const patrol = g.patrol && g.patrol.length > 4 && Math.random() < 0.7 ? g.patrol : null; // waypoint patrol network (v5)
    let best = null, bs = -Infinity;
    for (let k = 0; k < 26; k++) {
      let p = null;
      if (patrol) p = pick(patrol); else { const n = g.nav.randomNode(0.18); if (!n) break; p = n.p; }
      const d = p.distanceTo(bot.motor.pos);
      if (d < 8) continue;
      const fwd = ((p.x - mid) * side) / halfX; // -1 own side … +1 enemy side
      let sc = intel.stale(p, g.time) * 1.2;                            // not searched recently
      sc -= Math.abs(p.z - this.laneZ) / ((B.maxZ - B.minZ) / 2) * 1.6; // stay in my lane
      sc -= Math.abs(fwd - (push * 1.4 - 0.5)) * 1.3;                   // how far forward I dare to go
      sc -= clamp((d - 45 * sc0) / (40 * sc0), 0, 1.5);                 // not across the whole map
      for (const m of mates) { const gl = m.ai.goal; if (gl && gl.distanceTo(p) < 14) sc -= 1.4; if (m.motor.pos.distanceTo(p) < 8) sc -= 0.6; }
      sc += Math.random() * 0.6;
      if (sc > bs) { bs = sc; best = p; }
    }
    return best;
  }

  update(dt) {
    const g = this.game, bot = this.bot;
    if (!g.canMove()) { this.wishX = this.wishZ = this.wishSpeed = 0; return; }
    this.alertT -= dt; this.meleeCd -= dt; this.coverCd -= dt; this.cornerT -= dt; this.dodgeCd -= dt; this.crouchT -= dt; this.suppressCd -= dt;
    if (this.blindT > 0) { this.blindT -= dt; this.wishX = this.wishZ = this.wishSpeed = 0; bot.yaw += Math.sin(g.time * 3 + bot.idx) * dt; bot.holdE = false; return; }
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.1; this.perceive(); g.intel[bot.team].mark(bot.motor.pos, g.time); }
    if (this.target && !this.target.alive) { this.target = null; if (this.state === 'ENGAGE' || this.state === 'MELEE' || this.state === 'COVER') { this.state = 'SEARCH'; this.searchT = rand(0.8, 1.6); this.scanBase = bot.yaw; } }
    if (this.pendingSound && this.state !== 'ENGAGE' && this.state !== 'MELEE' && this.state !== 'COVER') {
      this.pendingSound.t -= dt;
      if (this.pendingSound.t <= 0) { const s = this.pendingSound.pos; this.pendingSound = null; this.lastKnown.copy(s); this.alertT = 3; this._approach(s, 'sound'); }
    }
    if (this.lookT > 0 && this.lookYaw !== null) { this.lookT -= dt; this._turnTo(this.lookYaw, 4.5, dt); }
    const objective = g.rules.botGoal ? g.rules.botGoal(bot) : null;
    bot.holdE = false;
    const B = g.def.bounds, early = B.maxX - B.minX > 220 && g.time < 45; // big maps: teams jog out to their positions first
    const walk = CFG.bot.patrolSpeed * this.pace * (early ? 1.3 : 1), run = CFG.bot.runSpeed;

    switch (this.state) {
      case 'PATROL': {
        if (this.departT > 0) { this.departT -= dt; this.wishX = this.wishZ = this.wishSpeed = 0; this._scan(dt, 0.6); break; }
        if (objective) { this.state = 'OBJECTIVE'; this.objT = 0; break; }
        if (!this._follow(walk * (1 - this.caution * 0.18), dt, this.lookT <= 0, true)) {
          if (this.goal) { this.state = 'HOLD'; this.holdT = rand(1.0, 2.6) * (0.6 + this.caution); this.scanBase = bot.yaw; this.goal = null; }
          else {
            const mc = g.builder.mechs[0]; // v46 Sky City: sometimes take the tram across instead
            if (mc && mc.botRide && Math.random() < 0.25 && (this.ride = mc.botRide(bot))) { this.state = 'RIDE'; break; }
            const p = this._searchGoal(); if (p) this.setPath(p);
          }
        }
        break;
      }
      case 'HOLD': // reached a search point: stop and sweep the area before moving on
        this.wishX = this.wishZ = this.wishSpeed = 0; this._scan(dt, 1.1);
        this.holdT -= dt; if (this.holdT <= 0) { this.state = 'PATROL'; this.path = []; this.goal = null; }
        break;
      case 'OBJECTIVE': this._objective(objective, dt, walk, run); break;
      case 'INVESTIGATE':
        if (!this._follow(this.goalKind === 'hurt' ? run : walk * 1.1, dt, this.lookT <= 0, true)) { this.state = 'SEARCH'; this.searchT = rand(1.5, 3.2); this.scanBase = bot.yaw; }
        break;
      case 'FLANK': // wide arc to the side of the contact, then close in on it
        if (!this._follow(run * 0.88, dt, this.lookT <= 0, true)) { const f = this.flankGoal; this.flankGoal = null; this.state = 'INVESTIGATE'; if (f) this.setPath(f); }
        break;
      case 'SEARCH':
        this.wishX = this.wishZ = this.wishSpeed = 0; this._scan(dt, 1.4);
        this.searchT -= dt; if (this.searchT <= 0) { this.state = 'PATROL'; this.path = []; this.goal = null; }
        break;
      case 'RIDE': if (!this.ride || !this.ride.step(this, dt)) { this.ride = null; this.state = 'PATROL'; this.path = []; this.goal = null; } break;
      case 'MELEE': this._melee(dt); break;
      case 'ENGAGE': this._engage(dt); break;
      case 'COVER': this._cover(dt); break;
    }
    if (this.dodgeT > 0 && (this.state === 'ENGAGE' || this.state === 'COVER' || this.state === 'INVESTIGATE')) { // dodge overrides the legs, not the aim
      this.dodgeT -= dt; this.wishX = this.dodgeX; this.wishZ = this.dodgeZ; this.wishSpeed = CFG.bot.runSpeed * 0.8; // v24: was ×1.22 for 0.26–0.42 s (read as a teleport)
    }
    if (bot.motor.crouching) this.wishSpeed *= 0.45;
    this._stuckCheck(dt);
  }

  _scan(dt, width) { this.scanPhase += dt * (0.8 + this.caution * 0.6); this._turnTo(this.scanBase + Math.sin(this.scanPhase) * width, 2.6, dt); }

  // Game-mode goals (domination points, relic, extraction) — public information every player also has.
  _objective(o, dt, walk, run) {
    const bot = this.bot, m = bot.motor;
    if (!o) { this.state = 'PATROL'; this.path = []; this.goal = null; return; }
    this.objT -= dt;
    const dx = o.pos.x - m.pos.x, dz = o.pos.z - m.pos.z, dist = Math.hypot(dx, dz), inside = dist < (o.radius || 1.5) * (o.action === 'pickup' ? 1.15 : 0.8) && Math.abs(o.pos.y - m.pos.y) < 2.2;
    if (inside && o.action !== 'extract' && o.action !== 'chase') {
      this.wishX = this.wishZ = this.wishSpeed = 0; this._scan(dt, 1.3);
      if (o.action === 'capture' || o.action === 'pickup') bot.holdE = true;
      return;
    }
    if (this.objT <= 0 || !this.goal || this.goal.distanceTo(o.pos) > (o.radius || 2) + 2 || this.pathIdx >= this.path.length) {
      this.objT = 1.5; const tgt = o.pos.clone();
      if (o.action === 'capture' || o.action === 'guard') { const a = (bot.idx * 2.39) % 6.283, r = (o.radius || 3) * 0.4; tgt.x += Math.cos(a) * r; tgt.z += Math.sin(a) * r; }
      this.setPath(tgt);
    }
    this._follow(o.urgent ? run : walk * 1.15, dt, this.lookT <= 0, true);
  }

  _aimAt(t, dt) {
    const e = this.bot.eyePos(TMP_V1), tp = t.motor.pos, dx = tp.x - e.x, dz = tp.z - e.z, dy = tp.y + 1.2 - e.y;
    this.bot.aimPitch = Math.atan2(dy, Math.hypot(dx, dz));
    return { err: this._turnTo(Math.atan2(-dx, -dz), this.D.turn, dt), dist: Math.hypot(dx, dz) };
  }

  // Find a nearby nav node the target cannot see (cover), not closer to the target.
  _findCover(t) {
    const g = this.game, bot = this.bot, te = t.eyePos(new THREE.Vector3()), my = bot.motor.pos, dNow = my.distanceTo(t.motor.pos), probe = new THREE.Vector3();
    let best = null, bd = Infinity, tests = 0;
    g.nav.near(my, 7, (n) => {
      if (!n.ok || tests > 14 || Math.abs(n.p.y - my.y) > 0.6) return;
      const d = n.p.distanceTo(my); if (d < 1.2 || d > 7 || n.p.distanceTo(t.motor.pos) < dNow - 1.5 || d > bd) return;
      tests++;
      if (!g.collision.segmentClear(te, probe.set(n.p.x, n.p.y + 1.2, n.p.z))) { bd = d; best = n.p; }
    });
    return best;
  }

  _engage(dt) {
    const g = this.game, bot = this.bot, D = this.D, t = this.target;
    if (!t) { this.state = 'SEARCH'; this.searchT = 1; return; }
    this.engageT += dt;
    const { err, dist } = this._aimAt(t, dt), kind = bot.def.kind, [rMin, rMax] = PREF_RANGE[kind] || [8, 30];
    if (this.seeTarget) {
      // take cover when hurt / reloading (then peek back out)
      if (this.coverCd <= 0 && kind !== 'knife' && (bot.reloadT > 0 || (g.time - this.lastHurtT < 0.8 && bot.hp < 70) || bot.hp < 35) && Math.random() < 0.5 + this.caution * 0.4) {
        this.coverCd = 5; const c = this._findCover(t);
        if (c) { this.peekPos = bot.motor.pos.clone(); this.state = 'COVER'; this.coverT = rand(1.2, 2.4); this.setPath(c, false); return; }
      }
      if (dist > rMax && !bot.carrying) { // advance while fighting
        this.repathT -= dt;
        if (this.repathT <= 0 || this.pathIdx >= this.path.length) { this.repathT = 1.2; this.setPath(this.lastKnown, false); }
        this._follow(CFG.bot.runSpeed * 0.62, dt, false);
      } else if (dist < rMin && kind !== 'shotgun') { // too close for this weapon: back off
        const dx = bot.motor.pos.x - t.motor.pos.x, dz = bot.motor.pos.z - t.motor.pos.z, d = Math.hypot(dx, dz) || 1;
        this.wishX = dx / d; this.wishZ = dz / d; this.wishSpeed = 2.4;
      } else { // TACTICAL STRAFE while firing, orbiting toward my preferred range. v24: human rhythm — 0.8–1.8 s strides, a reversal
        // only half the time, and ~25 % planted-feet bursts (was a 0.3–0.85 s A/D jiggle reversing 72 % of the time)
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          const plant = this.strafeDir !== 0 && Math.random() < 0.25;
          this.strafeT = (plant ? rand(0.5, 1.1) : rand(0.8, 1.8)) * (kind === 'sniper' ? 1.5 : 1);
          this.strafeDir = plant ? 0 : this.lastStrafe && Math.random() < 0.5 ? this.lastStrafe : -(this.lastStrafe || (Math.random() < 0.5 ? -1 : 1));
          if (this.strafeDir) this.lastStrafe = this.strafeDir;
        }
        const sx = Math.cos(bot.yaw) * this.strafeDir, sz = -Math.sin(bot.yaw) * this.strafeDir, want = (rMin + rMax) / 2, radial = clamp((dist - want) / want, -0.45, 0.45);
        let wx = sx - Math.sin(bot.yaw) * radial, wz = sz - Math.cos(bot.yaw) * radial; const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl;
        const av = this._avoidance(wx, wz);
        this.wishX = wx + av.x; this.wishZ = wz + av.z; this.wishSpeed = this.strafeDir === 0 ? (Math.abs(radial) > 0.3 ? 1.2 : 0) : kind === 'sniper' ? 1.2 : 1.8 + D.strafe * 0.7;
      }
      this.reactT -= dt;
      if (dist < 1.4 && this.meleeCd <= 0 && this.reactT <= 0) { this.meleeCd = 1.3; if (Math.random() < 0.65) this._grab(t); }
      else if (this.reactT <= 0 && err < 0.16 && bot.reloadT <= 0) this._fireLogic(dt, dist);
    } else {
      this.wishX = this.wishZ = this.wishSpeed = 0;
      const lost = g.time - this.lastSeenT;
      if (!this.nadeChecked && lost > 0.8) { this.nadeChecked = true; this._maybeNade(); }
      if (lost > 0.9) { if (Math.random() < 0.5) this._approach(this.lastKnown.clone(), 'lost'); else { this.state = 'INVESTIGATE'; this.goalKind = 'lost'; this.setPath(this.lastKnown, false); } } // the LAST SEEN spot, not his real position
    }
  }

  _cover(dt) {
    const bot = this.bot, t = this.target;
    if (!t || !t.alive) { this.state = 'SEARCH'; this.searchT = 1; this.scanBase = bot.yaw; return; }
    if (this.pathIdx < this.path.length) { this._follow(CFG.bot.runSpeed, dt, false); this._aimAt(t, dt); if (this.seeTarget && this.reactT <= 0 && bot.reloadT <= 0) this._fireLogic(dt, bot.motor.pos.distanceTo(t.motor.pos)); return; }
    this.wishX = this.wishZ = this.wishSpeed = 0;
    this.coverT -= dt;
    if (this.coverT <= 0 && bot.reloadT <= 0) { // peek: step back out toward where the fight was
      this.state = 'ENGAGE'; this.engageT = 0; this.reactT = this.D.react * 0.6;
      if (this.peekPos) this.setPath(this.peekPos, false);
    }
  }

  _melee(dt) {
    const bot = this.bot, t = this.target;
    if (!t || !t.alive) { this.state = 'SEARCH'; this.searchT = 1; this.scanBase = bot.yaw; return; }
    const { dist } = this._aimAt(t, dt);
    this.repathT -= dt;
    if (dist > 2.4) {
      if (this.repathT <= 0 || this.pathIdx >= this.path.length) { this.repathT = 0.45; this.setPath(this.lastKnown, false); }
      if (!this._follow(CFG.bot.runSpeed * 1.25, dt, false)) { const dx = this.lastKnown.x - bot.motor.pos.x, dz = this.lastKnown.z - bot.motor.pos.z, d = Math.hypot(dx, dz) || 1; this.wishX = dx / d; this.wishZ = dz / d; this.wishSpeed = CFG.bot.runSpeed * 1.25; }
      if (dist < 6 && Math.random() < dt * 0.8) this.wantJump = true;
    } else {
      const dx = t.motor.pos.x - bot.motor.pos.x, dz = t.motor.pos.z - bot.motor.pos.z, d = Math.hypot(dx, dz) || 1;
      this.wishX = dx / d + Math.cos(bot.yaw) * this.strafeDir * 0.6; this.wishZ = dz / d - Math.sin(bot.yaw) * this.strafeDir * 0.6; this.wishSpeed = 2.4;
      if (this.meleeCd <= 0 && this.seeTarget) this._knife(t);
    }
    if (!this.seeTarget && this.game.time - this.lastSeenT > 2.5) { this.state = 'INVESTIGATE'; this.goalKind = 'lost'; this.setPath(this.lastKnown); }
  }

  _knife(t) {
    const g = this.game, bot = this.bot, heavy = Math.random() < 0.3, d = heavy ? WEAPON_DEFS.knife.stab : WEAPON_DEFS.knife.slash;
    this.meleeCd = d.interval * rand(1, 1.4) + this.D.react * 0.3;
    const eye = bot.eyePos(new THREE.Vector3()), dir = t.chestPos(new THREE.Vector3()).sub(eye).normalize();
    dir.x += rand(-0.08, 0.08) * (1 + this.D.aimErr * 10); dir.normalize();
    g.schedule(d.delay, () => {
      if (!bot.alive || !g.running) return;
      const h = g.meleeTrace(bot, eye, dir, d.range + 0.2);
      if (h && h.target) {
        const back = h.target.forward(TMP_V1).dot(TMP_V2.subVectors(h.target.motor.pos, bot.motor.pos).setY(0).normalize()) > 0.35;
        g.applyDamage(h.target, back ? (heavy ? 999 : d.dmg * 2) : d.dmg * (h.part === 'head' ? 1.5 : 1), h.part, bot, WEAPON_DEFS.knife, dir, h.point, { melee: true });
        g.audio.knifeHit(true, bot.motor.pos);
      }
    });
    bot.onAttack();
  }

  _grab(t) {
    const g = this.game, bot = this.bot, def = WEAPON_DEFS.grab;
    g.audio.knifeSwing(); bot.onAttack();
    g.schedule(0.12, () => {
      if (!bot.alive || !t.alive || !g.running) return;
      const d = Math.hypot(t.motor.pos.x - bot.motor.pos.x, t.motor.pos.z - bot.motor.pos.z);
      if (d > def.range || !g.collision.segmentClear(bot.eyePos(new THREE.Vector3()), t.chestPos(new THREE.Vector3()))) return;
      const dir = t.chestPos(new THREE.Vector3()).sub(bot.eyePos(new THREE.Vector3())).normalize();
      g.applyDamage(t, d <= def.killRange ? 999 : def.damage, 'chest', bot, def, dir, t.chestPos(new THREE.Vector3()), { melee: true });
      g.audio.knifeHit(true, bot.motor.pos);
    });
  }

  _maybeNade(force = false) {
    const bot = this.bot, g = this.game, D = this.D;
    if (g.mode !== 'general' || (!force && Math.random() > D.nade)) return;
    const type = bot.nades.he > 0 && Math.random() < 0.65 ? 'he' : bot.nades.flash > 0 ? 'flash' : null;
    if (!type) return;
    const origin = bot.eyePos(new THREE.Vector3()), tgt = this.lastKnown.clone(), dx = tgt.x - origin.x, dz = tgt.z - origin.z, d = Math.hypot(dx, dz);
    if (d < 7 || d > 30) return;
    const h = tgt.y + 0.3 - origin.y;
    let th = 0.62, den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h);
    if (den <= 0) { th = 0.95; den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h); }
    if (den <= 0) return;
    const v = Math.min(22, Math.sqrt(-CFG.gravity * d * d / den));
    const vel = new THREE.Vector3(dx / d * v * Math.cos(th), v * Math.sin(th), dz / d * v * Math.cos(th));
    bot.nades[type]--;
    g.throwGrenade(bot, WEAPON_DEFS[type], origin.addScaledVector(TMP_V1.set(dx / d, 0, dz / d), 0.4), vel);
    g.audio.mech('throw', bot.motor.pos);
  }

  _fireLogic(dt, dist) {
    const D = this.D, bot = this.bot, kind = bot.def.kind;
    if (kind === 'sniper') {
      this.settleT -= dt; this.shotT -= dt;
      if (this.settleT <= 0 && this.shotT <= 0) { this.shoot(); this.shotT = bot.def.bot.rate * rand(1, 1.4); this.settleT = D.settle * 0.5; }
      return;
    }
    if (kind === 'pistol' || kind === 'shotgun') { this.shotT -= dt; if (this.shotT <= 0) { if (kind !== 'shotgun' || dist < 16) this.shoot(); this.shotT = bot.def.bot.rate * rand(0.9, 1.4); } return; }
    if (this.burstLeft <= 0) { this.burstGapT -= dt; if (this.burstGapT <= 0) { this.burstLeft = randInt(D.burst[0], D.burst[1]) + (dist < 10 ? 2 : 0) + (kind === 'lmg' ? 3 : 0); this.shotT = 0; } return; }
    this.shotT -= dt;
    if (this.shotT <= 0) { this.shoot(); this.burstLeft--; this.shotT = bot.def.bot.rate; if (this.burstLeft <= 0) this.burstGapT = rand(D.burstGap[0], D.burstGap[1]); }
  }

  shoot() {
    const g = this.game, bot = this.bot, t = this.target, D = this.D, def = bot.def;
    if (!t || bot.ammo <= 0) return;
    const eye = bot.eyePos(new THREE.Vector3()); t.updateHitboxes();
    const r = Math.random(), hc = D.headChance * (def.kind === 'sniper' ? 1.5 : 1), c = new THREE.Vector3();
    let hb = t.hitboxes[r < hc ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3];
    // LINE OF SIGHT at the moment of firing: never shoot into a wall — try another visible hitbox or hold fire
    const clear = (b) => g.collision.segmentClear(eye, c.addVectors(b.min, b.max).multiplyScalar(0.5));
    if (!clear(hb)) { hb = [t.hitboxes[1], t.hitboxes[0], t.hitboxes[2]].find(clear); if (!hb) { this.burstLeft = 0; this.burstGapT = 0.25; return; } }
    bot.ammo--; if (bot.ammo <= 0) { bot.reloadT = def.reloadTime * rand(1, 1.3); g.audio.mech('magout', bot.motor.pos); }
    const base = new THREE.Vector3().addVectors(hb.min, hb.max).multiplyScalar(0.5).sub(eye).normalize();
    const tm = t.motor;
    const ms = bot.motor.horizontalSpeed();
    let err = D.aimErr * (1 + 1.6 * Math.exp(-this.engageT * 1.4)) * (ms > 3.6 ? 1.55 : ms > 1.5 ? 1.15 : 1); // strafing costs a little accuracy, sprinting a lot
    err *= 1 + tm.horizontalSpeed() * 0.12 + (tm.grounded ? 0 : 0.8);
    if (def.kind === 'sniper') err *= 0.55; else if (def.kind === 'pistol') err *= 1.2;
    if (tm.crouching && tm.horizontalSpeed() < 0.5) err *= 0.9;
    const rv = new THREE.Vector3(-base.z, 0, base.x).normalize(), uv = new THREE.Vector3().crossVectors(rv, base);
    const cone = (e) => { const a = Math.random() * Math.PI * 2, rr = e * Math.sqrt(Math.random()); return base.clone().addScaledVector(rv, Math.cos(a) * rr).addScaledVector(uv, Math.sin(a) * rr).normalize(); };
    let res = null;
    const n = def.pellets || 1;
    for (let i = 0; i < n; i++) { const rr = g.fireBullet(bot, eye, cone(n > 1 ? err * 0.6 + def.hipBase * 0.85 : err), def, n > 1 ? { pellet: i } : undefined); if (!res || rr.dist < res.dist) res = rr; }
    const mz = bot.muzzlePos, near = mz.distanceTo(g.camera.position) < 110;
    if (near) {
      if (!def.suppressed) g.effects.worldFlash(mz, def.kind === 'sniper' || def.kind === 'shotgun' ? 0.8 : 0.5);
      if (def.tracerEvery || def.kind === 'sniper') g.effects.tracer(mz, res.end, 330, 3, 0xffc070);
    }
    g.audio.gunshot(def.sound, mz, def.soundRate);
    g.recordShot(bot, mz, res.end, def);
    bot.spottedT = g.time;
    if (!res.hitPlayer && g.player.alive) {
      const cam = g.camera.position, tt = TMP_V1.subVectors(cam, eye).dot(base);
      if (tt > 0 && tt < res.dist) { const cl = TMP_V2.copy(eye).addScaledVector(base, tt); if (cl.distanceTo(cam) < 1.4) g.audio.flyby(cl); }
    }
    g.emitNoise(bot.motor.pos, def.noise || 30, bot.team, 'shot');
    bot.onAttack();
  }
}

// Team knowledge of which parts of the map were searched recently (drives the carpet search; contains NO enemy positions).
class TeamIntel {
  constructor(bounds) { this.cell = 12; this.B = bounds; this.seen = new Map(); }
  _k(p) { return Math.floor((p.x - this.B.minX) / this.cell) * 1000 + Math.floor((p.z - this.B.minZ) / this.cell); }
  mark(p, t) { this.seen.set(this._k(p), t); }
  stale(p, now) { const t = this.seen.get(this._k(p)); return t === undefined ? 1 : clamp((now - t) / 60, 0, 1); }
}
