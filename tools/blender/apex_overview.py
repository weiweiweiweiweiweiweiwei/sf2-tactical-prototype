"""Overhead inspection view avoids foreground cliff occlusion."""
import bpy,json
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parents[2]/'tools/out/apex/preview'
bpy.ops.wm.open_mainfile(filepath=str(out/'firing_range_assembled.blend'))
s=bpy.context.scene
r=json.loads((out/'placement_report.json').read_text())
lo,hi=map(Vector,r['bounds_m'])
center=(lo+hi)*0.5
s.camera.location=center+Vector((0,-20,650))
s.camera.rotation_euler=(center-s.camera.location).to_track_quat('-Z','Y').to_euler()
s.camera.data.ortho_scale=420
s.render.resolution_x=1200
s.render.resolution_y=1100
s.cycles.samples=8
s.render.filepath=str(out/'assembled_overview.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_rotation=s.camera.rotation_euler.to_quaternion()
            area.spaces.active.region_3d.view_location=center
            area.spaces.active.region_3d.view_distance=400
bpy.ops.wm.save_as_mainfile(filepath=str(out/'firing_range_assembled.blend'))
bpy.ops.render.render(write_still=True)
