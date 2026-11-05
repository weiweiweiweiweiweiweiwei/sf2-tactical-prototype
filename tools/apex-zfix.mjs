// v66s z-fighting (user 11-05: Thunderdome flickers where surfaces meet): triangles of two different props (or a prop and the
// world) on the same plane (within TOL m, either facing — the materials are double-sided) and overlapping. Writes
// <packDir>/zfix.js — window.APEX_ZFIX[id] = the node names the loader draws a hair in front (polygonOffset, src/07w_skulltown.js).
// Pairs where one side is an overlay material (APEX_FRONT, already in front) are left out.
//   node tools/apex-zfix.mjs <map> <map id> <packDir> [radius m]     e.g. thunderdome apex_thunderdome assets/maps/apex-thunderdome/ 185
//   env TOL (m, 0.03), SELF=1 (also report fights inside one mesh)
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const [MAP, ID, DIR] = process.argv.slice(2), d = await io.read(`maps/apex-${MAP}/work/export/scene.gltf`);
const OFS = /decal|stain|drip|_trans|erosion|seam|blend|stencil|font_|logo|sign_|stripes|scratch|runoff|tracks|_extra|glass/i, R = +(process.argv[5] || 1e9), TOL = +(process.env.TOL || 0.03), CELL = 2;
const mul = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const grid = new Map(), NAMES = [], FIX = new Set(), SELF = new Map(); let id = 0, nTri = 0;
const tris = []; // [meshId, mat, nx,ny,nz, d, cx,cy,cz, area, ax,ay,az,bx,by,bz,cx,cy,cz]
for (const node of d.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue; const M = node.getWorldMatrix(); const mid = id++; NAMES[mid] = node.getName();
  for (const p of mesh.listPrimitives()) {
    const P = p.getAttribute('POSITION'), I = p.getIndices(), mt = p.getMaterial(); if (!P || !I) continue;
    const name = mt ? mt.getName() : '-', a = [], b = [], c = [];
    for (let i = 0; i < I.getCount(); i += 3) {
      const A = mul(M, ...P.getElement(I.getScalar(i), a)), B = mul(M, ...P.getElement(I.getScalar(i + 1), b)), C = mul(M, ...P.getElement(I.getScalar(i + 2), c));
      const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3, cz = (A[2] + B[2] + C[2]) / 3; if (Math.hypot(cx, cz) > R) continue;
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz); if (L < 1e-4) continue; nx /= L; ny /= L; nz /= L;
      const area = L / 2; if (area < 0.05) continue; nTri++;
      const t = tris.length; tris.push([mid, name, nx, ny, nz, nx * A[0] + ny * A[1] + nz * A[2], cx, cy, cz, area, A, B, C]);
      const k = `${Math.floor(cx / CELL)},${Math.floor(cy / CELL)},${Math.floor(cz / CELL)}`; let g = grid.get(k); if (!g) grid.set(k, g = []); g.push(t);
    }
  }
}
// point-in-triangle by barycentric on the dominant axis
const inside = (T, x, y, z) => { const [A, B, C] = [T[10], T[11], T[12]]; const ax = Math.abs(T[2]), ay = Math.abs(T[3]), az = Math.abs(T[4]);
  const [i, j] = ax > ay && ax > az ? [1, 2] : ay > az ? [0, 2] : [0, 1]; const p = [x, y, z];
  const v0 = [C[i] - A[i], C[j] - A[j]], v1 = [B[i] - A[i], B[j] - A[j]], v2 = [p[i] - A[i], p[j] - A[j]];
  const d00 = v0[0] * v0[0] + v0[1] * v0[1], d01 = v0[0] * v1[0] + v0[1] * v1[1], d11 = v1[0] * v1[0] + v1[1] * v1[1], d20 = v2[0] * v0[0] + v2[1] * v0[1], d21 = v2[0] * v1[0] + v2[1] * v1[1];
  const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-12) return false; const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den; return u > 0.02 && v > 0.02 && u + v < 0.98; };
const pairs = new Map(), where = new Map();
for (const g of grid.values()) for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) {
  const S = tris[g[x]], T = tris[g[y]]; if (S[0] === T[0] && !process.env.SELF) continue;
  const dot = S[2] * T[2] + S[3] * T[3] + S[4] * T[4]; if (Math.abs(dot) < 0.995) continue; // (double-sided materials: back-to-back fights too)
  if (Math.abs(S[5] - Math.sign(dot) * T[5]) > TOL) continue;
  if (OFS && (OFS.test(S[1]) !== OFS.test(T[1]))) continue; // one of them already drawn in front (env OFS: the loader's regex)
  if (process.env.BACK && dot > 0) continue;
  if (!inside(T, S[6], S[7], S[8]) && !inside(S, T[6], T[7], T[8])) continue;
  if (S[0] === T[0]) { SELF.set(NAMES[S[0]], (SELF.get(NAMES[S[0]]) || 0) + Math.min(S[9], T[9])); continue; }
  { const ws = /^World_/.test(NAMES[S[0]]), wt = /^World_/.test(NAMES[T[0]]); FIX.add(ws ? NAMES[T[0]] : wt ? NAMES[S[0]] : S[0] > T[0] ? NAMES[S[0]] : NAMES[T[0]]); } // (the prop over the world; between props the later one)
  const k = [S[1], T[1]].sort().join('  |  '); pairs.set(k, (pairs.get(k) || 0) + Math.min(S[9], T[9])); if (!where.has(k)) where.set(k, S.slice(6, 9).map((v) => +v.toFixed(1)));
}
console.log('triangles', nTri, 'fighting material pairs', pairs.size);
for (const [k, a] of [...pairs].sort((p, q) => q[1] - p[1]).slice(0, 40)) console.log(a.toFixed(1).padStart(8), 'm²', k, where.get(k).join(','));
console.log('nodes to draw in front', FIX.size, 'self-fights', [...SELF].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, a]) => n + ' ' + a.toFixed(0)).join(', '));
// GLTFLoader's node names: PropertyBinding.sanitizeNodeName (spaces → _, drops [ ] . : /)
const names = [...FIX].map((n) => n.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '')).sort();
(await import('node:fs')).writeFileSync(DIR + 'zfix.js', `/* ${ID}: props drawn a hair in front of a coplanar neighbour — tools/apex-zfix.mjs */
(window.APEX_ZFIX || (window.APEX_ZFIX = {}))[${JSON.stringify(ID)}] = ${JSON.stringify(names)};
`);
console.log('wrote', DIR + 'zfix.js', names.length);
