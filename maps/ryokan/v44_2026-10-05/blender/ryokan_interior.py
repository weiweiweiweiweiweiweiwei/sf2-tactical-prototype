# v44 Sakura Inn — 2F interiors: tatami layouts, exposed ceiling beams, the objective room (the scroll on the red table).
# exec()'d by ryokan_build.py after ryokan_props.py (shares helpers and globals).
import math, random

RI = random.Random(7)


def tatami_room(r):
    """mats 0.91 × 1.82 laid in 1.82 squares that alternate direction (shūgi-jiki look); edge strips are trimmed mats."""
    x0, z0, x1, z1 = r['x0'] + 0.13, r['z0'] + 0.13, r['x1'] - 0.13, r['z1'] - 0.13; y = F2 + 0.012
    W, D = x1 - x0, z1 - z0; nx, nz = max(1, round(W / 1.82)), max(1, round(D / 1.82)); cw, cd = W / nx, D / nz
    for i in range(nx):
        for j in range(nz):
            cx0, cz0 = x0 + i * cw, z0 + j * cd
            if (i + j) % 2 == 0:  # two mats side by side along x, long side along z
                for k in range(2):
                    a0, a1 = cx0 + k * cw / 2, cx0 + (k + 1) * cw / 2
                    poly('floor2', 'tatami', [(a0, y, cz0), (a0, y, cz0 + cd), (a1, y, cz0 + cd), (a1, y, cz0)], [(0, 0), (0, 1), (1, 1), (1, 0)], want=(0, 1, 0))
            else:  # two mats stacked along z, long side along x
                for k in range(2):
                    b0, b1 = cz0 + k * cd / 2, cz0 + (k + 1) * cd / 2
                    poly('floor2', 'tatami', [(cx0, y, b0), (cx0, y, b1), (cx0 + cw, y, b1), (cx0 + cw, y, b0)], [(1, 0), (0, 0), (0, 1), (1, 1)], want=(0, 1, 0))
    for (a, b, c, d) in ((r['x0'], r['z0'], r['x1'], r['z0'] + 0.13), (r['x0'], r['z1'] - 0.13, r['x1'], r['z1']), (r['x0'], r['z0'], r['x0'] + 0.13, r['z1']), (r['x1'] - 0.13, r['z0'], r['x1'], r['z1'])):
        box('floor2', 'yuka', a, F2, b, c, y + 0.004, d)                                    # tatami-yose board around the edge


def ceiling_beams():
    for b in BLD:
        if not b['open2']: continue
        for r in b['rects']:
            w, d = r['x1'] - r['x0'], r['z1'] - r['z0']
            if min(w, d) < 2.5: continue
            yb = TOP2 - 0.02
            if w >= d:  # beams span the short side (z), every 3.64 m along x
                a = r['x0'] + 1.82
                while a < r['x1'] - 0.9: box(b['id'], 'hashira', a - 0.14, yb - 0.34, r['z0'], a + 0.14, yb, r['z1']); a += 3.64
                for zz in (r['z0'] + d / 3, r['z0'] + 2 * d / 3): box(b['id'], 'hashira', r['x0'], yb - 0.2, zz - 0.08, r['x1'], yb, zz + 0.08)
            else:
                a = r['z0'] + 1.82
                while a < r['z1'] - 0.9: box(b['id'], 'hashira', r['x0'], yb - 0.34, a - 0.14, r['x1'], yb, a + 0.14); a += 3.64
                for xx in (r['x0'] + w / 3, r['x0'] + 2 * w / 3): box(b['id'], 'hashira', xx - 0.08, yb - 0.2, r['z0'], xx + 0.08, yb, r['z1'])


def zaisu(x, z, yaw):
    g = 'objroom'; c, s = math.cos(yaw), math.sin(yaw)
    L = lambda a, b: (x + a * c - b * s, z + a * s + b * c)
    pts = [L(-0.25, -0.27), L(0.25, -0.27), L(0.25, 0.27), L(-0.25, 0.27)]; y0, y1 = F2 + 0.02, F2 + 0.16
    poly(g, 'lacquer', [(p[0], y1, p[1]) for p in pts], want=(0, 1, 0))
    for k in range(4): a, b = pts[k], pts[(k + 1) % 4]; poly(g, 'lacquer', [(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], center=(x, (y0 + y1) / 2, z))
    back = [L(-0.25, 0.22), L(0.25, 0.22), L(0.25, 0.3), L(-0.25, 0.3)]  # slanted backrest
    top = [L(-0.24, 0.36), L(0.24, 0.36)]
    poly(g, 'lacquer', [(back[0][0], y1, back[0][1]), (back[1][0], y1, back[1][1]), (top[1][0], F2 + 0.62, top[1][1]), (top[0][0], F2 + 0.62, top[0][1])], center=(x, F2 + 0.3, z))
    poly(g, 'lacquer', [(top[0][0], F2 + 0.62, top[0][1]), (top[1][0], F2 + 0.62, top[1][1]), (back[1][0], y1, back[1][1]), (back[0][0], y1, back[0][1])], center=(x + s * 0.6, F2 + 0.3, z - c * 0.6) if False else (x, F2 + 0.9, z))
    poly(g, 'mosen', [(pts[0][0], y1 + 0.03, pts[0][1]), (pts[1][0], y1 + 0.03, pts[1][1]), (pts[2][0] - 0.0, y1 + 0.03, pts[2][1]), (pts[3][0], y1 + 0.03, pts[3][1])], want=(0, 1, 0))


def objective_room():
    """the 2F tatami hall with the Tor-M2 blueprint scroll (SF2 'Ryokan' objective)."""
    g = 'objroom'; ox, oz = P['objective']; yF = F2
    # low red-lacquer table (zataku) — the collider is the 'table' prop in the plan
    tx0, tx1, tz0, tz1, th = ox - 1.0, ox + 1.0, oz - 0.55, oz + 0.55, yF + 0.36
    box(g, 'lacquer', tx0, th - 0.06, tz0, tx1, th, tz1)
    for (a, b) in ((tx0 + 0.06, tz0 + 0.06), (tx1 - 0.14, tz0 + 0.06), (tx0 + 0.06, tz1 - 0.14), (tx1 - 0.14, tz1 - 0.14)): box(g, 'lacquer', a, yF, b, a + 0.08, th - 0.06, b + 0.08)
    box(g, 'lacquer', tx0 + 0.04, th - 0.14, tz0 + 0.04, tx1 - 0.04, th - 0.06, tz1 - 0.04)
    # the scroll: rolled ends + an unrolled blueprint sheet
    for sx in (-1, 1): tube(g, 'scrollRod', [(ox + sx * 0.32, th + 0.05, oz - 0.32), (ox + sx * 0.32, th + 0.05, oz + 0.32)], [0.05, 0.05], seg=10)
    poly(g, 'blueprint', [(ox - 0.3, th + 0.006, oz - 0.3), (ox - 0.3, th + 0.006, oz + 0.3), (ox + 0.3, th + 0.006, oz + 0.3), (ox + 0.3, th + 0.006, oz - 0.3)], [(0, 0), (0, 1), (1, 1), (1, 0)], want=(0, 1, 0))
    # four legless chairs + cushions around it
    for (dx, dz, yaw) in ((0, -1.05, 0), (0, 1.05, math.pi), (-1.45, 0, math.pi / 2), (1.45, 0, -math.pi / 2)): zaisu(ox + dx, oz + dz, yaw)
    # scattered papers
    for i in range(14):
        a = RI.uniform(0, 6.28); d = RI.uniform(1.6, 3.6); px, pz = ox + math.cos(a) * d, oz + math.sin(a) * d * 0.8; r = RI.uniform(0, 3.14); s = RI.uniform(0.18, 0.26)
        c, sn = math.cos(r), math.sin(r)
        pts = [(px + (-s) * c - (-s * 1.3) * sn, yF + 0.016 + i * 0.0004, pz + (-s) * sn + (-s * 1.3) * c), (px + s * c - (-s * 1.3) * sn, yF + 0.016 + i * 0.0004, pz + s * sn + (-s * 1.3) * c),
               (px + s * c - (s * 1.3) * sn, yF + 0.016 + i * 0.0004, pz + s * sn + (s * 1.3) * c), (px + (-s) * c - (s * 1.3) * sn, yF + 0.016 + i * 0.0004, pz + (-s) * sn + (s * 1.3) * c)]
        poly(g, 'papers', pts, [(0, 0), (1, 0), (1, 1), (0, 1)], want=(0, 1, 0))
    # room fixtures: the room box is u 76–108, v 56–92 (see RYOKAN_SPEC.part2)
    X = lambda u: (u - 112) * 0.4; Z = lambda v: (v - 166) * 0.3
    rx0, rx1, rz0, rz1 = X(76) + 0.07, X(108) - 0.07, Z(56) + 0.07, Z(92) - 0.07
    # hanging scrolls on the north wall (either side of the centre)
    for xx in (ox - 2.6, ox + 2.6):
        poly(g, 'kakejiku', [(xx - 0.3, yF + 0.7, rz0 + 0.02), (xx + 0.3, yF + 0.7, rz0 + 0.02), (xx + 0.3, yF + 2.2, rz0 + 0.02), (xx - 0.3, yF + 2.2, rz0 + 0.02)], [(0, 0), (1, 0), (1, 1), (0, 1)], want=(0, 0, 1))
        box(g, 'hashira', xx - 0.34, yF + 0.66, rz0 + 0.01, xx + 0.34, yF + 0.71, rz0 + 0.06)
    # katana on its stand + a bonsai on a low shelf against the west wall
    box(g, 'lacquer', rx0, yF, oz - 1.4, rx0 + 0.42, yF + 0.32, oz + 1.4)
    for (zz, yy) in ((oz - 0.5, yF + 0.62), (oz - 0.5, yF + 0.48)):
        box(g, 'lacquer', rx0 + 0.15, yF + 0.32, zz - 0.04, rx0 + 0.25, yy, zz + 0.04); box(g, 'lacquer', rx0 + 0.15, yF + 0.32, zz + 0.86, rx0 + 0.25, yy, zz + 0.94)
        beam(g, 'kuroita', (rx0 + 0.2, yy + 0.02, zz - 0.25), (rx0 + 0.2, yy + 0.05, zz + 1.1), 0.03, 0.035)
    cyl(g, 'ishi', rx0 + 0.21, oz + 0.9, 0.18, yF + 0.32, yF + 0.44, seg=10, r1=0.15)
    tube(g, 'bark', [(rx0 + 0.21, yF + 0.44, oz + 0.9), (rx0 + 0.25, yF + 0.6, oz + 0.82), (rx0 + 0.2, yF + 0.72, oz + 0.95)], [0.03, 0.025, 0.015], seg=5)
    for (dx, dy, dz, r) in ((0.0, 0.76, 0.95, 0.16), (0.05, 0.64, 0.78, 0.12), (-0.03, 0.66, 1.08, 0.11)): blob(g, 'pine', (rx0 + 0.2 + dx, yF + dy, oz + dz), r * 1.3, r * 0.55, r * 1.3, seg=7, rings=3, jit=0.1)
    # tansu chest on the east wall
    box(g, 'tansu', rx1 - 0.48, yF, oz + 0.8, rx1, yF + 0.95, oz + 2.4)
    for k in range(3): box(g, 'bronze', rx1 - 0.5, yF + 0.2 + k * 0.3, oz + 1.5, rx1 - 0.48, yF + 0.26 + k * 0.3, oz + 1.7)
    # coffered ceiling panel + the square hanging lantern
    cx0, cx1, cz0, cz1 = ox - 2.6, ox + 2.6, oz - 2.2, oz + 2.2
    for (a0, b0, a1, b1) in ((cx0 - 0.2, cz0 - 0.2, cx1 + 0.2, cz0), (cx0 - 0.2, cz1, cx1 + 0.2, cz1 + 0.2), (cx0 - 0.2, cz0, cx0, cz1), (cx1, cz0, cx1 + 0.2, cz1)):
        box(g, 'hashira', a0, TOP2 - 0.46, b0, a1, TOP2 - 0.3, b1, skip=('t',))
    for k in range(1, 4):  # coffer ribs
        xx = cx0 + (cx1 - cx0) * k / 4; box(g, 'hashira', xx - 0.04, TOP2 - 0.38, cz0, xx + 0.04, TOP2 - 0.33, cz1)
        zz = cz0 + (cz1 - cz0) * k / 4; box(g, 'hashira', cx0, TOP2 - 0.38, zz - 0.04, cx1, TOP2 - 0.33, zz + 0.04)
    poly(g, 'kabe', [(cx0, TOP2 - 0.33, cz0), (cx1, TOP2 - 0.33, cz0), (cx1, TOP2 - 0.33, cz1), (cx0, TOP2 - 0.33, cz1)], want=(0, -1, 0))
    box(g, 'hashira', ox - 0.012, TOP2 - 1.1, oz - 0.012, ox + 0.012, TOP2 - 0.33, oz + 0.012)
    ly0, ly1 = TOP2 - 1.62, TOP2 - 1.1
    box(g, 'lampPaper', ox - 0.24, ly0, oz - 0.24, ox + 0.24, ly1, oz + 0.24)
    for (a, b) in ((-0.25, -0.25), (0.21, -0.25), (-0.25, 0.21), (0.21, 0.21)): box(g, 'hashira', ox + a, ly0 - 0.03, oz + b, ox + a + 0.04, ly1 + 0.03, oz + b + 0.04)
    for yy in (ly0 - 0.03, ly1): box(g, 'hashira', ox - 0.26, yy, oz - 0.26, ox + 0.26, yy + 0.04, oz + 0.26)


def interior_main():
    for r in P.get('floors2', []):
        if r['type'] == 'tatami': tatami_room(r)
    ceiling_beams(); objective_room()
