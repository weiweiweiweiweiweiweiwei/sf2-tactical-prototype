"""v65n An SF2 map's BSP geometry (floors, walls: the level's Model — UModel does not export it). UE3 v904 / licensee 14 layout,
found on Alcatraz: after the tags, Bounds (28 bytes), Vectors and Points (bulk: elem 12), Nodes (bulk: elem 64), an int, Surfs
(count + 60 bytes each: Material, PolyFlags, pBase, vNormal, vTextureU, vTextureV, iBrushPoly, Actor, Plane[4], ShadowMapScale,
LightingChannels, iLightmassIndex), Verts (bulk: elem 24, pVertex first). A node is a polygon: Points[Verts[iVertPool + k].pVertex]
(k < NumVertices, byte 54 of the node; iVertPool at 16, iSurf at 20). UVs in texels from the surface's base point and U / V vectors.
-> tools/out/sf2/maps/<map>_bsp.json (glTF metres, Y up: (x, z, −y) / 100; triangles grouped by material).
  python tools/sf2_map_bsp.py <map>"""
import sys, struct, json, collections
sys.path.insert(0, 'tools')
from sf2_props import Pkg
from sf2_lightmap import model_elements
name = sys.argv[1]; p = Pkg(f'tools/out/sf2/{name}_dec.upk'); B = p.b
def chain(i):
    out = []
    while i:
        m = p.imports[-i - 1] if i < 0 else p.exports[i - 1]; out.append(m['name']); i = m['outer']
    return out[0] if out else 'None'
models = [e for e in p.exports if p.clsname(e) == 'Model' and p.objname(e['outer']) == 'PersistentLevel']
groups = collections.defaultdict(lambda: {'pos': [], 'nrm': [], 'uv': [], 'uv1': []}); tris = 0
# v65z each node's baked light (tools/sf2_lightmap.py): the ModelComponent element that lists it — its SimpleLightmap, scale, rect
node_lm = {}
for e in p.exports:
    if p.clsname(e) == 'ModelComponent' and p.objname(e['outer']) == 'PersistentLevel':
        for el in model_elements(p, e):
            if el['lm'] and el['lm']['t'] == 2:
                for nd in el['nodes']: node_lm[nd] = el['lm']
for e in models:
    p.props(e); o = p.o + 28
    def bulk(o, es_exp):
        es, n = struct.unpack_from('<ii', B, o); assert es == es_exp, (es, es_exp); return o + 8 + es * n, o + 8, n
    o, vec0, nvec = bulk(o, 12); o, pt0, npt = bulk(o, 12); o, nd0, nnd = bulk(o, 64)
    o += 4; nsurf = struct.unpack_from('<i', B, o)[0]; sf0 = o + 4; o = sf0 + 60 * nsurf
    es, nvert = struct.unpack_from('<ii', B, o); vt0 = o + 8; assert es == 24
    V = lambda i: struct.unpack_from('<3f', B, vec0 + 12 * i); P = lambda i: struct.unpack_from('<3f', B, pt0 + 12 * i)
    for k in range(nnd):
        a = nd0 + 64 * k; pool, isurf = struct.unpack_from('<ii', B, a + 16); nv = B[a + 54]
        if nv < 3 or not (0 <= isurf < nsurf) or pool + nv > nvert: continue
        s = struct.unpack_from('<8i', B, sf0 + 60 * isurf); mat, flags, pbase, vnorm, vu, vv = s[0], s[1], s[2], s[3], s[4], s[5]
        if flags & 1: continue  # PF_Invisible
        if chain(mat) in ('RemoveSurfaceMaterial', 'None'): continue  # (v65z 'None': a volume's brush faces — tower has 10 level models, its volumes among them)  # (the never-drawn outer faces of subtracted brushes)
        pts = [P(struct.unpack_from('<i', B, vt0 + 24 * (pool + j))[0]) for j in range(nv)]; ids = list(range(nv))
        base, U, Vv, N = P(pbase), V(vu), V(vv), V(vnorm)
        lm = node_lm.get(k); g = groups[chain(mat) + ('|' + name + '/' + lm['tex'] + '|' + ','.join(map(str, lm['s'])) if lm else '')]
        stc = lambda j: struct.unpack_from('<2f', B, vt0 + 24 * (pool + j) + 8)
        cv = lambda q: [q[0] / 100, q[2] / 100, -q[1] / 100]
        uv = lambda q: [sum((q[i] - base[i]) * U[i] for i in range(3)), sum((q[i] - base[i]) * Vv[i] for i in range(3))]
        # v65v wind each polygon by its node's plane (bytes 0–15: X, Y, Z, W), not one fixed order: some nodes are stored the other way
        # round, and a reversed floor read as a ceiling (Desert Camp: the Bravo base's floor blocked bots, a soldier fell through it)
        pl = struct.unpack_from('<3f', B, a); g3 = [cv(q) for q in pts]; ngl = [pl[0], pl[2], -pl[1]]
        nw = [0.0, 0.0, 0.0]
        for j in range(nv):
            c0, c1 = g3[j], g3[(j + 1) % nv]; nw[0] += (c0[1] - c1[1]) * (c0[2] + c1[2]); nw[1] += (c0[2] - c1[2]) * (c0[0] + c1[0]); nw[2] += (c0[0] - c1[0]) * (c0[1] + c1[1])
        if nw[0] * ngl[0] + nw[1] * ngl[1] + nw[2] * ngl[2] < 0: pts = pts[::-1]; ids = ids[::-1]
        for j in range(1, nv - 1):  # fan, counter-clockwise about the plane's normal (glTF front face)
            for q, qi in ((pts[0], ids[0]), (pts[j], ids[j]), (pts[j + 1], ids[j + 1])):
                g['pos'] += cv(q); g['nrm'] += [pl[0], pl[2], -pl[1]]; g['uv'] += uv(q)
                if lm: t = stc(qi); g['uv1'] += [t[0] * lm['cs'][0] + lm['cb'][0], t[1] * lm['cs'][1] + lm['cb'][1]]
            tris += 1
json.dump({k: v for k, v in groups.items()}, open(f'tools/out/sf2/maps/{name}_bsp.json', 'w'))
print(name, 'BSP', len(models), 'models,', tris, 'triangles,', len(groups), 'materials:', ', '.join(list(groups)[:6]))
