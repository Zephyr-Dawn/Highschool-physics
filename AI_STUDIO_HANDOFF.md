# AI Studio 交接入口

**先读本文件，再读 [docs/AI_STUDIO_FULL_PROMPT.md](docs/AI_STUDIO_FULL_PROMPT.md)。**

本项目是已经完成物理与教学闭环的 React 19 + TypeScript + Vite PWA，不是空项目，也不是让你重新生成一个相似 App。Google AI Studio 只负责受控的 Web/PWA UI、响应式、可访问性与原生封装可行性验证；物理求解器、题目数据、持久化 schema 和已有测试属于受保护范围。

## 1. 仓库与分支

- GitHub 仓库：`https://github.com/Zephyr-Dawn/Highschool-physics`
- 稳定分支：`main`（只通过审查 PR 合并）
- AI Studio 工作分支：`ai-studio-dev`
- 当前本地 Git 初始化和推送状态见 [docs/GITHUB_HANDOFF_BASELINE.md](docs/GITHUB_HANDOFF_BASELINE.md)。
- **推送守卫**：如果 AI Studio 界面没有明确显示并允许选择 `ai-studio-dev`，不要点击 GitHub Sync/Push。只用 Sandbox 编辑 + `Download app / ZIP`，把变更交给 Codex 在 `ai-studio-dev` 上审查、测试、提交。严禁直接推 `main`，严禁 force push。

> 远端仓库目前由用户控制；在确认它是私有仓库并获得授权前，不应把项目推送上去。

## 2. 三条启动命令

```bash
npm ci
npm run dev
npm run typecheck
```

完整验证：

```bash
npx vitest run
npx playwright test
npm run test:pwa
npm run build
npm run verify:static
```

最近一次本地基线（2026-11-06）：TypeScript 通过；Vitest **593/593**（54 文件）；Playwright **180/180**（SIMULATED）；PWA **3/3**；`verify:static` 通过并生成 `dist/release-manifest.json`。以 [docs/GITHUB_HANDOFF_BASELINE.md](docs/GITHUB_HANDOFF_BASELINE.md) 和 GitHub Actions 的真实结果为准，不把本文件的数字当作未来通过证明。

## 3. 项目摘要

- 16 个完整物理模型：P01–P08、I01–I08。
- 132 道原创基础练习；9 个内置整题案例：C01–C08 + A17-01。
- `WholeProblemLab` 同舞台/统一 `tGlobal`/真实事件；A17-01 跨求解器状态连续交接。
- 1–5 粒子、独立 `launchTime`、共享场修改整场重演；P01 真 WebGL 3D + 2D fallback。
- 全参数滑块 + 安全数学表达式；不得 clamp 合法超滑块输入，不得执行用户代码。
- 教师工作台 `/#/teacher/problems`；私有草稿 `emplab.teacher-problems.v1`、白名单适配器。
- PWA 离线、hash 深链、学习路线、设备诊断、场景 v2 与导入导出。

## 4. 可修改与不可修改

**AI Studio 默认可改**：

- 页面布局、导航、响应式样式、空态/加载态；
- 无障碍名称、焦点、对比度、44px 触控；
- 参数控件与舞台的呈现层（不改语义、不改求解结果）；
- 独立 UI 组件、插图、教师/学生视图的信息层次；
- 只改变视觉的降采样/性能降级。

**绝对不可改**：

- `src/physics/**` 的求解器、事件、能量/碰撞/边界语义；
- 数学表达式 parser/validator 的白名单、单位与有效域；
- `tGlobal`、多粒子 `launchTime`、手动时间历史、状态连续交接；
- 题目答案、数值锚点、来源/权利 flags、持久化 schema 和 keys；
- PWA 缓存/更新策略（不得通过清空 storage 修复 UI）；
- 原有测试断言、物理精度、16 模型路由和 132 题计数；
- 未授权真题的题干、图片、答案。

如果 UI 改动必须碰受保护 API，先停止，单独说明兼容性影响，由 Codex 增加回归后另行审查。

## 5. 数据与版权

- 教师草稿、学生作答、场景进度只在浏览器本地；不得上传、打印或嵌入仓库。
- 不添加 Gemini/云 API 的学生端依赖；离线核心必须继续可用。
- 5 条高考来源仍为 `unverified/link_only`；不得改写成“官方真题”或补写原卷内容。
- 不在代码或页面中写 API key、token、账号、真实学校/学生信息。
- 发现可疑凭据：停止操作并报告，不粘贴秘密。

## 6. 推荐阅读顺序

1. `README.md`
2. 本文件
3. [docs/AI_STUDIO_FULL_PROMPT.md](docs/AI_STUDIO_FULL_PROMPT.md)
4. [docs/AI_STUDIO_SCOPE_AND_CONTRACT.md](docs/AI_STUDIO_SCOPE_AND_CONTRACT.md)
5. [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)
6. [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)
7. [docs/MODEL_COMPLETION_MATRIX.md](docs/MODEL_COMPLETION_MATRIX.md)
8. [docs/PHYSICS_SPEC.md](docs/PHYSICS_SPEC.md)
9. [docs/ROUND17_QA.md](docs/ROUND17_QA.md)
10. [docs/AI_STUDIO_NATIVE_FEASIBILITY.md](docs/AI_STUDIO_NATIVE_FEASIBILITY.md)

## 7. 第一批任务与反馈

第一批只做：

1. 首页四入口（知识路线、整题、自由实验、教师备课）的信息层次；
2. 一个代表性实验页（建议 P07）的舞台/参数/时间控制平板布局；
3. 一个整题案例（建议 C03 或 A17-01）的读题/事件定位/逐问推导同屏体验。

每批输出：改动文件、理由、前后截图（若可用）、`typecheck`/定向测试结果。无法运行全量时明确 `LOCAL_TESTS_NOT_RUN`，不能称为通过。分支无法确认时坚持 `ZIP_FALLBACK`。

## 8. 状态标识

`UI_CHANGED`、`PREVIEW_VERIFIED`、`LOCAL_TESTS_RUN`/`LOCAL_TESTS_NOT_RUN`、`CI_VERIFIED`/`CI_NOT_RUN`、`GITHUB_BRANCH_CONFIRMED`/`ZIP_FALLBACK`、`NATIVE_NOT_BUILT`/`NATIVE_BUILD_VERIFIED`、`DEVICE_NOT_TESTED`/`DEVICE_VERIFIED`。

不得把模拟器、headless Chrome、CDP 触摸称为真实 iPad/Android PASS。
