import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ROUTES} from '../dist/engine.js';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const manifest=JSON.parse(read('dist/assets/visual-sample/manifest.json'));
function glb(path){const b=read(path);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));}
const scene=glb('dist/assets/visual-sample/scene.glb');
test('visual sample is derived from unchanged source GLBs and has a verifiable scene fingerprint',()=>{
 for(const source of manifest.sources)assert.equal(createHash('sha256').update(read(source.file)).digest('hex'),source.sha256);
 assert.equal(createHash('sha256').update(read('dist/assets/visual-sample/scene.glb')).digest('hex'),manifest.sceneSha256);
});
test('sample road follows the engine centerline exactly, including the exit into common',()=>{
 const points=[...ROUTES.beaconIn.points.slice(1),...ROUTES.beaconRock.points.slice(1),...ROUTES.beaconOut.points.slice(1),...ROUTES.common.points.slice(1,3)];
 const origin=manifest.route.worldOrigin;
 assert.deepEqual(manifest.route.pointsXZ,points.map(([x,y])=>[(x-800)/20-origin[0],(270+y-500)/20-origin[2]]));
});
test('facility and rover PBR factors and map slots survive Blender assembly',()=>{
 const slots=m=>{const p=m.pbrMetallicRoughness||{};return [!!p.baseColorTexture,!!p.metallicRoughnessTexture,!!m.normalTexture,!!m.occlusionTexture,!!m.emissiveTexture];};
 const canonical=n=>n.replace(/\.\d{3}$/,'');
 for(const source of manifest.sources.slice(1))for(const mat of glb(source.file).materials){
  const candidates=scene.materials.filter(m=>canonical(m.name)===canonical(mat.name));assert.ok(candidates.length,mat.name);
  const copy=candidates.find(m=>JSON.stringify(slots(m))===JSON.stringify(slots(mat)));assert.ok(copy,mat.name+' maps');
  for(const key of ['metallicFactor','roughnessFactor'])assert.ok(Math.abs((copy.pbrMetallicRoughness?.[key]??1)-(mat.pbrMetallicRoughness?.[key]??1))<1e-5,mat.name+' '+key);
  const a=copy.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1],b=mat.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1];a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-5,mat.name+' color'));
 }
});
test('derived regolith has color, non-color normal, roughness and surface cavity maps',()=>{
 const m=scene.materials.find(m=>m.name.startsWith('Regolith · unique'));
 assert.ok(m?.normalTexture&&m.occlusionTexture&&m.pbrMetallicRoughness.baseColorTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture);
 assert.ok(scene.images.every(i=>Number.isInteger(i.bufferView)),'self-contained textures');
});
