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

## 新版可玩废墟场景

`ruins-game/moonfall-ruins.blend` 保留 Phase 02 可编辑地形与设施，恢复原 GLB 材质并加入游戏锚点。`ruins-game/map_spec.json` 保存原蓝图，`export-report.json` 记录来源哈希与导出信息。实际游戏加载 `dist/assets/ruins-game/`，重导出方法见 [3D 游戏说明](../docs/gameplay-3d.md)。

双屏联动工程：`dual-screen/moonfall-dual-screen.blend` 从已完成的废墟工程派生，保留地形与资产，仅对齐实体三段展开道路、信标/舱门和设施避让。`tools/export_dual_scene.py` 可复现，厘米路径不变。

实体月面主赛区：`floor-arena/moonfall-physical-arena.blend`，含三段严格正俯视场景。底图由现有 GLB 和 Moon04 PBR 实际渲染，事件层在厘米坐标中动态绘制。
