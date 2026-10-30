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
function sf2Ladder(b, m, nav = true) {
  m.updateMatrixWorld(true); _lb.setFromObject(m); _lb.getCenter(_lc); const sx = _lb.max.x - _lb.min.x, sz = _lb.max.z - _lb.min.z, col = b.col;
  const y0 = _lb.min.y, hw = Math.max(sx, sz) / 2;
  // (the platform lies behind the ladder, −normal: the side whose floor, looked for from above the ladder's top, is the higher one —
  // the triangle collision has no inside, so a 'blocked' test says nothing)
  const top = (nx, nz) => { const g = col.groundBelow(_lc.x - nx * 0.8, _lb.max.y + 1.5, _lc.z - nz * 0.8, 0.15, _lb.max.y - y0 + 2, 0); return g ? g.y : -Infinity; };
  const cand = sx < sz ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]], [nx, nz] = top(...cand[0]) >= top(...cand[1]) ? cand[0] : cand[1];
  const g = col.groundBelow(_lc.x - nx * 0.8, _lb.max.y + 1.5, _lc.z - nz * 0.8, 0.15, _lb.max.y - y0 + 2, 0);
  const y1 = g && g.y > y0 + 1 ? g.y : _lb.max.y - 0.2, x = _lc.x - nx * 0.15, z = _lc.z - nz * 0.15, tx = -nz, tz = nx;
  const P = (a, y, d) => new THREE.Vector3(x + tx * a + nx * d, y, z + tz * a + nz * d);
  const chain = [P(0, y0, 0.95), P(0, y1, -0.95)]; chain.ladder = true; chain.cost = 1.8; if (nav !== false) b.navChains.push(chain); // (v65z def.ladderNav false: players climb, bots take the stairs)
  b.ladders.push({ x, z, y0, y1, nx, nz });
  const vx0 = Math.min(x + nx * 0.8, x - nx * 0.15), vx1 = Math.max(x + nx * 0.8, x - nx * 0.15), vz0 = Math.min(z + nz * 0.8, z - nz * 0.15), vz1 = Math.max(z + nz * 0.8, z - nz * 0.15);
  col.addLadder({ minX: nx ? vx0 : x - hw, maxX: nx ? vx1 : x + hw, minZ: nz ? vz0 : z - hw, maxZ: nz ? vz1 : z + hw, y0: y0 - 0.1, y1: y1 + 0.35, top: y1, nx, nz });
}

// v65z SF2's baked light on one drawn primitive (tools/sf2_map_build.mjs extras), directional: a BSP primitive's NormalizedAverageColor /
// DirectionalMax sheets (uv1 already in them), a placement's rect on its sheets (uv1 × cs + cb), or its per-vertex sample pairs
// (8 bytes a vertex, BGRA twice, the primitives' vertices one after another) — each with the pair's ScaleVectors
function sf2LightOf(src) {
  const gl = src.geometry.userData.lm; if (gl) return { tex: gl.nac, max: gl.max, ns: gl.ns, ms: gl.ms };
  const node = src.userData.lm || src.userData.lmr ? src : src.parent, ud = (node && node.userData) || {};
  if (ud.lm) return { tex: ud.lm.nac, max: ud.lm.max, ns: ud.lm.ns, ms: ud.lm.ms, cs: ud.lm.cs, cb: ud.lm.cb };
  if (!ud.lmr) return {};
  const v = ud._lmr || (ud._lmr = Uint8Array.from(atob(ud.lmr.raw), (c) => c.charCodeAt(0)));
  let off = 0; if (node !== src) for (const c of node.children) { if (c === src) break; if (c.isMesh) off += c.geometry.attributes.position.count; }
  return { v, off, ns: ud.lmr.ns, ms: ud.lmr.ms };
}
const SF2_BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); SF2_BLACK.needsUpdate = true;
const SF2_WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); SF2_WHITE.needsUpdate = true;
// v65z one draw for a material on one light-sheet pair: the placements in world space, plus what the material reads — lmUv (the sheets'
// uv), lmN / lmM (NormalizedAverageColor and DirectionalMax: the ScaleVectors, × the sheets when lmT is 1; the per-vertex samples
// when 0) — lit as UE3 does its directional bake: NormalizedAverageColor × Σ DirectionalMax_i · max(0, n·B_i)² over the HL2 basis B_i,
// n the normal map's tangent-space normal (UE's DirectX green), × 1.2 (= the SimpleLightmap at a flat normal, measured), × π (UE
// multiplies it straight into the albedo, three divides by π); the map's sun stays the dynamic dominant light it is in SF2
const SF2_LMD = `#include <lights_fragment_maps>
	vec3 sf2n = vec3( 0.0, 0.0, 1.0 );
	#ifdef USE_NORMALMAP_TANGENTSPACE
		sf2n = normalize( vec3( mapN.x, - mapN.y, mapN.z ) );
	#endif
	vec3 sf2nac = vLmN, sf2mx = vLmM;
	if ( vLmT > 0.5 ) { sf2nac *= texture2D( sf2Nac, vLmUv ).rgb; sf2mx *= texture2D( sf2Max, vLmUv ).rgb; }
	vec3 sf2d = max( vec3( dot( sf2n, vec3( -0.408248, 0.707107, 0.577350 ) ), dot( sf2n, vec3( -0.408248, -0.707107, 0.577350 ) ), dot( sf2n, vec3( 0.816497, 0.0, 0.577350 ) ) ), 0.0 );
	irradiance += sf2nac * dot( sf2mx, sf2d * sf2d ) * sf2LmK;`;
function sf2Merge(list, sheets, def) {
  const lit = Object.keys(sheets).length > 0, m0 = list[0].m, tex = list[0].L.tex, tmax = list[0].L.max;
  let nv = 0, ni = 0; for (const { src } of list) { const g = src.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), LU = new Float32Array(nv * 2), LN = new Float32Array(nv * 3), LM = new Float32Array(nv * 3), LT = new Float32Array(nv), I = new Uint32Array(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), fb = def.lmFallback || [0.25, 0.25, 0.25];
  let vo = 0, io = 0;
  for (const { m, src, L } of list) {
    const g = src.geometry, gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv, g1 = g.attributes.uv1, n = gp.count, flip = m.matrix.determinant() < 0;
    nm.getNormalMatrix(m.matrix);
    for (let i = 0; i < n; i++) {
      const j = vo + i;
      v.fromBufferAttribute(gp, i).applyMatrix4(m.matrix); P[j * 3] = v.x; P[j * 3 + 1] = v.y; P[j * 3 + 2] = v.z;
      if (gn) { v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); N[j * 3] = v.x; N[j * 3 + 1] = v.y; N[j * 3 + 2] = v.z; }
      if (gu) { U[j * 2] = gu.getX(i); U[j * 2 + 1] = gu.getY(i); }
      if (L.tex && g1) {
        const x = g1.getX(i), y = g1.getY(i); LU[j * 2] = L.cs ? x * L.cs[0] + L.cb[0] : x; LU[j * 2 + 1] = L.cs ? y * L.cs[1] + L.cb[1] : y; LT[j] = 1;
        for (let c = 0; c < 3; c++) { LN[j * 3 + c] = L.ns[c]; LM[j * 3 + c] = L.ms[c]; }
      } else if (L.v) { const q = (L.off + i) * 8, V = L.v; // (B, G, R, A ×2)
        LN[j * 3] = V[q + 2] / 255 * L.ns[0]; LN[j * 3 + 1] = V[q + 1] / 255 * L.ns[1]; LN[j * 3 + 2] = V[q] / 255 * L.ns[2];
        LM[j * 3] = V[q + 6] / 255 * L.ms[0]; LM[j * 3 + 1] = V[q + 5] / 255 * L.ms[1]; LM[j * 3 + 2] = V[q + 4] / 255 * L.ms[2];
      } else for (let c = 0; c < 3; c++) { LN[j * 3 + c] = fb[c]; LM[j * 3 + c] = 1; } // (no bake: a flat mean light)
    }
    const gi = g.index, cnt = gi ? gi.count : n, at = (k) => vo + (gi ? gi.getX(k) : k);
    for (let k = 0; k + 2 < cnt; k += 3) { I[io++] = at(k); I[io++] = at(flip ? k + 2 : k + 1); I[io++] = at(flip ? k + 1 : k + 2); } // (a mirrored placement wound back, so its faces front the right way)
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('lmUv', new THREE.BufferAttribute(LU, 2)); geo.setAttribute('lmN', new THREE.BufferAttribute(LN, 3)); geo.setAttribute('lmM', new THREE.BufferAttribute(LM, 3)); geo.setAttribute('lmT', new THREE.BufferAttribute(LT, 1));
  geo.setIndex(new THREE.BufferAttribute(I, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
  let mat = m0.material;
  if (lit) {
    mat = mat.clone(); if (mat.normalMap && !mat.userData.dxFlip) { mat.normalScale.y = -mat.normalScale.y; mat.userData.dxFlip = true; } // (v65z UE3's normal maps are DirectX-style: green points down)
    const sN = (tex && sheets[tex]) || SF2_WHITE, sM = (tmax && sheets[tmax]) || SF2_WHITE, k = (def.lmK ?? Math.PI) * 1.2; mat.envMapIntensity = def.lmEnv ?? 0.1; // (the bake is the ambient: the sky probe on top washed it blue)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.sf2Nac = { value: sN }; sh.uniforms.sf2Max = { value: sM }; sh.uniforms.sf2LmK = { value: k };
      sh.vertexShader = 'attribute vec2 lmUv;\nattribute vec3 lmN;\nattribute vec3 lmM;\nattribute float lmT;\nvarying vec2 vLmUv;\nvarying vec3 vLmN;\nvarying vec3 vLmM;\nvarying float vLmT;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLmUv = lmUv; vLmN = lmN; vLmM = lmM; vLmT = lmT;');
      sh.fragmentShader = 'uniform sampler2D sf2Nac;\nuniform sampler2D sf2Max;\nuniform float sf2LmK;\nvarying vec2 vLmUv;\nvarying vec3 vLmN;\nvarying vec3 vLmM;\nvarying float vLmT;\n'
        + sh.fragmentShader.replace('#include <lights_fragment_maps>', SF2_LMD);
    };
    mat.customProgramCacheKey = () => 'sf2lmd';
  }
  const out = new THREE.Mesh(geo, mat); out.name = m0.name.replace(/_\d+$/, '') + ' ×' + list.length + (tex ? ' @' + tex.split('/')[1] : '');
  out.castShadow = true; out.receiveShadow = true; out.matrixAutoUpdate = false;
  return out;
}

// v65z a flight of narrow steps as the ramp SF2 collides with (its static meshes carry a simple collision UModel does not export): the
// treads are the up-facing faces with the most area at each point along the rise axis; a line fitted through them, as wide as they
// are, gives two triangles in place of the mesh's own (Cannon's ms_stair001: 0.2 m treads, narrower than a body — every step blocked)
function sf2StairRamp(o) {
  const g = o.geometry, P = g.attributes.position, I = g.index, n3 = I ? I.count : P.count, at = (k) => (I ? I.getX(k) : k);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), up = [];
  for (let k = 0; k + 2 < n3; k += 3) {
    a.fromBufferAttribute(P, at(k)); b.fromBufferAttribute(P, at(k + 1)); c.fromBufferAttribute(P, at(k + 2));
    nrm.subVectors(b, a).cross(c.clone().sub(a)); const area = nrm.length() / 2; if (area < 1e-5) continue; nrm.normalize();
    if (Math.abs(nrm.y) > 0.8) up.push({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3, area });
  }
  if (up.length < 4) return null;
  // (the railings' caps face up too, along both sides: keep the middle 60 % across — the narrower of the two horizontal spans)
  const ext = (k) => [Math.min(...up.map((f) => f[k])), Math.max(...up.map((f) => f[k]))], ex = ext('x'), ez = ext('z'), latK = ex[1] - ex[0] < ez[1] - ez[0] ? 'x' : 'z', le = latK === 'x' ? ex : ez;
  const mid = up.filter((f) => f[latK] > le[0] + 0.2 * (le[1] - le[0]) && f[latK] < le[1] - 0.2 * (le[1] - le[0]));
  if (mid.length >= 4) up.splice(0, up.length, ...mid);
  const sx = Math.max(...up.map((f) => f.x)) - Math.min(...up.map((f) => f.x)), sz = Math.max(...up.map((f) => f.z)) - Math.min(...up.map((f) => f.z));
  const fit = (ax) => { // least squares y = p + q·t over area-weighted tread centres, t along ax
    let W = 0, T = 0, Y = 0, TT = 0, TY = 0; for (const f of up) { const t = f[ax], w = f.area; W += w; T += w * t; Y += w * f.y; TT += w * t * t; TY += w * t * f.y; }
    const q = (W * TY - T * Y) / (W * TT - T * T || 1), p = (Y - q * T) / W; let err = 0; for (const f of up) err += f.area * Math.abs(f.y - (p + q * f[ax])); return { p, q, err };
  };
  const fx = fit('x'), fz = fit('z'), ax = Math.abs(fx.q) * sx > Math.abs(fz.q) * sz ? 'x' : 'z', L = ax === 'x' ? fx : fz, lat = ax === 'x' ? 'z' : 'x';
  const on = up.filter((f) => Math.abs(f.y - (L.p + L.q * f[ax])) < 0.3); if (on.length < 3) return null;
  const t0 = Math.min(...on.map((f) => f[ax])) - 0.12, t1 = Math.max(...on.map((f) => f[ax])) + 0.12, l0 = (lat === latK ? le[0] : Math.min(...on.map((f) => f[lat]))) + 0.05, l1 = (lat === latK ? le[1] : Math.max(...on.map((f) => f[lat]))) - 0.05;
  // (the ends: the lowest and the highest tread — a least-squares line through all of them overshoots where a landing adjoins)
  on.sort((f, g2) => f.y - g2.y); const lo = on[0], hi = on[on.length - 1], q2 = (hi.y - lo.y) / ((hi[ax] - lo[ax]) || 1), y = (t) => lo.y + q2 * (t - lo[ax]);
  const ta = lo[ax] - Math.sign(hi[ax] - lo[ax]) * 0.15, tb = hi[ax] + Math.sign(hi[ax] - lo[ax]) * 0.15;
  const pt = (t, l) => { const v = new THREE.Vector3(); v[ax] = t; v[lat] = l; v.y = y(t) + 0.03; return v.applyMatrix4(o.matrixWorld); };
  return t0 < t1 ? [pt(ta, l0), pt(ta, l1), pt(tb, l0), pt(tb, l1)] : null;
}

// v65z an SF2 UE3 Terrain (tools/sf2_map_build.mjs meta.terrain, game metres, already in the mirrored-back frame): the height grid
// less its holes, as positions + indices for the triangle soup and a mesh whose material blends the four layers by their painted
// weights (layer 0 underneath, each next one mixed over it by its alpha), tiled every MappingScale quads, turned by MappingRotation
function sf2TerrainGeo(T) {
  const nx = T.nx, ny = T.ny, H = new Float32Array(Uint8Array.from(atob(T.h), (c) => c.charCodeAt(0)).buffer), W = Uint8Array.from(atob(T.w), (c) => c.charCodeAt(0));
  const P = new Float32Array(nx * ny * 3), G = new Float32Array(nx * ny * 2), hole = new Set(T.holes || []), I = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = i + j * nx; P[k * 3] = T.x0 + i * T.dx; P[k * 3 + 1] = H[k]; P[k * 3 + 2] = T.z0 + j * T.dz; G[k * 2] = i; G[k * 2 + 1] = j; }
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = i + j * nx, b = a + nx, c = a + 1, d = b + 1;
    if (hole.has(a) || hole.has(b) || hole.has(c) || hole.has(d)) continue;
    I.push(a, b, c, c, b, d); // (normals up: x east, z south)
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('tgrid', new THREE.BufferAttribute(G, 2));
  geo.setAttribute('tw', new THREE.BufferAttribute(W, 4, true)); geo.setIndex(I); geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
async function sf2TerrainMesh(T, geo, def) {
  const tex = await Promise.all(T.layers.map((L) => (L.tex ? new THREE.TextureLoader().loadAsync(L.tex) : null)));
  for (const t of tex) if (t) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  const black = SF2_BLACK, L = T.layers, mat = new THREE.MeshStandardMaterial({ map: tex[0] || black, roughness: 0.95, metalness: 0 });
  const fb = def.lmFallback || [0.3, 0.3, 0.3], k = def.lmK ?? Math.PI; mat.envMapIntensity = def.lmEnv ?? 0.1;
  mat.onBeforeCompile = (sh) => {
    for (let i = 1; i < 4; i++) sh.uniforms['tL' + i] = { value: tex[i] || black };
    sh.uniforms.tS = { value: new THREE.Vector4(...[0, 1, 2, 3].map((i) => (L[i] ? L[i].scale : 4))) };
    sh.uniforms.tR = { value: new THREE.Vector4(...[0, 1, 2, 3].map((i) => (L[i] && Math.abs(L[i].rot - 90) < 1 ? 1 : 0))) };
    sh.uniforms.sf2Fb = { value: new THREE.Vector3(fb[0] * k, fb[1] * k, fb[2] * k) };
    sh.vertexShader = 'attribute vec2 tgrid;\nattribute vec4 tw;\nvarying vec2 vTg;\nvarying vec4 vTw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvTg = tgrid; vTw = tw;');
    sh.fragmentShader = 'uniform sampler2D tL1;\nuniform sampler2D tL2;\nuniform sampler2D tL3;\nuniform vec4 tS;\nuniform vec4 tR;\nuniform vec3 sf2Fb;\nvarying vec2 vTg;\nvarying vec4 vTw;\nvec2 tuv(float s, float r) { vec2 u = vTg / s; return r > 0.5 ? vec2(u.y, -u.x) : u; }\n'
      + sh.fragmentShader.replace('#include <map_fragment>', `vec4 tc = texture2D( map, tuv( tS.x, tR.x ) );
	tc = mix( tc, texture2D( tL1, tuv( tS.y, tR.y ) ), vTw.y );
	tc = mix( tc, texture2D( tL2, tuv( tS.z, tR.z ) ), vTw.z );
	tc = mix( tc, texture2D( tL3, tuv( tS.w, tR.w ) ), vTw.w );
	diffuseColor *= tc;`).replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tirradiance += sf2Fb;');
  };
  mat.customProgramCacheKey = () => 'sf2terrain';
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'terrain'; mesh.receiveShadow = true; mesh.castShadow = true; mesh.matrixAutoUpdate = false;
  return mesh;
}

// v66a SF2's projected decals (DecalActor, 139 on Desert Camp: stains, posters, sand patches) as quads on the plane they were cast on
// (the component's stored hit: point, normal, tangent along the width, binormal along the height), 1.5 cm off it; one mesh per sheet and
// blend. UE3's BLEND_Modulate multiplies what is behind (its sheet is over white, so its clear part changes nothing); BLEND_Translucent
// blends over it, unlit (MLM_Unlit) or lit by the sun and sky
function sf2Decals(list, dtex) {
  const by = new Map(), out = [];
  for (const q of list) { const k = q.tex + '|' + q.blend + '|' + (q.unlit ? 1 : 0); (by.get(k) || by.set(k, []).get(k)).push(q); }
  for (const [k, qs] of by) {
    const tex = dtex[qs[0].tex]; if (!tex) continue;
    const P = new Float32Array(qs.length * 12), U = new Float32Array(qs.length * 8), I = [], v = new THREE.Vector3();
    qs.forEach((q, i) => {
      const p = new THREE.Vector3(...q.p).addScaledVector(new THREE.Vector3(...q.n), 0.015), t = new THREE.Vector3(...q.t).multiplyScalar(q.w / 2), bn = new THREE.Vector3(...q.b).multiplyScalar(q.h / 2);
      [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(([sx, sy, u, w], j) => { v.copy(p).addScaledVector(t, sx).addScaledVector(bn, sy); P.set([v.x, v.y, v.z], i * 12 + j * 3); U.set([u, w], i * 8 + j * 2); });
      I.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    const base = { map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const mod = qs[0].blend === 'Modulate', mt = mod ? new THREE.MeshBasicMaterial({ ...base, fog: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor })
      : qs[0].unlit ? new THREE.MeshBasicMaterial(base) : new THREE.MeshStandardMaterial({ ...base, roughness: 1, metalness: 0 });
    const m = new THREE.Mesh(g, mt); m.name = 'decal_' + k; m.renderOrder = 1; m.receiveShadow = !mod; m.userData.noRay = true; out.push(m);
  }
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
      const pos = [], idx = [], ramps = [], v = new THREE.Vector3(), box = new THREE.Box3(), size = new THREE.Vector3(), all = new THREE.Box3();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const ex = (k) => o.userData[k] || (o.parent && o.parent.userData[k]); // (glTF node extras: on the node, or its group)
        if (ex('colOnly')) o.userData.colOnly = true; else if (ex('nocol')) { o.userData.nocol = true; return; } // v65v SF2's collision: off where it turned it off, its blocking volumes in
        box.setFromObject(o); if (box.getSize(size).length() > 300) { o.userData.sky = true; return; }
        all.union(box);
        if (this.rampStairs && this.rampStairs.test(o.name)) { const q = sf2StairRamp(o); if (q) { // (v65z this stair's ramp, both windings: up whichever way the mesh faces)
          ramps.push(q); const b0 = pos.length / 3; for (const v2 of q) pos.push(v2.x, v2.y, v2.z); idx.push(b0, b0 + 1, b0 + 2, b0 + 2, b0 + 1, b0 + 3, b0, b0 + 2, b0 + 1, b0 + 2, b0 + 3, b0 + 1); return; } }
        const g = o.geometry, P = g.attributes.position, base = pos.length / 3, flip = o.matrixWorld.determinant() < 0; // (a mirrored node: its triangles wound the other way round)
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); }
        const I = (i) => (g.index ? g.index.getX(i) : i), n3 = g.index ? g.index.count : P.count;
        for (let i = 0; i + 2 < n3; i += 3) if (flip) idx.push(base + I(i), base + I(i + 2), base + I(i + 1)); else idx.push(base + I(i), base + I(i + 1), base + I(i + 2));
      });
      // v65z the map's UE3 Terrain (its ground, tower / Cannon): into the soup and the bounds; drawn in build()
      const TS = d.meta.terrains || (d.meta.terrain ? [d.meta.terrain] : []), tgeos = TS.map(sf2TerrainGeo); // (v65z every Terrain: Desert Camp's two outer dunes)
      for (const tgeo of tgeos) {
        const TP = tgeo.attributes.position, TI = tgeo.index, base = pos.length / 3;
        for (let i = 0; i < TP.count; i++) pos.push(TP.getX(i), TP.getY(i), TP.getZ(i));
        for (let i = 0; i < TI.count; i++) idx.push(base + TI.getX(i));
        all.union(tgeo.boundingBox);
      }
      const soup = new TriSoup(new Float32Array(pos), new Uint32Array(idx), 'concrete');
      if (this.mirror !== false && !d.meta.mirrored) { // (once per page: the starts' z and facing, the ladders' z)
        for (const st of d.meta.starts) { st.pos[2] = -st.pos[2]; st.yaw = Math.PI - st.yaw; }
        for (const l of d.meta.ladders || []) l[2] = -l[2];
        for (const q of (d.meta.decals && d.meta.decals.list) || []) for (const v of [q.p, q.n, q.t, q.b]) v[2] = -v[2]; // (v66a the decals' planes too)
        d.meta.mirrored = true;
      }
      // v65z SF2's baked light (tools/sf2_lightmap.py): its SimpleLightmap sheets, linear, uv as UE stores it (no flip)
      const lm = {};
      await Promise.all(Object.entries(d.meta.lightmaps || {}).map(async ([k, url]) => {
        const t = await new THREE.TextureLoader().loadAsync(url); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; lm[k] = t;
      }));
      if (d.meta.lut && !this.lutTex) { const t = await new THREE.TextureLoader().loadAsync(d.meta.lut); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; this.lutTex = t; } // (v65z read by the post pass)
      const dtex = {}; // v66a the decal sheets (sRGB colour; tools/sf2_map_build.mjs meta.decals)
      await Promise.all(Object.entries((d.meta.decals && d.meta.decals.tex) || {}).map(async ([k, url]) => { const t = await new THREE.TextureLoader().loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; dtex[k] = t; }));
      this._s2 = { gltf, soup, ramps, meta: d.meta, lm, dtex, terrains: await Promise.all(TS.map((T, i) => sf2TerrainMesh(T, tgeos[i], this))) };
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
      // v65z each stair ramp a nav chain foot → head, 1.2 / 1.4 m past its ends (the grid's own links did not climb Cannon's 29° flights)
      for (const q of this._s2.ramps || []) {
        const lo = q[0].clone().add(q[1]).multiplyScalar(0.5), hi = q[2].clone().add(q[3]).multiplyScalar(0.5), [a, c] = lo.y < hi.y ? [lo, hi] : [hi, lo], dir = c.clone().sub(a).setY(0).normalize();
        const foot = a.clone().addScaledVector(dir, -1.2), head = c.clone().addScaledVector(dir, 1.4);
        for (const [e, y0] of [[foot, a.y], [head, c.y]]) { const g = b.col.groundBelow(e.x, y0 + 0.4, e.z, 0.2, 2.2, 0); e.y = g ? g.y : y0; } // (on the floor the flight lands on — Cannon's flights rise 1 m past it)
        const ch = [foot, a.clone().lerp(c, 0.33), a.clone().lerp(c, 0.66), head]; ch.force = true; b.navChains.push(ch);
      }
      // v65z hand-set links (walked by a player first): one starting at a flight's head carries that flight's chain on
      for (const ch of def.navChains || []) {
        const pts = ch.map((q) => new THREE.Vector3(q[0], q[1], q[2])), on = b.navChains.find((c2) => c2[c2.length - 1].distanceTo(pts[0]) < 0.8);
        if (on) on.push(...pts.slice(1)); else b.navChains.push(pts);
      }
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
        if (def.stairSides && def.stairSides.test(m.name)) { const s = stairSides(src.geometry, m.material); if (s) { s.matrix.copy(m.matrix); b.scene.add(sf2Merge([{ m: s, src: s, L: {} }], this._s2.lm, def)); } } // (v65z lit like the rest: the bake's mean light)
        m.castShadow = !m.userData.sky; m.receiveShadow = true;
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) { mt.vertexColors = false; mt.side = THREE.DoubleSide; if (mt.map) { mt.map.anisotropy = 4; const c = mt.color; if (Math.abs(c.r - c.g) < 0.02 && Math.abs(c.g - c.b) < 0.02) c.setRGB(1, 1, 1); } } // (v65y UModel gives a plain mesh material a 0.58 grey base colour SF2 does not have — the sand mound by the square came out darker than the BSP sand around it in the same texture; a coloured one is the material's own tint, the hangars' red frames, and stays) // (v65w UModel writes SF2's vertex paint as COLOR_0: multiplied in, it striped crates and benches in rainbow colours)
        if (/ladder/i.test(m.name)) sf2Ladder(b, m, def.ladderNav);
        if (Array.isArray(m.material) || m.userData.sky) { b.scene.add(m); continue; }
        const L = sf2LightOf(src), k = m.material.uuid + '|' + (L.tex || '') + '|' + (L.max || '');
        (groups.get(k) || groups.set(k, []).get(k)).push({ m, src, L });
      }
      // v65z every placement of one material on one baked-light sheet merged into one mesh carrying SF2's own light (user 10-30: Desert
      // Camp in SF2's look): each placement lights differently, so the v65y instancing gives way to merging — still one draw per
      // material and sheet (nothing raycasts the drawn map: shots and bodies use the triangle soup)
      for (const list of groups.values()) b.scene.add(sf2Merge(list, this._s2.lm, def));
      for (const t of this._s2.terrains || []) b.scene.add(t);
      if (this._s2.meta.decals) for (const m of sf2Decals(this._s2.meta.decals.list, this._s2.dtex)) b.scene.add(m);
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
  background: 0xcdbb9c, envIntensity: 0, exposure: 0.8, hemi: [0xe6d6bc, 0x6a5440, 0.35], // (v65z a little sky for what the bake does not light: soldiers, dropped guns)
  sun: { pos: [-32, 57, 25], color: 0xfbdbc7, intensity: 2.5, auto: false }, fog: { color: 0xcdbb9c, near: 90, far: 420 },
  lmEnv: 0, lmK: 3.14, stairMat: 'dc_stair_002_INST', stairKeep: ['dcnew_stair_001_INST'], stairSides: /^dc_stair_003/i,
}));

// v65z 邊境要塞 (user 10-30: S.K.I.L.L. Special Force 2's Cannon — its install name `tower`, the anti-satellite base of SF2's
// 佔領模式 / SFCaptureGame): one capture point on the roof of the central building under the satellite antenna (SFCaptureVolume_0,
// UE (−320, 768, 704)); its DominantDirectionalLight 38° up from 43°, brightness 3.5 (Desert Camp's 5 → 2.5 here); Alpha's base south (z −30), Bravo's north (z +43), a watchtower at each (game metres: x −32 … 25, z −33 … 49)
MAPS.push(sf2TriMap({
  id: 'sf2_tower', name: 'SF2 邊境要塞', en: 'CANNON', desc: 'Special Force 2 原版地圖 1:1 · 佔領模式專用 · 原版模型、擺設、碰撞與烘焙光照', slogan: '反衛星基地 · 中央據點爭奪',
  bounds: { minX: -34, maxX: 27, minZ: -35, maxZ: 51 }, indoor: false, killY: -20,
  shot: { pos: [-3, 45, -50], target: [-3, 0, 8] }, thumb: { pos: [-3, 55, -60], target: [-3, 0, 8], fov: 55 },
  objectives: { cap: [-3.2, 6.3, 7.68], capRadius: 2.4, dom: [[-3, 0, -20], [-3.2, 6.3, 7.68], [-6, 0, 36]], relic: [-3.2, 6.3, 7.68], domRadius: 4 },
  background: 0xc9c2b4, envIntensity: 0, exposure: 0.95, hemi: [0xe6dcc8, 0x6a5a48, 0.35], lmFallback: [0.5, 0.48, 0.45], // (v65z brighter: its terrain has no bake, the mean light carries it)
  sun: { pos: [-40, 43, -38], color: 0xfff0d8, intensity: 1.75, auto: false }, fog: { color: 0xc9c2b4, near: 90, far: 420 },
  lmEnv: 0, lmK: 3.14, rampStairs: /^ms_stair/i, ladderNav: false, // (its tower ladders: bots stuck at their heads)
}));
