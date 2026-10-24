"""Apply the tested column baker over the full extent with a coarser 1m grid."""
from pathlib import Path
import json
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
source=(ROOT/'tools/blender/apex_runtime_collision.py').read_text()
source=source[:source.index('# Candidate nav points')]
source=source.replace("firing_range_test_region.blend","full_collision_work.blend").replace('step=0.5','step=1.0')
source=source.replace("if min(v[1] for v in p)>60 or max(v[1] for v in p)<-10: continue","if False: continue")
source=source.replace('max(-80,math.floor(min(v[0] for v in p)/step))','math.floor(min(v[0] for v in p)/step)').replace('min(79,math.floor(max(v[0] for v in p)/step))','math.floor(max(v[0] for v in p)/step)')
source=source.replace('max(-80,math.floor(min(v[2] for v in p)/step))','math.floor(min(v[2] for v in p)/step)').replace('min(79,math.floor(max(v[2] for v in p)/step))','math.floor(max(v[2] for v in p)/step)')
fast='''        if (x1-x0+1)*(z1-z0+1)>16:
            xx,zz=np.meshgrid(np.arange(x0,x1+1),np.arange(z0,z1+1),indexing='ij')
            X=(xx+.5)*step;Z=(zz+.5)*step
            a,b,c=map(np.asarray,p);normal=np.cross(b-a,c-a)
            mask=np.ones(X.shape,dtype=bool)
            area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0])
            if abs(area)>1e-8:
                sign=1 if area>0 else -1
                for u,v in ((a,b),(b,c),(c,a)):
                    dx=v[0]-u[0];dz=v[2]-u[2]
                    mask &= sign*(dx*(Z-u[2])-dz*(X-u[0]))>=-(abs(dx)+abs(dz))*step*.5-1e-7
            ymin=min(v[1] for v in p);ymax=max(v[1] for v in p)
            if abs(normal[1])>1e-6:
                Y=a[1]-(normal[0]*(X-a[0])+normal[2]*(Z-a[2]))/normal[1]
                pad=(abs(normal[0])+abs(normal[2]))/abs(normal[1])*step*.5
                lows=np.maximum(ymin,Y-pad);highs=np.minimum(ymax,Y+pad)
                mask &= lows<=highs+1e-7
            else:
                lows=np.full(X.shape,ymin);highs=np.full(X.shape,ymax)
            for ix,iz,low,high in zip(xx[mask],zz[mask],lows[mask],highs[mask]):
                cells[int(ix),int(iz)].append((math.floor((low-.04)*20)/20,math.ceil((high+.04)*20)/20))
            triangles+=1
            continue
'''
source=source.replace('        for x in range(x0,x1+1):',fast+'        for x in range(x0,x1+1):')
exec(compile(source,__file__,'exec'))
# Keep the already verified fine collision in the combat village; coarse full-map data elsewhere.
fine=json.loads((ROOT/'assets/maps/apex-test/collision.json').read_text())
boxes=[b for b in boxes if b[3]<=-40 or b[0]>=40 or b[5]<=-40 or b[2]>=40]
for b in boxes:b[1]-=1;b[4]-=1
boxes.extend(fine['boxes'])
from collections import defaultdict
before=len(boxes)
for axis in (0,2,0):
    groups=defaultdict(list)
    other=[i for i in range(6) if i not in (axis,axis+3)]
    for b in boxes:groups[tuple(b[i] for i in other)].append(b)
    result=[]
    for group in groups.values():
        current=None
        for b in sorted(group,key=lambda b:b[axis]):
            if current is not None and abs(current[axis+3]-b[axis])<1e-7:current[axis+3]=b[axis+3]
            else:current=b.copy();result.append(current)
    boxes=result
manifest=json.loads((ROOT/'assets/maps/apex-full/manifest.json').read_text())
payload={'step':1,'visualYOffset':-1,'boxes':boxes,'nav':fine['nav'],'bounds':manifest['bounds'],'limitations':'Full extent approximate 1m collision, simplified props; village retains verified 0.5m collision. Bot navigation remains in village.'}
(ROOT/'assets/maps/apex-full/collision.json').write_text(json.dumps(payload,separators=(',',':')))
print('FULL_COLLISION_DONE',before,len(boxes),flush=True)
