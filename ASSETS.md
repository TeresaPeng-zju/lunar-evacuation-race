# Asset provenance

`dist/assets/moon-terrain.png` was generated with the built-in image_gen tool for this project. The supplied 3.gif inspired the lunar industrial direction but is not included in this repository. Roads, rover bodies, beacons, gates, ships, rocks and visual feedback are drawn by Canvas code.

## Final generation prompt

Use case: stylized-concept. Asset type: top-down videogame moon terrain background. Create an original high-detail 1600x1000 landscape orthographic 90-degree overhead lunar industrial environment, in the spirit of gritty classic science-fiction RTS terrain. Charcoal grey regolith, tiny sharply lit pebbles and scattered shallow craters, realistic baked ambient shadows, dark desaturated metal. IMPORTANT layout: entire central 85% is mostly flat navigable fine-grain regolith, sparse small craters only, no roads whatsoever. A few abandoned industrial solar-panel structures, pipes and small habitat modules clustered ONLY at extreme upper and lower edges and corners (outer 8%). A delicate cyan glowing fissure at extreme bottom right corner. Monochrome warm grey stone, subtle copper weathered metal details, restrained cold blue solar panels. Crisp textured game art, not a photo, no perspective horizon, no sky, no text, no labels, no vehicles, no UI, no paths, no large obstacles in center. This is a base layer for programmable two-lane racing tracks so keep central area clear and visually quiet.

## Tire-track sprite

`dist/assets/tire-tracks.png` derives from the two-strip chevron tread image supplied by the user. The source had an opaque checkerboard background. The built-in image_gen tool produced the transparent-background version; this is a generated cleanup, not a pixel-exact extraction. The game crops and rotates this sprite into decals behind each rover along its actual traveled path. Track history is shared with the ground display and cleared on reset.

Final edit prompt:

Use case: background-extraction. Edit the attached tire-track sprite. Remove all white and pale grey checkerboard background pixels and replace background with actual transparent alpha, including the gap between the two tracks. Preserve the two original straight parallel vertical narrow dusty grey-brown chevron tire tread strips, their original spacing, their small repeated V-shaped tread pattern, weathered granular texture, shaded edges and orthographic overhead view. No invented objects. No text. No ground or checkerboard baked into output. Keep the original composition and aspect ratio: two long thin vertical strips at approximately x=29% and x=61% of the canvas, running almost from top to bottom, approximately 6% of canvas width per strip. Tight clean transparent cutout suitable for a game sprite. Do not turn it into rubber tires or thick tank tracks. Output transparent PNG.
