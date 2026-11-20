"""Reconstructed editable geometry inspired by supplied moon_map_cinematic_v2 renders.
Not a recovery of the source meshes. Artistic units: 10 per 200px cell, not hardware cm.
Blender --background --factory-startup --python tools/build_reference_library.py
"""
import bpy, bmesh, math, random, json
from pathlib import Path
from mathutils import Vector, Matrix
R=Path(__file__).resolve().parents[1]; OUT=R/'dist/assets/reference-models'; ART=R/'art/reference-library'
OUT.mkdir(parents=True,exist_ok=True); ART.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.render.engine='CYCLES';S.cycles.samples=32;S.cycles.use_denoising=True
S.render.fps=24;S.frame_start=1;S.frame_end=97;S.view_settings.view_transform='AgX'
random.seed(20261120); root=None; group=None; current=None; assets=[]

def material(name,color,metal=.0,rough=.8,texture=None,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes.clear()
 p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');o=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],o.inputs['Surface'])
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(ART/'textures'/f'{texture}.jpg'),check_existing=True);m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(ART/'textures/surface-normal.png'),check_existing=True);n.image.colorspace_settings.name='Non-Color';b=m.node_tree.nodes.new('ShaderNodeNormalMap');b.inputs['Strength'].default_value=.45;m.node_tree.links.new(n.outputs['Color'],b.inputs['Color']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
metal=material('Weathered titanium',(.24,.24,.23),.64,.68,'titanium');dark=material('Graphite steel',(.055,.062,.067),.6,.69);trim=material('Scuffed aluminium edges',(.3,.31,.3),.8,.48);rust=material('Oxidized copper fasteners',(.21,.13,.085),.65,.72)
rockmat=material('Fractured basalt',(.17,.18,.19),.05,.96,'basalt');soil=material('Pitted lunar regolith',(.15,.15,.15),0,.98,'regolith');solar=material('Blue photovoltaic cells',(.028,.075,.11),.64,.38);glass=material('Smoked optical glass',(.045,.075,.09),.7,.23)
black=material('Deep aperture',(.006,.008,.009),0,.95);blue=material('Ion cyan',(.19,.65,1),.25,.25,emission=3);purple=material('Relic ion violet',(.52,.16,.88),.1,.3,emission=3);amber=material('Navigation amber',(.9,.36,.09),.1,.4,emission=3);ice=material('Subsurface blue ice',(.18,.35,.42),.2,.4);cloth=material('Dust covered insulation',(.23,.21,.18),.05,.9);paint=material('Faded ceramic paint',(.36,.36,.32),.2,.82)

def add(o,name,mat):
 o.name=name
 if mat:o.data.materials.append(mat)
 if current:
  for c in list(o.users_collection):c.objects.unlink(o)
  current.objects.link(o)
 if root:o.parent=group or root
 return o

def box(name,p,size,mat=metal,angle=0):
 x,y,z=[a/2 for a in size]
 o=mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
 o.location=p;o.rotation_euler.z=angle;return o

def cyl(name,p,r,h,mat=metal,n=16,r2=None,rot=None):
 rt=r if r2 is None else r2
 v=[(rr*math.cos(j*math.tau/n),rr*math.sin(j*math.tau/n),z) for rr,z in [(r,-h/2),(rt,h/2)] for j in range(n)]
 f=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
 o=mesh(name,v,f,mat);o.location=p
 if rot:o.rotation_euler=rot
 return o

def rod(name,a,b,r=.035,mat=trim,n=8):
 a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,n);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def mesh(name,v,f,mat=metal):
 d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new(name,d);S.collection.objects.link(o);return add(o,name,mat)

def poly(name,xy,z,depth,mat=metal):
 if name=='Broken monolithic plate':
  cx=sum(x for x,y in xy)/len(xy);cy=sum(y for x,y in xy)/len(xy);jagged=[]
  for a,b in zip(xy,xy[1:]+xy[:1]):
   for j in range(5):
    t=j/5;x=a[0]*(1-t)+b[0]*t;y=a[1]*(1-t)+b[1]*t;inset=random.uniform(0,.12) if j else 0;jagged.append((x+(cx-x)*inset,y+(cy-y)*inset))
  xy=jagged
 n=len(xy);return mesh(name,[(x,y,z-depth) for x,y in xy]+[(x,y,z) for x,y in xy],[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)

def rock(p,size=1,mat=rockmat,sub=1):
 d=bpy.data.meshes.new('Fractured stone');bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=sub,radius=1)
 for v in bm.verts:v.co*=random.uniform(.77,1.19)
 bm.to_mesh(d);bm.free();d.update();o=bpy.data.objects.new('Angular fractured stone',d);S.collection.objects.link(o);add(o,'Angular fractured stone',mat)
 o.location=p;o.scale=(size*1.3,size,size*.72);o.rotation_euler=(random.random(),random.random(),random.random()*6.28);return o

def tube(name,pts,r=.035,mat=rust):
 for a,b in zip(pts,pts[1:]):rod(name,a,b,r,mat)

def bolts(x,y,z,w,d):
 for sx in [-1,1]:
  for sy in [-1,1]:cyl('Recessed hex bolt',(x+sx*(w/2-.12),y+sy*(d/2-.12),z),.055,.045,rust,6)

def panel(x,y,z,w,d):
 box('Equipment casing',(x,y,z-.22),(w,d,.44),dark);box('Raised removable cover',(x,y,z),(w-.12,d-.12,.06),metal);bolts(x,y,z+.05,w,d)
 for sx in [-1,1]:box('Panel frame',(x+sx*(w/2-.05),y,z+.02),(.065,d,.08),trim)
 for sy in [-1,1]:box('Panel frame',(x,y+sy*(d/2-.05),z+.02),(w,.065,.08),trim)
 for i in range(max(1,int(d/.25))):box('Vent slit',(x+w*.25,y-d*.3+i*.15,z+.04),(w*.23,.035,.015),dark)

def solarwing(x,y,z,w,d):
 box('Solar tray',(x,y,z),(w+.12,d+.12,.13),trim)
 for i in range(max(1,int(w/.27))):
  for j in range(max(1,int(d/.33))):
   nx=max(1,int(w/.27));ny=max(1,int(d/.33));box('Individual photovoltaic cell',(x-w/2+(i+.5)*w/nx,y-d/2+(j+.5)*d/ny,z+.075),(w/nx-.025,d/ny-.025,.015),solar)
 for sx in [-1,1]:box('PV rail',(x+sx*w/2,y,z+.1),(.045,d+.16,.08),rust)

def tank(x,y,z,length=2,r=.43,axis='Y'):
 rot=(math.pi/2,0,0) if axis=='Y' else (0,math.pi/2,0)
 cyl('Pressure vessel',(x,y,z),r,length,metal,24,rot=rot)
 for off in [-length*.5,-length*.33,0,length*.33,length*.5]:
  p=(x,y+off,z) if axis=='Y' else (x+off,y,z);cyl('Vessel reinforcement band',p,r+.04,.065,trim,24,rot=rot)
 for off in [-length*.52,length*.52]:
  p=(x,y+off,z) if axis=='Y' else(x+off,y,z);cyl('Pressure cap',p,r*.83,.13,dark,24,rot=rot)

def antenna(x,y,z):
 rod('Antenna mast',(x,y,z),(x,y,z+1.7),.035);rod('Whip receiver',(x+.3,y,z),(x+.38,y,z+2.3),.018,rust)
 cyl('Antenna radome',(x,y,z+1.72),.09,.13,paint)

def dish(x,y,z,r=.5):
 v=[];f=[]
 for k in range(7):
  for j in range(32):
   t=j*math.tau/32;a=r*k/6;v.append((x+a*math.cos(t),y+a*math.sin(t),z+.42*(a/r)**2))
 for k in range(6):
  for j in range(32):a=k*32+j;b=k*32+(j+1)%32;f.append((a,b,b+32,a+32))
 mesh('Parabolic antenna',v,f,metal);rod('Dish feed',(x,y,z),(x,y,z+.65),.025)

def truss(a,b,width=.3):
 a,b=Vector(a),Vector(b);side=Vector((width,0,0)) if abs(a.x-b.x)<abs(a.y-b.y) else Vector((0,width,0))
 for s in [-1,1]:rod('Truss chord',a+side*s,b+side*s,.05,metal)
 for i in range(6):rod('Truss diagonal',a.lerp(b,i/6)+side*(-1 if i%2 else 1),a.lerp(b,(i+1)/6)+side*(1 if i%2 else -1),.025,rust)

def begin(id,label,cell,animated=False,span=(1,1)):
 global root,group,current
 current=bpy.data.collections.new(id+' • '+label);S.collection.children.link(current);root=bpy.data.objects.new(id,None);current.objects.link(root);group=None
 root['reference_cell']=cell;root['reconstruction']='Original geometry reconstructed from raster reference';root['units']='artistic units, not calibrated centimeters'
 a=dict(id=id,name=label,cell=cell,animated=animated,span=span,root=root,collection=current);assets.append(a);print('MODELING',id,flush=True);return a

def moving(name):
 global group
 group=bpy.data.objects.new(name,None);current.objects.link(group);group.parent=root;return group

def keys(o,path,values):
 for f,v in values:setattr(o,path,v);o.keyframe_insert(data_path=path,frame=f)

def ring(name,r,z,mat=blue,width=.03,n=96,warp=0):
 pts=[]
 for j in range(n+1):
  t=j/n*math.tau;rr=r+warp*math.sin(t*7);pts.append((rr*math.cos(t),rr*math.sin(t),z+warp*math.sin(t*5)))
 tube(name,pts,width,mat)

def debris(n=24,r=4):
 for i in range(n):
  t=random.random()*math.tau;rr=random.uniform(r*.8,r*1.1);s=random.uniform(.08,.33);rock((rr*math.cos(t),rr*math.sin(t),s*.2),s)

def beacon(id,label,cell,angle):
 global group
 begin(id,label,cell,True);panel(0,0,.55,1.35,1.35);cyl('Signal hub',(0,0,.84),.42,.25,trim,12);antenna(0,0,.9)
 for i in range(4):
  t=angle+i*math.pi/2;g=moving('Fixed array assembly');solarwing(0,2.45,.65,.95,3.15);truss((0,.7,.35),(0,3.9,.35),.24);g.rotation_euler.z=t
 group=None;g=moving('Beacon activation');box('Illuminated central cell',(0,0,1.0),(.42,.42,.04),blue)
 for i in range(4):
  t=angle+i*math.pi/2
  for s in [-1,1]:
   a=Vector((s*.35,1.0,.78));b=Vector((s*.35,3.95,.78));M=Matrix.Rotation(t,4,'Z');rod('Illuminated array strip',M@a,M@b,.024,blue)
 keys(g,'scale',[(1,(.001,)*3),(20,(.001,)*3),(32,(1,)*3),(97,(1,)*3)])
 group=None

# 01. A true-sided trench with crystalline seams and an articulated excavation arm.
def mine(id,label,cell,crystal=False):
 global group
 begin(id,label,cell);g=moving('Diagonal excavation');g.rotation_euler.z=-.62
 for side in [-1,1]:
  xy=[]
  for j in range(12):xy.append((side*(.6+random.random()*.3),-4+j*8/11))
  xy += [(side*2.0,4),(side*2.0,-4)]
  poly('Broken rim slab',xy,.05,.55,rockmat)
  for j in range(14):
   y=-3.8+j*.56;rock((side*1.1,y,.13),random.uniform(.25,.6));cyl('Exposed mineral spear',(side*.55,y,-.12),random.uniform(.12,.27),random.uniform(.4,1),ice,5,r2=.01,rot=(side*.45,.2,0))
 box('Trench floor',(0,0,-.5),(1.7,8,.1),black)
 for j in range(12):rock((random.uniform(-.4,.4),random.uniform(-3.8,3.8),-.28),.28,ice,1)
 group=None;panel(2.2,-1,.65,2.0,2.5)
 for x in [1.4,3.0]:box('Crawler belt',(x,-1,.25),(.43,2.75,.4),dark)
 for y in [-2,-1.65,-1.3,-.95,-.6,-.25]:box('Track cleat',(2.2,y,.48),(2.15,.08,.09),trim)
 for a,b in [((2,-1,.9),(1.2,.1,2)),((1.2,.1,2),(-.1,.6,1))]:rod('Excavator arm',a,b,.13,metal);rod('Hydraulic ram',Vector(a)+Vector((.15,0,0)),Vector(b)+Vector((.15,0,0)),.045,rust)
 box('Mining bucket',(-.1,.6,.8),(.7,.65,.5),dark)
 if crystal:
  for y in [-2.7,2.7]:truss((2.6,y,.2),(2.6,y,2.5),.25);truss((2.6,y,2.5),(-.5,y,1.2),.18)
  tank(3.2,0,.8,2.0,.35)
 debris(20,3.8)
mine('ice-mine','水冰矿坑','B1')
beacon('beacon-1','信标塔 01','D1',-.78)
# 03. Ribbed pressure habitat, layered thermal shields and support feet.
begin('abandoned-camp','废弃营地','F1');tank(0,0,1.0,5.2,.93,'X')
for x in [-2.5,-2,-1.5,-1,-.5,0,.5,1,1.5,2,2.5]:cyl('Habitat cooling rib',(x,0,1),1.0,.09,trim,32,rot=(0,math.pi/2,0))
for x in [-2,2]:
 for y in [-1,1]:box('Habitat footing',(x,y,.18),(.7,.65,.35),dark);rod('Habitat support',(x,y,.3),(x,y*.7,1),.09)
for sy in [-1,1]:
 x=-2*sy;y=sy*2;poly('Triangular thermal canopy',[(x-.95,y-.7),(x+.8,y-.7),(x+.95,y+.6),(x-.6,y+.9)],1.15,.03,cloth)
 for dx,dy in [(-.95,-.7),(.8,-.7),(.95,.6),(-.6,.9)]:rod('Canopy tension stay',(x,y,1.5),(x+dx,y+dy,1.16),.018);rod('Canopy leg',(x+dx,y+dy,0),(x+dx,y+dy,1.15),.025)
# 04. Octagonal bolted landing pad with physically sliding doors.
begin('landing-pad','着陆平台','H1',True)
xy=[(3.6*math.cos(math.pi/8+j*math.tau/8),3.6*math.sin(math.pi/8+j*math.tau/8)) for j in range(8)]
poly('Octagonal chassis',xy,.34,.5,dark);poly('Landing deck',[(x*.94,y*.94) for x,y in xy],.4,.12,metal)
for a,b in zip(xy,xy[1:]+xy[:1]):
 rod('Outer bumper',(*a,.54),(*b,.54),.10,trim);panel(a[0]*.92,a[1]*.92,.58,.47,.47)
for sy in [-1,1]:
 g=moving('Sliding landing plate');panel(0,sy*1.2,.61,4.5,2.2)
 for x in [-1.8,1.8]:box('Pad marking',(x,sy*1.2,.67),(.055,1.6,.015),paint)
 keys(g,'location',[(1,(0,0,0)),(24,(0,0,0)),(65,(0,sy*1.1,0)),(97,(0,sy*1.1,0))])
group=None
for j in range(8):t=j*math.tau/8;box('Amber landing marker',(3.3*math.cos(t),3.3*math.sin(t),.65),(.15,.15,.05),amber)
# 05. U-shaped supply yard, actual crates, tarp and lifting arm.
begin('supply-station','补给站','A2',True)
for y in [-2.35,2.35]:panel(0,y,.8,4.5,1.15)
panel(-2.4,0,.65,1.1,2.8)
for y in [-1.05,-.35,.35,1.05]:panel(1.7,y,.43,.65,.6)
poly('Tensioned storage tarp',[(-1,1),(1.8,1),(1,-1.1)],1.6,.025,cloth)
for p in [(-1,1),(1.8,1),(1,-1.1)]:rod('Tarp guy cable',(*p,1.6),(p[0]*1.2,p[1]*1.4,.1),.02,rust)
g=moving('Supply gantry');rod('Crane pillar',(2.5,1.2,0),(2.5,1.2,2.4),.12);rod('Crane jib',(2.5,1.2,2.4),(.8,1.2,2.4),.10);rod('Suspension cable',(.8,1.2,2.4),(.8,1.2,.8),.015,dark);keys(g,'rotation_euler',[(1,(0,0,0)),(30,(0,0,0)),(70,(0,0,-.4)),(97,(0,0,-.4))]);group=None
mine('crystal-mine','晶矿采掘场','C2',True)
# 07. Stepped, actually open central shaft; thick broken polygon slabs, engraved inlays.
begin('central-ruin','中央遗迹','D2',True,(2,2));g=moving('Diamond architecture');g.rotation_euler.z=math.pi/4
for k in range(5):
 a=2.15+k*.54;outer=a+.5;z=-.7+k*.29
 for side in [-1,1]:
  box('Stepped aperture ledge',(side*(a+.25),0,z),(.5,outer*2,.24),metal);box('Stepped aperture ledge',(0,side*(a+.25),z),(a*2,.5,.24),metal)
box('Open dark shaft floor',(0,0,-1.1),(4.3,4.3,.12),black)
for side in [-1,1]:
 for y in [-4.6,4.6]:box('Ruined foundation beam',(side*4.7,y,.28),(1.0,3,.65),rockmat)
 slabs=[[(2.7,-1.9),(5.7,-2.2),(5.3,1.1),(3.2,2.5)],[(2.6,2.9),(5.5,2.1),(5.9,5.8),(3.1,5.1)],[(1.6,4.2),(-1.7,5.9),(-2.7,3.7),(.4,2.8)]]
 for si,xy in enumerate(slabs):
  pts=[(side*x,side*y) for x,y in xy];poly('Broken monolithic plate',pts,1.0+si*.16,.55,rockmat)
  # triangular panel seams and mineral inlays follow the solid upper face
  c=(sum(x for x,y in pts)/len(pts),sum(y for x,y in pts)/len(pts))
  for a,b in zip(pts,pts[1:]+pts[:1]):rod('Plate edge erosion',(*a,1.03+si*.16),(*b,1.03+si*.16),.025,trim);rod('Fracture inlay',(*a,1.04+si*.16),(*c,1.04+si*.16),.018,rust)
 for si,xy in enumerate(slabs):
  pts=[Vector((side*x,side*y,1.06+si*.16)) for x,y in xy];c=sum(pts,Vector())/len(pts)
  for j in range(10):
   a=pts[j%4].lerp(pts[(j+1)%4],random.uniform(.08,.9));b=pts[(j+2)%4].lerp(c,random.uniform(.15,.75));mid=a.lerp(b,.5)+Vector((random.uniform(-.12,.12),random.uniform(-.12,.12),0));tube('Fine branching mineral fracture',[a,mid,b],.009,trim)
 for j in range(14):
  y=side*(4+j*.15);box('Chipped stair tread',(-1.5*side,y,.76-j*.045),(1.5,.16,.10),metal)
for i in range(70):
 x=random.uniform(-6,6);y=random.uniform(-6,6)
 if max(abs(x),abs(y))>4.2:rock((x,y,.2),random.uniform(.18,.65))
for x,y in [(-6,-4),(6,3),(-5,5),(4,-6)]:panel(x,y,1.0,.55,.55);box('Obelisk support',(x,y,.45),(.5,.5,.9),rockmat)
group=None;g=moving('Relic energy vortex')
for k in range(3):ring('Helical energy filament',3.0+k*.14,1.05+k*.1,purple,.025,128,.12)
keys(g,'scale',[(1,(.001,)*3),(20,(.001,)*3),(42,(1,)*3),(97,(1,)*3)]);keys(g,'rotation_euler',[(1,(0,0,0)),(97,(0,0,math.tau))]);group=None
# 08. Three electrode pairs, transform-animated plasma path, no billboard.
begin('arc-towers','电弧干扰塔','G2',True)
posts=[(-1.7,1.25),(1.65,1.25),(0,-2.0)]
for x,y in posts:
 panel(x,y,.28,1,1)
 for dx in [-.22,.22]:
  rod('High voltage electrode',(x+dx,y,.4),(x+dx,y,2.8),.065,trim)
  for j in range(7):cyl('Ceramic insulator',(x+dx,y,.55+j*.17),.115,.08,paint,12)
  cyl('Electrode cap',(x+dx,y,2.8),.08,.1,rust)
g=moving('Arc discharge')
for a,b in zip(posts,posts[1:]+posts[:1]):
 pts=[]
 for j in range(13):t=j/12;pts.append((a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t+random.uniform(-.1,.1),2.55+random.uniform(-.16,.16)))
 tube('Jagged plasma conductor',pts,.025,blue)
keys(g,'scale',[(1,(.001,)*3),(28,(.001,)*3),(29,(1,)*3),(33,(.001,)*3),(36,(1,)*3),(97,(1,)*3)]);group=None
# 09. Fuel farm and central docking machinery.
begin('landing-base','着陆基地','A3');panel(0,0,1.0,2.3,2.7)
for x in [-2.1,2.1]:
 solarwing(x,1.1,.7,1.35,2.2)
 for y in [-1.4,-.4]:tank(x,y,.6,1.3,.38,'X')
 tube('Fuel manifold',[(x,-2,.3),(x,-2.2,.6),(0,-2.2,.6),(0,-1,1)],.07)
for y in [-2.5,2.5]:panel(0,y,.2,2.4,1.2)
for x in [-2.8,2.8]:
 for y in [-2.4,2.4]:rod('Beacon post',(x,y,0),(x,y,.9),.035);cyl('Service light',(x,y,1),.08,.12,amber)
beacon('beacon-2','信标塔 02','C3',-.78)
# 11. Four-column excavator gantry, tanks, lattice braces and suspended drill.
begin('drilling-platform','钻井平台','F3')
for x in [-2.5,2.5]:
 panel(x,0,.35,.85,4.8)
 for y in [-2,2]:
  rod('Gantry column',(x,y,.4),(x,y,2.5),.12,metal);box('Column foot',(x,y,.5),(.5,.5,.5),dark)
 truss((x,-2,2.5),(x,2,2.5),.25)
for y in [-2,2]:truss((-2.5,y,2.5),(2.5,y,2.5),.22)
for x in [-.7,.7]:tank(x,2.2,1.6,1.6,.42)
rod('Drill shaft',(0,0,2.7),(0,0,-.2),.16,dark)
for j in range(13):
 t=j*.8;rod('Drill spiral flight',(.3*math.cos(t),.3*math.sin(t),1.3-j*.1),(.3*math.cos(t+.8),.3*math.sin(t+.8),1.2-j*.1),.08,trim)
for j in range(20):t=j*math.tau/20;rock((math.cos(t)*1.2,math.sin(t)*1.2,.05),.25)
# 12. Hexagonal pressure pod with six separate thick triangular roof panels.
begin('outpost-pod','前哨舱','H3');cyl('Hexagonal pressure hull',(0,0,.65),2.9,1.3,metal,6);cyl('Pod lower seal',(0,0,.2),3.05,.25,dark,6)
for i in range(6):
 t=i*math.tau/6;t2=(i+1)*math.tau/6;a=(2.8*math.cos(t),2.8*math.sin(t));b=(2.8*math.cos(t2),2.8*math.sin(t2))
 poly('Roof panel',[(a[0]*.96,a[1]*.96),(b[0]*.96,b[1]*.96),(0,0)],1.42,.12,metal);rod('Roof seam',(*a,1.51),(0,0,1.51),.045,dark);rod('Eave frame',(*a,1.45),(*b,1.45),.09,trim);panel(a[0],a[1],.5,.6,.6)
# 13. Torn spaceplane hull: actual triangle shell, open engine bells, spars and fragments.
begin('crashed-ship','坠毁飞船','B4');g=moving('Broken spaceplane');g.rotation_euler.z=.45
poly('Port torn wing',[(-.4,3.5),(-3,-1.2),(-1.0,-.45),(-.2,-2.5)],.55,.22,paint)
poly('Starboard torn wing',[(.4,2.8),(2.5,-2),(.9,-1.8),(.2,-2.7)],.7,.25,metal)
poly('Fuselage keel',[(-.7,-2.4),(.7,-2.4),(.5,.7),(0,3.4),(-.5,.7)],1.0,.6,metal)
poly('Fractured nose plate',[(-.4,1),(.4,1),(0,3.4)],1.35,.2,paint)
poly('Cockpit glazing',[(-.4,.5),(.4,.5),(.22,1.4),(-.22,1.4)],1.4,.08,glass)
for sx in [-1,1]:
 for j in range(7):rod('Exposed wing spar',(sx*.6,-2+j*.65,.8),(sx*(2.4-j*.23),-1.8+j*.55,.6),.035,rust)
 # Hollow engine nozzle mesh (not solid cone caps).
 v=[];f=[]
 for k,(y,r) in enumerate([(-1.1,.35),(-2,.4),(-2.8,.68),(-2.8,.57),(-2.05,.28)]):
  for j in range(32):t=j*math.tau/32;v.append((sx*.69+r*math.cos(t),y,.7+r*math.sin(t)))
 for k in range(4):
  for j in range(32):a=k*32+j;b=k*32+(j+1)%32;f.append((a,b,b+32,a+32))
 mesh('Hollow exhaust bell',v,f,dark)
 for j in range(12):t=j*math.tau/12;rod('Nozzle cooling rib',(sx*.69+.4*math.cos(t),-2,.7+.4*math.sin(t)),(sx*.69+.67*math.cos(t),-2.8,.7+.67*math.sin(t)),.018,trim)
for i in range(20):
 x,y=random.uniform(-3.5,3.5),random.uniform(-3.5,3.5);o=box('Torn hull debris',(x,y,.1),(random.uniform(.1,.6),random.uniform(.3,.9),.07),metal);o.rotation_euler=(random.uniform(-.5,.5),random.uniform(-.4,.4),random.random()*6.28)
group=None
# 14. Modeled crater with independent sinking annuli; terrain underneath is cut out.
begin('dust-sinkhole','月尘流沙坑','D4',True)
for k in range(5):
 g=moving('Subsiding annulus %d'%k);v=[];f=[]
 for r,z in [(k*.58+.25,-1.35+k*.26),(k*.58+.86,-1.05+k*.29)]:
  for j in range(80):t=j*math.tau/80;rr=r*(1+.035*math.sin(t*7+k));v.append((rr*math.cos(t),rr*math.sin(t),z+.06*math.sin(t*11)))
 for j in range(80):f.append((j,(j+1)%80,(j+1)%80+80,j+80))
 mesh('Fractured crater ledge',v,f,soil);keys(g,'location',[(1,(0,0,0)),(20+k*8,(0,0,0)),(70+k*4,(0,0,-.4*(1-k/5))),(97,(0,0,-.4*(1-k/5)))]);keys(g,'rotation_euler',[(1,(0,0,0)),(97,(0,0,.03*(5-k)))])
group=None;box('Crater deep floor',(0,0,-1.9),(1,1,.2),black);debris(20,3.4)
# 15. Cross plan laboratory with faceted observation cupola and moving dish.
begin('research-station','科研站','E4',True)
for x,y,w,d in [(-2,0,2,1.6),(2,0,2,1.6),(0,-2,1.5,2.6)]:
 panel(x,y,.95,w,d)
 for sx in [-1,1]:rod('Landing strut',(x+sx*w*.35,y,.8),(x+sx*w*.45,y,.1),.075)
cyl('Cupola base',(0,0,1.0),1.2,.7,dark,6);cyl('Faceted observation glazing',(0,0,1.65),1.15,.65,glass,6,r2=.55)
for j in range(6):
 t=j*math.tau/6;rod('Cupola mullion',(1.15*math.cos(t),1.15*math.sin(t),1.33),(.55*math.cos(t),.55*math.sin(t),1.98),.045,trim)
solarwing(0,2.3,1.7,2.5,.9);truss((0,1,.5),(0,2.3,1.6),.2);antenna(2,1.4,1)
g=moving('Tracking dish');dish(-1.1,1.5,1.1,.55);keys(g,'rotation_euler',[(1,(0,0,0)),(97,(0,0,.55))]);group=None
beacon('beacon-3','信标塔 03','G4',-.78)
# 17. Dual rail isotope separator and compressor skid.
begin('helium-extractor','氦-3 采矿机','C5')
for x in [-2,2]:
 panel(x,0,.65,1.1,4.7)
 for j in range(14):box('Separator fin',(x,-1.9+j*.29,1.0),(.75,.07,.52),trim)
for y in [-1.6,-.6,.6,1.6]:tank(0,y,.65,2.7,.36,'X')
for x in [-1.2,1.2]:tube('Pumping manifold',[(x,-2.6,.3),(x,-2.6,1.2),(x,2.6,1.2),(x,2.6,.3)],.085,rust)
antenna(2,1.8,1.3)
# 18. Broken catwalk with physical grating, split ends, railing and crossbracing.
begin('broken-walkway','断裂栈道','E5')
for i,(cx,cy,ang) in enumerate([(-.7,2,.7),(.7,0,-.65),(-.5,-2,.7)]):
 g=moving('Disconnected catwalk section');g.location=(cx,cy,.45 if i!=1 else .1);g.rotation_euler=(.06*i,.12*i,ang)
 for x in [-.55,.55]:box('Catwalk stringer',(x,0,0),(.1,2.8,.2),dark)
 for j in range(18):box('Open metal grating',(0,-1.35+j*.15,.05),(1.1,.055,.06),metal)
 for x in [-.55,.55]:
  for y in [-1.3,0,1.3]:rod('Rail post',(x,y,.05),(x,y,.8),.025)
  rod('Hand rail',(x,-1.3,.8),(x,1.3,.8),.03,rust);truss((x,-1.2,-.2),(x,1.2,-.2),.1)
group=None
# 19. Probe with broken photovoltaic sails and exposed instruments.
begin('probe-wreck','探测器残骸','G5');panel(-.7,0,.55,1.8,1.8);dish(-.7,0,.9,.45)
for x,y,ang in [(1.3,1.5,-.5),(1.7,-1.4,.4)]:
 g=moving('Bent solar wing');g.location=(x,y,0);g.rotation_euler=(.24,0,ang);solarwing(0,0,.3,2,1.2);group=None;rod('Snapped array boom',(-.7,0,.6),(x,y,.3),.045)
for x,y in [(-2,2),(2.7,1),(-1,-2.3)]:rod('Bent aerial',(-.7,0,.6),(x,y,1.3),.02,rust)
debris(12,2.6)
# 20. Ballistic meteor, impact rays and actual fragments with animated transforms.
begin('meteor-impact','陨石坠落','H5',True);g=moving('Ballistic meteor');rock((0,0,0),.65,rockmat,2)
keys(g,'location',[(1,(-3,1,9)),(35,(-1.5,.5,5)),(49,(0,0,.1)),(97,(0,0,.1))]);keys(g,'rotation_euler',[(1,(0,0,0)),(49,(2,3,1)),(97,(2,3,1))]);group=None
for j in range(18):
 g=moving('Ejected basalt fragment');sz=random.uniform(.08,.24);rock((0,0,0),sz);t=j*math.tau/18;r=random.uniform(1,3)
 keys(g,'scale',[(1,(.001,)*3),(48,(.001,)*3),(49,(1,)*3),(97,(1,)*3)])
 keys(g,'location',[(1,(0,0,0)),(49,(0,0,.1)),(64,(r*.6*math.cos(t),r*.6*math.sin(t),random.uniform(.6,2))),(85,(r*math.cos(t),r*math.sin(t),sz*.25)),(97,(r*math.cos(t),r*math.sin(t),sz*.25))]);group=None
g=moving('Impact flash');ring('Impact shock front',1,.12,amber,.035,96);keys(g,'scale',[(1,(.001,)*3),(48,(.001,)*3),(50,(.6,.6,.6)),(65,(3.5,3.5,.12)),(75,(.001,)*3),(97,(.001,)*3)]);group=None

# Projection UVs make exported PBR materials identical in Blender and glTF.
def uv_mesh(o):
 uv=o.data.uv_layers.new(name='SurfaceUV') if not o.data.uv_layers else o.data.uv_layers.active
 for p in o.data.polygons:
  axis=max(range(3),key=lambda j:abs(p.normal[j]));axes=[j for j in range(3) if j!=axis]
  for li in p.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]*.75,v[axes[1]]*.75)

def optimize(collection):
 # Merge only geometry sharing a parent, keeping every moving assembly separate.
 buckets={}
 for o in list(collection.objects):
  if o.type=='MESH':uv_mesh(o);buckets.setdefault(o.parent,[]).append(o)
 for parent,obs in buckets.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=bpy.context.object;o.name=(parent.name if parent else 'Regolith')+' • editable solid geometry'
  # Beveled edges catch grazing light; export modifier geometry.
  if len(o.data.polygons)<20000:
   mod=o.modifiers.new('Machined edge bevel','BEVEL');mod.width=.015;mod.segments=1;mod.limit_method='ANGLE';mod.angle_limit=.65

def export(obs,path,anim=True):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=anim,export_animation_mode='SCENE',export_frame_range=True,export_force_sampling=True,export_apply=True)

manifest={'version':1,'provenance':'Reconstructed from supplied raster artwork; not recovered source geometry. Unseen surfaces and animation timing are newly designed.','units':'artistic units; 10 units per grid cell; not calibrated to hardware','mapSize':[1600,1000],'grid':[8,5],'assets':[]}
for a in assets:
 S.frame_set(1);optimize(a['collection']);export(list(a['collection'].objects),OUT/(a['id']+'.glb'),a['animated'])
 col=ord(a['cell'][0])-65;row=int(a['cell'][1])-1;px=(col+a['span'][0]/2)*200;py=(row+a['span'][1]/2)*200
 a['root'].location=((px-800)/20,(500-py)/20,0)
 manifest['assets'].append({k:a[k] for k in ['id','name','cell','animated','span']}|{'file':a['id']+'.glb','positionPx':[px,py],'position':[a['root'].location.x,0,-a['root'].location.y]})
 print('EXPORTED',a['id'],flush=True)

# Unified modeled regolith, with genuine openings underneath the pit/trenches.
root=None;group=None;current=bpy.data.collections.new('Lunar geological substrate');S.collection.children.link(current)
craters=[]
for i in range(120):
 x=random.uniform(-40,40);y=random.uniform(-25,25);r=random.uniform(.25,1.35)
 if all(math.hypot(x-a['root'].location.x,y-a['root'].location.y)>4 for a in assets):craters.append((x,y,r))
def height(x,y):
 h=-.18+.035*math.sin(x*7+y*4)+.045*math.cos(x*2-y*3)
 for a,b,r in craters:
  d=math.hypot(x-a,y-b)/r
  if d<1.5:h+=(-.34*r*max(0,1-d*d) if d<1 else 0)+.14*r*math.exp(-((d-1)/.16)**2)
 return h
v=[];f=[];nx=320;ny=200
for j in range(ny+1):
 for i in range(nx+1):x=-40+i*.25;y=-25+j*.25;v.append((x,y,height(x,y)))
def hole(x,y):
 for a in assets:
  xx=x-a['root'].location.x;yy=y-a['root'].location.y
  if a['id']=='dust-sinkhole' and math.hypot(xx,yy)<3.15:return True
  if a['id']=='central-ruin' and abs(xx)+abs(yy)<6.5:return True
  if a['id'] in ['ice-mine','crystal-mine']:
   u=xx*math.cos(.62)-yy*math.sin(.62);w=xx*math.sin(.62)+yy*math.cos(.62)
   if abs(u)<.85 and abs(w)<4:return True
 return False
for j in range(ny):
 for i in range(nx):
  if hole(-40+(i+.5)*.25,-25+(j+.5)*.25):continue
  a=j*(nx+1)+i;f.extend([(a,a+1,a+nx+2),(a,a+nx+2,a+nx+1)])
o=mesh('Cratered regolith with open fissures',v,f,soil)
for p in o.data.polygons:p.use_smooth=True
for i in range(6500):
 x=random.uniform(-39.7,39.7);y=random.uniform(-24.7,24.7)
 if hole(x,y):continue
 s=random.uniform(.025,.13) if i<5700 else random.uniform(.15,.38);rock((x,y,height(x,y)+s*.2),s)
optimize(current);export(list(current.objects),OUT/'terrain.glb',False)
S.frame_set(1);allobjects=[o for a in assets for o in a['collection'].objects]+list(current.objects);export(allobjects,OUT/'moon-map.glb')
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Lighting and cameras are intentionally excluded from glTF; editable in master blend.
world=bpy.data.worlds.new('Lunar fill');S.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.095,.11,.14,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.45
bpy.ops.object.light_add(type='SUN',location=(-20,25,40));sun=bpy.context.object;sun.name='Grazing lunar sunlight';sun.rotation_euler=(.55,-.5,-.5);sun.data.energy=3.0;sun.data.angle=.045
bpy.ops.object.light_add(type='AREA',location=(12,-8,20));fill=bpy.context.object;fill.name='Soft reflected fill';fill.data.energy=1800;fill.data.shape='DISK';fill.data.size=25
bpy.ops.object.camera_add(location=(0,0,90));cam=bpy.context.object;cam.name='Reference layout orthographic';cam.rotation_euler=(0,0,0);cam.data.type='ORTHO';cam.data.ortho_scale=84;S.camera=cam
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
S.render.resolution_x=1600;S.render.resolution_y=1000;S.render.resolution_percentage=100
for im in bpy.data.images:
 if im.source=='FILE':im.pack()
S.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(ART/'moon-map-reconstructed.blend'))
for name,frame,loc,target,scale,size in [
 ('overview',1,(0,0,90),(0,0,0),84,(1600,1000)),
 ('cinematic',64,(46,-60,73),(0,0,0),88,(1600,1100)),
 ('ruin-detail',64,(11,-8,18),(0,5,0),23,(1200,1000)),
 ('station-detail',64,(12,-23,12),(5,-10,1),11,(1100,900))]:
 S.frame_set(frame);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;S.render.resolution_x,S.render.resolution_y=size;S.render.filepath=str(ART/(name+'.png'));bpy.ops.render.render(write_still=True)
print('REFERENCE_LIBRARY_COMPLETE',flush=True)
