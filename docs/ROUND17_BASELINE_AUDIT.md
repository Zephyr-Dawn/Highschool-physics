# Round 17 基线审计（2026-11-05）

工作区：`H:\programming\EM_Physics_Lab`  
非 git 仓库：不使用 `git worktree`、`git reset` 或基于提交的回滚假设。  
环境：Windows 10.0.26100 x64；Node v22.20.0；npm 11.7.0；Playwright 1.64.1；本机 Chrome headless。

## 1. 本轮开始前的实测基线

| 命令 | 实际结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npx vitest run --reporter=dot` | **556/556**，50 个测试文件 |
| `npm run build` | 通过；构建产物用于后续静态检查 |
| Round 17 开工前 Playwright | 未在开工前整轮重跑；上一轮报告为 172/172，本轮最终重新全部执行 |

基线确认了根目录 `SUMMARY.md` 所述的 Round 16 状态：16 个模型、132 道基础题、C01–C08 八道原创整题、整题工作台、PWA 与静态部署配置均存在。**没有把上一轮 556/172/2 的数字直接当作本轮最终证据。**

## 2. 已核对的真实代码结构

### 2.1 整题运行层

- `src/content/problemCaseSchema.ts`：`ProblemCase`、`QuestionPart`、`WholeProblemScenario` Zod 契约；原适配器联合类型为 7 个内置适配器；`parts` 已要求 ≥3 问、≥2 提示、≥3 推导步骤、答案/容差/依赖与事件引用。
- `src/features/cases/wholeProblem/types.ts`：`WholeProblemModel`、统一事件、轨迹、几何、`frameAt()`、答案与变参基线。
- `src/features/cases/wholeProblem/buildWholeProblem.ts`：7 个适配器 switch，直接调用既有纯求解器；没有第二套物理引擎。
- `src/features/cases/wholeProblem/WholeProblemLab.tsx`：可复用同一舞台 UI；实际只依赖 `item.id`、`item.parts`、`item.wholeProblem`，因此可以承载编译后的教师题目，而不复制舞台。
- `src/features/cases/solutions/caseAnswerCheck.ts`：安全数学表达式、单位转换、参数变化后重新求解、无唯一值时 `needs_review`。
- `src/features/cases/caseSession.ts`：`emplab.cases.progress.v1`、场景备份与返回上下文；内置案例进度与 132 题、个人场景分离。

关键发现：`WholeProblemLab` 在变式后只清除已判答案，但参考值区域仍直接使用 `part.answerSpec.baselineValue`，标签却写“已按当前变式重算”。本轮已修复为在依赖变化时读取当前 `model.answers[quantity]`，并增加回归测试。

### 2.2 物理模块

- 粒子：`crossedFields.ts`（匀强 E/B、稳定 B→0 极限）、`finiteMagneticRegion.ts`（条带/矩形、真实进出场与相切事件）、`beamline.ts`、`uniformB3D.ts` 等。
- 感应：`movingLoopSolver.ts`、`dualRodCoupling.ts`、`oppositeFieldsWallLoop.ts`、`acGenerator.ts` 等。
- 全部为 React/DOM 无关的纯函数；事件来自解析/求根，不来自动画采样。

### 2.3 页面、存储与设备

- `App.tsx`：HashRouter；16 个模型、`/cases`、`/cases/:caseId`、`/path`、`/practice`、`/progress`、`/device-check`。
- `DeviceCheckPage.tsx`：已有手工状态 `NOT_TESTED | PASS | FAIL | BLOCKED | N/A`、脱敏 JSON、rAF 探针、WebGL 丢失恢复；导出只有 `schemaVersion: 1`，缺少“模拟 / 真机自述”来源标签和教师题收录声明。
- `scripts/check-static-build.mjs`：只检查文件存在、JS/CSS 非空、Workbox 字样；尚未生成可核验的文件哈希清单，也不检查 manifest 安装字段或外部脚本。
- `tests/pwa/pwa.spec.ts`：2 个测试；没有教师草稿离线保留与旧进度键保留检查。
- 部署状态仍是 `BLOCKED`（无托管授权），真机状态仍是 `NOT_TESTED`；本轮不改变这一事实。

## 3. 本轮改动影响面

新增：

- `src/physics/composite/electricMagneticScreen.ts`：A17-01 跨阶段连续求解器。
- `src/features/problem-authoring/`：教师 schema、白名单注册表、存储、编译、答案绑定、连续阶段证据、A17 模板。
- `src/pages/TeacherProblem{List,Editor,Preview}Page.tsx`：教师工作台路由。
- `src/content/round17Case.ts`：A17-01 内置原创案例数据。
- `src/styles/teacher-authoring.css`：教师页面样式。

有限修改：

- `problemCaseSchema.ts`：新增唯一适配器 ID `a17-electric-magnetic-screen`。
- `buildWholeProblem.ts`：新增 A17 适配器；I07 增加碰板焦耳热答案。
- `problemCases.ts`：接入 A17-01，使内置案例变为 9 个（不改变 16 模型/132 题）。
- `WholeProblemLab.tsx`：允许窄化的结构类型；修复变式参考值陈旧缺陷。
- `App.tsx`：新增三个教师路由与导航项。
- `DeviceCheckPage.tsx`：报告 schema v2、证据来源/目标设备、教师题隐私声明与两项 Round 17 人工检查。
- `scripts/check-static-build.mjs`：生成 `dist/release-manifest.json`、manifest/headers/外部脚本检查。

未修改：16 个物理求解器的核心公式、132 道题、C01–C08 的原始内容与进度键、P01 3D 加载机制、ParamSlider 数学表达式语义。

## 4. 测试基线策略

基线 Vitest 556/556 已实测。最终验收必须重新运行：

```bash
npm run typecheck
npx vitest run
npx playwright test
npm run build
npm run test:pwa
npm run verify:static
```

本基线文档不记录最终数字；最终数字只在 `ROUND17_QA.md` 中根据当次实际输出填写。任何无真机证据的项目保持 `NOT_TESTED`，Playwright/headless 结果只记为 `SIMULATED`。
