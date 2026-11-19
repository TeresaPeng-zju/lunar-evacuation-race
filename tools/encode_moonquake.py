from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[1]
frames=[Image.open(p).convert('RGB') for p in sorted((R/'work/quake-frames').glob('quake-*.png'))]
assert len(frames)==50
palette=Image.new('RGB',(720*5,480))
for i,f in enumerate(frames[::10]):palette.paste(f,(i*720,0))
palette=palette.quantize(colors=256)
frames=[f.quantize(palette=palette,dither=Image.Dither.FLOYDSTEINBERG) for f in frames]
frames[0].save(R/'dist/assets/moonquake.gif',save_all=True,append_images=frames[1:],duration=[400]+[80]*48+[1000],loop=0,optimize=False)
print('Encoded 50 geometric moonquake frames')
