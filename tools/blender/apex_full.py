"""Reuse the saved assembly and materials; export full extent with shared meshes."""
import bpy,json,math,re,tempfile
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/out/apex/preview'
DEST=ROOT/'assets/maps/apex-full';DEST.mkdir(exist_ok=True)
tempfile.tempdir=str(OUT/'export-temp')
bpy.ops.wm.open_mainfile(filepath=str(OUT/'firing_range_test_region.blend'))
source=bpy.data.scenes['Firing range - actual static placements']
bpy.context.window.scene=source
bpy.context.view_layer.update()
scene=bpy.data.scenes.new('Full range runtime export')
bpy.context.window.scene=scene
center=Vector((-125,-20,0))
world=source.objects['FiringRange_BSP_World']
obj=bpy.data.objects.new('Full world',world.data)
obj.matrix_world=Matrix.Translation(-center)@world.matrix_basis
scene.collection.objects.link(obj)
count=0
for inst in source.objects:
    if 'source_prop_index' not in inst or inst.hide_render:continue
    if any(c.hide_render for c in inst.users_collection):continue
    count+=1
    for original in inst.instance_collection.objects:
        if original.type!='MESH':continue
        obj=bpy.data.objects.new(f"p{inst['source_prop_index']}_{original.name}",original.data)
        obj.matrix_world=Matrix.Translation(-center)@inst.matrix_basis@original.matrix_basis
        scene.collection.objects.link(obj)
materials={m for o in scene.objects for m in o.data.materials if m}
images={n.image for m in materials if m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
for im in images:
    w,h=im.size
    if max(w,h)>512:im.scale(max(1,round(w*512/max(w,h))),max(1,round(h*512/max(w,h))))
    im.pack()
for s in bpy.data.scenes:
    for vl in s.view_layers:
        for o in vl.objects:o.select_set(False,view_layer=vl)
for o in scene.objects:o.select_set(True)
bpy.context.view_layer.objects.active=next(iter(scene.objects))
bpy.ops.export_scene.gltf(filepath=str(DEST/'scene.gltf'),export_format='GLTF_SEPARATE',export_texture_dir='textures',use_selection=True,use_active_scene=True)
verts=[world.matrix_world@Vector(c)-center for c in world.bound_box]
bounds={'minX':math.floor(min(v.x for v in verts)),'maxX':math.ceil(max(v.x for v in verts)),'minZ':math.floor(min(-v.y for v in verts)),'maxZ':math.ceil(max(-v.y for v in verts))}
doors=[]
ent=(ROOT/'tools/out/apex/map-data/wrap/maps/mp_rr_canyonlands_staging_mu1_script.ent').read_text()
for block in re.findall(r'\{([^{}]*)\}',ent):
    d=dict(re.findall(r'"([^"\n]+)"\s+"([^"\n]*)"',block))
    if d.get('classname')!='prop_door':continue
    p=[float(x)*.0254 for x in d['origin'].split()];angles=[float(x) for x in d.get('angles','0 0 0').split()]
    doors.append({'id':d.get('le_guid',str(len(doors))),'x':p[0]+125,'y':p[2]-1,'z':-p[1]-20,'yaw':math.radians(angles[1]),'model':d.get('model','')})
report={'bounds':bounds,'props':count,'mesh_objects':len(scene.objects),'doors':doors,'killY':math.floor(min(v.z for v in verts))-21,'visualYOffset':-1}
(DEST/'manifest.json').write_text(json.dumps(report,separators=(',',':')))
print('FULL_EXPORT',count,len(scene.objects),bounds,'doors',len(doors),flush=True)
