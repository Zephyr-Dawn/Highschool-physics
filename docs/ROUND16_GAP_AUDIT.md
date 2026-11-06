# Round 16 缺口审计（C01–C08）

日期：2026-11-05  
基线：Round 15 最终实测 `typecheck` 通过、Vitest **541/541**（48 文件）、Playwright **165/165**、PWA **2/2**、`verify:static` 通过。  
本文件是修复前证据，不代表 Round 16 完成状态。

## 1. 旧案例逐项判定

| 案例 | 完整题干 | 全部小问 | 逐问完整推导 | 本题统一场景 | 真实事件轨迹 | 数值/符号验证 | 变式后答案一致性 |
|---|---|---|---|---|---|---|---|
| C01 | YES | **NO**（只有 1 个主问题 + 预测/检查点） | **PARTIAL**（5 步整体推导，无逐问结构/答题） | **NO**（详情页只有 P04 跳转） | **PARTIAL**（P04 求解器真实，案例页未播放） | **PARTIAL**（测试锚点存在，UI 只显示结果表） | **NO**（静态 `expected`，无失效管理） |
| C02 | YES | **NO** | **PARTIAL**（整体 5 步；第 2 段是独立概念预设） | **PARTIAL**（P05 两段互相分离，其中一段 B=0 概念图） | **PARTIAL**（P05 求解器真实，未在同一舞台连续展示） | **PARTIAL** | **NO** |
| C03 | YES | **NO** | **PARTIAL**（整体推导；小问未拆） | **PARTIAL**（`p07-standard` 与 `p07-screen-miss` 两次跳转） | **PARTIAL**（P07 全链路解析真实，案例页只跳转） | **PARTIAL**（屏幕锚点有测试） | **NO** |
| C04 | YES | **NO** | **PARTIAL**（整体 5 步） | **NO**（只有 I03 跳转） | **PARTIAL**（I03 求解真实） | **PARTIAL**（t=0.1 s 快照） | **NO** |
| C05 | YES | **NO** | **PARTIAL**（整体推导，未拆小问/答案） | **NO**（只有 I05 跳转） | **PARTIAL**（I05 求解器真实） | **PARTIAL**（t=0.5 s 锚点） | **NO** |
| C06 | YES | **NO** | **PARTIAL**（整体推导；场/挡板分属两个预设） | **PARTIAL**（`i07-interface` 与 `i07-inelastic-wall` 分离，B=0 挡板场景不连续） | **PARTIAL**（I07 求解真实） | **PARTIAL** | **NO** |

结论：Round 15 的 `stages[].presetId` 只证明“能打开真实基础模型”，**不能证明整道题被同一场景连续模拟**。旧案例均不满足 `full_problem_simulated`。

## 2. 源码证据

- `src/content/problemCases.ts`：每案只有 `prediction`、`stages`、`reasoningSteps`、`variations`、`checkpoint`；没有 `QuestionPart[]`、逐问答案或参数依赖。
- `src/pages/CaseDetailPage.tsx`：实验按钮只调用 `navigate(routeForModel(stage.modelId)?preset=...)`，没有案例内的统一舞台/时间轴/事件导航。
- `src/content/problemCaseSchema.ts`：`expected` 是静态数字与容差；没有答案失效策略。
- 真实求解器已存在且可复用：
  - P07：`src/physics/particles/beamline.ts`（`solveBeamlineTrajectory`、`beamlineStateAt`，事件含狭缝、吸收、屏幕、相切）。
  - P05：`src/physics/particles/alternatingMagneticRegions.ts`（多区解析分段、跨界事件）。
  - I05：`src/physics/induction/movingLoopSolver.ts`（感生/动生分解、能量账本、事件）。
  - I07：`src/physics/induction/oppositeFieldsWallLoop.ts`（带符号通量、挡板反弹/冲击损失）。
  - I06：`src/physics/induction/dualRodCoupling.ts`（双棒解析耦合）；P08：`src/physics/particles/fieldConstraintEvents.ts` 与 `fieldConstraintInverse.ts`。
- 已有可复用交互：`ParamSlider` 安全表达式、`SeriesChart`、`CaseReturnBanner`、`caseSession` 场景备份、`LessonRunner`、教师层、PWA。

## 3. 本轮修复策略

1. **C03 纵切片优先**：P07 单场景一条连续轨迹覆盖源点→入口狭缝→选速→出口狭缝→磁分析→电偏转→屏幕；事件、时间、位置、速度、屏幕 y 全部来自 `BeamlineSolution`。逐问 a/b/c 推导与答案绑定同一 `tGlobal`。
2. **C02**：新建同一 P05 磁场场景，粒子 A 与延迟 1 s 发射的粒子 B 共用舞台；A 在 t=π 到达 (0,−2)，B 在 tGlobal=2 s 到达同一位置，用同一 tGlobal 对照，不再用 B=0 概念段冒充。
3. **C05**：I05 单线框场景，统一显示 B(t)、重叠长度、ε_t/ε_m、I、F、P_J、场源能量；公式在变式后由当前解算值重算。
4. **C06**：I07 连续场景同时包含反向双场与挡板，展示跨界、零通量非零电动势、碰板反弹；另设 B=0 单碰控制实验作为独立锚点，不混为同一物理条件。
5. **C01/C04**：补全三小问与单场景连续舞台（P04/I03）；覆盖等级按实际能力标注。
6. **C07/C08**：新增原创综合题；C07 用 P07 做逆选参数/临界/多结果，C08 用 I06 双棒解析解做能量/极值/终止事件；两题均给独立锚点。
7. **答案有效性**：`QuestionPart.answerSpec.dependsOn` 与当前参数快照比对；依赖改变时基线数值标“仅适用于原题”，使用当前求解器的可观测量重新验证或标 `needs_review`，不静默沿用旧答案。
8. **不修改** 16 模型求解器、132 题、旧场景版本与既有测试断言。

## 4. 本轮验收等级目标

| 案例 | 目标覆盖 | 依据 |
|---|---|---|
| C01 | `full_problem_simulated` | P04 单场景连续边界出场 + 3 小问 |
| C02 | `full_problem_simulated` | P05 双粒子同场、统一时钟 + 3 小问 |
| C03 | `full_problem_simulated` | P07 全程束线 + 3 小问 |
| C04 | `full_problem_simulated` | I03 单场景连续进出 + 3 小问 |
| C05 | `full_problem_simulated` | I05 单线框全程 + 3 小问 |
| C06 | `full_problem_simulated` | I07 双场+挡板连续 + 3 小问 |
| C07 | `full_problem_simulated` | P07 连续轨迹 + 独立逆选分析 |
| C08 | `full_problem_simulated` | I06 双棒解析连续 + 独立能量锚点 |

任何一项在实现中无法达到统一坐标/连续状态/独立验算，将降级为 `partial_stage` 或 `concept_illustration` 并在最终报告说明，不以链接或截图冒充。

## 5. 修复后对照（2026-11-05）

| 案例 | 小问数 | 逐问解析/提示 | 统一舞台 | 真实事件 | 答案有效性 | 覆盖 |
|---|---:|---|---|---|---|---|
| C01 | 3 | YES | P04 连续 | 出场 | 变式重算 | `full_problem_simulated` |
| C02 | 3 | YES | P05 A/B 同场 | 两次 A 跨界 + B 首次 | 变式重算；A 初速保留全局时间 | `full_problem_simulated` |
| C03 | 3 | YES | P07 全链路 | 狭缝/分析/屏幕/吸收 | 吸收时 `needs_review` | `full_problem_simulated` |
| C04 | 3 | YES | I03 连续 | 进入/场内/离开 | 变式重算 | `full_problem_simulated` |
| C05 | 3 | YES | I05 连续 | 几何/场折点 | 变式重算 | `full_problem_simulated` |
| C06 | 3 | YES | I07 双场+挡板连续 | 界面/出场/碰板/再入 | e/B 变式重算 | `full_problem_simulated` |
| C07 | 3 | YES（新增） | P07 可调分析 | 狭缝/出口/屏幕 | B 反号/临界重算 | `full_problem_simulated` |
| C08 | 3 | YES（新增） | I06 双杆接触 | 接触停止 | B/初速变式重算 | `full_problem_simulated` |

最终回归：Vitest **556/556**（50 文件）、Playwright **172/172**、PWA **2/2**、`verify:static` 通过；真实设备/公网/真题授权仍未完成。详见 [ROUND16_QA.md](ROUND16_QA.md)。
