# 代码维护说明

## 从哪里改

| 需求 | 修改位置 |
| --- | --- |
| 棋盘尺寸、道路、绕石、停车点、回转中心 | `dist/sandbox/geometry.js`，同步地图版本与几何测试 |
| 比赛规则、定位校验、路线事务、判胜、恢复 | `sandbox/engine.mjs` |
| 硬件消息封装与能力字段 | `sandbox/protocol.mjs` |
| 本地 HTTP、WebSocket、控制窗口权限 | `sandbox/server.mjs` |
| 启动参数与帮助 | `sandbox/options.mjs` |
| 无电机参考执行器 | `sandbox/simulator.mjs`，独立运行入口 `sandbox/mock-client.mjs` |
| 电脑控制台 | `dist/sandbox.html`、`dist/sandbox/app.js`、`dist/sandbox/style.css` |
| 只读月面主赛区 | `dist/floor.html`、`dist/floor/`；背景资源在 `dist/assets/floor-arena/` |
| 实体路径到 3D 全景的映射 | `dist/display/map.js`，不得改变实体路径 |
| 当前 3D 画面 | `dist/ruins-world.js`、`dist/ruins-map.js`；`dist/visual-lab.js` 保留美术样板 |
| 原单张地图 3D 规则演示 | `dist/engine.js`，不驱动实体车辆 |

Node 和浏览器直接导入同一份实体路线几何。`dist/shared/rules.js` 只共享选路时长等基础常量；两套规则演示不会互相推进状态。浏览器页面只展示 Node 快照，不能用渲染帧代替定位真值。具体协议见 [硬件联调说明](hardware-integration.md)。

## 开发与验证

```sh
npm ci
npm start
# 修改文件后刷新页面；Node 代码改变时先停止，再重新启动
npm run format
npm run format:check
npm test
```

不启用自动重启服务，避免联调过程中编辑文件导致硬件会话意外丢失。格式化范围限定为联调模块、共享常量及其测试，不修改第三方库或批量重写 3D 美术代码。

`npm test` 包含三段完整比赛、路线组合、异常恢复，以及真实本地 HTTP / WebSocket 启动检查。启动检查使用临时空闲端口，不占用正在联调的 4174。测试不连接实际电机。

仅运行联调无需重建美术资源。`npm run assets:routes`、`npm run vendor` 和 `tools/*.py` 分别用于旧 3D 路线导出、固定 Three.js 副本更新和 Blender 资源制作，详细流程保留在 `art/`。

## 本次整理

- 默认入口统一到 `npm start`，原 3D 页面由同一个服务提供；删除根目录重复静态服务 `server.mjs`。
- 删除没有运行引用的 `dist/effects.js`、`dist/trails.js`。当前 3D 效果由 `dist/ruins-world.js` 实现。
- 删除被沙盒取代的 `physical-track.html/js/css` 和旧坐标提案，避免两套路线同时成为联调依据。
- 将完整硬件说明集中到 `docs/hardware-integration.md`，原 3D 说明迁至 `docs/gameplay-3d.md`；没有缩减协议字段与回执要求。
- 保留全部 GLB、Blender 工程、贴图、渲染成果和生成工具。旧图片仍可能作为 CSS 背景或资产来源记录，不将它们误删为无用代码。
- 保留已发给硬件端的旧 npm 命令别名。本机配置 `config/*.local.json` 被忽略；只提交未标定的模板。

GitHub Pages 继续发布静态 3D 演示。联调服务含状态与 WebSocket，不能把静态网页发布成功当作硬件接口已部署。
