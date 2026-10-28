"""An Apex Legends weapon from the user's own install (RSX: `-export -exportdependencies -matltextures --exporttypes mdl_
--exportfilter <gun>_base_v` and `--exporttypes matl --exportfilter <gun>_base_main_sknp`, see docs/pipelines/apex-guns.md)
-> tools/guns/apex_<id>.glb: the first-person model's body, default magazine and iron sights (every optic, suppressor and laser
mesh dropped), on its own material — colour, normal (DirectX → glTF: green flipped), roughness = 1 − gloss, at 1024 px.
  python tools/blender/apex_gun_build.py r301                 (system Python: the textures, PIL)
  blender -b -P tools/blender/apex_gun_build.py -- r301       (the model)
Model space is kept (Source inches -> metres; RSX/CAST: X forward, Z up; glTF exported y-up). Prints the bounds and the marks.
"""
import sys
from pathlib import Path
try: import bpy; from mathutils import Vector
except ImportError: bpy = None  # the system Python: the texture step (Blender's own Python has no PIL)

ROOT = Path(__file__).resolve().parents[2]
GID = (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:] or ['r301'])[0]
GUNS = {'r301': dict(cast='tools/out/apex/r301/mdl/r301_base_v/r301_base_v_LOD0.cast', mat='r301_base_main_sknp', tex='r301_base_main',
                     keep=('body_0_', 'r101_magazine_0_', 'sight_front_0_'))}
G = GUNS[GID]; MAT = ROOT / 'tools/out/apex/rsx-2.4.0/exported_files/material' / G['mat']; OUT = ROOT / f'tools/guns/apex_{GID}.glb'
PREP = ROOT / f'tools/out/apex/{GID}/tex'; PREP.mkdir(parents=True, exist_ok=True)
if bpy is None:  # textures: 1024 px; the normal map's green channel flipped (Respawn ships DirectX normals); roughness from gloss
  from PIL import Image, ImageChops
  col = Image.open(MAT / f"{G['tex']}_col.png").convert('RGB').resize((1024, 1024), Image.LANCZOS); col.save(PREP / 'col.png')
  r, g, b = Image.open(MAT / f"{G['tex']}_nml.png").convert('RGB').resize((1024, 1024), Image.LANCZOS).split()
  Image.merge('RGB', (r, ImageChops.invert(g), b)).save(PREP / 'nml.png')
  gl = Image.open(MAT / f"{G['tex']}_gls.png").convert('L').resize((1024, 1024), Image.LANCZOS)
  Image.merge('RGB', (Image.new('L', gl.size, 255), ImageChops.invert(gl), Image.new('L', gl.size, 0))).save(PREP / 'rgh.png')  # glTF: G = roughness
  print('TEXTURES', PREP); sys.exit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
sys.path.insert(0, str(ROOT / 'tools/out/apex/python')); import io_scene_cast; io_scene_cast.register()
bpy.ops.import_scene.cast(filepath=str(ROOT / G['cast']), import_skin=False, import_ik=False, import_constraints=False)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith(G['keep']):
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    else: bpy.data.objects.remove(o)
m = bpy.data.materials.new(f'gun:tex_apex_{GID}'); m.use_nodes = True; nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
def tex(name, cs='sRGB'):
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(PREP / name)); t.image.colorspace_settings.name = cs; return t
nt.links.new(tex('col.png').outputs['Color'], bs.inputs['Base Color'])
nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tex('nml.png', 'Non-Color').outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(tex('rgh.png', 'Non-Color').outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs['Green'], bs.inputs['Roughness'])
bs.inputs['Metallic'].default_value = 0.0  # (Apex's spc map tints the specular; the export keeps the dielectric look of the SF2 guns)
for o in bpy.data.objects:
    o.data.materials.clear(); o.data.materials.append(m); o.scale = (0.0254, 0.0254, 0.0254)
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects for c in o.bound_box]
lo = [min(p[i] for p in pts) for i in range(3)]; hi = [max(p[i] for p in pts) for i in range(3)]
print('APEX_GUN', GID, 'objects', [o.name for o in bpy.data.objects], 'bounds', [round(x, 3) for x in lo], [round(x, 3) for x in hi], flush=True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', export_yup=True, export_apply=True, export_image_format='WEBP',
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('SAVED', OUT, OUT.stat().st_size, flush=True)
