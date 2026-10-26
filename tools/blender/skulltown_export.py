"""Skull Town: baked lighting, collision triangles and the runtime glTF from tools/out/apex/skulltown/skulltown.blend.
  blender -b -P tools/blender/skulltown_export.py -- [--samples N] [--skip-bake]
Writes tools/out/apex/skulltown/export/: scene.gltf (+ .bin, textures/), lm_inner.png / lm_outer.png (8-bit sRGB of
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
WORK = ROOT / 'tools/out/apex/skulltown'
OUT = WORK / 'export'; (OUT / 'textures').mkdir(parents=True, exist_ok=True)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAMPLES = int(args[args.index('--samples') + 1]) if '--samples' in args else 256
INNER = 150.0  # play-area half size (m, around the centre) for the fine lightmap
FOLIAGE = re.compile(r'grass|plant|bush|tree|foliage|flower|weed|fern|cactus|leaf|leaves|vine|shrub|ivy', re.I)
NOCOLLIDE = re.compile(r'decal|stain|drip|_transparent|erosion|wire|cable|rope|godray|light_strip|bolt', re.I)
SURF = [('glass', re.compile(r'glass|window', re.I)), ('metal', re.compile(r'metal|steel|pipe|trim|grate|girder|beam|tank|corrugat|generator|vent|ac_unit|catwalk|scaffold|barrel|container', re.I)),
        ('wood', re.compile(r'wood|plank|crate|pallet|frame|farmland_house', re.I)), ('sand', re.compile(r'sand|dirt|rock|bone|skull|rib|ground|desert|chalk|stone|gravel', re.I))]
SURF_ID = {'concrete': 0, 'metal': 1, 'wood': 2, 'sand': 3, 'glass': 4}  # = TRI_SURFACES in src/04_collision.js

bpy.ops.wm.open_mainfile(filepath=str(WORK / 'skulltown.blend'))
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
for o in parts.values():
    for x in sc.objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    uv = o.data.uv_layers.new(name='Lightmap'); o.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    o.data.uv_layers['UVMap'].active_render = True; o.data.uv_layers.active = o.data.uv_layers['UVMap']
    print('LMUV', o.name, len(o.data.polygons), flush=True)

# ---------- bake ----------
manifest = {'lightmaps': {}}
sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'; sc.cycles.samples = SAMPLES
prefs = bpy.context.preferences.addons['cycles'].preferences
for t in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = t; prefs.get_devices(); [setattr(d, 'use', True) for d in prefs.devices]; break
    except Exception:
        pass
sc.render.bake.margin = 6


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0.0031308, None), 1 / 2.4) - 0.055)


for name, size in (('World_inner', 4096), ('World_outer', 2048)):
    o = parts[name]; tag = name.split('_')[1]
    if '--skip-bake' in args:
        manifest['lightmaps'][tag] = {'file': f'lm_{tag}.png', 'max': 1.0}; continue
    img = bpy.data.images.new('bake_' + tag, size, size, float_buffer=True)
    nodes = []
    for m in o.data.materials:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; m.node_tree.nodes.active = n; nodes.append((m, n))
    for x in sc.objects:
        x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, use_clear=True)
    for m, n in nodes:
        m.node_tree.nodes.remove(n)
    px = np.empty(size * size * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(size, size, 4)[..., :3]
    k = np.array([0.25, 0.5, 0.25], np.float32)  # light 3×3 blur: what the bake's sample noise needs
    px = sum(w * np.roll(px, s, 0) for w, s in zip(k, (-1, 0, 1))); px = sum(w * np.roll(px, s, 1) for w, s in zip(k, (-1, 0, 1)))
    lum = px.max(axis=2); top = float(np.percentile(lum[lum > 0], 99.7)) if (lum > 0).any() else 1.0
    enc = srgb(np.clip(px / top, 0, 1))
    out = bpy.data.images.new('lm_' + tag, size, size, alpha=False); out.colorspace_settings.name = 'Non-Color'
    rgba = np.concatenate([enc, np.ones((size, size, 1), np.float32)], axis=2)
    out.pixels.foreach_set(rgba.ravel()); out.filepath_raw = str(OUT / f'lm_{tag}.png'); out.file_format = 'PNG'; out.save()
    manifest['lightmaps'][tag] = {'file': f'lm_{tag}.png', 'max': top}
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
coarse_cache = {}
for inst in [o for o in sc.objects if o.instance_collection]:
    if FOLIAGE.search(inst['model']):
        continue
    col = bpy.data.collections[inst['coarse']]
    for o in col.objects:
        if o.type == 'MESH':
            add_mesh(o.data, inst.matrix_world @ o.matrix_world, list(o.data.materials) or [None])
pos = np.array(P, np.float32); idx = np.array(I, np.uint32); mat = np.array(M, np.uint8)
used = np.unique(idx); remap = np.full(len(pos) // 3, 0, np.uint32); remap[used] = np.arange(len(used), dtype=np.uint32)
pos = pos.reshape(-1, 3)[used]; idx = remap[idx]
with open(OUT / 'collision.bin', 'wb') as f:
    f.write(struct.pack('<4sIII', b'STRI', 1, len(pos), len(idx) // 3)); f.write(pos.tobytes()); f.write(idx.tobytes()); f.write(mat.tobytes())
manifest['collision'] = {'vertices': int(len(pos)), 'triangles': int(len(idx) // 3), 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()}
print('COLLISION', manifest['collision'], flush=True)

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
                          export_image_format='AUTO', export_extras=False, export_apply=False)

# ---------- manifest: spawns, doors, bounds ----------
def ents(name):
    t = (WORK / f'wrap/maps/mp_rr_freedm_skulltown_{name}.ent').read_text(encoding='latin1')
    return [dict(re.findall(r'"([^"\n]+)"\s+"([^"\n]*)"', b)) for b in re.findall(r'\{([^{}]*)\}', t)]


C = Vector((-41.0, -10.0, 0.0)); S = 0.0254
game = lambda o: [round(float(o[0]) * S - C.x, 3), round(float(o[2]) * S - C.z, 3), round(-(float(o[1]) * S - C.y), 3)]
manifest['spawns'] = [game(d['origin'].split()) + [round(math.radians(float(d.get('angles', '0 0 0').split()[1])), 3)]
                      for d in ents('spawn') if d['classname'] == 'info_spawnpoint_human' and d.get('gamemode_tdm') == '1']
manifest['doors'] = [dict(zip('xyz', game(d['origin'].split())), yaw=math.radians(float(d.get('angles', '0 0 0').split()[1])), model=d.get('model', ''), id=d.get('le_guid', ''), link=d.get('link_to_guid_0', ''))
                     for d in ents('script') if d['classname'] == 'prop_door']
sp = np.array([s[:3] for s in manifest['spawns']])
manifest['playBounds'] = {'minX': float(sp[:, 0].min() - 25), 'maxX': float(sp[:, 0].max() + 25), 'minZ': float(sp[:, 2].min() - 25), 'maxZ': float(sp[:, 2].max() + 25)}
manifest['killY'] = float(pos[:, 1].min() - 20)
manifest['center_source_m'] = list(C); manifest['inner'] = INNER
bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'skulltown_baked.blend'), copy=True)  # the baked scene, for a look in Blender
(OUT / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')))
print('EXPORTED', {k: v for k, v in manifest.items() if k not in ('spawns', 'doors')}, 'spawns', len(manifest['spawns']), 'doors', len(manifest['doors']), flush=True)
