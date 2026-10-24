"""Restore world UVs/material partitions and conservatively link named color maps."""
import bpy,json,struct,math,hashlib
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'tools/out/apex'
OUT=WORK/'preview'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'firing_range_assembled.blend'))
scene=bpy.context.scene
report={'linked':[],'missing':[],'ambiguous':[], 'limitations':['Base color and gloss only; original shaders, blend layers, normal maps and decal transparency not reconstructed','Unmatched materials retain neutral shading','Not integrated into gameplay']}
files=defaultdict(list)
for p in sorted(list((WORK/'materials-simple').rglob('*.png')) + list((WORK/'sample').rglob('*.png')) + list((WORK/'terrain-materials').rglob('*.png'))):
    files[p.name.lower()].append(p)
def texture(name):
    options=files.get(name.lower(),[])
    if not options: return None
    if len(options)>1 and len({hashlib.sha256(p.read_bytes()).digest() for p in options})>1:
        report['ambiguous'].append(name)
        return None
    return options[0]
def connect(mat,key):
    p=texture(key+'_col.png')
    if p is None:
        report['missing'].append({'material':mat.name,'key':key})
        return
    mat.use_nodes=True
    shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    node=mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image=bpy.data.images.load(str(p),check_existing=True)
    node.image.colorspace_settings.name='sRGB'
    mat.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value=0.7
    gloss=texture(key+'_gls.png')
    if gloss:
        g=mat.node_tree.nodes.new('ShaderNodeTexImage')
        g.image=bpy.data.images.load(str(gloss),check_existing=True)
        g.image.colorspace_settings.name='Non-Color'
        invert=mat.node_tree.nodes.new('ShaderNodeMath')
        invert.operation='SUBTRACT'
        invert.inputs[0].default_value=1
        mat.node_tree.links.new(g.outputs['Color'],invert.inputs[1])
        mat.node_tree.links.new(invert.outputs[0],shader.inputs['Roughness'])
    report['linked'].append({'material':mat.name,'file':str(p.relative_to(WORK))})
for mat in list(bpy.data.materials):
    if mat.name.startswith('Diagnostic'): continue
    connect(mat,mat.name)

folder=WORK/'map-data/wrap/maps'
stem='mp_rr_canyonlands_staging_mu1'
def lump(i):
    p=folder/f'{stem}.bsp.{i:04X}.client.bsp_lump'
    return p.read_bytes() if p.exists() else b''
positions=list(struct.iter_unpack('<3f',lump(3)))
indices=list(struct.iter_unpack('<H',lump(79)))
meshes,sorts,texdata,names=lump(80),lump(82),lump(2),lump(15)
first,count=struct.unpack_from('<2i',lump(14),24)
types={0:(72,20),0x200:(73,32),0x400:(71,20),0x600:(74,24)}
streams={i:lump(i) for i,stride in types.values()}
verts=[]; faces=[]; uvs=[]; face_mats=[]; materials=[]; material_ids={}
for mi in range(first,first+count):
    start,ntri=struct.unpack_from('<IH',meshes,mi*28)
    si,flags=struct.unpack_from('<HI',meshes,mi*28+22)
    tid=struct.unpack_from('<h',sorts,si*12)[0]
    nameoff=struct.unpack_from('<i',texdata,tid*16)[0]
    name=names[nameoff:].split(b'\0',1)[0].decode().replace('\\','/')
    if name.upper().startswith('TOOLS/'): continue
    if name not in material_ids:
        mat=bpy.data.materials.new('World_'+Path(name).name)
        connect(mat,Path(name).name)
        material_ids[name]=len(materials)
        materials.append(mat)
        mat['source_material_path']=name
    base=struct.unpack_from('<i',sorts,si*12+8)[0]
    lid,stride=types[flags & 0x600]
    stream=streams[lid]
    for ti in range(ntri):
        corners=[]
        for j in range(3):
            vi=base+indices[start+ti*3+j][0]
            pi=struct.unpack_from('<I',stream,vi*stride)[0]
            uv=struct.unpack_from('<2f',stream,vi*stride+8)
            corners.append((pi,uv))
        if len({p for p,uv in corners})<3: continue
        if not all(math.isfinite(v) for pi,uv in corners for v in (*positions[pi],*uv)): continue
        idx=len(verts)
        verts.extend(tuple(v*0.0254 for v in positions[pi]) for pi,uv in corners)
        uvs.extend((uv[0],1-uv[1]) for pi,uv in corners)
        faces.append((idx,idx+1,idx+2))
        face_mats.append(material_ids[name])
mesh=bpy.data.meshes.new('BSP_world_with_original_UV')
mesh.from_pydata(verts,[],faces)
for mat in materials: mesh.materials.append(mat)
mesh.polygons.foreach_set('material_index',face_mats)
layer=mesh.uv_layers.new(name='OriginalUV')
layer.data.foreach_set('uv',[v for uv in uvs for v in uv])
mesh.update()
assert not mesh.validate(verbose=False)
obj=scene.objects['FiringRange_BSP_World']
obj.data=mesh
obj['scope']='World model 0 with UVs and material partitions; simplified shader reconstruction'
report['world']={'triangles':len(faces),'materials':len(materials),'uv_corners':len(uvs)}
report['textures_on_disk']=sum(len(v) for v in files.values())
report['linked_material_count']=len(report['linked'])
report['missing_material_count']=len(report['missing'])
# Keep source images external to avoid duplicating all high-resolution assets into the blend.
for im in bpy.data.images:
    if im.source=='FILE' and not im.packed_file:
        im.filepath=bpy.path.relpath(bpy.path.abspath(im.filepath),start=str(OUT))
scene.render.filepath=str(OUT/'textured_overview.png')
scene.cycles.samples=8
scene.render.resolution_x=1200
scene.render.resolution_y=1100
(OUT/'material_report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'firing_range_materials.blend'))
bpy.ops.render.render(write_still=True)
print(json.dumps({k:v for k,v in report.items() if k not in ('linked','missing','ambiguous')}),flush=True)
