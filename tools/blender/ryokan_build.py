# v44 Sakura Inn (櫻花客棧) — Blender visual build from the game's own plan (tools/ryokan/plan.json).
# blender -b --factory-startup -P tools/blender/ryokan_build.py -- tools/ryokan/plan.json tools/ryokan/ryokan.glb
# Game coords (x, y up, z south) → Blender (x, −z, y). Every visual sits on the collider faces from ryokanPlan().
# Materials are named 'ry:<preset>' and UVs are pre-divided by the preset tile size: the game swaps in its own
# procedural PBR materials (src/03_textures.js) by name, so the GLB carries geometry only.
import bpy, bmesh, json, math, sys, random, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PLAN = argv[0] if argv else 'tools/ryokan/plan.json'
OUT = argv[1] if len(argv) > 1 else 'tools/ryokan/ryokan.glb'
P = json.load(open(PLAN, encoding='utf8'))
F2, TOP1, TOP2, EAVE = P['F2'], P['TOP1'], P['TOP2'], P['EAVE']
rnd = random.Random(44)

# metres per texture repeat (keep in sync with the 'ry*' presets in src/03_textures.js)
TILE = {
    'shikkui': (2.4, 2.4), 'kabe': (2.0, 2.0), 'hashira': (0.9, 2.4), 'kuroita': (1.2, 1.8), 'ishi': (1.6, 0.8),
    'kawara': (1.2, 1.0), 'ishidatami': (4.0, 4.0), 'tatami': (0.91, 1.82), 'shoji': (0.91, 1.82), 'fusuma': (0.91, 1.82),
    'yuka': (1.6, 1.6), 'tenjo': (1.8, 1.8), 'namako': (1.2, 1.2), 'ishigaki': (1.5, 1.5), 'koshi': (0.9, 2.4),
    'akai': (1.0, 1.0), 'bronze': (1.0, 1.0), 'rock': (3.0, 3.0), 'bark': (1.0, 2.0), 'paper': (1.0, 1.0), 'noren': (1.8, 1.6),
    'metal': (1.0, 1.0), 'water': (6.0, 6.0), 'sakura': (1.0, 1.0), 'pine': (1.2, 1.2), 'moss': (2.0, 2.0), 'bamboo': (1.0, 1.0),
    'hedge': (1.2, 1.2), 'paperRed': (1.0, 1.0), 'mosen': (1.0, 1.0), 'vend': (1.0, 1.85), 'gold': (1.0, 1.0), 'hill': (12.0, 12.0), 'sakuraFar': (4.0, 4.0),
    'lacquer': (1.0, 1.0), 'scrollRod': (1.0, 1.0), 'blueprint': (1.0, 1.0), 'papers': (1.0, 1.0), 'kakejiku': (1.0, 1.0), 'tansu': (0.9, 0.9),
    'lampPaper': (0.5, 0.5), 'sign': (1.0, 1.0), 'castleWall': (2.0, 2.0),
}
TILE['kawara'] = (1.4, 1.2)
TILE['ishidatami'] = (2.6, 2.6)


def B(x, y, z):  # game → Blender
    return (x, -z, y)


class Bucket:
    def __init__(self):
        self.v = []; self.f = []; self.uv = []; self.n = []; self.custom = False

    def face(self, pts, uvs, nrm=None):
        base = len(self.v)
        self.v.extend(pts); self.f.append(tuple(range(base, base + len(pts)))); self.uv.extend(uvs)
        if nrm is not None: self.custom = True
        self.n.extend(nrm if nrm is not None else [None] * len(pts))


BUCKETS = {}  # (group, mat) → Bucket


def bk(group, mat):
    k = (group, mat)
    if k not in BUCKETS: BUCKETS[k] = Bucket()
    return BUCKETS[k]


def _auto_uv(pts_game, mat, n):
    tu, tv = TILE.get(mat, (1.0, 1.0)); ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2]); out = []
    for (x, y, z) in pts_game:
        if ay >= ax and ay >= az: u, v = x, z
        elif ax >= az: u, v = (z if n[0] < 0 else -z), y
        else: u, v = (-x if n[2] < 0 else x), y
        out.append((u / tu, v / tv))
    return out


def _normal(pts):
    n = Vector((0, 0, 0))
    for i in range(len(pts)):  # Newell normal (robust for slightly non-planar quads)
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a[1] - b[1]) * (a[2] + b[2]); n.y += (a[2] - b[2]) * (a[0] + b[0]); n.z += (a[0] - b[0]) * (a[1] + b[1])
    return n


def poly(group, mat, pts, uvs=None, want=None, center=None, nrm=None):
    """pts: game-space points, counter-clockwise seen from the visible side. want: the visible side's direction,
    center: a point inside the solid — either flips the winding when it disagrees (game→Blender is a rotation)."""
    n = _normal(pts)
    if want is not None or center is not None:
        d = Vector(want) if want is not None else (Vector([sum(p[k] for p in pts) / len(pts) for k in range(3)]) - Vector(center))
        if n.dot(d) < 0: pts = pts[::-1]; uvs = uvs[::-1] if uvs is not None else None; n = -n
    n = n.normalized() if n.length > 1e-12 else Vector((0, 1, 0))
    if uvs is None: uvs = _auto_uv(pts, mat, n)
    bk(group, mat).face([B(*p) for p in pts], list(uvs), [B(*q) for q in nrm] if nrm is not None else None)


def box(group, mat, x0, y0, z0, x1, y1, z1, skip=(), mats=None):
    """axis box; mats = {'n','s','e','w','t','b'} overrides; skip = faces not to emit."""
    if x1 < x0: x0, x1 = x1, x0
    if z1 < z0: z0, z1 = z1, z0
    if y1 < y0: y0, y1 = y1, y0
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4: return
    m = lambda k: (mats or {}).get(k, mat)
    F = {
        't': [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)],
        'b': [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
        'n': [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)],   # faces −z
        's': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],   # faces +z
        'e': [(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)],   # faces +x
        'w': [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)],   # faces −x
    }
    for k, pts in F.items():
        if k in skip: continue
        poly(group, m(k), pts)


def cyl(group, mat, cx, cz, r, y0, y1, seg=12, caps=True, r1=None):
    r1 = r if r1 is None else r1; tu = TILE.get(mat, (1, 1))[0]
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        p = [(cx + math.cos(a0) * r, y0, cz + math.sin(a0) * r), (cx + math.cos(a1) * r, y0, cz + math.sin(a1) * r),
             (cx + math.cos(a1) * r1, y1, cz + math.sin(a1) * r1), (cx + math.cos(a0) * r1, y1, cz + math.sin(a0) * r1)]
        u0, u1 = i / seg * 2 * math.pi * r / tu, (i + 1) / seg * 2 * math.pi * r / tu
        poly(group, mat, [p[0], p[3], p[2], p[1]], [(u0, y0), (u0, y1), (u1, y1), (u1, y0)], center=(cx, (y0 + y1) / 2, cz))
    if caps:
        poly(group, mat, [(cx + math.cos(2 * math.pi * i / seg) * r1, y1, cz + math.sin(2 * math.pi * i / seg) * r1) for i in range(seg)], want=(0, 1, 0))


def rafter(group, mat, a, b, w, h):
    """under-eave rafter: bottom + two sides only (the top is hidden under the roof boards)."""
    a, b = Vector(a), Vector(b); d = (b - a)
    if d.length < 1e-6: return
    d.normalize(); s = d.cross(Vector((0, 1, 0)))
    if s.length < 1e-6: return
    s.normalize(); u = s.cross(d).normalized(); mid = tuple((a + b) / 2 + u * h)
    c = [a - s * w / 2 - u * h / 2, a + s * w / 2 - u * h / 2, a + s * w / 2 + u * h / 2, a - s * w / 2 + u * h / 2]
    e = [p + (b - a) for p in c]
    for k in (0, 1, 3):
        q = [c[k], c[(k + 1) % 4], e[(k + 1) % 4], e[k]]
        poly(group, mat, [tuple(p) for p in q], center=tuple((a + b) / 2))


def tile_ends(group, p0, p1, outn, r=0.075):
    """the round eave-tile ends as one alpha-cut strip (texture 'tileEnds': a disc every 0.28 m)."""
    a, b = Vector(p0), Vector(p1); L = (b - a).length
    if L < 0.05: return
    up = Vector((0, 1, 0)) * r; o = Vector(outn) * 0.03
    pts = [tuple(a - up + o), tuple(b - up + o), tuple(b + up + o), tuple(a + up + o)]
    poly(group, 'tileEnds', pts, [(0, 0), (L / 0.28, 0), (L / 0.28, 1), (0, 1)], want=tuple(outn))


def beam(group, mat, a, b, w, h, up=(0, 1, 0)):
    """square beam between two game points a→b (w across, h along `up`)."""
    a, b = Vector(a), Vector(b); d = (b - a)
    if d.length < 1e-6: return
    d.normalize(); u = Vector(up); s = d.cross(u)
    if s.length < 1e-6: s = d.cross(Vector((1, 0, 0)))
    s.normalize(); u = s.cross(d).normalized()
    c = [lambda p, i=i, j=j: p + s * (w / 2 * i) + u * (h / 2 * j) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    A = [f(a) for f in c]; Bq = [f(b) for f in c]; mid = tuple((a + b) / 2)
    for k in range(4):
        q = [A[k], A[(k + 1) % 4], Bq[(k + 1) % 4], Bq[k]]
        poly(group, mat, [tuple(p) for p in q], center=mid)
    poly(group, mat, [tuple(p) for p in A], center=mid); poly(group, mat, [tuple(p) for p in Bq], center=mid)


# -------------------------------------------------------------------- facades
def facade_frame(wall):
    """the visible plane of a plan wall: (axis, fixed coord, lo, hi, outward normal sign, thickness)"""
    if wall['o'] == 'h':
        fixed = wall['z0'] if wall['face'] == 'n' else wall['z1']; sign = -1 if wall['face'] == 'n' else 1
        return 'x', fixed, wall['x0'], wall['x1'], sign
    fixed = wall['x0'] if wall['face'] == 'w' else wall['x1']; sign = -1 if wall['face'] == 'w' else 1
    return 'z', fixed, wall['z0'], wall['z1'], sign


def fpt(ax, fixed, a, y, off, sign):  # point on a facade: a along, off outward
    return (a, y, fixed + sign * off) if ax == 'x' else (fixed + sign * off, y, a)


def fbox(group, mat, ax, fixed, sign, a0, a1, y0, y1, d0, d1, **kw):
    """box on a facade between depth d0..d1 (outward > 0)."""
    if ax == 'x': box(group, mat, a0, y0, fixed + sign * d0, a1, y1, fixed + sign * d1, **kw)
    else: box(group, mat, fixed + sign * d0, y0, a0, fixed + sign * d1, y1, a1, **kw)


def wall_core(group, w, ext, inn, top='hashira'):
    """the collider box itself, exterior face = ext material, interior face = inn."""
    face_ext, face_in = w['face'], {'n': 's', 's': 'n', 'e': 'w', 'w': 'e'}[w['face']]
    mats = {face_ext: ext, face_in: inn, 't': top, 'b': top}
    box(group, ext, w['x0'], w['y0'], w['z0'], w['x1'], w['y1'], w['z1'], mats=mats)


def bays(lo, hi, pitch=1.82):
    n = max(1, round((hi - lo) / pitch)); return [lo + (hi - lo) * i / n for i in range(n + 1)]


def posts_and_beams(group, ax, fixed, sign, lo, hi, y0, y1, beams=()):
    for a in bays(lo, hi):
        a0, a1 = max(lo, a - 0.075), min(hi, a + 0.075)
        fbox(group, 'hashira', ax, fixed, sign, a0, a1, y0, y1, 0, 0.06)
    for (yb, hb) in beams:
        fbox(group, 'hashira', ax, fixed, sign, lo, hi, yb, yb + hb, 0, 0.075)


def lattice(group, ax, fixed, sign, a0, a1, y0, y1, d=0.05, pitch=0.11, slat=0.035, rails=True):
    """vertical wooden slats (koshi) in front of a dark recess."""
    fbox(group, 'kuroita', ax, fixed, sign, a0, a1, y0, y1, 0, 0.012)
    a = a0 + pitch / 2
    while a < a1 - slat / 2:
        fbox(group, 'koshi', ax, fixed, sign, a - slat / 2, a + slat / 2, y0, y1, 0.012, d, skip=('b',)); a += pitch
    if rails:
        for yy in (y0, y1 - 0.05):
            fbox(group, 'koshi', ax, fixed, sign, a0, a1, yy, yy + 0.05, 0.012, d + 0.01)


def namako(group, ax, fixed, sign, lo, hi, y0, y1):
    fbox(group, 'namako', ax, fixed, sign, lo, hi, y0, y1, 0, 0.03)


def hisashi(group, ax, fixed, sign, lo, hi, y, depth, drop=0.38, posts=False, tr=0.075, tp=0.28):
    """lean-to tiled eave along a facade: top surface from (y at wall) down to (y − drop) at `depth`."""
    t = 0.12
    p0, p1 = fpt(ax, fixed, lo - 0.25, y, 0, sign), fpt(ax, fixed, hi + 0.25, y, 0, sign)
    q0, q1 = fpt(ax, fixed, lo - 0.25, y - drop, depth, sign), fpt(ax, fixed, hi + 0.25, y - drop, depth, sign)
    L = hi - lo + 0.5; S = math.hypot(depth, drop); tu, tv = TILE['kawara']
    poly(group, 'kawara', [p0, q0, q1, p1], [(0, S / tv), (0, 0), (L / tu, 0), (L / tu, S / tv)], want=(0, 1, 0))
    # underside + fascia board + rafters
    u0, u1 = fpt(ax, fixed, lo - 0.25, y - t, 0, sign), fpt(ax, fixed, hi + 0.25, y - t, 0, sign)
    w0, w1 = fpt(ax, fixed, lo - 0.25, y - drop - t, depth, sign), fpt(ax, fixed, hi + 0.25, y - drop - t, depth, sign)
    poly(group, 'hashira', [u0, u1, w1, w0], want=(0, -1, 0))
    outn = (0, 0, sign) if ax == 'x' else (sign, 0, 0)
    poly(group, 'hashira', [q0, q1, w1, w0], want=outn)
    a = lo
    while a <= hi + 1e-3:
        r0, r1 = fpt(ax, fixed, a, y - t - 0.02, 0, sign), fpt(ax, fixed, a, y - drop - t - 0.02, depth - 0.05, sign)
        rafter(group, 'hashira', r0, r1, 0.06, 0.07); a += 0.6
    tile_ends(group, fpt(ax, fixed, lo - 0.25, y - drop + 0.02, depth + 0.02, sign), fpt(ax, fixed, hi + 0.25, y - drop + 0.02, depth + 0.02, sign), (0, 0, sign) if ax == 'x' else (sign, 0, 0), tr)
    if posts:
        for a in bays(lo, hi, 3.64):
            fbox(group, 'hashira', ax, fixed, sign, a - 0.06, a + 0.06, 0, y - drop - t, depth - 0.12, depth)


def cylx(group, mat, c, r, sign, L=0.06, seg=8):  # short disc pointing ±z (facade along x)
    x, y, z = c; mid = (x, y, z + sign * L / 2)
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        poly(group, mat, [(x + math.cos(a0) * r, y + math.sin(a0) * r, z), (x + math.cos(a1) * r, y + math.sin(a1) * r, z),
                          (x + math.cos(a1) * r, y + math.sin(a1) * r, z + sign * L), (x + math.cos(a0) * r, y + math.sin(a0) * r, z + sign * L)], center=mid)
    poly(group, mat, [(x + math.cos(2 * math.pi * i / seg) * r, y + math.sin(2 * math.pi * i / seg) * r, z + sign * L) for i in range(seg)], want=(0, 0, sign))


def cylz(group, mat, c, r, sign, L=0.06, seg=8):  # short disc pointing ±x (facade along z)
    x, y, z = c; mid = (x + sign * L / 2, y, z)
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        poly(group, mat, [(x, y + math.sin(a0) * r, z + math.cos(a0) * r), (x, y + math.sin(a1) * r, z + math.cos(a1) * r),
                          (x + sign * L, y + math.sin(a1) * r, z + math.cos(a1) * r), (x + sign * L, y + math.sin(a0) * r, z + math.cos(a0) * r)], center=mid)
    poly(group, mat, [(x + sign * L, y + math.sin(2 * math.pi * i / seg) * r, z + math.cos(2 * math.pi * i / seg) * r) for i in range(seg)], want=(sign, 0, 0))


BLD = P['buildings']
EAVES = P['eaves']


def eave_on(w):
    """a jumpable eave (plan) lying against this wall's facade → (lo, hi, depth)"""
    ax, fixed, lo, hi, sign = facade_frame(w)
    for e in EAVES:
        if ax == 'x':
            near = abs((e['z1'] if sign < 0 else e['z0']) - fixed) < 0.05
            if near and e['x1'] > lo + 0.1 and e['x0'] < hi - 0.1: return max(lo, e['x0']), min(hi, e['x1']), e['z1'] - e['z0']
        else:
            near = abs((e['x1'] if sign < 0 else e['x0']) - fixed) < 0.05
            if near and e['z1'] > lo + 0.1 and e['z0'] < hi - 0.1: return max(lo, e['z0']), min(hi, e['z1']), e['x1'] - e['x0']
    return None


def ground_facade(w):
    """level-1 building wall seen from the street."""
    b = BLD[w['bld']]; g = b['id']; style = b['style']; ax, fixed, lo, hi, sign = facade_frame(w)
    y1 = w['y1']; full = y1 > F2 + 0.5
    wall_core(g, w, 'shikkui', 'shikkui')
    fbox(g, 'ishi', ax, fixed, sign, lo, hi, 0, 0.42, 0, 0.07)                       # stone plinth
    top1 = min(y1, F2)
    if style == 'kura':
        namako(g, ax, fixed, sign, lo, hi, 0.42, 1.7)
        fbox(g, 'hashira', ax, fixed, sign, lo, hi, 1.7, 1.78, 0, 0.05)
    elif style == 'shop':
        bx = bays(lo, hi)
        for i in range(len(bx) - 1):
            a0, a1 = bx[i] + 0.08, bx[i + 1] - 0.08
            if (i + int(abs(lo) * 3)) % 3 == 1: fbox(g, 'kuroita', ax, fixed, sign, a0, a1, 0.42, 2.25, 0, 0.02)   # shut sliding door
            else:
                fbox(g, 'kuroita', ax, fixed, sign, a0, a1, 0.42, 0.95, 0, 0.03); lattice(g, ax, fixed, sign, a0, a1, 0.95, 2.25)
        fbox(g, 'hashira', ax, fixed, sign, lo, hi, 2.25, 2.4, 0, 0.07)
    else:  # inn / house: dark boarded wainscot
        fbox(g, 'kuroita', ax, fixed, sign, lo, hi, 0.42, 1.25, 0, 0.03)
        fbox(g, 'hashira', ax, fixed, sign, lo, hi, 1.25, 1.31, 0, 0.045)
        bx = bays(lo, hi)
        for i in range(len(bx) - 1):
            if i % 2 == 1 and bx[i + 1] - bx[i] > 1.2: lattice(g, ax, fixed, sign, bx[i] + 0.25, bx[i + 1] - 0.25, 1.45, 2.2)
    posts_and_beams(g, ax, fixed, sign, lo, hi, 0.42, top1, beams=[(top1 - 0.32, 0.22)])
    e = eave_on(w)
    if e: hisashi(g, ax, fixed, sign, e[0], e[1], EAVE + 0.02 + 0.33, e[2] + 0.05, drop=0.33)
    elif b['storeys'] == 2 and style != 'kura' and hi - lo > 2.5: hisashi(g, ax, fixed, sign, lo, hi, F2 - 0.08, 0.95, drop=0.36)
    if full:  # closed building: dress the upper storey too
        y2 = F2
        fbox(g, 'hashira', ax, fixed, sign, lo, hi, y2, y2 + 0.14, 0, 0.08)
        posts_and_beams(g, ax, fixed, sign, lo, hi, y2, y1, beams=[(y1 - 0.25, 0.25)])
        bx = bays(lo, hi)
        for i in range(len(bx) - 1):
            a0, a1 = bx[i], bx[i + 1]
            if a1 - a0 < 1.2: continue
            if style == 'kura':
                if i % 3 == 1: fbox(g, 'hashira', ax, fixed, sign, a0 + 0.45, a1 - 0.45, y2 + 1.0, y2 + 1.9, 0, 0.16)  # iron shutter window
            elif i % 2 == 0: lattice(g, ax, fixed, sign, a0 + 0.2, a1 - 0.2, y2 + 0.85, y2 + 2.05, pitch=0.09)
    return


def upper_facade(w):
    """level-2 exterior wall of a playable storey: plaster outside, ochre inside, window openings."""
    b = BLD[w['bld']] if w['bld'] >= 0 else None; g = b['id'] if b else 'misc'; ax, fixed, lo, hi, sign = facade_frame(w)
    y0, y1 = w['y0'], w['y1']; wins = w.get('wins') or []; sill, head = w.get('sill', 0.85), w.get('head', 2.1)
    th = (w['z1'] - w['z0']) if ax == 'x' else (w['x1'] - w['x0'])
    # wall body split around the windows (matches the collider pieces)
    cur = lo
    def body(a, c, ya, yb):
        if c - a < 1e-3 or yb - ya < 1e-3: return
        if ax == 'x': ww = dict(w, x0=a, x1=c, y0=ya, y1=yb)
        else: ww = dict(w, z0=a, z1=c, y0=ya, y1=yb)
        wall_core(g, ww, 'shikkui', 'kabe')
    for (p, q) in wins:
        a, c = lo + p, lo + q
        body(cur, a, y0, y1); body(a, c, y0, y0 + sill); body(a, c, y0 + head, y1); cur = c
        # window: frame, sill rail, shoji panels slid aside (inside the wall), outside railing
        fbox(g, 'hashira', ax, fixed, sign, a - 0.07, a, y0 + sill, y0 + head, -th, 0.04); fbox(g, 'hashira', ax, fixed, sign, c, c + 0.07, y0 + sill, y0 + head, -th, 0.04)
        fbox(g, 'hashira', ax, fixed, sign, a - 0.07, c + 0.07, y0 + head, y0 + head + 0.08, -th, 0.05)
        fbox(g, 'hashira', ax, fixed, sign, a - 0.05, c + 0.05, y0 + sill - 0.06, y0 + sill, -th - 0.02, 0.1)
        for k in range(int((c - a) / 0.18) + 1):  # low outside baluster (tesuri) below the sill
            aa = a + k * (c - a) / max(1, int((c - a) / 0.18))
            fbox(g, 'koshi', ax, fixed, sign, aa - 0.02, aa + 0.02, y0 + 0.1, y0 + sill - 0.06, 0.06, 0.1)
    body(cur, hi, y0, y1)
    if b and b['style'] == 'inn' and not w.get('outside') and hi - lo > 5:
        a = lo + 0.8
        while a < hi - 0.8:
            if not any(lo + p - 0.2 < a < lo + q + 0.2 for (p, q) in wins): fbox(g, 'sign', ax, fixed, sign, a - 0.2, a + 0.2, y1 - 0.95, y1 - 0.35, 0.04, 0.07)
            a += 0.55
    if not w.get('outside'):
        posts_and_beams(g, ax, fixed, sign, lo, hi, y0, y1, beams=[(y0, 0.16), (y1 - 0.24, 0.24)])
    else:
        fbox(g, 'hashira', ax, fixed, sign, lo, hi, y1 - 0.24, y1, 0, 0.06)


def bound_wall(w):
    """perimeter wall (tsuiji-bei): stone base, white plaster, dark board skirt, tiled coping."""
    g = 'bound'; ax, fixed, lo, hi, sign = facade_frame(w); y1 = w['y1']
    wall_core(g, w, 'shikkui', 'shikkui', top='kawara')
    fbox(g, 'ishigaki', ax, fixed, sign, lo, hi, 0, 0.9, 0, 0.1)
    fbox(g, 'kuroita', ax, fixed, sign, lo, hi, 0.9, 1.6, 0, 0.03)
    fbox(g, 'hashira', ax, fixed, sign, lo, hi, 1.6, 1.66, 0, 0.045)
    for a in bays(lo, hi, 2.7): fbox(g, 'hashira', ax, fixed, sign, max(lo, a - 0.07), min(hi, a + 0.07), 0.9, y1 - 0.3, 0, 0.05)
    hisashi(g, ax, fixed, sign, lo, hi, y1 + 0.32, 0.55, drop=0.3, tr=0.05, tp=0.19)
    th = (w['z1'] - w['z0']) if ax == 'x' else (w['x1'] - w['x0'])
    hisashi(g, ax, fixed + sign * -th, -sign, lo, hi, y1 + 0.32, 0.55, drop=0.3, tr=0.05, tp=0.19)


# -------------------------------------------------------------------- roofs
def roof(group, x0, z0, x1, z1, base, kind='irimoya', pitch=0.48, over=1.0, ridge_axis=None, sori=0.22, gable_lattice=True, detail=True):
    """Japanese tiled roof over a rectangle (game coords). kind: irimoya | kirizuma | yosemune."""
    X0, Z0, X1, Z1 = x0 - over, z0 - over, x1 + over, z1 + over
    along_x = (X1 - X0 >= Z1 - Z0) if ridge_axis is None else ridge_axis == 'x'
    # work in local (a = along ridge, c = across) then map
    if along_x: A0, A1, C0, C1 = X0, X1, Z0, Z1
    else: A0, A1, C0, C1 = Z0, Z1, X0, X1
    s = (C1 - C0) / 2; cm = (C0 + C1) / 2; H = s * pitch
    M = lambda a, y, c: (a, y, c) if along_x else (c, y, a)
    L = A1 - A0
    g = s * 0.55 if kind == 'irimoya' else (s if kind == 'yosemune' else 0.0)
    g = min(g, L / 2 - 0.3)
    hg = g * pitch
    def lift(a, c, y):  # curved eaves: corners swept up, a slight sag mid-slope
        t = 1 - min(1, abs(c - cm) / s)                    # 0 at eave, 1 at ridge
        e = min(1, (abs(a - (A0 + A1) / 2) / (L / 2))) ** 4  # 1 at the ends
        return y + sori * e * (1 - t) ** 2 - 0.06 * math.sin(math.pi * t) * (1 - e)
    NA, NC = (max(4, int(L / 1.2)), 5) if detail else (max(2, int(L / 4)), 2)
    tu, tv = TILE['kawara']
    def slope(side):  # side −1: c from C0 (eave) to cm (ridge); +1: C1 → cm
        ce = C0 if side < 0 else C1
        for j in range(NC):
            t0, t1 = j / NC, (j + 1) / NC
            c0, c1 = ce + (cm - ce) * t0, ce + (cm - ce) * t1
            # at this height band the slope spans a ∈ [A0 + g·t/(…)] — trim at the hips (yosemune/irimoya ends)
            def arange(t):
                if g <= 0: return A0, A1
                dist = abs((ce + (cm - ce) * t) - ce)    # distance from eave
                k = min(dist, g); return A0 + k, A1 - k
            a00, a01 = arange(t0); a10, a11 = arange(t1)
            for i in range(NA):
                u0, u1 = i / NA, (i + 1) / NA
                pa = [a00 + (a01 - a00) * u0, a00 + (a01 - a00) * u1, a10 + (a11 - a10) * u1, a10 + (a11 - a10) * u0]
                pc = [c0, c0, c1, c1]; py = [base + H * t0, base + H * t0, base + H * t1, base + H * t1]
                pts = [M(pa[k], lift(pa[k], pc[k], py[k]), pc[k]) for k in range(4)]
                sl = math.hypot(s, H)
                uvs = [((pa[k] - A0) / tu, (sl * (t0 if k < 2 else t1)) / tv) for k in range(4)]
                poly(group, 'kawara', pts, uvs, want=(0, 1, 0))
    slope(-1); slope(1)
    # hip ends (yosemune full / irimoya lower part)
    if g > 0:
        for end in (-1, 1):
            ae = A0 if end < 0 else A1
            ai = ae + end * -1 * g
            NB = 4
            for j in range(NB):
                t0, t1 = j / NB, (j + 1) / NB
                d0, d1 = g * t0, g * t1
                a0_, a1_ = ae - end * d0, ae - end * d1
                cl0, cr0 = C0 + d0, C1 - d0; cl1, cr1 = C0 + d1, C1 - d1
                y0_, y1_ = base + d0 * pitch, base + d1 * pitch
                pts = [M(a0_, lift(a0_, cl0, y0_), cl0), M(a0_, lift(a0_, cr0, y0_), cr0), M(a1_, lift(a1_, cr1, y1_), cr1), M(a1_, lift(a1_, cl1, y1_), cl1)]
                sl = math.hypot(g, g * pitch)
                uvs = [((cl0 - C0) / tu, sl * t0 / tv), ((cr0 - C0) / tu, sl * t0 / tv), ((cr1 - C0) / tu, sl * t1 / tv), ((cl1 - C0) / tu, sl * t1 / tv)]
                poly(group, 'kawara', pts, uvs, want=(0, 1, 0))
            if kind == 'irimoya':  # vertical gable (tsuma) above the hip: lattice board + bargeboards
                ca, cb, yb = C0 + g, C1 - g, base + hg
                tri = [M(ai, yb, ca), M(ai, yb, cb), M(ai, base + H, cm)]
                poly(group, 'shikkui', tri, want=M(end, 0, 0))
                if gable_lattice:  # timber grid on the white gable (as on the SF2 inn gables)
                    off = end * 0.03
                    for k in range(1, 4):
                        yy = yb + (H - hg) * k / 4; half = (cb - ca) / 2 * (1 - k / 4)
                        beam(group, 'hashira', M(ai + off, yy, cm - half), M(ai + off, yy, cm + half), 0.05, 0.08)
                    for k in range(-2, 3):
                        cc = cm + (cb - ca) / 2 * k / 3; top = base + H - abs(cc - cm) / ((cb - ca) / 2) * (H - hg)
                        if top - yb > 0.15: beam(group, 'hashira', M(ai + off, yb, cc), M(ai + off, top, cc), 0.05, 0.08)
                for (cc, sgn) in ((ca, 1), (cb, -1)):  # hafu boards
                    beam(group, 'hashira', M(ai + end * 0.05, yb - 0.05, cc - sgn * 0.25), M(ai + end * 0.05, base + H + 0.12, cm), 0.08, 0.3)
    elif kind == 'kirizuma':  # gable ends: plaster triangle under the roof + bargeboards
        for end in (-1, 1):
            ae = (A0 + over) if end < 0 else (A1 - over)
            tri = [M(ae, base + pitch * over, C0 + over), M(ae, base + pitch * over, C1 - over), M(ae, base + H, cm)]
            poly(group, 'shikkui', tri, want=M(end, 0, 0))
            for (cc, sgn) in ((C0, 1), (C1, -1)):
                beam(group, 'hashira', M(A0 if end < 0 else A1, base - 0.05, cc), M(A0 if end < 0 else A1, base + H + 0.1, cm), 0.08, 0.32)
    # ridge: a raised tile ridge with end ornaments (oni-gawara)
    ra0, ra1 = A0 + g, A1 - g
    if kind == 'kirizuma': ra0, ra1 = A0 - 0.1, A1 + 0.1
    if ra1 > ra0:
        beam(group, 'kawara', M(ra0, base + H + 0.12, cm), M(ra1, base + H + 0.12, cm), 0.42, 0.36)
        beam(group, 'kawara', M(ra0 + 0.1, base + H + 0.38, cm), M(ra1 - 0.1, base + H + 0.38, cm), 0.24, 0.16)
        for ae in (ra0, ra1):
            box(group, 'kawara', *(M(ae - 0.22, base + H - 0.05, cm - 0.3)), *(M(ae + 0.22, base + H + 0.75, cm + 0.3)))
    if g > 0:  # hip ridges
        for end in (-1, 1):
            ae, ai = (A0, A0 + g) if end < 0 else (A1, A1 - g)
            for ce in (C0, C1):
                ci = C0 + g if ce == C0 else C1 - g
                beam(group, 'kawara', M(ae, lift(ae, ce, base) + 0.12, ce), M(ai, base + hg + 0.12, ci), 0.26, 0.24)
    # soffit + fascia + rafters under the eaves (long sides)
    for side in (-1, 1):
        ce = C0 if side < 0 else C1; cw = ce + (cm - ce) * (over / s)
        pts = [M(A0, base - 0.12, ce), M(A1, base - 0.12, ce), M(A1, base - 0.12 + over * pitch, cw), M(A0, base - 0.12 + over * pitch, cw)]
        poly(group, 'hashira', pts, want=(0, -1, 0))
        fa = [M(A0, base - 0.12, ce), M(A0, base + 0.02, ce), M(A1, base + 0.02, ce), M(A1, base - 0.12, ce)]
        poly(group, 'hashira', fa, want=M(0, 0, side))
        if not detail: continue
        a = A0 + 0.3
        while a < A1 - 0.25:
            rafter(group, 'hashira', M(a, base - 0.15, ce + side * -0.02), M(a, base - 0.13 + over * pitch, cw), 0.06, 0.07); a += 0.6
        # round tile ends along the eave (follows the swept-up corners in 6 pieces)
        for k in range(6):
            a0_, a1_ = A0 + (A1 - A0) * k / 6, A0 + (A1 - A0) * (k + 1) / 6
            tile_ends(group, M(a0_, lift(a0_, ce, base) + 0.03, ce + side * 0.03), M(a1_, lift(a1_, ce, base) + 0.03, ce + side * 0.03), M(0, 0, side), 0.08)


# -------------------------------------------------------------------- stairs, slabs, interiors
def stairs(st):
    g = 'stairs'; axis, d, frm, a0, a1, n, rise, run = st['axis'], st['dir'], st['from'], st['a0'], st['a1'], st['steps'], st['rise'], st['run']
    for i in range(n):
        p, q = frm + d * run * i, frm + d * run * (i + 1); top = rise * (i + 1)
        if axis == 'x': box(g, 'yuka', min(p, q), top - 0.05, a0, max(p, q) + (0.03 if d < 0 else 0), top, a1); box(g, 'hashira', min(p, q), top - rise, a0 + 0.02, max(p, q), top - 0.05, a1 - 0.02)
        else: box(g, 'yuka', a0, top - 0.05, min(p, q), a1, top, max(p, q)); box(g, 'hashira', a0 + 0.02, top - rise, min(p, q), a1 - 0.02, top - 0.05, max(p, q))
    end = frm + d * run * n
    for side in (a0, a1):  # stringers + handrail
        if axis == 'x':
            beam(g, 'hashira', (frm, 0.0, side), (end, F2, side), 0.07, 0.3)
            beam(g, 'hashira', (frm, 0.95, side), (end, F2 + 0.95, side), 0.06, 0.06)
            for k in range(0, n + 1, 4): xx = frm + d * run * k; box(g, 'hashira', xx - 0.04, rise * k, side - 0.035, xx + 0.04, rise * k + 0.95, side + 0.035)
        else:
            beam(g, 'hashira', (side, 0.0, frm), (side, F2, end), 0.07, 0.3)
            beam(g, 'hashira', (side, 0.95, frm), (side, F2 + 0.95, end), 0.06, 0.06)


def slabs():
    for s in P['slabs']:
        box('floor2', 'yuka', s['x0'], F2 - 0.24, s['z0'], s['x1'], F2, s['z1'], mats={'b': 'tenjo'})


def ceilings():
    for b in BLD:
        if not b['open2']: continue
        for r in b['rects']:
            box(b['id'], 'tenjo', r['x0'], TOP2 - 0.02, r['z0'], r['x1'], TOP2 + 0.02, r['z1'], skip=('t',))


def rails():
    for r in P['rails']:
        box('rails', 'hashira', r['x0'], r['y1'] - 0.07, r['z0'], r['x1'], r['y1'], r['z1'])
        alongx = (r['x1'] - r['x0']) > (r['z1'] - r['z0'])
        lo, hi = (r['x0'], r['x1']) if alongx else (r['z0'], r['z1'])
        a = lo
        while a <= hi:
            if alongx: box('rails', 'koshi', a - 0.02, r['y0'], r['z0'], a + 0.02, r['y1'] - 0.07, r['z1'])
            else: box('rails', 'koshi', r['x0'], r['y0'], a - 0.02, r['x1'], r['y1'] - 0.07, a + 0.02)
            a += 0.16


def partitions():
    for seg in P['parts2'] + P['walls1']:
        kind = seg['kind']
        for p in seg['parts']:
            if kind == 'part' and not p.get('lintel') and seg.get('mat') != 'kabe':
                # shoji screen: paper core with a lattice grid on both faces
                box('interior', 'shoji', p['x0'], p['y0'], p['z0'], p['x1'], p['y1'], p['z1'], mats={'t': 'hashira', 'b': 'hashira'})
                alongx = p['x1'] - p['x0'] > p['z1'] - p['z0']
                lo, hi = (p['x0'], p['x1']) if alongx else (p['z0'], p['z1'])
                for a in bays(lo, hi, 0.91):
                    if alongx: box('interior', 'hashira', a - 0.03, p['y0'], p['z0'] - 0.015, a + 0.03, p['y1'], p['z1'] + 0.015)
                    else: box('interior', 'hashira', p['x0'] - 0.015, p['y0'], a - 0.03, p['x1'] + 0.015, p['y1'], a + 0.03)
                for yy in (p['y0'], p['y0'] + 0.3, p['y0'] + 2.1):
                    box('interior', 'hashira', p['x0'] - 0.015, yy, p['z0'] - 0.015, p['x1'] + 0.015, yy + 0.05, p['z1'] + 0.015)
            elif kind == 'fence':
                box('props', 'hashira', p['x0'], p['y0'], p['z0'], p['x1'], p['y1'], p['z1'])
            elif kind == 'part' and seg.get('mat') == 'kabe':
                box('interior', 'kabe', p['x0'], p['y0'], p['z0'], p['x1'], p['y1'], p['z1'], mats={'t': 'hashira', 'b': 'hashira'})
                if p.get('lintel'): continue
                alongx = p['x1'] - p['x0'] > p['z1'] - p['z0']
                lo, hi = (p['x0'], p['x1']) if alongx else (p['z0'], p['z1'])
                for side in (-1, 1):
                    ax, fixed, sign = ('x', p['z0'] if side < 0 else p['z1'], side) if alongx else ('z', p['x0'] if side < 0 else p['x1'], side)
                    posts_and_beams('interior', ax, fixed, sign, lo, hi, p['y0'], p['y1'], beams=[(p['y0'], 0.06), (p['y0'] + 2.0, 0.12), (p['y1'] - 0.1, 0.1)])
            elif kind == 'part':
                box('interior', 'kabe', p['x0'], p['y0'], p['z0'], p['x1'], p['y1'], p['z1'], mats={'t': 'hashira', 'b': 'hashira'})
            else:  # 中央大廳 walls: plaster over a dark wainscot, posts and a head beam on both faces, lattice windows
                box('hall', 'shikkui', p['x0'], p['y0'], p['z0'], p['x1'], p['y1'], p['z1'], mats={'t': 'hashira', 'b': 'hashira'})
                alongx = p['x1'] - p['x0'] > p['z1'] - p['z0']
                lo, hi = (p['x0'], p['x1']) if alongx else (p['z0'], p['z1'])
                for side in (-1, 1):
                    ax, fixed, sign = ('x', p['z0'] if side < 0 else p['z1'], side) if alongx else ('z', p['x0'] if side < 0 else p['x1'], side)
                    fbox('hall', 'kuroita', ax, fixed, sign, lo, hi, 0, 1.1, 0, 0.03)
                    fbox('hall', 'hashira', ax, fixed, sign, lo, hi, p['y1'] - 0.3, p['y1'], 0, 0.06)
                    posts_and_beams('hall', ax, fixed, sign, lo, hi, 0, p['y1'])
                    if seg.get('win'):
                        bx = bays(lo, hi)
                        for i in range(len(bx) - 1):
                            if i % 2 == 0 and bx[i + 1] - bx[i] > 1.2: lattice('hall', ax, fixed, sign, bx[i] + 0.2, bx[i + 1] - 0.2, 1.3, 2.4, pitch=0.09)
        for d in seg.get('doors', []):  # door frames
            alongx = d['x1'] - d['x0'] > d['z1'] - d['z0']
            if alongx:
                for xx in (d['x0'], d['x1']): box('interior', 'hashira', xx - 0.05, d['y0'], d['z0'] - 0.02, xx + 0.05, d['y1'], d['z1'] + 0.02)
                box('interior', 'hashira', d['x0'] - 0.05, d['y1'], d['z0'] - 0.03, d['x1'] + 0.05, d['y1'] + 0.08, d['z1'] + 0.03)
            else:
                for zz in (d['z0'], d['z1']): box('interior', 'hashira', d['x0'] - 0.02, d['y0'], zz - 0.05, d['x1'] + 0.02, d['y1'], zz + 0.05)
                box('interior', 'hashira', d['x0'] - 0.03, d['y1'], d['z0'] - 0.05, d['x1'] + 0.03, d['y1'] + 0.08, d['z1'] + 0.05)


# -------------------------------------------------------------------- ground
def ground():
    B_ = P['bounds']; pad = 60
    x0, x1, z0, z1 = B_['minX'] - pad, B_['maxX'] + pad, B_['minZ'] - pad, B_['maxZ'] + pad
    poly('ground', 'ishidatami', [(x0, 0, z0), (x0, 0, z1), (x1, 0, z1), (x1, 0, z0)], want=(0, 1, 0))
    # stone gutters along every street-facing base
    for w in P['walls']:
        if w['level'] != 1: continue
        ax, fixed, lo, hi, sign = facade_frame(w)
        fbox('ground', 'ishi', ax, fixed, sign, lo, hi, 0, 0.03, 0.07, 0.42)


# -------------------------------------------------------------------- roofs per building
ROOFS = {
    'honkan': [((-22.8, -37.5, 6.4, -16.8), 'irimoya', 'x'), ((-22.8, -16.8, 1.6, -13.5), 'kirizuma', 'x')],
    'kura': [], 'nishiya': [], 'higashi1': [], 'higashi2': [], 'abld': [], 'sebld': [], 'bbld': [], 's1': [], 'lshop': [], 'crossing': [],
}


def building_roofs():
    for b in BLD:
        custom = ROOFS.get(b['id'])
        eave = lambda over, pitch, top=b['top']: top + 0.12 - over * pitch
        if custom:
            for (r, kind, axis) in custom:
                x0, z0, x1, z1 = r
                roof(b['id'], x0, z0, x1, z1, eave(1.05, 0.48) - (0 if kind != 'kirizuma' or (z1 - z0) > 4 else 0.55), kind, ridge_axis=axis, over=1.05)
            continue
        for r in b['rects']:
            w, d = r['x1'] - r['x0'], r['z1'] - r['z0']
            if min(w, d) < 2.5: continue
            kind = b['roof'] if min(w, d) > 5 else 'kirizuma'
            over, pitch = (0.95 if b['storeys'] == 2 else 0.8), (0.5 if b['style'] != 'kura' else 0.55)
            roof(b['id'], r['x0'], r['z0'], r['x1'], r['z1'], eave(over, pitch), kind, over=over, pitch=pitch)
    for c in P['canopies']:
        roof(c['id'], c['x0'], c['z0'], c['x1'], c['z1'], c['h'] + 0.12 - 0.8 * 0.48, c['roof'], over=0.8)


# -------------------------------------------------------------------- export
INTERIOR = {'interior', 'objroom', 'floor2'}


def regroup():
    """merge the per-building buckets into a handful of chunks per material: N/S halves outside, one interior chunk,
    one far chunk (no shadows). Each chunk is one draw call per pass."""
    out = {}
    for (group, mat), bkt in BUCKETS.items():
        for fi, f in enumerate(bkt.f):
            if group == 'backdrop': chunk = 'far_nocast'
            elif group in INTERIOR: chunk = 'int_nocast' if mat in ('tatami', 'papers', 'kakejiku', 'blueprint') else 'int'
            else:
                cy = sum(bkt.v[i][1] for i in f) / len(f)  # Blender y = −game z
                chunk = 'north' if cy > 0 else 'south'
            nb = out.setdefault((chunk, mat), Bucket())
            nb.face([bkt.v[i] for i in f], [bkt.uv[i] for i in f], [bkt.n[i] for i in f] if bkt.custom else None)
    return out


def flush_and_export():
    global BUCKETS
    BUCKETS = regroup()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for (group, mat), bkt in BUCKETS.items():
        if not bkt.f: continue
        if mat not in mats:
            m = bpy.data.materials.new('ry:' + mat); m.use_nodes = True; mats[mat] = m
        me = bpy.data.meshes.new(f'{group}__{mat}')
        me.from_pydata(bkt.v, [], bkt.f)
        uvl = me.uv_layers.new(name='UVMap')
        # loops follow face vertex order; vertices are unique per face here
        for poly_ in me.polygons:
            for li in poly_.loop_indices:
                u, v = bkt.uv[me.loops[li].vertex_index]; uvl.data[li].uv = (u, -v)  # glTF flips V; the game's canvas textures are flipY
        me.materials.append(mats[mat])
        me.validate(); me.update()
        if bkt.custom:  # bent normals (foliage cards): per-loop custom split normals, face normal elsewhere
            loop_n = []
            for poly_ in me.polygons:
                for li in poly_.loop_indices:
                    nv = bkt.n[me.loops[li].vertex_index]; loop_n.append(nv if nv is not None else tuple(poly_.normal))
            try: me.normals_split_custom_set(loop_n)
            except Exception as e: print('custom normals failed', e)
        ob = bpy.data.objects.new(f'{group}__{mat}', me); bpy.context.scene.collection.objects.link(ob)
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', export_apply=False, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    tris = sum(len(b.f) for b in BUCKETS.values())
    print('EXPORTED', OUT, 'objects', len(bpy.data.objects), 'faces', tris)


def floors2():
    """tatami rooms over the 2F slab (corridors keep the polished boards)."""
    for r in P.get('floors2', []):
        if r['type'] != 'tatami': continue
        poly('floor2', 'tatami', [(r['x0'], F2 + 0.006, r['z0']), (r['x0'], F2 + 0.006, r['z1']), (r['x1'], F2 + 0.006, r['z1']), (r['x1'], F2 + 0.006, r['z0'])], want=(0, 1, 0))


def hall_posts():
    for c in P['canopies']:
        if c['id'] != 'hall': continue
        for z in (c['z0'] + 0.15, (c['z0'] + c['z1']) / 2, c['z1'] - 0.15):  # open west side: posts under the eave
            box('hall', 'hashira', c['x0'] + 0.02, 0, z - 0.12, c['x0'] + 0.26, c['h'], z + 0.12)
        box('hall', 'hashira', c['x0'], c['h'] - 0.3, c['z0'], c['x0'] + 0.28, c['h'], c['z1'])
        box('hall', 'tenjo', c['x0'], c['h'] - 0.02, c['z0'], c['x1'], c['h'] + 0.02, c['z1'], skip=('t',))


def main():
    for w in P['walls']:
        if w['kind'] == 'bld': ground_facade(w)
        elif w['kind'] == 'ext2': upper_facade(w)
        elif w['kind'] == 'bound': bound_wall(w)
    for st in P['stairs']: stairs(st)
    slabs(); ceilings(); rails(); partitions(); ground(); building_roofs(); hall_posts()
    here = os.path.dirname(os.path.abspath(__file__))
    exec(open(os.path.join(here, 'ryokan_props.py'), encoding='utf8').read(), globals()); props_main()
    exec(open(os.path.join(here, 'ryokan_interior.py'), encoding='utf8').read(), globals()); interior_main()
    flush_and_export()


main()
