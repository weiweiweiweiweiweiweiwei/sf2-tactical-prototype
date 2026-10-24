"""Losslessly join adjacent boxes with identical cross sections."""
import json
from pathlib import Path
from collections import defaultdict
p=Path(__file__).resolve().parents[1]/'assets/maps/apex-test/collision.json'
data=json.loads(p.read_text())
before=len(data['boxes'])
boxes=data['boxes']
for axis in (0,2,0):
    groups=defaultdict(list)
    other=[i for i in range(6) if i not in (axis,axis+3)]
    for b in boxes: groups[tuple(b[i] for i in other)].append(b)
    result=[]
    for group in groups.values():
        current=None
        for b in sorted(group,key=lambda b:b[axis]):
            if current is not None and abs(current[axis+3]-b[axis])<1e-7:
                current[axis+3]=b[axis+3]
            else:
                current=b.copy();result.append(current)
    boxes=result
data['boxes']=boxes
data['boxMerge']={'before':before,'after':len(boxes),'method':'Exact adjacent unions; no volume added or removed'}
p.write_text(json.dumps(data,separators=(',',':')))
print(data['boxMerge'])
