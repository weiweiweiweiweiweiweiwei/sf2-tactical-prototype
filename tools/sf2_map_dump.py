"""v65n An SF2 map's placed static meshes: every StaticMeshCollectionActor's StaticMeshComponents (their StaticMesh, from their
tags) with the LocalToWorld matrix the actor serializes after its tags (64 bytes per component, UE3 row-vector, cm, Z up), plus
stand-alone StaticMeshActors (Location / Rotation / DrawScale(3D)). -> tools/out/sf2/maps/<map>.json
  python tools/sf2_unlzo.py <map>  then  python tools/sf2_map_dump.py <map>"""
import sys, struct, json, math
sys.path.insert(0, 'tools')
from sf2_props import Pkg
from sf2_lightmap import mesh_lightmap, vertex_irradiance
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
def lm_of(ce):  # v65z SF2's baked light on this placement (tools/sf2_lightmap.py): a SimpleLightmap rect, or one irradiance per vertex
    lm = mesh_lightmap(p, ce)
    if not lm: return None
    if lm['t'] == 2: return {'t': 2, 'tex': PKGNAME + '/' + lm['tex'], 's': lm['s'], 'cs': lm['cs'], 'cb': lm['cb']}
    return {'t': 1, 'v': vertex_irradiance(lm)}
PKGNAME = name
def place(out):  # v65y one package's placed meshes (the global p), appended to out
    by_outer = {}
    for k, x in enumerate(p.exports, 1): by_outer.setdefault(x['outer'], []).append(x)
    for k, e in enumerate(p.exports, 1):
        c = p.clsname(e)
        if c == 'StaticMeshCollectionActor':
            pr = {n: v for n, i, t, v in p.props(e)}; at = p.o; comps = pr.get('StaticMeshComponents') or {'i': []}
            for j, ci in enumerate(comps['i']):
                if ci <= 0: continue
                m = list(struct.unpack_from('<16f', p.b, at + 64 * j)); mesh, cp = mesh_of(p.exports[ci - 1])
                if mesh and mesh != 'None': out.append({'mesh': mesh, 'm': [round(x, 4) for x in m], 'col': collides(cp), 'lm': lm_of(p.exports[ci - 1])})
        elif c in ACTORS or (c.endswith('Actor') and 'KActor' in c):
            if e['flags'] & 0x400000000: continue  # v65y RF_ArchetypeObject: a prefab's template (humvee_01_Arc0 …) at the origin, not placed
            pr = {n: v for n, i, t, v in p.props(e)}
            ce = next((x for x in by_outer.get(k, []) if p.clsname(x) == 'StaticMeshComponent'), None)
            if not ce: continue
            mesh, cp = mesh_of(ce)
            if c == 'SFBreakableActorByDamage':
                ce = next((x for x in by_outer.get(k, []) if p.clsname(x) == 'StaticMeshComponent' and (mesh_of(x)[0] or '').lower().find('fire') < 0 and mesh_of(x)[0] not in (None, 'None')), None)
                if not ce: continue
                mesh, cp = mesh_of(ce)
            if mesh and mesh != 'None': out.append({'mesh': mesh, 'm': actor_matrix(pr), 'col': collides(cp), 'actor': c, 'lm': lm_of(ce)})
    return by_outer
by_outer = place(out)
# v65y --with <sublevel>…: the sublevels SF2 streams in for play (Desert Camp: Desertcamp_ob — the tank hull, the scaled-up hangar, door
# frames and stairs); a sublevel's mesh replaces the persistent level's copy of the same mesh within 1 m (the redone placement)
main_p = p
for sub in (sys.argv[sys.argv.index('--with') + 1:] if '--with' in sys.argv else []):
    p = Pkg(f'tools/out/sf2/{sub}_dec.upk'); PKGNAME = sub; extra = []; place(extra)
    for x in extra:
        t = x['m'][12:15]
        same = [o for o in out if o['mesh'] == x['mesh'] and sum((a - b) ** 2 for a, b in zip(o['m'][12:15], t)) < 100 ** 2]
        if any(o['col'] for o in same): x['col'] = True  # (the sublevel's copies have collision off: the one they replace had it)
        if not x.get('lm'): x['lm'] = next((o['lm'] for o in same if o.get('lm')), None)  # (v65z …and no baked light: the same mesh's, same vertex order)
        out[:] = [o for o in out if not any(o is q for q in same)]
    out += extra; print(sub, len(extra), 'placements merged')
p = main_p; by_outer = {}
for k, x in enumerate(p.exports, 1): by_outer.setdefault(x['outer'], []).append(x)
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
# v65z UE3 Terrain (tower / Cannon's ground): after its tags Heights<WORD>[NumVerticesX × NumVerticesY], InfoData<BYTE> (bit 0: a hole),
# AlphaMaps[]<BYTE> (one per layer, Layers[i].AlphaMapIndex); vertex (i, j) at Location + (i × DrawScale3D.X, j × DrawScale3D.Y) cm,
# height (h − 32768) / 128 × DrawScale3D.Z cm. A layer's look: TerrainLayerSetup → TerrainMaterial (Material, MappingScale 4, MappingRotation)
terrain = None
for e in p.exports:
    if p.clsname(e) != 'Terrain': continue
    pr = {n: v for n, i, t, v in p.props(e)}; o = p.o; B = p.b
    nx, ny = int(pr['NumVerticesX']), int(pr['NumVerticesY']); n = struct.unpack_from('<i', B, o)[0]; hs = list(struct.unpack_from(f'<{n}H', B, o + 4)); o += 4 + 2 * n
    m = struct.unpack_from('<i', B, o)[0]; holes = [i for i, f in enumerate(B[o + 4:o + 4 + m]) if f & 1]; o += 4 + m
    k = struct.unpack_from('<i', B, o)[0]; o += 4; alphas = []
    for _ in range(k): c = struct.unpack_from('<i', B, o)[0]; alphas.append(list(B[o + 4:o + 4 + c])); o += 4 + c
    byname = {x['name']: x for x in p.exports}; layers = []
    for L in pr.get('Layers', []):
        st = byname.get(L['Setup']); tm = {}
        if st:
            mats = {n2: v for n2, i, t, v in p.props(st)}.get('Materials') or []
            tmn = mats[0].get('Material') if mats and isinstance(mats[0], dict) else None
            if tmn and tmn in byname: tm = {n2: v for n2, i, t, v in p.props(byname[tmn])}
        ai = L.get('AlphaMapIndex', -1)
        layers.append({'mat': tm.get('Material'), 'scale': float(tm.get('MappingScale', 4.0)), 'rot': float(tm.get('MappingRotation', 0.0)), 'alpha': alphas[ai] if 0 <= ai < len(alphas) else None})
    terrain = {'nx': nx, 'ny': ny, 'loc': vec(pr.get('Location')), 'scale': vec(pr.get('DrawScale3D'), (1.0, 1.0, 1.0)), 'h': hs, 'holes': holes, 'layers': layers}
    print('terrain', nx, 'x', ny, 'layers', [(L['mat'], L['scale'], L['rot'], bool(L['alpha'])) for L in layers], 'holes', len(holes))
    break
json.dump({'placed': out, 'starts': starts, 'ladders': ladders, 'blocks': blocks, 'terrain': terrain}, open(f'tools/out/sf2/maps/{name}.json', 'w'))
print('starts', [(s['cls'], s['team']) for s in starts], 'ladders', len(ladders))
print(name, len(out), 'placements,', len({o['mesh'] for o in out}), 'meshes,', sum(not o['col'] for o in out), 'without collision,', len(blocks), 'blocking volumes;', __import__('collections').Counter(o.get('actor', 'collection') for o in out))
