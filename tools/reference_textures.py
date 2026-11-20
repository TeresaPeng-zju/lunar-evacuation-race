"""Original, tileable surface maps; no pixels copied from the reference artwork."""
from PIL import Image, ImageFilter, ImageDraw
from pathlib import Path
import random, math
R=Path(__file__).resolve().parents[1]; out=R/'art/reference-library/textures';out.mkdir(parents=True,exist_ok=True)
r=random.Random(20261120); n=512
fine=Image.new('L',(n,n));fine.putdata([r.randrange(70,190) for _ in range(n*n)])
coarse=Image.new('L',(32,32));coarse.putdata([r.randrange(50,205) for _ in range(32*32)]);coarse=coarse.resize((n,n),Image.Resampling.BICUBIC)
h=Image.blend(fine,coarse,.55);d=ImageDraw.Draw(h)
for i in range(1900):
 x,y=r.randrange(n),r.randrange(n);s=r.choice([1,1,2,3]);d.ellipse((x,y,x+s,y+s),fill=r.randrange(30,160))
for i in range(90):
 x,y=r.randrange(n),r.randrange(n);d.line((x,y,x+r.randrange(2,30),y+r.randrange(-8,8)),fill=r.randrange(130,190),width=1)
h=h.filter(ImageFilter.GaussianBlur(.35)); pix=list(h.getdata())
for name,tint in [('titanium',(1.04,1.02,1)),('basalt',(.69,.71,.74)),('regolith',(.88,.88,.87))]:
 im=Image.new('RGB',(n,n));im.putdata([tuple(min(255,int((v*.40+66)*t)) for t in tint) for v in pix]);im.save(out/(name+'.jpg'),quality=88)
normal=Image.new('RGB',(n,n));normal.putdata([(int(128-(pix[y*n+(x+1)%n]-pix[y*n+(x-1)%n])*.6),int(128-(pix[((y+1)%n)*n+x]-pix[((y-1)%n)*n+x])*.6),248) for y in range(n) for x in range(n)]);normal.save(out/'surface-normal.png')
print(out)
