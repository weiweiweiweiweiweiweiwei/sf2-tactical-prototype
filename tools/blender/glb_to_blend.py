# v46 a walkable .blend of a Blender-built map, dressed in the game's own materials (exported by tools/_matexport.mjs).
# blender -b --factory-startup -P tools/blender/glb_to_blend.py -- <map.glb> <mats.json> <out.blend> [camX camY camZ yawDeg]
# (camera in GAME coordinates: x east, y up, z south; yaw 0 = looking north/−z, 90 = looking east/+x)
import bpy, json, os, sys, math

a = sys.argv[sys.argv.index('--') + 1:]
GLB, MATS, OUT = a[0], a[1], a[2]
cam = [float(v) for v in a[3:7]] if len(a) >= 7 else None
base = os.path.dirname(os.path.abspath(MATS)); M = json.load(open(MATS, encoding='utf8'))
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(GLB))
for ob in list(bpy.data.objects):                                       # the GO box prototype sits at the origin in the GLB
    if ob.name.startswith('GO_PROTO'): bpy.data.objects.remove(ob, do_unlink=True)


def hexc(h, a=1.0):
    h = h.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)


def image(path, color):
    im = bpy.data.images.load(os.path.join(base, path), check_existing=True); im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return im


done = 0
for mat in bpy.data.materials:
    m = M.get(mat.name)
    if not m: continue
    done += 1; mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (300, 0); nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Metallic'].default_value = float(m['metalness']); bsdf.inputs['Roughness'].default_value = float(m['roughness'])
    col = hexc(m['color'])
    # the game samples (u·rx + ox, v·ry + oy) with v measured from the bottom of the image; Blender's imported v is flipped
    uv = nt.nodes.new('ShaderNodeTexCoord'); uv.location = (-900, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 0); rx, ry = m['repeat']; ox, oy = m['offset']
    mp.inputs['Scale'].default_value = (rx, -ry, 1); mp.inputs['Location'].default_value = (ox, ry + oy, 0)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    if m['map']:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(m['map'], True); t.location = (-450, 150); nt.links.new(mp.outputs[0], t.inputs[0])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (0, 150); mix.inputs[0].default_value = 1.0
        nt.links.new(t.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = col; nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    else: bsdf.inputs['Base Color'].default_value = col
    if m['rough']:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(m['rough'], False); t.location = (-450, -150); nt.links.new(mp.outputs[0], t.inputs[0])
        sp = nt.nodes.new('ShaderNodeSeparateColor'); sp.location = (-200, -150); nt.links.new(t.outputs['Color'], sp.inputs[0])
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.location = (0, -150); mul.inputs[1].default_value = float(m['roughness'])
        nt.links.new(sp.outputs[1], mul.inputs[0]); nt.links.new(mul.outputs[0], bsdf.inputs['Roughness'])
    if m['normal']:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(m['normal'], False); t.location = (-450, -400); nt.links.new(mp.outputs[0], t.inputs[0])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (0, -400); nm.inputs['Strength'].default_value = 0.8
        nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
    if m['emissive'] != '#000000':
        bsdf.inputs['Emission Color'].default_value = hexc(m['emissive']); bsdf.inputs['Emission Strength'].default_value = float(m['emissiveIntensity'])
    if float(m['opacity']) < 0.999:
        bsdf.inputs['Alpha'].default_value = float(m['opacity'])
        try: mat.surface_render_method = 'BLENDED'
        except Exception: mat.blend_method = 'BLEND'
print('materials dressed', done, 'of', len(bpy.data.materials))

# a sky, a sun, and a camera standing where a player spawns (eye height 1.64 m)
w = bpy.data.worlds.new('sky') if not bpy.data.worlds else bpy.data.worlds[0]; bpy.context.scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (0.52, 0.7, 0.95, 1); bg.inputs[1].default_value = 1.0
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), 0, math.radians(35)); bpy.context.scene.collection.objects.link(sun)
if cam:
    x, y, z, yaw = cam
    c = bpy.data.objects.new('Player eye', bpy.data.cameras.new('Player eye')); c.data.lens = 18; c.data.clip_end = 2000
    c.location = (x, -z, y); c.rotation_euler = (math.radians(90), 0, math.radians(-yaw))   # +Y (north) turned clockwise by yaw
    bpy.context.scene.collection.objects.link(c); bpy.context.scene.camera = c
for scr in bpy.data.screens:                                             # open in Material Preview, far clip for the big maps
    for ar in scr.areas:
        if ar.type == 'VIEW_3D':
            for sp in ar.spaces:
                if sp.type == 'VIEW_3D': sp.shading.type = 'MATERIAL'; sp.clip_end = 2000; sp.lens = 30
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT), compress=True)
print('SAVED', OUT)
