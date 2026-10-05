# v45b G36C (SF2 "G36C 黃金") — first-person model built in Blender, in the game's GUN SPACE:
#   Blender X = gun lateral (+ = right), Blender Y = u (forward), Blender Z = v (up); glTF Y-up export → game (x, v, −u).
# Proportions follow the real H&K G36C ×1.1 (hinge→muzzle 500 mm, 220 mm stock, 228 mm barrel) with the grip centred on
# u −0.078 / v −0.08 where the viewmodel hand sits: long polymer receiver with the moulded side rib and angled front facet,
# the open "carry handle" bridge (rear + front towers) topped by a Picatinny rail, folding charging lever under the bridge,
# short vented handguard with side / bottom rails, integrated trigger guard, ambi selector, side-folding skeleton stock
# with a vertical hinge, 30-rd magazine with coupling studs, four-prong hider or a QD suppressor, and a gold EOTech 552.
# Objects are named '<node>__<material>' (node: body / mag / charge / supp / hider); empties SIGHT, HOOD, MUZZLE(_S), SUPPORT, GRIP.
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



def rail(u0, u1, base, w=0.021, node='body', mat='gold', face='up', x=0.0):
    """Picatinny strip: base + side lips + teeth every 10 mm. face 'up' / 'down' / 'right' / 'left' (side rails sit at x)."""
    obs = [box('rail', -w / 2, w / 2, u0, u1, 0, 0.0045, node, mat, 0.0006)]
    for sx in (-1, 1): obs.append(box('railLip', sx * w / 2 - (0.0025 if sx > 0 else -0.0025), sx * w / 2 + (0.0012 if sx > 0 else -0.0012), u0, u1, 0.0045, 0.0075, node, mat, 0.0004))
    u = u0 + 0.004
    while u < u1 - 0.004:
        obs.append(box('tooth', -w / 2 + 0.0005, w / 2 - 0.0005, u, u + 0.0052, 0.0045, 0.0095, node, mat, 0.0005)); u += 0.01
    for ob in obs:
        for vt in ob.data.vertices:
            X, Y, Z = vt.co
            if face == 'up': vt.co = (X, Y, base + Z)
            elif face == 'down': vt.co = (X, Y, base - Z)
            elif face == 'right': vt.co = (x + Z, Y, base - X)
            else: vt.co = (x - Z, Y, base + X)
        if face in ('down', 'left'): ob.data.flip_normals()
    return obs


def screw(u, v, x, r=0.0026, mat='steel'):
    s = 1 if x > 0 else -1
    cyl('screw', r, r, x, x + s * 0.0012, u, v, mat=mat, seg=12, axis='X')
    box('screwSlot', min(x, x + s * 0.0016), max(x, x + s * 0.0016), u - r * 0.8, u + r * 0.8, v - 0.0004, v + 0.0004, mat='black', bev=0.0)


# =============================================================================================== layout (metres, real G36C ×1.1)
# hinge→muzzle 500 mm and a 220 mm stock (real), grip 42 mm ahead of the hinge, magazine 104–161 mm, handguard 307–453 mm.
HINGE, HG0, HG1, HID0 = -0.116, 0.222, 0.382, 0.40
TOP, RB = 0.03, 0.058            # receiver top, bridge-rail base
RT = RB + 0.0095                  # rail tooth tops (where the sight sits)

# =============================================================================================== upper receiver (gold polymer)
prof('receiver', [(HINGE, TOP), (0.21, TOP), (HG0, 0.026), (HG0, -0.022), (0.14, -0.026), (0.078, -0.04), (-0.008, -0.04), (-0.03, -0.031), (HINGE, -0.031)],
     0.040, mat='gold', bev=0.0035, seg=3)
prof('receiverTop', [(HINGE, TOP - 0.002), (0.205, TOP - 0.002), (0.2, TOP + 0.006), (HINGE + 0.004, TOP + 0.006)], 0.031, mat='gold', bev=0.002, seg=2)
box('chargeSlot', -0.0042, 0.0042, -0.07, 0.19, TOP + 0.0055, TOP + 0.0066, mat='black', bev=0.0)
for sx in (-1, 1):
    # moulded side band (the long G36 rib under the bridge) and the angled front facet down to the handguard
    prof('sideRib', [(HINGE + 0.012, 0.016), (0.15, 0.016), (0.17, 0.022), (HINGE + 0.012, 0.022)], 0.0016, x=sx * 0.0203, mat='goldDark', bev=0.0004)
    prof('frontFacet', [(0.1, -0.02), (0.15, 0.012), (0.205, 0.012), (0.205, -0.02)], 0.0014, x=sx * 0.0202, mat='goldDark', bev=0.0003)
    prof('magwellPanel', [(-0.01, -0.012), (0.075, -0.012), (0.075, -0.038), (-0.006, -0.038)], 0.0014, x=sx * 0.0202, mat='goldDark', bev=0.0003)
    for (u, v) in ((-0.104, 0.02), (-0.104, -0.022), (-0.03, -0.024), (0.06, 0.0), (0.12, -0.016), (0.195, 0.0), (0.195, -0.014)):
        cyl('pin', 0.0028, 0.0028, sx * 0.0198, sx * 0.0216, u, v, mat='steel', seg=14, axis='X')
# right side: rounded ejection port with the bolt carrier showing, brass deflector bump behind it
prof('ejectFrame', [(-0.012, 0.002), (0.062, 0.002), (0.066, 0.009), (0.062, 0.016), (-0.012, 0.016), (-0.016, 0.009)], 0.002, x=0.0205, mat='black', bev=0.0005)
box('boltCarrier', 0.0205, 0.0218, -0.006, 0.056, 0.004, 0.014, mat='steel', bev=0.0004)
box('boltLug', 0.0213, 0.0222, 0.012, 0.024, 0.0055, 0.0125, mat='bright', bev=0.0003)
prof('deflector', [(-0.03, 0.0), (-0.016, 0.0), (-0.016, 0.02), (-0.03, 0.014)], 0.006, x=0.0228, mat='gold', bev=0.0012)
# rear and front towers carrying the bridge rail (the G36 "carry handle" opening between them)
prof('towerR', [(HINGE, TOP), (HINGE, RB), (-0.052, RB), (-0.034, TOP)], 0.034, mat='gold', bev=0.0025, seg=2, holes=[oval(-0.08, 0.044, 0.008, 0.0062)])
prof('towerF', [(0.162, TOP), (0.18, RB), (HG0, RB), (HG0, TOP)], 0.034, mat='gold', bev=0.0025, seg=2)
for sx in (-1, 1):
    prof('logoPlate', [(0.186, TOP + 0.004), (0.216, TOP + 0.004), (0.216, RB - 0.004), (0.19, RB - 0.004)], 0.0012, x=sx * 0.0172, mat='goldDark', bev=0.0003)
    for (u, v) in ((0.192, TOP + 0.008), (0.21, TOP + 0.008), (0.21, RB - 0.008), (-0.1, RB - 0.008), (-0.07, RB - 0.008)): screw(u, v, sx * 0.0172)
box('bridge', -0.0125, 0.0125, HINGE, HG0, RB - 0.007, RB + 0.0002, mat='gold', bev=0.0015)
for sx in (-1, 1): box('bridgeFlange', sx * 0.0125 - (0.0035 if sx > 0 else 0), sx * 0.0125 + (0.0035 if sx < 0 else 0), -0.05, 0.18, RB - 0.012, RB - 0.006, mat='gold', bev=0.001)
rail(HINGE + 0.002, HG0 - 0.002, RB)
# --- charging handle (node 'charge'): carrier rod in the top slot, folding T-lever under the front of the bridge
box('chRod', -0.004, 0.004, 0.05, 0.168, TOP + 0.005, TOP + 0.011, node='charge', mat='steel', bev=0.0008)
prof('chLever', [(0.148, TOP + 0.006), (0.164, TOP + 0.006), (0.166, TOP + 0.02), (0.15, TOP + 0.02)], 0.03, node='charge', mat='polymer', bev=0.002)
box('chGrip', -0.016, 0.016, 0.149, 0.165, TOP + 0.017, TOP + 0.021, node='charge', mat='polymer', bev=0.0012)

# =============================================================================================== handguard (gold), barrel, muzzle
prof('handguard', [(HG0, 0.032), (0.366, 0.032), (0.378, 0.026), (HG1, 0.012), (HG1, -0.012), (0.376, -0.023), (0.362, -0.028), (HG0, -0.028)], 0.045, mat='gold', bev=0.004, seg=3,
     holes=[oval(0.252, 0.018, 0.012, 0.0042), oval(0.288, 0.018, 0.012, 0.0042), oval(0.324, 0.018, 0.012, 0.0042),
            oval(0.256, -0.008, 0.0055, 0.0055), oval(0.284, -0.008, 0.0055, 0.0055), oval(0.312, -0.008, 0.0055, 0.0055), oval(0.34, -0.008, 0.0055, 0.0055)])
box('hgSeam', -0.0233, 0.0233, HG0, HG0 + 0.004, -0.028, 0.032, mat='goldDark', bev=0.0006)
for (u, v) in ((0.236, 0.022), (0.352, 0.022)): cyl('hgPin', 0.0028, 0.0028, -0.0237, 0.0237, u, v, mat='steel', seg=14, axis='X')
rail(0.238, 0.36, -0.028, mat='goldDark', face='down')
rail(0.262, 0.342, -0.002, w=0.016, mat='goldDark', face='right', x=0.0225)
rail(0.262, 0.342, -0.002, w=0.016, mat='goldDark', face='left', x=-0.0225)
torus('slingLoopF', 0.007, 0.0017, 0.37, x=-0.028, v=-0.012, mat='steel', axis='X')
cyl('barrel', 0.0092, 0.0088, 0.2, HID0 + 0.004, mat='steel', seg=28)
lathe('barrelNut', [(0.0, HG1 - 0.004), (0.0118, HG1 - 0.004), (0.0118, HG1 + 0.006), (0.0098, HG1 + 0.01), (0.0, HG1 + 0.01)], mat='steel', seg=28)
# open: four-prong flash hider (node 'hider')
lathe('hiderBase', [(0.0, HID0), (0.0112, HID0), (0.0112, HID0 + 0.012), (0.0108, HID0 + 0.014), (0.0, HID0 + 0.014)], node='hider', mat='black', seg=28)
for k in range(4):
    a = math.pi / 4 + k * math.pi / 2; cx, cz = math.cos(a) * 0.0095, math.sin(a) * 0.0095
    prong = box('prong', cx - 0.003, cx + 0.003, HID0 + 0.013, HID0 + 0.034, cz - 0.003, cz + 0.003, node='hider', mat='black', bev=0.0007)
cyl('hiderBore', 0.0058, 0.0058, HID0 + 0.013, HID0 + 0.03, node='hider', mat='black', seg=16)
# suppressed: QD collar with grip rings, long can (engraving texture), stepped front cap
lathe('suppCollar', [(0.0, HID0 - 0.006), (0.0128, HID0 - 0.006), (0.0138, HID0), (0.0138, HID0 + 0.024), (0.0, HID0 + 0.024)], node='supp', mat='black', seg=32)
for k in range(6): cyl('suppGrip', 0.0146, 0.0146, HID0 + 0.003 + k * 0.0036, HID0 + 0.0048 + k * 0.0036, node='supp', mat='black', seg=32)
lathe('suppEnds', [(0.0, HID0 + 0.022), (0.0172, HID0 + 0.022), (0.0188, HID0 + 0.026), (0.0188, HID0 + 0.03), (0.0, HID0 + 0.03)], node='supp', mat='black', seg=36)
cyl('suppTube', 0.0185, 0.0185, HID0 + 0.028, HID0 + 0.152, node='supp', mat='suppressor', seg=40, bev=0.0)
lathe('suppCap', [(0.0, HID0 + 0.15), (0.0188, HID0 + 0.15), (0.0188, HID0 + 0.155), (0.016, HID0 + 0.161), (0.0068, HID0 + 0.163), (0.0055, HID0 + 0.157), (0.0, HID0 + 0.157)], node='supp', mat='black', seg=36)

# =============================================================================================== lower: trigger housing, guard, grip
prof('triggerHousing', [(HINGE + 0.004, -0.029), (-0.004, -0.029), (-0.004, -0.04), (-0.046, -0.04), (-0.104, -0.036), (HINGE + 0.004, -0.034)], 0.036, mat='gold', bev=0.0025, seg=2)
prof('guard', [(-0.052, -0.038), (-0.004, -0.038), (-0.004, -0.046), (-0.012, -0.064), (-0.03, -0.07), (-0.05, -0.064)], 0.024, mat='gold', bev=0.0022, seg=2,
     holes=[[(-0.046, -0.041), (-0.01, -0.041), (-0.016, -0.059), (-0.03, -0.0645), (-0.046, -0.058)]])
prof('trigger', [(-0.033, -0.04), (-0.028, -0.04), (-0.029, -0.05), (-0.034, -0.058), (-0.038, -0.056), (-0.034, -0.048)], 0.006, mat='bright', bev=0.0008)
prof('magCatch', [(-0.009, -0.04), (-0.002, -0.04), (-0.002, -0.05), (-0.008, -0.056), (-0.012, -0.054)], 0.018, mat='polymer', bev=0.0012)
GRIP = [(-0.104, -0.036), (-0.046, -0.036), (-0.05, -0.05), (-0.056, -0.06), (-0.054, -0.07), (-0.06, -0.082), (-0.058, -0.094), (-0.066, -0.11), (-0.072, -0.128),
        (-0.08, -0.136), (-0.1, -0.137), (-0.106, -0.128), (-0.1, -0.1), (-0.096, -0.07), (-0.1, -0.048)]
prof('grip', GRIP, 0.031, mat='polymer', bev=0.006, seg=3)
for sx in (-1, 1):
    prof('gripPanel', [(-0.094, -0.05), (-0.064, -0.05), (-0.07, -0.122), (-0.098, -0.124), (-0.092, -0.08)], 0.0012, x=sx * 0.0156, mat='rubber', bev=0.0004)
    for k in range(6): box('gripStip', sx * 0.0162 - 0.0006, sx * 0.0162 + 0.0006, -0.092 + k * 0.0045, -0.0895 + k * 0.0045, -0.118, -0.056, mat='polymer', bev=0.0002)
    # ambidextrous selector (S / E / F) above the grip
    cyl('selHub', 0.0055, 0.0055, sx * 0.0178, sx * 0.0206, -0.088, -0.02, mat='polymer', seg=18, axis='X')
    prof('selLever', [(-0.09, -0.023), (-0.064, -0.018), (-0.062, -0.013), (-0.088, -0.016)], 0.0024, x=sx * 0.0212, mat='polymer', bev=0.0006)
    for k, col in enumerate(('dotW', 'dotR', 'dotR')):
        cyl('mark', 0.0013, 0.0013, sx * 0.0198, sx * 0.0204, -0.074 + k * 0.009, -0.006 - k * 0.004, mat=col, seg=8, axis='X')

# =============================================================================================== side-folding skeleton stock
prof('stock', [(HINGE - 0.006, TOP), (-0.3, TOP), (-0.336, 0.034), (-0.35, 0.034), (-0.35, -0.098), (-0.336, -0.1), (-0.3, -0.072), (-0.24, -0.047), (-0.17, -0.035), (HINGE - 0.006, -0.032)],
     0.03, mat='gold', bev=0.0035, seg=3,
     holes=[[(-0.134, 0.018), (-0.198, 0.018), (-0.198, -0.019), (-0.134, -0.021)],
            [(-0.212, 0.018), (-0.33, 0.019), (-0.336, 0.006), (-0.336, -0.07), (-0.302, -0.056), (-0.244, -0.033), (-0.212, -0.023)]])
prof('cheekRest', [(-0.21, TOP - 0.002), (-0.31, TOP - 0.002), (-0.31, TOP + 0.007), (-0.29, TOP + 0.01), (-0.23, TOP + 0.008)], 0.028, mat='gold', bev=0.003)
prof('buttPad', [(-0.35, 0.036), (-0.362, 0.035), (-0.364, -0.098), (-0.352, -0.104), (-0.35, -0.1)], 0.033, mat='rubber', bev=0.004)
for k in range(10): box('padGroove', -0.016, 0.016, -0.3645, -0.3625, -0.09 + k * 0.012, -0.087 + k * 0.012, mat='rubber', bev=0.0003)
cyl('stockButton', 0.0055, 0.0055, -0.0155, -0.0185, -0.15, 0.0, mat='polymer', seg=16, axis='X')
# vertical hinge on the right (the stock folds to the right side): block + three knuckles + pin caps
box('hingeBlock', -0.02, 0.02, HINGE - 0.012, HINGE + 0.002, -0.031, TOP, mat='goldDark', bev=0.002)
for (v0, v1) in ((-0.03, -0.012), (-0.009, 0.009), (0.012, 0.03)): cyl('knuckle', 0.0055, 0.0055, v0, v1, x=0.0205, v=HINGE - 0.005, mat='goldDark', seg=16, axis='Z')
for v in (-0.0315, 0.0305): cyl('hingePin', 0.0028, 0.0028, v, v + 0.0015, x=0.0205, v=HINGE - 0.005, mat='steel', seg=12, axis='Z')
torus('slingLoopR', 0.0075, 0.0017, -0.33, x=0.0, v=-0.09, mat='steel', axis='Y')

# =============================================================================================== magazine (node 'mag')
MAGP = [(0.0, -0.036), (0.06, -0.036), (0.064, -0.07), (0.075, -0.125), (0.09, -0.18), (0.088, -0.196), (0.03, -0.196), (0.028, -0.18), (0.016, -0.125), (0.006, -0.07)]
prof('mag', MAGP, 0.028, node='mag', mat='magBlack', bev=0.0022, seg=2)
for (a, b) in ((MAGP[1], MAGP[2]), (MAGP[2], MAGP[3]), (MAGP[3], MAGP[4])):  # front spine and rear ribs
    prof('magSpine', [(a[0] - 0.004, a[1]), (a[0] + 0.001, a[1]), (b[0] + 0.001, b[1]), (b[0] - 0.004, b[1])], 0.02, node='mag', mat='magBlack', bev=0.0008)
for (a, b) in ((MAGP[9], MAGP[8]), (MAGP[8], MAGP[7])):
    prof('magRib', [(a[0] - 0.001, a[1]), (a[0] + 0.004, a[1]), (b[0] + 0.004, b[1]), (b[0] - 0.001, b[1])], 0.02, node='mag', mat='magBlack', bev=0.0008)
for sx in (-1, 1):
    prof('magWindow', [(0.022, -0.05), (0.04, -0.05), (0.06, -0.15), (0.056, -0.17), (0.046, -0.15)], 0.001, x=sx * 0.0142, node='mag', mat='polymer', bev=0.0)
    for (u, v) in ((0.048, -0.062), (0.072, -0.16)):  # coupling studs (left) / sockets (right)
        cyl('stud', 0.0044, 0.0040, sx * 0.0138, sx * 0.0172 if sx < 0 else sx * 0.015, u, v, node='mag', mat='magBlack', seg=14, axis='X')
box('magBase', -0.0158, 0.0158, 0.026, 0.094, -0.2, -0.19, node='mag', mat='polymer', bev=0.0025, rot=('X', -0.27))
box('cartridge', -0.0045, 0.0045, 0.012, 0.05, -0.037, -0.03, node='mag', mat='brass', bev=0.0016)
cyl('bulletTip', 0.0045, 0.0012, 0.05, 0.062, v=-0.0335, node='mag', mat='brass', seg=12)

# =============================================================================================== EOTech 552 (gold) on the bridge rail
EU0 = -0.078                       # rear of the sight base
WW, WH, HL, T = 0.034, 0.026, 0.032, 0.003   # v45: shallow hood — SF2's EOTech view is a thin gold frame, not a tunnel
H0 = EU0 + 0.016                   # hood rear
WC = RT + 0.0215 + WH / 2          # window centre = sight axis
box('eoBase', -0.017, 0.017, EU0, EU0 + 0.128, RT, RT + 0.012, mat='goldDark', bev=0.002)
box('eoClamp', -0.019, 0.019, EU0 + 0.03, EU0 + 0.062, RT - 0.006, RT + 0.004, mat='goldDark', bev=0.0012)
cyl('eoKnob', 0.0075, 0.0075, -0.019, -0.03, x=EU0 + 0.046, v=RT, mat='black', seg=20, axis='X')
for k in range(12):
    a = 2 * math.pi * k / 12
    box('eoKnurl', -0.0305, -0.019, EU0 + 0.046 + math.cos(a) * 0.0074 - 0.0007, EU0 + 0.046 + math.cos(a) * 0.0074 + 0.0007, RT + math.sin(a) * 0.0074 - 0.0007, RT + math.sin(a) * 0.0074 + 0.0007, mat='black', bev=0.0)
box('eoBody', -0.0185, 0.0185, H0, H0 + HL, RT + 0.01, RT + 0.0215, mat='gold', bev=0.003)
box('eoRearPanel', -0.016, 0.016, EU0 - 0.002, H0 + 0.002, RT + 0.006, RT + 0.019, mat='black', bev=0.0015)
for uu in (-0.0065, 0.0065): box('eoButton', uu - 0.0042, uu + 0.0042, EU0 - 0.0055, EU0 - 0.001, RT + 0.009, RT + 0.017, mat='rubber', bev=0.0012)
lathe('eoBattery', [(0.0, 0), (0.0105, 0), (0.0105, 0.036), (0.0, 0.036)], mat='gold', seg=24)
bat = PARTS[-1][0]
for vt in bat.data.vertices: X, Y, Z = vt.co; vt.co = (Y - 0.018, EU0 + 0.108 + X, RT + 0.003 + Z)
for sx in (-1, 1): cyl('eoBatCap', 0.0112, 0.0112, sx * 0.018, sx * 0.0215, x=EU0 + 0.108, v=RT + 0.003, mat="black", seg=24, axis="X")
# hood: two side walls, the roof (front edge chamfered down), ribs; window frame bars and the holographic glass
for sx in (-1, 1):
    prof('eoHoodSide', [(H0, RT + 0.012), (H0 + HL, RT + 0.012), (H0 + HL, WC + WH / 2 - 0.004), (H0 + HL - 0.008, WC + WH / 2 + T), (H0, WC + WH / 2 + T)], T, x=sx * (WW / 2 + T / 2), mat='gold', bev=0.0011)
    box('eoHoodRib', sx * (WW / 2 + T) - 0.0008, sx * (WW / 2 + T) + 0.0008, H0 + 0.006, H0 + HL - 0.01, WC - 0.006, WC + 0.006, mat='goldDark', bev=0.0003)
prof('eoHoodTop', [(H0, WC + WH / 2), (H0 + HL - 0.008, WC + WH / 2), (H0 + HL, WC + WH / 2 - 0.004), (H0 + HL, WC + WH / 2 - 0.001), (H0 + HL - 0.008, WC + WH / 2 + T), (H0, WC + WH / 2 + T)],
     WW + 2 * T, mat='gold', bev=0.0011)
box('eoWinSill', -WW / 2, WW / 2, H0, H0 + HL, RT + 0.0215 - 0.001, WC - WH / 2 - 0.001, mat='goldDark', bev=0.0006)  # hood floor (gold, like SF2's frame)
box('eoWinFrame', -WW / 2, WW / 2, H0 + HL - 0.0085, H0 + HL - 0.0065, WC - WH / 2 - 0.001, WC - WH / 2 + 0.0012, mat='goldDark', bev=0.0003)
bm = bmesh.new()
q = [bm.verts.new((x_, H0 + HL - 0.007, z_)) for (x_, z_) in ((-WW / 2 + 0.0008, WC - WH / 2 + 0.001), (WW / 2 - 0.0008, WC - WH / 2 + 0.001), (WW / 2 - 0.0008, WC + WH / 2 - 0.0008), (-WW / 2 + 0.0008, WC + WH / 2 - 0.0008))]
bm.faces.new(q); _obj('eoGlass', bm, 'body', 'lens')


# =============================================================================================== empties + finishing
def empty(name, loc):
    e = bpy.data.objects.new(name, None); e.location = loc; SCN.collection.objects.link(e); return e


empty('SIGHT', (0, H0 + HL * 0.5, WC)); empty('HOOD', (0, H0, WC)); empty('MUZZLE_S', (0, HID0 + 0.163, 0)); empty('MUZZLE', (0, HID0 + 0.034, 0))
empty('SUPPORT', (0, 0.3, -0.028)); empty('GRIP', (0, -0.078, -0.082))


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
                    p = l.vert.co; a, b = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[ax]; l[uv].uv = (a * 24, b * 24)
            bm_.to_mesh(ob.data); bm_.free()
        _activate(ob)
        try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(34))
        except Exception: bpy.ops.object.shade_smooth()
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.hide_render: bpy.data.objects.remove(o, do_unlink=True)


finish()
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT')
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('EXPORTED', OUT, 'meshes', sum(1 for o in bpy.data.objects if o.type == 'MESH'), 'faces', tris)
