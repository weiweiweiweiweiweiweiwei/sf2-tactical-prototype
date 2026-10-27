"""SF2's own gun (user 2026-10-27: original assets from their install, exported by UModel) -> tools/guns/<id>_sf2.glb.
  blender -b -P tools/blender/sf2_gun_build.py -- m4a1
Input: tools/out/sf2/<id>/ (UModel: `-export -gltf -png` of rif_<id>, rif_<id>_texture, rif_<id>_sight). The parts are skinned
to the first-person rig (Bip01, metres, muzzle along −Y, up +Z); their pose is baked, then the gun is turned into the gun frame
of tools/blender/gunlib.py (X right, Y muzzle, Z up, bore on Z = 0) and marked with the empties src/09_models.js fromGLB reads.
Materials are 'gun:tex_<part>' (base colour + normal map from the part's _d / _n textures) — fromGLB keeps them as they are.
"""
import bpy, sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
GUNS = {
    # parts: (gltf under the export, node, texture stem); 'sight' (A2 front sight) and 'rear' (rear sight) are placed on the rails
    'm4a1': dict(parts=[('rif_m4a1/SkeletalMesh3/rif_m4a1_body.gltf', 'body', 'm4a1_body'),
                        ('rif_m4a1/SkeletalMesh3/rif_m4a1_barrel.gltf', 'body', 'm4a1_barrel'),
                        ('rif_m4a1/SkeletalMesh3/rif_m4a1_stock.gltf', 'body', 'm4a1_stock'),
                        ('rif_m4a1/SkeletalMesh3/rif_m4a1_magazine.gltf', 'mag', 'm4a1_magazine')],
                 sight=('rif_m4a1_sight/SkeletalMesh3/rif_m4a1_sight_up.gltf', 'm4a1_sight'),
                 # the default rear sight: a detachable A2 sight (weapon_common_part01, the '0-2' plate) on the flat top — not the carry handle
                 rear=('weapon_common_part01/SkeletalMesh3/rif_m4a1_rearsight.gltf', 'm4a1_rearsight'),
                 tex=['rif_m4a1_texture/Texture2D', 'rif_m4a1_sight/Texture2D', 'weapon_common_part01/Texture2D']),
}
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['m4a1']
PEEP_DROP = float(args[1]) if len(args) > 1 else 0.0048  # the peep's centre under the rear sight's top (m)
PEEP_DX = float(args[2]) if len(args) > 2 else 0.0007  # and off the top's mean x (the drum on the right side pulls that mean over)
GID = args[0]; G = GUNS[GID]; SRC = ROOT / 'tools/out/sf2' / GID; OUT = ROOT / f'tools/guns/{GID}_sf2.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)


ROUGH = {'barrel': 0.78, 'stock': 0.8, 'magazine': 0.72, 'sight': 0.66, 'body': 0.68}  # by texture stem (phosphate / polymer / anodised)


def tex(stem, kind):
    for d in G['tex']:
        p = SRC / d / f'{stem}_{kind}.png'
        if p.exists():
            return p
    return None


def material(stem):
    m = bpy.data.materials.new(f'gun:tex_{stem}'); m.use_nodes = True; nt = m.node_tree
    # finishes (user 10-27: real guns look matte, not shiny metal): a hard-anodised receiver is an oxide coat, the barrel is
    # phosphated, furniture and magazine polymer — all dielectric and rough in PBR terms, none bare metal
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Metallic'].default_value = 0.0
    b.inputs['Roughness'].default_value = next((r for k, r in ROUGH.items() if k in stem), 0.7)
    d, n = tex(stem, 'd'), tex(stem, 'n')
    if d:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(d)); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if n:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(n)); t.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m


def baked(path):
    """the part's mesh with its skin pose applied, as a plain object (armature and bone-display spheres dropped)"""
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(SRC / path)); new = [o for o in bpy.data.objects if o not in before]
    dg = bpy.context.evaluated_depsgraph_get(); out = None
    for o in new:
        if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers):
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world)
            while len(me.uv_layers) > 1:
                me.uv_layers.remove(me.uv_layers[-1])
            out = bpy.data.objects.new(Path(path).stem, me); bpy.context.scene.collection.objects.link(out)
    for o in new:
        bpy.data.objects.remove(o)
    return out


parts = []
for path, node, stem in G['parts']:
    o = baked(path); o.data.materials.clear(); o.data.materials.append(material(stem)); o['node'] = node; parts.append(o)
pts = lambda o: [v.co.copy() for v in o.data.vertices]
body = next(o for o in parts if 'body' in o.name); barrel = next(o for o in parts if 'barrel' in o.name); mag = next(o for o in parts if o['node'] == 'mag')
# the bore: the barrel's front 5 cm, centre in x / z; the muzzle: its front end (−Y)
bp = pts(barrel); ymin = min(p.y for p in bp); front = [p for p in bp if p.y < ymin + 0.05]
bore = Vector((sum(p.x for p in front) / len(front), ymin, sum(p.z for p in front) / len(front)))
# front sight (its socket is not in the export; its own orientation is right — a triangle from the side): on the front end of the handguard's top rail
sp, sstem = G['sight']; sight = baked(sp); sight.data.materials.clear(); sight.data.materials.append(material(sstem)); sight['node'] = 'body'
sv = pts(sight); c = Vector((sum(p.x for p in sv) / len(sv), sum(p.y for p in sv) / len(sv), min(p.z for p in sv)))
railp = [p for p in bp if p.z > bore.z + 0.012]; ry = min(p.y for p in railp); rz = max(p.z for p in railp if p.y < ry + 0.03)
sight.data.transform(Matrix.Translation((bore.x, ry + 0.02, rz)) @ Matrix.Translation(-c)); parts.append(sight)
# rear sight (socket not exported either): peep end to the rear (+Y here), standing on the receiver's top rail at its rear end
rpath, rstem = G['rear']; rear = baked(rpath); rear.data.materials.clear(); rear.data.materials.append(material(rstem)); rear['node'] = 'body'
rv = pts(rear)
if max(rv, key=lambda p: p.z).y < sum(p.y for p in rv) / len(rv):
    rear.data.transform(Matrix.Rotation(3.14159265, 4, 'Z')); rv = pts(rear)
bv = pts(body); rtop = max(p.z for p in bv); ryr = max(p.y for p in bv if p.z > rtop - 0.004)
c = Vector(((min(p.x for p in rv) + max(p.x for p in rv)) / 2, max(p.y for p in rv), min(p.z for p in rv)))
rear.data.transform(Matrix.Translation((bore.x, ryr, rtop)) @ Matrix.Translation(-c)); parts.append(rear)
rv = pts(rear); hy1 = max(p.y for p in rv); top = max(p.z for p in rv)
tp = [p for p in rv if p.z > top - 0.002]; peepx = sum(p.x for p in tp) / len(tp) + PEEP_DX
aperture = top - PEEP_DROP  # the sight line through the peep: tuned on ADS screenshots against SF2's own
print('PEEP', round(peepx - bore.x, 4), round(aperture - bore.z, 4), 'rear sight', [round(max(p[i] for p in rv) - min(p[i] for p in rv), 3) for i in range(3)], flush=True)
sv = pts(sight); dz = aperture - (max(p.z for p in sv) - 0.004); dx = peepx - (min(p.x for p in sv) + max(p.x for p in sv)) / 2
sight.data.transform(Matrix.Translation((dx, 0, dz)))  # (its base sinks into or lifts off the rail by dz: the post tip meets the sight line)
# marks (current frame): grip = the body's part well under the bore; support = the handguard's underside 27 cm ahead of it
gp = [p for p in pts(body) if p.z < bore.z - 0.07]; grip = Vector((bore.x, sum(p.y for p in gp) / len(gp), sum(p.z for p in gp) / len(gp))) if gp else bore
mp = pts(mag); magtop = Vector((bore.x, sum(p.y for p in mp) / len(mp), max(p.z for p in mp)))
hg = [p for p in bp if abs(p.y - (grip.y - 0.27)) < 0.03]; support = Vector((bore.x, grip.y - 0.27, min(p.z for p in hg) if hg else bore.z - 0.04))
marks = {'MUZZLE': bore, 'SIGHT': Vector((peepx, hy1 - 0.01, aperture)), 'HOOD': Vector((peepx, hy1, aperture)), 'GRIP': grip, 'SUPPORT': support,
         'MAGPIV': magtop, 'CHARGEPIV': Vector((bore.x, hy1 + 0.02, aperture - 0.05))}
# into the gun frame: turn 180° about Z (muzzle to +Y), bore on x = 0 / z = 0, grip at u −0.078 (gunlib's pistol-grip spot)
R = Matrix.Rotation(3.14159265, 4, 'Z'); T = lambda p: R @ (p - Vector((peepx, 0, bore.z)))  # (x = 0 on the peep: the ADS camera sits on x = 0)
shift = Vector((0, -0.078 - T(grip).y, 0)); M = Matrix.Translation(shift) @ R @ Matrix.Translation(-Vector((peepx, 0, bore.z)))
for o in parts:
    o.data.transform(M); o.name = f"{o['node']}__{o.data.materials[0].name.replace('gun:', '')}"
for k, p in marks.items():
    e = bpy.data.objects.new(k, None); e.location = M @ p; bpy.context.scene.collection.objects.link(e)
size = [max(v.co[i] for o in parts for v in o.data.vertices) - min(v.co[i] for o in parts for v in o.data.vertices) for i in range(3)]
print('SF2GUN', GID, 'size', [round(s, 3) for s in size], {k: [round(c, 3) for c in (M @ p)] for k, p in marks.items()}, flush=True)
for im in bpy.data.images:
    if max(im.size) > 1024:
        im.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', export_yup=True, export_image_format='WEBP', export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('SAVED', OUT, OUT.stat().st_size, flush=True)
