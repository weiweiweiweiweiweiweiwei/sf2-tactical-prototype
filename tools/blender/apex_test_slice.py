"""Export an 80m test region for runtime integration, not a playable map yet."""
import bpy,json,math,tempfile
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/out/apex/preview'
scratch=OUT/'export-temp'
scratch.mkdir(exist_ok=True)
tempfile.tempdir=str(scratch)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'firing_range_materials.blend'))
source=bpy.context.scene
center=Vector((-125,-20,0))
half=40
scene=bpy.data.scenes.new('80m integration test region')
bpy.context.window.scene=scene
def inside(v): return abs(v.x-center.x)<=half and abs(v.y-center.y)<=half
world=source.objects['FiringRange_BSP_World']
polys=[p for p in world.data.polygons if inside(world.matrix_world @ p.center)]
verts=[];faces=[];uvs=[];mats=[]
for p in polys:
    base=len(verts)
    faces.append(tuple(range(base,base+len(p.vertices))))
    verts.extend(world.matrix_world @ world.data.vertices[v].co-center for v in p.vertices)
    uvs.extend(tuple(world.data.uv_layers.active.data[i].uv) for i in p.loop_indices)
    mats.append(p.material_index)
mesh=bpy.data.meshes.new('Region world with UV')
mesh.from_pydata(verts,[],faces)
for mat in world.data.materials: mesh.materials.append(mat)
mesh.polygons.foreach_set('material_index',mats)
mesh.uv_layers.new(name='UV').data.foreach_set('uv',[x for uv in uvs for x in uv])
mesh.update()
assert not mesh.validate(verbose=False)
obj=bpy.data.objects.new('Region world',mesh)
scene.collection.objects.link(obj)
props=[]
for inst in source.objects:
    if 'source_prop_index' not in inst or inst.hide_render or not inside(inst.location): continue
    if any(c.hide_render for c in inst.users_collection): continue
    props.append(inst['source_prop_index'])
    for original in inst.instance_collection.objects:
        if original.type!='MESH': continue
        obj=bpy.data.objects.new(f"p{inst['source_prop_index']}_{original.name}",original.data)
        obj.matrix_world=Matrix.Translation(-center) @ inst.matrix_world @ original.matrix_world
        scene.collection.objects.link(obj)
assert props and polys
# Limit texture memory in the runtime test; source PNGs and full-scene blend remain untouched.
used_materials={m for o in scene.objects for m in o.data.materials if m}
images={n.image for m in used_materials if m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
for im in images:
    w,h=im.size
    if max(w,h)>1024:
        scale=1024/max(w,h)
        im.scale(max(1,round(w*scale)),max(1,round(h*scale)))
    im.pack()
for existing_scene in bpy.data.scenes:
    for view_layer in existing_scene.view_layers:
        for o in view_layer.objects:
            o.select_set(False,view_layer=view_layer)
for o in scene.objects: o.select_set(True)
bpy.context.view_layer.objects.active=next(iter(scene.objects))
report={'purpose':'Runtime integration test region; collision and spawn are not implemented',
        'source_center_blender_m':list(center),'nominal_region_m':[80,80],
        'boundary_policy':'World triangles selected by centroid; props selected by origin, so geometry can extend past boundary',
        'world_triangles':len(polys),'prop_instances':len(props),'mesh_objects':len(scene.objects),
        'textures':len(images),'max_texture_dimension':1024,'source_prop_indices':props,
        'coordinates':'Blender Z-up converted by glTF exporter to Y-up; horizontal center translated to zero'}
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'firing_range_test_region.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'firing_range_test_region.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
report['glb_bytes']=(OUT/'firing_range_test_region.glb').stat().st_size
(OUT/'test_region_report.json').write_text(json.dumps(report,indent=2))
# Re-import into an empty scene: check the exchanged artifact, not just exporter status.
verification=bpy.data.scenes.new('GLB verification')
bpy.context.window.scene=verification
bpy.ops.import_scene.gltf(filepath=str(OUT/'firing_range_test_region.glb'))
check=[o for o in verification.objects if o.type=='MESH']
assert check
assert len(check)==report['mesh_objects'], 'Unexpected exported objects outside test scene'
assert all(math.isfinite(c) for o in check for v in o.data.vertices for c in v.co)
report['reimport_meshes']=len(check)
report['reimport_status']='passed; finite vertex coordinates and nonempty geometry'
(OUT/'test_region_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='source_prop_indices'}),flush=True)
