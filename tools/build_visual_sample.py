"""Blender authoring pass: reuse four existing GLBs; never regenerate their models.
Run with Blender --background --python tools/build_visual_sample.py.
The derived terrain has one unique material atlas and an unchanged route centerline.
"""
import bpy, bmesh, math, json, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/assets/visual-sample'; ART=ROOT/'art/visual-sample'
OUT.mkdir(parents=True,exist_ok=True); ART.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
S=bpy.context.scene; S.frame_set(1)
sources=['dist/assets/reference-models/terrain.glb','dist/assets/reference-models/research-station.glb','dist/assets/reference-models/beacon-1.glb','dist/assets/models/science-rover-blue.glb']
route=np.array([[-13.,0.],[-5.,0.],[5.,0.],[9.,0.],[12.,5.],[13.5,5.],[16.5,.5]])

def route_dist(x,z):
 d=np.full(np.broadcast_shapes(np.shape(x),np.shape(z)),1e5,dtype=np.float32)
 for a,b in zip(route[:-1],route[1:]):
  v=b-a; t=np.clip(((x-a[0])*v[0]+(z-a[1])*v[1])/np.dot(v,v),0,1)
  d=np.minimum(d,np.sqrt((x-a[0]-t*v[0])**2+(z-a[1]-t*v[1])**2))
 return d

def imported(path):
 before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(ROOT/path))
 return list(set(bpy.data.objects)-before)

terrain=next(o for o in imported(sources[0]) if o.type=='MESH')
bpy.context.view_layer.objects.active=terrain; terrain.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new(); bm.from_mesh(terrain.data)
# Crop an existing unbroken part of the library's lunar surface. No mesh generation.
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not(-40<=v.co.x<=-8 and -25<=v.co.y<=3)],context='VERTS')
for v in bm.verts: v.co.x+=24; v.co.y+=11; v.co.z+=.18
# Imported glTF splits vertices at UV seams. Weld only co-located vertices.
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
rock_faces=[f for f in bm.faces if f.material_index==1]
rock_verts={v for f in rock_faces for v in f.verts}; seen=set(); remove=[]
for v in rock_verts:
 if v in seen: continue
 stack=[v]; island=[]; seen.add(v)
 while stack:
  a=stack.pop(); island.append(a)
  for edge in a.link_edges:
   b=edge.other_vert(a)
   if b in rock_verts and b not in seen:seen.add(b);stack.append(b)
 c=sum((a.co for a in island),Vector())/len(island);x,z=c.x,-c.y
 # Clear actual travel corridor and installation footprints; keep geology elsewhere.
 clusters=[(-11,-8,3.2,2.5),(-10,5,3.1,2.4),(10,7,3.3,2.4),(9,-10,3.3,2.5),(-1,10,4,2.2)]
 in_cluster=any(((x-a)/rx)**2+((z-b)/rz)**2<1 for a,b,rx,rz in clusters)
 diameter=max(a.co.x for a in island)-min(a.co.x for a in island)
 if not in_cluster or diameter<.12 or route_dist(x,z)<1.5 or (abs(x+3)<3.7 and abs(z+5)<3.7) or (abs(x-8)<3.5 and abs(z+4)<3.5):remove+=island
bmesh.ops.delete(bm,geom=remove,context='VERTS')
ground_verts={v for f in bm.faces if f.material_index==0 for v in f.verts}
for v in ground_verts:
 x,z=v.co.x,-v.co.y; d=float(route_dist(x,z));w=max(0,min(1,(1.7-d)/.6))
 if (abs(x+3)<3.7 and abs(z+5)<3.7) or (abs(x-8)<3.5 and abs(z+4)<3.5): w=1
 v.co.z*=1-w*.95
bm.to_mesh(terrain.data);bm.free();terrain.name='Existing terrain · cropped and graded'
terrain['source']=sources[0];terrain['treatment']='crop, clear corridor, flatten foundations, unique UV atlas'

# Planar unique UV on soil only. Existing rock UV and material stay untouched.
for p in terrain.data.polygons:
 if p.material_index==0:
  p.use_smooth=True
  for li in p.loop_indices:
   v=terrain.data.vertices[terrain.data.loops[li].vertex_index].co
   terrain.data.uv_layers.active.data[li].uv=((v.x+16)/32,(v.y+14)/28)

# Bake a unique surface atlas from CC0 lunar-simulant PBR, retaining source geometry.
# This replaces the failed procedural-noise ground treatment, not facility materials.
N=2048; X,Y=np.meshgrid(np.linspace(-16,16,N,dtype=np.float32),np.linspace(-14,14,N,dtype=np.float32)); Z=-Y
def load_map(suffix):
 src=bpy.data.images.load(str(ART/'source-textures'/('moon_04_'+suffix+'_2k.jpg')),check_existing=True)
 if suffix!='diff':src.colorspace_settings.name='Non-Color'
 return np.array(src.pixels[:],dtype=np.float32).reshape(src.size[1],src.size[0],4)[:,:,:3]
def sample(raw,x,y):
 # Broad coordinate warping breaks regular recurrence, without adding color noise.
 u=np.mod((x+.21*np.sin(y*.31))/3.2,1)*2047;v=np.mod((y+.19*np.sin(x*.37))/3.2,1)*2047
 return raw[v.astype(int),u.astype(int)]
base=sample(load_map('diff'),X,Y);lum=base.mean(axis=2)
normal=sample(load_map('nor_gl'),X,Y)*2-1
rough=sample(load_map('rough'),X,Y).mean(axis=2)
occlusion=sample(load_map('ao'),X,Y).mean(axis=2)
d=route_dist(X,Z);edge=.10*np.sin(X*2.1+Z*1.7)+.06*np.sin(X*6.3-Z*3)
compact=np.clip((1.32+edge-d)/.55,0,1);compact=compact*compact*(3-2*compact)
# Twin narrow wheel-wear bands, in ground material; no road ribbon geometry.
tracks=np.exp(-((d-.48)/.12)**2)
tread=(.5+.5*np.cos(X*42+np.abs(Z)*24))**10*tracks
albedo=.285+(lum-lum.mean())*.55+compact*.018-tracks*.027-tread*.014
rgb=np.stack([albedo*.96,albedo*.99,albedo*1.04],axis=-1)
rough=np.clip(rough-compact*.13,.65,.99)
normal[:,:,:2]*=(1-compact*.72)[:,:,None]
normal/=np.linalg.norm(normal,axis=-1,keepdims=True);normal=normal*.5+.5
occlusion=1-(1-occlusion)*(1-compact*.7)*.8
def save_image(name,array,noncolor=False):
 if array.ndim==2:array=np.repeat(array[:,:,None],3,axis=2)
 rgba=np.concatenate([np.clip(array,0,1),np.ones((N,N,1),dtype=np.float32)],axis=2).astype(np.float32)
 im=bpy.data.images.new(name,width=N,height=N,alpha=True)
 if noncolor:im.colorspace_settings.name='Non-Color'
 im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
maps=[save_image('regolith-albedo',rgb),save_image('regolith-roughness',rough,True),save_image('regolith-normal',normal,True),save_image('regolith-occlusion',occlusion,True)]
material=terrain.data.materials[0].copy();material.name='Regolith · unique compacted dust atlas';terrain.data.materials[0]=material
nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
bs=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial');links.new(bs.outputs['BSDF'],out.inputs['Surface']);bs.inputs['Roughness'].default_value=.95
for im,socket in zip(maps,['Base Color','Roughness','Normal']):
 n=nodes.new('ShaderNodeTexImage');n.image=im
 if socket=='Normal':
  norm=nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.65;links.new(n.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bs.inputs[socket])
 else:links.new(n.outputs['Color'],bs.inputs[socket])
ao_group=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
if not any(s.name=='Occlusion' for s in ao_group.interface.items_tree):ao_group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
ao_node=nodes.new('ShaderNodeGroup');ao_node.node_tree=ao_group;tex=nodes.new('ShaderNodeTexImage');tex.image=maps[3];links.new(tex.outputs['Color'],ao_node.inputs['Occlusion'])

layout=[('research-station',sources[1],(-3,5,0),1.15,0),('beacon-1',sources[2],(8,4,0),.80,0),('science-rover-blue',sources[3],(-5,0,0),.58,-math.pi/2)]
for name,path,position,scale,rotation in layout:
 obs=imported(path);roots=[o for o in obs if o.parent not in obs]
 anchor=bpy.data.objects.new(name+' · placement',None);S.collection.objects.link(anchor)
 anchor.location=position;anchor.scale=(scale,)*3;anchor.rotation_euler.z=rotation;anchor['source']=path
 for o in roots:o.parent=anchor
 for o in obs:
  if o.animation_data:o.animation_data_clear()
  # Display the existing beacon's illuminated state; no replacement glow geometry.
  if o.name.startswith('Beacon activation') and o.type=='EMPTY':o.scale=(1,1,1)
 # Seat each imported model on the graded soil using its actual world bounds.
 bpy.context.view_layer.update()
 low=min((o.matrix_world@Vector(c)).z for o in obs if o.type=='MESH' for c in o.bound_box)
 anchor.location.z-=low

# Editable camera/light layout lives in .blend. Runtime recreates lights and post FX.
def camera(name,loc,target,ortho=None):
 bpy.ops.object.camera_add(location=loc);o=bpy.context.object;o.name=name;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
 if ortho:o.data.type='ORTHO';o.data.ortho_scale=ortho
 else:o.data.lens=48
 return o
S.camera=camera('01 · cinematic oblique',(0,-23.2,24),(0,.8,0),24.96)
camera('02 · strict top',(0,0,40),(0,0,0),32)
bpy.ops.object.light_add(type='SUN',location=(-18,-12,23));sun=bpy.context.object;sun.name='Directional lunar key';sun.rotation_euler=(Vector((0,0,0))-sun.location).to_track_quat('-Z','Y').to_euler();sun.data.energy=2.7;sun.data.angle=.035
S.world=bpy.data.worlds.new('Low neutral environment');S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.21,.25,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.22
S.render.resolution_x=1600;S.render.resolution_y=1000;S.render.resolution_percentage=100
S.render.engine='CYCLES';S.cycles.samples=32
for im in bpy.data.images:
 if im.source=='FILE' and not im.packed_file:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'moonfall-visual-sample.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in S.objects:
 if o.type not in ['LIGHT','CAMERA']:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'scene.glb'),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_apply=True)
manifest={'version':1,'sceneSha256':hashlib.sha256((OUT/'scene.glb').read_bytes()).hexdigest(),'sources':[{'file':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()}for p in sources],
 'terrainCrop':{'sourceBoundsBlender':[-40,-8,-25,3],'offset':[24,11,.18],'size':[32,28]},
 'route':{'source':'engine.js beaconIn tail / beaconRock / beaconOut / common entry','worldOrigin':[-14,0,-16.5],'pointsXZ':route.tolist(),'visualWidth':2.4,'changesToEngine':False},
 'placements':[{'id':n,'positionBlender':p,'scale':s,'rotationZ':r}for n,f,p,s,r in layout],
 'textureSource':{'name':'Moon 04','author':'Poly Haven / Greg Zaal, Jenelle van Heerden, Rico Cilliers','url':'https://polyhaven.com/a/moon_04','license':'CC0','capture':'lunar simulant at Spaceport Rostock lab; not lunar photography'},
 'baked':['unique albedo with compaction and tire wear','roughness','normal','surface cavity AO'],
 'runtime':['directional shadows','environment reflections','GTAO contact occlusion','tone mapping','subtle bloom'],
 'notBaked':['direct lighting','contact AO','Blender compositor']}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('SAMPLE EXPORTED',flush=True)
