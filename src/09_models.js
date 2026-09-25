/* =====================================================================
   MODELS — procedural high-detail weapons (side-profile extrusions,
   bevels, picatinny teeth, holo sight, engraved suppressor, translucent
   magazine), gloved hands/arms, third-person guns and soldiers.
   Gun space: forward = -Z, up = +Y, bore axis on y = 0.
   Profile coordinates (u, v): u = distance forward, v = up.
   ===================================================================== */
class GunMats {
  constructor(tf) {
    const wear = tf.surface('gunWear'), fab = tf.surface('fabric');
    const P = (o) => { const m = new THREE.MeshPhysicalMaterial(o); m.userData.keep = true; return m; };
    const metal = (color, rough = 0.25, metalness = 0.85, cc = 0.1) => P({ color, metalness, roughness: rough, clearcoat: cc, clearcoatRoughness: 0.3, roughnessMap: wear.roughnessMap, normalMap: wear.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) });
    this.black = metal(0x4a4f57, 0.36, 0.74, 0.1); // hard-anodised aluminium: dark, satin metal (PBR 0.7–0.95 metalness)
    this.steel = metal(0x575c63, 0.3, 0.9, 0.05);
    this.bright = metal(0x9ea3a9, 0.22, 1, 0.05);
    this.gold = metal(0xe2b24c, 0.2, 1, 0.3);
    this.goldDark = metal(0xa77d2c, 0.32, 1, 0.2);
    this.blade = metal(0xd2d8dd, 0.16, 1, 0.2);
    this.polymer = P({ color: 0x262628, metalness: 0.1, roughness: 0.7, roughnessMap: wear.roughnessMap, normalMap: wear.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
    this.rubber = P({ color: 0x131313, metalness: 0, roughness: 0.92 });
    this.tan = P({ color: 0x8a7654, metalness: 0.1, roughness: 0.65, roughnessMap: wear.roughnessMap, normalMap: wear.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
    this.magClear = P({ color: 0x241f1a, metalness: 0.1, roughness: 0.25, transparent: true, opacity: 0.78, clearcoat: 0.6 });
    this.lens = P({ color: 0x7fb4c8, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.12, envMapIntensity: 2, depthWrite: false });
    this.lensDark = P({ color: 0x0b2a3a, metalness: 1, roughness: 0.05, emissive: 0x061a26, emissiveIntensity: 1 });
    this.glove = P({ color: 0x2b2a26, metalness: 0, roughness: 0.95, map: fab.map, normalMap: fab.normalMap });
    this.sleeve = P({ color: 0x3b4430, metalness: 0, roughness: 0.95, map: fab.map, normalMap: fab.normalMap });
    this.dotW = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1.6) }); this.dotW.userData.keep = true;
    this.dotG = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1, 0.5).multiplyScalar(2.5) }); this.dotG.userData.keep = true;
    const st = tf.suppressorText(); st.repeat.set(1, 1);
    this.suppressor = P({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.45, map: st, clearcoat: 0.2 });
    this.greenPaint = P({ color: 0x3e4a2c, metalness: 0.3, roughness: 0.6 });
    const woodS = tf.surface('wood');
    this.wood = P({ color: 0x8a5a36, metalness: 0, roughness: 0.5, map: woodS.map, normalMap: woodS.normalMap, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    this.woodDark = P({ color: 0x3a2414, metalness: 0, roughness: 0.7 });
    this.redShell = P({ color: 0x9a1c14, metalness: 0.05, roughness: 0.45, clearcoat: 0.4 });
    this.polymerDS = P({ color: 0x1e1e20, metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide });
    this.dotTex = tf.dot();
    this.steelBlue = metal(0x4b4f57, 0.32, 0.9, 0.12); // blued steel
    this.parkerized = metal(0x575b52, 0.48, 0.72, 0.05);
    this.odGreen = P({ color: 0x4a5236, metalness: 0.1, roughness: 0.62, roughnessMap: wear.roughnessMap, normalMap: wear.normalMap, normalScale: new THREE.Vector2(0.45, 0.45) });
    this.bakelite = P({ color: 0x6e2f1c, metalness: 0.05, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    this.grayPaint = P({ color: 0x6b6f72, metalness: 0.4, roughness: 0.5 });
    this.reticle = tf.reticle();
    this.flashTex = tf.flash();
  }
}

class GunBuilder {
  constructor(M) { this.M = M; this.nodes = { body: { pivot: new THREE.Vector3(), parts: new Map() } }; this.extra = []; }
  node(name, pivot) { this.nodes[name] = { pivot: pivot.clone(), parts: new Map() }; return this; }
  add(geo, mat, node = 'body') {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    const n = this.nodes[node];
    if (n.pivot.lengthSq() > 0) g.translate(-n.pivot.x, -n.pivot.y, -n.pivot.z);
    if (!n.parts.has(mat)) n.parts.set(mat, []);
    n.parts.get(mat).push(g);
    return g;
  }
  _place(g, x, y, z, rx = 0, ry = 0, rz = 0) { if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return g; }
  box(w, h, d, x, y, z, mat, node, r = 0, rx, ry, rz) {
    const mn = Math.min(w, h, d), ch = r > 0 ? Math.min(r, w / 2, h / 2, d / 2) * 0.999 : mn >= 0.005 ? Math.min(mn * 0.16, 0.0022) : 0;
    const g = ch > 0 ? new RoundedBoxGeometry(w, h, d, r > 0 ? 2 : 1, ch) : new THREE.BoxGeometry(w, h, d);
    return this.add(this._place(g, x, y, z, rx, ry, rz), mat, node);
  }
  // cylinder along Z: r0 at rear (+z), r1 at front (-z); u = forward centre
  cyl(r0, r1, len, x, y, u, mat, node, seg = 18, open = false) {
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open); g.rotateX(-Math.PI / 2); g.translate(x, y, -u); return this.add(g, mat, node);
  }
  cylAxis(r, len, x, y, u, axis, mat, node, seg = 14) {
    const g = new THREE.CylinderGeometry(r, r, len, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); g.translate(x, y, -u); return this.add(g, mat, node);
  }
  lathe(pts, x, y, mat, node, seg = 22) {
    const g = new THREE.LatheGeometry(pts.map(([r, u]) => new THREE.Vector2(r, u)), seg); g.rotateX(-Math.PI / 2); g.translate(x, y, 0); return this.add(g, mat, node);
  }
  torus(R, r, x, y, u, axis, mat, node) {
    const g = new THREE.TorusGeometry(R, r, 8, 20); if (axis === 'x') g.rotateY(Math.PI / 2); else if (axis === 'y') g.rotateX(Math.PI / 2); g.translate(x, y, -u); return this.add(g, mat, node);
  }
  // Side profile (u forward, v up) extruded across the width, with optional holes.
  prof(pts, width, mat, node, o = {}) {
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
    for (const hole of o.holes || []) { const hp = new THREE.Path(); hp.moveTo(hole[0][0], hole[0][1]); for (let i = 1; i < hole.length; i++) hp.lineTo(hole[i][0], hole[i][1]); hp.closePath(); sh.holes.push(hp); }
    const bev = o.bevel ?? Math.min(0.002, width * 0.2), depth = Math.max(0.0005, width - bev * 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 8 });
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 8);
    g.rotateY(Math.PI / 2); g.translate(-depth / 2 + (o.x || 0), o.y || 0, 0);
    return this.add(g, mat, node);
  }
  rail(u0, u1, y, mat, node, w = 0.021) {
    const len = u1 - u0; this.box(w, 0.006, len, 0, y + 0.003, -(u0 + len / 2), mat, node);
    for (let u = u0 + 0.004; u < u1 - 0.003; u += 0.01) this.box(w + 0.001, 0.004, 0.0052, 0, y + 0.008, -u, mat, node);
  }
  // Holographic sight on a rail; returns the sight-axis height.
  holo(u0, railY, mat, node = 'body') {
    const M = this.M, base = railY + 0.01, wc = base + 0.0165, ww = 0.03, wh = 0.024, L = 0.045, t = 0.0018;
    this.box(0.036, 0.01, 0.1, 0, railY + 0.005, -(u0 + 0.05), mat, node, 0.002);
    this.box(0.03, 0.0035, 0.05, 0, base + 0.0017, -(u0 + 0.075), mat, node, 0.001);
    this.box(ww + t * 2, t, L, 0, wc + wh / 2 + t / 2, -(u0 + 0.025), mat, node, 0.001);
    for (const sx of [-1, 1]) this.box(t, wh + t, L, sx * (ww / 2 + t / 2), wc, -(u0 + 0.025), mat, node, 0.001);
    this.box(0.004, 0.006, 0.01, 0.019, base - 0.001, -(u0 + 0.07), M.rubber, node);
    this.box(0.004, 0.006, 0.01, 0.019, base - 0.001, -(u0 + 0.086), M.rubber, node);
    const glass = new THREE.PlaneGeometry(ww, wh); glass.translate(0, wc, -(u0 + 0.045)); this.extra.push({ geo: glass, mat: M.lens, node, noAO: true, order: 3 });
    return wc;
  }
  // Tube red-dot sight (open tube, rendered double-sided so the inner wall reads when aiming through it).
  redDot(u0, baseY, mat, node = 'body') {
    const M = this.M, r = 0.0135, L = 0.05, y = baseY + 0.008 + r;
    this.box(0.022, 0.008, 0.036, 0, baseY + 0.004, -(u0 + L / 2), mat, node, 0.002);
    this.cyl(r, r, L, 0, y, u0 + L / 2, M.polymerDS, node, 22, true);
    this.torus(r, 0.0024, 0, y, u0, 'z', mat, node); this.torus(r, 0.0024, 0, y, u0 + L, 'z', mat, node);
    this.box(0.006, 0.007, 0.012, r + 0.003, y, -(u0 + L * 0.45), mat, node, 0.001);
    const glass = new THREE.CircleGeometry(r * 0.94, 22); glass.translate(0, y, -(u0 + L * 0.75)); this.extra.push({ geo: glass, mat: M.lens, node, noAO: true, order: 3 });
    return y;
  }
  build() {
    const group = new THREE.Group(), out = { group, nodes: {} };
    for (const [name, n] of Object.entries(this.nodes)) {
      const obj = name === 'body' ? group : new THREE.Group();
      if (name !== 'body') { obj.position.copy(n.pivot); group.add(obj); }
      for (const [mat, geos] of n.parts) { const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = false; m.receiveShadow = true; obj.add(m); geos.forEach((g) => g.dispose()); }
      out.nodes[name] = obj;
    }
    for (const e of this.extra) {
      const n = this.nodes[e.node]; if (n.pivot.lengthSq() > 0) e.geo.translate(-n.pivot.x, -n.pivot.y, -n.pivot.z);
      const m = new THREE.Mesh(e.geo, e.mat); m.renderOrder = e.order || 0; m.receiveShadow = true; out.nodes[e.node].add(m);
    }
    return out;
  }
}

class WeaponModels {
  constructor(tf) { this.M = new GunMats(tf); this.tpCache = new Map(); this.gltf = new Map(); this.previews = new Map(); }

  // Build the first-person model for a weapon definition: procedural first, then (optionally) an external GLTF/GLB swapped in.
  build(def) {
    const key = def.model || def.id;
    const vm = (key === 'he' || key === 'flash' || key === 'smoke') ? this.grenade(key) : this[key]();
    if (def.kind !== 'grenade' && def.kind !== 'knife') this._fitAds(vm, def);
    if (def.modelUrl) this.attachGLTF(vm, def.modelUrl);
    return vm;
  }
  // v16 ADS eye relief: push the ADS pose forward until nothing that lands in the middle of the view is closer than
  // 13 cm (iron sights), 9 cm (red dot / holo) or 30 cm (pistols, held at arm's length). Otherwise the receiver or
  // the slide sits a few cm from the eye and fills the screen as a black block. The sight line stays on the axis.
  _fitAds(vm, def) {
    if (!this.adsFit) this.adsFit = new Map();
    if (this.adsFit.has(def.id)) { vm.adsPos.z += this.adsFit.get(def.id); return; }
    const minD = def.kind === 'pistol' ? 0.3 : vm.reticle ? 0.09 : def.adsType === '2d_scope_overlay' ? 0.07 : 0.13;
    const cam = this._adsCam || (this._adsCam = new THREE.PerspectiveCamera(48, 1.6, 0.01, 10)); cam.updateMatrixWorld();
    const g = vm.group, v = new THREE.Vector3(), p = new THREE.Vector3(), z0 = vm.adsPos.z;
    for (let it = 0; it < 3; it++) {
      g.position.copy(vm.adsPos); g.rotation.copy(vm.adsRot); g.updateMatrixWorld(true);
      let near = Infinity;
      g.traverse((o) => {
        if (!o.isMesh || !o.visible || this.isArm(o)) return;
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); if (v.z > -0.01) continue; p.copy(v).project(cam); if (Math.abs(p.x) < 0.6 && p.y > -0.6 && p.y < 0.95 && -v.z < near) near = -v.z; }
      });
      if (near >= minD - 0.002) break;
      vm.adsPos.z -= minD - near;
    }
    g.position.copy(vm.hipPos); g.rotation.copy(vm.hipRot); g.updateMatrixWorld(true);
    this.adsFit.set(def.id, vm.adsPos.z - z0);
  }
  isArm(o) { return o.material === this.M.glove || o.material === this.M.sleeve; }
  // GLTF support: the loaded mesh is fitted to the procedural gun's bounds; hands/arms stay procedural. Any failure keeps the fallback mesh.
  async attachGLTF(vm, url) {
    try {
      if (!this.gltf.has(url)) this.gltf.set(url, new GLTFLoader().loadAsync(url));
      const gltf = await this.gltf.get(url), model = gltf.scene.clone(true);
      const g = vm.group, saveP = g.position.clone(), saveR = g.rotation.clone();
      g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
      const ref = new THREE.Box3(); g.traverse((o) => { if (o.isMesh && !this.isArm(o) && o.visible) ref.expandByObject(o); });
      const mb = new THREE.Box3().setFromObject(model), rs = ref.getSize(new THREE.Vector3()), ms = mb.getSize(new THREE.Vector3());
      const k = rs.z / Math.max(1e-4, ms.z); model.scale.setScalar(k);
      const mc = mb.getCenter(new THREE.Vector3()).multiplyScalar(k), rc = ref.getCenter(new THREE.Vector3());
      model.position.copy(rc).sub(mc);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      g.traverse((o) => { if (o.isMesh && !this.isArm(o)) o.visible = false; });
      g.add(model); vm.gltf = model; g.position.copy(saveP); g.rotation.copy(saveR);
    } catch (e) { console.warn('GLTF model unavailable, using procedural fallback:', url, e && e.message); }
  }
  // Warehouse turntable model (no arms), cached per weapon.
  preview(def) {
    const key = def.id;
    if (this.previews.has(key)) return this.previews.get(key);
    const vm = this.build(def), g = vm.group;
    g.traverse((o) => { if (o.isMesh && this.isArm(o)) o.visible = false; if (o.isSprite) o.visible = false; });
    const inner = new THREE.Group(), holder = new THREE.Group(); inner.add(g); holder.add(inner); inner.rotation.set(0, -Math.PI / 2, 0); holder.updateMatrixWorld(true);
    const box = new THREE.Box3(); g.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o); });
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), k = 2.3 / Math.max(size.x, size.y * 2.4, 0.2);
    inner.position.copy(c).multiplyScalar(-1); const pivot = new THREE.Group(); pivot.add(holder); holder.scale.setScalar(k);
    this.previews.set(key, pivot);
    return pivot;
  }

  _flash(parent, x, y, u, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.M.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(3) }));
    s.position.set(x, y, -u); s.scale.set(size, size, 1); s.visible = false; s.renderOrder = 10; s.userData.baseScale = size; parent.add(s);
    return s;
  }
  _reticle(parent, y, dot = false) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot ? this.M.dotTex : this.M.reticle, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, color: new THREE.Color(1, 0.22, 0.16).multiplyScalar(dot ? 3.2 : 2.2), opacity: 0 }));
    s.position.set(0, y, -3); const k = dot ? 0.075 : 0.32; s.scale.set(k, k, 1); s.renderOrder = 4; parent.add(s);
    return s;
  }

  // Forearm from wrist to an off-screen elbow + glove cuff.
  arm(gb, wrist, elbow, r = 0.037, node = 'body') {
    const a = new THREE.Vector3(...wrist), b = new THREE.Vector3(...elbow), d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CapsuleGeometry(r, len, 4, 12); g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate(a.x, a.y, a.z);
    gb.add(g, this.M.sleeve, node);
    const c = new THREE.CylinderGeometry(r + 0.004, r + 0.002, 0.05, 12); c.translate(0, 0.02, 0);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); c.translate(a.x, a.y, a.z);
    gb.add(c, this.M.glove, node);
  }
  // Gloved hand wrapped around a vertical grip (pistol grip).
  gripHand(gb, x, y, u, tilt, trigger = true) {
    const M = this.M;
    gb.box(0.05, 0.075, 0.07, x + 0.004, y, -u, M.glove, 'body', 0.018, tilt, 0, 0);
    for (let i = 0; i < 3; i++) gb.box(0.056, 0.017, 0.028, x, y - 0.024 + i * 0.019, -(u + 0.036), M.glove, 'body', 0.007, tilt, 0, 0);
    gb.box(0.018, 0.018, 0.05, x - 0.022, y + 0.03, -(u + 0.012), M.glove, 'body', 0.008, 0.3, 0.25, 0);
    if (trigger) gb.box(0.014, 0.014, 0.045, x - 0.004, y + 0.04, -(u + 0.05), M.glove, 'body', 0.006, 0.15, 0, 0);
  }
  // Support hand under a handguard, fingers wrapping the left side.
  supportHand(gb, x, y, u, w = 0.046, node = 'body') {
    const M = this.M;
    gb.box(0.058, 0.024, 0.085, x, y - w / 2 - 0.01, -u, M.glove, node, 0.01);
    for (let i = 0; i < 4; i++) gb.box(0.016, 0.042, 0.018, x - w / 2 - 0.006, y - 0.004, -(u - 0.03 + i * 0.02), M.glove, node, 0.007, 0, 0, 0.25);
    gb.box(0.016, 0.03, 0.05, x + w / 2 + 0.004, y - 0.004, -(u + 0.01), M.glove, node, 0.007, 0, 0, -0.2);
  }

  /* ------------------------------------------------------------------ */
  m4() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(0, 0.024, 0.13));
    gb.prof([[-0.13, -0.012], [0.12, -0.012], [0.12, 0.026], [0.1, 0.029], [-0.11, 0.029], [-0.13, 0.024]], 0.03, M.black);
    gb.rail(-0.12, 0.11, 0.029, M.black);
    gb.box(0.002, 0.014, 0.05, 0.0155, 0.006, 0.02, M.black, 'body');
    gb.cylAxis(0.006, 0.012, 0.018, 0.012, -0.1, 'x', M.black);
    gb.prof([[-0.12, -0.012], [0.07, -0.012], [0.07, -0.05], [0.0, -0.05], [-0.02, -0.035], [-0.12, -0.035]], 0.026, M.black);
    gb.prof([[0.0, -0.048], [0.066, -0.048], [0.066, -0.075], [0.0, -0.075]], 0.028, M.black);
    gb.prof([[-0.075, -0.035], [0.012, -0.035], [0.012, -0.041], [-0.07, -0.041], [-0.09, -0.052], [-0.098, -0.052], [-0.095, -0.035]], 0.02, M.black, 'body', { bevel: 0.0015 });
    gb.box(0.004, 0.016, 0.004, 0, -0.043, 0.012, M.bright);
    gb.prof([[-0.085, -0.037], [-0.045, -0.037], [-0.07, -0.13], [-0.098, -0.132], [-0.106, -0.12]], 0.028, M.polymer, 'body', { bevel: 0.004 });
    gb.prof([[0.004, -0.02], [0.058, -0.02], [0.074, -0.12], [0.07, -0.21], [0.052, -0.215], [0.036, -0.215], [0.042, -0.12], [0.02, -0.02]], 0.023, M.black, 'mag', { bevel: 0.002 });
    gb.box(0.026, 0.008, 0.042, 0, -0.216, -0.046, M.polymer, 'mag', 0.002, 0.18);
    gb.box(0.016, 0.006, 0.02, 0, 0.028, 0.14, M.black, 'charge', 0.002); gb.box(0.03, 0.004, 0.01, 0, 0.028, 0.152, M.black, 'charge', 0.002);
    gb.cyl(0.0155, 0.0155, 0.24, 0, -0.005, -0.25, M.black, 'body', 20);
    gb.prof([[-0.3, 0.02], [-0.25, 0.022], [-0.25, -0.03], [-0.32, -0.05], [-0.395, -0.058], [-0.395, 0.032], [-0.32, 0.03]], 0.036, M.polymer, 'body', { bevel: 0.004 });
    gb.box(0.036, 0.1, 0.012, 0, -0.012, 0.4, M.rubber, 'body', 0.003);
    gb.box(0.044, 0.046, 0.25, 0, 0.004, -0.245, M.black, 'body', 0.005);
    for (let i = 0; i < 7; i++) { const u = 0.15 + i * 0.03; for (const sx of [-1, 1]) gb.box(0.002, 0.012, 0.018, sx * 0.0225, 0.004, -u, M.polymer); }
    gb.rail(0.125, 0.365, 0.027, M.black);
    for (const sx of [-1, 1]) { const g = gb.box(0.006, 0.02, 0.12, sx * 0.026, 0.004, -0.3, M.black); void g; }
    gb.cyl(0.0086, 0.0086, 0.15, 0, 0, 0.44, M.steel, 'body', 16);
    gb.box(0.026, 0.028, 0.03, 0, -0.002, -0.4, M.black, 'body', 0.003);
    gb.lathe([[0, 0.51], [0.011, 0.508], [0.011, 0.462], [0.009, 0.458], [0, 0.458]], 0, 0, M.black);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; gb.box(0.003, 0.003, 0.034, Math.cos(a) * 0.0105, Math.sin(a) * 0.0105, -0.487, M.rubber); }
    const sightY = gb.holo(-0.03, 0.029, M.black);
    this.arm(gb, [0.02, -0.12, 0.1], [0.19, -0.3, 0.42], 0.034); this.gripHand(gb, 0.001, -0.085, -0.078, -0.36);
    this.arm(gb, [-0.036, -0.05, -0.22], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, 0.004, 0.24);
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.515, sightY, hipPos: [0.13, -0.135, -0.33], adsPos: [0, -sightY, -0.2], flash: 0.2, reticle: true });
  }

  // Gold G36C — built from its iconic parts so it reads instantly: tall arched CARRY HANDLE running along the whole
  // receiver (with the rail + red dot on top), vented handguard with oval ports, longer exposed barrel + gas block,
  // big integrated trigger guard, side-folding skeleton stock, translucent magazine with coupling lugs.
  g36c() {
    const M = this.M, gb = new GunBuilder(M);
    const oval = (u, v, a, b, n = 10) => { const p = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; p.push([u + Math.cos(t) * a, v + Math.sin(t) * b]); } return p; };
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(0, 0.045, -0.07));
    // receiver (rounded rear, flat top, magwell step)
    gb.prof([[-0.13, -0.028], [-0.02, -0.034], [0.07, -0.034], [0.1, -0.03], [0.1, 0.038], [-0.108, 0.038], [-0.13, 0.028]], 0.042, M.gold, 'body', { bevel: 0.005 });
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.018, 0.01, sx * 0.0215, 0.006, -(-0.08 + i * 0.022), M.goldDark);
    gb.box(0.03, 0.008, 0.02, 0.02, 0.012, 0.06, M.goldDark, 'body', 0.002); // selector
    // vented handguard with four oval cooling ports per side
    gb.prof([[0.1, -0.03], [0.265, -0.027], [0.282, -0.014], [0.282, 0.024], [0.268, 0.034], [0.1, 0.034]], 0.048, M.gold, 'body', {
      bevel: 0.004, holes: [oval(0.13, 0.003, 0.012, 0.01), oval(0.17, 0.003, 0.012, 0.01), oval(0.21, 0.003, 0.012, 0.01), oval(0.248, 0.003, 0.011, 0.009)] });
    gb.rail(0.12, 0.27, -0.032, M.goldDark, 'body', 0.02); // bottom rail (flipped under the handguard)
    gb.cyl(0.0105, 0.0105, 0.19, 0, 0.004, 0.19, M.steel, 'body', 14); // barrel visible through the ports
    // CARRY HANDLE: an arch over the receiver with the big grab opening
    gb.prof([[-0.1, 0.038], [0.18, 0.038], [0.18, 0.058], [0.152, 0.098], [0.13, 0.106], [-0.068, 0.106], [-0.09, 0.1], [-0.1, 0.082]], 0.03, M.gold, 'body', {
      bevel: 0.004, holes: [[[-0.07, 0.052], [0.125, 0.052], [0.14, 0.06], [0.118, 0.09], [-0.054, 0.09], [-0.07, 0.078]]] });
    gb.rail(-0.06, 0.12, 0.106, M.goldDark, 'body', 0.022);
    gb.box(0.034, 0.006, 0.19, 0, 0.1045, -0.03, M.goldDark, 'body', 0.002);
    gb.box(0.01, 0.014, 0.03, 0, 0.046, 0.07, M.polymer, 'charge', 0.003); gb.box(0.034, 0.008, 0.012, 0, 0.05, 0.057, M.polymer, 'charge', 0.003); // charging handle under the arch
    // longer exposed barrel, gas block, then the suppressor (it is the suppressed "G36C 黃金")
    gb.cyl(0.0095, 0.0095, 0.11, 0, 0.004, 0.335, M.steel, 'body', 16);
    gb.box(0.026, 0.028, 0.03, 0, -0.004, -0.3, M.goldDark, 'body', 0.004); gb.cyl(0.0075, 0.0075, 0.07, 0, -0.018, 0.33, M.steel, 'body', 10);
    gb.cyl(0.017, 0.017, 0.17, 0, 0.004, 0.475, M.suppressor, 'body', 26);
    gb.lathe([[0.0, 0.392], [0.0165, 0.39], [0.0185, 0.386], [0.0185, 0.384], [0.0, 0.384]], 0, 0.004, M.polymer);
    gb.lathe([[0, 0.566], [0.006, 0.566], [0.006, 0.562], [0.015, 0.562], [0.0185, 0.558], [0.0185, 0.556], [0, 0.556]], 0, 0.004, M.polymer);
    // integrated pistol grip + the big G36 trigger guard
    gb.prof([[-0.078, -0.03], [-0.036, -0.03], [-0.06, -0.128], [-0.09, -0.131], [-0.1, -0.118]], 0.032, M.polymer, 'body', { bevel: 0.005 });
    gb.prof([[-0.04, -0.03], [0.03, -0.03], [0.03, -0.042], [0.012, -0.07], [-0.03, -0.074], [-0.046, -0.06]], 0.024, M.gold, 'body', { bevel: 0.002, holes: [[[-0.03, -0.036], [0.018, -0.036], [0.006, -0.062], [-0.026, -0.064]]] });
    gb.box(0.004, 0.018, 0.005, 0, -0.045, 0.0, M.bright);
    // translucent magazine with the side coupling lugs
    gb.prof([[0.012, -0.02], [0.066, -0.02], [0.086, -0.1], [0.096, -0.188], [0.076, -0.195], [0.058, -0.195], [0.052, -0.105], [0.028, -0.02]], 0.026, M.magClear, 'mag', { bevel: 0.002 });
    for (const sx of [-1, 1]) for (const v of [-0.07, -0.14]) gb.box(0.006, 0.012, 0.012, sx * 0.015, v, -(0.05 + (v + 0.07) * -0.25), M.polymer, 'mag', 0.002);
    gb.box(0.029, 0.01, 0.044, 0, -0.197, -0.066, M.polymer, 'mag', 0.003, 0.2);
    // side-folding skeleton stock + butt pad
    gb.prof([[-0.13, 0.026], [-0.36, 0.022], [-0.4, 0.01], [-0.405, -0.075], [-0.385, -0.085], [-0.32, -0.03], [-0.13, -0.022]], 0.03, M.gold, 'body', {
      bevel: 0.004, holes: [[[-0.16, 0.012], [-0.34, 0.01], [-0.37, -0.005], [-0.36, -0.02], [-0.33, -0.02], [-0.18, -0.012]], [[-0.385, 0.0], [-0.393, 0.0], [-0.395, -0.06], [-0.387, -0.066], [-0.36, -0.035]]] });
    gb.box(0.03, 0.095, 0.012, 0, -0.03, 0.41, M.rubber, 'body', 0.004);
    gb.cylAxis(0.008, 0.046, 0, 0.018, 0.13, 'x', M.goldDark); // stock hinge
    const sightY = gb.redDot(-0.03, 0.112, M.polymer);
    this.arm(gb, [0.02, -0.115, 0.1], [0.19, -0.3, 0.42]); this.gripHand(gb, 0.001, -0.08, -0.068, -0.36);
    this.arm(gb, [-0.038, -0.06, -0.2], [-0.3, -0.3, 0.08], 0.033); this.supportHand(gb, 0, 0.0, 0.2, 0.048);
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.566, sightY, hipPos: [0.13, -0.16, -0.33], adsPos: [0, -sightY, -0.2], flash: 0.08, reticle: 'dot' });
  }

  mp5() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.03, -0.02)).node('charge', new THREE.Vector3(-0.024, 0.02, -0.2));
    gb.cyl(0.02, 0.02, 0.27, 0, 0.004, 0.035, M.black, 'body', 20);
    gb.prof([[-0.1, 0.0], [0.17, 0.0], [0.17, 0.03], [-0.1, 0.03]], 0.026, M.black, 'body', { bevel: 0.003 });
    gb.prof([[-0.1, -0.02], [0.02, -0.02], [0.02, -0.042], [-0.02, -0.052], [-0.1, -0.05]], 0.03, M.polymer, 'body', { bevel: 0.004 });
    gb.prof([[-0.08, -0.045], [-0.045, -0.045], [-0.068, -0.13], [-0.094, -0.132], [-0.1, -0.12]], 0.03, M.polymer, 'body', { bevel: 0.005 });
    gb.prof([[-0.05, -0.045], [0.0, -0.045], [0.0, -0.05], [-0.045, -0.058], [-0.05, -0.052]], 0.016, M.polymer);
    gb.prof([[0.0, -0.01], [0.042, -0.01], [0.09, -0.1], [0.13, -0.17], [0.11, -0.18], [0.07, -0.13], [0.02, -0.07], [-0.005, -0.012]], 0.022, M.black, 'mag', { bevel: 0.002 });
    gb.cyl(0.024, 0.022, 0.15, 0, 0.0, 0.24, M.polymer, 'body', 22);
    for (let i = 0; i < 6; i++) gb.torus(0.0232, 0.0022, 0, 0, 0.18 + i * 0.02, 'z', M.rubber);
    gb.cyl(0.0075, 0.0075, 0.06, 0, 0.004, 0.34, M.steel, 'body', 14); gb.cyl(0.011, 0.011, 0.02, 0, 0.004, 0.36, M.steel, 'body', 14);
    gb.cyl(0.006, 0.006, 0.14, -0.022, 0.022, 0.18, M.black, 'body', 10);
    gb.box(0.006, 0.02, 0.01, -0.03, 0.022, 0.2, M.black, 'charge', 0.002);
    gb.box(0.012, 0.02, 0.012, 0, 0.034, -0.3, M.black, 'body', 0.002);
    gb.torus(0.011, 0.0022, 0, 0.045, 0.3, 'z', M.black); gb.box(0.0022, 0.012, 0.003, 0, 0.041, -0.3, M.black); gb.box(0.003, 0.003, 0.003, 0, 0.0465, -0.3, M.dotW);
    gb.cylAxis(0.013, 0.022, 0, 0.045, -0.075, 'x', M.black, 'body', 16); gb.box(0.012, 0.012, 0.03, 0, 0.034, 0.075, M.black);
    gb.torus(0.0035, 0.0012, 0, 0.045, -0.065, 'z', M.bright);
    for (const sx of [-1, 1]) gb.cyl(0.004, 0.004, 0.24, sx * 0.018, -0.005, -0.22, M.steel, 'body', 8);
    gb.box(0.05, 0.11, 0.014, 0, -0.03, 0.35, M.rubber, 'body', 0.005);
    this.arm(gb, [0.02, -0.12, 0.1], [0.19, -0.3, 0.42]); this.gripHand(gb, 0.001, -0.085, -0.075, -0.33);
    this.arm(gb, [-0.036, -0.05, -0.21], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, 0.0, 0.23, 0.048);
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.37, sightY: 0.045, hipPos: [0.125, -0.13, -0.32], adsPos: [0, -0.045, -0.13], flash: 0.17 });
  }

  m200() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.04, -0.02)).node('bolt', new THREE.Vector3(0.03, 0.02, 0.11));
    gb.prof([[-0.15, -0.035], [0.2, -0.035], [0.2, 0.03], [-0.15, 0.03]], 0.05, M.black, 'body', { bevel: 0.005 });
    gb.rail(-0.13, 0.19, 0.03, M.black, 'body', 0.024);
    gb.cyl(0.028, 0.026, 0.36, 0, 0.0, 0.38, M.black, 'body', 8);
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) gb.box(0.004, 0.004, 0.3, Math.cos(a) * 0.028, Math.sin(a) * 0.028, -0.37, M.polymer);
    gb.cyl(0.012, 0.011, 0.5, 0, 0.0, 0.8, M.steel, 'body', 16);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; gb.box(0.002, 0.002, 0.3, Math.cos(a) * 0.0115, Math.sin(a) * 0.0115, -0.7, M.polymer); }
    gb.box(0.036, 0.03, 0.08, 0, 0.0, -1.08, M.black, 'body', 0.004);
    for (const sx of [-1, 1]) gb.box(0.003, 0.018, 0.05, sx * 0.019, 0.0, -1.08, M.rubber);
    for (const sx of [-1, 1]) gb.box(0.008, 0.012, 0.22, sx * 0.018, -0.042, -0.42, M.black, 'body', 0.003);
    gb.cyl(0.019, 0.019, 0.26, 0, 0.078, 0.0, M.black, 'body', 24);
    gb.lathe([[0, 0.23], [0.03, 0.23], [0.03, 0.2], [0.019, 0.12], [0, 0.12]], 0, 0.078, M.black);
    gb.lathe([[0, -0.12], [0.019, -0.12], [0.026, -0.17], [0.026, -0.2], [0, -0.2]], 0, 0.078, M.black);
    const lens = new THREE.CircleGeometry(0.027, 24); lens.translate(0, 0.078, -0.2305); gb.add(lens, M.lensDark);
    gb.cylAxis(0.012, 0.03, 0, 0.1, -0.01, 'y', M.black); gb.cylAxis(0.012, 0.03, 0.022, 0.078, -0.01, 'x', M.black);
    for (const u of [-0.06, 0.08]) { gb.torus(0.021, 0.004, 0, 0.078, u, 'z', M.black); gb.box(0.022, 0.03, 0.018, 0, 0.048, -u, M.black); }
    gb.cylAxis(0.006, 0.055, 0.057, 0.0, -0.11, 'x', M.bright, 'bolt'); void 0;
    const knob = new THREE.SphereGeometry(0.013, 12, 10); knob.translate(0.087, 0.0, 0.11); gb.add(knob, M.polymer, 'bolt');
    gb.prof([[-0.15, 0.03], [-0.42, 0.034], [-0.46, 0.02], [-0.47, -0.1], [-0.44, -0.11], [-0.25, -0.06], [-0.16, -0.035]], 0.042, M.polymer, 'body', {
      bevel: 0.005, holes: [[[-0.19, 0.015], [-0.4, 0.018], [-0.42, 0.0], [-0.4, -0.02], [-0.22, -0.03]], [[-0.3, -0.06], [-0.43, -0.03], [-0.44, -0.085], [-0.41, -0.09]]] });
    gb.box(0.03, 0.028, 0.12, 0, 0.05, 0.3, M.polymer, 'body', 0.006);
    gb.box(0.042, 0.13, 0.014, 0, -0.04, 0.475, M.rubber, 'body', 0.005);
    gb.prof([[-0.09, -0.035], [-0.055, -0.035], [-0.08, -0.13], [-0.105, -0.13], [-0.11, -0.12]], 0.03, M.polymer, 'body', { bevel: 0.005 });
    gb.prof([[-0.085, -0.035], [0.0, -0.035], [0.0, -0.041], [-0.07, -0.041], [-0.09, -0.05]], 0.02, M.black);
    gb.prof([[0.02, -0.025], [0.12, -0.025], [0.12, -0.1], [0.02, -0.1]], 0.04, M.black, 'mag', { bevel: 0.003 });
    this.arm(gb, [0.02, -0.12, 0.13], [0.19, -0.3, 0.44]); this.gripHand(gb, 0.001, -0.09, -0.09, -0.3);
    this.arm(gb, [-0.04, -0.06, -0.34], [-0.32, -0.3, 0.0], 0.033); this.supportHand(gb, 0, 0.0, 0.36, 0.056);
    const b = gb.build();
    return this._finish(b, { muzzleU: 1.12, sightY: 0.078, hipPos: [0.14, -0.15, -0.36], adsPos: [0, -0.078, -0.12], flash: 0.32, bolt: true });
  }

  p226() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('slide', new THREE.Vector3(0, 0, 0)).node('mag', new THREE.Vector3(0, -0.1, 0.06));
    gb.prof([[-0.085, 0.004], [0.1, 0.004], [0.105, 0.012], [0.105, 0.026], [0.098, 0.031], [-0.08, 0.031], [-0.088, 0.024]], 0.03, M.black, 'slide', { bevel: 0.003 });
    for (let i = 0; i < 7; i++) gb.box(0.032, 0.02, 0.0025, 0, 0.018, 0.075 - i * 0.006, M.polymer, 'slide');
    gb.box(0.002, 0.012, 0.035, 0.0155, 0.02, -0.01, M.polymer, 'slide');
    for (const sx of [-1, 1]) gb.box(0.008, 0.007, 0.008, sx * 0.007, 0.0345, 0.078, M.black, 'slide');
    gb.box(0.0035, 0.007, 0.008, 0, 0.0345, -0.098, M.black, 'slide');
    const d1 = new THREE.SphereGeometry(0.0018, 8, 6); d1.translate(0, 0.036, -0.102); gb.add(d1, M.dotG, 'slide');
    for (const sx of [-1, 1]) { const d = new THREE.SphereGeometry(0.0016, 8, 6); d.translate(sx * 0.0075, 0.035, 0.0735); gb.add(d, M.dotG, 'slide'); }
    gb.cyl(0.0075, 0.0075, 0.012, 0, 0.018, 0.106, M.steel, 'slide', 12);
    gb.prof([[-0.075, -0.018], [0.1, -0.018], [0.1, 0.004], [-0.075, 0.004]], 0.027, M.black, 'body', { bevel: 0.002 });
    gb.prof([[-0.01, -0.018], [0.045, -0.018], [0.05, -0.028], [0.04, -0.045], [-0.005, -0.048], [-0.02, -0.03]], 0.02, M.black, 'body', { bevel: 0.002, holes: [[[0.0, -0.022], [0.038, -0.022], [0.034, -0.038], [0.002, -0.04]]] });
    gb.box(0.004, 0.018, 0.005, 0, -0.03, -0.018, M.bright);
    gb.prof([[-0.075, -0.018], [-0.02, -0.018], [-0.04, -0.105], [-0.075, -0.11], [-0.088, -0.095], [-0.085, -0.03]], 0.03, M.rubber, 'body', { bevel: 0.005 });
    gb.box(0.008, 0.012, 0.012, 0, 0.03, 0.086, M.black);
    gb.prof([[-0.073, -0.105], [-0.042, -0.105], [-0.041, -0.112], [-0.076, -0.114]], 0.026, M.black, 'mag', { bevel: 0.002 });
    gb.box(0.05, 0.07, 0.078, 0.006, -0.058, 0.057, M.glove, 'body', 0.02, -0.28);
    gb.box(0.04, 0.066, 0.078, -0.028, -0.064, 0.045, M.glove, 'body', 0.02, -0.28, 0.2);
    this.arm(gb, [0.012, -0.1, 0.1], [0.14, -0.24, 0.42], 0.036); this.arm(gb, [-0.03, -0.1, 0.09], [-0.16, -0.25, 0.4], 0.036);
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.11, sightY: 0.0365, hipPos: [0.095, -0.1, -0.27], adsPos: [0, -0.0365, -0.25], flash: 0.13, slide: true });
  }

  p90() { // bullpup PDW: tan shell, thumbhole grips, translucent 50-round top magazine, integrated reflex sight
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, 0.056, 0.05)).node('charge', new THREE.Vector3(0.03, 0.02, -0.13));
    gb.prof([[-0.26, -0.05], [-0.26, 0.028], [-0.2, 0.042], [0.12, 0.042], [0.168, 0.022], [0.178, -0.02], [0.16, -0.05]], 0.056, M.tan, 'body', { bevel: 0.007 });
    gb.prof([[-0.268, -0.1], [-0.26, -0.05], [0.16, -0.05], [0.15, -0.078], [0.104, -0.142], [0.062, -0.152], [0.035, -0.14], [-0.02, -0.15], [-0.08, -0.13], [-0.16, -0.142], [-0.24, -0.14]], 0.05, M.polymer, 'body', {
      bevel: 0.006, holes: [[[0.078, -0.07], [0.128, -0.07], [0.1, -0.124], [0.07, -0.128]], [[-0.052, -0.068], [0.02, -0.068], [0.012, -0.124], [-0.04, -0.128]]] });
    gb.box(0.06, 0.012, 0.3, 0, -0.046, 0.06, M.polymer, 'body', 0.004);
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.03, 0.012, sx * 0.0285, -0.012, -(-0.2 + i * 0.03), M.polymer);
    gb.box(0.05, 0.028, 0.34, 0, 0.056, 0.05, M.magClear, 'mag', 0.004);
    for (let i = 0; i < 16; i++) { const g = new THREE.CylinderGeometry(0.0035, 0.0035, 0.034, 6); g.rotateZ(Math.PI / 2); g.translate(0, 0.056 + (i % 2 ? 0.004 : -0.004), -(-0.2 + i * 0.02)); gb.add(g, M.gold, 'mag'); }
    gb.box(0.052, 0.01, 0.03, 0, 0.056, 0.205, M.polymer, 'mag', 0.003);
    gb.box(0.034, 0.012, 0.1, 0, 0.076, -0.075, M.polymer, 'body', 0.003);
    const sightY = gb.redDot(0.035, 0.082, M.polymer);
    for (const sx of [-1, 1]) gb.box(0.01, 0.01, 0.018, sx * 0.032, 0.022, -0.13, M.polymer, 'charge', 0.003);
    gb.cyl(0.009, 0.009, 0.1, 0, -0.004, 0.22, M.steel, 'body', 14);
    gb.cyl(0.0125, 0.012, 0.035, 0, -0.004, 0.265, M.black, 'body', 16);
    this.arm(gb, [0.022, -0.14, 0.02], [0.19, -0.33, 0.36], 0.034); this.gripHand(gb, 0.001, -0.108, -0.012, -0.12);
    this.arm(gb, [-0.036, -0.1, -0.14], [-0.3, -0.32, 0.1], 0.033); this.gripHand(gb, -0.004, -0.108, 0.1, -0.08, false);
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.285, sightY, hipPos: [0.125, -0.12, -0.3], adsPos: [0, -sightY, -0.19], flash: 0.14, reticle: 'dot', magMove: [0, 0.1, 0.2], magRot: -0.25 });
  }

  m870() { // pump-action 12 gauge: walnut stock & forend, side-saddle shells, bead sight
    const M = this.M, gb = new GunBuilder(M);
    gb.node('pump', new THREE.Vector3(0, -0.016, -0.3));
    gb.prof([[-0.11, -0.032], [0.13, -0.032], [0.13, 0.026], [0.1, 0.032], [-0.09, 0.032], [-0.11, 0.024]], 0.038, M.black, 'body', { bevel: 0.004 });
    gb.box(0.003, 0.02, 0.07, 0.0195, 0.006, -0.03, M.polymer);
    gb.box(0.03, 0.006, 0.16, 0, 0.034, -0.01, M.black, 'body', 0.002);
    gb.cyl(0.013, 0.013, 0.5, 0, 0.012, 0.38, M.steel, 'body', 18);
    gb.cyl(0.012, 0.012, 0.42, 0, -0.018, 0.33, M.black, 'body', 16);
    gb.cyl(0.0135, 0.0135, 0.02, 0, -0.018, 0.545, M.steel, 'body', 16);
    const bead = new THREE.SphereGeometry(0.0028, 10, 8); bead.translate(0, 0.0275, -0.61); gb.add(bead, M.bright);
    gb.box(0.046, 0.05, 0.17, 0, -0.016, -0.3, M.wood, 'pump', 0.012);
    for (let i = 0; i < 7; i++) gb.box(0.048, 0.004, 0.006, 0, -0.04, -(0.235 + i * 0.022), M.woodDark, 'pump');
    gb.box(0.02, 0.012, 0.19, 0.012, -0.016, -0.15, M.black, 'pump');
    gb.prof([[-0.11, 0.026], [-0.43, 0.012], [-0.46, 0.0], [-0.47, -0.105], [-0.43, -0.115], [-0.22, -0.066], [-0.14, -0.05], [-0.1, -0.1], [-0.068, -0.11], [-0.06, -0.034], [-0.11, -0.03]], 0.04, M.wood, 'body', { bevel: 0.006 });
    gb.box(0.042, 0.125, 0.016, 0, -0.05, 0.47, M.rubber, 'body', 0.005);
    gb.prof([[-0.06, -0.032], [0.02, -0.032], [0.02, -0.038], [-0.045, -0.038], [-0.062, -0.052], [-0.07, -0.05]], 0.02, M.black);
    for (let i = 0; i < 4; i++) { gb.cylAxis(0.0095, 0.05, -0.024, 0.0, -(0.0 + i * 0.024), 'y', M.redShell); gb.cylAxis(0.0098, 0.012, -0.024, -0.026, -(0.0 + i * 0.024), 'y', M.gold); }
    gb.box(0.004, 0.036, 0.11, -0.021, -0.006, -0.036, M.black);
    this.arm(gb, [0.02, -0.115, 0.13], [0.19, -0.3, 0.46], 0.034); this.gripHand(gb, 0.001, -0.08, -0.1, -0.42);
    this.arm(gb, [-0.036, -0.066, -0.3], [-0.3, -0.32, 0.02], 0.033, 'pump'); this.supportHand(gb, 0, -0.016, 0.3, 0.05, 'pump');
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.63, sightY: 0.0275, hipPos: [0.13, -0.14, -0.34], adsPos: [0, -0.034, -0.17], flash: 0.3, pump: true });
  }

  m249() { // belt-fed LMG: feed cover, carry handle, box magazine, folded bipod, heat shield
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(-0.045, -0.1, -0.06)).node('cover', new THREE.Vector3(0, 0.046, 0.1)).node('charge', new THREE.Vector3(0.036, 0.0, -0.1));
    gb.prof([[-0.13, -0.05], [0.2, -0.05], [0.2, 0.046], [-0.11, 0.046], [-0.13, 0.03]], 0.062, M.black, 'body', { bevel: 0.005 });
    gb.prof([[-0.1, 0.046], [0.12, 0.046], [0.12, 0.058], [0.09, 0.07], [-0.08, 0.07], [-0.1, 0.06]], 0.058, M.black, 'cover', { bevel: 0.004 });
    gb.rail(-0.07, 0.1, 0.07, M.black, 'cover', 0.022);
    gb.box(0.02, 0.012, 0.012, 0, 0.083, 0.07, M.black, 'cover', 0.002); gb.box(0.006, 0.006, 0.006, 0, 0.086, 0.07, M.dotW, 'cover');
    for (let i = 0; i < 5; i++) gb.box(0.064, 0.004, 0.006, 0, 0.02 - i * 0.012, -(0.13 + i * 0.012), M.polymer);
    gb.cyl(0.013, 0.013, 0.55, 0, 0.0, 0.47, M.steel, 'body', 16);
    gb.cyl(0.0095, 0.0095, 0.36, 0, -0.03, 0.38, M.black, 'body', 12);
    gb.box(0.064, 0.062, 0.17, 0, -0.012, -0.29, M.polymer, 'body', 0.008);
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.016, 0.02, sx * 0.0325, -0.01, -(0.23 + i * 0.035), M.black);
    gb.box(0.048, 0.03, 0.2, 0, 0.03, -0.46, M.black, 'body', 0.004);
    for (let i = 0; i < 6; i++) gb.box(0.05, 0.006, 0.012, 0, 0.046, -(0.38 + i * 0.03), M.polymer);
    gb.box(0.012, 0.03, 0.12, 0, 0.078, -0.33, M.black, 'body', 0.005); for (const u of [0.28, 0.38]) gb.box(0.012, 0.03, 0.012, 0, 0.058, -u, M.black);
    gb.box(0.006, 0.034, 0.008, 0, 0.058, -0.66, M.black); gb.box(0.004, 0.006, 0.004, 0, 0.076, -0.66, M.dotW);
    gb.cyl(0.0145, 0.014, 0.05, 0, 0.0, 0.755, M.black, 'body', 14);
    for (const sx of [-1, 1]) gb.cyl(0.004, 0.004, 0.22, sx * 0.012, -0.03, 0.53, M.steel, 'body', 8);
    gb.box(0.03, 0.012, 0.03, 0, -0.03, -0.64, M.black, 'body', 0.003);
    gb.prof([[-0.13, 0.03], [-0.42, 0.024], [-0.46, 0.012], [-0.47, -0.09], [-0.44, -0.1], [-0.3, -0.05], [-0.13, -0.045]], 0.044, M.polymer, 'body', {
      bevel: 0.005, holes: [[[-0.17, 0.012], [-0.39, 0.01], [-0.41, -0.01], [-0.4, -0.03], [-0.2, -0.03]]] });
    gb.box(0.046, 0.12, 0.014, 0, -0.03, 0.47, M.rubber, 'body', 0.005);
    gb.prof([[-0.08, -0.05], [-0.042, -0.05], [-0.066, -0.14], [-0.092, -0.142], [-0.1, -0.13]], 0.032, M.polymer, 'body', { bevel: 0.005 });
    gb.prof([[-0.07, -0.05], [0.01, -0.05], [0.01, -0.056], [-0.055, -0.056], [-0.075, -0.066], [-0.082, -0.064]], 0.02, M.black);
    gb.box(0.07, 0.1, 0.11, -0.045, -0.1, 0.06, M.greenPaint, 'mag', 0.008);
    gb.box(0.074, 0.012, 0.114, -0.045, -0.05, 0.06, M.black, 'mag', 0.003);
    for (let i = 0; i < 5; i++) gb.box(0.014, 0.01, 0.006, -0.018, -0.04 + i * 0.012, 0.055 - i * 0.004, M.gold, 'mag');
    gb.box(0.012, 0.016, 0.02, 0.04, 0.0, 0.1, M.black, 'charge', 0.003);
    this.arm(gb, [0.02, -0.13, 0.1], [0.19, -0.31, 0.42], 0.034); this.gripHand(gb, 0.001, -0.095, -0.075, -0.36);
    this.arm(gb, [-0.036, -0.075, -0.3], [-0.3, -0.32, 0.04], 0.033); this.supportHand(gb, 0, -0.012, 0.3, 0.064);
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.78, sightY: 0.086, hipPos: [0.135, -0.15, -0.35], adsPos: [0, -0.086, -0.14], flash: 0.28, cover: true, magMove: [-0.04, -0.26, 0.02], magRot: 0.15 });
  }

  deagle() { // .50 AE: brushed-steel slide with the triangular bore, heavy frame, rubber grip
    const M = this.M, gb = new GunBuilder(M);
    gb.node('slide', new THREE.Vector3(0, 0, 0)).node('mag', new THREE.Vector3(0, -0.11, 0.07));
    gb.prof([[-0.1, 0.004], [0.122, 0.004], [0.128, 0.014], [0.126, 0.03], [0.118, 0.038], [-0.094, 0.038], [-0.1, 0.03]], 0.035, M.bright, 'slide', { bevel: 0.003 });
    for (let i = 0; i < 8; i++) gb.box(0.037, 0.024, 0.0028, 0, 0.022, 0.085 - i * 0.0065, M.steel, 'slide');
    gb.box(0.004, 0.006, 0.12, 0, 0.041, -0.01, M.steel, 'slide');
    gb.box(0.012, 0.008, 0.01, 0, 0.042, 0.088, M.black, 'slide'); gb.box(0.004, 0.009, 0.01, 0, 0.0425, -0.112, M.black, 'slide');
    const d1 = new THREE.SphereGeometry(0.0017, 8, 6); d1.translate(0, 0.045, -0.116); gb.add(d1, M.dotW, 'slide');
    gb.cyl(0.0085, 0.0085, 0.01, 0, 0.02, 0.126, M.black, 'slide', 3);
    gb.prof([[-0.09, -0.02], [0.115, -0.02], [0.115, 0.004], [-0.09, 0.004]], 0.032, M.steel, 'body', { bevel: 0.002 });
    gb.prof([[-0.012, -0.02], [0.05, -0.02], [0.056, -0.03], [0.046, -0.05], [-0.006, -0.054], [-0.022, -0.034]], 0.022, M.steel, 'body', { bevel: 0.002, holes: [[[0.0, -0.024], [0.042, -0.024], [0.038, -0.042], [0.002, -0.045]]] });
    gb.box(0.004, 0.02, 0.005, 0, -0.033, -0.02, M.bright);
    gb.prof([[-0.09, -0.02], [-0.024, -0.02], [-0.044, -0.122], [-0.088, -0.128], [-0.101, -0.112], [-0.099, -0.032]], 0.036, M.rubber, 'body', { bevel: 0.006 });
    gb.box(0.01, 0.014, 0.014, 0, 0.036, 0.098, M.steel);
    gb.prof([[-0.088, -0.122], [-0.045, -0.122], [-0.044, -0.13], [-0.09, -0.132]], 0.03, M.steel, 'mag', { bevel: 0.002 });
    gb.box(0.052, 0.072, 0.08, 0.006, -0.064, 0.062, M.glove, 'body', 0.02, -0.28);
    gb.box(0.042, 0.068, 0.08, -0.03, -0.07, 0.05, M.glove, 'body', 0.02, -0.28, 0.2);
    this.arm(gb, [0.012, -0.105, 0.105], [0.14, -0.24, 0.42], 0.036); this.arm(gb, [-0.03, -0.105, 0.095], [-0.16, -0.25, 0.4], 0.036);
    const b = gb.build();
    return this._finish(b, { muzzleU: 0.13, sightY: 0.0455, hipPos: [0.1, -0.105, -0.28], adsPos: [0, -0.0455, -0.27], flash: 0.2, slide: true });
  }

  knife() {
    const M = this.M, gb = new GunBuilder(M);
    gb.prof([[0, -0.016], [0.16, -0.014], [0.195, -0.004], [0.205, 0.006], [0.17, 0.014], [0.12, 0.016], [0, 0.016]], 0.005, M.blade, 'body', { bevel: 0.0012 });
    gb.prof([[0.01, 0.004], [0.13, 0.006], [0.13, 0.01], [0.01, 0.01]], 0.0056, M.steel, 'body', { bevel: 0.0005 });
    gb.box(0.02, 0.058, 0.012, 0, 0, 0.004, M.black, 'body', 0.003);
    gb.box(0.026, 0.034, 0.11, 0, -0.001, 0.066, M.rubber, 'body', 0.008);
    for (let i = 0; i < 4; i++) gb.box(0.028, 0.036, 0.005, 0, -0.001, 0.03 + i * 0.024, M.polymer);
    gb.box(0.028, 0.038, 0.016, 0, -0.001, 0.126, M.steel, 'body', 0.004);
    gb.box(0.055, 0.058, 0.09, 0.004, -0.004, 0.07, M.glove, 'body', 0.02);
    for (let i = 0; i < 3; i++) gb.box(0.02, 0.014, 0.022, -0.02, 0.012 - i * 0.014, 0.05 + i * 0.022, M.glove, 'body', 0.006);
    this.arm(gb, [0.01, -0.01, 0.12], [0.08, -0.06, 0.45], 0.037);
    const b = gb.build();
    return this._finish(b, { knife: true, hipPos: [0.16, -0.15, -0.3], hipRot: [0.474, 0.584, 2.159] });
  }

  grenade(type) {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('pin', new THREE.Vector3(0.028, 0.04, -0.01)).node('nade', new THREE.Vector3(0, 0, 0));
    if (type === 'he') {
      const s = new THREE.SphereGeometry(0.033, 18, 14); s.scale(1, 1.12, 1); gb.add(s, M.greenPaint, 'nade');
      gb.cyl(0.012, 0.012, 0.016, 0, 0.04, 0, M.bright, 'nade', 12);
    } else if (type === 'flash') {
      gb.add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 16), M.grayPaint, 'nade');
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gb.box(0.006, 0.02, 0.006, Math.cos(a) * 0.022, 0.01, Math.sin(a) * 0.022, M.rubber, 'nade'); }
      gb.cyl(0.012, 0.012, 0.016, 0, 0.056, 0, M.bright, 'nade', 12);
    } else {
      gb.add(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 18), M.greenPaint, 'nade');
      gb.cyl(0.027, 0.027, 0.02, 0, 0.05, 0, M.dotW, 'nade', 18);
      gb.cyl(0.012, 0.012, 0.016, 0, 0.066, 0, M.bright, 'nade', 12);
    }
    gb.box(0.01, 0.06, 0.012, 0.018, 0.02, 0, M.bright, 'nade', 0.003, 0, 0, -0.35);
    gb.torus(0.012, 0.0018, 0.028, 0.045, 0.01, 'x', M.bright, 'pin');
    gb.box(0.056, 0.07, 0.07, 0.004, -0.028, 0.02, M.glove, 'body', 0.022);
    for (let i = 0; i < 3; i++) gb.box(0.02, 0.016, 0.03, -0.03, -0.01 + i * 0.018, 0.0, M.glove, 'body', 0.007);
    this.arm(gb, [0.01, -0.06, 0.07], [0.12, -0.24, 0.42], 0.037);
    const b = gb.build();
    return this._finish(b, { grenade: true, hipPos: [0.13, -0.12, -0.3], hipRot: [0.15, 0.2, 0.1] });
  }

  // Left arm used for the F-grab (hand at local origin, forearm trailing back/down).
  leftArm() {
    const M = this.M, gb = new GunBuilder(M);
    gb.box(0.07, 0.024, 0.085, 0, 0, 0, M.glove, 'body', 0.011);
    for (let i = 0; i < 4; i++) gb.box(0.014, 0.012, 0.055, -0.025 + i * 0.017, 0.002, -0.06, M.glove, 'body', 0.005, 0.25, 0, 0);
    gb.box(0.016, 0.014, 0.045, 0.042, 0.004, -0.01, M.glove, 'body', 0.006, 0, 0.6, 0);
    this.arm(gb, [0, -0.005, 0.05], [0.05, -0.1, 0.42], 0.035);
    const b = gb.build();
    return { group: b.group };
  }

  _finish(b, o) {
    const g = b.group, out = { group: g, nodes: b.nodes, mag: b.nodes.mag || null, bolt: b.nodes.bolt || null, slide: b.nodes.slide || null, charge: b.nodes.charge || null,
      pin: b.nodes.pin || null, nade: b.nodes.nade || null, pump: b.nodes.pump || null, cover: b.nodes.cover || null };
    out.magMove = new THREE.Vector3(...(o.magMove || [0, -0.3, 0.05])); out.magRot = o.magRot ?? 0.3;
    out.hipPos = new THREE.Vector3(...o.hipPos); out.hipRot = new THREE.Euler(...(o.hipRot || [0, 0.035, 0]));
    out.adsPos = o.adsPos ? new THREE.Vector3(...o.adsPos) : out.hipPos.clone(); out.adsRot = o.adsPos ? new THREE.Euler(0, 0, 0) : out.hipRot.clone();
    if (o.muzzleU) { out.muzzle = new THREE.Object3D(); out.muzzle.position.set(0, 0, -o.muzzleU); g.add(out.muzzle); out.flash = this._flash(g, 0, 0, o.muzzleU + 0.03, o.flash); }
    if (o.reticle) out.reticle = this._reticle(g, o.sightY, o.reticle === 'dot');
    return out;
  }

  /* ---------------------- third-person (low detail) ---------------------- */
  tp(id) {
    if (this.tpCache.has(id)) return this.tpCache.get(id);
    const spec = WEAPON_DATABASE[id] && WEAPON_DATABASE[id].tp;
    if (spec) { const g = this.tpGeneric(spec); this.tpCache.set(id, g); return g; }
    const list = [], C = (hex) => new THREE.Color(hex);
    const bx = (w, h, d, x, y, z, col) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); list.push([g, col]); };
    const cy = (r, len, x, y, z, col) => { const g = new THREE.CylinderGeometry(r, r, len, 8); g.rotateX(Math.PI / 2); g.translate(x, y, z); list.push([g, col]); };
    const dark = C(0x1c1d1f), gold = C(0xd9a441), poly = C(0x151515);
    if (id === 'm4' || id === 'g36c' || id === 'mp5') {
      const body = id === 'g36c' ? gold : dark;
      bx(0.045, 0.07, 0.36, 0, 0, -0.08, body); bx(0.03, 0.12, 0.04, 0, -0.07, 0.02, poly); bx(0.035, 0.13, 0.05, 0, -0.09, -0.07, id === 'g36c' ? C(0x2a2520) : dark);
      bx(0.04, 0.06, 0.2, 0, 0, 0.18, id === 'g36c' ? gold : poly); cy(0.009, 0.16, 0, 0.01, -0.33, dark);
      if (id === 'g36c') { cy(0.018, 0.17, 0, 0.01, -0.46, poly); bx(0.03, 0.06, 0.26, 0, 0.07, -0.08, gold); bx(0.028, 0.02, 0.06, 0, 0.11, -0.08, poly); }
      else bx(0.03, 0.03, 0.06, 0, 0.055, -0.06, dark);
    } else if (id === 'm200') {
      bx(0.05, 0.07, 0.4, 0, 0, -0.05, dark); cy(0.012, 0.6, 0, 0.01, -0.55, dark); cy(0.022, 0.3, 0, 0.07, -0.05, dark); bx(0.04, 0.1, 0.25, 0, -0.02, 0.28, poly); bx(0.03, 0.12, 0.04, 0, -0.08, 0.05, poly);
    } else if (id === 'p226') {
      bx(0.03, 0.04, 0.19, 0, 0, -0.02, dark); bx(0.03, 0.11, 0.045, 0, -0.07, 0.05, poly);
    } else if (id === 'deagle') {
      bx(0.034, 0.045, 0.24, 0, 0, -0.03, C(0x9ea3a9)); bx(0.034, 0.12, 0.05, 0, -0.075, 0.05, poly);
    } else if (id === 'p90') {
      bx(0.05, 0.09, 0.44, 0, -0.01, 0.0, C(0x8a7654)); bx(0.04, 0.025, 0.3, 0, 0.05, -0.02, C(0x2a2520)); cy(0.009, 0.1, 0, 0, -0.26, dark); bx(0.03, 0.035, 0.08, 0, 0.075, -0.1, poly);
    } else if (id === 'm870') {
      bx(0.04, 0.06, 0.22, 0, 0, -0.02, dark); cy(0.012, 0.5, 0, 0.012, -0.36, dark); cy(0.012, 0.4, 0, -0.018, -0.3, dark);
      bx(0.046, 0.05, 0.16, 0, -0.016, -0.3, C(0x6b4428)); bx(0.036, 0.09, 0.3, 0, -0.03, 0.26, C(0x6b4428));
    } else if (id === 'm249') {
      bx(0.062, 0.095, 0.34, 0, 0, -0.03, dark); cy(0.013, 0.56, 0, 0, -0.46, dark); bx(0.07, 0.1, 0.11, -0.045, -0.1, -0.06, C(0x3e4a2c));
      bx(0.044, 0.1, 0.3, 0, -0.02, 0.28, poly); bx(0.012, 0.03, 0.12, 0, 0.075, -0.33, dark);
    } else if (id === 'knife') {
      bx(0.006, 0.03, 0.2, 0, 0, -0.1, C(0xb8bec4)); bx(0.025, 0.03, 0.11, 0, 0, 0.05, poly);
    } else { const s = new THREE.SphereGeometry(0.04, 10, 8); list.push([s, C(0x3e4a2c)]); }
    const geos = list.map(([g, col]) => { const ng = g.index ? g.toNonIndexed() : g; const n = ng.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); ng.deleteAttribute('uv'); return ng; });
    const geo = mergeGeometries(geos, false);
    this.tpCache.set(id, geo);
    return geo;
  }
}

/* =====================================================================
   SOLDIER FACTORY — vertex-coloured capsule/rounded-box soldiers,
   one merged mesh per rigid part (≈8 draw calls per character).
   ===================================================================== */
const TEAM_PALETTE = {
  alpha: { uniform: 0x7d7152, pants: 0x6a6146, vest: 0x4b5237, pouch: 0x59603f, helmet: 0x6e6a52, glove: 0x2a2a26, boot: 0x3a3228, skin: 0xc49a78, band: 0x2f7fe0, face: 0xc49a78, goggle: 0x111111 },
  bravo: { uniform: 0x2e2f33, pants: 0x28292c, vest: 0x4a1a17, pouch: 0x2a2a2a, helmet: 0x232323, glove: 0x1a1a1a, boot: 0x1e1e1e, skin: 0xb48868, band: 0xd8382c, face: 0x1b1b1b, goggle: 0x222222 },
};
class SoldierFactory {
  constructor(tf, weaponModels) {
    this.wm = weaponModels; this.cache = {};
    const fab = tf.surface('fabric');
    this.baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, map: fab.map, normalMap: fab.normalMap });
    this.gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
    this.baseMat.userData.keep = this.gunMat.userData.keep = true;
  }
  _geo(team) {
    if (this.cache[team]) return this.cache[team];
    const P = TEAM_PALETTE[team], parts = {};
    const add = (part, g, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      g = g.index ? g.toNonIndexed() : g; g.scale(sx, sy, sz);
      if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      g.translate(x, y, z);
      const col = new THREE.Color(hex), n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      (parts[part] = parts[part] || []).push(g);
    };
    const RB = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
    const limb = (part, a, b, r, hex) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(B, A), len = d.length();
      const g = cap(r, Math.max(0.01, len - r)); g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
      add(part, g, hex);
    };
    // legs (pivot at hip / knee)
    add('thigh', cap(0.085, 0.3), P.pants, 0, -0.2, 0);
    add('thigh', RB(0.14, 0.1, 0.1, 0.03), P.pouch, 0.06, -0.16, 0.01);
    add('shin', cap(0.07, 0.3), P.pants, 0, -0.2, 0);
    add('shin', RB(0.1, 0.1, 0.06, 0.03), 0x2a2a2a, 0, -0.03, -0.075);
    add('shin', RB(0.13, 0.11, 0.27, 0.04), P.boot, 0, -0.44, -0.04);
    // torso (pivot at hips)
    add('torso', RB(0.36, 0.2, 0.22, 0.06), P.pants, 0, 0.02, 0);
    add('torso', RB(0.34, 0.24, 0.2, 0.07), P.uniform, 0, 0.2, 0);
    add('torso', RB(0.44, 0.36, 0.29, 0.06), P.vest, 0, 0.42, 0);
    for (const x of [-0.12, 0, 0.12]) add('torso', RB(0.085, 0.11, 0.05, 0.015), P.pouch, x, 0.33, -0.16);
    add('torso', RB(0.3, 0.32, 0.13, 0.04), P.pouch, 0, 0.44, 0.2);
    add('torso', RB(0.06, 0.2, 0.05, 0.02), 0x1e1e1e, 0.1, 0.62, 0.22);
    for (const sx of [-1, 1]) { const s = new THREE.SphereGeometry(0.075, 10, 8); add('torso', s, P.uniform, sx * 0.235, 0.53, 0); add('torso', RB(0.05, 0.05, 0.1, 0.02), P.band, sx * 0.25, 0.44, 0); }
    add('torso', new THREE.CylinderGeometry(0.055, 0.06, 0.08, 10), P.uniform, 0, 0.62, 0);
    // head (pivot at neck)
    add('head', new THREE.SphereGeometry(0.105, 16, 12), P.face, 0, 0.1, 0, 0, 0, 0, 0.95, 1.12, 1);
    add('head', RB(0.08, 0.035, 0.02, 0.008), P.goggle, 0, 0.1, -0.097);
    add('head', new THREE.SphereGeometry(0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), P.helmet, 0, 0.12, 0.004);
    add('head', new THREE.TorusGeometry(0.128, 0.012, 6, 20), P.helmet, 0, 0.125, 0.004, Math.PI / 2);
    add('head', RB(0.2, 0.045, 0.04, 0.015), P.goggle, 0, 0.18, -0.115, 0.3);
    add('head', RB(0.05, 0.05, 0.04, 0.01), 0x151515, 0, 0.22, -0.12);
    add('head', new THREE.TorusGeometry(0.133, 0.01, 6, 20), P.band, 0, 0.16, 0.004, Math.PI / 2 - 0.12);
    for (const sx of [-1, 1]) add('head', RB(0.04, 0.07, 0.06, 0.015), 0x252525, sx * 0.11, 0.1, 0);
    // arms (pivot at shoulder line), rifle-ready pose
    limb('arms', [0.23, 0, 0], [0.21, -0.22, -0.1], 0.06, P.uniform);
    limb('arms', [0.21, -0.22, -0.1], [0.08, -0.14, -0.32], 0.052, P.uniform);
    limb('arms', [-0.23, 0, 0], [-0.2, -0.16, -0.18], 0.06, P.uniform);
    limb('arms', [-0.2, -0.16, -0.18], [-0.03, -0.08, -0.5], 0.052, P.uniform);
    add('arms', RB(0.07, 0.07, 0.09, 0.025), P.glove, 0.07, -0.14, -0.34); add('arms', RB(0.07, 0.07, 0.09, 0.025), P.glove, -0.02, -0.07, -0.52);
    const out = {};
    for (const [k, v] of Object.entries(parts)) out[k] = mergeGeometries(v, false);
    this.cache[team] = out;
    return out;
  }

  create(team, weaponId) {
    const G = this._geo(team), mat = this.baseMat.clone(); mat.userData.keep = false;
    const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
    const root = new THREE.Group(), legs = [];
    for (const sx of [-0.105, 0.105]) {
      const hip = new THREE.Group(); hip.position.set(sx, 0.92, 0); root.add(hip); hip.add(mk(G.thigh));
      const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee); knee.add(mk(G.shin));
      legs.push({ hip, knee });
    }
    const torso = new THREE.Group(); torso.position.set(0, 0.92, 0); root.add(torso); torso.add(mk(G.torso));
    const head = new THREE.Group(); head.position.set(0, 0.66, 0); torso.add(head); head.add(mk(G.head));
    const arms = new THREE.Group(); arms.position.set(0, 0.5, 0); torso.add(arms); arms.add(mk(G.arms));
    const gunHolder = new THREE.Group(); gunHolder.position.set(0.06, -0.1, -0.32); arms.add(gunHolder);
    const muzzle = new THREE.Object3D(); gunHolder.add(muzzle);
    const s = { root, legs, torso, head, arms, gunHolder, muzzle, mat, gun: null };
    this.setWeapon(s, weaponId);
    return s;
  }

  setWeapon(s, id) {
    if (s.gun) s.gunHolder.remove(s.gun);
    s.gun = new THREE.Mesh(this.wm.tp(id), this.gunMat); s.gun.castShadow = true; s.gunHolder.add(s.gun);
    const spec = WEAPON_DATABASE[id] && WEAPON_DATABASE[id].tp;
    const len = spec ? spec.len * 0.72 : ({ m4: 0.42, g36c: 0.55, mp5: 0.34, m200: 0.85, p226: 0.12, deagle: 0.15, knife: 0.2, p90: 0.3, m870: 0.62, m249: 0.76 }[id] ?? 0.3);
    const small = id === 'p226' || id === 'deagle' || id === 'knife' || !!(spec && spec.pistol);
    s.muzzle.position.set(0, 0.01, -len);
    s.gunHolder.position.set(small ? 0.03 : 0.06, small ? -0.12 : -0.1, small && id !== 'knife' ? -0.42 : -0.32);
  }
}

