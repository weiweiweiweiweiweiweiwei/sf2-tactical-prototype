# v46 block-out round 3: start from the player's OWN live edits (Blender autosave), keep every shape he made, and only
#   - scale crate heights to the agreed rule (his 1.15 / 2.3 steps → 1.5 one crate / 3.0 two crates)
#   - straw crate between the two grey lines of the plan, flush with the L stack, as tall as the two-crate stacks
#   - bridge GO box back on the floor; trams at his height × the same crate scale; four cable poles; tower behind the tower-side car
#   - mirror every base-A object to base B (B = A with game x → −x, i.e. Blender Y → −Y)
# blender -b <player autosave>.blend -P tools/blender/sky_blockout_round3.py -- <out.blend>
import bpy, bmesh, sys

OUT = sys.argv[sys.argv.index('--') + 1]
ONE, TWO = 1.5, 3.0
K = ONE / 1.15                      # his steps were 1.15 / 2.3


def obj(prefix, dup=False):
    for ob in bpy.data.objects:
        if ob.name.split(' ')[0] == prefix and (('.0' in ob.name) == dup): return ob
    return None


def bake(ob):
    """put the object transform into the mesh so vertices are world coordinates."""
    ob.data.transform(ob.matrix_world); ob.matrix_world = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))


def box(ob, x0, x1, y0, y1, z0, z1):
    """reset an object to a plain box in Blender world coordinates."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = ((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0))
    bm.to_mesh(ob.data); bm.free(); ob.matrix_world = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))


def new_like(src, name, cat_from=None):
    ob = bpy.data.objects.new(name, bpy.data.meshes.new(name.split(' ')[0]))
    for c in (cat_from or src).users_collection: c.objects.link(ob)
    for m in (cat_from or src).data.materials: ob.data.materials.append(m)
    ob.color = (cat_from or src).color
    return ob


def scale_z(ob, k):
    bake(ob)
    for v in ob.data.vertices: v.co.z = max(0.0, v.co.z) * k


def mirror(src, name, fx=1):
    """copy of src reflected Blender Y → −Y (and X → fx·X), normals fixed."""
    ob = new_like(src, name); M = src.matrix_world
    bm = bmesh.new(); bm.from_mesh(src.data)
    for v in bm.verts:
        p = M @ v.co; v.co = (p.x * fx, -p.y, p.z)
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:]) if fx == 1 else None
    bm.to_mesh(ob.data); bm.free()
    if 'note' in src: ob['note'] = src['note']
    return ob


# ---- crates: keep his shapes, only the heights change
a1 = obj('CRATE_A1'); box(a1, -12.29, -6.57, 19.60, 20.86, 0, TWO)            # he cut the hut-side end off; the rest is two crates
a1.name = 'CRATE_A1 箱堆（外側，靠纜車站，兩層）'
scale_z(obj('CRATE_A3'), K); obj('CRATE_A3').name = 'CRATE_A3 L 形箱堆（橫段：靠邊兩層、內側單層）'
scale_z(obj('CRATE_A4'), K); obj('CRATE_A4').name = 'CRATE_A4 L 形箱堆（直段，兩層）'
l2 = obj('CRATE_A3', dup=True); scale_z(l2, K); l2.name = 'CRATE_A2 L 形箱堆（左側靠峽谷，鏡像右側：靠纜車兩層、內側單層）'
for ob in (obj('CRATE_A3'), obj('CRATE_A4'), l2, a1): ob['note'] = f'單層 {ONE} m（站著露出下巴以上、蹲下完全躲住、跳不上去）；兩層 {TWO} m'
st = obj('STRAW_A'); box(st, 7.18, 12.56, 20.41, 22.74, 0, TWO)                # between the two grey lines on the plan, flush with the L's outer face, as tall as the stacks
st['note'] = f'吸管箱：和兩層箱堆同高 {TWO} m，中間挖一個人可以穿過的洞，通往鐘樓側的纜車站'
# ---- bridge GO box: his spot, back on the floor
box(obj('GO_BRIDGE_A'), -2.84, -1.94, 12.88, 13.78, 0, 1.6)

# ---- trams: his 5.4 × 10 m car, 4.6 m tall; the tower-side car is the same car reflected through the centre
tl = obj('TRAM_L'); bake(tl)
TR_H = max(v.co.z for v in tl.data.vertices) * K       # his car height, in the same crate scale
for v in tl.data.vertices: v.co.z = TR_H if v.co.z > 0.1 else 0.0
for ob in list(bpy.data.objects):
    if ob.name.split(' ')[0] == 'TRAM_R': bpy.data.objects.remove(ob, do_unlink=True)
tr = mirror(tl, 'TRAM_R 纜車（鐘樓側，停在 B）', fx=-1)
xs = [v.co.x for v in tl.data.vertices]; ys = [v.co.y for v in tl.data.vertices]
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
box(obj('GO_TRAM_L_CAR'), cx - 0.2, cx + 0.2, cy - 0.2, cy + 0.2, 0, 1.6)
box(obj('GO_TRAM_R_CAR'), -cx - 0.2, -cx + 0.2, -cy - 0.2, -cy + 0.2, 0, 1.6)

# ---- the four cable poles at the corner pulleys, cables at the top of them
CABLE = TR_H + 1.2
lamp = None
for ob in bpy.data.objects:
    if ob.name.startswith('LAMP') or ob.name.startswith('POLE'): lamp = ob if lamp is None else lamp
for tag in ('AL', 'AR', 'BL', 'BR'):
    p = obj('PULLEY_' + tag); bake(p)
    px = sum(v.co.x for v in p.data.vertices) / len(p.data.vertices); py = sum(v.co.y for v in p.data.vertices) / len(p.data.vertices)
    po = obj('POLE_' + tag) or new_like(p, f'POLE_{tag} 纜車柱（滑輪齒輪掛在上面）')
    box(po, px - 0.15, px + 0.15, py - 0.15, py + 0.15, -0.3, CABLE + 0.4); po['note'] = '原本以為是路燈，其實是纜車的柱子'
for side in 'LR':
    c = obj('CABLE_' + side); bake(c)
    xs = [v.co.x for v in c.data.vertices]; ys = [v.co.y for v in c.data.vertices]
    box(c, min(xs), max(xs), min(ys), max(ys), CABLE, CABLE + 0.06)

# ---- tower right behind the tower-side car
tx = max(v.co.x for v in tr.data.vertices) + 0.8
box(obj('TOWER'), tx, tx + 20, -16.73, 16.73, -40, 30)

# ---- mirror base A → base B
MIRROR = ('CRATE_A', 'STRAW_A', 'GO_BRIDGE_A', 'GO_TRAM_L_A', 'GO_TRAM_R_A', 'WINCH_A', 'HUT_A')
for ob in list(bpy.data.objects):
    n = ob.name.split(' ')[0]
    if any(n == p.replace('_A', '_B') or (p == 'CRATE_A' and n.startswith('CRATE_B')) for p in MIRROR):
        bpy.data.objects.remove(ob, do_unlink=True)
for ob in list(bpy.data.objects):
    n = ob.name.split(' ')[0]
    if any(n == p or (p == 'CRATE_A' and n.startswith('CRATE_A')) for p in MIRROR):
        mirror(ob, ob.name.replace('_A', '_B', 1))

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('ROUND3', OUT)
