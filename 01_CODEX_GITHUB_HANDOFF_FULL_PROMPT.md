# EM Physics Lab — Round 18.5 / Codex 完整执行任务书

> 日期：2026-11-06  
> 交付对象：可访问 EM Physics Lab 真实本地仓库、可运行命令及（如已授权）GitHub 的 Codex  
> 本轮主题：**稳定基线冻结 → GitHub 私有仓库 → `ai-studio-dev` 分支 → 自动回归 → Google AI Studio / 原生 App 协作交接**  
> 这是可以直接执行的工程任务，不是让你重新规划物理模型。请按照本文执行并交付证据。

## 0. 任务目标与交付完成定义

用户已经决定采用 **GitHub 为唯一代码真值源，Codex + Google AI Studio 协作** 的路线。当前任务有两个同等重要的目标：

**Track A：把现有项目安全、完整、可复现地提交到 GitHub，创建 `ai-studio-dev` 分支供 Google AI Studio 使用。** 保留既有历史、不泄露敏感数据、保护稳定主分支，并加入自动化测试及清楚的协作协议。

**Track B：准备 Google AI Studio 实际可理解的项目交接材料，同时完成网站部署与 Android/iPadOS 原生封装的风险评估和独立试验入口。** 本轮 Codex 以工程整备和质量闸门为主，不要擅自替 AI Studio 大规模重写 UI。

完成状态须分别列出：`LOCAL_BASELINE_VERIFIED`、`GITHUB_PUSHED`、`AI_STUDIO_BRANCH_READY`、`CI_VERIFIED`、`AI_STUDIO_IMPORT_VERIFIED`、`STAGING_DEPLOYED`、`NATIVE_BUILD_VERIFIED`、`REAL_TABLET_VERIFIED`。没有证据的状态用 `BLOCKED / NOT_TESTED`，不能拿静态构建冒充线上发布。

## 1. 项目现状（来自用户 Round 17 报告，务必在仓库内重新审计）

- **16 个 COMPLETE 物理模型**：P01–P08、I01–I08；**132 道原创基础练习**；**9 个内置整题案例**：C01–C08 + A17-01；独立教师私有题草稿不计入内置数。
- 已有 `WholeProblemLab.tsx` 整题舞台、`buildWholeProblem.ts` 适配层与逐问解析、P07 真束线、P08 反求、I05–I08 感应综合，P01 Three.js/WebGL 真 3D。
- 1–5 粒子在同一场景，共用 `tGlobal`，各自 `launchTime`、独立修改/重发射；共享装置修改重演；碰撞/吸收/屏幕/边界是真实物理事件。
- 所有物理数值输入为旧滑块 + 安全数学表达式（分数、√、π、括号、科学记数法）；输入框不得被滑块范围静默 clamp，不能执行用户代码。
- 电磁感应手动变化和手指推拉使用真实时间历史；教师自建题通过白名单适配器编译，不运行任意输入脚本；私有草稿键 `emplab.teacher-problems.v1`。
- 已有 `netlify.toml`、`public/_headers`、`npm run verify:static`、PWA 预缓存与 `dist/release-manifest.json`。
- 上轮报告基线：`npm run typecheck` PASS；`npx vitest run` **593/593**；`npx playwright test` **180/180**；`npm run test:pwa` **3/3**；`npm run verify:static` PASS；这是报告，不是本轮实测。
- 真实公网 HTTPS **BLOCKED**；iPadOS Safari / Android Chrome **NOT_TESTED**。五条高考真题索引 **unverified/link_only**，没有许可的题干和答案不得提交到公开资源。

**最高优先级：不得删改或绕过以上功能、测试及数据安全规则；不进行不相关的大型架构重构。**

## 2. 第一步：只读审计 + 全量测试基线

先检查真实路径与 Git 工作区，不得凭本文中的可能文件路径盲改：

```bash
pwd
git status --short --branch
git remote -v
git branch -a
git log -5 --oneline
node --version
npm --version
cat package.json
```

若尚未初始化 Git，不要假装上述 Git 命令成功；分别说明再按后文初始化。检查 `README.md`、`AGENT_HANDOFF.md`、`ROUND17_QA.md`、`PHYSICS_SPEC.md`、`MODEL_COMPLETION_MATRIX.md`、`PARAMETER_INPUT_SPEC.md`、`ROUND17_COMPOSITE_PHYSICS_PROOF.md`、`P08_SCOPE_DECISION.md`、`EXAM_SOURCE_AUDIT.md`、`DEPLOYMENT_STAGING.md`、`ROUND17_DEVICE_RELEASE_MATRIX.md` 及其实际位置。

检查 package-lock/yarn.lock/pnpm-lock 的实际包管理器，不可因惯性把已有 pnpm 项目随意改用 npm。以仓库实际锁文件与脚本为准，记录 Node 版本和可重现安装流程。

**必须运行并保留退出码/日志：**

```bash
npm run typecheck
npx vitest run
npx playwright test
npm run test:pwa
npm run build
npm run verify:static
```

若项目实际使用 pnpm 等包管理器，换为仓库等价命令并如实记录。任何失败先查根因：可重试以排除瞬时超时，但不能删除、跳过、削弱旧测试或改写物理预期。把本轮 **实际** 基线写入 `docs/GITHUB_HANDOFF_BASELINE.md`（或按现有目录约定）。本轮若无执行环境，就明确 `NOT_RUN`。

## 3. 安全预检：提交前必须执行

检查 Git 跟踪文件、尚未跟踪的文件、历史提交（如存在）、构建目录、用户数据文件和源代码中的敏感信息：

1. **秘密/凭据**：`.env`、`.env.local`、各类 `*secret*`、API key、GitHub token、Netlify token、Gemini key、Apple 签名证书、Android keystore、账号、cookie、教师真实题库/学生信息。使用可用的本地密钥扫描器或适度匹配脚本；扫描报告不可打印秘密本身。
2. **不提交运行时/构建产物**：`node_modules/`、`dist/`、`build/`（除必须追踪的模板）、`.vite/`、测试截图/视频/trace、大型临时日志、Playwright HTML 报告、`coverage/`、`.DS_Store`、本地私有导出题包、签名材料和真实设备诊断等；但不要误删已版本化的文档截图与确有用处的测试夹具。
3. **许可证与真题**：确保未经核验/授权的高考真题、图片、商业题库内容没有被新加入。现有五条索引必须仍为 `unverified/link_only`。
4. **历史泄密**：如旧提交包含秘密，`.gitignore` 无法清除历史。停止推送并报告需要用户确认的安全清理与凭据轮换方案；禁止未经授权地重写历史或 `git push --force`。
5. **本地数据保护**：Git 备份源代码不等于备份浏览器 localStorage。添加说明/手动导出路径；严禁自动读取并上传教师草稿、学生作答、实验场景。

完善 `.gitignore`、提供 `.env.example` 仅含无效占位符，如确有环境变量需求。新增 `docs/SECURITY_AND_DATA_BOUNDARY.md`：公开资源/私有浏览器数据/真实真题权限分层；任何 GitHub 私有仓库的访问授权都必须最小化。

## 4. GitHub 上传与双分支策略（**不得跳过分支保护**）

目标分支约定：

- `main`：经过验证的稳定源代码，后续 Netlify staging/生产以它或经批准的 release tag 为源。
- `ai-studio-dev`：仅供 Google AI Studio 的 Web UI/UX 收口，以及受控原生试验；每次改动必须能审查差异和回退。
- 可选 `codex/*`、`native-pilot/*`：Codex 修复和 Capacitor 试验，工作树不混用。

**不得新建第二个与现有 Git 历史无关的仓库来代替已存在的仓库；不得擅自移动现有 remote 或覆盖别人的提交。**

如果已配置 GitHub remote：确认仓库所有者、URL、默认分支、可写权限和未推送提交；安全情况下复用它。没有 remote：优先创建 GitHub **私有仓库**（建议名字可用 `em-physics-lab`，实际名称/组织由用户授权决定）；如果 `gh auth status` 不可用、账号未连接、组织未授权或仓库名称有冲突，只完成本地提交并报告 `BLOCKED: GITHUB_AUTH`，不要要用户发送 token 到聊天，也不要自行改为公开仓库。

若是空仓库/无 Git 历史，可按实际环境使用（注意 `git init` 不能覆盖已有 `.git`）：

```bash
# 仅在确认原项目尚无 .git 目录时
# git init -b main
# git add <经过审计允许提交的路径>
# git commit -m "chore: establish verified EM Physics Lab baseline"
# gh repo create <OWNER>/<REPO> --private --source=. --remote=origin --push
```

若仓库已有 Git 历史，应优先保留历史并建立基线提交，不得以 `git init` 覆盖历史。`<OWNER>/<REPO>` 不得从推测中填入。

在 `main` 已成功推送、和远端 HEAD 已核验、无未提交用户变动时：

```bash
# 按实际主分支检查后执行；无差异时才开始
# git switch main
# git pull --ff-only origin main
# git switch -c ai-studio-dev  # 仅当本地/远程同名分支均不存在
# git push -u origin ai-studio-dev
```

如果 `ai-studio-dev` 已存在，应 checkout/fetch 并核对分歧，不能用 `-f` 重建。用命令验证：`git status --short --branch`、`git rev-parse main`、`git rev-parse ai-studio-dev`、`git ls-remote --heads origin main ai-studio-dev`。初始两分支应从同一经验证基线出发。

若 GitHub 允许配置 Ruleset/branch protection，至少阻止直接 push `main`、要求 PR 和必要的 CI 检查；不能设置则以流程约束且明确说明。建议建立一个清晰标注来源的基线 tag（例如 `baseline-pre-ai-studio-2026-11`；已有同名时勿覆盖），记录 SHA、测试日志摘要与 release-manifest SHA。

**非常关键的现实限制**：AI Studio 官方文档支持 GitHub 导入与双向同步，但并未保证所有账号/界面都能显式选择 push 的分支。Codex 必须在交接文档中加入守卫：用户在 AI Studio 点任何“Sync/Push”前必须实际确认目标是 `ai-studio-dev`，否则不得推送；采用 ZIP 导出 + Codex 在 `ai-studio-dev` 提交的安全备用流程。严禁触及 `main`。

## 5. CI：完整可执行的 GitHub Actions 基线

在适当位置新增 `.github/workflows/ci.yml`（遵循实际包管理器、Node 版本、Vite/Playwright 配置）：

- 触发：`pull_request` 指向 `main`，以及 `push` 到 `main`、`ai-studio-dev`；不要触发可能泄露密钥的无关 workflow。
- 安全权限：`permissions: contents: read`；使用官方受信 Actions 并建议固定主版本/commit；不接受未授权第三方 action；不引入 `pull_request_target` 执行不可信 PR 的代码。
- 使用仓库锁文件的冻结依赖安装；缓存安全可复现；固定 Node 主版本并记录。
- 顺序或并行执行：类型检查、全量 Vitest、Playwright（安装必需的浏览器/依赖）、PWA 测试、生产 build、`verify:static`。其中 Playwright 需显式安装浏览器；不可把本地 `dist` 冒充 CI 的。
- 保存失败日志/截图作为 Actions artifact（注意脱敏、有效期和容量）；不要上传教师数据、课题内容私有包。
- 如 CI 环境无法支持某项真实依赖，必须记录 `BLOCKED` 与复现命令，不可注释该测试后宣称全部通过。
- 创建 `docs/CI_RUNBOOK.md`：本地/CI 运行方式、常见 Playwright 环境问题、精确通过状态与 PR 阻断规则。

## 6. 给 Google AI Studio 的仓库内交接文件（本轮主要实物交付）

建议创建以下文件，具体路径按照仓库习惯调整；主入口文件保持容易发现：

- `AI_STUDIO_HANDOFF.md`（仓库根目录）：精炼项目摘要、架构图文字版、两条命令启动、GitHub 分支协作、可改/受保护文件表、QA 基线、如何反馈修复，**明确要求 AI Studio 先读本文件再编辑**。
- 如果本轮随附 `02_GOOGLE_AI_STUDIO_FULL_HANDOFF_PROMPT.md`，请把其**完整内容**放入仓库 `docs/AI_STUDIO_FULL_PROMPT.md`，并在根目录 `AI_STUDIO_HANDOFF.md` 加显眼链接；这样用户导入 GitHub 后即可直接让 AI Studio 阅读，而不依赖聊天历史。不要删节其分支安全约束。
- `docs/AI_STUDIO_SCOPE_AND_CONTRACT.md`：前端 UX 目标，学生端/教师端/16 模型/8+1 整题、PWA/交互/性能及数学解析的不可破坏约束。
- `docs/AI_STUDIO_NATIVE_FEASIBILITY.md`：Web/PWA 与 Android/iPadOS 的三条路径对比，推荐 **Capacitor 复用既有 React 应用**；Google AI Studio 的 Kotlin/Jetpack Compose Native Android 模式仅做**隔离原型**，不是 React 项目的零成本直接封装；iPadOS 需要 Mac + Xcode 的构建验证。
- `docs/GIT_WORKFLOW.md`：分支规范、Studio 同步目标确认法、ZIP fallback、同步差异检查、PR/CI/回滚、如何合并 Codex 修复。
- `docs/RELEASE_CHECKLIST.md`：静态部署、首装/离线/在线切换、PWA 更新版本、数据迁移、iPad/Android 真实 QA、回滚与状态标签。
- 更新现有 `AGENT_HANDOFF.md` / `README.md` 加入口而不重复几百行文档。

### Studio 阅读顺序与保护范围

Studio 先审计 `README.md` → `AI_STUDIO_HANDOFF.md` → 项目 `src` 路由/组件/样式 → 受保护物理核心。其默认**修改白名单**：页面布局、导航、可访问性、响应式样式、参数控件的 **呈现** 层、插图和视觉层的独立 UI 组件；变更任何物理行为必须先由 Codex 专门审查并增加独立测试。

**原则上不可改动**：`src/physics/**` 或等价真实求解器、`src/simulations` 事件语义、参数解析器/校验器、`tGlobal`/多粒子 `launchTime`、感应手势真实时间历史、分阶段状态连续交接、题目数值解答、数据 schema、版权 flags、持久化 keys、现有 Playwright 断言、PWA 缓存行为。若布局调整迫使 API 修改，应先出兼容性说明并单独提交 PR，不可悄悄换算或写死轨迹。

需要 Studio 做到的不是“一键全站换模板”，而是可量化的收口：首屏教学路径、模型卡片、实验舞台与参数区层次、统一的横竖屏布局、学生/教师工作台、整题解析显示、44px 触控范围、数学符号键盘、暗/亮模式（仅已有设计系统支持时）、WebGL fallback 提示、低性能设备的仅视觉降级。

## 7. Android/iPadOS 原生试验：工程准备，不劫持主线

先在 `docs/AI_STUDIO_NATIVE_FEASIBILITY.md` 给出 **PWA vs Capacitor vs Google AI Studio Kotlin/Compose 重写** 的工程成本/复用率/风险矩阵。默认路线：现有 Web/PWA 优先，Android/iPadOS 使用 Capacitor 做受控试点，禁用任何本轮不必要的原生权限/联网遥测/付费 SDK。

如果当前环境 Android SDK / Android Studio 满足当前 Capacitor 文档要求，可在独立 `native-pilot/*` 分支或独立 worktree 进行：安装兼容版本、`webDir` 检查、加入 Android 平台、生成 debug APK，验证 P01 3D、数学键盘、多粒子、整题舞台、场景保存、返回、离线与权限。没有 SDK 就形成可复现命令和 `BLOCKED: ANDROID_SDK`，不得虚构 APK。

iPadOS 需要 macOS + Xcode 等条件；如环境具备可尝试 iOS 平台开发测试，否则标 `BLOCKED: XCODE_OR_SIGNING`。任何 native 封装都不得直接改 `main` 的 Service Worker、hash routing、localStorage schema，必须特别验证不同 origin / WebView 容器的本地存储不会自动与网站同步；提供导入导出迁移说明。

**AI Studio Android Native 模式**可辅助生成 Kotlin/Compose UI 验证样例，但不能不经评估就复制/重写 16 个数学求解器。若要做，隔离保存为原型，且不属于本次 `GITHUB_PUSHED` 完成门槛。

## 8. 发布准备与环境权限

复用现有 `netlify.toml`、`public/_headers`、release-manifest、PWA 测试脚本，检查静态 host 指向正确分支/目录。未经明确授权不得发布生产 URL、购买域名、创建付费云资源、修改 DNS、切换默认分支或暴露教师草稿；如已获独立的测试站点授权才执行 staging 部署并真实验收 HTTPS，否则 `STAGING_DEPLOYED=BLOCKED`，不影响代码与 GitHub 交接的独立完成。

后续向学生分发时，要测试中国大陆实际访问性能和离线首装，无权威试卷授权时不得把 5 条真题索引包装成已经录入真题。

## 9. 完成验收与应交报告

### Track A 必验

- [ ] 工作区安全审计通过，所有被纳入仓库的文件清单可解释；现有历史和用户未提交变更安全保留。
- [ ] `main` 真实 GitHub URL、提交 SHA/分支、是否私有和权限状态有可复核证据；若未授权则提供明确 blockers。
- [ ] `ai-studio-dev` 与经验证 baseline 的初始 SHA 对齐，且 remote refs 可核查。
- [ ] CI 全量检查实际跑通；或逐项 `NOT_RUN`/`BLOCKED`，不可混报。
- [ ] `AI_STUDIO_HANDOFF.md` 和必要子文档真正出现在 Studio 能访问的分支中。
- [ ] Studio 推送分支保护/ZIP fallback 已明确写入。

### Track B 必验

- [ ] PWA 16 模型、132 题、C01–C08 + A17-01、教师自建题、数学输入和多粒子语义没有回归。
- [ ] native 路线有可执行评估；真正编译出来的 APK/IPA 只能以真实构建日志声称完成。
- [ ] 静态发布状态、原生构建状态、真实 iPad/Android 状态分开记录。
- [ ] 自动化用例至少保留报告的 593 Vitest、180 Playwright、3 PWA；数量须以仓库真实版本为准，不能放宽物理精度。

### 汇报格式

按以下结构提交：

1. **实际 Git 状态**：仓库 URL（如已授权产生）、私有/公开、`main` SHA、`ai-studio-dev` SHA、远端分支证明、保留的提交历史、阻碍。
2. **安全审计**：纳入与排除目录、secret scan 摘要、未授权题面检查、需要用户处理的问题（不得打印秘密）。
3. **基线/CI**：每条测试命令、实际通过数、CI run URL（如存在）、错误重试和剩余失败。
4. **AI Studio handoff**：文件路径、可修改/受保护列表、分支同步守卫、推荐首个 UI 试验任务。
5. **发布/native**：HTTPS URL（真实存在才填写）、Android APK 路径（真实成功才填写）、iOS/Xcode 条件、真机状态。
6. **差异统计与回退**：修改文件、提交 SHA、如何撤销实验分支、哪些活动需要用户授权。

## 10. Codex 开始执行的短指令

**这是完整任务书。请先审计仓库和工作区，执行全量测试与安全扫描；之后在获得必要的 GitHub 登录/授权时真实提交私有仓库、创建 `ai-studio-dev` 并配置 CI；完成可供 Google AI Studio 阅读的交接文档与 native 评估。禁止强推、覆盖历史、改物理核心或虚报发布/原生真机结果。不要停留在计划。**

---

### 官方参考（仅供验证当前工具能力，不是强制外部依赖）

- Google AI Studio Build/GitHub 双向同步：<https://ai.google.dev/gemini-api/docs/aistudio-build-mode>
- Capacitor 既有 Web 应用接入：<https://capacitorjs.com/docs/getting-started>
- Capacitor Android/iOS 环境要求：<https://capacitorjs.com/docs/getting-started/environment-setup>
