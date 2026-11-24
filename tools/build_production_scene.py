"""Promote the approved local art to maintained game assets, without changing map data.
Run AFTER refine_local_scene.py. Produces the two existing map variants and shared lab.
"""
import bpy,json,math,hashlib,sys
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[1];O=R/'dist/assets/production';A=R/'art/production'
O.mkdir(parents=True,exist_ok=True);A.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
sys.path.insert(0,str(R/'tools'))
from station_finish import ensure_gltf_group

def fingerprint(o):
 h=hashlib.sha256(np.array(o.matrix_world,dtype=np.float32).tobytes())
 if o.type=='MESH':h.update(np.array([v.co[:] for v in o.data.vertices],dtype=np.float32).tobytes())
 return h.hexdigest()
def select(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
def export(path,objects):
 select(objects);bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_apply=True)
def bounds(objects):
 vs=[o.matrix_world@Vector(v) for o in objects if o.type in ['MESH','CURVE'] for v in o.bound_box]
 return np.array([min(v[i] for v in vs) for i in range(3)]),np.array([max(v[i] for v in vs) for i in range(3)])
# The accepted building becomes a reusable asset; its editable source remains unchanged.
bpy.ops.wm.open_mainfile(filepath=str(R/'art/local-refinement/moonfall-local-refinement.blend'))
ensure_gltf_group()
root=bpy.data.objects['LAB_W'];deps=bpy.context.evaluated_depsgraph_get();copies=[]
for ob in root.children_recursive:
 if ob.type not in ['MESH','CURVE']:continue
 ev=ob.evaluated_get(deps);mesh=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=deps)
 o=bpy.data.objects.new(ob.name,mesh);bpy.context.scene.collection.objects.link(o)
 o.matrix_world=Matrix.Translation((54,17,-3.4))@ob.matrix_world;copies.append(o)
export(O/'research-station.glb',copies)
for ob in copies:bpy.data.objects.remove(ob,do_unlink=True)

def replace_facility(name,asset,keep=False):
 root=bpy.data.objects[name];old=[o for o in root.children_recursive if o.type in ['MESH','CURVE']]
 lo,hi=bounds(old);center=(lo+hi)/2;center[2]=lo[2]
 original=fingerprint(root)
 before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(asset));added=set(bpy.context.scene.objects)-before
 bpy.context.view_layer.update();parts=[o for o in added if o.type=='MESH'];low,high=bounds(parts);size=high-low
 # Fit the existing footprint/height, never enlarge a building into a road or anchor.
 scales=(hi-lo)/size*.96
 if keep:scales*=np.array([.62,.54,.55]);center[2]=lo[2]+.15
 origin=(low+high)/2;origin[2]=low[2]
 for o in parts:
  data=o.data.copy();mw=o.matrix_world.copy()
  for v in data.vertices:v.co=Vector(center+(np.array(mw@v.co)-origin)*scales)
  o.data=data;o.parent=None;o.matrix_world=Matrix.Identity(4)
  mw=o.matrix_world.copy();o.parent=root;o.matrix_world=mw;o.name=name+' / unified '+o.name
 for o in added:
  if o not in parts:bpy.data.objects.remove(o,do_unlink=True)
 if not keep:
  for o in old:bpy.data.objects.remove(o,do_unlink=True)
 assert fingerprint(root)==original
 return dict(name=name,footprint_before=[lo.tolist(),hi.tolist()],treatment='coherent service core' if keep else 'approved pressure-hull family')

def make_scene(kind):
 source=R/('art/local-refinement/moonfall-local-refinement.blend' if kind=='physical' else 'art/ruins-game/moonfall-ruins.blend')
 bpy.ops.wm.open_mainfile(filepath=str(source));ensure_gltf_group();scene=bpy.context.scene
 roots={o.name:fingerprint(o) for o in scene.objects if o.type=='EMPTY' and not o.parent}
 protected={o.name:fingerprint(o) for o in scene.objects if o.type=='MESH' and (o.name.startswith(('DISPLAY_ROAD_','DOOR_','FAULT_','Personal_gate','Gate_personal_id')) or 'logical_edge_id' in o)}
 buildings=[]
 if kind!='physical':buildings.append(replace_facility('LAB_W',O/'research-station.glb'))
 for n in ['HAB_E','CAMP_W']:buildings.append(replace_facility(n,O/'research-station.glb'))
 buildings.append(replace_facility('SUPPLY_W',O/'research-station.glb',keep=True))
 foundation=bpy.data.materials.get('LOCAL / mineral foundation')
 if foundation:
  for o in scene.objects:
   if not o.name.startswith('Service_foundation') or (kind=='physical' and o.name=='Service_foundation.001'):continue
   o.data.materials.clear();o.data.materials.append(foundation)
   mod=o.modifiers.new('Unified foundation edges','BEVEL');mod.width=.12;mod.segments=3
   o.modifiers.new('Foundation normals','WEIGHTED_NORMAL')
 # Road corridors are protected by source geometry, not inferred from a picture.
 segments=[]
 if kind=='physical':
  S=json.loads((R/'dist/assets/dual-screen/map.json').read_text())
  segments=[(np.array(a),np.array(b)) for road in S['roads'] for a,b in zip(road['points_xy'],road['points_xy'][1:])]
 else:
  for o in scene.objects:
   if o.type=='MESH' and 'logical_edge_id' in o:
    # Broad road mesh AABB is a conservative protection envelope for legacy scene.
    lo,hi=bounds([o]);segments.append((lo[:2],hi[:2]))
 facility_bounds=[]
 for o in scene.objects:
  if o.type=='EMPTY' and not o.parent and o.children_recursive:
   meshes=[c for c in o.children_recursive if c.type=='MESH']
   if meshes:facility_bounds.append(bounds(meshes))
 def clearance(xy):
  dist=np.full(len(xy),1e6)
  for a,b in segments:
   v=b-a;l=np.dot(v,v)
   if l<1e-10:continue
   t=np.clip(((xy-a)*v).sum(axis=1)/l,0,1);dist=np.minimum(dist,np.linalg.norm(xy-a-t[:,None]*v,axis=1))
  return dist
 terrain_count=0;protected_terrain_count=0
 for o in scene.objects:
  if o.type!='MESH' or not o.name.startswith('Geology_tile'):continue
  xyz=np.array([v.co[:] for v in o.data.vertices]);xy=xyz[:,:2];z=xyz[:,2];d=clearance(xy)
  weight=np.clip((d-3.5)/1.5,0,1)
  for lo,hi in facility_bounds:
   gap=np.maximum(np.maximum(lo[:2]-xy,xy-hi[:2]),0)
   weight*=np.clip((np.linalg.norm(gap,axis=1)-1.0)/1.5,0,1)
  # Preserve approved west sample exactly. Sharpen existing macro forms elsewhere.
  if kind=='physical':weight[(xy[:,0]>-78)&(xy[:,0]<-46)&(xy[:,1]>-49)&(xy[:,1]<1)]=0
  level=np.floor(z/1.1);f=z/1.1-level;t=np.clip((f-.16)/.68,0,1)
  shaped=(level+t*t*(3-2*t))*1.1
  new=z+(shaped-z)*weight
  for v,n,old in zip(o.data.vertices,new,z):v.co.z=float(n);terrain_count+=abs(n-old)>1e-6
  assert np.max(np.abs(new[d<=3.5]-z[d<=3.5]),initial=0)==0
  protected_terrain_count+=int((d<=3.5).sum());o.data.update()
 # Extend the accepted sharp rock treatment to the other existing escarpment meshes.
 from mathutils.kdtree import KDTree
 vertices=[o.matrix_world@v.co for o in scene.objects if o.type=='MESH' and o.name.startswith('Geology_tile') for v in o.data.vertices]
 tree=KDTree(len(vertices))
 for i,v in enumerate(vertices):tree.insert((v.x,v.y,0),i)
 tree.balance()
 def ground(x,y):return vertices[tree.find((x,y,0))[1]].z
 rockmat=bpy.data.materials.get('LOCAL / fractured escarpment')
 if not rockmat:rockmat=bpy.data.materials['Lunar regolith / Moon04 PBR'].copy();rockmat.name='LOCAL / fractured escarpment'
 rocks=0
 for o in scene.objects:
  if o.type!='MESH' or not o.name.startswith('Basalt_escarpment'):continue
  if kind=='physical' and o.name.startswith(('Basalt_escarpment_00_','Basalt_escarpment_01_','Basalt_escarpment_02_')):continue
  lo,hi=bounds([o]);cx,cy=(lo[:2]+hi[:2])/2;w,d=(hi[:2]-lo[:2])/2;z=ground(cx,cy);h=max(.5,(hi[2]-lo[2])*.55)
  outline=[(-.95,-.45),(-.52,-.94),(.36,-.83),(.92,-.27),(.75,.58),(.16,.95),(-.65,.73),(-1,.17)]
  vs=[(cx+u*w,cy+v*d,min(z-.5,ground(cx+u*w,cy+v*d)-.4)) for u,v in outline]
  vs += [(cx+u*w*.63+.15*w,cy+v*d*.65,z+h*t) for (u,v),t in zip(outline,[.42,.66,.8,.56,.87,.93,.6,.53])];vs.append((cx-.1*w,cy+.12*d,z+h*1.03))
  faces=[tuple(reversed(range(8)))]
  for k in range(8):faces.extend([(k,(k+1)%8,(k+1)%8+8,k+8),(k+8,(k+1)%8+8,16)])
  me=bpy.data.meshes.new('Unified fracture slab');me.from_pydata(vs,[],faces);me.materials.append(rockmat);uv=me.uv_layers.new(name='UVMap')
  for poly in me.polygons:
   for li in poly.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v.x/3,v.y/3+v.z/5)
  inv=o.matrix_world.inverted()
  for v in me.vertices:v.co=inv@v.co
  o.data=me;rocks+=1
  mod=o.modifiers.new('Fracture edge','BEVEL');mod.width=.06;mod.segments=2;o.modifiers.new('Rock normals','WEIGHTED_NORMAL')
 assert all(fingerprint(bpy.data.objects[n])==h for n,h in roots.items())
 assert all(fingerprint(bpy.data.objects[n])==h for n,h in protected.items())
 report=dict(kind=kind,buildings=buildings,terrain_vertices_sharpened=int(terrain_count),protected_terrain_vertices=protected_terrain_count,rock_meshes_refined=rocks,protected_objects=len(protected),all_root_transforms_unchanged=True,all_road_gate_fault_geometry_unchanged=True)
 (A/f'{kind}-integrity.json').write_text(json.dumps(report,indent=2));bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(A/f'moonfall-{kind}.blend'))
 dynamic={o for n in ['BEACON_BLUE','BEACON_GOLD','ROVER_BLUE','ROVER_GOLD'] for o in [bpy.data.objects[n],*bpy.data.objects[n].children_recursive]}
 static=[o for o in scene.objects if o.type in ['MESH','CURVE'] and o not in dynamic and not o.name.startswith(('DOOR_','FAULT_','DISPLAY_ROAD_','ANCHOR_')) and 'logical_edge_id' not in o]
 # Keep the station's second UV atlas off the million-vertex terrain mesh.
 # Material draw calls remain grouped, without adding an empty AO UV stream to the whole map.
 station=[o for o in static if any(m and m.name.startswith('STATION /') for m in o.data.materials)]
 # Imported and authored meshes use different UV names (including localized names).
 # Canonicalize names and node references before joining; preserve every UV coordinate.
 for o in station:
  renamed={}
  for index,uv in enumerate(o.data.uv_layers):
   target='UVMap' if index==0 else 'StationAO' if index==1 else uv.name
   renamed[uv.name]=target;uv.name=target
  for material in o.data.materials:
   if material and material.use_nodes:
    for node in material.node_tree.nodes:
     if node.type=='UVMAP' and node.uv_map in renamed:node.uv_map=renamed[node.uv_map]
 exported=[]
 for label,objects in [('ENVIRONMENT',[o for o in static if o not in station]),('STATIONS',station)]:
  if not objects:continue
  select(objects);bpy.ops.object.convert(target='MESH')
  for o in bpy.context.selected_objects:
   mw=o.matrix_world.copy();o.parent=None;o.matrix_world=mw
  bpy.ops.object.join();merged=bpy.context.object;merged.name='MOONFALL_PRODUCTION_'+kind.upper()+'_'+label
  slots=list(merged.data.materials);unique=[];indices=[]
  for m in slots:
   if m not in unique:unique.append(m)
   indices.append(unique.index(m))
  old=[p.material_index for p in merged.data.polygons];merged.data.materials.clear()
  for m in unique:merged.data.materials.append(m)
  for p,i in zip(merged.data.polygons,old):p.material_index=indices[i]
  exported.append(merged)
 export(O/f'{kind}-scene.glb',exported);print('PRODUCTION_SCENE_COMPLETE',json.dumps(report),flush=True)
make_scene('physical')
make_scene('virtual')
