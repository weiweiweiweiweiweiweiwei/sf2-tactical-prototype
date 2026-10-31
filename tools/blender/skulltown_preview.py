"""Quick look at maps/apex-skulltown/work/skulltown.blend: an overhead and a street-level view (EEVEE).
  blender -b -P tools/blender/skulltown_preview.py -- [blend] [tag]"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
WORK = ROOT / 'maps/apex-skulltown/work'
bpy.ops.wm.open_mainfile(filepath=str(args[0] if args else WORK / 'skulltown.blend'))
tag = args[1] if len(args) > 1 else 'preview'
sc = next(s for s in bpy.data.scenes if s.name != 'prototypes'); bpy.context.window.scene = sc
print('SCENE', sc.name, len(sc.objects), [o.name for o in sc.objects][:5], sc.world)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 8; sc.cycles.device = 'GPU'; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
prefs = bpy.context.preferences.addons['cycles'].preferences
for t in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = t; prefs.get_devices(); [setattr(d, 'use', True) for d in prefs.devices]; break
    except Exception: pass
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.clip_end = 3000
for name, loc, tgt, lens in (('top', (0, -120, 260), (0, 0, 0), 30), ('street', (-30, -60, 8), (10, 20, 4), 24)):
    cam.location = loc; cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
    sc.render.filepath = str(WORK / f'{tag}_{name}.png'); bpy.ops.render.render(write_still=True)
print('PREVIEW_OK')
