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
    // the camera: on the aimed sight line (Zoom's last frame, the peep → post line runs along +Z), as deep as the head bone
    // (6.4 cm behind the peep), with SF2's own viewmodel lenses (def.vmHFov / vmAdsHFov, horizontal). v62f: checked on the
    // user's SF2 ADS screenshot (10-27) — the peep ring 267 px at 1080p there and here. (v62 had the eye 3 cm back with a
    // 48° vertical lens: the right ring from the wrong pair, the gun 1.8× too small.) One camera for every pose, as in SF2.
    // v62h guns without a fitted peep (no SIGHT mark: AK-103, G36C): the eye level with the front sight's tip (POST), as deep as
    // SF2 puts it through the weapon's own vLocZoomIN (the mesh's aimed offset, UE cm, x forward): head z − 3 cm − x / 100 —
    // the M4A1's −3 gives the head depth the screenshot fit found.
    // Rig space is +Z forward, −X right, +Y up: turned half a turn about Y it is camera space.
    this.pose({ Zoom: [this.dur('Zoom'), 1] });
    const sm = m.getObjectByName('SIGHT'), head = m.getObjectByName('Bip01-Head').getWorldPosition(new THREE.Vector3());
    const s = (sm || m.getObjectByName('POST')).getWorldPosition(new THREE.Vector3());
    const eye = new THREE.Vector3(s.x, s.y, sm ? (o.eyeRelief != null ? s.z - o.eyeRelief : head.z) : head.z - 0.03 - (o.zoomIn ? o.zoomIn[0] : -3) / 100);
    m.rotation.y = Math.PI; m.position.set(eye.x, -eye.y, eye.z);
    this.reloadSounds = o.reloadSounds || null;
    // v62d play the Equip clip over the gun's draw time (def.equipTime, SF2's own 0.8 s for the M4A1); with none, the old 1.6×
    this.equipRate = o.equipTime ? this.dur('Equip') / o.equipTime : (o.equipRate || 1.6);
    this.zoomFireWeight = o.zoomFireWeight ?? 1; // v62f full again: 2 cm back with the eye 6.4 cm behind the peep is SF2's own (v62 had 0.3 for a 3 cm eye)
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
      // ZoomFire is a straight 2 cm push back (zoomFireWeight scales it over Zoom; a nearer eye would need it smaller)
      const cap = this.fireClip === 'ZoomFire' ? this.zoomFireWeight : 1;
      if (this.fireT >= d) this.fireT = -1; else { const k = rest * cap * fade(this.fireT, d, 0, 0.18); w[this.fireClip] = [this.fireT, k]; rest -= k; }
    }
    const run = rest * s.sprint, aim = (rest - run) * s.ads;
    if (run > 0) w.dash = [this.dashT, run];
    if (aim > 0) w.Zoom = [this.zoomT, aim];
    w.Idle = [this.idleT, rest - run - aim];
    this.pose(w);
  }
}
