"""Build simplified collision data in an isolated scene, reusing existing visual exports."""
import sys
from pathlib import Path
script=Path(__file__).with_name('apex_full.py').read_text()
exec(compile(script[:script.index('materials={')],__file__,'exec'))
full=scene
scratch=bpy.data.scenes.new('Single prototype collision simplification')
bpy.context.window.scene=scratch
cache={}
for o in full.objects:
    if o.name=='Full world':continue
    key=o.data.name
    if key not in cache:
        if len(o.data.polygons)>600:
            temp=bpy.data.objects.new('Collision prototype',o.data.copy());scratch.collection.objects.link(temp)
            bpy.context.view_layer.objects.active=temp;temp.select_set(True)
            mod=temp.modifiers.new('Collision simplification','DECIMATE');mod.ratio=max(.04,600/len(temp.data.polygons))
            bpy.ops.object.modifier_apply(modifier=mod.name)
            cache[key]=temp.data
            bpy.data.objects.remove(temp,do_unlink=True)
        else:cache[key]=o.data
        if len(cache)%50==0:print('COLLISION_PROTOTYPES',len(cache),flush=True)
    o.data=cache[key]
bpy.context.window.scene=full
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'full_collision_work.blend'))
print('COLLISION_WORK_READY',len(cache),flush=True)
