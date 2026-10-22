# v49 re-export an existing gun GLB with Draco compression (names, empties and 'gun:<mat>' materials are kept).
# blender -b --factory-startup -P tools/blender/glb_draco.py -- tools/guns/g36c.glb [out.glb]
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
SRC = os.path.abspath(argv[0]); OUT = os.path.abspath(argv[1] if len(argv) > 1 else argv[0])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
before = os.path.getsize(SRC)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14,
                          export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
print('DRACO', SRC, before, '->', OUT, os.path.getsize(OUT))
