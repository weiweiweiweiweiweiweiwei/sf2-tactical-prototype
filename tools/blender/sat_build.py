# v52 Satellite Base — Blender dressing, first area: the octagonal CONTROL ROOM (objective B) — from the game's own grid
# (tools/satellite/plan.json, written by tools/satellite/export_plan.mjs from satellitePlan() in src/07_maps.js).
# Visual only: every piece sits on a collider face, on an existing cover box's footprint or overhead (ducts above 3.1 m),
# so movement, cover and sight lines stay what the grid says. Materials are 'sat:<name>': game presets by name
# (sat_wall, sat_trim, …) or special materials built in src/07t_satellite.js (screens, signs, stripes, glows, holo).
# blender -b --factory-startup -P tools/blender/sat_build.py -- tools/satellite/plan.json tools/satellite/satellite.glb
import os, sys, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scenelib as S
from scenelib import box, cyl, annulus, quad, wall_quad, poly

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
P = json.load(open(argv[0] if argv else 'tools/satellite/plan.json', encoding='utf8'))
OUT = argv[1] if len(argv) > 1 else 'tools/satellite/satellite.glb'
H, BX, BZ, W, D, OPEN = P['H'], P['B']['x0'], P['B']['z0'], P['W'], P['D'], P['open']
# metres per texture repeat (keep in sync with the sat_* presets in src/03_textures.js)
S.TILE.update({'sat_wall': (1.2, 1.2), 'sat_wainscot': (1.2, 1.2), 'sat_trim': (1.0, 1.0), 'sat_epoxy': (6.0, 6.0), 'sat_cabinet': (1.0, 1.0),
               'sat_duct': (1.5, 1.5), 'sat_tray': (1.6, 1.6), 'steel': (2.0, 2.0)})


def is_open(x, z):
    i, j = x - BX, z - BZ
    return 0 <= i < W and 0 <= j < D and OPEN[j * W + i] == 1


ROOM = (-9, -9, 8, 8)  # control room cell range (inclusive), octagon inside it


def in_room(x, z): return ROOM[0] <= x <= ROOM[2] and ROOM[1] <= z <= ROOM[3] and is_open(x, z)


CELLS = [(x, z) for x in range(ROOM[0], ROOM[2] + 1) for z in range(ROOM[1], ROOM[3] + 1) if in_room(x, z)]

# ----------------------------------------------------------------------------------------- faces: walls and door gaps
walls, doors = [], []          # (ax, az, bx, bz, nx, nz, line key)
for (x, z) in CELLS:
    for (nx_, nz_, ax, az, bx, bz, n) in ((x - 1, z, x, z + 1, x, z, (1, 0)), (x + 1, z, x + 1, z, x + 1, z + 1, (-1, 0)),
                                          (x, z - 1, x + 1, z, x, z, (0, 1)), (x, z + 1, x, z + 1, x + 1, z + 1, (0, -1))):
        if in_room(nx_, nz_): continue
        rec = (ax, az, bx, bz, n)
        (doors if is_open(nx_, nz_) else walls).append(rec)


def merge(recs):
    """join collinear unit faces with the same facing into runs (a, b along the line)."""
    runs = {}
    for (ax, az, bx, bz, n) in recs:
        key = ('x', ax, n) if ax == bx else ('z', az, n)
        lo, hi = (min(az, bz), max(az, bz)) if ax == bx else (min(ax, bx), max(ax, bx))
        runs.setdefault(key, []).append((lo, hi))
    out = []
    for (axis, c, n), segs in runs.items():
        segs.sort(); cur = list(segs[0])
        for lo, hi in segs[1:]:
            if lo <= cur[1] + 1e-6: cur[1] = max(cur[1], hi)
            else: out.append((axis, c, n, cur[0], cur[1])); cur = [lo, hi]
        out.append((axis, c, n, cur[0], cur[1]))
    return out


def ends(axis, c, lo, hi):  # run → wall-line endpoints in game xz
    return ((c, lo), (c, hi)) if axis == 'x' else ((lo, c), (hi, c))


STRAIGHT = lambda axis, c: abs(c) == 9   # the four long walls; everything else is the stepped octagon corner
wall_runs, door_runs = merge(walls), merge(doors)


def door_cover(axis, c, n, lo, hi):
    """parts of a wall run that are not door jamb zones (keep monitors 0.35 m clear of door edges)."""
    segs = [(lo, hi)]
    for (da, dc, dn, dlo, dhi) in door_runs:
        if da != axis or dc != c: continue
        nxt = []
        for (a, b) in segs:
            if dhi + 0.35 <= a or dlo - 0.35 >= b: nxt.append((a, b)); continue
            if dlo - 0.35 > a: nxt.append((a, dlo - 0.35))
            if dhi + 0.35 < b: nxt.append((dhi + 0.35, b))
        segs = nxt
    return segs


# ----------------------------------------------------------------------------------------- wall cladding
Y_BASE, Y_RAIL, Y_TOP = 0.14, 1.12, 2.95
for (axis, c, n, lo, hi) in wall_runs:
    (ax, az), (bx, bz) = ends(axis, c, lo, hi)
    straight = STRAIGHT(axis, c)
    wall_quad('wall', 'sat_wainscot', ax, az, bx, bz, Y_BASE, Y_RAIL, n, 0.012)
    wall_quad('wall', 'sat_trim', ax, az, bx, bz, 0.0, Y_BASE, n, 0.03)                                   # baseboard face
    poly('wall', 'sat_trim', [(ax + n[0] * 0.03, Y_BASE, az + n[1] * 0.03), (bx + n[0] * 0.03, Y_BASE, bz + n[1] * 0.03), (bx, Y_BASE, bz), (ax, Y_BASE, az)], want=(0, 1, 0))
    wall_quad('wall', 'sat_trim', ax, az, bx, bz, Y_RAIL, Y_RAIL + 0.06, n, 0.035)                        # chair rail
    poly('wall', 'sat_trim', [(ax + n[0] * 0.035, Y_RAIL + 0.06, az + n[1] * 0.035), (bx + n[0] * 0.035, Y_RAIL + 0.06, bz + n[1] * 0.035), (bx, Y_RAIL + 0.06, bz), (ax, Y_RAIL + 0.06, az)], want=(0, 1, 0))
    wall_quad('wall', 'sat_wall', ax, az, bx, bz, Y_RAIL + 0.06, Y_TOP, n, 0.008)
    wall_quad('wall', 'sat_trim', ax, az, bx, bz, Y_TOP, H, n, 0.01)
    # panel seams every 1.2 m (thin dark strips) on the upper panels
    L = hi - lo; k = 1
    while k * 1.2 < L - 0.2:
        t = lo + k * 1.2; (sx, sz), _ = ends(axis, c, t - 0.015, t + 0.015); _, (ex, ez) = ends(axis, c, t - 0.015, t + 0.015)
        wall_quad('wall', 'sat_trim', sx, sz, ex, ez, Y_RAIL + 0.06, Y_TOP, n, 0.014); k += 1
    if not straight:
        # stepped octagon corner: each step is an equipment cabinet face (vents, status LED strip, label plate)
        for t0 in range(int(lo), int(hi)):
            (cx0, cz0), (cx1, cz1) = ends(axis, c, t0 + 0.06, t0 + 0.94)
            wall_quad('cab', 'sat_cabinet', cx0, cz0, cx1, cz1, 0.16, 2.3, n, 0.05)
            for v in (0.4, 0.55, 0.7, 1.75, 1.9): wall_quad('cab', 'sat_trim', cx0, cz0, cx1, cz1, v, v + 0.05, n, 0.052)
            (lx0, lz0), (lx1, lz1) = ends(axis, c, t0 + 0.18, t0 + 0.6)
            wall_quad('cab', 'led', lx0, lz0, lx1, lz1, 1.35, 1.41, n, 0.053, uv=((0, 0), (1, 0), (1, 1), (0, 1)))
            (px0, pz0), (px1, pz1) = ends(axis, c, t0 + 0.62, t0 + 0.86)
            wall_quad('cab', 'screenConsole', px0, pz0, px1, pz1, 1.2, 1.52, n, 0.053, uv=((0, 0), (1, 0), (1, 1), (0, 1)))

# ----------------------------------------------------------------------------------------- monitor banks on the long walls
SCREENS = ['screenMap', 'screenRadar', 'screenData']
si = 0
for (axis, c, n, lo, hi) in wall_runs:
    if not STRAIGHT(axis, c): continue
    for (a, b) in door_cover(axis, c, n, lo, hi):
        L = b - a
        if L < 1.6: continue
        count = max(1, int((L + 0.1) // 1.9)); w = (L - 0.1 * (count + 1)) / count
        for k in range(count):
            t0 = a + 0.1 + k * (w + 0.1); (fx0, fz0), (fx1, fz1) = ends(axis, c, t0 - 0.04, t0 + w + 0.04)
            # frame box (depth 0.09) then the screen picture on its face
            ox, oz = n[0] * 0.09, n[1] * 0.09
            lo_x, hi_x = min(fx0, fx1 + ox, fx0 + ox, fx1), max(fx0, fx1 + ox, fx0 + ox, fx1)
            lo_z, hi_z = min(fz0, fz1 + oz, fz0 + oz, fz1), max(fz0, fz1 + oz, fz0 + oz, fz1)
            box('mon', 'sat_trim', lo_x, 1.3, lo_z, hi_x, 2.8, hi_z)
            (sx0, sz0), (sx1, sz1) = ends(axis, c, t0, t0 + w)
            wall_quad('mon', SCREENS[si % 3], sx0, sz0, sx1, sz1, 1.38, 2.72, n, 0.0915, uv=((0, 0), (1, 0), (1, 1), (0, 1))); si += 1
        # cool glow pooled on the floor in front of the bank
        (gx0, gz0), (gx1, gz1) = ends(axis, c, a, b)
        quad('glow', 'glowCyan', (gx0, 0.008, gz0), (gx1, 0.008, gz1), (gx1 + n[0] * 2.4, 0.008, gz1 + n[1] * 2.4), (gx0 + n[0] * 2.4, 0.008, gz0 + n[1] * 2.4), (0, 1, 0))
    # stencil band above the monitors on the west / east walls, room name on the north / south ones
    (tx0, tz0), (tx1, tz1) = ends(axis, c, lo + 0.6, hi - 0.6)
    label = 'stencilSat' if axis == 'x' else 'stencilB'
    wall_quad('sign', label, tx0, tz0, tx1, tz1, 3.0, 3.42, n, 0.012, uv=((0, 0), (1, 0), (1, 1), (0, 1)))

# ----------------------------------------------------------------------------------------- door frames, signs, warning stripes
SIGN = {('z', 9): 'signA', ('z', -9): 'signC', ('x', -9): 'signW', ('x', 9): 'signE'}
for (axis, c, n, lo, hi) in door_runs:
    for t in (lo, hi):  # jambs on the wall side of each edge, hazard stripes on their faces
        a, b = (t - 0.16, t) if t == lo else (t, t + 0.16)
        (jx0, jz0), (jx1, jz1) = ends(axis, c, a, b)
        box('door', 'sat_trim', min(jx0, jx1 + n[0] * 0.12, jx0 + n[0] * 0.12, jx1), 0.0, min(jz0, jz1 + n[1] * 0.12, jz0 + n[1] * 0.12, jz1),
            max(jx0, jx1 + n[0] * 0.12, jx0 + n[0] * 0.12, jx1), 2.9, max(jz0, jz1 + n[1] * 0.12, jz0 + n[1] * 0.12, jz1))
        wall_quad('door', 'hazard', jx0, jz0, jx1, jz1, 0.05, 1.6, n, 0.1205, uv=((0, 0), (1, 0), (1, 6), (0, 6)))
    (hx0, hz0), (hx1, hz1) = ends(axis, c, lo - 0.16, hi + 0.16)
    box('door', 'sat_trim', min(hx0, hx1 + n[0] * 0.12, hx0 + n[0] * 0.12, hx1), 2.9, min(hz0, hz1 + n[1] * 0.12, hz0 + n[1] * 0.12, hz1),
        max(hx0, hx1 + n[0] * 0.12, hx0 + n[0] * 0.12, hx1), 3.12, max(hz0, hz1 + n[1] * 0.12, hz0 + n[1] * 0.12, hz1))
    (gx0, gz0), (gx1, gz1) = ends(axis, c, lo - 0.6, hi + 0.6)
    wall_quad('sign', SIGN.get((axis, c), 'signA'), gx0, gz0, gx1, gz1, 3.14, 3.5, n, 0.02, uv=((0, 0), (1, 0), (1, 1), (0, 1)))
    # red emergency lamp over the header, red light pool and a striped threshold on the floor
    (dx0, dz0), (dx1, dz1) = ends(axis, c, lo, hi)
    quad('door', 'hazard', (dx0, 0.007, dz0), (dx1, 0.007, dz1), (dx1 + n[0] * 0.3, 0.007, dz1 + n[1] * 0.3), (dx0 + n[0] * 0.3, 0.007, dz0 + n[1] * 0.3), (0, 1, 0), uv=((0, 0), (hi - lo, 0), (hi - lo, 0.3), (0, 0.3)))
    quad('glow', 'glowRed', (dx0, 0.009, dz0), (dx1, 0.009, dz1), (dx1 + n[0] * 1.6, 0.009, dz1 + n[1] * 1.6), (dx0 + n[0] * 1.6, 0.009, dz0 + n[1] * 1.6), (0, 1, 0))
    lx, lz = (c, (lo + hi) / 2) if axis == 'x' else ((lo + hi) / 2, c)
    box('door', 'emRed', lx - 0.1 + n[0] * 0.12, 3.12, lz - 0.1 + n[1] * 0.12, lx + 0.1 + n[0] * 0.22, 3.22, lz + 0.1 + n[1] * 0.22)

# ----------------------------------------------------------------------------------------- epoxy floor, walkway paint, the ring around the table
for (x, z) in CELLS:
    poly('floor', 'sat_epoxy', [(x, 0.004, z), (x, 0.004, z + 1), (x + 1, 0.004, z + 1), (x + 1, 0.004, z)], want=(0, 1, 0))
annulus('floor', 'hazard', 0, 0, 1.55, 1.85, 0.006, seg=64, stripes=24)
for (axis, c, n, lo, hi) in door_runs:  # yellow walkway lines from each door to the ring
    m = (lo + hi) / 2
    for side in (-0.55, 0.55):
        if axis == 'z':
            z0, z1 = sorted((c, c + n[1] * (abs(c) - 1.9))); x = m + side
            quad('floor', 'linePaint', (x - 0.04, 0.006, z0), (x + 0.04, 0.006, z0), (x + 0.04, 0.006, z1), (x - 0.04, 0.006, z1), (0, 1, 0))
        else:
            x0, x1 = sorted((c, c + n[0] * (abs(c) - 1.9))); z = m + side
            quad('floor', 'linePaint', (x0, 0.006, z - 0.04), (x1, 0.006, z - 0.04), (x1, 0.006, z + 0.04), (x0, 0.006, z + 0.04), (0, 1, 0))
quad('glow', 'glowWhite', (-3.4, 0.01, -3.4), (3.4, 0.01, -3.4), (3.4, 0.01, 3.4), (-3.4, 0.01, 3.4), (0, 1, 0))

# ----------------------------------------------------------------------------------------- consoles on the four cover-box footprints (collision stays the game's)
CONSOLES = [(-6.5, -1.2, -5.7, 1.2, (1, 0)), (5.7, -1.2, 6.5, 1.2, (-1, 0)), (-1.2, 5.7, 1.2, 6.5, (0, -1)), (-1.2, -6.5, 1.2, -5.7, (0, 1))]
for (x0, z0, x1, z1, op) in CONSOLES:   # op = the operator side (toward the table); the screens face it and lean back
    box('console', 'sat_cabinet', x0, 0.0, z0, x1, 0.72, z1, skip=('b',))
    box('console', 'sat_trim', x0, 0.0, z0, x1, 0.1, z1, skip=('b', 't'))      # kick plate
    # desk slab, then the sloped screen deck rising from the operator edge to the back
    box('console', 'sat_trim', x0, 0.72, z0, x1, 0.77, z1, skip=('b',))
    if op[0] != 0:
        fe = x1 if op[0] > 0 else x0; be = x0 + 0.08 if op[0] > 0 else x1 - 0.08; fr = fe - op[0] * 0.28
        deck = [(fr, 0.77, z0 + 0.02), (fr, 0.77, z1 - 0.02), (be, 1.1, z1 - 0.02), (be, 1.1, z0 + 0.02)]
        poly('console', 'sat_cabinet', deck, want=(op[0], 1, 0))
        for k in range(3):
            za, zb = z0 + 0.1 + k * 0.75, z0 + 0.1 + k * 0.75 + 0.62; t = 0.012
            pa, pb = 0.16, 0.86  # along the deck: lower and upper edge of the screen
            lerp = lambda a, b, s: a + (b - a) * s
            p = lambda s, z: (lerp(fr, be, s) + op[0] * t, lerp(0.77, 1.1, s) + t, z)
            quad('console', 'screenConsole', p(pa, za if op[0] > 0 else zb), p(pa, zb if op[0] > 0 else za), p(pb, zb if op[0] > 0 else za), p(pb, za if op[0] > 0 else zb), (op[0], 1.2, 0))
        if op[0] > 0: box('console', 'keyboard', fe - 0.25, 0.77, z0 + 0.5, fe - 0.03, 0.79, z1 - 0.5)
        else: box('console', 'keyboard', fe + 0.03, 0.77, z0 + 0.5, fe + 0.25, 0.79, z1 - 0.5)
    else:
        fe = z1 if op[1] > 0 else z0; be = z0 + 0.08 if op[1] > 0 else z1 - 0.08; fr = fe - op[1] * 0.28
        deck = [(x0 + 0.02, 0.77, fr), (x1 - 0.02, 0.77, fr), (x1 - 0.02, 1.1, be), (x0 + 0.02, 1.1, be)]
        poly('console', 'sat_cabinet', deck, want=(0, 1, op[1]))
        for k in range(3):
            xa, xb = x0 + 0.1 + k * 0.75, x0 + 0.1 + k * 0.75 + 0.62; t = 0.012
            lerp = lambda a, b, s: a + (b - a) * s
            p = lambda s, x: (x, lerp(0.77, 1.1, s) + t, lerp(fr, be, s) + op[1] * t)
            quad('console', 'screenConsole', p(0.16, xb if op[1] > 0 else xa), p(0.16, xa if op[1] > 0 else xb), p(0.86, xa if op[1] > 0 else xb), p(0.86, xb if op[1] > 0 else xa), (0, 1.2, op[1]))
        if op[1] > 0: box('console', 'keyboard', x0 + 0.5, 0.77, fe - 0.25, x1 - 0.5, 0.79, fe - 0.03)
        else: box('console', 'keyboard', x0 + 0.5, 0.77, fe + 0.03, x1 - 0.5, 0.79, fe + 0.25)

# ----------------------------------------------------------------------------------------- satellite tracking table (B) with a holographic globe
cyl('table', 'sat_cabinet', 0, 0, 1.12, 0.0, 0.7, seg=32, caps=False)
cyl('table', 'sat_trim', 0, 0, 1.16, 0.0, 0.1, seg=32, caps=False)
for k in range(12):   # vent slots around the base
    a = 2 * math.pi * k / 12; cx, cz = math.cos(a) * 1.125, math.sin(a) * 1.125
    box('table', 'sat_trim', cx - 0.04, 0.22, cz - 0.04, cx + 0.04, 0.58, cz + 0.04)
cyl('table', 'sat_trim', 0, 0, 1.18, 0.7, 0.78, seg=32, caps=False)
annulus('table', 'sat_trim', 0, 0, 0.95, 1.18, 0.78, seg=32)
cyl('table', 'glassDark', 0, 0, 0.95, 0.74, 0.77, seg=32)                 # dark glass top with the map under it
cyl('table', 'holoBase', 0, 0, 0.3, 0.77, 0.86, seg=24)                   # projector puck
for (r, y, seg) in ((0.62, 1.5, 28),):
    # globe: latitude bands as thin rings + meridian quads, all in the additive holo material
    for k in range(7):
        phi = -math.pi / 2 + math.pi * (k + 0.5) / 7; rr = r * math.cos(phi); yy = y + r * math.sin(phi)
        annulus('holo', 'holo', 0, 0, max(0.0, rr - 0.012), rr + 0.012, yy, seg=seg, stripes=8)
    for k in range(8):
        a = math.pi * k / 8; ca, sa = math.cos(a), math.sin(a)
        for j in range(12):
            t0, t1 = -math.pi / 2 + math.pi * j / 12, -math.pi / 2 + math.pi * (j + 1) / 12
            p0 = (ca * r * math.cos(t0), y + r * math.sin(t0), sa * r * math.cos(t0)); p1 = (ca * r * math.cos(t1), y + r * math.sin(t1), sa * r * math.cos(t1))
            w = 0.012
            poly('holo', 'holo', [(p0[0] - sa * w, p0[1], p0[2] + ca * w), (p1[0] - sa * w, p1[1], p1[2] + ca * w), (p1[0] + sa * w, p1[1], p1[2] - ca * w), (p0[0] + sa * w, p0[1], p0[2] - ca * w)],
                 uvs=((0, 0), (1, 0), (1, 1), (0, 1)), want=(sa, 0, -ca))
    for (tilt, rad) in ((0.35, 0.95), (-0.6, 1.08)):   # two orbit rings with a satellite marker
        ct, st = math.cos(tilt), math.sin(tilt)
        for j in range(40):
            a0, a1 = 2 * math.pi * j / 40, 2 * math.pi * (j + 1) / 40
            q = lambda a, rr: (math.cos(a) * rr, y + math.sin(a) * rr * st, math.sin(a) * rr * ct)
            poly('holo', 'holo', [q(a0, rad - 0.01), q(a0, rad + 0.01), q(a1, rad + 0.01), q(a1, rad - 0.01)], uvs=((0, 0), (0, 1), (1, 1), (1, 0)), want=(0, 1, 0))

# ----------------------------------------------------------------------------------------- ceiling: light ring over the table, ducts, cable trays, troffers
annulus('ceil', 'lightPanel', 0, 0, 2.35, 2.7, H - 0.02, seg=48, up=False)
annulus('ceil', 'sat_trim', 0, 0, 2.25, 2.35, H - 0.03, seg=48, up=False); annulus('ceil', 'sat_trim', 0, 0, 2.7, 2.8, H - 0.03, seg=48, up=False)
for zc in (-4.2, 4.2):   # two square ducts across the room, flanges every 1.5 m, hanger straps to the slab
    box('ceil', 'sat_duct', -9.0, 3.14, zc - 0.28, 9.0, 3.44, zc + 0.28, skip=('t',))
    x = -8.25
    while x < 8.4:
        box('ceil', 'sat_trim', x - 0.03, 3.1, zc - 0.32, x + 0.03, 3.48, zc + 0.32, skip=('t',))
        for s in (-1, 1): box('ceil', 'sat_trim', x - 0.015, 3.44, zc + s * 0.3 - 0.015, x + 0.015, H, zc + s * 0.3 + 0.015)
        x += 1.5
for xc in (-3.6, 3.6):   # cable trays running north–south with cable bundles
    box('ceil', 'sat_tray', xc - 0.22, 3.3, -9.0, xc + 0.22, 3.33, 9.0, skip=('t',))
    for s in (-1, 1): box('ceil', 'sat_trim', xc + s * 0.22 - 0.012, 3.3, -9.0, xc + s * 0.22 + 0.012, 3.4, 9.0)
    for k, dx in enumerate((-0.12, -0.04, 0.05, 0.13)):
        r = 0.028 if k % 2 else 0.022
        box('ceil', 'cable', xc + dx - r, 3.33, -9.0, xc + dx + r, 3.33 + 2 * r, 9.0, skip=('b',))
for (tx, tz) in ((-6.2, 0.0), (6.2, 0.0), (0.0, -6.2), (0.0, 6.2), (-5.6, -5.6), (5.6, 5.6), (-5.6, 5.6), (5.6, -5.6)):
    if (abs(tx) + abs(tz) > 11.0): continue
    box('ceil', 'sat_trim', tx - 0.65, H - 0.04, tz - 0.32, tx + 0.65, H, tz + 0.32, skip=('t',))
    quad('ceil', 'lightPanel', (tx - 0.6, H - 0.045, tz + 0.27), (tx + 0.6, H - 0.045, tz + 0.27), (tx + 0.6, H - 0.045, tz - 0.27), (tx - 0.6, H - 0.045, tz - 0.27), (0, -1, 0))

S.export(OUT, 'sat:')
