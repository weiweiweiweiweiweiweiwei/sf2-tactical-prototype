/* =====================================================================
   WEAPON SYSTEM — inventory, Quick-Change, ADS / quick-scope, sprint
   pose, spring-damper kick, bob/sway, reload/bolt/knife/grenade anims.
   The viewmodel is rendered in its own pass (never clips into walls)
   but lives at the camera's WORLD transform and shares the world sun's
   shadow map, so it receives real environment shadows.
   ===================================================================== */
class WeaponSystem {
  constructor(game, defs) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xdfe7f2, 0x2c2824, 0.6); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = false;
    this.sun.shadow.autoUpdate = false; this.sun.shadow.needsUpdate = false;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0x9fc4ff, 0.35); this.scene.add(this.fill, this.fill.target);
    this.key = new THREE.DirectionalLight(0xfff0dc, 5); this.scene.add(this.key, this.key.target); // v16 camera-relative key light: the back of the gun catches highlights instead of reading as a black block
    this.flashLight = new THREE.PointLight(0xffaa33, 0, 8, 2); this.scene.add(this.flashLight); this.flashLightT = 0;
    // v8 barrel smoke: pooled soft sprites in world space, emitted from the muzzle after sustained fire
    this.heat = 0; this.lastShotT = -9; this.smokeT = 0; this.wisps = [];
    const smokeTex = game.app.tex.smoke();
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xd6d6d2, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.renderOrder = 8; this.scene.add(s); this.wisps.push({ s, t: 0, life: 0, v: new THREE.Vector3() }); }
    this.root = new THREE.Group(); this.scene.add(this.root);
    const models = game.app.models;
    this.vmPool = new Map(); // viewmodels are built once per weapon and reused when the loadout changes
    this.weapons = this._make(defs);
    this.index = 0; this.lastIndex = Math.min(1, this.weapons.length - 1);
    this.aimTarget = null;
    this.ads = false; this.zoomLevel = 0; this.adsT = 0; this.trigger = false; this.unscopeT = 0; this.scopedIn = false; this.scopeLevel = 0;
    this.baseFov = Settings.data.fov; this.fov = this.baseFov; this.drawT = 0; this.sprintT = 0;
    this.kickPos = new THREE.Vector3(); this.kickVel = new THREE.Vector3(); this.kickRot = new THREE.Vector3(); this.kickRotVel = new THREE.Vector3();
    this.swayX = 0; this.swayY = 0; this.bobPhase = 0; this.bobAmt = 0; this.roll = 0; this.landY = 0; this.landV = 0;
    this.focusDist = 20; this.focusT = 0;
    this.leftArm = models.leftArm(); this.leftArm.group.visible = false; this.root.add(this.leftArm.group);
    this.grabT = 0; this.grabCd = 0; this.grabHit = false;
    this._pos = new THREE.Vector3();
    this.current.equip(); this.current.vm.group.visible = true;
  }

  _make(defs) {
    return defs.map((d) => {
      let vm = this.vmPool.get(d.id);
      if (!vm) { vm = this.game.app.models.build(d); this.vmPool.set(d.id, vm); this.root.add(vm.group); }
      vm.group.visible = false;
      return makePlayerWeapon(this.game, d, vm);
    });
  }
  // Swap the whole inventory (loadout applied on respawn).
  rebuild(defs) {
    this.exitADS();
    for (const w of this.weapons) { w.holster(); w.vm.group.visible = false; }
    this.weapons = this._make(defs);
    this.index = 0; this.lastIndex = Math.min(1, this.weapons.length - 1); this.trigger = false;
    this.current.equip(); this.current.vm.group.visible = true; this.drawT = 1;
    if (this.scene.environment && this.game.applyEnvIntensity) this.game.applyEnvIntensity();
  }

  get current() { return this.weapons[this.index]; }
  slotIndex(slot) { return this.weapons.findIndex((w) => w.def.slot === slot); }
  // Weapon pickup: swap the gun in slot i (keeps the picked-up gun's remaining ammo).
  replaceSlot(i, def, ammo, reserve) {
    const cur = i === this.index;
    if (cur) this.exitADS();
    const old = this.weapons[i]; old.holster(); old.vm.group.visible = false;
    const [w] = this._make([def]); w.ammo = ammo; w.reserveAmmo = reserve; this.weapons[i] = w;
    if (cur) { w.equip(); w.vm.group.visible = true; this.drawT = 1; this.trigger = false; }
    if (this.game.applyEnvIntensity) this.game.applyEnvIntensity();
    this.game.app.hud.setWeapon(this);
  }
  selectable(i) { const w = this.weapons[i]; return !!w && !(w.kind === 'grenade' && w.count <= 0); }

  setEnvironment(env) { this.scene.environment = env; }
  syncLighting(worldSun, hemi) {
    this.sun.color.copy(worldSun.color); this.sun.intensity = worldSun.intensity;
    this.sun.position.copy(worldSun.position); this.sun.target.position.copy(worldSun.target.position);
    this.sun.target.updateMatrixWorld();
    if (worldSun.shadow.map) {
      this.sun.shadow.map = worldSun.shadow.map; this.sun.shadow.matrix.copy(worldSun.shadow.matrix);
      this.sun.shadow.bias = worldSun.shadow.bias; this.sun.shadow.normalBias = worldSun.shadow.normalBias; this.sun.shadow.radius = worldSun.shadow.radius;
      this.sun.shadow.mapSize.copy(worldSun.shadow.mapSize);
      if (!this.sun.castShadow) this.sun.castShadow = true;
    }
    if (hemi) { this.hemi.color.copy(hemi.color); this.hemi.groundColor.copy(hemi.groundColor); this.hemi.intensity = hemi.intensity + 0.25; }
  }

  resetLoadout() {
    this.exitADS();
    for (const w of this.weapons) { w.resetAmmo(); w.equip(); w.vm.group.visible = false; if (w.holster) w.holster(); }
    this.index = 0; this.lastIndex = Math.min(1, this.weapons.length - 1); this.trigger = false;
    this.current.equip(); this.current.vm.group.visible = true; this.drawT = 1;
  }

  // Force-leave ADS on the CURRENT weapon: FOV back to hip, 2D scope overlay removed, viewmodel shown again.
  exitADS() {
    const w = this.current;
    this.zoomLevel = 0; this.ads = false; this.adsT = 0; this.unscopeT = 0; this.scopedIn = false; this.scopeLevel = 0;
    this.game.app.hud.setScope(false, 0);
    if (w) w.vm.group.visible = true;
    this.fov = this.baseFov; this.game.camera.fov = this.baseFov + this.game.player.fovPunch; this.game.camera.updateProjectionMatrix();
  }

  // QUICK CHANGE: instant swap, cancels cooldown/bolt/reload, resets recoil springs + FOV.
  switchTo(i) {
    if (i === this.index || !this.selectable(i) || !this.game.player.alive) return;
    this.exitADS(); // scope bug fix: leave ADS BEFORE the index changes (wheel / number keys / Q)
    const old = this.current; old.holster(); old.vm.group.visible = false;
    this.lastIndex = this.index; this.index = i;
    this.game.player.resetRecoil();
    this.kickPos.set(0, 0, 0); this.kickVel.set(0, 0, 0); this.kickRot.set(0, 0, 0); this.kickRotVel.set(0, 0, 0);
    const w = this.current; w.equip(); w.vm.group.visible = true; this.drawT = 1; this.trigger = false;
    this.game.audio.mech('draw');
    this.game.app.hud.setWeapon(this);
  }
  quickSwitch() { this.switchTo(this.lastIndex); }
  switchBack() {
    if (this.selectable(this.lastIndex) && this.lastIndex !== this.index) { this.switchTo(this.lastIndex); return; }
    for (let i = 0; i < this.weapons.length; i++) if (i !== this.index && this.selectable(i) && this.weapons[i].kind !== 'grenade') { this.switchTo(i); return; }
  }

  setAds(on, silent = false, level = 1) {
    const w = this.current;
    if (on && (w.kind === 'knife' || w.kind === 'grenade' || w.reloading)) on = false;
    const newLevel = on ? level : 0;
    if (newLevel === this.zoomLevel) return;
    const was = this.ads;
    this.zoomLevel = newLevel; this.ads = newLevel > 0;
    if (w.scoped) { // the rifle is raised to the eye first (adsT); the 2D scope fades in once it is there — see update()
      if (!this.ads && this.scopedIn) { this.scopedIn = false; this.scopeLevel = 0; this.game.app.hud.setScope(false, 0); w.vm.group.visible = true; }
      if (!silent) this.game.audio.mech('zoom');
    }
    if (this.ads && !was) this.game.player.sprinting = false;
  }

  // Viewmodel kick is cosmetic only: a backward z kickback + a tiny rotational shake (almost none in ADS, so the
  // sight stays on the screen centre). The real recoil is the camera rotation in Player.addRecoil.
  kick(k) {
    const a = this.ads ? 0.08 : 0.28;
    this.kickVel.z += k.z * 24 * (this.ads ? 0.7 : 1); this.kickVel.y += k.y * 5 * a;
    this.kickRotVel.x += k.rx * 20 * a; this.kickRotVel.z += rand(-1, 1) * k.rx * 3 * a; this.kickRotVel.y += rand(-1, 1) * k.rx * 1.5 * a;
  }
  // F — left-hand grab (SF2 style): usable any time, even while aiming. Within killRange = instant kill, otherwise heavy damage.
  grab() {
    const g = this.game, p = g.player, w = this.current;
    if (!g.canAct() || !p.alive || this.grabT > 0 || this.grabCd > 0 || (w.kind === 'grenade' && w.state !== 'idle')) return;
    this.grabT = 1e-4; this.grabHit = false; this.grabCd = 1.0; this.setAds(false, true); this.trigger = false;
    p.sprinting = false; p.sprintBlock = 0.5; g.audio.knifeSwing(); p.onAttack();
  }
  _grabHit() {
    const g = this.game, p = g.player, def = WEAPON_DEFS.grab, ray = this.current.aimRay();
    let best = null;
    for (const [yaw, pitch] of [[0, 0], [0.16, 0], [-0.16, 0], [0, 0.1], [0, -0.14]]) {
      const dir = ray.d.clone().addScaledVector(ray.r, yaw).addScaledVector(ray.u, pitch).normalize();
      const h = g.meleeTrace(p, ray.o, dir, def.range);
      if (h && h.target && (!best || h.t < best.t)) best = h;
    }
    if (!best) return;
    const d = Math.hypot(best.target.motor.pos.x - p.motor.pos.x, best.target.motor.pos.z - p.motor.pos.z);
    g.applyDamage(best.target, d <= def.killRange ? 999 : def.damage, 'chest', p, def, ray.d.clone(), best.point, { melee: true });
    g.audio.knifeHit(true); p.punchV += 0.5;
  }

  _barrelSmoke(dt, w) {
    const g = this.game, since = g.time - this.lastShotT;
    this.heat = Math.max(0, this.heat - dt * (since < 0.15 ? 0.4 : 3.6));
    if (this.heat > 3 && since > 0.12 && !this.scopedIn && w.vm.muzzle && w.vm.group.visible) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.06 + Math.random() * 0.05;
        const p = this.wisps.find((q) => q.t >= q.life);
        if (p) { w.vm.group.updateMatrixWorld(); w.vm.muzzle.getWorldPosition(p.s.position); p.t = 0; p.life = 0.8 + Math.random() * 0.5; p.v.set(rand(-0.05, 0.05), 0.16 + Math.random() * 0.12, rand(-0.05, 0.05)); p.s.material.rotation = Math.random() * 6.28; p.s.visible = true; p.a = Math.min(1, this.heat / 10) * 0.32; }
      }
    }
    for (const q of this.wisps) {
      if (q.t >= q.life) { if (q.s.visible) q.s.visible = false; continue; }
      q.t += dt; const k = q.t / q.life;
      q.s.position.addScaledVector(q.v, dt); q.v.x += rand(-0.2, 0.2) * dt; q.v.z += rand(-0.2, 0.2) * dt;
      const sz = 0.025 + k * 0.14; q.s.scale.set(sz, sz, 1); q.s.material.opacity = q.a * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
    }
  }
  muzzleLight(strength) { this.flashLightT = 0.04; this.flashLight.intensity = 15 * strength; }

  onButton(btn, down) {
    const w = this.current, g = this.game;
    if (w.kind === 'grenade') { if (btn === 0 || btn === 2) { if (down) w.press(btn); else w.release(); } return; }
    if (btn === 0) {
      this.trigger = down;
      if (!down || !g.canAct()) return;
      if (w.kind === 'knife') { w.attack(false); return; }
      if (w.cooldown <= 0) this._fire(); else if (!w.auto) w.queued = 0.1;
    } else if (btn === 2) {
      if (w.kind === 'knife') { if (down && g.canAct()) w.attack(true); return; }
      if (Settings.data.adsMode === 'hold') this.setAds(down);
      else if (down) {
        if (w.scoped && w.def.zoomFovs.length > 1) this.setAds(this.zoomLevel < w.def.zoomFovs.length, false, this.zoomLevel + 1);
        else this.setAds(!this.ads);
      }
    }
  }

  onKey(code) {
    const m = /^Digit([1-9])$/.exec(code);
    if (m) { const i = parseInt(m[1], 10) - 1; if (i < this.weapons.length) this.switchTo(i); return; }
    if (code === 'KeyQ') this.quickSwitch();
    else if (code === 'KeyR') { if (this.current.tryReload && this.current.tryReload()) this.setAds(false, true); }
  }

  _fire() {
    if (!this.game.canAct()) return;
    const w = this.current;
    this.game.player.sprinting = false; this.game.player.sprintBlock = 0.35;
    if (w.fire(this)) { this.game.app.hud.setWeapon(this); this.heat = Math.min(14, this.heat + (w.kind === 'shotgun' || w.kind === 'sniper' ? 3 : 1)); this.lastShotT = this.game.time; }
  }

  update(dt, input, mouse) {
    const g = this.game, w = this.current, p = g.player, m = p.motor, cam = g.camera;
    if (input.wheel) {
      const n = this.weapons.length; let i = this.index;
      for (let k = 0; k < n; k++) { i = (i + (input.wheel > 0 ? 1 : -1) + n) % n; if (this.selectable(i)) break; }
      this.switchTo(i);
    }
    w.update(dt, this);
    if (this.grabCd > 0) this.grabCd -= dt;
    if (this.grabT > 0) { this.grabT += dt; if (!this.grabHit && this.grabT >= 0.12) { this.grabHit = true; this._grabHit(); } if (this.grabT >= 0.45) this.grabT = 0; }
    if (w.kind !== 'knife' && w.kind !== 'grenade' && this.grabT <= 0) {
      if (this.trigger && w.auto && !w.reloading && g.canAct()) {
        let n = 0;
        while (w.cooldown <= 0 && n < 3) { if (w.ammo <= 0) { this._fire(); this.trigger = false; break; } this._fire(); n++; }
      } else if (w.queued > 0) { w.queued -= dt; if (w.cooldown <= 0) { w.queued = 0; this._fire(); } }
    }
    if (this.unscopeT > 0) { this.unscopeT -= dt; if (this.unscopeT <= 0) this.setAds(false, true); }
    if (w.reloading && this.ads) this.setAds(false, true);
    if (p.sprinting && this.ads) this.setAds(false, true);

    const target = this.ads ? (w.scoped ? (this.scopedIn ? w.def.zoomFovs[this.zoomLevel - 1] : this.baseFov * 0.82) : w.def.adsFov) : this.baseFov;
    this.fov = THREE.MathUtils.lerp(this.fov, target, 1 - Math.exp(-(w.scoped ? 32 : w.def.adsSpeed * 1.4 || 28) * dt));
    if (Math.abs(this.fov - target) < 0.01) this.fov = target;
    const fovNow = this.fov + p.fovPunch;
    if (Math.abs(cam.fov - fovNow) > 1e-4) { cam.fov = fovNow; cam.updateProjectionMatrix(); }
    this.adsT = damp(this.adsT, this.ads ? 1 : 0, w.def.adsSpeed || 20, dt);
    if (w.scoped) { // scope-in: overlay (with a short fade) only after the raise animation reaches the eye
      const inNow = this.ads && this.adsT > 0.8;
      if (inNow !== this.scopedIn || (inNow && this.scopeLevel !== this.zoomLevel)) { this.scopedIn = inNow; this.scopeLevel = inNow ? this.zoomLevel : 0; g.app.hud.setScope(inNow, this.zoomLevel); w.vm.group.visible = !inNow; }
    } else if (this.scopedIn) { this.scopedIn = false; this.scopeLevel = 0; g.app.hud.setScope(false, 0); }
    this.sprintT = damp(this.sprintT, p.sprinting ? 1 : 0, 12, dt);
    const vmFov = lerp(58, 48, this.adsT * (w.scoped ? 0 : 1));
    if (Math.abs(this.camera.fov - vmFov) > 0.01) { this.camera.fov = vmFov; this.camera.updateProjectionMatrix(); }

    // viewmodel lives at the camera's world transform
    this.root.position.copy(cam.position); this.root.quaternion.copy(cam.quaternion);
    this.camera.position.copy(cam.position); this.camera.quaternion.copy(cam.quaternion);
    this.fill.position.copy(cam.position).add(TMP_V1.set(-2, 1, 2)); this.fill.target.position.copy(cam.position); this.fill.target.updateMatrixWorld();
    this.key.position.set(0.25, 0.45, 0.8).applyQuaternion(cam.quaternion).add(cam.position); this.key.target.position.set(0, -0.1, -1).applyQuaternion(cam.quaternion).add(cam.position); this.key.target.updateMatrixWorld();

    this._animate(dt, w, m, mouse);

    if (w.vm.flash) {
      const on = w.flashT > 0 && !(this.scopedIn && w.scoped) && !w.suppressed;
      w.vm.flash.visible = on;
      if (on) { w.vm.flash.material.rotation = Math.random() * Math.PI * 2; w.vm.flash.scale.setScalar(w.vm.flash.userData.baseScale * rand(0.8, 1.25)); }
    }
    if (this.flashLightT > 0) { this.flashLightT -= dt; if (w.vm.muzzle) { w.vm.group.updateMatrixWorld(); w.vm.muzzle.getWorldPosition(this.flashLight.position); } if (this.flashLightT <= 0) this.flashLight.intensity = 0; }
    if (w.vm.reticle) w.vm.reticle.material.opacity = clamp((this.adsT - 0.55) / 0.35, 0, 1);
    this._barrelSmoke(dt, w);

    const spread = w.kind === 'knife' || w.kind === 'grenade' ? 0.006 : w.spread(this);
    const gap = 3 + Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (innerHeight / 2);
    const hud = g.app.hud;
    hud.setCrosshair(gap, p.alive && !(this.ads && w.kind !== 'knife'));
    if (w.scoped && this.scopedIn) hud.setScopeSpread(spread);
    hud.setReload(w.reloading ? w.reloadPhase : -1);
    hud.setCharge(w.kind === 'grenade' && w.charging ? (w.power - 1) / (THROW.maxPower - 1) : -1);

    this.focusT -= dt;
    if (this.focusT <= 0) {
      this.focusT = 0.08;
      const ray = w.aimRay(), h = g.collision.raycast(ray.o, ray.d, 150);
      let d = h ? h.t : 150, aim = null;
      for (const c of g.combatants) if (c !== p && c.alive) { c.updateHitboxes(); for (const hb of c.hitboxes) { const r = CollisionWorld.rayBox(ray.o, ray.d, hb, d); if (r && r.t < d) { d = r.t; aim = c; } } }
      this.focusDist = damp(this.focusDist, d, 10, 0.08);
      // SF2 crosshair ID: the soldier under the crosshair (walls block it) shows his name — red for enemies
      this.aimTarget = p.alive && aim && d < 90 && !g.effects.smokeBlocks(ray.o, TMP_V2.copy(ray.o).addScaledVector(ray.d, d)) ? aim : null;
      hud.setAimName(this.aimTarget ? this.aimTarget.name : '', this.aimTarget ? this.aimTarget.team !== p.team : false);
    }
  }

  _animate(dt, w, m, mouse) {
    const vm = w.vm, grp = vm.group, p = this.game.player;
    const sub = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.kickVel.addScaledVector(this.kickPos, -260 * h).multiplyScalar(Math.exp(-20 * h)); this.kickPos.addScaledVector(this.kickVel, h);
      this.kickRotVel.addScaledVector(this.kickRot, -230 * h).multiplyScalar(Math.exp(-18 * h)); this.kickRot.addScaledVector(this.kickRotVel, h);
      this.landV += (-this.landY * 180 - this.landV * 14) * h; this.landY += this.landV * h;
    }
    if (m.landSpeed > 2.5) this.landV -= Math.min(m.landSpeed, 14) * 0.035;
    const hs = m.horizontalSpeed();
    const amp = clamp(hs / 5.6, 0, 1.3) * (m.grounded ? 1 : 0.15) * (1 - this.adsT * 0.88);
    this.bobAmt = damp(this.bobAmt, amp, 10, dt);
    this.bobPhase += dt * hs * (p.sprinting ? 2.1 : 1.85);
    const bx = Math.sin(this.bobPhase) * 0.011 * this.bobAmt * (1 + this.sprintT), by = -Math.abs(Math.cos(this.bobPhase)) * 0.01 * this.bobAmt * (1 + this.sprintT);
    const swayK = 1 - this.adsT * 0.75;
    this.swayX = damp(this.swayX, clamp(-mouse.x * 0.00032, -0.035, 0.035) * swayK, 9, dt);
    this.swayY = damp(this.swayY, clamp(mouse.y * 0.00032, -0.035, 0.035) * swayK, 9, dt);
    const localX = m.vel.x * Math.cos(p.yaw) - m.vel.z * Math.sin(p.yaw);
    this.roll = damp(this.roll, -localX * 0.012 * (1 - this.adsT), 8, dt);
    const pos = this._pos.copy(vm.hipPos).lerp(vm.adsPos, this.adsT);
    let ex = lerp(vm.hipRot.x, vm.adsRot.x, this.adsT), ey = lerp(vm.hipRot.y, vm.adsRot.y, this.adsT), ez = lerp(vm.hipRot.z, vm.adsRot.z, this.adsT);
    pos.x += bx + this.swayX; pos.y += by + this.swayY + this.landY + this.kickPos.y; pos.z += this.kickPos.z;
    ex += this.kickRot.x + this.swayY * 1.5; ey += this.kickRot.y + this.swayX * 1.6; ez += this.kickRot.z + this.roll;
    if (m.crouching) { pos.y += 0.008; ez += 0.03 * (1 - this.adsT); }
    const mk = this.game.player.mantleK || 0; if (mk > 0.01) { pos.y -= 0.09 * mk; pos.z += 0.04 * mk; ex -= 0.45 * mk; ez += 0.2 * mk; } // v15 mantle: gun dips while the hands grab the ledge
    const sk = this.game.player.slideK || 0; if (sk > 0.01) { pos.x -= 0.025 * sk * (1 - this.adsT); pos.y -= 0.015 * sk; ez += 0.32 * sk * (1 - this.adsT * 0.7); } // v14 slide tilt
    if (this.sprintT > 0.01 && w.kind !== 'knife') { const s = this.sprintT; pos.x -= 0.03 * s; pos.y -= 0.045 * s; pos.z += 0.02 * s; ex -= 0.32 * s; ey += 0.62 * s; ez += 0.28 * s; }
    if (this.drawT > 0) { this.drawT = Math.max(0, this.drawT - dt / 0.22); const e = this.drawT * this.drawT; pos.y -= 0.13 * e; ex -= 0.7 * e; ez += 0.2 * e; }
    if (w.reloading && !(w.kind === 'shotgun' && w.shellReload)) { const s = Math.sin(Math.PI * w.reloadPhase); ez += 0.55 * s; ex += 0.2 * s; pos.y -= 0.03 * s; pos.x -= 0.02 * s; }
    if (w.kind === 'sniper' && w.boltPhase > 0) { const b = w.boltPhase; ez += 0.22 * b; ex += 0.06 * b; pos.y -= 0.012 * b; }
    if (w.kind === 'shotgun') {
      const k = w.pumpPhase; ex += 0.05 * k; pos.z += 0.012 * k;
      if (w.reloading && w.shellReload) { ez += 0.45; ex += 0.22; pos.y -= 0.03 + (w.shellBob || 0) * 0.012; pos.x -= 0.02; }
    }
    if (w.kind === 'knife' && w.swing) {
      const sw = w.swing, t = clamp(sw.t / sw.dur, 0, 1);
      if (sw.heavy) { const wind = t < 0.3 ? t / 0.3 : 1, thrust = t < 0.3 ? 0 : t < 0.5 ? (t - 0.3) / 0.2 : 1 - (t - 0.5) / 0.5; pos.z += 0.06 * wind * (1 - thrust) - 0.2 * thrust; pos.y += 0.03 * thrust; ex -= 0.6 * thrust; ey -= 0.3 * thrust; }
      else { const a = Math.sin(Math.PI * t), dir = sw.side; pos.x -= 0.15 * a * dir; pos.z -= 0.08 * a; ey += 1.0 * a * dir; ez -= 0.8 * a * dir; ex -= 0.3 * a; }
    }
    if (w.kind === 'grenade') {
      if (w.state === 'pulling' || w.state === 'ready') { const k = w.state === 'ready' ? 1 : clamp(w.t / THROW.pinTime, 0, 1), c = (w.power - 1) / 2; pos.z += (0.08 + 0.07 * c) * k; pos.y += (0.04 + 0.03 * c) * k; ex += (0.5 + 0.35 * c) * k; if (vm.pin) vm.pin.position.x = 0.028 + 0.05 * k; }
      else if (w.state === 'throwing') { const k = clamp(w.t / 0.38, 0, 1); pos.z -= 0.3 * Math.sin(k * Math.PI); pos.y -= 0.1 * k; ex -= 1.2 * Math.sin(k * Math.PI); if (vm.nade) vm.nade.visible = k < 0.15; }
      else { if (vm.pin) vm.pin.position.x = 0.028; if (vm.nade) vm.nade.visible = w.count > 0; }
    }
    const la = this.leftArm.group;
    if (this.grabT > 0) {
      const t = this.grabT, k = t < 0.12 ? t / 0.12 : t < 0.22 ? 1 : Math.max(0, 1 - (t - 0.22) / 0.23), e = 1 - (1 - k) * (1 - k);
      la.visible = true; la.position.set(lerp(-0.34, -0.03, e), lerp(-0.36, -0.07, e), lerp(-0.1, -0.46, e)); la.rotation.set(lerp(0.6, 0.05, e), lerp(0.7, 0.1, e), lerp(0.4, 0, e));
      pos.x += 0.07 * e; pos.y -= 0.06 * e; ez -= 0.35 * e; ey -= 0.25 * e;
    } else la.visible = false;
    grp.position.copy(pos); grp.rotation.set(ex, ey, ez);
  }

  onResize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
}

