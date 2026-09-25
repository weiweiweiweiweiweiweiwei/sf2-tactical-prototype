/* =====================================================================
   POST-PROCESSING — EffectComposer stack per quality preset:
   World → GTAO (SSAO) → ADS depth-of-field (Bokeh) → ViewModel pass →
   UnrealBloom → cinematic grade / vignette / grain / flashbang
   after-image → OutputPass (ACES filmic tone mapping + sRGB).
   ===================================================================== */
const hideForDepth = (scene, fn) => {
  const hidden = [];
  scene.traverseVisible((o) => { if (o.isSprite || o.isPoints || o.userData.noAO) hidden.push(o); });
  for (const o of hidden) o.visible = false;
  fn();
  for (const o of hidden) o.visible = true;
};

class GTAOPassX extends GTAOPass {
  constructor(scene, camera, w, h, half) { super(scene, camera, half ? w >> 1 : w, half ? h >> 1 : h); this.half = half; }
  setSize(w, h) { super.setSize(this.half ? Math.max(1, w >> 1) : w, this.half ? Math.max(1, h >> 1) : h); }
  render(renderer, writeBuffer, readBuffer, dt, mask) { hideForDepth(this.scene, () => super.render(renderer, writeBuffer, readBuffer, dt, mask)); }
}

class BokehPassX extends BokehPass {
  render(renderer, writeBuffer, readBuffer, dt, mask) { hideForDepth(this.scene, () => super.render(renderer, writeBuffer, readBuffer, dt, mask)); }
}

// Renders the first-person viewmodel on top of the current image with a cleared depth buffer (RenderPass clears the wrong target in r160).
class ViewModelPass extends Pass {
  constructor(scene, camera) { super(); this.scene = scene; this.camera = camera; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer); renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}

// Half-float targets overflow to Inf on razor-sharp sun specular (water, puddles, polished metal); UnrealBloom then
// spreads Inf/NaN into large black blocks. This pass clamps and scrubs the image before AO / bloom see it.
class SanitizePass extends Pass {
  constructor() {
    super();
    this.mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
          if (any(isnan(c)) || !(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.0);
          gl_FragColor = vec4(clamp(c, 0.0, 48.0), 1.0); }` });
    this.quad = new FullScreenQuad(this.mat);
  }
  render(renderer, writeBuffer, readBuffer) { this.mat.uniforms.tDiffuse.value = readBuffer.texture; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer); }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, tAfter: { value: null }, uFlash: { value: 0 }, uAfter: { value: 0 }, uTime: { value: 0 },
    uVig: { value: 0.35 }, uGrain: { value: 0.012 }, uSat: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uCA: { value: 0 }, uHurt: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tAfter; uniform float uFlash, uAfter, uTime, uVig, uGrain, uSat, uContrast, uCA, uHurt; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = min(vec3(texture2D(tDiffuse, vUv + d * uCA * r2 * 4.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * uCA * r2 * 4.0).b), vec3(48.0));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat - uHurt * 0.6);
      c = max((c - 0.18) * uContrast + 0.18, 0.0) * uTint;
      c *= mix(1.0, smoothstep(0.95, 0.18, r2 * 1.7), uVig);
      vec3 after = texture2D(tAfter, vUv).rgb;
      c = mix(c, after * 1.4 + 0.6, uAfter * 0.7);
      c = mix(c, vec3(6.0), clamp(uFlash, 0.0, 1.0));
      float n = fract(sin(dot(vUv * (uTime * 0.37 + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain * (0.25 + l);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

class GradePass extends Pass {
  constructor() {
    super();
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms), vertexShader: GradeShader.vertexShader, fragmentShader: GradeShader.fragmentShader, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
    this.copyMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: GradeShader.vertexShader, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }', depthTest: false, depthWrite: false });
    this.copyQuad = new FullScreenQuad(this.copyMat);
    this.afterRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.mat.uniforms.tAfter.value = this.afterRT.texture;
    this.capture = false;
  }
  setSize(w, h) { this.afterRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); }
  render(renderer, writeBuffer, readBuffer) {
    if (this.capture) { this.copyMat.uniforms.tDiffuse.value = readBuffer.texture; renderer.setRenderTarget(this.afterRT); this.copyQuad.render(renderer); this.capture = false; }
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.mat.dispose(); this.copyMat.dispose(); this.afterRT.dispose(); this.quad.dispose(); this.copyQuad.dispose(); }
}

/* v17: display-referred film grade, applied after ACES + sRGB (OutputPass) so the controls behave like
   DaVinci Resolve's primaries: lift / gamma / gain / offset (Y + RGB), contrast + pivot, saturation (50 = 1),
   temperature / tint, shadows / highlights, luminance-vs-saturation roll-off and an optional .cube 3D LUT.
   Values are stored in Resolve's units so numbers read off the Resolve UI can be typed in directly. */
const LOOK_DEFAULT = {
  exposure: null, temp: 0, tint: 0, contrast: 1, pivot: 0.435, sat: 50, shadows: 0, highlights: 0, shadowSat: 1, highSat: 1,
  lift: [0, 0, 0, 0], gamma: [0, 0, 0, 0], gain: [1, 1, 1, 1], offset: [25, 25, 25, 25], vig: 0.35, grain: 0.012, ca: 0, lutMix: 1,
};
const LOOK_KEYS = Object.keys(LOOK_DEFAULT);
const cloneLook = (l) => JSON.parse(JSON.stringify(l));
// defaults ← map preset (def.look) ← player's own grade (Settings.data.look[mapId])
function resolveLook(def, withUser = true) {
  const out = cloneLook(LOOK_DEFAULT), srcs = [def.look || {}];
  if (withUser) srcs.push((Settings.data.look || {})[def.id] || {});
  for (const s of srcs) for (const k of LOOK_KEYS) if (s[k] !== undefined && s[k] !== null) out[k] = Array.isArray(s[k]) ? s[k].slice() : s[k];
  return out;
}

// .cube text → { size, data: Uint8Array RGBA (size³) }. Resamples anything above 33 points so it fits in storage.
function parseCube(text) {
  let size = 0, dmin = [0, 0, 0], dmax = [1, 1, 1]; const vals = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const p = line.split(/\s+/);
    if (p[0] === 'LUT_3D_SIZE') size = parseInt(p[1], 10);
    else if (p[0] === 'DOMAIN_MIN') dmin = p.slice(1, 4).map(Number);
    else if (p[0] === 'DOMAIN_MAX') dmax = p.slice(1, 4).map(Number);
    else if (/^[-+.\d]/.test(p[0]) && p.length >= 3) vals.push(+p[0], +p[1], +p[2]);
  }
  if (!size || vals.length < size * size * size * 3) throw new Error('不是有效的 3D .cube LUT');
  const at = (r, g, b, c) => vals[((b * size + g) * size + r) * 3 + c];
  const N = Math.min(size, 33), out = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const f = (v) => (v / (N - 1)) * (size - 1), fr = f(r), fg = f(g), fb = f(b);
    const r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb), r1 = Math.min(size - 1, r0 + 1), g1 = Math.min(size - 1, g0 + 1), b1 = Math.min(size - 1, b0 + 1);
    const tr = fr - r0, tg = fg - g0, tb = fb - b0, o = ((b * N + g) * N + r) * 4;
    for (let c = 0; c < 3; c++) {
      const L = (x, y, z) => at(x, y, z, c), l = (a, b2, t) => a + (b2 - a) * t;
      const v = l(l(l(L(r0, g0, b0), L(r1, g0, b0), tr), l(L(r0, g1, b0), L(r1, g1, b0), tr), tg), l(l(L(r0, g0, b1), L(r1, g0, b1), tr), l(L(r0, g1, b1), L(r1, g1, b1), tr), tg), tb);
      out[o + c] = Math.round(clamp((v - dmin[c]) / Math.max(1e-6, dmax[c] - dmin[c]), 0, 1) * 255);
    }
    out[o + 3] = 255;
  }
  return { size: N, data: out };
}
const lutToB64 = (lut) => { let s = ''; const d = lut.data; for (let i = 0; i < d.length; i += 4) s += String.fromCharCode(d[i], d[i + 1], d[i + 2]); return lut.size + ':' + btoa(s); };
function lutFromB64(str) {
  const i = str.indexOf(':'), size = parseInt(str.slice(0, i), 10), bin = atob(str.slice(i + 1)), data = new Uint8Array(size * size * size * 4);
  for (let k = 0, o = 0; k < bin.length; k += 3, o += 4) { data[o] = bin.charCodeAt(k); data[o + 1] = bin.charCodeAt(k + 1); data[o + 2] = bin.charCodeAt(k + 2); data[o + 3] = 255; }
  return { size, data };
}
function lutTexture(lut) {
  const t = new THREE.Data3DTexture(lut.data, lut.size, lut.size, lut.size);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
const LUT_STORE = 'sf2proto.lut.'; // player-imported LUTs live in their own storage key per map (they are 100+ KB)
const loadUserLut = (mapId) => { try { const s = localStorage.getItem(LUT_STORE + mapId); return s ? lutFromB64(s) : null; } catch (e) { return null; } };
const saveUserLut = (mapId, lut) => { try { if (lut) localStorage.setItem(LUT_STORE + mapId, lutToB64(lut)); else localStorage.removeItem(LUT_STORE + mapId); } catch (e) { /* quota */ } };

class FilmGradePass extends Pass {
  constructor() {
    super();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, uLut: { value: null }, uLutSize: { value: 2 }, uLutMix: { value: 1 }, uTime: { value: 0 }, uSplit: { value: 0 },
        uWB: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uOffset: { value: new THREE.Vector3() },
        uContrast: { value: 1 }, uPivot: { value: 0.435 }, uSat: { value: 1 }, uShadows: { value: 0 }, uHighlights: { value: 0 }, uShadowSat: { value: 1 }, uHighSat: { value: 1 },
      },
      vertexShader: GradeShader.vertexShader,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uLutSize, uLutMix, uTime, uSplit, uContrast, uPivot, uSat, uShadows, uHighlights, uShadowSat, uHighSat;
        uniform vec3 uWB, uLift, uGamma, uGain, uOffset; varying vec2 vUv;
        #ifdef USE_LUT
        uniform highp sampler3D uLut;
        #endif
        float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        void main(){
          vec3 src = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0), c = src;
          c *= uWB;
          c += uOffset;
          c = c + uLift * (1.0 - c);
          c *= uGain;
          c = pow(max(c, 0.0), uGamma);
          c = clamp(c, 0.0, 1.0); // contrast as a pivoted S-curve pinned at 0 and 1 (slope = contrast at the pivot): no clipped skies
          c = mix(uPivot * pow(c / uPivot, vec3(uContrast)), 1.0 - (1.0 - uPivot) * pow((1.0 - c) / (1.0 - uPivot), vec3(uContrast)), step(uPivot, c));
          float y = luma(c);
          c += uShadows * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.1, 0.5, y)) + uHighlights * smoothstep(0.45, 1.0, y);
          c = max(c, 0.0); y = luma(c);
          float s = uSat * mix(uShadowSat, 1.0, smoothstep(0.03, 0.3, y)) * mix(1.0, uHighSat, smoothstep(0.55, 0.95, y));
          c = clamp(mix(vec3(y), c, s), 0.0, 1.0);
          #ifdef USE_LUT
          c = mix(c, texture(uLut, c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize).rgb, uLutMix);
          #endif
          if (vUv.x < uSplit) c = src;
          if (uSplit > 0.0 && abs(vUv.x - uSplit) < 0.0012) c = vec3(0.9);
          c += (fract(sin(dot(vUv * (uTime * 0.13 + 1.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  // Resolve units → shader uniforms (wheel = [master, R, G, B]).
  set(look) {
    const u = this.mat.uniforms, L = look, ch = (a, i) => a[i + 1];
    const t = clamp(L.temp / 4000, -1, 1), wb = [1 + 0.2 * t, 1 - 0.015 * Math.abs(t) - 0.12 * (L.tint / 100), 1 - 0.2 * t];
    const wl = 0.2126 * wb[0] + 0.7152 * wb[1] + 0.0722 * wb[2]; u.uWB.value.set(wb[0] / wl, wb[1] / wl, wb[2] / wl);
    u.uLift.value.set(...[0, 1, 2].map((i) => L.lift[0] + ch(L.lift, i)));
    u.uGamma.value.set(...[0, 1, 2].map((i) => Math.pow(2, -2 * (L.gamma[0] + ch(L.gamma, i)))));
    u.uGain.value.set(...[0, 1, 2].map((i) => L.gain[0] * ch(L.gain, i)));
    u.uOffset.value.set(...[0, 1, 2].map((i) => ((L.offset[0] - 25) + (ch(L.offset, i) - 25)) * 0.01));
    u.uContrast.value = L.contrast; u.uPivot.value = L.pivot; u.uSat.value = L.sat / 50;
    u.uShadows.value = L.shadows / 100 * 0.25; u.uHighlights.value = L.highlights / 100 * 0.25; u.uShadowSat.value = L.shadowSat; u.uHighSat.value = L.highSat; u.uLutMix.value = L.lutMix;
  }
  setLut(lut) {
    const u = this.mat.uniforms;
    if (u.uLut.value) { u.uLut.value.dispose(); u.uLut.value = null; }
    if (lut) { u.uLut.value = lutTexture(lut); u.uLutSize.value = lut.size; this.mat.defines.USE_LUT = ''; } else delete this.mat.defines.USE_LUT;
    this.mat.needsUpdate = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.setLut(null); this.mat.dispose(); this.quad.dispose(); }
}

const QUALITY = {
  low:    { post: false, pr: 0.75, shadow: 1024, ao: 0, bloom: false, dof: false },
  medium: { post: true, pr: 0.9, shadow: 1536, ao: 0, bloom: true, dof: false, smaa: true },
  high:   { post: true, pr: 1, shadow: 2048, ao: 0, bloom: true, dof: false, smaa: true }, // v16: ADS depth-of-field only on ultra (full-screen bokeh cost frames on mid GPUs)
  ultra:  { post: true, pr: 1.25, shadow: 4096, ao: 1, bloom: true, dof: true, smaa: true },
};

class PostFX {
  constructor(renderer) { this.r = renderer; this.composer = null; this.flashAmt = 0; this.afterAmt = 0; this.flashDur = 1; this.hurt = 0; this.scale = 1; }
  pixelRatio() { return Math.max(0.5, Math.min(devicePixelRatio, (this.q || QUALITY.high).pr) * this.scale); }
  // Dynamic resolution: called by the app when frame time drifts.
  setScale(s) {
    s = clamp(s, 0.55, 1); if (Math.abs(s - this.scale) < 0.02) return; this.scale = s;
    this.r.setPixelRatio(this.pixelRatio()); this.r.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); }
  }

  configure(match, qName) {
    this.dispose();
    const q = QUALITY[qName] || QUALITY.high, r = this.r;
    this.q = q; this.match = match;
    r.setPixelRatio(this.pixelRatio()); r.setSize(innerWidth, innerHeight);
    const sun = match.sun;
    if (sun && sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    if (!q.post) { this.applyLook(resolveLook(match.def), true); return; }
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    // no MSAA on composer targets: UnrealBloom blends into readBuffer, which three invalidates after an MSAA resolve (→ black frame). SMAA is used instead.
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    const c = this.composer = new EffectComposer(r, rt);
    c.addPass(new RenderPass(match.scene, match.camera));
    c.addPass(new SanitizePass());
    if (q.ao) {
      this.ao = new GTAOPassX(match.scene, match.camera, size.x, size.y, q.ao === 1);
      this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
      this.ao.blendIntensity = 0.9;
      c.addPass(this.ao);
    }
    if (q.dof) { this.bokeh = new BokehPassX(match.scene, match.camera, { focus: 20, aperture: 0.00022, maxblur: 0.0065 }); this.bokeh.enabled = false; c.addPass(this.bokeh); }
    c.addPass(new ViewModelPass(match.weapons.scene, match.weapons.camera));
    c.addPass(new SanitizePass());
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x >> 1, size.y >> 1), 0.16, 0.2, match.def.bloom ?? 1.05); c.addPass(this.bloom); }
    this.grade = new GradePass(); c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.film = new FilmGradePass(); c.addPass(this.film);
    if (q.smaa) c.addPass(new SMAAPass(size.x, size.y));
    c.setPixelRatio(r.getPixelRatio()); c.setSize(innerWidth, innerHeight);
    this.applyLook(resolveLook(match.def), true);
  }

  // Push a look (Resolve units, see LOOK_DEFAULT) into the passes. The low preset has no composer: a CSS filter approximates saturation / contrast there.
  applyLook(look, reloadLut) {
    const m = this.match; if (!m) return;
    this.look = look;
    this.r.toneMappingExposure = look.exposure ?? m.def.exposure;
    if (this.grade) { const u = this.grade.mat.uniforms; u.uVig.value = look.vig; u.uGrain.value = look.grain; u.uCA.value = look.ca; }
    const cv = this.r.domElement;
    if (this.film) {
      this.film.set(look); cv.style.filter = '';
      if (reloadLut) { const user = loadUserLut(m.def.id); this.film.setLut(user || (m.def.look && m.def.look.lut ? lutFromB64(m.def.look.lut) : null)); }
    } else {
      const g = Math.pow(2, -2 * look.gamma[0]), b = look.gain[0] * Math.pow(0.435, g - 1);
      cv.style.filter = `saturate(${(look.sat / 50).toFixed(3)}) contrast(${look.contrast.toFixed(3)}) brightness(${clamp(b, 0.5, 1.5).toFixed(3)})`;
    }
  }
  setSplit(x) { if (this.film) this.film.mat.uniforms.uSplit.value = x; }

  flash(strength, dur) {
    this.flashAmt = Math.max(this.flashAmt, strength); this.afterAmt = Math.max(this.afterAmt, strength); this.flashDur = Math.max(0.5, dur);
    if (this.grade) this.grade.capture = true;
  }

  render(dt, showVM) {
    const m = this.match, r = this.r;
    this.flashAmt = Math.max(0, this.flashAmt - dt / (this.flashDur * 0.55));
    this.afterAmt = Math.max(0, this.afterAmt - dt / (this.flashDur * 1.1));
    this.hurt = damp(this.hurt, m.player.alive ? clamp((45 - m.player.hp) / 45, 0, 1) : 0.6, 4, dt);
    m.weapons.syncLighting(m.sun, m.hemi);
    if (!this.composer) {
      r.setRenderTarget(null); r.autoClear = false; r.clear(); r.render(m.scene, m.camera);
      if (showVM) { r.clearDepth(); r.render(m.weapons.scene, m.weapons.camera); }
      m.app.hud.flashWhite(this.flashAmt);
      if (this.onFrame) this.onFrame();
      return;
    }
    const ws = m.weapons, w = ws.current;
    if (this.bokeh) {
      const on = Settings.data.dof && ws.adsT > 0.05 && !w.scoped && m.player.alive;
      this.bokeh.enabled = on;
      if (on) { const u = this.bokeh.uniforms; u.focus.value = ws.focusDist; u.aperture.value = 0.00026 * ws.adsT; u.maxblur.value = 0.0065 * ws.adsT; }
    }
    this.composer.passes.forEach((p) => { if (p instanceof ViewModelPass) p.enabled = showVM; });
    const u = this.grade.mat.uniforms; u.uFlash.value = this.flashAmt; u.uAfter.value = this.afterAmt; u.uTime.value = m.time; u.uHurt.value = this.hurt;
    this.film.mat.uniforms.uTime.value = m.time;
    this.composer.render(dt);
    if (this.onFrame) this.onFrame(); // grade panel scopes read the frame in this same task
  }

  setSize() {
    this.r.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); }
  }

  dispose() {
    if (this.composer) { for (const p of this.composer.passes) if (p.dispose) p.dispose(); this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    this.composer = null; this.ao = null; this.bokeh = null; this.bloom = null; this.grade = null; this.film = null;
    if (this.r) this.r.domElement.style.filter = '';
  }
}

