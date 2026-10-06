# v46 SKY CITY (天空之城 · SF2 "Skywalker") — Blender visuals for src/07s_skycity.js. Geometry is written in GAME
# coordinates (x east, y up, z south) and converted to Blender (x, −z, y); the glTF Y-up export gives game space back.
# Static meshes are grouped per region + material ('<region>__<mat>' objects, materials 'sky:<mat>'); moving parts are
# their own objects with their pivot as origin: BRIDGE_W/E (world-space, lowered), TRAM_N/S (car centre at its start
# dock), GEAR_<line><W|E> (flat pulley gears), FLOORGEAR_W/E, CLOCK_H/CLOCK_M (pivot = clock centre, hand pointing up),
# GO_PROTO (one GO box, cloned in the game for every control).
# blender -b --factory-startup -P tools/blender/sky_build.py -- tools/sky/sky.glb
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'tools/sky/sky.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
SCN = bpy.context.scene
RNG = random.Random(4612)

# ------------------------------------------------------------------------------------------------ constants (= SKY in JS)
X0, X1, Z0, Z1 = 7.0, 27.0, -13.0, 13.0
BR_Z0, BR_Z1, BR_LEN = -5.0, -1.0, 7.0
T_LEN, T_W, T_H, T_DOCK, T_DOOR = 7.0, 3.0, 2.9, 20.0, 1.5
LINES = [('N', -14.5, 1, 1), ('S', 14.5, -1, 0)]   # id, z, side (+1: doorway faces +z), start (0 west / 1 east)
TILE = {'floor': 2.0, 'inlay': 1.0, 'whiteBrick': 3.0, 'brick': 1.6, 'wood': 1.2, 'darkWood': 1.5, 'stone': 2.0, 'bronze': 1.0, 'steel': 1.0,
        'darkSteel': 1.0, 'tramGreen': 1.5, 'tramWood': 1.2, 'copper': 1.0, 'glass': 2.0, 'clockFace': 1.0, 'roofTin': 1.5, 'lampGlow': 1.0,
        'goPanel': 1.0, 'leafGreen': 3.0, 'leafGrey': 3.0, 'arrow': 1.0, 'rubber': 1.0, 'cloud': 1.0}


def G(x, y, z): return Vector((x, -z, y))  # game → Blender


# ------------------------------------------------------------------------------------------------ mesh buckets
class Bucket:
    def __init__(self): self.bm = bmesh.new()


BUCKETS = {}


def bk(obj, mat):
    k = (obj, mat)
    if k not in BUCKETS: BUCKETS[k] = Bucket()
    return BUCKETS[k].bm


def quad(obj, mat, pts):
    bm = bk(obj, mat); vs = [bm.verts.new(G(*p)) for p in pts]
    try: bm.faces.new(vs)
    except ValueError: pass


def box(obj, mat, x0, y0, z0, x1, y1, z1, skip=()):
    x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1); z0, z1 = min(z0, z1), max(z0, z1)
    F = {'b': [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], 't': [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)],
         'n': [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], 's': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
         'w': [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], 'e': [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]}
    for k, f in F.items():
        if k not in skip: quad(obj, mat, f)


def cyl(obj, mat, c, r, length, axis='y', seg=20, r2=None, caps=True, open_end=False):
    """cylinder centred on c (game coords) along axis x / y / z."""
    r2 = r if r2 is None else r2; bm = bk(obj, mat); rings = []
    for end, rr in ((-1, r), (1, r2)):
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg; ca, sa = math.cos(a) * rr, math.sin(a) * rr; h = end * length / 2
            p = {'x': (c[0] + h, c[1] + ca, c[2] + sa), 'y': (c[0] + ca, c[1] + h, c[2] + sa), 'z': (c[0] + ca, c[1] + sa, c[2] + h)}[axis]
            ring.append(bm.verts.new(G(*p)))
        rings.append(ring)
    for i in range(seg):
        j = (i + 1) % seg
        try: bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
        except ValueError: pass
    if caps:
        for ring in rings:
            try: bm.faces.new(ring)
            except ValueError: pass


def gear_flat(obj, mat, cx, cy, cz, r, teeth=24, th=0.18, hole=0.25, spokes=6):
    """horizontal gear (axis y): toothed rim, hub, spokes."""
    bm = bk(obj, mat); n = teeth * 4; top, bot = [], []
    for i in range(n):
        a = 2 * math.pi * i / n; rr = r if (i % 4) in (1, 2) else r * 0.9
        top.append(bm.verts.new(G(cx + math.cos(a) * rr, cy + th / 2, cz + math.sin(a) * rr))); bot.append(bm.verts.new(G(cx + math.cos(a) * rr, cy - th / 2, cz + math.sin(a) * rr)))
    ri = r * 0.78; itop, ibot = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        itop.append(bm.verts.new(G(cx + math.cos(a) * ri, cy + th / 2, cz + math.sin(a) * ri))); ibot.append(bm.verts.new(G(cx + math.cos(a) * ri, cy - th / 2, cz + math.sin(a) * ri)))
    for i in range(n):
        j = (i + 1) % n
        for f in ((top[i], top[j], itop[j], itop[i]), (bot[j], bot[i], ibot[i], ibot[j]), (bot[i], bot[j], top[j], top[i]), (itop[i], itop[j], ibot[j], ibot[i])):
            try: bm.faces.new(f)
            except ValueError: pass
    cyl(obj, mat, (cx, cy, cz), r * hole, th * 1.6, 'y', 18)
    for k in range(spokes):
        a = 2 * math.pi * k / spokes; ca, sa = math.cos(a), math.sin(a); w = r * 0.07
        pts = [(r * hole * 0.9, -w), (ri * 1.01, -w), (ri * 1.01, w), (r * hole * 0.9, w)]
        P = [(cx + ca * u - sa * v, cz + sa * u + ca * v) for (u, v) in pts]
        for yy, sgn in ((th * 0.35, 1), (-th * 0.35, -1)): pass
        box_rot(obj, mat, cx, cy, cz, a, r * hole * 0.9, ri * 1.01, -w, w, -th * 0.35, th * 0.35)


def box_rot(obj, mat, cx, cy, cz, a, u0, u1, v0, v1, y0, y1):
    """box in a frame rotated by a around y (u along a, v across)."""
    ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v, y: (cx + ca * u - sa * v, cy + y, cz + sa * u + ca * v)
    F = [[P(u0, v0, y0), P(u1, v0, y0), P(u1, v1, y0), P(u0, v1, y0)], [P(u0, v0, y1), P(u0, v1, y1), P(u1, v1, y1), P(u1, v0, y1)],
         [P(u0, v0, y0), P(u0, v0, y1), P(u1, v0, y1), P(u1, v0, y0)], [P(u0, v1, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v1, y1)],
         [P(u0, v0, y0), P(u0, v1, y0), P(u0, v1, y1), P(u0, v0, y1)], [P(u1, v0, y0), P(u1, v0, y1), P(u1, v1, y1), P(u1, v1, y0)]]
    for f in F: quad(obj, mat, f)


def gear_vert(obj, mat, cx, cy, cz, r, axis='x', teeth=16, th=0.25):
    """vertical gear (axis x or z): toothed disc."""
    bm = bk(obj, mat); n = teeth * 4; f0, f1 = [], []
    for i in range(n):
        a = 2 * math.pi * i / n; rr = r if (i % 4) in (1, 2) else r * 0.86; u, v = math.cos(a) * rr, math.sin(a) * rr
        for lst, d in ((f0, -th / 2), (f1, th / 2)):
            p = (cx + d, cy + v, cz + u) if axis == 'x' else (cx + u, cy + v, cz + d)
            lst.append(bm.verts.new(G(*p)))
    for i in range(n):
        j = (i + 1) % n
        try: bm.faces.new((f0[i], f0[j], f1[j], f1[i]))
        except ValueError: pass
    for lst in (f0, f1):
        try: bm.faces.new(lst)
        except ValueError: pass


# ================================================================================================ ROOFS
def roofs():
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'
        xa, xb = (-X1, -X0) if sx < 0 else (X0, X1)
        box(reg, 'floor', xa, -0.3, Z0, xb, 0.0, Z1, skip=('b',))
        # cornice: red brick band + a white stone lip, then the white-brick tower with rusticated bands
        box(reg, 'brick', xa - 0.18, -0.75, Z0 - 0.18, xb + 0.18, -0.06, Z1 + 0.18, skip=('t',))
        box(reg, 'stone', xa - 0.26, -0.34, Z0 - 0.26, xb + 0.26, -0.02, Z1 + 0.26, skip=())   # stone lip just under the floor edge
        box(reg, 'whiteBrick', xa, -42.0, Z0, xb, -0.75, Z1, skip=('t', 'b'))
        for yb in (-4.5, -9.0, -16.0):
            box(reg, 'stone', xa - 0.12, yb - 0.35, Z0 - 0.12, xb + 0.12, yb, Z1 + 0.12, skip=())
        for yb in (-6.0, -12.0): box(reg, 'brick', xa - 0.06, yb - 0.9, Z0 - 0.06, xb + 0.06, yb, Z1 + 0.06, skip=('t', 'b'))
        # pilasters on the chasm-side wall (where everybody looks down)
        hx = sx * X0
        for z in (-11.0, -6.5, 2.0, 7.0, 11.5):
            box(reg, 'whiteBrick', hx - sx * 0.0, -30, z - 0.6, hx - sx * 0.35, -0.75, z + 0.6, skip=('t', 'b'))
        # floor inlay (terracotta lines + rings) — after the SF2 roof pattern
        y = 0.004; w = 0.22; ins = 0.85
        xi0, xi1 = xa + ins, xb - ins
        for (a0, b0, a1, b1) in ((xi0, Z0 + ins, xi1, Z0 + ins + w), (xi0, Z1 - ins - w, xi1, Z1 - ins), (xi0, Z0 + ins, xi0 + w, Z1 - ins), (xi1 - w, Z0 + ins, xi1, Z1 - ins)):
            quad(reg, 'inlay', [(a0, y, b0), (a0, y, b1), (a1, y, b1), (a1, y, b0)])
        cxr = (xa + xb) / 2
        nodes = [(cxr - sx * 4.5, -6.5), (cxr - sx * 4.5, 6.5), (cxr + sx * 2.5, -9.0), (cxr + sx * 2.5, 9.0), (cxr - sx * 1.0, 0.0)]
        for (nx, nz) in nodes: ring(reg, 'inlay', nx, y, nz, 0.75, 0.22)
        for (a, b) in ((0, 4), (1, 4), (0, 2), (1, 3)):
            (ax, az), (bx, bz) = nodes[a], nodes[b]
            if abs(ax - bx) > abs(az - bz): quad(reg, 'inlay', [(min(ax, bx), y, az - w / 2), (min(ax, bx), y, az + w / 2), (max(ax, bx), y, az + w / 2), (max(ax, bx), y, az - w / 2)]); quad(reg, 'inlay', [(bx - w / 2, y, min(az, bz)), (bx - w / 2, y, max(az, bz)), (bx + w / 2, y, max(az, bz)), (bx + w / 2, y, min(az, bz))])
            else: quad(reg, 'inlay', [(ax - w / 2, y, min(az, bz)), (ax - w / 2, y, max(az, bz)), (ax + w / 2, y, max(az, bz)), (ax + w / 2, y, min(az, bz))])


def ring(obj, mat, cx, y, cz, r, w, seg=28):
    bm = bk(obj, mat); o, i_ = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        o.append(bm.verts.new(G(cx + math.cos(a) * r, y, cz + math.sin(a) * r))); i_.append(bm.verts.new(G(cx + math.cos(a) * (r - w), y, cz + math.sin(a) * (r - w))))
    for k in range(seg):
        j = (k + 1) % seg
        try: bm.faces.new((o[k], i_[k], i_[j], o[j]))
        except ValueError: pass


# ================================================================================================ HUT, WINCH, CRATES, LAMPS
def huts():
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'; hx = sx * X0
        xa, xb = sorted((hx + sx * 1.8, hx + sx * 5.8)); za, zb = 0.6, 4.6
        box(reg, 'brick', xa, 0, za, xb, 0.9, zb, skip=('b', 't'))
        box(reg, 'whiteBrick', xa, 0.9, za, xb, 3.3, zb, skip=('b', 't'))
        box(reg, 'stone', xa - 0.12, 3.3, za - 0.12, xb + 0.12, 3.55, zb + 0.12)
        box(reg, 'roofTin', xa + 0.1, 3.55, za + 0.1, xb - 0.1, 3.62, zb - 0.1, skip=('b',))
        box(reg, 'brick', xa - 0.05, 2.8, za - 0.05, xb + 0.05, 3.3, zb + 0.05, skip=('b', 't'))
        # door on the far (outer) side, window toward the bridge
        dxo = xb if sx > 0 else xa; d = 0.06 * sx
        box(reg, 'darkWood', dxo, 0, 2.0, dxo + d, 2.2, 3.2)
        box(reg, 'stone', dxo, 2.2, 1.85, dxo + d * 1.6, 2.4, 3.35)
        wx = xa if sx > 0 else xb; d2 = -0.06 * sx
        box(reg, 'glass', wx, 1.4, 1.8, wx + d2 * 0.5, 2.4, 3.4)
        box(reg, 'darkWood', wx, 1.32, 1.72, wx + d2, 1.42, 3.48); box(reg, 'darkWood', wx, 2.4, 1.72, wx + d2, 2.48, 3.48)
        box(reg, 'darkWood', wx, 1.42, 2.56, wx + d2, 2.4, 2.64)
        # lamp on the hut corner
        lamp(reg, xa if sx > 0 else xb, za - 0.2, 2.5)


def lamp(reg, x, z, y=2.5):
    cyl(reg, 'darkSteel', (x, y / 2, z), 0.06, y, 'y', 8)
    box(reg, 'copper', x - 0.18, y, z - 0.18, x + 0.18, y + 0.08, z + 0.18)
    box(reg, 'lampGlow', x - 0.15, y + 0.08, z - 0.15, x + 0.15, y + 0.48, z + 0.15, skip=())
    box(reg, 'copper', x - 0.2, y + 0.48, z - 0.2, x + 0.2, y + 0.56, z + 0.2)
    cyl(reg, 'copper', (x, y + 0.66, z), 0.04, 0.2, 'y', 6, r2=0.0)


def winches():
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'; hx = sx * X0
        cx = hx + sx * 2.6; cz = -7.1; cy = 1.35
        cyl(reg, 'bronze', (cx, cy, cz), 1.05, 2.3, 'x', 28)                      # drum
        for k in range(14):                                                       # drum ribs
            a = 2 * math.pi * k / 14; y_ = cy + math.sin(a) * 1.08; z_ = cz + math.cos(a) * 1.08
            box(reg, 'copper', cx - 1.1, y_ - 0.05, z_ - 0.05, cx + 1.1, y_ + 0.05, z_ + 0.05)
        for e in (-1, 1): gear_vert(reg, 'bronze', cx + e * 1.25, cy, cz, 1.35, 'x', 18, 0.22)
        cyl(reg, 'darkSteel', (cx, cy, cz), 0.22, 3.4, 'x', 14)
        for e in (-1, 1): box(reg, 'darkSteel', cx + e * 1.55 - 0.15, 0, cz - 0.4, cx + e * 1.55 + 0.15, cy + 0.2, cz + 0.4)
        box(reg, 'stone', cx - 1.9, 0, cz - 1.5, cx + 1.9, 0.12, cz + 1.5)
        # small gear train down to the leaf hinge
        gear_vert(reg, 'bronze', hx + sx * 0.6, 0.55, BR_Z0 - 0.5, 0.55, 'z', 12, 0.2)
        cyl(reg, 'darkSteel', (hx + sx * 0.3, 0.0, (BR_Z0 + BR_Z1) / 2), 0.28, BR_Z1 - BR_Z0 + 1.2, 'z', 16)   # hinge axle


def crates():
    COVER = [(-25.0, -8.6, 1.4, 2.4, 1.6), (-21.5, -11.4, 2.8, 1.2, 1.2), (-17.2, -10.6, 1.3, 1.3, 1.3), (-24.6, 7.4, 1.4, 3.0, 1.6), (-14.0, 9.6, 1.3, 2.6, 1.3),
             (-11.2, 6.6, 1.2, 1.2, 1.2), (-12.4, -10.8, 2.6, 1.2, 1.4), (-16.6, 2.4, 1.2, 1.2, 1.3), (-15.0, -3.6, 2.4, 1.2, 1.2),
             (-20.4, -2.3, 1.2, 5.4, 2.6), (-19.3, 2.4, 1.2, 5.2, 2.6)]
    for sx in (1, -1):
        reg = 'west' if sx > 0 else 'east'
        for (x, z, w, d, h) in COVER:
            cx, cz = x * sx, z * sx; x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
            box(reg, 'wood', x0 + 0.04, 0, z0 + 0.04, x1 - 0.04, h - 0.04, z1 - 0.04, skip=('b',))
            f = 0.09                                                               # dark frame along every edge
            for (a, b_) in ((x0, z0), (x1 - f, z0), (x0, z1 - f), (x1 - f, z1 - f)): box(reg, 'darkWood', a, 0, b_, a + f, h, b_ + f)
            for yy in (0, h - f):
                box(reg, 'darkWood', x0, yy, z0, x1, yy + f, z0 + f); box(reg, 'darkWood', x0, yy, z1 - f, x1, yy + f, z1)
                box(reg, 'darkWood', x0, yy, z0, x0 + f, yy + f, z1); box(reg, 'darkWood', x1 - f, yy, z0, x1, yy + f, z1)
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'
        for (x, z) in ((X1 - 0.6, Z0 + 0.6), (X1 - 0.6, Z1 - 0.6), (X0 + 0.6, Z1 - 0.6)): lamp(reg, sx * x, z * sx, 2.5)


def floor_gears():
    for sx in (-1, 1):
        # the big flat gear sits on the outer edge, half of it hanging over the drop (walkable, like the SF2 radar shows)
        o = new_obj('FLOORGEAR_' + ('W' if sx < 0 else 'E'), (sx * X1, -0.2, 0.0))
        gear_flat(o, 'bronze', 0, 0.0, 0, 3.0, 30, 0.36, 0.16, 8)
        reg = 'west' if sx < 0 else 'east'
        cyl(reg, 'darkSteel', (sx * X1, -0.9, 0.0), 0.6, 1.2, 'y', 16)


# ================================================================================================ DYNAMIC OBJECTS
DYN = {}  # name → (origin game coords)


def new_obj(name, origin):
    DYN[name] = origin; return name


def bridge_leaves():
    for sx in (-1, 1):
        name = 'BRIDGE_' + ('W' if sx < 0 else 'E'); new_obj(name, (0.0, 0.0, 0.0))   # world-space mesh, origin (0,0,0)
        hx = sx * X0; xa, xb = sorted((hx, 0.0 + sx * 0.02)); za, zb = BR_Z0, BR_Z1
        deck = 'leafGreen'   # both leaves alike (SF2: green deck, yellow trim)
        box(name, deck, xa, -0.12, za, xb, 0.0, zb)
        for zz in (za, zb - 0.12):                                                # side girders + truss underneath
            box(name, 'darkSteel', xa, -0.55, zz, xb, -0.12, zz + 0.12)
        n = 7
        for k in range(n):
            x_a = xa + (xb - xa) * k / n; x_b = xa + (xb - xa) * (k + 1) / n
            for zz in (za + 0.02, zb - 0.1):
                diag(name, 'darkSteel', (x_a, -0.5, zz), (x_b, -0.15, zz), 0.07)
            box(name, 'darkSteel', x_a - 0.04, -0.55, za, x_a + 0.04, -0.12, zb)
        # yellow arrow + border inlay on the deck (points across the chasm)
        y = 0.006
        for zz in (za + 0.25, zb - 0.33): quad(name, 'arrow', [(xa + 0.2, y, zz), (xa + 0.2, y, zz + 0.08), (xb - 0.2, y, zz + 0.08), (xb - 0.2, y, zz)])
        tipx = -sx * 0.0 + sx * 1.0; basex = hx - sx * 2.2; zc = (za + zb) / 2
        quad(name, 'arrow', [(basex, y, zc - 0.12), (basex, y, zc + 0.12), (tipx + sx * 0.9, y, zc + 0.12), (tipx + sx * 0.9, y, zc - 0.12)])
        quad(name, 'arrow', [(tipx, y, zc), (tipx + sx * 1.0, y, zc + 0.6), (tipx + sx * 1.0, y, zc - 0.6), (tipx, y, zc)])
        # quadrant gear at the hinge
        gear_vert(name, 'bronze', hx - sx * 0.25, -0.1, za - 0.25, 0.7, 'z', 14, 0.16)
        gear_vert(name, 'bronze', hx - sx * 0.25, -0.1, zb + 0.25, 0.7, 'z', 14, 0.16)


def diag(obj, mat, a, b, w):
    bm = bk(obj, mat); A, B = Vector(a), Vector(b); d = (B - A); n = Vector((0, 0, 1)) * w
    up = Vector((-d.y, d.x, 0)).normalized() * w if d.length > 0 else Vector((0, w, 0))
    pts = [A - up - n, A + up - n, B + up - n, B - up - n, A - up + n, A + up + n, B + up + n, B - up + n]
    v = [bm.verts.new(G(*p)) for p in pts]
    for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        try: bm.faces.new([v[i] for i in f])
        except ValueError: pass


def trams():
    for (lid, lz, side, start) in LINES:
        name = 'TRAM_' + lid; cx = -T_DOCK if start == 0 else T_DOCK
        new_obj(name, (cx, 0.0, lz))
        hw = T_LEN / 2; z0, z1 = lz - T_W / 2, lz + T_W / 2; inner = z1 if side > 0 else z0; outer = z0 if side > 0 else z1
        o = name
        box(o, 'tramWood', cx - hw, -0.32, z0, cx + hw, 0.0, z1)                 # floor
        box(o, 'tramGreen', cx - hw - 0.05, -0.62, z0 - 0.05, cx + hw + 0.05, -0.32, z1 + 0.05)  # undercarriage skirt
        for yy in (-0.62, -0.5): box(o, 'darkSteel', cx - hw - 0.08, yy, z0 - 0.08, cx + hw + 0.08, yy + 0.05, z1 + 0.08)
        # openwork walls: low panel, then vertical slats and arched frames up to the roof (taller than a man)
        def wall_x(z_face, d, x_from, x_to):
            box(o, 'tramGreen', x_from, 0, z_face, x_to, 1.0, z_face + d)
            box(o, 'tramWood', x_from, 0.95, z_face, x_to, 1.08, z_face + d * 1.4)
            n = max(2, int((x_to - x_from) / 0.55))
            for k in range(n + 1):
                xx = x_from + (x_to - x_from) * k / n
                box(o, 'tramWood', xx - 0.05, 1.0, z_face, xx + 0.05, T_H, z_face + d)
            for k in range(n):                                                    # arch heads between the slats
                xa_ = x_from + (x_to - x_from) * k / n; xb_ = x_from + (x_to - x_from) * (k + 1) / n
                box(o, 'tramGreen', xa_, T_H - 0.42, z_face, xb_, T_H - 0.3, z_face + d)
            box(o, 'tramGreen', x_from, T_H - 0.12, z_face, x_to, T_H, z_face + d * 1.4)
        d_out = -side * 0.1 if outer == z0 else 0.1
        wall_x(outer, -0.1 if outer == z0 else 0.1, cx - hw, cx + hw)
        d_in = 0.1 if inner == z0 else -0.1
        wall_x(inner - (0 if inner == z1 else 0), -0.1 if inner == z1 else 0.1, cx - hw, cx - T_DOOR / 2)
        wall_x(inner - (0 if inner == z1 else 0), -0.1 if inner == z1 else 0.1, cx + T_DOOR / 2, cx + hw)
        box(o, 'tramGreen', cx - T_DOOR / 2 - 0.08, 0, inner - 0.08, cx - T_DOOR / 2, T_H, inner + 0.08)    # door posts
        box(o, 'tramGreen', cx + T_DOOR / 2, 0, inner - 0.08, cx + T_DOOR / 2 + 0.08, T_H, inner + 0.08)
        for e in (-1, 1):                                                        # end walls (openwork)
            xe = cx + e * hw
            box(o, 'tramGreen', xe - 0.06, 0, z0, xe + 0.06, 1.0, z1)
            for k in range(6):
                zz = z0 + T_W * (k + 0.5) / 6; box(o, 'tramWood', xe - 0.05, 1.0, zz - 0.05, xe + 0.05, T_H, zz + 0.05)
            box(o, 'tramGreen', xe - 0.06, T_H - 0.42, z0, xe + 0.06, T_H - 0.3, z1)
            box(o, 'brass_n' if False else 'copper', xe - 0.08, -0.3, z0 + 0.3, xe + 0.08, -0.1, z0 + 0.7); box(o, 'copper', xe - 0.08, -0.3, z1 - 0.7, xe + 0.08, -0.1, z1 - 0.3)
        # roof: green arched clerestory, then the trolley with two black pulley wheels on the cable
        box(o, 'tramGreen', cx - hw - 0.2, T_H, z0 - 0.2, cx + hw + 0.2, T_H + 0.14, z1 + 0.2)
        box(o, 'tramGreen', cx - hw + 0.4, T_H + 0.14, z0 + 0.5, cx + hw - 0.4, T_H + 0.48, z1 - 0.5)
        box(o, 'roofTin', cx - hw + 0.3, T_H + 0.48, z0 + 0.4, cx + hw - 0.3, T_H + 0.56, z1 - 0.4)
        box(o, 'darkSteel', cx - 1.4, T_H + 0.56, lz - 0.3, cx + 1.4, T_H + 0.8, lz + 0.3)
        for e in (-1, 1):
            cyl(o, 'rubber', (cx + e * 1.0, T_H + 1.1, lz), 0.38, 0.16, 'z', 20)
            cyl(o, 'darkSteel', (cx + e * 1.0, T_H + 1.1, lz), 0.1, 0.5, 'z', 10)
            box(o, 'darkSteel', cx + e * 1.0 - 0.06, T_H + 0.8, lz - 0.22, cx + e * 1.0 + 0.06, T_H + 1.1, lz - 0.16)
        # benches along the back wall
        box(o, 'tramWood', cx - hw + 0.4, 0.45, outer - (0.5 if outer == z1 else -0.05), cx + hw - 0.4, 0.55, outer - (0.05 if outer == z1 else -0.5))


def pulleys():
    for (lid, lz, side, start) in LINES:
        for sx in (-1, 1):
            gx = sx * (X1 + 2.6)
            name = 'GEAR_' + lid + ('W' if sx < 0 else 'E'); new_obj(name, (gx, -0.2, lz))
            gear_flat(name, 'bronze', 0, 0, 0, 2.1, 22, 0.18, 0.2, 6)
            # pole, arm back to the roof corner, cable anchor
            reg = 'west' if sx < 0 else 'east'
            cyl(reg, 'darkSteel', (gx, (T_H + 1.4) / 2 - 0.2, lz), 0.11, T_H + 1.6, 'y', 10)
            cyl(reg, 'copper', (gx, T_H + 1.15, lz), 0.22, 0.3, 'y', 14)
            ax = sx * (X1 - 0.2)
            diag(reg, 'darkSteel', (ax, -0.4, lz), (gx, -0.2, lz), 0.07)
        # the two cables (game JS draws none when the GLB is present)
        cyl('far', 'darkSteel', (0, T_H + 1.1, lz), 0.03, 2 * (X1 + 2.6), 'x', 6)
        cyl('far', 'darkSteel', (0, T_H + 1.4, lz), 0.02, 2 * (X1 + 2.6), 'x', 5)


def go_proto():
    name = 'GO_PROTO'; new_obj(name, (0.0, 0.0, 0.0))
    cyl(name, 'darkSteel', (0, 0.55, 0), 0.045, 1.1, 'y', 8)
    box(name, 'darkSteel', -0.16, 0, -0.16, 0.16, 0.06, 0.16)
    box(name, 'copper', -0.2, 1.05, -0.15, 0.2, 1.6, 0.15)                       # cabinet
    box(name, 'goPanel', -0.12, 1.2, 0.151, 0.12, 1.52, 0.16)                     # 'GO' dot display (texture)
    box(name, 'copper', -0.24, 1.6, -0.19, 0.24, 1.66, 0.19)                     # little hipped cap
    box(name, 'copper', -0.14, 1.66, -0.1, 0.14, 1.74, 0.1); cyl(name, 'copper', (0, 1.8, 0), 0.03, 0.12, 'y', 6)
    box(name, 'copper', -0.16, 0.92, -0.1, 0.16, 1.05, 0.1)
    # the two round buttons (green ◀ / red ▶) are separate materials so the game can light them
    cyl(name, 'btnGreen', (-0.07, 0.985, 0.11), 0.045, 0.03, 'z', 14); cyl(name, 'btnRed', (0.07, 0.985, 0.11), 0.045, 0.03, 'z', 14)


# ================================================================================================ CLOCK TOWER + SKY PROPS
def tower():
    reg = 'tower'
    xa, xb, za, zb = -12.0, 12.0, -40.0, -20.0
    CY, CR = 9.5, 4.2                                                             # clock centre height / radius
    box(reg, 'whiteBrick', xa, -45, za, xb, 24, zb, skip=('b', 't'))
    for yb in (-6, 0.6, 16.5, 24): box(reg, 'stone', xa - 0.3, yb - 0.5, za - 0.3, xb + 0.3, yb, zb + 0.3)
    for yb in (-2.5, 20.5): box(reg, 'brick', xa - 0.12, yb - 1.4, za - 0.12, xb + 0.12, yb, zb + 0.12, skip=('t', 'b'))
    # square clock frame (brick border + stone sill) and the arched gable above it
    box(reg, 'brick', -CR - 1.2, CY - CR - 1.2, zb, CR + 1.2, CY + CR + 1.2, zb + 0.25)
    box(reg, 'whiteBrick', -CR - 0.5, CY - CR - 0.5, zb + 0.25, CR + 0.5, CY + CR + 0.5, zb + 0.35)
    box(reg, 'stone', -CR - 1.6, CY - CR - 1.6, zb, CR + 1.6, CY - CR - 1.2, zb + 0.6)
    box(reg, 'stone', -CR - 1.6, CY + CR + 1.2, zb, CR + 1.6, CY + CR + 1.6, zb + 0.6)
    for rr, mat, d in ((6.6, 'stone', 0.7), (5.9, 'brick', 0.55), (5.2, 'whiteBrick', 0.4)): arch(reg, mat, 0, CY + CR + 1.6, zb, rr, d, 0.75)
    box(reg, 'darkSteel', -3.0, CY + CR + 1.7, zb + 0.05, 3.0, CY + CR + 4.2, zb + 0.1)   # louvred lunette
    disc(reg, 'clockFace', 0, CY, zb + 0.4, CR, 48)
    ring_v(reg, 'copper', 0, CY, zb + 0.42, CR + 0.25, 0.35, 48)
    new_obj('CLOCK_H', (0, CY, zb + 0.5)); box('CLOCK_H', 'darkSteel', -0.14, -0.35, -0.04, 0.14, 2.3, 0.04)
    new_obj('CLOCK_M', (0, CY, zb + 0.58)); box('CLOCK_M', 'darkSteel', -0.09, -0.45, -0.04, 0.09, 3.6, 0.04)
    # side towers (taller than the body) and the central stepped spire with the copper ball
    for cxx in (-9.0, 9.0):
        box(reg, 'whiteBrick', cxx - 3.0, 0.6, zb - 6.0, cxx + 3.0, 30, zb + 0.4, skip=('b',))
        t0 = 30
        for i, (half, h) in enumerate(((3.0, 6), (2.5, 6), (2.0, 4.5), (1.4, 3))):
            mat = 'brick' if i % 2 == 0 else 'whiteBrick'
            box(reg, mat, cxx - half, t0, zb - 3 - half, cxx + half, t0 + h, zb - 3 + half, skip=('b',))
            box(reg, 'stone', cxx - half - 0.25, t0 + h - 0.3, zb - 3 - half - 0.25, cxx + half + 0.25, t0 + h, zb - 3 + half + 0.25)
            t0 += h
        cyl(reg, 'tramGreen', (cxx, t0 + 0.9, zb - 3), 0.8, 1.8, 'y', 16, r2=0.05)
        for yb in (8, 16, 24): box(reg, 'brick', cxx - 3.05, yb - 1.2, zb - 6.05, cxx + 3.05, yb, zb + 0.45, skip=('t', 'b'))
    t0 = 24
    for i, (half, h) in enumerate(((4.0, 8), (3.2, 7), (2.4, 5), (1.7, 3.5))):
        mat = 'whiteBrick' if i % 2 == 0 else 'brick'
        box(reg, mat, -half, t0, zb - 5 - half, half, t0 + h, zb - 5 + half, skip=('b',))
        box(reg, 'stone', -half - 0.3, t0 + h - 0.35, zb - 5 - half - 0.3, half + 0.3, t0 + h, zb - 5 + half + 0.3)
        t0 += h
    cyl(reg, 'copper', (0, t0 + 0.7, zb - 5), 1.0, 1.4, 'y', 20, r2=0.8)
    sphere(reg, 'copper', 0, t0 + 2.4, zb - 5, 1.1)


def sphere(obj, mat, cx, cy, cz, r, seg=20, rings=12):
    bm = bk(obj, mat); grid = []
    for i in range(rings + 1):
        th = math.pi * i / rings; row = []
        for j in range(seg):
            ph = 2 * math.pi * j / seg
            row.append(bm.verts.new(G(cx + r * math.sin(th) * math.cos(ph), cy + r * math.cos(th), cz + r * math.sin(th) * math.sin(ph))))
        grid.append(row)
    for i in range(rings):
        for j in range(seg):
            k = (j + 1) % seg
            try: bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))
            except ValueError: pass


def arch(obj, mat, cx, cy, z, r, d, w=0.9):
    n = 20
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        p = [(cx + math.cos(a0) * r, cy + math.sin(a0) * r), (cx + math.cos(a1) * r, cy + math.sin(a1) * r), (cx + math.cos(a1) * (r - w), cy + math.sin(a1) * (r - w)), (cx + math.cos(a0) * (r - w), cy + math.sin(a0) * (r - w))]
        quad(obj, mat, [(p[0][0], p[0][1], z + d), (p[3][0], p[3][1], z + d), (p[2][0], p[2][1], z + d), (p[1][0], p[1][1], z + d)])
        quad(obj, mat, [(p[0][0], p[0][1], z), (p[0][0], p[0][1], z + d), (p[1][0], p[1][1], z + d), (p[1][0], p[1][1], z)])


def disc(obj, mat, cx, cy, z, r, seg):
    bm = bk(obj, mat); c = bm.verts.new(G(cx, cy, z)); rim = [bm.verts.new(G(cx + math.cos(2 * math.pi * k / seg) * r, cy + math.sin(2 * math.pi * k / seg) * r, z)) for k in range(seg)]
    for k in range(seg):
        try: bm.faces.new((c, rim[k], rim[(k + 1) % seg]))  # faces +z (south, toward the roofs)
        except ValueError: pass


def ring_v(obj, mat, cx, cy, z, r, w, seg):
    bm = bk(obj, mat); o = [bm.verts.new(G(cx + math.cos(2 * math.pi * k / seg) * r, cy + math.sin(2 * math.pi * k / seg) * r, z)) for k in range(seg)]
    i_ = [bm.verts.new(G(cx + math.cos(2 * math.pi * k / seg) * (r - w), cy + math.sin(2 * math.pi * k / seg) * (r - w), z)) for k in range(seg)]
    for k in range(seg):
        j = (k + 1) % seg
        try: bm.faces.new((o[k], o[j], i_[j], i_[k]))
        except ValueError: pass


# ================================================================================================ BUILD + EXPORT
roofs(); huts(); winches(); crates(); floor_gears(); bridge_leaves(); trams(); pulleys(); go_proto(); tower()

for (name, mat), B in BUCKETS.items():
    bm = B.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    org = DYN.get(name)
    if org is not None:
        off = G(*org)
        for v in bm.verts: v.co -= off
    uv = bm.loops.layers.uv.verify(); T = TILE.get(mat, 1.0)
    bm.normal_update()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co + (G(*org) if org is not None else Vector())
            a, b_ = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[ax]
            l[uv].uv = (a / T, -b_ / T)
    me = bpy.data.meshes.new(f'{name}__{mat}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(f'{name}__{mat}', me)
    m = bpy.data.materials.get('sky:' + mat) or bpy.data.materials.new('sky:' + mat); me.materials.append(m)
    SCN.collection.objects.link(ob)
    if org is not None:
        parent = bpy.data.objects.get(name)
        if not parent:
            parent = bpy.data.objects.new(name, None); SCN.collection.objects.link(parent); parent.location = G(*org)
        ob.parent = parent
    for p_ in me.polygons: p_.use_smooth = False
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_draco_mesh_compression_enable=False)  # Draco DLL is blocked by Windows Smart App Control on this PC
print('EXPORTED', OUT, 'objects', len(BUCKETS), 'faces', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
