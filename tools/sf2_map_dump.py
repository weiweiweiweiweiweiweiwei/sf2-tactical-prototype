"""v65n An SF2 map's placed static meshes: every StaticMeshCollectionActor's StaticMeshComponents (their StaticMesh, from their
tags) with the LocalToWorld matrix the actor serializes after its tags (64 bytes per component, UE3 row-vector, cm, Z up), plus
stand-alone StaticMeshActors (Location / Rotation / DrawScale(3D)). -> tools/out/sf2/maps/<map>.json
  python tools/sf2_unlzo.py <map>  then  python tools/sf2_map_dump.py <map>"""
import sys, struct, json, math
sys.path.insert(0, 'tools')
from sf2_props import Pkg
name = sys.argv[1]; p = Pkg(f'tools/out/sf2/{name}_dec.upk'); out = []
def mesh_of(e):  # (v65v a placed archetype's component — SFStaticMeshActor — keeps its StaticMesh on the archetype: follow 'arch')
    pr = {n: v for n, i, t, v in p.props(e)}; a = e['arch']
    while (not pr.get('StaticMesh') or pr.get('StaticMesh') == 'None') and a > 0:
        ae = p.exports[a - 1]; ap = {n: v for n, i, t, v in p.props(ae)}; pr = {**ap, **pr}; pr['StaticMesh'] = ap.get('StaticMesh', pr.get('StaticMesh')); a = ae['arch']
    return pr.get('StaticMesh'), pr
def vec(v, d=(0.0, 0.0, 0.0)):  # a struct prop as read by sf2_props: tuple / list / dict / "(x, y, z)"
    if v is None or v == {}: return list(d)
    if isinstance(v, dict): return [float(v.get(k, dv)) for k, dv in zip(('X', 'Y', 'Z') if 'X' in v else ('Pitch', 'Yaw', 'Roll'), d)]
    if isinstance(v, (list, tuple)): return [float(x) for x in v]
    return [float(x) for x in str(v).strip('()').split(',')]
def actor_matrix(pr):  # v65v UE3 FRotationMatrix rows × DrawScale(3D), Location as the origin (row-vector, cm)
    loc = vec(pr.get('Location')); P, Y, R = (x * math.pi / 32768 for x in vec(pr.get('Rotation')))
    s = float(pr.get('DrawScale', 1.0)); s3 = vec(pr.get('DrawScale3D'), (1.0, 1.0, 1.0))
    sp, cp, sy, cy, sr, cr = math.sin(P), math.cos(P), math.sin(Y), math.cos(Y), math.sin(R), math.cos(R)
    rows = [[cp * cy, cp * sy, sp], [sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, -sr * cp], [-(cr * sp * cy + sr * sy), cy * sr - cr * sp * sy, cr * cp]]
    m = []
    for r, k in zip(rows, s3): m += [x * s * k for x in r] + [0.0]
    return [round(x, 4) for x in m + loc + [1.0]]
def collides(cp):  # v65v a component switched off for collision (grass, wires, decor) stays out of the game's triangle soup
    return not (cp.get('CollideActors') is False or cp.get('BlockActors') is False or str(cp.get('CollideActors')) == 'False' or str(cp.get('BlockActors')) == 'False')
ACTORS = ('StaticMeshActor', 'SFStaticMeshActor', 'InterpActor', 'KActor', 'SFKActorNoSync', 'SFKActor', 'SFBreakableActorByDamage')  # (v65w + SF2's breakable cars: the intact mesh, not the burnt one)
by_outer = {}
for k, x in enumerate(p.exports, 1): by_outer.setdefault(x['outer'], []).append(x)
for k, e in enumerate(p.exports, 1):
    c = p.clsname(e)
    if c == 'StaticMeshCollectionActor':
        pr = {n: v for n, i, t, v in p.props(e)}; at = p.o; comps = pr.get('StaticMeshComponents') or {'i': []}
        for j, ci in enumerate(comps['i']):
            if ci <= 0: continue
            m = list(struct.unpack_from('<16f', p.b, at + 64 * j)); mesh, cp = mesh_of(p.exports[ci - 1])
            if mesh and mesh != 'None': out.append({'mesh': mesh, 'm': [round(x, 4) for x in m], 'col': collides(cp)})
    elif c in ACTORS or (c.endswith('Actor') and 'KActor' in c):
        pr = {n: v for n, i, t, v in p.props(e)}
        ce = next((x for x in by_outer.get(k, []) if p.clsname(x) == 'StaticMeshComponent'), None)
        if not ce: continue
        mesh, cp = mesh_of(ce)
        if c == 'SFBreakableActorByDamage':
            ce = next((x for x in by_outer.get(k, []) if p.clsname(x) == 'StaticMeshComponent' and (mesh_of(x)[0] or '').lower().find('fire') < 0 and mesh_of(x)[0] not in (None, 'None')), None)
            if not ce: continue
            mesh, cp = mesh_of(ce)
        if mesh and mesh != 'None': out.append({'mesh': mesh, 'm': actor_matrix(pr), 'col': collides(cp), 'actor': c})
# v65v blocking volumes (SF2's own invisible walls): their brush Model's polygons (the BSP layout of tools/sf2_map_bsp.py), brush-local
# minus PrePivot, then the actor's matrix → world triangles (UE cm), collision only
blocks = []
for k, e in enumerate(p.exports, 1):
    c = p.clsname(e)
    if not c.endswith('BlockingVolume'): continue
    pr = {n: v for n, i, t, v in p.props(e)}; M = actor_matrix(pr); piv = vec(pr.get('PrePivot'))
    mdl = next((x for x in by_outer.get(k, []) if p.clsname(x) == 'Model'), None)
    if not mdl: continue
    p.props(mdl); o = p.o + 28; B = p.b
    def bulk(o):
        es, n = struct.unpack_from('<ii', B, o); return o + 8 + es * n, o + 8, n
    o, vec0, nvec = bulk(o); o, pt0, npt = bulk(o); o, nd0, nnd = bulk(o)
    o += 4; nsurf = struct.unpack_from('<i', B, o)[0]; o += 4 + 60 * nsurf
    es, nvert = struct.unpack_from('<ii', B, o); vt0 = o + 8
    tri = []
    for q in range(nnd):
        a = nd0 + 64 * q; pool = struct.unpack_from('<i', B, a + 16)[0]; nv = B[a + 54]
        if nv < 3 or pool + nv > nvert: continue
        pts = []
        for j in range(nv):
            x, y, z = struct.unpack_from('<3f', B, pt0 + 12 * struct.unpack_from('<i', B, vt0 + es * (pool + j))[0])
            x, y, z = x - piv[0], y - piv[1], z - piv[2]
            pts.append([x * M[0] + y * M[4] + z * M[8] + M[12], x * M[1] + y * M[5] + z * M[9] + M[13], x * M[2] + y * M[6] + z * M[10] + M[14]])
        for j in range(1, nv - 1): tri += pts[0] + pts[j] + pts[j + 1]
    if tri: blocks.append([round(v, 1) for v in tri])
# v65o player starts (team, UE location / yaw) and ladder volumes (location) for the game's meta
starts, ladders = [], []
for e in p.exports:
    c = p.clsname(e)
    if 'PlayerStart' in c or 'Ladder' in c and c.endswith('Volume'):
        pr = {n: v for n, i, t, v in p.props(e)}; loc = pr.get('Location')
        if not isinstance(loc, (list, tuple)): loc = [float(x) for x in str(loc).strip('()').split(',')] if loc else None
        if not loc: continue
        if 'PlayerStart' in c:
            rot = pr.get('Rotation'); yaw = int(str(rot).strip('()').split(',')[1]) if rot else 0
            starts.append({'cls': c, 'team': int(pr.get('TeamIndex', 0)), 'loc': loc, 'yaw': yaw})
        else: ladders.append({'loc': loc})
json.dump({'placed': out, 'starts': starts, 'ladders': ladders, 'blocks': blocks}, open(f'tools/out/sf2/maps/{name}.json', 'w'))
print('starts', [(s['cls'], s['team']) for s in starts], 'ladders', len(ladders))
print(name, len(out), 'placements,', len({o['mesh'] for o in out}), 'meshes,', sum(not o['col'] for o in out), 'without collision,', len(blocks), 'blocking volumes;', __import__('collections').Counter(o.get('actor', 'collection') for o in out))
