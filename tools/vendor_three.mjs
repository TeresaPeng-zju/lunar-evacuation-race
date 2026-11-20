import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
for(const [from,to] of [['build/three.core.js','three.core.js'],['build/three.module.js','three.module.js'],['LICENSE','LICENSE'],...['loaders/GLTFLoader.js','controls/OrbitControls.js','utils/BufferGeometryUtils.js','environments/RoomEnvironment.js'].map(p=>['examples/jsm/'+p,'addons/'+p])]){
 const dest=new URL('../dist/vendor/three/'+to,import.meta.url);await mkdir(dirname(dest.pathname),{recursive:true});await copyFile(new URL('../node_modules/three/'+from,import.meta.url),dest);
}
// Keep the sample's postprocessing modules pinned to the same Three.js revision.
const root=new URL('../node_modules/three/examples/jsm/',import.meta.url).pathname,seen=new Set();
async function addon(path){
 if(seen.has(path))return;seen.add(path);
 const source=await readFile(resolve(root,path),'utf8'),dest=new URL('../dist/vendor/three/addons/'+path,import.meta.url);
 await mkdir(dirname(dest.pathname),{recursive:true});await copyFile(resolve(root,path),dest);
 for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))await addon(relative(root,resolve(root,dirname(path),match[1])));
}
for(const path of ['postprocessing/EffectComposer.js','postprocessing/RenderPass.js','postprocessing/GTAOPass.js','postprocessing/OutputPass.js','postprocessing/UnrealBloomPass.js','postprocessing/SMAAPass.js'])await addon(path);
