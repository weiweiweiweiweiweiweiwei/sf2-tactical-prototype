// v62 SF2's own first-person rig: the gun parts, sleeves and gloves skinned to one Bip01 skeleton plus the animset's clips
// (Equip, Idle, Fire, Zoom, ZoomFire, Reload, dash …) → tools/guns/<id>_sf2_rig.glb (packed by tools/guns/pack.mjs).
//   node tools/sf2_rig_build.mjs [m4a1|ak103|g36c]
// Input (UModel, see docs/pipelines/guns.md): tools/out/sf2/<id>/ (-export -gltf -png of the gun), tools/out/sf2/<id>_anim/ (-export
// -psk: the .psa animset) and tools/out/sf2/arms/ (com_1starm_b01 / com_1stglove_b01 from c_comm_skelet, their textures).
// No Blender: the parts already share the bind pose of the gun's skeleton (UModel glTF: metres, Y up), so their skins are joined
// node for node and the PSA keys are written on those same nodes. PSA → these nodes: position (x, z, −y) / 100; rotation with
// the axes swapped the same way, conjugated on every bone but the root (ActorX keeps child rotations inverted).
// Sights: the M4A1's front / rear sights are placed on the rails (fitted to the user's SF2 ADS screenshot, v62f); other guns'
// sight meshes go on their own SF2 socket (the body's .props.txt from `-export -psk`: the part's root bone onto the socket,
// v62h), and an AK's iron sights are part of its body. All riveted to weapon_root. The muzzle is the 'flame' socket.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, textureCompress, prune, dedup, resample } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import fs from 'node:fs';

const GID = process.argv[2] || 'm4a1', SRC = 'tools/out/sf2/', OUT = `tools/guns/${GID}_sf2_rig.glb`;
// one gun: its four parts <pkg>/<stem>_<part> (UModel `-export -gltf -png <pkg>` → <id>/, `-export -psk <pkg>` → <id>_anim/: the
// animset and the body's .props.txt with the sockets); textures <tex>_<part>_d / _n found by file name anywhere under <id>/
const ARMS = [['sleeve', 'arms/c_comm_skelet/SkeletalMesh3/com_1starm_b01.gltf', 'sleeve'], ['glove', 'arms/c_comm_skelet/SkeletalMesh3/com_1stglove_b01.gltf', 'glove']];
const gun = (id, o = {}) => {
  const pkg = o.pkg || `rif_${id}`, stem = o.stem || pkg, tex = o.tex || id, mesh = `${id}/${pkg}/SkeletalMesh3/${stem}_`;
  return Object.assign({
    base: `${mesh}body.gltf`, props: `${id}_anim/${pkg}/SkeletalMesh3/${stem}_body.props.txt`,
    parts: [...['body', 'barrel', 'stock', 'magazine'].map((k) => [k, `${mesh}${k}.gltf`, `${tex}_${k}`]), ...ARMS],
    psa: `${id}_anim/${pkg}/AnimSet/${o.anim || '1st_anim_' + id}.psa`, socketSights: [],
  }, o);
};
// SightOnMesh on the class's SightBaseSocketName ('Sight'): [name, gltf, texture stem, socket]
const sight = (file, tex) => [['sight', file, tex, 'Sight']];
const G = {
  m4a1: gun('m4a1', { railSights: { sight: ['m4a1/rif_m4a1_sight/SkeletalMesh3/rif_m4a1_sight_up.gltf', 'm4a1_sight'], rear: ['m4a1/weapon_common_part01/SkeletalMesh3/rif_m4a1_rearsight.gltf', 'm4a1_rearsight'] } }),
  ak103: gun('ak103'), // iron sights on the body
  g36c: gun('g36c', { hoodedPost: true, socketSights: sight('g36c/rif_g36c/SkeletalMesh3/rif_g36c_sight_up.gltf', 'g36c_frontsight') }),
  // v62i the rifle batch
  m16a3: gun('m16a3', { socketSights: sight('m16a3/rif_m16a3/SkeletalMesh3/rif_m16a3_sight_up.gltf', 'm16a3_sight') }),
  k2: gun('k2', { hoodedPost: true, pkg: 'rif_K2', stem: 'rif_k2', anim: '1st_anim_K2' }), // (no SightOnMesh: its sights are on the body)
  scarl: gun('scarl', { hoodedPost: true, pkg: 'rif_scar_L', tex: 'scar_L', anim: '1st_anim_scar_L', socketSights: sight('scarl/rif_scar-h_sight/SkeletalMesh3/rif_scar-h_sight_up.gltf', 'scar-h_sight') }),
  scarh: gun('scarh', { hoodedPost: true, pkg: 'rif_scar-h', tex: 'scar-h', anim: '1st_anim_scar-h', socketSights: sight('scarh/rif_scar-h_sight/SkeletalMesh3/rif_scar-h_sight_up.gltf', 'scar-h_sight') }),
  famas: gun('famas'), // carry-handle sights on the body
  xm8: gun('xm8', { socketSights: sight('xm8/rif_xm8/SkeletalMesh3/rif_xm8_sight_up.gltf', 'xm8_sight') }),
  galil: gun('galil', { hoodedPost: true, socketSights: sight('galil/rif_galil_sight/SkeletalMesh3/rif_galil_sight_up.gltf', 'galil_barrel_frontsight') }),
  hk417: gun('hk417', { socketSights: sight('hk417/rif_hk417_sight/SkeletalMesh3/rif_hk417_sight_up.gltf', 'hk417_sight') }),
  qbz97: gun('qbz97', { hoodedPost: true }), // carry-handle sights on the body
}[GID];
if (!G) throw new Error(`unknown gun ${GID}`);
const TEX = {
  m4a1_sight: ['m4a1/rif_m4a1_sight/Texture2D/m4a1_sight'], m4a1_rearsight: ['m4a1/weapon_common_part01/Texture2D/m4a1_rearsight'],
  sleeve: ['arms/c_delta_1st_texture/Texture2D/delm_1st_b01', 'arms/c_comm_1st_texture/Texture2D/com_1st_b01'], // the Delta Force sleeve colour, the common sleeve's normals
  glove: ['arms/c_comm_1sthand_texture/Texture2D/com_1st_glove_b01'],
};
const PNG = {}; // every exported texture of this gun by file name
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const q = `${d}/${f.name}`; if (f.isDirectory()) walk(q); else if (f.name.endsWith('.png')) PNG[f.name.toLowerCase()] ??= q.slice(SRC.length, -4).replace(/_[dns]$/, ''); } })(SRC + GID);
const texDirs = (stem) => TEX[stem] || [PNG[`${stem}_d.png`.toLowerCase()] || `${GID}/missing/${stem}`];
const ROUGH = { barrel: 0.78, stock: 0.8, magazine: 0.72, sight: 0.66, body: 0.68, sleeve: 0.9, glove: 0.82 }; // matte, dielectric (as sf2_gun_build.py)
const PEEP_DROP = 0.0048, PEEP_DX = 0.0007; // the rear sight's aperture under its top / off its top's mean x (tuned on ADS shots, v61b)
// v62f the flip-up front sight sits this far behind the rail's front end (its socket is not exported): measured on the user's SF2 ADS
// screenshot (10-27) — with the peep ring matched (267 px at 1080p), the front sight's ears were 73 px there and 59 px here, i.e.
// SF2's post is 21.6 cm ahead of the peep, not 28.2
const SIGHT_BACK = 0.086;
// and its green dot where SF2's is (958.8, 544.4 at 1080p: 4.4 px under the screen centre): 1.4 mm lower, 0.3 mm to the left (+X)
const POST_DROP = 0.0014, POST_DX = 0.0003;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(SRC + G.base), root = doc.getRoot(), buf = root.listBuffers()[0];
const skin = root.listSkins()[0], joints = skin.listJoints(), jix = Object.fromEntries(joints.map((j, i) => [j.getName(), i]));
const meshNode0 = root.listNodes().find((n) => n.getMesh()), scene = root.listScenes()[0];

// ---- small maths (column-major 4×4 like glTF)
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const xf = (m, v, w = 1) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * w);
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

async function material(stem) {
  const key = Object.keys(ROUGH).find((k) => stem.includes(k)), m = doc.createMaterial(`gun:tex_${stem}`).setMetallicFactor(0).setRoughnessFactor(ROUGH[key] ?? 0.75).setDoubleSided(true);
  const dirs = texDirs(stem), find = (kind) => dirs.map((d) => `${SRC}${d}_${kind}.png`).find((p) => fs.existsSync(p));
  const d = find('d'), n = find('n');
  if (!d) console.warn('NOTEX', GID, stem, 'no diffuse texture');
  if (d) m.setBaseColorTexture(doc.createTexture(stem + '_d').setImage(await sharp(d).removeAlpha().png().toBuffer()).setMimeType('image/png')); // (the alpha is a spec mask: opaque here, and it doubled the WebP)
  if (n) m.setNormalTexture(doc.createTexture(stem + '_n').setImage(fs.readFileSync(n)).setMimeType('image/png'));
  return m;
}

// one part's primitives copied into the base document: joints renamed onto the base skin; `bake` instead rivets every vertex to
// one bone after a transform (positions in the base's bind space)
async function addPart(name, file, stem, bake = null) {
  const pd = await io.read(SRC + file), pr = pd.getRoot(), pskin = pr.listSkins()[0], pj = pskin.listJoints(), remap = pj.map((j) => jix[j.getName()]);
  if (remap.some((i) => i === undefined) && !bake) throw new Error(`${name}: bone missing in the base skeleton`);
  const mesh = doc.createMesh(name), mat = await material(stem), out = [];
  // v62i each part keeps its OWN bind pose (as UE3 does: the bones are shared, each mesh its own reference pose): its own skin over
  // the body's joints with its inverse-bind matrices (the body's for bones it lacks). AK-103 / SCAR stocks have weapon_stock
  // turned 90° against the body's, the G36C's arms a whole other bind — read through the body's, the stock swung a metre off.
  let partSkin = skin;
  if (!bake) {
    const pibm = pskin.getInverseBindMatrices().getArray(), bibm = skin.getInverseBindMatrices().getArray(), byName = Object.fromEntries(pj.map((j, k) => [j.getName(), k]));
    const ib = new Float32Array(joints.length * 16); let differs = false;
    joints.forEach((j, i) => { const k = byName[j.getName()], m = k === undefined ? bibm.slice(i * 16, i * 16 + 16) : pibm.slice(k * 16, k * 16 + 16); ib.set(m, i * 16); if (k !== undefined && m.some((x, c) => Math.abs(x - bibm[i * 16 + c]) > 1e-4)) differs = true; });
    if (differs) { partSkin = doc.createSkin(name + '_skin').setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ib).setBuffer(buf)); joints.forEach((j) => partSkin.addJoint(j)); console.log('OWNBIND', GID, name); }
  }
  for (const p of pr.listMeshes()[0].listPrimitives()) {
    const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), T = p.getAttribute('TANGENT'), UV = p.getAttribute('TEXCOORD_0'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), n = P.getCount();
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), tan = T ? new Float32Array(n * 4) : null, jo = new Uint16Array(n * 4), we = new Float32Array(n * 4), e = [], f = [];
    for (let i = 0; i < n; i++) {
      P.getElement(i, e); let v = e.slice(0, 3); N.getElement(i, f); let nn = f.slice(0, 3); let tt = null; if (T) { T.getElement(i, f); tt = f.slice(0, 4); }
      if (bake) { v = bake.p(v, i); nn = bake.n(nn); if (tt) tt = [...bake.n(tt.slice(0, 3)), tt[3]]; jo.set([jix.weapon_root, 0, 0, 0], i * 4); we.set([1, 0, 0, 0], i * 4); }
      else {
        J.getElement(i, e); jo.set(e.map((j) => remap[j] ?? 0), i * 4); W.getElement(i, e); we.set(e, i * 4);
      }
      pos.set(v, i * 3); nor.set(norm(nn), i * 3); if (tan) tan.set(tt, i * 4);
    }
    const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    const prim = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', new Uint32Array(p.getIndices().getArray())))
      .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(UV.getArray())))
      .setAttribute('JOINTS_0', acc('VEC4', jo)).setAttribute('WEIGHTS_0', acc('VEC4', we));
    if (tan) prim.setAttribute('TANGENT', acc('VEC4', tan));
    mesh.addPrimitive(prim); out.push(pos);
  }
  scene.addChild(doc.createNode(name).setMesh(mesh).setSkin(partSkin));
  return out.flatMap((a) => Array.from({ length: a.length / 3 }, (_, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]));
}

// the bind-space vertices of a socketed part (its own one-bone skin at rest), before placing
async function bakedPoints(file) {
  const pd = await io.read(SRC + file), pr = pd.getRoot(), sk = pr.listSkins()[0], j = sk.listJoints()[0], ibm = Array.from(sk.getInverseBindMatrices().getArray()).slice(0, 16);
  const M = mul(j.getWorldMatrix(), ibm), pts = [];
  for (const p of pr.listMeshes()[0].listPrimitives()) { const P = p.getAttribute('POSITION'), e = []; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); pts.push(xf(M, e)); } }
  return { M, pts };
}

const V = {};
for (const [name, file, stem] of G.parts) V[name] = await addPart(name, file, stem);
for (const c of meshNode0.listChildren()) { meshNode0.removeChild(c); scene.addChild(c); } // the skeleton (Bip01) to the scene root
meshNode0.dispose(); // the body was re-added as 'body' with its own material
const min = (a, k) => Math.min(...a.map((p) => p[k])), max = (a, k) => Math.max(...a.map((p) => p[k])), mean = (a, k) => a.reduce((s, p) => s + p[k], 0) / a.length;
// SF2's sockets on the body (SocketName, BoneName, RelativeLocation in cm); a bone-local UE vector maps to these nodes like a
// PSA key, (x, z, −y) / 100
const SOCK = {};
for (const m of fs.readFileSync(SRC + G.props, 'utf8').matchAll(/SocketName = (\S+)\s+BoneName = (\S+)\s+RelativeLocation = \{ X=([-\d.e]+), Y=([-\d.e]+), Z=([-\d.e]+) \}/g))
  SOCK[m[1]] = { bone: m[2], p: [+m[3] / 100, +m[5] / 100, -m[4] / 100] };
const sockAt = (name) => { const k = SOCK[name], b = joints[jix[k.bone]]; return mul(b.getWorldMatrix(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, k.p[0], k.p[1], k.p[2], 1]); };
const bore = sockAt('flame').slice(12, 15); // the muzzle
const rot3 = (M, f) => (v) => { const w = xf(M, v, 0); return [w[0] * f, w[1], w[2] * f]; };
const marks = { MUZZLE: bore };
for (const [name, file, stem, socket] of G.socketSights) { // the part's own root bone onto the socket
  const pd = await io.read(SRC + file), sk = pd.getRoot().listSkins()[0], ibm = Array.from(sk.getInverseBindMatrices().getArray()).slice(0, 16), M = mul(sockAt(socket), ibm);
  V[name] = await addPart(name, file, stem, { p: (v) => xf(M, v), n: rot3(M, 1) });
}
if (!G.railSights) { // POST: the front sight's tip — the highest point on the bore's centre line (±1.2 mm: not the ears) in the front 25 cm
  const pts = [V.barrel, V.body, ...G.socketSights.map(([n]) => V[n])].flat().filter((p) => Math.abs(p[0] - bore[0]) < 0.0012 && p[2] > bore[2] - 0.25).sort((a, b) => b[1] - a[1]);
  let i = 0;
  if (G.hoodedPost) { // a ring hood over the post (G36C): its top is on the centre line too — step down through the ring, over the hole
    while (i + 1 < pts.length && pts[i][1] - pts[i + 1][1] < 0.0025) i++; // (G36C: hood 1207.8 → 1205.8 mm, a 6.6 mm hole, the tip at 1199.2)
    i++;
  }
  marks.POST = pts[i];
}
if (G.railSights) {
  const { sight: SG, rear: RG } = G.railSights;
  // rear sight: peep end to the rear (−Z), standing on the receiver's top rail at its rear end
  const R = await bakedPoints(RG[0]); let rp = R.pts, flip = 1;
  if (rp.reduce((a, p) => (p[1] > a[1] ? p : a))[2] > mean(rp, 2)) flip = -1; // turned 180° about Y
  rp = rp.map((p) => [p[0] * flip, p[1], p[2] * flip]);
  const rtop = max(V.body, 1), rz = min(V.body.filter((p) => p[1] > rtop - 0.004), 2);
  const rc = [(min(rp, 0) + max(rp, 0)) / 2, min(rp, 1), min(rp, 2)], rOff = [bore[0] - rc[0], rtop - rc[1], rz - rc[2]];
  rp = rp.map((p) => [p[0] + rOff[0], p[1] + rOff[1], p[2] + rOff[2]]);
  const top = max(rp, 1), tp = rp.filter((p) => p[1] > top - 0.002), peepx = mean(tp, 0) + PEEP_DX, aperture = top - PEEP_DROP, peepZ = min(rp, 2);
  await addPart('rearsight', RG[0], RG[1], { p: (v) => { const w = xf(R.M, v); return [w[0] * flip + rOff[0], w[1] + rOff[1], w[2] * flip + rOff[2]]; }, n: rot3(R.M, flip) });
  // front sight: on the handguard's top rail, its post tip on the sight line through the peep
  const S = await bakedPoints(SG[0]); let sp = S.pts;
  const railp = V.barrel.filter((p) => p[1] > bore[1] + 0.012), rzmax = max(railp, 2), ry = max(railp.filter((p) => p[2] > rzmax - 0.03), 1);
  const sc = [mean(sp, 0), min(sp, 1), mean(sp, 2)]; let sOff = [bore[0] - sc[0], ry - sc[1], rzmax - SIGHT_BACK - sc[2]];
  sp = sp.map((p) => [p[0] + sOff[0], p[1] + sOff[1], p[2] + sOff[2]]);
  sOff = [sOff[0] + peepx - (min(sp, 0) + max(sp, 0)) / 2 + POST_DX, sOff[1] + aperture - (max(sp, 1) - 0.004) - POST_DROP, sOff[2]];
  await addPart('frontsight', SG[0], SG[1], { p: (v) => { const w = xf(S.M, v); return [w[0] + sOff[0], w[1] + sOff[1], w[2] + sOff[2]]; }, n: rot3(S.M, 1) });
  Object.assign(marks, { SIGHT: [peepx, aperture, peepZ], POST: [peepx, aperture, rzmax - SIGHT_BACK] });
}

// marks on weapon_root (bind space → that bone's space): the muzzle, and for railed sights the peep (SIGHT) and post tip (POST);
// the game reads them as empties under the bone
const wr = joints[jix.weapon_root], wrInv = Array.from(skin.getInverseBindMatrices().getArray()).slice(jix.weapon_root * 16, jix.weapon_root * 16 + 16);
for (const [k, p] of Object.entries(marks)) wr.addChild(doc.createNode(k).setTranslation(xf(wrInv, p)));

// ---- the animset
// ActorX PSA: BONENAMES (names only from UModel), ANIMINFO (name, rate, first frame, frames), ANIMKEYS (per frame, per bone: p, q)
function readPSA(file) {
  const b = fs.readFileSync(file), out = { bones: [], anims: [] }, keys = [], str = (s, n) => b.toString('latin1', s, s + n).replace(/\0.*$/s, '');
  for (let o = 0; o + 32 <= b.length;) {
    const id = str(o, 20), size = b.readInt32LE(o + 24), count = b.readInt32LE(o + 28); o += 32;
    for (let i = 0, s = o; i < count; i++, s += size) {
      if (id === 'BONENAMES') out.bones.push({ name: str(s, 64) });
      else if (id === 'ANIMINFO') out.anims.push({ name: str(s, 64), rate: b.readFloatLE(s + 152), first: b.readInt32LE(s + 160), frames: b.readInt32LE(s + 164) });
      else if (id === 'ANIMKEYS') keys.push({ p: [0, 1, 2].map((k) => b.readFloatLE(s + 4 * k)), q: [3, 4, 5, 6].map((k) => b.readFloatLE(s + 4 * k)) });
    }
    o += size * count;
  }
  const nb = out.bones.length;
  for (const a of out.anims) a.keys = Array.from({ length: a.frames }, (_, f) => keys.slice((a.first + f) * nb, (a.first + f + 1) * nb));
  return out;
}
const psa = readPSA(SRC + G.psa), names = psa.bones.map((b) => b.name);
const toT = (p) => [p[0] / 100, p[2] / 100, -p[1] / 100], toR = (q, rootBone) => (rootBone ? [q[0], q[2], -q[1], q[3]] : [-q[0], -q[2], q[1], q[3]]);
let channels = 0;
for (const a of psa.anims) {
  if (a.name === 'Reload00') continue; // the same as Reload
  const anim = doc.createAnimation(a.name), times = new Float32Array(a.frames).map((_, f) => f / a.rate), input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buf);
  names.forEach((bn, b) => {
    const node = joints[jix[bn]]; if (!node) return;
    const T = a.keys.map((k) => toT(k[b].p)), Q = a.keys.map((k) => norm(toR(k[b].q, b === 0)));
    const t0 = node.getTranslation(), q0 = node.getRotation(), dq = (q) => 1 - Math.abs(q[0] * q0[0] + q[1] * q0[1] + q[2] * q0[2] + q[3] * q0[3]);
    const channel = (path, type, vals) => {
      const smp = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType(type).setArray(new Float32Array(vals.flat())).setBuffer(buf));
      anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(smp)); channels++;
    };
    if (T.some((t) => Math.hypot(t[0] - t0[0], t[1] - t0[1], t[2] - t0[2]) > 1e-5)) channel('translation', 'VEC3', T);
    if (Q.some((q) => dq(q) > 1e-7)) {
      for (let i = 1; i < Q.length; i++) if (Q[i].reduce((s, x, k) => s + x * Q[i - 1][k], 0) < 0) Q[i] = Q[i].map((x) => -x); // shortest path between keys
      channel('rotation', 'VEC4', Q);
    }
  });
}
for (const m of root.listMaterials()) if (!m.getName().startsWith('gun:')) m.dispose();
await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), draco({ method: 'edgebreaker' }));
await io.write(OUT, doc);
console.log('SF2RIG', GID, OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB', 'clips', root.listAnimations().map((a) => a.getName()).join(' '), 'channels', channels,
  'marks', Object.fromEntries(Object.entries(marks).map(([k, p]) => [k, p.map((x) => +x.toFixed(4))])));
