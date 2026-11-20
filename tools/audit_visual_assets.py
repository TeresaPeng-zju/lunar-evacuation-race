"""Read-only glTF audit. Emits evidence; never modifies source assets."""
from pathlib import Path
import json, struct, hashlib, io
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
def inspect(path):
 data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+n]);offset=20+n;binary=data[offset+8:]
 images=[]
 for image in g.get('images',[]):
  v=g['bufferViews'][image['bufferView']];b=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  im=Image.open(io.BytesIO(b));images.append({'name':image.get('name'),'size':list(im.size),'bytes':len(b)})
 mats=[]
 for m in g.get('materials',[]):
  p=m.get('pbrMetallicRoughness',{});slots={}
  for k,v in [('baseColor',p.get('baseColorTexture')),('metallicRoughness',p.get('metallicRoughnessTexture')),('normal',m.get('normalTexture')),('occlusion',m.get('occlusionTexture')),('emissive',m.get('emissiveTexture'))]:
   if v:slots[k]={'image':g['textures'][v['index']]['source'],'texCoord':v.get('texCoord',0),'scale':v.get('scale',1)}
  mats.append({'name':m.get('name'),'baseColorFactor':p.get('baseColorFactor',[1]*4),'metallicFactor':p.get('metallicFactor',1),'roughnessFactor':p.get('roughnessFactor',1),'doubleSided':m.get('doubleSided',False),'textures':slots})
 primitives=[p for m in g.get('meshes',[]) for p in m['primitives']]
 return {'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'meshes':len(g.get('meshes',[])),'primitives':len(primitives),'triangles':sum(g['accessors'][p['indices']]['count']//3 for p in primitives if 'indices'in p),'normalPrimitives':sum('NORMAL'in p['attributes'] for p in primitives),'uvPrimitives':sum('TEXCOORD_0'in p['attributes'] for p in primitives),'animations':len(g.get('animations',[])),'images':images,'materials':mats}

paths=sorted((ROOT/'dist/assets/reference-models').glob('*.glb'))+sorted((ROOT/'dist/assets/models').glob('*.glb'))+sorted((ROOT/'dist/assets/visual-sample').glob('*.glb'))
result={'assets':[inspect(p) for p in paths]}
(ROOT/'work/visual-audit').mkdir(parents=True,exist_ok=True)
(ROOT/'work/visual-audit/assets.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
for a in result['assets']:
 print(Path(a['file']).name,a['triangles'],'triangles',a['primitives'],'draw primitives',len(a['images']),'images',sorted({tuple(i['size'])for i in a['images']}),'AO',sum('occlusion'in m['textures']for m in a['materials']))
