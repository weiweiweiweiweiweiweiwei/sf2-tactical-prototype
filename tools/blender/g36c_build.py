# v45 Gold G36C (SF2 "G36C 黃金") — first-person model sculpted in Blender, in the game's GUN SPACE:
#   Blender X = gun lateral (+ = right), Blender Y = u (forward), Blender Z = v (up); glTF Y-up export → game (x, v, −u).
# Anchors match the procedural viewmodel (hands / ADS / reload pivots in src/09_models.js g36c()):
#   bore axis v = 0 · pistol grip ≈ u −0.07 · handguard u 0.10–0.28 · receiver u −0.13–0.10 · butt u −0.405.
# Real H&K G36C proportions: 228 mm barrel, short vented handguard, flat-top Picatinny rail (SF2: EOTech 552 in gold),
# side-folding skeleton stock, big integrated trigger guard, 30-rd magazine with coupling studs, 4-prong flash hider.
# Objects are named '<node>__<material>' (node: body / mag / charge / supp / hider); empties SIGHT and MUZZLE / MUZZLE_S.
# blender -b --factory-startup -P tools/blender/g36c_build.py -- tools/guns/g36c.glb
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'tools/guns/g36c.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
SCN = bpy.context.scene
PARTS = []  # (object, node, material)


def _activate(ob):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)


def _obj(name, bm, node, mat):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); SCN.collection.objects.link(ob); PARTS.append((ob, node, mat)); return ob


def bevel(ob, w=0.0015, seg=2, angle=40):
    if w <= 0: return ob
    m = ob.modifiers.new('bev', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle); m.harden_normals = False
    _activate(ob); bpy.ops.object.modifier_apply(modifier=m.name); return ob


def cut(ob, cutter):
    m = ob.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.solver = 'EXACT'; m.object = cutter
    _activate(ob); bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    PARTS[:] = [p for p in PARTS if p[0].name in bpy.data.objects]
    return ob


def prof(name, pts, width, node='body', mat='gold', x=0.0, bev=0.0015, holes=(), seg=2):
    """side profile (u forward, v up) extruded across X (width centred on x)."""
    bm = bmesh.new(); h = width / 2
    a = [bm.verts.new((x - h, u, v)) for (u, v) in pts]; b = [bm.verts.new((x + h, u, v)) for (u, v) in pts]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(pts)
    for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj(name, bm, node, mat)
    for hp in holes: cut(ob, prism('hole', hp, width + 0.02, x))
    return bevel(ob, bev, seg)


def prism(name, pts, width, x=0.0):
    bm = bmesh.new(); h = width / 2
    a = [bm.verts.new((x - h, u, v)) for (u, v) in pts]; b = [bm.verts.new((x + h, u, v)) for (u, v) in pts]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(len(pts)): bm.faces.new((a[i], a[(i + 1) % len(pts)], b[(i + 1) % len(pts)], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); SCN.collection.objects.link(ob); ob.hide_render = True; return ob


def box(name, x0, x1, u0, u1, v0, v1, node='body', mat='gold', bev=0.001, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, u1 - u0, v1 - v0), verts=bm.verts)
    if rot: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot[1], 3, rot[0]))
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (u0 + u1) / 2, (v0 + v1) / 2), verts=bm.verts)
    return bevel(_obj(name, bm, node, mat), bev, 2)


def cyl(name, r0, r1, u0, u1, x=0.0, v=0.0, node='body', mat='steel', seg=24, bev=0.0006, axis='Y'):
    """cylinder along the bore (axis Y), or across the gun (axis X / Z), r0 at u0."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=abs(u1 - u0), calc_uvs=True)
    if axis == 'Y': bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X')); bmesh.ops.translate(bm, vec=(x, (u0 + u1) / 2, v), verts=bm.verts)
    elif axis == 'X': bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y')); bmesh.ops.translate(bm, vec=((u0 + u1) / 2, x, v), verts=bm.verts)
    else: bmesh.ops.translate(bm, vec=(x, v, (u0 + u1) / 2), verts=bm.verts)
    return bevel(_obj(name, bm, node, mat), bev, 1)


def lathe(name, prof_ru, x=0.0, v=0.0, node='body', mat='steel', seg=28):
    """revolve (r, u) points around the bore axis."""
    bm = bmesh.new(); rings = []
    for (r, u) in prof_ru:
        rings.append([bm.verts.new((x + math.cos(2 * math.pi * k / seg) * r, u, v + math.sin(2 * math.pi * k / seg) * r)) for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            k1 = (k + 1) % seg
            try: bm.faces.new((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]))
            except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, node, mat)


def torus(name, R, r, u, x=0.0, v=0.0, node='body', mat='steel', axis='Y'):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=24, minor_segments=8)
    ob = bpy.context.active_object; ob.name = name
    if axis == 'Y': ob.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X': ob.rotation_euler = (0, math.pi / 2, 0)
    ob.location = (x, u, v); _activate(ob); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    PARTS.append((ob, node, mat)); return ob


def oval(u, v, a, b, n=16):
    return [(u + math.cos(2 * math.pi * i / n) * a, v + math.sin(2 * math.pi * i / n) * b) for i in range(n)]


def rail(u0, u1, base, w=0.021, node='body', mat='gold'):
    """Picatinny: base strip + teeth every 10 mm with the cross slots."""
    box('rail', -w / 2, w / 2, u0, u1, base, base + 0.0045, node, mat, 0.0006)
    for sx in (-1, 1): box('railLip', sx * w / 2 - (0.0025 if sx > 0 else -0.0025), sx * w / 2 + (0.0012 if sx > 0 else -0.0012), u0, u1, base + 0.0045, base + 0.0075, node, mat, 0.0004)
    u = u0 + 0.004
    while u < u1 - 0.004:
        box('tooth', -w / 2 + 0.0005, w / 2 - 0.0005, u, u + 0.0052, base + 0.0045, base + 0.0095, node, mat, 0.0005); u += 0.01


# =============================================================================================== body
# --- receiver (polymer housing in gold): rounded rear, flat top, magwell step
rcv = prof('receiver', [(-0.13, -0.026), (-0.12, -0.033), (-0.02, -0.035), (0.07, -0.035), (0.1, -0.031), (0.1, 0.038), (-0.112, 0.038), (-0.13, 0.03)], 0.044, mat='gold', bev=0.004, seg=3)
# shallow side panels + pin heads + the ejection port on the right
for sx in (-1, 1):
    box('panel', sx * 0.022 - 0.0008, sx * 0.022 + 0.0008, -0.11, -0.03, -0.022, 0.026, mat='goldDark', bev=0.0004)
    for (u, v) in ((-0.105, -0.02), (-0.04, -0.024), (0.055, -0.022), (0.085, 0.02), (-0.12, 0.016)):
        cyl('pin', 0.0032, 0.0032, sx * 0.0215, sx * 0.0235 + sx * 0.0005, u, v, mat='steel', seg=12, axis='X')
box('ejectFrame', 0.0215, 0.0232, -0.035, 0.03, 0.002, 0.024, mat='goldDark', bev=0.0005)
box('ejectPort', 0.0226, 0.0236, -0.03, 0.025, 0.006, 0.02, mat='black', bev=0.0003)
box('boltFace', 0.0228, 0.0238, -0.012, 0.012, 0.008, 0.018, mat='steel', bev=0.0003)
prof('deflector', [(-0.045, 0.004), (-0.036, 0.004), (-0.036, 0.026), (-0.045, 0.02)], 0.006, x=0.0235, mat='gold', bev=0.001)
# selector lever (ambidextrous) + markings
for sx in (-1, 1):
    prof('selector', [(-0.06, 0.0), (-0.02, 0.006), (-0.015, 0.012), (-0.05, 0.012), (-0.066, 0.006)], 0.004, x=sx * 0.0245, mat='polymer', bev=0.0008)
    for k, col in enumerate(('dotW', 'dotR', 'dotR')):
        cyl('mark', 0.0016, 0.0016, sx * 0.0222, sx * 0.0228, -0.075 + k * 0.012, 0.016 - k * 0.004, mat=col, seg=8, axis='X')
# magwell with the paddle release behind the magazine
prof('magwell', [(0.008, -0.034), (0.074, -0.034), (0.078, -0.052), (0.004, -0.05)], 0.04, mat='gold', bev=0.002)
prof('magRelease', [(-0.002, -0.036), (0.008, -0.036), (0.006, -0.062), (-0.006, -0.062), (-0.01, -0.05)], 0.022, mat='polymer', bev=0.0015)
# --- top Picatinny rail across receiver + handguard
rail(-0.118, 0.17, 0.038)
# --- charging handle (folding T under the rail, front of the receiver)
box('chBody', -0.006, 0.006, 0.07, 0.118, 0.032, 0.04, node='charge', mat='steel', bev=0.0006)
prof('chLever', [(0.072, 0.034), (0.08, 0.034), (0.082, 0.05), (0.07, 0.05)], 0.05, node='charge', mat='polymer', bev=0.0015)
# --- handguard: vented, tapered nose, bottom rail, sling loop
hg = prof('handguard', [(0.1, -0.031), (0.262, -0.029), (0.282, -0.017), (0.286, 0.0), (0.282, 0.024), (0.268, 0.034), (0.1, 0.035)], 0.05, mat='gold', bev=0.004, seg=3,
          holes=[oval(0.13, 0.002, 0.011, 0.0095), oval(0.166, 0.002, 0.011, 0.0095), oval(0.202, 0.002, 0.011, 0.0095), oval(0.238, 0.002, 0.01, 0.0088)])
box('hgSeam', -0.0255, 0.0255, 0.1, 0.104, -0.03, 0.034, mat='goldDark', bev=0.0005)
rail(0.12, 0.27, -0.031, node='body', mat='goldDark')  # bottom rail (teeth face down after the flip below)
for (u, v) in ((0.115, 0.022), (0.26, 0.022)): cyl('hgPin', 0.003, 0.003, -0.027, 0.027, u, v, mat='steel', seg=12, axis='X')
torus('slingLoopF', 0.008, 0.0018, 0.27, x=-0.028, v=-0.02, mat='steel', axis='X')
# --- barrel, gas block, front sling ring
cyl('barrel', 0.0098, 0.0094, 0.15, 0.405, mat='steel', seg=24)
cyl('barrelStep', 0.011, 0.011, 0.286, 0.3, mat='steel', seg=24)
box('gasBlock', -0.0125, 0.0125, 0.29, 0.318, -0.024, 0.011, mat='goldDark', bev=0.003)
cyl('gasTube', 0.0055, 0.0055, 0.282, 0.32, v=-0.016, mat='steel', seg=14)
# --- pistol grip (black polymer): palm swell, finger grooves, stippled side panels
grip = prof('grip', [(-0.08, -0.031), (-0.034, -0.031), (-0.042, -0.06), (-0.036, -0.075), (-0.046, -0.09), (-0.042, -0.105), (-0.054, -0.124), (-0.064, -0.132), (-0.088, -0.134),
                     (-0.1, -0.124), (-0.098, -0.09), (-0.09, -0.05)], 0.033, mat='polymer', bev=0.005, seg=3)
for sx in (-1, 1):
    for k in range(7): box('stip', sx * 0.0168 - 0.0008, sx * 0.0168 + 0.0008, -0.088 + k * 0.0042, -0.085 + k * 0.0042, -0.112, -0.05, mat='rubber', bev=0.0003)
box('gripCap', -0.015, 0.015, -0.098, -0.06, -0.137, -0.131, mat='polymer', bev=0.002, rot=('X', 0.3))
# --- the big G36 trigger guard + trigger
prof('guard', [(-0.04, -0.031), (0.034, -0.031), (0.034, -0.044), (0.014, -0.074), (-0.028, -0.078), (-0.046, -0.062)], 0.026, mat='gold', bev=0.002,
     holes=[[(-0.03, -0.037), (0.022, -0.037), (0.008, -0.064), (-0.024, -0.067), (-0.034, -0.054)]])
prof('trigger', [(-0.004, -0.034), (0.002, -0.034), (0.0, -0.05), (-0.006, -0.06), (-0.011, -0.058), (-0.006, -0.048)], 0.006, mat='bright', bev=0.0008)
# --- side-folding skeleton stock with cheek rest, hinge and rubber butt pad
prof('stock', [(-0.13, 0.026), (-0.2, 0.03), (-0.36, 0.024), (-0.398, 0.012), (-0.405, -0.075), (-0.388, -0.088), (-0.33, -0.036), (-0.2, -0.022), (-0.13, -0.022)], 0.032, mat='gold', bev=0.004, seg=3,
     holes=[[(-0.165, 0.012), (-0.338, 0.01), (-0.37, -0.004), (-0.36, -0.018), (-0.33, -0.02), (-0.18, -0.011)], [(-0.384, 0.0), (-0.392, 0.0), (-0.394, -0.058), (-0.386, -0.066), (-0.362, -0.036)]])
prof('buttPad', [(-0.398, 0.032), (-0.414, 0.03), (-0.416, -0.084), (-0.39, -0.096), (-0.386, -0.084), (-0.398, 0.012)], 0.034, mat='rubber', bev=0.004)
for k in range(9): box('padGroove', -0.0175, 0.0175, -0.4165, -0.414, -0.08 + k * 0.012, -0.076 + k * 0.012, mat='rubber', bev=0.0003)
cyl('hinge', 0.009, 0.009, -0.024, 0.024, x=-0.13, v=0.012, mat='goldDark', seg=18, axis='X')
cyl('hingeCap', 0.0105, 0.0105, 0.0225, 0.026, x=-0.13, v=0.012, mat='steel', seg=18, axis='X')
torus('slingLoopR', 0.008, 0.0018, -0.35, x=0.0, v=-0.062, mat='steel', axis='Y')

# =============================================================================================== magazine (node 'mag')
MAGP = [(0.012, -0.033), (0.068, -0.033), (0.082, -0.09), (0.1, -0.145), (0.118, -0.188), (0.098, -0.198), (0.078, -0.192), (0.06, -0.148), (0.044, -0.09), (0.028, -0.033)]
mag = prof('mag', MAGP, 0.026, node='mag', mat='magBlack', bev=0.002, seg=2)
for (a, b) in ((MAGP[1], MAGP[2]), (MAGP[2], MAGP[3]), (MAGP[3], MAGP[4])):  # raised spine along the front edge
    prof('magSpine', [(a[0] - 0.004, a[1]), (a[0], a[1]), (b[0], b[1]), (b[0] - 0.004, b[1])], 0.016, node='mag', mat='magBlack', bev=0.0008)
for sx in (-1, 1): prof('magWindow', [(0.03, -0.05), (0.05, -0.05), (0.075, -0.15), (0.068, -0.17), (0.06, -0.15)], 0.001, x=sx * 0.0131, node='mag', mat='polymer', bev=0.0)
for sx in (-1, 1):  # coupling studs
    for (u, v) in ((0.052, -0.075), (0.074, -0.14)): cyl('stud', 0.0042, 0.0038, sx * 0.0128, sx * 0.0165, u, v, node='mag', mat='magBlack', seg=12, axis='X')
box('magBase', -0.0145, 0.0145, 0.072, 0.122, -0.206, -0.196, node='mag', mat='polymer', bev=0.002, rot=('X', -0.38))
box('cartridge', -0.0045, 0.0045, 0.02, 0.06, -0.036, -0.03, node='mag', mat='brass', bev=0.0015)

# =============================================================================================== muzzle devices
# suppressed: QD collar + black can with engraving (texture), front cap
cyl('suppCollar', 0.0135, 0.0135, 0.395, 0.418, node='supp', mat='black', seg=28)
for k in range(5): cyl('suppGrip', 0.0148, 0.0148, 0.398 + k * 0.004, 0.4, node='supp', mat='black', seg=28)
cyl('suppTube', 0.0185, 0.0185, 0.416, 0.555, node='supp', mat='suppressor', seg=36, bev=0.0)
lathe('suppEnds', [(0.0, 0.414), (0.0172, 0.414), (0.0188, 0.418), (0.0188, 0.42)], node='supp', mat='black')
lathe('suppCap', [(0.0188, 0.552), (0.0188, 0.556), (0.016, 0.562), (0.0068, 0.564), (0.0055, 0.558), (0.0, 0.558)], node='supp', mat='black')
# open: G36 four-prong flash hider
cyl('hiderBase', 0.0112, 0.0112, 0.395, 0.41, node='hider', mat='black', seg=24)
for k in range(4):
    a = math.pi / 4 + k * math.pi / 2; cx, cz = math.cos(a) * 0.0098, math.sin(a) * 0.0098
    box('prong', cx - 0.0032, cx + 0.0032, 0.408, 0.452, cz - 0.0032, cz + 0.0032, node='hider', mat='black', bev=0.0008, rot=None)

# =============================================================================================== EOTech 552 (gold housing)
EU0, EBASE = -0.045, 0.0475  # rear end of the sight, top of the rail teeth
box('eoBase', -0.017, 0.017, EU0, EU0 + 0.105, EBASE, EBASE + 0.012, mat='goldDark', bev=0.002)
cyl('eoKnob', 0.0072, 0.0072, 0.017, 0.028, x=EU0 + 0.05, v=EBASE + 0.006, mat='black', seg=18, axis='X')
for k in range(10): box('eoKnurl', 0.0275, 0.0285, EU0 + 0.044 + k * 0.0012, EU0 + 0.0446 + k * 0.0012, EBASE, EBASE + 0.012, mat='black', bev=0.0)
cyl('eoBattery', 0.0095, 0.0095, EU0 + 0.062, EU0 + 0.105, x=-0.006, v=EBASE + 0.02, mat='gold', seg=24)
cyl('eoBatCap', 0.0102, 0.0102, EU0 + 0.1, EU0 + 0.11, x=-0.006, v=EBASE + 0.02, mat='black', seg=24)
box('eoBody', -0.0185, 0.0185, EU0, EU0 + 0.062, EBASE + 0.01, EBASE + 0.03, mat='gold', bev=0.003)
WC = EBASE + 0.03 + 0.016          # window centre = the sight axis (written to the SIGHT empty)
WW, WH, HL, T = 0.034, 0.03, 0.056, 0.0028
box('eoHoodTop', -WW / 2 - T, WW / 2 + T, EU0 + 0.004, EU0 + 0.004 + HL, WC + WH / 2, WC + WH / 2 + T, mat='gold', bev=0.0012)
for sx in (-1, 1): box('eoHoodSide', sx * (WW / 2) - (T if sx < 0 else 0), sx * (WW / 2) + (T if sx > 0 else 0), EU0 + 0.004, EU0 + 0.004 + HL, EBASE + 0.03, WC + WH / 2 + T, mat='gold', bev=0.0012)
for sx in (-1, 1): box('eoHoodRib', sx * (WW / 2 + T) - 0.0008, sx * (WW / 2 + T) + 0.0008, EU0 + 0.01, EU0 + HL - 0.004, WC - 0.006, WC + 0.006, mat='goldDark', bev=0.0003)
box('eoRearPanel', -0.016, 0.016, EU0 - 0.003, EU0 + 0.002, EBASE + 0.012, EBASE + 0.03, mat='black', bev=0.001)
for k, uu in enumerate((-0.006, 0.006)): box('eoButton', uu - 0.004, uu + 0.004, EU0 - 0.006, EU0 - 0.002, EBASE + 0.017, EBASE + 0.025, mat='rubber', bev=0.001)
box('eoWinFrameR', -WW / 2, WW / 2, EU0 + 0.004, EU0 + 0.008, WC - WH / 2, WC - WH / 2 + 0.003, mat='black', bev=0.0003)
box('eoWinFrameF', -WW / 2, WW / 2, EU0 + HL - 0.002, EU0 + HL + 0.002, WC - WH / 2, WC - WH / 2 + 0.003, mat='black', bev=0.0003)
bm = bmesh.new()  # the holographic window glass (front)
q = [bm.verts.new((x_, EU0 + HL - 0.006, z_)) for (x_, z_) in ((-WW / 2 + 0.001, WC - WH / 2 + 0.003), (WW / 2 - 0.001, WC - WH / 2 + 0.003), (WW / 2 - 0.001, WC + WH / 2 - 0.001), (-WW / 2 + 0.001, WC + WH / 2 - 0.001))]
bm.faces.new(q); _obj('eoGlass', bm, 'body', 'lens')

# =============================================================================================== empties + finishing
def empty(name, loc):
    e = bpy.data.objects.new(name, None); e.location = loc; SCN.collection.objects.link(e); return e


empty('SIGHT', (0, EU0 + HL * 0.5, WC)); empty('MUZZLE_S', (0, 0.564, 0)); empty('MUZZLE', (0, 0.452, 0))
empty('ANCHOR', (0, 0, 0))



def finish():
    groups = {}
    for ob, node, mat in PARTS:
        if ob.name not in bpy.data.objects: continue
        groups.setdefault((node, mat), []).append(ob)
    for (node, mat), obs in groups.items():
        for o in bpy.context.view_layer.objects: o.select_set(False)
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        if len(obs) > 1: bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active; ob.name = f'{node}__{mat}'; ob.data.name = ob.name
        m = bpy.data.materials.get('gun:' + mat) or bpy.data.materials.new('gun:' + mat); ob.data.materials.clear(); ob.data.materials.append(m)
        # world box-projected UVs (×8 like the procedural guns) except the engraved can, which keeps its cylinder UVs
        if mat != 'suppressor':
            bm_ = bmesh.new(); bm_.from_mesh(ob.data); uv = bm_.loops.layers.uv.verify()
            for f in bm_.faces:
                n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
                for l in f.loops:
                    p = l.vert.co; a, b = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[ax]; l[uv].uv = (a * 8, b * 8)
            bm_.to_mesh(ob.data); bm_.free()
        _activate(ob)
        try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(34))
        except Exception: bpy.ops.object.shade_smooth()
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.hide_render: bpy.data.objects.remove(o, do_unlink=True)


# flip the bottom-rail teeth: everything named rail/railLip/tooth below the bore goes upside-down around its own base
for ob, node, mat in PARTS:
    if mat == 'goldDark' and ob.name.split('.')[0] in ('rail', 'railLip', 'tooth'):
        zc = -0.031
        for vtx in ob.data.vertices: vtx.co.z = 2 * zc - vtx.co.z
        ob.data.flip_normals()
finish()
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT')
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('EXPORTED', OUT, 'meshes', sum(1 for o in bpy.data.objects if o.type == 'MESH'), 'faces', tris)
