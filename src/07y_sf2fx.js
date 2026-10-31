import { THREE } from './01_core.js';

/* v66d SF2's ambient particle effects (user 10-31: Desert Camp's dust, smoke, small fires, bugs, blowing paper) — the sprite emitters
   tools/sf2_fx.py reads out of the map's Emitter actors, run on the CPU and drawn as camera-facing quads, one mesh per sheet and blend.
   Every value is SF2's own: a cooked RawDistribution {op, ch, v} — v holds entries evenly spread over the time the module reads (the
   particle's life 0…1; start values at 0), op 2 = random between an entry's min (first half) and max (second half). UE units (cm, turns)
   are simulated in UE space through each emitter's matrix and drawn in game space (x, z, y) / 100, the mirrored-back frame. */
const ev = (d, t, r, k = 0) => {
  if (!d || !d.v || !d.v.length) return null;
  const dims = d.op === 2 ? d.ch / 2 : d.ch, n = d.v.length / d.ch, x = Math.min(1, Math.max(0, t)) * (n - 1), i = Math.min(n - 1, Math.floor(x)), j = Math.min(n - 1, i + 1), a = x - i;
  const at = (e) => { const o = e * d.ch; return d.op === 2 ? d.v[o + k] + (d.v[o + dims + k] - d.v[o + k]) * (r ? r[k] : Math.random()) : d.v[o + k]; };
  return at(i) + (at(j) - at(i)) * a;
};
const ev3 = (d, t, r) => { if (!d || !d.v || !d.v.length) return null; const dims = d.op === 2 ? d.ch / 2 : d.ch; return [0, 1, 2].map((k) => ev(d, t, r, Math.min(k, dims - 1))); };
const rnd3 = () => [Math.random(), Math.random(), Math.random()];

const FX_VS = `attribute vec2 aCorner; attribute vec2 aSize; attribute float aRot; attribute vec4 aColor; attribute float aFrame; attribute vec3 aVel;
uniform vec2 uSub; varying vec2 vUv; varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vec2 c = aCorner * aSize;
  vec2 ax = vec2(cos(aRot), sin(aRot));
  if (dot(aVel, aVel) > 1e-6) { vec3 vv = (viewMatrix * vec4(aVel, 0.0)).xyz; vec2 d = normalize(vv.xy + 1e-5); ax = vec2(d.y, -d.x); } // (PSA_Velocity: stretched along the motion)
  mv.xy += vec2(c.x * ax.x - c.y * ax.y, c.x * ax.y + c.y * ax.x);
  gl_Position = projectionMatrix * mv;
  float f = floor(aFrame + 0.5), cols = uSub.x; vec2 cell = vec2(mod(f, cols), floor(f / cols));
  vUv = (cell + vec2(aCorner.x + 0.5, 0.5 - aCorner.y)) / uSub; vUv.y = 1.0 - vUv.y; vColor = aColor;
}`;
const FX_FS = `uniform sampler2D map; uniform float uAdd; varying vec2 vUv; varying vec4 vColor;
void main() { vec4 t = texture2D(map, vUv); gl_FragColor = uAdd > 0.5 ? vec4(t.rgb * vColor.rgb * t.a * vColor.a, 1.0) : vec4(t.rgb * vColor.rgb, t.a * vColor.a); }`;

class Sf2FxBatch { // every sprite of one sheet and blend: a quad per particle, refilled each frame
  constructor(tex, add, sub, cap) {
    this.cap = cap; this.n = 0; const g = new THREE.BufferGeometry(), A = (k, s) => { const a = new THREE.BufferAttribute(new Float32Array(cap * 4 * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); return a; };
    this.P = A('position', 3); this.S = A('aSize', 2); this.R = A('aRot', 1); this.C = A('aColor', 4); this.F = A('aFrame', 1); this.V = A('aVel', 3);
    const cor = new Float32Array(cap * 8), idx = new Uint32Array(cap * 6);
    for (let i = 0; i < cap; i++) { cor.set([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], i * 8); idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    g.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    const mt = new THREE.ShaderMaterial({ vertexShader: FX_VS, fragmentShader: FX_FS, uniforms: { map: { value: tex }, uSub: { value: new THREE.Vector2(sub[0], sub[1]) }, uAdd: { value: add ? 1 : 0 } },
      transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mt); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.name = 'sf2fx'; this.g = g;
  }
  push(p, sw, sh, rot, c, frame, vel) {
    if (this.n >= this.cap) return; const i = this.n++;
    for (let k = 0; k < 4; k++) { const q = i * 4 + k; this.P.setXYZ(q, p[0], p[1], p[2]); this.S.setXY(q, sw, sh); this.R.setX(q, rot); this.C.setXYZW(q, c[0], c[1], c[2], c[3]); this.F.setX(q, frame); this.V.setXYZ(q, vel ? vel[0] : 0, vel ? vel[1] : 0, vel ? vel[2] : 0); }
  }
  flush() { for (const a of [this.P, this.S, this.R, this.C, this.F, this.V]) a.needsUpdate = true; this.g.setDrawRange(0, this.n * 6); this.n = 0; }
}

class Sf2Emitter { // one sprite emitter of one placed system, simulated in UE space (cm) through the actor's matrix
  constructor(e, m, batch) {
    this.e = e; this.m = m; this.batch = batch; this.parts = []; this.acc = Math.random(); this.M = e.mods;
    this.sp = this.M.Spawn || {}; this.clock = Math.random() * Math.max(0.1, e.dur); // (RateScale follows the emitter's own time over EmitterDuration: wind gusts come and go)
  }
  toWorld(l, dir) { const m = this.m; return [l[0] * m[0] + l[1] * m[4] + l[2] * m[8] + (dir ? 0 : m[12]), l[0] * m[1] + l[1] * m[5] + l[2] * m[9] + (dir ? 0 : m[13]), l[0] * m[2] + l[1] * m[6] + l[2] * m[10] + (dir ? 0 : m[14])]; }
  spawn() {
    const M = this.M, r = rnd3(), life = Math.max(0.05, ev(M.Lifetime && M.Lifetime.Lifetime, 0) ?? 1);
    let loc = [0, 0, 0];
    const L = M.Location && ev3(M.Location.StartLocation, 0); if (L) loc = [loc[0] + L[0], loc[1] + L[1], loc[2] + L[2]];
    const cy = M.LocationPrimitiveCylinder, sph = M.LocationPrimitiveSphere;
    if (cy) { const R = ev(cy.StartRadius, 0) ?? 50, H = ev(cy.StartHeight, 0) ?? 50, a = Math.random() * Math.PI * 2, rr = cy.SurfaceOnly ? R : R * Math.sqrt(Math.random()); loc = [loc[0] + Math.cos(a) * rr, loc[1] + Math.sin(a) * rr, loc[2] + (Math.random() - 0.5) * H]; }
    if (sph) { const R = ev(sph.StartRadius, 0) ?? 50; let v; do v = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]; while (v[0] * v[0] + v[1] * v[1] + v[2] * v[2] > 1); loc = [loc[0] + v[0] * R, loc[1] + v[1] * R, loc[2] + v[2] * R]; }
    let vel = [0, 0, 0]; const V = M.Velocity;
    if (V) { const s = ev3(V.StartVelocity, 0); if (s) vel = V.bInWorldSpace ? s : this.toWorld(s, true); const rad = ev(V.StartVelocityRadial, 0); if (rad) { const l = Math.hypot(...loc) || 1; const d = this.toWorld(loc.map((x) => x / l), true); vel = vel.map((x, k) => x + d[k] * rad); } }
    const sz = (M.Size && ev3(M.Size.StartSize, 0)) || [10, 10, 10], col = (M.Color && ev3(M.Color.StartColor, 0)) || [1, 1, 1], al = M.Color ? ev(M.Color.StartAlpha, 0) ?? 1 : 1;
    const rot = M.Rotation ? (ev(M.Rotation.StartRotation, 0) ?? 0) * Math.PI * 2 : 0, rr2 = M.RotationRate ? (ev(M.RotationRate.StartRotationRate, 0) ?? 0) * Math.PI * 2 : 0;
    this.parts.push({ p: this.toWorld(loc), v: vel, v0: vel.slice(), age: 0, life, sz, col, al, rot, rr: rr2, r, frame: this.e.subH * this.e.subV > 1 && !M.SubUV ? Math.floor(Math.random() * this.e.subH * this.e.subV) : 0 });
  }
  update(dt) {
    const M = this.M, dur = Math.max(0.1, this.e.dur); this.clock = (this.clock + dt) % dur;
    this.rate = (ev(this.sp.Rate, this.clock / dur) ?? 0) * (ev(this.sp.RateScale, this.clock / dur) ?? 1); const cap = Math.max(4, Math.ceil((ev(this.sp.Rate, 0) ?? 0) * 6) + 4);
    this.acc += Math.max(0, this.rate) * dt; while (this.acc >= 1) { this.acc -= 1; if (this.parts.length < cap * 4) this.spawn(); }
    const A = M.Acceleration && ev3(M.Acceleration.Acceleration, 0, this.ar || (this.ar = rnd3())), aW = A && (M.Acceleration.bAlwaysInWorldSpace ? A : this.toWorld(A, true));
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.age += dt; const t = q.age / q.life; if (t >= 1) { this.parts.splice(i, 1); continue; }
      if (aW) for (let k = 0; k < 3; k++) q.v0[k] += aW[k] * dt;
      const vol = M.VelocityOverLifetime && ev3(M.VelocityOverLifetime.VelOverLife, t, q.r);
      q.v = vol ? (M.VelocityOverLifetime.Absolute ? this.toWorld(vol, true) : q.v0.map((x, k) => x * vol[k])) : q.v0;
      for (let k = 0; k < 3; k++) q.p[k] += q.v[k] * dt; q.rot += q.rr * dt;
    }
  }
  draw() {
    const M = this.M, e = this.e, vel = e.align === 'PSA_Velocity';
    for (const q of this.parts) {
      const t = q.age / q.life; let w = q.sz[0], h = e.align === 'PSA_Rectangle' || vel ? q.sz[1] : q.sz[0];
      const sm = M.SizeMultiplyLife && ev3(M.SizeMultiplyLife.LifeMultiplier, t, q.r); if (sm) { if (M.SizeMultiplyLife.MultiplyX !== false) w *= sm[0]; if (M.SizeMultiplyLife.MultiplyY !== false) h *= (vel || e.align === 'PSA_Rectangle' ? sm[1] : sm[0]); }
      const ss = M.SizeScale && ev3(M.SizeScale.SizeScale, t, q.r); if (ss) { w *= ss[0]; h *= ss[1]; }
      let c = [...q.col, q.al];
      if (M.ColorOverLife) { const co = ev3(M.ColorOverLife.ColorOverLife, t, q.r); if (co) c = [co[0], co[1], co[2], c[3]]; const a = ev(M.ColorOverLife.AlphaOverLife, t, q.r); if (a != null) c[3] = a; }
      if (M.ColorScaleOverLife) { const cs = ev3(M.ColorScaleOverLife.ColorScaleOverLife, t, q.r); if (cs) c = [c[0] * cs[0], c[1] * cs[1], c[2] * cs[2], c[3]]; const a = ev(M.ColorScaleOverLife.AlphaScaleOverLife, t, q.r); if (a != null) c[3] *= a; }
      const frame = M.SubUV ? ev(M.SubUV.SubImageIndex, t, q.r) ?? 0 : q.frame;
      this.batch.push([q.p[0] / 100, q.p[2] / 100, q.p[1] / 100], w / 100, h / 100, q.rot, c, frame, vel ? [q.v[0], q.v[2], q.v[1]] : null);
    }
  }
}

// the map's effects (meta.fx, tools/sf2_fx_meta.mjs) into the scene; returns the per-frame step for MapBuilder.animated
function sf2Fx(fx, tex, scene) {
  if (!fx) return null;
  const batches = new Map(), ems = [];
  for (const pl of fx.placed) for (const e of fx.systems[pl.t] || []) {
    const key = e.tex + '|' + e.blend + '|' + e.subH + 'x' + e.subV;
    if (!batches.has(key) && tex[e.tex]) batches.set(key, new Sf2FxBatch(tex[e.tex], e.blend === 'Additive', [e.subH, e.subV], 1500));
    if (batches.has(key)) ems.push(new Sf2Emitter(e, pl.m, batches.get(key)));
  }
  for (const b of batches.values()) scene.add(b.mesh);
  for (const em of ems) for (let k = 0; k < 120; k++) em.update(1 / 20); // (SF2 warms its systems up: smoke already rising when the round starts)
  return (dt) => { const h = Math.min(dt, 0.1); for (const em of ems) { em.update(h); em.draw(); } for (const b of batches.values()) b.flush(); };
}
export { sf2Fx };
