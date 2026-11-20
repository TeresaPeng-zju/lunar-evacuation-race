# Moonfall visual calibration sample

This is an isolated art study, **not an approved replacement for the race map**. The current assets still fall short of the supplied cinematic reference in silhouette complexity, building facade detail and material definition.

Open `moonfall-visual-sample.blend` in Blender, or run `npm start` and open `/visual-lab.html`. Blender 5.4 Alpha was used; older Blender compatibility has not been verified.

## Sources and edits

- Existing `terrain.glb`: cropped, corridor and foundation rocks removed, existing surface vertices graded; no replacement terrain or building primitive generated. Existing basalt materials retained.
- Existing `research-station.glb`, `beacon-1.glb`, `science-rover-blue.glb`: imported intact, placed and scaled. Existing beacon illuminated assembly is shown in its activated state. Facility/rover color factors, metalness, roughness and texture slots are regression checked.
- Derived terrain material: unique 2048px albedo, roughness, normal and cavity AO atlas; road compaction and tire wear follow an exact excerpt of the engine route. No raised road ribbon.
- External ground material: [Moon 04 by Poly Haven](https://polyhaven.com/a/moon_04), [CC0](https://polyhaven.com/license). Authors: Greg Zaal, Jenelle van Heerden, Rico Cilliers. Captured from lunar simulant at Spaceport Rostock's laboratory, not photographed on the Moon. Four original 2K source textures are retained in `source-textures/`. Ground diffuse was neutralized/darkened; normal and roughness were reduced on compacted driving areas.

The input package `moon_map_cinematic_v2_标准工程包` contains image/video assets, not original GLB/Blend models. The existing repository library was reconstructed from those images in an earlier pass. This sample reuses that library and does not claim recovered high-detail source geometry.

## Rendering boundary

GLB retains meshes, UVs, PBR image maps, material factors and placements. Direct sunlight, reflections, shadow filtering, GTAO, bloom and tone mapping are rebuilt in Three.js. Only surface material information and microscopic cavity AO are baked; direct lighting and facility contact shadows are not baked. Blender compositor output is not claimed to transfer to the browser.

The browser renderer uses ACES plus OutputPass for display conversion, 4096px directional shadows in a tight volume, half-resolution GTAO and low-strength bloom. Static shadow maps update when the model or lighting changes; animated production scenes will need an explicit update policy. Original game and archive whole-map lighting presets can be applied to the same scene/camera for comparison. These presets isolate lighting differences; they are not full reproductions of the original game's geometry or shader overrides. Original game/library pages remain unchanged.

## Repeatable workflow

1. Audit source GLBs with `python tools/audit_visual_assets.py` (Pillow required).
2. Build the initial editable assembly with `blender --background --factory-startup --python tools/build_visual_sample.py` (Blender includes NumPy).
3. Refine placements and materials visually in the `.blend`, using the two named cameras. The build script is a reproducible starting assembly; rerunning it overwrites the derived `.blend` and GLB, so save manual edits separately first.
4. Export selection to `dist/assets/visual-sample/scene.glb`, retaining materials/UVs. Update its SHA-256 in `manifest.json`; the browser uses it to invalidate cached model versions.
5. Inspect the real browser default/top/close views and lighting presets. Export screenshots from the page. A successful export or passed test is not an art approval.
6. Only after the visual gate passes should the renderer and layout approach be integrated into the full race map.

Do not use this sample's camera, display size or artistic units as robot calibration. The copied centerline is validated against `engine.js`; the game engine, route lengths, rock detours and hardware adapters are unchanged. For a physical screen the final production renderer must use a calibrated orthographic mapping from board centimeters to the active display rectangle and suppress occluding decoration inside the driving envelope.

## Engine checkpoint

The current recommendation is Blender scene/material authoring plus Three.js interaction. The visual gate has **not passed**: this is a documented calibration sample, not the requested final cinematic quality. Source facade detail, roof materials and terrain forms remain the primary limits; switching renderer does not supply missing detail.

Unity Editor/Hub was not found on the current machine. A staged identical-asset experiment and a browser comparison procedure are available in [Unity validation plan](../../experiments/unity-visual-check/README.md). No Unity render or performance result is claimed. Existing hardware integration is still a documented proposal, not an implemented hardware adapter.
