"""Second-pass station finish. Existing LAB_W footprint, parent and terrain stay fixed.
Used by refine_local_scene.py; no gameplay geometry is generated here.
"""
import bpy, math
import numpy as np
from mathutils import Vector

def ensure_gltf_group():
 from io_scene_gltf2.blender.com.material_helpers import create_settings_group
 group=bpy.data.node_groups.get('glTF Material Output')
 if group is None:return create_settings_group('glTF Material Output')
 # Older authored groups may contain only AO. Complete the current importer interface.
 existing={item.name for item in group.interface.items_tree}
 for name,value in [('Thickness',0),('Dispersion',0),('Iridescence Factor',0),('Iridescence Thickness Minimum',100)]:
  if name not in existing:
   socket=group.interface.new_socket(name=name,in_out='INPUT',socket_type='NodeSocketFloat');socket.default_value=value
 return group

def improve_station(root, output):
 scene=bpy.context.scene
 def find(name):return bpy.data.objects['LAB refined / '+name]
 def principled(m):return next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 # Dedicated clean coated-metal materials: old crater-like normal was oversized on the hull.
 mats={}
 for suffix,col,metal,rough in [('ceramic titanium shell',(.42,.39,.335),.24,.47),('folded roof',(.19,.215,.23),.52,.43),('structural seams',(.075,.09,.105),.6,.48),('recessed glazing',(.18,.105,.035),.22,.24)]:
  m=bpy.data.materials['LOCAL / '+suffix];p=principled(m)
  p.inputs['Base Color'].default_value=(*col,1);m.diffuse_color=(*col,1)
  p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
  for n in m.node_tree.nodes:
   if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.045 if suffix!='structural seams' else .08
  mats[suffix]=m
 glass=mats['recessed glazing'];p=principled(glass);p.inputs['Emission Color'].default_value=(1,.47,.12,1);p.inputs['Emission Strength'].default_value=.75
 lamp=bpy.data.materials['LOCAL / warm interior'];p=principled(lamp);p.inputs['Base Color'].default_value=(.65,.27,.045,1);p.inputs['Emission Color'].default_value=(1,.46,.09,1);p.inputs['Emission Strength'].default_value=2
 shell=mats['ceramic titanium shell'];roof=mats['folded roof'];trim=mats['structural seams']
 def finish(o,m,bevel=.06):
  o.data.materials.clear();o.data.materials.append(m)
  if bevel:
   mod=o.modifiers.new('Precision edge radius','BEVEL');mod.width=bevel;mod.segments=5
   mod=o.modifiers.new('Architectural face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
  for poly in o.data.polygons:poly.use_smooth=True
  mw=o.matrix_world.copy();o.parent=root;o.matrix_world=mw
  return o
 def box(name,xyz,size,m,bevel=.06):
  bpy.ops.mesh.primitive_cube_add(size=1,location=(-54+xyz[0],-17+xyz[1],xyz[2]))
  o=bpy.context.object;o.name='LAB precision / '+name;o.dimensions=size
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  return finish(o,m,bevel)
 for o in root.children_recursive:
  if o.type!='MESH' or not o.name.startswith('LAB refined'):continue
  for mod in o.modifiers:
   if mod.type=='BEVEL':mod.segments=5;mod.width=min(.14,mod.width*1.65)
  for poly in o.data.polygons:poly.use_smooth=True
 # Flat structural ribs follow the existing roof profile; replace tubular round trim only.
 for old in list(root.children_recursive):
  if old.type!='CURVE' or 'structural portal' not in old.name:continue
  pts=[Vector(pt.co[:3]) for pt in old.data.splines[0].points];verts=[]
  for p in pts:verts.extend([tuple(p+Vector((-.095,0,0))),tuple(p+Vector((.095,0,0)))])
  faces=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(pts)-1)]
  me=bpy.data.meshes.new('Roof structural strap');me.from_pydata(verts,[],faces);me.update()
  ob=bpy.data.objects.new('LAB precision / flat structural strap',me);scene.collection.objects.link(ob)
  sol=ob.modifiers.new('Pressed metal section','SOLIDIFY');sol.thickness=.075
  finish(ob,shell,.025);bpy.data.objects.remove(old,do_unlink=True)
 # A single recessed thermal cassette gives the broad roof a readable hierarchy.
 box('thermal cassette gasket',(0,0,6.105),(3.95,2.60,.065),trim,.12)
 box('thermal cassette',(0,0,6.145),(3.72,2.38,.07),roof,.11)
 for y in [-.72,-.24,.24,.72]:box('thermal channel',(0,y,6.185),(3.35,.035,.012),trim,.006)
 # Reuse the existing window and side inset; increase luminous panes, not miscellaneous greebles.
 find('side service cover').data.materials.clear();find('side service cover').data.materials.append(glass)
 for y in [-.35,.35,1.05]:box('side glazing divider',(3.455,y,4.60),(.035,.055,.65),shell,.012)
 box('side window sill',(3.458,.35,4.26),(.04,2.25,.045),lamp,.008)
 find('glazing').scale.z=1.20
 # A nested pressure-door surround and a visible split convey thickness and function.
 find('airlock door').data.materials.clear();find('airlock door').data.materials.append(shell)
 box('door center joint',(2.05,-3.645,4.26),(.028,.018,1.04),trim,.004)
 box('airlock light left',(1.42,-3.643,4.27),(.038,.02,1.12),lamp,.008)
 box('airlock light right',(2.68,-3.643,4.27),(.038,.02,1.12),lamp,.008)
 box('airlock header',(2.05,-3.625,5.16),(1.52,.12,.13),roof,.04)
 # Existing dish gets coherent optical-metal shading; no added antenna clutter.
 for o in root.children_recursive:
  if o.type=='MESH' and o.name.startswith('Tracking dish'):
   o.data.materials.clear();o.data.materials.append(roof)
   for poly in o.data.polygons:poly.use_smooth=True
 # Convert only the station's modifiers, then make one unique AO atlas on a second UV set.
 objects=[o for o in root.children_recursive if o.type=='MESH']
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.convert(target='MESH')
 objects=list(bpy.context.selected_objects)
 for o in objects:
  if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
  uv=o.data.uv_layers.new(name='StationAO');o.data.uv_layers.active=uv
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008);bpy.ops.object.mode_set(mode='OBJECT')
 image=bpy.data.images.new('Station baked contact AO',width=1024,height=1024,alpha=False);image.colorspace_settings.name='Non-Color'
 # Isolate the atlas from shared foundation/terrain materials outside this station.
 copies={}
 for o in objects:
  for i,m in enumerate(o.data.materials):
   if m not in copies:
    copies[m]=m.copy();copies[m].name='STATION / '+m.name.removeprefix('LOCAL / ')
   o.data.materials[i]=copies[m]
 station_mats=set(copies.values())
 group=ensure_gltf_group()
 for m in station_mats:
  nodes=m.node_tree.nodes;links=m.node_tree.links
  uv=nodes.new('ShaderNodeUVMap');uv.uv_map='StationAO'
  tex=nodes.new('ShaderNodeTexImage');tex.image=image;links.new(uv.outputs[0],tex.inputs['Vector']);nodes.active=tex
  oc=nodes.new('ShaderNodeGroup');oc.node_tree=group;links.new(tex.outputs['Color'],oc.inputs['Occlusion'])
 scene.render.engine='CYCLES';scene.cycles.samples=128;scene.render.bake.margin=8
 bpy.ops.object.bake(type='AO')
 # Denoise the static scalar AO atlas within the eight-pixel baked gutter.
 pixels=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1024,4)
 weights=np.array([1,4,6,4,1],dtype=np.float32)/16
 for axis in [0,1]:
  pixels=sum(np.roll(pixels,i-2,axis=axis)*w for i,w in enumerate(weights))
 pixels[:,:,3]=1;image.pixels.foreach_set(pixels.ravel());image.update()
 output.mkdir(parents=True,exist_ok=True);image.filepath_raw=str(output/'station-ao.png');image.file_format='PNG';image.save();image.pack()
 # Restore the original UV as active for base textures; the AO node explicitly chooses StationAO.
 for o in objects:o.data.uv_layers.active_index=0
 return {'parts':len(objects),'ao_resolution':[1024,1024],'layout_unchanged':True,'material_fix':'micro-normal scale and glTF occlusion atlas','model_fix':'flat roof straps, recessed thermal cassette, pressure-door surround, coherent glazing'}
