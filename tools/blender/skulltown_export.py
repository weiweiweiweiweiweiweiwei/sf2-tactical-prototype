"""Skull Town: baked lighting, collision triangles and the runtime glTF from maps/apex-skulltown/work/skulltown.blend.
  blender -b -P tools/blender/skulltown_export.py -- [--samples N] [--skip-bake]
Writes maps/apex-skulltown/work/export/: scene.gltf (+ .bin, textures/), lm_inner.png / lm_outer.png (8-bit sRGB of
irradiance / max, max in manifest.json), collision.bin, manifest.json.
Lighting: the world is split into the play area (4096² lightmap) and the scenery around it (2048²); Cycles bakes direct +
indirect diffuse (sun from the map's light_environment, sky, bounces, every prop's shadow) into a second UV set ('Lightmap',
glTF TEXCOORD_1). Props stay instanced and lit live in the game.
Collision: world triangles minus decals, plus every non-foliage prop at its coarsest LOD — game axes (x, z_up, −y), metres.
"""
import bpy, bmesh, json, math, re, struct, sys
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from apex_maps import pick
CFG = pick()  # -- --map skulltown | range (tools/blender/apex_maps.py)
WORK = CFG['work']
OUT = WORK / 'export'; (OUT / 'textures').mkdir(parents=True, exist_ok=True)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY_COL = '--collision-only' in args  # re-cut collision.bin (and nothing else) from the .blend
SAMPLES = int(args[args.index('--samples') + 1]) if '--samples' in args else 256
INNER = CFG['inner']  # play-area half size (m, around the centre) for the fine lightmap
FOLIAGE = re.compile(r'grass|plant|bush|tree|foliage|flower|weed|fern|cactus|leaf|leaves|vine|shrub|ivy', re.I)
NOCOLLIDE = re.compile(r'decal|stain|drip|_transparent|erosion|wire|cable|rope|godray|light_strip|bolt', re.I)
SURF = [('glass', re.compile(r'glass|window', re.I)), ('metal', re.compile(r'metal|steel|pipe|trim|grate|girder|beam|tank|corrugat|generator|vent|ac_unit|catwalk|scaffold|barrel|container', re.I)),
        ('wood', re.compile(r'wood|plank|crate|pallet|frame|farmland_house', re.I)), ('sand', re.compile(r'sand|dirt|rock|bone|skull|rib|ground|desert|chalk|stone|gravel', re.I))]
SURF_ID = {'concrete': 0, 'metal': 1, 'wood': 2, 'sand': 3, 'glass': 4}  # = TRI_SURFACES in src/04_collision.js

bpy.ops.wm.open_mainfile(filepath=str(WORK / f"{CFG['name']}.blend"))
sc = bpy.data.scenes['Scene']; bpy.context.window.scene = sc
src = bpy.data.objects['World']


def surface(name):
    return next((k for k, r in SURF if r.search(name)), 'concrete')


# ---------- split the world: play area / scenery, welded, lightmap UVs ----------
def split(obj):
    me = obj.data
    inner = [abs(p.center.x) <= INNER and abs(p.center.y) <= INNER for p in me.polygons]
    parts = {}
    for name, keep in (('World_inner', True), ('World_outer', False)):
        o = obj.copy(); o.data = me.copy(); o.name = name; sc.collection.objects.link(o)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f, k in zip(bm.faces, inner) if k != keep], context='FACES')
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
        bm.to_mesh(o.data); bm.free()
        parts[name] = o
    bpy.data.objects.remove(obj)
    return parts


parts = split(src)
for o in ([] if ONLY_COL else parts.values()):
    for x in sc.objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    uv = o.data.uv_layers.new(name='Lightmap'); o.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    # tens of thousands of small islands: a margin added per island ate most of the atlas — pack again with a ~2 px fraction
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, scale=True, margin_method='FRACTION', margin=0.0005, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')
    o.data.uv_layers['UVMap'].active_render = True; o.data.uv_layers.active = o.data.uv_layers['UVMap']
    print('LMUV', o.name, len(o.data.polygons), flush=True)

# ---------- bake ----------
manifest = {'lightmaps': {}}
baked = {}
sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'; sc.cycles.samples = SAMPLES
prefs = bpy.context.preferences.addons['cycles'].preferences
for t in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = t; prefs.get_devices(); [setattr(d, 'use', True) for d in prefs.devices]; break
    except Exception:
        pass
sc.render.bake.margin = 2
# light: the same Poly Haven sky the game shows (SKY), as the only light — its sun casts the shadows. Turned 180° about z so
# Blender's equirect lookup matches three.js's for the glTF axes (game x, y, z = Blender x, z, −y).
SKY = 'kloofendal_48d_partly_cloudy_puresky'
for o in [o for o in sc.objects if o.type == 'LIGHT']:
    bpy.data.objects.remove(o)
wnt = sc.world.node_tree; wnt.nodes.clear()
env = wnt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(str(ROOT / f'tools/out/apex/sky/{SKY}_1k.hdr'))
tc = wnt.nodes.new('ShaderNodeTexCoord'); mp = wnt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.pi)
bg = wnt.nodes.new('ShaderNodeBackground'); wo = wnt.nodes.new('ShaderNodeOutputWorld')
wnt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); wnt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
wnt.links.new(env.outputs['Color'], bg.inputs['Color']); wnt.links.new(bg.outputs['Background'], wo.inputs['Surface'])
manifest['sky'] = SKY
# the map's own lights (env.ent light / light_spot): interiors are lit by them. Source brightness B (4th of _light) -> watts
# B × LIGHT_W (tuned on the lightmaps: a 60-brightness ceiling lamp lights a room like a dim day); colour sRGB 0-255; spots
# aim along their angles (pitch 90 = down), _cone / _inner_cone are half angles.
LIGHT_W = 12.0
CENTER_SRC = Vector(CFG['center'])
lit = 0
for e in [dict(re.findall(r'"([^"\n]+)"\s+"([^"\n]*)"', b)) for b in re.findall(r'\{([^{}]*)\}', (CFG['maps'] / f"{CFG['stem']}_env.ent").read_text(encoding='latin1'))]:
    if e.get('classname') not in ('light', 'light_spot') or len(e.get('_light', '').split()) != 4:
        continue
    r, g, b_, br = (float(v) for v in e['_light'].split())
    pos = Vector([float(v) * 0.0254 for v in e['origin'].split()]) - CENTER_SRC
    if not (CFG['crop'][0] <= pos.x <= CFG['crop'][1] and CFG['crop'][2] <= pos.y <= CFG['crop'][3]) or br <= 0:
        continue
    spot = e['classname'] == 'light_spot'
    L = bpy.data.lights.new('ent_light', 'SPOT' if spot else 'POINT')
    L.energy = br * LIGHT_W; L.color = tuple((c / 255) ** 2.2 for c in (r, g, b_)); L.shadow_soft_size = 0.1
    o = bpy.data.objects.new('ent_light', L); o.location = pos; sc.collection.objects.link(o)
    if spot:
        pitch, yaw = (math.radians(float(v)) for v in e.get('angles', '90 0 0').split()[:2])
        d = Vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), -math.sin(pitch)))
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cone = float(e.get('_cone', 45)); L.spot_size = math.radians(min(2 * cone, 179)); L.spot_blend = max(0.0, 1 - float(e.get('_inner_cone', cone / 2)) / max(cone, 1))
    lit += 1
manifest['lights'] = lit
print('LIGHTS', lit, flush=True)


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0.0031308, None), 1 / 2.4) - 0.055)


for name, size in (('World_inner', 4096), ('World_outer', 2048)):
    o = parts[name]; tag = name.split('_')[1]
    if ONLY_COL:
        continue
    if '--skip-bake' in args:
        manifest['lightmaps'][tag] = {'file': f'lm_{tag}.png', 'max': 1.0}; continue
    img = bpy.data.images.new('bake_' + tag, size, size, float_buffer=True)
    nodes = []
    for m in o.data.materials:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; m.node_tree.nodes.active = n; nodes.append((m, n))
    for x in sc.objects:
        x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    o.data.uv_layers.active = o.data.uv_layers['Lightmap']  # the bake writes through the active UV map
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=2, use_clear=True)
    o.data.uv_layers.active = o.data.uv_layers['UVMap']
    for m, n in nodes:
        m.node_tree.nodes.remove(n)
    px = np.empty(size * size * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(size, size, 4)[..., :3]
    k = np.array([0.25, 0.5, 0.25], np.float32)  # light 3×3 blur: what the bake's sample noise needs
    px = sum(w * np.roll(px, s, 0) for w, s in zip(k, (-1, 0, 1))); px = sum(w * np.roll(px, s, 1) for w, s in zip(k, (-1, 0, 1)))
    lum = px.max(axis=2); top = float(np.percentile(lum[lum > 0], 99.0))  # (the 1 % hottest — right under lamps — clip) if (lum > 0).any() else 1.0
    enc = srgb(np.clip(px / top, 0, 1))
    out = bpy.data.images.new('lm_' + tag, size, size, alpha=False); out.colorspace_settings.name = 'Non-Color'
    rgba = np.concatenate([enc, np.ones((size, size, 1), np.float32)], axis=2)
    out.pixels.foreach_set(rgba.ravel()); out.filepath_raw = str(OUT / f'lm_{tag}.png'); out.file_format = 'PNG'; out.save()
    manifest['lightmaps'][tag] = {'file': f'lm_{tag}.png', 'max': top}
    baked[name] = px  # (linear, blurred) for the props' light samples below
    print('BAKED', name, size, 'max', top, flush=True)

# ---------- collision triangles (game axes) ----------
P, I, M = [], [], []


def add_mesh(me, mw, mats):
    me.calc_loop_triangles()
    base = len(P) // 3
    for v in me.vertices:
        w = mw @ v.co; P.extend((w.x, w.z, -w.y))
    for t in me.loop_triangles:
        mat = mats[t.material_index] if t.material_index < len(mats) and mats[t.material_index] else None
        n = mat.name if mat else ''
        if NOCOLLIDE.search(n):
            continue
        a, b, c = t.vertices
        I.extend((base + a, base + b, base + c))  # (x, y, z) -> (x, z, -y) is a rotation: winding (floor / ceiling) kept
        M.append(SURF_ID[surface(n)])


for o in parts.values():
    add_mesh(o.data, o.matrix_world, list(o.data.materials))
MAX_COL_TRIS = 80  # per rock part: collision needs a rock's shape, not its detail (rocks are the bulk of the triangles)
NATURAL = re.compile(r'rock|cluster|boulder|cliff|stone|bone|skull|pebble|debris|rubble|dirt_pile|sand_pile', re.I)
MAX_BUILT_TRIS = 400  # stairs, rails, walls: a light trim that keeps steps, posts and openings (80 tore them)
coarse_cache = {}


def coarse_mesh(o, natural):
    if o.name in coarse_cache:
        return coarse_cache[o.name]
    me = o.data; me.calc_loop_triangles(); n = len(me.loop_triangles)
    cap = MAX_COL_TRIS if natural else MAX_BUILT_TRIS
    if n > cap:
        tmp = bpy.data.objects.new('dec_' + o.name, me.copy()); sc.collection.objects.link(tmp)
        mod = tmp.modifiers.new('d', 'DECIMATE'); mod.ratio = cap / n
        dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg)); bpy.data.objects.remove(tmp)
    coarse_cache[o.name] = me
    return me


for inst in [o for o in sc.objects if o.instance_collection]:
    if FOLIAGE.search(inst['model']):
        continue
    for o in bpy.data.collections[inst['coarse']].objects:
        if o.type != 'MESH':
            continue
        mw = inst.matrix_world @ o.matrix_world
        ws = [mw @ Vector(c) for c in o.bound_box]
        if max(q.z for q in ws) - min(q.z for q in ws) < 0.5 and max(max(q.x for q in ws) - min(q.x for q in ws), max(q.y for q in ws) - min(q.y for q in ws)) < 1.5:
            continue  # rubble, litter, low debris (user: they snag feet): walked through like grass — thin floors and platforms are wide, they stay
        add_mesh(coarse_mesh(o, bool(NATURAL.search(inst['model']))), mw, list(o.data.materials) or [None])
pos = np.array(P, np.float32); idx = np.array(I, np.uint32); mat = np.array(M, np.uint8)
used = np.unique(idx); remap = np.full(len(pos) // 3, 0, np.uint32); remap[used] = np.arange(len(used), dtype=np.uint32)
pos = pos.reshape(-1, 3)[used]; idx = remap[idx]
with open(OUT / 'collision.bin', 'wb') as f:
    f.write(struct.pack('<4sIII', b'STRI', 1, len(pos), len(idx) // 3)); f.write(pos.tobytes()); f.write(idx.tobytes()); f.write(mat.tobytes())
manifest['collision'] = {'vertices': int(len(pos)), 'triangles': int(len(idx) // 3), 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()}
print('COLLISION', manifest['collision'], flush=True)
if ONLY_COL:
    sys.exit(0)

# ---------- props' light: the bake under each instance (props are lit live; this dims the ones indoors / in shade) ----------
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
probe = {}
if baked:
    dg = bpy.context.evaluated_depsgraph_get()
    trees = {n: (BVHTree.FromObject(o, dg), o) for n, o in parts.items()}
    def sample(pt):
        for n, (tree, o) in trees.items():
            hit = tree.ray_cast(pt, Vector((0, 0, -1)), 6.0)
            if hit[0] is None:
                hit = tree.find_nearest(pt, 2.5)
            if hit[0] is None:
                continue
            me = o.data; poly = me.polygons[hit[2]]; uvl = me.uv_layers['Lightmap'].data
            vs = [me.vertices[v].co for v in poly.vertices[:3]]; uvs = [uvl[li].uv for li in list(poly.loop_indices)[:3]]
            uv = barycentric_transform(hit[0], *vs, *(Vector((u.x, u.y, 0)) for u in uvs))
            img = baked[n]; size = img.shape[0]
            x = min(size - 1, max(0, int(uv.x * size))); y = min(size - 1, max(0, int(uv.y * size)))
            return float(img[y, x].mean())
        return None
    for inst in [o for o in sc.objects if o.instance_collection]:
        pts = [inst.matrix_world @ (Vector(c)) for c in inst.instance_collection.objects[0].bound_box] if inst.instance_collection.objects else []
        if not pts:
            continue
        cx = sum(p.x for p in pts) / 8; cy = sum(p.y for p in pts) / 8; zmin = min(p.z for p in pts); zmax = max(p.z for p in pts)
        v = sample(Vector((cx, cy, zmin + min(1.5, (zmax - zmin) * 0.5) + 0.3)))
        if v is not None:
            probe[inst.name] = v
    print('PROBES', len(probe), flush=True)

# ---------- runtime glTF: world halves + every prop instance sharing its prototype mesh ----------
exp = bpy.data.collections.new('export'); sc.collection.children.link(exp)
for o in parts.values():
    for c in list(o.users_collection):
        c.objects.unlink(o)
    exp.objects.link(o)
uses = {}
for inst in [o for o in sc.objects if o.instance_collection]:
    for o in inst.instance_collection.objects:
        if o.type != 'MESH':
            continue
        x = bpy.data.objects.new(f"{inst['model']}#{inst.name[5:10]}", o.data)
        x.matrix_world = inst.matrix_world @ o.matrix_world; exp.objects.link(x)
        if inst.name in probe:
            x['lm'] = round(probe[inst.name], 4)  # glTF extras -> userData.lm
        for m in o.data.materials:
            if m:
                uses[m.name] = uses.get(m.name, 0) + 1
world_mats = {m.name for o in parts.values() for m in o.data.materials if m}
for m in bpy.data.materials:  # textures: base colour only (gloss dropped), 512 for the world and much-used props, else 256
    if not m.use_nodes:
        continue
    for n in list(m.node_tree.nodes):
        if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == 'Non-Color':
            m.node_tree.nodes.remove(n)
    lim = 512 if m.name in world_mats or uses.get(m.name, 0) >= 20 else 256
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > lim:
            w, h = n.image.size; s = lim / max(w, h); n.image.scale(max(1, round(w * s)), max(1, round(h * s)))
for o in sc.objects:
    o.select_set(o.name in exp.objects)
bpy.context.view_layer.objects.active = parts['World_inner']
bpy.ops.export_scene.gltf(filepath=str(OUT / 'scene.gltf'), export_format='GLTF_SEPARATE', export_texture_dir='textures', use_selection=True,
                          export_yup=True, export_texcoords=True, export_normals=True, export_vertex_color='NONE', export_materials='EXPORT',
                          export_image_format='AUTO', export_extras=True, export_apply=False)

# ---------- manifest: spawns, doors, bounds ----------
def ents(name):
    t = (CFG['maps'] / f"{CFG['stem']}_{name}.ent").read_text(encoding='latin1')
    return [dict(re.findall(r'"([^"\n]+)"\s+"([^"\n]*)"', b)) for b in re.findall(r'\{([^{}]*)\}', t)]


C = Vector(CFG['center']); S = 0.0254
game = lambda o: [round(float(o[0]) * S - C.x, 3), round(float(o[2]) * S - C.z, 3), round(-(float(o[1]) * S - C.y), 3)]
manifest['spawns'] = [game(d['origin'].split()) + [round(math.radians(float(d.get('angles', '0 0 0').split()[1])), 3)]
                      for d in ents('spawn') if d['classname'] == 'info_spawnpoint_human' and d.get('gamemode_tdm') == '1']
manifest['doors'] = [dict(zip('xyz', game(d['origin'].split())), yaw=math.radians(float(d.get('angles', '0 0 0').split()[1])), model=d.get('model', ''), id=d.get('le_guid', ''), link=d.get('link_to_guid_0', ''))
                     for d in ents('script') if d['classname'] == 'prop_door']
if CFG['play']:
    manifest['playBounds'] = {k: float(v) for k, v in CFG['play'].items()}
else:
    sp = np.array([s[:3] for s in manifest['spawns']])
    manifest['playBounds'] = {'minX': float(sp[:, 0].min() - 25), 'maxX': float(sp[:, 0].max() + 25), 'minZ': float(sp[:, 2].min() - 25), 'maxZ': float(sp[:, 2].max() + 25)}
manifest['killY'] = float(pos[:, 1].min() - 20)
manifest['center_source_m'] = list(C); manifest['inner'] = INNER
bpy.ops.wm.save_as_mainfile(filepath=str(WORK / f"{CFG['name']}_baked.blend"), copy=True)  # the baked scene, for a look in Blender
(OUT / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')))
print('EXPORTED', {k: v for k, v in manifest.items() if k not in ('spawns', 'doors')}, 'spawns', len(manifest['spawns']), 'doors', len(manifest['doors']), flush=True)
