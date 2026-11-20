import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const dir=new URL('../dist/assets/reference-models/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',dir)));
function read(name){const b=readFileSync(new URL(name,dir));assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));}
test('all 20 reference models are self-contained glTF 2 geometry with matching activation clips',()=>{
 assert.equal(manifest.assets.length,20);assert.equal(new Set(manifest.assets.map(a=>a.id)).size,20);assert.equal(manifest.assets.filter(a=>a.animated).length,10);
 for(const a of manifest.assets){const g=read(a.file);assert(g.meshes.length>0,a.id);assert.equal(Boolean(g.animations?.length),a.animated,a.id);assert(g.images.every(i=>i.bufferView!==undefined),a.id+' embedded images');assert(g.buffers.every(b=>!b.uri),a.id+' embedded buffer');assert(g.meshes.some(m=>m.primitives.some(p=>g.accessors[p.attributes.POSITION].count>100)),a.id+' actual geometry');
 for(const clip of g.animations??[]){assert(clip.channels.length>0);for(const channel of clip.channels){assert(g.nodes[channel.target.node]);assert(['translation','rotation','scale'].includes(channel.target.path));}}
 }
});
test('master map preserves sector placement and includes modeled terrain and every asset',()=>{
 const g=read('moon-map.glb');
 for(const a of manifest.assets){const n=g.nodes.find(n=>n.name===a.id);assert(n,a.id);const pos=n.translation??[0,0,0];pos.forEach((v,i)=>assert(Math.abs(v-a.position[i])<.001,a.id+' map position'));}
 const terrain=read('terrain.glb');assert(terrain.meshes.some(m=>m.primitives.some(p=>terrain.accessors[p.attributes.POSITION].count>50000)));assert(g.animations.length>=10);
});
