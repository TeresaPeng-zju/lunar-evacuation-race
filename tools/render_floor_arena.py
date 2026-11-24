"""Bake orthographic physical arena plates from existing GLBs/PBR. Overlay remains in cm.
Each stage is a complete two-lane scene; runtime crops each robot's half independently.
"""
import bpy, math, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'dist/assets/floor-arena';A=R/'art/floor-arena'
S=json.loads((O/'layout.json').read_text());bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;bpy.context.preferences.filepaths.save_version=0
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=3840;scene.render.resolution_y=2158;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.world=bpy.data.worlds.new('Lunar ambient');scene.world.use_nodes=True;next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.28,.34,.46,1);next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs[1].default_value=.45
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.65
camdata=bpy.data.cameras.new('Physical orthographic 59.8 x 33.6 cm');cam=bpy.data.objects.new('CAM_PHYSICAL_TOP',camdata);scene.collection.objects.link(cam)
cam.location=(29.9,-16.8,80);camdata.type='ORTHO';camdata.ortho_scale=59.8;scene.camera=cam
light=bpy.data.lights.new('Low directional sun','SUN');light.energy=3.0;light.color=(1,.78,.55);light.angle=.065;o=bpy.data.objects.new('Low directional sun',light);scene.collection.objects.link(o);o.rotation_euler=Vector((55,-80,-72)).to_track_quat('-Z','Y').to_euler()

def pnode(m):return next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
def mat(name,color,metal=0,rough=.85):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=pnode(m);p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
soil=mat('Moon04 / neutral regolith',(.12,.14,.17));nodes=soil.node_tree.nodes;links=soil.node_tree.links;p=pnode(soil)
texcoord=nodes.new('ShaderNodeTexCoord');scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=1/3.6;links.new(texcoord.outputs['Generated'],scale.inputs[0])
# UV is in actual board units; reused regolith detail repeats every 12 cm.
for key,socket in [('diff','Base Color'),('rough','Roughness'),('nor_gl','Normal')]:
 path=R/'art/reference-library/textures/regolith.jpg' if key=='diff' else R/'art/visual-sample/source-textures'/f'moon_04_{key}_2k.jpg'
 n=nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(path),check_existing=True)
 links.new(texcoord.outputs['UV'],n.inputs['Vector'])
 if key=='diff':
  bw=nodes.new('ShaderNodeRGBToBW');links.new(n.outputs['Color'],bw.inputs[0]);ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.06;ramp.color_ramp.elements[0].color=(.055,.052,.05,1);ramp.color_ramp.elements[1].position=.7;ramp.color_ramp.elements[1].color=(.32,.30,.28,1);links.new(bw.outputs[0],ramp.inputs[0]);links.new(ramp.outputs[0],p.inputs[socket])
 elif key=='nor_gl':
  n.image.colorspace_settings.name='Non-Color';nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.75;links.new(n.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs[0],p.inputs[socket])
 else:n.image.colorspace_settings.name='Non-Color';links.new(n.outputs[0],p.inputs[socket])
metal=mat('Oxidised titanium',(.25,.26,.27),.48,.65);dark=mat('Worn basalt',(.12,.12,.115),0,.94)
# Fine regolith bump complements the existing normal map.
detail=nodes.new('ShaderNodeTexImage');detail.image=bpy.data.images.load(str(R/'art/reference-library/textures/regolith.jpg'),check_existing=True);links.new(texcoord.outputs['UV'],detail.inputs['Vector'])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.12;links.new(detail.outputs['Color'],bump.inputs['Height']);links.new(nm.outputs[0],bump.inputs['Normal']);links.new(bump.outputs[0],p.inputs['Normal'])
# Cache actual asset meshes; copy shared mesh data with their original PBR materials.
cache={}
def asset(filename, collection, name, x,y,size,rotation=0,z=0):
 if filename in ['reference-models/research-station.glb','reference-models/outpost-pod.glb']:
  filename='production/research-station.glb'
 if filename not in cache:
  before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(R/'dist/assets'/filename));objs=set(scene.objects)-before;meshes=[o for o in objs if o.type=='MESH'];bpy.context.view_layer.update()
  coords=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box];lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)));center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));scale=size/max(hi.x-lo.x,hi.y-lo.y)
  parts=[]
  for o in meshes:
   data=o.data.copy();mw=o.matrix_world.copy()
   for v in data.vertices:v.co=(mw@v.co-center)*scale
   parts.append(data)
  cache[filename]=(size,parts)
  for o in objs:bpy.data.objects.remove(o,do_unlink=True)
 base,parts=cache[filename];group=bpy.data.objects.new(name,None);collection.objects.link(group);group.location=(x,-y,z);group.rotation_euler.z=rotation;group.scale=(size/base,)*3
 for i,data in enumerate(parts):
  ob=bpy.data.objects.new(name+'_'+str(i),data);collection.objects.link(ob);ob.parent=group
 return group

def box(coll,name,pos,dim,material):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(pos[0],-pos[1],pos[2]));o=bpy.context.object;o.name=name;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for c in list(o.users_collection):c.objects.unlink(o)
 coll.objects.link(o);o.data.materials.append(material);mod=o.modifiers.new('Machined edge','BEVEL');mod.width=.06;mod.segments=2;return o

def distance(stage,xy):
 out=np.full(len(xy),100.)
 for r in S['routes']:
  if r['stage_id']!=stage:continue
  # Control vertices plus exact arc samples: no alternate route invented here.
  pts=np.array([[v['x_cm'],v['y_cm']] for v in r['waypoints_cm'][::5]]+[[r['stop_pose_cm']['x_cm'],r['stop_pose_cm']['y_cm']]])
  for a,b in zip(pts,pts[1:]):
   v=b-a;l=(v*v).sum()
   if l<1e-12:continue
   t=np.clip(((xy-a)*v).sum(axis=1)/l,0,1);out=np.minimum(out,np.linalg.norm(xy-a-t[:,None]*v,axis=1))
 return out
collections=[]
for stage in [1,2,3]:
 c=bpy.data.collections.new(f'STAGE_{stage}_PHYSICAL_ARENA');scene.collection.children.link(c);collections.append(c)
 # Sculpted terrain at borders and in non-driving islands; drivable surface stays planar.
 nx,ny=401,225;x=np.linspace(0,59.8,nx);y=np.linspace(0,33.6,ny);xx,yy=np.meshgrid(x,y);xy=np.column_stack([xx.ravel(),yy.ravel()]);d=distance(stage,xy);local=xy[:,1]%16.8
 h=.04*np.sin(xy[:,0]*2.3)*np.sin(xy[:,1]*1.8)
 for cy in [8.4,25.2]:
  for cx,off,r in ([(5,-6,2.4),(31,6.3,2.8),(56,-6,2)] if stage==1 else [(7,-5,3),(29,-5.8,3.4),(46,5.7,2.9)] if stage==2 else [(7,0,6),(40,-6,3),(47,6.2,3.1)]):
   rr=np.hypot(xy[:,0]-cx,xy[:,1]-(cy+off));h+=.65*np.exp(-((rr-r)/.6)**2)-.4*np.exp(-(rr/(r*.75))**4)
 # Sharpen existing border forms into short benches; leave the same driving mask.
 f=np.abs(h)/.28;level=np.floor(f);u=np.clip((f-level-.16)/.68,0,1)
 h=np.sign(h)*(level+u*u*(3-2*u))*.28
 margin=np.minimum(local,16.8-local);h+=np.exp(-((margin-.4)/.7)**2)*(.4+.15*np.sin(xy[:,0]*.8))
 t=np.clip((d-3.7)/1.3,0,1);h*=t*t*(3-2*t)
 # Fine impact scars are printed surface detail, not physical obstacles.
 # Their size stays below 0.4 cm and they fade on the actual center paths.
 rng=np.random.default_rng(320+stage)
 for k in range(160):
  cx,yy0=rng.uniform(.5,59.3),rng.uniform(.4,33.2);radius=rng.uniform(.10,.35)
  rr=np.hypot(xy[:,0]-cx,xy[:,1]-yy0)
  h+=(.045*np.exp(-((rr-radius)/.085)**2)-.035*np.exp(-(rr/(radius*.7))**4))*np.clip((d-2.8)/.6,0,1)

 verts=[(a,-b,float(z)) for (a,b),z in zip(xy,h)];faces=[]
 for j in range(ny-1):
  for i in range(nx-1):k=j*nx+i;faces.append((k,k+nx,k+nx+1,k+1))
 me=bpy.data.meshes.new(f'Regolith {stage}');me.from_pydata(verts,[],faces);me.materials.append(soil);ob=bpy.data.objects.new(f'Regolith {stage}',me);c.objects.link(ob)
 uv=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  poly.use_smooth=True
  for li in poly.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v.x/12,v.y/12)
 # Plate finish is in image-space overlay; no widened debug envelopes are baked.
 for id,cy in enumerate([8.4,25.2]):
  base=cy-8.4;flip=-1 if id else 1
  if stage==1:
   placements=[('research-station',5.6,1.9,4.3),('supply-station',32,1.2,2.4),('arc-towers',40,15.3,2.5),('crashed-ship',17,15.2,2.8),('outpost-pod',56.6,1.6,3.1)]
   asset('reference-models/beacon-1.glb',c,f'beacon_{id}',15,base+1.35,2.4)
   # Existing gate's structural vocabulary, positioned at the canonical x=21 crossing.
   for yy in [1.85,8.95]:box(c,'Gate pylon',(21,base+yy,.5),(1.0,.75,1.0),metal)
   # Movable gate panels are runtime overlays; never bake a closed barrier.
  elif stage==2:
   placements=[('central-ruin',28,2.5,5.4),('helium-extractor',8,13.9,4.7),('drilling-platform',40,14.3,4.4),('arc-towers',46,1.9,3.4),('abandoned-camp',17,1.9,3.1),('broken-walkway',28,14.1,4.4)]
  else:
   placements=[('central-ruin',7.4,8.4,10),('research-station',23,1.8,3.4),('arc-towers',34,15.1,2.7),('crystal-mine',41,1.3,2.4)]
   asset('reference-models/landing-pad.glb',c,f'Landing bay_{id}',53.8,base+8.4,10,z=-.06)
   asset('models/lander.glb',c,f'Evacuation ship_{id}',56,base+2.0,4.3,rotation=.6)
  for name,px,py,size in placements:asset('reference-models/'+name+'.glb',c,name+str(id),px,base+py,size,rotation=(.08 if id else -.08))
  # Curated rubble clusters at the sector perimeter, never random full-map scatter.
  for k,(px,py) in enumerate([(2,3.8),(10,.5),(24,15.7),(37,.5),(49,15.8),(58,13.6)]):
   for j in range(3):asset('models/meteorite.glb',c,f'Rubble_{stage}_{id}_{k}_{j}',px+j*.55,base+py+.12*math.sin(j*3),.45+j*.16,rotation=j*1.8,z=.02)
# Match the approved material families without discarding GLB texture connections.
for material in bpy.data.materials:
 if not material.use_nodes:continue
 nodes=material.node_tree.nodes;links=material.node_tree.links
 bs=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
 if not bs:continue
 name=material.name;factor=None
 if name.startswith('Weathered titanium'):factor=(1.9,1.78,1.6);metallic=.48;rough=.61
 elif name.startswith(('Graphite steel','Carbon graphite')):factor=(.15,.17,.2);metallic=.45;rough=.72
 elif name.startswith(('Faded ceramic paint','Ceramic shell')):factor=(.57,.54,.49);metallic=.16;rough=.69
 elif name.startswith('Fractured basalt'):factor=(1.18,1.1,1.02);metallic=0;rough=.96
 if factor:
  if bs.inputs['Base Color'].links:
   original=bs.inputs['Base Color'].links[0].from_socket
   mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*factor,1)
   links.new(original,mix.inputs[1]);links.new(mix.outputs[0],bs.inputs['Base Color'])
  else:bs.inputs['Base Color'].default_value=(*factor,1)
  bs.inputs['Metallic'].default_value=metallic;bs.inputs['Roughness'].default_value=rough
for c in collections:c.hide_render=True
bpy.ops.file.pack_all();collections[0].hide_render=False;bpy.ops.wm.save_as_mainfile(filepath=str(A/'moonfall-physical-arena.blend'))
for i,c in enumerate(collections):
 for other in collections:other.hide_render=other!=c
 scene.render.filepath=str(O/f'stage-{i+1}.png');bpy.ops.render.render(write_still=True);print('FLOOR_PLATE_COMPLETE',i+1,flush=True)
(O/'render-manifest.json').write_text(json.dumps({'art_revision':'moonfall-unified-2026-11-24','source':'Blender Cycles, approved pressure-hull family + existing industrial GLBs + Moon04 PBR','orthographic':True,'board_cm':[59.8,33.6],'resolution':[3840,2158],'stages':3,'map_revision':S['map_revision'],'dynamic_overlay':'canonical centimeter paths, gates, beacon, rock, quake, finish'},indent=2))
