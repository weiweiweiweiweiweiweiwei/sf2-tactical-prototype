"""v65n An SF2 map's placed static meshes: every StaticMeshCollectionActor's StaticMeshComponents (their StaticMesh, from their
tags) with the LocalToWorld matrix the actor serializes after its tags (64 bytes per component, UE3 row-vector, cm, Z up), plus
stand-alone StaticMeshActors (Location / Rotation / DrawScale(3D)). -> tools/out/sf2/maps/<map>.json
  python tools/sf2_unlzo.py <map>  then  python tools/sf2_map_dump.py <map>"""
import sys, struct, json, math
sys.path.insert(0, 'tools')
from sf2_props import Pkg
name = sys.argv[1]; p = Pkg(f'tools/out/sf2/{name}_dec.upk'); out = []
def mesh_of(e):
    pr = {n: v for n, i, t, v in p.props(e)}
    return pr.get('StaticMesh'), pr
for e in p.exports:
    c = p.clsname(e)
    if c == 'StaticMeshCollectionActor':
        pr = {n: v for n, i, t, v in p.props(e)}; at = p.o; comps = pr.get('StaticMeshComponents') or {'i': []}
        for k, ci in enumerate(comps['i']):
            if ci <= 0: continue
            m = list(struct.unpack_from('<16f', p.b, at + 64 * k)); mesh, _ = mesh_of(p.exports[ci - 1])
            if mesh and mesh != 'None': out.append({'mesh': mesh, 'm': [round(x, 4) for x in m]})
    elif c in ('StaticMeshActor', 'InterpActor', 'KActor'):
        pr = {n: v for n, i, t, v in p.props(e)}
        comp = pr.get('StaticMeshComponent') or pr.get('CollisionComponent')
        ce = next((x for x in p.exports if x['name'] == comp and p.objname(x['outer']) == e['name']), None) if isinstance(comp, str) else None
        if not ce: continue
        mesh, cp = mesh_of(ce)
        loc = pr.get('Location', {}); rot = pr.get('Rotation', {}); ds = pr.get('DrawScale', 1.0); d3 = pr.get('DrawScale3D', {})
        out.append({'mesh': mesh, 'loc': loc, 'rot': rot, 'scale': ds, 'scale3d': d3, 'actor': c})
json.dump(out, open(f'tools/out/sf2/maps/{name}.json', 'w'))
print(name, len(out), 'placements,', len({o['mesh'] for o in out}), 'meshes')
