"""Reuse finished ruins; grade only new transport corridors, relocate existing gates.
No new game rules, models, or whole-terrain regeneration. Original .blend stays intact.
Run node tools/export_display_map.mjs first.
"""
import bpy, json, math
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]; O=R/'dist/assets/dual-screen'; A=R/'art/dual-screen'
S=json.loads((O/'map.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(R/'art/ruins-game/moonfall-ruins.blend'))
scene=bpy.context.scene;bpy.context.preferences.filepaths.save_version=0
# Move complete gate frames as a rigid assembly, retaining their materials and detail.
for o in list(scene.objects):
 if o.name.startswith(('Personal_gate','Gate_personal_id')):
  x=o.matrix_world.translation.x;i=0 if x<0 else 1
  a=S['anchors'][i]['gate']; old=Vector((-24.5 if i==0 else 24.5,-6.5,2.2+5.5/17*1.3))
  delta=Vector((a[0],a[1],a[2]))-old
  mw=o.matrix_world.copy();mw.translation+=delta;o.matrix_world=mw
# Move existing service groups outside the expanded detour envelope, not the roads.
for name in ['LAB_W','SUPPLY_W','EXTRACTOR_E','DRILL_E']:
 o=bpy.data.objects[name];o.location.x += -17 if o.location.x<0 else 17
for o in scene.objects:
 if o.name.startswith(('Service_foundation','Terrace_retaining_wall','Service_power_duct','Supply_crate')):
  o.location.x += -17 if o.location.x<0 else 17
# Keep independent nodes in the authoring file, but runtime loads their existing GLB.
for i,name in enumerate(['BEACON_BLUE','BEACON_GOLD']):
 o=bpy.data.objects[name];a=S['anchors'][i]['beacon'];o.location=Vector((a[0]+(-2.6 if i==0 else 2.6),a[1],a[2]))
 o=bpy.data.objects['DOOR_'+str(i)];a=S['anchors'][i]['gate'];o.location=(a[0],a[1],a[2]+1.32)
# Original authored terrain remains; locally grade new road beds into it.
ys=np.array([-80,-50,-34,-12,5,25,42,56.5,76,120]);zs=np.array([.6,.9,1.4,2.2,3.5,5,4.4,5.6,7.2,7.2])
def elevation(x,y):
 z=np.interp(y,ys,zs)
 for cx in [-32,32]:
  t=np.clip((np.hypot(x-cx,y-56.5)-4.3)/3,0,1);w=1-t*t*(3-2*t);z=z*(1-w)+6.56*w
 return z
segments=[]
for road in S['roads']:
 for a,b in zip(road['points_xy'],road['points_xy'][1:]):segments.append((np.array(a),np.array(b)))
changed=0
for o in scene.objects:
 if o.type!='MESH' or not o.name.startswith('Geology_tile'):continue
 xy=np.array([(v.co.x,v.co.y) for v in o.data.vertices]);dist=np.full(len(xy),1e6)
 for a,b in segments:
  v=b-a;t=np.clip(((xy-a)*v).sum(axis=1)/(v*v).sum(),0,1);dist=np.minimum(dist,np.linalg.norm(xy-a-t[:,None]*v,axis=1))
 t=np.clip((dist-1.6)/1.8,0,1);w=1-t*t*(3-2*t);target=elevation(xy[:,0],xy[:,1])-.08
 # Flatten only the relocated existing service aprons; retain outer mountain mass.
 for cx in [-54,54]:
  for cy in [-30,-17]:
   d=np.maximum(np.abs(xy[:,0]-cx)-4.3,np.abs(xy[:,1]-cy)-4.1)
   u=np.clip(d/1.8,0,1);ww=1-u*u*(3-2*u);base=np.array([v.co.z for v in o.data.vertices]);
   for j,v in enumerate(o.data.vertices):
    if ww[j]>0:v.co.z=base[j]*(1-ww[j])+3.15*ww[j]
 for i,v in enumerate(o.data.vertices):
  if w[i]>0:v.co.z=v.co.z*(1-w[i])+target[i]*w[i];changed+=1
# Remove just legacy road meshes/anchors from this derived authoring copy.
for o in list(scene.objects):
 if 'logical_edge_id' in o or o.name.startswith('ANCHOR_'):bpy.data.objects.remove(o,do_unlink=True)
roadmat=bpy.data.materials.get('Compacted lunar transport surface')
roadobjects=[]
for k,edge in enumerate(S['roads']):
 p=[]
 for a,b in zip(edge['points_xy'],edge['points_xy'][1:]):
  n=max(1,math.ceil(math.dist(a,b)/.5));p.extend([(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n) for i in range(n)])
 p.append(edge['points_xy'][-1]);verts=[]
 for i,(x,y) in enumerate(p):
  a=p[max(0,i-1)];b=p[min(len(p)-1,i+1)];dx=b[0]-a[0];dy=b[1]-a[1];l=math.hypot(dx,dy)
  for sign in [-1,1]:
   xx=x-dy/l*1.3*sign;yy=y+dx/l*1.3*sign;verts.append((xx,yy,float(elevation(xx,yy))+.03))
 faces=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(p)-1)]
 me=bpy.data.meshes.new('Physical display corridor');me.from_pydata(verts,[],faces);me.materials.append(roadmat)
 uv=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  for li in poly.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v.x/4,v.y/4)
 o=bpy.data.objects.new('DISPLAY_ROAD_%03d'%k,me);scene.collection.objects.link(o);o['display_edge']=k;roadobjects.append(o)
scene['mapping']='Three physical stages unfolded continuously; geometry.js unchanged';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(A/'moonfall-dual-screen.blend'))
beacons={o for n in ['BEACON_BLUE','BEACON_GOLD','ROVER_BLUE','ROVER_GOLD'] for o in [bpy.data.objects[n],*bpy.data.objects[n].children_recursive]}
static=[o for o in scene.objects if o.type in ['MESH','CURVE'] and o not in beacons and not o.name.startswith(('DOOR_','FAULT_','DISPLAY_ROAD_'))]
bpy.ops.object.select_all(action='DESELECT')
for o in static:o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=static[0];bpy.ops.object.convert(target='MESH')
for o in bpy.context.selected_objects:
 mw=o.matrix_world.copy();o.parent=None;o.matrix_world=mw
bpy.ops.object.join();merged=bpy.context.object;merged.name='STATIC_DUAL_RUINS'
slots=list(merged.data.materials);unique=[];indices=[]
for m in slots:
 if m not in unique:unique.append(m)
 indices.append(unique.index(m))
old=[p.material_index for p in merged.data.polygons];merged.data.materials.clear()
for m in unique:merged.data.materials.append(m)
for p,i in zip(merged.data.polygons,old):p.material_index=indices[i]
bpy.ops.export_scene.gltf(filepath=str(O/'static-scene.glb'),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_apply=True)
print('DUAL_EXPORT_COMPLETE',json.dumps({'graded_vertices':changed,'roads':len(roadobjects),'map_revision':S['map_revision']}),flush=True)
