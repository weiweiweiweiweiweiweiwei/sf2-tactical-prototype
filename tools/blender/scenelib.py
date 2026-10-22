# v52 shared toolkit for Blender-built map dressing (the Sakura Inn's ryokan_build.py predates it and keeps its own copy).
# Game coords (x, y up, z south) → Blender (x, −z, y). Faces are collected per (group, material) in buckets, UVs are world
# metres divided by the material's tile size (TILE, the same 'tile' as the preset in src/03_textures.js), and every mesh is
# exported as '<group>__<mat>' with a placeholder material '<prefix><mat>' that the game swaps for its own PBR or special
# material by name. Quads that need a whole picture (screens, signs, stripes) pass explicit 0..1 UVs.
import bpy, math, os
from mathutils import Vector

TILE = {}          # mat → (u metres, v metres); the map script fills it
BUCKETS = {}       # (group, mat) → Bucket


def B(x, y, z):  # game → Blender
    return (x, -z, y)


class Bucket:
    def __init__(self):
        self.v = []; self.f = []; self.uv = []

    def face(self, pts, uvs):
        base = len(self.v); self.v.extend(pts); self.f.append(tuple(range(base, base + len(pts)))); self.uv.extend(uvs)


def bk(group, mat):
    k = (group, mat)
    if k not in BUCKETS: BUCKETS[k] = Bucket()
    return BUCKETS[k]


def _auto_uv(pts, mat, n):
    tu, tv = TILE.get(mat, (1.0, 1.0)); ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2]); out = []
    for (x, y, z) in pts:
        if ay >= ax and ay >= az: u, v = x, z
        elif ax >= az: u, v = (z if n[0] < 0 else -z), y
        else: u, v = (-x if n[2] < 0 else x), y
        out.append((u / tu, v / tv))
    return out


def _normal(pts):
    n = Vector((0, 0, 0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a[1] - b[1]) * (a[2] + b[2]); n.y += (a[2] - b[2]) * (a[0] + b[0]); n.z += (a[0] - b[0]) * (a[1] + b[1])
    return n


def poly(group, mat, pts, uvs=None, want=None, center=None):
    """pts in game space; want = the visible side's direction, or center = a point behind the face (flips the winding to match)."""
    n = _normal(pts)
    if want is not None or center is not None:
        d = Vector(want) if want is not None else (Vector([sum(p[k] for p in pts) / len(pts) for k in range(3)]) - Vector(center))
        if n.dot(d) < 0: pts = pts[::-1]; uvs = uvs[::-1] if uvs is not None else None; n = -n
    n = n.normalized() if n.length > 1e-12 else Vector((0, 1, 0))
    if uvs is None: uvs = _auto_uv(pts, mat, n)
    bk(group, mat).face([B(*p) for p in pts], list(uvs))


def box(group, mat, x0, y0, z0, x1, y1, z1, skip=(), mats=None):
    """axis box in game space; mats = per-face overrides {'n','s','e','w','t','b'}; skip = faces not emitted."""
    if x1 < x0: x0, x1 = x1, x0
    if z1 < z0: z0, z1 = z1, z0
    if y1 < y0: y0, y1 = y1, y0
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4: return
    m = lambda k: (mats or {}).get(k, mat)
    F = {'t': ([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)], (0, 1, 0)), 'b': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
         'n': ([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], (0, 0, -1)), 's': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
         'e': ([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], (1, 0, 0)), 'w': ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0))}
    for k, (pts, w) in F.items():
        if k not in skip: poly(group, m(k), pts, want=w)


def cyl(group, mat, cx, cz, r, y0, y1, seg=16, caps=True, r1=None, bottom=False):
    r1 = r if r1 is None else r1; tu = TILE.get(mat, (1, 1))[0]
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        p = [(cx + math.cos(a0) * r, y0, cz + math.sin(a0) * r), (cx + math.cos(a1) * r, y0, cz + math.sin(a1) * r),
             (cx + math.cos(a1) * r1, y1, cz + math.sin(a1) * r1), (cx + math.cos(a0) * r1, y1, cz + math.sin(a0) * r1)]
        u0, u1 = i / seg * 2 * math.pi * r / tu, (i + 1) / seg * 2 * math.pi * r / tu
        poly(group, mat, [p[0], p[3], p[2], p[1]], [(u0, y0), (u0, y1), (u1, y1), (u1, y0)], center=(cx, (y0 + y1) / 2, cz))
    if caps: poly(group, mat, [(cx + math.cos(2 * math.pi * i / seg) * r1, y1, cz + math.sin(2 * math.pi * i / seg) * r1) for i in range(seg)], want=(0, 1, 0))
    if bottom: poly(group, mat, [(cx + math.cos(2 * math.pi * i / seg) * r, y0, cz + math.sin(2 * math.pi * i / seg) * r) for i in range(seg)], want=(0, -1, 0))


def annulus(group, mat, cx, cz, r0, r1, y, seg=48, up=True, stripes=0):
    """flat ring at height y; stripes > 0 maps U around it (0..stripes) for striped pictures, else world UVs."""
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        q = [(cx + math.cos(a0) * r0, y, cz + math.sin(a0) * r0), (cx + math.cos(a0) * r1, y, cz + math.sin(a0) * r1),
             (cx + math.cos(a1) * r1, y, cz + math.sin(a1) * r1), (cx + math.cos(a1) * r0, y, cz + math.sin(a1) * r0)]
        uv = [(i / seg * stripes, 0), (i / seg * stripes, 1), ((i + 1) / seg * stripes, 1), ((i + 1) / seg * stripes, 0)] if stripes else None
        poly(group, mat, q, uv, want=(0, 1 if up else -1, 0))


def _reads_mirrored(p0, p1, want):
    """True when p0→p1 runs right-to-left for a viewer looking at the face from `want` (horizontal part only).
    Facing −want, the viewer's right is (want_z, −want_x)."""
    wx, wz = want[0], want[2]
    if abs(wx) + abs(wz) < 1e-6: return False
    return (p1[0] - p0[0]) * wz + (p1[2] - p0[2]) * (-wx) < 0


def quad(group, mat, p0, p1, p2, p3, want, uv=((0, 0), (1, 0), (1, 1), (0, 1))):
    """one picture quad: p0..p3 = bottom-left, bottom-right, top-right, top-left; swapped left↔right when needed so the
    picture always reads left-to-right from the visible side (want)."""
    if _reads_mirrored(p0, p1, want): p0, p1, p2, p3 = p1, p0, p3, p2
    poly(group, mat, [p0, p1, p2, p3], list(uv), want=want)


def wall_quad(group, mat, ax, az, bx, bz, y0, y1, n, off=0.0, uv=None):
    """vertical quad on the wall line a→b (game xz), pushed `off` along its facing direction n = (nx, nz); a picture
    (explicit uv) always reads left-to-right from the room side."""
    if uv and _reads_mirrored((ax, 0, az), (bx, 0, bz), (n[0], 0, n[1])): ax, az, bx, bz = bx, bz, ax, az
    ox, oz = n[0] * off, n[1] * off
    pts = [(ax + ox, y0, az + oz), (bx + ox, y0, bz + oz), (bx + ox, y1, bz + oz), (ax + ox, y1, az + oz)]
    poly(group, mat, pts, list(uv) if uv else None, want=(n[0], 0, n[1]))


def export(out, prefix):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for (group, mat), bkt in BUCKETS.items():
        if not bkt.f: continue
        if mat not in mats: m = bpy.data.materials.new(prefix + mat); m.use_nodes = True; mats[mat] = m
        me = bpy.data.meshes.new(f'{group}__{mat}'); me.from_pydata(bkt.v, [], bkt.f)
        uvl = me.uv_layers.new(name='UVMap')
        for p_ in me.polygons:
            for li in p_.loop_indices:
                u, v = bkt.uv[me.loops[li].vertex_index]; uvl.data[li].uv = (u, -v)  # glTF flips V; the game's canvas textures are flipY
        me.materials.append(mats[mat]); me.validate(); me.update()
        ob = bpy.data.objects.new(f'{group}__{mat}', me); bpy.context.scene.collection.objects.link(ob)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB', export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    print('EXPORTED', out, 'objects', len(bpy.data.objects), 'faces', sum(len(b.f) for b in BUCKETS.values()), 'bytes', os.path.getsize(os.path.abspath(out)))
