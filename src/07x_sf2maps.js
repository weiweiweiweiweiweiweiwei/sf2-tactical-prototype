import { THREE } from './01_core.js';
import { TriSoup } from './04_collision.js';
import { MAPS } from './07_maps.js';
import { apexGLTF } from './07u_apex.js';
import { TriGround } from './07w_skulltown.js';
/* =====================================================================
   v65o SPECIAL FORCE 2'S OWN MAPS (user 10-29: every regular SF2 map) — built from the user's install by tools/sf2_map_build.mjs:
   the level's static meshes at their own matrices plus its BSP floors / walls in one GLB, and a meta (player starts, ladders),
   shipped as assets/maps/sf2-<map>/map.js (window.SF2_MAPS[id]). The collision is the GLB's own triangles (the sky dome and other
   meshes bigger than 300 m left out), spawns ring each team's SF2 player start, bots sample the floors at run time (navLevels).
   ===================================================================== */
const sf2MapScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('missing ' + src)); document.head.appendChild(s); });

// v65u user 10-29: Alcatraz and Dust City taken off the map list ("almost unplayable"); the builder and their files stay for
// the 1:1 Desert Camp attempt. true lists them again.
const SF2_LISTED = false;

// v65y side walls for an SF2 step mesh that has none (user 10-29, Desert Camp: dc_stair_003 open on both sides): the steps' top
// outline along the rise axis (the horizontal axis the height follows), stepped, filled down to the mesh's foot at both lateral ends
function stairSides(g, mat) {
  const P = g.attributes.position; if (!P) return null;
  g.computeBoundingBox(); const bb = g.boundingBox, lo = [bb.min.x, bb.min.z], hi = [bb.max.x, bb.max.z], y0 = bb.min.y, NB = 16;
  const prof = (ax) => { const t = new Array(NB).fill(-Infinity); for (let i = 0; i < P.count; i++) { const a = ax ? P.getZ(i) : P.getX(i), k = Math.min(NB - 1, Math.floor((a - lo[ax]) / (hi[ax] - lo[ax] + 1e-6) * NB)); t[k] = Math.max(t[k], P.getY(i)); } return t; };
  const spread = (t) => { const f = t.filter(Number.isFinite); return Math.max(...f) - Math.min(...f); };
  const px = prof(0), pz = prof(1), ax = spread(px) >= spread(pz) ? 0 : 1, top = ax ? pz : px, lat = 1 - ax;
  for (let k = 1; k < NB; k++) if (!Number.isFinite(top[k])) top[k] = top[k - 1]; // (an empty bin keeps its neighbour's height)
  const pos = [], uv = [], at = (a, y, l) => (ax === 0 ? [a, y, l] : [l, y, a]);
  for (const l of [lo[lat], hi[lat]]) for (let k = 0; k < NB; k++) {
    const h = top[k]; if (!Number.isFinite(h) || h <= y0 + 0.02) continue;
    const a0 = lo[ax] + (hi[ax] - lo[ax]) * k / NB, a1 = lo[ax] + (hi[ax] - lo[ax]) * (k + 1) / NB, q = [at(a0, y0, l), at(a1, y0, l), at(a1, h, l), at(a0, h, l)];
    for (const j of [0, 1, 2, 0, 2, 3]) { pos.push(...q[j]); uv.push((j === 1 || j === 2 ? a1 : a0) * 0.5, (j >= 2 ? h : y0) * 0.5); }
  }
  if (!pos.length) return null;
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.computeVertexNormals();
  return new THREE.Mesh(sg, mat);
}

// v65y an SF2 ladder mesh made climbable (user 10-29, Desert Camp: DC_ladder_001 / S_ladder_004 were scenery): the thin horizontal
// axis of its box is the climb direction, the side that is blocked at mid height is the wall, the floor found on top of the wall
// is the platform; a climb volume and a nav link as MapBuilder.ladder() makes them, without its own rungs
const _lb = new THREE.Box3(), _lc = new THREE.Vector3();
function sf2Ladder(b, m) {
  m.updateMatrixWorld(true); _lb.setFromObject(m); _lb.getCenter(_lc); const sx = _lb.max.x - _lb.min.x, sz = _lb.max.z - _lb.min.z, col = b.col;
  const y0 = _lb.min.y, hw = Math.max(sx, sz) / 2;
  // (the platform lies behind the ladder, −normal: the side whose floor, looked for from above the ladder's top, is the higher one —
  // the triangle collision has no inside, so a 'blocked' test says nothing)
  const top = (nx, nz) => { const g = col.groundBelow(_lc.x - nx * 0.8, _lb.max.y + 1.5, _lc.z - nz * 0.8, 0.15, _lb.max.y - y0 + 2, 0); return g ? g.y : -Infinity; };
  const cand = sx < sz ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]], [nx, nz] = top(...cand[0]) >= top(...cand[1]) ? cand[0] : cand[1];
  const g = col.groundBelow(_lc.x - nx * 0.8, _lb.max.y + 1.5, _lc.z - nz * 0.8, 0.15, _lb.max.y - y0 + 2, 0);
  const y1 = g && g.y > y0 + 1 ? g.y : _lb.max.y - 0.2, x = _lc.x - nx * 0.15, z = _lc.z - nz * 0.15, tx = -nz, tz = nx;
  const P = (a, y, d) => new THREE.Vector3(x + tx * a + nx * d, y, z + tz * a + nz * d);
  const chain = [P(0, y0, 0.95), P(0, y1, -0.95)]; chain.ladder = true; chain.cost = 1.8; b.navChains.push(chain);
  b.ladders.push({ x, z, y0, y1, nx, nz });
  const vx0 = Math.min(x + nx * 0.8, x - nx * 0.15), vx1 = Math.max(x + nx * 0.8, x - nx * 0.15), vz0 = Math.min(z + nz * 0.8, z - nz * 0.15), vz1 = Math.max(z + nz * 0.8, z - nz * 0.15);
  col.addLadder({ minX: nx ? vx0 : x - hw, maxX: nx ? vx1 : x + hw, minZ: nz ? vz0 : z - hw, maxZ: nz ? vz1 : z + hw, y0: y0 - 0.1, y1: y1 + 0.35, top: y1, nx, nz });
}

// v65z SF2's baked light on one drawn primitive (tools/sf2_map_build.mjs extras): a BSP primitive's sheet (uv1 already in it), a
// placement's sheet rect (uv1 × cs + cb), or its per-vertex irradiance (bytes × 1/80, the primitives' vertices one after another)
function sf2LightOf(src) {
  const gl = src.geometry.userData.lm; if (gl) return { tex: gl.tex, s: gl.s };
  const node = src.userData.lm || src.userData.lmv ? src : src.parent, ud = (node && node.userData) || {};
  if (ud.lm) return { tex: ud.lm.tex, s: ud.lm.s, cs: ud.lm.cs, cb: ud.lm.cb };
  if (!ud.lmv) return {};
  const v = ud._lmv || (ud._lmv = Uint8Array.from(atob(ud.lmv), (c) => c.charCodeAt(0)));
  let off = 0; if (node !== src) for (const c of node.children) { if (c === src) break; if (c.isMesh) off += c.geometry.attributes.position.count; }
  return { v, off };
}
const SF2_BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); SF2_BLACK.needsUpdate = true;
// v65z one draw for a material on one light sheet: the placements in world space, plus three attributes the material reads — lmUv / lms
// (the sheet's uv and ScaleVector) and lmc (per-vertex irradiance) — added to the indirect light, × π (UE multiplies the texel straight
// into the albedo, three divides by π); the map's sun stays the dynamic dominant light it is in SF2
function sf2Merge(list, sheets, def) {
  const lit = Object.keys(sheets).length > 0, m0 = list[0].m, tex = list[0].L.tex;
  let nv = 0, ni = 0; for (const { src } of list) { const g = src.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), LU = new Float32Array(nv * 2), LC = new Float32Array(nv * 3), LS = new Float32Array(nv * 3), I = new Uint32Array(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), fb = def.lmFallback || [0.3, 0.3, 0.3];
  let vo = 0, io = 0;
  for (const { m, src, L } of list) {
    const g = src.geometry, gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv, g1 = g.attributes.uv1, n = gp.count, flip = m.matrix.determinant() < 0;
    nm.getNormalMatrix(m.matrix);
    for (let i = 0; i < n; i++) {
      const j = vo + i;
      v.fromBufferAttribute(gp, i).applyMatrix4(m.matrix); P[j * 3] = v.x; P[j * 3 + 1] = v.y; P[j * 3 + 2] = v.z;
      if (gn) { v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); N[j * 3] = v.x; N[j * 3 + 1] = v.y; N[j * 3 + 2] = v.z; }
      if (gu) { U[j * 2] = gu.getX(i); U[j * 2 + 1] = gu.getY(i); }
      if (L.tex && g1) { const x = g1.getX(i), y = g1.getY(i); LU[j * 2] = L.cs ? x * L.cs[0] + L.cb[0] : x; LU[j * 2 + 1] = L.cs ? y * L.cs[1] + L.cb[1] : y; LS[j * 3] = L.s[0]; LS[j * 3 + 1] = L.s[1]; LS[j * 3 + 2] = L.s[2]; }
      else if (L.v) for (let c = 0; c < 3; c++) LC[j * 3 + c] = (L.v[(L.off + i) * 3 + c] || 0) / 80;
      else if (!L.tex) for (let c = 0; c < 3; c++) LC[j * 3 + c] = fb[c];
    }
    const gi = g.index, cnt = gi ? gi.count : n, at = (k) => vo + (gi ? gi.getX(k) : k);
    for (let k = 0; k + 2 < cnt; k += 3) { I[io++] = at(k); I[io++] = at(flip ? k + 2 : k + 1); I[io++] = at(flip ? k + 1 : k + 2); } // (a mirrored placement wound back, so its faces front the right way)
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('lmUv', new THREE.BufferAttribute(LU, 2)); geo.setAttribute('lmc', new THREE.BufferAttribute(LC, 3)); geo.setAttribute('lms', new THREE.BufferAttribute(LS, 3));
  geo.setIndex(new THREE.BufferAttribute(I, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
  let mat = m0.material;
  if (lit) {
    mat = mat.clone(); const sheet = (tex && sheets[tex]) || SF2_BLACK, k = def.lmK ?? Math.PI; mat.envMapIntensity = def.lmEnv ?? 0.1; // (the bake is the ambient: the sky probe on top washed it blue)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.sf2Lm = { value: sheet }; sh.uniforms.sf2LmK = { value: k };
      sh.vertexShader = 'attribute vec2 lmUv;\nattribute vec3 lmc;\nattribute vec3 lms;\nvarying vec2 vLmUv;\nvarying vec3 vLmc;\nvarying vec3 vLms;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLmUv = lmUv; vLmc = lmc; vLms = lms;');
      sh.fragmentShader = 'uniform sampler2D sf2Lm;\nuniform float sf2LmK;\nvarying vec2 vLmUv;\nvarying vec3 vLmc;\nvarying vec3 vLms;\n' + sh.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tirradiance += ( vLmc + texture2D( sf2Lm, vLmUv ).rgb * vLms ) * sf2LmK;');
    };
    mat.customProgramCacheKey = () => 'sf2lm';
  }
  const out = new THREE.Mesh(geo, mat); out.name = m0.name.replace(/_\d+$/, '') + ' ×' + list.length + (tex ? ' @' + tex.split('/')[1] : '');
  out.castShadow = true; out.receiveShadow = true; out.matrixAutoUpdate = false;
  return out;
}

function sf2TriMap(def) {
  return Object.assign({
    indoor: false, killOutside: false, traversal: false, navClimb: 0.45, navGrid: 1, bodyRadius: 0.25, underFloorAirOnly: true, acoustics: 'indoor', ambience: 'warehouse',
    background: 0x8c9aa6, envIntensity: 0.55, exposure: 1.0, hemi: [0xd8e2ec, 0x5a5048, 0.9],
    sun: { pos: [30, 60, 20], color: 0xfff1de, intensity: 1.6, auto: true }, fog: { color: 0x8c9aa6, near: 80, far: 400 }, shadowFollow: 40,
    async preload() {
      if (this._s2) return;
      const key = this.id, dir = `assets/maps/sf2-${key.slice(4)}/`;
      if (!(window.SF2_MAPS && window.SF2_MAPS[key])) await sf2MapScript(dir + 'map.js');
      const d = window.SF2_MAPS[key], bin = Uint8Array.from(atob(d.glb), (c) => c.charCodeAt(0)).buffer; d.glb = null;
      const gltf = await apexGLTF(bin);
      // v65w SF2's world is left-handed: the (x, z, −y) / 100 the builder and UModel share keeps the handedness, so every SF2 map came out
      // mirrored (user 10-29: Desert Camp's hut on the wrong side). One flip of z here mirrors it back — collision winding, starts, ladders follow
      if (this.mirror !== false) gltf.scene.scale.z = -1;
      gltf.scene.updateMatrixWorld(true);
      // collision: every mesh's world triangles (instances share geometry), the sky dome and other huge shells out
      const pos = [], idx = [], v = new THREE.Vector3(), box = new THREE.Box3(), size = new THREE.Vector3(), all = new THREE.Box3();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const ex = (k) => o.userData[k] || (o.parent && o.parent.userData[k]); // (glTF node extras: on the node, or its group)
        if (ex('colOnly')) o.userData.colOnly = true; else if (ex('nocol')) { o.userData.nocol = true; return; } // v65v SF2's collision: off where it turned it off, its blocking volumes in
        box.setFromObject(o); if (box.getSize(size).length() > 300) { o.userData.sky = true; return; }
        all.union(box);
        const g = o.geometry, P = g.attributes.position, base = pos.length / 3, flip = o.matrixWorld.determinant() < 0; // (a mirrored node: its triangles wound the other way round)
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); }
        const I = (i) => (g.index ? g.index.getX(i) : i), n3 = g.index ? g.index.count : P.count;
        for (let i = 0; i + 2 < n3; i += 3) if (flip) idx.push(base + I(i), base + I(i + 2), base + I(i + 1)); else idx.push(base + I(i), base + I(i + 1), base + I(i + 2));
      });
      const soup = new TriSoup(new Float32Array(pos), new Uint32Array(idx), 'concrete');
      if (this.mirror !== false && !d.meta.mirrored) { // (once per page: the starts' z and facing, the ladders' z)
        for (const st of d.meta.starts) { st.pos[2] = -st.pos[2]; st.yaw = Math.PI - st.yaw; }
        for (const l of d.meta.ladders || []) l[2] = -l[2];
        d.meta.mirrored = true;
      }
      // v65z SF2's baked light (tools/sf2_lightmap.py): its SimpleLightmap sheets, linear, uv as UE stores it (no flip)
      const lm = {};
      await Promise.all(Object.entries(d.meta.lightmaps || {}).map(async ([k, url]) => {
        const t = await new THREE.TextureLoader().loadAsync(url); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; lm[k] = t;
      }));
      this._s2 = { gltf, soup, meta: d.meta, lm };
      this.bounds = { minX: Math.floor(all.min.x) - 2, maxX: Math.ceil(all.max.x) + 2, minZ: Math.floor(all.min.z) - 2, maxZ: Math.ceil(all.max.z) + 2 };
      this.killY = all.min.y - 15;
      const levels = []; for (let y = Math.floor(all.min.y); y <= Math.ceil(all.max.y); y += 0.5) levels.push(y + 0.2); this.navLevels = levels; // v65v slabs every 0.5 m: NavGraph.walkable() takes a floor within ±0.25 m of the slab, so 1 m slabs missed every floor between (SF2's uneven ground: Desert Camp's graph fell into 155 pieces, no path between the bases)
    },
    // v65v every SF2 start of the team (TDM ones, tools/sf2_map_build.mjs) is a spawn point, on the floor and fitting a soldier
    spawnPoints(team, game) {
      // (SF2's TDM starts are spread over the map for respawns; a team's base is its densest cluster — 15 m cells, the starts within 12 m of
      // the densest cell's mean: Desert Camp Alpha 13 at (−15, −30), Bravo 12 at (30, 45) — v65v both teams had spawned in one corner)
      const all = this._s2.meta.starts, mine = all.filter((x) => (x.team === 0 ? 'alpha' : 'bravo') === team), pts = [], col = game.collision, cells = new Map();
      for (const s of mine) { const k = Math.round(s.pos[0] / 15) + ',' + Math.round(s.pos[2] / 15); cells.set(k, (cells.get(k) || []).concat([s])); }
      const best = [...cells.values()].sort((a, c) => c.length - a.length)[0] || [], cx = best.reduce((t, s) => t + s.pos[0], 0) / (best.length || 1), cz = best.reduce((t, s) => t + s.pos[2], 0) / (best.length || 1);
      const base = mine.filter((s) => Math.hypot(s.pos[0] - cx, s.pos[2] - cz) < 12), S = base.length ? base : mine.length ? mine : [all[team === 'alpha' ? 0 : all.length - 1]];
      for (const s of S) {
        const g = col.groundBelow(s.pos[0], s.pos[1] + 1.2, s.pos[2], 0.3, 3, 0);
        if (g && col.fits(s.pos[0], g.y + 0.05, s.pos[2], 0.3, 1.8)) { const p = new THREE.Vector3(s.pos[0], g.y, s.pos[2]); p.spawnYaw = s.yaw; pts.push(p); }
      }
      return { pts: pts.length ? pts : [new THREE.Vector3(...S[0].pos)], yaw: S[0].yaw };
    },
    build(b) {
      const S = this._s2 && this._s2.meta.starts;
      if (S) for (const s of S) { const t = s.team === 0 ? 'alpha' : 'bravo'; b.spawnZone(t, s.pos[0] - 4, s.pos[2] - 4, s.pos[0] + 4, s.pos[2] + 4, s.yaw); }
      if (b.dry) return;
      const { gltf, soup } = this._s2;
      b.col.useTris(soup); b.phys.triGround = new TriGround(soup);
      for (const l of this._s2.meta.ladders || []) b.navExtra.push(new THREE.Vector3(l[0], l[1], l[2])); // (SF2's ladder volumes: climbing is a follow-up)
      const meshes = []; gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      // v65y def.stairMat (user 10-29, Desert Camp: the brick stair dc_stair_002 is the right look): every other stair mesh drawn with it,
      // its iron rails (def.stairKeep materials) left as they are
      const stairMat = def.stairMat && meshes.map((o) => o.material).find((mt) => mt && mt.name === def.stairMat);
      const groups = new Map();
      for (const src of meshes) {
        if (src.userData.colOnly) continue; // (a blocking volume: in the triangle soup, not drawn)
        // v65y a clone per match (geometry / materials shared): moving the loaded meshes themselves left the map's second match empty
        const m = src.clone(); m.matrixWorld.copy(src.matrixWorld);
        if (stairMat && /^dc_stair_/i.test(m.name) && !Array.isArray(m.material) && !(def.stairKeep || []).includes(m.material.name)) m.material = stairMat;
        m.matrixWorld.decompose(m.position, m.quaternion, m.scale); m.matrixAutoUpdate = false; m.updateMatrix();
        if (def.stairSides && def.stairSides.test(m.name)) { const s = stairSides(src.geometry, m.material); if (s) { s.matrix.copy(m.matrix); s.matrixAutoUpdate = false; s.castShadow = s.receiveShadow = true; b.scene.add(s); } }
        m.castShadow = !m.userData.sky; m.receiveShadow = true;
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) { mt.vertexColors = false; mt.side = THREE.DoubleSide; if (mt.map) { mt.map.anisotropy = 4; const c = mt.color; if (Math.abs(c.r - c.g) < 0.02 && Math.abs(c.g - c.b) < 0.02) c.setRGB(1, 1, 1); } } // (v65y UModel gives a plain mesh material a 0.58 grey base colour SF2 does not have — the sand mound by the square came out darker than the BSP sand around it in the same texture; a coloured one is the material's own tint, the hangars' red frames, and stays) // (v65w UModel writes SF2's vertex paint as COLOR_0: multiplied in, it striped crates and benches in rainbow colours)
        if (/ladder/i.test(m.name)) sf2Ladder(b, m);
        if (Array.isArray(m.material) || m.userData.sky) { b.scene.add(m); continue; }
        const L = sf2LightOf(src), k = m.material.uuid + '|' + (L.tex || '');
        (groups.get(k) || groups.set(k, []).get(k)).push({ m, src, L });
      }
      // v65z every placement of one material on one baked-light sheet merged into one mesh carrying SF2's own light (user 10-30: Desert
      // Camp in SF2's look): each placement lights differently, so the v65y instancing gives way to merging — still one draw per
      // material and sheet (nothing raycasts the drawn map: shots and bodies use the triangle soup)
      for (const list of groups.values()) b.scene.add(sf2Merge(list, this._s2.lm, def));
    },
  }, def);
}

// v65o the regular SF2 maps (docs/research/sf2/map-inventory.md), one push each as they are built (docs/loop/SF2_ALL.md M3)
SF2_LISTED && MAPS.push(sf2TriMap({
  id: 'sf2_alcatraz', name: 'SF2 惡魔島', en: 'ALCATRAZ', desc: 'Special Force 2 原版地圖 · 原版模型與擺設 · 三角形碰撞', slogan: '監獄牢房區 · 近距離交戰',
  bounds: { minX: -20, maxX: 20, minZ: -45, maxZ: 45 }, indoor: true, killY: -20,
  shot: { pos: [0, 40, 30], target: [0, 0, 0] }, thumb: { pos: [0, 30, 45], target: [0, 0, 0], fov: 50 },
  objectives: { dom: [[0, 0, -15], [0, 0, 8], [0, 0, 30]], relic: [0, 0, 8], domRadius: 4 },
}));
// v65t 沙漠之都 (user 10-29): SF2's DustCity — the desert town, its BSP streets and walls, 1829 placed meshes; Alpha spawns in the
// north-west corner, Bravo in the south-east (game metres: x −44 … 76, z −38 … 43)
SF2_LISTED && MAPS.push(sf2TriMap({
  id: 'sf2_dustcity', name: 'SF2 沙漠之都', en: 'DUST CITY', desc: 'Special Force 2 原版地圖 · 原版模型與擺設 · 三角形碰撞', slogan: '沙漠城鎮 · 巷戰與屋頂狙擊',
  bounds: { minX: -46, maxX: 78, minZ: -46, maxZ: 46 }, indoor: false, killY: -20,
  shot: { pos: [16, 70, 60], target: [16, 0, 0] }, thumb: { pos: [16, 80, 70], target: [16, 0, 0], fov: 55 },
  objectives: { dom: [[-12, 0, -22], [8, 0, 0], [28, 0, 22]], relic: [8, 0, 0], domRadius: 5 },
}));

export { sf2TriMap };

// v65v Desert Camp (user 10-29: 1:1, the SF2 map to keep) — every placed mesh incl. SFStaticMeshActor / SFKActorNoSync (archetype meshes),
// collision as SF2 sets it (components with CollideActors / BlockActors off left out, its 29 blocking volumes in); Alpha (TDM starts)
// south of the square, Bravo north (game metres, mirrored back v65w: x −36 … 55, z −57 … 30)
MAPS.push(sf2TriMap({
  id: 'sf2_desertcamp', name: 'SF2 沙漠營地', en: 'DESERT CAMP', desc: 'Special Force 2 原版地圖 1:1 · 原版模型、擺設與碰撞', slogan: '沙漠營地 · 中央廣場與兩側巷道',
  bounds: { minX: -53, maxX: 59, minZ: -59, maxZ: 35 }, indoor: false, killY: -20,
  shot: { pos: [10, 60, -70], target: [10, 0, -12] }, thumb: { pos: [10, 70, -80], target: [10, 0, -12], fov: 55 },
  objectives: { dom: [[-4, 0, 12], [3, 0, -7], [9, 0, -26]], relic: [3, 0, -7], domRadius: 5 },
  // v65y SF2's own light: DominantDirectionalLight_0 (Pitch −10016, Yaw −1120992 → 55° up from 322°; LightColor 251/219/199), the
  // fill turned down and warmed (the old blue-grey sky fill washed the sand-white walls out and hid every shadow), a warm haze
  background: 0xcdbb9c, envIntensity: 0, exposure: 0.8, hemi: [0xe6d6bc, 0x6a5440, 0],
  sun: { pos: [-32, 57, 25], color: 0xfbdbc7, intensity: 2.5, auto: false }, fog: { color: 0xcdbb9c, near: 90, far: 420 },
  lmEnv: 0, lmK: 3.14, stairMat: 'dc_stair_002_INST', stairKeep: ['dcnew_stair_001_INST'], stairSides: /^dc_stair_003/i,
}));
