# Moonfall · 月球撤离赛

双人月球车竞速。当前默认入口是**硬件联调沙盒**：59.8 × 33.6 cm 棋盘、6 × 6 cm 小车、三段独立折返、落石实际绕行、月震选路与终点停车。原有 3D 游戏、模型库和美术样板保留为独立页面。

## 启动

需要 Node.js 20 或更高版本。在仓库根目录运行：

```sh
npm ci       # 首次下载或依赖更新后执行
npm start    # 日常联调只需这一条
```

打开 **<http://127.0.0.1:4174/>**。默认使用内置无电机模拟器，不需要相机、小车、Blender 或 Unity，也没有构建步骤。点击“配置地图”，选择路线，再点击“双车发车”。

| 页面 | 本地地址 |
| --- | --- |
| 联调控制屏 | <http://127.0.0.1:4174/> |
| 27 寸行驶屏（只读） | <http://127.0.0.1:4174/sandbox.html?floor=1> |
| 原 3D 游戏 | <http://127.0.0.1:4174/index.html> |
| 模型库 | <http://127.0.0.1:4174/library.html> |
| 美术样板 | <http://127.0.0.1:4174/visual-lab.html> |

一个服务提供全部页面。只有第一个控制窗口可操作；额外窗口只读。关闭主控窗口会暂停比赛。`Ctrl+C` 停止服务；真实车辆仍需硬件端本地失联停车。

## 手机 NFC 刷卡

启动游戏后，在电脑打开 [手机读卡监控页](http://127.0.0.1:4176/)。将手机与电脑接入同一 Wi-Fi，在安卓「MoonFall 读卡」App 中填写监控页显示的电脑地址，连接后即可贴卡。

电脑根据 NFC 编号识别蓝黄双方各五种牌，并向手机返回游戏处理结果。游戏主控首页显示刷卡机连接状态和双方本局最近成功打出的牌。末段秘密选路时只显示「已锁定」，选择公开后显示牌名。点击「刷卡机」可查看刷卡记录和拒绝原因。

## 硬件端接入

停止内置模拟服务后，启动外部接口模式：

```sh
npm run hardware
```

硬件适配器连接 `ws://127.0.0.1:4174/hardware`。无实车时，另开一个终端运行 `npm run mock`，验证同一接口；真实适配器与 mock 不能同时占用硬件连接。

真实执行器需先复制 `config/hardware.example.json` 为 `config/hardware.local.json`，填写实测标定参数，然后运行：

```sh
npm run hardware -- --profile config/hardware.local.json
```

完整消息、回执顺序、落石/回转/故障恢复和参数要求见 **[硬件联调接入说明](docs/hardware-integration.md)**。地图唯一来源为 `dist/sandbox/geometry.js`，运行时可下载 <http://127.0.0.1:4174/api/map>。游戏端负责规则与路线事务；硬件端负责实际定位、沿路线行驶、转向、制动和保护。模拟验证不代表实车已验收。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm start` | 内置模拟联调 |
| `npm run hardware` | 外部硬件接入 |
| `npm run mock` | 无电机参考硬件客户端 |
| `npm start -- --port 4175` | 指定端口；不自动跳端口 |
| `npm start -- --help` | 全部启动参数 |
| `npm test` | 规则、路线、资产和启动服务回归 |
| `npm run test:sandbox` | 只检查联调模块 |
| `npm run format` | 整理联调代码格式 |
| `npm run format:check` | 检查联调代码格式 |

`npm run dev`、旧 `npm run sandbox` 是 `npm start` 的兼容别名。旧 `sandbox:hardware`、`sandbox:mock` 也仍可用。端口占用时先检查已有服务，或显式换端口；参考客户端需匹配端口，例如 `npm run mock -- ws://127.0.0.1:4175/hardware`。安装时报 `ws` 缺失，先在仓库根目录执行 `npm ci`。

## 目录

```text
sandbox/       Node 联调服务、状态机、协议、硬件模拟器
dist/sandbox/ 联调控制屏与行驶屏、共享的实体路线几何
dist/shared/  3D 原型与沙盒共用的基础规则常量
dist/         浏览器页面源码、3D 运行资产、固定版本 Three.js
config/        实车配置模板；*.local.json 不提交
docs/         硬件联调说明、3D 玩法与维护边界
tests/        自动化回归
art/          Blender 源工程、贴图来源、离线渲染成果
tools/        美术资源生成与导出脚本，启动联调不需要执行
experiments/   独立 Unity 视觉验证方案，不参与比赛运行
```

`dist/` 沿用已有 GitHub Pages 路径，**是受版本管理的浏览器源码与资源，不是可随手删除的构建缓存**。修改后刷新即可。`node_modules/`、`work/`、本机配置和测试临时文件不进仓库。

进一步阅读：[3D 游戏与美术样板](docs/gameplay-3d.md) · [代码维护说明](docs/development.md) · [素材来源](ASSETS.md) · [Blender 工程](art/README.md)。[在线 3D 演示](https://teresapeng-zju.github.io/lunar-evacuation-race/) 仅为静态页面，硬件沙盒必须运行本地 Node 服务。
