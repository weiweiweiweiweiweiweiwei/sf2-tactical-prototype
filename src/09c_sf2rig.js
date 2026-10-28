import { SkeletonUtils, THREE, clamp, lerp, rand } from './01_core.js';
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
      if (x.material && x.material.transparent) { x.userData.noAO = true; x.renderOrder = 3; } // v64 an optic's lens: out of the AO pass (it greyed the window), drawn after the gun
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
    // v64 an optic (EOTech / Reflex): its ZoomCrosshair socket (the DOT mark) is the aim point, the eye o.eyeRelief behind it
    // (the user's SF2 G36C EOTech ADS shot, 10-28: the window half the screen wide → 6 cm), else at the vLocZoomIN depth
    const sm = m.getObjectByName('SIGHT'), dm = m.getObjectByName('DOT'), head = m.getObjectByName('Bip01-Head').getWorldPosition(new THREE.Vector3());
    const s = (sm || dm || m.getObjectByName('POST')).getWorldPosition(new THREE.Vector3());
    const eye = new THREE.Vector3(s.x, s.y, (sm || dm) && o.eyeRelief != null ? s.z - o.eyeRelief : sm ? head.z : head.z - 0.03 - (o.zoomIn ? o.zoomIn[0] : -3) / 100);
    m.rotation.y = Math.PI; m.position.set(eye.x, -eye.y, eye.z);
    // v62i at the hip SF2 holds the mesh at vLocZoomOut, aimed at vLocZoomIN (UE cm: x forward, y right, z up), blended by the aim:
    // the hip eye = the aimed eye + (in − out) in rig space (−y, z, x) / 100 (M4A1: 2 cm further back and 0.87 cm lower)
    const zi = o.zoomIn || [-3, 0, 0], zo = o.zoomOut || [0, 0, 0];
    this.eyeAim = eye.clone(); this.hipShift = new THREE.Vector3(-(zi[1] - zo[1]), zi[2] - zo[2], zi[0] - zo[0]).multiplyScalar(0.01);
    this.place(0);
    this.reloadSounds = o.reloadSounds || null;
    // v62d play the Equip clip over the gun's draw time (def.equipTime, SF2's own 0.8 s for the M4A1); with none, the old 1.6×
    this.equipRate = o.equipTime ? this.dur('Equip') / o.equipTime : (o.equipRate || 1.6);
    this.zoomFireWeight = o.zoomFireWeight ?? 1; // v62f full again: 2 cm back with the eye 6.4 cm behind the peep is SF2's own (v62 had 0.3 for a 3 cm eye)
    this.idleT = 0; this.zoomT = 0; this.dashT = 0; this.fireT = -1; this.fireClip = 'Fire'; this.equipT = -1; this.lastDraw = 0;
  }
  place(ads) { const e = this.eyeAim, h = this.hipShift, k = 1 - ads; this.model.position.set(e.x + h.x * k, -(e.y + h.y * k), e.z + h.z * k); }
  dur(k) { return this.a[k] ? this.a[k].getClip().duration : 0; }
  // { clip: [time, weight] }, every other clip off
  pose(w) {
    for (const [k, a] of Object.entries(this.a)) { const v = w[k]; a.setEffectiveWeight(v ? v[1] : 0); if (v) a.time = v[0]; }
    this.mixer.update(0);
  }
  fire(ads) { this.fireT = 0; this.fireClip = ads && this.a.ZoomFire ? 'ZoomFire' : 'Fire'; this.equipT = -1; } // (v64 the K14 has no ZoomFire: its Fire works the bolt)
  // s: { ads 0–1, sprint 0–1, reload phase 0–1 or −1, draw (WeaponSystem.drawT: 1 on a switch, running down) }
  update(dt, s) {
    const w = {}, fade = (t, d, i, o) => Math.max(0, Math.min(1, i > 0 ? t / i : 1, o > 0 ? (d - t) / o : 1));
    let rest = 1;
    if (s.draw > this.lastDraw + 0.5) { this.equipT = 0; this.fireT = -1; }
    this.lastDraw = s.draw;
    this.idleT = (this.idleT + dt) % this.dur('Idle'); this.zoomT = (this.zoomT + dt) % this.dur('Zoom'); this.dashT = (this.dashT + dt * 0.6) % this.dur('dash'); // v63e the sprint sway at 0.6× (user: too quick)
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
    this.pose(w); this.place(s.ads);
  }
}

/* v62m SF2's OWN MUZZLE FLASH (user 10-27: SF2's is a soft yellow-white glow, not our star) — the rifle systems
   P_WP_MF_AR_03_NoZoom (hip) and _Zoom (aimed) in SF2_Weapon_fx.upk, their textures from SF2_Env_fx (assets/fx_sf2.js,
   tools/fx_sf2.py). Each layer is one camera-facing sprite per shot (BurstList Count 1): life, size (UE cm = the rig's cm,
   × SizeMultiplyLife), colour (ColorOverLife; additive, over 1 burns to the white core), start spin (turns), offset along
   the barrel. Hip: front flare, 4×4 explosion sequence, star flare, lens glow; aimed: the front flare alone (its four
   prongs round the post) and one slow smoke puff (translucent). scale 0.5 (fromRig): SF2's sizes as they are filled the middle
   of the hip view white and spread the aimed flare's prongs past the rear sight; half reads as SF2's burst (tools/out/_flashshot.mjs).
   v63g (user 10-28: smaller, 0.8 opacity): scale 0.4 and every sprite at 0.8. */
const FLASH_OPACITY = 0.8;
const SF2_FLASH = {
  hip: [
    { tex: 'front', life: [0.03, 0.06], size: [10, 21], grow: [1.732, 1.732], rgb: [0.544, 0.402, 0.248], fadeFrom: 0.3, spin: 0.05 },
    { tex: 'explo', life: [0.03, 0.05], size: [5, 25], grow: [1.742, 1.026], rgb: [7.036, 3.104, 1.973], fwd: 10, sub: 4 },
    { tex: 'star', life: [0.03, 0.05], size: [10, 20], grow: [2.6, 2.981], rgb: [4.638, 2.009, 1.228] },
    { tex: 'lens', life: [0.03, 0.05], size: [25, 50], grow: [1.165, 1.174], rgb: [1.78, 0.929, 0.726], fwd: 10 },
  ],
  ads: [
    { tex: 'front', life: [0.03, 0.06], size: [10, 27], grow: [1.732, 1.732], rgb: [4.657, 1.89, 0.983], spin: 0.03 },
    // (v63g SF2's thin smoke puff, M_thin_smoke_Z_06, left out at the user's word — 10-28)
  ],
};
class SF2Flash {
  static tex() {
    if (SF2Flash._t || !window.SF2_FX) return SF2Flash._t || null;
    const L = new THREE.TextureLoader(), t = SF2Flash._t = {};
    for (const [k, url] of Object.entries(window.SF2_FX)) { t[k] = L.load(url); t[k].colorSpace = THREE.SRGBColorSpace; }
    return t;
  }
  // muzzle: the MUZZLE mark (weapon_root's space: +x along the barrel, in metres)
  constructor(muzzle, scale = 1) {
    const T = SF2Flash.tex(); this.ok = !!T; if (!T) return;
    this.scale = scale; this.layers = { hip: [], ads: [] };
    for (const [mode, defs] of Object.entries(SF2_FLASH)) {
      for (const d of defs) {
        let map = T[d.tex];
        if (d.sub) { map = map.clone(); map.repeat.set(1 / d.sub, 1 / d.sub); } // (a clone shares the image; its own offset per frame)
        const m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: d.smoke ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: d.smoke ? 0 : FLASH_OPACITY });
        const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = d.smoke ? 9 : 10; muzzle.add(s);
        this.layers[mode].push({ d, s, t: 0, life: 0, size: 0, x: 0, v: 0 });
      }
    }
  }
  fire(ads) {
    if (!this.ok) return;
    for (const L of this.layers[ads ? 'ads' : 'hip']) {
      const d = L.d; L.t = 0; L.life = rand(d.life[0], d.life[1]); L.size = rand(d.size[0], d.size[1]) / 100 * this.scale;
      L.x = (d.fwd || 0) / 100; L.v = d.vel ? rand(d.vel[0], d.vel[1]) / 100 : 0;
      L.s.material.rotation = d.spin ? rand(-d.spin, d.spin) * Math.PI * 2 : 0; L.s.visible = true; this.step(L, 0);
    }
  }
  step(L, dt) {
    const d = L.d, s = L.s; L.t += dt; L.x += L.v * dt;
    const k = L.t / L.life; if (k >= 1) { s.visible = false; return; }
    s.position.set(L.x, 0, 0); s.scale.setScalar(L.size * lerp(d.grow[0], d.grow[1], k));
    if (d.smoke) s.material.opacity = 0.5 * Math.min(1, k / 0.15) * Math.min(1, (1 - k) / 0.85); // AlphaOverLife: up to 0.5, then down
    const f = d.fadeFrom != null ? clamp((1 - k) / (1 - d.fadeFrom), 0, 1) : 1;
    s.material.color.setRGB(d.rgb[0] * f, d.rgb[1] * f, d.rgb[2] * f);
    if (d.sub) { const n = d.sub, i = Math.min(n * n - 1, Math.floor(k * n * n)); s.material.map.offset.set((i % n) / n, 1 - (Math.floor(i / n) + 1) / n); }
  }
  update(dt) { if (this.ok) for (const m of ['hip', 'ads']) for (const L of this.layers[m]) if (L.s.visible) this.step(L, dt); }
  hide() { if (this.ok) for (const m of ['hip', 'ads']) for (const L of this.layers[m]) L.s.visible = false; }
}

export { SF2Flash, SF2Rig };
