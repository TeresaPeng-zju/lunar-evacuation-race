import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const $=id=>document.getElementById(id), canvas=$('viewport'), stage=canvas.parentElement;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x101419);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(), perspective=new THREE.PerspectiveCamera(39,1,.02,600), ortho=new THREE.OrthographicCamera(-45,45,28,-28,.02,600);let camera=perspective;
const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.22;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xc9d8e8,0x242526,.45));const sun=new THREE.DirectionalLight(0xfff4dd,2.2);sun.position.set(-30,45,25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0003;sun.shadow.normalBias=.02;sun.shadow.camera.left=-50;sun.shadow.camera.right=50;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;sun.shadow.camera.far=140;scene.add(sun);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=2;controls.maxDistance=160;
const base='assets/reference-models/', loader=new GLTFLoader();let model,mixer,clips=[],playing=false,elapsed=0,requestId=0,selected='map',radius=40,target=new THREE.Vector3(),wire=false;
function dispose(o){o?.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material]){for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])m[k]?.dispose();m.dispose();}}});}
function fit(mode='perspective'){
 camera=mode==='top'?ortho:perspective;controls.object=camera;controls.enableRotate=mode!=='top';const aspect=stage.clientWidth/stage.clientHeight;
 if(camera===ortho){const half=Math.max(radius*(selected==='map'?.68:1.2),radius/aspect*(selected==='map'?.85:1.2));camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.position.copy(target).add(new THREE.Vector3(0,radius*3,.001));camera.up.set(0,0,-1);}
 else{camera.aspect=aspect;camera.up.set(0,1,0);const d=radius*(aspect<1?3.8:2.4);camera.position.copy(target).add(new THREE.Vector3(d*.45,d*.78,d*.85));}
 camera.lookAt(target);camera.updateProjectionMatrix();controls.target.copy(target);controls.update();$('perspective').classList.toggle('active',mode!=='top');$('top').classList.toggle('active',mode==='top');
}
function reset(){playing=false;elapsed=0;if(mixer){mixer.stopAllAction();for(const clip of clips){const a=mixer.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();}mixer.setTime(0);} $('play').textContent='▷ 播放激活动效';}
async function select(a){
 const token=++requestId;selected=a?.id??'map';$('loading').hidden=false;$('loading').textContent='正在载入模型…';$('play').disabled=true;
 document.querySelectorAll('[data-asset]').forEach(b=>b.classList.toggle('selected',b.dataset.asset===selected));$('map').classList.toggle('selected',!a);
 try{
  const gltf=await loader.loadAsync(base+(a?.file??'moon-map.glb'));if(token!==requestId){dispose(gltf.scene);return;}
  if(model){scene.remove(model);mixer?.stopAllAction();if(mixer)mixer.uncacheRoot(model);dispose(model);}
  model=gltf.scene;model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;for(const m of Array.isArray(n.material)?n.material:[n.material])m.wireframe=wire;}});scene.add(model);clips=gltf.animations;mixer=new THREE.AnimationMixer(model);reset();
  // Exclude the airborne meteor from auto-framing; each single-cell library asset fits a 10-unit sector.
  radius=a?(a.id==='central-ruin'?10:a.id==='meteor-impact'?9:5.1):48;target.set(0,a?.id==='meteor-impact'?4.2:a?0.5:0,0);fit('perspective');
  const sc=a?7:48;sun.shadow.camera.left=-sc;sun.shadow.camera.right=sc;sun.shadow.camera.top=sc;sun.shadow.camera.bottom=-sc;sun.shadow.camera.updateProjectionMatrix();
  $('title').textContent=a?.name??'月面工业遗址';$('code').textContent=a?`ASSET / ${a.id.toUpperCase()}`:'MASTER SCENE';$('coordinates').textContent=a?`SECTOR / ${a.cell}`:'SECTOR / 8 × 5';$('description').textContent=a?(a.animated?'实体几何 · 可播放激活动效':'实体几何 · 可旋转查看各侧细节'):'20 处设施 · 陨石坑地形 · 10 组激活动效';$('play').disabled=clips.length===0;$('download').href=base+(a?.file??'moon-map.glb');$('loading').hidden=true;
  window.modelArchive={selected,animations:clips.length,meshes:0};model.traverse(n=>{if(n.isMesh)window.modelArchive.meshes++;});
 }catch(e){if(token===requestId){$('loading').hidden=false;$('loading').textContent='模型载入失败，请刷新重试。';}console.error(e);}
}
$('map').onclick=()=>select(null);$('perspective').onclick=()=>fit('perspective');$('top').onclick=()=>fit('top');$('reset').onclick=reset;
$('play').onclick=()=>{if(!mixer)return;if(elapsed>=Math.max(...clips.map(c=>c.duration))-.01)reset();playing=!playing;$('play').textContent=playing?'Ⅱ 暂停动效':'▷ 继续动效';};
$('wire').onclick=()=>{wire=!wire;$('wire').classList.toggle('active',wire);$('wire').setAttribute('aria-pressed',String(wire));model?.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])m.wireframe=wire;});};
new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight,false);fit(camera===ortho?'top':'perspective');}).observe(stage);
let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.05);last=now;if(playing&&mixer){mixer.update(dt);elapsed+=dt;if(elapsed>=Math.max(...clips.map(c=>c.duration))){playing=false;$('play').textContent='▷ 重播激活动效';}}controls.update();renderer.render(scene,camera);$('stats').textContent=wire?`${renderer.info.render.lines.toLocaleString()} EDGES · WIREFRAME`:`${renderer.info.render.triangles.toLocaleString()} TRIANGLES · PBR`;});
try{const response=await fetch(base+'manifest.json');if(!response.ok)throw Error(response.status);const data=await response.json();for(const a of data.assets){const b=document.createElement('button');b.dataset.asset=a.id;b.innerHTML=`<span class="cell">${a.cell}</span><span>${a.name}</span>${a.animated?'<span class="anim">▶</span>':''}`;b.onclick=()=>select(a);$('catalog').append(b);}await select(null);}catch(e){$('loading').textContent='目录载入失败，请刷新重试。';console.error(e);}
