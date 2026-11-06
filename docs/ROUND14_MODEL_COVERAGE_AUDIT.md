# Round 14：16 模型覆盖审计与学习路线交付记录

日期：2026-11-04  
基线：Round 13 的 15 个 COMPLETE、124 道原创题、Vitest 484、Playwright 149、PWA 2（本轮已实仓重跑，不以旧报告为准）。

## 1. 审计方法

- 读取 `README.md`、`AGENT_HANDOFF.md`、`MODEL_COMPLETION_MATRIX.md`、`REQUIREMENTS.md`、`CONTENT_MAP.md`、`PHYSICS_SPEC.md`、`DECISIONS.md`、`QA.md`、`PARAMETER_INPUT_AUDIT.md`、`P08_SCOPE_DECISION.md`。
- 核对 `src/simulations/registry.ts` 的 16 个原始编号与路由、`App.tsx` 懒加载、各模型 `*Scene.ts` / 纯物理模块、`lessons.ts` / `questions.ts` / `questionStats.ts`、`ParamSlider` 调用、场景 v2 解析、PWA 预缓存。
- 用 `tests/content/learningPath.test.ts` 做类型化完整性检查：16 个唯一模型 ID、16 条唯一路由、路径中每个预设存在、每模型有真实讲解与题数、演示路线只引用真实模型/预设。
- 浏览器只用本机 Chrome 156 + CDP 合成触摸；未把模拟结果称为真实平板验收。

## 2. 16 模型逐项覆盖

| ID | 路由 | 物理范围 / 理想假设 | 独立引擎与关键证据 | 1–5 粒子 | 播放中操控语义 | 参数输入 | 教学 / 题目 | 存档 / 离线 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| P01 | `/particle/lorentz-force` | 静态均匀 B；3D 叉乘、直线/圆/螺旋；2D 保留；无碰撞/库仑力/时变场 | `lorentzForce.ts`、`uniformB3D.ts`、`p01ThreeDScene.ts`；P1–P10 / D1–D14 | 是 | 单粒子改初态只重发射；共享 B 整场重演；相机非物理 | 滑块 + 表达式，含 3D | 3D+2D 讲解、14 题、教师层 | v2 / 3D 独立 key；离线已测 | COMPLETE；真机 WebGL NOT_TESTED |
| P02 | `/particle/uniform-b` | 静态均匀 Bz；圆周；无相互作用 | `uniformB.ts`、`multiParticle.ts`；锚点与 RK4 对照 | 是 | 单粒子重发射；共享 B 重演 | 滑块 + 表达式 | 6 步讲解、8 题 | v2；离线已测 | COMPLETE |
| P03 | `/particle/half-plane` | 半平面场；入场/出场/相切/无入场 | `halfPlane.ts`；解析边界事件 | 是 | 单粒子重发射；共享边界重演 | 滑块 + 表达式 | 6 步讲解、8 题 | v2；离线已测 | COMPLETE |
| P04 | `/particle/finite-field` | 静态均匀条形/矩形；忽略边缘场 | `finiteMagneticRegion.ts`；18 项解析锚点 | 是 | 单粒子重发射；区域/场重演 | 滑块 + 表达式 | 8 步讲解、8 题 | v2；离线已测 | COMPLETE |
| P05 | `/particle/alternating-fields` | 2–4 个竖直静态分区；多次跨界；不碰撞 | `alternatingMagneticRegions.ts`；15 项锚点 | 是 | 单粒子重发射；分区重演 | 滑块 + 表达式 | 8 步讲解、8 题 | v2；离线已测 | COMPLETE |
| P06 | `/particle/combined-fields` | 同区静态 E+B；E→B 分段；无时变/非均匀 | `crossedFields.ts`、`segmentedFields.ts` | 是 | 单粒子重发射；公共场重演 | 滑块 + 表达式 | 两模式、8 题 | v2；离线已测 | COMPLETE |
| P07 | `/particle/beamline` | 竖直分区、真实狭缝/吸收板/屏幕；理想薄板 | `beamline.ts`；24+16 项，屏幕锚点 y≈1.0893 | 是 | 单粒子编辑；共享装置重演 | 滑块 + 表达式 | 8 步讲解、8 题 | v2；离线已测 | COMPLETE |
| P08 | `/particle/constraint-lab` | 静态均匀 E+B；二维目标线段；单参数反求；搜索受预算限制 | `fieldConstraintEvents.ts`、`fieldConstraintInverse.ts`；21 项，含多根/相切临界 | 是 | 目标/时间窗只重评约束；E/B 重演；单粒子重发射 | 滑块 + 表达式 | 10 步讲解、8 题 | v2；离线已测 | COMPLETE；独立于 P06/P07 |
| I01 | `/induction/flux-lenz` | B/A/θ 三种磁通变化；固定线圈；手动为真实时间历史 | `fluxLenz.ts`、`manualFluxMotion.ts` | 不适用 | 手动 B/A/θ 不重置时间；暂停拒绝追加 | 滑块 + 目标/表达式 | 8 步讲解、8 题 | v2；离线已测 | COMPLETE |
| I02 | `/induction/moving-rod` | 单棒、平行导轨、集中电阻；无自感 | `movingRod.ts`、`manualRodMotion.ts` | 不适用 | 手指推拉真实时间戳；松手归零 | 滑块 + 表达式 | 8 步讲解、8 题 | v2；离线已测 | COMPLETE |
| I03 | `/induction/loop-entry` | 单条形场、刚性线框、集中电阻 | `loopField.ts` | 不适用 | 拖线框/参数重演；自由滑行 | 滑块 + 表达式 | 6 题、讲解 | v2；离线已测 | COMPLETE |
| I04 | `/induction/time-varying-field` | 固定线圈、静态空间均匀 B(t)、集中电阻 | `timeVaryingField.ts` | 不适用 | 手动 B 目标 0.4 s / 4 T/s ramp；暂停拒绝 | 滑块 + 目标/表达式 | 8 题、讲解 | v2；离线已测 | COMPLETE |
| I05 | `/induction/coupled-loop` | 运动线框 + 空间条带 + B(t)；无自感/互感 | `movingLoopTimeField.ts`、`movingLoopSolver.ts`、`manualLoopMotion.ts`；19 项 | 不适用 | M3 ramp；M4 真实时间戳；能量残差明确 | 滑块 + 目标/表达式 | 10 步讲解、8 题 | v2；离线已测 | COMPLETE |
| I06 | `/induction/dual-rods` | 双棒单回路、集中电阻；接触停止、不碰撞 | `dualRodCoupling.ts`、`manualDualRodMotion.ts`；15 项 | 不适用 | 手推一杆，另一杆夹持 | 滑块 + 表达式 | 10 步讲解、8 题 | v2；离线已测 | COMPLETE |
| I07 | `/induction/opposite-fields-wall` | 双区带符号磁通；理想挡板；冲击损失与焦耳热分账 | `oppositeFieldsWallLoop.ts`、`manualWallLoopMotion.ts`；24 项 | 不适用 | 四模式；手动夹持/墙；规定运动触墙停止 | 滑块 + 表达式 | 10 步讲解、8 题 | v2；离线已测 | COMPLETE |
| I08 | `/induction/ac-generator` | 刚性 N 匝线圈、静态均匀 B、纯电阻负载/内阻；滑环交流；无自感/RLC/换向器 | `acGenerator.ts`、`manualGeneratorMotion.ts`；23 项 G01–G20 + 导数/积分/稳定性 | 不适用 | G1 规定匀速；G2 手指角度时间戳；开关事件不重置 θ；手动 RMS 标估计 | 8 个滑块 + 表达式 | 10 步讲解、8 题 | v2 `emplab.i08.scene.v2`；离线已测 | COMPLETE；真机 NOT_TESTED |

## 3. 学习路线交付

- `/path`：两条学生路线（粒子与电磁场、电磁感应）、每站概念、真实预设、题数、本地作答进度、打开实验/开始讲解/配套练习、上一站/下一站。
- `/path/:pathId/:modelId`：面包屑、上一站/下一站、真实 `LessonRunner` 步骤、真实预设 chips、`/practice?model=<id>` 与模型实验深链。讲解进度使用独立 `emplab.path.<model>.lesson.v1`，不覆盖模型页自己的 lesson 进度。
- `PracticePage` 新增 `?model=` 模型筛选，路线“配套练习”只显示该模型的题；模型选择会同步模块筛选，清除模型筛选后恢复 132 题。
- 教师演示路径：3 条跨模型预设链（感应四连、磁场几何、复合场到反求），全部直接打开已有模型，不复制物理或存储。
- 首页新增“按知识路线”入口；顶栏新增“学习路线”；路径页与详情页均按路由懒加载。

## 4. 本轮发现并修复的跨模型问题

1. **练习页的模型深链只设模块、不设模型**：`PracticePage` 原先读取 `?model=p02` 只切换到“粒子运动”模块，不能只显示该模型题。已新增 `practice-model-filter` 与过滤逻辑；路径“配套练习”现在严格 8 题（I08）/6–14 题（其他模型）。
2. **切换模型筛选后模块筛选可能冲突**：选择 `all` 模型而模块仍是“电磁感应”会只显示 62 题。已让模型选择同步模块（模型 ID 以 `p`/`i` 开头），`all` 时模块也回 `all`。
3. **16 模型导航缺口**：此前只有首页卡片与顶栏模块入口，没有按知识顺序的路线、讲解深链或配套练习深链。已由 `/path` + `/path/:pathId/:modelId` + `?model=` 补齐。
4. **I08 原先只是可选/未实现**：本轮完成独立求解器、两种转动模式、场景、讲解、8 题、教师层、离线。
5. **I08 开关语义**：纯电阻模型下，开关是运行中事件；时间轴/角度不重置，I/P 即时变化。实现为 `circuitTimeline`，自动模式能量按各闭合区间分别解析积分；手动模式按真实时间戳梯形积分并标估计。

## 5. 仍然存在的课程/功能缺口

- 16/16 只表示原始编号有可运行模型与物理证据；**不等于覆盖全部高考考点、题库已核验或真机已验收**。
- 真实 iPadOS Safari / Android Chrome、软键盘、安全区、系统字号、VoiceOver/TalkBack、PWA 真机首装、WebGL 真机恢复与长时热稳定 **NOT_TESTED**。
- 公网 HTTPS 部署、账号/云同步、班级/排行 **未执行/不做**。
- 真题索引仍全部 `verifiedOnline: false`；没有题干、答案或图片录入。
- I08 不包含 RLC、自感/互感、变压器、整流器、机械角动力学、磁路非线性或真实发电机损耗模型；手动模式不提供解析整周期 RMS。
- P08 的逆求受扫描区间、241 点默认扫描和候选上限 8 限制；不能证明区间外无根。
- P01 3D 依赖 WebGL；真实平板帧率、Safari WebGL 上下文恢复未验证。
- 学习路线的“本地作答”只统计已有答题记录，不能推断“已掌握”；没有跨模型状态传递或自动解锁。
- 教师演示路径是预设深链，不保存跨模型课堂状态；跨模型状态传递需另行设计。

## 6. 自动化证据

- `tests/content/learningPath.test.ts`：5 项（16 ID/路由、路径唯一覆盖、预设/讲解/题数、演示路线、无假规划入口）。
- `tests/integration/i08AndPaths.test.tsx`：5 项（I08 页面、开路、路线列表、详情讲解、练习过滤）。
- `tests/tablet/learning-path.spec.ts`：4 项（16 模型、真实讲解/实验/练习、前后站、首页入口/竖屏、教师演示）。
- `tests/tablet/i08.spec.ts`：6 项（自动四分之一周期、开关、手动拖拽、数学输入、教师/竖屏、存档/损坏 JSON）。
- 全量结果见 `docs/QA.md` §17 与 `docs/AGENT_HANDOFF.md` 的当前基线。
