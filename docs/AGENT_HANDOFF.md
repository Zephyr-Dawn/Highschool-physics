# Agent 对接说明书（EM Physics Lab）

生成时间：2026-11-05（Round 16 整题连续仿真 + 逐问解析完成后）
用途：把本仓库现状、架构约定、验证方式与禁止事项一次性交接给下一个 agent。收到“继续开发某模型 / 修复某问题 / 跑回归”类命令时，先读本文，再动手。

> **最近四轮交接总览：** 先读根目录 [SUMMARY.md](../SUMMARY.md)（Round 13–16 的交付、测试、限制与协作规则），再读本文的长期约束。

---

## 0. 30 秒速览

- 项目：平板优先的高中电磁学交互实验 PWA，面向黑龙江/黑吉辽蒙新高考物理复习。
- 工作目录：`H:\programming\EM_Physics_Lab`（Windows，**不是 git 仓库**，不要用 git 命令做备份/回滚假设）。
- 当前状态（Round 16 后）：**16 个 COMPLETE 模型**（P01–P08、I01–I08）+ **132 道原创题** + **8 个原创整题案例（C01–C08，全部 `full_problem_simulated`）** + **整题统一舞台/事件时间轴/逐问判题** + **16 模型学习路线** + **全模型数学表达式参数输入** + **设备检测页**，全套自动化绿灯。
- 技术栈：React 19 + TypeScript 5.9 + Vite 7 + HashRouter + Zod 4 + Three.js 0.187/@react-three/fiber 9.8（仅 P01 3D，懒加载）+ Vitest 3 + Playwright 1.64（本机 Chrome 156，`channel: 'chrome'`，headless）+ vite-plugin-pwa。
- 关键设计：**物理求解器是纯函数模块，不依赖 React/SVG/帧率**；页面只做状态编排；事件由解析求根产生，不用动画采样“演”物理。
- 最新一轮：Round 17 = 教师题目工作台 + A17-01 跨求解器连续题 + Track B 发布/真机状态；C01–C08 与 A17-01 共 9 个内置原创案例，16 个模型/132 题不变。见 `docs/ROUND17_QA.md`、`docs/ROUND17_PROBLEM_AUTHORING_SPEC.md`、`docs/ROUND17_COMPOSITE_PHYSICS_PROOF.md`。Round 16 整题底座见 `docs/ROUND16_QA.md`、`docs/WHOLE_PROBLEM_SIMULATION_SPEC.md`。

---

## 0A. GitHub / AI Studio 协作（2026-11-06）

- 目标仓库：`https://github.com/Zephyr-Dawn/Highschool-physics`。
- `main` 为稳定分支，`ai-studio-dev` 为 AI Studio 专用分支；禁止直接 push main、禁止 force push。
- 根目录 `AI_STUDIO_HANDOFF.md` 是 Studio 第一入口；完整提示词在 `docs/AI_STUDIO_FULL_PROMPT.md`。
- 当前 Git 基线、远端授权状态与 SHA 见 `docs/GITHUB_HANDOFF_BASELINE.md`。
- 分支/ZIP fallback/PR 规则见 `docs/GIT_WORKFLOW.md`；CI 见 `docs/CI_RUNBOOK.md` 与 `.github/workflows/ci.yml`。
- 受保护物理核心、数据 schema、PWA 与既有测试不得由 UI 收口直接修改。

## 1. 当前可验证事实（不要凭记忆引用，跑命令确认）

| 项目 | 实测值（2026-11-05，Round 17 后） |
|---|---|
| `npm run typecheck` | 通过，无输出 |
| `npx vitest run` | **593 / 593 通过**，54 个测试文件 |
| `npx playwright test` | **180 / 180 通过**（SIMULATED） |
| `npm run test:pwa` | **3 / 3 通过**（build + 离线重载 16 模型 + 9 案例 + 教师草稿/预览 + 设备检测 + 学习路线 + 旧进度保留） |
| `npm run verify:static` | 通过：`71 JS, 1 CSS, assets 4239.4 KiB, 139 files, sha f3ea43f6b30e`；生成 `release-manifest.json` |
| 入口 JS | 339.74 kB（gzip 103.33 kB） |
| 教师 chunk | 列表 17.82 kB、编辑器 25.07 kB、预览 4.54 kB、存储 27.17 kB |
| P01ThreeDStage | 978.52 kB（gzip 263.16 kB，懒加载，不进主链） |
| CSS | 140.61 kB（gzip 28.78 kB） |
| PWA 预缓存 | 143 项 / 4298.11 KiB |
| 原创题 / 题目案例 | 132 题（P01 14、P02–P08/I01/I02/I05/I06/I07/I08 各 8、I03 6、I04 8）/ **9 个整题案例（C01–C08 + A17-01，单独计数）**；教师草稿不计入 |
| 外部 HTTPS 部署 | **BLOCKED（无托管授权），无公网 URL** |
| 真实 iPadOS / Android | **NOT_TESTED**；CDP/无头结果 = `SIMULATED` |

性能（无头 Chrome 156，1194×834，180 帧 rAF 采样，**非真机**）：I08 自动+图像 4.15/4.3 ms；I08 手动拖拽+图像 4.13–4.15/4.3 ms；学习路线 4.13–4.15/4.3 ms；I07 阻尼+图像 5.79/6.2–6.4 ms；P08 五粒子教师全矢量 5.79–5.85/6.3–6.5 ms；P08 反求 241 点约 35 ms；P07 五粒子教师全矢量 avg 8.8–10.2 ms、median p95 16.7 ms；P04 4.17/4.3 ms；P05 10.5/12.7 ms；P01 3D 约 4.2/4.6 ms。
**无头 Chrome 不锁 VSync，禁止把这些数字说成 iPad/Android 60 fps。**

---

## 2. 命令手册

```bash
# 开发（真机可访问，--host 0.0.0.0，默认 5173）
npm run dev

# Playwright 期望的开发/预览端口（QA 记录里用的是）
npx vite --port 4173 --host 127.0.0.1        # tests/tablet/*
npx vite preview --port 4174 --host 127.0.0.1 # tests/pwa/pwa.spec.ts

# 类型 / 单测 / 浏览器 / 构建 / 离线
npm run typecheck
npx vitest run
npx vitest run tests/physics/beamline.test.ts        # 单文件
npx playwright test
npx playwright test tests/tablet/p07.spec.ts
npm run build
npm run test:pwa
npm run verify:static     # build + dist 必需文件/资源自检
npm run preview:staging   # 0.0.0.0:4174 本地生产预览；不是公网部署

# 图标重新生成（改了图标后才需要）
npm run icons
```

改动后的默认验收顺序：**typecheck → vitest → build → playwright → pwa → verify:static**，最后同步 `docs/QA.md`、`docs/ROUND15_QA.md`、`docs/PHYSICS_SPEC.md`、`docs/MODEL_COMPLETION_MATRIX.md`、`README.md`、`docs/CONTENT_MAP.md` 里的数字。文档里的数字和实际输出不一致，比缺一个功能更糟。

---

## 3. 目录与架构地图

```
src/
  app/App.tsx                HashRouter + 路由懒加载 + 页面标题 + 首页脚注 + 案例返回横幅
  pages/                     HomePage / PracticePage / ProgressPage / CaseListPage / CaseDetailPage /
                             DeviceCheckPage / NotFoundPage
  lib/appInfo.ts             APP_VERSION / APP_BUILD_LABEL（设备报告与页脚共用）
  simulations/
    registry.ts              SIMULATIONS 元数据（id/route/title/moduleLabel/topics/status/phase）
                             + routeForModel / simTitleForModel
    particle/                *Scene.ts（纯数据+预设+持久化）/ *Stage.tsx（SVG 或 3D 画布）/ *Page.tsx（编排）
    induction/               同上，I01–I08；I05/I06/I07/I08 使用独立 scene/Stage/Charts
  physics/
    core/vec2.ts             向量与 Rot 工具（全项目共用，不要复制新的）
    particles/               uniformB / halfPlane / finiteMagneticRegion / alternatingMagneticRegions
                             / crossedFields / segmentedFields / beamline / multiParticle
                             / lorentzForce / uniformB3D
    induction/               loopField / fluxLenz / timeVaryingField / movingRod
                             / manualFluxMotion / manualRodMotion
                             / movingLoopTimeField / movingLoopSolver / manualLoopMotion
                             / dualRodCoupling / manualDualRodMotion
                             / oppositeFieldsWallLoop / manualWallLoopMotion / acGenerator / manualGeneratorMotion
  math/                      parameterExpression.ts（tokenizer/AST/evaluator）
                             parameterValidation.ts（物理域/稳定域/整数约束）
                             parameterExpressionMemory.ts（会话内原式记忆，不写 localStorage）
  components/                Icon, MathTex(KaTeX), PanelTabs, PlaybackBar, ParamSlider（滑块+数学输入）,
                             Segmented, ReadoutGrid, SeriesChart, InductionChartStack, StageLegend,
                             StageToolbar, TeacherDock, ToggleSwitch, CaseReturnBanner + three/（AxisGizmo,
                             CameraPresets, LabelSprite, SimpleLine3D, VectorArrow3D, WebGLFallback, webgl.ts）
  hooks/                     usePersistentState / usePlaybackClock / useElementSize / useStageView
  features/
    lesson/LessonRunner.tsx  分步讲解（步骤 + storageKey 记忆进度）
    practice/                PracticePanel + QuestionCard（题源过滤、localStorage 作答/收藏）
    progress/progressStore.ts 本地学习记录
    cases/caseSession.ts     案例场景备份/恢复、返回上下文、独立案例进度
  content/                   schema.ts(Zod) / questions.ts(132) / lessons.ts / i0xLesson.ts / p08Lesson.ts /
                             learningPath.ts / pathLessonCatalog.ts / examReferences.ts / questionStats.ts /
                             problemCaseSchema.ts / problemCases.ts(C01–C06)
  styles/global.css          全部样式，含每模型专属 section 与 Round 15 案例/设备检测 section
tests/
  physics/                   纯物理 + 场景适配层（无 DOM 依赖）
  integration/               React 页面/组件（jsdom）、caseSession、Round15 页面
  math/                      解析器/有效域/组件/页面/物理表达式回归
  tablet/                    Playwright：触控、手柄、教师层、竖屏、导入导出、练习回链、
                             math-parameters.spec.ts、i05–i08.spec.ts、round15.spec.ts
  pwa/                       生产构建 + Service Worker 离线（含案例/设备检测）
  content/                   题目/讲解/统计一致性、problemCases、round15Deployment
scripts/check-static-build.mjs  dist 静态产物自检
netlify.toml + public/_headers  静态托管与缓存头
docs/                        REQUIREMENTS / PHYSICS_SPEC / CONTENT_MAP / EXAM_SOURCES / EXAM_SOURCE_AUDIT /
                             DECISIONS / QA / ROUND15_QA / PROBLEM_CASE_SCHEMA / CASE_MODEL_MAPPING /
                             DEPLOYMENT_STAGING / CLASSROOM_DEVICE_QA / MODEL_COMPLETION_MATRIX /
                             AGENT_HANDOFF / screenshots/
```

### 3.1 数据流（每个模型都一样）

```
Page（编排、持久化、预设、草稿编辑）
  └─ Scene<TField>（纯数据：particles + runtimeById + activeParticleId + field + schemaVersion:2）
       └─ solve*(...) → Solution（segments / events / outcome / 解析量）
            └─ Stage（SVG 或 3D，只做投影绘制 + Pointer 事件 → 回调 Page）
                 └─ Solution 采样 beamlineStateAt / sample*Trajectory（时间参数化，与帧率无关）
```

### 3.2 多粒子架构（P02/P03/P04/P05/P06/P07/P01-3D 共用，`physics/particles/multiParticle.ts`）

- `MAX_PARTICLES = 5`，标签固定 `A–E`，颜色/线型固定数组，**不要新增 ID 命名方案**。
- `MultiParticleScene<TField>`：`particles: ParticleInitialState[]`、`runtimeById: Record<id, ParticleRuntime>`、`activeParticleId`、`field`、`schemaVersion: 2`。
- 时间语义：全场共享 `tGlobal`（播放时钟），每粒子独立 `launchTimeSec`；粒子局部时间 = `particleTau(runtime, tGlobal)`，未发射返回 `null`。
- 播放中编辑：`createParticleDraft` → `updateDraft` → `commitDraft`；松手用 `updateParticleAndRelaunch` **只重发射该粒子**，其他粒子事件表不变（回归测试会锁死这条语义）。
- 改变共享场/器件：`applySharedField` + `relaunchAll`，会重置所有 launchTime 并清空历史/轨迹（测试断言旧检测标记消失）。
- “同时到达”只在同一 `tGlobal` 下比较位置；**轨迹几何交叉不等于相遇，不生成碰撞或追及标记**。

### 3.3 持久化约定（localStorage key）

| 用途 | key |
|---|---|
| 场景 v2 | `emplab.p02.scene.v2` … `emplab.p08.scene.v2`、`emplab.i05.scene.v2`、`emplab.i06.scene.v2`、`emplab.i07.scene.v2`、`emplab.i08.scene.v2`（P01 有独立 3D/平面/受力 key） |
| 参数 | `emplab.i01.params.v1`、`emplab.i02.params.v1`、`emplab.i03.params.v1`、`emplab.i04.params.v1` |
| 教师图层 | `emplab.<model>.layers.v1` |
| 学习模式 | `emplab.<model>.mode.v1` 或 `.learning.v1`（guided / free） |
| 讲解进度 | `emplab.<model>.lesson.v1` |
| 学习记录 | `emplab.progress.v1` |
| 案例进度 | `emplab.cases.progress.v1` |
| 案例场景备份 | `emplab.case.sceneBackup.v1`（localStorage） |
| 案例返回上下文 | `emplab.case.return.v1`（sessionStorage） |
| 设备检测人工状态 / 型号 / 系统 | `emplab.deviceCheck.manual.v1` / `.model.v1` / `.os.v1` |
| P01 2D 回退开关 | `emplab.p01.force2d`（值为 `'1'` 时强制 2D） |

规则：新场景一律 `schemaVersion: 2` + `model` 字段 + Zod/显式校验 + 导入导出（JSON 复制粘贴）；解析失败回退默认场景，**不静默接受脏数据**；升级 key 版本而不是改写旧存档语义。

### 3.4 内容层约定

- 题目：`src/content/questions.ts`，Zod `schema.ts` 校验，`sourceStatus` 只有 `original` / `exam_reference` 会被前端发布；`licensed_exam`、`unverified` 不展示。
- `src/content/questionStats.ts` 是唯一题数来源，`total` 与 `byModel` 必须与 `questions.ts` 实际条数一致（`tests/content/content.test.ts` 会检查）。
- 真题索引：`examReferences.ts` 全部 `verifiedOnline: false`、`sourceKind: 'exam_reference'`、`verification: 'unverified'`、`rights: 'link_only'`，**不写题干、不写答案、不转载图片、不做自动评分**。
- 题目案例：`problemCaseSchema.ts` 定义 `ProblemCase/CaseStage/Provenance`；`problemCases.ts` 只有 6 个 `original_case`（`original` 权利、`paper_and_solution_verified`）。阶段只允许真实 `modelId + presetId`，由 `tests/content/problemCases.test.ts` 核对；禁止在案例中保存函数名、脚本或任意 URL JSON。
- 来源核验与转载授权是两个独立字段（`verifiedOnline/verification` vs `rights`）；没有书面授权不得因“找到了网页”升级。

---

## 4. 模型速查表

| ID | 路由 | 物理引擎 | 场景/页面 | 主测试 |
|---|---|---|---|---|
| P01 3D 受力+运动 | `/particle/lorentz-force` | `lorentzForce.ts`、`uniformB3D.ts` | `p01ThreeDScene.ts` + `P01ThreeDLab/Stage` | `uniformB3D.test.ts`、`p01ThreeDScene.test.ts`、`p01-3d.spec.ts` |
| P01 平面 | 同页模式切换 | `uniformB.ts` | `p01PlanarScene.ts` + `P01PlanarLab` | `p01.spec.ts` |
| P02 | `/particle/uniform-b` | `uniformB.ts` | `p02Scene.ts` + `UniformB*` | `uniformB.test.ts`、`multiParticle*.test.ts`、`live-edit.spec.ts` |
| P03 | `/particle/half-plane` | `halfPlane.ts` | `p03Scene.ts` + `HalfPlane*` | `halfPlane.test.ts`、`p03.spec.ts` |
| P04 条带/矩形 | `/particle/finite-field` | `finiteMagneticRegion.ts` | `p04Scene.ts` + `FiniteField*` | `finiteField.test.ts`(18)、`magneticRegionScenes.test.ts`、`p04.spec.ts`(5) |
| P05 反向多区 | `/particle/alternating-fields` | `alternatingMagneticRegions.ts` | `p05Scene.ts` + `AlternatingFields*` | `alternatingFields.test.ts`(15)、`p05.spec.ts`(6) |
| P06 同区 E+B / 电→磁 | `/particle/combined-fields` | `crossedFields.ts`、`segmentedFields.ts` | `p06Scene.ts` + `P06*` | `crossedFields.test.ts`、`segmentedFields.test.ts`、`p06.spec.ts` |
| **P07 束线** | `/particle/beamline` | **`beamline.ts`** | **`p07Scene.ts` + `Beamline*`** | `beamline.test.ts`(24)、`beamlineScenes.test.ts`(16)、`p07.spec.ts`(8) |
| **P08 约束/反求** | `/particle/constraint-lab` | **`fieldConstraintEvents.ts`、`fieldConstraintInverse.ts`、`crossedFields.ts`** | **`p08Scene.ts` + `ConstraintLabPage` + `P08Stage` + `P08ConstraintChart`** | `p08.test.ts`(21)、`i07p08Scenes.test.ts`、`p08.spec.ts`(7) |
| I01 磁通/楞次 | `/induction/flux-lenz` | `fluxLenz.ts`、`manualFluxMotion.ts` | `FluxLenz*` | `fluxLenz.test.ts`、`i01.spec.ts` |
| I02 单导体棒 | `/induction/moving-rod` | `movingRod.ts`、`manualRodMotion.ts` | `MovingRod*` | `movingRod.test.ts`、`manualRodMotion.test.ts`、`i02.spec.ts` |
| I03 线框进出场 | `/induction/loop-entry` | `loopField.ts` | `LoopEntry*` | `loopField.test.ts`、`tablet.spec.ts` |
| I04 固定线圈 B(t) | `/induction/time-varying-field` | `timeVaryingField.ts` | `TimeVarying*` | `timeVaryingField.test.ts`、`i04.spec.ts` |
| **I05 运动线框** | `/induction/coupled-loop` | `movingLoopTimeField.ts`、`movingLoopSolver.ts`、`manualLoopMotion.ts` | `i05Scene.ts` + `CoupledLoopPage` + `I05Stage/Charts` | `movingLoopTimeField.test.ts`(19)、`i05i06Scenes.test.ts`、`i05.spec.ts`(9) |
| **I06 双导体棒** | `/induction/dual-rods` | `dualRodCoupling.ts`、`manualDualRodMotion.ts` | `i06Scene.ts` + `DualRodsPage` + `DualRodsStage` + `I06Charts` | `dualRodCoupling.test.ts`(15)、`i05i06Scenes.test.ts`、`i06.spec.ts`(10) |
| **I07 双区线框/挡板** | `/induction/opposite-fields-wall` | **`oppositeFieldsWallLoop.ts`、`manualWallLoopMotion.ts`** | **`i07Scene.ts` + `OppositeFieldsLoopPage` + `I07Stage` + `I07Charts`** | `i07.test.ts`(24)、`i07p08Scenes.test.ts`、`i07.spec.ts`(6) |
| **I08 交流发电机** | `/induction/ac-generator` | **`acGenerator.ts`、`manualGeneratorMotion.ts`** | **`i08Scene.ts` + `AcGeneratorPage` + `I08Stage` + `I08Charts`** | `i08.test.ts`(23)、`i08Scene.test.ts`(4)、`i08.spec.ts`(6) |

新增模型时必须同时改：`registry.ts`、`App.tsx`（懒加载 + 路由 + 标题）、`HomePage.tsx`（卡片 + 预览 + “待完成”文案 + 模型计数文字）、`PracticePage.tsx`、`PracticePanel.tsx`（`modelId` 联合类型）、`content/schema.ts`、`content/questions.ts`、`content/questionStats.ts`、`content/lessons.ts`（可拆独立 lesson 文件）、`global.css`、`tests/pwa/pwa.spec.ts`（离线路由）、`tests/content/content.test.ts`、`tests/integration/pages.test.tsx`、`tests/tablet/*.spec.ts`。

---

## 5. P07 详解（第十一轮成果）

### 5.1 器件与区域

`BeamlineApparatus`（校验在 [src/physics/particles/beamline.ts:271](../src/physics/particles/beamline.ts)，`buildBeamlineRegions` 在 :340，`solveBeamlineTrajectory` 在 :799）：可选加速区 `acceleration{enabled,x0,x1,Ex}`、`selector{x0,x1,Ey,Bz}`、`analyzer{x0,x1,Bz}`、`deflector{x0,x1,Ey}`、`entranceSlit{x,yCenter,halfWidth}`、`exitSlit`、`screen{x,yMin,yMax}`。
区域由竖直边界切成 `free-left / (acceleration) / selector / analyzer / deflector / free-right`；区内外 E、Bz 解析状态，纯 B 用 `ω=-qBz/m`、`R=m|v|/|qBz|`；纯 E 用抛物线；E+B 用漂移 `v_d=(Ey/Bz, -Ex/Bz)` + 相对旋转 `w=v-v_d`；|ωt|<1e-3 走小角展开，B→0/E→0 自动退化直线/静止。

### 5.2 事件语义（**这是 P07 与 P06 的本质区别，别退回近似实现**）

- 候选平面 = 当前区边界 + 两片狭缝 + 屏幕平面。
- 求根：先按 `v_x(t)=0` 把时间轴切成单调区间（纯 E：`t=-v_x/a_x`；E+B：`v_x=drift.x+A·cos(ωt-φ)`，用 `acos(-drift.x/A)`），再二分至 `1e-13`。**不靠采样找交点。**
- 优先级：`screen-hit`/`screen-outside` > `absorbed-at-slit` > `slit-pass`/区段切换；同时刻候选合并成一个事件。
- 狭缝开口含等号：`|y-y_c| <= halfWidth` 通过，否则吸收并终止（终态位置/速度冻结在板上，`durationS = 事件时刻`）。
- 屏幕 x 交点：`y ∈ [yMin,yMax]` → `screen-hit`；否则 `screen-outside`（**不生成假光斑**）。
- `tangent`（边界相切）与 `turning`（区内 `v_x=0`）不切换区域、只切分段。
- 截断：`time-limited` / `event-limited`（`P07_MAX_TIME_S=10`，`P07_MAX_EVENTS=200`）；未到达 `not-arrived`。
- 诚实性：检测/吸收标记只在真实事件发生后出现，除非教师层显式开启 `predictedDetection`；终止粒子不再画受力矢量。

### 5.3 解析锚点（回归用，`1e-8…1e-10` 容差）

标准配置 `q=+1, m=1, r0=(-2,0), v0=(2,0)`，狭缝 `|y|<=0.12`，`selector E=(0,-2) Bz=-1`，`analyzer Bz=-1`，`deflector E=(0,-0.5)`，`screen x=5`：

```text
入口狭缝 t=1
出口狭缝 t=2
磁区出口 t=2+π/6 ≈ 2.5235955, 位置 (3, 2-√3), v=(√3,1)
屏幕 t≈3.6782993, y = 2-√3 + 2/√3 - 1/3 ≈ 1.0893164
```

其他已锁：负电荷 y 镜像；慢(1.5)/快(2.5) 在出口板 t≈2.5694633 (y≈−0.335773) / t≈1.61762 (y≈0.15802) 吸收；`deflector E=0 / +0.5` → y≈1.42265 / 1.75598；分析 B 反向 → 真实交点 y≈−1.75598 屏外；加速段 t≈3.9282993；相切例 t=2+π/4 于 (3,1) 随后 t=2+π/2 被出口板吸收；`q=0`、`v=0`、非法质量、起点恰在狭缝平面、采样 10→500 事件不变。
能量核对：磁场不做功；`W=q(E_xΔx+E_yΔy)`；残差 `K-K0-W≈0`。

### 5.4 场景 / 页面 / 图层

- 13 预设（`P07_PRESETS`）：`p07-standard / slow / fast / offset-entry / negative / reverse-analyzer / deflector-off / deflector-reverse / screen-miss / accelerated / arrival / multi / five`。URL 支持 `?preset=p07-multi`（`appliedPresetRef` 保证只应用一次）。
- `p07Scene.ts`：`P07_SCENE_STORAGE_KEY='emplab.p07.scene.v2'`、`p07SolutionFor`、`p07SceneFromDisplays`、`p07GlobalDuration`、`p07KeyFrames`、`p07StateFor`、`p07OutcomeAt`、`p07DetectionGlobalTime`、`p07AbsorptionGlobalTime`、序列化/解析/导入导出。
- `BeamlineStage.tsx`：`P07Layers = predicted, trail, regions, fieldE, fieldB, slits, screen, velocity, forceE, forceB, resultant, allVectors, events, aux, detections, predictedDetection`。
- Playwright 钩子是 `data-testid`：舞台 `p07-stage`、`p07-stage-svg`、`p07-regions`、`p07-slits`、`p07-screen`、`p07-analyzer-circle`、`p07-draft-particle`、`p07-preview-path`、`p07-condition-notice`、`p07-start-handle(-hit)`、`p07-velocity-handle(-hit)`；按粒子标签动态生成 `p07-particle-{A..E}`、`p07-particle-hit-{A..E}`、`p07-detection-{A..E}`、`p07-absorb-{A..E}`、`p07-outside-{A..E}`。
- 页面表格/读数：`p07-detection-table`、`p07-arrival-table`、`p07-same-time-table`、`p07-event-list`、`p07-scene-import`、`p07-detection-y`。
- 数值钩子（属性而非 testid）：`data-outcome`、`data-final-outcome`、`data-selected-outcome`、`data-detection-y`、`data-global-hit-time`、`data-screen-crossing-y`、`data-absorption-time`、`data-absorption-slit`、`data-tau`、`data-launch-time`、`data-start-x/y`、`data-selected-start-x/y`、`data-selector-matched`、`data-entrance-aperture`、`data-exit-aperture`、`data-particle-count`。新增断言优先复用这些属性，不要往 DOM 里塞新文案再靠文字匹配。
- `BeamlinePage.tsx`：共享装置控件（场强、狭缝宽、屏幕 x/yMin/yMax、各区长度 `resizeSelector/resizeAnalyzer/resizeDeflector`——改 selector 长度会平移出口狭缝及下游全部器件）、单粒子草稿、数据表（检测/到达时间/同一 tGlobal 位置/事件时间轴）、读数、公式卡、模型边界提示、讲解 + 练习。
- 8 步讲解 `P07_LESSON`；8 题 `p07-01…p07-08`（选速、 matched 但偏轴吸收、R=2 m、屏幕 y、总时间、能量/磁场不做功、同点不同全局时刻、加速+选速联合）。

---

### 5.6 参数输入层（Round 11.5）

- 唯一共享组件：`src/components/ParamSlider.tsx`。它保留原 `min/max/step` 滑块与原 aria-label `"<label>数值（<unit>）"`，在旁边增加 `type="text"` 表达式框。153 个调用点全部走它；没有页面自己解析表达式。
- 解析器：`src/math/parameterExpression.ts`。白名单递归下降，支持 `+ − * / ^`、括号、`√`/`sqrt()`、`π`/`pi`、隐式乘法、科学计数法；128 字符/32 层/256 节点；**禁止 `eval`/`new Function`**。错误分类：incomplete/syntax/forbidden/division-by-zero/sqrt-negative/non-finite/too-complex。
- 校验：`src/math/parameterValidation.ts`。表达式先在显示单位求值，再走页面原换算；随后物理域 + 稳定域。`N` 用整数校验，`3/2` 拒绝而非取整。合法值可超滑块范围，绝不 clamp；`ParamSlider` 用 `data-out-of-range`、虚线滑块和说明文字标记。
- 提交：Enter/失焦提交，Escape 回退；输入过程中不调用 onChange，因此不会逐字符重置时间轴。失焦非法输入保留文本 + 错误 + “当前实验仍为 …”。滑块操作清除原式、改写为数字文本。
- 原式记忆：`parameterExpressionMemory.ts` 以“当前 hash + label + unit”为 key，仅会话内跨 tab/重挂载保留；恢复前重新解析/校验并核对当前值。刷新后显示数值文本；不写 localStorage。
- 连续目标：I01 `实时目标 Bz`、I04 `实时目标 B` 用 `MathTargetInput`，提交到既有 `applyManualTarget`（0.4 s ramp、4 T/s），暂停拒绝；舞台手柄仍是原真实 pointer 时间戳。
- I02 手指推拉仍只使用 pointer 历史；文本速度不进入手动模式。I03/I04 参数仍直接进入原求解器。
- 新增测试：`tests/math/*`、`tests/integration/mathParameter{Control,Pages}.test.tsx`、`tests/physics/mathParameterPhysics.test.ts`、`tests/tablet/math-parameters.spec.ts`、PWA 离线表达式测试。
- 修改参数控件时先读 `docs/PARAMETER_INPUT_AUDIT.md`；新增参数必须补：单位、滑块范围、物理/稳定域、语义、测试锚点。

### 5.7 I05 + I06（第十二轮成果）

- **I05**：`/#/induction/coupled-loop`。四模式 `prescribed / dynamic / manual-b / manual-x`。物理：`movingLoopTimeField.ts` 的快照 + `movingLoopSolver.ts` 的 M1 解析/ Simpson 积分与 M2/M3 RK4 步加倍/阈值二分；M4 使用 `manualLoopMotion.ts`。关键符号：`ε_t=−NhℓBdot`、`ε_m=−NhBgvx`、`F_Bx=NIhBg`；`g` 在阈值处返回单侧值并标记。M3 必须走 `applyManualTarget` 的 0.4 s / 4 T/s ramp，暂停/旧历史拒绝追加；M4 不报告精确手部外功或能量残差。
- **I06**：`/#/induction/dual-rods`。四模式 `free / forces / manual-rod1 / manual-rod2`。物理：`dualRodCoupling.ts` 的单回路快照与常力解析解；`manualDualRodMotion.ts` 的夹持杆会话。关键符号：`ε=−BzL(v₂−v₁)`、`k=(BzL)²/R`、`F_B1=+kΔv`、`F_B2=−kΔv`；接触由 `d(t)=0` 首根停止，`contact-stop` 不模拟碰撞。D4 只有被选杆受手驱动，另一杆明确夹持。
- 两模型都使用 `i05Scene.ts` / `i06Scene.ts` 的 `schemaVersion:2` 场景，导出不含无界手势历史；`MathTargetInput` 仅 I05 手动 B 使用。
- 新增物理测试：I05 19 项（A–F、开路、B=0+Bdot、N scaling、宽线框、边界单侧、动态事件、手动 ramp、手动会话、非法输入）；I06 15 项（R1–R12、接触、动量、能量、手推夹持、表达式）。
- 浏览器：`i05.spec.ts` 9 项、`i06.spec.ts` 10 项；均含 1194×834、768×1024、表达式、开路、接触/第二指取消、练习回链、损坏 JSON。PWA 已把两模型纳入离线集。
- **不要**把 I06 画成两个独立单棒，也不要把 I05 的 M4 手动运动当作自由牛顿动力学；两处都是明确的外部约束/估计语义。
- 生产预览（Chrome 156 headless，1194×834，180 帧 rAF，非真机）：I05 M2 avg 5.85/p95 6.1 ms、heap 17 MB；I05 M3 5.90/6.2 ms、19 MB；I06 D1 5.89/6.1 ms、16.2 MB；I06 D4 5.90/6.1 ms、21.4 MB。无头 Chrome 不锁帧，不能当 iPad/Android 60 fps。

### 5.9 I07 / P08（第十三轮成果）

- **I07**：`/#/induction/opposite-fields-wall`。四模式 `prescribed / free / forces / manual-x`。物理：`oppositeFieldsWallLoop.ts` 以 `Φ=h(B₁ℓ₁+B₂ℓ₂)`、`S=B₁g₁+B₂g₂` 为单一真值源；固定 S 区间用 `expm1` 指数解析解；场界/速度过零/挡板事件在单调区间内二分。`v_after=−e v_before`，`Q_impact` 与 `Q_J` 分开；`e=0` 且外力向内进入 `wall-held`；规定运动触板终止。场景 `emplab.i07.scene.v2`，15 预设；`i07.spec.ts` 6 项。
- **P08**：`/#/particle/constraint-lab`。物理：`fieldConstraintEvents.ts` 复用 `crossedFields.ts`，在 `v_normal=0` 的解析时刻切分单调区间后二分；事件过滤线段/时间窗/方向；`fieldConstraintInverse.ts` 对 Ey/Bz/v0x/v0y 扫描 + 分支连续性 + 候选正向复核，多根/`tangent-critical`/`uncertain`/`not-found-within-search` 分开。场景 `emplab.p08.scene.v2`，14 预设；移动目标只重评约束，不重置轨迹；应用候选才改场/初态。`p08.spec.ts` 7 项。
- 两模型均为 2D SVG，不使用 Three/R3F；`P08Stage`/`I07Stage` 的 SVG 必须设置 `stage-svg` 类并显式 `width/height`，否则 viewBox 会随内容高度反馈膨胀。
- 新增性能（生产 preview，非真机）：I07 阻尼+图像 avg 5.79/p95 6.2–6.4 ms；P08 五粒子教师矢量 avg 5.79–5.85/p95 6.3–6.5 ms；P08 反求 241 点约 35 ms。

### 5.10 I08 / 学习路线（第十四轮成果）

- **I08**：`/#/induction/ac-generator`。物理：`acGenerator.ts` 的 `Φ=BAcosθ`、`Ψ=NΦ`、`ε=NBAωsinθ`、`I=ε/(R_L+r)`、`P_L/P_r/P_drive`、`τ_em/τ_drive`、峰值/有效值/频率；能量 `∫sin²` + `circuitTimeline` 分段；手动 `manualGeneratorMotion.ts` 复用 I01 角度解缠/时间戳估计。场景 `emplab.i08.scene.v2`，13 预设；`i08.spec.ts` 6 项；G01–G20 共 23 项物理测试。
- **学习路线**：`/#/path` + `/#/path/:pathId/:modelId`。`src/content/learningPath.ts` 是轻量元数据；详情页用真实 `LessonRunner`（`pathLessonCatalog.ts`）；“配套练习”使用 `PracticePage` 的 `?model=` 精确筛选。`tests/content/learningPath.test.ts` 校验 16 个唯一 ID/路由/预设/讲解/题数；`learning-path.spec.ts` 4 项浏览器测试。
- **PracticePage URL 同步坑**：`?model=i08` → `?`（无 model）时必须重置 model/module 筛选；用 `searchKey` ref 只在 URL 真正变化时同步，避免用户在 select 中改筛选后被 effect 立刻重置。
- 新增性能（生产 preview，非真机）：I08 自动+图像 4.15/4.3 ms；I08 手动拖拽+图像 4.13–4.15/4.3 ms；学习路线 4.13–4.15/4.3 ms。

### 5.11 题目案例 / 设备检测 / 静态部署（第十五轮成果）

- **案例**：`/#/cases`、`/#/cases/:caseId?stage=...`。`problemCaseSchema.ts` + `problemCases.ts`（C01–C06）；阶段只有真实 `modelId + presetId`，启动沿用 `routeForModel` 与 `?preset=`。进入前 `backupCaseScene`，返回 `restoreCaseBackups`；案例进度 `emplab.cases.progress.v1`，返回上下文在 sessionStorage。点击实验会带 `case` + `stage` 查询，`CaseReturnBanner` 显示返回入口。**不要改成复制求解器或独立假实验页。**
- **来源**：6 案 `original_case/original/paper_and_solution_verified`；真题 5 条 `exam_reference/unverified/link_only`。`verifiedOnline` 与授权分离；不要因找到第三方网页而升级核验/授权。
- **设备检测**：`/#/device-check`。`DeviceCheckPage.tsx` 采集环境、WebGL 丢失/恢复、rAF 探针和 10 项人工检查；默认 `NOT_TESTED`，导出脱敏 JSON。自动化结果必须标 `SIMULATED`，真机验收用 `docs/CLASSROOM_DEVICE_QA.md`。
- **静态部署**：`netlify.toml` + `public/_headers` + `scripts/check-static-build.mjs` + `npm run verify:static`；`npm run preview:staging` 只是本地预览。**外部部署 BLOCKED（无授权）**，不得编造 URL；真实步骤/回滚见 `docs/DEPLOYMENT_STAGING.md`。
- **测试稳定性坑**：I06/I07 手动拖动电流只在持续拖动时非零；固定等待会越过 0.12 s 速度窗口而正确归零。E2E 必须持续拖动并用 `expect.poll` 采样，不能降低电流阈值或改成假常量。

### 5.12 整题连续仿真与逐问解析（第十六轮成果）

- **整题适配层**：`src/features/cases/wholeProblem/types.ts`、`buildWholeProblem.ts`、`WholeProblemLab.tsx`；`caseSolutions.ts` 保存 C01–C08 的 `parts[]`、`wholeProblem`、变式和公式。所有适配器只调用现有纯物理引擎（P04/P05/P07/I03/I05/I06/I07），不复制求解器。
- **覆盖**：8 案均 `full_problem_simulated`；C03 先做纵向闭环，C02 使用 A/B 同场 + 独立 launchTime、A 初速变式保留全局时间，C06 使用反向双场+挡板的连续自由模式，C07 使用无末段场的可调分析器，C08 使用 I06 接触停止。任何新的“半段覆盖”必须降级为 `partial_stage`。
- **答案有效性**：`caseAnswerCheck.ts` 使用安全表达式、单位换算和 `WholeProblemModel.answers`；`dependsOn` 参数改变后必须重新求解，当前无唯一值返回 `needs_review`，绝不沿用静态基线。C08 接触焦耳热是 **0.75 J**（首次几何接触，v₁=1.5、v₂=0.5），不是两杆最终同速的 1 J。
- **状态**：逐问进度写入 `emplab.cases.progress.v1` 的可选 `parts`；`?part=a|b|c` 是白名单深链。旧 Round15 阶段跳转仍保留，但明确标注为“分阶段基础模型对照”，不当作整题完成。
- **测试**：`tests/content/wholeProblem.test.ts`（10）、`caseAnswerCheck.test.ts`（5）、`tests/tablet/round16.spec.ts`（7）；全量 555/172/2。不要为了页面效果降低这些物理断言。

## 6. 硬性约束（违反其中任何一条 = 返工）

1. **不得伪造真题内容**：不复制/改写题干、图片、答案；不猜高考答案；真题索引永久保留“未在线复核”。
2. **不得删除、跳过（`.skip`）、放宽现有测试或降低断言精度换绿灯**。测试失败要修实现，不修断言——除非断言本身算错（要给出解析推导）。
3. **不得用硬编码动画/预设轨迹冒充物理**。狭缝通过、屏幕命中、边界出场、跨界时序都必须来自解析求根。
4. **不得新建脱离现有架构的独立 App 或重复壳页面**（例如再造一个 P07/P08 空壳、复制一份 `BeamlinePage`）。
5. **不得破坏已有 16 个模型**：路由、旧存档兼容、原创题、教师层、P01 3D 懒加载与 WebGL 回退、PWA 离线、学习路线深链。
6. **真实设备保持 `NOT_TESTED`**：CDP 合成触摸、headless Chrome、CSS 像素视口都不能写成“iPad/Android 通过”；不得宣称未实测的 60 fps。
7. **文档数字必须来自当次运行输出**。任何功能改动后重跑全量并同步 `QA.md` 等文档。
8. **不得用 eval / Function 执行用户表达式**；不得把合法输入静默 clamp 到滑块范围或取整；不得删除原滑动条。
9. **不要只输出计划**。用户明确要求直接在本仓库实施 + 给证据（物理验算、测试、截图、构建/性能、文件清单、剩余限制）。
10. 触控：命中区域 ≥44 CSS px；播放中第一指拖动句柄，第二指取消草稿；缩放不改变物理量；暂停时拖动要提示且不记录。
11. UI 优先平板横屏，竖屏与字号放大要可用（Playwright 已有覆盖）。
12. **部署状态必须真实**：没有托管授权就写 `BLOCKED`，不提供/猜测公网 URL；`localhost`/`vite preview` 不是外部部署；未取得授权不得上传仓库或 `dist` 到第三方。
13. **来源状态必须真实**：原创案例标 `original_case`，不冒充真题；真题只在 `verification` 与 `rights` 都满足时才可展示受版权材料；不抓取/镜像未授权题库。
14. **整题完成必须同舞台**：至少同一坐标系、统一 `tGlobal`、真实事件与状态连续性；多个不连续预设跳转只能标 `partial_stage`，不能计入 FULL。答案依赖参数变化时必须重算或标 `needs_review`，不得沿用旧数值。
15. **逐问解析不是结果表**：每个小问必须有方程建立、正方向、边界/初值、代数/求解、单位与物理解释；公式可复制，中文在公式外；不得用引擎输出反填成唯一“独立证明”。

---

## 7. 未完成路线图

| ID | 原始定义 | 现状 | 建议 |
|---|---|---|---|
| P08 | 复合场约束与反求 | **COMPLETE**（Round 13）：目标事件、可达性、临界、单参数反求 + 正向复核 | 保持 `P08_SCOPE_DECISION.md` 的独立范围，不退回 P06/P07 复制页 |
| I05 | 时变 B + 运动线框耦合 | **COMPLETE**（Round 12） | 四模式、感生/动生分解、场源能量、RK4/解析、手动 B/x；见 §5.7 |
| I06 | 双棒/双导轨 | **COMPLETE**（Round 12） | 四模式、单回路电流、解析速度趋同、动量/能量、接触停止；见 §5.7 |
| I07 | 反向磁区 + 线框 + 挡板 | **COMPLETE**（Round 13）：带符号磁通、指数分段、真实挡板与能量分账 | 已交付；后续可做真实设备验收，勿重写已验证 solver |
| I08 | 旋转线圈/交流发电机 | **COMPLETE**（Round 14）：正弦交流、有效值、负载/内阻功率、机械输入、开关事件、手动转动 | 全部 16 个原始编号已完成；后续只做真机/内容/发布准备 |
| 内容 | 真题授权录入与在线核验 | 未做 | 需要外部资料授权，不是纯代码任务 |
| 内容 | 分步填空题、教师自定义预设/题目导入、手写批注 | 未做 | 独立 feature 级任务 |
| 验收 | 真机 iPadOS Safari / Android Chrome | **NOT_TESTED** | 用 `docs/CLASSROOM_DEVICE_QA.md` 逐项记录；CDP/无头结果只能标 `SIMULATED` |
| 部署 | 公网 HTTPS + PWA 安装 | **BLOCKED**（无托管授权） | 获得授权后按 `docs/DEPLOYMENT_STAGING.md` 发布、验证深链接/离线/更新/回滚；不要编造 URL |
| 内容 | 8 个原创整题案例 | **完成**（Round 16） | 新增案例需过 `problemCases.test.ts`、`wholeProblem.test.ts` 与来源/授权约束 |

---

## 8. 已知坑（本轮踩过，别再来一次）

- **terminal 事件 duration**：`screen-hit/screen-outside/absorbed/event-limited` 的 `durationS` 都取事件时刻；曾误写成 `durationS = 0`，导致 t=0 就显示“已吸收”。已有回归测试锁死 `p07OutcomeAt(slow, 0) === flying`。
- **选速区里的 `vx`**：是 `v_d + (v_0-v_d)·cos(ωt)`，不是 `v_0·cos(ωt)`；漂移非零时解析期望要带上 `v_d`。
- **每帧重算导致掉帧**：静态部分（区域/场/器件/预测路径/`bounds`）必须按 `staticSignature` 记忆化；轨迹采样保持 ≤120 点。当前 median p95 ≈16.7 ms。
- **TDZ**：`BeamlinePage` 里 preset effect 依赖 `clock` 与 `showConditionNotice`，声明顺序要放在它们之后。
- **Playwright 文案耦合**：事件列表用“被探测”；读数精度用 4 位显示 `1.0893`，全局时间断言 3 位 `3.68`；参数页默认不在“参数”tab，要先 `getByRole('tab', { name: /参数/ }).click()`。
- **Live-edit 测试钩子**：舞台需要暴露 `data-selected-start-x/y`，否则断言拿不到当前粒子起点。
- **构建数字会随文案变**：首页文字改动会挪 entry/gzip/PWA 计数——改完必须重跑 build 并同步文档。
- **共享装置变更语义**：`updateApparatus` 要校验 → `applySharedField` → 重启时钟 → 清草稿与轨迹；漏一步会残留旧检测标记。
- **参数输入逐字符提交**：`ParamSlider` 只在 Enter/失焦提交；不要为了“即时”在 onChange 里调物理 onChange，否则每敲一个字符就重置时间轴/listener。
- **合法超范围值**：不要用 `Math.min/max` 把表达式结果夹回滑块范围；`data-out-of-range`/虚线滑块是刻意设计。页面 sanitizer 只做旧数据迁移，稳定域必须与控件域一致，否则会出现“显示 5、实际 2”。
- **单位换算不得 toFixed**：cm→m 等直接 `value / 100`；曾用 `toFixed(4)` 悄悄改值，已移除，别再加回。
- **I01/I04 手动目标**：`createManualTimeline`/`applyManualTarget` 内部夹取 ±10 T；控件域必须保持 ±10，否则 UI 显示值会被物理层改写。手动目标仍必须走 ramp，暂停时拒绝。
- **原式记忆**：仅会话内 Map，不写 localStorage/场景 JSON；key 是 `hash|label|unit`。新增页面/动态 label 时注意唯一性。
- **P04/P05 几何静默改写**：`normalizeGeometry` 与 `patchField` 中的 0.05/0.02 自动推移已删除；现在由控件跨字段校验拒绝非法顺序，页面保留精确输入。不要恢复自动 nudge。
- **I05 的 `g` 与 `ℓ`**：`g` 在几何阈值处必须给单侧值并标记 `slopeOneSided`，不能把阈值点的 0 当成唯一导数；完全在场内 `g=0` 时仍可有 ε_t/I，但 F_Bx=0。
- **I05 能量账本**：`W_ts=∫Iε_t dt` 不能漏；M1 的所需外力是 `−F_Bx`，不是 `F_ext` 参数。M4 不报告精确 W_ext/残差。
- **I05 手动 B**：M3 必须复用 `applyManualTarget` 的 ramp，追加目标用当前仿真时间；暂停或时钟早于最后 keyframe 时拒绝，否则会把目标写进历史。
- **I06 单回路**：两根杆只有一个电流，不能画成两个独立单棒；`F_B1+F_B2=0`。接触用 `d(t)=0` 首次根停止，不能继续推入 `d<0`，也不能把碰撞耗散算进 Q_J。
- **I06 手动夹持**：D4 中被夹持杆速度固定为 0；不要把它当自由动力学，也不要显示精确外功/能量残差。
- **Node 环境**：Round 15 QA 与当前 shell 均为 Node v22.20.0 / npm 11.7.0；如环境升级出现差异，以仓库 `package-lock.json` 与本机 Chrome 156 为准，报告里写清实测版本。
- **舞台 SVG 尺寸**：`I07Stage`/`P08Stage` 必须使用 `stage-svg` 类 + 显式 `width/height`，否则 viewBox 高度会因 flex 内容反馈膨胀到数万像素，手柄 boundingBox 跑到屏幕外，拖动测试失败。
- **I07 手动速度窗口**：I07 手动拖动使用 0.3 s 最小二乘窗口（不是 I05 的 0.12 s）；浏览器 pointermove 间隔常大于 0.12 s，窗口过窄会把速度估成 0，电流/焦耳热全为 0。
- **P08 初始选中粒子**：`p08SceneFromDisplays` 必须把 `activeParticleId` 设为第一个粒子；`addParticle` 默认选最后一个，会让播放中“编辑 A”实际编辑 E。
- **P08 目标 vs 物理场**：修改 target/window/direction 只 `commitConstraint`，不得 `clock.reset()` 或重发射粒子；只有 E/B 变化才 `p08ApplyField` + 整场重演。
- **I08 θ 定义**：θ 是法线与 B 的夹角，不是线圈平面角；UI/公式/数据/题目必须一致。G13 等相位锚点若写错 90° 会全盘错。
- **I08 手动 RMS/能量**：手动模式只能标估计或 N/A，不能复用自动解析 RMS 冒充测量；停手必须 ω→0。
- **I08 开关**：纯电阻模型下开关是运行中事件，不重置 θ/时间；自动用 `circuitTimeline` 分段能量，手动用 session 的 `setCircuitClosed`。
- **I08 解析积分**：`∫sin² = t/2 − cos(2θ0+ωt)sin(ωt)/(2ω)`；小 ω 用 `t·sinc` 级数，不要用会 0/0 的朴素式。
- **PracticePage `?model`**：用 `searchKey` ref 同步 URL，避免用户改筛选后被 effect 重置；`?model=all` 时 module 也回 all。
- **案例场景不能覆盖个人场景**：案例启动前必须 `backupCaseScene`，返回/挂载时 `restoreCaseBackups`；不要在模型页把 preset 直接写入 localStorage 后不恢复。
- **案例数据只允许白名单**：阶段只能有 `modelId + presetId`；不要在 URL/JSON 中接受函数名、模块名、脚本或任意类名。
- **设备报告脱敏**：导出只含环境、人工状态、备注与探针；不要加入答案、场景、进度、UA 之外的标识或任何上传。
- **部署文档不能放示例真 URL**：`DEPLOYMENT_STAGING.md` 被测试检查不得含 `*.netlify.app` URL；真实地址只有发布后才记录。
- **E2E 手动拖动电流**：I06/I07 电流只在持续拖动时非零；固定等待会越过速度窗口正确归零。用持续拖动 + `expect.poll`，不要降低阈值。
- **PWA 新路由**：新增公共路由要加入 `tests/pwa/pwa.spec.ts` 的离线遍历，否则“离线可用”只覆盖旧路径。


---

## 9. 文档索引（改代码要同步哪一份）

- `README.md` — 项目现状表、能力清单。
- `docs/REQUIREMENTS.md` — 需求与本轮范围（Round 15 见题目实验/平板交付两节）。
- `docs/PHYSICS_SPEC.md` — **物理规范与解析锚点**（§13 P07；§13.5 I05；§13.6 I06；§13.7 I07；§13.8 P08；§13.9 I08；§14 数值容差；§15 不适用情形；§16 参数输入层；§17 相关代码）。新增模型必须补节。
- `docs/MODEL_COMPLETION_MATRIX.md` — 16 个编号的可追溯完成度矩阵 + Round 15/16 案例覆盖（§6）。
- `docs/CONTENT_MAP.md` — 题目/案例/标签/题源统计与真题索引。
- `docs/EXAM_SOURCES.md` — 真题来源与核验状态（全部未在线复核）。
- `docs/EXAM_SOURCE_AUDIT.md` — Round 15/16 逐条来源/授权审计、实际检索矩阵与未解决证据。
- `docs/PROBLEM_CASE_SCHEMA.md` — 案例类型、来源/授权字段、安全注入规则与作者检查清单。
- `docs/CASE_MODEL_MAPPING.md` — 8 个案例到真实模型/预设/锚点的映射。
- `docs/DEPLOYMENT_STAGING.md` — 静态 HTTPS 发布步骤、验收、回滚与 BLOCKED 状态。
- `docs/CLASSROOM_DEVICE_QA.md` — 真机矩阵、15 分钟暖机脚本、PASS/FAIL/BLOCKED/NOT_TESTED 模板。
- `docs/DECISIONS.md` — 决策记录（D29 I05；D30 I06；D31 I07；D32 P08；D33 I08；D34 学习路线；D35 题目案例；D36 静态部署/设备诊断）。
- `docs/ROUND11_5_ROUND12_AGENT_SUMMARY.md` — **Round 11.5 + Round 12 交接总结**：已实测基线、文件地图、I05/I06 语义、锚点、坑与下一步。
- `SUMMARY.md` — **Round 13–16 交接总览**：四轮交付、整题案例、测试证据、真题/部署/真机限制、协作规则；新 agent 先读。
- `docs/QA.md` — 每轮实测记录；顶部 §0 为 Round 16 最新，§0A/后续为历史。
- `docs/ROUND15_QA.md` — Round 15 分轨报告、锚点、测试稳定性修正与限制。
- `docs/ROUND15_BASELINE_AUDIT.md` — Round 15 开工前基线、路由/存储/来源/复用组件与工作拆分。
- `docs/P08_SCOPE_DECISION.md` — P08 与 P06/P07 的去重审计、独立验收场景与完成判定。
- `docs/ROUND14_MODEL_COVERAGE_AUDIT.md` — 16 模型覆盖审计、学习路线、已修复差异与剩余缺口。
- `docs/PARAMETER_INPUT_AUDIT.md` — 参数调用点/控件的逐模型清单、域、语义、例外（Round 14 后 197 个调用点 / 运行时最多 208 个控件；Round 15 未新增 ParamSlider）。
- `docs/PARAMETER_INPUT_SPEC.md` — 表达式语法、单位、校验、提交/预览、时间语义、会话原式记忆。
- `docs/screenshots/` — 每模型关键截图 + Round 15 案例/设备截图 + Round 16 `round16-c03-lab.png`、`round16-c03-variant.png`、`round16-c02-lab.png`、`round16-c06-lab.png`、`round16-c08-lab.png`、`round16-c03-portrait.png`。

---

## 10. 给下一个 agent 的工作模板

收到任务后按这个顺序执行，不要跳步：

1. 读本文 + 相关 brief（`EM_Physics_Lab_Round*_*.md`）+ `docs/PHYSICS_SPEC.md` 对应节 + `docs/MODEL_COMPLETION_MATRIX.md` 对应行。
2. 读真实代码确认当前实现（`registry.ts` / `physics/*` / `simulations/*` / `content/*`），**以代码为准，不信任何报告里的“已实现”**。
3. 用 TDD：先写失败的纯物理测试与解析锚点，再写最小实现；UI 之前保证求解器独立可验。
4. 实现顺序：物理引擎 → 场景/预设/持久化 → Stage → Page → 讲解/题目/路由/PWA。
5. 全量回归：typecheck → vitest → build → playwright → pwa，任何红灯不交付。
6. 补截图与性能数据（同环境对照，注明非真机），同步全部文档数字与矩阵状态。
7. 最终报告必须含：物理验算（含推导）、测试实际输出计数、构建体积、文件改动清单、**剩余限制**（含真机未测）。

## Round 17 交接（2026-11-05）

- 教师工作台入口 `/#/teacher/problems`；路由与实现见 `docs/ROUND17_PROBLEM_AUTHORING_SPEC.md`。
- A17-01 物理运行时 `src/physics/composite/electricMagneticScreen.ts`；整题适配器 `a17-electric-magnetic-screen`；独立证明见 `docs/ROUND17_COMPOSITE_PHYSICS_PROOF.md`。
- 教师数据层：`src/features/problem-authoring/{teacherProblemSchema,teacherProblemStore,problemAdapterRegistry,problemCompiler,solutionBinding,round17Templates}.ts`。不要从题包执行任何代码或依赖未注册 adapter。
- `WholeProblemLab` 现在是窄化 `WholeProblemLabItem`，内置案例和教师编译题共用；教师预览不写 `emplab.cases.progress.v1`。
- 修改变式/答案逻辑后必须保留“参数变化时参考值读取当前 `model.answers`”的修复；测试 `round17-stage-handoff.spec.ts` 会检查。
- 内置原创案例现为 9 个（新增 A17-01）；16 模型/132 题不变。教师私有草稿不计入任何公开计数。
- 发布检查已生成 `dist/release-manifest.json`；部署仍 `BLOCKED`，真机仍 `NOT_TESTED`。不要用 localhost 或 headless 结果改写状态。
- 新增 PWA 测试验证离线重载保留教师草稿、`emplab.progress.v1`、`emplab.cases.progress.v1` 与场景键；不要清空 storage 修缓存。
- 最终测试数字与证据以 `docs/ROUND17_QA.md` 为准。
