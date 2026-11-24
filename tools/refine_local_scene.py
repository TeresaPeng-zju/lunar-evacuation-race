"""Isolated LAB_W refinement. Reads the completed scene, never changes layout data.
Run from repository root with Blender --background --python tools/refine_local_scene.py.
The authoring copy is saved before the runtime-only merge; production GLB stays intact.
"""
import bpy, json, math, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
O=R/'dist/assets/local-refinement'; A=R/'art/local-refinement'
O.mkdir(parents=True,exist_ok=True); A.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'art/dual-screen/moonfall-dual-screen.blend'))
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
root=bpy.data.objects['LAB_W']
anchor_before=list(root.matrix_world.translation)
S=json.loads((R/'dist/assets/dual-screen/map.json').read_text())
def meshhash(o):
 h=hashlib.sha256()
 h.update(np.array(o.matrix_world,dtype=np.float32).tobytes())
 h.update(np.array([v.co[:] for v in o.data.vertices],dtype=np.float32).tobytes())
 return h.hexdigest()
protected={o.name:meshhash(o) for o in scene.objects if o.type=='MESH' and o.name.startswith(('DISPLAY_ROAD_','DOOR_','FAULT_','Personal_gate'))}
# Keep the dish asset and the LAB_W root / footprint, replace only the fragmented hull.
hull=next(o for o in root.children_recursive if o.type=='MESH' and o.name.startswith('research-station'))
bpy.data.objects.remove(hull,do_unlink=True)
def mat(name,source,color,metal,rough):
 m=bpy.data.materials[source].copy();m.name=name
 m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 # Reuse PBR normal/roughness; use a restrained base tint for the large forms.
 for link in list(p.inputs['Base Color'].links):m.node_tree.links.remove(link)
 p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 m.diffuse_color=(*color,1)
 return m
shell=mat('LOCAL / ceramic titanium shell','Weathered titanium',(.30,.295,.28),.38,.66)
trim=mat('LOCAL / structural seams','Graphite steel',(.095,.105,.12),.5,.65)
roof=mat('LOCAL / folded roof','Weathered titanium',(.19,.215,.23),.48,.64)
base=mat('LOCAL / mineral foundation','Basalt regolith',(.23,.22,.20),0,.94)
glass=mat('LOCAL / recessed glazing','Smoked optical glass',(.035,.075,.095),.4,.29)
lamp=bpy.data.materials.new('LOCAL / warm interior');lamp.use_nodes=True
p=next(n for n in lamp.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(.8,.43,.16,1);p.inputs['Emission Color'].default_value=(1,.45,.12,1);p.inputs['Emission Strength'].default_value=1.3
created=[]
def finish(o,m,bevel=.04):
 o.data.materials.clear();o.data.materials.append(m)
 if bevel:
  mod=o.modifiers.new('Machined edge radii','BEVEL');mod.width=bevel;mod.segments=3
  mod=o.modifiers.new('Weighted architectural normals','WEIGHTED_NORMAL');mod.keep_sharp=True
 bpy.context.view_layer.objects.active=o
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
 if o.data.uv_layers:
  pass
 else:
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 o.data.uv_layers.active.name='UVMap'
 mw=o.matrix_world.copy();o.parent=root;o.matrix_world=mw
 created.append(o.name);return o
# All coordinates below are local offsets from the existing facility, not new map coordinates.
def box(name,xyz,size,m,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(-54+xyz[0],-17+xyz[1],xyz[2]))
 o=bpy.context.object;o.name='LAB refined / '+name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,m,bevel)
def octbody(name,rings,m):
 verts=[]
 for w,d,c,z in rings:
  for x,y in [(-w/2+c,-d/2),(w/2-c,-d/2),(w/2,-d/2+c),(w/2,d/2-c),(w/2-c,d/2),(-w/2+c,d/2),(-w/2,d/2-c),(-w/2,-d/2+c)]:verts.append((-54+x,-17+y,z))
 faces=[tuple(reversed(range(8)))]
 for j in range(len(rings)-1):
  for i in range(8):faces.append((8*j+i,8*j+(i+1)%8,8*(j+1)+(i+1)%8,8*(j+1)+i))
 faces.append(tuple(range(8*(len(rings)-1),8*len(rings))))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 o=bpy.data.objects.new('LAB refined / '+name,me);scene.collection.objects.link(o)
 return finish(o,m,.055)
octbody('pressure hull',[(6.8,4.65,.65,3.57),(6.8,4.65,.65,5.35),(6.05,4.1,.5,5.92)],shell)
octbody('continuous roof',[(6.10,4.15,.5,5.91),(5.85,3.9,.48,6.09)],roof)
octbody('lower skirt',[(6.95,4.8,.65,3.45),(6.95,4.8,.65,3.74)],trim)
# Two broad roof seams articulate the span; no scatter of tiny greebles.
for x in [-2.25,2.25]:
 # Structural portal frames follow the pressure shell section as a continuous element.
 profile=[(-2.40,3.76),(-2.40,5.37),(-2.08,5.99),(-1.95,6.16),(1.95,6.16),(2.08,5.99),(2.40,5.37),(2.40,3.76)]
 cu=bpy.data.curves.new('Structural portal section','CURVE');cu.dimensions='3D';cu.bevel_depth=.085;cu.bevel_resolution=2;cu.resolution_u=1
 sp=cu.splines.new('POLY');sp.points.add(len(profile)-1)
 for pt,(y,z) in zip(sp.points,profile):pt.co=(-54+x,-17+y,z,1)
 ob=bpy.data.objects.new('LAB refined / structural portal',cu);scene.collection.objects.link(ob);cu.materials.append(shell)
 mw=ob.matrix_world.copy();ob.parent=root;ob.matrix_world=mw
 created.append(ob.name)
box('rear service volume',(-.55,2.72,4.43),(4.35,1.25,1.76),shell,.18)
box('airlock body',(2.05,-2.8,4.35),(1.85,1.55,1.75),shell,.23)
box('airlock recess',(2.05,-3.586,4.28),(1.48,.045,1.32),trim,.12)
box('airlock door',(2.05,-3.618,4.26),(1.16,.035,1.12),roof,.075)
box('entry light',(2.05,-3.652,4.94),(1.30,.04,.055),lamp,.01)
box('entry threshold',(2.05,-3.51,3.53),(2.0,.18,.15),base,.04)
# A continuous recessed window strip reads at game distance.
box('window recess',(-1.63,-2.333,4.74),(2.58,.06,.59),trim,.08)
box('glazing',(-1.63,-2.372,4.75),(2.36,.025,.37),glass,.03)
box('interior strip',(-1.63,-2.389,4.58),(2.21,.025,.065),lamp,.01)
for x in [-2.2,-1.06]:box('window mullion',(x,-2.407,4.76),(.065,.045,.43),shell,.012)
# Side equipment recess, a single large service panel rather than clusters of boxes.
box('side service inset',(3.408,.35,4.6),(.035,2.48,.90),trim,.055)
box('side service cover',(3.433,.35,4.6),(.025,2.28,.68),roof,.035)
# Existing antenna dish retained; mounted to the new roof, within original overall height.
dish=next(o for o in root.children_recursive if o.type=='MESH' and o.name.startswith('Tracking dish'))
mw=dish.matrix_world.copy();mw.translation.z+=1.43;dish.matrix_world=mw
box('antenna plinth',(-1.29,2.04,5.83),(.58,.58,.38),trim,.07)
# Existing foundation keeps location/footprint but gains shaped edges and a buried toe.
foundation=bpy.data.objects['Service_foundation.001'];foundation.data.materials.clear();foundation.data.materials.append(base)
for v in foundation.data.vertices:
 if v.co.z<0:v.co.z-=.12
mod=foundation.modifiers.new('Dressed slab edges','BEVEL');mod.width=.12;mod.segments=3
foundation.modifiers.new('Foundation normals','WEIGHTED_NORMAL')
# Terrain: a connected buttressed escarpment west of the apron, no circular bowls.
segments=[(np.array(a),np.array(b)) for road in S['roads'] for a,b in zip(road['points_xy'],road['points_xy'][1:])]
def terrain_target(x,y):
 # Coarse planes / slope breaks; small longitudinal drift avoids a perfect retaining wall.
 toe=np.interp(y,[-49,-40,-32,-25,-18,-10,1],[-59.8,-59.6,-61.8,-59.2,-60.2,-58.7,-60.6])
 u=toe-x
 # Three strata with short benches, not a smooth bulge. Coarse inclined erosion ribs.
 rib=.28*np.sin(y*.73+u*.38)*np.clip(u/2,0,1)
 shoulder=np.interp(u+rib,[-16,0,1.1,2.0,2.55,3.45,4.05,5.0,6.2,15],
                    [3.15,3.15,3.38,4.72,4.82,6.25,6.37,7.8,8.25,5.5])
 saddle=.65*np.maximum(0,1-np.abs((y+25)/5))
 return shoulder-saddle*np.clip(u/4,0,1)

changed=0;maxdelta=0;road_changes=0
for o in scene.objects:
 if o.type!='MESH' or not o.name.startswith('Geology_tile'):continue
 xyz=np.array([v.co[:] for v in o.data.vertices]);x,y=xyz[:,0],xyz[:,1]
 mask=(x>-78)&(x<-46)&(y>-49)&(y<1)
 ids=np.where(mask)[0];xy=xyz[ids,:2]
 dist=np.full(len(ids),1e6)
 for a,b in segments:
  v=b-a;t=np.clip(((xy-a)*v).sum(axis=1)/(v*v).sum(),0,1);dist=np.minimum(dist,np.linalg.norm(xy-a-t[:,None]*v,axis=1))
 for j,i in enumerate(ids):
  xx,yy,old=xyz[i]
  t=min((xx+78)/4,(-46-xx)/3,(yy+49)/4,(1-yy)/4,1)
  t=max(0,t);w=t*t*(3-2*t)
  # Leave road corridor + both shoulders untouched; never sculpt under the routes.
  w*=max(0,min(1,(dist[j]-3.5)/1.8))
  if w<=0:continue
  target=float(terrain_target(xx,yy))
  # The fixed lab/supply aprons retain the exact established elevation.
  for cy in [-17,-30]:
   d=max(abs(xx+54)-4.3,abs(yy-cy)-4.1)
   if d<1.8:
    a=max(0,min(1,d/1.8));a=a*a*(3-2*a);target=3.15*(1-a)+target*a
  new=old*(1-w)+target*w;o.data.vertices[i].co.z=new
  changed+=abs(new-old)>1e-6;maxdelta=max(maxdelta,abs(new-old))
 o.data.update()
# Replace only three low-poly boulder clusters in the test patch with broad fracture slabs.
# Original cluster centers and XY extents remain; bases extend down into the sculpted ridge.
rockmat=bpy.data.materials['Lunar regolith / Moon04 PBR'].copy();rockmat.name='LOCAL / fractured escarpment'
for o in list(scene.objects):
 if o.type!='MESH' or not o.name.startswith(('Basalt_escarpment_00_','Basalt_escarpment_01_','Basalt_escarpment_02_')):continue
 bb=[o.matrix_world@Vector(c) for c in o.bound_box];lo=[min(v[i] for v in bb) for i in range(3)];hi=[max(v[i] for v in bb) for i in range(3)]
 cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2;w=(hi[0]-lo[0])/2;d=(hi[1]-lo[1])/2
 z=float(terrain_target(cx,cy));h=1.0+(hi[2]-lo[2])*.3
 outline=[(-.95,-.45),(-.52,-.94),(.36,-.83),(.92,-.27),(.75,.58),(.16,.95),(-.65,.73),(-1.0,.17)]
 verts=[(cx+u*w,cy+v*d,min(z-1.1,float(terrain_target(cx+u*w,cy+v*d))-.55)) for u,v in outline]
 verts += [(cx+u*w*.63+.15*w,cy+v*d*.65,z+h*t) for (u,v),t in zip(outline,[.42,.66,.8,.56,.87,.93,.6,.53])]
 verts.append((cx-.1*w,cy+.12*d,z+h*1.03))
 faces=[tuple(reversed(range(8)))]
 for k in range(8):faces.extend([(k,(k+1)%8,(k+1)%8+8,k+8),(k+8,(k+1)%8+8,16)])
 me=bpy.data.meshes.new('Fractured existing escarpment');me.from_pydata(verts,[],faces);me.materials.append(rockmat)
 uv=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  for li in poly.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co.x/3,co.y/3+co.z/5)
 # Keep object transform and identity. Convert world mesh vertices back to original local frame.
 inv=o.matrix_world.inverted()
 for v in me.vertices:v.co=inv@v.co
 o.data=me
 mod=o.modifiers.new('Fracture edge','BEVEL');mod.width=.06;mod.segments=2
 o.modifiers.new('Rock normals','WEIGHTED_NORMAL')
# Shared production station upgrade; existing root, terrain and routes are retained.
import sys
sys.path.insert(0,str(R/'tools'))
from station_finish import improve_station
station_report=improve_station(root,R/'art/production')
(A/'station-finish.json').write_text(json.dumps(station_report,indent=2))
# Remove no other buildings, routes or anchors. Save editable copy BEFORE export merge.
assert anchor_before==list(root.matrix_world.translation)
assert all(meshhash(bpy.data.objects[n])==h for n,h in protected.items())
report=dict(source='art/dual-screen/moonfall-dual-screen.blend',facility='LAB_W',anchor_before=anchor_before,anchor_after=list(root.matrix_world.translation),protected_objects=len(protected),protected_geometry_unchanged=True,terrain_vertices_changed=int(changed),maximum_visual_height_change=maxdelta,road_clearance_world_units=3.5,terrain_bounds_xy=[[-78,-49],[-46,1]],new_facility_parts=created,scope='local review only; production assets and all map/protocol files untouched')
(A/'refinement-report.json').write_text(json.dumps(report,indent=2))
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(A/'moonfall-local-refinement.blend'))
beacons={o for n in ['BEACON_BLUE','BEACON_GOLD','ROVER_BLUE','ROVER_GOLD'] for o in [bpy.data.objects[n],*bpy.data.objects[n].children_recursive]}
static=[o for o in scene.objects if o.type in ['MESH','CURVE'] and o not in beacons and not o.name.startswith(('DOOR_','FAULT_','DISPLAY_ROAD_'))]
bpy.ops.object.select_all(action='DESELECT')
for o in static:o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['Geology_tile_0_0'];bpy.ops.object.convert(target='MESH')
for o in bpy.context.selected_objects:
 mw=o.matrix_world.copy();o.parent=None;o.matrix_world=mw
bpy.ops.object.join();merged=bpy.context.object;merged.name='LOCAL_REFINEMENT_REVIEW'
slots=list(merged.data.materials);unique=[];indices=[]
for m in slots:
 if m not in unique:unique.append(m)
 indices.append(unique.index(m))
old=[p.material_index for p in merged.data.polygons];merged.data.materials.clear()
for m in unique:merged.data.materials.append(m)
for p,i in zip(merged.data.polygons,old):p.material_index=indices[i]
bpy.ops.export_scene.gltf(filepath=str(O/'static-scene.glb'),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_apply=True)
print('LOCAL_REFINEMENT_COMPLETE',json.dumps(report),flush=True)
