// Ship the Apex maps as script chunks so a double-clicked index.html (file://, where fetch is blocked) loads them,
// like the other Blender maps (assets/maps/*.js). Read by apexPack() in src/07u_apex.js.
//   node tools/pack-apex-js.mjs skulltown|range  # v60 triangle maps from tools/out/apex/<map>/export (compress-apex-textures.py <map> first)
// Per map: assets/maps/<dir>/pack/index.js registers the bundle layout (byte ranges of its parts), then 0.js, 1.js, …
// each hand one base64 piece of the bundle to APEX_PACK.chunk(id, i, b64). The full range's scene.gltf + scene.bin +
// textures become one GLB with the images embedded. Both GLBs get Draco geometry (glTF-Transform: names, materials, images
// and transforms stay as exported; positions 16-bit — 1.7 cm over the 1.1 km terrain shell).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

// prune first: drops what three.js never reads (COLOR_1, TEXCOORD_1, UVs of untextured materials, unused textures) —
// the 16-bit COLOR_1 aborts the encoder. Nodes, names, materials and COLOR_0 stay.
const compress = async (glb, keepAttributes = false) => { // a fresh encoder per map (keepAttributes: TEXCOORD_1 lightmap UVs)
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
  const doc = await io.readBinary(new Uint8Array(glb.buffer, glb.byteOffset, glb.length));
  if (keepAttributes) { // lightmap UVs live on the world meshes only; CAST props carry a stray second UV set (denormals that abort Draco)
    const world = new Set(doc.getRoot().listNodes().filter((n) => /^World_/.test(n.getName())).map((n) => n.getMesh()));
    for (const m of doc.getRoot().listMeshes()) if (!world.has(m)) for (const p of m.listPrimitives()) p.setAttribute('TEXCOORD_1', null);
  }
  await doc.transform(prune({ keepLeaves: true, keepIndices: true, keepSolidTextures: true, keepExtras: true, keepAttributes }), draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeGeneric: 12 }));
  const out = Buffer.from(await io.writeBinary(doc));
  console.log('  draco', (glb.length / 1e6).toFixed(1), 'MB ->', (out.length / 1e6).toFixed(1), 'MB');
  return out;
};

const CHUNK = 15 * 1024 * 1024; // raw bytes per script (a multiple of 3: every chunk is valid base64 on its own)
const glbFromGltf = (dir, file) => {
  const gltf = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (gltf.buffers.length !== 1) throw Error('single-buffer glTF expected');
  const parts = [fs.readFileSync(path.join(dir, gltf.buffers[0].uri))];
  let size = parts[0].length;
  const append = (buf) => { const pad = -size % 4 & 3; if (pad) { parts.push(Buffer.alloc(pad)); size += pad; } const at = size; parts.push(buf); size += buf.length; return at; };
  for (const img of gltf.images || []) {
    if (!img.uri) continue;
    const data = fs.readFileSync(path.join(dir, decodeURIComponent(img.uri)));
    img.mimeType = /\.jpe?g$/i.test(img.uri) ? 'image/jpeg' : /\.webp$/i.test(img.uri) ? 'image/webp' : 'image/png';
    img.bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset: append(data), byteLength: data.length }) - 1;
    delete img.uri;
  }
  const pad = -size % 4 & 3; if (pad) { parts.push(Buffer.alloc(pad)); size += pad; }
  delete gltf.buffers[0].uri; gltf.buffers[0].byteLength = size;
  let json = Buffer.from(JSON.stringify(gltf)); json = Buffer.concat([json, Buffer.alloc(-json.length % 4 & 3, 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + size, 8);
  head.writeUInt32LE(json.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8); binHead.writeUInt32LE(size, 0); binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, json, binHead, ...parts]);
};

function pack(id, dir, files) {
  const out = path.join(dir, 'pack'), ranges = {}, bufs = [];
  let size = 0;
  for (const [name, buf] of Object.entries(files)) { ranges[name] = [size, buf.length]; bufs.push(buf); size += buf.length; const pad = -size % 8 & 7; if (pad) { bufs.push(Buffer.alloc(pad)); size += pad; } }
  const all = Buffer.concat(bufs), chunks = Math.ceil(all.length / CHUNK);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.js'), `/* ${id}: built by tools/pack-apex-js.mjs */\nAPEX_PACK.layout(${JSON.stringify(id)}, ${JSON.stringify({ bytes: all.length, chunk: CHUNK, chunks, parts: ranges })});\n`);
  for (let i = 0; i < chunks; i++) fs.writeFileSync(path.join(out, i + '.js'), `APEX_PACK.chunk(${JSON.stringify(id)},${i},'${all.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64')}');\n`);
  console.log(id, { bytes: all.length, chunks, parts: Object.fromEntries(Object.entries(ranges).map(([k, [, n]]) => [k, n])) });
}

// Skull Town triangles: 'STRI' float32 from the Blender export -> 'STRQ' Int16 positions (metres × scale), Uint32 indices,
// Uint8 surfaces (read by skullTris() in src/07w_skulltown.js)
const skullTris = (buf, B, M = 12) => { // only triangles touching the play bounds (+ M m): the arena walls keep everyone inside
  const nv0 = buf.readUInt32LE(8), nt0 = buf.readUInt32LE(12), P = new Float32Array(buf.buffer.slice(buf.byteOffset + 16, buf.byteOffset + 16 + nv0 * 12));
  const io0 = 16 + nv0 * 12, I = new Uint32Array(buf.buffer.slice(buf.byteOffset + io0, buf.byteOffset + io0 + nt0 * 12)), Ms = buf.subarray(io0 + nt0 * 12, io0 + nt0 * 13);
  const inb = (v) => P[v * 3] >= B.minX - M && P[v * 3] <= B.maxX + M && P[v * 3 + 2] >= B.minZ - M && P[v * 3 + 2] <= B.maxZ + M;
  const remap = new Int32Array(nv0).fill(-1), keepPos = [], keepIdx = [], keepMat = [];
  for (let t = 0; t < nt0; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]; if (!inb(a) && !inb(b) && !inb(c)) continue;
    for (const v of [a, b, c]) { if (remap[v] < 0) { remap[v] = keepPos.length / 3; keepPos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } keepIdx.push(remap[v]); }
    keepMat.push(Ms[t]);
  }
  const nv = keepPos.length / 3, nt = keepMat.length, pos = Float32Array.from(keepPos), idx = Buffer.from(Uint32Array.from(keepIdx).buffer), mats = Buffer.from(keepMat);
  console.log('  cropped', nt0, '->', nt, 'triangles');
  const max = pos.reduce((m, v) => Math.max(m, Math.abs(v)), 0), scale = Math.min(64, Math.floor(32767 / max));
  const q = Buffer.alloc(nv * 6); for (let i = 0; i < pos.length; i++) q.writeInt16LE(Math.round(pos[i] * scale), i * 2);
  const head = Buffer.alloc(20); head.write('STRQ', 0); head.writeUInt32LE(1, 4); head.writeUInt32LE(nv, 8); head.writeUInt32LE(nt, 12); head.writeFloatLE(scale, 16);
  const pad = Buffer.alloc(-(20 + q.length) & 3);
  console.log('  triangles', nt, 'vertices', nv, 'scale', scale, '(', (1 / scale * 100).toFixed(1), 'cm )');
  return Buffer.concat([head, q, pad, idx, mats]);
};
// v62t 'STRZ' (decoded by skullTris() too): the STRQ soup welded (equal Int16 positions → one vertex, 1.6 M → 0.8 M on Skull
// Town) and re-ordered by first use; positions as per-axis deltas in two byte planes, indices as LEB128 codes against the highest
// index so far (0 = the next new vertex, k = that minus k − 1), surfaces as they were — gzipped, 10.4 MB → 2.3 MB
const strz = (buf) => {
  const nv = buf.readUInt32LE(8), nt = buf.readUInt32LE(12), scale = buf.readFloatLE(16), q = new Int16Array(buf.buffer.slice(buf.byteOffset + 20, buf.byteOffset + 20 + nv * 6));
  const io = (20 + nv * 6 + 3) & ~3, idx = new Uint32Array(buf.buffer.slice(buf.byteOffset + io, buf.byteOffset + io + nt * 12)), mats = buf.subarray(io + nt * 12, io + nt * 13);
  const weld = new Map(), first = new Int32Array(nv).fill(-1), P = [], code = [];
  let hi = -1;
  for (let i = 0; i < nt * 3; i++) {
    const v = idx[i], k = q[v * 3] + ',' + q[v * 3 + 1] + ',' + q[v * 3 + 2];
    let u = first[v] >= 0 ? first[v] : weld.get(k);
    if (u === undefined) { u = P.length / 3; weld.set(k, u); P.push(q[v * 3], q[v * 3 + 1], q[v * 3 + 2]); }
    first[v] = u;
    let z = u === hi + 1 ? 0 : hi - u + 1; if (u > hi) hi = u;
    while (z >= 0x80) { code.push((z & 0x7f) | 0x80); z >>>= 7; } code.push(z);
  }
  const nu = P.length / 3, pos = Buffer.alloc(nu * 6);
  for (let c = 0; c < 3; c++) { let pv = 0; for (let v = 0; v < nu; v++) { const x = P[v * 3 + c], d = (x - pv) & 0xffff; pv = x; pos[c * nu * 2 + v] = d & 0xff; pos[c * nu * 2 + nu + v] = d >> 8; } }
  const head = Buffer.alloc(24); head.write('STRZ', 0); head.writeUInt32LE(1, 4); head.writeUInt32LE(nu, 8); head.writeUInt32LE(nt, 12); head.writeFloatLE(scale, 16); head.writeUInt32LE(code.length, 20);
  console.log('  STRZ: vertices', nv, '->', nu, '· index stream', code.length, 'bytes');
  return Buffer.concat([head, pos, Buffer.from(code), Buffer.from(mats)]);
};
const DOOR = 'tools/out/apex/door/door.glb'; // Apex's door leaf (tools/blender/apex_door.py), both full maps
const TRI = { skulltown: ['apex_skulltown', 'assets/maps/apex-skulltown'], range: ['apex_full', 'assets/maps/apex-range'] }; // tools/blender/apex_maps.py names
if (TRI[process.argv[2]]) {
  const [ID, D] = TRI[process.argv[2]], X = `tools/out/apex/${process.argv[2]}/export`;
  fs.mkdirSync(D, { recursive: true });
  pack(ID, D, {
    glb: await compress(glbFromGltf(X, 'scene.gltf'), true),
    collision: zlib.gzipSync(strz(skullTris(fs.readFileSync(path.join(X, 'collision.bin')), JSON.parse(fs.readFileSync(path.join(X, 'manifest.json'))).playBounds)), { level: 9 }), // (apexGunzip in the game; v62t STRZ)
    manifest: fs.readFileSync(path.join(X, 'manifest.json')),
    lm_inner: fs.readFileSync(path.join(X, 'lm_inner.jpg')),
    lm_outer: fs.readFileSync(path.join(X, 'lm_outer.jpg')),
    door: fs.readFileSync(DOOR),
    ...(fs.existsSync(D + '/nav.bin') ? { nav: fs.readFileSync(D + '/nav.bin'), navMeta: fs.readFileSync(D + '/nav.json') } : {}), // tools/bake-apex-nav.mjs <map id>
  });
} else console.log('usage: node tools/pack-apex-js.mjs skulltown|range')
