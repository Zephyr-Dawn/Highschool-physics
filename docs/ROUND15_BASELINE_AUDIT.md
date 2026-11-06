# Round 15 基线审计（2026-11-04）

## 1. 实测基线（Round 14 结束，Round 15 开工前复核）

| 命令 | 实测 |
|---|---|
| `npm run typecheck` | 通过 |
| `npx vitest run` | **521 / 521**（44 文件） |
| `npx playwright test` | **159 / 159** |
| `npm run test:pwa` | **2 / 2** |
| `npm run build` | 通过；入口 334.54 kB（gzip 101.85），PWA 119 项 / 4019.03 KiB |

说明：以上是本轮开工前最近一次完整实跑；Round 15 的新增改动会在最终 QA 中重新全量执行，不能把本表当成 Round 15 的最终结果。

## 2. 模型、路由、存储

- 16 个 COMPLETE：P01–P08、I01–I08；132 道原创题；`/#/path` 与 `/#/path/:pathId/:modelId`。
- 注册表：`src/simulations/registry.ts`；路由与懒加载：`src/app/App.tsx`。
- 场景 v2 key：`emplab.p01.three.scene.v2`、`emplab.p01.planar.scene.v2`、`emplab.p02.scene.v2` … `emplab.p08.scene.v2`、`emplab.i01.params.v1`、`emplab.i02.params.v1`、`emplab.i03.params.v1`、`emplab.i04.params.v1`、`emplab.i05.scene.v2`、`emplab.i06.scene.v2`、`emplab.i07.scene.v2`、`emplab.i08.scene.v2`。
- 学习记录：`emplab.progress.v1`；讲解进度 `emplab.<model>.lesson.v1` / `emplab.path.<model>.lesson.v1`。
- 现有 `?preset=` 深链会写入场景存储；Round 15 的案例实验必须避免覆盖学生个人场景，采用临时会话备份/恢复策略。

## 3. 真题索引与权利状态

- `src/content/examReferences.ts` 共 5 条；全部 `verifiedOnline: false`，无题干、答案、图片。
- 来源为第三方索引 / 需求候选：chujuan、21cnjy、enjoyphysics；**未在线复核，未取得转载授权**。
- Round 15 不修改 `verifiedOnline`；新增 `EXAM_SOURCE_AUDIT.md` 记录逐条未解决项与下一步证据要求。
- 案例系统区分 `original_case` 与 `exam_reference`；原创案例不冒充真题，来源索引只显示元数据/外链。

## 4. 可复用组件与架构

- 物理：16 个纯模块，案例只通过白名单预设注入，不重写求解器。
- UI：`ParamSlider`/表达式解析、`PlaybackBar`、`PanelTabs`、`TeacherDock`、`LessonRunner`、`PracticePanel`、`ReadoutGrid`、`StageToolbar`。
- 练习：`QuestionCard`、`PracticePage` 的 `?model=` 模型筛选、`progressStore`。
- PWA：`vite-plugin-pwa`、`registerType:'autoUpdate'`、Workbox 预缓存；`/#/` HashRouter。
- 诊断：现有浏览器 API 即可实现，无需后端或账号。

## 5. 工作拆分

| 工作流 | 负责范围 | 共享文件 |
|---|---|---|
| Track A 案例 | 案例 schema、6 个原创案例、独立锚点测试、案例页面、场景备份/恢复 | 主 Agent 统一改 `App.tsx`、`HomePage.tsx`、`global.css`、`questions.ts`/`stats`、文档 |
| Track B 交付 | Netlify 静态配置、部署校验脚本、设备诊断页、PWA/更新核对 | 主 Agent 统一改共享路由/样式/文档 |

没有并行子代理被实际调度；按顺序在主工作区执行，避免共享文件冲突。

## 6. 已知限制

- 真实 iPadOS Safari / Android Chrome、软键盘、安全区、字号放大、VoiceOver/TalkBack、真机 60 fps 未验证。
- 未部署公网 HTTPS；本轮只能提供静态部署配置与本地生产预览证据，不能伪造 URL。
- 案例只使用既有 16 个模型能严格表达的范围；多阶段若坐标系/连续性不兼容，必须标注“分阶段独立建模”并重置。
- 真题题干/答案/图片未获授权，不录入；来源链接离线不可用。
