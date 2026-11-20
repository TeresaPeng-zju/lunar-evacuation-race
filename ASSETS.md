# Asset provenance

`dist/assets/moon-terrain.png` was generated with the built-in image_gen tool for this project. The supplied 3.gif inspired the lunar industrial direction but is not included in this repository. This is the archived V0.1 background; V0.3 uses modeled terrain and no photographic background.

## Final generation prompt

Use case: stylized-concept. Asset type: top-down videogame moon terrain background. Create an original high-detail 1600x1000 landscape orthographic 90-degree overhead lunar industrial environment, in the spirit of gritty classic science-fiction RTS terrain. Charcoal grey regolith, tiny sharply lit pebbles and scattered shallow craters, realistic baked ambient shadows, dark desaturated metal. IMPORTANT layout: entire central 85% is mostly flat navigable fine-grain regolith, sparse small craters only, no roads whatsoever. A few abandoned industrial solar-panel structures, pipes and small habitat modules clustered ONLY at extreme upper and lower edges and corners (outer 8%). A delicate cyan glowing fissure at extreme bottom right corner. Monochrome warm grey stone, subtle copper weathered metal details, restrained cold blue solar panels. Crisp textured game art, not a photo, no perspective horizon, no sky, no text, no labels, no vehicles, no UI, no paths, no large obstacles in center. This is a base layer for programmable two-lane racing tracks so keep central area clear and visually quiet.

## Tire-track sprite

`dist/assets/tire-tracks.png` derives from the two-strip chevron tread image supplied by the user. The source had an opaque checkerboard background. The built-in image_gen tool produced the transparent-background version; this is a generated cleanup, not a pixel-exact extraction. The V0.1 game cropped and rotated this sprite into decals. V0.3 uses instanced geometric chevrons along the actual traveled path. Track history is shared with the ground display and cleared on reset.

Final edit prompt:

Use case: background-extraction. Edit the attached tire-track sprite. Remove all white and pale grey checkerboard background pixels and replace background with actual transparent alpha, including the gap between the two tracks. Preserve the two original straight parallel vertical narrow dusty grey-brown chevron tire tread strips, their original spacing, their small repeated V-shaped tread pattern, weathered granular texture, shaded edges and orthographic overhead view. No invented objects. No text. No ground or checkerboard baked into output. Keep the original composition and aspect ratio: two long thin vertical strips at approximately x=29% and x=61% of the canvas, running almost from top to bottom, approximately 6% of canvas width per strip. Tight clean transparent cutout suitable for a game sprite. Do not turn it into rubber tires or thick tank tracks. Output transparent PNG.

## Blender model assets and card animation (V0.2)

`lander.png`, `rover-blue.png`, `rover-gold.png` and `meteorite.png` are transparent renders of locally authored Blender models. Their editable `.blend` sources, GLB exports and Python reconstruction scripts are included. These files were produced with Blender, not image generation. The showcase GIF is encoded from Blender-rendered frames.

`card-reference.png` is the card front/back screenshot supplied by the user. Both Blender UVs and browser CSS sample its card regions directly: front `(161,171,518,777)`, back `(1005,171,518,777)` within the original 1752×1024 image. The card's words and pictured QR code are retained from the supplied artwork. The game does not use the QR image for recognition.

## Full 3D scene (V0.3)

`tools/build_world.py` creates the crater heightfield, basalt debris, solid road ribbons, infrastructure, 40 fracture blocks, detailed landers and two six-wheel science rovers in local Blender. `art/lunar-world.blend` is the editable master. Runtime models are `lunar-world.glb`, `science-rover-blue.glb`, `science-rover-gold.glb`, `landers-detailed.glb` and `meteorite.glb`. Materials are procedural or authored colors; no Hyper3D or downloaded third-party mesh is used.

`art/moonquake.blend` and `dist/assets/moonquake.gif` show keyframed fracture blocks, a sinking road and modeled ejecta. `art/rover-detail.png` is a Blender render. Build and GIF encoding scripts are included.

The supplied card artwork (including its QR code) and derived animation were explicitly approved by the user for public publication to TeresaPeng-zju/lunar-evacuation-race and its demo website on 2026-11-19. This records publication authorization, not a claim that the original artwork is newly authored by this project.

Three.js 0.180.0 is vendored under its MIT license at `dist/vendor/three/LICENSE`. The card uses the exact reference crop coordinates as mesh UV transforms in `dist/world.js`.

## 2026-11-20 · 参考图三维重建

`art/reference-library/` 与 `dist/assets/reference-models/` 是参照用户提供的 `moon_map_cinematic_v2_标准工程包` 重新构建的 20 个设施和地形。该包仅有栅格渲染素材，无源网格；新模型的不可见侧面、内部构造、部分形体和动效为补建设计，不标作原作者的原始模型。保留原地图格位，未直接嵌入原始图片或视频。用户已表示同学提供的素材可投入使用。

生成脚本为 `tools/build_reference_library.py`、`tools/reference_textures.py`、`tools/render_reference_animation.py` 与 `tools/encode_reference_animation.py`。完整工程、重建边界、单位和重新生成方法见 `art/reference-library/README.md`。
