# Unity 最小视觉验证：准备完成，尚未运行

2026-11-21。在 `/Applications`、用户 Applications、Unity Hub Editor 默认目录和 Spotlight 中未找到 Unity Editor/Hub。此目录是可执行的验证步骤与同资产输入整理工具，不是已验证的 Unity 工程，也没有 Unity 渲染截图或性能结论。当前任务不等待安装、授权或配置。

## 1. 固定输入

从仓库根目录运行：

```sh
node experiments/unity-visual-check/prepare.mjs
```

生成 `work/unity-visual-check/Inputs/`，包含已核验 SHA-256 的 `scene.glb`、材质/布置清单、相机及对比规格。脚本已实际运行。该 GLB 包含同一块现有地形、科研站、信标、月球车和贴地道路；不得在 Unity 测试中换用更高质量模型。原始 GLB 和正式比赛页面不受影响。

## 2. 在具备 Unity 的电脑执行

1. 在仓库外或 `work/unity-visual-check/UnityProject/` 创建独立 Unity 6 LTS URP 工程，安装匹配的 Web Build Support。记录 Editor、URP、平台模块的确切版本；不使用 HDRP 编辑器画面代替 Web 结果。
2. 用 Package Manager 添加 `com.unity.cloud.gltfast`，记录解析后的版本。将 Inputs 中的 GLB 放入 `Assets/Moonfall/`，等待导入，将生成的资源拖入空场景。官方 glTFast 支持 GLB 编辑器导入；须检查全部材质及导入警告，不能只看“导入成功”。[官方导入说明](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/ImportEditor.md)
3. 保留模型层级、比例、UV 和材质贴图。检查颜色图 sRGB、normal/roughness/AO 非颜色数据，检查 glTF 金属粗糙度到 URP 的映射。不要不加检查地将全部材质换成默认 Lit，也不要盲目翻转法线绿色通道。
4. 先用 `comparison-spec.json` 的三个道路标记确认左右、前后与上下方向。该规格坐标是 glTF/Three.js 右手 Y-up；Unity 导入器可能作手性转换，必须把同一个变换应用于场景、灯光、相机、路线标记。用俯视投影核对，不凭视觉“转到差不多”。
5. 建立斜俯视、严格俯视、科研站近看三台正交相机。转换坐标后，使用规格中的位置、目标、up 和 halfHeight；Unity 正交半高对应 Orthographic Size。画幅固定 1600×1000。对照三个路点在截图中的像素位置，建议本次视觉对比误差≤2px（这不是实车标定容差）。
6. 设置 Linear 色彩空间、ACES 或记录实际采用的调色算子。主光方向和颜色与样板相近，匹配阴影方向/长度。Three.js 与 Unity 灯光强度、曝光数字不能机械照抄；用相同中性灰和金属测试片校准受光面与暗面，完成后隐藏测试片，记录最终参数。

## 3. 分开做两个实验

**导入与基础照明对比**：同一 GLB、同一相机、同一环境，关闭额外 GI、Bloom 和屏幕空间 AO，检查贴图、反射、轮廓、接地关系。Three.js 页面的旧光照选项只是旧参数，不是这个严格配对基线；必要时另存基线设置并记录。

**完成度对比**：Unity 启用经过 Web 构建验证的 URP AO、阴影、反射和适度 Bloom，与当前 Three.js GTAO 样板比较。如果加烘焙光照，另存 `Unity-baked` 变体，记录 UV2、光照贴图分辨率、烘焙时间、文件增量；不能把额外制作时间或烘焙贡献误算为更换引擎自动获得的提升。Unity 6.0 Web 文档列出烘焙 GI 支持及实时 GI 限制，具体以测试版本再核验。[Web 图形限制](https://docs.unity.com/en-us/engine/6000.0/manual/platform-specific/webgl/develop/graphics)

## 4. 必须验证浏览器构建

先保存 Editor 预览用于排查，再生成 Web Release 构建，通过本地 HTTP 服务访问。配置与构建匹配的 MIME/压缩响应头；不得仅以 Editor 中好看就判定通过。

对两种渲染器分别保存 `oblique.png`、`top.png`、`station-close.png`，均为浏览器真实输出 1600×1000。再在同一电脑、同一浏览器、前台标签页，以**实际 drawing buffer 3456×2160**测试，各预热30秒、采样30秒、重复3次；记录中位/P95帧间隔、长帧、渲染比例、AA/AO分辨率、首次加载时间、传输字节、可测内存与控制台错误。原 Three.js 12秒测量仅作短测基线，正式配对时必须同条件重测。关闭另一套正在运行的3D页面，避免互相争用GPU。

本次建议目标为局部样板稳定30fps档（另记录是否达到60fps）；这是对比目标，尚不是用户已确认的整场性能验收线。最终按展示电脑显卡、准确分辨率和双屏同时运行情况决定。不得将降低内部渲染分辨率称为原生3.5K。

## 5. 不迁移规则与硬件控制

最小验证不接机器人、不发运动命令。若视觉结果支持后续试接：JS `engine.js` 继续负责现有规则；Unity 仅消费渲染快照、播放带事件ID和比赛时间的表现，输入以意图返回现有规则入口。不要再建立一套 C# 竞赛状态机或用 Unity Physics 推导路线。

地面屏继续单独使用标定后的二维/正交映射；观众相机、震屏和装饰不进入地面坐标。现有 [硬件联调沙盒](../../docs/hardware-integration.md) 已实现游戏端协议与无电机参考客户端，实际相机与电机仍待硬件端接入。硬件端负责相机定位、沿路线自动行驶和本地停车，游戏端负责路线事务与规则；更换视觉引擎不会改变这一边界。Unity Web 受浏览器网络约束，新增 JS 桥接或网络适配需要单独验证。[Unity Web 网络说明](https://docs.unity.com/en-us/engine/6000.0/manual/platform-specific/webgl/develop/networking)

## 6. 决策门槛

只有同资产浏览器截图出现明确质量提升、制作迭代确实更便捷、实际部署和双屏性能可接受、事件回放/坐标边界未被破坏，才值得推进 Unity 渲染器试接。若两边都暴露相同的平直墙面、模糊屋顶、单薄地形，应继续修资产和场景制作，不能将问题归因于 Three.js。

当前结论：**保留 Blender + Three.js 主线，不进行 Unity 迁移；Unity 保留为受控验证选项。**
