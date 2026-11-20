// Stages identical, fingerprinted inputs. Does not install or launch Unity.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.argv[2]||path.join(root,'work/unity-visual-check/Inputs'));
const asset=path.join(root,'dist/assets/visual-sample');
const manifest=JSON.parse(await readFile(path.join(asset,'manifest.json'),'utf8'));
const bytes=await readFile(path.join(asset,'scene.glb'));
const sha=createHash('sha256').update(bytes).digest('hex');
if(sha!==manifest.sceneSha256)throw new Error('Scene fingerprint mismatch; update the audited sample first.');
await mkdir(output,{recursive:true});
for(const name of ['scene.glb','manifest.json'])await copyFile(path.join(asset,name),path.join(output,name));
await copyFile(new URL('./comparison-spec.json',import.meta.url),path.join(output,'comparison-spec.json'));
await writeFile(path.join(output,'staging-result.json'),JSON.stringify({
  status:'inputs-staged-only',sceneSha256:sha,bytes:bytes.length,
  unityEditorAvailable:false,unityBuildExecuted:false,unityScreenshotAvailable:false,
  note:'Environment check on 2026-11-21 found no Unity Editor/Hub. Staging is not a renderer validation.'
},null,2));
console.log(JSON.stringify({output,sceneSha256:sha,bytes:bytes.length,status:'inputs-staged-only'},null,2));
