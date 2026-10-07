# v46 light a walkable map .blend like the game: Blender's physical sky as background + ambient light, a sun from the map's
# own sky settings (elevation / azimuth, as in the game's Sky shader), soft shadows, a sea of cloud far below (Sky City),
# and the viewport opening in Rendered mode with the scene's world and lights.
# blender -b <map>.blend -P tools/blender/blend_sky.py -- <elevationDeg> <azimuthDeg> [cloudY]
import bpy, math, sys
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
EL, AZ = float(a[0]), float(a[1]); CLOUD = float(a[2]) if len(a) > 2 else None
sc = bpy.context.scene
# the game's sun direction: three.js setFromSphericalCoords(1, 90° − elevation, azimuth) → game (x, y, z) → Blender (x, −z, y)
phi, th = math.radians(90 - EL), math.radians(AZ)
g = Vector((math.sin(phi) * math.sin(th), math.cos(phi), math.sin(phi) * math.cos(th))); d = Vector((g.x, -g.z, g.y)).normalized()

w = sc.world or bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); sky = nt.nodes.new('ShaderNodeTexSky')
for t in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
    try: sky.sky_type = t; break
    except Exception: pass
for k, v in (('sun_elevation', math.radians(EL)), ('sun_rotation', math.atan2(d.x, d.y)), ('altitude', 1500.0), ('air_density', 1.0), ('dust_density', 0.6), ('sun_disc', True)):
    try: setattr(sky, k, v)
    except Exception: pass
bg.inputs['Strength'].default_value = 0.25
nt.links.new(sky.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], out.inputs[0])

sun = bpy.data.objects.get('Sun') or bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
if sun.name not in sc.collection.objects: sc.collection.objects.link(sun)
sun.data.energy = 7.0; sun.data.angle = math.radians(1.5); sun.data.color = (1.0, 0.96, 0.9)
sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()                 # the light shines along −d (from the sky down)
try: sun.data.use_shadow = True
except Exception: pass
ee = sc.eevee
for k, v in (('use_shadows', True), ('shadow_ray_count', 2), ('shadow_step_count', 8), ('use_raytracing', True), ('use_gtao', True), ('gtao_distance', 1.5)):
    try: setattr(ee, k, v)
    except Exception: pass
try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = 0.0
except Exception: pass

if CLOUD is not None and not bpy.data.objects.get('Sea of cloud'):          # Sky City floats over a sea of cloud
    bpy.ops.mesh.primitive_plane_add(size=1200, location=(0, 0, CLOUD)); cl = bpy.context.active_object; cl.name = 'Sea of cloud'
    m = bpy.data.materials.new('cloud sea'); m.use_nodes = True; n = m.node_tree.nodes; p = n.get('Principled BSDF')
    if p is None:
        n.clear(); p = n.new('ShaderNodeBsdfPrincipled'); o = n.new('ShaderNodeOutputMaterial'); m.node_tree.links.new(p.outputs[0], o.inputs[0])
    noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.012; noise.inputs['Detail'].default_value = 6
    ramp = n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.78, 0.8, 0.88, 1); ramp.color_ramp.elements[1].color = (1, 0.98, 1, 1)
    m.node_tree.links.new(noise.outputs['Fac'], ramp.inputs[0]); m.node_tree.links.new(ramp.outputs[0], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 1.0
    try: p.inputs['Emission Color'].default_value = (1, 1, 1, 1); p.inputs['Emission Strength'].default_value = 0.25
    except Exception: pass
    cl.data.materials.append(m)

for scr in bpy.data.screens:                                                  # open in Rendered mode, scene world + lights
    for ar in scr.areas:
        if ar.type == 'VIEW_3D':
            for sp in ar.spaces:
                if sp.type == 'VIEW_3D':
                    sp.shading.type = 'RENDERED'; sp.shading.use_scene_world = True; sp.shading.use_scene_lights = True
                    sp.shading.use_scene_world_render = True; sp.shading.use_scene_lights_render = True
bpy.ops.wm.save_mainfile(compress=True)
print('LIT', bpy.data.filepath)
