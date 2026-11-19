import {ROUTES,bypass} from '../dist/engine.js';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir(new URL('../work/',import.meta.url),{recursive:true});
await writeFile(new URL('../work/routes.json',import.meta.url),JSON.stringify(Object.fromEntries(Object.entries(ROUTES).map(([k,e])=>[k,{...e,detour:e.extra?bypass(e):null}]))));
