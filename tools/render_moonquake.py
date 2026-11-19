"""Render actual animated fracture geometry from the editable world to GIF frames."""
import bpy,math,random
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'art/lunar-world.blend'))
s=bpy.context.scene;cam=s.camera;target=Vector((24,13.25,0));cam.location=target+Vector((8,-11,10));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=17
s.render.resolution_x=720;s.render.resolution_y=480;s.cycles.samples=12;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.fps=25
# The severed shortcut is a solid deck that sinks with the rupture.
o=bpy.data.objects['road_0_stable'];o.keyframe_insert(data_path='location',frame=35);o.location.z-=1.5;o.keyframe_insert(data_path='location',frame=64)
stone=bpy.data.materials['Fractured basalt'];random.seed(92)
for i in range(28):
 a=random.random()*math.tau;bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.05,.14),location=(24+random.uniform(-.2,.2),13.25+random.uniform(-4,4),-.05));o=bpy.context.object;o.name='Quake ejecta';o.data.materials.append(stone);base=o.location.copy();o.scale=(0,0,0);o.keyframe_insert(data_path='scale',frame=20);o.keyframe_insert(data_path='location',frame=20);o.scale=(1,1,1);o.location=base+Vector((math.cos(a)*.5,math.sin(a)*.5,1));o.keyframe_insert(data_path='scale',frame=35);o.keyframe_insert(data_path='location',frame=35);o.location=base+Vector((math.cos(a)*1.8,math.sin(a)*1.8,-.1));o.keyframe_insert(data_path='location',frame=65)
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/moonquake.blend'))
out=R/'work/quake-frames';out.mkdir(exist_ok=True)
for f in range(1,101,2):
 s.frame_set(f);s.render.filepath=str(out/f'quake-{f:04d}.png');bpy.ops.render.render(write_still=True)
print('MOONQUAKE_FRAMES_COMPLETE')
