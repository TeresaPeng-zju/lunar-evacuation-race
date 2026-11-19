import {mkdir,copyFile} from 'node:fs/promises';
import {dirname} from 'node:path';
for(const [from,to] of [['build/three.core.js','three.core.js'],['build/three.module.js','three.module.js'],['LICENSE','LICENSE'],...['loaders/GLTFLoader.js','controls/OrbitControls.js','utils/BufferGeometryUtils.js','environments/RoomEnvironment.js'].map(p=>['examples/jsm/'+p,'addons/'+p])]){
 const dest=new URL('../dist/vendor/three/'+to,import.meta.url);await mkdir(dirname(dest.pathname),{recursive:true});await copyFile(new URL('../node_modules/three/'+from,import.meta.url),dest);
}
