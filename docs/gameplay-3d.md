# Moonfall 可玩 3D 版

在仓库根目录运行 `npm ci`（首次），再运行 `npm start`。打开 <http://127.0.0.1:4174/index.html>。同一服务的 `/` 仍是硬件联调沙盒。

## 操作

1. 蓝黄双方各选信标回廊或废弃栈道，点击“同时翻牌 · 开始撤离”。
2. 每人一张落石。系统只允许攻击对手前方合法落点；预警 2 秒后落地，车辆走实际绕行道路。
3. 首车进入月震区，双方有 7 秒秘密选择碎隙捷径或归航环路；车辆继续行驶。双方提交后同时公开，未提交者超时默认环路。
4. 第一辆车到达捷径震源后判定一次共享余震，稳定/塌陷各 50%。实际抵达停靠区才判胜；结果页可重开。

| 操作 | 蓝方 | 黄方 |
| --- | --- | --- |
| 第一 / 第二张路线卡 | 1 / 2 | 8 / 9 |
| 落石 | Q | P |

空格暂停/继续。也可直接点击页面按钮。“自动演示”可完整展示一局。游戏视角随双车进度移动，全图视角展示整个基地；严格俯视方便检查路线。鼠标拖动后进入自由观察，点击视角按钮恢复。

同屏只隐藏已选结果，不能防止对手观察操作。正式比赛仍需独立选牌区域。

## 场景和规则边界

- `dist/engine.js` 原 V2.0 `Race` 是唯一虚拟对局状态机；本次没有修改其路径、速度、落石、余震和胜负规则。未加入 V2.1 建议。
- `dist/ruins-world.js` 只消费状态，驱动 GLB、车辆、道路高亮、卡牌、舱门和断层。
- `dist/ruins-map.js` 实现 Phase 02 蓝图的映射。逻辑坐标 `(x,y)` → Blender：蓝方 `(-32-.075y, .075x-55.25)`，黄方 `(32+.075y, .075x-55.25)`；高度跟随原灰模道路，glTF 为 `(X,Z,-Y)`。40 个道路网格保留原路径点。
- 灰模地形、双车道、设施分区和中央环形遗址保留。恢复已有 GLB 材质；月壤使用原有 Moon 04 PBR 的中性灰派生贴图；崖壁占位块在原位置替换为现有玄武岩模型。没有重新生成全地图。
- `art/ruins-game/moonfall-ruins.blend` 是可编辑升级工程。`dist/assets/ruins-game/static-scene.glb` 为合批静态场景，`interactive.glb` 保留道路、信标、门、断层和事件锚点。车辆和落石复用现有单体 GLB。
- 主光、阴影、环境反射、AO、Bloom 和相机在 Three.js 运行时设置；并未宣称 Blender 灯光能通过 GLB 完整传递。

## 实体屏幕与待接能力

`index.html` 保留独立虚拟试玩。需要电脑全景与实体行驶屏联动时，使用 **电脑控制台 `/sandbox.html` + 月面主赛区 `/floor.html`**：它们同时订阅 Node 游戏服务，不创建第二套对局。

双屏版从批准的实体路径展开连续 3D 道路，已对齐信标/舱门顺序、第三段共用落石入口、回转衔接、余震和实际终点判定。真实硬件接入仍需定位、循迹、回执和卡牌识别。详见 [双屏同步说明](dual-screen.md) 与 [硬件接口](hardware-integration.md)。

## 工程验证

`npm test` 检查原规则、硬件沙盒、GLB 道路节点与坐标映射。正常入口使用实时比赛时钟和原有 50% 随机规则。

`index.html?qa=1&outcome=stable` 或 `outcome=collapse` 仅用于工程验证，会显示明显的测试标识并使用手动时钟。通过 `window.lunarTest.advance(秒数)` 推进同一个 `Race.step`；不会修改车辆位置。没有 `qa=1` 时不暴露此接口，也不会使用固定余震。只读检查接口为 `window.lunar.snapshot()` 和 `window.lunar.world()`。

浏览器分辨率自适应，渲染预算上限约 180 万像素，避免高分屏无上限扩大 GPU 成本。窗口像素与实际渲染像素不同，应同时记录再比较性能。

## 重新导出

已导出的 GLB 可直接使用，玩游戏不需要 Blender。重新从 Phase 02 升级时：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 \
  --python tools/finish_ruins_scene.py -- /绝对路径/moonfall-phase01-02
```

输入目录需要原 `moonfall_blockout.blend` 和 `map_spec.json`。脚本保留输入文件，输出升级工程与运行资产。默认使用仓库同级的 `moonfall-phase01-02`。材质已打包进升级 `.blend`，也可直接用 Blender 编辑后导出；静态合批只发生在 GLB 导出阶段。

已安装 Playwright CLI 时，可重复执行实际浏览器分支验证（保持本地服务运行，另开终端）：

```sh
mkdir -p work/browser-proof
playwright-cli -s=moonfall open http://127.0.0.1:4174/index.html --browser=chrome
playwright-cli -s=moonfall run-code --filename=tools/verify_ruins_browser.js
```

该脚本点击实际页面按钮，分别跑稳定、塌陷、超时默认环路三局；只通过工程时钟加速同一个状态机，截图写入 `work/browser-proof/`。
