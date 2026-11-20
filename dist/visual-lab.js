import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';

const $=id=>document.getElementById(id),canvas=$('viewport'),stage=$('stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
// This art study is static: regenerate shadows when lighting/model changes, not per pass.
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
renderer.info.autoReset=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x181c21);
// Neutral hemispheric reflection field, not an indoor room reflected on the lunar base.
const data=new Float32Array(64*32*4);
for(let y=0;y<32;y++)for(let x=0;x<64;x++){
 const t=y/31,v=.06+.48*Math.pow(t,.6),i=(y*64+x)*4;
 data[i]=v*.88;data[i+1]=v*.95;data[i+2]=v;data[i+3]=1;
}
const hdr=new THREE.DataTexture(data,64,32,THREE.RGBAFormat,THREE.FloatType);hdr.mapping=THREE.EquirectangularReflectionMapping;hdr.needsUpdate=true;
const pmrem=new THREE.PMREMGenerator(renderer),lunarEnv=pmrem.fromEquirectangular(hdr).texture;
const room=new RoomEnvironment(),oldEnv=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();hdr.dispose();
const hemi=new THREE.HemisphereLight(0xc2ceda,0x29292b,.16);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff7ec,3.1);sun.castShadow=true;sun.position.set(-18,23,12);sun.shadow.mapSize.set(4096,4096);sun.shadow.camera.near=.1;sun.shadow.camera.far=100;scene.add(sun);scene.add(sun.target);
const oblique=new THREE.OrthographicCamera(),top=new THREE.OrthographicCamera();let camera=oblique,view='oblique',pipeline='cinematic',model,stats={},manifest;
for(const c of [oblique,top]){c.near=.1;c.far=100;}
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.minZoom=.7;controls.maxZoom=5;
const composer=new EffectComposer(renderer),renderPass=new RenderPass(scene,camera),ao=new GTAOPass(scene,camera,1,1,undefined,{radius:.65,thickness:1.1,distanceFallOff:1,scale:1,samples:16},{radius:5,rings:2,samples:12});
ao.blendIntensity=.9;
const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.1,.35,1.5),output=new OutputPass(),aa=new SMAAPass();
composer.addPass(renderPass);composer.addPass(ao);composer.addPass(bloom);composer.addPass(output);composer.addPass(aa);
const routeGroup=new THREE.Group();routeGroup.visible=false;scene.add(routeGroup);
const errors=[];window.addEventListener('error',e=>{errors.push(e.message);canvas.dataset.error=errors.join('; ');});
function fit(aspect=stage.clientWidth/stage.clientHeight){
 const near=view==='station';camera=view==='top'?top:oblique;camera.zoom=1;
 const half=near?4.5:view==='top'?9.3:7.8;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
 const target=near?new THREE.Vector3(-3,.5,-4.8):new THREE.Vector3(0,0,-.8);
 if(view==='top'){camera.up.set(0,0,-1);camera.position.copy(target).add(new THREE.Vector3(0,40,0));}
 else{camera.up.set(0,1,0);camera.position.copy(target).add(new THREE.Vector3(near?6:0,near?22:24,near?18:24));}
 camera.lookAt(target);camera.updateProjectionMatrix();controls.object=camera;controls.target.copy(target);controls.enableRotate=view!=='top';controls.update();renderPass.camera=camera;ao.camera=camera;
 ao.gtaoMaterial.defines.PERSPECTIVE_CAMERA=0;ao.gtaoMaterial.needsUpdate=true;
 for(const name of ['oblique','top','station'])$(name).classList.toggle('active',name===view);
 canvas.dataset.view=view;updateLabel();
}
function updateLabel(){ $('mode-label').textContent=`${pipeline==='cinematic'?'CINEMATIC':pipeline==='game'?'GAME LIGHTING':'ARCHIVE LIGHTING'} / ${view==='top'?'严格俯视':view==='station'?'设施近看':'斜俯视'}`; }
function setPipeline(){
 pipeline=$('pipeline').value;const enhanced=pipeline==='cinematic',library=pipeline==='library';
 scene.environment=enhanced?lunarEnv:oldEnv;scene.environmentIntensity=enhanced?.95:library?.22:.3;
 hemi.intensity=enhanced?.28:library?.45:.65;hemi.color.set(enhanced?0xc2ceda:library?0xc9d8e8:0xc8d1dc);hemi.groundColor.set(enhanced?0x29292b:library?0x242526:0x343231);
 sun.intensity=enhanced?3.1:library?2.2:2.3;sun.color.set(enhanced?0xfff7ec:library?0xfff4dd:0xfff2dc);sun.position.set(enhanced?-18:-30,enhanced?23:45,enhanced?12:library?25:-24);
 const size=enhanced?21:library?48:52;Object.assign(sun.shadow.camera,{left:-size,right:size,top:enhanced?20:library?48:42,bottom:enhanced?-20:library?-48:-42,near:enhanced?.1:library?.5:1,far:enhanced?100:140});sun.shadow.camera.updateProjectionMatrix();
 sun.shadow.normalBias=enhanced?.008:library?.02:.025;sun.shadow.bias=enhanced?-.00008:library?-.0003:-.0002;
 sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(enhanced?4096:2048,enhanced?4096:2048);
 renderer.shadowMap.needsUpdate=true;
 renderer.toneMappingExposure=enhanced?.92:library?.9:.85;ao.enabled=enhanced;bloom.enabled=enhanced;
 canvas.dataset.pipeline=pipeline;resetMetrics();updateLabel();
}
function sizePost(w,h,ratio){composer.setPixelRatio(ratio);composer.setSize(w,h);ao.setSize(Math.ceil(w*ratio*.5),Math.ceil(h*ratio*.5));}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5,Math.sqrt(2200000/(w*h))));renderer.setSize(w,h,false);sizePost(w,h,renderer.getPixelRatio());fit();resetMetrics();}
let samples=[],last=0,frames=0,benchmark=null;
function resetMetrics(){samples=[];last=0;frames=0;}
function draw(){renderer.info.reset();composer.render();}
function report(){
 const sorted=[...samples].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length*.5)]||0,p95=sorted[Math.floor(sorted.length*.95)]||0;
 const m={...stats,pipeline,view,cssSize:[stage.clientWidth,stage.clientHeight],drawingBuffer:[canvas.width,canvas.height],aoBuffer:[ao.width,ao.height],shadowUpdates:'on model or light changes',dpr:renderer.getPixelRatio(),medianFrameMs:+median.toFixed(1),p95FrameMs:+p95.toFixed(1),fps:median?Math.round(1000/median):0,frameSamples:samples.length,drawCallsAllPasses:renderer.info.render.calls,errors};
 canvas.dataset.metrics=JSON.stringify(m);$('metric').textContent=`${m.fps} FPS · ${canvas.width} × ${canvas.height}`;
 $('diagnostics').textContent=JSON.stringify(m,null,2);
}
for(const name of ['oblique','top','station'])$(name).onclick=()=>{view=name;fit();resetMetrics();};
$('pipeline').onchange=setPipeline;$('route').onclick=()=>{routeGroup.visible=!routeGroup.visible;$('route').setAttribute('aria-pressed',String(routeGroup.visible));$('route').classList.toggle('active',routeGroup.visible);};
$('close-capture').onclick=()=>$('capture-dialog').close();
$('benchmark').onclick=()=>{
 benchmark={start:performance.now(),samples:[],previous:0};canvas.dataset.benchmark='running';$('benchmark').disabled=true;$('export').disabled=true;
 $('benchmark-result').textContent='正在以 3456 × 2160 实际绘制，预热 2 秒后采样 10 秒…';
 renderer.setPixelRatio(1);renderer.setSize(3456,2160,false);sizePost(3456,2160,1);fit(1.6);
};
$('export').onclick=()=>{
 // Real WebGL output at a known size; not an offline Blender beauty render.
 const previous={left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};const ratio=renderer.getPixelRatio();
 renderer.setPixelRatio(1);renderer.setSize(1600,1000,false);sizePost(1600,1000,1);
 const half=(previous.top-previous.bottom)/2;camera.left=-half*1.6;camera.right=half*1.6;camera.updateProjectionMatrix();draw();
 $('capture').src=canvas.toDataURL('image/png');$('download-capture').href=$('capture').src;$('capture-dialog').showModal();
 Object.assign(camera,previous);camera.updateProjectionMatrix();renderer.setPixelRatio(ratio);renderer.setSize(stage.clientWidth,stage.clientHeight,false);sizePost(stage.clientWidth,stage.clientHeight,ratio);draw();resetMetrics();
};
try{
 manifest=await(await fetch('assets/visual-sample/manifest.json',{cache:'no-store'})).json();
 const gltf=await new GLTFLoader().loadAsync('assets/visual-sample/scene.glb?sha='+manifest.sceneSha256);model=gltf.scene;
 let triangles=0,meshes=0;const mats=new Set(),maps=new Set();
 model.traverse(n=>{if(!n.isMesh)return;n.castShadow=true;n.receiveShadow=true;meshes++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;
  for(const m of Array.isArray(n.material)?n.material:[n.material]){mats.add(m);for(const slot of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap'])if(m[slot]){maps.add(m[slot]);m[slot].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}}
 });scene.add(model);
 stats={loadedGLB:'assets/visual-sample/scene.glb',sceneSha256:manifest.sceneSha256,sourceGLBs:manifest.sources.map(s=>s.file),meshes,triangles,materials:mats.size,textures:maps.size,runtimeMaterialOverrides:0,terrainMaterial:'derived 2048px CC0 PBR atlas',colorManagement:'Linear-sRGB → ACES → OutputPass sRGB',routeChanged:false,routePoints:manifest.route.pointsXZ,projection:'orthographic'};
 // Debug centerline and width. It is a visualization, never a robot control source.
 const points=manifest.route.pointsXZ;
 for(const offset of [-1.2,0,1.2]){const vertices=points.map(([x,z],i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];const tangent=new THREE.Vector2(b[0]-a[0],b[1]-a[1]).normalize();return new THREE.Vector3(x-tangent.y*offset,.07,z+tangent.x*offset);
 });const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),new THREE.LineBasicMaterial({color:offset===0?0xe2c78b:0x66bddb,depthTest:false,transparent:true,opacity:.65}));line.renderOrder=10;routeGroup.add(line);}
 canvas.dataset.status='ready';$('loading').hidden=true;setPipeline();resize();
 new ResizeObserver(resize).observe(stage);
 renderer.setAnimationLoop(now=>{if(document.hidden)return;
  if(benchmark){const elapsed=now-benchmark.start;if(elapsed>2000&&benchmark.previous)benchmark.samples.push(now-benchmark.previous);benchmark.previous=now;
   if(elapsed>=12000){const a=benchmark.samples.sort((a,b)=>a-b),median=a[Math.floor(a.length*.5)],p95=a[Math.floor(a.length*.95)];const result={resolution:[3456,2160],aoResolution:[ao.width,ao.height],shadowUpdates:'static cached',sampleFrames:a.length,durationMs:Math.round(elapsed),medianFrameMs:+median.toFixed(1),p95FrameMs:+p95.toFixed(1),medianFps:Math.round(1000/median),pipeline,scope:'local sample only; frame cadence, not GPU-only timer'};
    canvas.dataset.benchmarkResult=JSON.stringify(result);canvas.dataset.benchmark='done';$('benchmark-result').textContent=JSON.stringify(result,null,2);benchmark=null;$('benchmark').disabled=false;$('export').disabled=false;resize();
   }
  }
  if(last&&frames>30){samples.push(now-last);if(samples.length>240)samples.shift();}last=now;frames++;controls.update();draw();if(frames%30===0)report();
 });
}catch(error){canvas.dataset.status='error';canvas.dataset.error=error.message;$('loading').textContent='样板加载失败：'+error.message;console.error(error);}
