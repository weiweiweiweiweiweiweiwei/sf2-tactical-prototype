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
    dir: id, base: `${mesh}body.gltf`, props: `${id}_anim/${pkg}/SkeletalMesh3/${stem}_body.props.txt`,
    parts: [...(o.partNames || ['body', 'barrel', 'stock', 'magazine']).map((k) => [k, `${mesh}${k}.gltf`, `${tex}_${k}`]), ...ARMS], // (v64t o.partNames: the M40A1 has no stock part)
    psa: `${id}_anim/${pkg}/AnimSet/${o.anim || '1st_anim_' + id}.psa`, socketSights: [],
  }, o);
};
// SightOnMesh on the class's SightBaseSocketName ('Sight'): [name, gltf, texture stem, socket]
const sight = (file, tex) => [['sight', file, tex, 'Sight']];
// v64 attachments (weapon_common_part / weapon_common_part01, UModel -export -gltf -png and -export -psk for the .props.txt with
// their sockets → tools/out/sf2/parts/, parts_props/): an optic on the body's 'Scope' socket, its 'ZoomCrosshair' socket is the aim
// point (the DOT mark, SF2's reticle quad from dot_point there); a silencer on 'Silencer', its own 'flame' socket the new muzzle
const PART = (pkg, name) => ({ file: `parts/${pkg}/SkeletalMesh3/${name}.gltf`, props: `parts_props/${pkg}/SkeletalMesh3/${name}.props.txt` });
const EOTECH = { ...PART('weapon_common_part', 'DOT_EOTECH'), tex: 'eotech', reticle: 'parts/dot_point/Texture2D/eotech_reticleDot.png' };
const REFLEX = { ...PART('weapon_common_part01', 'DOT_REFLEX'), tex: 'reflex', reticle: 'parts/dot_point/Texture2D/reflex_reticleDot.png' };
// v64b the K14's scope (user 10-28: the K14 had none): scope_k14_bender — its UVs fit the K14 skins' scope sheets, sni_k14 redirects
// to its bender_scope_* textures; no ZoomCrosshair socket (a sniper aims through the full-screen scope, so no DOT mark)
// roll: read through its own bind it lies a quarter turn about the bore (the elevation turret on the left — the user's SF2 K14
// shots have it on top), so it is turned about the socket's forward axis (UE x) before placing
const K14_SCOPE = { ...PART('weapon_common_part01', 'scope_k14_bender'), tex: 'bender_scope', noAim: true, roll: +(process.env.ROLL ?? 90) };
// v64s the TRG-41's scope (SFCItem_TRG -> SFCItem_Common_Scope_Zeiess: ScopeMesh scope_zeiess, SightType 18, reticle
// common_sight.ScopeView_Reticle_03); its root bind matches the Bender's but its mesh is modelled upright (v64u)
const ZEISS_SCOPE = { ...PART('weapon_common_part01', 'scope_zeiess'), tex: 'zeiss', noAim: true, roll: +(process.env.ROLL ?? 0) }; // v64u no turn: the same root bind as the Bender's, yet read as it is it already stands (elevation turret up, the big knob left, rings down — the user's 10-28 shot of +90: turrets above and below)
// v64t the bolt guns' own scopes (weapon_common_part; SFCItem_<gun>_Def_Scope / Cz700_Def_Scope): root binds as the Bender's
const SCOPE = (name, tex) => ({ ...PART('weapon_common_part', name), tex, noAim: true, roll: +(process.env.ROLL ?? 90) });
const SIL = (k) => ({ ...PART('weapon_common_part', `silencer_ar_type_${k}`), tex: `silencer_type_${k}` });
const G = {
  // v62o the rear sight is the A2 carry handle (rif_m4a1_handle_a, its own sheet handle_d / _n in weapon_common_part): SF2's ADS picture (user 10-27) has the aperture ring standing above the handle's ears; the detachable
  // rif_m4a1_rearsight (weapon_common_part01) used since v61b is an attachment, its ring sat level with its guards
  m4a1: gun('m4a1', { extraParts: [['handle', 'm4a1/rif_m4a1/SkeletalMesh3/rif_m4a1_handle_a.gltf', 'm4a1_handle']], railSights: { sight: ['m4a1/rif_m4a1_sight/SkeletalMesh3/rif_m4a1_sight_up.gltf', 'm4a1_sight'], rear: 'handle' } }),
  ak103: gun('ak103'), // iron sights on the body
  g36c: gun('g36c', { hoodedPost: true, socketSights: sight('g36c/rif_g36c/SkeletalMesh3/rif_g36c_sight_up.gltf', 'g36c_frontsight') }),
  // v62i the rifle batch
  // v62z (loop H3) SF2's M16A3 class mounts only a low flip-up front sight (rif_m16a3_sight_up, 1.9 cm tall) and no rear sight;
  // every rear sight's peep stands 33 mm over that post. It takes the M4A1's set: its carry handle (the same AR-15 upper, the handle_d
  // sheet; its own bind pose, brought into the M16A3's by toBody) and the A2 front sight on the line — a real M16A3's
  m16a3: gun('m16a3', { extraParts: [['handle', 'm4a1/rif_m4a1/SkeletalMesh3/rif_m4a1_handle_a.gltf', 'm4a1_handle']],
    railSights: { sight: ['m4a1/rif_m4a1_sight/SkeletalMesh3/rif_m4a1_sight_up.gltf', 'm4a1_sight'], rear: 'handle' } }),
  k2: gun('k2', { hoodedPost: true, pkg: 'rif_K2', stem: 'rif_k2', anim: '1st_anim_K2' }), // (no SightOnMesh: its sights are on the body)
  scarl: gun('scarl', { hoodedPost: true, pkg: 'rif_scar_L', tex: 'scar_L', anim: '1st_anim_scar_L', socketSights: sight('scarl/rif_scar-h_sight/SkeletalMesh3/rif_scar-h_sight_up.gltf', 'scar-h_sight') }),
  scarh: gun('scarh', { hoodedPost: true, pkg: 'rif_scar-h', tex: 'scar-h', anim: '1st_anim_scar-h', socketSights: sight('scarh/rif_scar-h_sight/SkeletalMesh3/rif_scar-h_sight_up.gltf', 'scar-h_sight') }),
  famas: gun('famas'), // carry-handle sights on the body
  xm8: gun('xm8', { socketSights: sight('xm8/rif_xm8/SkeletalMesh3/rif_xm8_sight_up.gltf', 'xm8_sight') }),
  galil: gun('galil', { hoodedPost: true, socketSights: sight('galil/rif_galil_sight/SkeletalMesh3/rif_galil_sight_up.gltf', 'galil_barrel_frontsight') }),
  hk417: gun('hk417', { socketSights: sight('hk417/rif_hk417_sight/SkeletalMesh3/rif_hk417_sight_up.gltf', 'hk417_sight') }),
  // v62z (loop H3) the QBZ-97's sights are on its carry handle (part of the body): the rear aperture's hole (an 8 mm gap on the centre
  // line at z 0.205 at first; set on white-background ADS shots: 1.1883 — across, −0.1055…−0.0974 → −0.1015) and the post tip (z 0.36, 1.1483) measured on the body's bind-space mesh
  // (tools/out/_qbzrear.mjs) — the POST search had stopped on the barrel and put the eye under the ring
  qbz97: gun('qbz97', { hoodedPost: true, sightMarks: { SIGHT: [-0.1015, 1.1883, 0.205], POST: [-0.1015, 1.1483, 0.36] } }),
  // v62z (loop H3) the first SMG: the MP5K (smg_mp5k), its hooded front sight on the Sight socket (on the barrel's texture sheet), the drum rear sight on the body
  mp5k: gun('mp5k', { pkg: 'smg_mp5k', stem: 'smg_mp5k', hoodedPost: true, socketSights: sight('mp5k/smg_mp5k/SkeletalMesh3/smg_mp5k_sight_up.gltf', 'mp5k_barrel') }),
  // v64 the attachment builds (user 10-28: SF2's G36C EOTech Silencer, HK417 mod2A Reflex Silencer, SCAR-L MK2 EOTech Silencer):
  // the same rigs, the iron sights left off for the optic
  g36c_eo: gun('g36c', { optic: EOTECH, silencer: SIL('a') }),
  hk417_rs: gun('hk417', { optic: REFLEX, silencer: SIL('b') }),
  scarl_eo: gun('scarl', { pkg: 'rif_scar_L', tex: 'scar_L', anim: '1st_anim_scar_L', optic: EOTECH, silencer: SIL('c') }),
  // v64 the K14 bolt-action sniper (sni_k14); v64b its scope on the body's Scope socket (K14_SCOPE)
  k14: gun('k14', { pkg: 'sni_k14', stem: 'sni_k14', optic: K14_SCOPE }),
  // v64s the TRG-41 (sni_trg; its animset is 1st_ani_trg) on the Zeiss scope
  // v64t M40A1 (no stock part) and CZ700 on the CZ700's scope; CheyTac M200 and AWP on their own (SF2's default reticle, mic_ScopeView)
  m40a1: gun('m40a1', { pkg: 'sni_m40a1', stem: 'sni_m40a1', tex: 'm40a1', partNames: ['body', 'barrel', 'magazine'], optic: SCOPE('scope_cz700', 'scope_cz700') }),
  cz700: gun('cz700', { pkg: 'sni_cz700', stem: 'sni_cz700', tex: 'cz700', optic: SCOPE('scope_cz700', 'scope_cz700') }),
  cheytac: gun('cheytac', { pkg: 'sni_cheytac', stem: 'sni_cheytac', tex: 'cheytac', optic: SCOPE('scope_cheytac', 'cheytac_scope_a') }),
  awp: gun('awp', { pkg: 'sni_awp', stem: 'sni_awp', tex: 'awp', optic: SCOPE('scope_awp', 'awp_scope_a') }),
  // v64y SF2's other scoped guns (docs/loop/GUNS.md C)
  svd: gun('svd', { pkg: 'sni_dragunov', stem: 'sni_dragunov', tex: 'dragunov', anim: '1st_anim_dragunov', optic: SCOPE('scope_dragunov', 'dragunov_scope') }),
  barrett: gun('barrett', { pkg: 'sni_barret', stem: 'sni_barret', tex: 'barret', anim: '1st_anim_barret', optic: SCOPE('scope_cz700', 'scope_cz700') }), // (SFCItem_Barret_Def_Scope: the CZ700's scope, reticle mic_ScopeView_03)
  kar98k: gun('kar98k', { pkg: 'sni_kar98k', stem: 'sni_kar98k', tex: 'kar98k', optic: { file: 'kar98k/sni_kar98k/SkeletalMesh3/scope_kar98k.gltf', props: 'kar98k_anim/sni_kar98k/SkeletalMesh3/scope_kar98k.props.txt', tex: 'kar98k_scope', noAim: true, roll: +(process.env.ROLL ?? 0) } }), // (its scope ships in its own package; upright as read: 0 cm sideways against 3.1 turned)
  sr25: gun('sr25', { pkg: 'sni_sr-25', stem: 'sni_sr-25', tex: 'sr25', anim: '1st_anim_sr-25', optic: SCOPE('scope_sr25', 'scope_sr25') }),
  psg1: gun('psg1', { pkg: 'sni_psg-1', stem: 'sni_psg-1', tex: 'psg-1', anim: '1st_anim_psg-1', optic: SCOPE('scope_psg-1', 'psg-1_scope_a') }),
  frf2: gun('frf2', { pkg: 'sni_frf2', stem: 'sni_frf2', tex: 'frf2', optic: SCOPE('scope_pm2', 'scope_pm2') }), // (SFCItem_FRF2_Def_Scope: Common_Scope_PM2, reticle mic_ScopeView_01)
  m14ebr: gun('m14ebr', { optic: EOTECH }), // (SFCItem_M14EBR: SFCItem_Common_DotSight_EOTECH on its Scope socket)
  // v65e docs/loop/GUNS.md D: rifles
  aug: gun('aug', { tex: 'rif_aug', socketSights: sight('aug/rif_aug_sight/SkeletalMesh3/rif_aug_sight_up.gltf', 'aug_sight') }),
  sg551: gun('sg551', { pkg: 'rif_sig551', tex: 'sig551', anim: '1st_anim_sig551', hoodedPost: true }), // (sights on the body)
  type89: gun('type89', { hoodedPost: true }), // (its sight package put on the Scope socket floated off the gun: the body's own sights)
  trg: gun('trg', { pkg: 'sni_trg', stem: 'sni_trg', tex: 'sni_trg', anim: '1st_ani_trg', optic: ZEISS_SCOPE }),
}[GID];
if (!G) throw new Error(`unknown gun ${GID}`);
const TEX = {
  m4a1_sight: ['m4a1/rif_m4a1_sight/Texture2D/m4a1_sight'], m4a1_rearsight: ['m4a1/weapon_common_part01/Texture2D/m4a1_rearsight'], m4a1_handle: ['m4a1/weapon_common_part/Texture2D/handle'],
  sleeve: ['arms/c_delta_1st_texture/Texture2D/delm_1st_b01', 'arms/c_comm_1st_texture/Texture2D/com_1st_b01'], // the Delta Force sleeve colour, the common sleeve's normals
  glove: ['arms/c_comm_1sthand_texture/Texture2D/com_1st_glove_b01'],
};
const PNG = {}; // every exported texture of this gun by file name
function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const q = `${d}/${f.name}`; if (f.isDirectory()) walk(q); else if (f.name.endsWith('.png')) PNG[f.name.toLowerCase()] ??= q.slice(SRC.length, -4).replace(/_[dns]$/, ''); } }
walk(SRC + G.dir); if (G.optic || G.silencer) walk(SRC + 'parts'); // (v64 a variant reads its gun's folder and the attachments')
const texDirs = (stem) => TEX[stem] || [PNG[`${stem}_d.png`.toLowerCase()] || `${GID}/missing/${stem}`];
const ROUGH = { barrel: 0.78, stock: 0.8, magazine: 0.72, sight: 0.66, body: 0.68, sleeve: 0.9, glove: 0.82 }; // matte, dielectric (as sf2_gun_build.py)
const PEEP_DROP = +(process.env.PEEP_DROP ?? 0.0048), PEEP_DX = +(process.env.PEEP_DX ?? 0.00006); // v62p 0.0007 → 0.00136 on the carry handle: its hole was 26 px left of the dot at 1920×1080 (user 10-27); measured by tools/out/_ringcenter.mjs + _ringmeasure.py, now 0.2 px. v62z 0.00136 → 0.00006: the handle's points now come in the body's bind space (toBody), 1.3 mm over — the same SIGHT as before // the rear sight's aperture under its top / off its top's mean x (tuned on ADS shots, v61b)
// v62f the flip-up front sight sits this far behind the rail's front end (its socket is not exported): measured on the user's SF2 ADS
// screenshot (10-27) — with the peep ring matched (267 px at 1080p), the front sight's ears were 73 px there and 59 px here, i.e.
// SF2's post is 21.6 cm ahead of the peep, not 28.2
// v62o with the carry handle's leaf (the eye 5.5 cm behind it, src/09_models.js m4: the ring 255 px against SF2's 250 at 1280)
// SF2's front-sight ears are 73 px at 1080p and ours were 105: the post 38 cm from the eye, 2.8 cm AHEAD of the rail's front end
// (on the gas block, as on a real M4), not 8.6 cm behind it
const SIGHT_BACK = +(process.env.SIGHT_BACK ?? -0.028);
// and its green dot where SF2's is (958.8, 544.4 at 1080p: 4.4 px under the screen centre): 1.4 mm lower, 0.3 mm to the left (+X)
const POST_DROP = 0.0014, POST_DX = 0.0003;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(SRC + G.base), root = doc.getRoot(), buf = root.listBuffers()[0];
const skin = root.listSkins()[0], joints = skin.listJoints(), jix = Object.fromEntries(joints.map((j, i) => [j.getName(), i]));
const meshNode0 = root.listNodes().find((n) => n.getMesh()), scene = root.listScenes()[0];

// ---- small maths (column-major 4×4 like glTF)
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const inv4 = (m) => { // a general 4×4 inverse (column-major)
  const a = m, o = new Array(16);
  o[0] = a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
  o[4] = -a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
  o[8] = a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
  o[12] = -a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
  o[1] = -a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
  o[5] = a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
  o[9] = -a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
  o[13] = a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
  o[2] = a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
  o[6] = -a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
  o[10] = a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
  o[14] = -a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
  o[3] = -a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
  o[7] = a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
  o[11] = -a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
  o[15] = a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
  const det = a[0]*o[0]+a[1]*o[4]+a[2]*o[8]+a[3]*o[12]; return o.map((x) => x / det);
};
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
  if (remap.some((i) => i === undefined) && !bake) { // (v62o a bone the base lacks is fine if nothing is weighted to it: the carry handle's M203 bones)
    const used = new Set(), e = [], w = [];
    for (const p of pr.listMeshes()[0].listPrimitives()) { const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'); for (let i = 0; i < J.getCount(); i++) { J.getElement(i, e); W.getElement(i, w); e.forEach((j, k) => { if (w[k] > 0) used.add(j); }); } }
    if ([...used].some((j) => remap[j] === undefined)) throw new Error(`${name}: bone missing in the base skeleton`);
  }
  const mesh = doc.createMesh(name), mat = await material(stem), out = [];
  const glass = () => doc.createMaterial('gun:glass').setBaseColorFactor([0.22, 0.12, 0.08, 0.12]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.35); // v64 an optic's lens (lens_* / *_glass_mic): a dark warm tint, as in the user's SF2 G36C EOTech shot
  // v62i each part keeps its OWN bind pose (as UE3 does: the bones are shared, each mesh its own reference pose): its own skin over
  // the body's joints with its inverse-bind matrices (the body's for bones it lacks). AK-103 / SCAR stocks have weapon_stock
  // turned 90° against the body's, the G36C's arms a whole other bind — read through the body's, the stock swung a metre off.
  let partSkin = skin, toBody = null; // toBody[j]: this part's bind space → the body's, per joint (only when the binds differ)
  if (!bake) {
    const pibm = pskin.getInverseBindMatrices().getArray(), bibm = skin.getInverseBindMatrices().getArray(), byName = Object.fromEntries(pj.map((j, k) => [j.getName(), k]));
    const ib = new Float32Array(joints.length * 16); let differs = false;
    joints.forEach((j, i) => { const k = byName[j.getName()], m = k === undefined ? bibm.slice(i * 16, i * 16 + 16) : pibm.slice(k * 16, k * 16 + 16); ib.set(m, i * 16); if (k !== undefined && m.some((x, c) => Math.abs(x - bibm[i * 16 + c]) > 1e-4)) differs = true; });
    if (differs) {
      partSkin = doc.createSkin(name + '_skin').setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ib).setBuffer(buf)); joints.forEach((j) => partSkin.addJoint(j)); console.log('OWNBIND', GID, name);
      // v62z the points this returns (sights, peep, rail fits) must be in the BODY's bind space: inv(body IBM) × part IBM per joint
      toBody = joints.map((j, i) => mul(inv4(Array.from(bibm.slice(i * 16, i * 16 + 16))), Array.from(ib.slice(i * 16, i * 16 + 16))));
    }
  }
  // v64b the SCAR stocks (H, L, L MK2): read through their own bind under SF2's animation the stock stands 6 cm behind the
  // receiver (the armory card, user 10-28) — UE3 draws it the same, but its first-person view never shows the stock. Close the
  // gap along the body's long axis: shift the stock in its own bind space by the body-space gap turned back through toBody.
  let shift = null;
  if (name === 'stock' && toBody && V.body) {
    const sp = [], e = [], w = [];
    for (const p of pr.listMeshes()[0].listPrimitives()) { const P = p.getAttribute('POSITION'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0');
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); const v = e.slice(0, 3); J.getElement(i, e); const jj = e.map((j) => remap[j] ?? 0); W.getElement(i, w); const q = [0, 0, 0]; for (let k = 0; k < 4; k++) if (w[k] > 0) { const t = xf(toBody[jj[k]], v); q[0] += w[k] * t[0]; q[1] += w[k] * t[1]; q[2] += w[k] * t[2]; } sp.push(q); } }
    const ext = [0, 1, 2].map((k) => max(V.body, k) - min(V.body, k)), ax = ext.indexOf(Math.max(...ext));
    const back = mean(sp, ax) < mean(V.body, ax), gap = back ? min(V.body, ax) - max(sp, ax) : min(sp, ax) - max(V.body, ax);
    if (gap > 0.01) {
      const d = [0, 0, 0]; d[ax] = back ? gap : -gap; shift = toBody.map((m) => xf(inv4(m), d, 0));
      console.log('STOCKGAP', GID, (gap * 100).toFixed(1) + ' cm closed');
    }
  }
  for (const p of pr.listMeshes()[0].listPrimitives()) {
    const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), T = p.getAttribute('TANGENT'), UV = p.getAttribute('TEXCOORD_0'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), n = P.getCount();
    const bp = toBody ? new Float32Array(n * 3) : null, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), tan = T ? new Float32Array(n * 4) : null, jo = new Uint16Array(n * 4), we = new Float32Array(n * 4), e = [], f = [];
    for (let i = 0; i < n; i++) {
      P.getElement(i, e); let v = e.slice(0, 3); N.getElement(i, f); let nn = f.slice(0, 3); let tt = null; if (T) { T.getElement(i, f); tt = f.slice(0, 4); }
      if (bake) { v = bake.p(v, i); nn = bake.n(nn); if (tt) tt = [...bake.n(tt.slice(0, 3)), tt[3]]; jo.set([jix.weapon_root, 0, 0, 0], i * 4); we.set([1, 0, 0, 0], i * 4); }
      else {
        J.getElement(i, e); jo.set(e.map((j) => remap[j] ?? 0), i * 4); W.getElement(i, e); we.set(e, i * 4);
        if (shift) { const q = [0, 0, 0]; for (let k = 0; k < 4; k++) { const w = we[i * 4 + k]; if (w > 0) { const t = shift[jo[i * 4 + k]]; q[0] += w * t[0]; q[1] += w * t[1]; q[2] += w * t[2]; } } v = [v[0] + q[0], v[1] + q[1], v[2] + q[2]]; }
        if (bp) { const q = [0, 0, 0]; for (let k = 0; k < 4; k++) { const w = we[i * 4 + k]; if (w > 0) { const t = xf(toBody[jo[i * 4 + k]], v); q[0] += w * t[0]; q[1] += w * t[1]; q[2] += w * t[2]; } } bp.set(q, i * 3); }
      }
      pos.set(v, i * 3); nor.set(norm(nn), i * 3); if (tan) tan.set(tt, i * 4);
    }
    const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    const lens = /lens|glass/i.test((p.getMaterial() && p.getMaterial().getName()) || '');
    const prim = doc.createPrimitive().setMaterial(lens ? glass() : mat).setIndices(acc('SCALAR', new Uint32Array(p.getIndices().getArray())))
      .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(UV.getArray())))
      .setAttribute('JOINTS_0', acc('VEC4', jo)).setAttribute('WEIGHTS_0', acc('VEC4', we));
    if (tan) prim.setAttribute('TANGENT', acc('VEC4', tan));
    mesh.addPrimitive(prim); out.push(bp || pos);
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

const min = (a, k) => Math.min(...a.map((p) => p[k])), max = (a, k) => Math.max(...a.map((p) => p[k])), mean = (a, k) => a.reduce((s, p) => s + p[k], 0) / a.length;
const V = {};
for (const [name, file, stem] of [...G.parts, ...(G.extraParts || [])]) V[name] = await addPart(name, file, stem);
for (const c of meshNode0.listChildren()) { meshNode0.removeChild(c); scene.addChild(c); } // the skeleton (Bip01) to the scene root
meshNode0.dispose(); // the body was re-added as 'body' with its own material
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
// v64 attachments: the part's root bone (weapon_scope / weapon_root) onto the body's socket, as the sights above; a point on one of
// the part's own sockets is then that socket's frame on the body: body socket × the part socket's offset
const partSock = (props, name) => {
  const m = fs.readFileSync(SRC + props, 'utf8').match(new RegExp(`SocketName = ${name}\\s+BoneName = \\S+\\s+RelativeLocation = \\{ X=([-\\d.e]+), Y=([-\\d.e]+), Z=([-\\d.e]+) \\}`));
  if (!m) throw new Error(`${props}: no socket ${name}`);
  return [+m[1] / 100, +m[3] / 100, -m[2] / 100];
};
for (const [key, socket, own, mark] of [['optic', 'Scope', 'ZoomCrosshair', 'DOT'], ['silencer', 'Silencer', 'flame', 'MUZZLE']]) {
  const A = G[key]; if (!A) continue;
  const pd = await io.read(SRC + A.file), sk = pd.getRoot().listSkins()[0], ibm = Array.from(sk.getInverseBindMatrices().getArray()).slice(0, 16), S = sockAt(socket);
  let RC = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (A.roll) { // about the part's own long axis (its mesh space), through its root bone (the mount on the socket). v64p: it went through the
    // middle of the bounds — the turrets and rings put that off the tube, which ended up beside and below the bore (user 10-28 sketch);
    // the scope's root bind differs from the EOTech's by exactly this quarter turn about mesh x, about the bone's origin
    const ps = [], e = []; for (const p of pd.getRoot().listMeshes()[0].listPrimitives()) { const P = p.getAttribute('POSITION'); for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); ps.push(e.slice(0, 3)); } }
    const lo = [0, 1, 2].map((k) => min(ps, k)), hi = [0, 1, 2].map((k) => max(ps, k)), ext = hi.map((h, k) => h - lo[k]), ax = ext.indexOf(Math.max(...ext)), ctr = inv4(ibm).slice(12, 15);
    const a = A.roll * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), u = (ax + 1) % 3, w = (ax + 2) % 3, R = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    R[u * 4 + u] = c; R[u * 4 + w] = sn; R[w * 4 + u] = -sn; R[w * 4 + w] = c; // (column-major: column u = rotated u axis)
    const T = (t) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
    RC = mul(mul(T(ctr), R), T(ctr.map((x) => -x)));
    console.log('ROLL', GID, key, A.roll, 'about mesh axis', 'xyz'[ax]);
  }
  let M = mul(mul(S, ibm), RC);
  if (A.roll != null) { // v64u then square it on the rail whatever the pivot did (user 10-28: the TRG-41's Zeiss sat right of and below the bore —
    // its root bone is not under its mount): the lens centres (the tube's axis) over the socket sideways, the lowest point (the
    // mount's foot) on the socket's height
    const lens = [], all = [], e = [];
    for (const p of pd.getRoot().listMeshes()[0].listPrimitives()) {
      const isLens = /lens|glass/i.test((p.getMaterial() && p.getMaterial().getName()) || ''), P = p.getAttribute('POSITION');
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); const w = xf(M, e); all.push(w); if (isLens) lens.push(w); }
    }
    const s = S.slice(12, 15), cx = lens.length ? lens.reduce((a, w) => a + w[0], 0) / lens.length : s[0], lowY = Math.min(...all.map((w) => w[1]));
    const d = [s[0] - cx, s[1] - lowY, 0];
    console.log('SQUARE', GID, key, 'shift', d.map((x) => +(x * 100).toFixed(2)), 'cm', lens.length ? '' : '(no lens: x kept)');
    if (process.env.NOSQUARE !== '1') M = mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0], d[1], d[2], 1], M);
  }
  V[key] = await addPart(key, A.file, A.tex, { p: (v) => xf(M, v), n: rot3(M, 1) });
  if (!A.noAim) marks[mark] = xf(S, partSock(A.props, own));
}
if (G.optic && G.optic.reticle) { // SF2's reticle (dot_point's DotTexture) on a 2 cm quad at the DOT, riveted to weapon_root: the game takes its texture for the sight's sprite
  const d = marks.DOT, h = 0.01, acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const img = await sharp(SRC + G.optic.reticle).png().toBuffer();
  const mat = doc.createMaterial('gun:reticle').setBaseColorTexture(doc.createTexture('reticle').setImage(img).setMimeType('image/png')).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(1);
  const pos = new Float32Array([d[0] - h, d[1] - h, d[2], d[0] + h, d[1] - h, d[2], d[0] + h, d[1] + h, d[2], d[0] - h, d[1] + h, d[2]]);
  const prim = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', new Uint32Array([0, 1, 2, 0, 2, 3])))
    .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1])))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array([1, 1, 0, 1, 0, 0, 1, 0])))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array([jix.weapon_root, 0, 0, 0, jix.weapon_root, 0, 0, 0, jix.weapon_root, 0, 0, 0, jix.weapon_root, 0, 0, 0])))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])));
  scene.addChild(doc.createNode('reticle').setMesh(doc.createMesh('reticle').addPrimitive(prim)).setSkin(skin));
}
if (!G.railSights) { // POST: the front sight's tip — the highest point on the bore's centre line (±1.2 mm: not the ears) in the front 25 cm
  const pts = [V.barrel, V.body, ...G.socketSights.map(([n]) => V[n])].flat().filter((p) => Math.abs(p[0] - bore[0]) < 0.0012 && p[2] > bore[2] - 0.25).sort((a, b) => b[1] - a[1]);
  let i = 0;
  if (G.hoodedPost) { // a ring hood over the post (G36C): its top is on the centre line too — step down through the ring, over the hole
    while (i + 1 < pts.length && pts[i][1] - pts[i + 1][1] < 0.0025) i++; // (G36C: hood 1207.8 → 1205.8 mm, a 6.6 mm hole, the tip at 1199.2)
    i++;
  }
  marks.POST = pts[i] || bore; // (v64v a scoped bolt gun may have no front sight on the centre line — the CZ700: the muzzle then)
  if (G.sightMarks) Object.assign(marks, G.sightMarks); // (measured by hand where the search cannot find them)
}
if (G.railSights) {
  const { sight: SG, rear: RG } = G.railSights;
  let rp;
  if (RG === 'handle') { // the carry handle is skinned like the body: its rear end (−Z, the last 2.5 cm) is the sight leaf
    const zr = min(V.handle, 2); rp = V.handle.filter((p) => p[2] < zr + 0.025);
  } else { // rear sight: peep end to the rear (−Z), standing on the receiver's top rail at its rear end
    const R = await bakedPoints(RG[0]); rp = R.pts; let flip = 1;
    if (rp.reduce((a, p) => (p[1] > a[1] ? p : a))[2] > mean(rp, 2)) flip = -1; // turned 180° about Y
    rp = rp.map((p) => [p[0] * flip, p[1], p[2] * flip]);
    const rtop = max(V.body, 1), rz = min(V.body.filter((p) => p[1] > rtop - 0.004), 2);
    const rc = [(min(rp, 0) + max(rp, 0)) / 2, min(rp, 1), min(rp, 2)], rOff = [bore[0] - rc[0], rtop - rc[1], rz - rc[2]];
    rp = rp.map((p) => [p[0] + rOff[0], p[1] + rOff[1], p[2] + rOff[2]]);
    await addPart('rearsight', RG[0], RG[1], { p: (v) => { const w = xf(R.M, v); return [w[0] * flip + rOff[0], w[1] + rOff[1], w[2] * flip + rOff[2]]; }, n: rot3(R.M, flip) });
  }
  const top = max(rp, 1), tp = rp.filter((p) => p[1] > top - 0.002), peepx = mean(tp, 0) + PEEP_DX, aperture = top - PEEP_DROP, peepZ = min(rp, 2);
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
