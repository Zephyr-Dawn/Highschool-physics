# 模型完成度矩阵（2026-11-05）

本矩阵以当前仓库代码、题目数据和自动化测试为证据，不以旧报告中的规划名称为准。状态定义：

- **COMPLETE**：有独立纯物理解算器、可运行页面、平板交互、教师/讲解、原创题、持久化与回归测试。
- **PARTIAL**：已有可运行的基础段或功能重叠，但原始意图中的关键环节仍缺失。
- **PLANNED**：有明确范围，但当前没有可运行实现。
- **MISSING**：当前仓库没有对应模型或只存在外链索引。
- **OPTIONAL**：原始任务书标为可选扩展。

## 1. P01–P08

| ID | 原始定义 | 当前实际能力 | 物理引擎 | 交互 / 教学 / 题目 | 测试证据 | 状态 |
|---|---|---|---|---|---|---|
| P01 | 洛伦兹力方向实验 | 真实 WebGL 3D 受力、3D 解析运动（直线/圆/螺旋）、保留 2D 平面模式；1–5 粒子、launchTime、相机预设、教师层、WebGL 回退 | `lorentzForce.ts`、`uniformB3D.ts`、`p01ThreeDScene.ts`、`p01PlanarScene.ts` | 3D 旋转/缩放、XY/XZ/YZ 手柄、播放中单粒子重发射、8 步 3D 受力 + 8 步 3D 运动 + 9 步平面讲解、14 题 | `uniformB3D.test.ts`、`p01ThreeDScene.test.ts`、`p01-3d.spec.ts`、`p01.spec.ts` | **COMPLETE** |
| P02 | 匀强磁场内圆周运动 | 1–5 粒子共享 Bz、独立初态/launchTime、圆心/R/T、实时初态预览、教师全矢量 | `uniformB.ts`、`multiParticle.ts`、`p02Scene.ts` | 平面舞台、播放编辑、6 步讲解、8 题、场景 v2 | `uniformB.test.ts`、`multiParticle*.test.ts`、`live-edit.spec.ts` | **COMPLETE** |
| P03 | 直线边界/半平面有界磁场 | 半平面入场、出场、相切、无入场；1–5 粒子、共享边界预览与同步重发 | `halfPlane.ts`、`p03Scene.ts` | 边界/发射点/方向编辑、关键帧、6 步讲解、8 题 | `halfPlane.test.ts`、`p03.spec.ts` | **COMPLETE** |
| P04 | 条形/矩形有界磁场及临界问题 | 条形与矩形区域；入场、任一边出场、同侧返回、相切、角点合并、临界宽度、1–5 粒子、事件表 | `finiteMagneticRegion.ts`、`p04Scene.ts` | 区域几何/Bz/粒子手柄、播放编辑、教师层、8 步讲解、8 题、场景 v2 | `finiteField.test.ts`、`magneticRegionScenes.test.ts`、`p04.spec.ts` | **COMPLETE** |
| P05 | 相反磁场多区域与粒子时序 | 1–4 个竖直区域（含 Bz=0）、多次解析跨界、区内 R/T、区内停留时间、不同 launchTime、同时刻位置对照；明确不做碰撞 | `alternatingMagneticRegions.ts`、`p05Scene.ts` | 区域/边界/Bz 控件、播放编辑、教师层、8 步讲解、8 题、场景 v2 | `alternatingFields.test.ts`、`magneticRegionScenes.test.ts`、`p05.spec.ts` | **COMPLETE** |
| P06 | 匀强电场偏转与电场加速 | 当前实现为同区 E+B 与电场→磁场分段；纯 E 段是模式 B 的一部分，另有速度选择条件 | `crossedFields.ts`、`segmentedFields.ts`、`p06Scene.ts` | 两模式、1–5 粒子、教师力矢量、8 题 | `crossedFields.test.ts`、`segmentedFields.test.ts`、`p06.spec.ts` | **COMPLETE（范围已扩展/改名）** |
| P07 | 电场加速→磁场筛选→电场偏转 | 独立多级束线：可选加速区、入口/出口真实狭缝与吸收板、E+B 选速、磁分析、末段电偏转、屏幕命中/越界；1–5 粒子、真实事件时间轴、同一时刻位置与到达时间比较 | `beamline.ts`、`p07Scene.ts` | 独立 `/#/particle/beamline` 页面、粒子手柄、共享器件/场强/区段长度、教师层、8 步讲解、8 题、场景 v2、导入导出 | `beamline.test.ts`、`beamlineScenes.test.ts`、`p07.spec.ts` | **COMPLETE** |
| P08 | 电磁叠加场、速度选择器或特殊约束 | 独立约束/反求模型：可编辑目标线段、时间窗、方向条件；区分穿越/相切/不可达；单参数反求 + 正向复核、多根/临界/搜索受限；1–5 粒子 | `fieldConstraintEvents.ts`、`fieldConstraintInverse.ts`、`crossedFields.ts`、`p08Scene.ts` | 独立 `/#/particle/constraint-lab` 页面、目标拖动、残差图、候选应用、教师层、10 步讲解、8 题、场景 v2 | `p08.test.ts`、`i07p08Scenes.test.ts`、`i07p08Pages.test.tsx`、`p08.spec.ts` | **COMPLETE** |

## 2. I01–I08

| ID | 原始定义 | 当前实际能力 | 物理引擎 | 交互 / 教学 / 题目 | 测试证据 | 状态 |
|---|---|---|---|---|---|---|
| I01 | 磁通量及楞次定律 | 有符号 Φ/Ψ、B/A/θ 三模式、完整乘积导数、开路、Lenz 方向、历史曲线、教师遮蔽 | `fluxLenz.ts`、`manualFluxMotion.ts` | 三模式页面、真实历史、8 步讲解、8 题 | `fluxLenz.test.ts`、`i01.spec.ts` | **COMPLETE** |
| I02 | 单棒切割磁感线 | 匀速/自由滑行/恒力/手指推拉；符号一致 ε/I/F、能量、左端接触 | `movingRod.ts`、`manualRodMotion.ts` | 手势与数值双路径、能量图、教师层、8 题 | `movingRod.test.ts`、`manualRodMotion.test.ts`、`i02.spec.ts` | **COMPLETE** |
| I03 | 矩形线框进出磁场 | 进入/完全进入/离开/完全离开、Φ/ε/I/F/热、自由滑行 | `loopField.ts` | 线框拖动、关键帧、6 题 | `loopField.test.ts`、`tablet.spec.ts` | **COMPLETE** |
| I04 | 固定线圈中的 B(t) 感生电动势 | 四种 B(t)、折点左右斜率、手动 ramp、四轨曲线、开路 | `timeVaryingField.ts` | 连续手动调磁、教师方向层、8 题 | `timeVaryingField.test.ts`、`i04.spec.ts` | **COMPLETE** |
| I05 | 时变 B + 运动线框综合 | 独立四模式：M1 匀速约束、M2 自由动力学、M3 手动 B、M4 手动线框；感生/动生分解、场源功率与完整能量账本、几何/折点事件、10+ 预设 | `movingLoopTimeField.ts`、`movingLoopSolver.ts`、`manualLoopMotion.ts` | 独立 `/#/induction/coupled-loop` 页面、图表/教师层、10 步讲解、8 题、场景 v2 | `movingLoopTimeField.test.ts`、`i05i06Scenes.test.ts`、`i05.spec.ts` | **COMPLETE** |
| I06 | 双棒/双导轨 | 独立四模式：D1 自由双棒、D2 恒力驱动、D4 手推杆 1/2；单回路电流、成对磁场力、质心/相对速度解析解、动量/能量与接触停止、10+ 预设 | `dualRodCoupling.ts`、`manualDualRodMotion.ts` | 独立 `/#/induction/dual-rods` 页面、图表/教师层、10 步讲解、8 题、场景 v2 | `dualRodCoupling.test.ts`、`i05i06Scenes.test.ts`、`i06.spec.ts` | **COMPLETE** |
| I07 | 相反磁场双区域 + 线框 + 弹性挡板 | 双区带符号磁通、S 边界导数、四模式（匀速/自由/恒力/手动）、真实挡板反弹与 wall-held、焦耳热/冲击损失分账、15 预设 | `oppositeFieldsWallLoop.ts`、`manualWallLoopMotion.ts`、`i07Scene.ts` | 独立 `/#/induction/opposite-fields-wall` 页面、拖线框、事件表、能量图、教师层、10 步讲解、8 题、场景 v2 | `i07.test.ts`、`i07p08Scenes.test.ts`、`i07p08Pages.test.tsx`、`i07.spec.ts` | **COMPLETE** |
| I08 | 简单发电机/交流电 | 旋转线圈正弦交流：N/A/B/ω/θ₀/负载/内阻/开路/短路；峰值、有效值、频率/周期、负载/内阻功率、机械功、开关事件、手动转动 | `acGenerator.ts`、`manualGeneratorMotion.ts`、`i08Scene.ts` | 独立 `/#/induction/ac-generator` 页面、2.5D 线圈+滑环+负载、自动/手动、开关深链、教师层、10 步讲解、8 题、场景 v2 | `i08.test.ts`、`i08Scene.test.ts`、`i08AndPaths.test.tsx`、`i08.spec.ts` | **COMPLETE** |

## 3. P06、P07、P08 重叠判定

（Round 14 追加：P08 仍为独立约束/反求模型；I08 为独立发电机模型。）

- 当前 **P06** 已从原始“匀强电场偏转与电场加速”扩展为：同区均匀 E+B + 电场加速→磁场偏转。原 P06 的纯电场基础段仍可在模式 B 的电场区观察，但并非独立的纯电场模型。
- **P07** 已从 P06 的基础段发展为独立完整闭环：真实狭缝/吸收板、E+B 选速、磁分析、末段电偏转、屏幕探测、真实器件事件、1–5 粒子时序与独立教学页均已实现。P07 不依赖 P06 页面，也不复制 P06 的模式切换逻辑。
- **P08** 已完成独立约束/反求模型：它复用 P06 的解析场，但新增目标事件、可达性、临界与单参数反求；不是 P06/P07 的改名或复制。详见 `P08_SCOPE_DECISION.md`。
- **I08** 已由可选扩展升级为 COMPLETE：独立旋转线圈/交流电模型，不与 I01/I04/I05 的“固定/运动/时变”磁通模型混为一谈。
- 16 个原始编号现在都有可运行页面、独立物理证据、讲解、原创题、场景与离线覆盖；这不等于真题、真机或公网发布完成。

## 4. 统计与证据边界

- 当前可运行模型：**16 个**（P01–P08、I01–I08）。
- 当前 COMPLETE：16 个；PARTIAL：无；MISSING：无；OPTIONAL/PLANNED：无原始编号。
- 当前原创题：**132 道**；P02–P08/I01/I02/I05/I06/I07/I08 各 8 道（P01 14、I03 6、I04 8）。
- 当前题目案例：**9 个原创案例**（Round 15/16/17，C01–C08 + A17-01），单独计数，不并入 132 题；教师私有草稿单独计数，不计入公开题库。
- Round 16 最终回归：Vitest **556/556**（50 文件）、Playwright **172/172**、PWA **2/2**、`verify:static` 通过；Round 17 最终回归见 [ROUND17_QA.md](ROUND17_QA.md)。
- Round 11.5（2026-11-03）建立通用数学表达式输入；Round 12/13/14 将其继续用于 I05/I06/I07/P08/I08。当前全仓库 **197 个 `<ParamSlider>` 调用点**、运行时最多 208 个控件，逐项清单见 [PARAMETER_INPUT_AUDIT.md](PARAMETER_INPUT_AUDIT.md)。表达式层不改变任何模型的 COMPLETE 判定与物理公式。
- 测试基线以 [QA.md](QA.md) 为准；本矩阵不把 CDP 合成触摸、无头 Chrome 或 PWA 模拟称为真实 iPad/Android 验证。
- 所有状态都可从 `src/simulations/registry.ts`、`src/content/questions.ts`、对应纯物理模块和测试文件追溯。

## 5. 统一学习路线与 16 模型核验（Round 14）

- `/path` 提供两条学生路线（粒子与电磁场 8 站、电磁感应 8 站），`/path/:pathId/:modelId` 使用各模型真实 `LessonRunner` 步骤，提供真实预设深链、模型题目筛选、上一站/下一站与教师演示路径。
- 覆盖率测试 `tests/content/learningPath.test.ts` 检查：16 个唯一 ID、16 条唯一路由、每个路径步骤的预设存在、每个模型有讲解与非零题数、演示路线全部引用真实模型/预设。
- `PracticePage` 新增 `?model=` 模型筛选；路线“配套练习”只显示该模型题目，清除模型筛选后恢复 132 题。
- 旧的 `?model=particles|induction` 模块筛选与 `?q=` 单题深链保留；模型筛选切换会同步模块筛选，避免“模型已选但模块冲突”的空列表。
- 详见 [ROUND14_MODEL_COVERAGE_AUDIT.md](ROUND14_MODEL_COVERAGE_AUDIT.md)。

## 6. 题目案例与整题仿真覆盖（Round 15/16/17，跨模型，不新增编号）

| 案例 | 主模型 | 整题适配器 | 覆盖等级 | 覆盖能力 | 独立锚点测试 |
|---|---|---|---|---|---|
| C01 边界出场 | P04 | `p04-boundary` | `full_problem_simulated` | 条带边界、出射角、临界宽度、运动时间 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| C02 交替磁区时序 | P05 | `p05-multizone` | `full_problem_simulated` | A/B 同场、独立 launchTime、同一空间点不同全局时间 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| C03 束线/屏幕 | P07 | `p07-beamline` | `full_problem_simulated` | 选速、磁分析、屏幕命中/越界、吸收 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| C04 线框入场 | I03 | `i03-loop-entry` | `full_problem_simulated` | 磁通斜坡、ε/I/F 符号与大小 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| C05 时变场+动生 | I05 | `i05-loop-field` | `full_problem_simulated` | ε_t/ε_m 叠加、电流、功率、能量 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| C06 反向场+挡板 | I07 | `i07-opposite-wall` | `full_problem_simulated` | 带符号通量、连续挡板反弹、冲击/焦耳热分账 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| C07 可调分析器 | P07 | `p07-beamline` | `full_problem_simulated` | 屏幕落点、B 反号镜像、临界场 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| C08 双棒接触 | I06 | `i06-dual-rod` | `full_problem_simulated` | 单回路电流、接触时间、焦耳热 | `problemCases.test.ts`、`wholeProblem.test.ts` |
| A17-01 电场—磁场—屏幕 | P06 仅对照 | `a17-electric-magnetic-screen` | `full_problem_simulated` | 跨求解器连续交接、磁场出射、屏幕命中、变式重算 | `electricMagneticScreen.test.ts`、`wholeProblem.test.ts`、`round17-stage-handoff.spec.ts` |

- 9 案均为原创；C01–C08 各 3 问，A17-01 3 问；不增加 132 题计数。A17-02 为教师本机模板，不计入公开案例/题目统计。
- 新增**教师题目工作台**（Round 17）不是第 17 个基础模型：16 个模型仍为 16/16 COMPLETE；教师草稿数量不进入模型矩阵、132 题或内置案例计数。
- 整题工作台使用同一物理舞台、统一 `tGlobal`、真实事件表与逐问答案；不再以基础模型跳转作为完成。
- 来源/授权：9 案 `original_case/original/paper_and_solution_verified`；5 条真题索引 `exam_reference/unverified/link_only`。
- Round 16 最终回归：Vitest **556/556**（50 文件）、Playwright **172/172**、PWA **2/2**、`verify:static` 通过；Round 17 最终回归见 [ROUND17_QA.md](ROUND17_QA.md)。
- 真实外部 HTTPS **BLOCKED**；真实 iPadOS/Android **NOT_TESTED**；案例完成不等于真机、授权真题或公网发布完成。
