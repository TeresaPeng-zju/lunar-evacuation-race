# 正式游戏与双屏集成

## 直接试玩

首次 `npm ci`，之后 `npm start`。默认地址：

- 电脑控制台：`http://127.0.0.1:4174/`
- 27 寸行驶屏：`http://127.0.0.1:4174/floor.html`

电脑使用扩展显示。将行驶屏窗口移到 27 寸屏后点击“全屏赛区”。屏面有效面积按 59.8 × 33.6 cm，需在实物上核对浏览器缩放、系统缩放与实际边界。不要用透视全景作为实体车行驶地图。

控制台点击“配置地图” → 两位玩家选择信标回廊／废弃栈道 → “双车发车”。比赛中可向对手投放落石；月震后在 7 秒内秘密选择末段路线，未提交者按现有规则选择归航环路。车辆实际到达终点后判胜，双车停稳后本局结束，可重置再配置下一局。

暂停恢复顺序为“暂停” → “查询停机快照” → “确认恢复”。主控只有一个，额外控制台是只读。行驶屏刷新、关闭再打开只恢复最新状态，不抢占控制权、不重置比赛。

## 已维护的美术源

- `dist/ruins-world.js`：正式默认加载 `assets/production/physical-scene.glb`；独立虚拟试玩加载 `virtual-scene.glb`。不需要预览参数。
- `dist/lunar-look.js`：已确认光照、曝光、阴影及材质分组。
- `dist/lunar-surface.js`：全场景道路采用已确认的浅化压实月壤处理，顶点与路线选择不变。
- `art/production/moonfall-physical.blend` / `moonfall-virtual.blend`：完整可编辑正式场景。
- `dist/assets/production/research-station.glb`：已确认建筑的复用资产，同类居住／科研设施使用统一主舱造型。采掘、通讯、着陆设施保留各自功能模型。
- `art/floor-arena/moonfall-physical-arena.blend`、`dist/assets/floor-arena/stage-1.png` 至 `stage-3.png`：更新后的严格正俯视场景底图。
- `dist/floor/renderer.js`：在原有厘米坐标中叠加道路、信标、门、落石、裂缝、终点及状态，最后绘制标记，保持关键内容可见。美术版本由底图清单读取。

`dist/` 是仓库维护的源码及运行资源，日常运行没有打包步骤。普通联调不需要 Blender。

## 重新生成美术资源

安装 Blender 后，在仓库根目录运行：

```sh
npm run assets:build
```

macOS 自动识别 `/Applications/Blender.app/Contents/MacOS/Blender`；其他位置设置环境变量 `MOONFALL_BLENDER`，或将 `blender` 加入 PATH。

命令依次执行已确认局部配方、全场景推广导出、三段行驶屏烘焙。它不会重新生成游戏地图或协议。行驶屏 Cycles 渲染耗时取决于机器；运行时直接加载已生成 PNG。任一步失败返回非零退出码。

## 不变的系统边界

`dist/sandbox/geometry.js`、`dist/display/map.js`、`dist/floor/map.js`、两套地图 JSON、行驶屏 `layout.json`、`sandbox/engine.mjs`、`sandbox/protocol.mjs` 均未修改。比赛状态仍只有 Node 服务一个来源。地图节点、触发区、路径长度、碰撞／车体包络、通信字段和坐标映射保持原约定。

造型修改不增加硬件物理障碍。三维地形高差仅用于电脑展示；正俯视底图的阴影和设施不参与车体碰撞计算。真实定位仍由硬件端的 AprilTag 与标定提供，不从月面底图自动反推路线。

## 验收方式和边界

- `npm test`：规则、地图、接口与资产回归。
- `tools/verify_dual_display.js`：正式双屏两局，固定稳定／塌陷，开局和末段落石绕行、个人门、暂停恢复、终局与重置。
- `tools/verify_production_play.js`：1× 实时完整比赛，交换开局路线、7 秒超时、行驶屏运行中刷新／重开、位置／阶段／计时／结果一致、约 3.5K 控制台与 4K 行驶屏性能、第二局发车与停机。
- `tools/verify_ruins_browser.js`：保留的独立虚拟试玩回归。该页面不控制实体机器人。

这些均为软件和无电机模拟验证。当前未连接 USB 相机、实体车辆或真实卡牌识别器，不构成硬件验收。

硬件同伴需要提供的最小联调条件：有效屏面标定与 `calibration_id`、双车 AprilTag 中心及朝向、至少 20 Hz 有效定位、路线接收和执行回执、6×6 cm 车体及原地回转实测、速度／制动／综合误差实测、到位停稳报告与本地失联停车。真实执行器通过现有 `npm run hardware -- --profile config/hardware.local.json` 接入；具体要求沿用 `docs/hardware-integration.md`。

### 本轮实际结果（2026-11-24）

83 项回归、42 项双屏两局、52 项 1× 实时整局／刷新恢复／性能／重开，以及 20 项独立 3D 试玩验证通过。1× 比赛蓝方 67.64 秒进入终点，黄方 70.16 秒，71.56 秒双车停稳；之后新一局正常发车与停止。当前电脑约 3.5K 页面下控制台复杂终局约 30 FPS，4K 行驶屏约 30 FPS。真实硬件通过项为零，仍须完成上述实体联调。

### 科研站样板升级

现有场景中的科研／居住设施已复用新的层次化屋面、气闸门框、暖色窗带及第二套 UV 的降噪 AO。主场景保留原光照，后处理增加 SMAA。环境与站房分组导出，避免地形携带多余的建筑 AO 坐标。完整可玩流程和实体映射不变。

`npm run assets:station-review` 可重新输出固定镜头的 Blender 灰模、材质图和可编辑工程；实际游戏以 `?inspect=station` 参数查看同一栋科研站。详见 [科研站样板说明](station-study.md)。
