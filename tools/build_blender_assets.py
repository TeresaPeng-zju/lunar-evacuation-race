"""Build editable lunar game models, transparent sprites and a card FX showcase.
Run: Blender --background --python tools/build_blender_assets.py -- [sprites|gif]
"""
import bpy, math, random, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/assets'; ART=ROOT/'art'
random.seed(17)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=20
scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.world.color=(.18,.2,.23)
scene.view_settings.view_transform='AgX'

def mat(name,color,metal=.0,rough=.5,glow=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if glow:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=glow
 return m
silver=mat('Brushed titanium',(.45,.49,.51),.8,.32);ivory=mat('Ceramic shell',(.69,.72,.69),.5,.38)
dark=mat('Carbon graphite',(.035,.045,.058),.65,.42);rubber=mat('Tread rubber',(.019,.025,.031),.1,.78)
glass=mat('Cockpit blue glass',(.018,.1,.15),.85,.18);gold=mat('Thermal copper',(.58,.28,.08),.8,.35)
blue=mat('Blue navigation lights',(.08,.65,1),.3,.24,3);amber=mat('Amber navigation lights',(1,.55,.07),.3,.24,3)
white=mat('Headlamps',(.75,.93,1),.2,.1,5);stone=mat('Basalt regolith',(.15,.17,.19),.15,.95)
p=next(n for n in stone.node_tree.nodes if n.type=='BSDF_PRINCIPLED');noise=stone.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=19;noise.inputs['Detail'].default_value=4
bump=stone.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.5;bump.inputs['Distance'].default_value=.16
stone.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);stone.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
active=None

def finish(o,name,material,bevel=0):
 o.name=name
 if material:o.data.materials.append(material)
 if bevel:
  mod=o.modifiers.new('Machined edge bevel','BEVEL');mod.width=bevel;mod.segments=3
  o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 if active:
  for c in list(o.users_collection):c.objects.unlink(o)
  active.objects.link(o)
 return o

def box(name,loc,scale,material,bevel=.05):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,material,bevel)

def cyl(name,loc,r,depth,material,vertices=24,rotation=(0,0,0),r2=None):
 if r2 is None:bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc,rotation=rotation)
 else:bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r2,depth=depth,location=loc,rotation=rotation)
 return finish(bpy.context.object,name,material,.025)

def rod(name,a,b,r,material):
 d=Vector(b)-Vector(a);o=cyl(name,(Vector(a)+Vector(b))/2,r,d.length,material,12);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o

def mesh(name,verts,faces,material):
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);return finish(o,name,material,.035)

def collection(name):
 global active
 active=bpy.data.collections.new(name);scene.collection.children.link(active);return active

ship=collection('01 • Evacuation lander')
# A compact vertical launch shuttle with panelled hull, outriggers and engine bells.
cyl('Main pressure hull',(0,0,1.5),.7,2.3,ivory,32)
cyl('Tapered nose',(0,0,3.05),.7,.8,silver,32,r2=.2)
cyl('Nose cap',(0,0,3.48),.2,.12,dark,24,r2=.08)
cyl('Engine skirt',(0,0,.35),.75,.35,dark,32,r2=.62)
for z in [.6,1.1,1.6,2.15,2.65]:cyl('Hull seam',(0,0,z),.712,.035,silver,32)
for a in range(0,360,90):
 t=math.radians(a);x,y=math.cos(t),math.sin(t)
 panel=box('Hull armor panel',(x*.69,y*.69,1.65),(.28,.07,1.55),silver,.025);panel.rotation_euler.z=t-math.pi/2
 rod('Landing strut',(x*.6,y*.6,1.3),(x*1.2,y*1.2,.08),.065,silver)
 box('Landing foot',(x*1.2,y*1.2,.02),(.48,.48,.1),dark)
 cyl('Engine bell',(x*.36,y*.36,.1),.21,.45,gold,20,r2=.12)
 cyl('Engine core',(x*.36,y*.36,-.13),.14,.035,blue,20)
for side in [-1,1]:
 mesh('Stabilizer fin',[(side*.55,-.12,.45),(side*1.4,-.12,.2),(side*1.3,-.12,.7),(side*.6,-.12,1.7),(side*.55,.12,.45),(side*1.4,.12,.2),(side*1.3,.12,.7),(side*.6,.12,1.7)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3)],silver)
 box('Front cockpit',(side*.29,-.64,2.35),(.39,.12,.48),glass)
 box('Ship status lamp',(side*.53,-.5,1.1),(.12,.1,.35),blue,.015)

rovers=[]
for name,color in [('rover-blue',blue),('rover-gold',amber)]:
 col=collection(name);rovers.append(col)
 box('Rover chassis',(0,0,.5),(1.7,1.2,.35),dark)
 box('Science deck',(-.1,0,.79),(1.45,1.03,.3),ivory)
 box('Battery module',(-.55,0,1.01),(.5,.8,.18),gold)
 box('Sensor windshield',(.45,0,.99),(.48,.78,.15),glass)
 box('Color stripe',(-.05,0,.96),(.14,1.04,.06),color,.01)
 for x in [-.65,0,.65]:
  for side in [-1,1]:
   y=side*.79;cyl('Wheel',(x,y,.38),.34,.27,rubber,24,(math.pi/2,0,0))
   cyl('Wheel hub',(x,y+side*.15,.38),.18,.03,silver,20,(math.pi/2,0,0))
   for a in range(0,360,30):
    t=math.radians(a);o=box('Tread block',(x+math.sin(t)*.34,y,.38+math.cos(t)*.34),(.12,.29,.08),dark,.01);o.rotation_euler.y=t
   rod('Suspension',(-.2,y*.7,.65),(x,y,.38),.04,silver)
 for y in [-.4,.4]:box('Rover headlamp',(.82,y,.72),(.08,.17,.12),white,.015)
 rod('Mast',(-.25,.27,.95),(-.25,.27,1.65),.045,silver)
 box('Stereo camera',(-.2,.27,1.66),(.25,.42,.18),dark)
 for y in [.14,.38]:cyl('Camera eye',(-.06,y,1.66),.06,.03,blue,12,(0,math.pi/2,0))
 rod('Antenna',(-.6,-.3,1.05),(-.75,-.3,1.8),.018,silver)

rock=collection('03 • Fractured meteorite')
for i,(loc,scale) in enumerate([((0,0,.5),(1.25,1,.95)),((.75,.35,.2),(.55,.6,.5)),((-.6,-.6,.12),(.4,.35,.35))]):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc);o=bpy.context.object
 for v in o.data.vertices:v.co*=random.uniform(.82,1.14)
 o.scale=scale;finish(o,'Fractured basalt '+str(i),stone)

active=None
bpy.ops.object.camera_add(location=(0,-4,13));camera=bpy.context.object;camera.name='Orthographic sprite camera';scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=4.3

def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
look(camera,(0,0,1))
for name,loc,power,size,col in [('Key',(-4,-5,9),1000,5,(.8,.88,1)),('Rim',(5,3,7),1300,4,(.3,.6,1)),('Fill',(-3,4,4),700,4,(1,.7,.4))]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.name=name;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.data.color=col;look(l,(0,0,.6))

assets=[(ship,'lander',5.1),(rovers[0],'rover-blue',3.2),(rovers[1],'rover-gold',3.2),(rock,'meteorite',3.8)]
for c,name,size in assets:
 for other,_,_ in assets:other.hide_render=other!=c
 bpy.ops.object.select_all(action='DESELECT')
 for o in c.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=list(c.objects)[0]
 bpy.ops.export_scene.gltf(filepath=str(OUT/'models'/f'{name}.glb'),export_format='GLB',use_selection=True)
 if name.startswith('rover'):
  camera.location=(0,-3,12);look(camera,(0,0,.45));camera.data.ortho_scale=size
 else:
  camera.location=(0,-8,12);look(camera,(0,0,1 if name=='lander' else .3));camera.data.ortho_scale=size
 scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
for c,_,_ in assets:
 c.hide_render=c!=ship
 c.hide_viewport=c!=ship
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'lunar-models.blend'))
print('MODEL_SPRITES_COMPLETE',flush=True)
