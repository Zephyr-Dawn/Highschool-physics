# AI Studio 范围与不可破坏契约

日期：2026-11-06  
适用分支：`ai-studio-dev`  
主维护与物理审查：Codex / 用户批准

## 1. 允许的 UI 收口范围

- 首页、模型入口卡片、学习路线、练习/进度、教师工作台、设备检测的**信息架构与视觉层次**。
- 平板/手机横竖屏布局、safe-area、虚拟键盘避让、滚动容器、44 CSS px 触控目标。
- 舞台、参数区、数据区、事件条的排版；只改变呈现，不改变数值与事件。
- 可访问性：焦点可见、表单标签、读屏顺序、颜色对比、非颜色编码的轨迹/状态。
- 独立视觉组件、图标、空态、加载态、错误提示样式。
- 仅视觉的降级：减少装饰采样、低 DPR 渲染**若**不改变求解器帧/事件/物理时间；涉及引擎的改动另案。
- 教师工作台字段分组与来源/核验/权利可读性。
- 学生/教师视图隐藏答案、重点步骤高亮的 UI 交互。

## 2. 不可破坏契约（硬约束）

### 2.1 物理与事件

- `src/physics/**` 求解器、解析/求根、碰撞/挡板/屏幕/边界事件；
- `src/simulations/**` 的场景语义、共享场重演、单粒子重发射；
- `tGlobal`、`localTime`、粒子独立 `launchTime`、同场多粒子的时间轴；
- 感应手动调磁/推拉的真实时间历史、能量账本、焦耳热与冲击损失；
- A17-01 两交接点连续性、P07 狭缝/屏幕真实事件、P08 反求/uncertain 语义；
- 不得用静态 SVG、插值轨迹、演示数据或动画替代真实求解。

### 2.2 数学与单位

- `ParamSlider` 的提交/撤销语义与原值提示；
- `√`、`π`、分数、括号、科学计数法；合法值可超滑块范围且不得 clamp；
- 非法表达式不改变已生效值；解析器白名单，不允许 `eval/new Function`；
- 单位、量纲和物理有效域不能被 UI 绕过。

### 2.3 题目与版权

- 132 道原创题、C01–C08、A17-01 的题干/答案/锚点；
- 5 条真题索引必须保持 `unverified/link_only`，不得添加原卷、图片或答案；
- 教师白名单适配器、答案随参数重算、来源与权利独立 flags；
- 不得把本机教师草稿上传到仓库、日志或分析服务。

### 2.4 存储与 PWA

- `emplab.*` localStorage keys 与 v1/v2 schema；
- 场景、132 题进度、案例进度、教师草稿不得被 UI 改动清空；
- Service Worker 更新策略、PWA 离线、hash 路由深链；
- 不得用 `localStorage.clear()` 或清全部缓存解决单点问题；
- P01 3D 的 lazy load 与 2D/WebGL fallback 保留。

### 2.5 测试

- 不删除、不跳过、不放宽 Vitest/Playwright/PWA 断言；
- 物理锚点、跨求解器交接、多粒子语义、PWA 数据保留必须有测试；
- UI 改动至少运行受影响测试；全量结果以 CI 为准。

## 3. 受保护文件示例

以下修改必须由 Codex/主维护者专项审查，不能混在 UI 批次：

```text
src/physics/**
src/math/**
src/features/cases/solutions/**
src/features/cases/wholeProblem/buildWholeProblem.ts
src/content/problemCaseSchema.ts
src/content/problemCases.ts
src/content/caseSolutions.ts
src/features/problem-authoring/teacherProblemSchema.ts
src/features/problem-authoring/teacherProblemStore.ts
src/app/providers? (若存在)
vite.config.ts (PWA/workbox)
netlify.toml
public/_headers
package.json / package-lock.json
```

（路径以实际仓库为准；`src/features/problem-authoring/` 为正确目录名。）

## 4. 分支与审查

- `main`：稳定，PR + CI `verify` 通过 + 人工审查才能合并。
- `ai-studio-dev`：AI Studio 专用，只接受可回退的小批量修改。
- 每个批次必须能单独 revert；不得把 UI 重构、依赖升级、物理修复混在同一提交。
- 若冲突涉及物理、schema、PWA 或 `package.json`，不得使用“Use my version”覆盖；导出 ZIP，由 Codex 三方合并。
- 目标分支不能确认时使用 `ZIP_FALLBACK`，不得 Sync 到 GitHub。

## 5. 验收基线

保护最低门槛：

- TypeScript 通过；
- Vitest 593/593（54 文件）；
- Playwright 180/180（headless Chrome，SIMULATED）；
- PWA 3/3；
- build/verify:static 通过；
- 16 模型、132 题、9 内置案例、教师工作台、A17-01 连续物理、P01 3D 保留。

最终以 [docs/GITHUB_HANDOFF_BASELINE.md](GITHUB_HANDOFF_BASELINE.md)、GitHub Actions 和用户真机记录为准。

## 6. 原生应用

- PWA 是主产品，必须先解决 HTTPS/真实设备。
- Capacitor 复用现有 Vite `dist` 是优先原生试点；不可改物理核心。
- AI Studio 的 Kotlin/Compose Android Native 模式与 React 项目不是无损转换，仅可隔离原型。
- iPadOS 构建需要 macOS/Xcode/签名；没有这些条件只能 `BLOCKED/NOT_BUILT`。
- WebView 新 origin 的 localStorage 与网站不同，必须用 JSON 导入/导出迁移。
