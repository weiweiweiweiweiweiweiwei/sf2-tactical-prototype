"""Improve the existing test region only; keep geometry and collision unchanged."""
import bpy, json, hashlib, tempfile
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'tools/out/apex'
OUT=WORK/'preview'
tempfile.tempdir=str(OUT/'export-temp')
bpy.ops.wm.open_mainfile(filepath=str(OUT/'firing_range_test_region.blend'))
scene=bpy.context.scene
files=defaultdict(list)
for folder in ['rsx-2.4.0/exported_files','materials-simple','terrain-materials','sample']:
    for p in (WORK/folder).rglob('*.png'): files[p.name.lower()].append(p)
report={'linked':[],'ambiguous':[],'fallback':[],'alpha':[],'scope':'Existing test region; exact-name color matching, simplified materials, no geometry edits'}
def find(name):
    paths=files.get(name.lower(),[])
    if not paths:return None
    if len({hashlib.sha256(p.read_bytes()).digest() for p in paths})>1:
        report['ambiguous'].append(name);return None
    return paths[0]
materials={m for o in scene.objects if o.type=='MESH' for m in o.data.materials if m}
for mat in sorted(materials,key=lambda m:m.name):
    mat.use_nodes=True
    shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    key=mat.name.removeprefix('World_')
    link=next(iter(shader.inputs['Base Color'].links),None)
    tex=link.from_node if link and link.from_node.type=='TEX_IMAGE' else None
    if tex is None:
        p=find(key+'_col.png')
        if p:
            tex=mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image=bpy.data.images.load(str(p),check_existing=True)
            tex.image.colorspace_settings.name='sRGB'
            w,h=tex.image.size
            if max(w,h)>512:tex.image.scale(max(1,round(w*512/max(w,h))),max(1,round(h*512/max(w,h))))
            tex.image.pack()
            mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
            shader.inputs['Roughness'].default_value=.8
            report['linked'].append({'material':mat.name,'source':str(p.relative_to(WORK))})
        else:
            name=key.lower()
            color=(.22,.25,.26)
            if any(k in name for k in ['sand','dirt','rock','cliff']):color=(.32,.23,.13)
            elif any(k in name for k in ['concrete','cement']):color=(.3,.29,.26)
            elif any(k in name for k in ['rubber','asphalt']):color=(.055,.06,.065)
            elif any(k in name for k in ['tarp','grass']):color=(.10,.16,.07)
            elif 'red' in name:color=(.3,.055,.035)
            shader.inputs['Base Color'].default_value=(*color,1)
            shader.inputs['Roughness'].default_value=.85
            report['fallback'].append(mat.name)
    if tex and tex.image and any(k in key.lower() for k in ['decal','stain','grass','chain_link','alpha','stencil']):
        pixels=tex.image.pixels
        step=max(1,len(pixels)//4//4096)
        if any(pixels[i*4+3]<.9 for i in range(0,len(pixels)//4,step)):
            mat.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
            mat.surface_render_method='DITHERED'
            report['alpha'].append(mat.name)
for s in bpy.data.scenes:
    for vl in s.view_layers:
        for o in vl.objects:o.select_set(False,view_layer=vl)
for o in scene.objects:o.select_set(True)
bpy.context.view_layer.objects.active=next(iter(scene.objects))
report['materials']=len(materials)
report['mesh_objects']=sum(o.type=='MESH' for o in scene.objects)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'firing_range_test_region.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/maps/apex-test/region.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
report['glb_bytes']=(ROOT/'assets/maps/apex-test/region.glb').stat().st_size
(OUT/'material_pass_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:len(v) if isinstance(v,list) else v for k,v in report.items()}),flush=True)
