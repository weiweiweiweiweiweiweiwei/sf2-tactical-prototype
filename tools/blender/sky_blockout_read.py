# v46 read the edited Sky City block-out back: every object's name, centre and size in GAME coordinates (metres)
# → maps/skycity/blockout/layout.json   (blender -b maps/skycity/blockout/skycity_blockout.blend -P tools/blender/sky_blockout_read.py)
import bpy, json, os
out = []
for ob in bpy.data.objects:
    if ob.type != 'MESH' or ob.name.startswith('PLAN_REF'): continue
    bb = [ob.matrix_world @ v.co for v in ob.data.vertices]
    xs, ys, zs = [p.x for p in bb], [p.y for p in bb], [p.z for p in bb]
    # Blender X = game z (across), Blender −Y = game x (along the bridge), Blender Z = game y (up)
    g = {'x0': -max(ys), 'x1': -min(ys), 'z0': min(xs), 'z1': max(xs), 'y0': min(zs), 'y1': max(zs)}
    out.append({'name': ob.name, 'collection': ob.users_collection[0].name if ob.users_collection else '', 'note': ob.get('note', ''),
                'game': {k: round(v, 2) for k, v in g.items()}, 'rotZdeg': round(ob.rotation_euler.z * 57.2958, 1)})
path = os.path.join(os.path.dirname(bpy.data.filepath), 'layout.json')
json.dump(sorted(out, key=lambda o: o['name']), open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('WROTE', path, len(out))
