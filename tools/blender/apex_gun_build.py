"""Apex Legends weapons from the user's own install -> tools/guns/apex_<gun>.glb (v66w: all ~30 base guns, user 11-05 全 A).
Source: RSX exports (docs/pipelines/apex-guns.md) — tools/out/apex/guns/mdl/<model>/<model>_LOD0.cast and the base skin's textures
in tools/out/apex/rsx-2.4.0/exported_files/material/<gun>_base_main_sknp/.
  python tools/blender/apex_gun_build.py [gun …]              (system Python: the textures, PIL — 1024 px, see below)
  blender -b -P tools/blender/apex_gun_build.py -- [gun …]    (the models)
Kept: every default part (`<part>_0_`) and the iron sights (`sight*_1_` when the gun has no `_0_` one); dropped: optics, suppressors,
lasers, extended mags, the other variant parts (`_1_` …). Marks from the model's own bones (bind pose): MUZZLE = muzzle_flash,
SIGHT / HOOD = ja_ads_attachment (the iron-sight eye line), GRIP = ja_c_propGun (where every Apex viewmodel's right hand holds its gun;
the hand bones are in a T-pose), MAGPIV = the magazine bone; SUPPORT (no bone for it) = under the body, 45 % from the magazine (or the
grip) to the muzzle — a pistol: just ahead of the grip.
Gun space (tools/blender/gunlib.py): X right, Y forward, Z up, metres; origin on the bore (muzzle height), 7.8 cm ahead of the grip.
CAST in Blender: X lateral, Y up, Z forward, inches -> (−X, Z, Y) × 0.0254 (a rotation: no mirror).
Textures: colour = col + spc (Respawn's specular workflow: metal's colour lives in spc) × ao; normal: DirectX -> glTF (green flipped);
roughness = 1 − gloss; metalness from the spc brightness.
"""
import sys, glob, json, re
from pathlib import Path
try: import bpy; from mathutils import Vector, Matrix
except ImportError: bpy = None

ROOT = Path(__file__).resolve().parents[2]
MDL = ROOT / 'tools/out/apex/guns/mdl'; MATD = ROOT / 'tools/out/apex/rsx-2.4.0/exported_files/material'
# gun id -> (model folder, material stem)
GUNS = {
  'alternator': ('alternator_base_v', 'alternator'), 'car': ('car_base_v', 'car'), 'chargerifle': ('chargerifle_base_v', 'chargerifle'),
  'bocek': ('compound_base_v', 'compound'), 'devotion': ('devotion_base_v', 'devotion'), 'rampage': ('dragon_base_v', 'dragon'),
  'eva8': ('eva8_base_v', 'eva8'), 'flatline': ('flatline_base_v', 'flatline'), 'g7': ('g7_base_v', 'g7'), 'havoc': ('havoc_base_v', 'havoc'),
  'hemlok': ('hemlock_v18_base_v', 'hemlok'), 'kraber': ('kraber_base_v', 'kraber'), 'longbow': ('longbow_base_v', 'longbow'),
  'lstar': ('lstar_base_v', 'lstar'), 'mastiff': ('mastiff_base_v', 'mastiff'), 'mozambique': ('mozambique_base_v', 'mozambique'),
  'nemesis': ('nemesis_base_v', 'nemesis'), 'p2020': ('p2020_base_v', 'p2020'), 'peacekeeper': ('peacekeeper_base_v', 'peacekeeper'),
  'prowler': ('prowler_base_v', 'prowler'), 'r301': ('r301_base_v', 'r301'), 'r99': ('r99_base_v', 'r99'), 're45': ('re45_base_v', 're45'),
  'repeater': ('repeater3030_base_v', 'repeater3030'), 'sentinel': ('sentinel_base_v', 'sentinel'), 'spitfire': ('spitfire_base_v', 'spitfire'),
  'tripletake': ('tripletake_base_v', 'tripletake'), 'volt': ('volt_base_v', 'volt'), 'wingman': ('wingman_base_v', 'wingman'),
}
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ([] if bpy else sys.argv[1:])
IDS = args or list(GUNS)
PREP = lambda gid: ROOT / f'tools/out/apex/guns/tex/{gid}'

if bpy is None:  # ---- textures (system Python)
  from PIL import Image, ImageChops, ImageMath
  S = 1024
  for gid in IDS:
    stem = GUNS[gid][1]; d = MATD / f'{stem}_base_main_sknp'; P = PREP(gid); P.mkdir(parents=True, exist_ok=True)
    ld = lambda k, mode: Image.open(d / f'{stem}_base_main_{k}.png').convert(mode).resize((S, S), Image.LANCZOS) if (d / f'{stem}_base_main_{k}.png').exists() else None
    col, spc, ao, nml, gls = ld('col', 'RGB'), ld('spc', 'RGB'), ld('ao', 'L'), ld('nml', 'RGB'), ld('gls', 'L')
    base = ImageChops.add(col, spc.point(lambda v: int(v * 0.4))) if spc else col  # (v66w: the full spc washed the guns out to chrome in game)
    if ao: base = ImageChops.multiply(base, Image.merge('RGB', (ao, ao, ao)))
    base.save(P / 'col.jpg', quality=88)
    r, g, b = nml.split(); Image.merge('RGB', (r, ImageChops.invert(g), b)).save(P / 'nml.jpg', quality=90)
    met = spc.convert('L').point(lambda v: max(0, min(255, int((v - 30) * 255 / 140)))) if spc else Image.new('L', (S, S), 0)
    Image.merge('RGB', (Image.new('L', (S, S), 255), ImageChops.invert(gls), met)).save(P / 'orm.jpg', quality=90)  # glTF: G roughness, B metalness
    print('TEX', gid)
  sys.exit(0)

# ---- models (Blender)
sys.path.insert(0, str(ROOT / 'tools/out/apex/python')); import io_scene_cast; io_scene_cast.register()
DROP = re.compile(r'^(sight_(acgs|aog|cro|hcog|holo|bruiser|tri|rangefinder|dcom|talon|wonyeon|threat|sniper|digital|variable|kraber)|suppressor|lasersight|scope|ads_scopes|holo|sight_rail)', re.I)
EYE_UP = {'tripletake': 0.04, 'volt': 0.03}  # (v66z from the in-game aimed views: Triple Take's rear block and Volt's barrel hid the sight line)
# (v66w the eye a little over ja_ads_attachment: on it the R-301's rear screen hid the front post; per gun if needed)
A2G = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(0.0254, 4)
MAGB = ('def_c_magazine', 'def_magazine', 'def_c_mag', 'def_mag', 'def_c_clip', 'def_clip')
report = {}
for gid in IDS:
  folder, stem = GUNS[gid]
  for o in list(bpy.data.objects): bpy.data.objects.remove(o)
  for c in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images): [c.remove(x) for x in list(c)]
  bpy.ops.import_scene.cast(filepath=glob.glob(str(MDL / folder / '*_LOD0.cast'))[0], import_skin=True, import_ik=False, import_constraints=False)
  arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
  bone = lambda n: (A2G @ arm.matrix_world @ arm.data.bones[n].head_local) if n in arm.data.bones else None
  meshes = [o for o in bpy.data.objects if o.type == 'MESH']
  part = lambda o: re.sub(r'_LOD0_.*', '', o.name)
  has0 = {re.sub(r'_\d+$', '', part(o)) for o in meshes if re.search(r'_0$', part(o))}
  keep = []
  for o in meshes:
    p = part(o); base = re.sub(r'_\d+$', '', p)
    if DROP.match(p): continue
    if p.endswith('_0') or (base.startswith(('sight', 'mastiff_sight')) and base not in has0 and p.endswith('_1')): keep.append(o)
  M = {'MUZZLE': bone('muzzle_flash'), 'SIGHT': bone('ja_ads_attachment') + Vector((0, 0, EYE_UP.get(gid, 0.012))), 'GRIP': bone('ja_c_propGun'),
       'MAGPIV': next((bone(b) for b in MAGB if b in arm.data.bones), None)}
  vs = [A2G @ o.matrix_world @ v.co for o in keep for v in o.data.vertices if not re.search(r'magazine|clip|at_rifle_mag', part(o), re.I)]
  g, mz = M['GRIP'], M['MUZZLE']; a = M['MAGPIV'] if M['MAGPIV'] is not None and M['MAGPIV'].y > g.y + 0.05 else g
  su = a.y + 0.45 * (mz.y - a.y) if mz.y - g.y > 0.3 else g.y + 0.06
  near = [v.z for v in vs if abs(v.y - su) < 0.02]
  M['SUPPORT'] = Vector((0, su, max(min(near) if near else mz.z - 0.03, mz.z - 0.08)))
  org = Vector((0, M['GRIP'].y + 0.078, M['MUZZLE'].z))  # (on the bore, 7.8 cm ahead of the grip: gunlib's layout)
  # one textured material for the base skin's parts; anything else (lenses, glow, charge coils) a dark polymer
  mt = bpy.data.materials.new(f'gun:tex_apex_{gid}'); mt.use_nodes = True; nt = mt.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
  def tex(name, cs='sRGB'):
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(PREP(gid) / name)); t.image.colorspace_settings.name = cs; return t
  nt.links.new(tex('col.jpg').outputs['Color'], bs.inputs['Base Color'])
  nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tex('nml.jpg', 'Non-Color').outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
  orm = tex('orm.jpg', 'Non-Color'); sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(orm.outputs['Color'], sp.inputs['Color'])
  nt.links.new(sp.outputs['Green'], bs.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], bs.inputs['Metallic'])
  dark = bpy.data.materials.new('gun:polymer')
  kept = []
  for o in keep:
    mw = o.matrix_world.copy(); o.parent = None; o.modifiers.clear()
    o.data.transform(A2G @ mw); o.matrix_world = Matrix.Identity(4); o.data.transform(Matrix.Translation(-org))
    own = any(m and m.name.startswith(f'{stem}_base_main') for m in o.data.materials)
    o.data.materials.clear(); o.data.materials.append(mt if own else dark)
    nd = 'mag' if re.search(r'magazine|clip|^at_rifle_mag', part(o), re.I) else 'body'
    o.name = f'{nd}__{"tex_apex_" + gid if own else "polymer"}_{len(kept)}'; kept.append(o)
  for o in list(bpy.data.objects):
    if o not in kept: bpy.data.objects.remove(o)
  for k, v in M.items():
    if v is None: continue
    e = bpy.data.objects.new(k, None); bpy.context.scene.collection.objects.link(e); e.location = v - org
  h = bpy.data.objects.new('HOOD', None); bpy.context.scene.collection.objects.link(h); h.location = M['SIGHT'] - org
  out = ROOT / f'tools/guns/apex_{gid}.glb'
  bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                            export_materials='EXPORT', export_image_format='WEBP', export_image_quality=85, export_draco_mesh_compression_enable=True,
                            export_draco_mesh_compression_level=7, export_skins=False, export_animations=False, use_selection=False)
  rel = {k: [round(c, 3) for c in (v - org)] for k, v in M.items() if v is not None}
  report[gid] = dict(parts=[part(o) for o in keep], tris=sum(len(o.data.polygons) for o in kept), marks=rel, kb=out.stat().st_size // 1024)
  print('GUN', gid, json.dumps(report[gid]), flush=True)
json.dump(report, open(ROOT / 'tools/out/apex/guns/build.json', 'w'), indent=1)
print('BUILT', len(report))
