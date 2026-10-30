// v65n An SF2 map as one GLB: the static meshes UModel exported (`-export -gltf -png <map>` → tools/out/sf2/maps/<map>/) placed by
// tools/sf2_map_dump.py's matrices (UE3 row-vector, cm, Z up → glTF column-major, m, Y up: p_gl = (x, z, −y) / 100, the axes UModel
// writes its meshes in), each mesh stored once and shared by every node that places it; materials get their diffuse sheet from
// UModel's .mat files (Diffuse=…).   node tools/sf2_map_build.mjs <map>  → tools/out/sf2/maps/<map>.glb
import fs from 'node:fs'; import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf'; import sharp from 'sharp';
const MAP = process.argv[2] || 'Alcatraz', DIR = `tools/out/sf2/maps/${MAP}`, OUT = process.argv[3] || `tools/out/sf2/maps/${MAP}.glb`;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
const files = {}; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files[f.toLowerCase()] = p; } }; walk(DIR);
const dump = JSON.parse(fs.readFileSync(`tools/out/sf2/maps/${MAP}.json`, 'utf8')), placed = dump.placed || dump;
const doc = new Document(), root = doc.getRoot(), buf = doc.createBuffer(), scene = doc.createScene(MAP), meshes = new Map(), tex = new Map(); let missing = new Set();
// v65z SF2's normal map and its strength (the MIC's normal_value, Desert Camp's walls 1.8: their stone blocks' relief)
const normalOf = (mat) => {
  const f = files[mat.toLowerCase() + '.mat']; if (!f) return null; const m = fs.readFileSync(f, 'utf8').match(/^Normal=(\S+)/m), png = m && files[m[1].toLowerCase() + '.png'];
  if (!png) return null; const pf = files[mat.toLowerCase() + '.props.txt'], pt = pf ? fs.readFileSync(pf, 'utf8') : '', s = pt.match(/ParameterValue = ([\d.]+)\s+ParameterName = normal_value/);
  return { png, scale: s ? +s[1] : 1 };
};
const withNormal = (mat, name) => { const n = normalOf(name); if (!n) return;
  if (!tex.has(n.png)) tex.set(n.png, doc.createTexture(path.basename(n.png)).setImage(fs.readFileSync(n.png)).setMimeType('image/png'));
  mat.setNormalTexture(tex.get(n.png)).setNormalScale(n.scale); };
const diffuseOf = (mat) => { // (v65v a Material whose sheet is only an 'Other[n]' — terrain_001_Mat, door_005_Mat: the first that is no normal / spec / mask)
  const f = files[mat.toLowerCase() + '.mat']; if (!f) return null; const t = fs.readFileSync(f, 'utf8'), m = t.match(/^Diffuse=(\S+)/m);
  if (m) return files[m[1].toLowerCase() + '.png'] || null;
  for (const o of t.matchAll(/^Other\[\d+\]=(\S+)/gm)) if (!/(_n|_s|_nm|normal|nomal|_mask|_spec|cube)$/i.test(o[1]) && files[o[1].toLowerCase() + '.png']) return files[o[1].toLowerCase() + '.png'];
  return null;
};
async function meshOf(name) {
  if (meshes.has(name)) return meshes.get(name);
  const f = files[name.toLowerCase() + '.gltf']; if (!f) { missing.add(name); meshes.set(name, null); return null; }
  const src = await io.read(f), map = mergeDocuments(doc, src), m = map.get(src.getRoot().listMeshes()[0]);
  for (const s of src.getRoot().listScenes()) map.get(s).dispose();
  for (const pr of m.listPrimitives()) {
    const mat = pr.getMaterial(); if (!mat || mat.getBaseColorTexture()) continue;
    const png = diffuseOf(mat.getName()); mat.setMetallicFactor(0).setRoughnessFactor(0.85); withNormal(mat, mat.getName());
    if (png && (await sharp(png).stats()).channels.length === 4) mat.setAlphaMode('MASK').setAlphaCutoff(0.4); // (v65z a sheet with alpha — decals, grass, wire mesh: cut out, not drawn black)
    if (png) { if (!tex.has(png)) tex.set(png, doc.createTexture(path.basename(png)).setImage(fs.readFileSync(png)).setMimeType('image/png')); mat.setBaseColorTexture(tex.get(png)); }
  }
  meshes.set(name, m); return m;
}
const NOFLIP = { Desertcamp: ['wood_003'], tower: ['tw_build_007'] }; // v65y meshes that face the other way about their own axis (see below)
let n = 0; const usedLm = new Set();
for (const o of placed) {
  if (!o.m) continue; const mesh = await meshOf(o.mesh); if (!mesh) continue;
  const m = o.m, L = (j, i) => m[i * 4 + j]; // column form of the row-vector matrix: L(row j, col i)
  // C = (x, z, −y): N = C·L·C⁻¹, t = C·t / 100
  const C = [[1, 0, 0], [0, 0, 1], [0, -1, 0]], A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => L(r, c)));
  const CA = C.map((row) => [0, 1, 2].map((c) => row.reduce((s, v, k) => s + v * A[k][c], 0)));
  const N = CA.map((row) => [0, 1, 2].map((c) => row.reduce((s, v, k) => s + v * C[c][k], 0))); // C⁻¹ = Cᵀ
  const t = [m[12], m[13], m[14]], tg = C.map((row) => row.reduce((s, v, k) => s + v * t[k], 0) / 100);
  // v65x UModel writes mesh vertices as (x, z, +y) (it mirrors UE's left-handed axes), not C's (x, z, −y): C·U⁻¹ = diag(1, 1, −1) on
  // the mesh's own axes, else every mesh lay mirrored about its pivot (Desert Camp: stairs outside their stairwells, hangars off)
  // v65y …except where the user's eye says otherwise (Desert Camp's wood_003 door frames sat their 0.24 m thickness inside the wall,
  // behind the corner they frame — user 10-29): those keep C's own axes
  const f = (NOFLIP[MAP] || []).includes(o.mesh) ? 1 : -1;
  const mat = [N[0][0], N[1][0], N[2][0], 0, N[0][1], N[1][1], N[2][1], 0, f * N[0][2], f * N[1][2], f * N[2][2], 0, tg[0], tg[1], tg[2], 1];
  const nd = doc.createNode(o.mesh + '_' + n++).setMesh(mesh).setMatrix(mat), ex = {}; if (o.col === false) ex.nocol = true;
  // v65z SF2's baked light on this placement (tools/sf2_lightmap.py): a SimpleLightmap rect (tex, scale, uv1 × cs + cb), or one RGB
  // irradiance per vertex in the mesh's own vertex order (primitives one after another), 0…3.2 in bytes (× 80)
  // (v65z directional: the NormalizedAverageColor / DirectionalMax sheets and scales; per vertex their raw BGRA byte pairs and scales)
  if (o.lm && o.lm.t === 2) { ex.lm = { nac: o.lm.nac, ns: o.lm.ns, max: o.lm.max, ms: o.lm.ms, cs: o.lm.cs, cb: o.lm.cb }; usedLm.add(o.lm.nac); usedLm.add(o.lm.max); }
  else if (o.lm && o.lm.t === 1) ex.lmr = { raw: o.lm.raw, ns: o.lm.ns, ms: o.lm.ms };
  if (Object.keys(ex).length) nd.setExtras(ex); // (v65v SF2 turned its collision off: grass, wires, decor)
  scene.addChild(nd);
}
// v65n the BSP floors and walls (tools/sf2_map_bsp.py): one primitive per material, UVs in texels ÷ the diffuse sheet's size
const bspFile = `tools/out/sf2/maps/${MAP}_bsp.json`;
if (fs.existsSync(bspFile)) {
  const bsp = JSON.parse(fs.readFileSync(bspFile, 'utf8')), mesh = doc.createMesh('bsp'), acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  for (const [mname, g] of Object.entries(bsp)) {
    const [base, lmTex, lmS, lmMax, lmMs] = mname.split('|'); // (v65z 'material|nac sheet|scale|max sheet|scale': one primitive per material and baked-light pair)
    const png = diffuseOf(base), mat = doc.createMaterial(base).setMetallicFactor(0).setRoughnessFactor(0.85); withNormal(mat, base);
    let W = 256, H = 256;
    if (png) { const md = await sharp(png).metadata(); W = md.width; H = md.height; if (!tex.has(png)) tex.set(png, doc.createTexture(path.basename(png)).setImage(fs.readFileSync(png)).setMimeType('image/png')); mat.setBaseColorTexture(tex.get(png)); }
    else { mat.setBaseColorFactor([0.55, 0.55, 0.55, 1]); missing.add(base); }
    const uv = new Float32Array(g.uv.length); for (let i = 0; i < uv.length; i += 2) { uv[i] = g.uv[i] / W; uv[i + 1] = g.uv[i + 1] / H; }
    const prim = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos))).setAttribute('NORMAL', acc('VEC3', new Float32Array(g.nrm))).setAttribute('TEXCOORD_0', acc('VEC2', uv));
    if (lmTex && g.uv1 && g.uv1.length) { prim.setAttribute('TEXCOORD_1', acc('VEC2', new Float32Array(g.uv1))).setExtras({ lm: { nac: lmTex, ns: lmS.split(',').map(Number), max: lmMax, ms: lmMs.split(',').map(Number) } }); usedLm.add(lmTex); usedLm.add(lmMax); }
    mesh.addPrimitive(prim);
  }
  scene.addChild(doc.createNode('bsp').setMesh(mesh));
}
// v65v SF2's blocking volumes (tools/sf2_map_dump.py 'blocks', world triangles in UE cm): collision only, never drawn
if ((dump.blocks || []).length) {
  const all = dump.blocks.flat(), P = new Float32Array(all.length);
  for (let i = 0; i < all.length; i += 3) { P[i] = all[i] / 100; P[i + 1] = all[i + 2] / 100; P[i + 2] = -all[i + 1] / 100; }
  const bm = doc.createMesh('blocking').addPrimitive(doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf)));
  scene.addChild(doc.createNode('BLOCKING').setMesh(bm).setExtras({ colOnly: true }));
}
for (const b of root.listBuffers()) if (b !== buf) { for (const a of root.listAccessors()) if (a.getBuffer() === b) a.setBuffer(buf); b.dispose(); }
await doc.transform(prune({ keepAttributes: true }), dedup(), // (v65z keep TEXCOORD_1: no glTF material reads it, the baked light does)
   textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), draco());
await io.write(OUT, doc);
// v65o the game's copy: assets/maps/sf2-<map>/map.js (window.SF2_MAPS[id] = { glb: base64, meta }, file:// friendly like the other maps)
const cv = (l) => [l[0] / 100, l[2] / 100, -l[1] / 100], id = 'sf2_' + MAP.toLowerCase(), adir = `assets/maps/sf2-${MAP.toLowerCase()}`;
const S0 = dump.starts || [], tdm = S0.filter((s) => /PlayerStart_TDM$/.test(s.cls)); // v65v the TDM starts when the map has them (FrontLine / mission starts sit elsewhere)
// v65z the SimpleLightmap sheets the map uses (UModel `-export -png <map> <SimpleLightmap_…> LightMapTexture2D` → tools/out/sf2/lm/), as JPEG
const lightmaps = {};
for (const t of usedLm) { const [pkg, nm] = t.split('/'), f = `tools/out/sf2/lm/${pkg}/LightMapTexture2D/${nm}.png`;
  if (fs.existsSync(f)) lightmaps[t] = 'data:image/jpeg;base64,' + (await sharp(f).jpeg({ quality: 92 }).toBuffer()).toString('base64'); else missing.add(t); }
// v65z the UE3 Terrain (tools/sf2_map_dump.py 'terrain'), built by the game: heights in game metres (row-major i + j·nx), each vertex's
// layer weights (alpha 0–255, RGBA = layers 0–3), its holes, each layer's diffuse (JPEG) and tiling (MappingScale quads, rotation)
const terrains = [];
for (const T0 of dump.terrains || (dump.terrain ? [dump.terrain] : [])) {
  const T = T0, H = new Float32Array(T.h.length), W = new Uint8Array(T.h.length * 4);
  T.h.forEach((h, k) => { H[k] = (T.loc[2] + (h - 32768) / 128 * T.scale[2]) / 100; });
  T.layers.forEach((L, li) => { if (li < 4 && L.alpha) L.alpha.forEach((a, k) => { W[k * 4 + li] = a; }); });
  const layers = [];
  for (const L of T.layers.slice(0, 4)) { const png = L.mat && diffuseOf(L.mat);
    layers.push({ tex: png ? 'data:image/jpeg;base64,' + (await sharp(png).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 88 }).toBuffer()).toString('base64') : null, scale: L.scale, rot: L.rot, used: !!(L.alpha && L.alpha.some((a) => a)) }); }
  terrains.push({ nx: T.nx, ny: T.ny, x0: T.loc[0] / 100, z0: T.loc[1] / 100, dx: T.scale[0] / 100, dz: T.scale[1] / 100, h: Buffer.from(H.buffer).toString('base64'), w: Buffer.from(W).toString('base64'), holes: T.holes, layers });
}
const lutPng = dump.lut && files[dump.lut.toLowerCase() + '.png']; // (v65z SF2's colour grading strip, lossless)
const meta = { lightmaps, terrains, lut: lutPng ? 'data:image/png;base64,' + fs.readFileSync(lutPng).toString('base64') : null, starts: (tdm.length ? tdm : S0).map((s) => ({ team: s.team, pos: cv(s.loc), yaw: (s.yaw / 65536) * Math.PI * 2 - Math.PI / 2 })), ladders: (dump.ladders || []).map((l) => cv(l.loc)) };
fs.mkdirSync(adir, { recursive: true });
fs.writeFileSync(`${adir}/map.js`, `/* Special Force 2's ${MAP} from the user's install — tools/sf2_map_build.mjs */
(window.SF2_MAPS || (window.SF2_MAPS = {}))['${id}'] = { meta: ${JSON.stringify(meta)}, glb: '${fs.readFileSync(OUT).toString('base64')}' };
`);
console.log('SF2MAP', MAP, n, 'nodes', meshes.size, 'meshes', 'missing', [...missing].slice(0, 8).join(' ') || '-', (fs.statSync(OUT).size / 1048576).toFixed(1) + ' MB');
