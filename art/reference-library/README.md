# 月面场景重建 · 第一版

以提供的 `moon_map_cinematic_v2_标准工程包` 中的俯视渲染图为造型参考，新建实体几何。原包不包含 Blender / glTF 源模型；本文件夹是重新建模的产物，不是恢复出的原始工程。侧面、背面、内部支撑及动画节奏为新设计，轮廓与气质参考原图，尚非逐像素复刻。

## 打开和使用

- `moon-map-reconstructed.blend`：完整 8×5 场景、20 个设施集合、可编辑网格、材质、相机、灯光和 1–97 帧动画。纹理已打包进工程。使用 Blender 5.4 Alpha 生成；较旧版本是否完整兼容尚未验证。
- `../../dist/assets/reference-models/moon-map.glb`：完整三维场景，包含材质贴图和变换动画。
- 同目录下 20 个单体 GLB：以各设施局部原点导出，便于加载和摆放。`terrain.glb` 是独立地表。
- `manifest.json`：中文名、ID、原图格位、地图像素中心、glTF 世界坐标、动效标记。
- `overview.png`：与原图布局对应的正俯视渲染；`cinematic.png`：斜俯视渲染。
- `ruin-detail.png`、`station-detail.png`：模型细节；`relic-activation.gif`：从 Blender 实体场景逐帧渲染的 GIF。
- 游戏顶部「场景模型」进入网页预览，可选择单体、旋转、切换俯视/线框、播放与复位、下载 GLB。

## 结构和动画

20 个设施包括水冰矿坑、三座信标、废弃营地、着陆平台、补给站、晶矿采掘场、中央遗迹、电弧塔、着陆基地、钻井平台、前哨舱、飞船残骸、流沙坑、科研站、氦-3 采矿机、栈道、探测器残骸和陨石坠落。

10 个有动效的设施包含真实网格的平移、旋转、缩放：信标亮条、平台滑门、补给吊臂、遗迹能量环、电弧、流沙圈层下沉、科研天线转动及陨石/碎片轨迹。没有用原始 GIF 做平面替代。每个 GLB 可能包含多个同步轨道；播放器应同时播放所有动画，单次播放并停在末帧。复位到时间 0 即未激活态。

基底是带高度的陨石坑地形，并在遗迹井、流沙坑、矿沟下方留出开口。建筑采用分层壳体、加强筋、螺栓、管线和格栅；飞船发动机有空心喷口。网格按不动/运动部件合并以减少实时渲染调用，仍可在 Blender 编辑模式按连通部分选择与拆分。地形与碎石不是模拟物理碰撞体。

## 尺度与游戏接入边界

一个 200 像素格对应 10 个美术单位。Blender Z 向上，glTF Y 向上。地图原点在中心；glTF 的 X 向右、Z 向原图下方。美术单位不等于硬件厘米，需要以实际棋盘尺寸和有效显示区换算。

此次提供模型库与渲染预览，现有双车道游戏仍使用原竞速地图。原素材 8×5 格位、模型可见包围框和实际可通行道路不是同一套数据；本库没有擅自改变赛道、实车路线或标定接口。平台开门等为展示动作，未连接硬件控制。

## 可重复生成

在仓库根目录执行（替换本机 Blender 和 Python 路径）：

```sh
python3 tools/reference_textures.py
blender --background --factory-startup --python tools/build_reference_library.py
blender --background --factory-startup --python tools/render_reference_animation.py
python3 tools/encode_reference_animation.py
npm test
```

纹理生成及 GIF 编码需要 Pillow。贴图由噪声、蚀点、划痕从零生成，未直接复制参考图像素。全部资源随 GLB 嵌入，网页不依赖外部 CDN。
