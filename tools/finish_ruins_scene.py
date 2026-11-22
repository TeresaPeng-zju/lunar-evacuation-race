"""Finish the existing Phase 02 .blend, then export static + interactive glTF.
Does NOT regenerate terrain, rewrite paths, or modify the V2.0 engine.
"""
import bpy,json,math,sys,hashlib,bmesh
import numpy as np
from pathlib import Path
from mathutils import Vector,kdtree
R=Path(__file__).resolve().parents[1];OUT=R/'dist/assets/ruins-game';ART=R/'art/ruins-game'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
SRC=Path(args[0]) if args else R.parent/'moonfall-phase01-02'
S=json.loads((SRC/'map_spec.json').read_text());OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SRC/'moonfall_blockout.blend'))
scene=bpy.context.scene;scene.frame_set(1);bpy.context.preferences.filepaths.save_version=0
# Original GLB material slots were retained in Phase 02; restore, do not replace the assets.
restored=0
for o in list(scene.objects):
 if 'original_material_slots' in o:
  for i,n in enumerate(json.loads(o['original_material_slots'])):
   if n and n in bpy.data.materials:o.data.materials[i]=bpy.data.materials[n];restored+=1
 if o.animation_data:o.animation_data_clear()
# Deduplicate identical imported material families to avoid hundreds of runtime draws.
canon={}
for o in scene.objects:
 if o.type=='MESH':
  for i,m in enumerate(o.data.materials):
   if not m:continue
   key=m.name.rsplit('.',1)[0] if m.name.rsplit('.',1)[-1].isdigit() else m.name
   if key not in canon:canon[key]=m
   else:o.data.materials[i]=canon[key]

def principled(m):
 p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if p is None:
  p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
  out=next((n for n in m.node_tree.nodes if n.type=='OUTPUT_MATERIAL'),None) or m.node_tree.nodes.new('ShaderNodeOutputMaterial')
  m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
 return p
def material(name,color,metal=0,rough=.85):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=principled(m);p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
soil=material('Lunar regolith / Moon04 PBR',(.45,.47,.5))
source=R/'art/visual-sample/source-textures'
for key,socket in [('diff','Base Color'),('rough','Roughness'),('nor_gl','Normal')]:
 im=bpy.data.images.load(str(source/f'moon_04_{key}_2k.jpg'),check_existing=True)
 if key!='diff':im.colorspace_settings.name='Non-Color'
 if key=='diff':
  # Existing lunar-simulant photography is beige under studio light. Bake only
  # its measured texture variation into neutral charcoal, rather than tinting sand.
  pixels=np.array(im.pixels[:],dtype=np.float32).reshape(-1,4);lum=pixels[:,:3].mean(axis=1)
  level=np.clip(.38+(lum-lum.mean())*.65,.18,.59)
  pixels[:,:3]=level[:,None]*np.array([.94,.98,1.03])[None,:]
  gray=bpy.data.images.new('Moon04 neutral lunar albedo',width=im.size[0],height=im.size[1],alpha=True)
  gray.pixels.foreach_set(pixels.ravel());gray.filepath_raw=str(ART/'lunar-albedo.png');gray.file_format='PNG';gray.save();gray.pack();im=gray
 n=soil.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;p=principled(soil)
 if key=='nor_gl':
  nm=soil.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.28;soil.node_tree.links.new(n.outputs['Color'],nm.inputs['Color']);soil.node_tree.links.new(nm.outputs['Normal'],p.inputs[socket])
 else:soil.node_tree.links.new(n.outputs['Color'],p.inputs[socket])
principled(soil).inputs['Roughness'].default_value=.92
# Surface AO from the same existing CC0 set, glTF convention (runtime also contact AO).
g=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
if not any(x.name=='Occlusion' for x in g.interface.items_tree):g.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
node=soil.node_tree.nodes.new('ShaderNodeGroup');node.node_tree=g
tex=soil.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(source/'moon_04_ao_2k.jpg'),check_existing=True);tex.image.colorspace_settings.name='Non-Color';soil.node_tree.links.new(tex.outputs['Color'],node.inputs['Occlusion'])
road=soil.copy();road.name='Compacted lunar transport surface';principled(road).inputs['Metallic'].default_value=0
metal=canon.get('Weathered titanium') or material('Unified titanium',(.21,.23,.25),.65,.6)
steel=canon.get('Graphite steel') or material('Graphite',(.06,.075,.09),.55,.7)
basalt=canon.get('Fractured basalt') or material('Basalt',(.15,.16,.18),0,1)
terrain=[];roads=[]
for o in list(scene.objects):
 if o.type!='MESH':continue
 if o.name.startswith('Geology_tile'):
  terrain.append(o);o.data.materials.clear();o.data.materials.append(soil)
  uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
  for p in o.data.polygons:
   p.use_smooth=True
   for li in p.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v.x/6,v.y/6)
 elif 'logical_edge_id' in o:
  roads.append(o)
  bm=bmesh.new();bm.from_mesh(o.data);bm.normal_update();bmesh.ops.reverse_faces(bm,faces=[f for f in bm.faces if f.normal.z<0]);bm.to_mesh(o.data);bm.free()
  o.data.materials.clear();o.data.materials.append(road)
  uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
  for p in o.data.polygons:
   for li in p.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v.x/4,v.y/4)
  edge=next(e for lane in S['display']['lanes'] for e in lane['edges'] if e['id']==o['logical_edge_id'])
  o['route_key']=edge['key'];o['route_kind']=edge['kind'];o['player_id']=0 if edge['id'].startswith('blue') else 1
 else:
  for i,m in enumerate(o.data.materials):
   if m and m.name.startswith('CLAY /'):
    o.data.materials[i]=basalt if 'strata' in m.name else steel if 'framework' in m.name else metal
 if o.name.startswith(('Ring_arc','Ring_concrete','Ring_cross','Personal_gate')):
  mod=o.modifiers.new('Machined worn edge / key asset only','BEVEL');mod.width=.07;mod.segments=2
  o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
# Replace the existing escarpment blockout wedges at their SAME locations with
# the existing fractured-basalt GLB. No new scatter or terrain layout.
wedges=[o for o in scene.objects if o.name.startswith('Exposed_fracture_stratum')]
before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(R/'dist/assets/models/meteorite.glb'))
rock_sources=[o for o in set(scene.objects)-before if o.type=='MESH']
coords=[o.matrix_world@Vector(v) for o in rock_sources for v in o.bound_box]
rmin=Vector(tuple(min(v[i] for v in coords) for i in range(3)));rmax=Vector(tuple(max(v[i] for v in coords) for i in range(3)));rc=(rmin+rmax)/2
for k,w in enumerate(wedges):
 pts=[w.matrix_world@v.co for v in w.data.vertices];lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)));center=(lo+hi)/2
 factor=5.7/(rmax.x-rmin.x)
 for j,source_rock in enumerate(rock_sources):
  o=source_rock.copy();o.data=source_rock.data.copy();w.users_collection[0].objects.link(o);o.name='Basalt_escarpment_%02d_%d'%(k,j)
  mw=source_rock.matrix_world.copy();o.parent=None;o.matrix_world=mw
  for v in o.data.vertices:v.co=(mw@v.co-Vector((rc.x,rc.y,rmin.z)))*factor+Vector((center.x,center.y,lo.z-.3))
  o.matrix_world.identity()
 bpy.data.objects.remove(w,do_unlink=True)
for o in set(scene.objects)-before:
 if o in rock_sources or (o.type!='MESH' and not o.name.startswith('Basalt_escarpment')):bpy.data.objects.remove(o,do_unlink=True)

# Preserve an independent anchor for every event, with original game coordinates.
C=bpy.data.collections.new('09_GAMEPLAY_ANCHORS');scene.collection.children.link(C)
for lane in S['display']['lanes']:
 for e in lane['events']:
  o=bpy.data.objects.new('ANCHOR_'+e['id'].replace('/','_'),None);C.objects.link(o);x,y=e['xy'];o.location=(x,y,0);o['event_id']=e['id'];o['source_point']=e['source_point']
# Clear just the Phase 02 stencils; roads will receive state-driven highlights.
for o in list(scene.objects):
 if any(t in o.name for t in ['/id_line','/dash','/rock_site','/trigger','/line']):bpy.data.objects.remove(o,do_unlink=True)
# Gates: existing frame remains, one separately exported retracting panel per player.
doors=[]
for i,x in enumerate([-24.5,24.5]):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-6.5,4.02));o=bpy.context.object;o.name='DOOR_'+str(i);o.dimensions=(2.62,.22,2.65);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(metal)
 mod=o.modifiers.new('Shutter edge','BEVEL');mod.width=.06;mod.segments=2;o['player_id']=i;doors.append(o)
# A real independent fissure mesh follows the EXISTING central terrain surface.
vs=[o.matrix_world@v.co for o in terrain for v in o.data.vertices];tree=kdtree.KDTree(len(vs))
for i,v in enumerate(vs):tree.insert((v.x,v.y,0),i)
tree.balance()
def z_at(x,y):return vs[tree.find((x,y,0))[1]].z
fissuremat=material('Fault / cold exposed energy',(.015,.07,.11),.05,.9)
p=principled(fissuremat);p.inputs['Emission Color'].default_value=(.025,.36,.75,1);p.inputs['Emission Strength'].default_value=2
fissures=[]
for i in range(24):
 x=-25+i*2.1;y=2+1.2*math.sin(i*1.5);x2=x+2.25;y2=2+1.2*math.sin((i+1)*1.5)
 verts=[(x,y-.2,z_at(x,y)+.09),(x,y+.2,z_at(x,y)+.09),(x2,y2+.3,z_at(x2,y2)+.09),(x2,y2-.3,z_at(x2,y2)+.09)]
 me=bpy.data.meshes.new('Fault segment');me.from_pydata(verts,[],[(0,1,2,3)]);me.materials.append(fissuremat);o=bpy.data.objects.new('FAULT_%02d'%i,me);C.objects.link(o);o['event_role']='shared_quake';fissures.append(o)
# Root families to export independently. Rovers are loaded from the existing dedicated GLBs.
beacons=[bpy.data.objects['BEACON_BLUE'],bpy.data.objects['BEACON_GOLD']]
beacon_objects={o for root in beacons for o in [root,*root.children_recursive]}
rover_objects={o for name in ['ROVER_BLUE','ROVER_GOLD'] for o in [bpy.data.objects[name],*bpy.data.objects[name].children_recursive]}
for o in rover_objects:o.hide_render=True
interactive=set(roads+doors+fissures)|beacon_objects|set(C.objects)
# Pack self-contained editable production scene before export-only mesh merging.
bpy.ops.file.pack_all();scene['phase']='Playable ruins: Phase02 layout preserved, source GLB materials restored'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'moonfall-ruins.blend'))
def export(path,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_apply=True,export_image_format='AUTO')
export(OUT/'interactive.glb',interactive)
# Merge only runtime static geometry; .blend above keeps editable individual assets.
static=[o for o in scene.objects if o.type in ['MESH','CURVE'] and o not in interactive and o not in rover_objects]
# Apply object-level bevels before joining and retain original UV/material data.
bpy.ops.object.select_all(action='DESELECT')
for o in static:o.select_set(True)
bpy.context.view_layer.objects.active=static[0];bpy.ops.object.convert(target='MESH')
static=[o for o in bpy.context.selected_objects if o.type=='MESH']
for o in static:
 mw=o.matrix_world.copy();o.parent=None;o.matrix_world=mw
bpy.context.view_layer.objects.active=static[0];bpy.ops.object.join();merged=bpy.context.object;merged.name='STATIC_RUINS'
# Join can retain redundant material slots: remap to one slot per material.
slots=list(merged.data.materials);unique=[];indices=[]
for m in slots:
 if m not in unique:unique.append(m)
 indices.append(unique.index(m))
old=[p.material_index for p in merged.data.polygons];merged.data.materials.clear()
for m in unique:merged.data.materials.append(m)
for p,i in zip(merged.data.polygons,old):p.material_index=indices[i]
export(OUT/'static-scene.glb',[merged])
# Full source geometry + small runtime metadata, no physical coordinate replacement.
(ART/'map_spec.json').write_text(json.dumps(S,ensure_ascii=False,indent=2))
runtime={'schema':'moonfall-ruins/1','scale':S['display']['scale'],'lane_offset':32,'lanes':S['display']['lanes'],'cameras':S['display']['cameras'],'assets':S['display']['assets'],'coordinate_mapping':'Blender(X,Y,Z) -> glTF/Three(X,Z,-Y)','source_engine_sha256':next(x['sha256'] for x in S['source_hashes'] if x['file']=='dist/engine.js'),'physical_board_unchanged':True}
(OUT/'map.json').write_text(json.dumps(runtime,ensure_ascii=False,indent=2))
report={'source_blend':str(SRC/'moonfall_blockout.blend'),'source_blend_sha256':hashlib.sha256((SRC/'moonfall_blockout.blend').read_bytes()).hexdigest(),'restored_material_slots':restored,'existing_asset_instances':17,'reused_basalt_clusters':len(wedges),'road_edges':len(roads),'static_materials':len(unique),'static_triangles':sum(len(p.vertices)-2 for p in merged.data.polygons),'exports':{p.name:p.stat().st_size for p in OUT.glob('*.glb')},'texture_credit':'Moon 04 / Poly Haven CC0; reused existing downloaded lunar simulant PBR maps','new_geometry':'gate panels and central fissure segments only; ring bevel modifiers; terrain layout unchanged'}
(ART/'export-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('RUINS_EXPORT_COMPLETE',json.dumps(report),flush=True)
