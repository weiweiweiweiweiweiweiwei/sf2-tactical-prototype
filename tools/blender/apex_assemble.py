"""Place the verified CAST sample at its original static-prop transforms."""
import bpy
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/out/apex/preview'
SCALE = 0.0254
placements = json.loads((OUT/'static_props.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT/'firing_range_asset_gallery.blend'))
gallery = bpy.context.scene
bpy.context.view_layer.update()
sources = {}
for root in list(gallery.objects):
    if root.type != 'EMPTY' or '_LOD0' not in root.name:
        continue
    collection = bpy.data.collections.new('Source_'+root.name)
    inverse = root.matrix_world.inverted()
    for child in root.children_recursive:
        if child.type != 'MESH':
            continue
        copy = bpy.data.objects.new(child.name+'_prototype', child.data)
        copy.matrix_world = inverse @ child.matrix_world
        collection.objects.link(copy)
    sources[root.name.split('_LOD0')[0].lower()] = collection

# Import each remaining referenced model only once; all placements instance its collection.
sys.path.insert(0,str(ROOT/'tools/out/apex/python'))
import io_scene_cast
io_scene_cast.register()
needed = {Path(p['model']).stem.lower() for p in placements['props']}
paths_by_key = defaultdict(set)
for p in placements['props']:
    paths_by_key[Path(p['model']).stem.lower()].add(p['model'].lower())
ambiguous = {key: sorted(paths) for key, paths in paths_by_key.items() if len(paths)>1}
for path in sorted((ROOT/'tools/out/apex/full-models').rglob('*_LOD0.cast')):
    key = path.stem.removesuffix('_LOD0').lower()
    if key not in needed or key in sources:
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.cast(filepath=str(path), import_skin=False, import_ik=False, import_constraints=False)
    bpy.context.view_layer.update()
    added = set(bpy.data.objects)-before
    geometry = [o for o in added if o.type=='MESH']
    if not geometry:
        print('EMPTY_MODEL',key,flush=True)
        continue
    collection = bpy.data.collections.new('Source_'+key)
    for obj in geometry:
        copy = bpy.data.objects.new(obj.name+'_prototype',obj.data)
        copy.matrix_world=obj.matrix_world.copy()
        collection.objects.link(copy)
    sources[key]=collection
    print('PROTOTYPE',len(sources),key,flush=True)

scene = bpy.data.scenes.new('Firing range - actual static placements')
bpy.context.window.scene = scene
with bpy.data.libraries.load(str(OUT/'firing_range_geometry.blend'), link=False) as (available, requested):
    requested.objects = ['FiringRange_BSP_World']
for obj in requested.objects:
    scene.collection.objects.link(obj)
instances = []
report = {'source_props': placements['prop_count'], 'source_models': placements['model_count'],
          'placed': [], 'limitations': ['Unmatched models are reported, not substituted', 'World uses diagnostic material; most props lack textures',
          'No gameplay collision or original lighting', 'Rotation follows Source QAngle Rz(yaw) Ry(pitch) Rx(roll); in-game comparison pending']}
for p in placements['props']:
    key = Path(p['model']).stem.lower()
    if key not in sources or key in ambiguous:
        continue
    pitch,yaw,roll = [math.radians(v) for v in p['angles_pitch_yaw_roll']]
    rotation = Matrix.Rotation(yaw,4,'Z') @ Matrix.Rotation(pitch,4,'Y') @ Matrix.Rotation(roll,4,'X')
    transform = Matrix.Translation(Vector(p['origin'])*SCALE) @ rotation @ Matrix.Scale(p['scale']*SCALE,4)
    inst = bpy.data.objects.new(f"prop_{p['index']:05d}_{key}", None)
    inst.instance_type = 'COLLECTION'
    inst.instance_collection = sources[key]
    inst.matrix_world = transform
    inst['source_prop_index'] = p['index']
    inst['source_model'] = p['model']
    scene.collection.objects.link(inst)
    instances.append(inst)
    report['placed'].append(p['index'])
assert len(instances) > 0
bpy.context.view_layer.update()
points = [i.matrix_world @ o.matrix_world @ Vector(c) for i in instances if 'vert_course' in i.name for o in i.instance_collection.objects for c in o.bound_box]
lo = Vector([min(p[a] for p in points) for a in range(3)])
hi = Vector([max(p[a] for p in points) for a in range(3)])
center = (lo+hi)*0.5
extent = max(hi-lo)
camera = bpy.data.objects.new('Placed assets overview', bpy.data.cameras.new('Placed assets overview'))
scene.collection.objects.link(camera)
camera.location = center + Vector((0.6,-0.9,1.2))*extent
camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = extent*1.8
camera.data.clip_end = 10000
scene.camera = camera
scene.world = gallery.world
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun','SUN'))
sun.data.energy=2
sun.rotation_euler=(0.4,-0.5,-0.3)
scene.collection.objects.link(sun)
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=16
scene.render.resolution_x=1500
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'placed_assets.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.clip_end=10000
            space.region_3d.view_location=center
            space.region_3d.view_distance=extent*1.2
            space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
report['placed_count']=len(instances)
report['prototype_count']=len(sources)
report['missing_models']=sorted(needed-set(sources))
report['ambiguous_model_paths_skipped']=ambiguous
report['prototype_triangles']=sum(sum(len(o.data.polygons) for o in c.objects) for c in sources.values())
report['bounds_m']=[list(lo),list(hi)]
(OUT/'placement_report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'firing_range_assembled.blend'))
bpy.ops.render.render(write_still=True)
print(json.dumps({k:v for k,v in report.items() if k!='placed'}),flush=True)
