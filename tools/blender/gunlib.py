# v49 shared toolkit for Blender gun models (first used by m4a1_build.py; g36c_build.py predates it and keeps its own copy).
# GUN SPACE: Blender X = lateral (+ right), Y = u (forward), Z = v (up); the glTF Y-up export lands in the game as (x, v, −u).
# Every gun script: `from gunlib import *`, model with prof / box / cyl / lathe / torus / rail / screw, drop the empties,
# then call export(). Objects end up as '<node>__<material>' meshes:
#   node  body (static) · mag (reload: drops out) · charge (reload: pulled back) · any variant name the game may skip
#   mat   one of the game's gun materials: black steel bright polymer rubber magBlack brass gold goldDark suppressor dotW dotR
# Empties (game reads them, all optional except SIGHT for sighted guns):
#   SIGHT window centre on the sight axis · HOOD rear of the sight hood (eye relief is measured from it) · MUZZLE bore exit
#   GRIP where the right hand holds · SUPPORT where the left hand cups the handguard · MAGPIV / CHARGEPIV pivots of those nodes
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
SCN = bpy.context.scene
PARTS = []  # (object, node, material)


def out_path(default):
    return argv[0] if argv else default


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


def prism(name, pts, width, x=0.0):
    """hidden (u, v) profile extruded across X — a boolean cutter."""
    bm = bmesh.new(); h = width / 2
    a = [bm.verts.new((x - h, u, v)) for (u, v) in pts]; b = [bm.verts.new((x + h, u, v)) for (u, v) in pts]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(len(pts)): bm.faces.new((a[i], a[(i + 1) % len(pts)], b[(i + 1) % len(pts)], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); SCN.collection.objects.link(ob); ob.hide_render = True; return ob


def prof(name, pts, width, node='body', mat='black', x=0.0, bev=0.0015, holes=(), seg=2):
    """side profile (u forward, v up) extruded across X (width centred on x); holes are (u, v) outlines cut through."""
    bm = bmesh.new(); h = width / 2
    a = [bm.verts.new((x - h, u, v)) for (u, v) in pts]; b = [bm.verts.new((x + h, u, v)) for (u, v) in pts]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(pts)
    for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj(name, bm, node, mat)
    for hp in holes: cut(ob, prism('hole', hp, width + 0.02, x))
    return bevel(ob, bev, seg)


def box(name, x0, x1, u0, u1, v0, v1, node='body', mat='black', bev=0.001, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, u1 - u0, v1 - v0), verts=bm.verts)
    if rot: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot[1], 3, rot[0]))
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (u0 + u1) / 2, (v0 + v1) / 2), verts=bm.verts)
    return bevel(_obj(name, bm, node, mat), bev, 2)


def cyl(name, r0, r1, u0, u1, x=0.0, v=0.0, node='body', mat='steel', seg=24, bev=0.0006, axis='Y'):
    """cylinder along the bore (axis Y, r0 at u0), across the gun (axis X: u0/u1 are x extents, x = u) or upright (axis Z)."""
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
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=20, minor_segments=8)
    ob = bpy.context.active_object; ob.name = name
    if axis == 'Y': ob.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X': ob.rotation_euler = (0, math.pi / 2, 0)
    ob.location = (x, u, v); _activate(ob); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    PARTS.append((ob, node, mat)); return ob


def oval(u, v, a, b, n=16):
    return [(u + math.cos(2 * math.pi * i / n) * a, v + math.sin(2 * math.pi * i / n) * b) for i in range(n)]


def rail(u0, u1, base, w=0.021, node='body', mat='black', face='up', x=0.0, pitch=0.01):
    """Picatinny strip: base + side lips + teeth every `pitch`. face 'up' / 'down' / 'right' / 'left' (side rails sit at x)."""
    obs = [box('rail', -w / 2, w / 2, u0, u1, 0, 0.0045, node, mat, 0.0006)]
    for sx in (-1, 1): obs.append(box('railLip', sx * w / 2 - (0.0025 if sx > 0 else -0.0025), sx * w / 2 + (0.0012 if sx > 0 else -0.0012), u0, u1, 0.0045, 0.0075, node, mat, 0.0004))
    u = u0 + 0.004
    while u < u1 - 0.004:
        obs.append(box('tooth', -w / 2 + 0.0005, w / 2 - 0.0005, u, u + 0.0052, 0.0045, 0.0095, node, mat, 0.0005)); u += pitch
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


def empty(name, loc):
    e = bpy.data.objects.new(name, None); e.location = loc; SCN.collection.objects.link(e); return e


def export(out, uv_scale=24, keep_uv=('suppressor',), draco=True):
    """join parts per (node, material), box-project UVs, smooth by angle, export the GLB (Draco-compressed: the game's gun
    loader decodes it like the Blender maps; position quantisation 14 bits ≈ 0.06 mm over a rifle)."""
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
        if mat not in keep_uv:
            bm_ = bmesh.new(); bm_.from_mesh(ob.data); uv = bm_.loops.layers.uv.verify()
            for f in bm_.faces:
                n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
                for l in f.loops:
                    p = l.vert.co; a, b = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[ax]; l[uv].uv = (a * uv_scale, b * uv_scale)
            bm_.to_mesh(ob.data); bm_.free()
        _activate(ob)
        try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(34))
        except Exception: bpy.ops.object.shade_smooth()
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.hide_render: bpy.data.objects.remove(o, do_unlink=True)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_draco_mesh_compression_enable=draco, export_draco_mesh_compression_level=6, export_draco_position_quantization=14,
                              export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print('EXPORTED', out, 'meshes', sum(1 for o in bpy.data.objects if o.type == 'MESH'), 'faces', faces, 'bytes', os.path.getsize(os.path.abspath(out)))
