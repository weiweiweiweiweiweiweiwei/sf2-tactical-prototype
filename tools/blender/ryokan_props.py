# v44 Sakura Inn — props, vegetation, backdrop. exec()'d by ryokan_build.py (shares its helpers and globals).
import math, random

R2 = random.Random(4401)


def tube(group, mat, path, radii, seg=7, cap=True):
    """generalised cylinder along a polyline (game coords), radius per point; UV u around, v along length."""
    rings = []; L = 0.0; tu, tv = TILE.get(mat, (1, 1))
    for i, p in enumerate(path):
        p = Vector(p)
        t = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        a = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 0, 1)); s = t.cross(a).normalized(); u = s.cross(t).normalized()
        if i: L += (p - Vector(path[i - 1])).length
        rings.append([tuple(p + (s * math.cos(2 * math.pi * k / seg) + u * math.sin(2 * math.pi * k / seg)) * radii[i]) for k in range(seg)] + [L])
    for i in range(len(rings) - 1):
        r0, r1, v0, v1 = rings[i][:seg], rings[i + 1][:seg], rings[i][seg] / tv, rings[i + 1][seg] / tv
        c = tuple((Vector(path[i]) + Vector(path[i + 1])) / 2)
        for k in range(seg):
            k1 = (k + 1) % seg
            poly(group, mat, [r0[k], r0[k1], r1[k1], r1[k]], [(k / seg, v0), ((k + 1) / seg, v0), ((k + 1) / seg, v1), (k / seg, v1)], center=c)
    if cap and radii[-1] > 0.01: poly(group, mat, rings[-1][:seg], center=path[-2])


def card(group, mat, c, nrm, size, rot=0.0, uv=(0, 0, 1, 1), soft_center=None):
    """alpha-tested foliage card facing `nrm`; normals bent toward `soft_center` for a rounded canopy."""
    n = Vector(nrm).normalized(); a = Vector((0, 1, 0)) if abs(n.y) < 0.95 else Vector((1, 0, 0))
    s = n.cross(a).normalized(); u = s.cross(n).normalized()
    s, u = s * math.cos(rot) + u * math.sin(rot), -s * math.sin(rot) + u * math.cos(rot)
    c = Vector(c); h = size / 2
    pts = [tuple(c - s * h - u * h), tuple(c + s * h - u * h), tuple(c + s * h + u * h), tuple(c - s * h + u * h)]
    u0, v0, u1, v1 = uv
    nn = None
    if soft_center is not None:
        nn = [tuple(((Vector(p) - Vector(soft_center)).normalized() * 0.75 + Vector((0, 0.45, 0))).normalized()) for p in pts]
    poly(group, mat, pts, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], want=tuple(n), nrm=nn)
    poly(group, mat, pts[::-1], [(u0, v1), (u1, v1), (u1, v0), (u0, v0)], want=tuple(-n), nrm=(nn[::-1] if nn else None))


def blob(group, mat, c, rx, ry, rz, seg=8, rings=5, jit=0.12, rng=R2):
    """lumpy ellipsoid (pine pads, bushes, rocks)."""
    cx, cy, cz = c; P_ = []
    for j in range(rings + 1):
        th = math.pi * j / rings; row = []
        for i in range(seg):
            ph = 2 * math.pi * i / seg; k = 1 + (rng.random() - 0.5) * 2 * jit if 0 < j < rings else 1
            row.append((cx + math.sin(th) * math.cos(ph) * rx * k, cy + math.cos(th) * ry * k, cz + math.sin(th) * math.sin(ph) * rz * k))
        P_.append(row)
    for j in range(rings):
        for i in range(seg):
            i1 = (i + 1) % seg
            q = [P_[j][i], P_[j][i1], P_[j + 1][i1], P_[j + 1][i]]
            if j == 0: q = [P_[0][0], P_[1][i1], P_[1][i]]
            elif j == rings - 1: q = [P_[j][i], P_[j][i1], P_[rings][0]]
            poly(group, mat, q, center=c)


# ---------------------------------------------------------------------------- vegetation
def sakura(x, z, h=6.2, seed=0):
    """cherry tree: leaning trunk, forked scaffold limbs, ~420 blossom cards on clusters at the limb tips."""
    g = 'veg'; rng = random.Random(seed or int(x * 31 + z * 17))
    lean = Vector((rng.uniform(-0.4, 0.4), 0, rng.uniform(-0.4, 0.4)))
    base = Vector((x, -0.1, z)); fork = base + Vector((0, h * 0.38, 0)) + lean * 0.6
    trunk = [tuple(base), tuple(base + (fork - base) * 0.5 + Vector((rng.uniform(-0.1, 0.1), 0, rng.uniform(-0.1, 0.1)))), tuple(fork)]
    tube(g, 'bark', trunk, [0.34, 0.26, 0.22], seg=9)
    tips = []
    for k in range(rng.randint(4, 6)):
        ang = 2 * math.pi * k / 5 + rng.uniform(-0.4, 0.4); out = rng.uniform(1.8, 3.0); up = rng.uniform(1.4, 2.6)
        d = Vector((math.cos(ang), 0, math.sin(ang)))
        mid = fork + d * out * 0.45 + Vector((0, up * 0.55, 0)); end = fork + d * out + Vector((0, up, 0))
        tube(g, 'bark', [tuple(fork), tuple(mid), tuple(end)], [0.16, 0.1, 0.05], seg=6, cap=False)
        tips.append(end)
        for q in range(2):  # twigs
            a2 = ang + rng.uniform(-0.9, 0.9); d2 = Vector((math.cos(a2), 0, math.sin(a2)))
            st = mid + (end - mid) * rng.uniform(0.2, 0.7); en = st + d2 * rng.uniform(0.8, 1.6) + Vector((0, rng.uniform(0.2, 0.9), 0))
            tube(g, 'bark', [tuple(st), tuple(en)], [0.05, 0.02], seg=5, cap=False); tips.append(en)
    centre = fork + Vector((0, h * 0.42, 0))
    for t in tips:  # blossom clusters: cards scattered in a squashed sphere around each tip
        R = rng.uniform(0.9, 1.4)
        for i in range(44):
            th, ph = rng.uniform(0, math.pi), rng.uniform(0, 2 * math.pi)
            off = Vector((math.sin(th) * math.cos(ph) * R, math.cos(th) * R * 0.62, math.sin(th) * math.sin(ph) * R))
            p = t + off; n = (off + Vector((0, 0.35, 0))).normalized()
            k = rng.randint(0, 3); uv = ((k % 2) * 0.5, (k // 2) * 0.5, (k % 2) * 0.5 + 0.5, (k // 2) * 0.5 + 0.5)
            card(g, 'sakura', tuple(p), tuple(n), rng.uniform(0.5, 0.82), rng.uniform(0, 6.28), uv, soft_center=tuple(centre))


def pine(x, z, h=5.5, seed=0):
    """cloud-pruned pine (niwaki): crooked trunk, tiers of rounded needle clouds on short limbs."""
    g = 'veg'; rng = random.Random(seed or int(x * 13 + z * 7))
    p0 = Vector((x, -0.1, z)); pts = [p0]
    for i in range(5): pts.append(pts[-1] + Vector((rng.uniform(-0.4, 0.4), h * 0.17, rng.uniform(-0.4, 0.4))))
    tube(g, 'bark', [tuple(p) for p in pts], [0.24, 0.2, 0.17, 0.13, 0.1, 0.07], seg=7)
    for i, p in enumerate(pts[2:]):
        for k in range(3 if i < 3 else 2):
            a = rng.uniform(0, 6.28); L = rng.uniform(0.7, 1.4) * (1 - i * 0.14)
            e = p + Vector((math.cos(a) * L, rng.uniform(0.0, 0.3), math.sin(a) * L))
            tube(g, 'bark', [tuple(p), tuple(e)], [0.06, 0.035], seg=5, cap=False)
            for q in range(4):  # a cloud = several overlapping puffs
                o = Vector((rng.uniform(-0.35, 0.35), rng.uniform(0.05, 0.22), rng.uniform(-0.35, 0.35)))
                r = rng.uniform(0.32, 0.5) * (1 - i * 0.08)
                blob(g, 'pine', tuple(e + o), r, r * 0.62, r, seg=8, rings=4, jit=0.14, rng=rng)
    for q in range(5): blob(g, 'pine', tuple(pts[-1] + Vector((rng.uniform(-0.3, 0.3), 0.25 + rng.uniform(0, 0.2), rng.uniform(-0.3, 0.3)))), 0.42, 0.3, 0.42, seg=8, rings=4, jit=0.12, rng=rng)


def shrub(x, z, r=0.7):
    rng = random.Random(int(x * 7 + z * 3))
    for q in range(10):
        o = (rng.uniform(-0.5, 0.5) * r, rng.uniform(0.25, 0.75) * r, rng.uniform(-0.5, 0.5) * r)
        blob('veg', 'hedge', (x + o[0], o[1], z + o[2]), r * rng.uniform(0.35, 0.52), r * rng.uniform(0.3, 0.42), r * rng.uniform(0.35, 0.52), seg=7, rings=4, jit=0.2, rng=rng)


# ---------------------------------------------------------------------------- structures
def torii(x, z, w=5.2, h=5.2):
    g = 'props'; hw = w / 2
    for sx in (-1, 1):
        tube(g, 'akai', [(x + sx * hw, 0.4, z), (x + sx * (hw - 0.12), h - 0.35, z)], [0.3, 0.26], seg=14)
        cyl(g, 'kuroita', x + sx * hw, z, 0.36, 0, 0.45, seg=14)             # black base sleeve (kamaki)
    box(g, 'akai', x - hw - 0.75, h - 1.15, z - 0.17, x + hw + 0.75, h - 0.85, z + 0.17)   # nuki tie beam
    box(g, 'akai', x - 0.15, h - 0.85, z - 0.12, x + 0.15, h - 0.35, z + 0.12)            # gakuzuka strut
    N = 16  # kasagi (+ shimaki) with upturned ends
    for layer, (y0, th, mat, ext) in enumerate(((h - 0.38, 0.26, 'akai', 1.15), (h - 0.12, 0.24, 'kuroita', 1.35))):
        prev = None
        for i in range(N + 1):
            t = i / N * 2 - 1; xx = x + t * (hw + ext); lift = 0.32 * abs(t) ** 2.4
            cur = ((xx, y0 + lift, z - 0.24), (xx, y0 + lift + th, z + 0.24))
            if prev: box(g, mat, prev[0][0], min(prev[0][1], cur[0][1]), cur[0][2], cur[0][0], max(prev[1][1], cur[1][1]), cur[1][2])
            prev = cur


def stone_lantern(x, z, s=1.0):
    g = 'props'
    box(g, 'ishi', x - 0.42 * s, 0, z - 0.42 * s, x + 0.42 * s, 0.22 * s, z + 0.42 * s)
    cyl(g, 'ishi', x, z, 0.14 * s, 0.22 * s, 1.0 * s, seg=10)
    box(g, 'ishi', x - 0.36 * s, 1.0 * s, z - 0.36 * s, x + 0.36 * s, 1.16 * s, z + 0.36 * s)
    box(g, 'ishi', x - 0.26 * s, 1.16 * s, z - 0.26 * s, x + 0.26 * s, 1.56 * s, z + 0.26 * s, mats={'n': 'paper', 's': 'paper'})
    cyl(g, 'ishi', x, z, 0.62 * s, 1.56 * s, 1.86 * s, seg=6, r1=0.12 * s)
    cyl(g, 'ishi', x, z, 0.1 * s, 1.86 * s, 2.0 * s, seg=8, r1=0.03 * s)


def street_lamp(x, z):
    g = 'props'
    cyl(g, 'kuroita', x, z, 0.09, 0, 3.6, seg=8)
    box(g, 'hashira', x - 0.75, 3.35, z - 0.05, x + 0.75, 3.45, z + 0.05)
    for sx in (-1, 1):
        cx = x + sx * 0.62
        box(g, 'hashira', cx - 0.02, 3.05, z - 0.02, cx + 0.02, 3.35, z + 0.02)
        cyl(g, 'paper', cx, z, 0.17, 2.55, 3.05, seg=10)                # hanging paper lantern
        cyl(g, 'hashira', cx, z, 0.13, 3.05, 3.1, seg=10)
        cyl(g, 'hashira', cx, z, 0.13, 2.5, 2.55, seg=10)


def chochin(x, y, z, r=0.2, mat='paperRed'):
    cyl('props', mat, x, z, r, y - r * 1.5, y, seg=10, r1=r * 0.95)
    cyl('props', 'kuroita', x, z, r * 0.7, y, y + 0.05, seg=10); cyl('props', 'kuroita', x, z, r * 0.7, y - r * 1.55, y - r * 1.5, seg=10)
    box('props', 'kuroita', x - 0.01, y + 0.05, z - 0.01, x + 0.01, y + 0.35, z + 0.01)


def barrel(x, z, r=0.48, h=1.25):
    g = 'props'
    for i in range(6):
        y0, y1 = h * i / 6, h * (i + 1) / 6; k0, k1 = 1 + 0.08 * math.sin(math.pi * i / 6), 1 + 0.08 * math.sin(math.pi * (i + 1) / 6)
        cyl(g, 'koshi', x, z, r * k0, y0, y1, seg=14, caps=(i == 5), r1=r * k1)
    for y in (0.18, h * 0.5, h - 0.18): cyl(g, 'bamboo', x, z, r * (1.0 + 0.08 * math.sin(math.pi * y / h)) + 0.012, y - 0.04, y + 0.04, seg=14, caps=False)


def crate(x, z, s, y0=0.0):
    box('props', 'koshi', x - s / 2, y0, z - s / 2, x + s / 2, y0 + s, z + s / 2)
    for d in (-1, 1):
        box('props', 'hashira', x - s / 2 - 0.015, y0, z + d * s * 0.32 - 0.04, x + s / 2 + 0.015, y0 + s + 0.015, z + d * s * 0.32 + 0.04)


def cart(x, z):  # daihachi-guruma: two big spoked wheels, slatted bed, pull bars
    g = 'props'
    box(g, 'koshi', x - 1.0, 0.85, z - 2.2, x + 1.0, 0.95, z + 1.6)
    for sx in (-1, 1):
        box(g, 'hashira', x + sx * 0.95 - 0.05, 0.75, z - 3.2, x + sx * 0.95 + 0.05, 0.85, z + 1.6)
        wx = x + sx * 1.12
        for k in range(16):
            a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
            box(g, 'hashira', wx - 0.05, 0.62 + math.sin(a0) * 0.6, z + math.cos(a0) * 0.6 - 0.04, wx + 0.05, 0.62 + math.sin(a0) * 0.6 + 0.08, z + math.cos(a0) * 0.6 + 0.04)
        for k in range(8):
            a = math.pi * k / 8; c, s = math.cos(a), math.sin(a)
            beam(g, 'hashira', (wx, 0.62 - s * 0.58, z - c * 0.58), (wx, 0.62 + s * 0.58, z + c * 0.58), 0.04, 0.04)
        cyl(g, 'hashira', wx, z, 0.12, 0.5, 0.74, seg=8)
    for i in range(3): crate(x + (i - 1) * 0.6, z - 1.0 + (i % 2) * 0.6, 0.55, 0.95)


def well(x, z):
    g = 'props'
    for i in range(12):
        a0, a1 = 2 * math.pi * i / 12, 2 * math.pi * (i + 1) / 12
        cx, cz = x + math.cos((a0 + a1) / 2) * 0.72, z + math.sin((a0 + a1) / 2) * 0.72
        box(g, 'ishi', cx - 0.2, 0, cz - 0.2, cx + 0.2, 0.95, cz + 0.2)
    poly(g, 'water', [(x - 0.5, 0.6, z - 0.5), (x - 0.5, 0.6, z + 0.5), (x + 0.5, 0.6, z + 0.5), (x + 0.5, 0.6, z - 0.5)], want=(0, 1, 0))
    for sx in (-1, 1): box(g, 'hashira', x + sx * 0.95 - 0.06, 0, z - 0.06, x + sx * 0.95 + 0.06, 2.4, z + 0.06)
    box(g, 'hashira', x - 1.1, 2.4, z - 0.07, x + 1.1, 2.52, z + 0.07)
    roof(g, x - 1.1, z - 0.7, x + 1.1, z + 0.7, 2.52, 'kirizuma', pitch=0.6, over=0.2, ridge_axis='x', sori=0.05)
    cyl(g, 'hashira', x, z, 0.1, 2.1, 2.3, seg=8)
    cyl(g, 'koshi', x + 0.35, z, 0.16, 1.0, 1.32, seg=10)


def belfry(x, z):
    g = 'props'
    box(g, 'ishigaki', x - 1.8, 0, z - 1.65, x + 1.8, 0.9, z + 1.65, mats={'t': 'ishi'})
    for sz in (-1, 1): box(g, 'ishi', x - 0.6, 0, z + sz * 1.65, x + 0.6, 0.3, z + sz * 1.95)
    posts = [(-1.35, -1.2), (1.35, -1.2), (-1.35, 1.2), (1.35, 1.2)]
    for (dx, dz) in posts: tube(g, 'hashira', [(x + dx, 0.9, z + dz), (x + dx * 0.9, 4.6, z + dz * 0.9)], [0.15, 0.13], seg=8)
    for y in (1.6, 4.1):
        box(g, 'hashira', x - 1.45, y, z - 1.25, x + 1.45, y + 0.16, z - 1.1); box(g, 'hashira', x - 1.45, y, z + 1.1, x + 1.45, y + 0.16, z + 1.25)
        box(g, 'hashira', x - 1.42, y, z - 1.2, x - 1.27, y + 0.16, z + 1.2); box(g, 'hashira', x + 1.27, y, z - 1.2, x + 1.42, y + 0.16, z + 1.2)
    box(g, 'hashira', x - 1.6, 4.45, z - 1.4, x + 1.6, 4.65, z + 1.4)
    roof(g, x - 1.7, z - 1.5, x + 1.7, z + 1.5, 4.65, 'irimoya', pitch=0.62, over=0.75, ridge_axis='x', sori=0.3)
    # bonshō bell
    prof = [(0.0, 4.3), (0.35, 4.28), (0.5, 4.15), (0.55, 3.6), (0.6, 3.05), (0.62, 2.95), (0.0, 2.95)]
    for i in range(len(prof) - 2): cyl(g, 'bronze', x, z, prof[i + 1][0], prof[i + 1][1], prof[i][1], seg=18, caps=False, r1=max(prof[i][0], 0.02))
    for y in (3.3, 3.7, 4.05): cyl(g, 'bronze', x, z, 0.575, y - 0.025, y + 0.025, seg=18, caps=False)
    cyl(g, 'bronze', x, z, 0.06, 4.3, 4.48, seg=8)
    tube(g, 'koshi', [(x - 1.2, 3.3, z + 0.75), (x + 0.4, 3.3, z + 0.75)], [0.09, 0.09], seg=8)   # shumoku striking log
    for dx in (-0.9, 0.1): box(g, 'bamboo', x + dx - 0.01, 3.3, z + 0.74, x + dx + 0.01, 4.45, z + 0.76)


def gate(x, z, w=12.0):
    """正門 (escape point): munamon gate — heavy posts, tie beam, closed double doors, tiled gable roof."""
    g = 'props'; hw = w / 2
    for sx in (-1, 1):
        box(g, 'hashira', x + sx * hw - 0.25, 0, z - 0.25, x + sx * hw + 0.25, 4.6, z + 0.25)
        box(g, 'ishi', x + sx * hw - 0.4, 0, z - 0.4, x + sx * hw + 0.4, 0.3, z + 0.4)
    box(g, 'hashira', x - hw - 0.6, 4.3, z - 0.3, x + hw + 0.6, 4.75, z + 0.3)
    for sx in (-1, 1):  # door leaves with battens and studs
        x0, x1 = (x - hw + 0.25, x - 0.02) if sx < 0 else (x + 0.02, x + hw - 0.25)
        box(g, 'kuroita', x0, 0.05, z - 0.08, x1, 4.25, z + 0.08)
        for y in (0.6, 2.1, 3.6): box(g, 'hashira', x0, y, z - 0.14, x1, y + 0.22, z + 0.14)
        for y in (0.71, 2.21, 3.71):
            a = x0 + 0.3
            while a < x1 - 0.2: cyl(g, 'bronze', a, z + 0.14, 0.04, y - 0.04, y + 0.04, seg=6); a += 0.55
    roof(g, x - hw - 0.4, z - 0.9, x + hw + 0.4, z + 0.9, 4.75, 'kirizuma', pitch=0.55, over=0.7, ridge_axis='x', sori=0.25)


def onsen(x, z):
    """rock-rimmed hot spring: boulders, steaming water, bamboo spout, red parasol and bench."""
    g = 'onsen'; rx, rz = 2.7, 3.6; rng = random.Random(77)
    poly(g, 'water', [(x - rx, 0.32, z - rz), (x - rx, 0.32, z + rz), (x + rx, 0.32, z + rz), (x + rx, 0.32, z - rz)], want=(0, 1, 0))
    for a in range(12):
        t = a / 12 * 2 * math.pi
        if a == 9: continue
        r = 0.65 + ((a * 37) % 5) * 0.08
        blob(g, 'rock', (x + math.cos(t) * rx, r * 0.45, z + math.sin(t) * rz), r * 1.15, r * 0.62, r * 1.0, seg=8, rings=4, jit=0.22, rng=rng)
    # bamboo spout (kakehi) from the rock edge
    sx, sz = x + rx + 0.4, z - 1.2
    box(g, 'bamboo', sx - 0.04, 0, sz - 0.04, sx + 0.04, 1.4, sz + 0.04)
    tube(g, 'bamboo', [(sx, 1.25, sz), (sx - 1.3, 1.05, sz + 0.1)], [0.06, 0.06], seg=8)
    poly(g, 'water', [(sx - 1.35, 1.0, sz + 0.06), (sx - 1.35, 1.0, sz + 0.14), (sx - 1.45, 0.32, sz + 0.14), (sx - 1.45, 0.32, sz + 0.06)], want=(-1, 0, 0))
    # nodate-gasa parasol + red felt bench
    px, pz = x - 4.6, z + 3.6
    cyl(g, 'bamboo', px, pz, 0.04, 0, 2.6, seg=6)
    for k in range(16):
        a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
        poly(g, 'akai', [(px, 2.75, pz), (px + math.cos(a1) * 1.6, 2.2, pz + math.sin(a1) * 1.6), (px + math.cos(a0) * 1.6, 2.2, pz + math.sin(a0) * 1.6)], want=(0, 1, 0))
        poly(g, 'akai', [(px, 2.73, pz), (px + math.cos(a0) * 1.6, 2.18, pz + math.sin(a0) * 1.6), (px + math.cos(a1) * 1.6, 2.18, pz + math.sin(a1) * 1.6)], want=(0, -1, 0))
    box(g, 'koshi', px - 1.0, 0.42, pz + 0.6, px + 1.0, 0.5, pz + 1.2, mats={'t': 'mosen'})
    for sxx in (-0.85, 0.85):
        for szz in (0.65, 1.15): box(g, 'hashira', px + sxx - 0.04, 0, pz + szz - 0.04, px + sxx + 0.04, 0.42, pz + szz + 0.04)


def vending(x, z):
    g = 'props'
    box(g, 'metal', x - 0.5, 0, z - 0.45, x + 0.5, 1.85, z + 0.45, mats={'w': 'vend', 'e': 'metal'})
    box(g, 'kuroita', x - 0.52, 0.12, z - 0.38, x - 0.5, 0.42, z + 0.38)


def tub(x, z):  # big wooden rain-water tub (the Tab-map box under the east eave) — 2.2 m square, 1.3 m tall
    box('props', 'koshi', x - 1.1, 0, z - 1.1, x + 1.1, 1.3, z + 1.1, skip=('t',))
    poly('props', 'water', [(x - 1.0, 1.15, z - 1.0), (x - 1.0, 1.15, z + 1.0), (x + 1.0, 1.15, z + 1.0), (x + 1.0, 1.15, z - 1.0)], want=(0, 1, 0))
    box('props', 'koshi', x - 1.1, 1.22, z - 1.1, x + 1.1, 1.3, z + 1.1, skip=('b',))
    for y in (0.25, 1.05): box('props', 'bamboo', x - 1.13, y, z - 1.13, x + 1.13, y + 0.07, z + 1.13, skip=('t', 'b'))


def rock(x, z, r, sy=0.75):  # garden boulder: the collider is the inscribed box of r (see buildRyokan 'rock')
    rng = random.Random(int(x * 17 + z * 29))
    blob('props', 'rock', (x, r * sy * 0.55, z), r * 1.05, r * sy, r * 0.95, seg=12, rings=7, jit=0.12, rng=rng)


# ---------------------------------------------------------------------------- dressing the facades
def facade_dressing():
    """paper lanterns under eaves and noren curtains at shop doors on street facades."""
    rng = random.Random(9)
    for w in P['walls']:
        if w['kind'] != 'bld': continue
        b = BLD[w['bld']]
        if b['style'] not in ('shop', 'inn', 'house'): continue
        ax, fixed, lo, hi, sign = facade_frame(w)
        if hi - lo < 4: continue
        n = int((hi - lo) / 6)
        for k in range(n):
            a = lo + (hi - lo) * (k + 0.5) / n + rng.uniform(-0.6, 0.6)
            px, py, pz = fpt(ax, fixed, a, 2.95, 0.55, sign)
            chochin(px, py, pz, 0.2, 'paperRed' if rng.random() < 0.6 else 'paper')
            if b['style'] == 'shop' and rng.random() < 0.7:  # noren: three hanging cloth strips over a doorway
                for j in range(3):
                    a0 = a - 0.75 + j * 0.5
                    fbox('props', 'noren', ax, fixed, sign, a0 + 0.02, a0 + 0.48, 1.5, 2.3, 0.1, 0.12)
                fbox('props', 'bamboo', ax, fixed, sign, a - 0.85, a + 0.85, 2.28, 2.33, 0.08, 0.14)


# ---------------------------------------------------------------------------- backdrop
def castle(cx, cz, s=1.0, y0=0.0):
    """five-storey tenshu on a sloped stone base (distant landmark, seen through the haze)."""
    g = 'backdrop'
    bw, bd = 24 * s, 20 * s
    for i in range(6):  # battered stone base
        t = i / 6; k = 1 - t * 0.12
        box(g, 'ishigaki', cx - bw / 2 * k, y0 + i * 2 * s, cz - bd / 2 * k, cx + bw / 2 * k, y0 + (i + 1) * 2 * s, cz + bd / 2 * k)
    y = y0 + 12 * s; w, d = bw * 0.8, bd * 0.8
    for tier in range(5):
        hgt = (5.2 if tier == 0 else 4.2) * s
        box(g, 'castleWall', cx - w / 2, y, cz - d / 2, cx + w / 2, y + hgt, cz + d / 2)
        box(g, 'shikkui', cx - w / 2 - 0.05, y + hgt * 0.86, cz - d / 2 - 0.05, cx + w / 2 + 0.05, y + hgt, cz + d / 2 + 0.05, skip=('t', 'b'))
        for k in range(int(w / (2.2 * s))):  # dark window slits
            xx = cx - w / 2 + (k + 0.5) * w / int(w / (2.2 * s))
            box(g, 'kuroita', xx - 0.35 * s, y + hgt * 0.45, cz - d / 2 - 0.05, xx + 0.35 * s, y + hgt * 0.75, cz + d / 2 + 0.05)
        roof(g, cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y + hgt, 'irimoya' if tier == 4 else 'yosemune', pitch=0.55, over=1.8 * s, ridge_axis='x', sori=0.6 * s, detail=False)
        if tier in (1, 3):  # chidori gables on the long faces
            for sz in (-1, 1):
                roof(g, cx - w * 0.18, cz + sz * d / 2 - 1.5 * s, cx + w * 0.18, cz + sz * d / 2 + 1.5 * s, y + hgt - 0.6 * s, 'kirizuma', pitch=0.9, over=0.6 * s, ridge_axis='z', sori=0.3 * s, detail=False)
        y += hgt + 1.6 * s; w *= 0.78; d *= 0.78
    for sx in (-1, 1):  # golden shachihoko
        box(g, 'gold', cx + sx * (w / 2 + 1.0 * s) - 0.4 * s, y - 0.2 * s, cz - 0.3 * s, cx + sx * (w / 2 + 1.0 * s) + 0.4 * s, y + 1.6 * s, cz + 0.3 * s)


def backdrop():
    """town roofs beyond the perimeter walls, wooded hills, the castle to the north-west."""
    rng = random.Random(21); Bd = P['bounds']
    for r in P['outside']:
        w, d = r['x1'] - r['x0'], r['z1'] - r['z0']
        if w < 3 or d < 3: continue
        for _ in range(max(1, int(w * d / 90))):
            bw, bd = min(w, rng.uniform(6, 11)), min(d, rng.uniform(5, 9))
            x0 = rng.uniform(r['x0'], r['x1'] - bw); z0 = rng.uniform(r['z0'], r['z1'] - bd)
            hgt = rng.choice((3.6, 6.3, 6.3))
            box('backdrop', 'shikkui', x0, 0, z0, x0 + bw, hgt, z0 + bd, mats={'t': 'kawara'})
            roof('backdrop', x0, z0, x0 + bw, z0 + bd, hgt + 0.2, rng.choice(('kirizuma', 'irimoya')), pitch=0.5, over=0.7, sori=0.15, detail=False)
    # an outer ring of roofs and trees so no edge of the world shows
    ring = []
    for i in range(40):
        a = 2 * math.pi * i / 40
        ring.append((math.cos(a) * 66 + rng.uniform(-6, 6), math.sin(a) * 74 + rng.uniform(-6, 6)))
    for (xx, zz) in ring:
        bw, bd = rng.uniform(8, 14), rng.uniform(7, 11); hgt = rng.choice((3.6, 6.3, 6.3, 8.5))
        box('backdrop', 'shikkui', xx - bw / 2, 0, zz - bd / 2, xx + bw / 2, hgt, zz + bd / 2, mats={'t': 'kawara'})
        roof('backdrop', xx - bw / 2, zz - bd / 2, xx + bw / 2, zz + bd / 2, hgt + 0.2, rng.choice(('kirizuma', 'irimoya', 'yosemune')), pitch=0.5, over=0.8, sori=0.18, detail=False)
    for i in range(70):  # wooded hills: dark cone trees + blossom clumps
        a = 2 * math.pi * i / 70 + rng.uniform(-0.05, 0.05); rr = rng.uniform(84, 120)
        xx, zz = math.cos(a) * rr, math.sin(a) * rr * 1.1; hh = rng.uniform(9, 16)
        cyl('backdrop', 'pine', xx, zz, rng.uniform(3, 5), 0, hh, seg=7, r1=0.2)
        if rng.random() < 0.35: blob('backdrop', 'sakuraFar', (xx + rng.uniform(-4, 4), hh * 0.5, zz + rng.uniform(-4, 4)), 4.5, 3.2, 4.5, seg=8, rings=4, jit=0.2, rng=rng)
    for i in range(18):  # hills
        a = 2 * math.pi * i / 18; rr = 175 + rng.uniform(-20, 30)
        blob('backdrop', 'hill', (math.cos(a) * rr, -6, math.sin(a) * rr), rng.uniform(40, 70), rng.uniform(18, 34), rng.uniform(40, 70), seg=10, rings=5, jit=0.12, rng=rng)
    castle(-40, -112, 1.8, 8.0)
    blob('backdrop', 'hill', (-40, -4, -112), 56, 13, 48, seg=12, rings=5, jit=0.08, rng=rng)


def karahafu(cx, cz, width, y, out, axis='x', depth=1.6, rise=1.25, g='props'):
    """undulating cusped gable (kara-hafu) projecting from a facade: plaster tympanum with a timber grid,
    a curved tiled roof and the white-edged bargeboard. axis = facade direction, out = ±1 outward."""
    N = 16; hw = width / 2
    prof = []
    for i in range(N + 1):
        t = -1 + 2 * i / N; a = abs(t)
        yy = rise * (math.cos(a * math.pi / 2) ** 1.25) - 0.22 * max(0.0, a - 0.72) * 3.2  # arched crown, flicked-up ends
        prof.append((t * (hw + 0.35), yy))
    P_ = lambda along, h, d: (cx + along, y + h, cz + out * d) if axis == 'x' else (cx + out * d, y + h, cz + along)
    for i in range(N):
        (a0, h0), (a1, h1) = prof[i], prof[i + 1]
        poly(g, 'kawara', [P_(a0, h0 + 0.12, 0), P_(a1, h1 + 0.12, 0), P_(a1, h1 + 0.12 - 0.15, depth), P_(a0, h0 + 0.12 - 0.15, depth)],
             [(i / N * 3, 0), ((i + 1) / N * 3, 0), ((i + 1) / N * 3, 1.2), (i / N * 3, 1.2)], want=(0, 1, 0))
        poly(g, 'hashira', [P_(a0, h0 - 0.06, 0), P_(a1, h1 - 0.06, 0), P_(a1, h1 - 0.21, depth), P_(a0, h0 - 0.21, depth)], want=(0, -1, 0))
        poly(g, 'shikkui', [P_(a0, h0 - 0.21, depth + 0.02), P_(a1, h1 - 0.21, depth + 0.02), P_(a1, h1 + 0.0, depth + 0.02), P_(a0, h0 + 0.0, depth + 0.02)],
             want=(0, 0, out) if axis == 'x' else (out, 0, 0))                                                # white-edged bargeboard
    tymp = [P_(prof[i][0] * 0.82, prof[i][1] * 0.9 - 0.25, depth - 0.25) for i in range(N + 1)]
    for i in range(N):  # plaster tympanum (fan of triangles down to the beam)
        a0, a1 = prof[i][0] * 0.82, prof[i + 1][0] * 0.82
        poly(g, 'shikkui', [P_(a0, 0, depth - 0.25), P_(a1, 0, depth - 0.25), tymp[i + 1], tymp[i]], want=(0, 0, out) if axis == 'x' else (out, 0, 0))
    for k in range(-3, 4):  # timber grid on the tympanum
        aa = k * hw * 0.82 / 3.5; hh = rise * (math.cos(min(1, abs(aa) / (hw + 0.35)) * math.pi / 2) ** 1.25) * 0.9 - 0.3
        if hh > 0.15: beam(g, 'hashira', P_(aa, 0, depth - 0.22), P_(aa, hh, depth - 0.22), 0.06, 0.06)
    beam(g, 'hashira', P_(-hw - 0.2, 0, depth - 0.2), P_(hw + 0.2, 0, depth - 0.2), 0.18, 0.22)
    beam(g, 'hashira', P_(-hw * 0.82, rise * 0.45, depth - 0.22), P_(hw * 0.82, rise * 0.45, depth - 0.22), 0.06, 0.08)
    beam(g, 'kawara', P_(0, rise + 0.2, 0), P_(0, rise + 0.08, depth + 0.1), 0.3, 0.22)                    # crest ridge


def nobori(x, z, h=4.2, text_side=1):
    """red festival banner on a bamboo pole."""
    g = 'props'
    cyl(g, 'bamboo', x, z, 0.035, 0, h, seg=6)
    box(g, 'bamboo', x - 0.02, h - 0.1, z - 0.01, x + 0.62, h - 0.06, z + 0.01)
    poly(g, 'nobori', [(x + 0.04, h - 0.1, z), (x + 0.6, h - 0.1, z), (x + 0.6, h - 2.7, z), (x + 0.04, h - 2.7, z)], [(0, 1), (1, 1), (1, 0), (0, 0)], want=(0, 0, text_side))
    poly(g, 'nobori', [(x + 0.04, h - 0.1, z), (x + 0.04, h - 2.7, z), (x + 0.6, h - 2.7, z), (x + 0.6, h - 0.1, z)], [(1, 1), (1, 0), (0, 0), (0, 1)], want=(0, 0, -text_side))


def bench(x, z, along_x=True, umbrella=False):
    g = 'props'; L, W = (1.8, 0.55)
    x0, x1, z0, z1 = (x - L / 2, x + L / 2, z - W / 2, z + W / 2) if along_x else (x - W / 2, x + W / 2, z - L / 2, z + L / 2)
    box(g, 'koshi', x0, 0.4, z0, x1, 0.46, z1, mats={'t': 'mosen'})
    for (a, b) in ((x0 + 0.08, z0 + 0.06), (x1 - 0.14, z0 + 0.06), (x0 + 0.08, z1 - 0.12), (x1 - 0.14, z1 - 0.12)): box(g, 'hashira', a, 0, b, a + 0.06, 0.4, b + 0.06)
    if umbrella:
        cyl(g, 'bamboo', x, z, 0.035, 0, 2.5, seg=6)
        for k in range(16):
            a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
            poly(g, 'akai', [(x, 2.62, z), (x + math.cos(a1) * 1.4, 2.12, z + math.sin(a1) * 1.4), (x + math.cos(a0) * 1.4, 2.12, z + math.sin(a0) * 1.4)], want=(0, 1, 0))
            poly(g, 'akai', [(x, 2.6, z), (x + math.cos(a0) * 1.4, 2.1, z + math.sin(a0) * 1.4), (x + math.cos(a1) * 1.4, 2.1, z + math.sin(a1) * 1.4)], want=(0, -1, 0))


def props_main():
    for p in P['props']:
        k, x, z, a = p['kind'], p['x'], p['z'], p.get('a')
        if k == 'sakura': sakura(x, z)
        elif k == 'pine': pine(x, z)
        elif k == 'torii': torii(x, z)
        elif k == 'gate': gate(x, z)
        elif k == 'belfry': belfry(x, z)
        elif k == 'onsen': onsen(x, z)
        elif k == 'well': well(x, z)
        elif k == 'rock': rock(x, z, a or 1.4)
        elif k == 'basin': rock(x, z, a or 1.2, 0.6); poly('props', 'water', [(x - 0.3, 0.75, z - 0.3), (x - 0.3, 0.75, z + 0.3), (x + 0.3, 0.75, z + 0.3), (x + 0.3, 0.75, z - 0.3)], want=(0, 1, 0))
        elif k == 'lantern': stone_lantern(x, z)
        elif k == 'streetlamp': street_lamp(x, z)
        elif k == 'barrels': barrel(x, z); barrel(x + 1.0, z + 0.4)
        elif k == 'crates': crate(x, z, 1.3); crate(x + 1.0, z + 0.6, 0.9)
        elif k == 'tank': tub(x, z)
        elif k == 'cart': cart(x, z)
        elif k == 'vending': vending(x, z)
    # garden shrubs along the west wing and the defender yard
    for (u, v) in ((10, 120), (10, 140), (20, 196), (104, 30), (150, 14), (182, 30), (66, 300), (124, 312)):
        shrub((u - 112) * 0.4, (v - 166) * 0.3, 0.7)
    facade_dressing(); backdrop()
    U_ = lambda u: (u - 112) * 0.4; V_ = lambda v: (v - 166) * 0.3
    # kara-hafu gables: 本館 east front over the defender landing, A棟 north front over the bell plaza, B棟 south front
    karahafu(U_(128), V_(96), 4.4, F2 + 0.15, 1, axis='z', g='honkan')
    karahafu(U_(180), V_(159), 6.0, F2 + 0.15, -1, axis='x', g='abld')
    karahafu(U_(116), V_(250), 4.8, F2 + 0.15, 1, axis='x', g='bbld')
    for (u, v, s) in ((92, 304, 1), (100, 304, 1), (128, 152, 1), (140, 152, 1), (60, 186, -1), (186, 104, -1)): nobori(U_(u), V_(v), 4.2, s)
    bench(U_(46), V_(240), True, True); bench(U_(140), V_(132), True, False); bench(U_(30), V_(110), False, False)
