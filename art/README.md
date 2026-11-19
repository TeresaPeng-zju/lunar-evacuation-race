# Editable Blender assets

Original procedural prototype models, authored locally in Blender 5.4 Alpha. No Hyper3D account is needed. The browser now renders actual GLB geometry with Three.js, replacing the V0.2 sprite renderer.

- `lunar-world.blend`: complete lunar terrain, craters, roads, fixtures, six-wheel science rovers, landers, lighting and overview camera. Frames 1–100 contain the animated fault lids.
- `moonquake.blend`: close-up fracture, sinking shortcut and ballistic debris animation. Frames 1–100 at 25 FPS.
- `rover-detail.png`: engineering detail render of the remodeled rover.
- `card-cast.blend`: editable 90-frame / 20 FPS card flip, throw and meteor scene. Card reference is packed in the file.
- `lunar-models.blend`: archived V0.2 source models. Individual asset collections can be toggled.
- `../dist/assets/models/*.glb`: browser-ready models. The science rovers each contain six separately pivoted wheels.
- `../dist/assets/{card-cast,moonquake}.gif`: offline Blender showcases, independent of browser gameplay.

## Rebuild

Run from the repository root, with Blender installed. `blender` below means the installed Blender executable (macOS: `/Applications/Blender.app/Contents/MacOS/Blender`).

```sh
npm ci
npm run vendor
npm run assets:routes
blender --background --python tools/build_blender_assets.py
blender --background --python tools/build_world.py
blender --background --python tools/render_moonquake.py
blender --background --python tools/render_card_showcase.py
python tools/encode_moonquake.py
python tools/encode_gif.py
```

GIF encoders require Pillow. Intermediate frames and route JSON are stored in ignored `work/`. Models use Blender Z-up; GLB export converts to the Three.js Y-up convention. Map coordinates are converted at 20 logical pixels per scene unit; these are visual units, not calibrated physical dimensions.

## Card artwork

The supplied front/back screenshot is used directly with exact UV crop coordinates. The QR code is retained visually, not used for recognition. Public use of the supplied artwork and its derived animation was expressly authorized by the user.
