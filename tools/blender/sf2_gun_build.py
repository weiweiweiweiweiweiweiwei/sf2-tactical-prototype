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
    # parts: (gltf under the export, node, texture stem); 'sight' is the A2 front sight, set on the front end of the handguard rail
    'm4a1': dict(parts=[('rif_m4a1/SkeletalMesh3/rif_m4a1_body.gltf', 'body', 'm4a1_body'),
                        ('rif_m4a1/SkeletalMesh3/rif_m4a1_barrel.gltf', 'body', 'm4a1_barrel'),
                        ('rif_m4a1/SkeletalMesh3/rif_m4a1_stock.gltf', 'body', 'm4a1_stock'),
                        ('rif_m4a1/SkeletalMesh3/rif_m4a1_magazine.gltf', 'mag', 'm4a1_magazine'),
                        ('rif_m4a1/SkeletalMesh3/rif_m4a1_handle_a.gltf', 'body', 'm4a1_body')],  # carry handle (the rear peep), on the body's texture sheet
                 sight=('rif_m4a1_sight/SkeletalMesh3/rif_m4a1_sight_up.gltf', 'm4a1_sight'),
                 tex=['rif_m4a1_texture/Texture2D', 'rif_m4a1_sight/Texture2D']),
}
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['m4a1']
GID = args[0]; G = GUNS[GID]; SRC = ROOT / 'tools/out/sf2' / GID; OUT = ROOT / f'tools/guns/{GID}_sf2.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)


def tex(stem, kind):
    for d in G['tex']:
        p = SRC / d / f'{stem}_{kind}.png'
        if p.exists():
            return p
    return None


def material(stem):
    m = bpy.data.materials.new(f'gun:tex_{stem}'); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.5; b.inputs['Metallic'].default_value = 0.35
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
# rear peep: the carry handle's rear end, a little under its top (the sight line); the front post is set to that height
hv = pts(next(o for o in parts if 'handle' in o.name)); hy1 = max(p.y for p in hv); aperture = max(p.z for p in hv if p.y > hy1 - 0.02) + 0.0  # (peep centre: measured on the ADS screenshots against SF2's own)
sv = pts(sight); dz = aperture - (max(p.z for p in sv) - 0.004)
sight.data.transform(Matrix.Translation((0, 0, dz)))  # (its base sinks into or lifts off the rail by dz: the post tip meets the sight line)
# marks (current frame): grip = the body's part well under the bore; support = the handguard's underside 27 cm ahead of it
gp = [p for p in pts(body) if p.z < bore.z - 0.07]; grip = Vector((bore.x, sum(p.y for p in gp) / len(gp), sum(p.z for p in gp) / len(gp))) if gp else bore
mp = pts(mag); magtop = Vector((bore.x, sum(p.y for p in mp) / len(mp), max(p.z for p in mp)))
hg = [p for p in bp if abs(p.y - (grip.y - 0.27)) < 0.03]; support = Vector((bore.x, grip.y - 0.27, min(p.z for p in hg) if hg else bore.z - 0.04))
marks = {'MUZZLE': bore, 'SIGHT': Vector((bore.x, hy1 - 0.01, aperture)), 'HOOD': Vector((bore.x, hy1, aperture)), 'GRIP': grip, 'SUPPORT': support,
         'MAGPIV': magtop, 'CHARGEPIV': Vector((bore.x, hy1 + 0.02, aperture - 0.05))}
# into the gun frame: turn 180° about Z (muzzle to +Y), bore on x = 0 / z = 0, grip at u −0.078 (gunlib's pistol-grip spot)
R = Matrix.Rotation(3.14159265, 4, 'Z'); T = lambda p: R @ (p - Vector((bore.x, 0, bore.z)))
shift = Vector((0, -0.078 - T(grip).y, 0)); M = Matrix.Translation(shift) @ R @ Matrix.Translation(-Vector((bore.x, 0, bore.z)))
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
