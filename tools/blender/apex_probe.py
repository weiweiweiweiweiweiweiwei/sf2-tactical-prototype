"""Build local-only Apex import proofs, not a playable/released map.

Input: RSX 2.4.0 exports under tools/out/apex.
BSP layout reference: r-ex/rsx src/game/bsp/bsp.h and bsp.cpp.
CAST importer: dtzxporter/cast (kept in the ignored tools/out directory).
Run with Blender --background --factory-startup --python this_file.
"""
import importlib.util
import json
import math
from pathlib import Path
import shutil
import struct
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "tools/out/apex"
OUT = WORK / "preview"
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 0.0254
report = {"status": "building", "source": "installed Apex Legends / firing range",
          "unit_conversion": "Source inches to metres: 0.0254",
          "limitations": ["Local import feasibility test, not a playable map",
                           "BSP preview uses diagnostic materials; original world shaders not reconstructed",
                           "Static props and gameplay entities not placed in BSP preview",
                           "Asset gallery layout is synthetic, not original map placement"],
          "models": []}


def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = 0.8
    return m


def camera_for(scene, lo, hi):
    center = (lo + hi) * 0.5
    extent = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, 1)
    camera = bpy.data.objects.new("Overview", bpy.data.cameras.new("Overview"))
    scene.collection.objects.link(camera)
    camera.location = center + Vector((0.85, -1.1, 1.05)) * extent
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = extent * 1.9
    camera.data.clip_end = extent * 10
    scene.camera = camera
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.clip_end = extent * 10
                area.spaces.active.region_3d.view_distance = extent * 1.5
                area.spaces.active.region_3d.view_location = center
    return camera


def bounds(objects):
    points = [o.matrix_world @ Vector(c) for o in objects if o.type == 'MESH' for c in o.bound_box]
    if not points:
        raise RuntimeError("No imported mesh bounds")
    return Vector(tuple(min(p[i] for p in points) for i in range(3))), Vector(tuple(max(p[i] for p in points) for i in range(3)))


# Actual BSP world geometry, in original coordinates converted to metres.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Firing range - BSP geometry proof"
stem = "mp_rr_canyonlands_staging_mu1"
folder = WORK / "map-data/wrap/maps"
header = (folder / f"{stem}.bsp").read_bytes()
report["bsp_version"] = struct.unpack_from('<H', header, 4)[0] if header[:4] == b"rBSP" else None
report["geometry_source"] = "RSX exported client binary lumps (main .bsp export contains OBJ text)"


def lump(i):
    sidecar = folder / f"{stem}.bsp.{i:04X}.client.bsp_lump"
    if sidecar.exists():
        return sidecar.read_bytes()
    if header[:4] != b"rBSP":
        return b''
    offset, size, version, unused = struct.unpack_from('<4i', header, 16 + i * 16)
    if size == 0:
        return b''
    if offset < 0 or offset + size > len(header):
        raise ValueError(f"Missing lump {i:04x}")
    return header[offset:offset+size]


positions = list(struct.iter_unpack('<3f', lump(3)))
indices_data = lump(79)
indices = struct.unpack('<' + 'H' * (len(indices_data)//2), indices_data)
meshes = lump(80)
sorts = lump(82)
world = struct.unpack_from('<6f2i', lump(14))
first_mesh, mesh_count = world[6:8]
assert len(meshes) % 28 == 0 and len(sorts) % 12 == 0
assert 0 <= first_mesh < first_mesh + mesh_count <= len(meshes)//28
vertex_types = {0x000: (72, 20), 0x200: (73, 32), 0x400: (71, 20), 0x600: (74, 24)}
vertex_data = {i: lump(i) for i, stride in vertex_types.values()}
faces = []
skipped_tools = {}
texdata, texnames = lump(2), lump(15)
for mesh_id in range(first_mesh, first_mesh + mesh_count):
    start = mesh_id * 28
    first_index, triangles = struct.unpack_from('<IH', meshes, start)
    sort_id, flags = struct.unpack_from('<HI', meshes, start + 22)
    assert sort_id < len(sorts)//12
    tex_id = struct.unpack_from('<h', sorts, sort_id * 12)[0]
    name_offset = struct.unpack_from('<i', texdata, tex_id * 16)[0]
    mat_name = texnames[name_offset:].split(b'\0', 1)[0].decode('utf-8')
    if mat_name.upper().startswith('TOOLS\\'):
        skipped_tools[mat_name] = skipped_tools.get(mat_name, 0) + triangles
        continue
    first_vertex = struct.unpack_from('<i', sorts, sort_id * 12 + 8)[0]
    lump_id, stride = vertex_types[flags & 0x600]
    stream = vertex_data[lump_id]
    assert first_index + triangles * 3 <= len(indices)
    for t in range(triangles):
        face = []
        for j in range(3):
            vi = indices[first_index+t*3+j] + first_vertex
            assert 0 <= vi * stride <= len(stream)-stride
            pi = struct.unpack_from('<I', stream, vi * stride)[0]
            assert pi < len(positions)
            face.append(pi)
        if len(set(face)) == 3 and all(math.isfinite(c) for pi in face for c in positions[pi]):
            faces.append(tuple(face))
used = sorted({v for f in faces for v in f})
report['nonvisual_tool_surfaces_excluded'] = skipped_tools
remap = {old: new for new, old in enumerate(used)}
verts = [tuple(c * SCALE for c in positions[i]) for i in used]
mesh = bpy.data.meshes.new("BSP_world_original_geometry")
mesh.from_pydata(verts, [], [tuple(remap[v] for v in f) for f in faces])
mesh.update()
report['world_mesh_repaired'] = mesh.validate(verbose=False)
assert not mesh.validate(verbose=False)
obj = bpy.data.objects.new("FiringRange_BSP_World", mesh)
scene.collection.objects.link(obj)
obj["source"] = stem
obj["scope"] = "World BSP only; static props and original world materials pending"
obj.data.materials.append(material("Diagnostic sand - NOT original material", (0.48, 0.34, 0.20)))
report["world"] = {"vertices": len(mesh.vertices), "triangles": len(mesh.polygons), "mesh_records": mesh_count}
lo, hi = bounds([obj])
report["world"]["bounds_m"] = [list(lo), list(hi)]
# Frame the dense playable-area geometry, keeping outlying geometry in the file.
axis_values = [sorted(v[i] for v in verts) for i in range(3)]
focus_lo = Vector([a[int(len(a)*0.02)] for a in axis_values])
focus_hi = Vector([a[int(len(a)*0.98)] for a in axis_values])
report['world']['preview_focus_bounds_m'] = [list(focus_lo), list(focus_hi)]
camera_for(scene, focus_lo, focus_hi)
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.background_type = 'WORLD'
scene.world = bpy.data.worlds.new("Neutral")
scene.world.color = (0.05, 0.06, 0.08)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "firing_range_geometry.blend"))
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=str(OUT / "firing_range_geometry.glb"), use_selection=True, export_format='GLB')
scene.render.filepath = str(OUT / 'world_geometry.png')
scene.render.image_settings.file_format = 'PNG'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.world.use_nodes = True
next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (0.5, 0.5, 0.5, 1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "firing_range_geometry.blend"))
bpy.ops.render.render(write_still=True)

# Separate textured asset gallery. Never present this as original map placement.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Firing range - imported asset gallery"
plugin_dir = WORK / "python/io_scene_cast"
plugin_dir.mkdir(parents=True, exist_ok=True)
for source in (WORK / "cast/plugins/blender").glob('*.py'):
    shutil.copy2(source, plugin_dir / source.name)
shutil.copy2(WORK / "cast/libraries/python/cast.py", plugin_dir / "cast.py")
sys.path.insert(0, str(plugin_dir.parent))
import io_scene_cast
io_scene_cast.register()
assets = sorted((WORK / "sample").rglob('*_LOD0.cast'))
for number, path in enumerate(assets):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.cast(filepath=str(path), import_skin=False, import_ik=False, import_constraints=False)
    added = list(set(bpy.data.objects) - before)
    geometry = [o for o in added if o.type == 'MESH']
    if not geometry:
        raise RuntimeError(f"CAST import produced no geometry: {path.name}")
    parent = bpy.data.objects.new(path.stem, None)
    scene.collection.objects.link(parent)
    for o in added:
        if o.parent is None:
            o.parent = parent
    parent.scale = (SCALE,) * 3
    bpy.context.view_layer.update()
    lo, hi = bounds(geometry)
    parent.location = Vector(((number % 5) * 22, (number // 5) * 22, 0)) - Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))
    bpy.context.view_layer.update()
    report["models"].append({"file": str(path.relative_to(WORK)), "meshes": len(geometry),
                             "vertices": sum(len(o.data.vertices) for o in geometry),
                             "polygons": sum(len(o.data.polygons) for o in geometry)})
    print(f"IMPORTED {number+1}/{len(assets)} {path.name}", flush=True)
texture_files = {p.name.lower(): p for p in sorted((WORK / 'sample').rglob('*.png'))}
report['material_links'] = []
report['materials_without_color_texture'] = []
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if shader is None:
        continue
    color_path = texture_files.get((mat.name + '_col.png').lower())
    if color_path is None:
        report['materials_without_color_texture'].append(mat.name)
        continue
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(str(color_path), check_existing=True)
    mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = 0.65
    report['material_links'].append({'material': mat.name, 'color': str(color_path.relative_to(WORK))})
meshes_all = [o for o in scene.objects if o.type == 'MESH']
lo, hi = bounds(meshes_all)
camera_for(scene, lo, hi)
sun = bpy.data.objects.new('Preview sun', bpy.data.lights.new('Preview sun', 'SUN'))
sun.data.energy = 3
sun.rotation_euler = (0.45, -0.5, -0.4)
scene.collection.objects.link(sun)
scene.world = bpy.data.worlds.new("Studio world")
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (0.22, 0.26, 0.33, 1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value = 0.5
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 12
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT / 'asset_gallery.png')
images = [im for im in bpy.data.images if im.source == 'FILE']
report['textures'] = {'loaded': len(images), 'missing': [im.filepath for im in images if not Path(bpy.path.abspath(im.filepath)).exists()]}
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'firing_range_asset_gallery.blend'))
report['status'] = 'imported'
(OUT / 'import_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
bpy.ops.render.render(write_still=True)
report['status'] = 'rendered'
(OUT / 'import_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report), flush=True)
