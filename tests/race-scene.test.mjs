import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUTES,bypass} from '../dist/engine.js';

const layout=JSON.parse(readFileSync(new URL('../dist/assets/reference-models/race-layout.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../dist/assets/reference-models/manifest.json',import.meta.url)));
const staticAssets=layout.assets.filter(a=>!a.dynamic);
const world=(point,player)=>[(point[0]-800)/20,((player===0?270+point[1]:730-point[1])-500)/20];
const distance=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
const routeSegments=[];
for(const player of [0,1])for(const route of Object.values(ROUTES))for(const points of [route.points,...(route.extra?[bypass(route)]:[])]){
 const projected=points.map(point=>world(point,player));for(let i=1;i<projected.length;i++)routeSegments.push([projected[i-1],projected[i]]);
}

test('all reconstructed assets are placed in the playable scene and clear both routes and rock detours',()=>{
 assert.equal(layout.assets.length,20);
 assert.deepEqual(new Set(layout.assets.map(a=>a.id)),new Set(manifest.assets.map(a=>a.id)));
 assert.equal(layout.assets.filter(a=>a.dynamic).length,1);
 for(const a of staticAssets){
  const p=[a.position[0],a.position[2]],clearance=Math.min(...routeSegments.map(([u,v])=>distance(p,u,v)));
  assert(clearance>=a.radius+1.35,`${a.id} road clearance ${clearance}`);
 }
 for(let i=0;i<staticAssets.length;i++)for(let j=i+1;j<staticAssets.length;j++){
  const a=staticAssets[i],b=staticAssets[j];
  assert(Math.hypot(a.position[0]-b.position[0],a.position[2]-b.position[2])>=a.radius+b.radius+.6,`${a.id} overlaps ${b.id}`);
 }
});
