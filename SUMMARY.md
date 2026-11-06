# EM Physics Lab — Round 13–18 交付总结（交接版）

日期：2026-11-06  
工作区：`H:\programming\EM_Physics_Lab`（Windows 10.0.26100，**非 git 仓库**，不要假设可用 git 历史/回滚）  
用途：把最近六轮（Round 13–18）的工程进度、架构、测试证据、限制和协作规则交给下一位 agent/教师。

---

## 0. 一句话现状

已完成 **16 个可运行物理模型（P01–P08、I01–I08）**、**132 道原创基础题**、**9 个内置整题案例（C01–C08 + A17-01）**、**教师题目工作台**、**16 模型学习路线**、**全模型安全数学表达式输入**、**完整本地数据备份/迁移**、**本地设备诊断**、**静态 HTTPS 部署包**与**Capacitor pilot 配置**。  
当前最终实测：`typecheck` 通过、**Vitest 607/607（57 文件）**、**Playwright 183/183**、**PWA 3/3**、`verify:static` 通过。  
仍未完成：真实 iPadOS/Android 验收、外部 HTTPS 发布（BLOCKED，无授权）、真实高考题内容的权威核验/转载授权。

---

## 1. 六轮进度总览

| 轮次 | 核心交付 | 当时/最终验证 |
|---|---|---|
| **Round 13** | I07 相反磁区线框 + 真实挡板；P08 约束/临界/单参数反求；16 模型完成度矩阵 | 16 个原编号完成，132 题；详见 `docs/ROUND14_MODEL_COVERAGE_AUDIT.md` 前的历史记录 |
| **Round 14** | I08 交流发电机（正弦交流、有效值、负载/内阻功率、手动转动）；`/#/path` 两条 16 模型学习路线、真实讲解/预设/练习深链 | Vitest 521/521（44 文件）、Playwright 159/159、PWA 2/2 |
| **Round 15** | 6 个原创高考风格案例 C01–C06；来源/核验/转载权利分层；`/#/device-check` 本地诊断；`netlify.toml`、`_headers`、`verify:static`、`preview:staging` | Vitest 541/541（48 文件）、Playwright 165/165、PWA 2/2、verify:static 通过 |
| **Round 16** | 8 个**整题连续仿真**案例 C01–C08；同一舞台/统一 `tGlobal`/真实事件；逐问解析、答案输入/单位/量纲、变式有效性；新增 C07/C08；真实来源实际检索 | Vitest 556/556、Playwright 172/172、PWA 2/2 |
| **Round 17** | 教师题目工作台（列表/编辑/预览/导入导出）；A17-01 跨求解器连续题、A17-02 感应模板；内置案例增至 9 个 | Vitest 593/593、Playwright 180/180、PWA 3/3 |
| **Round 18** | 变式推导默认折叠；完整本地备份/迁移；平台检测；静态包 buildId/secret/私有文件/CSP 硬化；staging smoke；Build A→B PWA 模拟；Capacitor pilot 配置 | **Vitest 607/607（57 文件）**、**Playwright 183/183**、**PWA 3/3**、verify:static 通过 |

### 1.1 Round 13 — I07 / P08

- I07：双区带符号磁通 `Φ=h(B₁ℓ₁+B₂ℓ₂)`、`S=B₁g₁+B₂g₂`、真实挡板反弹/压墙、`Q_impact` 与 `Q_J` 分离；模式包括规定运动、自由、恒力、手动拖线框。
- P08：目标线段/时间窗/方向条件的正向事件，区分 crossing/tangent-touch/start-on-target；单参数反求 + 正向复核；多根/临界/`uncertain`/`not-found-within-search` 分开显示。
- 16 个原编号全部 COMPLETE；不新增 P09/I09。

### 1.2 Round 14 — I08 / 学习路线

- I08：自动匀速 G1 与手动转动 G2；`Φ=BAcosθ`、`ε=NBAωsinθ`、峰值/有效值/频率、负载/内阻功率、机械输入能量、开关事件；纯电阻模型不包含自感/RLC。
- `/#/path` 与 `/#/path/:pathId/:modelId`：粒子路线 8 站、感应路线 8 站；真实 `LessonRunner`、真实预设深链、模型精确练习筛选、上一站/下一站、教师演示路径。
- `PracticePage` 支持 `?model=` 精确筛选；保留旧 `?q=`、模块筛选与 132 题。

### 1.3 Round 15 — 题目案例 / 设备诊断 / 静态部署

- 6 个原创·高考风格案例 C01–C06；来源分为 `original_case` 与 `exam_reference`，真题只保留元数据/外链。
- 案例启动使用真实 `modelId + presetId`，进入前备份个人场景、返回恢复；案例进度独立于 132 题和基础模型场景。
- `/#/device-check`：本地环境/WebGL 丢失恢复/rAF 探针/10 项人工检查/脱敏 JSON；真机默认 `NOT_TESTED`，自动化结果 `SIMULATED`。
- 静态部署包：`netlify.toml`、`public/_headers`、`scripts/check-static-build.mjs`、`npm run verify:static`、`npm run preview:staging`。
- 外部部署无授权，文档明确 `BLOCKED`，没有公网 URL。

### 1.4 Round 16 — 整题连续仿真 / 逐问解析

- 新增整题工作台：同一物理舞台 + 统一 `tGlobal` + 事件时间轴 + 逐问推导/答案/变式；不再把“跳转基础模型”当作整题完成。
- **8 个案例全部 `full_problem_simulated`**：C01 P04、C02 P05、C03/C07 P07、C04 I03、C05 I05、C06 I07、C08 I06；Round 17 另增 A17-01 跨求解器连续题。
- **24 个小问**（8×3）：每问 3–4 步推导、≥2 提示、单位/符号/量纲、典型错误、独立验算、≥2 变式。
- 新增 C07“可调磁分析器：屏幕落点/镜像/临界”和 C08“双棒追及/接触/焦耳热”；均为原创。
- 答案有效性：参数依赖改变后使用当前求解器重算；无唯一值返回 `needs_review`；不沿用失效标准值。
- 实际检索 5 条真题索引：0 条权威原卷；2 条第三方题面/解析可见但版权保留；1 条答案付费受阻；2 条地区/真题身份不足。应用仍全部 `unverified/link_only`，无题面/图片/答案复制。

### 1.5 Round 17 — 教师工作台 / A17-01

- `/#/teacher/problems`、编辑器、学生视图预览；A17-01 电场加速→有限磁场→自由漂移→屏幕，两个交接误差 0；A17-02 I07 感应+挡板模板。
- 教师草稿本机私有 `emplab.teacher-problems.v1`；导入/导出、URL/公式/大小/深度/原型污染防护；C01–C08/A17 可复制为草稿。
- 内置案例 9 个（C01–C08 + A17-01），16 模型/132 题不变。

### 1.6 Round 18 — 发布门禁 / 数据迁移 / 原生评估

- 变式下标准推导默认折叠，显式“仍查看标准推导（仅参考）”；参考值/判题始终用当前求解器。
- “我的记录”新增完整本地备份：场景、132 题、案例、教师草稿、讲解/模式、设备记录；预览后恢复、失败回滚、不 `localStorage.clear()`。
- 静态包：release manifest schemaVersion 2 + buildId、secret/私有文件扫描、CSP/Permissions-Policy、`smoke:headers`、`smoke:staging`（显式 URL）、`simulate:upgrade`（本地 SIMULATED）。
- 平台检测 browser/PWA/Capacitor；原生壳跳过 SW；`native/capacitor-pilot` 固定 Capacitor 8.6.0，无 `server.url`。**无 Android SDK/JDK/Xcode，APK/IPA 未生成**。

---

## 2. 当前架构地图

### 2.1 物理层（纯函数，不依赖 React/DOM）

- `src/physics/particles/`：`uniformB`、`halfPlane`、`finiteMagneticRegion`、`alternatingMagneticRegions`、`crossedFields`、`segmentedFields`、`beamline`、`multiParticle`、`lorentzForce`、`uniformB3D`。
- `src/physics/induction/`：`loopField`、`fluxLenz`、`timeVaryingField`、`movingRod`、`manual*`、`movingLoopTimeField`/`movingLoopSolver`、`dualRodCoupling`、`oppositeFieldsWallLoop`、`acGenerator`。
- 事件由解析求根/事件表产生，不由动画采样定义；页面只做状态编排和 SVG/WebGL 绘制。

### 2.2 模型与页面

- `src/simulations/registry.ts`：16 个模型元数据、`routeForModel`、`simTitleForModel`。
- `src/app/App.tsx`：HashRouter、路由懒加载、导航、全局 `CaseReturnBanner`。
- `src/pages/`：首页、练习、进度、案例列表/详情、设备检测、学习路线等。
- P01 真实 WebGL 3D 独立懒加载；其余模型为 2D SVG/Canvas。

### 2.3 题目案例层

- `src/content/problemCaseSchema.ts`：`ProblemCase`、`QuestionPart`、`WholeProblemScenario`、来源/权利/覆盖级别 Zod 校验。
- `src/content/problemCases.ts`：C01–C08 基础题面、预测、阶段、检查点；与 `caseSolutions.ts` 合并。
- `src/content/caseSolutions.ts`：每案 3 问的推导/答案/提示/误区/变式、整题适配器/阶段/教师注释。
- `src/features/cases/wholeProblem/`：`types.ts`、`buildWholeProblem.ts`（真实求解器适配）、`WholeProblemLab.tsx`（同舞台/事件/逐问/答案/变式 UI）。
- `src/features/cases/solutions/caseAnswerCheck.ts`：安全表达式、单位换算、答案有效性与 `needs_review`。
- `src/features/cases/caseSession.ts`：场景备份/恢复、返回上下文、案例与逐问进度（`emplab.cases.progress.v1`）。

### 2.4 整题适配器

| 案例 | adapterId | 引擎 | 覆盖 |
|---|---|---|---|
| C01 | `p04-boundary` | `solveFiniteFieldTrajectory` | `full_problem_simulated` |
| C02 | `p05-multizone` | `solveAlternatingFieldTrajectory` | `full_problem_simulated` |
| C03 | `p07-beamline` | `solveBeamlineTrajectory` | `full_problem_simulated` |
| C04 | `i03-loop-entry` | `simulateLoop` | `full_problem_simulated` |
| C05 | `i05-loop-field` | `solveI05` | `full_problem_simulated` |
| C06 | `i07-opposite-wall` | `solveI07` | `full_problem_simulated` |
| C07 | `p07-beamline` | `solveBeamlineTrajectory` | `full_problem_simulated` |
| C08 | `i06-dual-rod` | `solveDualRod` | `full_problem_simulated` |

适配器只做坐标/时间/事件/可观测量的薄映射，不复制求解器；`adapterId` 是固定联合类型，不从 URL/JSON 接受代码。

---

## 3. 当前验证基线（必须实际重跑，不要凭记忆）

环境：Node v22.20.0 / npm 11.7.0；Playwright 1.64.1，本机 Chrome 156 headless；Windows x64。

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npx vitest run` | **607/607**，57 文件 |
| `npx playwright test` | **183/183**，约 6.4 分钟 |
| `npm run test:pwa` | **3/3**，覆盖 16 模型 + 9 案例 + 教师离线 + 本地备份 + 学习路线 + P01 3D |
| `npm run verify:static` | 通过：`72 JS, 1 CSS, assets 4249.4 KiB, 140 files, sha 53e1bb251445`；manifest v2 + buildId |

构建（最终实测）：

- 入口 JS：340.35 kB（gzip 103.65）。
- 案例详情：随 Round17 教师/整题代码调整；最终构建以 `ROUND18_QA` 为准。
- 教师列表/编辑器/预览：18.03 / 25.07 / 4.54 kB。
- CSS：140.99 kB（gzip 28.84）。
- PWA 预缓存：144 项 / 4308.13 KiB。
- P01ThreeDStage：978.52 kB（gzip 263.16，单独懒加载）。

推荐验收顺序：

```bash
npm run typecheck
npx vitest run
npm run build
npx playwright test
npm run test:pwa
npm run verify:static
```

---

## 4. 关键物理锚点

| 案例/模型 | 锚点 |
|---|---|
| C01 P04 | `t=π/6 s`，`(0.5, 1−√3/2)`，`v=(√3/2,1/2)`，临界宽度 1 m |
| C02 P05 | A：`t=π→(0,−2)`、`2π→(0,−4)`；延迟 1 s 的 B 在 `tGlobal=1+π` 到达 `(0,−2)` |
| C03 P07 | 选速 2 m/s；到达 `3.678299314 s`；屏幕 `y=1.0893163975 m` |
| C04 I03 | `t=0.1 s`：`Φ=0.01 Wb`、`ε=−0.3 V`、`I=−0.6 A` |
| C05 I05 | `t=0.5 s`：`ε_t=−0.5`、`ε_m=−2.5`、`ε=−3 V`、`I=−1.5 A`、`P_J=4.5 W` |
| C06 I07 整题 | `ε₀=16 V`、碰前 1.8 m/s、`Q_impact=1.215 J`、反弹 −0.9 m/s |
| C07 P07 | `screenY=2−2√3/3≈0.8452995 m`；B 反号镜像；临界 `|B|=2 T` |
| C08 I06 | `I₀=1 A`、`t_contact=ln2 s`、接触时 `v₁=1.5, v₂=0.5 m/s`、`Q_J=0.75 J` |
| A17-01 复合场 | `tA=√3−1`、`tB=π/6`、`tC=2/3`、总时间 1.9223162498 s；B 出射 y=√3−3/2；屏幕 y=4√3/3−3/2；两交接误差 0 |

C06 的 **0.375 J** 是 B=0、宽 0.5 m、碰前 1 m/s 的**分阶段控制实验**，不是整题连续场景；不要混写。

---

## 5. 真题来源与授权状态

详见 `docs/EXAM_SOURCES.md`、`docs/EXAM_SOURCE_AUDIT.md`。

- 5 条 `EXAM_REFERENCES`：全部 `sourceKind='exam_reference'`、`verification='unverified'`、`rights='link_only'`、`verifiedOnline=false`。
- 2026-11-05 实际检索：0 条权威考试院原卷；2 条第三方页题面/解析可见但站点版权保留；1 条答案受付费/登录限制；2 条地区标签/真题身份不足。
- 未复制题干、图片或答案；未把原创案例冒充真题；未升级任何核验/授权标记。
- 继续遵守：页面公开可见 ≠ 转载许可；第三方答案 ≠ 独立核验；没有合法原卷/授权不得展示受保护内容。

---

## 6. 真实设备、部署与未完成项

| 项目 | 状态 | 说明 |
|---|---|---|
| 真实 iPadOS Safari / Android Chrome | **NOT_TESTED** | 触摸、软键盘、安全区、VoiceOver/TalkBack、WebGL 真机恢复、发热/续航未验证 |
| Android/iOS 原生构建 | **BLOCKED** | 无 Android SDK/现代 JDK/Xcode；`native/capacitor-pilot` 仅配置就绪 |
| 本地完整备份 | 已实现 | 场景/132 题/案例/教师草稿/设备记录；预览恢复、失败回滚、不 clear |
| CDP/无头 Chrome | **SIMULATED** | 不是真机通过，不得宣称 60 fps |
| 外部 HTTPS 部署 | **BLOCKED** | 没有托管账号/站点授权；无公网 URL；`preview:staging` 只是本地预览 |
| 真题权威核验 | **未完成** | 0 条权威原卷，全部 link_only |
| 真题转载授权 | **未取得** | 不复制题面/图片/答案 |

限制不等于功能未实现：本地静态构建、PWA 离线、设备诊断页面已完成；缺的是外部授权与真实硬件证据。

---

## 7. 已知模型/案例限制

- C02 整题工作台只提供 A 初速变式，不复制基础模型的所有拖拽手柄；A/B 共用真实 P05 场和统一时钟。
- C05 整题使用 I05 规定速度（prescribed）模式；手动 B/手势在基础模型页，不与整题标准场景混用。
- C06 整题固定初速 8 m/s 以在有限时间到达挡板；反向双场与挡板连续；0.375 J 仅控制实验。
- C08 在首次几何接触停止，不模拟碰撞/形变；接触时仍有相对速度，`Q_J=0.75 J`。
- C07 使用 P07 前向求解器 + 解析临界/镜像，不新建约束引擎。
- 所有模型均为二维教学理想化：忽略边缘场、自感、摩擦、相对论、器件厚度等。
- P01 3D chunk 约 978 kB，仍只在 3D 视图懒加载；后续可评估拆分。

---

## 8. 协作规则（交接给其他 agent 时必须遵守）

1. **不得复制/改写/伪造未授权真题**：不猜答案、不补题面、不镜像题库；真题保持元数据/外链。
2. **不得删除、跳过或放宽旧测试**：修复实现而不是降低断言；物理锚点必须独立推导。
3. **不得用动画/预置轨迹冒充物理**：事件、相切、碰撞、屏幕命中必须来自求解器。
4. **不得用“跳到基础模型”冒充整题仿真**：整题必须同舞台、统一 `tGlobal`、真实事件；不满足时标 `partial_stage`。
5. **答案必须随参数失效/重算**：`dependsOn` 改变后读取当前求解器答案；无唯一值 `needs_review`，不得沿用旧数值。
6. **不得伪造部署/真机结果**：无授权写 `BLOCKED`，无真机写 `NOT_TESTED`，CDP/headless 只标 `SIMULATED`。
7. **保留 16 模型 / 132 题 / 9 个内置案例（C01–C08 + A17-01）/ 学习路线 / PWA / 表达式输入 / 场景 v2 / 进度隔离**。
8. **共享文件由主 Agent 统一集成**：`App.tsx`、`CaseDetailPage.tsx`、`problemCases.ts`、`global.css`、README/文档等不要并行直改。
9. **文档数字必须来自当次实际运行**；运行完整验收顺序后再更新 README/QA/ROUND16_QA/AGENT_HANDOFF。
10. **不要只输出计划**；交付代码、测试实际输出、截图、物理验算和剩余限制。

---

## 9. 必读文档

- `SUMMARY.md`（本文件）— 四轮交接总览。
- `docs/AGENT_HANDOFF.md` — 长期架构/命令/已知坑/硬性约束。
- `docs/REQUIREMENTS.md` — 产品范围与 Round 15/16 需求。
- `docs/PHYSICS_SPEC.md` — 物理约定、解析锚点（§13.10 案例锚点）。
- `docs/WHOLE_PROBLEM_SIMULATION_SPEC.md` — 整题适配器、事件、答案有效性、限制。
- `docs/CASE_FULL_SOLUTION_AUDIT.md` — 8 案 24 问逐问证据。
- `docs/ROUND16_QA.md` — Round 16 实测、截图、修复记录、限制。
- `docs/ROUND16_GAP_AUDIT.md` — 修复前缺口与修复后对照。
- `docs/EXAM_SOURCE_AUDIT.md` — 5 条真题实际检索、权利与未解决证据。
- `docs/DEPLOYMENT_STAGING.md` — 静态部署步骤、回滚、`BLOCKED` 状态。
- `docs/CLASSROOM_DEVICE_QA.md` — 真机矩阵/15 分钟暖机/状态模板。
- `docs/PROBLEM_CASE_SCHEMA.md`、`docs/CASE_MODEL_MAPPING.md` — 案例 schema 与模型映射。
- `docs/ROUND14_MODEL_COVERAGE_AUDIT.md` — 16 模型学习路线与覆盖审计。
- `docs/QA.md` — 顶部 §0 是 Round 16 最新，后续是历史。
- `docs/screenshots/` — 各模型与 Round 16 工作台截图。

---

## 10. 建议的下一步

1. **真实平板验收**：按 `CLASSROOM_DEVICE_QA.md` 在 iPadOS Safari/Android Chrome 上跑 15 分钟脚本；结果标 PASS/FAIL/BLOCKED，未测仍 `NOT_TESTED`。
2. **获得托管授权后真实部署**：按 `ROUND18_STAGING_RUNBOOK.md` 发布，验证 9 案例/16 模型深链、离线、更新与回滚；不得用 localhost 冒充。
3. **真题合法来源**：获得原卷与书面授权后，逐题补页码/答案/覆盖表；在此之前不升级 `unverified/link_only`。
4. **教学审查**：请物理教师复核 C01–C08 的推导、符号、单位与难度；尤其是 C06 的 1.215 J / 0.375 J 控制实验区分、C08 的 0.75 J 接触热。
5. **发布**：获得 Netlify 授权后执行 `ROUND18_STAGING_RUNBOOK.md`，用真实 URL 运行 `smoke:staging`；没有授权前保持 BLOCKED。
6. **原生**：安装 JDK 21/Android SDK 后按 `native/capacitor-pilot/README.md` 构建 debug APK；有 Mac/Xcode/签名再做 iPadOS；无真机不写设备通过。
7. **可选扩展**：把 C02 的初速变式扩展为完整多粒子手柄、把 C05 手动 B/手势历史纳入整题侧栏；先证明不破坏统一时钟和答案有效性。
8. **性能**：继续评估 P01 3D 978 kB 懒加载 chunk；不要为此降低物理精度或测试。

---

## 11. 交接启动清单（给下一位 agent）

### 第 1 小时

1. 读本文件 §0–§4、`docs/AGENT_HANDOFF.md`、`docs/ROUND16_QA.md`、`docs/ROUND18_QA.md`。
2. 运行 `npm run typecheck`、`npx vitest run`；不要先安装依赖或改代码。
3. 打开 `/#/cases/case-c03-beamline-detector`，确认整题工作台、事件条和逐问答案；再抽查 C02/C06/C08、A17-01 和教师预览；在“我的记录”检查完整备份面板。
4. 读 `src/features/cases/wholeProblem/buildWholeProblem.ts` 与 `caseAnswerCheck.ts`，确认没有第二套求解器。
5. 确认工作区不是 git 仓库；需要隔离实验时复制工作区，不要假设 `git worktree`/`git reset` 可用。

### 共享文件所有权

- 主 Agent 独占：`src/app/App.tsx`、`src/pages/CaseDetailPage.tsx`、`src/content/problemCases.ts`、`src/content/caseSolutions.ts`、`src/styles/global.css`、`README.md`、`SUMMARY.md`、`docs/*` 索引类文件。
- 并行 agent 可独立修改：纯物理模块、对应测试、独立新案例数据/适配器/组件；合并前必须对齐 `WholeProblemModel` 契约与事件 ID。
- 不允许两个 agent 同时直接改同一个共享文件；合并前先跑目标测试，再由主 Agent 跑全量。

### 修改后的完成定义

- 物理：新增/修改量有独立推导和测试锚点，事件来自求解器。
- 案例：每个小问有题干、推导、提示、答案/单位、误区、独立验算；参数依赖清楚。
- 整题：同一坐标系/统一 `tGlobal`/真实事件；不连续时标 `partial_stage`。
- 回归：`typecheck` → `vitest` → `build` → `playwright` → `pwa` → `verify:static` 全绿；不删/不跳过旧测试。
- 真实性：无授权不写真实题面/答案；无真机不写 `PASS`；无部署不写 URL。

---

# Round 17 追加交接（2026-11-05）

## 交付

- **Track A 教师题目工作台**：`/#/teacher/problems` 列表/编辑/学生视图预览；A17 模板、复制 C01–C08/A17-01、导入/导出、白名单参数、逐问答案绑定、来源/核验/权利独立。
- **A17-01**：`src/physics/composite/electricMagneticScreen.ts`、整题适配器 `a17-electric-magnetic-screen`、内置案例 `case-a17-electric-magnetic-screen`。电场加速→有限磁场→自由漂移→屏幕，两个交接点误差 0（门槛 1e-9）；屏幕 `y=4√3/3−1.5`。
- **A17-02**：教师模板基于 I07 连续多事件，Q_J ≈30.38 J、Q_impact=1.215 J 分开绑定。
- **Track B**：`verify:static` 生成 `dist/release-manifest.json`；设备诊断 schema v2（simulated / physical-device-self-reported）；PWA 离线重载保留教师草稿与旧进度。
- **计数**：16 个基础模型、132 道题不变；内置原创案例 9 个（C01–C08 + A17-01）；教师私有草稿单独计数。

## 状态

- 外部 HTTPS：**BLOCKED**，没有公网 URL。
- 真实 iPadOS Safari / Android Chrome：**NOT_TESTED**。
- Playwright/无头 Chrome：**SIMULATED**，不得计为真机 PASS。
- 真题：5 条仍 `unverified/link_only`。

## 必读

- `docs/ROUND17_BASELINE_AUDIT.md`
- `docs/ROUND17_PROBLEM_AUTHORING_SPEC.md`
- `docs/ROUND17_COMPOSITE_PHYSICS_PROOF.md`
- `docs/ROUND17_DEVICE_RELEASE_MATRIX.md`
- `docs/ROUND17_QA.md`

## 不要做

- 不把 A17-01 当作第 17 个基础模型；不改 16 模型完成度。
- 不开放任意求解器拼接或题包代码执行。
- 不在没有托管授权时写 DEPLOYED，不在没有真机时写 PASS。
- 不用清空浏览器存储修复 PWA 更新。
