"""Render the reconstructed relic activation from actual geometry, not a sprite layer."""
import bpy, math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];A=R/'art/reference-library';out=R/'work/reference-build/frames';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(A/'moon-map-reconstructed.blend'))
s=bpy.context.scene;s.cycles.samples=12;s.render.resolution_x=640;s.render.resolution_y=512;s.render.resolution_percentage=100
cam=s.camera;cam.data.ortho_scale=21;target=Vector((0,5,.3))
for f in range(1,98,3):
 s.frame_set(f);t=(f-1)/96;angle=-.6+t*.22;cam.location=target+Vector((16*math.cos(angle),16*math.sin(angle),17));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(out/f'{f:03d}.png');bpy.ops.render.render(write_still=True)
print('REFERENCE_ANIMATION_RENDERED',flush=True)
