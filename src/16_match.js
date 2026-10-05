/* =====================================================================
   MATCH — one game session: world, lighting/IBL, teams, combat,
   scoring, grenades, freeze time. All mode-specific logic lives in
   the Rule state machine (TDM / Elimination / Relic / Domination).
   ===================================================================== */
class Match {
  constructor(app, config) {
    this.app = app; this.config = config; this.def = MAPS[config.map]; this.mode = config.mode; this.rule = config.rule;
    this.audio = app.audio; this.time = 0; this.running = false; this.phase = 'loading';
    this.rules = createRule(config.rule, this);
    const rc = (config.ruleCfg && config.ruleCfg[config.rule]) || RULES[config.rule].def;
    this.target = rc.target; this.roundTime = RULES[config.rule].timeUnit === 'sec' ? rc.time : 0;
    this.timeLeft = RULES[config.rule].timeUnit === 'sec' ? rc.time : rc.time ? rc.time * 60 : Infinity; // v45: score modes have no time limit
    this.opts = Object.assign({ pickup: true, killcam: true, ff: false }, config.opts); // room 設置: weapon pickup, killcam, friendly fire
    this.score = { alpha: 0, bravo: 0 }; this.roundWins = { alpha: 0, bravo: 0 }; this.round = 0;
    this.stats = { shots: 0, hits: 0 }; this.firstBlood = true; this.acc = 0; this.spotT = 0; this.freezeT = 0; this.roundEndT = 0;
    this.grenades = []; this.combatants = []; this.bots = []; this.timers = [];
    this.rec = { frames: [], shots: [], last: -9 }; this.kc = null; // v13 killcam
    this.loadoutIndex = clamp(config.loadout | 0, 0, 4); this.nextSpawnLoadoutIndex = null; this.lastHitSnd = 0;
    this.intel = { alpha: new TeamIntel(this.def.bounds), bravo: new TeamIntel(this.def.bounds) };
    this.drops = []; this.dropSeq = 0; this.pickTarget = null;
    this.net = null; this.humans = []; this.netSeq = 0; // v25: NetHost / NetClient session, remote humans (host)
  }
  get isClient() { return !!this.net && this.net.role === 'client'; }

  // Game-time scheduler (pauses with the game, unlike setTimeout).
  schedule(delay, fn) { this.timers.push({ t: this.time + delay, fn }); }
  runTimers() { if (!this.timers.length) return; const due = this.timers.filter((x) => x.t <= this.time); if (!due.length) return; this.timers = this.timers.filter((x) => x.t > this.time); for (const x of due) x.fn(); }

  canMove() { return this.phase === 'live' || this.phase === 'roundEnd'; }
  canAct() { return this.phase === 'live'; }
  aliveCount(team) { let n = 0; for (const c of this.combatants) if (c.team === team && c.alive) n++; return n; }
  // Team points go through the rule (Domination lock-out: no points at all while the enemy holds every zone).
  addTeam(team, pts) { if (!this.rules.canScore(team)) return false; this.score[team] += pts; return true; }

  async build(progress) {
    const app = this.app, def = this.def;
    progress(0.04, '生成 PBR 材質');
    await nextFrame();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(Settings.data.fov, innerWidth / innerHeight, 0.05, 600); this.camera.rotation.order = 'YXZ';
    this.collision = new CollisionWorld(); this.physics = new PhysicsWorld(this.scene, this.audio);
    this.builder = new MapBuilder(this, def);
    progress(0.12, '建構地圖幾何'); await nextFrame();
    if (def.preload) await def.preload(); // v44: maps with Blender visuals (GLB) load them before building the colliders
    def.build(this.builder); this.builder.flush(); this.builder.bakeContactAO();
    progress(0.38, '載入 HDRI 環境光'); await nextFrame();
    this.setupLighting();
    await this.setupEnvironment();
    progress(0.56, '計算 Bot 導航網格'); await nextFrame();
    this.nav = new NavGraph(this.collision, this.builder, def);
    // v5 patrol network: designer waypoints snapped onto reachable nav nodes (bots patrol these until they see / hear something)
    this.patrol = this.builder.waypoints.map((p) => this.nav.snap(p, 8)).filter((p) => { const n = this.nav.nearest(p, false); return n && n.p.distanceTo(p) < 3; });
    progress(0.7, '部署部隊'); await nextFrame();
    this.effects = new Effects(this.scene, app.tex, this.audio);
    this.player = new Player(this);
    if (this.isClient) this.player.team = this.net.team === 'bravo' ? 'bravo' : 'alpha'; // a client plays on his room team, with no bots of its own
    await loadGunModels(); // v45 Blender gun models (GLB) must be parsed before the viewmodels are built
    this.weapons = new WeaponSystem(this, loadoutDefs(this.mode, Settings.data.loadouts[this.loadoutIndex])); this.weapons.setEnvironment(this.vmEnv || this.scene.environment);
    this.combatants.push(this.player);
    if (!this.isClient) {
      for (let i = 0; i < this.config.allies - 1; i++) this.bots.push(new Bot(this, 'alpha', i, this.botWeapon()));
      for (let i = 0; i < this.config.enemies; i++) this.bots.push(new Bot(this, 'bravo', i, this.botWeapon()));
    }
    this.combatants.push(...this.bots);
    this.combatants.forEach((c, i) => { c.netId = i + 1; }); this.netSeq = this.combatants.length; // v25: stable ids (network snapshots, seeded spread)
    this.spawns = { alpha: this.makeSpawns('alpha'), bravo: this.makeSpawns('bravo') };
    this.spawnLOS = this.checkSpawnLOS(); window.__debug = Object.assign(window.__debug || {}, { map: def.id, spawnLOS: this.spawnLOS.visible > 0, spawnLOSPairs: this.spawnLOS });
    this.playerModel = app.soldiers.create(this.player.team, 'm4'); this.playerModel.root.visible = false; this.scene.add(this.playerModel.root); // third-person you, for killcams
    this.rules.init();
    const proxy = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 10), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    proxy.castShadow = true; proxy.userData.noAO = true; this.scene.add(proxy); this.shadowProxy = proxy;
    this.applyEnvIntensity();
    progress(0.84, '編譯著色器'); await nextFrame();
    app.post.configure(this, activeQuality());
    if (this.isClient) { this.round = 1; this.rules.startRound(); } else this.startRound(); // v27: a client attaches once the host's match takes him in (App.startMatch)
    this.player.updateCamera(1); this.weapons.update(0, app.input, { x: 0, y: 0 });
    if (app.renderer.compileAsync) { await app.renderer.compileAsync(this.scene, this.camera); await app.renderer.compileAsync(this.weapons.scene, this.weapons.camera); }
    else { app.renderer.compile(this.scene, this.camera); app.renderer.compile(this.weapons.scene, this.weapons.camera); }
    app.post.render(0.016, true);
    progress(1, '準備完成');
    this.running = true;
  }

  botWeapon() { return pick(BOT_POOLS[this.mode] || BOT_POOLS.general); }

  setupLighting() {
    const def = this.def, B = def.bounds, cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    this.hemi = new THREE.HemisphereLight(def.hemi[0], def.hemi[1], def.hemi[2]); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(def.sun.color, def.sun.intensity);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
    this.sunCenter = new THREE.Vector3(cx, 0, cz);
    this.setSunDir(new THREE.Vector3(...def.sun.pos).normalize());
    this.scene.add(sun, sun.target);
    this.scene.fog = new THREE.Fog(def.fog.color, def.fog.near, def.fog.far);
    this.app.renderer.toneMappingExposure = def.exposure;
  }

  setSunDir(dir) {
    const B = this.def.bounds, R = this.def.shadowFollow || Math.hypot(B.maxX - B.minX, B.maxZ - B.minZ) / 2 + 4, sun = this.sun;
    if (dir.y < 0.25) { dir.y = 0.25; dir.normalize(); }
    sun.position.copy(this.sunCenter).addScaledVector(dir, 140); sun.target.position.copy(this.sunCenter); sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 20; sc.far = 300; sc.updateProjectionMatrix();
    this.sunDir = dir.clone(); this.shadowR = R;
  }
  // Big maps: the shadow frustum follows the camera, snapped to shadow texels in light space (no shimmering).
  followShadow() {
    if (!this.def.shadowFollow) return;
    const d = this.sunDir, right = TMP_V1.set(0, 1, 0).cross(d).normalize(), up = TMP_V2.crossVectors(d, right).normalize(), c = this.camera.position;
    const texel = (2 * this.shadowR) / this.sun.shadow.mapSize.x, r = Math.round(c.dot(right) / texel) * texel, u = Math.round(c.dot(up) / texel) * texel;
    const center = TMP_V3.copy(right).multiplyScalar(r).addScaledVector(up, u).addScaledVector(d, c.dot(d));
    this.sun.position.copy(center).addScaledVector(d, 140); this.sun.target.position.copy(center); this.sun.target.updateMatrixWorld();
  }

  async setupEnvironment() {
    const app = this.app, def = this.def;
    let hdr = null;
    if (Settings.data.hdri && def.hdri) hdr = await app.loadHDR(def.hdri);
    if (hdr) {
      this.scene.environment = hdr.env; this.vmEnv = hdr.vmEnv;
      if (def.hdriBackground) { this.scene.background = hdr.tex; this.scene.backgroundIntensity = def.bgIntensity ?? 1; }
      if (def.sun.auto && hdr.sunDir) this.setSunDir(hdr.sunDir.clone());
    } else if (!def.indoor) {
      const sky = new Sky(); sky.scale.setScalar(4000);
      const u = sky.material.uniforms, s = def.sky || {};
      u.turbidity.value = s.turbidity ?? 6; u.rayleigh.value = s.rayleigh ?? 1.5; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
      const phi = THREE.MathUtils.degToRad(90 - (s.elevation ?? 40)), th = THREE.MathUtils.degToRad(s.azimuth ?? 180), sd = new THREE.Vector3().setFromSphericalCoords(1, phi, th);
      u.sunPosition.value.copy(sd); this.scene.add(sky); this.sky = sky;
      const skyScene = new THREE.Scene(), sky2 = new Sky(); sky2.scale.setScalar(4000); sky2.material.uniforms.sunPosition.value.copy(sd);
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
      skyScene.add(sky2); this.envRT = app.pmrem.fromScene(skyScene, 0, 0.1, 5000); this.scene.environment = this.envRT.texture;
      if (def.sun.auto) this.setSunDir(sd.clone());
    } else {
      this.envRT = app.pmrem.fromScene(new RoomEnvironment(), 0.04); this.scene.environment = this.envRT.texture;
    }
    if (!this.scene.background) this.scene.background = new THREE.Color(def.background ?? 0x15181b);
    this.envTex = this.scene.environment; // kept so the low preset can drop world IBL and restore it later
    this.envK = hdr ? def.envIntensity : Math.max(0.6, def.envIntensity);
  }

  // Scale image-based lighting on every material (world, soldiers, viewmodel) so HDRI skies with a baked sun do not double-light the scene.
  applyEnvIntensity() {
    const k = this.envK, seen = new Set();
    const set = (m, mul) => { if (!m || seen.has(m) || !('envMapIntensity' in m)) return; seen.add(m); if (m.userData.env === undefined) m.userData.env = m.envMapIntensity || 1; m.envMapIntensity = m.userData.env * k * mul; };
    this.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => set(m, 1)); });
    // viewmodel: reflections normalised to the same average brightness on every map (v19) — dark gun metal still reads as metal on dim maps
    // (up to ×2.2, the v16 value) but no longer turns chrome-white under bright HDRI skies (harbor sunset was ×4 brighter than desert)
    const ml = this.vmEnv && this.vmEnv.userData.meanLum, vmMul = ml ? clamp(0.2 / (ml * k), 0.6, 2.2) : 2.2;
    this.weapons.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => set(m, vmMul)); });
  }

  _zonePoints(z) {
    const pts = [];
    for (let x = z.x0 + 0.6; x <= z.x1 - 0.6; x += 1.15) for (let zz = z.z0 + 0.6; zz <= z.z1 - 0.6; zz += 1.15) {
      const base = this.collision.terrain ? this.collision.terrain.heightAt(x, zz) : 0, g = this.collision.groundBelow(x, base + 1.5, zz, 0.3, 3, 0);
      if (g && g.y < base + 0.5 && !g.steep && this.collision.fits(x, g.y + 0.05, zz, 0.42, 1.8)) { const p = new THREE.Vector3(x, g.y, zz); p.spawnYaw = z.yaw; pts.push(p); }
    }
    return pts;
  }
  makeSpawns(team) {
    const fz = (this.builder.fwdZones && this.builder.fwdZones[team]) || [];
    this.fwdSpawns = this.fwdSpawns || {};
    this.fwdSpawns[team] = fz.map((z) => ({ pts: this._zonePoints(z), c: new THREE.Vector3((z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2), yaw: z.yaw })).filter((f) => f.pts.length);
    for (const f of this.fwdSpawns[team]) f.c.y = f.pts[0].y;
    const z = this.builder.zones[team], pts = [];
    for (let x = z.x0 + 0.6; x <= z.x1 - 0.6; x += 1.15) for (let zz = z.z0 + 0.6; zz <= z.z1 - 0.6; zz += 1.15) {
      const base = this.collision.terrain ? this.collision.terrain.heightAt(x, zz) : 0, g = this.collision.groundBelow(x, base + 1.5, zz, 0.3, 3, 0);
      if (g && g.y < base + 0.5 && !g.steep && this.collision.fits(x, g.y + 0.05, zz, 0.42, 1.8)) pts.push(new THREE.Vector3(x, g.y, zz));
    }
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    return { pts, yaw: z.yaw };
  }

  // CLAUDE.md §4.8: eye-to-eye rays between enemy main spawn zones (standing eye height). Any clear pair = error for tools/check.mjs.
  checkSpawnLOS() {
    const pick = (pts) => pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 16)) === 0).slice(0, 16), A = pick(this.spawns.alpha.pts), B = pick(this.spawns.bravo.pts);
    const a = new THREE.Vector3(), b = new THREE.Vector3(); let visible = 0, minDist = Infinity;
    for (const p of A) for (const q of B) {
      a.set(p.x, p.y + 1.6, p.z); b.set(q.x, q.y + 1.6, q.z); minDist = Math.min(minDist, a.distanceTo(b));
      if (this.collision.segmentClear(a, b)) visible++;
    }
    return { visible, pairs: A.length * B.length, minDist: Math.round(minDist) };
  }

  // v11 COD-style forward spawn: in respawn modes on big maps, respawn at the safest forward zone nearest the team's fight
  // (no enemy within 45 m, no enemy line of sight to it); otherwise the main base.
  _forwardZone(team) {
    const F = this.fwdSpawns && this.fwdSpawns[team];
    if (!F || !F.length || !this.rules.respawns || this.rules.attack || this.phase !== 'live') return null;
    const mates = this.combatants.filter((c) => c.alive && c.team === team), foes = this.combatants.filter((c) => c.alive && c.team !== team);
    if (!mates.length) return null;
    const cen = new THREE.Vector3(); for (const c of mates) cen.add(c.motor.pos); cen.divideScalar(mates.length);
    const main = this.spawns[team].pts[0], eye = new THREE.Vector3(), tgt = new THREE.Vector3();
    let best = null, bd = main ? Math.hypot(main.x - cen.x, main.z - cen.z) - 12 : Infinity;
    for (const f of F) {
      const d = Math.hypot(f.c.x - cen.x, f.c.z - cen.z); if (d >= bd) continue;
      let safe = true;
      for (const e of foes) {
        const de = e.motor.pos.distanceTo(f.c); if (de < 45) { safe = false; break; }
        if (de < 110 && this.collision.segmentClear(e.eyePos(eye), tgt.set(f.c.x, f.c.y + 1.6, f.c.z))) { safe = false; break; }
      }
      if (safe) { best = f; bd = d; }
    }
    return best;
  }
  pickSpawn(team, taken = [], forward = true) {
    const fw = forward ? this._forwardZone(team) : null, S = fw || this.spawns[team];
    let best = S.pts[0], bestScore = -Infinity;
    for (const p of S.pts) {
      let enemy = 99, mate = 99;
      for (const c of this.combatants) { if (!c.alive) continue; const d = c.motor.pos.distanceTo(p); if (c.team !== team) enemy = Math.min(enemy, d); else mate = Math.min(mate, d); }
      for (const t of taken) mate = Math.min(mate, t.distanceTo(p));
      const score = Math.min(enemy, 40) + (mate < 0.95 ? -100 : 0) + Math.random() * 2;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  startRound() {
    this.round++;
    for (const n of this.grenades) this.physics.remove(n.dyn);
    this.grenades.length = 0;
    for (const s of this.effects.smokes) s.dispose(); this.effects.smokes.length = 0;
    while (this.drops.length) this.removeDrop(this.drops[0]);
    const taken = [], rb = this.rules.roundBased;
    this.player.setSpectate(null);
    for (const c of this.combatants) c.alive = false;
    for (const c of this.combatants) {
      const p = this.pickSpawn(c.team, taken, false); taken.push(p);
      if (c.isBot && rb) c.setWeapon(this.botWeapon()); // (friends keep their own loadout)
      c.respawn(p, this.spawns[c.team].yaw);
      c.spawnProtect = rb ? 0 : CFG.spawnProtect;
    }
    this.rules.startRound();
    this.phase = 'freeze'; this.freezeT = FREEZE_TIME;
    if (rb) this.timeLeft = this.roundTime;
    const hud = this.app.hud; hud.showDeath(false); hud.spectate(null); hud.roundBanner(null);
    if (this.net && this.net.role === 'host') this.net.onRound('start', this.round);
  }
  // v29 client: the host started round n (it already respawned everyone — our soldier comes back through the snapshot)
  clientRoundStart(n) {
    this.round = n;
    for (const g of this.grenades) this.physics.remove(g.dyn);
    this.grenades.length = 0;
    for (const s of this.effects.smokes) s.dispose(); this.effects.smokes.length = 0;
    while (this.drops.length) this.removeDrop(this.drops[0]);
    this.player.setSpectate(null); this.rules.startRound();
    const hud = this.app.hud; hud.showDeath(false); hud.spectate(null); hud.roundBanner(null);
  }
  clientRoundEnd(winner, reason) { this._roundBanner(winner, reason); }

  /* ------------------------------ combat ------------------------------ */
  // Hitscan through the whole intersection list: penetrable cover (wood, glass) weakens the round,
  // and high-penetration weapons carry on THROUGH bodies (sniper: two bodies at -50% each → collateral kills).
  fireBullet(shooter, origin, dir, def, opts = {}) {
    const range = def.range || 150, pellet = opts.pellet !== undefined;
    const hits = this.collision.raycastAll(origin, dir, range);
    for (const h of hits) h.type = 'world';
    const rew = shooter.isNet && this.net && this.net.rewind ? this.net.rewind(shooter) : null; // v29: a friend's shot sees what he saw
    for (const c of this.combatants) {
      if (!c.alive || c === shooter || (c.team === shooter.team && !this.opts.ff)) continue;
      const to = TMP_V1.subVectors(c.motor.pos, origin), t = to.dot(dir);
      if (t < 0 || t > range + 2) continue;
      const cx = origin.x + dir.x * t - c.motor.pos.x, cz = origin.z + dir.z * t - c.motor.pos.z;
      if (cx * cx + cz * cz > 4) continue;
      c.updateHitboxes();
      let best = null;
      for (const hb of c.hitboxes) { const r = CollisionWorld.rayBox(origin, dir, hb, range); if (r && (!best || r.t < best.t)) best = { type: 'target', t: r.t, part: hb.part, target: c }; }
      if (best) hits.push(best);
    }
    if (rew) this.net.restore(rew);
    hits.sort((a, b) => a.t - b.t);
    if (shooter.isPlayer && (!pellet || opts.pellet === 0)) this.stats.shots++;
    let power = Math.max(1, def.penetration || 0), bodies = def.kind === 'sniper' ? 2 : def.kind === 'lmg' ? 1 : 0, mult = 1, endT = range, hitPlayer = false, kills = 0; let walls = 0, passed = 0;
    const cam = this.camera.position, loudShooter = shooter.isPlayer || origin.distanceTo(cam) < 45, fx = !pellet || opts.pellet < 3;
    for (const h of hits) {
      if (h.type === 'world') {
        const near = loudShooter || h.point.distanceTo(cam) < 30;
        if (near && fx) this.effects.impact(h, !pellet || opts.pellet === 0);
        if (h.material === 'glass') { mult *= 0.92; continue; }
        if (h.penetrable && power > 0) { power--; mult *= 0.5; walls++; continue; } // §4.2: thin walls (wood, partitions) ×0.5; concrete / rock / containers stop the round
        endT = h.t; break;
      }
      const point = origin.clone().addScaledVector(dir, h.t);
      if (h.target.spawnProtect > 0) {
        this.effects.shield(point);
        if (shooter.isPlayer) { this.app.hud.hitmarker('shield'); this.audio.hit('shield'); }
        endT = h.t; break;
      }
      const wasAlive = h.target.alive;
      this.applyDamage(h.target, calcDamage(def, h.part, h.t, mult), h.part, shooter, def, dir, point, { collateral: kills > 0, wall: walls > 0, pierce: passed > 0 });
      if (h.target.isPlayer) hitPlayer = true;
      if (wasAlive && !h.target.alive) kills++;
      if (bodies > 0) { bodies--; mult *= 0.5; passed++; continue; } // bullet keeps going with half its damage
      endT = h.t; break;
    }
    if (kills >= 2 && shooter.isPlayer) { this.app.hud.announce('COLLATERAL', '一槍雙殺'); this.app.speak('collateral'); }
    // v8 near-miss suppression: a round cracking past within ~1.4 m alerts the bot / makes it dodge, not only hits
    if (!pellet || opts.pellet === 0) for (const c of this.combatants) {
      if (!c.alive || !c.ai || c.team === shooter.team) continue;
      const cp = TMP_V2.set(c.motor.pos.x, c.motor.pos.y + 1.2, c.motor.pos.z), t = TMP_V3.subVectors(cp, origin).dot(dir);
      if (t < 1 || t > endT + 0.5) continue;
      const d2 = TMP_V3.copy(origin).addScaledVector(dir, t).distanceToSquared(cp);
      if (d2 < 1.96) c.ai.onSuppressed(origin);
    }
    return { end: origin.clone().addScaledVector(dir, endT), dist: endT, hitPlayer };
  }

  // v25: muzzle flash, tracer and positional gunshot for a shot fired by anyone but the local player (remote humans)
  thirdPersonShot(shooter, def, from, to, n = 1) {
    if (from.distanceTo(this.camera.position) < 110) {
      if (!def.suppressed) this.effects.worldFlash(from, def.kind === 'sniper' || def.kind === 'shotgun' ? 0.8 : 0.5);
      if (def.kind === 'sniper' || (def.tracerEvery && n % def.tracerEvery === 0)) this.effects.tracer(from, to, 330, 3, 0xffc070);
    }
    this.audio.gunshot(def.sound, from, def.soundRate);
  }

  meleeTrace(shooter, origin, dir, range) {
    const w = this.collision.raycast(origin, dir, range);
    let best = w ? Object.assign(w, { world: true }) : null;
    const rew = shooter.isNet && this.net && this.net.rewind ? this.net.rewind(shooter) : null;
    for (const c of this.combatants) {
      if (!c.alive || c === shooter || (c.team === shooter.team && !this.opts.ff)) continue;
      if (c.motor.pos.distanceTo(origin) > range + 1.5) continue;
      c.updateHitboxes();
      for (const hb of c.hitboxes) { const h = CollisionWorld.rayBox(origin, dir, hb, range); if (h && (!best || h.t < best.t)) best = { t: h.t, target: c, part: hb.part, point: origin.clone().addScaledVector(dir, h.t) }; }
    }
    if (rew) this.net.restore(rew);
    return best;
  }

  applyDamage(victim, dmg, part, attacker, def, dir, point, opts = {}) {
    if (this.isClient) return false; // v25: the host decides every hit and reports back hit markers / damage
    if (!victim.alive || this.phase !== 'live') return false;
    if (attacker && attacker !== victim && attacker.team === victim.team && !this.opts.ff) return false; // friendly fire (room option, off by default)
    if (victim.spawnProtect > 0) { if (point) this.effects.shield(point); if (attacker && attacker.isPlayer) { this.app.hud.hitmarker('shield'); this.audio.hit('shield'); } if (attacker && this.net) this.net.onHit(attacker, victim, 'shield', point); return false; }
    if (attacker && attacker.isPlayer && attacker.team !== victim.team) { const dd = attacker.dmgDone || (attacker.dmgDone = new Map()); dd.set(victim, (dd.get(victim) || 0) + Math.min(dmg, Math.max(0, victim.hp))); } // v34 Tab board: damage per enemy
    victim.hp -= dmg; victim.lastPart = part;
    if (attacker && attacker !== victim && this.net) this.net.onHit(attacker, victim, victim.hp <= 0 ? 'kill' : part === 'head' ? 'head' : 'body', point);
    if (attacker && attacker !== victim) { const rec = victim.damageLog.get(attacker) || { amt: 0, t: 0 }; rec.amt += dmg; rec.t = this.time; victim.damageLog.set(attacker, rec); }
    if (point && dir) { this.effects.blood(point, dir, part === 'head' ? 18 : 10); if (part === 'head' && def.kind !== 'knife' && def.kind !== 'grab' && point.distanceTo(this.camera.position) < 90) this.effects.helmetSpark(point, dir); }
    if (victim.flinch && dir) victim.flinch(part, dir, dmg);
    if (attacker && attacker.isPlayer && victim !== attacker) {
      this.stats.hits++;
      const kind = victim.hp <= 0 ? 'kill' : part === 'head' ? 'head' : 'body';
      if (kind !== 'body' || this.time - this.lastHitSnd > 0.04) { this.audio.hit(kind); this.lastHitSnd = this.time; } // pellets: one tick per blast
      this.app.hud.hitmarker(kind);
    }
    if (!victim.isPlayer && victim.team !== this.player.team) victim.spottedT = this.time;
    victim.onDamaged(dmg, attacker, attacker ? attacker.motor.pos : (point || victim.motor.pos));
    if (victim.hp <= 0) this.onKill(victim, attacker, def, part, dir || new THREE.Vector3(0, 0, 1), opts);
    return true;
  }

  /* ------------------------------ v13 KILLCAM ------------------------------ */
  // 20 Hz ring buffer (last 5.5 s) of every soldier's pose + every visible shot.
  _record() {
    const R = this.rec; if (this.time - R.last < 0.05) return; R.last = this.time;
    const f = new Float32Array(this.combatants.length * 7);
    this.combatants.forEach((c, i) => { const p = c.isPlayer ? c.renderPos : c.model.root.position; f[i * 7] = p.x; f[i * 7 + 1] = p.y; f[i * 7 + 2] = p.z; f[i * 7 + 3] = c.yaw; f[i * 7 + 4] = c.isPlayer ? c.pitch : c.aimPitch; f[i * 7 + 5] = c.motor.crouching ? 1 : 0; f[i * 7 + 6] = c.alive ? 1 : 0; });
    R.frames.push({ t: this.time, f }); while (R.frames.length && this.time - R.frames[0].t > 5.5) R.frames.shift();
    while (R.shots.length && this.time - R.shots[0].t > 5.5) R.shots.shift();
  }
  recordShot(shooter, from, to, def) { if (this.net && this.net.role === 'host') this.net.onShot(shooter, from, to, def); if (!this.kc || this.kc.t === null) this.rec.shots.push({ t: this.time, i: this.combatants.indexOf(shooter), from: from.clone(), to: to.clone(), def }); }
  _startKillcam(killer, def) {
    if (Settings.data.killcam === false || this.isClient || !killer || killer.isPlayer || !this.rules.respawns || this.rec.frames.length < 20) return;
    const t0 = Math.max(this.rec.frames[0].t, this.time - 3.2), t1 = this.time + 0.35;
    this.kc = { killer, ki: this.combatants.indexOf(killer), def, t: null, t0, t1, delay: 0.9, shotIdx: 0, phase: [] };
    const pw = this.weapons.weapons.find((w) => w.def.slot === 'primary') || this.weapons.current;
    try { this.app.soldiers.setWeapon(this.playerModel, pw.def.model || pw.def.id); } catch (e) { /* keep the default rifle */ }
    this.player.respawnT = Math.max(this.player.respawnT, 0.9 + (t1 - t0) + 0.35);
  }
  _killcam(dt) {
    const K = this.kc, p = this.player, cam = this.camera;
    if (p.alive || this.phase !== 'live') { this._endKillcam(false); return; }
    if (K.delay > 0) { K.delay -= dt; return; } // let the death fall play first
    const F = this.rec.frames;
    if (K.t === null) { K.t = K.t0; this.app.hud.killcam(true, K.killer.name, K.def); for (const d of this.physics.dynamics) if (d.corpse && d.mesh) d.mesh.visible = false; }
    K.t += dt;
    if (K.t >= K.t1 || F.length < 2) { this._endKillcam(true); return; }
    let i = 1; while (i < F.length - 1 && F[i].t < K.t) i++;
    const a = F[i - 1], b = F[i], k = clamp((K.t - a.t) / Math.max(1e-3, b.t - a.t), 0, 1);
    this.combatants.forEach((c, ci) => {
      const o = ci * 7, M = c.isPlayer ? this.playerModel : c.model, alive = (k < 0.5 ? a : b).f[o + 6] > 0.5;
      M.root.visible = alive; if (c.tag) c.tag.visible = false; if (c.glint) c.glint.visible = false;
      if (!alive) return;
      const x = lerp(a.f[o], b.f[o], k), y = lerp(a.f[o + 1], b.f[o + 1], k), z = lerp(a.f[o + 2], b.f[o + 2], k), yaw = a.f[o + 3] + wrapAngle(b.f[o + 3] - a.f[o + 3]) * k, pit = lerp(a.f[o + 4], b.f[o + 4], k), cr = b.f[o + 5];
      M.root.position.set(x, y, z); M.root.rotation.y = yaw; M.arms.rotation.x = pit; M.head.rotation.x = pit * 0.6; M.head.visible = true;
      const sp = Math.hypot(b.f[o] - a.f[o], b.f[o + 2] - a.f[o + 2]) / Math.max(1e-3, b.t - a.t), amp = clamp(sp / 4.5, 0, 1);
      K.phase[ci] = (K.phase[ci] || 0) + dt * sp * 2.4; const sw = Math.sin(K.phase[ci]) * amp * 0.7;
      M.legs[0].hip.rotation.x = cr ? 0.12 : sw; M.legs[1].hip.rotation.x = cr ? 1.45 : -sw;
      M.legs[0].knee.rotation.x = cr ? -1.62 : Math.max(0, -Math.sin(K.phase[ci])) * amp * 0.9; M.legs[1].knee.rotation.x = cr ? -1.45 : Math.max(0, Math.sin(K.phase[ci])) * amp * 0.9;
      const hy = cr ? 0.52 : 0.92; M.legs[0].hip.position.y = M.legs[1].hip.position.y = hy; M.torso.position.y = hy; M.torso.rotation.set(0, 0, 0);
    });
    // over the killer's shoulder, looking where he aimed
    const o = K.ki * 7, kx = lerp(a.f[o], b.f[o], k), ky = lerp(a.f[o + 1], b.f[o + 1], k) + (b.f[o + 5] ? 1.06 : 1.64), kz = lerp(a.f[o + 2], b.f[o + 2], k);
    const yaw = a.f[o + 3] + wrapAngle(b.f[o + 3] - a.f[o + 3]) * k, pit = lerp(a.f[o + 4], b.f[o + 4], k), cp = Math.cos(pit);
    const fx = -Math.sin(yaw) * cp, fy = Math.sin(pit), fz = -Math.cos(yaw) * cp, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    cam.position.set(kx - fx * 1.8 + rx * 0.72, ky - fy * 1.8 + 0.32, kz - fz * 1.8 + rz * 0.72);
    cam.lookAt(kx + fx * 30, ky + fy * 30, kz + fz * 30); cam.updateMatrixWorld();
    const S = this.rec.shots;
    while (K.shotIdx < S.length && S[K.shotIdx].t <= K.t) {
      const s = S[K.shotIdx++]; if (s.t < K.t0) continue;
      this.effects.tracer(s.from, s.to, 400, 3.5, 0xffc070); this.effects.worldFlash(s.from, 0.6);
      if (s.i === K.ki) this.audio.gunshot(s.def.sound, s.from, s.def.soundRate);
    }
  }
  _endKillcam(skipped) {
    const K = this.kc; if (!K) return; this.kc = null;
    this.app.hud.killcam(false); this.app.hud.el.root.classList.remove('kcHide');
    this.playerModel.root.visible = false;
    for (const b of this.bots) { b.model.root.visible = b.alive; if (b.alive) { b.model.head.visible = true; } }
    for (const d of this.physics.dynamics) if (d.corpse && d.mesh) d.mesh.visible = true;
    const p = this.player;
    if (!p.alive && K.t !== null) p.respawnT = Math.min(p.respawnT, Math.max(0.3, CFG.respawn - p.deathT));
  }

  _killPoints(def, head) { return def.kind === 'knife' || def.kind === 'grab' ? POINTS.knife : def.kind === 'grenade' ? POINTS.grenade : head ? POINTS.head : POINTS.body; }
  _die(victim, killer, def, dir) { if (victim.isPlayer) victim.die(killer); else victim.die(dir, def.kind === 'sniper' ? 5.5 : def.kind === 'grenade' ? 7 : def.kind === 'knife' ? 1.5 : def.kind === 'shotgun' ? 4 : 2.6); }
  // your kill: points popup, multi-kill / streak / headshot announcer
  _killAnnounce(def, head, pts, opts, victim) {
    const hud = this.app.hud, p = this.player, ws = this.weapons;
    p.streak++; p.multi = this.time - p.lastKillT < 4 ? p.multi + 1 : 1; p.lastKillT = this.time; p.lastVictim = victim;
    hud.points(`+${pts}  ${def.kind === 'knife' ? '刀殺' : def.kind === 'grab' ? '擒拿擊殺' : def.kind === 'grenade' ? '手榴彈擊殺' : head ? '爆頭' : '擊殺'}${opts.collateral ? ' · 穿透' : ''}`);
    // v34 SF2 kill emblems — the strongest one first, then the extras
    const E = [], d = victim ? Math.hypot(victim.motor.pos.x - p.motor.pos.x, victim.motor.pos.z - p.motor.pos.z) : 0, gun = def.kind !== 'knife' && def.kind !== 'grab' && def.kind !== 'grenade';
    if (p.multi >= 2) E.push(['double', 'multi', 'specialist', 'specialforce'][Math.min(p.multi - 2, 3)]);
    if (def.kind === 'grenade') E.push('grenade');
    else if (def.kind === 'knife') { const f = victim ? TMP_V1.set(-Math.sin(victim.yaw), 0, -Math.cos(victim.yaw)) : null, b = victim ? TMP_V2.set(p.motor.pos.x - victim.motor.pos.x, 0, p.motor.pos.z - victim.motor.pos.z).normalize() : null; E.push(f && f.dot(b) < -0.707 ? 'slash' : 'knife'); }
    else if (def.kind === 'grab') E.push('grab');
    else E.push(head ? 'headshot' : 'kill');
    if (this.firstBlood) E.push('first');
    if (victim && p.lastKiller === victim) { E.push('revenge'); p.lastKiller = null; }
    if ((p.deathRun || 0) >= 3) E.push('welcome');
    if (gun && ws.current.def === def && ws.current.ammo === 0) E.push('lastshot');
    if (gun && def.kind === 'sniper' && ws.scopedIn && ws.clock - (ws.scopeAt ?? -9) < 0.4) E.push('fastzoom');
    if (gun && d > (def.kind === 'sniper' ? 60 : 40)) E.push('longshot');
    if (opts.wall) E.push('wall');
    if (opts.pierce || opts.collateral) E.push('pierce');
    p.deathRun = 0;
    if (!this.isClient && Math.random() < 0.06) { p.score += 100; setTimeout(() => hud.lucky(100), 900); } // SF2 'Lucky Point': a random bonus on a kill
    for (const id of E.slice(0, 4)) hud.emblem(id);
    if (victim) hud.killNote(victim.name, E.find((x) => x === 'headshot' || x === 'grenade' || x === 'slash' || x === 'knife' || x === 'grab') || 'kill');
    p.emblems = p.emblems || {}; for (const id of E) p.emblems[id] = (p.emblems[id] || 0) + 1;
    const streaks = { 5: 'KILLING SPREE', 8: 'RAMPAGE', 12: 'UNSTOPPABLE', 16: 'GODLIKE' };
    if (streaks[p.streak]) { hud.announce(streaks[p.streak], ''); this.app.speak(streaks[p.streak]); }
    else if (!opts.collateral) { const v = { double: 'DOUBLE KILL', multi: 'TRIPLE KILL', specialist: 'MULTI KILL', specialforce: 'ULTRA KILL', first: 'FIRST BLOOD', headshot: 'HEADSHOT', grenade: 'GRENADE KILL' }; const k = E.find((x) => v[x]); if (k) this.app.speak(v[k]); }
  }
  // the local player died: Revenge / Welcome Back bookkeeping + Love Shot (both died within 0.4 s)
  _playerDied(killer) {
    const p = this.player, hud = this.app.hud;
    p.deathRun = (p.deathRun || 0) + 1;
    if (killer && killer !== p) { if (p.lastVictim === killer && this.time - p.lastKillT < 0.4) hud.emblem('love'); p.lastKiller = killer; }
    p.multi = 0; setTimeout(() => hud.emblemClear(), 1500);
  }
  _killFeed(victim, killer, def, head, valid, opts) {
    this.app.hud.killfeed(valid ? killer.name : killer === victim ? '' : null, killer ? killer.team : 'bravo', killer === victim && def.kind !== 'fall' ? '自爆' : def, victim.name, victim.team, head, (killer && killer.isPlayer) || victim.isPlayer, opts.collateral);
  }

  onKill(victim, killer, def, part, dir, opts) {
    const head = part === 'head' && def.kind !== 'grenade', hud = this.app.hud, p = this.player;
    if (this.net && this.net.role === 'host') this.net.onKill(victim, killer, def, head, dir, opts);
    victim.deaths++;
    this.rules.onDeath(victim);
    this.dropOnDeath(victim, dir);
    this._die(victim, killer, def, dir);
    const valid = killer && killer !== victim && killer.team !== victim.team;
    if (valid) {
      const pts = this._killPoints(def, head);
      killer.kills++; if (head) killer.headshots++; killer.score += pts;
      this.addTeam(killer.team, this.rules.killTeamPoints(pts));
      if (killer.isPlayer) this._killAnnounce(def, head, pts, opts, victim);
      this.firstBlood = false;
    }
    for (const [c, rec] of victim.damageLog) {
      if (c === killer || c.team === victim.team || this.time - rec.t > CFG.assistWindow || rec.amt < 20) continue;
      c.assists++; c.score += POINTS.assist; this.addTeam(c.team, this.rules.killTeamPoints(POINTS.assist) > 5 ? POINTS.assist : 0);
      if (c.isPlayer) { hud.points(`+${POINTS.assist}  助攻`); hud.emblem('assist'); }
    }
    victim.damageLog.clear();
    if (victim.isPlayer) { p.streak = 0; this._playerDied(killer); }
    this._killFeed(victim, killer, def, head, valid, opts);
    if (victim.isPlayer) {
      hud.showDeath(true, valid ? killer.name : '', def.name, head, this.rules.roundBased);
      if (this.rules.roundBased) this.nextSpectate(); else if (valid && this.opts.killcam) this._startKillcam(killer, def);
    }
    this.checkEnd();
  }

  // v25 client: the host reported a kill — the same deaths, kill feed and announcements, none of the game logic (scores arrive in snapshots)
  remoteKill(victim, killer, def, head, dir, opts) {
    const p = this.player, valid = killer && killer !== victim && killer.team !== victim.team;
    victim.deaths++;
    if (victim.alive || victim.isPlayer) this._die(victim, killer, def, dir);
    if (valid) { const pts = this._killPoints(def, head); killer.kills++; if (head) killer.headshots++; killer.score += pts; if (killer.isPlayer) this._killAnnounce(def, head, pts, opts, victim); this.firstBlood = false; }
    if (victim.isPlayer) { p.streak = 0; this._playerDied(killer); }
    this._killFeed(victim, killer, def, head, valid, opts);
    if (victim.isPlayer) { this.app.hud.showDeath(true, valid ? killer.name : '', def.name, head, this.rules.roundBased); if (this.rules.roundBased) this.nextSpectate(); } // v29: round modes — watch a teammate
  }

  nextSpectate() {
    const mates = this.combatants.filter((b) => b !== this.player && b.model && b.team === this.player.team && b.alive); // v29: friends (and on a client, ghosts) too
    if (!mates.length) { this.player.setSpectate(null); return; }
    const i = mates.indexOf(this.player.spectating);
    this.player.setSpectate(mates[(i + 1) % mates.length]);
  }

  checkEnd() { if (this.phase === 'live') this.rules.check(); }
  onTimeUp() { this.rules.timeUp(); }

  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    if (winner) this.roundWins[winner]++;
    this.phase = 'roundEnd'; this.roundEndT = 4.2;
    if (this.net && this.net.role === 'host') this.net.onRound('end', winner, reason);
    this._roundBanner(winner, reason);
  }
  _roundBanner(winner, reason) {
    const mine = winner === this.player.team;
    this.app.hud.roundBanner({ title: winner ? (mine ? '我方贏得本回合' : '敵方贏得本回合') : '本回合平手', color: winner ? (winner === 'alpha' ? '#63b3ff' : '#ff5d52') : '#fff', a: this.roundWins.alpha, b: this.roundWins.bravo, sub: `ROUND ${this.round} · ${reason}` });
    this.app.speak(winner ? (mine ? 'round won' : 'round lost') : 'draw');
  }

  endMatch(winner) {
    if (this.kc) this._endKillcam(false);
    if (this.phase === 'over') return;
    if (this.net && this.net.role === 'host') this.net.onEnd(winner);
    this.phase = 'over'; this.winner = winner;
    this.app.onMatchEnd(this);
  }

  emitNoise(pos, radius, team, kind = 'noise') { for (const b of this.bots) if (b.alive && b.team !== team) b.ai.hear(pos, radius, kind); }

  // F1–F5: queue a loadout for the NEXT respawn (the current kit is not touched).
  queueLoadout(i) {
    if (i < 0 || i > 4) return;
    this.nextSpawnLoadoutIndex = i === this.loadoutIndex ? null : i;
    const L = Settings.data.loadouts[i];
    if (this.isClient) this.net.queueLoadout(L); // the host builds the same kit for our soldier at the next respawn
    this.audio.mech('queue');
    this.app.hud.toast(i === this.loadoutIndex ? `配裝 ${LOADOUT_KEYS[i]} 已在使用中` : `配裝 ${LOADOUT_KEYS[i]}（${WEAPON_DEFS[L.primary].name} + ${WEAPON_DEFS[L.secondary].name}）已排入，下次重生時套用`);
  }

  /* ------------------------------ weapon drops / pickups ------------------------------ */
  static isGun(def) { return !!def && !!def.mag && def.kind !== 'knife' && def.kind !== 'grenade'; }
  // A dropped gun: physics body (it tumbles and settles), low-poly mesh, pulsing ground glow; remembers its ammo.
  dropWeapon(def, ammo, reserve, pos, vel, netId = 0) {
    if (!Match.isGun(def) || !this.opts.pickup) return null; // room option: no weapon drops / pickups
    const holder = new THREE.Group(), gun = new THREE.Mesh(this.app.models.tp(def.model), this.app.soldiers.gunMat);
    gun.scale.setScalar(1.25); gun.castShadow = true; holder.add(gun);
    const len = ((WEAPON_DATABASE[def.id] && WEAPON_DATABASE[def.id].tp && WEAPON_DATABASE[def.id].tp.len) || (def.kind === 'pistol' ? 0.22 : 0.9)) * 0.62;
    const dyn = this.physics.addDynamic({ mesh: holder, mass: 3, shape: new CANNON.Box(new CANNON.Vec3(0.035, 0.06, Math.max(0.08, len / 2))), position: pos, velocity: vel,
      angularVelocity: { x: rand(-2, 2), y: rand(-6, 6), z: rand(-4, 4) }, linearDamping: 0.08, angularDamping: 0.45, life: 999, manual: true });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.app.tex.dot(), color: new THREE.Color(0.45, 1, 0.8), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.3, 1.3, 1); glow.userData.noAO = true; this.scene.add(glow);
    const d = { def, ammo, reserve, dyn, body: dyn.body, glow, t: 0, id: netId || ++this.dropSeq };
    this.drops.push(d);
    if (!netId && this.net && this.net.role === 'host') this.net.onDrop(d, pos, vel); // v30: friends see it fall the same way
    while (this.drops.length > 18) this.removeDrop(this.drops[0]);
    return d;
  }
  removeDrop(d) {
    const i = this.drops.indexOf(d); if (i < 0) return; this.drops.splice(i, 1);
    this.physics.remove(d.dyn); this.scene.remove(d.glow); d.glow.material.dispose(); if (this.pickTarget === d) this.pickTarget = null;
    if (this.net && this.net.role === 'host') this.net.onUndrop(d);
  }
  // v30 host: a friend pressed E — the relic first, then the gun in front of him (same reach and preference as yours)
  netInteract(np) {
    if (!np.alive || !this.canMove()) return;
    const st = this.rules.hudState ? this.rules.hudState() : null;
    if (st && st.kind === 'relic') { this.rules.interactPressed(np); }
    const ars = np.arsenal, f = np.lookDir(TMP_V1); let best = null, bs = Infinity;
    for (const d of this.drops) {
      const b = d.body, dx = b.position.x - np.motor.pos.x, dz = b.position.z - np.motor.pos.z, dist = Math.hypot(dx, dz), dy = b.position.y - np.motor.pos.y;
      if (dist > 2.0 || dy < -0.8 || dy > 1.8 || ars.slotIndex(d.def.slot) < 0) continue;
      const sc = dist - (f.x * dx + f.z * dz) / (dist || 1) / Math.max(1e-3, Math.hypot(f.x, f.z)) * 0.9;
      if (sc < bs) { bs = sc; best = d; }
    }
    if (!best) { this.rules.interactPressed(np); return; }
    const i = ars.slotIndex(best.def.slot), old = ars.weapons[i], def = best.def, ammo = best.ammo, reserve = best.reserve;
    this.removeDrop(best);
    ars.replaceSlot(i, def, ammo, reserve);
    const eye = np.eyePos(new THREE.Vector3()), fw = np.lookDir(new THREE.Vector3());
    if (Match.isGun(old.def)) this.dropWeapon(old.def, old.ammo, old.reserveAmmo, eye.clone().addScaledVector(fw, 0.6).setY(eye.y - 0.35), fw.clone().multiplyScalar(3.2).setY(1.4));
    this.net.onPickup(np, i, def, ammo, reserve);
  }
  // v30 client: the host's drops (spawned with the host's id, never by ourselves), and what we picked up
  clientDrop(e) {
    const def = WEAPON_DEFS[NET_WEAPONS[e.w | 0]], p = netV3(e.p), v = netV3(e.v);
    if (!Match.isGun(def) || !p || !v || this.drops.some((d) => d.id === (e.id | 0))) return;
    this.dropWeapon(def, clamp(e.a | 0, 0, 999), clamp(e.r | 0, 0, 9999), p, v, e.id | 0);
  }
  clientDropPose(e) {
    const d = this.drops.find((x) => x.id === (e.id | 0)), p = netV3(e.p), v = netV3(e.v), q = e.q;
    if (!d || !p || !v || !Array.isArray(q) || q.length !== 4 || !q.every(Number.isFinite)) return;
    const b = d.body; b.position.set(p.x, p.y, p.z); b.velocity.set(v.x, v.y, v.z); b.quaternion.set(q[0], q[1], q[2], q[3]); b.angularVelocity.scale(0.5, b.angularVelocity);
  }
  clientUndrop(id) { const d = this.drops.find((x) => x.id === id); if (d) this.removeDrop(d); }
  clientGot(e) {
    const def = WEAPON_DEFS[NET_WEAPONS[e.w | 0]], ws = this.weapons, i = e.i | 0;
    if (!Match.isGun(def) || !ws.weapons[i] || ws.weapons[i].def.slot !== def.slot) return;
    ws.replaceSlot(i, def, clamp(e.a | 0, 0, 999), clamp(e.r | 0, 0, 9999));
    this.audio.mech('draw'); this.audio.mech('magin'); this.app.hud.setWeapon(ws);
    this.app.hud.toast(`拾取 ${def.name}（彈藥 ${e.a | 0}/${e.r | 0}）`);
  }
  dropOnDeath(c, dir) {
    const at = new THREE.Vector3(c.motor.pos.x, c.motor.pos.y + 1.1, c.motor.pos.z), v = new THREE.Vector3(dir.x * 2.2 + rand(-0.6, 0.6), 1.6, dir.z * 2.2 + rand(-0.6, 0.6));
    if (c.isPlayer) {
      const ws = this.weapons, w = Match.isGun(ws.current.def) ? ws.current : ws.weapons.find((x) => Match.isGun(x.def));
      if (w) this.dropWeapon(w.def, w.ammo, w.reserveAmmo, at, v);
    } else if (Match.isGun(c.def)) this.dropWeapon(c.def, Math.max(0, c.ammo), c.def.mag * 2, at, v);
  }
  // Nearest pickable gun within 2 m, preferring the one you look at.
  updateDrops(dt) {
    const p = this.player, ws = this.weapons, f = this.camera.getWorldDirection(TMP_V1);
    let best = null, bs = Infinity;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i], b = d.body; d.t += dt;
      d.glow.position.set(b.position.x, b.position.y + 0.06, b.position.z); d.glow.material.opacity = 0.32 + 0.2 * Math.sin(this.time * 4 + d.id);
      if (d.t > 55) { this.removeDrop(d); continue; }
      if (!p.alive || !this.canMove()) continue;
      const dx = b.position.x - p.motor.pos.x, dz = b.position.z - p.motor.pos.z, dist = Math.hypot(dx, dz), dy = b.position.y - p.motor.pos.y;
      if (dist > 2.0 || dy < -0.8 || dy > 1.8 || ws.slotIndex(d.def.slot) < 0) continue;
      const facing = (f.x * dx + f.z * dz) / (dist || 1) / Math.max(1e-3, Math.hypot(f.x, f.z)), sc = dist - facing * 0.9;
      if (sc < bs) { bs = sc; best = d; }
    }
    this.pickTarget = best;
    return best ? `[E] 拾取 ${best.def.name} (彈藥: ${best.ammo}/${best.reserve})` : '';
  }
  pickup(d) {
    const ws = this.weapons, i = ws.slotIndex(d.def.slot), p = this.player;
    if (i < 0) return;
    const old = ws.weapons[i], def = d.def, ammo = d.ammo, reserve = d.reserve;
    this.removeDrop(d);
    ws.replaceSlot(i, def, ammo, reserve);
    const eye = p.eyePos(new THREE.Vector3()), fw = this.camera.getWorldDirection(new THREE.Vector3());
    if (Match.isGun(old.def)) this.dropWeapon(old.def, old.ammo, old.reserveAmmo, eye.clone().addScaledVector(fw, 0.6).setY(eye.y - 0.35), fw.clone().multiplyScalar(3.2).setY(1.4)); // old gun is thrown down in front
    this.audio.mech('draw'); this.audio.mech('magin');
    this.app.hud.toast(`拾取 ${def.name}（彈藥 ${ammo}/${reserve}）`);
  }
  // E key: relic first (Capture the Relic), then a gun under your nose, otherwise the mode's interaction.
  onInteract() {
    if (this.isClient) return; // v29/v30: the host decides pickups — the E press reaches it in our commands (Match.netInteract)
    const st = this.rules.hudState ? this.rules.hudState() : null;
    if (st && st.kind === 'relic' && st.prompt) { this.rules.interactPressed(this.player); return; }
    if (this.pickTarget) { this.pickup(this.pickTarget); return; }
    this.rules.interactPressed(this.player);
  }

  /* ------------------------------ grenades ------------------------------ */
  // remote (v30 client): someone else's grenade as the host announced it — it flies here too, but only the host's word
  // (clientBoom) sets it off, where it really landed
  throwGrenade(owner, def, pos, vel, remote = null) {
    const mesh = new THREE.Mesh(this.app.models.tp(def.id), this.app.soldiers.gunMat); mesh.castShadow = true;
    const dyn = this.physics.grenadeBody(mesh, pos, vel);
    dyn.body.linearDamping = 0.02; // keep the throw's momentum (long charged / jump throws)
    const n = { def, owner, dyn, body: dyn.body, t: 0, prev: pos.clone(), id: remote ? remote.id : (this.nadeSeq = (this.nadeSeq || 0) + 1), remote: !!remote };
    this.grenades.push(n);
    if (!remote && this.net && this.net.role === 'host') this.net.onNade(n, pos, vel);
  }
  clientNade(e) {
    const def = WEAPON_DEFS[NET_WEAPONS[e.w | 0]], p = netV3(e.p), v = netV3(e.v);
    if (!def || def.kind !== 'grenade' || !p || !v || this.grenades.length > 40) return;
    this.throwGrenade(this.net.byId(e.o | 0) || { team: null }, def, p, v, { id: e.id | 0 });
  }
  clientBoom(e) {
    const def = WEAPON_DEFS[NET_WEAPONS[e.w | 0]], p = netV3(e.p);
    if (!def || def.kind !== 'grenade' || !p || (e.o | 0) === this.player.netId) return; // ours already went off here
    const i = this.grenades.findIndex((g) => g.remote && g.id === (e.id | 0));
    if (i >= 0) { this.physics.remove(this.grenades[i].dyn); this.grenades.splice(i, 1); }
    this.detonate({ def, owner: this.net.byId(e.o | 0) || { team: null }, body: { position: p } });
  }

  updateGrenades(dt) {
    const o = TMP_V1, d = TMP_V2;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const n = this.grenades[i]; n.t += dt;
      // anti-tunnelling: fast grenades are swept against the level every frame and bounced off whatever they would pass through
      const b = n.body, cur = TMP_V3.set(b.position.x, b.position.y, b.position.z), seg = d.subVectors(cur, n.prev), len = seg.length();
      if (len > 0.08) {
        seg.divideScalar(len);
        const h = this.collision.raycast(o.copy(n.prev), seg, len + 0.05, false);
        if (h) {
          const nrm = h.normal, v = b.velocity, vn = v.x * nrm.x + v.y * nrm.y + v.z * nrm.z;
          b.position.set(h.point.x + nrm.x * 0.07, h.point.y + nrm.y * 0.07, h.point.z + nrm.z * 0.07);
          if (vn < 0) { v.x -= 1.38 * vn * nrm.x; v.y -= 1.38 * vn * nrm.y; v.z -= 1.38 * vn * nrm.z; v.x *= 0.75; v.y *= 0.75; v.z *= 0.75; }
          this.audio.nadeBounce(b.position, Math.min(1, Math.abs(vn) / 8));
          cur.set(b.position.x, b.position.y, b.position.z);
        }
      }
      n.prev.copy(cur);
      if (n.remote ? n.t > 12 : n.t >= n.def.fuse) { this.grenades.splice(i, 1); this.physics.remove(n.dyn); if (!n.remote) this.detonate(n); }
    }
  }

  detonate(n) {
    const pos = new THREE.Vector3(n.body.position.x, n.body.position.y, n.body.position.z), def = n.def, p = this.player, cam = this.camera.position;
    const probe = pos.clone(); probe.y += 0.25;
    if (this.net && this.net.role === 'host') this.net.onBoom(n, pos); // v30: friends see it go off right there
    if (def.gtype === 'he') {
      this.effects.explosion(pos); this.audio.explosion('he', pos); this.physics.blast(pos, def.radius + 1, 8);
      for (const c of this.combatants) {
        if (!c.alive) continue;
        if (c !== n.owner && c.team === n.owner.team) continue;
        const chest = c.chestPos(new THREE.Vector3()), d = chest.distanceTo(pos);
        if (d > def.radius) continue;
        if (!this.collision.segmentClear(probe, chest, true) && !this.collision.segmentClear(probe, c.eyePos(new THREE.Vector3()), true)) continue;
        // bigger blast with distance falloff: lethal core, then a smooth curve out to the edge
        const k = d <= def.lethal ? 1 : Math.pow(1 - (d - def.lethal) / (def.radius - def.lethal), 1.6), dmg = def.damage * k;
        if (dmg < 1) continue;
        this.applyDamage(c, dmg, 'chest', n.owner, def, chest.clone().sub(pos).normalize(), chest, { blast: true });
      }
      const dp = cam.distanceTo(pos);
      if (dp < 26) { p.shake = Math.max(p.shake, 2.4 * (1 - dp / 26)); if (dp < 8) this.audio.deafen(0.6 * (1 - dp / 8), 2.5); }
      this.emitNoise(pos, 70, null, 'blast');
    } else if (def.gtype === 'flash') {
      this.effects.flashbang(pos); this.audio.explosion('flash', pos);
      for (const c of this.combatants) {
        if (!c.alive) continue;
        const eye = c.eyePos(new THREE.Vector3()), d = eye.distanceTo(pos);
        if (d > def.radius || !this.collision.segmentClear(probe, eye)) continue;
        const toF = pos.clone().sub(eye).normalize(), view = c.isPlayer ? this.camera.getWorldDirection(new THREE.Vector3()) : c.lookDir(new THREE.Vector3());
        const facing = 0.2 + 0.8 * clamp((view.dot(toF) + 0.25) / 1.25, 0, 1), s = clamp((1 - d / def.radius) * facing * 1.25, 0, 1);
        if (c.isPlayer) { if (!this.isClient) { this.app.post.flash(s, 0.6 + 4.2 * s); this.audio.deafen(s * 0.9, 1 + 3 * s); } } // a client is blinded by the host's 'flash' message
        else if (c.ai) c.ai.blind(0.4 + 4.2 * s);
        else if (c.isNet && this.net && this.net.role === 'host') this.net.onFlash(c, s);
      }
    } else {
      this.effects.spawnSmoke(pos, def.duration); this.audio.smokeHiss(pos);
    }
  }

  /* ------------------------------ frame ------------------------------ */
  tick(dt, mouse) {
    const p = this.player, h = CFG.fixedStep, hud = this.app.hud, input = this.app.input, rb = this.rules.roundBased, PR = this.prof || (this.prof = new FrameProfiler()), t0 = performance.now();
    this.time += dt;
    const client = this.isClient;
    if (client) { if (this.phase === 'freeze') hud.freeze(true, Math.max(1, Math.ceil(this.freezeT)), '準備開戰', input.locked); } // phase, clock and score come from the host
    else if (this.phase === 'freeze') {
      this.freezeT -= dt;
      hud.freeze(true, Math.ceil(this.freezeT), rb ? `ROUND ${this.round}` : '準備開戰', input.locked);
      if (this.freezeT <= 0) { this.phase = 'live'; hud.freeze(false); hud.announce('FIGHT!', rb ? `ROUND ${this.round} · ${RULES[this.rule].name}` : `${RULES[this.rule].name} · ${MODES[this.mode].name}`); }
    } else if (this.phase === 'live') {
      this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.onTimeUp(); }
    } else if (this.phase === 'roundEnd') {
      this.roundEndT -= dt;
      if (this.roundEndT <= 0) {
        if (this.roundWins.alpha >= this.target || this.roundWins.bravo >= this.target) { this.phase = 'live'; this.endMatch(this.roundWins.alpha >= this.target ? 'alpha' : 'bravo'); return; }
        this.startRound();
      }
    }
    if (this.phase === 'over') return;
    this.runTimers();
    p.look(mouse.x, mouse.y);
    if (input.wheel && p.alive) this.app.cmds.switchTo(this.weapons.wheelTarget(input.wheel));
    this.acc += dt; let steps = 0;
    while (this.acc >= h && steps < 14) {
      // v25: one UserCmd per fixed step drives the local player's movement AND weapons (the host steps remote humans the same way)
      const cmd = this.app.cmds.build(p, this.weapons, !this.app.chatOpen); // v31: typing a chat line → the soldier stands still
      p.fixedUpdate(h, cmd);
      this.weapons.tick(h, cmd);
      if ((cmd.btn & BTN.INTERACT) && p.alive && this.canMove()) this.onInteract();
      if (this.net) { if (client) this.net.afterLocalStep(cmd); else this.net.step(h); }
      for (const b of this.bots) b.fixedUpdate(h);
      const ms = []; for (const c of this.combatants) if (c.alive) ms.push(c.motor);
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) CharacterMotor.separate(ms[i], ms[j]);
      this.acc -= h; steps++;
    }
    if (steps >= 14) this.acc = 0;
    const t1 = performance.now();
    const alpha = this.acc / h;
    p.update(dt);
    const respawns = this.rules.respawns;
    for (const b of this.bots) {
      if (b.alive) b.update(dt, alpha);
      else if (respawns && this.phase === 'live') { b.respawnT -= dt; if (b.respawnT <= 0) { const sp = this.pickSpawn(b.team); b.respawn(sp, sp.spawnYaw ?? this.spawns[b.team].yaw); } }
    }
    for (const np of this.humans) { // v25 host: friends' soldiers
      if (np.alive) np.update(dt, alpha);
      else if (respawns && this.phase === 'live') { np.respawnT -= dt; if (np.respawnT <= 0) { const sp = this.pickSpawn(np.team); np.respawn(sp, sp.spawnYaw ?? this.spawns[np.team].yaw); } }
    }
    if (!client) this.rules.tick(dt); else if (this.rules.netTick) this.rules.netTick(dt); // v29: a client only animates the mode; its state comes from the host
    if (this.net) this.net.frame(dt);
    const t2 = performance.now();
    if (!p.alive) {
      if (respawns) {
        p.respawnT -= dt; hud.setDeathTimer(`RESPAWN IN ${Math.max(0, p.respawnT).toFixed(1)}s${this.nextSpawnLoadoutIndex !== null ? `  ·  下次配裝 ${LOADOUT_KEYS[this.nextSpawnLoadoutIndex]}` : ''}`);
        if (!client && p.respawnT <= 0 && this.phase === 'live') { const sp = this.pickSpawn(p.team); p.respawn(sp, sp.spawnYaw ?? this.spawns[p.team].yaw); hud.showDeath(false); }
      } else {
        if (p.spectating && !p.spectating.alive) this.nextSpectate();
        if (p.deathT > 1.6) { hud.showDeath(false); hud.spectate(p.spectating ? `觀戰中：${p.spectating.name} · 左鍵切換隊友 · 等待下一回合` : '全隊陣亡 · 等待下一回合'); }
        else hud.setDeathTimer('等待下一回合…');
      }
    } else hud.spectate(null);
    p.updateCamera(alpha);
    if (this.kc) { if (this.kc.t !== null && input.down('Space')) this._endKillcam(true); else this._killcam(dt); }
    else if (this.phase === 'live') this._record();
    this.followShadow();
    this.shadowProxy.visible = p.alive; this.shadowProxy.position.set(p.renderPos.x, p.renderPos.y + (p.motor.crouching ? 0.55 : 0.75), p.renderPos.z);
    this.weapons.update(dt, input, mouse);
    this.updateGrenades(dt);
    this.physics.step(dt);
    this.effects.update(dt);
    for (const fn of this.builder.animated) fn(dt, this.time);
    for (const m of this.builder.shafts) m.uniforms.uTime.value = this.time;
    this.spotT -= dt; if (this.spotT <= 0) { this.spotT = 0.15; this.updateSpotting(); }
    this.soldierLOD();
    this.audio.setListener(this.camera.position, this.camera.getWorldDirection(TMP_V1));
    const t3 = performance.now();

    const w = this.weapons.current;
    hud.setHealth(p.hp, p); hud.setWeapon(this.weapons); hud.setScore(this);
    hud.protect(p.alive && this.phase === 'live' ? p.spawnProtect : 0);
    let hint = '';
    if (p.alive && w.mag && !w.reloading) {
      if (w.ammo === 0 && w.reserveAmmo === 0) hint = '沒子彈了 · 按數字鍵切換武器';
      else if (w.ammo <= Math.ceil(w.mag * 0.2) && w.reserveAmmo > 0) hint = '按 R 換彈 · RELOAD';
    }
    if (p.alive && p.motor.climbing) hint = '梯子：W 上 · S 下 · SPACE 跳離';
    hud.hint(hint);
    const warns = [];
    if (p.alive) for (const n of this.grenades) {
      if (n.def.gtype !== 'he') continue;
      const dx = n.body.position.x - p.motor.pos.x, dz = n.body.position.z - p.motor.pos.z;
      if (dx * dx + dz * dz > n.def.radius * n.def.radius) continue;
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      warns.push({ angle: Math.atan2(dx * c + dz * -s, dx * -s + dz * -c) });
    }
    hud.nadeWarnings(warns);
    const pickPrompt = this.updateDrops(dt), ost = this.rules.hudState();
    hud.objective(ost, this);
    if (pickPrompt && !(ost && ost.prompt && ost.kind === 'relic')) hud.interact(pickPrompt);
    hud.markers(this.rules.markers([]), this.camera);
    hud.scoreboard(input.down('Tab') ? this : null);
    hud.update(dt, this);
    const t4 = performance.now(); PR.add('sim', t1 - t0); PR.add('ai', t2 - t1); PR.add('fx', t3 - t2); PR.add('hud', t4 - t3);
  }

  // v24: soldiers beyond ~15 m draw the ~8× lighter body (24 full bodies were ~0.5 M triangles a frame with shadows — the
  // main cost on integrated GPUs). Distance is scaled by the scope zoom so an enemy seen through a scope keeps full detail.
  soldierLOD() {
    const cam = this.camera, ws = this.weapons, zoom = Math.tan(cam.fov * 0.00872665) / Math.tan((ws.baseFov || cam.fov) * 0.00872665);
    for (const b of this.bots) {
      const s = b.model, far = s.body.geometry === s.lod[1], d = s.root.position.distanceTo(cam.position) * zoom;
      if (far ? d < 13 : d > 16) s.body.geometry = s.lod[far ? 0 : 1];
    }
  }

  updateSpotting() {
    const cam = this.camera, f = cam.getWorldDirection(new THREE.Vector3());
    for (const b of this.combatants) {
      if (!b.model || !b.alive || b.team === this.player.team) continue;
      const tgt = b.chestPos(new THREE.Vector3()), to = tgt.clone().sub(cam.position), d = to.length();
      if (d > 80 || f.dot(to) / d < 0.55 || this.effects.smokeBlocks(cam.position, tgt)) continue;
      if (this.collision.segmentClear(cam.position, tgt)) b.spottedT = this.time;
    }
  }

  dispose() {
    this.running = false;
    this.rules.dispose();
    for (const b of this.bots) if (b.tag) b.tag.material.map.dispose();
    const texs = new Set();
    this.scene.traverse((o) => {
      if (o.geometry && !o.userData.keepGeo) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { for (const k of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) if (m[k]) texs.add(m[k]); if (!m.userData.keep) m.dispose(); }
    });
    for (const t of texs) t.dispose(); // frees GPU memory; cached canvases re-upload on next use
    for (const vm of this.weapons.vmPool.values()) vm.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.envRT) this.envRT.dispose();
    this.app.post.dispose(); CAO.uCAOOn.value = 0;
  }
}
