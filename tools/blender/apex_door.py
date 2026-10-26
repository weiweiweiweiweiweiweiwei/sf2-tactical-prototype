"""Apex's hinged door leaf (canyonlands_door_single_02_avt, from the user's install via RSX) -> tools/out/apex/door/door.glb.
  blender -b -P tools/blender/apex_door.py
Model space is kept (inches -> metres, glTF y-up): the report gives the leaf's extent around the model origin (the hinge)."""
import bpy, re, sys
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/out/apex/door/mdl/canyonlands_door_single_02_avt/canyonlands_door_single_02_avt_LOD0.cast'
MAT = ROOT / 'tools/out/apex/rsx-2.4.0/exported_files/material'
bpy.ops.wm.read_factory_settings(use_empty=True)
sys.path.insert(0, str(ROOT / 'tools/out/apex/python'))
import io_scene_cast
io_scene_cast.register()
bpy.ops.import_scene.cast(filepath=str(SRC), import_skin=False, import_ik=False, import_constraints=False)
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
for m in bpy.data.materials:
    key = re.sub(r'\.\d+$', '', m.name).lower()
    f = next((MAT / (key + s) for s in ('_rgdp', '_rgdc', '_wldc', '') if (MAT / (key + s)).is_dir() and any((MAT / (key + s)).glob('*_col.png'))), None)
    m.use_nodes = True; nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if not f:
        bsdf.inputs['Base Color'].default_value = (0.08, 0.11, 0.12, 1); bsdf.inputs['Roughness'].default_value = 0.15  # the glass panes: no texture in the pak
        print('NO_TEX', key); continue
    col = sorted(f.glob('*_col.png'))[0]
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(col)); nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    t.image.scale(512, 512)
    if 'glass' in key: bsdf.inputs['Alpha'].default_value = 0.35
    bsdf.inputs['Roughness'].default_value = 0.6; bsdf.inputs['Metallic'].default_value = 0.3
for o in bpy.data.objects:
    o.scale = (0.0254, 0.0254, 0.0254)
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects for c in o.bound_box]
print('DOOR_BOUNDS', [round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)], [o.name for o in bpy.data.objects], [m.name for m in bpy.data.materials])
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'tools/out/apex/door/door.glb'), export_format='GLB', export_yup=True, export_apply=True)
