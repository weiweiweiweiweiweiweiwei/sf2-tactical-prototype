/* =====================================================================
   POST-PROCESSING — EffectComposer stack per quality preset:
   World → GTAO (SSAO) → ViewModel pass →
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

/* v24 SF2-style colour finish. SF2 runs on Unreal Engine 3: its lighting (Lightmass bounce light, soft shadows and corner
   AO) is baked into lightmaps, and the final image only gets UE3's UberPostProcess "levels" — SceneShadows (black point),
   SceneHighLights (gain), SceneMidTones (gamma), SceneDesaturation — plus bloom. Here: the same four controls (+ a contrast
   S-curve), one fixed set per map (def.look), applied after tone mapping. Replaces the v17 DaVinci-style grading tool. */
const LOOK_DEFAULT = { exposure: null, shadows: 0, highlights: 1, midtones: 1, contrast: 1, pivot: 0.435, desat: 0, vig: 0.35, grain: 0.012 };
const resolveLook = (def) => ({ ...LOOK_DEFAULT, ...(def.look || {}) });
const vec3Of = (v) => (Array.isArray(v) ? v : [v, v, v]);

class LevelsPass extends Pass {
  constructor() {
    super();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uShadows: { value: 0 }, uHigh: { value: new THREE.Vector3(1, 1, 1) }, uMid: { value: 1 }, uContrast: { value: 1 }, uPivot: { value: 0.435 }, uDesat: { value: 0 } },
      vertexShader: GradeShader.vertexShader,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uShadows, uMid, uContrast, uPivot, uDesat; uniform vec3 uHigh; varying vec2 vUv;
        void main(){
          vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
          c = clamp(max(c - uShadows, 0.0) / (1.0 - uShadows) * uHigh, 0.0, 1.0); // SceneShadows / SceneHighLights
          c = pow(c, vec3(uMid));                                                  // SceneMidTones
          c = mix(uPivot * pow(c / uPivot, vec3(uContrast)), 1.0 - (1.0 - uPivot) * pow((1.0 - c) / (1.0 - uPivot), vec3(uContrast)), step(uPivot, c));
          c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uDesat);          // SceneDesaturation
          c += (fract(sin(dot(vUv * (uTime * 0.13 + 1.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0; // dither: no banding
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  set(L) {
    const u = this.mat.uniforms; u.uShadows.value = L.shadows; u.uHigh.value.set(...vec3Of(L.highlights)); u.uMid.value = L.midtones;
    u.uContrast.value = L.contrast; u.uPivot.value = L.pivot; u.uDesat.value = L.desat;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

// v24 presets, from per-feature timings on Intel UHD at 1920×1080 (ms / frame): high 69 · 7 point lights 16 · SMAA 11 ·
// soft 2048 shadows 7 · post chain 21 · resolution scales it all. `low` (no post, no point lights, PCF 1024, 70 % res) ≈ 16 ms.
// mapLights = the map's lamp point lights, fxLights = muzzle / explosion lights (flash sprites always remain).
// v24: mapLights stay on in every preset (≤ 3 per map, +1.7 ms on Intel UHD at 50 % res) — without them the warehouse's lamp
// pools vanished and low / medium rendered it at ~1/3 of high's brightness (user report).
// low also drops world image-based reflections (−3.7 ms; hemisphere fill compensates, the gun keeps its own) and redraws the
// sun shadow map every 2nd frame (−3 ms): Intel UHD 1080p ≈ 19.6 ms at 70 % res, ≈ 15 ms after dynamic resolution.
// v24 (frozen 12v12 frame, Intel UHD, 50 % res): 1-tap hard shadows on low −1.8 ms (PCF = 9 taps in every pixel); soldier LOD 587k → 81k triangles.
const QUALITY = {
  low:    { post: false, pr: 0.7, shadow: 1024, soft: false, hard: true, mapLights: true, fxLights: false, worldEnv: false, shadowEvery: 2, ao: 0, bloom: false, minScale: 0.5 },
  medium: { post: true, pr: 0.85, shadow: 1024, soft: false, mapLights: true, fxLights: false, ao: 0, bloom: true, smaa: false, minScale: 0.55 },
  high:   { post: true, pr: 1, shadow: 2048, soft: true, mapLights: true, fxLights: true, ao: 0, bloom: true, smaa: true, minScale: 0.55 },
  ultra:  { post: true, pr: 1.25, shadow: 4096, soft: true, mapLights: true, fxLights: true, ao: 1, bloom: true, smaa: true, minScale: 0.6 },
};
const Q_ORDER = ['low', 'medium', 'high', 'ultra'];
const Q_LABEL = { low: '低', medium: '中', high: '高', ultra: '極致' };
// Settings 'auto' (v24 default): the governor's current preset — starts at high on a discrete GPU, low on an integrated one.
let AUTO_Q = null;
function activeQuality() { const q = Settings.data.quality; return q === 'auto' ? (AUTO_Q || 'high') : (QUALITY[q] ? q : 'high'); }

class PostFX {
  constructor(renderer) { this.r = renderer; this.composer = null; this.flashAmt = 0; this.afterAmt = 0; this.flashDur = 1; this.hurt = 0; this.scale = 1; }
  pixelRatio() { return Math.max(0.5, Math.min(devicePixelRatio, (this.q || QUALITY.high).pr) * this.scale); }
  // Dynamic resolution: called by the app when frame time drifts.
  setScale(s) {
    s = clamp(s, (this.q || QUALITY.high).minScale, 1); if (Math.abs(s - this.scale) < 0.02) return; this.scale = s;
    this.r.setPixelRatio(this.pixelRatio()); this.r.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); }
  }

  configure(match, qName) {
    this.dispose();
    const q = QUALITY[qName] || QUALITY.high, r = this.r;
    this.q = q; this.qName = qName; this.match = match; this.scale = clamp(this.scale, q.minScale, 1);
    r.setPixelRatio(this.pixelRatio()); r.setSize(innerWidth, innerHeight);
    const sun = match.sun, type = q.soft ? THREE.PCFSoftShadowMap : q.hard ? THREE.BasicShadowMap : THREE.PCFShadowMap, relink = r.shadowMap.type !== type;
    r.shadowMap.type = type;
    if (sun && (sun.shadow.mapSize.x !== q.shadow || relink)) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    // point lights are shaded for every pixel whether lit or not: the preset decides which exist (changing the count recompiles once)
    match.scene.traverse((o) => { if (o.isPointLight) o.visible = o.userData.fx ? q.fxLights : q.mapLights; if (relink && o.material) o.material.needsUpdate = true; });
    if (match.envTex) {
      match.scene.environment = q.worldEnv === false ? null : match.envTex;
      // without IBL the shadowed side goes black (warehouse median luma 0.076 → 0.001): a uniform ambient fill sized from the map's
      // own IBL strength (envIntensity × HDRI mean luminance, factor measured to match the lit preset) keeps enemies visible for free
      if (!match.ambFill) { match.ambFill = new THREE.AmbientLight(0xdde2e8, 0); match.scene.add(match.ambFill); }
      const ml = (match.vmEnv && match.vmEnv.userData.meanLum) || 0.35;
      match.ambFill.intensity = q.worldEnv === false ? clamp(5.8 * match.envK * ml, 0.35, 2.4) : 0;
    }
    r.shadowMap.autoUpdate = true; this.frameN = 0;
    if (!q.post) { this.applyLook(resolveLook(match.def)); return; }
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
    c.addPass(new ViewModelPass(match.weapons.scene, match.weapons.camera));
    c.addPass(new SanitizePass());
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x >> 1, size.y >> 1), 0.16, 0.2, match.def.bloom ?? 1.05); c.addPass(this.bloom); }
    this.grade = new GradePass(); c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.film = new LevelsPass(); c.addPass(this.film);
    if (q.smaa) c.addPass(new SMAAPass(size.x, size.y));
    c.setPixelRatio(r.getPixelRatio()); c.setSize(innerWidth, innerHeight);
    this.applyLook(resolveLook(match.def));
  }

  // Push the map's look (see LOOK_DEFAULT) into the passes. The low preset has no composer: a CSS filter approximates it there.
  applyLook(look) {
    const m = this.match; if (!m) return;
    this.look = look;
    this.r.toneMappingExposure = look.exposure ?? m.def.exposure;
    if (this.grade) { const u = this.grade.mat.uniforms; u.uVig.value = look.vig; u.uGrain.value = look.grain; }
    const cv = this.r.domElement;
    if (this.film) {
      this.film.set(look); cv.style.filter = '';
    } else {
      // no contrast(): CSS pivots it at 0.5, which crushed dark interiors (the shader pivots per map, e.g. 0.3 in the warehouse)
      const h = vec3Of(look.highlights), b = (h[0] + h[1] + h[2]) / 3 * Math.pow(0.435, look.midtones - 1);
      cv.style.filter = `saturate(${(1 - look.desat).toFixed(3)}) brightness(${clamp(b, 0.5, 1.5).toFixed(3)})`;
    }
  }

  flash(strength, dur) {
    this.flashAmt = Math.max(this.flashAmt, strength); this.afterAmt = Math.max(this.afterAmt, strength); this.flashDur = Math.max(0.5, dur);
    if (this.grade) this.grade.capture = true;
  }

  render(dt, showVM) {
    const m = this.match, r = this.r, se = (this.q && this.q.shadowEvery) || 1;
    if (se > 1) { r.shadowMap.autoUpdate = false; if (this.frameN++ % se === 0) r.shadowMap.needsUpdate = true; } // low: sun shadows at half rate
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
    this.composer = null; this.ao = null; this.bloom = null; this.grade = null; this.film = null;
    if (this.r) this.r.domElement.style.filter = '';
  }
}

