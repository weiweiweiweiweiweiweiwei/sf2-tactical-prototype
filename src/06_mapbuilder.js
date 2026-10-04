/* =====================================================================
   MAP BUILDER — declarative level construction. Every primitive
   produces batched visuals (merged per material), collision AABBs,
   cannon static bodies, radar footprints and navigation hints.
   In `dry` mode only radar/spawn data is produced (lobby thumbnails).
   ===================================================================== */
const MAT_SURF = {
  polished: 'concrete', concrete: 'concrete', concreteWall: 'concrete', asphalt: 'concrete', pavers: 'concrete', brick: 'concrete', tileFloor: 'concrete',
  ceiling: 'concrete', officeWall: 'plaster', plaster: 'plaster', plasterRed: 'plaster', plasterWhite: 'plaster',
  siding: 'metal', sidingTan: 'metal', plate: 'metal', steel: 'metal', darkSteel: 'metal', yellowSteel: 'metal', whiteSteel: 'metal', rust: 'metal', roof: 'metal',
  barrelBlue: 'metal', barrelRed: 'metal', wood: 'wood', desk: 'wood', bark: 'wood', sand: 'sand', snow: 'snow', carpet: 'carpet', sandbag: 'sandbag', partition: 'carpet',
  grass: 'grass', dirt: 'sand', rock: 'concrete', ruinStone: 'concrete', ruinDark: 'concrete',
};
const SURF_STEP = { concrete: 'concrete', plaster: 'concrete', metal: 'metal', wood: 'wood', sand: 'sand', snow: 'snow', carpet: 'carpet', sandbag: 'sand', glass: 'concrete', grass: 'grass' };

const ShaftShader = {
  uniforms: { uColor: { value: new THREE.Color(1, 0.93, 0.8) }, uIntensity: { value: 0.12 }, uTime: { value: 0 } },
  vertexShader: `attribute float vh; varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vW;
    void main(){ vH = vh; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uIntensity; uniform float uTime; varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vW;
    void main(){ float d = length(vV); float facing = abs(dot(normalize(vN), vV / d));
      float a = uIntensity * pow(1.0 - vH, 1.3) * pow(facing, 1.2) * smoothstep(0.5, 4.0, d);
      a *= 0.8 + 0.2 * sin(vW.x * 1.7 + vW.z * 1.3 + uTime * 0.4);
      gl_FragColor = vec4(uColor * a, 1.0); }`,
};

class MapBuilder {
  constructor(game, def, dry = false) {
    this.game = game; this.def = def; this.dry = dry;
    if (!dry) { this.scene = game.scene; this.col = game.collision; this.phys = game.physics; this.lib = game.app.mats; this.tf = game.app.tex; }
    this.radar = []; this.navChains = []; this.navExtra = []; this.navRegions = []; this.waypoints = []; this.zones = {}; this.ladders = []; this.objectives = {}; this.T = null;
    this.batches = new Map(); this.shafts = []; this.lightCount = 0; this.animated = []; this.used = new Set();
    this.bounds = def.bounds;
  }

  mat(name) { return this.dry ? null : this.lib.get(name); }
  _batch(mat, geo, cast = true) {
    const key = mat.uuid + (cast ? ':c' : ':n');
    if (!this.batches.has(key)) this.batches.set(key, { mat, cast, geos: [] });
    this.batches.get(key).geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  flush() {
    if (this.dry) return;
    for (const { mat, cast, geos } of this.batches.values()) {
      for (const g of geos) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); g.clearGroups(); }
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (mat.transparent) mesh.userData.noAO = true;
      this.scene.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    this.batches.clear();
  }
  sym(fn) { fn(1); fn(-1); }

  // v17: bake contact AO (see CAO in 03_textures.js). Solid static boxes standing on the ground are rasterised top-down,
  // weighted by height, then blurred (3 box passes ≈ gaussian σ 0.55 m). G stores the ground height so catwalks and upper
  // floors are left alone. Costs one texture fetch per pixel at runtime — no extra render pass.
  bakeContactAO() {
    if (this.dry) return;
    const B = this.bounds, pad = 4, x0 = B.minX - pad, z0 = B.minZ - pad, sx = B.maxX - B.minX + pad * 2, sz = B.maxZ - B.minZ + pad * 2;
    const cell = Math.max(sx * sz > 6000 ? 0.5 : 0.25, sx / 1024, sz / 1024), W = Math.ceil(sx / cell), H = Math.ceil(sz / cell);
    const T = this.col.terrain, gh = new Float32Array(W * H), occ = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) gh[i + j * W] = T ? T.heightAt(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell) : 0;
    for (const b of this.col.boxes) {
      if (!b.blocksMove || !b.blocksShot || b.material === 'glass') continue;
      const i0 = Math.max(0, Math.floor((b.min.x - x0) / cell)), i1 = Math.min(W - 1, Math.floor((b.max.x - x0) / cell));
      const j0 = Math.max(0, Math.floor((b.min.z - z0) / cell)), j1 = Math.min(H - 1, Math.floor((b.max.z - z0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = i + j * W, g = gh[k], h = b.max.y - Math.max(b.min.y, g);
        if (b.min.y > g + 0.35 || h < 0.3) continue;
        occ[k] = Math.max(occ[k], clamp(h / 1.2, 0.3, 1));
      }
    }
    const r = Math.max(1, Math.round(0.55 / cell)), inv = 1 / (2 * r + 1), tmp = new Float32Array(W * H);
    const blur = (src, dst, horiz) => {
      const n = horiz ? W : H, lines = horiz ? H : W, st = horiz ? 1 : W, ln = horiz ? W : 1;
      for (let a = 0; a < lines; a++) {
        const base = a * ln; let acc = 0;
        for (let t = -r; t <= r; t++) acc += src[base + clamp(t, 0, n - 1) * st];
        for (let t = 0; t < n; t++) { dst[base + t * st] = acc * inv; acc += src[base + Math.min(n - 1, t + r + 1) * st] - src[base + Math.max(0, t - r) * st]; }
      }
    };
    for (let p = 0; p < 3; p++) { blur(occ, tmp, true); blur(tmp, occ, false); }
    const data = new Uint16Array(W * H * 4), hf = THREE.DataUtils.toHalfFloat, one = hf(1);
    for (let k = 0; k < W * H; k++) { data[k * 4] = hf(1 - 0.78 * Math.min(1, occ[k] * 1.3)); data[k * 4 + 1] = hf(gh[k]); data[k * 4 + 3] = one; }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    if (CAO.uCAOMap.value.userData.baked) CAO.uCAOMap.value.dispose();
    tex.userData.baked = true; CAO.uCAOMap.value = tex;
    CAO.uCAOBox.value.set(x0, z0, 1 / (W * cell), 1 / (H * cell)); CAO.uCAOOn.value = 1; CAO.uCAODust.value = this.def.caoDust ?? 1;
    this.caoInfo = { W, H, cell };
  }

  box(x0, y0, z0, x1, y1, z1, matName, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 0 || h <= 0 || d <= 0) return;
    if (matName) this.used.add(matName);
    if (!this.dry && matName) {
      const geo = worldBox(w, h, d, o.tile ?? this.lib.tile(matName));
      geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this._batch(this.mat(matName), geo, o.cast !== false);
    }
    const collide = o.collide !== false;
    if (o.radar || (collide && o.radar !== false && h >= 0.4 && y0 < 3)) this.radar.push({ x0, z0, x1, z1, kind: o.radar || 'solid', top: y1 });
    if (!collide || this.dry) return;
    const surf = o.surface || MAT_SURF[matName] || 'concrete';
    this.col.addBox(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), {
      material: o.material || surf, surface: SURF_STEP[surf] || 'concrete', penetrable: o.penetrable, blocksShot: o.blocksShot, blocksMove: o.blocksMove,
    });
    if (o.physics !== false) this.phys.addStaticBox(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  }
  deco(x0, y0, z0, x1, y1, z1, matName, o = {}) { this.box(x0, y0, z0, x1, y1, z1, matName, Object.assign({ collide: false, radar: false }, o)); }

  geo(geo, matName, cast = true) { this.used.add(matName); if (!this.dry) this._batch(this.mat(matName), geo, cast); }

  cyl(x, z, r, y0, y1, matName, o = {}) {
    this.used.add(matName);
    if (!this.dry) {
      const g = new THREE.CylinderGeometry(o.r1 ?? r, r, y1 - y0, o.seg || 20, 1, false);
      if (o.axis === 'x') { g.rotateZ(Math.PI / 2); } else if (o.axis === 'z') g.rotateX(Math.PI / 2);
      g.translate(x, (y0 + y1) / 2, z); this.geo(g, matName, o.cast !== false);
    }
    if (o.collide === false) return;
    if (o.axis === 'x') { const hl = (y1 - y0) / 2; this.box(x - hl, o.cy - r, z - r, x + hl, o.cy + r, z + r, null, { material: o.material || MAT_SURF[matName], radar: o.radar || 'solid' }); }
    else { const k = r * 0.88; this.box(x - k, y0, z - k, x + k, y1, z + k, null, { material: o.material || MAT_SURF[matName], radar: o.radar || 'solid', penetrable: o.penetrable }); }
  }

  ramp(r, matName = 'plate') {
    this.radar.push({ x0: r.minX, z0: r.minZ, x1: r.maxX, z1: r.maxZ, kind: 'ramp', top: r.y1 });
    const isX = r.axis === 'x', L = isX ? r.maxX - r.minX : r.maxZ - r.minZ, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, pts = [];
    for (const t of [-0.15, 0, 0.25, 0.5, 0.75, 1, 1 + 1.25 / L]) {
      const along = isX ? (r.dir > 0 ? r.minX + L * t : r.maxX - L * t) : (r.dir > 0 ? r.minZ + L * t : r.maxZ - L * t);
      pts.push(new THREE.Vector3(isX ? along : cx, t < 0 ? r.y0 : t > 1 ? r.y1 : r.y0 + (r.y1 - r.y0) * t, isX ? cz : along));
    }
    this.navChains.push(pts);
    if (this.dry) return;
    this.col.addRamp(Object.assign({ material: MAT_SURF[matName] || 'metal', surface: SURF_STEP[MAT_SURF[matName]] || 'metal' }, r));
    this.phys.addStaticRamp(r);
    const W = isX ? r.maxZ - r.minZ : r.maxX - r.minX, H = r.y1 - r.y0;
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(L, 0); shape.lineTo(L, H); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6);
    g.translate(-L / 2, 0, -W / 2);
    g.rotateY(isX ? (r.dir > 0 ? 0 : Math.PI) : (r.dir > 0 ? -Math.PI / 2 : Math.PI / 2));
    g.translate(cx, r.y0, cz);
    this.geo(g, matName);
  }

  // Solid staircase. axis: direction of travel; from = coordinate of the first step's front edge.
  stairs({ axis, from, dir, a0, a1, steps, rise, run, y0 = 0, mat = 'plate', nosing = 'yellowSteel', lead = 0.9, leadTop = 1.1 }) {
    for (let i = 0; i < steps; i++) {
      const p = from + dir * run * i, q = from + dir * run * (i + 1), top = y0 + rise * (i + 1);
      if (axis === 'x') this.box(Math.min(p, q), y0, a0, Math.max(p, q), top, a1, mat, { radar: 'ramp' });
      else this.box(a0, y0, Math.min(p, q), a1, top, Math.max(p, q), mat, { radar: 'ramp' });
      const f = dir > 0 ? p : p - 0.08;
      if (axis === 'x') this.deco(f, top, a0, f + 0.08, top + 0.012, a1, nosing, { cast: false });
      else this.deco(a0, top, f, a1, top + 0.012, f + 0.08, nosing, { cast: false });
    }
    const c = (a0 + a1) / 2, end = from + dir * run * steps, H = y0 + rise * steps, P = (along, y) => axis === 'x' ? new THREE.Vector3(along, y, c) : new THREE.Vector3(c, y, along);
    this.navChains.push([P(from - dir * lead, y0), P(from + dir * run * steps * 0.3, y0 + H * 0.3 - y0 * 0.3 + rise), P(from + dir * run * steps * 0.7, y0 + (H - y0) * 0.7 + rise * 0.5), P(end + dir * leadTop, H)]);
  }

  container(cx, cz, axis, stack, color, y0 = 0) {
    const L = 6.06, W = 2.44, H = 2.6, hx = axis === 'x' ? L / 2 : W / 2, hz = axis === 'x' ? W / 2 : L / 2;
    for (let s = 0; s < stack; s++) {
      const mname = 'container:' + ((color + s * 3) % CONTAINER_COLORS.length), yb = y0 + s * H;
      this.box(cx - hx, yb, cz - hz, cx + hx, yb + H, cz + hz, mname, { tile: H, material: 'metal', radar: stack > 1 ? 'container2' : 'container' });
      if (this.dry) continue;
      for (const side of [-1, 1]) for (const off of [-0.3, 0.3]) { // door locking bars
        if (axis === 'x') this.deco(cx + side * (hx + 0.015) - 0.02, yb + 0.12, cz + off * W - 0.02, cx + side * (hx + 0.015) + 0.02, yb + H - 0.12, cz + off * W + 0.02, 'darkSteel');
        else this.deco(cx + off * W - 0.02, yb + 0.12, cz + side * (hz + 0.015) - 0.02, cx + off * W + 0.02, yb + H - 0.12, cz + side * (hz + 0.015) + 0.02, 'darkSteel');
      }
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.deco(cx + dx * hx - 0.09 * dx - 0.09, yb, cz + dz * hz - 0.09 * dz - 0.09, cx + dx * hx - 0.09 * dx + 0.09, yb + H, cz + dz * hz - 0.09 * dz + 0.09, 'rust', { cast: false });
    }
  }

  crate(cx, cz, size, y0 = 0) { this.box(cx - size / 2, y0, cz - size / 2, cx + size / 2, y0 + size, cz + size / 2, 'wood', { material: 'wood', penetrable: true, radar: 'crate', tile: size }); }

  barrel(cx, cz, red, y0 = 0) {
    if (!this.dry) {
      const g = new THREE.CylinderGeometry(0.3, 0.3, 0.92, 18); g.translate(cx, y0 + 0.46, cz); this.geo(g, red ? 'barrelRed' : 'barrelBlue');
      for (const y of [0.2, 0.72]) { const r = new THREE.TorusGeometry(0.302, 0.018, 6, 18); r.rotateX(Math.PI / 2); r.translate(cx, y0 + y, cz); this.geo(r, 'darkSteel'); }
    }
    this.box(cx - 0.28, y0, cz - 0.28, cx + 0.28, y0 + 0.92, cz + 0.28, null, { material: 'metal', radar: 'crate' });
  }

  pallet(cx, cz, y0 = 0, stackH = 0) {
    this.box(cx - 0.6, y0, cz - 0.5, cx + 0.6, y0 + 0.14, cz + 0.5, 'wood', { material: 'wood', radar: false, tile: 1 });
    if (stackH > 0) this.box(cx - 0.55, y0 + 0.14, cz - 0.45, cx + 0.55, y0 + 0.14 + stackH, cz + 0.45, 'sandbag', { material: 'sandbag', radar: 'crate', penetrable: true });
  }

  sandbags(x0, z0, x1, z1, h = 1.05, y0 = 0) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (z1 < z0) [z0, z1] = [z1, z0];
    this.box(x0, y0, z0, x1, y0 + h, z1, null, { material: 'sandbag', radar: 'sandbag' });
    if (this.dry) return;
    const alongX = x1 - x0 >= z1 - z0, len = alongX ? x1 - x0 : z1 - z0, depth = alongX ? z1 - z0 : x1 - x0, rows = Math.max(1, Math.round(h / 0.22));
    for (let r = 0; r < rows; r++) {
      const n = Math.max(1, Math.round(len / 0.62)), bl = len / n, off = (r % 2) * bl * 0.5;
      for (let i = 0; i < n; i++) {
        const a = alongX ? x0 : z0, c0 = a + i * bl + off - (r % 2 ? bl * 0.5 : 0);
        const s0 = Math.max(a, c0), s1 = Math.min(a + len, c0 + bl); if (s1 - s0 < 0.2) continue;
        const g = new RoundedBoxGeometry(alongX ? s1 - s0 - 0.02 : depth, h / rows - 0.01, alongX ? depth : s1 - s0 - 0.02, 1, 0.07); // 1 segment: ~108 tris per bag (was ~300; hundreds of bags × 3 render passes)
        const mid = (s0 + s1) / 2, y = y0 + (r + 0.5) * h / rows;
        g.translate(alongX ? mid : (x0 + x1) / 2, y, alongX ? (z0 + z1) / 2 : mid); this.geo(g, 'sandbag');
      }
    }
  }

  fence(x0, z0, x1, z1, h = 2.6) {
    this.box(Math.min(x0, x1) - 0.04, 0, Math.min(z0, z1) - 0.04, Math.max(x0, x1) + 0.04, h, Math.max(z0, z1) + 0.04, null, { blocksShot: false, physics: true, radar: 'fence' });
    if (this.dry) return;
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) { const t = i / n, px = lerp(x0, x1, t), pz = lerp(z0, z1, t); this.deco(px - 0.04, 0, pz - 0.04, px + 0.04, h, pz + 0.04, 'steel'); }
    this.deco(Math.min(x0, x1), h - 0.05, Math.min(z0, z1) - 0.025, Math.max(x0, x1), h, Math.max(z0, z1) + 0.025, 'steel');
    const tex = this.tf.simple('chainlink', 128, (ctx, S) => { ctx.clearRect(0, 0, S, S); ctx.strokeStyle = 'rgba(190,195,200,1)'; ctx.lineWidth = 5; for (let k = -S; k < S * 2; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + S, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k + S, 0); ctx.lineTo(k, S); ctx.stroke(); } }, true, true);
    const mat = this.lib.basic('chainlinkMat', () => new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }));
    const plane = new THREE.PlaneGeometry(len, h - 0.1); const uv = plane.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.35, uv.getY(i) * (h - 0.1) / 0.35);
    plane.rotateY(-Math.atan2(z1 - z0, x1 - x0)); plane.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    this._batch(mat, plane, true);
  }

  railing(x0, z0, x1, z1, y, mat = 'yellowSteel') {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? x1 - x0 : z1 - z0;
    if (len <= 0.05) return;
    for (const ry of [y + 1.0, y + 0.52]) {
      if (alongX) this.deco(x0, ry - 0.025, z0 - 0.025, x1, ry + 0.025, z0 + 0.025, mat); else this.deco(x0 - 0.025, ry - 0.025, z0, x0 + 0.025, ry + 0.025, z1, mat);
    }
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) { const p = i / n, px = alongX ? x0 + len * p : x0, pz = alongX ? z0 : z0 + len * p; this.deco(px - 0.03, y, pz - 0.03, px + 0.03, y + 1.0, pz + 0.03, mat); }
    if (alongX) this.box(x0, y, z0 - 0.06, x1, y + 1.05, z0 + 0.06, null, { blocksShot: false, physics: false, radar: false });
    else this.box(x0 - 0.06, y, z0, x0 + 0.06, y + 1.05, z1, null, { blocksShot: false, physics: false, radar: false });
  }
  railingWithGaps(fixed, from, to, gaps, alongX, y, mat) {
    let cur = from;
    for (const [a, b] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (a > cur) alongX ? this.railing(cur, fixed, a, fixed, y, mat) : this.railing(fixed, cur, fixed, a, y, mat); cur = Math.max(cur, b); }
    if (to > cur) alongX ? this.railing(cur, fixed, to, fixed, y, mat) : this.railing(fixed, cur, fixed, to, y, mat);
  }

  glass(x0, y0, z0, x1, y1, z1, o = {}) {
    this.box(x0, y0, z0, x1, y1, z1, null, { material: 'glass', penetrable: true, radar: 'glass' });
    if (this.dry) return;
    const mat = this.lib.basic('glassMat', () => new THREE.MeshPhysicalMaterial({ color: 0xbcd4dc, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }));
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const m = new THREE.Mesh(g, mat); m.userData.noAO = true; m.renderOrder = 2; this.scene.add(m);
    if (o.frame !== false) {
      const fm = o.frameMat || 'darkSteel', alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      if (alongX) { this.deco(x0, y0, z0 - 0.02, x1, y0 + 0.05, z1 + 0.02, fm); this.deco(x0, y1 - 0.05, z0 - 0.02, x1, y1, z1 + 0.02, fm); }
      else { this.deco(x0 - 0.02, y0, z0, x1 + 0.02, y0 + 0.05, z1, fm); this.deco(x0 - 0.02, y1 - 0.05, z0, x1 + 0.02, y1, z1, fm); }
    }
  }

  // Wall along X at depth z (centre), with openings [{a, b, y0, y1, glass}].
  wallX(z, x0, x1, y0, y1, t, mat, openings = [], o = {}) {
    const ops = openings.slice().sort((p, q) => p.a - q.a); let cur = x0;
    const z0 = z - t / 2, z1 = z + t / 2;
    for (const op of ops) {
      if (op.a > cur) this.box(cur, y0, z0, op.a, y1, z1, mat, o);
      const oy0 = op.y0 ?? y0, oy1 = op.y1 ?? y0 + 2.3;
      if (oy0 > y0) this.box(op.a, y0, z0, op.b, oy0, z1, mat, o);
      if (oy1 < y1) this.box(op.a, oy1, z0, op.b, y1, z1, mat, Object.assign({}, o, { radar: false }));
      if (op.glass) this.glass(op.a, oy0, z - 0.02, op.b, oy1, z + 0.02);
      if (oy0 <= y0 + 0.05 && !op.glass) { const m = (op.a + op.b) / 2; this.navExtra.push(new THREE.Vector3(m, y0, z - t / 2 - 0.8), new THREE.Vector3(m, y0, z + t / 2 + 0.8)); }
      cur = Math.max(cur, op.b);
    }
    if (x1 > cur) this.box(cur, y0, z0, x1, y1, z1, mat, o);
  }
  wallZ(x, z0, z1, y0, y1, t, mat, openings = [], o = {}) {
    const ops = openings.slice().sort((p, q) => p.a - q.a); let cur = z0;
    const x0 = x - t / 2, x1 = x + t / 2;
    for (const op of ops) {
      if (op.a > cur) this.box(x0, y0, cur, x1, y1, op.a, mat, o);
      const oy0 = op.y0 ?? y0, oy1 = op.y1 ?? y0 + 2.3;
      if (oy0 > y0) this.box(x0, y0, op.a, x1, oy0, op.b, mat, o);
      if (oy1 < y1) this.box(x0, oy1, op.a, x1, y1, op.b, mat, Object.assign({}, o, { radar: false }));
      if (op.glass) this.glass(x - 0.02, oy0, op.a, x + 0.02, oy1, op.b);
      if (oy0 <= y0 + 0.05 && !op.glass) { const m = (op.a + op.b) / 2; this.navExtra.push(new THREE.Vector3(x - t / 2 - 0.8, y0, m), new THREE.Vector3(x + t / 2 + 0.8, y0, m)); }
      cur = Math.max(cur, op.b);
    }
    if (z1 > cur) this.box(x0, y0, cur, x1, y1, z1, mat, o);
  }

  // Four-walled room. doors/windows keyed by side n(z1) s(z0) e(x1) w(x0): arrays of {a,b,y0,y1,glass}.
  room(x0, z0, x1, z1, o = {}) {
    const h = o.h ?? 3.2, t = o.t ?? 0.25, m = o.mat || 'plaster', y0 = o.y0 ?? 0, op = o.open || {};
    this.wallX(z0 + t / 2, x0, x1, y0, y0 + h, t, m, op.s || [], { radar: 'wall' });
    this.wallX(z1 - t / 2, x0, x1, y0, y0 + h, t, m, op.n || [], { radar: 'wall' });
    this.wallZ(x0 + t / 2, z0 + t, z1 - t, y0, y0 + h, t, m, op.w || [], { radar: 'wall' });
    this.wallZ(x1 - t / 2, z0 + t, z1 - t, y0, y0 + h, t, m, op.e || [], { radar: 'wall' });
    if (o.roof) this.box(x0 - (o.eave || 0), y0 + h, z0 - (o.eave || 0), x1 + (o.eave || 0), y0 + h + (o.roofT ?? 0.25), z1 + (o.eave || 0), o.roof, { radar: false });
    if (o.floor) this.deco(x0 + t, y0, z0 + t, x1 - t, y0 + 0.01, z1 - t, o.floor, { cast: false });
    if (o.parapet) { const p = o.parapet, top = y0 + h + (o.roofT ?? 0.25); this.box(x0, top, z0, x1, top + p, z0 + 0.25, m, { radar: false }); this.box(x0, top, z1 - 0.25, x1, top + p, z1, m, { radar: false }); this.box(x0, top, z0 + 0.25, x0 + 0.25, top + p, z1 - 0.25, m, { radar: false }); this.box(x1 - 0.25, top, z0 + 0.25, x1, top + p, z1 - 0.25, m, { radar: false }); }
  }

  slab(x0, z0, x1, z1, y, th, mat, o = {}) { this.box(x0, y - th, z0, x1, y, z1, mat, Object.assign({ radar: o.radar ?? 'catwalk' }, o)); }

  plane(x0, z0, x1, z1, y, matName, o = {}) {
    if (this.dry) return;
    const w = x1 - x0, d = z1 - z0, g = new THREE.PlaneGeometry(w, d), tile = o.tile ?? this.lib.tile(matName), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); this.geo(g, matName, false);
  }

  floorDecal(x, z, w, d, rot, kind, y = 0) {
    if (this.dry) return;
    const tex = kind === 'puddle' ? this.tf.puddle() : this.tf.grime();
    const mat = this.lib.basic('decal:' + kind, () => kind === 'puddle'
      ? new THREE.MeshPhysicalMaterial({ color: 0x0c0d0e, roughness: 0.14, metalness: 0.0, alphaMap: tex, transparent: true, depthWrite: false, envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      : new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y + 0.006, z); m.receiveShadow = true; m.userData.noAO = true; this.scene.add(m);
  }

  paint(x0, z0, x1, z1, color = 0xd9b01c, y = 0) {
    if (this.dry) return;
    const mat = this.lib.basic('paint:' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y + 0.004, (z0 + z1) / 2); this._batch(mat, g, false);
  }
  paintRect(x0, z0, x1, z1, w = 0.14, color, y = 0) { this.paint(x0, z0, x1, z0 + w, color, y); this.paint(x0, z1 - w, x1, z1, color, y); this.paint(x0, z0, x0 + w, z1, color, y); this.paint(x1 - w, z0, x1, z1, color, y); }

  letter(ch, x, z, rot, size = 3.6, color = '#f2f2f2') {
    if (this.dry) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: this.tf.letter(ch, color), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, 0.007, z); m.receiveShadow = true; m.userData.noAO = true; this.scene.add(m);
  }

  sign(text, color, x, y, z, ry, w = 8, h = 2) {
    if (this.dry) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: this.tf.sign(text, color), roughness: 0.6, emissive: 0xffffff, emissiveMap: this.tf.sign(text, color), emissiveIntensity: 0.35 }));
    m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m);
  }

  lamp(x, z, y, o = {}) {
    if (this.dry) return;
    this.deco(x - 0.015, y + 0.2, z - 0.015, x + 0.015, o.top ?? y + 2.4, z + 0.015, 'darkSteel', { cast: false });
    const shade = new THREE.CylinderGeometry(0.22, 0.62, 0.42, 18, 1, true); shade.translate(x, y + 0.2, z); this.geo(shade, 'darkSteel');
    const bulbMat = this.lib.basic('bulb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.92, 0.78).multiplyScalar(6) }));
    const bulb = new THREE.CircleGeometry(0.55, 18); bulb.rotateX(Math.PI / 2); bulb.translate(x, y, z); this._batch(bulbMat, bulb, false);
    if (o.light) this.light(x, y - 0.3, z, o.color ?? 0xffe2b0, o.intensity ?? 90, o.distance ?? 30);
    if (o.pool) this.lightPool(x, z, o.pool, o.poolY ?? 0, o.poolK ?? 0.1);
  }

  // v17: fake light pool on the floor under a practical lamp (additive radial decal) — SF2-style pools of light without
  // spending one of the 3 per-pixel point lights.
  lightPool(x, z, r, y = 0, k = 0.1, color = 0xffd9a8) {
    if (this.dry) return;
    const tex = this.tf.simple('lightPool', 128, (ctx, S) => { const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); for (let i = 0; i <= 8; i++) { const t = i / 8, a = Math.pow(1 - t, 2.2) * (0.92 + 0.08 * Math.cos(t * 9)); g.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`); } ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); }, false);
    const mat = this.lib.basic('lightPool:' + k, () => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(k), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); g.translate(x, y + 0.012, z);
    const m = new THREE.Mesh(g, mat); m.userData.noAO = true; m.renderOrder = 1; this.scene.add(m);
  }

  panel(x, z, y, w, d) { // emissive ceiling light panel
    if (this.dry) return;
    const mat = this.lib.basic('panelLight', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.94).multiplyScalar(2.2) }));
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(Math.PI / 2); g.translate(x, y - 0.005, z); this._batch(mat, g, false);
  }

  light(x, y, z, color, intensity, distance) {
    if (this.dry || this.lightCount >= 3) return; // point lights are per-pixel: keep the budget tiny (the quality preset may hide them, see PostFX.configure)
    const l = new THREE.PointLight(color, intensity, distance, 1.6); l.position.set(x, y, z); l.userData.mapLight = true; this.scene.add(l); this.lightCount++;
  }

  // Volumetric light shaft from a roof opening down along the sun direction.
  shaft(x0, z0, x1, z1, topY, sunDir, intensity = 0.1) {
    if (this.dry) return;
    const k = topY / Math.max(0.2, -sunDir.y), ox = sunDir.x * k, oz = sunDir.z * k;
    const top = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], pos = [], vh = [], idx = [];
    top.forEach(([x, z]) => { pos.push(x, topY, z); vh.push(0); });
    top.forEach(([x, z]) => { pos.push(x + ox, 0, z + oz); vh.push(1); });
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, j, j + 4, i, j + 4, i + 4); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('vh', new THREE.Float32BufferAttribute(vh, 1)); g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(ShaftShader.uniforms), vertexShader: ShaftShader.vertexShader, fragmentShader: ShaftShader.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.uniforms.uIntensity.value = intensity;
    const m = new THREE.Mesh(g, mat); m.userData.noAO = true; m.frustumCulled = false; this.scene.add(m); this.shafts.push(mat);
  }

  dustMotes(x0, z0, x1, z1, y0, y1, n, opacity = 0.55) {
    if (this.dry) return;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(x0, x1); pos[i * 3 + 1] = rand(y0, y1); pos[i * 3 + 2] = rand(z0, z1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, map: this.tf.dot(), color: 0xfff1d8, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData.noAO = true; m.frustumCulled = false; this.scene.add(m);
    this.animated.push((dt, t) => { m.position.y = Math.sin(t * 0.1) * 0.3; m.position.x = Math.sin(t * 0.07) * 0.6; });
  }

  snowfall(x0, z0, x1, z1, n) {
    if (this.dry) return;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(x0, x1); pos[i * 3 + 1] = rand(0, 22); pos[i * 3 + 2] = rand(z0, z1); vel[i] = rand(0.7, 1.6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, map: this.tf.dot(), color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    m.userData.noAO = true; m.frustumCulled = false; this.scene.add(m);
    this.animated.push((dt, t) => {
      for (let i = 0; i < n; i++) { pos[i * 3 + 1] -= vel[i] * dt; pos[i * 3] += Math.sin(t * 0.8 + i) * 0.3 * dt; if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 22; }
      g.attributes.position.needsUpdate = true;
    });
  }

  tree(x, z, kind = 'palm', h = 6, y0 = 0) {
    this.box(x - 0.2, y0, z - 0.2, x + 0.2, y0 + h, z + 0.2, null, { material: 'wood', radar: 'crate' });
    if (this.dry) return;
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, h, 10); trunk.translate(x, y0 + h / 2, z); this.geo(trunk, 'bark');
    if (kind === 'palm') {
      const tex = this.tf.simple('frond', 256, (ctx, S) => {
        ctx.clearRect(0, 0, S, S); ctx.strokeStyle = '#8fae52'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(S / 2, S); ctx.lineTo(S / 2, 0); ctx.stroke();
        for (let yy = 8; yy < S - 6; yy += 7) { const w = Math.sin((yy / S) * Math.PI) * S * 0.48 + 6; for (const sx of [-1, 1]) { ctx.strokeStyle = `rgb(${70 + Math.random() * 30},${110 + Math.random() * 30},${40 + Math.random() * 20})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(S / 2, yy); ctx.quadraticCurveTo(S / 2 + sx * w * 0.5, yy - 6, S / 2 + sx * w, yy + 10); ctx.stroke(); } }
      });
      const mat = this.lib.basic('frondMat', () => new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: 0xb8d08a, emissive: 0x1c2a0c }));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2), leaf = new THREE.PlaneGeometry(1.6, 3.6, 1, 6), p = leaf.attributes.position;
        for (let k = 0; k < p.count; k++) { const v = p.getY(k) / 1.8; p.setZ(k, -Math.pow(Math.max(0, v + 1), 2) * 0.4); }
        leaf.translate(0, 1.8, 0); leaf.rotateX(-1.15 + rand(-0.15, 0.15)); leaf.rotateY(a); leaf.translate(x, y0 + h, z); leaf.computeVertexNormals(); this._batch(mat, leaf, true);
      }
    } else { // conifer: six jittered, drooping tiers (irregular silhouette), alternating light / dark needles
      const rnd = mulberry32(Math.round(x * 71 + z * 13 + h * 7)), k = h / 8, jit = (px, pz, s) => { const v = Math.sin(Math.round(px * 97) * 12.9898 + Math.round(pz * 97) * 78.233 + s) * 43758.5453; return v - Math.floor(v); };
      for (let i = 0; i < 6; i++) {
        const t = i / 5, r = (2.35 - t * 1.8) * k * (0.9 + rnd() * 0.2), hh = (2.0 - t * 0.55) * k, c = new THREE.ConeGeometry(r, hh, 11, 2), p = c.attributes.position;
        for (let v = 0; v < p.count; v++) {
          const px = p.getX(v), py = p.getY(v), pz = p.getZ(v); if (py > hh / 2 - 1e-3) continue; // keep the apex
          const q = jit(px, pz, i), s = 0.78 + q * 0.42; p.setX(v, px * s); p.setZ(v, pz * s);
          if (py < -hh / 2 + 1e-3) p.setY(v, py - q * 0.32 * hh); // drooping branch tips on the skirt
        }
        c.computeVertexNormals(); c.rotateY(rnd() * 6.28); c.translate(x + (rnd() - 0.5) * 0.15 * k, y0 + h * 0.3 + t * h * 0.6, z + (rnd() - 0.5) * 0.15 * k);
        this.geo(c, i % 2 ? 'foliageDark' : 'foliage');
      }
    }
  }

  car(x, z, rotY, mat = 'rust', y0 = 0) {
    const w = 1.9, l = 4.3, alongX = Math.abs(Math.sin(rotY)) > 0.5;
    const hx = alongX ? l / 2 : w / 2, hz = alongX ? w / 2 : l / 2;
    this.box(x - hx, y0 + 0.25, z - hz, x + hx, y0 + 1.05, z + hz, mat, { material: 'metal', radar: 'crate' });
    this.box(x - hx * (alongX ? 0.55 : 0.9), y0 + 1.05, z - hz * (alongX ? 0.9 : 0.55), x + hx * (alongX ? 0.45 : 0.9), y0 + 1.55, z + hz * (alongX ? 0.9 : 0.45), mat, { material: 'metal', radar: false });
    if (this.dry) return;
    for (const [dx, dz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) {
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14); g.rotateX(Math.PI / 2); if (!alongX) g.rotateY(Math.PI / 2);
      g.translate(x + (alongX ? dx * l / 2 * 0.9 : dz * w * 1.05), y0 + 0.36, z + (alongX ? dz * w * 1.05 : dx * l / 2 * 0.9)); this.geo(g, 'darkSteel');
    }
  }

  spawnZone(team, x0, z0, x1, z1, yaw) { this.zones[team] = { x0, z0, x1, z1, yaw }; }
  // v11 forward spawn (big maps, respawn modes only): used when no enemy is near / has sight of it.
  forwardSpawn(team, x0, z0, x1, z1, yaw) { (this.fwdZones = this.fwdZones || { alpha: [], bravo: [] })[team].push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), yaw }); }

  /* ----------------------------- v3: verticality & ruins ----------------------------- */
  // Ladder on a wall face. (x, z) = point on the face, face = outward normal '+x' '-x' '+z' '-z',
  // y0 = foot, y1 = top platform height. Creates visuals, a climb volume and a nav link.
  ladder(x, z, y0, y1, face, o = {}) {
    const n = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[face], nx = n[0], nz = n[1], w = o.width ?? 0.9, mat = o.mat || 'darkSteel';
    const tx = -nz, tz = nx, hw = w / 2, off = 0.13, top = y1 + (o.rail ?? 1.0);
    const cx = x + nx * off, cz = z + nz * off;
    this.radar.push({ x0: Math.min(cx - tx * hw, cx + tx * hw) - 0.2, z0: Math.min(cz - tz * hw, cz + tz * hw) - 0.2, x1: Math.max(cx - tx * hw, cx + tx * hw) + 0.2, z1: Math.max(cz - tz * hw, cz + tz * hw) + 0.2, kind: 'ladder', top: y1 });
    const P = (a, y, b = 0) => new THREE.Vector3(x + tx * a + nx * b, y, z + tz * a + nz * b);
    const chain = [P(0, y0, 0.95), P(0, y1, -0.95)]; chain.ladder = true; chain.cost = 1.8; this.navChains.push(chain);
    this.ladders.push({ x, z, y0, y1, nx, nz });
    if (this.dry) return;
    for (const sgn of [-1, 1]) { // stiles
      const px = cx + tx * hw * sgn, pz = cz + tz * hw * sgn;
      this.deco(px - 0.035, y0, pz - 0.035, px + 0.035, top, pz + 0.035, mat);
    }
    for (let y = y0 + 0.28; y < y1 + 0.05; y += 0.3) { // rungs
      if (nx !== 0) this.deco(cx - 0.02, y - 0.02, cz - hw, cx + 0.02, y + 0.02, cz + hw, mat, { cast: false });
      else this.deco(cx - hw, y - 0.02, cz - 0.02, cx + hw, y + 0.02, cz + 0.02, mat, { cast: false });
    }
    const vx0 = Math.min(x + nx * 0.8, x - nx * 0.15), vx1 = Math.max(x + nx * 0.8, x - nx * 0.15), vz0 = Math.min(z + nz * 0.8, z - nz * 0.15), vz1 = Math.max(z + nz * 0.8, z - nz * 0.15);
    this.col.addLadder({ minX: nx ? vx0 : x - hw, maxX: nx ? vx1 : x + hw, minZ: nz ? vz0 : z - hw, maxZ: nz ? vz1 : z + hw, y0: y0 - 0.1, y1: y1 + 0.35, top: y1, nx, nz });
  }

  // Irregular boulder: dodecahedron visual + an inscribed collision box.
  boulder(x, z, r, o = {}) {
    const y0 = o.y0 ?? 0, sy = o.sy ?? 0.7, mat = o.mat || 'rock';
    if (o.collide !== false) this.box(x - r * 0.62, y0, z - r * 0.62, x + r * 0.62, y0 + r * sy * 1.25, z + r * 0.62, null, { material: 'concrete', radar: 'solid' });
    if (this.dry) return;
    const g = new THREE.DodecahedronGeometry(r, 1), p = g.attributes.position, rnd = mulberry32(Math.round(x * 131 + z * 71 + r * 997));
    for (let i = 0; i < p.count; i++) { const k = 0.82 + rnd() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    g.scale(1, sy, 1); g.rotateY(rnd() * 6.28); g.translate(x, y0 + r * sy * 0.55, z); g.computeVertexNormals();
    const uv = g.attributes.uv; if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 2, uv.getY(i) * r);
    this.geo(g, mat);
  }

  // Ancient column: shaft + base (+ capital unless broken).
  column(x, z, r, h, o = {}) {
    const y0 = o.y0 ?? 0, mat = o.mat || 'ruinStone';
    this.box(x - r - 0.12, y0, z - r - 0.12, x + r + 0.12, y0 + 0.35, z + r + 0.12, mat, { radar: 'solid', tile: 1.2 });
    this.cyl(x, z, r, y0 + 0.35, y0 + h, mat, { seg: 14, r1: o.broken ? r * 0.94 : r * 0.9 });
    if (!o.broken) this.box(x - r - 0.18, y0 + h, z - r - 0.18, x + r + 0.18, y0 + h + 0.32, z + r + 0.18, mat, { radar: false, tile: 1.2 });
  }
  fallenColumn(x, z, len, r, axis, y0 = 0, mat = 'ruinStone') {
    if (!this.dry) { const g = new THREE.CylinderGeometry(r, r * 0.95, len, 14); if (axis === 'x') g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2); g.translate(x, y0 + r, z); this.geo(g, mat); }
    const hx = axis === 'x' ? len / 2 : r * 0.85, hz = axis === 'x' ? r * 0.85 : len / 2;
    this.box(x - hx, y0, z - hz, x + hx, y0 + r * 1.75, z + hz, null, { material: 'concrete', radar: 'solid' });
  }
  // Ruined wall: segments with a jagged, broken top profile.
  ruinWall(x0, z0, x1, z1, h, t = 0.6, o = {}) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = alongX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(Math.abs(len) / 1.2)), mat = o.mat || 'ruinStone', y0 = o.y0 ?? 0;
    const rnd = mulberry32(Math.round(x0 * 17 + z0 * 29 + len * 13 + h * 7));
    for (let i = 0; i < n; i++) {
      const a = (alongX ? x0 : z0) + (len * i) / n, b = (alongX ? x0 : z0) + (len * (i + 1)) / n, hh = h * (o.flat ? 1 : 0.55 + rnd() * 0.45);
      if (alongX) this.box(Math.min(a, b), y0, z0 - t / 2, Math.max(a, b), y0 + hh, z0 + t / 2, mat, { radar: 'wall' });
      else this.box(x0 - t / 2, y0, Math.min(a, b), x0 + t / 2, y0 + hh, Math.max(a, b), mat, { radar: 'wall' });
    }
  }
  broadleaf(x, z, h = 5, y0 = 0) {
    this.box(x - 0.25, y0, z - 0.25, x + 0.25, y0 + h * 0.6, z + 0.25, null, { material: 'wood', radar: 'crate' });
    if (this.dry) return;
    const trunk = new THREE.CylinderGeometry(0.14, 0.3, h * 0.7, 9); trunk.translate(x, y0 + h * 0.35, z); this.geo(trunk, 'bark');
    const rnd = mulberry32(Math.round(x * 53 + z * 97));
    for (let i = 0; i < 3; i++) { const b = new THREE.CylinderGeometry(0.05, 0.1, h * 0.35, 6), a = i * 2.1 + rnd(); b.rotateZ(0.7); b.rotateY(a); b.translate(x + Math.cos(a) * 0.5, y0 + h * 0.62, z - Math.sin(a) * 0.5); this.geo(b, 'bark'); }
    for (let i = 0; i < 9; i++) { // lumpy canopy: jittered icosahedrons arranged as a crown
      const r = (i ? 0.8 + rnd() * 0.7 : 1.5) * (h / 5.2), a = rnd() * 6.28, d = i ? (1.0 + rnd() * 0.9) * (h / 5.2) : 0;
      const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const s = 0.8 + rnd() * 0.35; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.78, p.getZ(k) * s); }
      g.translate(x + Math.cos(a) * d, y0 + h * 0.78 + (i ? rnd() * 1.1 - 0.3 : 0.5) * (h / 5.2), z + Math.sin(a) * d); g.computeVertexNormals(); this.geo(g, 'olive');
    }
  }
  objective(kind, data) { this.objectives[kind] = data; }

  /* ----------------------------- v5: terrain, tall buildings, patrol network ----------------------------- */
  // Heightfield terrain, cached on the map definition (the lobby preview and the match share one bake).
  terrain(spec) {
    const T = this.T = this.def._terrain || (this.def._terrain = new Terrain(spec));
    if (this.dry) return T;
    this.col.setTerrain(T); this.phys.addHeightfield(T); this.scene.add(this._terrainMesh(T));
    return T;
  }
  gy(x, z) { return this.T ? this.T.heightAt(x, z) : 0; }

  // v7: instanced, wind-swayed grass tufts around the camera on a world-locked jittered grid (no swimming), only where
  // the terrain is grass (not rock / road / pads) and walkable; tufts shrink toward the radius so nothing pops. ≤ 0.5 m tall.
  grass(o = {}) {
    if (this.dry || !this.T || activeQuality() === 'low') return;
    const T = this.T, cell = o.cell ?? 0.95, R = o.radius ?? (activeQuality() === 'high' || activeQuality() === 'ultra' ? 36 : 26), cap = Math.ceil((Math.PI * R * R) / (cell * cell));
    const tex = this.tf.simple('grassTuft', 128, (ctx, S) => {
      ctx.clearRect(0, 0, S, S);
      for (let i = 0; i < 30; i++) {
        const x = S * (0.08 + Math.random() * 0.84), h = S * (0.4 + Math.random() * 0.58), lean = (Math.random() - 0.5) * S * 0.3, w = 2.5 + Math.random() * 3.5;
        const g = ctx.createLinearGradient(0, S, 0, S - h); g.addColorStop(0, '#26311a'); g.addColorStop(1, `rgb(${110 + Math.random() * 45},${140 + Math.random() * 35},${55 + Math.random() * 25})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w, S); ctx.quadraticCurveTo(x + lean * 0.3, S - h * 0.6, x + lean, S - h); ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.4, S - h * 0.5, x + w, S); ctx.closePath(); ctx.fill();
      }
    }, true, false);
    const q1 = new THREE.PlaneGeometry(0.64, 0.46); q1.translate(0, 0.23, 0); const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
    const geo = mergeGeometries([q1, q2]), nrm = geo.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0); // lit like the ground it grows from
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 }), time = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.6 + ip.x * 0.31 + ip.z * 0.23) * 0.6 + sin(uTime * 3.3 + ip.x * 1.3 - ip.z * 0.7) * 0.25;
          float bend = position.y * position.y * 1.9; transformed.x += sway * 0.12 * bend; transformed.z += sway * 0.06 * bend;
        #endif`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/gl_FrontFacing \? 1\.0 : - 1\.0/, '1.0')); // both sides lit from above
    };
    mat.customProgramCacheKey = () => 'grass-v7';
    const mesh = new THREE.InstancedMesh(geo, mat, cap); mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false; mesh.userData.noAO = true;
    this.scene.add(mesh);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const hash = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
    const rebuild = (px, pz) => {
      let c = 0;
      const i0 = Math.floor((px - R) / cell), i1 = Math.floor((px + R) / cell), j0 = Math.floor((pz - R) / cell), j1 = Math.floor((pz + R) / cell);
      for (let i = i0; i <= i1 && c < cap; i++) for (let j = j0; j <= j1 && c < cap; j++) {
        const x = (i + hash(i, j, 1)) * cell, z = (j + hash(i, j, 2)) * cell, dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
        if (d2 > R * R || hash(i, j, 3) < 0.16 || !T.inside(x, z)) continue;
        const wr = T._w(T.wRock, x, z), wd = T._w(T.wDirt, x, z); if (wr > 0.35 || wd > 0.28) continue;
        const d = Math.sqrt(d2), edge = 1 - clamp((d - R * 0.62) / (R * 0.38), 0, 1), s = (0.65 + hash(i, j, 4) * 0.45) * (0.25 + 0.75 * edge) * (1 - wd * 1.5 - wr);
        if (s < 0.12) continue;
        qt.setFromAxisAngle(up, hash(i, j, 5) * 6.283); sc.set(s, s * (0.75 + hash(i, j, 6) * 0.45), s); ps.set(x, T.heightAt(x, z) - 0.03, z);
        mesh.setMatrixAt(c, m4.compose(ps, qt, sc)); const hv = hash(i, j, 7); mesh.setColorAt(c, col.setRGB(0.82 + hv * 0.3, 0.88 + hv * 0.18, 0.78 + hv * 0.14)); c++;
      }
      mesh.count = c; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    let cx = 1e9, cz = 1e9;
    this.animated.push((dt, t) => {
      time.value = t;
      const cam = this.game.camera.position;
      if ((cam.x - cx) ** 2 + (cam.z - cz) ** 2 > 9) { cx = cam.x; cz = cam.z; rebuild(cx, cz); }
    });
  }
  gyMin(x0, z0, x1, z1) { if (!this.T) return 0; let m = Infinity; for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) m = Math.min(m, this.T.heightAt(x, z)); return m; }
  navRegion(x0, z0, x1, z1, y, step = 1.5) { this.navRegions.push({ x0, z0, x1, z1, y, step }); }
  waypoint(x, z, y) { this.waypoints.push(new THREE.Vector3(x, y ?? this.gy(x, z), z)); }

  // One mesh; grass / dirt / rock blended in the shader (rock by slope + designer weight, dirt along roads),
  // rock is tri-planar so cliff faces do not stretch, and a large-scale macro tint breaks up the tiling.
  _terrainMesh(T) {
    const n = T.nx * T.nz, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), w = new Float32Array(n * 2), nv = new THREE.Vector3();
    for (let j = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++) {
      const k = i + j * T.nx, x = T.x0 + i * T.s, z = T.z0 + j * T.s;
      pos[k * 3] = x; pos[k * 3 + 1] = T.h[k]; pos[k * 3 + 2] = z;
      T.normalAt(x, z, nv); nor[k * 3] = nv.x; nor[k * 3 + 1] = nv.y; nor[k * 3 + 2] = nv.z;
      uv[k * 2] = x / 4.5; uv[k * 2 + 1] = z / 4.5; w[k * 2] = T.wRock[k]; w[k * 2 + 1] = T.wDirt[k];
    }
    // v12: one shared vertex buffer, 64 m chunks with their own index + bounds, so the camera AND the (72 m) shadow
    // frustum cull whatever they do not see — the shadow pass used to redraw the whole 400 m terrain every frame.
    const A = { position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3), uv: new THREE.BufferAttribute(uv, 2), aW: new THREE.BufferAttribute(w, 2) };
    const CH = 32, chunks = [];
    for (let cj = 0; cj < T.nz - 1; cj += CH) for (let ci = 0; ci < T.nx - 1; ci += CH) {
      const i1 = Math.min(ci + CH, T.nx - 1), j1 = Math.min(cj + CH, T.nz - 1), idx = new Uint32Array((i1 - ci) * (j1 - cj) * 6); let q = 0, lo = Infinity, hi = -Infinity;
      for (let j = cj; j < j1; j++) for (let i = ci; i < i1; i++) { const a = i + j * T.nx, b = a + 1, c = a + T.nx + 1, d = a + T.nx; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = a; idx[q++] = d; idx[q++] = c; }
      for (let j = cj; j <= j1; j++) for (let i = ci; i <= i1; i++) { const h = T.h[i + j * T.nx]; if (h < lo) lo = h; if (h > hi) hi = h; }
      const g = new THREE.BufferGeometry(); for (const k in A) g.setAttribute(k, A[k]); g.setIndex(new THREE.BufferAttribute(idx, 1));
      const bb = new THREE.Box3(new THREE.Vector3(T.x0 + ci * T.s, lo, T.z0 + cj * T.s), new THREE.Vector3(T.x0 + i1 * T.s, hi, T.z0 + j1 * T.s));
      g.boundingBox = bb; g.boundingSphere = bb.getBoundingSphere(new THREE.Sphere()); chunks.push(g);
    }
    const G = this.lib.get(this.def.ground || 'grass'), R = this.lib.get('rock'), D = this.lib.get(this.def.groundDirt || 'dirt'); // v43: snow / sand ground per map
    const mat = new THREE.MeshStandardMaterial({ map: G.map, normalMap: G.normalMap, roughness: 0.96, metalness: 0 });
    mat.normalScale.set(0.85, 0.85); mat.userData.keep = true;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tRock = { value: R.map }; sh.uniforms.tDirt = { value: D.map };
      sh.vertexShader = 'attribute vec2 aW;\nvarying vec2 vTW;\nvarying vec3 vTP;\nvarying vec3 vTN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTW = aW; vTP = position; vTN = normal;');
      sh.fragmentShader = 'uniform sampler2D tRock;\nuniform sampler2D tDirt;\nvarying vec2 vTW;\nvarying vec3 vTP;\nvarying vec3 vTN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        vec3 tnn = normalize(vTN);
        float macro = texture2D(map, vTP.xz * 0.0137).g;
        vec3 cG = texture2D(map, vMapUv).rgb * (0.7 + 0.65 * macro);
        vec3 bw = pow(abs(tnn), vec3(3.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 cR = texture2D(tRock, vTP.zy * 0.17).rgb * bw.x + texture2D(tRock, vTP.xz * 0.17).rgb * bw.y + texture2D(tRock, vTP.xy * 0.17).rgb * bw.z;
        float fdist = smoothstep(35.0, 150.0, length(vTP - cameraPosition));
        if (fdist > 0.0) { // distant cliffs: blend in a 4x larger rock scale so the pattern does not repeat
          vec3 cRf = texture2D(tRock, vTP.zy * 0.043).rgb * bw.x + texture2D(tRock, vTP.xz * 0.043).rgb * bw.y + texture2D(tRock, vTP.xy * 0.043).rgb * bw.z;
          cR = mix(cR, cRf * 1.05, fdist * 0.75);
        }
        float macroR = texture2D(tDirt, vec2(vTP.x + vTP.y * 0.6, vTP.z - vTP.y * 0.45) * 0.011).r; // breaks up strata banding on big cliffs
        cR *= 0.68 + 0.62 * macroR;
        vec3 cD = texture2D(tDirt, vTP.xz * 0.25).rgb * (0.85 + 0.3 * macro);
        float wr = smoothstep(0.3, 0.7, vTW.x + (macro - 0.5) * 0.35);
        float wd = smoothstep(0.2, 0.7, vTW.y) * (1.0 - wr);
        diffuseColor.rgb *= mix(mix(cG, cD, wd), cR, wr);`).replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale * (1.0 - wr) * (1.0 - smoothstep(0.35, 0.7, 1.0 - tnn.y)); // grass bumps only where grass is (top-down UVs stretch on cliffs)
          normal = normalize(tbn * mapN);
        #endif`);
    };
    applyContactAO(mat, 'terrain-v6-cao', true);
    const grp = new THREE.Group();
    for (const g of chunks) { const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); grp.add(m); }
    return grp;
  }

  // Multi-storey building on flat ground (y0 = ground-floor level). Storeys are linked by one internal stair
  // flight each (alternating north / south walls, through an opening in the slab above, railed on the upper floor);
  // windows on every storey; parapet roof reached by an outside ladder (o.ladder = { side: 'e'|'w'|'n'|'s', at }).
  building(o) {
    const { x0, z0, x1, z1, y0 } = o, floors = o.floors || 2, fh = o.fh || 3.2, t = 0.3, mat = o.mat || 'plaster', slab = o.slab || 'concrete';
    const topY = y0 + floors * fh, L = o.ladder, doors = o.doors || { s: [(x0 + x1) / 2] }, steps = Math.round(fh / 0.2), rise = fh / steps, run = 0.28;
    this.box(x0 - 0.3, y0 - 2.4, z0 - 0.3, x1 + 0.3, y0, z1 + 0.3, o.base || 'concreteWall', { radar: 'building', tile: 2 }); // plinth into the slope
    const flight = (k) => { const north = k % 2 === 0, a1 = north ? z1 - t : z0 + t + 1.3, a0 = a1 - 1.3, dir = north ? 1 : -1, from = north ? x0 + t + 1.45 : x1 - t - 1.45; return { north, a0, a1, dir, from, end: from + dir * steps * run }; };
    const windows = (lo, hi, yk, skip) => { const out = [], n = Math.max(1, Math.floor((hi - lo) / 3.3)); for (let i = 0; i < n; i++) { const c = lo + (hi - lo) * (i + 0.5) / n; if (skip.some((sc) => Math.abs(sc - c) < 1.5)) continue; out.push({ a: c - 0.55, b: c + 0.55, y0: yk + 1.0, y1: yk + 2.1 }); } return out; };
    const lad = (side) => (L && L.side === side ? [L.at] : []);
    for (let k = 0; k < floors; k++) {
      const yk = y0 + k * fh, open = {};
      for (const side of ['n', 's', 'e', 'w']) {
        const alongX = side === 'n' || side === 's', lo = alongX ? x0 + 0.6 : z0 + 0.6, hi = alongX ? x1 - 0.6 : z1 - 0.6, ds = k === 0 ? doors[side] || [] : [];
        open[side] = ds.map((c) => ({ a: c - 0.95, b: c + 0.95 })).concat(windows(lo, hi, yk, ds.concat(lad(side))));
      }
      this.room(x0, z0, x1, z1, { y0: yk, h: fh, t, mat, open });
      this.navRegion(x0 + t + 0.45, z0 + t + 0.45, x1 - t - 0.45, z1 - t - 0.45, yk);
      if (k < floors - 1) {
        const F = flight(k), Y = yk + fh, hx0 = Math.min(F.from, F.end) - 0.05, hx1 = Math.max(F.from, F.end) + 0.05, hz0 = F.a0 - 0.05, hz1 = F.a1 + 0.05;
        this.stairs({ axis: 'x', from: F.from, dir: F.dir, a0: F.a0, a1: F.a1, steps, rise, run, y0: yk, mat: slab, nosing: 'darkSteel', lead: 0.8, leadTop: 0.55 });
        const S = (ax0, az0, ax1, az1) => this.box(ax0, Y - 0.25, az0, ax1, Y, az1, slab, { radar: false });
        S(x0 + t, z0 + t, x1 - t, hz0); S(x0 + t, hz1, x1 - t, z1 - t); S(x0 + t, hz0, hx0, hz1); S(hx1, hz0, x1 - t, hz1);
        this.railing(hx0, F.north ? hz0 : hz1, hx1, F.north ? hz0 : hz1, Y, 'darkSteel');
        const lowX = F.dir > 0 ? hx0 : hx1; this.railing(lowX, hz0, lowX, hz1, Y, 'darkSteel');
      }
    }
    this.box(x0, topY - 0.3, z0, x1, topY, z1, slab, { radar: false }); // roof, flush with the walls (an overhang would block the ladder climber's head)
    const gap = (side) => (L && L.side === side ? [[L.at - 0.7, L.at + 0.7]] : []), P = 1.05, pt = 0.25;
    for (const [side, fixed, lo, hi, alongX] of [['s', z0, x0, x1, true], ['n', z1 - pt, x0, x1, true], ['w', x0, z0 + pt, z1 - pt, false], ['e', x1 - pt, z0 + pt, z1 - pt, false]]) {
      let cur = lo;
      for (const [a, b] of gap(side).concat([[hi, hi]])) {
        if (a > cur) { if (alongX) this.box(cur, topY, fixed, a, topY + P, fixed + pt, mat, { radar: false }); else this.box(fixed, topY, cur, fixed + pt, topY + P, a, mat, { radar: false }); }
        cur = b;
      }
    }
    this.navRegion(x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, topY);
    if (L) {
      const face = { e: '+x', w: '-x', n: '+z', s: '-z' }[L.side], fx = L.side === 'e' ? x1 : L.side === 'w' ? x0 : L.at, fz = L.side === 'n' ? z1 : L.side === 's' ? z0 : L.at;
      this.ladder(fx, fz, y0, topY, face, { mat: o.ladderMat || 'darkSteel' });
    }
    this.waypoint((x0 + x1) / 2, (z0 + z1) / 2, y0); if (floors > 1) this.waypoint((x0 + x1) / 2, (z0 + z1) / 2, y0 + fh);
    return topY;
  }
}

