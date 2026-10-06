# v46 block-out round 5 (final): the player's copy of the left-line car marks where it stops at base B; the tower-side car
# is its point reflection, so add its stop at base A. Run on the player's file: blender -b <in>.blend -P this -- <out>.blend
import bpy, bmesh, sys
OUT = sys.argv[sys.argv.index('--') + 1]
src = next(o for o in bpy.data.objects if o.name.startswith('TRAM_L') and '.0' in o.name)
src.name = 'TRAM_L_STOP_B 纜車（左線）開到 B 停下的位置'
src['note'] = '左線纜車：停在 A 的位置是 TRAM_L，開到對面停在這裡'
for o in [o for o in bpy.data.objects if o.name.startswith('TRAM_R_STOP_A')]: bpy.data.objects.remove(o, do_unlink=True)
me = src.data.copy(); M = src.matrix_world
bm = bmesh.new(); bm.from_mesh(me)
for v in bm.verts:
    p = M @ v.co; v.co = (-p.x, -p.y, p.z)
bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('TRAM_R_STOP_A 纜車（鐘樓側）開到 A 停下的位置', me)
for c in src.users_collection: c.objects.link(ob)
ob.color = src.color; ob['note'] = '鐘樓側纜車：停在 B 的位置是 TRAM_R，開到對面停在這裡（吸管箱後面）'
for o in bpy.data.objects:
    if o.name.startswith('CRATE_A2') or o.name.startswith('CRATE_B2'):
        o['note'] = '左側留一條人可以走的邊；右側和小屋緊貼（沒有縫隙）'
bpy.ops.wm.save_as_mainfile(filepath=OUT); print('ROUND5', OUT)
