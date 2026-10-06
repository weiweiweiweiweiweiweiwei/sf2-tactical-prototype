# v46 SKY CITY block-out — plain coloured boxes for every gameplay object, laid out from the SF2 radar plan
# (maps/skycity/blockout/plan_ref.png, drawn on the floor as a reference). The player opens the .blend, moves / adds
# boxes, saves, and the layout is read back from the object names and transforms (tools/blender/sky_blockout_read.py).
# Units = metres. Blender axes are laid out like the radar seen from above (numpad 7): Blender X = game z (across),
# Blender −Y = game x (along the bridge; base A at the top, base B at the bottom), Z = up (game y).
# blender -b --factory-startup -P tools/blender/sky_blockout.py -- maps/skycity/blockout/skycity_blockout.blend
import bpy, bmesh, math, sys, os

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'maps/skycity/blockout/skycity_blockout.blend')
REF = os.path.join(os.path.dirname(OUT), 'plan_ref.png')
bpy.ops.wm.read_factory_settings(use_empty=False)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
SCN = bpy.context.scene
S = 0.0897                                                  # metres per radar pixel (base width 285 px ≈ 25.6 m)
PX = lambda px: (px - 592) * S                              # radar x  → game z (across)
PY = lambda py: (py - 812.5) * S                            # radar y  → game x (along the bridge)

COLORS = {  # category → (Chinese label, RGBA)
    'base': ('基地平台', (0.62, 0.62, 0.6, 1)), 'bridge': ('吊橋', (0.25, 0.65, 0.45, 1)), 'tram': ('纜車', (0.85, 0.15, 0.15, 1)),
    'go': ('控制器', (0.6, 0.25, 0.85, 1)), 'crate': ('箱子', (0.15, 0.4, 0.95, 1)), 'hut': ('小屋', (1.0, 0.62, 0.1, 1)),
    'winch': ('捲揚機', (0.5, 0.33, 0.18, 1)), 'gear': ('平躺齒輪', (0.85, 0.7, 0.25, 1)), 'tower': ('鐘樓', (0.95, 0.95, 0.95, 1)),
    'spawn': ('出生區', (0.3, 0.6, 1.0, 0.35)), 'cable': ('纜繩', (0.05, 0.05, 0.05, 1)), 'lamp': ('路燈', (1.0, 0.9, 0.5, 1)),
}
COLS = {}


def coll(cat):
    if cat not in COLS:
        c = bpy.data.collections.new(f'{COLORS[cat][0]} {cat}'); SCN.collection.children.link(c); COLS[cat] = c
    return COLS[cat]


def mat(cat):
    name = 'bo_' + cat; m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name); m.diffuse_color = COLORS[cat][1]
        m.use_nodes = True; bsdf = m.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value = COLORS[cat][1]
        if COLORS[cat][1][3] < 1: m.blend_method = 'BLEND'; bsdf.inputs['Alpha'].default_value = COLORS[cat][1][3]
    return m


def box(cat, name, x0, x1, z0, z1, y0, y1, note=''):
    """game coords: x along the bridge, z across, y up."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); coll(cat).objects.link(ob)
    ob.location = ((z0 + z1) / 2, -(x0 + x1) / 2, (y0 + y1) / 2); ob.scale = (abs(z1 - z0), abs(x1 - x0), abs(y1 - y0))
    me.materials.append(mat(cat)); ob.color = COLORS[cat][1]
    if note: ob['note'] = note
    return ob


def disc(cat, name, x, z, r, y0, y1, note=''):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=y1 - y0, location=(z, -x, (y0 + y1) / 2))
    ob = bpy.context.active_object; ob.name = name
    for c in ob.users_collection: c.objects.unlink(ob)
    coll(cat).objects.link(ob); ob.data.materials.append(mat(cat)); ob.color = COLORS[cat][1]
    if note: ob['note'] = note
    return ob


# ------------------------------------------------------------------------------------------------ the plan (radar px)
# Everything below is measured on the radar of the TOP base (y < 812.5) and mirrored onto the bottom base.
def R(cat, name, px0, px1, py0, py1, y0, y1, note=''):
    for tag, mir in (('A', False), ('B', True)):
        q0, q1 = (1625 - py1, 1625 - py0) if mir else (py0, py1)
        box(cat, name.replace('#', tag), PY(q0), PY(q1), PX(px0), PX(px1), y0, y1, note)


# roof slab: full width out to y 660, then the chasm-side strip with a notch right of the bridge (radar: dark cut-out)
R('base', 'BASE_#1 基地#（主體）', 450, 735, 517, 660, -1.0, 0.0, '屋頂平台，上表面 = 地面 0 m')
R('base', 'BASE_#2 基地#（靠峽谷的一排）', 450, 735, 660, 690, -1.0, 0.0)
# dark radar bars = solid cover
R('crate', 'CRATE_#1 箱子牆（左）', 455, 517, 582, 592, 0, 1.45, '高 1.45：站著剛好露頭，蹲下完全躲住，跳不上去')
R('crate', 'CRATE_#2 箱子（左下靠邊）', 450, 510, 675, 690, 0, 1.45)
R('crate', 'CRATE_#3 箱子牆（右，L 形橫段）', 672, 732, 617, 627, 0, 2.3, '較高的一階約 2.3 m')
R('crate', 'CRATE_#4 箱子牆（右，L 形直段）', 722, 732, 585, 627, 0, 2.3)
R('crate', 'CRATE_#5 箱子（右，淺色線）', 672, 732, 558, 562, 0, 1.45, '平面圖上的淺色線，可能是較矮的箱子（待確認）')
R('crate', 'CRATE_#6 箱子（右，淺色線）', 672, 732, 583, 587, 0, 1.45, '同上（待確認）')
R('winch', 'WINCH_# 捲揚機（大滾筒＋兩端齒輪）', 615, 685, 662, 690, 0, 2.7, '00:26：滾筒的軸平行峽谷邊緣，兩端大齒輪，吊橋升降時會轉；雷達上橋右邊的深色缺口就是它')
R('hut', 'HUT_# 小屋', 512, 562, 630, 675, 0, 3.2, '可進入；窗：朝纜車、朝側邊、朝敵營（吊橋方向）都是鏤空，可射擊投擲')
R('bridge', 'BRIDGE_# 吊橋（一片約 11 m）', 582, 612, 690, 812.5, -0.3, 0.0, '兩片一起升降；以靠基地那端為軸往上翻，升起時幾乎直立；黃色描邊')
R('go', 'GO_BRIDGE_# 吊橋控制器', 570, 580, 674, 684, 0, 1.6, '00:26：在吊橋和小屋之間（雷達上橋左邊的小深色塊）；所有控制器長得一樣')
R('gear', 'FLOORGEAR_# 外緣大齒輪（半圓）', 518, 642, 460, 517, -0.3, 0.0, '半圓形，一半懸在外緣外，可站（方塊只代表範圍）')
R('gear', 'PULLEY_#L 角落滑輪齒輪', 390, 446, 459, 515, -0.3, -0.1, '纜車運行時會轉，可站')
R('gear', 'PULLEY_#R 角落滑輪齒輪', 737, 793, 459, 515, -0.3, -0.1, '纜車運行時會轉，可站')
R('spawn', 'SPAWN_# 出生區（藍點）', 570, 620, 535, 570, 0, 0.1, '平面圖上的藍點')
R('lamp', 'LAMP_#1 路燈', 452, 456, 519, 523, 0, 2.6); R('lamp', 'LAMP_#2 路燈', 729, 733, 519, 523, 0, 2.6)
# trams: one on each long side; left car docked at A, right car at B (point-symmetric). Stations + in-car GO boxes.
TRAM_NOTE = '下半部實心木板牆（窗台約 1.85 m，站著頭露不出來、跳起來才看得到）；上半部拱形窗全部鏤空，子彈打得出去、投擲物丟得進來；門口無門、朝基地；車頂不能站'
box('tram', 'TRAM_L 纜車（停在 A）', PY(560), PY(640), PX(401), PX(435), 0, 2.9, TRAM_NOTE)
box('tram', 'TRAM_R 纜車（停在 B）', PY(1625 - 640), PY(1625 - 560), PX(750), PX(784), 0, 2.9, TRAM_NOTE)
box('go', 'GO_TRAM_L_CAR 車內控制器', PY(630) - 0.2, PY(630) + 0.2, PX(430) - 0.2, PX(430) + 0.2, 0, 1.6, '在車廂內，跟著車移動')
box('go', 'GO_TRAM_R_CAR 車內控制器', PY(995) - 0.2, PY(995) + 0.2, PX(755) - 0.2, PX(755) + 0.2, 0, 1.6, '在車廂內，跟著車移動')
for zt, px in (('L', 455), ('R', 730)):
    R('go', f'GO_TRAM_{zt}_# 纜車站控制器', px - 2, px + 2, 640, 644, 0, 1.6, '呼叫或推送纜車；面向基地（不是懸崖）')
for zc, zt in ((PX(418), 'L'), (PX(765), 'R')):
    box('cable', f'CABLE_{zt} 纜繩', PY(487), PY(1140), zc - 0.03, zc + 0.03, 3.9, 3.96)
box('tower', 'TOWER 鐘樓（不可到達）', PY(705), PY(920), PX(640), PX(735), -20, 26, '00:26：緊貼峽谷東端、和屋頂同高；鐘面朝西（朝吊橋），下緣離地約 2–3 m；大小待確認')

# ------------------------------------------------------------------------------------------------ reference plan on the floor
img = bpy.data.images.load(REF); W, H = img.size
x0, x1 = PY(440), PY(440 + H); z0, z1 = PX(370), PX(370 + W)
bm = bmesh.new(); uv = bm.loops.layers.uv.new()
vs = [bm.verts.new((z, -x, 0.02)) for (x, z) in ((x0, z0), (x0, z1), (x1, z1), (x1, z0))]
f = bm.faces.new(vs)
for l in f.loops:
    nz, x = l.vert.co.x, -l.vert.co.y
    l[uv].uv = ((nz - z0) / (z1 - z0), 1 - (x - x0) / (x1 - x0))
me = bpy.data.meshes.new('PLAN_REF'); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('PLAN_REF 平面圖（參考用）', me); SCN.collection.objects.link(ob); ob.hide_select = True
m = bpy.data.materials.new('plan_ref'); m.use_nodes = True; nt = m.node_tree; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color']); me.materials.append(m)

# viewport: solid shading with object colours + textured plan, top view, metric
for scr in bpy.data.screens:
    for area in scr.areas:
        if area.type == 'VIEW_3D':
            for sp in area.spaces:
                if sp.type == 'VIEW_3D':
                    sp.shading.type = 'SOLID'; sp.shading.color_type = 'TEXTURE'; sp.overlay.show_floor = True
                    sp.region_3d.view_perspective = 'ORTHO'; sp.region_3d.view_rotation = (1, 0, 0, 0); sp.region_3d.view_distance = 75
SCN.unit_settings.system = 'METRIC'
txt = bpy.data.texts.new('README 說明')
txt.write("""天空之城 方塊草稿（v46）
· 每個方塊一個物件，名稱 = 代號 + 中文。顏色：灰=平台 綠=吊橋 紅=纜車 紫=控制器 藍=箱子 橘=小屋 棕=捲揚機 金=齒輪 白=鐘樓。
· 地上墊的是 SF2 雷達平面圖（PLAN_REF），1 格 = 1 公尺。按數字鍵 7（俯視）方向和雷達圖一樣：A 基地在上、B 基地在下。
· 請直接移動 (G)、縮放 (S)、複製 (Shift+D) 方塊，或新增方塊並照同樣格式命名（例如 CRATE_A7 箱子），存檔即可。
· 不確定的物件，在物件屬性 > 自訂屬性 'note' 裡有說明，可以改寫備註告訴我。
""")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('SAVED', OUT, len(bpy.data.objects), 'objects')
