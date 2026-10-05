# Render quick workbench previews of a gun GLB (side + three-quarter) to check proportions before it goes in-game.
# blender -b --factory-startup -P tools/blender/gun_preview.py -- tools/guns/g36c.glb tools/out/g36c_preview
import bpy, sys, math, os
argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = argv[0], argv[1]
HIDE = argv[2].split(',') if len(argv) > 2 else []
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(GLB))
COL = {'gold': (0.89, 0.66, 0.25), 'goldDark': (0.62, 0.45, 0.16), 'polymer': (0.09, 0.09, 0.1), 'rubber': (0.05, 0.05, 0.05), 'steel': (0.35, 0.37, 0.4),
       'black': (0.12, 0.12, 0.13), 'bright': (0.7, 0.72, 0.75), 'magBlack': (0.08, 0.08, 0.09), 'brass': (0.8, 0.6, 0.25), 'suppressor': (0.1, 0.1, 0.1),
       'lens': (0.4, 0.7, 0.8), 'dotW': (1, 1, 1), 'dotR': (0.9, 0.1, 0.1)}
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    node = o.name.split('__')[0]
    if node in HIDE: o.hide_render = True
    for m in o.data.materials:
        c = COL.get(m.name.replace('gun:', ''), (0.5, 0.5, 0.5)); m.diffuse_color = (*c, 1)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_cavity = True; sc.display.shading.cavity_type = 'BOTH'
sc.render.resolution_x, sc.render.resolution_y = 1400, 700; sc.render.film_transparent = False
world = bpy.data.worlds.new('w'); sc.world = world; world.color = (0.82, 0.84, 0.86)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
# imported glTF: game space (x, v, −u) → Blender (x, u, v) again
for name, loc, rot, ortho in (('side', (0.75, 0.08, 0.0), (math.pi / 2, 0, math.pi / 2), 1.08), ('left', (-0.75, 0.08, 0.0), (math.pi / 2, 0, -math.pi / 2), 1.08),
                              ('34', (0.55, -0.45, 0.28), (math.radians(70), 0, math.radians(130)), 0)):
    cam.location = loc; cam.rotation_euler = rot
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = 50
    sc.render.filepath = os.path.abspath(f'{OUT}_{name}.png'); bpy.ops.render.render(write_still=True)
print('PREVIEW OK')
