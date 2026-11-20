from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[1];frames=[Image.open(p).convert('RGB') for p in sorted((R/'work/reference-build/frames').glob('*.png'))]
assert len(frames)==33,len(frames)
palette=Image.new('RGB',(640*7,512))
for i,im in enumerate(frames[::5]):palette.paste(im,(640*i,0))
palette=palette.quantize(colors=128)
frames=[im.quantize(palette=palette,dither=Image.Dither.FLOYDSTEINBERG) for im in frames]
frames[0].save(R/'art/reference-library/relic-activation.gif',save_all=True,append_images=frames[1:],duration=125,loop=0,optimize=False)
print('Saved 33-frame GIF')
