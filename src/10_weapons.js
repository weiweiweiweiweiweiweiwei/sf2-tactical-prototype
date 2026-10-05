/* =====================================================================
   PLAYER WEAPONS — per-class behaviour, all numbers come from the
   compiled WEAPON_DATABASE entry. Spread values are cone radii in
   radians; the HUD crosshair gap is derived from the real spread.
   v25: a weapon belongs to an OWNER (the local player, or a remote human simulated on the host). Gameplay runs in
   tick() once per fixed step; animate() only moves the local viewmodel. The spread cone is drawn from a seeded stream
   (owner network id + shot number) so the host and the shooter's own client fire the very same bullet.
   ===================================================================== */
class Weapon {
  constructor(game, def, vm, owner) {
    this.game = game; this.def = def; this.vm = vm; this.owner = owner || game.player; Object.assign(this, def);
    this.ammo = def.mag || 0; this.reserveAmmo = def.reserve || 0; this.shotN = 0;
    this.cooldown = 0; this.bloom = 0; this.shots = 0; this.lastShot = -10; this.sprayPhase = 0;
    this.reloading = false; this.reloadT = 0; this.reloadFired = new Set();
    this.queued = 0; this.autoReloadT = 0; this.flashT = 0; this.slideKick = 0; this.cur = 0;
    this.magBase = vm.mag ? vm.mag.position.clone() : null;
    this.chargeBase = vm.charge ? vm.charge.position.clone() : null;
  }
  get local() { return this.owner === this.game.player; }
  get scoped() { return this.adsType === '2d_scope_overlay'; }
  resetAmmo() { this.ammo = this.def.mag || 0; this.reserveAmmo = this.def.reserve || 0; this.shotN = 0; }
  equip() {
    this.cooldown = 0; this.reloading = false; this.reloadT = 0; this.bloom = 0; this.cur = 0; this.shots = 0; this.queued = 0; this.autoReloadT = 0; this.flashT = 0;
    if (this.vm.mag) { this.vm.mag.position.copy(this.magBase); this.vm.mag.rotation.set(0, 0, 0); }
    if (this.vm.cover) this.vm.cover.rotation.x = 0;
    if (this.ammo === 0 && this.reserveAmmo > 0) this.autoReloadT = 0.2; // auto reload an empty gun on draw
  }
  holster() { this.reloading = false; this.queued = 0; this.autoReloadT = 0; if (this.vm.flash) this.vm.flash.visible = false; }
  get reloadPhase() { return this.reloading ? clamp(this.reloadT / this.reloadTime, 0, 1) : 0; }
  // mechanical sounds: in your head for your own gun, positional for anyone else's
  _mech(name) { this.game.audio.mech(name, this.local ? null : this.owner.motor.pos); }

  tryReload() {
    if (!this.mag || this.reloading || this.ammo >= this.mag || this.reserveAmmo <= 0) return false;
    this.reloading = true; this.reloadT = 0; this.reloadFired.clear(); this.queued = 0;
    return true;
  }

  moveFactor() { const hs = this.owner.motor.horizontalSpeed(); return clamp((hs - 0.5) / Math.max(0.5, this.def.moveSpeed - 0.5), 0, 1.4); }

  // DYNAMIC ACCURACY (default): currentSpread starts at exactly 0 — a tapped shot goes perfectly straight down the
  // camera ray. Holding the trigger blooms it per shot up to bloomMax (a 10 m target stays hittable) and it snaps
  // back to 0 as soon as you stop. ADS keeps 45 % of the bloom; jumping / sprinting still throw the shot.
  spread(ws) {
    if ((this.owner.hipMode || Settings.data.hipMode) === 'shotgun') return this.spreadLegacy(ws);
    const p = this.owner, m = p.motor;
    let s = this.cur * (ws.ads ? (this.def.adsVertical ? 0 : 0.45) : 1); // v45 adsVertical: aimed shots go where the dot is
    if (!m.grounded) s += this.spreadAir;
    if (p.sprinting) s += this.spreadSprint * 0.5;
    if (m.crouching && m.grounded) s *= 0.8;
    return s;
  }
  // v2/v3 model (Settings → 腰射散布：散彈式): hip fire = wide cone, only close range; movement widens both.
  spreadLegacy(ws) {
    const p = this.owner, m = p.motor, mv = this.moveFactor(), ads = ws.ads;
    let s = ads ? this.adsBase + this.adsMoveSpread * mv * mv + this.bloom * this.adsBloomMult
      : this.hipBase + this.spreadMove * mv * mv + this.bloom;
    if (p.sprinting) s += this.spreadSprint;
    if (!m.grounded) s += this.spreadAir;
    if (m.crouching && m.grounded) s *= this.spreadCrouch;
    return s;
  }

  // Spray pattern from the database: first shot, climb, late spray, then a sinusoidal horizontal drift.
  // (named recoilKick: `recoil` is also a def field copied onto the instance by Object.assign)
  recoilKick() {
    const r = this.def.recoil, n = this.shots;
    if (!r) return [0.012, rand(-0.003, 0.003)];
    const pitch = n <= 1 ? r.first : n <= r.climbShots ? r.climb : r.late;
    const yaw = n < r.hStart ? rand(-r.jitter, r.jitter) : r.h * Math.sin((n - r.hStart) * 0.5 + this.sprayPhase) + rand(-r.jitter, r.jitter);
    return [pitch * rand(0.9, 1.1), yaw];
  }

  // v25: the aim ray comes from the owner's eye and AIM angles, not from the camera. Aim = view + recoil + punch (what the
  // crosshair shows); a remote human's view angles and recoil offsets both arrive in its UserCmd.
  static _o = new THREE.Vector3(); static _d = new THREE.Vector3(); static _r = new THREE.Vector3(); static _u = new THREE.Vector3();
  aimRay() {
    const p = this.owner, local = this.local, yaw = local ? p.yaw + p.recoilYaw : p.yaw + (p.aimDY || 0), pitch = local ? p.pitch + p.recoilPitch + p.punch : p.pitch + (p.aimDP || 0);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw), m = p.motor;
    if (local) Weapon._o.set(m.pos.x, m.pos.y + p.eyeH + m.stepOffset, m.pos.z); else p.eyePos(Weapon._o);
    return { o: Weapon._o, d: Weapon._d.set(-sy * cp, sp, -cy * cp), r: Weapon._r.set(cy, 0, -sy), u: Weapon._u.set(sy * sp, cp, cy * sp) };
  }
  muzzleWorld(ray, ws) {
    if (!this.local) return this.owner.muzzlePos || ray.o.clone();
    if (this.vm.muzzle && !(ws.scopedIn && this.scoped)) { this.vm.group.updateMatrixWorld(); return this.vm.muzzle.getWorldPosition(new THREE.Vector3()); }
    return ray.o.clone().addScaledVector(ray.u, -0.08).addScaledVector(ray.d, 0.5);
  }
  _cone(ray, s, out, R) {
    out.copy(ray.d);
    if (s > 0) { const rr = s * Math.sqrt(R()), a = R() * Math.PI * 2; out.addScaledVector(ray.r, Math.cos(a) * rr).addScaledVector(ray.u, Math.sin(a) * rr).normalize(); }
    return out;
  }
  _shoot(ray, ws, R) { const s = this.spread(ws); return this.game.fireBullet(this.owner, ray.o.clone(), this._cone(ray, s, new THREE.Vector3(), R), this.def); }

  fire(ws) {
    const g = this.game, p = this.owner;
    if (this.reloading) return false;
    if (this.ammo <= 0) { this._mech('dry'); this.cooldown = 0.22; if (this.tryReload()) ws.setAds(false, true); return false; }
    this.ammo--;
    this.cooldown = Math.max(Math.min(this.cooldown, 0), -this.interval) + this.interval;
    const now = ws.clock; // the arsenal's fixed-step clock (identical on host and client)
    if (now - this.lastShot > this.interval * 2.2) this.sprayPhase = rand(0, Math.PI * 2);
    const ray = this.aimRay();
    const res = this._shoot(ray, ws, shotRng(p.netId | 0, ++this.shotN));
    this.shots = now - this.lastShot < this.interval * 2.2 ? this.shots + 1 : 1;
    this.lastShot = now;
    this.bloom = Math.min(this.bloom + (this.spreadPerShot || 0), this.spreadMax || 0);
    this.cur = Math.min(this.cur + (this.bloomPerShot || 0), this.bloomMax || 0); // applies from the NEXT shot
    const mz = this.muzzleWorld(ray, ws);
    if (this.local) {
      let [rp, ry] = this.recoilKick(); const am = ws.ads ? (this.def.adsRecoilMult ?? 0.8) : 1;
      if (ws.ads && this.def.adsVertical) { ry = 0; rp = Math.min(rp, Math.max(0, this.def.adsVertical - p.recoilTP)); } // v45 SF2 aimed spray: climbs straight up to a cap, no side drift
      p.addRecoil(rp * am, ry * am);
      p.punchV += (this.kick ? this.kick.rx : 0.05) * (ws.ads ? 0.9 : 0.7); // small per-shot camera shudder on top of the recoil
      ws.kick(this.kick);
      this.flashT = 0.045;
      const big = this.kind === 'sniper' || this.kind === 'shotgun';
      g.effects.playerMuzzleLight(mz, this.suppressed ? 0.25 : big ? 1.4 : 1);
      ws.muzzleLight(this.suppressed ? 0.25 : 1);
      if (this.tracerEvery && this.shots % this.tracerEvery === 0 && !(ws.scopedIn && this.scoped)) g.effects.tracer(mz, res.end, this.kind === 'sniper' ? 520 : 400, this.kind === 'sniper' ? 6 : 3.5);
      if (this.kind !== 'sniper' && this.kind !== 'shotgun') this.ejectCasing(ray, false);
      g.audio.gunshot(this.sound, null, this.soundRate);
    } else g.thirdPersonShot(p, this.def, mz, res.end, this.shots);
    g.recordShot(p, mz, res.end, this.def);
    g.emitNoise(p.motor.pos, this.noise, p.team);
    p.onAttack();
    if (this.ammo === 0 && this.reserveAmmo > 0) this.autoReloadT = 0.3;
    return true;
  }

  ejectCasing(ray, big) {
    if (!this.local) return;
    const g = this.game, v = this.owner.motor.vel;
    const pos = ray.o.clone().addScaledVector(ray.r, 0.16).addScaledVector(ray.u, -0.12).addScaledVector(ray.d, 0.32);
    const vel = new THREE.Vector3().addScaledVector(ray.r, rand(1.6, 2.5)).addScaledVector(ray.u, rand(1.1, 1.8)).addScaledVector(ray.d, rand(-0.4, 0.3)).add(v);
    g.physics.ejectCasing(pos, vel, big);
  }

  // gameplay, once per fixed step
  tick(h, ws) {
    this.cooldown -= h;
    if (!ws.trigger && this.cooldown < 0) this.cooldown = 0;
    const spraying = ws.clock - this.lastShot < (this.interval || 0.1) * 1.6; // bloom only recovers once you stop spraying
    this.bloom = damp(this.bloom, 0, spraying ? 1 : (this.spreadRecover || 5), h);
    if (!spraying) { this.cur = damp(this.cur, 0, 11, h); if (this.cur < 2e-4) this.cur = 0; } // quick recenter to a perfect first shot
    if (this.autoReloadT > 0) { this.autoReloadT -= h; if (this.autoReloadT <= 0 && this.tryReload()) ws.setAds(false, true); }
    this._reload(h);
  }
  // local viewmodel, once per rendered frame
  animate(dt, ws) {
    if (this.flashT > 0) this.flashT -= dt;
    this.slideKick = damp(this.slideKick, 0, 18, dt);
    const vm = this.vm, p = this.reloadPhase;
    if (vm.mag && this.magBase) {
      let off = 0;
      if (p > 0.15 && p < 0.35) off = (p - 0.15) / 0.2; else if (p >= 0.35 && p < 0.55) off = 1; else if (p >= 0.55 && p < 0.72) off = 1 - (p - 0.55) / 0.17;
      vm.mag.position.copy(this.magBase).addScaledVector(vm.magMove, off);
      vm.mag.rotation.x = off * vm.magRot;
    }
    if (vm.cover) { const k = p > 0.08 && p < 0.9 ? Math.min(1, (p - 0.08) / 0.1, (0.9 - p) / 0.1) : 0; vm.cover.rotation.x = k * 0.9; }
    if (vm.charge && this.chargeBase) {
      const k = p > 0.8 && p < 0.92 ? Math.sin((p - 0.8) / 0.12 * Math.PI) : 0;
      vm.charge.position.z = this.chargeBase.z + k * 0.05;
    }
  }
  _reload(h) {
    if (!this.reloading) return;
    this.reloadT += h;
    for (const [t, snd] of this.reloadSounds) if (this.reloadT >= t * this.reloadTime && !this.reloadFired.has(snd)) { this.reloadFired.add(snd); this._mech(snd); }
    if (this.reloadT >= this.reloadTime) { const take = Math.min(this.mag - this.ammo, this.reserveAmmo); this.ammo += take; this.reserveAmmo -= take; this.reloading = false; }
  }
}

class AutoGun extends Weapon {}

class SniperRifle extends Weapon {
  constructor(game, def, vm, owner) { super(game, def, vm, owner); this.boltT = -1; this.boltBase = vm.bolt ? vm.bolt.position.clone() : null; }
  // CS-style: scoped + standing still = perfect from the first frame the scope is up (firing during the raise = hip accuracy).
  spread(ws) {
    const p = this.owner, m = p.motor, hs = m.horizontalSpeed();
    if (ws.ads && ws.scopedIn) {
      if (!m.grounded) return this.spreadAir * 0.85;
      let s = this.adsBase;
      if (hs > this.scopedThreshold) {
        const scopedMax = this.moveSpeed * this.adsMove;
        s = lerp(0.006, this.scopedMoveMax, clamp((hs - this.scopedThreshold) / Math.max(0.1, scopedMax - this.scopedThreshold), 0, 1));
        if (hs > scopedMax) s += (hs - scopedMax) * 0.018;
      }
      if (m.crouching) s *= 0.7;
      return s;
    }
    const mv = this.moveFactor();
    return this.hipBase + this.spreadMove * mv + (p.sprinting ? this.spreadSprint : 0) + (m.grounded ? 0 : this.spreadAir);
  }
  recoilKick() { return [this.def.recoil.climb, rand(-1, 1) * this.def.recoil.h]; }
  // bolt actions cycle (and drop out of the scope) after every shot; semi-autos (Barrett / SVD) stay scoped
  fire(ws) { const ok = super.fire(ws); if (ok) { if (this.def.bolt) { this.boltT = 0; this.boltFired = { back: false, fwd: false }; ws.unscopeT = 0.06; } else this.ejectCasing(this.aimRay(), true); } return ok; }
  equip() { super.equip(); this.boltT = -1; if (this.vm.bolt) { this.vm.bolt.position.copy(this.boltBase); this.vm.bolt.rotation.set(0, 0, 0); } }
  animate(dt, ws) {
    super.animate(dt, ws);
    const b = this.vm.bolt;
    if (this.boltT >= 0 && b) {
      this.boltT += dt; const t = this.boltT;
      if (t > 0.32 && !this.boltFired.back) { this.boltFired.back = true; this.game.audio.mech('boltback'); this.ejectCasing(this.aimRay(), true); }
      if (t > 0.72 && !this.boltFired.fwd) { this.boltFired.fwd = true; this.game.audio.mech('boltfwd'); }
      const up = t < 0.25 ? 0 : t < 0.38 ? (t - 0.25) / 0.13 : t < 0.8 ? 1 : t < 0.95 ? 1 - (t - 0.8) / 0.15 : 0;
      const back = t < 0.38 ? 0 : t < 0.52 ? (t - 0.38) / 0.14 : t < 0.66 ? 1 : t < 0.8 ? 1 - (t - 0.66) / 0.14 : 0;
      b.rotation.z = up * 1.25; b.position.set(this.boltBase.x, this.boltBase.y, this.boltBase.z + back * 0.075);
      if (t > 1.0) this.boltT = -1;
    }
  }
  get boltPhase() { if (this.boltT < 0) return 0; const t = this.boltT; return t < 0.25 ? 0 : t < 0.5 ? (t - 0.25) / 0.25 : t < 0.8 ? 1 : t < 1 ? 1 - (t - 0.8) / 0.2 : 0; }
}

// Pump shotgun: N pellets per shell, pump cycle after every shot, shell-by-shell reload that firing can interrupt.
class Shotgun extends Weapon {
  constructor(game, def, vm, owner) { super(game, def, vm, owner); this.pumpT = -1; this.pumpBase = vm.pump ? vm.pump.position.clone() : null; this.shellT = 0; this.needPump = false; }
  equip() { super.equip(); this.pumpT = -1; this.shellT = 0; if (this.vm.pump) this.vm.pump.position.copy(this.pumpBase); }
  get reloadPhase() { return this.reloading ? (this.shellReload ? clamp(this.ammo / this.mag, 0, 1) : clamp(this.reloadT / this.reloadTime, 0, 1)) : 0; }
  spread(ws) { return this.spreadLegacy(ws); } // the pellet pattern IS the spread
  tryReload() {
    if (!this.shellReload) return super.tryReload(); // box-magazine shotgun (Saiga-12)
    if (!this.mag || this.reloading || this.ammo >= this.mag || this.reserveAmmo <= 0) return false;
    this.reloading = true; this.shellT = this.shellReload * 0.6; this.needPump = this.ammo === 0; this.queued = 0;
    return true;
  }
  _shoot(ray, ws, R) {
    const g = this.game, s = this.spread(ws), dir = new THREE.Vector3();
    let res = null;
    for (let i = 0; i < this.pellets; i++) {
      const r = g.fireBullet(this.owner, ray.o.clone(), this._cone(ray, s, dir, R), this.def, { pellet: i });
      if (!res || r.dist < res.dist) res = r;
    }
    return res;
  }
  fire(ws) {
    if (this.shellReload && this.reloading && this.ammo > 0) { this.reloading = false; this.cooldown = Math.max(this.cooldown, 0.12); return false; } // fire cancels a shell reload
    const ok = super.fire(ws);
    if (ok) { if (this.def.pump) { this.pumpT = 0; this.pumpSnd = false; } else this.ejectCasing(this.aimRay(), true); if (this.local) this.owner.punchV += 0.25; }
    return ok;
  }
  _reload(h) {
    if (!this.shellReload) return super._reload(h);
    if (!this.reloading) return;
    this.shellT -= h;
    if (this.shellT <= 0) {
      if (this.ammo < this.mag && this.reserveAmmo > 0) { this.ammo++; this.reserveAmmo--; this._mech('shell'); this.shellT = this.shellReload; this.shellBob = 1; }
      else { this.reloading = false; if (this.needPump && this.def.pump) { this.pumpT = 0; this.pumpSnd = false; } else if (this.needPump) this._mech('charge'); }
    }
  }
  animate(dt, ws) {
    super.animate(dt, ws);
    this.shellBob = damp(this.shellBob || 0, 0, 9, dt);
    if (this.pumpT >= 0) {
      this.pumpT += dt; const t = this.pumpT;
      if (t > 0.22 && !this.pumpSnd) { this.pumpSnd = true; this.game.audio.mech('pump'); this.ejectCasing(this.aimRay(), true); }
      const k = t < 0.22 ? 0 : t < 0.36 ? (t - 0.22) / 0.14 : t < 0.5 ? 1 - (t - 0.36) / 0.14 : 0;
      if (this.vm.pump) this.vm.pump.position.set(this.pumpBase.x, this.pumpBase.y, this.pumpBase.z + k * 0.085);
      if (t > 0.55) this.pumpT = -1;
    }
  }
  get pumpPhase() { if (this.pumpT < 0) return 0; const t = this.pumpT; return t < 0.2 ? 0 : t < 0.36 ? (t - 0.2) / 0.16 : t < 0.55 ? 1 - (t - 0.36) / 0.19 : 0; }
}

class Pistol extends Weapon {
  recoilKick() { return [this.def.recoil.climb * rand(0.9, 1.1), rand(-1, 1) * this.def.recoil.h]; }
  fire(ws) { const ok = super.fire(ws); if (ok) this.slideKick = 1; return ok; }
  animate(dt, ws) { super.animate(dt, ws); if (this.vm.slide) this.vm.slide.position.z = this.slideKick * 0.028 + (this.ammo === 0 && !this.reloading ? 0.028 : 0); }
}

class Knife extends Weapon {
  constructor(game, def, vm, owner) { super(game, def, vm, owner); this.pending = null; this.swing = null; this.side = 1; this.queuedHeavy = false; }
  spread() { return 0.002; }
  equip() { super.equip(); this.pending = null; this.swing = null; }
  holster() { super.holster(); this.pending = null; this.swing = null; }
  attack(heavy) {
    if (this.cooldown > 0) { this.queuedHeavy = heavy; this.queued = 0.12; return; }
    const d = heavy ? this.stab : this.slash;
    this.cooldown = d.interval; this.side = -this.side;
    this.swing = { heavy, t: 0, dur: heavy ? 0.5 : 0.3, side: this.side };
    this.pending = { t: d.delay, d, heavy };
    this.game.audio.knifeSwing(this.local ? null : this.owner.motor.pos); this.owner.onAttack();
  }
  tick(h) {
    this.cooldown = Math.max(0, this.cooldown - h);
    if (this.queued > 0) { this.queued -= h; if (this.cooldown <= 0) { this.queued = 0; this.attack(this.queuedHeavy); } }
    if (this.swing) { this.swing.t += h; if (this.swing.t >= this.swing.dur) this.swing = null; }
    if (this.pending) { this.pending.t -= h; if (this.pending.t <= 0) { const p = this.pending; this.pending = null; this._hit(p.d, p.heavy); } }
  }
  animate() {}
  _hit(d, heavy) {
    const g = this.game, p = this.owner, ray = this.aimRay(), at = this.local ? null : p.motor.pos;
    let best = null;
    for (const [yaw, pitch] of [[0, 0], [0.13, 0], [-0.13, 0], [0, 0.09], [0, -0.09]]) {
      const dir = ray.d.clone().addScaledVector(ray.r, yaw).addScaledVector(ray.u, pitch).normalize();
      const h = g.meleeTrace(p, ray.o, dir, d.range);
      if (h && (!best || (h.target && !best.target) || (!!h.target === !!best.target && h.t < best.t))) best = h;
    }
    if (!best) return;
    if (best.target) {
      const v = best.target, to = TMP_V1.subVectors(v.motor.pos, p.motor.pos).setY(0).normalize();
      const backstab = v.forward(TMP_V2).dot(to) > 0.35;
      let dmg = d.dmg * (best.part === 'head' ? this.def.headMult : 1);
      if (backstab) dmg = heavy ? 999 : dmg * 2;
      g.applyDamage(v, dmg, best.part, p, this.def, ray.d.clone(), best.point, { melee: true });
      g.audio.knifeHit(true, at);
    } else { g.effects.impact(best, false); g.audio.knifeHit(false, at); }
  }
}

// Grenades: hold to charge like a bow (throwPower 1.0 → 3.0); the thrower's full velocity is added,
// so a charged throw off a running jump flies much further than a quick flick.
const THROW = { base: 7.2, lobBase: 4.6, chargeTime: 0.7, pinTime: 0.25, maxPower: 3.0, loft: 0.16 }; // full charge ≈ 1.0 s (pin 0.25 + draw 0.7)
class GrenadeWeapon extends Weapon {
  constructor(game, def, vm, owner) { super(game, def, vm, owner); this.count = def.count; this.state = 'idle'; this.t = 0; this.lob = false; this.releaseQueued = false; this.chargeT = 0; }
  resetAmmo() { this.count = this.def.count; this.shotN = 0; }
  equip() { super.equip(); this.state = 'idle'; this.t = 0; this.releaseQueued = false; this.chargeT = 0; if (this.vm.pin) this.vm.pin.visible = true; }
  holster() { super.holster(); this.state = 'idle'; this.chargeT = 0; }
  spread() { return 0.01; }
  get power() { return 1 + (THROW.maxPower - 1) * clamp(this.chargeT / THROW.chargeTime, 0, 1); }
  get charging() { return this.state === 'pulling' || this.state === 'ready'; }
  press(btn) {
    if (this.count <= 0 || this.state !== 'idle' || !this.game.canAct()) return;
    this.state = 'pulling'; this.t = 0; this.chargeT = 0; this.lob = btn === 2; this.releaseQueued = false;
    this._mech('pin');
  }
  release() { if (this.state === 'pulling') this.releaseQueued = true; else if (this.state === 'ready') this._throw(); }
  _throw() {
    const g = this.game, p = this.owner, ray = this.aimRay(), power = this.power;
    this.count--; this.state = 'throwing'; this.t = 0;
    const origin = ray.o.clone().addScaledVector(ray.r, 0.18).addScaledVector(ray.u, -0.08).addScaledVector(ray.d, 0.45);
    const dir = ray.d.clone().addScaledVector(TMP_V1.set(0, 1, 0), THROW.loft).normalize();
    const vel = dir.multiplyScalar((this.lob ? THROW.lobBase : THROW.base) * power).add(p.motor.vel); // momentum: player velocity + aim × power × base
    g.throwGrenade(p, this.def, origin, vel);
    this._mech('throw'); p.onAttack(); this.chargeT = 0;
    if (this.vm.pin) this.vm.pin.visible = false;
  }
  tick(h, ws) {
    this.t += h;
    if (this.state === 'ready') this.chargeT += h; // the bow is drawn only once the pin is out: a quick click = weak lob
    if (this.state === 'pulling' && this.t > THROW.pinTime) { this.state = 'ready'; if (this.vm.pin) this.vm.pin.visible = false; if (this.releaseQueued) this._throw(); }
    if (this.state === 'throwing' && this.t > 0.38) {
      this.state = 'idle';
      if (this.count > 0) { if (this.vm.pin) this.vm.pin.visible = true; ws.drawT = 1; } else ws.switchBack();
    }
  }
  animate() {}
}

function makePlayerWeapon(game, def, vm, owner) {
  if (def.kind === 'sniper') return new SniperRifle(game, def, vm, owner);
  if (def.kind === 'shotgun') return new Shotgun(game, def, vm, owner);
  if (def.kind === 'pistol') return new Pistol(game, def, vm, owner);
  if (def.kind === 'knife') return new Knife(game, def, vm, owner);
  if (def.kind === 'grenade') return new GrenadeWeapon(game, def, vm, owner);
  return new AutoGun(game, def, vm, owner);
}
