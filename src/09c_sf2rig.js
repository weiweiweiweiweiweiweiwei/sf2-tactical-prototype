/* =====================================================================
   v62 SF2's OWN FIRST-PERSON ANIMATION — tools/sf2_rig_build.mjs joins the gun parts, sleeves and gloves on one Bip01
   skeleton with the animset's clips (<id>_sf2_rig.glb, window.GUN_GLB). Every clip is a full pose of arms + gun, so the
   viewmodel is not moved in code any more: each frame the clips are weighed from the game's state — Idle ↔ Zoom by the ADS
   blend, dash by the sprint blend — and the one-shots go on top (Reload stretched over the reload, Equip on a draw,
   Fire / ZoomFire per shot). Weights always add up to 1 (a lower layer gets what the one above leaves).
   ===================================================================== */
class SF2Rig {
  constructor(gltf, o = {}) {
    const m = this.model = SkeletonUtils.clone(gltf.scene);
    m.traverse((x) => {
      if (!x.isMesh) return;
      x.frustumCulled = false; x.castShadow = false; x.receiveShadow = true; // (skinned: the bind-pose bounds are elsewhere)
      if (x.name === 'sleeve' || x.name === 'glove') x.userData.arm = true;
    });
    this.mixer = new THREE.AnimationMixer(m); this.a = {};
    for (const c of gltf.animations) { const a = this.mixer.clipAction(c); a.play(); a.paused = true; a.setEffectiveWeight(0); this.a[c.name] = a; }
    // the camera: on the aimed sight line (Zoom's last frame, the peep → post line runs along +Z), eyeRelief behind the peep's
    // rear face. 3 cm reproduces the user's SF2 ADS screenshot (v61: the post the same size, the ring as big); the head bone
    // would put it 6.4 cm back and the ring a third smaller. One camera for every pose, as in SF2 — the clips do the rest.
    // Rig space is +Z forward, −X right, +Y up: turned half a turn about Y it is camera space.
    this.pose({ Zoom: [this.dur('Zoom'), 1] });
    const s = m.getObjectByName('SIGHT').getWorldPosition(new THREE.Vector3()), eye = new THREE.Vector3(s.x, s.y, s.z - (o.eyeRelief ?? 0.03));
    m.rotation.y = Math.PI; m.position.set(eye.x, -eye.y, eye.z);
    this.reloadSounds = o.reloadSounds || null;
    this.equipRate = o.equipRate || 1.6; // SF2's Equip is ~1 s; here a drawn gun can fire at once, so it plays faster
    this.idleT = 0; this.zoomT = 0; this.dashT = 0; this.fireT = -1; this.fireClip = 'Fire'; this.equipT = -1; this.lastDraw = 0;
  }
  dur(k) { return this.a[k] ? this.a[k].getClip().duration : 0; }
  // { clip: [time, weight] }, every other clip off
  pose(w) {
    for (const [k, a] of Object.entries(this.a)) { const v = w[k]; a.setEffectiveWeight(v ? v[1] : 0); if (v) a.time = v[0]; }
    this.mixer.update(0);
  }
  fire(ads) { this.fireT = 0; this.fireClip = ads ? 'ZoomFire' : 'Fire'; this.equipT = -1; }
  // s: { ads 0–1, sprint 0–1, reload phase 0–1 or −1, draw (WeaponSystem.drawT: 1 on a switch, running down) }
  update(dt, s) {
    const w = {}, fade = (t, d, i, o) => Math.max(0, Math.min(1, i > 0 ? t / i : 1, o > 0 ? (d - t) / o : 1));
    let rest = 1;
    if (s.draw > this.lastDraw + 0.5) { this.equipT = 0; this.fireT = -1; }
    this.lastDraw = s.draw;
    this.idleT = (this.idleT + dt) % this.dur('Idle'); this.zoomT = (this.zoomT + dt) % this.dur('Zoom'); this.dashT = (this.dashT + dt) % this.dur('dash');
    if (s.reload >= 0) { // the clip stretched over the game's reload time; in / out over a few frames
      const d = this.dur('Reload'), k = fade(s.reload, 1, 0.05, 0.08); w.Reload = [s.reload * d, k]; rest -= k; this.fireT = -1; this.equipT = -1;
    }
    if (this.equipT >= 0) {
      const d = this.dur('Equip'); this.equipT += dt * this.equipRate;
      if (this.equipT >= d) this.equipT = -1; else { const k = rest * fade(this.equipT, d, 0, 0.12); w.Equip = [this.equipT, k]; rest -= k; }
    }
    if (this.fireT >= 0) {
      const d = this.dur(this.fireClip); this.fireT += dt;
      if (this.fireT >= d) this.fireT = -1; else { const k = rest * fade(this.fireT, d, 0, 0.18); w[this.fireClip] = [this.fireT, k]; rest -= k; }
    }
    const run = rest * s.sprint, aim = (rest - run) * s.ads;
    if (run > 0) w.dash = [this.dashT, run];
    if (aim > 0) w.Zoom = [this.zoomT, aim];
    w.Idle = [this.idleT, rest - run - aim];
    this.pose(w);
  }
}
