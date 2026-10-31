// v66e put the placements' own scale (tools/sf2_map_dump.py comp_scaled — the components' Scale3D × Scale the 64-byte matrices lack)
// into a built map.js without re-exporting its meshes: each GLB node `<mesh>_<n>` gets the matrix tools/sf2_map_build.mjs makes from the
// new dump; a node whose old transform is not the unscaled matrix of the same placement stops the patch (dump and build out of step)
//   python tools/sf2_map_dump.py <Map> [--with …] && node tools/sf2_scale_patch.mjs <Map>
import fs from 'node:fs';
const MAP = process.argv[2] || 'tower', f = `assets/maps/sf2-${MAP.toLowerCase()}/map.js`, src = fs.readFileSync(f, 'utf8');
const NOFLIP = { Desertcamp: ['wood_003'], tower: ['tw_build_007'] }; // (as tools/sf2_map_build.mjs)
const placed = JSON.parse(fs.readFileSync(`tools/out/sf2/maps/${MAP}.json`, 'utf8')).placed;
const a = src.indexOf(", glb: '") + 8, b = src.indexOf("'", a), glb = Buffer.from(src.slice(a, b), 'base64');
const jl = glb.readUInt32LE(12), J = JSON.parse(glb.slice(20, 20 + jl).toString('utf8')), rest = glb.slice(20 + jl);
const byName = new Map(J.nodes.map((n) => [n.name, n]));
const C = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
const matOf = (o, m, fl0) => { // (tools/sf2_map_build.mjs: N = C·L·C⁻¹, the mesh's own z flipped unless NOFLIP, t = C·t / 100)
  const L = (j, i) => m[i * 4 + j], A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => L(r, c)));
  const CA = C.map((row) => [0, 1, 2].map((c) => row.reduce((s, v, k) => s + v * A[k][c], 0)));
  const N = CA.map((row) => [0, 1, 2].map((c) => row.reduce((s, v, k) => s + v * C[c][k], 0)));
  const t = [m[12], m[13], m[14]], tg = C.map((row) => row.reduce((s, v, k) => s + v * t[k], 0) / 100), fl = fl0 ?? ((NOFLIP[MAP] || []).includes(o.mesh) ? 1 : -1);
  return [N[0][0], N[1][0], N[2][0], 0, N[0][1], N[1][1], N[2][1], 0, fl * N[0][2], fl * N[1][2], fl * N[2][2], 0, tg[0], tg[1], tg[2], 1];
};
const trs = (n) => { // a node's transform as a column-major matrix
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, t[0], t[1], t[2], 1];
};
let n = 0, done = 0, bad = 0;
for (const o of placed) {
  if (!o.m) continue; const nd = byName.get(o.mesh + '_' + n); if (!nd) continue; n++; // (a mesh UModel did not export: no node, no number)
  const r = o.cs || [1, 1, 1], m0 = o.m.map((v, i) => (i < 12 ? v / r[i >> 2] : v));
  // (the mesh's own z as the map was built: flipped since v65x, kept before it — Alcatraz, DustCity — and for NOFLIP; a node already
  // patched matches its scaled matrix)
  const old = trs(nd), same = (q) => !old.some((v, i) => Math.abs(v - q[i]) > (i >= 12 ? 0.01 : 2e-3));
  const fl = [undefined, 1, -1].find((k) => same(matOf(o, m0, k)) || same(matOf(o, o.m, k)));
  if (fl === null || !([undefined, 1, -1].some((k) => same(matOf(o, m0, k)) || same(matOf(o, o.m, k))))) { if (bad++ < 5) console.log('mismatch', nd.name, old.map((v) => v.toFixed(2)).join(' '), '|', matOf(o, m0).map((v) => v.toFixed(2)).join(' ')); continue; }
  delete nd.translation; delete nd.rotation; delete nd.scale; nd.matrix = matOf(o, o.m, fl).map((v) => Math.round(v * 1e5) / 1e5); done++;
}
if (bad) throw new Error(`${MAP}: ${bad} nodes out of step with the dump — rebuild the map instead`);
let js = Buffer.from(JSON.stringify(J), 'utf8'); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8); head.writeUInt32LE(js.length, 12); head.write('JSON', 16);
fs.writeFileSync(f, src.slice(0, a) + Buffer.concat([head, js, rest]).toString('base64') + src.slice(b));
console.log(f, done, 'nodes', (fs.statSync(f).size / 1048576).toFixed(1) + ' MB');
