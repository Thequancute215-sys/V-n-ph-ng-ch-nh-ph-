"""Render GLB bằng Workbench để xem duyệt một vòng xoay, không chạy script trong tài sản."""
import bpy
import json
import math
import sys
from mathutils import Vector
from pathlib import Path

file, out, ratio, seconds = sys.argv[sys.argv.index("--") + 1:]
out = Path(out)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=file)
scene = bpy.context.scene
mesh = [ob for ob in scene.objects if ob.type == "MESH"]
if not mesh:
    raise ValueError("GLB không có mesh")
roots = [ob for ob in scene.objects if ob.parent is None]
for ob in scene.objects:
    ob.animation_data_clear()
bpy.context.view_layer.update()
points = [obj.matrix_world @ Vector(point) for obj in mesh for point in obj.bound_box]
low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
extent = max(high - low)
if not math.isfinite(extent) or extent <= 0:
    raise ValueError("Kích thước mesh không hợp lệ")
base = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))

turn = bpy.data.objects.new("Turntable", None)
scene.collection.objects.link(turn)
turn.scale = (2.5 / extent,) * 3
for ob in roots:
    ob.location -= base
    ob.parent = turn
    if ob.type in {"CAMERA", "LIGHT"}:
        ob.hide_render = True

mat = bpy.data.materials.new("Platform")
mat.diffuse_color = (.07, .14, .19, 1)
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.72, depth=.13, location=(0, 0, -.076))
bpy.context.object.data.materials.append(mat)

cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
scene.collection.objects.link(cam)
cam.location = (1.4, -7.8, 3.65)
cam.rotation_euler = (Vector((0, 0, 1.18)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.type = "ORTHO"
cam.data.ortho_scale = 4.2 if ratio != "9:16" else 6.25
scene.camera = cam

scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.color_type = "MATERIAL"
shading.light = "STUDIO"
shading.show_shadows = True
shading.show_cavity = True
shading.cavity_type = "BOTH"
shading.background_type = "WORLD"
scene.world = bpy.data.worlds.new("Slate")
scene.world.color = (.035, .052, .075)
scene.display.render_aa = "8"
scene.render.resolution_x, scene.render.resolution_y = {"9:16": (540, 960), "16:9": (960, 540), "1:1": (720, 720)}[ratio]
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = str(out / "turn-")
scene.frame_start = 1
scene.frame_end = int(seconds) * scene.render.fps
turn.rotation_mode = "XYZ"
turn.driver_add("rotation_euler", 2).driver.expression = f"(frame - 1) * 6.283185307179586 / {scene.frame_end}"

angles = []
for expected in range(0, 361, 90):
    frame = 1 + scene.frame_end * expected // 360
    scene.frame_set(frame)
    actual = math.degrees(turn.evaluated_get(bpy.context.evaluated_depsgraph_get()).rotation_euler.z)
    if not math.isclose(actual, expected, abs_tol=.02):
        raise ValueError(f"Frame {frame} đạt {actual}°, dự kiến {expected}°")
    angles.append({"frame": frame, "degrees": round(actual, 3)})
(out / "angles.json").write_text(json.dumps(angles), encoding="utf-8")
scene.frame_set(1)
bpy.ops.render.render(animation=True)
