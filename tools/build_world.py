"""Deterministic, editable full 3D lunar course and six-wheel science rover.
Blender --background --python tools/build_world.py
Coordinates: Blender Z up; map px / 20 -> meters. No photographic backdrop.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]; OUT=R/'dist/assets/models'; OUT.mkdir(exist_ok=True)
random.seed(421)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene
S.render.engine='CYCLES';S.cycles.samples=32;S.cycles.use_denoising=True
S.world.color=(.08,.08,.08);S.view_settings.view_transform='AgX'

def mat(name,c,metal=0,rough=.8):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');o=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],o.inputs['Surface']);p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
soil=mat('Regolith • granular grey',(.22,.215,.20));roadmat=mat('Compressed lunar dust',(.29,.285,.265));stone=mat('Fractured basalt',(.15,.145,.135));cut=mat('Fresh fissure wall',(.10,.095,.085));metal=mat('Titanium satin',(.48,.49,.48),.72,.43);white=mat('Ceramic thermal panels',(.65,.64,.59),.2,.65);black=mat('Graphite mechanical joints',(.045,.045,.042),.5,.65);foil=mat('Multilayer thermal insulation',(.52,.32,.095),.7,.52);solar=mat('Photovoltaic cell',(.018,.035,.055),.65,.3);blue=mat('Mission blue ID',(.09,.38,.54),.45,.45);gold=mat('Mission ochre ID',(.66,.39,.08),.45,.45)
# Vertex albedo is exported; small-scale regolith shading is supplemented in WebGL.
vcol=soil.node_tree.nodes.new('ShaderNodeVertexColor');vcol.layer_name='RegolithColor';soil.node_tree.links.new(vcol.outputs['Color'],next(n for n in soil.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'])
for m in (soil,stone,roadmat,cut,foil):
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=36 if m!=foil else 24;n.inputs['Detail'].default_value=3;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.3;b.inputs['Distance'].default_value=.055;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])

def finish(o,name,m):
 o.name=name
 if m:o.data.materials.append(m)
 return o

def box(name,loc,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,m)
def cyl(name,loc,r,d,m,rot=(0,0,0),r2=None,n=16):
 if r2 is None:bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d,location=loc,rotation=rot)
 else:bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r2,depth=d,location=loc,rotation=rot)
 return finish(bpy.context.object,name,m)
def rod(name,a,b,r,m):
 a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,m,n=8);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def mesh(name,v,f,m):
 data=bpy.data.meshes.new(name);data.from_pydata(v,[],f);data.update();o=bpy.data.objects.new(name,data);S.collection.objects.link(o);finish(o,name,m);return o
def join(objs,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();o=bpy.context.object;o.name=name;return o
def export(objs,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',use_selection=True)
def coords(p,id):return ((p[0]-800)/20,(500-(270+p[1] if id==0 else 730-p[1]))/20)
routes=json.loads((R/'work/routes.json').read_text());segments=[]
for id in range(2):
 for e in routes.values():
  for pts in [e['points']]+([e['detour']] if e['detour'] else []):
   w=[coords(p,id) for p in pts];segments += list(zip(w,w[1:]))
def distseg(x,y,a,b):
 dx,dy=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)
def roaddist(x,y):return min(distseg(x,y,a,b) for a,b in segments)
craters=[]
for i in range(75):
 x=random.uniform(-49,49);y=random.uniform(-35,35);r=random.uniform(1,5.5)
 if roaddist(x,y)>r*.7:craters.append((x,y,r))
def height(x,y):
 h=.18*math.sin(x*.44+y*.63)+.12*math.cos(y*.85-x*.6)+.07*math.sin(x*4+y*3)
 for a,b,r in craters:
  d=math.hypot(x-a,y-b)/r
  if d<1.5:h+=(-r*.31*max(0,1-d*d) if d<1 else 0)+r*.16*math.exp(-((d-1.02)/.17)**2)
 fade=max(0,min(1,(roaddist(x,y)-1.1)/1.7));return -.12+h*fade
# True holes with descending sidewalls; loose lids animate independently.
def crackx(y,center):return 24+.26*math.sin((y-center)*3.2)+.09*math.sin((y-center)*8)
def inhole(x,y):
 return any(abs(y-c)<4.8 and abs(x-crackx(y,c))<.47 for c in (13.25,-13.25))
v=[];f=[];N=240;M=168
for j in range(M+1):
 y=-35+j*70/M
 for i in range(N+1):
  x=-50+i*100/N
  for c in (13.25,-13.25):
   if abs(y-c)<4.8:
    cx=crackx(y,c)
    if abs(x-cx)<.64:x=cx+(-.52 if x<cx else .52)
  v.append((x,y,height(x,y)))
for j in range(M):
 for i in range(N):
  a=j*(N+1)+i
  x=sum(v[k][0] for k in (a,a+1,a+N+1,a+N+2))/4;y=sum(v[k][1] for k in (a,a+1,a+N+1,a+N+2))/4
  if inhole(x,y):continue
  f.extend([(a,a+1,a+N+2),(a,a+N+2,a+N+1)])
# Continue the regolith beyond the playable sector so no board edge is visible.
outer=[];outerfaces=[]
for j in range(81):
 for i in range(81):
  x=-160+i*4;y=-160+j*4;outer.append((x,y,height(x,y)))
for j in range(80):
 for i in range(80):
  x=-160+(i+.5)*4;y=-160+(j+.5)*4
  if abs(x)<48 and abs(y)<33:continue
  a=j*81+i;outerfaces.append((a,a+1,a+82,a+81))
mesh('Distant regolith continuation',outer,outerfaces,roadmat)
terrain=mesh('Terrain • crater bowls and raised rims',v,f,soil)
ca=terrain.data.color_attributes.new(name='RegolithColor',type='BYTE_COLOR',domain='POINT')
for i,(x,y,z) in enumerate(v):
 c=.24+random.uniform(-.035,.035)+.018*math.sin(x*.33+y*.29);ca.data[i].color=(c,c*.98,c*.94,1)
for p in terrain.data.polygons:p.use_smooth=True
# Combined rock field excludes the playable road shoulders.
rocks=[]
for i in range(1150):
 x=random.uniform(-48,48);y=random.uniform(-33,33)
 if roaddist(x,y)<1.6 or inhole(x,y):continue
 size=random.uniform(.035,.2) if i<850 else random.uniform(.25,.9)
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1 if size<.2 else 2,radius=1,location=(x,y,height(x,y)+size*.25));o=bpy.context.object
 for vv in o.data.vertices:vv.co*=random.uniform(.78,1.17)
 o.scale=(size*1.3,size,size*.8);o.rotation_euler=(random.random(),random.random(),random.random()*6.28);finish(o,'Basalt debris',stone)
 for face in o.data.polygons:face.use_smooth=True
 rocks.append(o)
join(rocks,'Scattered basalt • modeled debris')
# A road is a raised solid ribbon with side faces, not a line or image.
for id in range(2):
 for key,e in routes.items():
  for detour,pts in [(False,e['points'])]+([(True,e['detour'])] if e['detour'] else []):
   ps=[coords(p,id) for p in pts];verts=[];faces=[];width=1.07 if detour else 1.16
   # A continuous mitered ribbon avoids overlapping coplanar segment caps.
   top=.055+list(routes).index(key)*.0015+(.0006 if detour else 0)
   for i,p in enumerate(ps):
    normals=[]
    if i>0:
     dx,dy=p[0]-ps[i-1][0],p[1]-ps[i-1][1];d=math.hypot(dx,dy);normals.append((-dy/d,dx/d))
    if i<len(ps)-1:
     dx,dy=ps[i+1][0]-p[0],ps[i+1][1]-p[1];d=math.hypot(dx,dy);normals.append((-dy/d,dx/d))
    nx=sum(n[0] for n in normals);ny=sum(n[1] for n in normals);d=math.hypot(nx,ny);nx/=d;ny/=d
    factor=width/max(.55,nx*normals[0][0]+ny*normals[0][1]);nx*=factor;ny*=factor
    verts.extend([(p[0]+nx,p[1]+ny,top),(p[0]-nx,p[1]-ny,top),(p[0]+nx,p[1]+ny,-.18),(p[0]-nx,p[1]-ny,-.18)])
   for i in range(len(ps)-1):
    k=i*4;faces += [tuple(k+t for t in ff) for ff in [(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]]
   faces += [(0,2,3,1),(len(verts)-4,len(verts)-3,len(verts)-1,len(verts)-2)]
   mesh(f'road_{id}_{key}'+('_detour' if detour else ''),verts,faces,roadmat)
# Each break lid has volume; split wall ribbons descend 2.6 m.
for id,c in enumerate((13.25,-13.25)):
 for side in [-1,1]:
  vv=[];ff=[]
  for j in range(41):
   y=c-5+j*.25;x=crackx(y,c)+side*.52;z=height(x,y);vv.extend([(x,y,z),(x-side*.15,y,-2.8)])
  for j in range(40):ff.append((j*2,j*2+1,j*2+3,j*2+2))
  mesh(f'Fissure wall {id} {side}',vv,ff,cut)
 for j in range(20):
  y=c-5+j*.5;x=crackx(y+.25,c);z=height(x,y)
  verts=[(x-.65,y,z+.015),(x+.65,y,z+.015),(crackx(y+.5,c)+.65,y+.5,z+.015),(crackx(y+.5,c)-.65,y+.5,z+.015)]
  verts += [(a,b,h-.4) for a,b,h in verts]
  mesh(f'fracture_{id}_{j}',verts,[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,7,6,5)],stone)
# Functional infrastructure: starting platforms, landing apron, comms arrays and blast fences.
fac=[];before=set(bpy.data.objects)
for id in range(2):
 accent=blue if id==0 else gold
 x,y=coords([70,0],id);box('Start platform',(x,y,-.08),(3.6,3.6,.24),metal)
 x,y=coords([1490,0],id);cyl('Octagonal landing apron',(x,y,-.01),3.15,.22,metal,n=8)
 for a in range(8):
  t=a*math.pi/4;cyl('Apron retaining bolt',(x+2.85*math.cos(t),y+2.85*math.sin(t),.17),.09,.15,black,n=8)
 # Portal posts (moving shutter added at runtime).
 x,y=coords([650,-100],id)
 for s in [-1,1]:
  box('Gate concrete footing',(x,y+s*1.35,.2),(.8,.6,.5),stone);box('Gate column',(x,y+s*1.35,1.15),(.2,.22,1.9),metal)
 box('Gate cross beam',(x,y,2.15),(.25,2.95,.25),metal)
 x,y=coords([285,-127],id);cyl('Beacon footing',(x,y,.1),.45,.3,black);rod('Beacon mast',(x,y,.2),(x,y,2.1),.07,metal);box('Beacon battery',(x,y,.6),(.4,.4,.65),white)
 for s in [-1,1]:
  box('Beacon photovoltaic panel',(x+s*.47,y,1.7),(.7,.8,.035),solar)
 cyl('Beacon ID',(x,y,2.2),.14,.17,accent)
 # Edge posts are real hardware; keep the course dark and restrained.
 for key in ['beaconRock','outerRock','common','safeRock']:
  pts=[coords(p,id) for p in routes[key]['points']]
  for a,b in zip(pts,pts[1:]):
   d=math.dist(a,b)
   for j in range(1,int(d/2.5)+1):
    t=j/(int(d/2.5)+1);xx=a[0]+(b[0]-a[0])*t;yy=a[1]+(b[1]-a[1])*t+1.07
    cyl('Route marker',(xx,yy,.16),.045,.5,metal,n=6);box('Reflective route tab',(xx,yy,.4),(.16,.045,.14),accent)
# Solar farm along the empty central divider.
for x in [-29,-16,-3,10]:
 for y in [-1.5,1.5]:
  rod('Array stanchion',(x,y,-.15),(x,y,.8),.08,metal)
  p=box('Array frame',(x,y,.85),(3.5,1.5,.09),metal);p.rotation_euler.x=.2
  for i in range(7):
   for j in range(3):
    p=box('Solar cell',(x-1.49+i*.495,y-.48+j*.48,.93+j*.096),( .46,.44,.025),solar);p.rotation_euler.x=.2
 box('Power controller',(x,0,.3),(1,.7,.6),white)
fac=[o for o in bpy.data.objects if o not in before];join(fac,'Mission infrastructure • arrays markers gates')
world=[o for o in bpy.data.objects if o.type=='MESH'];export(world,'lunar-world')
# Engineering-scale lunar rover: open wheels, six independent hubs, rocker-bogie arms,
# foil insulated equipment boxes, solar deck, stereoscopic mast, dish and sample arm.
roverobjs=[]
for id,accent in [(0,blue),(1,gold)]:
 before=set(bpy.data.objects);wheelgroups=[]
 box('Load-bearing chassis',(0,0,.72),(1.65,1.1,.15),metal)
 box('Insulated equipment bay',(-.12,0,.93),(1.3,.9,.32),foil)
 for y in [-.49,.49]:
  box('Thermal side panel',(-.1,y,.98),(1.28,.045,.35),white)
  for x in [-.6,-.3,0,.3,.5]:rod('Panel fastener',(x,y*1.02,.86),(x,y*1.02,1.12),.013,metal)
 box('Solar deck',(0,0,1.16),(1.95,1.55,.055),metal)
 for x in range(8):
  for y in range(6):box('Solar wafer',(-.85+x*.24,-.64+y*.255,1.195),(.224,.237,.012),solar)
 for side in [-1,1]:
  y=side*.86
  for a,b in [((.18,side*.56,.8),(.76,y,.42)),((.18,side*.56,.8),(-.43,y,.59)),((-.43,y,.59),(-.9,y,.42)),((-.43,y,.59),(-.12,y,.42))]:
   rod('Rocker-bogie titanium arm',a,b,.048,metal)
  for x in [-.9,-.12,.76]:
   cyl('Steering knuckle',(x,y,.52),.09,.28,black)
   wb=set(bpy.data.objects);wy=y+side*.12
   cyl('Wheel hub',(x,wy,.36),.115,.3,metal,(math.pi/2,0,0),n=24)
   for edge in [-1,1]:
    # A hollow toroidal rim; metal mesh is explicit rings and lacing.
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=(x,wy+edge*.145,.36),rotation=(math.pi/2,0,0),major_radius=.335,minor_radius=.016);finish(bpy.context.object,'Open wheel rim',metal)
   for j in range(24):
    t=j*math.tau/24;xx=x+math.sin(t)*.335;zz=.36+math.cos(t)*.335
    rod('Wheel mesh crossbar',(xx,wy-.145,zz),(xx,wy+.145,zz),.009,metal)
    if j%3==0:
     rod('Spoke',(x,wy+side*.11,.36),(xx,wy+side*.145,zz),.015,metal)
    for sign in [-1,1]:
     rod('Chevron grouser',(xx,wy,zz),(x+math.sin(t+.10)*.35,wy+sign*.155,.36+math.cos(t+.10)*.35),.018,metal)
   wo=join([o for o in bpy.data.objects if o not in wb],f'wheel_{side}_{x}')
   # Place pivot at hub to support real wheel rolling in Three.js.
   bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);S.cursor.location=(x,wy,.36);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');wheelgroups.append(wo)
 # Tall navigation mast with stereo lenses (no automobile windshield).
 rod('Navigation mast',(.5,.25,1.2),(.5,.25,2.05),.035,metal);box('Stereo head',(.53,.25,2.06),(.18,.4,.16),white)
 for y in [.09,.41]:cyl('Camera lens',(.635,y,2.06),.045,.035,black,(0,math.pi/2,0),n=20)
 rod('High gain dish mount',(-.55,-.25,1.2),(-.55,-.25,1.6),.025,metal)
 vv=[];ff=[]
 for ring in range(6):
  r=.29*ring/5
  for j in range(32):
   t=j*math.tau/32;vv.append((-.55+r*math.cos(t),-.25+r*math.sin(t),1.58+.18*(r/.29)**2))
 for ring in range(5):
  for j in range(32):a=ring*32+j;b=ring*32+(j+1)%32;ff.append((a,b,b+32,a+32))
 mesh('Parabolic high gain antenna',vv,ff,white);rod('Dish feed',(-.55,-.25,1.59),(-.55,-.25,1.88),.012,metal)
 rod('Whip antenna',(-.8,.5,1.2),(-.87,.5,2.25),.009,metal)
 for a,b in [((.85,-.3,.85),(1.13,-.4,.65)),((1.13,-.4,.65),(1.4,-.15,.28))]:rod('Sample manipulator',a,b,.045,metal)
 cyl('Sampling head',(1.4,-.15,.24),.11,.16,black)
 box('Mission identifier',(.85,0,.97),(.03,.42,.2),accent)
 for y in [-.47,.47]:cyl('Front hazard camera',(.85,y,.85),.045,.05,black,(0,math.pi/2,0))
 obs=[o for o in bpy.data.objects if o not in before];body=join([o for o in obs if o not in wheelgroups],'Rover body • science instruments');obs=[body]+wheelgroups
 export(obs,'science-rover-'+('blue' if id==0 else 'gold'));roverobjs+=obs
 # Keep both assets parked in the master Blender scene.
 x,y=coords([70,0],id)
 for o in obs:o.location.x+=x;o.location.y+=y;o.location.z+=.08
# Integrate the earlier lander as real geometry, then add trusswork and radiators.
for id in range(2):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/'lander.glb'))
 obs=[o for o in bpy.data.objects if o not in before];x,y=coords([1490,0],id)
 for o in obs:o.location.x+=x;o.location.y+=y;o.location.z+=.12
 before2=set(bpy.data.objects)
 for side in [-1,1]:
  box('Lander radiator',(x+side*.8,y,1.8),(.08,.9,1.3),white)
  for j in range(8):rod('Radiator coolant pipe',(x+side*.85,y-.4+j*.115,1.2),(x+side*.85,y-.4+j*.115,2.4),.014,metal)
  for yy in [-1,1]:rod('Lander diagonal brace',(x+side*.45,y+yy*.45,1.9),(x+side*1.2,y+yy*1.2,.25),.035,metal)
 additions=[o for o in bpy.data.objects if o not in before2]
 for o in obs+additions:o.name='lander_detail_'+o.name
export([o for o in bpy.data.objects if o.name.startswith('lander_detail_')],'landers-detailed')
# Save a complete, editable scene with useful camera and light.
bpy.ops.object.light_add(type='SUN',location=(-30,-20,50));sun=bpy.context.object;sun.name='Low lunar sun';sun.rotation_euler=(.55,-.5,-.4);sun.data.energy=3.2;sun.data.angle=.03
bpy.ops.object.camera_add(location=(4,-48,69));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=95;S.camera=cam
# Editable geological animation: fracture lids tilt, shear and descend with staggered timing.
for o in world:
 if o.name.startswith('fracture_'):
  j=int(o.name.split('_')[-1]);base=o.location.copy();o.keyframe_insert(data_path='location',frame=1);o.keyframe_insert(data_path='rotation_euler',frame=1)
  o.location.z-=1.2+(j%3)*.2;o.location.x+=(j%2-.5)*.3;o.rotation_euler.y=(j%2-.5)*.09;o.keyframe_insert(data_path='location',frame=45+j);o.keyframe_insert(data_path='rotation_euler',frame=45+j)
S.frame_start=1;S.frame_end=100;S.render.fps=25;S.frame_set(1)
S.render.resolution_x=1600;S.render.resolution_y=1000;S.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/lunar-world.blend'))
# A close view exposes the actual engineering geometry for review.
cam.location=(-32,-9,8);target=Vector((-36.5,11.5,1));cam.location=target+Vector((5,-7,4.5));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=5.4
S.render.resolution_x=1200;S.render.resolution_y=900;S.render.filepath=str(R/'art/rover-detail.png');bpy.ops.render.render(write_still=True)
print('FULL_3D_WORLD_COMPLETE',flush=True)
