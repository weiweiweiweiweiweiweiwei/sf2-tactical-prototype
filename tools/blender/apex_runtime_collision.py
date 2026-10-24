"""Bake conservative 0.5m surface columns for the existing AABB character motor."""
import bpy,json,math
from pathlib import Path
from collections import defaultdict,Counter
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/out/apex/preview'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'firing_range_test_region.blend'))
scene=bpy.context.scene
step=0.5
cells=defaultdict(list)
def clip(poly,axis,value,sign):
    result=[]
    if not poly: return result
    last=poly[-1]; lastin=(last[axis]-value)*sign>=-1e-7
    for cur in poly:
        inside=(cur[axis]-value)*sign>=-1e-7
        if inside!=lastin:
            t=(value-last[axis])/(cur[axis]-last[axis])
            result.append(tuple(last[k]+t*(cur[k]-last[k]) for k in range(3)))
        if inside: result.append(cur)
        last,lastin=cur,inside
    return result
triangles=0
for oi,obj in enumerate(scene.objects):
    if obj.type!='MESH': continue
    me=obj.data; me.calc_loop_triangles()
    vs=[obj.matrix_world @ v.co for v in me.vertices]
    vs=[(v.x,v.z,-v.y) for v in vs]
    for tri in me.loop_triangles:
        mat=me.materials[tri.material_index] if tri.material_index<len(me.materials) else None
        if mat and any(w in mat.name.lower() for w in ('decal','foliage','grass','stain')): continue
        p=[vs[i] for i in tri.vertices]
        if min(v[1] for v in p)>60 or max(v[1] for v in p)<-10: continue
        x0=max(-80,math.floor(min(v[0] for v in p)/step)); x1=min(79,math.floor(max(v[0] for v in p)/step))
        z0=max(-80,math.floor(min(v[2] for v in p)/step)); z1=min(79,math.floor(max(v[2] for v in p)/step))
        for x in range(x0,x1+1):
            for z in range(z0,z1+1):
                poly=p
                for axis,val,sign in ((0,x*step,1),(0,(x+1)*step,-1),(2,z*step,1),(2,(z+1)*step,-1)):
                    poly=clip(poly,axis,val,sign)
                    if not poly: break
                if poly:
                    low=min(v[1] for v in poly); high=max(v[1] for v in poly)
                    cells[x,z].append((math.floor((low-.04)*20)/20,math.ceil((high+.04)*20)/20))
        triangles+=1
    if oi%200==0: print('BAKE',oi,len(scene.objects),flush=True)
boxes=[]
for (x,z),intervals in cells.items():
    merged=[]
    for low,high in sorted(intervals):
        if merged and low<=merged[-1][1]+.06: merged[-1][1]=max(high,merged[-1][1])
        else: merged.append([low,high])
    cells[x,z]=merged
    boxes.extend([x*step,low,z*step,(x+1)*step,high,(z+1)*step] for low,high in merged)
# Candidate nav points on surfaces with a full standing volume, sampled every 2m.
nav=[]
for x in range(-76,77,4):
    for z in range(-76,77,4):
        xx=(x+.5)*step; zz=(z+.5)*step
        for low,high in cells.get((x,z),[]):
            if high>30: continue
            near=[v for ix in range(x-1,x+2) for iz in range(z-1,z+2) for v in cells.get((ix,iz),[])]
            if any(b>high+.18 and a<high+1.9 for a,b in near): continue
            support=[max((b for a,b in cells.get((ix,iz),[]) if b<=high+.2),default=-999) for ix,iz in ((x-1,z),(x+1,z),(x,z-1),(x,z+1))]
            if any(abs(y-high)>.3 for y in support): continue
            nav.append([xx,high,zz])
assert len(nav)>20
base=Counter(round(p[1]*2)/2 for p in nav).most_common(1)[0][0]
for b in boxes: b[1]-=base;b[4]-=base
for p in nav:p[1]-=base
payload={'step':step,'visualYOffset':-base,'boxes':boxes,'nav':nav,
         'bounds':{'minX':-40,'maxX':40,'minZ':-40,'maxZ':40},
         'limitations':'Conservative 0.5m surface-column collision; decal/grass surfaces excluded. Not original engine collision.'}
target=ROOT/'assets/maps/apex-test';target.mkdir(parents=True,exist_ok=True)
(target/'collision.json').write_text(json.dumps(payload,separators=(',',':')))
(OUT/'collision_report.json').write_text(json.dumps({'triangles':triangles,'boxes':len(boxes),'nav_candidates':len(nav),'visualYOffset':-base,'step':step},indent=2))
print('DONE',len(boxes),len(nav),base,flush=True)
