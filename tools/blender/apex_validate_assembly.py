"""Final placement audit and diagnostic render; preserve ambiguous objects in a hidden collection."""
import bpy
import json
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/out/apex/preview'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'firing_range_assembled.blend'))
scene=bpy.context.scene
source=json.loads((OUT/'static_props.json').read_text())
report=json.loads((OUT/'placement_report.json').read_text())
paths=defaultdict(set)
for p in source['props']:
    paths[Path(p['model']).stem.lower()].add(p['model'].lower())
ambiguous={k:sorted(v) for k,v in paths.items() if len(v)>1}
quarantine=bpy.data.collections.new('Unresolved model names - hidden')
scene.collection.children.link(quarantine)
quarantine.hide_render=True
quarantine.hide_viewport=True
skipped=[]
sky=[]
verified=[]
for obj in list(scene.objects):
    if 'source_prop_index' not in obj:
        continue
    i=obj['source_prop_index']
    p=source['props'][i]
    assert max(abs(obj.location[j]-p['origin'][j]*0.0254) for j in range(3))<0.001
    assert abs(obj.matrix_world.to_scale().x-p['scale']*0.0254)<0.00001
    if Path(p['model']).stem.lower() in ambiguous:
        quarantine.objects.link(obj)
        scene.collection.objects.unlink(obj)
        skipped.append(i)
        continue
    if '/vistas/' in p['model'].lower():
        obj.hide_render=True
        obj.hide_set(True)
        sky.append(i)
    verified.append(i)
report.update(placed=verified,placed_count=len(verified),ambiguous_model_paths_skipped=ambiguous,
              ambiguous_instances_hidden=skipped,sky_vistas_hidden_for_diagnostic_render=sky,
              transform_audit='Every accepted instance matches source origin within 1 mm and scale within 0.00001')
report['limitations'].append('Ambiguous model-name objects preserved in hidden collection; vista models hidden for diagnostic rendering')
(OUT/'placement_report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'firing_range_assembled.blend'))
bpy.ops.render.render(write_still=True)
print(json.dumps({k:v for k,v in report.items() if k!='placed'}),flush=True)
