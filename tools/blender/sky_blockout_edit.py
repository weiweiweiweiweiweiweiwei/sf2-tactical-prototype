# v46 edit the player's Sky City block-out IN PLACE (keeps his own moves): apply round-2 feedback and mirror base A → B.
# blender -b maps/skycity/blockout/skycity_blockout.blend -P tools/blender/sky_blockout_edit.py
import bpy, bmesh

S = 0.0897
PX = lambda px: (px - 592) * S          # radar x → game z (across)
PY = lambda py: (py - 812.5) * S        # radar y → game x (along the bridge); base A is x < 0
CRATE1, CRATE2 = 1.5, 3.0               # one crate hides you up to half the neck (eye 1.64, chin ≈ 1.55); two = 3 m
SCN = bpy.context.scene


def find(prefix):
    for ob in bpy.data.objects:
        if ob.name.split(' ')[0] == prefix: return ob
    return None


def coll_of(cat):
    for c in bpy.data.collections:
        if c.name.endswith(' ' + cat): return c
    return SCN.collection


def mat_of(cat):
    return bpy.data.materials.get('bo_' + cat)


def put(prefix, label, cat, x0, x1, z0, z1, y0, y1, note=None):
    """create or reset a box object (game coords) — mesh rebuilt as a clean unit cube."""
    ob = find(prefix)
    if ob is None:
        me = bpy.data.meshes.new(prefix); ob = bpy.data.objects.new(f'{prefix} {label}', me); coll_of(cat).objects.link(ob)
        m = mat_of(cat)
        if m: me.materials.append(m); ob.color = m.diffuse_color
    else:
        ob.name = f'{prefix} {label}'
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(ob.data); bm.free()
    ob.rotation_euler = (0, 0, 0)
    ob.location = ((z0 + z1) / 2, -(x0 + x1) / 2, (y0 + y1) / 2); ob.scale = (abs(z1 - z0), abs(x1 - x0), abs(y1 - y0))
    if note is not None: ob['note'] = note
    return ob


def drop(prefix):
    ob = find(prefix)
    if ob: bpy.data.objects.remove(ob, do_unlink=True)


def both(prefix, label, cat, px0, px1, py0, py1, y0, y1, note=None):
    """radar coords on base A, mirrored to base B (x → −x)."""
    for tag, sgn in (('A', 1), ('B', -1)):
        xa, xb = PY(py0), PY(py1)
        if sgn < 0: xa, xb = -xb, -xa
        put(prefix.replace('#', tag), label, cat, xa, xb, PX(px0), PX(px1), y0, y1, note)


ONE = f'單層木箱 {CRATE1} m：站著露出頭（下巴以上），蹲下完全躲住，跳不上去'
TWO = f'兩層木箱 {CRATE2} m'
# ---- crates (round 2): exact heights; the chasm-side crate where the player drew it (0.3 m walkable lip on both edges);
#      the outer stack starts a little further in than that crate; the outer stack is two-tier at the station end
both('CRATE_#2', '木箱（靠峽谷角落，單層）', 'crate', 453.3, 510.9, 674.5, 686.4, 0, CRATE1, ONE + '；前方和外側各留約 0.3 m 可走的邊')
both('CRATE_#1', '箱堆（外側，靠纜車站，兩層）', 'crate', 456.0, 478.0, 578.5, 592.0, 0, CRATE2, TWO + '（靠纜車站那一端）')
both('CRATE_#1b', '箱堆（外側，單層）', 'crate', 478.0, 520.0, 578.5, 592.0, 0, CRATE1, ONE)
# L stack on the tower side: the corner + the arm along the edge are two-tier, the inner end of the cross arm is one crate
both('CRATE_#3', 'L 形箱堆（橫段，兩層）', 'crate', 700.0, 732.0, 615.0, 625.0, 0, CRATE2, TWO)
both('CRATE_#3b', 'L 形箱堆（橫段末端，單層）', 'crate', 672.0, 700.0, 615.0, 625.0, 0, CRATE1, ONE)
both('CRATE_#4', 'L 形箱堆（直段，兩層）', 'crate', 722.0, 732.0, 585.0, 615.0, 0, CRATE2, TWO)
both('STRAW_#', '吸管箱（中間有洞，穿過去上纜車）', 'crate', 692.0, 735.0, 572.0, 586.0, 0, 2.4, '長木箱橫躺，中間挖一個人可以穿過的洞（洞高約 1.9 m），通往靠鐘樓那一側的纜車站')
# ---- bridge GO box: keep the player's spot, fix the height (it had been dragged 0.45 m into the floor); mirror to B
ga = find('GO_BRIDGE_A')
if ga:
    bb = [ga.matrix_world @ v.co for v in ga.data.vertices]
    z0, z1 = min(p.x for p in bb), max(p.x for p in bb); x0, x1 = -max(p.y for p in bb), -min(p.y for p in bb)
    for tag, sgn in (('A', 1), ('B', -1)):
        a, b = (x0, x1) if sgn > 0 else (-x1, -x0)
        put(f'GO_BRIDGE_{tag}', '吊橋控制器', 'go', a, b, z0, z1, 0, 1.6, '在吊橋和小屋之間；所有控制器長得一樣')
# ---- trams: as wide as the corner pulley gear (Ø 5 m), 10 m long, ≥ 1.8 × the crates next to them
TR_W, TR_L, TR_H = 5.0, 10.0, 4.6
TN = (f'寬 {TR_W} m（= 角落齒輪直徑）、長 {TR_L} m、高 {TR_H} m（至少是旁邊木箱的 1.8 倍）；下半部實心木板牆（窗台約 2 m，站著頭露不出來、跳起來才看得到）；'
      '上半部拱形窗全部鏤空，子彈打得出去、投擲物丟得進來；門口無門、朝基地；車頂不能站')
zl = PX(418); put('TRAM_L', '纜車（左線，停在 A）', 'tram', PY(581), PY(693), zl - TR_W / 2, zl + TR_W / 2, 0, TR_H, TN)
zr = PX(765); put('TRAM_R', '纜車（鐘樓側，停在 B）', 'tram', -PY(693), -PY(581), zr - TR_W / 2, zr + TR_W / 2, 0, TR_H, TN + '；這一側要先穿過吸管箱才上得了車')
put('GO_TRAM_L_CAR', '車內控制器', 'go', PY(637) - 0.2, PY(637) + 0.2, zl - 0.2, zl + 0.2, 0, 1.6, '在車廂內中央，跟著車移動')
put('GO_TRAM_R_CAR', '車內控制器', 'go', -PY(637) - 0.2, -PY(637) + 0.2, zr - 0.2, zr + 0.2, 0, 1.6, '在車廂內中央，跟著車移動')
# ---- the "lamps" were the four cable poles: one at each corner pulley, up to the cable
for k in range(1, 5):
    for tag in 'AB': drop(f'LAMP_{tag}{k}')
CABLE_Y = TR_H + 1.2
for tag, sgn in (('A', 1), ('B', -1)):
    for side, px in (('L', 418), ('R', 765)):
        x = sgn * PY(487)
        put(f'POLE_{tag}{side}', '纜車柱（滑輪齒輪掛在上面）', 'lamp', x - 0.15, x + 0.15, PX(px) - 0.15, PX(px) + 0.15, -0.3, CABLE_Y + 0.4, '原本以為是路燈，其實是纜車的柱子')
for side, px in (('L', 418), ('R', 765)):
    put(f'CABLE_{side}', '纜繩', 'cable', PY(487), -PY(487), PX(px) - 0.03, PX(px) + 0.03, CABLE_Y, CABLE_Y + 0.06)
bpy.ops.wm.save_mainfile()
print('EDITED', bpy.data.filepath)
# ---- round 2b: the wider tower-side car must not run into the tower — the tower face sits right behind the cable
tw = find('TOWER')
if tw:
    put('TOWER', '鐘樓（不可到達）', 'tower', PY(626), -PY(626), PX(765) + TR_W / 2 + 0.8, PX(765) + TR_W / 2 + 0.8 + 20, -40, 30,
        '鐘樓正對峽谷的盡頭，正面就在鐘樓側纜車的後方；鐘面朝吊橋，中心約離地 6 m')
    bpy.ops.wm.save_mainfile(); print('TOWER MOVED')
