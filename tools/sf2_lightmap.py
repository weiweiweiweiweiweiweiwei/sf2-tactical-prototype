"""v65z Special Force 2's baked lighting (UE3 v904 / licensee 14, read on Desert Camp) — the native data after the tags of
  * a StaticMeshComponent: LODData count (1), ShadowMaps[], ShadowVertexBuffers[], then an FLightMapRef:
      type 0 none · 1 LightMap1D (per vertex): LightGuids[], Owner, bulk (flags, count, size, offset) of `count` samples of 8 bytes
        — two FColors (B, G, R, A): NormalizedAverageColor and DirectionalMax (one intensity per basis direction in R / G / B) —
        then 3 ScaleVectors (3 floats each) · 2 LightMap2D: LightGuids[], 3 × (LightMapTexture2D, ScaleVector) —
        NormalizedAverageColor, DirectionalMaxComponent, SimpleLightmap — then CoordinateScale, CoordinateBias (2 floats each)
  * a ModelComponent (BSP): Model, ZoneIndex, an int, Elements[]{FLightMapRef, Component, Material, Nodes<WORD>, ShadowMaps[],
    IrrelevantLights<Guid>}, ComponentIndex, Nodes<WORD>; a BSP vertex (FVert, 24 bytes) carries its ShadowTexCoord at byte 8
v65z the game lights directionally: NormalizedAverageColor × Σ DirectionalMax_i · max(0, n·B_i)² over the HL2 basis B_i in the
surface's tangent space (n from its normal map), × 1.2 — at a flat normal that is the SimpleLightmap (measured: 1.02–1.31, median 1.2); the lightmap uv is the mesh's TEXCOORD_1 (BSP: ShadowTexCoord) × CoordinateScale + CoordinateBias."""
import struct


def _ref(p, b, o):
    typ = struct.unpack_from('<i', b, o)[0]; o += 4
    if typ == 0: return None, o
    ng = struct.unpack_from('<i', b, o)[0]; o += 4 + 16 * ng
    if typ == 2:
        co = []
        for _ in range(3): co.append((p.objname(struct.unpack_from('<i', b, o)[0]), struct.unpack_from('<3f', b, o + 4))); o += 16
        cs, cb = struct.unpack_from('<2f', b, o), struct.unpack_from('<2f', b, o + 8); o += 16
        r4 = lambda v: [round(x, 4) for x in v]  # (v65z the directional pair too: NormalizedAverageColor, DirectionalMaxComponent)
        return {'t': 2, 'tex': co[2][0], 's': r4(co[2][1]), 'nac': co[0][0], 'ns': r4(co[0][1]), 'max': co[1][0], 'ms': r4(co[1][1]), 'cs': list(cs), 'cb': list(cb)}, o
    if typ == 1:
        o += 4  # Owner
        flags, cnt, size, _ = struct.unpack_from('<4i', b, o); o += 16
        if size != 8 * cnt: raise ValueError('vertex light map: %d bytes for %d samples' % (size, cnt))
        raw = b[o:o + size]; o += size
        sc = [struct.unpack_from('<3f', b, o + 12 * i) for i in range(3)]; o += 36
        return {'t': 1, 'n': cnt, 'raw': raw, 's': sc}, o
    raise ValueError('light map type %d' % typ)


def mesh_lightmap(p, e):
    """the light map of one StaticMeshComponent export (None when it has none)"""
    p.props(e); b = p.b; o = p.o; end = e['off'] + e['size']
    if end - o < 16: return None
    if struct.unpack_from('<i', b, o)[0] != 1: return None
    o += 4; ns = struct.unpack_from('<i', b, o)[0]; o += 4 + 4 * ns
    nv = struct.unpack_from('<i', b, o)[0]; o += 4 + 4 * nv
    try: return _ref(p, b, o)[0]
    except (ValueError, struct.error): return None


def vertex_irradiance(lm):
    """a LightMap1D as one RGB irradiance per vertex (0…~2): NormalizedAverageColor × mean DirectionalMax × its scales"""
    raw, s = lm['raw'], lm['s']; out = []
    for i in range(lm['n']):
        b0, g0, r0, _, b1, g1, r1, _ = raw[8 * i:8 * i + 8]
        mx = (r1 * s[1][0] + g1 * s[1][1] + b1 * s[1][2]) / (3 * 255)
        out += [round(r0 / 255 * s[0][0] * mx, 3), round(g0 / 255 * s[0][1] * mx, 3), round(b0 / 255 * s[0][2] * mx, 3)]
    return out


def model_elements(p, e):
    """a ModelComponent's elements: [{lm, mat, nodes}]"""
    p.props(e); b = p.b; o = p.o + 12
    n = struct.unpack_from('<i', b, o)[0]; o += 4; out = []
    for _ in range(n):
        lm, o = _ref(p, b, o)
        _, mat = struct.unpack_from('<ii', b, o); o += 8
        nn = struct.unpack_from('<i', b, o)[0]; o += 4; nodes = list(struct.unpack_from(f'<{nn}H', b, o)); o += 2 * nn
        ns = struct.unpack_from('<i', b, o)[0]; o += 4 + 4 * ns
        ni = struct.unpack_from('<i', b, o)[0]; o += 4 + 16 * ni
        out.append({'lm': lm, 'mat': p.objname(mat), 'nodes': nodes})
    return out
