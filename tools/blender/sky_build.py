# v46 SKY CITY (天空之城 · SF2 "Skywalker") — Blender visuals for src/07s_skycity.js, laid out from the player's block-out
# (maps/skycity/blockout). Geometry is written in GAME coordinates (x east, y up, z south) and converted to Blender
# (x, −z, y); the glTF Y-up export gives game space back. Alpha (west, x < 0) is modelled once and MIRRORED to Bravo.
# Static meshes are grouped per region + material ('<region>__<mat>' objects, materials 'sky:<mat>'); moving parts are
# their own objects with their pivot as origin: BRIDGE_W/E (world-space, lowered), TRAM_N/S (car centre at its start
# stop), GEAR_<line><W|E> (corner pulley gears), FLOORGEAR_W/E (outer half gears), CLOCK_H/CLOCK_M (pivot = dial centre,
# hand pointing up), GO_PROTO (one GO box, cloned in the game for every control).
# blender -b --factory-startup -P tools/blender/sky_build.py -- tools/sky/sky.glb
import bpy, bmesh, math, sys, os, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'tools/sky/sky.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
SCN = bpy.context.scene
RNG = random.Random(4612)

# ------------------------------------------------------------------------------------------------ constants (= SKY in JS)
X0, X1, Z0, Z1 = 11.0, 26.5, -12.75, 12.85
BR_Z0, BR_Z1 = -0.9, 1.8
T_LEN, T_W, T_H, T_SILL, T_DOOR, T_CABLE = 10.07, 5.4, 5.09, 2.0, 2.0, 6.29
LINES = [('N', -15.71, 1, (-17.08, 19.6), 0, -1.259), ('S', 15.71, -1, (-22.834, 20.316), 1, 1.259)]
BAYS = [('arch', 0.8), ('door', 2.0), ('rect', 1.9), ('arch', 1.8)]; WIN_TOP = 3.99   # = SKY.BAYS (seen from the platform, left → right)  # id, z, side, x@A/x@B, start, door offset
PULLEY_X, PULLEY_R = 29.2, 2.5
GEAR_Z, GEAR_R = -1.08, 5.2
HUT = (-16.37, -12.33, -7.18, -2.69, 3.2)
WINCH = (-13.5, -9.99, 2.06, 8.34, 2.7)
CRATES = [(-20.86, -19.60, -12.29, -6.57, 3.0), (-12.54, -11.64, -11.94, -9.50, 3.0), (-12.54, -11.64, -9.50, -7.00, 1.5),
          (-17.54, -16.64, 7.18, 9.87, 1.5), (-17.54, -16.64, 9.87, 12.56, 3.0), (-20.41, -17.54, 11.66, 12.56, 3.0)]
STRAW = (-22.74, -20.41, 7.18, 12.56, 3.0, 0.25, 2.1)
TOWER_Z, TOWER_X, CLOCK_Y, CLOCK_R = 19.21, 16.73, 9.5, 4.2
TILE = {'floor': 2.0, 'inlay': 1.0, 'whiteBrick': 3.0, 'brick': 1.6, 'wood': 1.5, 'darkWood': 1.5, 'stone': 2.0, 'bronze': 1.0, 'steel': 1.0,
        'darkSteel': 1.0, 'tramGreen': 1.5, 'tramWood': 1.2, 'copper': 1.0, 'glass': 2.0, 'clockFace': 1.0, 'roofTin': 1.5, 'lampGlow': 1.0,
        'goPanel': 1.0, 'tramPanel': 1.2, 'tramTrim': 1.0, 'tramBrown': 1.5, 'tramRoof': 2.0, 'hazard': 0.5, 'gearTan': 1.0, 'rustPlate': 1.5, 'railSteel': 1.0, 'leafGreen': 3.0, 'leafGrey': 3.0, 'arrow': 1.0, 'rubber': 1.0, 'cloud': 1.0}


def G(x, y, z): return Vector((x, -z, y))  # game → Blender


# ------------------------------------------------------------------------------------------------ mesh buckets
BUCKETS = {}


def bk(obj, mat):
    k = (obj, mat)
    if k not in BUCKETS: BUCKETS[k] = bmesh.new()
    return BUCKETS[k]


def quad(obj, mat, pts):
    bm = bk(obj, mat); vs = [bm.verts.new(G(*p)) for p in pts]
    try: bm.faces.new(vs)
    except ValueError: pass


def flat(obj, mat, x0, x1, z0, z1, y):
    """horizontal rectangle facing up (any corner order in)."""
    a0, a1 = sorted((x0, x1)); b0, b1 = sorted((z0, z1))
    quad(obj, mat, [(a0, y, b0), (a0, y, b1), (a1, y, b1), (a1, y, b0)])


def box(obj, mat, x0, y0, z0, x1, y1, z1, skip=()):
    x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1); z0, z1 = min(z0, z1), max(z0, z1)
    F = {'b': [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], 't': [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)],
         'n': [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], 's': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
         'w': [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], 'e': [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]}
    for k, f in F.items():
        if k not in skip: quad(obj, mat, f)


def cyl(obj, mat, c, r, length, axis='y', seg=20, r2=None, caps=True):
    """cylinder centred on c (game coords) along axis x / y / z."""
    r2 = r if r2 is None else r2; bm = bk(obj, mat); rings = []
    for end, rr in ((-1, r), (1, r2)):
        ring_ = []
        for i in range(seg):
            a = 2 * math.pi * i / seg; ca, sa = math.cos(a) * rr, math.sin(a) * rr; h = end * length / 2
            p = {'x': (c[0] + h, c[1] + ca, c[2] + sa), 'y': (c[0] + ca, c[1] + h, c[2] + sa), 'z': (c[0] + ca, c[1] + sa, c[2] + h)}[axis]
            ring_.append(bm.verts.new(G(*p)))
        rings.append(ring_)
    for i in range(seg):
        j = (i + 1) % seg
        try: bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
        except ValueError: pass
    if caps:
        ax = {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}[axis]; ax = G(*ax)
        for end, ring_ in zip((-1, 1), rings): cap(bm, ring_, ax * end)


def cap(bm, ring_, out):
    """an end cap whose normal points along out (so it is never back-face culled from outside)."""
    try: f = bm.faces.new(ring_)
    except ValueError: return
    f.normal_update()
    if f.normal.dot(out) < 0: f.normal_flip()


def box_rot(obj, mat, cx, cy, cz, a, u0, u1, v0, v1, y0, y1):
    """box in a frame rotated by a around y (u along a, v across)."""
    ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v, y: (cx + ca * u - sa * v, cy + y, cz + sa * u + ca * v)
    F = [[P(u0, v0, y0), P(u1, v0, y0), P(u1, v1, y0), P(u0, v1, y0)], [P(u0, v0, y1), P(u0, v1, y1), P(u1, v1, y1), P(u1, v0, y1)],
         [P(u0, v0, y0), P(u0, v0, y1), P(u1, v0, y1), P(u1, v0, y0)], [P(u0, v1, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v1, y1)],
         [P(u0, v0, y0), P(u0, v1, y0), P(u0, v1, y1), P(u0, v0, y1)], [P(u1, v0, y0), P(u1, v0, y1), P(u1, v1, y1), P(u1, v1, y0)]]
    for f in F: quad(obj, mat, f)


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
        box_rot(obj, mat, cx, cy, cz, 2 * math.pi * k / spokes, r * hole * 0.9, ri * 1.01, -r * 0.07, r * 0.07, -th * 0.35, th * 0.35)


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
    ax = G(1, 0, 0) if axis == 'x' else G(0, 0, 1)
    cap(bm, f0, -ax); cap(bm, f1, ax)


def ring(obj, mat, cx, y, cz, r, w, seg=28):
    bm = bk(obj, mat); o, i_ = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        o.append(bm.verts.new(G(cx + math.cos(a) * r, y, cz + math.sin(a) * r))); i_.append(bm.verts.new(G(cx + math.cos(a) * (r - w), y, cz + math.sin(a) * (r - w))))
    for k in range(seg):
        j = (k + 1) % seg
        try: bm.faces.new((o[k], i_[k], i_[j], o[j]))
        except ValueError: pass


def diag(obj, mat, a, b, w):
    if a[0] > b[0]: a, b = b, a                                        # same winding on both (mirrored) roofs
    bm = bk(obj, mat); A, B = Vector(a), Vector(b); d = (B - A); n = Vector((0, 0, 1)) * w
    up = Vector((-d.y, d.x, 0)).normalized() * w if d.length > 0 else Vector((0, w, 0))
    pts = [A - up - n, A + up - n, B + up - n, B - up - n, A - up + n, A + up + n, B + up + n, B - up + n]
    v = [bm.verts.new(G(*p)) for p in pts]
    for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        try: bm.faces.new([v[i] for i in f])
        except ValueError: pass


def sphere(obj, mat, cx, cy, cz, r, seg=20, rings=12):
    bm = bk(obj, mat); grid = []
    for i in range(rings + 1):
        th = math.pi * i / rings
        grid.append([bm.verts.new(G(cx + r * math.sin(th) * math.cos(2 * math.pi * j / seg), cy + r * math.cos(th), cz + r * math.sin(th) * math.sin(2 * math.pi * j / seg))) for j in range(seg)])
    for i in range(rings):
        for j in range(seg):
            k = (j + 1) % seg
            try: bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))
            except ValueError: pass


def arch_mz(obj, mat, cx, cy, z, r, d, w=0.9):
    """half-ring standing proud of a wall that faces −z (front face at z − d)."""
    n = 20
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        p = [(cx + math.cos(a0) * r, cy + math.sin(a0) * r), (cx + math.cos(a1) * r, cy + math.sin(a1) * r), (cx + math.cos(a1) * (r - w), cy + math.sin(a1) * (r - w)), (cx + math.cos(a0) * (r - w), cy + math.sin(a0) * (r - w))]
        quad(obj, mat, [(p[0][0], p[0][1], z - d), (p[1][0], p[1][1], z - d), (p[2][0], p[2][1], z - d), (p[3][0], p[3][1], z - d)])
        quad(obj, mat, [(p[0][0], p[0][1], z), (p[1][0], p[1][1], z), (p[1][0], p[1][1], z - d), (p[0][0], p[0][1], z - d)])


def disc_mz(obj, mat, cx, cy, z, r, seg):
    """disc in the plane z = const, facing −z."""
    bm = bk(obj, mat); c = bm.verts.new(G(cx, cy, z)); rim = [bm.verts.new(G(cx + math.cos(2 * math.pi * k / seg) * r, cy + math.sin(2 * math.pi * k / seg) * r, z)) for k in range(seg)]
    for k in range(seg):
        try: bm.faces.new((c, rim[(k + 1) % seg], rim[k]))
        except ValueError: pass


def ring_mz(obj, mat, cx, cy, z, r, w, seg):
    bm = bk(obj, mat); o = [bm.verts.new(G(cx + math.cos(2 * math.pi * k / seg) * r, cy + math.sin(2 * math.pi * k / seg) * r, z)) for k in range(seg)]
    i_ = [bm.verts.new(G(cx + math.cos(2 * math.pi * k / seg) * (r - w), cy + math.sin(2 * math.pi * k / seg) * (r - w), z)) for k in range(seg)]
    for k in range(seg):
        j = (k + 1) % seg
        try: bm.faces.new((o[k], i_[k], i_[j], o[j]))
        except ValueError: pass


def M(x, sx): return x if sx < 0 else -x                                 # Alpha x → this roof
def MR(x0, x1, sx): return (x0, x1) if sx < 0 else (-x1, -x0)


# ================================================================================================ ROOFS
def roofs():
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'
        xa, xb = MR(-X1, -X0, sx)
        box(reg, 'floor', xa, -0.3, Z0, xb, 0.0, Z1, skip=('b',))
        # cornice: red brick band + a white stone lip, then the white-brick tower with stone and brick bands
        box(reg, 'brick', xa - 0.18, -0.75, Z0 - 0.18, xb + 0.18, -0.06, Z1 + 0.18, skip=('t',))
        box(reg, 'stone', xa - 0.26, -0.34, Z0 - 0.26, xb + 0.26, -0.31, Z1 + 0.26, skip=())
        box(reg, 'whiteBrick', xa, -42.0, Z0, xb, -0.75, Z1, skip=('t', 'b'))
        for yb in (-4.5, -9.0, -16.0): box(reg, 'stone', xa - 0.12, yb - 0.35, Z0 - 0.12, xb + 0.12, yb, Z1 + 0.12)
        for yb in (-6.0, -12.0): box(reg, 'brick', xa - 0.06, yb - 0.9, Z0 - 0.06, xb + 0.06, yb, Z1 + 0.06, skip=('t', 'b'))
        hx = sx * X0                                                      # pilasters on the chasm-side wall (where everybody looks down)
        for z in (-11.0, -6.0, -2.5, 3.5, 8.5, 11.5):
            box(reg, 'whiteBrick', hx, -30, z - 0.6, hx - sx * 0.35, -0.75, z + 0.6, skip=('t', 'b'))
        # floor inlay: terracotta border + a ring in front of the spawn
        y = 0.004; w = 0.22; ins = 0.85
        xi0, xi1 = xa + ins, xb - ins
        flat(reg, 'inlay', xi0, xi1, Z0 + ins, Z0 + ins + w, y); flat(reg, 'inlay', xi0, xi1, Z1 - ins - w, Z1 - ins, y)
        flat(reg, 'inlay', xi0, xi0 + w, Z0 + ins, Z1 - ins, y); flat(reg, 'inlay', xi1 - w, xi1, Z0 + ins, Z1 - ins, y)
        cx = M(-18.3, sx)
        ring(reg, 'inlay', cx, y, 0.45, 2.2, 0.22); ring(reg, 'inlay', cx, y, 0.45, 1.2, 0.16)
        flat(reg, 'inlay', *MR(-X0 - 0.6, -18.3 + 2.0, sx), 0.34, 0.56, y)  # the line from the ring to the bridge
        # the big half gear's bearing under the outer edge
        cyl(reg, 'darkSteel', (sx * X1, -0.9, GEAR_Z), 0.7, 1.2, 'y', 16)


# ================================================================================================ HUT, WINCH, CRATES
HUT_OPEN = [('-z', -15.75, -14.55, 0.0, 2.2), ('-z', -13.95, -12.95, 1.0, 2.1), ('+z', -15.85, -14.45, 1.0, 2.1), ('+x', -6.1, -3.75, 0.95, 2.25)]   # face, u0, u1, y0, y1 (Alpha; u = x on z-walls, z on the x-walls)
HUT_T = 0.25


def hut_piece(reg, x0, x1, z0, z1, y0, y1):
    """a piece of hut wall, coloured by height band: brick plinth, white brick, brick frieze."""
    h = HUT[4]
    for (a, b, mat) in ((0, 0.9, 'brick'), (0.9, h - 0.5, 'whiteBrick'), (h - 0.5, h, 'brick')):
        lo, hi = max(y0, a), min(y1, b)
        if hi - lo > 1e-3: box(reg, mat, x0, lo, z0, x1, hi, z1)


def huts():
    x0_, x1_, z0, z1, h = HUT; t = HUT_T
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'; xa, xb = MR(x0_, x1_, sx)
        xw = {'-x': MR(x0_, x0_ + t, sx), '+x': MR(x1_ - t, x1_, sx)}
        for face in ('-z', '+z', '-x', '+x'):
            alx = face[1] == 'z'
            if alx: s0, s1 = (z0, z0 + t) if face == '-z' else (z1 - t, z1); u0, u1 = xa, xb
            else: s0, s1 = xw[face]; u0, u1 = z0, z1
            P = (lambda a, b, y0, y1, s0=s0, s1=s1, alx=alx: hut_piece(reg, a, b, s0, s1, y0, y1) if alx else hut_piece(reg, s0, s1, a, b, y0, y1))
            Bx = (lambda m, a, b, y0, y1, d, s0=s0, s1=s1, alx=alx: box(reg, m, a, y0, s0 - d, b, y1, s1 + d) if alx else box(reg, m, s0 - d, y0, a, s1 + d, y1, b))
            ops = sorted((MR(o[1], o[2], sx) if alx else (o[1], o[2])) + (o[3], o[4]) for o in HUT_OPEN if o[0] == face)
            u = u0
            for (a, b, y0, y1) in ops:
                P(u, a, 0, h)
                if y0 > 0: P(a, b, 0, y0)
                P(a, b, y1, h)
                Bx('stone', a - 0.08, b + 0.08, y1, y1 + 0.14, 0.06)                 # lintel
                if y0 > 0: Bx('stone', a - 0.05, b + 0.05, y0 - 0.1, y0, 0.08)       # sill
                u = b
            P(u, u1, 0, h)
        box(reg, 'stone', xa - 0.12, h, z0 - 0.12, xb + 0.12, h + 0.25, z1 + 0.12)          # roof slab
        box(reg, 'roofTin', xa + 0.1, h + 0.25, z0 + 0.1, xb - 0.1, h + 0.32, z1 - 0.1, skip=('b',))
        box(reg, 'whiteBrick', xa + t, h - 0.02, z0 + t, xb - t, h, z1 - t, skip=('t',))     # ceiling
        box(reg, 'darkWood', xa + t, 0.0, z0 + t, xb - t, 0.02, z1 - t, skip=('b',))          # plank floor inside
        p, q = MR(x0_ + t + 0.05, x0_ + t + 0.55, sx); box(reg, 'tramWood', p, 0.45, z0 + 1.2, q, 0.55, z1 - 1.2)   # a bench on the back wall


def winches():
    """SF2 winch: a drum of wooden staves with two tan metal bands, chunky tan gears on both ends, on a rust-brown plate."""
    x0_, x1_, z0, z1, h = WINCH
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'
        cx = M((x0_ + x1_) / 2, sx); cy = 1.55; cz = (z0 + z1) / 2; L = (z1 - z0) - 1.5
        px0, px1 = MR(x0_ - 0.25, x1_ + 0.1, sx); box(reg, 'rustPlate', px0, 0.0, z0 - 0.3, px1, 0.05, z1 + 0.3)
        cyl(reg, 'darkWood', (cx, cy, cz), 0.98, L, 'z', 22)
        n = 22; R0, R1 = 0.98, 1.07
        for k in range(n):                                                 # the staves, along the drum axis
            a0 = 2 * math.pi * (k + 0.06) / n; a1 = 2 * math.pi * (k + 0.94) / n
            P = lambda a, r, z: (cx + math.cos(a) * r, cy + math.sin(a) * r, z)
            am = (a0 + a1) / 2; out = (math.cos(am), math.sin(am), 0)
            za_, zb_ = cz - L / 2, cz + L / 2
            oface(reg, 'wood', [P(a0, R1, za_), P(a1, R1, za_), P(a1, R1, zb_), P(a0, R1, zb_)], out)
            oface(reg, 'wood', [P(a0, R0, za_), P(a0, R1, za_), P(a0, R1, zb_), P(a0, R0, zb_)], (-math.sin(a0), math.cos(a0), 0))
            oface(reg, 'wood', [P(a1, R0, za_), P(a1, R1, za_), P(a1, R1, zb_), P(a1, R0, zb_)], (math.sin(a1), -math.cos(a1), 0))
        for e in (-1, 1):
            cyl(reg, 'gearTan', (cx, cy, cz + e * (L / 2 - 0.65)), 1.12, 0.22, 'z', 28)      # metal band
            gear_vert(reg, 'gearTan', cx, cy, cz + e * (L / 2 + 0.22), 1.5, 'z', 14, 0.38)   # end gear
            cyl(reg, 'gearTan', (cx, cy, cz + e * (L / 2 + 0.22)), 0.5, 0.62, 'z', 18)       # hub
            cyl(reg, 'gearTan', (cx, cy, cz + e * (L / 2 + 0.22)), 1.12, 0.46, 'z', 28)      # rim behind the teeth
        cyl(reg, 'darkSteel', (cx, cy, cz), 0.2, z1 - z0 + 0.3, 'z', 14)
        hx = sx * X0                                                       # gear train down to the leaf hinge
        gear_vert(reg, 'gearTan', hx - sx * 0.6, 0.6, z0 - 0.1, 0.6, 'z', 10, 0.24)
        cyl(reg, 'darkSteel', (hx - sx * 0.3, -0.05, (BR_Z0 + BR_Z1) / 2), 0.26, BR_Z1 - BR_Z0 + 1.0, 'z', 16)   # hinge axle


def crate_block(reg, x0, x1, z0, z1, y0, y1):
    """one wooden crate with a dark frame along every edge."""
    box(reg, 'wood', x0 + 0.03, y0, z0 + 0.03, x1 - 0.03, y1 - 0.03, z1 - 0.03, skip=('b',))
    f = 0.09
    for (a, b_) in ((x0, z0), (x1 - f, z0), (x0, z1 - f), (x1 - f, z1 - f)): box(reg, 'darkWood', a, y0, b_, a + f, y1, b_ + f)
    for yy in (y0, y1 - f):
        box(reg, 'darkWood', x0, yy, z0, x1, yy + f, z0 + f); box(reg, 'darkWood', x0, yy, z1 - f, x1, yy + f, z1)
        box(reg, 'darkWood', x0, yy, z0, x0 + f, yy + f, z1); box(reg, 'darkWood', x1 - f, yy, z0, x1, yy + f, z1)
    if x1 - x0 > 1.0 and z1 - z0 > 1.0: return
    # a diagonal brace on the long faces of thin crates
    if x1 - x0 < z1 - z0:
        for xx in (x0 - 0.005, x1 - 0.085): box(reg, 'darkWood', xx, (y0 + y1) / 2 - 0.05, z0 + f, xx + 0.09, (y0 + y1) / 2 + 0.05, z1 - f)
    else:
        for zz in (z0 - 0.005, z1 - 0.085): box(reg, 'darkWood', x0 + f, (y0 + y1) / 2 - 0.05, zz, x1 - f, (y0 + y1) / 2 + 0.05, zz + 0.09)


def stack(reg, x0, x1, z0, z1, h):
    """a stack split into crates of about 1.5 m (one or two tiers)."""
    nx = max(1, round((x1 - x0) / 1.5)); nz = max(1, round((z1 - z0) / 1.5)); ny = max(1, round(h / 1.5))
    for i in range(nx):
        for k in range(nz):
            for j in range(ny):
                crate_block(reg, x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx, z0 + (z1 - z0) * k / nz, z0 + (z1 - z0) * (k + 1) / nz, h * j / ny, h * (j + 1) / ny)


def crates():
    for sx in (-1, 1):
        reg = 'west' if sx < 0 else 'east'
        for (x0, x1, z0, z1, h) in CRATES: stack(reg, *MR(x0, x1, sx), z0, z1, h)
        # the "straw": two crate walls and a lid of planks over a walk-through hole
        a, c, z0, z1, h, t, hole = STRAW
        stack(reg, *MR(a, a + t, sx), z0, z1, h); stack(reg, *MR(c - t, c, sx), z0, z1, h)
        p, q = MR(a + t, c - t, sx)
        box(reg, 'wood', p, hole, z0, q, h - 0.05, z1)
        for k in range(int((z1 - z0) / 0.5)):
            zz = z0 + 0.05 + k * 0.5; box(reg, 'darkWood', p, h - 0.05, zz, q, h, zz + 0.38)
        box(reg, 'darkWood', p, hole - 0.12, z0, q, hole, z0 + 0.12); box(reg, 'darkWood', p, hole - 0.12, z1 - 0.12, q, hole, z1)
        box(reg, 'darkWood', p, hole - 0.02, z0 + 0.12, q, hole, z1 - 0.12)   # ceiling of the hole


def floor_gears():
    for sx in (-1, 1):
        o = new_obj('FLOORGEAR_' + ('W' if sx < 0 else 'E'), (sx * X1, -0.2, GEAR_Z))
        gear_flat(o, 'bronze', sx * X1, -0.2, GEAR_Z, GEAR_R, 40, 0.36, 0.14, 8)


# ================================================================================================ DYNAMIC OBJECTS
DYN = {}  # name → origin (game coords)


def new_obj(name, origin):
    DYN[name] = origin; return name


def bridge_leaves():
    """SF2 bascule leaves: a matte teal deck with silver edge rails and a yellow outline that narrows toward the tip, an
    arrow pointing back to the hinge, a Warren truss under each edge, and a tan sector gear on each side of the hinge."""
    for sx in (-1, 1):
        name = 'BRIDGE_' + ('W' if sx < 0 else 'E'); new_obj(name, (0.0, 0.0, 0.0))   # world-space mesh, origin (0,0,0)
        hx = sx * X0; Lf = X0 - 0.02; za, zb = BR_Z0, BR_Z1; zc = (za + zb) / 2; W = zb - za
        X = lambda s: hx - sx * s                                          # leaf-local s (hinge → tip) to world x
        xa, xb = sorted((X(0), X(Lf)))
        box(name, 'leafGreen', xa, -0.12, za, xb, 0.0, zb)
        for zz in (za, zb - 0.09): box(name, 'railSteel', xa, 0.0, zz, xb, 0.07, zz + 0.09)   # silver edge rails
        # the truss: top chord under the deck edge, bottom chord, posts and alternating diagonals; cross beams at the posts
        D = 0.85; n = 8
        for zz in (za + 0.04, zb - 0.16):
            box(name, 'darkSteel', xa, -0.24, zz, xb, -0.12, zz + 0.12)
            box(name, 'darkSteel', min(X(0.4), X(Lf - 0.3)), -0.12 - D, zz, max(X(0.4), X(Lf - 0.3)), -D, zz + 0.12)
            for k in range(n + 1):
                s = 0.4 + (Lf - 0.7) * k / n
                box(name, 'darkSteel', X(s) - 0.05, -D, zz, X(s) + 0.05, -0.12, zz + 0.12)
                if k < n:
                    s2 = 0.4 + (Lf - 0.7) * (k + 1) / n
                    a, b = ((X(s), -D + 0.06, zz + 0.06), (X(s2), -0.18, zz + 0.06)) if k % 2 == 0 else ((X(s), -0.18, zz + 0.06), (X(s2), -D + 0.06, zz + 0.06))
                    diag(name, 'darkSteel', a, b, 0.05)
        for k in range(n + 1):
            s = 0.4 + (Lf - 0.7) * k / n; box(name, 'darkSteel', X(s) - 0.05, -0.2, za + 0.1, X(s) + 0.05, -0.12, zb - 0.1)
        # yellow outline: full width from the hinge, a step inward at 60 %, a narrow lane to the tip; arrow toward the hinge
        y = 0.006; lw = 0.08

        def line(s0, t0, s1, t1):
            dx, dz = X(s1) - X(s0), t1 - t0; ln = math.hypot(dx, dz) or 1; ox, oz = -dz / ln * lw / 2, dx / ln * lw / 2
            p = [(X(s0) + ox, y, zc + t0 + oz), (X(s1) + ox, y, zc + t1 + oz), (X(s1) - ox, y, zc + t1 - oz), (X(s0) - ox, y, zc + t0 - oz)]
            oface(name, 'arrow', p, (0, 1, 0))
        wo, wi = W / 2 - 0.3, W / 2 - 0.62; s0, s1, s2, s3 = 0.35, 0.6 * Lf, 0.6 * Lf + 0.5, Lf - 0.3
        for g in (-1, 1):
            line(s0, g * wo, s1, g * wo); line(s1, g * wo, s2, g * wi); line(s2, g * wi, s3, g * wi)
        line(s0, -wo, s0, wo); line(s3, -wi, s3, wi)
        sh0, sh1, hd = s3 - 0.5, s3 - 1.7, s3 - 2.4                        # the arrow: shaft + head, pointing to the hinge
        oface(name, 'arrow', [(X(sh0), y, zc - 0.12), (X(sh1), y, zc - 0.12), (X(sh1), y, zc + 0.12), (X(sh0), y, zc + 0.12)], (0, 1, 0))
        oface(name, 'arrow', [(X(sh1), y, zc - 0.42), (X(hd), y, zc), (X(sh1), y, zc + 0.42)], (0, 1, 0))
        for zz in (za - 0.22, zb + 0.22): gear_vert(name, 'gearTan', X(0.3), -0.25, zz, 1.05, 'z', 12, 0.26)   # sector gears at the hinge


def oface(obj, mat, pts, out):
    """a face (game coords) turned so its normal points along out (game vector)."""
    bm = bk(obj, mat)
    try: f = bm.faces.new([bm.verts.new(G(*p)) for p in pts])
    except ValueError: return
    f.normal_update()
    if f.normal.dot(G(*out)) < 0: f.normal_flip()


def opening_wall(o, mat, axis, plane, d, u0, u1, y0, y1, a0, a1, ob, ot, arch):
    """a wall slab with one opening: the slab spans u0..u1 × y0..y1 in the plane (axis 'z': u = x, plane = z; axis 'x': u = z,
    plane = x), thickness d (signed, toward the car's inside). The opening spans a0..a1 × ob..ot, with a round top when arch."""
    P = (lambda u, y, w: (u, y, plane + w)) if axis == 'z' else (lambda u, y, w: (plane + w, y, u))
    nrm = (lambda s: (0, 0, s)) if axis == 'z' else (lambda s: (s, 0, 0))
    r = (a1 - a0) / 2 if arch else 0.0; ys = ot - r; n = 10 if arch else 1
    edge = [(a0 + r - r * math.cos(math.pi * i / n), ys + r * math.sin(math.pi * i / n)) for i in range(n + 1)] if arch else [(a0, ot), (a1, ot)]
    sgn = -1 if d > 0 else 1                                               # the outer face looks away from the inside
    for w, s in ((0.0, sgn), (d, -sgn)):
        if ob > y0: oface(o, mat, [P(u0, y0, w), P(u1, y0, w), P(u1, ob, w), P(u0, ob, w)], nrm(s))     # below the opening
        oface(o, mat, [P(u0, ob, w), P(a0, ob, w), P(a0, ys, w), P(u0, ys, w)], nrm(s))                  # left jamb
        oface(o, mat, [P(a1, ob, w), P(u1, ob, w), P(u1, ys, w), P(a1, ys, w)], nrm(s))                  # right jamb
        oface(o, mat, [P(u0, ys, w), P(a0, ys, w), P(a0, y1, w), P(u0, y1, w)], nrm(s))
        oface(o, mat, [P(a1, ys, w), P(u1, ys, w), P(u1, y1, w), P(a1, y1, w)], nrm(s))
        for i in range(len(edge) - 1):                                    # over the arch / lintel
            (ua, ya), (ub, yb) = edge[i], edge[i + 1]
            oface(o, mat, [P(ua, ya, w), P(ub, yb, w), P(ub, y1, w), P(ua, y1, w)], nrm(s))
    # reveals (the depth of the opening)
    rim = [(a0, ob), (a0, ys)] + edge + [(a1, ys), (a1, ob)]
    for i in range(len(rim) - 1):
        (ua, ya), (ub, yb) = rim[i], rim[i + 1]
        mid_u, mid_y = (ua + ub) / 2, (ya + yb) / 2; cu, cy = (a0 + a1) / 2, (ob + ys) / 2
        out = (cu - mid_u, 0, 0) if axis == 'z' else (0, 0, cu - mid_u)
        out = (out[0], cy - mid_y, out[2])
        oface(o, mat, [P(ua, ya, 0), P(ub, yb, 0), P(ub, yb, d), P(ua, ya, d)], out)
    if ob > y0:
        oface(o, mat, [P(a0, ob, 0), P(a1, ob, 0), P(a1, ob, d), P(a0, ob, d)], (0, 1, 0))


def trams():
    """SF2 trams: a green painted-steel frame (matte), wood wainscot with a green inset and a salmon outer frame below the
    sill, open windows above (arched at the ends of each side, square next to the doorway), dark-brown undercarriage with
    yellow/black bumper blocks, green eaves and clerestory, a green hanger to the trolley on the cable."""
    for (lid, lz, side, xs, start, door) in LINES:
        name = 'TRAM_' + lid; cx = xs[start]; o = name
        new_obj(name, (cx, 0.0, lz))
        hw = T_LEN / 2; z0, z1 = lz - T_W / 2, lz + T_W / 2; inner = z1 if side > 0 else z0; outer = z0 if side > 0 else z1
        top = T_H - 0.5; frieze = top - 0.4; th = 0.12
        # floor + undercarriage
        box(o, 'tramWood', cx - hw, -0.06, z0, cx + hw, 0.0, z1, skip=('b',))
        box(o, 'tramBrown', cx - hw, -0.34, z0, cx + hw, -0.06, z1)
        box(o, 'tramBrown', cx - hw + 0.6, -0.72, z0 + 0.5, cx + hw - 0.6, -0.34, z1 - 0.5)
        for e in (-1, 1):
            for zz in (z0 + 0.25, z1 - 0.95):
                box(o, 'hazard', cx + e * (hw - 0.35) - 0.35, -0.72, zz, cx + e * (hw - 0.35) + 0.35, -0.34, zz + 0.7)
        # the long walls: five bays, the middle one is the doorway (platform side) or a square window (cliff side)
        # the long walls: four equal bays (see BAYS); on the back wall the doorway bay is a square window
        bw = T_LEN / 4
        bays = []
        for i, (kind, w) in enumerate(BAYS):
            c = cx + (-hw + (i + 0.5) * bw if side > 0 else hw - (i + 0.5) * bw); bays.append((c - bw / 2, c + bw / 2, c, kind, w))
        for zf, dz, is_inner in ((outer, th if outer == z0 else -th, False), (inner, th if inner == z0 else -th, True)):
            nz = -1 if dz > 0 else 1                                       # outward normal (z)
            for (b0, b1, c, kind, w) in bays:
                if kind == 'door' and is_inner:
                    opening_wall(o, 'tramTrim', 'z', zf, dz, b0, b1, 0.0, frieze, c - w / 2, c + w / 2, 0.0, WIN_TOP, False)
                    continue
                if kind == 'door': kind, w = 'rect', 1.9
                # wainscot below the sill: planks + a green inset frame and a salmon outer frame (on both faces)
                box(o, 'tramPanel', b0, 0.18, zf, b1, T_SILL, zf + dz)
                box(o, 'tramBrown', b0, 0.0, zf + 0.02 * nz, b1, 0.18, zf + dz - 0.02 * nz)
                for wz in (zf + 0.015 * nz, zf + dz - 0.015 * nz):
                    for (pa, pb, ya, yb) in ((b0 + 0.22, b0 + 0.3, 0.4, T_SILL - 0.22), (b1 - 0.3, b1 - 0.22, 0.4, T_SILL - 0.22),
                                             (b0 + 0.22, b1 - 0.22, 0.4, 0.48), (b0 + 0.22, b1 - 0.22, T_SILL - 0.3, T_SILL - 0.22)):
                        box(o, 'tramGreen', pa, ya, wz - 0.01, pb, yb, wz + 0.01)
                box(o, 'tramTrim', b0, T_SILL - 0.08, zf + 0.04 * nz, b1, T_SILL + 0.06, zf + dz - 0.04 * nz)   # sill rail
                opening_wall(o, 'tramTrim', 'z', zf, dz, b0, b1, T_SILL + 0.06, frieze, c - w / 2, c + w / 2, T_SILL + 0.06, WIN_TOP, kind == 'arch')
            for k in (1, 2, 3):                                            # green posts between the bays
                xx = cx - hw + k * bw; box(o, 'tramGreen', xx - 0.1, 0.0, zf + 0.03 * nz, xx + 0.1, frieze, zf + dz - 0.03 * nz)
            box(o, 'tramGreen', cx - hw, frieze, zf + 0.05 * nz, cx + hw, top, zf + dz - 0.05 * nz)      # frieze band
        # end walls: two arched windows each
        for e in (-1, 1):
            xf = cx + e * hw; dx = -e * th
            for (a, b) in ((z0, lz), (lz, z1)):
                box(o, 'tramPanel', xf + min(0, dx), 0.18, a, xf + max(0, dx), T_SILL, b)
                box(o, 'tramBrown', xf + min(0, dx) - 0.02, 0.0, a, xf + max(0, dx) + 0.02, 0.18, b)
                box(o, 'tramTrim', xf + min(0, dx) - 0.04, T_SILL - 0.08, a, xf + max(0, dx) + 0.04, T_SILL + 0.06, b)
                opening_wall(o, 'tramTrim', 'x', xf, dx, a, b, T_SILL + 0.06, frieze, a + 0.3, b - 0.3, T_SILL + 0.06, frieze - 0.2, True)
            box(o, 'tramGreen', xf + min(0, dx) - 0.05, frieze, z0, xf + max(0, dx) + 0.05, top, z1)
            box(o, 'tramGreen', xf + min(0, dx) - 0.03, 0.0, lz - 0.09, xf + max(0, dx) + 0.03, frieze, lz + 0.09)
        for (xx, zz) in ((cx - hw, z0), (cx + hw, z0), (cx - hw, z1), (cx + hw, z1)):   # corner posts
            box(o, 'tramGreen', xx - 0.13, 0.0, zz - 0.13, xx + 0.13, top + 0.05, zz + 0.13)
        # roof: green eaves with a dark rim, clerestory with small windows, dark roof sheet
        box(o, 'tramGreen', cx - hw - 0.3, top, z0 - 0.3, cx + hw + 0.3, top + 0.12, z1 + 0.3)
        box(o, 'tramBrown', cx - hw - 0.32, top + 0.12, z0 - 0.32, cx + hw + 0.32, top + 0.17, z1 + 0.32)
        box(o, 'tramGreen', cx - hw + 0.5, top + 0.17, z0 + 0.7, cx + hw - 0.5, top + 0.45, z1 - 0.7)
        for k in range(6):
            xx = cx - hw + 0.9 + k * (T_LEN - 1.8) / 5
            for zz in (z0 + 0.69, z1 - 0.71): box(o, 'tramBrown', xx - 0.3, top + 0.22, zz, xx + 0.3, top + 0.4, zz + 0.02)
        box(o, 'tramRoof', cx - hw + 0.4, top + 0.45, z0 + 0.6, cx + hw - 0.4, top + 0.52, z1 - 0.6)
        # hanger (green arm) to the trolley with two black wheels on the cable
        box(o, 'tramGreen', cx - 1.7, top + 0.52, lz - 0.28, cx + 1.7, top + 0.66, lz + 0.28)
        for e in (-1, 1):
            box(o, 'tramGreen', cx + e * 1.2 - 0.08, top + 0.66, lz - 0.28, cx + e * 1.2 + 0.08, T_CABLE + 0.32, lz - 0.14)
            cyl(o, 'rubber', (cx + e * 1.2, T_CABLE + 0.32, lz), 0.32, 0.16, 'z', 20)
            cyl(o, 'darkSteel', (cx + e * 1.2, T_CABLE + 0.32, lz), 0.09, 0.42, 'z', 10)
        # benches along the back wall: wood seat on dark-brown legs
        zb0, zb1 = (outer + 0.14, outer + 0.64) if outer == z0 else (outer - 0.64, outer - 0.14)
        for (a, b) in ((cx - hw + 0.4, cx - 0.2), (cx + 0.2, cx + hw - 0.4)):
            box(o, 'tramWood', a, 0.45, zb0, b, 0.53, zb1)
            for xx in (a + 0.2, (a + b) / 2, b - 0.2): box(o, 'tramBrown', xx - 0.05, 0.0, zb0 + 0.08, xx + 0.05, 0.45, zb1 - 0.08)


def pulleys():
    for (lid, lz, side, xs, start, door) in LINES:
        for sx in (-1, 1):
            gx = sx * PULLEY_X
            name = 'GEAR_' + lid + ('W' if sx < 0 else 'E'); new_obj(name, (gx, -0.2, lz))
            gear_flat(name, 'bronze', gx, -0.2, lz, PULLEY_R, 24, 0.2, 0.2, 6)
            reg = 'west' if sx < 0 else 'east'                             # the cable pole on the pulley's axle
            cyl(reg, 'darkSteel', (gx, (T_CABLE + 0.6 - 1.5) / 2, lz), 0.16, T_CABLE + 0.6 + 1.5, 'y', 12)
            cyl(reg, 'copper', (gx, T_CABLE, lz), 0.42, 0.16, 'z', 18)       # cable sheave at the top
            box(reg, 'copper', gx - 0.3, T_CABLE + 0.45, lz - 0.3, gx + 0.3, T_CABLE + 0.6, lz + 0.3)
            diag(reg, 'darkSteel', (sx * (X1 - 0.2), -0.4, lz * 0.8), (gx, -0.2, lz), 0.08)   # arm back to the roof
        cyl('far', 'darkSteel', (0, T_CABLE, lz), 0.035, 2 * PULLEY_X, 'x', 6)
        cyl('far', 'darkSteel', (0, T_CABLE + 0.32, lz), 0.02, 2 * PULLEY_X, 'x', 5)


def go_proto():
    name = 'GO_PROTO'; new_obj(name, (0.0, 0.0, 0.0))
    cyl(name, 'darkSteel', (0, 0.55, 0), 0.045, 1.1, 'y', 8)
    box(name, 'darkSteel', -0.16, 0, -0.16, 0.16, 0.06, 0.16)
    box(name, 'copper', -0.2, 1.05, -0.15, 0.2, 1.6, 0.15)
    box(name, 'goPanel', -0.12, 1.2, 0.151, 0.12, 1.52, 0.16)
    box(name, 'copper', -0.24, 1.6, -0.19, 0.24, 1.66, 0.19)
    box(name, 'copper', -0.14, 1.66, -0.1, 0.14, 1.74, 0.1); cyl(name, 'copper', (0, 1.8, 0), 0.03, 0.12, 'y', 6)
    box(name, 'copper', -0.16, 0.92, -0.1, 0.16, 1.05, 0.1)
    cyl(name, 'btnGreen', (-0.07, 0.985, 0.11), 0.045, 0.03, 'z', 14); cyl(name, 'btnRed', (0.07, 0.985, 0.11), 0.045, 0.03, 'z', 14)


# ================================================================================================ CLOCK TOWER
def tower():
    reg = 'tower'; F = TOWER_Z; xa, xb = -TOWER_X, TOWER_X; zb = F + 20; CY, CR = CLOCK_Y, CLOCK_R
    box(reg, 'whiteBrick', xa, -45, F, xb, 24, zb, skip=('b', 't'))
    for yb in (-6, 0.6, 16.5, 24): box(reg, 'stone', xa - 0.3, yb - 0.5, F - 0.3, xb + 0.3, yb, zb + 0.3)
    for yb in (-2.5, 20.5): box(reg, 'brick', xa - 0.12, yb - 1.4, F - 0.12, xb + 0.12, yb, zb + 0.12, skip=('t', 'b'))
    # square clock frame (brick border + stone sills) and the arched gable above it, all on the face toward the roofs (−z)
    box(reg, 'brick', -CR - 1.2, CY - CR - 1.2, F - 0.25, CR + 1.2, CY + CR + 1.2, F)
    box(reg, 'whiteBrick', -CR - 0.5, CY - CR - 0.5, F - 0.35, CR + 0.5, CY + CR + 0.5, F - 0.25)
    box(reg, 'stone', -CR - 1.6, CY - CR - 1.6, F - 0.6, CR + 1.6, CY - CR - 1.2, F)
    box(reg, 'stone', -CR - 1.6, CY + CR + 1.2, F - 0.6, CR + 1.6, CY + CR + 1.6, F)
    for rr, mat, d in ((6.6, 'stone', 0.7), (5.9, 'brick', 0.55), (5.2, 'whiteBrick', 0.4)): arch_mz(reg, mat, 0, CY + CR + 1.6, F, rr, d, 0.75)
    box(reg, 'darkSteel', -3.0, CY + CR + 1.7, F - 0.1, 3.0, CY + CR + 4.2, F - 0.05)
    disc_mz(reg, 'clockFace', 0, CY, F - 0.4, CR, 48)
    ring_mz(reg, 'copper', 0, CY, F - 0.42, CR + 0.25, 0.35, 48)
    new_obj('CLOCK_H', (0, CY, F - 0.5)); box('CLOCK_H', 'darkSteel', -0.14, CY - 0.35, F - 0.54, 0.14, CY + 2.3, F - 0.46)
    new_obj('CLOCK_M', (0, CY, F - 0.58)); box('CLOCK_M', 'darkSteel', -0.09, CY - 0.45, F - 0.62, 0.09, CY + 3.6, F - 0.54)
    # side towers (taller than the body) and the central stepped spire with the copper ball
    for cxx in (-TOWER_X + 3.0, TOWER_X - 3.0):
        box(reg, 'whiteBrick', cxx - 3.0, 0.6, F - 0.4, cxx + 3.0, 30, F + 6.0, skip=('b',))
        t0 = 30
        for i, (half, h) in enumerate(((3.0, 6), (2.5, 6), (2.0, 4.5), (1.4, 3))):
            mat = 'brick' if i % 2 == 0 else 'whiteBrick'
            box(reg, mat, cxx - half, t0, F + 3 - half, cxx + half, t0 + h, F + 3 + half, skip=('b',))
            box(reg, 'stone', cxx - half - 0.25, t0 + h - 0.3, F + 3 - half - 0.25, cxx + half + 0.25, t0 + h, F + 3 + half + 0.25)
            t0 += h
        cyl(reg, 'tramGreen', (cxx, t0 + 0.9, F + 3), 0.8, 1.8, 'y', 16, r2=0.05)
        for yb in (8, 16, 24): box(reg, 'brick', cxx - 3.05, yb - 1.2, F - 0.45, cxx + 3.05, yb, F + 6.05, skip=('t', 'b'))
        for yb in (12.5, 20.5):                                            # slit windows on the side towers
            box(reg, 'darkSteel', cxx - 0.5, yb - 1.6, F - 0.42, cxx + 0.5, yb, F - 0.4)
    t0 = 24
    for i, (half, h) in enumerate(((4.0, 8), (3.2, 7), (2.4, 5), (1.7, 3.5))):
        mat = 'whiteBrick' if i % 2 == 0 else 'brick'
        box(reg, mat, -half, t0, F + 5 - half, half, t0 + h, F + 5 + half, skip=('b',))
        box(reg, 'stone', -half - 0.3, t0 + h - 0.35, F + 5 - half - 0.3, half + 0.3, t0 + h, F + 5 + half + 0.3)
        t0 += h
    cyl(reg, 'copper', (0, t0 + 0.7, F + 5), 1.0, 1.4, 'y', 20, r2=0.8)
    sphere(reg, 'copper', 0, t0 + 2.4, F + 5, 1.1)


# ================================================================================================ BUILD + EXPORT
roofs(); huts(); winches(); crates(); floor_gears(); bridge_leaves(); trams(); pulleys(); go_proto(); tower()

for (name, mat), bm in BUCKETS.items():
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    org = DYN.get(name)
    off = G(*org) if org is not None else Vector()
    for v in bm.verts: v.co -= off
    uv = bm.loops.layers.uv.verify(); T = TILE.get(mat, 1.0)
    bm.normal_update()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co + off
            a, b_ = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[ax]
            l[uv].uv = (a / T, -b_ / T)
    me = bpy.data.meshes.new(f'{name}__{mat}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(f'{name}__{mat}', me)
    m = bpy.data.materials.get('sky:' + mat) or bpy.data.materials.new('sky:' + mat); me.materials.append(m)
    SCN.collection.objects.link(ob)
    if org is not None:
        parent = bpy.data.objects.get(name)
        if not parent:
            parent = bpy.data.objects.new(name, None); SCN.collection.objects.link(parent); parent.location = off
        ob.parent = parent
    for p_ in me.polygons: p_.use_smooth = False
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_draco_mesh_compression_enable=False)  # Draco DLL is blocked by Windows Smart App Control on this PC
print('EXPORTED', OUT, 'objects', len(BUCKETS), 'faces', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
