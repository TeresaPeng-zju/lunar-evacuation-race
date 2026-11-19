"""Encode already-rendered Blender frames; does not alter supplied artwork."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
files = sorted((ROOT / 'work/blender-frames').glob('card-*.png'))
if len(files) != 90:
    raise SystemExit(f'Expected 90 rendered frames, found {len(files)}')
frames = [Image.open(path).convert('RGB') for path in files]
# A shared palette prevents noisy frame-to-frame color shifts.
sheet = Image.new('RGB', (720 * 3, 480 * 3))
for i, idx in enumerate([0, 7, 14, 22, 30, 38, 42, 52, 75]):
    sheet.paste(frames[idx], ((i % 3) * 720, (i // 3) * 480))
palette = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
indexed = [im.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG) for im in frames]
out = ROOT / 'dist/assets/card-cast.gif'
indexed[0].save(out, save_all=True, append_images=indexed[1:], duration=50,
                loop=0, disposal=2, optimize=False)
print(f'{out}: {out.stat().st_size} bytes, 90 frames, 4.5 seconds')
