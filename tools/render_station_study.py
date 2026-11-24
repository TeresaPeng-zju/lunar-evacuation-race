"""Fixed-camera Cycles evidence for the maintained LAB_W, same framing as ?inspect=station."""
import bpy,json,math,sys
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[1];O=R.parent/'moonfall-station-study';O.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'art/local-refinement/moonfall-local-refinement.blend'))
sys.path.insert(0,str(R/'tools'));from station_finish import ensure_gltf_group
ensure_gltf_group()
s=bpy.context.scene;bpy.context.preferences.filepaths.save_version=0
for o in list(s.objects):
 if o.type in ['LIGHT','CAMERA']:bpy.data.objects.remove(o,do_unlink=True)
c=json.loads((R/'dist/assets/production/station-camera.json').read_text());data=bpy.data.cameras.new('STATION_MATCHED_CAMERA');cam=bpy.data.objects.new(data.name,data);s.collection.objects.link(cam);cam.location=c['position_blender'];cam.rotation_euler=(Vector(c['target_blender'])-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=c['horizontal_span'];s.camera=cam
s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=True
s.render.resolution_x,s.render.resolution_y=c['resolution'];s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.world=bpy.data.worlds.new('Station comparison ambient');s.world.use_nodes=True;bg=next(n for n in s.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.50,.58,.72,1);bg.inputs[1].default_value=.45
sun=bpy.data.lights.new('Approved low directional sun','SUN');sun.energy=3.4;sun.color=(1,.738,.497);sun.angle=.025;o=bpy.data.objects.new(sun.name,sun);s.collection.objects.link(o);o.location=(-55,80,72);o.rotation_euler=(Vector((0,15,0))-o.location).to_track_quat('-Z','Y').to_euler()
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.16
# Geometry remains fully editable. The AO atlas is exported to glTF, not baked illumination.
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(O/'station-study.blend'))
clay=bpy.data.materials.new('Study neutral clay');clay.use_nodes=True;p=next(n for n in clay.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(.35,.35,.35,1);p.inputs['Roughness'].default_value=.75
s.view_layers[0].material_override=clay;s.render.filepath=str(O/'blender-clay.png');bpy.ops.render.render(write_still=True)
s.view_layers[0].material_override=None;s.render.filepath=str(O/'blender-material-light.png');bpy.ops.render.render(write_still=True)
(O/'camera.json').write_text(json.dumps(c,indent=2))
print('STATION_COMPARISON_RENDERED',flush=True)
