"""Stream simplified full-scene triangles for the compiled conservative rasterizer."""
import bpy,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'tools/out/apex/preview'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'full_collision_work.blend'))
cache={};count=0
with (OUT/'collision-triangles.bin').open('wb') as f:
    for oi,o in enumerate(bpy.context.scene.objects):
        if o.type!='MESH':continue
        me=o.data
        if me.name not in cache:
            me.calc_loop_triangles()
            vs=np.empty(len(me.vertices)*3,dtype=np.float32);me.vertices.foreach_get('co',vs);vs=vs.reshape(-1,3)
            ids=[]
            for t in me.loop_triangles:
                m=me.materials[t.material_index] if t.material_index<len(me.materials) else None
                # Grass blended into terrain is solid ground; only actual vegetation cards are excluded.
                if m and any(k in m.name.lower() for k in ('decal','foliage','grass_clump','stain','stencil','atmosphere','fog','godray','lightshaft','water','sky')):continue
                ids.append(tuple(t.vertices))
            cache[me.name]=(vs,np.asarray(ids,dtype=np.int32).reshape(-1,3))
        vs,ids=cache[me.name]
        if not len(ids):continue
        matrix=np.asarray(o.matrix_world,dtype=np.float32)
        v=vs@matrix[:3,:3].T+matrix[:3,3]
        v=v[:,[0,2,1]];v[:,2]*=-1;v[:,1]-=1
        tri=np.ascontiguousarray(v[ids],dtype='<f4');f.write(tri.tobytes());count+=len(ids)
        if oi%2000==0:print('TRIANGLE_STREAM',oi,count,flush=True)
print('TRIANGLES_DONE',count,flush=True)
