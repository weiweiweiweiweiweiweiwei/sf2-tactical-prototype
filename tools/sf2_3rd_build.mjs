// v62z (loop H3) a SF2 gun's THIRD-PERSON model (what other players hold): its *_3rd parts from the user's install (UModel
// `-export -gltf -png rif_<id>`; the sockets from `-export -psk`) joined into one static GLB → tools/guns/<id>_3rd.glb.
//   node tools/sf2_3rd_build.mjs [m4a1]
// The _3rd parts share one 4-bone skeleton (b_weapon_root …) and its bind pose, so their vertices are used as they are (UModel
// glTF: metres, Y up, the muzzle along +X). Materials 'gun:tex_<stem>' carry the parts' own _d / _n sheets (the 1st-person ones:
// SF2 ships no separate 3rd-person textures for these). Empties MUZZLE / SCOPE / GRIP / STOCK mark the body's sockets
// (bone-local UE cm → (x, z, −y) / 100 on b_weapon_root's bind matrix), for whoever puts it in a soldier's hand.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import fs from 'node:fs';

const GID = process.argv[2] || 'm4a1', SRC = 'tools/out/sf2/', OUT = `tools/guns/${GID}_3rd.glb`;
const G = {
  m4a1: { dir: 'm4a1/rif_m4a1/SkeletalMesh3/rif_m4a1_', props: 'm4a1_anim/rif_m4a1/SkeletalMesh3/rif_m4a1_body_3rd.props.txt', tex: 'm4a1/rif_m4a1_texture/Texture2D/m4a1_',
    parts: ['body', 'barrel', 'stock', 'magazine'] },
}[GID];
if (!G) throw new Error(`unknown gun ${GID}`);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = new (await import('@gltf-transform/core')).Document(), root = doc.getRoot(), buf = doc.createBuffer(), scene = doc.createScene(GID + '_3rd');
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const xf = (M, v) => [0, 1, 2].map((r) => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r]);
let rootBind = null;
for (const part of G.parts) {
  const pd = await io.read(`${SRC}${G.dir}${part}_3rd.gltf`), pr = pd.getRoot(), sk = pr.listSkins()[0];
  if (!rootBind) { const j = sk.listJoints().find((n) => n.getName() === 'b_weapon_root'); rootBind = j.getWorldMatrix(); }
  const mat = doc.createMaterial(`gun:tex_${GID}_${part}`).setMetallicFactor(0).setRoughnessFactor(0.72).setDoubleSided(true);
  const d = `${SRC}${G.tex}${part}_d.png`, n = `${SRC}${G.tex}${part}_n.png`;
  if (fs.existsSync(d)) mat.setBaseColorTexture(doc.createTexture(part + '_d').setImage(await sharp(d).removeAlpha().resize(512, 512).webp({ quality: 85 }).toBuffer()).setMimeType('image/webp'));
  if (fs.existsSync(n)) mat.setNormalTexture(doc.createTexture(part + '_n').setImage(await sharp(n).resize(512, 512).webp({ quality: 85 }).toBuffer()).setMimeType('image/webp'));
  const mesh = doc.createMesh(part);
  for (const p of pr.listMeshes()[0].listPrimitives()) {
    const acc = (type, a) => doc.createAccessor().setType(type).setArray(a).setBuffer(buf);
    const q = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', new Uint32Array(p.getIndices().getArray())))
      .setAttribute('POSITION', acc('VEC3', new Float32Array(p.getAttribute('POSITION').getArray()))).setAttribute('NORMAL', acc('VEC3', new Float32Array(p.getAttribute('NORMAL').getArray())))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(p.getAttribute('TEXCOORD_0').getArray())));
    mesh.addPrimitive(q);
  }
  scene.addChild(doc.createNode(part).setMesh(mesh));
}
const sock = {}; // SocketName → bind-space point
for (const m of fs.readFileSync(SRC + G.props, 'utf8').matchAll(/SocketName = (\S+)\s+BoneName = (\S+)\s+RelativeLocation = \{ X=([-\d.e]+), Y=([-\d.e]+), Z=([-\d.e]+) \}/g))
  sock[m[1]] = xf(rootBind, [+m[3] / 100, +m[5] / 100, -m[4] / 100]);
const marks = { MUZZLE: sock.flame, SCOPE: sock.Scope, GRIP: sock.Grip, STOCK: sock.stock };
for (const [k, p] of Object.entries(marks)) if (p) scene.addChild(doc.createNode(k).setTranslation(p));
await doc.transform(prune({ keepLeaves: true }), dedup(), draco({ quantizePosition: 14 }));
fs.writeFileSync(OUT, await io.writeBinary(doc));
console.log('SF2_3RD', GID, OUT, (fs.statSync(OUT).size / 1024).toFixed(0), 'KB', Object.fromEntries(Object.entries(marks).map(([k, p]) => [k, p && p.map((x) => +x.toFixed(3))])));
