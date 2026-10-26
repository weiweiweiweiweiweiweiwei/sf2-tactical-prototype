"""Skull Town (mp_rr_freedm_skulltown) from the user's own Apex install: BSP world + static props + textures -> one .blend.

Inputs (local only, see .gitignore): tools/out/apex/skulltown/wrap/maps (RSX 'wrap' export: BSP lumps + .ent),
tools/out/apex/skulltown/full/mdl (CAST LOD0 per model), tools/out/apex/rsx-2.4.0/exported_files/material (textures).
  blender -b -P tools/blender/skulltown_build.py
Output: tools/out/apex/skulltown/skulltown.blend (+ skulltown_build.json report, skulltown_overview.png)
World: model 0 meshes with UV0, original vertex normals and the vertex colour (blend weights) as attribute 'blend'; TOOLS
surfaces dropped. Everything is cropped to a box around the play area and moved so its centre is the origin.
"""
import bpy, json, math, re, struct, sys
from collections import Counter, defaultdict
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'tools/out/apex/skulltown'
MAPS = WORK / 'wrap/maps'
STEM = 'mp_rr_freedm_skulltown'
MATDIR = ROOT / 'tools/out/apex/rsx-2.4.0/exported_files/material'
S = 0.0254
CENTER = Vector((-41.0, -10.0, 0.0))          # middle of the official spawns (m, source axes)
CROP = (-330.0, 250.0, -300.0, 280.0)         # x0 x1 y0 y1 (m, source axes): play area + scenery
SKIP_MODEL = re.compile(r'godray|podium|lightshaft|_fx_|spotlight', re.I)
report = {'missing_textures': [], 'missing_models': [], 'skipped_models': []}


def lump(i):
    p = MAPS / f'{STEM}.bsp.{i:04X}.client.bsp_lump'
    return p.read_bytes() if p.exists() else b''


def inside(x, y):
    return CROP[0] <= x <= CROP[1] and CROP[2] <= y <= CROP[3]


# ---------- textures: material name -> RSX folder -> _col / _gls / layer-2 _col ----------
folders = {p.name.lower(): p for p in MATDIR.iterdir() if p.is_dir()}


def find_folder(name):
    n = name.lower()
    for suf in ('_wldc', '_rgdc', '_rgdp', '_wldp', ''):
        f = folders.get(n + suf)
        if f and any(f.glob('*_col.png')):
            return f
    return None


def pick(folder, kind, layer=None):
    files = sorted(folder.glob(f'*_{kind}.png'))
    if layer:
        files = [f for f in files if f.name.endswith(f'_{layer}_{kind}.png')]
    else:
        files = [f for f in files if not re.search(rf'_\d_{kind}\.png$', f.name)] or [f for f in files if f.name.endswith(f'_1_{kind}.png')]
    return files[0] if files else None


def image(p, color=True):
    im = bpy.data.images.load(str(p), check_existing=True)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return im


mat_cache = {}


def material(name):
    """One shared Principled material per Apex material name: base colour (+ alpha clip when the texture has alpha), gloss -> roughness."""
    key = name.lower()
    if key in mat_cache:
        return mat_cache[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8
    folder = find_folder(key)
    m['apex_material'] = key
    if folder is None:
        report['missing_textures'].append(key)
        bsdf.inputs['Base Color'].default_value = (0.5, 0.48, 0.45, 1)
    else:
        m['apex_folder'] = folder.name
        col = pick(folder, 'col')
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(col)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if t.image.channels == 4 and re.search(r'grass|foliage|plant|bush|leaf|leaves|fence|decal|chain|wire|net|transparent|_opa|_bt', key):
            gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
            nt.links.new(t.outputs['Alpha'], gt.inputs[0]); nt.links.new(gt.outputs[0], bsdf.inputs['Alpha'])
            m['alpha'] = 'clip'
        gls = pick(folder, 'gls')
        if gls:
            g = nt.nodes.new('ShaderNodeTexImage'); g.image = image(gls, False)
            inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1
            nt.links.new(g.outputs['Color'], inv.inputs[1]); nt.links.new(inv.outputs[0], bsdf.inputs['Roughness'])
        l2 = pick(folder, 'col', 2)
        if l2:
            m['layer2_col'] = str(l2.relative_to(MATDIR))
        m['apex_col'] = str(col.relative_to(MATDIR))
    mat_cache[key] = m
    return m


# ---------- world: model 0 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
positions = list(struct.iter_unpack('<3f', lump(0x03)))
normals = list(struct.iter_unpack('<3f', lump(0x1E)))
indices = lump(0x4F)
meshes, sorts, texdata, names = lump(0x50), lump(0x52), lump(0x02), lump(0x0F)
first, count = struct.unpack_from('<2i', lump(0x0E), 24)
types = {0: (0x48, 20), 0x200: (0x49, 32), 0x400: (0x47, 20), 0x600: (0x4A, 24)}
streams = {i: lump(i) for i, _ in types.values()}
verts, faces, uvs, nrms, cols, face_mats, mats, mat_ids = [], [], [], [], [], [], [], {}
dropped = Counter()
for mi in range(first, first + count):
    start, ntri = struct.unpack_from('<IH', meshes, mi * 28)
    si, flags = struct.unpack_from('<HI', meshes, mi * 28 + 22)
    tid = struct.unpack_from('<h', sorts, si * 12)[0]
    off = struct.unpack_from('<i', texdata, tid * 16)[0]
    name = names[off:].split(b'\0', 1)[0].decode().replace('\\', '/')
    if name.upper().startswith('TOOLS/'):
        dropped['tools'] += ntri
        continue
    short = name.rsplit('/', 1)[-1].lower()
    base = struct.unpack_from('<i', sorts, si * 12 + 8)[0]
    lid, stride = types[flags & 0x600]
    st = streams[lid]
    for ti in range(ntri):
        cs = []
        for j in range(3):
            vi = base + struct.unpack_from('<H', indices, (start + ti * 3 + j) * 2)[0]
            pi, ni = struct.unpack_from('<2I', st, vi * stride)
            uv = struct.unpack_from('<2f', st, vi * stride + 8)
            c = struct.unpack_from('<4B', st, vi * stride + 16) if lid == 0x49 else (255, 255, 255, 255)
            cs.append((pi, ni, uv, c))
        if len({c[0] for c in cs}) < 3:
            dropped['degenerate'] += 1
            continue
        p = [positions[c[0]] for c in cs]
        cx, cy = sum(q[0] for q in p) / 3 * S, sum(q[1] for q in p) / 3 * S
        if not inside(cx, cy):
            dropped['outside'] += 1
            continue
        if short not in mat_ids:
            mat_ids[short] = len(mats); mats.append(material(short))
        i0 = len(verts)
        for (pi, ni, uv, c), q in zip(cs, p):
            verts.append((q[0] * S - CENTER.x, q[1] * S - CENTER.y, q[2] * S - CENTER.z))
            uvs.append((uv[0], 1 - uv[1])); nrms.append(normals[ni]); cols.append(tuple(x / 255 for x in c))
        faces.append((i0, i0 + 2, i0 + 1)); face_mats.append(mat_ids[short])  # Source winds clockwise
mesh = bpy.data.meshes.new('skulltown_world')
mesh.from_pydata(verts, [], faces)
for m in mats:
    mesh.materials.append(m)
mesh.polygons.foreach_set('material_index', face_mats)
mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', [v for uv in uvs for v in uv])
ca = mesh.color_attributes.new('blend', 'BYTE_COLOR', 'CORNER')
ca.data.foreach_set('color', [v for c in cols for v in c])
mesh.update()
mesh.normals_split_custom_set([nrms[l.vertex_index] for l in mesh.loops])
world = bpy.data.objects.new('World', mesh)
scene.collection.objects.link(world)
report['world'] = {'triangles': len(faces), 'materials': len(mats), 'dropped': dict(dropped)}
print('WORLD', report['world'], flush=True)

# ---------- static props (lump 0x23 'prps' v52) ----------
d = lump(0x23)
cnt, ident, fl, ver, _, _ = struct.unpack_from('<I4sHHII', d)
assert ident == b'prps' and ver == 52
nn = struct.unpack_from('<I', d, 20)[0]
pnames = [d[24 + i * 128:24 + (i + 1) * 128].split(b'\0')[0].decode() for i in range(nn)]
c = 24 + nn * 128
pc = struct.unpack_from('<I', d, c)[0]; c += 12
props = []
for i in range(pc):
    v = struct.unpack_from('<7fH2B2H4f4b4B2H', d, c); c += 64
    if inside(v[0] * S, v[1] * S):
        props.append({'i': i, 'model': pnames[v[7]], 'o': v[:3], 'a': v[3:6], 's': v[6], 'skin': v[10]})
sys.path.insert(0, str(ROOT / 'tools/out/apex/python'))
import io_scene_cast
io_scene_cast.register()
protos, coarse = {}, {}
lib = bpy.data.collections.new('prototypes')
uses = Counter(Path(p['model']).stem.lower() for p in props)
VIS_BUDGET = 150_000  # triangles per model across all its placements: the finest LOD that fits draws (CAST ~34 bytes per triangle)


def import_cast(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.cast(filepath=str(path), import_skin=False, import_ik=False, import_constraints=False)
    added = [o for o in set(bpy.data.objects) - before]
    geo = [o for o in added if o.type == 'MESH']
    col = bpy.data.collections.new(name)
    lib.children.link(col)
    for o in geo:
        mw = o.matrix_world.copy()
        for cl in list(o.users_collection):
            cl.objects.unlink(o)
        col.objects.link(o); o.parent = None; o.matrix_world = mw
        for slot in o.material_slots:  # CAST materials carry only a name: swap for the shared textured one
            if slot.material:
                slot.material = material(re.sub(r'\.\d+$', '', slot.material.name))
    for o in added:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    return col if geo else None


lod_pick = {}
for key in sorted(uses):
    if SKIP_MODEL.search(key):
        report['skipped_models'].append(key); continue
    hits = [q for q in (WORK / 'full/mdl').iterdir() if q.name.lower() == key]
    lods = sorted(hits[0].glob('*_LOD[0-9].cast')) if hits else []
    if not lods:
        report['missing_models'].append(key); continue
    vis = next((f for f in lods if f.stat().st_size / 34 * uses[key] <= VIS_BUDGET), lods[-1])
    lod_pick[key] = [lods.index(vis), len(lods) - 1]
    col = import_cast(vis, 'P_' + key)
    if col:
        protos[key] = col
        coarse[key] = import_cast(lods[-1], 'C_' + key) if lods[-1] != vis else col
report['lods'] = lod_pick
inst_col = bpy.data.collections.new('props')
scene.collection.children.link(inst_col)
placed = 0
for p in props:
    key = Path(p['model']).stem.lower()
    if key not in protos:
        continue
    pitch, yaw, roll = (math.radians(a) for a in p['a'])
    rot = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(pitch, 4, 'Y') @ Matrix.Rotation(roll, 4, 'X')
    o = bpy.data.objects.new(f"prop_{p['i']:05d}_{key}", None)
    o.instance_type = 'COLLECTION'; o.instance_collection = protos[key]
    o.matrix_world = Matrix.Translation(Vector(p['o']) * S - CENTER) @ rot @ Matrix.Scale(p['s'] * S, 4)
    o['model'] = key; o['coarse'] = coarse[key].name
    inst_col.objects.link(o); placed += 1
report['props'] = {'in_crop': len(props), 'placed': placed, 'models': len(protos)}
report['materials'] = len(mat_cache)
report['missing_textures'] = sorted(set(report['missing_textures']))
print('PROPS', report['props'], 'missing models', report['missing_models'], flush=True)
print('MATERIALS', len(mat_cache), 'without textures', len(report['missing_textures']), flush=True)

# ---------- sun from light_environment (pitch 42.8°, yaw −91.2°) + sky ambient ----------
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 4.0; sun.data.color = (1.0, 0.93, 0.84); sun.data.angle = math.radians(1.5)
pitch, yaw = math.radians(42.8), math.radians(-91.2)
direction = Vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), -math.sin(pitch)))  # light travel
sun.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(sun)
scene.world = bpy.data.worlds.new('sky')
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.27, 0.52, 0.76, 1); bg.inputs['Strength'].default_value = 0.6

lib_scene = bpy.data.scenes.new('prototypes')
lib_scene.collection.children.link(lib)
bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'skulltown.blend'))
(WORK / 'skulltown_build.json').write_text(json.dumps(report, indent=1))
print('SAVED', flush=True)
