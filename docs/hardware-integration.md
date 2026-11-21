# Moonfall 硬件联调沙盒

版本：v0.3-sandbox.1。对应《三段实体赛道设计与硬件联调说明 v0.3》。

本版用于游戏端、定位端和车辆控制端联调。已有 3D 游戏和模型保持原状；沙盒使用独立的二维画面。通过的是软件模拟验证，不代表实车已通过验收。

## 1. 启动与使用

需要 Node.js 20 或更高版本。完整项目首次安装依赖：

```sh
npm ci
npm start
```

打开：

- 控制与展示屏：`http://127.0.0.1:4174/sandbox.html`
- 27 寸行驶屏：`http://127.0.0.1:4174/sandbox.html?floor=1`

操作顺序：

1. 点击“配置地图”，等待定位有效、地图确认。两车中心应为 `(6,8.4)`、`(6,25.2)`，朝右、停稳。
2. 两人选择信标回廊或废弃栈道，点击“双车发车”。
3. 第一段可以向对手投落石；无安全落点时不能扣卡。
4. 月震后在 7 秒内选择末段。双方提交后同时公开，未提交默认归航环路。末段公开后可预约对手第三段入口落石。
5. 车辆独立换段，先入区者获胜。判胜后仍继续行驶到停车点，双车停稳才结束。

模拟器提供 1× / 4× / 8× 时间倍率、固定稳定 / 固定塌陷、丢定位、无效定位、拒绝下一路线、丢回执。时间倍率只用于内置模拟器，外部硬件模式始终使用实时时钟。

同一服务只允许一个主控窗口；额外控制窗口和地面屏只读。关闭主控窗口会暂停正在运行的比赛。重新打开后不会自动恢复运动。

`npm start` 与 `npm run dev` 现在都启动同一个 4174 联调服务，3D 游戏在 `/index.html`，模型库在 `/library.html`。此服务不需要打包步骤；静态托管和 GitHub Pages 不提供硬件接口。

默认端口被占用时，先检查是否已有联调进程，或运行 `npm start -- --port 4175`；外部模式用 `npm run hardware -- --port 4175`。不会自动跳到另一个端口，以免接错硬件会话。`npm start -- --help` 可查看所有参数。

## 2. 游戏端与硬件端的边界

```text
控制 / 展示浏览器 ── /ui WebSocket ── 游戏端 Node 服务
行驶屏浏览器     ── /ui（只读） ────┘       │
                                      /hardware WebSocket
                                           │
                                      硬件端适配器
                                       │        │
                                  USB 相机定位  小车控制器
```

- 游戏端 Node 服务是唯一比赛状态来源，负责规则、路线版本、落石、共享余震、判胜和日志。
- 浏览器只发送玩家/工作人员操作并呈现状态；不按浏览器动画估计车辆位置，不发送电机速度。
- 硬件端适配器负责相机时间戳、标签到车体中心换算、自动跟随已批准路径、回转、制动、急停及真实执行回执。
- 行驶屏使用固定二维厘米坐标，按比例留边，不做透视、不随月震抖动。全屏后必须重新确认实际显示矩形和标定对应；预览图不是自动完成了屏幕标定。
- 地面屏默认不绘制虚拟小车，避免盖住实际车；主控屏显示定位车体与包络。

相对早期接口提案，本版把本地桥接服务具体实现为游戏端 Node 服务，硬件端以 WebSocket 客户端连接。若硬件程序已有自己的 WebSocket 服务，可在硬件适配器中转接；不要让两侧各自推进比赛状态。

## 3. 外部硬件接入

先停止占用 4174 的内置模拟服务，再启动：

```sh
npm run hardware
```

硬件端连接 `ws://127.0.0.1:4174/hardware`。每次只允许一个硬件连接，由它汇总两车定位与状态。默认只绑定本机回环地址，适用于相机 USB 直连展示电脑。跨电脑运行需另行设计受控的网络通道，本版不自动开放局域网端口。

无相机、无小车时，用另一个终端验证同一网络接口：

```sh
npm run mock
# 或指定测试服务
npm run mock -- ws://127.0.0.1:4175/hardware
```

`mock-client.mjs` 是独立进程、无电机的参考硬件端。完整实现位于 `sandbox/simulator.mjs`，适合对照消息与执行状态，不是实际车辆驱动。

启动真实执行器前，把 `config/hardware.example.json` 复制为 `config/hardware.local.json` 并填写实测值（本机配置已被 Git 忽略）：

```sh
npm run hardware -- --profile config/hardware.local.json
```

硬件端 `hardware.hello.actuators_enabled=true` 时，游戏端要求：双方 `parameters_verified=true`、相同 `calibration_id`、本版 `map_revision`、实测屏面 59.8 × 33.6 cm、最高速度 2 cm/s、综合误差≤0.8 cm、停车距离≤2 cm、定位过期阈值 150 ms，以及有效的实测并列窗口。模板中的 null 不得直接改成随意数值。

`actuators_enabled=false` 只允许用于确实不驱动电机的适配器，不是绕过实车参数校验的开关。游戏端无法替代车辆本地的急停和失联保护。

## 4. 坐标与完整地图

坐标单位 cm；原点为有效棋盘左上角，X 向右、Y 向下。位姿基准为车体中心在屏面的投影。角度使用 `[-180,180)`：朝右 0°，顺时针为正，朝下 90°，朝左 −180°。

| 项目 | 值 |
| --- | --- |
| 棋盘 | 59.8 × 33.6 cm |
| robot_id | `rover-blue`、`rover-gold` |
| 车道中心 cy | 蓝 8.4、黄 25.2 |
| 车体外廓 | 6 × 6 cm |
| 任意朝向车体＋误差包络 | 半径 5.042640687 cm |
| 第一段 | `(6,cy)` → `(53.8,cy)`，方向向右 |
| 第二段 | `(53.8,cy)` → `(16,cy)`，方向向左 |
| 第三段 | `(16,cy)` → `(53.8,cy)`，方向向右 |
| 两次回转 | 中心不变，朝向 0°→−180°→0° |
| 终点入区 | 第三段最后直道，由 x<51 向右进入 x∈[51,54.3]、y∈[cy−0.8,cy+0.8]，朝向±10° |
| 停车点 | `(53.8,cy)`、朝右。路径中预设停车，不等获胜消息才刹车 |

完整地图可在服务运行时下载：`http://127.0.0.1:4174/api/map`。唯一数据源是 `dist/sandbox/geometry.js`。旧版赛道动画和过期坐标提案已经移除，以免硬件端使用两套路线。

地图包括两车各 11 条路线、路点、长度、解析直线/圆弧、触发点、终点多边形、停车点、回转计划和落石位置。所有直角控制点均用 1 cm 相切圆弧替换。`waypoints_cm` 的步长不超过 0.1 cm，`s_cm` 是解析弧长，包含最终停车点。几何测试用 0.02 cm 步长核查。

`swept_corridor` 使用“解析中心线沿线扫掠半径 5.042640687 cm 圆盘的并集”表示完整车体走廊。这是精确定义，不能用车道矩形或把自交多边形直接填充来替代。中心跟踪偏差上限 0.8 cm；几何与身份、版本、单调路径进度一起校验，禁止穿越未授权分支抄近路。

## 5. 通用消息封装

每个 WebSocket frame 是一个 UTF-8 JSON 对象；协议字符串必须完全匹配。

```json
{
  "protocol": "lunar-hw/0.3-sandbox",
  "type": "pose.frame",
  "session_id": "使用游戏端 hello 中的值",
  "match_id": "使用游戏端 hello 中的值",
  "seq": 12,
  "clock_id": "hardware-clock-1",
  "sent_mono_ms": 103010.0,
  "payload": {}
}
```

- 双方分别维护单调递增 `seq`；旧序号、错误会话或比赛的消息被忽略。
- `sent_mono_ms` 和采集时间都是该端同一个单调时钟，单位 ms，不能用墙上时间或未换算的摄像头设备时钟。
- 新连接创建新 `session_id`；新一局创建新 `match_id`。全局地图和标定 ID 不随单车换图变化。
- 单车每段的 `stage_instance_id` 由游戏端在 `match.configure` 中一次性分配。暂停恢复沿用；换段使用下一段实例。
- 同一 `command_id` 重发必须携带完全相同内容；硬件端返回缓存结果。同 ID 不同内容必须 rejected。重发也使用新的消息 `seq`。
- 本版没有把 `command.ack` 当作执行成功；必须返回下面规定的 `command.result`。

### 握手与校时

游戏端先发 `hello`；硬件端回 `hardware.hello`：

```json
{
  "capabilities": ["pose.frame","route.prepare","route.commit","route.activate","handoff.configure","independent_stages","combined_routes","local_watchdog"],
  "board": {"width_cm":59.8,"height_cm":33.6},
  "robot_ids": ["rover-blue","rover-gold"],
  "calibration_id": "本机实测标定标识",
  "parameters_verified": false,
  "actuators_enabled": false,
  "body_cm": [6,6],
  "turn_in_place": true,
  "pose_hz": 20
}
```

随后游戏端发 `ping`，包含 `ping_id`、`t1_game_mono_ms`。硬件端立即返回 `pong`，原样带回前两项，并加入 `t2_hw_mono_ms`（接收时刻）、`t3_hw_mono_ms`（发送时刻）。游戏端在接收时取得 t4，估计偏移和不确定度；往返不确定度过大时拒绝继续。进程在收消息时也采样实际时钟，不能只用上一次 20 ms 循环的缓存时间。

游戏端每 100 ms 发 `heartbeat`。硬件端在超过 500 ms 没有心跳、相机定位失效或车辆链路异常时必须本地停车并上报 `fault`；不能等浏览器通知停车。

## 6. 配置、路线与回执

`map.configure` / `match.configure` / `handoff.configure` 都含 `payload.command_id`。硬件端完成校验、安装配置后返回 `command.result` 的 `status: "completed"`。收到数据但未校验，不能返回 completed。

### 路线事务

```text
游戏端 route.prepare
  ↓ 硬件检查轨迹、边界、转弯、旧版本与定位
硬件 command.result: prepared
  ↓ 游戏核对硬件返回的执行轨迹
游戏端 route.commit
  ↓ 硬件锁定待执行计划，尚未表示已经行驶
硬件 command.result: armed
  ↓ 到达明确生效条件：发车 / 分叉 / 下一段激活
硬件 command.result: applied
```

| 消息 | payload 关键字段 |
| --- | --- |
| `route.prepare` | command_id、robot_id、stage_id、stage_instance_id、route_revision、expected_route_revision、完整 route、switch_at_cm、requires_decision_at_x_cm、blocked_edge_ids |
| `prepared` 回执 | 同 command_id、status、prepared_id、execution_path_cm、length_cm、expires_hw_mono_ms |
| `route.commit` | 新 command_id、prepared_id、robot_id、stage_id、stage_instance_id、route_revision、expected_route_revision、switch_at_cm、warning_ms、deadline_hw_mono_ms |
| `armed` / `applied` 回执 | 对应 commit 的 command_id、status、robot_id、route_revision、occurred_hw_mono_ms |
| `rejected` 回执 | 同 command_id、status、reason；不得悄悄换成别的路线 |

`execution_path_cm` 必须完整回传批准的路点数组，包括 x_cm、y_cm、heading_deg。当前沙盒拒绝硬件自行修改几何；XY 只允许 0.01 cm 序列化误差、朝向 0.1°、长度 0.02 cm。若硬件需要不同的平滑轨迹，应先修改共同地图并重新验算，不能在联调时偷偷抹平岔路。

`expected_route_revision` 是目标段当前已准备/锁定的版本，不一定是正在行驶的当前段版本。各段有独立路线槽；一车可以正在第二段，同时在第三段槽准备落石路线。

### 发车

第一段、第二段路线与四份回转配置完成后，游戏端发送 `match.start`，包含 `start_at_hw_mono_ms`。硬件端按该时刻执行，再回该命令的 `applied`。随后分别回两车第一段 commit 的 `applied`，再上报对应版本定位。不要先报新版本定位、后报路线生效。

### 两次回转

`handoff.configure` 给出 robot_id、handoff_id、from_stage、to_stage、两个段实例、center_cm、target_heading_deg、位置/角度容差和下一段路线槽。

1. 车辆实际到达段末并减速到位，报告最新定位和 `robot.status: TURNING`。
2. 在同一中心执行 180° 回转；期间持续发送实际定位和原段信息。
3. 真实完成后报告 `robot.status: READY`、stopped_confirmed=true、实际完成 pose、handoff_id 和 occurred_hw_mono_ms。
4. 游戏端核对中心偏差≤0.5 cm、角度≤5°及新路线已 armed，发送 `route.activate`。
5. 硬件回这条 activate 命令的 `applied`，切换段实例/版本，继续行驶。游戏端只更新该车半屏。

回转完成回执超过 5 秒进入故障暂停；人工暂停期间不累计该超时。不能仅发送“已收到转向命令”。本版采用预加载与显式 activate，保留一次本地通信往返；不是无回执的自动换图动画。

## 7. 定位、事件与停车

建议至少 20 Hz。硬件端一次 frame 汇总两车，也可以分别上报，但每车不能超过 150 ms 没有新有效帧。

```json
{
  "frame_id": 300,
  "captured_mono_ms": 103000.0,
  "robots": [{
    "robot_id":"rover-blue",
    "x_cm":10.2,"y_cm":8.4,"heading_deg":0,
    "valid":true,"in_bounds":true,"stopped_confirmed":false,
    "stage_id":1,"stage_instance_id":"游戏端分配的本段实例",
    "route_revision":1,
    "map_revision":"physical-v0.3-sandbox.1",
    "calibration_id":"本机实测标定标识",
    "quality":1
  }]
}
```

示例只列一车；实发时另一车也须持续上报。`frame_id` 是该会话严格递增的帧标识。采集时间独立于发送时间；过期、未来、旧帧、错误段/版本不会触发比赛事件。游戏端根据批准路线推导路径进度，检查不合理跳跃、倒退和偏离。

`robot.status` 至少带 robot_id、stage_id、stage_instance_id、route_revision、state、pose、stopped_confirmed、occurred_hw_mono_ms；回转另带 handoff_id。第三段停车后发送 `state: "PARKED"`。必须先有有效的终点入区和停车点定位，不能仅靠 PARKED 回执宣告获胜。

终点时间使用有效采集帧换算后的时刻；模拟并列窗口 100 ms。真实并列窗口由硬件精度和延迟实测确定。第一辆抵达后不会停止另一辆车的正常路线；两车继续到各自停车点。

### 落石

- 游戏端选择最近且仍有至少 6 cm 前置距离的合法分叉，提前准备组合绕行。
- 收到 armed 后才扣一次卡；此时在游戏时钟开始 2 秒预警。硬件端也冻结相同的 warning_ms，暂停时共同冻结。
- 到分叉点应用新路线，回 applied；此时若预警未结束，或原路仍被使用，应本地停止并上报故障。
- 第三段落石可以在第二段公开选择后预约；必须安装到目标第三段路线槽，不能改变当前第二段。
- 障碍没有自动消失倒计时。完整车体包络跨过汇合截面、脱离禁行区后清除；已走的绕行不会被重置成原路。
- prepare 被拒绝不扣卡；结果未知暂停核对。不得重复发新 command_id 来“碰碰运气”。

### 月震与余震

第二段首次有效向左通过 x=51.8 触发共享 7 秒窗口；两车继续行驶。第一辆捷径车在第三段经过 x=32 时产生唯一共享的稳定/塌陷结果。风险入口初始计划带 `requires_decision_at_x_cm:37`；没有已确认结果，不得越过该点。游戏端要求源点触发至分支 armed≤500 ms。

余震路线始终保留第三段入口是否已有落石的组合状态。硬件端不可用单独“塌陷路线”覆盖掉入口绕石。

### 实体卡牌

硬件端发送 `card.detected`：event_id、presence_id、robot_id、card_id、captured_mono_ms。card_id 取 `beacon` / `outer` / `safe` / `risk` / `rock`。

同一次卡牌留在识别区期间必须保持同一 presence_id，不能每帧生成新 ID。游戏端去重后回 `card.result`（event_id、accepted、consumed、reason）。落石要等 armed 后才返回 consumed=true。离开识别区后重新进入才创建新的 presence_id。二维码读取与内容映射由硬件端实现，本版提供事件入口。

## 8. 停机、故障与恢复

- `robot.pause`：硬件端冻结运动和待生效条件，停车后返回 completed，包含两车 stopped_confirmed=true。游戏端冻结比赛、预警和选牌计时。
- `state.query`：回 `hardware.snapshot`，包含 reply_to_command_id、map_revision、calibration_id、两车实际 pose、stage_id、stage_instance_id、route_revision、stopped_confirmed、pending_revisions（按段号排序）。
- `robot.resume`：只有人工确认、快照一致、定位新鲜且没有未知命令时才发送；硬件端再次核对 expected，实际恢复后回 applied。
- `robot.stop`：取消路线与待执行动作，停车确认后回 completed。确认前游戏端不会允许重置新一局。
- `fault`：带 code、detail、stopped_confirmed；游戏端暂停双车，但硬件端必须先自行处理本地停止。

可恢复的定位短暂中断：清除故障 → 更新有效定位 → 查询停机快照 → 人工确认恢复。

若在预约发车已发送、尚未收到 applied 的短暂准备期暂停，硬件端必须冻结待执行发车，不能到原预约时刻自动启动。此时发车命令结果仍未确定，本版要求“停止双车 → 收到停稳确认 → 重置并重新配置”，不通过恢复按钮猜测执行状态。异常 WebSocket 帧会关闭对应连接；主控或硬件连接异常将暂停比赛，只读窗口异常不影响主控。

本版不自动重发结果未知的运动命令，不提供跨会话无缝续跑。重连使用新 session，旧准备凭据和待执行动作必须失效。状态不一致或未知事务无法核对时保持停止；通过硬件端确认停止后重置，重新放置起点、标定和配置。不要以浏览器刷新替代车辆停止。

## 9. 调试数据与源码

| 路径 / 入口 | 用途 |
| --- | --- |
| `/api/map` | 完整标准路线与空间定义 |
| `/api/state` | 当前只读权威比赛状态 |
| `/api/trace` | 导出最近最多 15000 条双向消息、状态及事件；含真实回执内容 |
| `dist/sandbox/geometry.js` | 几何、圆弧、采样、坐标与地图导出 |
| `sandbox/engine.mjs` | 定位驱动状态机、事务、事件、恢复检查 |
| `sandbox/server.mjs` | 本地静态服务、UI / 硬件 WebSocket、主控权限 |
| `sandbox/simulator.mjs` | 共用协议的理想硬件参考实现 |
| `sandbox/mock-client.mjs` | 独立外部客户端运行入口 |
| `dist/sandbox/app.js` | 控制屏与只读地面屏，不计算运动真值 |
| `tests/sandbox.test.mjs` | 几何、18 种路线组合、事件与异常回归 |

运行 `npm run test:sandbox` 验证沙盒；完整项目运行 `npm test` 同时回归原 3D 项目测试。消息导出有容量上限；长时间联调应在每局结束后导出保存。

## 10. 当前完成范围与硬件端下一步

已实现：统一几何、独立三段状态、模拟器和外部 WebSocket、回执校验、落石实际绕行、第三段预约、秘密选路、共享余震、终点与停车分离、双屏同步、故障注入、快照恢复与消息导出。

已验证：几何净空与路线长度；18 种单车路线/受击组合；浏览器中双向投石、共同捷径塌陷、暂停恢复和两屏显示；独立外部客户端的一局完整比赛。

硬件端仍需完成：工业相机采集和标定、AprilTag 识别与车体中心修正、实际小车路径跟踪/回转/制动、二维码识别、本地保护与实测误差/时延。模拟器以理想 2 cm/s 运动，不模拟轮胎打滑、真实加减速、电池和通信链路动力学。

先用外部参考客户端对齐消息，再替换定位与执行模块；先无电机回放定位，再低速单车，最后双车与事件组合。若 1 cm 圆角、横向误差或制动预算不满足，应回到共同几何调整并重新验证，不降低运行检查阈值。
