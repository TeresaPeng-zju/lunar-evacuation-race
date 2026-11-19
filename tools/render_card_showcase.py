"""Render a physical double-sided card flip, throw and meteor impact in Blender."""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/lunar-models.blend'))
source=bpy.context.scene
scene=bpy.data.scenes.new('Card cast • cinematic preview')
bpy.context.window.scene=scene
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=720;scene.render.resolution_y=480;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=False
scene.render.fps=20;scene.frame_start=1;scene.frame_end=90
scene.world=bpy.data.worlds.new('Space ambient');scene.world.use_nodes=True
scene.world.node_tree.nodes.clear();wn=scene.world.node_tree.nodes.new('ShaderNodeBackground');wn.inputs['Color'].default_value=(.05,.07,.1,1);wn.inputs['Strength'].default_value=.3
wo=scene.world.node_tree.nodes.new('ShaderNodeOutputWorld');scene.world.node_tree.links.new(wn.outputs[0],wo.inputs[0])
scene.view_settings.view_transform='AgX'

def material(name,col,metal=0,rough=.5,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 p.inputs['Emission Color'].default_value=(*col,1);p.inputs['Emission Strength'].default_value=emit
 o=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs[0],o.inputs[0]);return m

def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def empty(name,loc=(0,0,0)):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=loc;return o

def instance(col,name,loc,scale):
 root=empty(name,loc);root.scale=(scale,)*3
 for obj in bpy.data.collections[col].objects:
  o=obj.copy();o.data=obj.data;scene.collection.objects.link(o);o.parent=root;o.hide_render=False;o.hide_viewport=False
 return root

# Ground mesh and a real model establish a consistent lunar environment.
bpy.ops.mesh.primitive_plane_add(size=35);ground=bpy.context.object
reg=material('Ground charcoal',(.09,.11,.13),.1,.95)
p=next(n for n in reg.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
n=reg.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=38;n.inputs['Detail'].default_value=5
b=reg.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.7;b.inputs['Distance'].default_value=.15;reg.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);reg.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal']);ground.data.materials.append(reg)
random.seed(23)
for i in range(42):
 x=random.uniform(-7,7);y=random.uniform(-1,6)
 if abs(x)<2.6 and y<3:continue
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.04,.22),location=(x,y,.04));bpy.context.object.data.materials.append(bpy.data.materials['Basalt regolith'])
lander=instance('01 • Evacuation lander','Lander at escape platform',(4,3,0),.65)
rover=instance('rover-blue','Blue rover',(-3.5,1.5,0),.6)
# Physical parallel wheel paths across the floor.
line=material('Lane rim',(.26,.33,.36),.3,.7)
for y in [.65,1.15]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,y,.009));o=bpy.context.object;o.scale=(12,.025,.01);o.data.materials.append(line)
for x in [-5,-3,-1,1,3,5]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,.9,.012));o=bpy.context.object;o.scale=(.5,.018,.01);o.data.materials.append(line)

bpy.ops.object.camera_add(location=(0,-11,9));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=10.5;look(camera,(0,.7,.6));scene.camera=camera
for loc,power,size,col in [((-4,-4,8),1100,6,(.7,.83,1)),((5,4,7),1500,5,(.22,.5,1)),((-2,4,5),900,4,(1,.63,.28))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=col;look(o,(0,0,1))

# Both faces use precise UV regions of the user's reference image.
image=bpy.data.images.load(str(ROOT/'dist/assets/card-reference.png'))
def card_face(name,x0,back=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.clear()
 p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=.48;p.inputs['Metallic'].default_value=.15
 tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear';m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);m.node_tree.links.new(tex.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.35
 out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs[0],out.inputs[0])
 w=2.35;h=w*777/518
 vertices=[(-w/2,-h/2,0),(w/2,-h/2,0),(w/2,h/2,0),(-w/2,h/2,0)]
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],[(0,1,2,3)]);me.update();ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.data.materials.append(m)
 uv=me.uv_layers.new(name='Exact supplied artwork crop');xmin=x0/1752;xmax=(x0+518)/1752;ymin=1-(171+777)/1024;ymax=1-171/1024
 for i,coord in enumerate([(xmin,ymin),(xmax,ymin),(xmax,ymax),(xmin,ymax)]):uv.data[i].uv=coord
 ob.location.z=-.012 if back else .012
 if back:ob.rotation_euler.y=math.pi
 return ob

root=empty('CARD • movement');root.rotation_euler=camera.rotation_euler
flip=empty('CARD • flip');flip.parent=root
front=card_face('Front • 落石',161);front.parent=flip
back=card_face('Back • 月球撤离赛',1005,True);back.parent=flip
# Thin beveled card edge with an actual physical thickness.
bpy.ops.mesh.primitive_cube_add(size=1);edge=bpy.context.object;edge.name='Machined card edge';edge.scale=(2.35,3.525,.02);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);edge.data.materials.append(material('Card titanium rim',(.18,.25,.3),.85,.3));edge.parent=flip
mod=edge.modifiers.new('Soft edge','BEVEL');mod.width=.035;mod.segments=3
for frame,loc,scale in [(1,(-2,-1.8,1.8),.7),(7,(-.7,-1.2,2.1),1),(25,(-.7,-1.2,2.1),1),(31,(.6,-.3,3.2),.75),(39,(2,.9,.18),.055),(42,(2,.9,.1),.001)]:
 root.location=loc;root.scale=(scale,)*3;root.keyframe_insert(data_path='location',frame=frame);root.keyframe_insert(data_path='scale',frame=frame)
for frame,angle in [(1,math.pi),(8,math.pi),(21,0),(26,0),(39,-.6)]:
 flip.rotation_euler=(0,angle,0);flip.keyframe_insert(data_path='rotation_euler',frame=frame)
meteor=instance('03 • Fractured meteorite','METEOR • impact',(2,.9,7),.001)
for frame,loc,scale in [(1,(2,.9,7),.001),(31,(.7,.9,6),.001),(33,(1,.9,5.5),.62),(40,(2,.9,.2),.62),(90,(2,.9,.2),.62)]:
 meteor.location=loc;meteor.scale=(scale,)*3;meteor.keyframe_insert(data_path='location',frame=frame);meteor.keyframe_insert(data_path='scale',frame=frame)
for f,rot in [(31,(0,0,0)),(40,(.4,-.6,1.4))]:meteor.rotation_euler=rot;meteor.keyframe_insert(data_path='rotation_euler',frame=f)
# Emissive shockwave rings and physically scattered debris.
ringmat=material('Impact ring',(.8,.43,.14),.3,.6,1.4)
for j in range(2):
 bpy.ops.mesh.primitive_torus_add(major_radius=1,minor_radius=.018,major_segments=64,minor_segments=8,location=(2,.9,.045+j*.01));o=bpy.context.object;o.data.materials.append(ringmat)
 for f,scale in [(1,.001),(39+j*2,.001),(43+j*2,.7),(55+j*2,2.2),(64+j*2,.001),(90,.001)]:o.scale=(scale,scale,scale);o.keyframe_insert(data_path='scale',frame=f)
for i in range(22):
 angle=i*2.39996;dist=random.uniform(.6,1.8)
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.025,.1));o=bpy.context.object;o.data.materials.append(bpy.data.materials['Basalt regolith'])
 for f,loc,scale in [(1,(2,.9,0),.001),(39,(2,.9,.1),.001),(42,(2+math.cos(angle)*.3,.9+math.sin(angle)*.3,.6),1),(51,(2+math.cos(angle)*dist,.9+math.sin(angle)*dist,.05),1),(90,(2+math.cos(angle)*dist,.9+math.sin(angle)*dist,.05),1)]:o.location=loc;o.scale=(scale,)*3;o.keyframe_insert(data_path='location',frame=f);o.keyframe_insert(data_path='scale',frame=f)
# Amber point-light flash, short enough to preserve the card reveal.
bpy.ops.object.light_add(type='POINT',location=(2,.9,1));flash=bpy.context.object;flash.data.color=(1,.5,.12);flash.data.shadow_soft_size=1
for f,e in [(1,0),(39,0),(41,250),(46,0),(90,0)]:flash.data.energy=e;flash.data.keyframe_insert(data_path='energy',frame=f)
scene.frame_set(20)
# Pack the exact card texture into the editable animation source.
image.pack();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/card-cast.blend'))
scene.render.filepath=str(ROOT/'work/blender-frames/card-')
bpy.ops.render.render(animation=True)
print('CARD_ANIMATION_COMPLETE',flush=True)
