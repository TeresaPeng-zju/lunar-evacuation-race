import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROUTES, bypass, length, sample } from './engine.js';
const clamp=THREE.MathUtils.clamp, smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const colors=[0x73bad0,0xcdb071];
export function worldPoint(p,id,y=.1){return new THREE.Vector3((p[0]-800)/20,y,((id===0?270+p[1]:730-p[1])-500)/20);}

export class LunarWorld {
 constructor(canvas){
  this.canvas=canvas;this.loaded=false;this.mode='overview';this.previewAt=null;this.quakePreviewAt=null;this.roads=[];this.fractures=[];this.rovers=[];this.wheels=[];this.rocks=[];this.shutters=[];this.trackCounts=[0,0];this.cardMeshes=new Map();
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x101213);
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.92;
  this.camera=new THREE.PerspectiveCamera(38,1,.1,400);this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.minDistance=3;this.controls.maxDistance=155;this.controls.maxPolarAngle=Math.PI*.47;this.controls.target.set(0,0,0);this.controls.addEventListener('start',()=>{this.mode='free';this.updateMode();});
  const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,.04).texture;this.scene.environmentIntensity=.3;room.dispose();pmrem.dispose();
  this.scene.add(new THREE.HemisphereLight(0xc8d1dc,0x454039,1.25));
  const sun=new THREE.DirectionalLight(0xfff2dc,3.1);sun.position.set(-30,45,-24);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-52,right:52,top:42,bottom:-42,near:1,far:140});sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;this.scene.add(sun);this.scene.add(sun.target);
  this.loader=new GLTFLoader();
  this.hud=new THREE.Scene();this.hudCamera=new THREE.OrthographicCamera(-4,4,3,-3,.1,30);this.hudCamera.position.z=10;
  const texture=new THREE.TextureLoader().load('assets/card-reference.png');texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;this.cardTextures=[161,1005].map(x=>{const t=texture.clone();t.repeat.set(518/1752,777/1024);t.offset.set(x/1752,(1024-948)/1024);t.needsUpdate=true;return t;});
  // Actual mesh treads persist along every completed path, including detours.
  const treadGeometry=new THREE.BoxGeometry(.07,.012,.12),treadMaterial=new THREE.MeshStandardMaterial({color:0x272621,roughness:1});
  this.tracks=[0,1].map(()=>{const m=new THREE.InstancedMesh(treadGeometry,treadMaterial,6000);m.count=0;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;this.scene.add(m);return m;});
  this.particles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.08,0),new THREE.MeshStandardMaterial({color:0x777267,roughness:1}),120);this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particles.frustumCulled=false;this.particles.count=0;this.scene.add(this.particles);
  this.previewCaption=document.createElement('div');this.previewCaption.className='preview-caption';this.previewCaption.hidden=true;canvas.parentNode.append(this.previewCaption);
  this.status=document.createElement('div');this.status.className='world-status';this.status.textContent='正在装载月面地形与探测车…';canvas.parentNode.append(this.status);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  this.ready=this.load().catch(error=>{this.status.textContent='3D 资源加载失败，请刷新页面。';this.status.classList.add('error');console.error(error);throw error;});
 }
 async model(name){return (await this.loader.loadAsync(`assets/models/${name}.glb`)).scene;}
 prepare(root){root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){m.side=THREE.DoubleSide;if(/Regolith|Compressed|basalt|fissure|insulation/i.test(m.name))this.grain(m);}}});return root;}
 grain(m){if(m.userData.grain)return;m.userData.grain=true;m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGrainPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGrainPosition = position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vGrainPosition;\nfloat grain(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,47.23)))*43758.5453);}').replace('#include <color_fragment>','#include <color_fragment>\nfloat g=grain(floor(vGrainPosition*95.0));\ndiffuseColor.rgb *= .85 + g*.3;');};}
 async load(){
  const [terrain,blue,gold,lander,meteor]=await Promise.all(['lunar-world','science-rover-blue','science-rover-gold','landers-detailed','meteorite'].map(n=>this.model(n)));
  this.terrain=this.prepare(terrain);this.scene.add(terrain);this.scene.add(this.prepare(lander));
  terrain.traverse(o=>{if(o.name.startsWith('road_')){const parts=o.name.split('_');o.userData={id:+parts[1],key:parts[2],detour:parts[3]==='detour',baseY:o.position.y};o.material=o.material.clone();this.roads.push(o);}if(o.name.startsWith('fracture_')){o.userData={base:o.position.clone(),index:+o.name.split('_')[2],id:+o.name.split('_')[1]};this.fractures.push(o);}});
  for(let id=0;id<2;id++){
   const rover=this.prepare(id===0?blue:gold);this.rovers.push(rover);this.wheels.push([]);rover.traverse(o=>{if(o.name.startsWith('wheel_'))this.wheels[id].push({node:o,base:o.quaternion.clone()});});this.scene.add(rover);
   const rock=this.prepare(meteor.clone(true));rock.visible=false;this.rocks.push(rock);this.scene.add(rock);
   const shutter=new THREE.Mesh(new THREE.BoxGeometry(.1,1.5,2.3),new THREE.MeshStandardMaterial({color:0x54534a,metalness:.65,roughness:.5}));shutter.position.copy(worldPoint([650,-100],id,1.15));shutter.castShadow=true;this.shutters.push(shutter);this.scene.add(shutter);
  }
  this.previewRock=this.prepare(meteor.clone(true));this.previewRock.visible=false;this.scene.add(this.previewRock);
  // Route nameplates are typography only; all terrain, vehicles and infrastructure are geometry.
  this.labels=[];
  for(let id=0;id<2;id++)for(const [label,p,key] of [['01 / 信标回廊',[465,-151],'beacon'],['02 / 废弃栈道',[495,224],'outer'],['归航环路',[1230,178],'safe'],['碎隙捷径',[1200,-81],'risk'],['撤离舱 '+(id?'B':'A'),[1490,91],'ship']]){const el=document.createElement('span');el.className='world-label';el.textContent=label;el.style.setProperty('--label-color',id?'#d7c190':'#a3c8d2');this.canvas.parentNode.append(el);this.labels.push({el,point:worldPoint(p,id,.3),key});}
  this.loaded=true;this.status.remove();this.setView('overview');
 }
 resize(){const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;this.renderer.setSize(rect.width,rect.height,false);this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();const a=this.camera.aspect;this.hudCamera.left=-3*a;this.hudCamera.right=3*a;this.hudCamera.updateProjectionMatrix();if(this.mode==='overview')this.setView('overview');}
 updateMode(){document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===this.mode));}
 setView(mode){this.mode=mode;if(mode!=='quake')this.quakePreviewAt=null;if(mode==='overview'){this.controls.target.set(0,0,0);const fit=Math.max(1,1.85/this.camera.aspect);this.camera.position.set(0,67*fit,48*fit);this.camera.lookAt(this.controls.target);}else if(mode==='top'){this.controls.target.set(0,0,0);const fit=Math.max(1,1.6/this.camera.aspect);this.camera.position.set(0,80*fit,.01);this.camera.lookAt(this.controls.target);}this.updateMode();this.controls.update();}
 resetEffects(){this.previewAt=null;this.quakePreviewAt=null;if(this.mode==='quake')this.setView('overview');}
 preview(){this.previewAt=performance.now();}
 previewQuake(){this.quakePreviewAt=performance.now();this.mode='quake';this.updateMode();}
 selected(p,key,race){if(race.status==='ready')return false;if(['start','common'].includes(key))return true;if(key.startsWith('beacon'))return p.opening==='beacon';if(key.startsWith('outer'))return p.opening==='outer';if(key.startsWith('safe'))return p.final==='safe';return p.final==='risk'&&(key!=='collapse'||race.aftershock==='collapse')&&(key!=='stable'||race.aftershock!=='collapse');}
 updateTracks(p){
  const path=[...(p.history||[])];if(p.edge){let d=p.d;const points=p.edge.points;for(let i=1;i<points.length;i++){const len=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);if(d>=len){path.push(points[i]);d-=len;}else{const t=len?d/len:0;path.push([points[i-1][0]+(points[i][0]-points[i-1][0])*t,points[i-1][1]+(points[i][1]-points[i-1][1])*t]);break;}}}
  const total=length(path),count=Math.min(1400,Math.floor(total/2.8));if(count===this.trackCounts[p.id])return;this.trackCounts[p.id]=count;const mesh=this.tracks[p.id],dummy=new THREE.Object3D();let i=0;
  for(let d=0;d<count;d++){const s=sample(path,d*2.8),pos=worldPoint([s.x,s.y],p.id,.071),ang=s.angle*(p.id===0?1:-1);for(const side of [-1,1])for(const slant of [-1,1]){dummy.position.copy(pos);dummy.position.x+=-Math.sin(ang)*(side*.98+slant*.04);dummy.position.z+=Math.cos(ang)*(side*.98+slant*.04);dummy.rotation.set(0,-ang+slant*.5,0);dummy.updateMatrix();mesh.setMatrixAt(i++,dummy.matrix);}}
  mesh.count=i;mesh.instanceMatrix.needsUpdate=true;
 }
 makeCard(key){const group=new THREE.Group();const geo=new THREE.PlaneGeometry(1.7,2.55);for(let i=0;i<2;i++){const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:this.cardTextures[i],side:THREE.FrontSide}));m.rotation.y=i*Math.PI;m.position.z=i?-.007:.007;group.add(m);}const edge=new THREE.Mesh(new THREE.BoxGeometry(1.7,2.55,.013),new THREE.MeshBasicMaterial({color:0x776c52}));group.add(edge);this.hud.add(group);this.cardMeshes.set(key,group);return group;}
 renderCards(shots){const active=new Set();for(const s of shots){if(s.age<0||s.age>2)continue;active.add(s.key);const card=this.cardMeshes.get(s.key)||this.makeCard(s.key),t=s.age,rise=smooth(t/.28),flip=smooth((t-.3)/.55),fly=smooth((t-1.13)/.78),target=s.target.clone().project(this.camera);const tx=target.x*this.hudCamera.right,ty=target.y*3;card.position.set(THREE.MathUtils.lerp((s.attacker?1:-1)*2*(1-rise),tx,fly),THREE.MathUtils.lerp(-2.9*(1-rise),ty,fly)+Math.sin(fly*Math.PI)*.7,1);card.rotation.set(Math.sin(flip*Math.PI)*.15,Math.PI*(1-flip)+fly*4,fly*.8);card.scale.setScalar((.4+.6*rise)*(1-fly*.96));card.visible=t<1.95;}
 for(const [k,c]of this.cardMeshes)if(!active.has(k)){this.hud.remove(c);c.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});this.cardMeshes.delete(k);}
 }
 update(race){
  if(!this.loaded){this.renderer.render(this.scene,this.camera);return;}
  const now=performance.now(),previewQ=this.quakePreviewAt===null?-1:(now-this.quakePreviewAt)/1000;
  if(previewQ>15){this.quakePreviewAt=null;if(this.mode==='quake')this.setView('overview');}
  this.previewCaption.hidden=previewQ<0||previewQ>15;this.previewCaption.textContent=previewQ<2?'月震预览 · 地块开裂':'月震预览 · 断层下沉';
  const qAge=race.quake===null?-1:race.time-race.quake;const age=previewQ>=0&&previewQ<15?previewQ:qAge;const q=age<0?0:smooth(age/2);const collapsing=previewQ>2||race.aftershock==='collapse';const collapseEvent=race.events.find(e=>e.text.startsWith('共享余震：前方塌陷'));const collapseAge=previewQ>=0?previewQ-2:(collapseEvent?race.time-collapseEvent.time:0);
  for(const o of this.fractures){const delay=Math.abs(o.userData.index-10)*.05;const open=age<0?0:smooth((age-delay)/1.6);o.position.copy(o.userData.base);o.position.y-=open*(1.4+o.userData.index%3*.13);o.position.x+=open*(o.userData.index%2-.5)*.3;o.rotation.z=open*(o.userData.index%2-.5)*.04;}
  for(const road of this.roads){const {id,key,detour,baseY}=road.userData,p=race.players[id];road.visible=!(key==='collapse'||['riskIn','riskRock','source','stable'].includes(key))||q>0;const selected=detour?p.rock?.edge===key&&!p.rock.done:this.selected(p,key,race);road.material.color.setRGB(...(selected?(id?[.30,.285,.25]:[.27,.29,.29]):(detour?[.17,.165,.15]:[.23,.225,.21])));road.position.y=baseY;road.rotation.z=0;if(key==='stable'&&collapsing){const sink=smooth(collapseAge/1.4);road.position.y=baseY-sink*1.5;road.rotation.z=sink*.025;}}
  const shots=[];
  for(const p of race.players){
   const rover=this.rovers[p.id];rover.position.copy(worldPoint([p.position.x,p.position.y],p.id,.085));rover.rotation.y=-p.position.angle*(p.id===0?1:-1);for(const wheel of this.wheels[p.id]){wheel.node.quaternion.copy(wheel.base);wheel.node.rotateOnWorldAxis(new THREE.Vector3(0,0,1),-p.distance/20/.335);}
   this.updateTracks(p);this.shutters[p.id].position.y=p.gate?3:1.15;
   const rock=this.rocks[p.id];rock.visible=false;
   if(p.rock){const e=ROUTES[p.rock.edge],s=sample(e.points,e.length/2),target=worldPoint([s.x,s.y],p.id,.15),t=race.time-p.rock.at;shots.push({key:p.id+':'+p.rock.at,age:t,target,attacker:1-p.id});if(!p.rock.done&&t>=1.4){rock.visible=true;rock.position.copy(target);rock.position.y+=Math.max(0,1-((t-1.4)/.6)**2)*12;rock.rotation.set(t<2?t*1.5:3,0,t<2?t:2);}}
  }
  this.previewRock.visible=false;if(this.previewAt!==null){const t=(now-this.previewAt)/1000;if(t<5){const target=worldPoint([520,-100],0,.15);shots.push({key:'preview',age:t,target,attacker:1});if(t>1.4){this.previewRock.visible=true;this.previewRock.position.copy(target);this.previewRock.position.y+=Math.max(0,1-((t-1.4)/.6)**2)*12;this.previewRock.rotation.z=t<2?t:2;}}else this.previewAt=null;}
  let particles=0;const dummy=new THREE.Object3D();const emit=(target,t,n=30)=>{if(t<0||t>2.6)return;for(let i=0;i<n&&particles<120;i++){const a=i*2.39996,v=1.2+(i%7)*.3;dummy.position.copy(target);dummy.position.x+=Math.cos(a)*v*t;dummy.position.z+=Math.sin(a)*v*t;dummy.position.y+=Math.max(0,(2+(i%4)*.6)*t-2*t*t);dummy.rotation.set(t*i*.1,t*2,i);dummy.scale.setScalar((.4+i%3*.3)*Math.max(.05,1-t/2.6));dummy.updateMatrix();this.particles.setMatrixAt(particles++,dummy.matrix);}};
  shots.forEach(s=>emit(s.target,s.age-2));if(age>=0&&age<3)for(const id of [0,1])emit(worldPoint([1280,-35],id,.15),age,25);this.particles.count=particles;this.particles.instanceMatrix.needsUpdate=true;
  if(this.mode==='rover'){const p=this.rovers[0].position;this.controls.target.lerp(p.clone().add(new THREE.Vector3(0,.8,0)),.1);this.camera.position.lerp(p.clone().add(new THREE.Vector3(5,3.5,5.5)),.08);}else if(this.mode==='quake'){const p=worldPoint([1280,-35],0,0);this.controls.target.lerp(p,.12);this.camera.position.lerp(p.clone().add(new THREE.Vector3(9,10,12)),.1);}
  this.controls.update();
  const shake=age>=0&&age<1.8?Math.sin(age*58)*.10*(1-age/1.8):0;this.camera.position.y+=shake;
  this.renderer.render(this.scene,this.camera);this.renderStats={calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};this.renderCards(shots);this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.hud,this.hudCamera);this.renderer.autoClear=true;this.camera.position.y-=shake;
  const rect=this.canvas.getBoundingClientRect();for(const l of this.labels){const p=l.point.clone().project(this.camera);const visible=['overview','top'].includes(this.mode)&&p.z<1&&Math.abs(p.x)<.97&&Math.abs(p.y)<.94&&(l.key!=='risk'||q>0);l.el.hidden=!visible;l.el.style.left=(p.x+1)*.5*rect.width+'px';l.el.style.top=(1-p.y)*.5*rect.height+'px';}
 }
 diagnostics(){return{ready:this.loaded,mode:this.mode,geometry:this.renderer.info.memory.geometries,drawCalls:this.renderStats?.calls,triangles:this.renderStats?.triangles,fractureMeshes:this.fractures.length,roverWheels:this.wheels.map(w=>w.length)};}
}
