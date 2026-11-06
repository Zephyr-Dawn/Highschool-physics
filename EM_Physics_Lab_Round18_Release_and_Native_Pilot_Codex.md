# EM Physics Lab — Round 18 完整开发任务书

## HTTPS 测试发布、真机课堂验收与移动端应用技术验证

**版本：** Round 18 / 2026-11-05  
**交付性质：** 可直接交给 Codex 在现有仓库实施的技术任务书，不代表这些工作已经完成。  
**项目阶段：** 从功能研发转入 **staging 发布 / Alpha 课堂试用 / Native Pilot**。  
**工作方式：** 两条相互独立的工作线并行开发、主 Agent 统一集成与回归。  
**用户定位：** 黑龙江高考物理学生与授课教师，平板优先，中文界面，物理准确性优先。  

---

## 0. 范围与真实基线

下面是用户提供的 Round 17 Codex 报告，**不是本任务书作者对仓库的独立运行结果**；实施前务必重新运行并记录：

- 16/16 COMPLETE 模型：P01–P08、I01–I08；132 道原创基础练习。
- 内置原创整题案例 9 个：C01–C08 + A17-01；A17-02 为教师感应模板，不要混入内置案例计数。
- `WholeProblemLab` 支持统一舞台、统一时间轴、整题逐问解答；A17-01 已实现电加速→有限磁场→自由漂移→屏幕，交接状态连续。
- 教师私有工作台：`/#/teacher/problems`、`/#/teacher/problems/:draftId/edit`、`/#/teacher/problems/:draftId/preview`，目前只有 A17-01/A17-02 两类可编辑的新增求解适配器；教师题存储 `emplab.teacher-problems.v1`。
- 已有安全数学表达式输入：滑动条保留，分数、根号、π、科学计数等精确提交；教师题 JSON 有大小/深度、公式和 URL 白名单。
- 静态包已有 `netlify.toml`、`public/_headers`、`npm run verify:static`、`dist/release-manifest.json`，PWA 与 Hash 路由、局部离线能力可用。
- 用户报告基线：`npm run typecheck` 通过；**593/593** Vitest、**180/180** Playwright、**3/3** PWA；`npm run verify:static` 通过；生产构建成功。必须实测确认。
- 真实部署 `BLOCKED`（没有用户授权的托管账号）；真实 iPadOS Safari / Android Chrome `NOT_TESTED`。所有既有 CDP/无头测试只能记为 `SIMULATED`。
- 5 条真题索引仍是 `unverified / link_only`；不要展示未经授权的完整原卷题干、原卷图片或所谓官方解答。

**本轮不是新增 P09/I09，不重做 16 套求解器，不直接承诺 App Store / Google Play 上架。** 本轮必须交付：

1. **Track A：可复现、安全的 HTTPS staging 发布流程和真实设备验收闭环**，含权限允许时的实际 staging 发布、线上测试、两版本 PWA 升级验证、备份迁移、问题修复。
2. **Track B：在保留 Web/PWA 主线前提下实现 Android/iPadOS 原生容器的技术验证**，优先采用 Capacitor，先做到能验证的 Android debug 安装包；具备 macOS/Xcode/设备条件时再做 iPadOS 开发测试版本。
3. **Release Gate：变式解答有效性、公开内容边界、教师与学生本地数据**，防止发布后出现错误答案、隐私泄漏或误导性功能宣传。

**完成状态必须分别标注：** `CODE_READY`、`STAGING_DEPLOYED`、`DEVICE_VERIFIED`、`NATIVE_BUILD_VERIFIED`、`STORE_PUBLISHED`。没有证据的项只能标 `BLOCKED` 或 `NOT_TESTED`，不要用一个 COMPLETE 覆盖全部。

---

## 1. 先做仓库与发布风险审计（主 Agent）

阅读现有真实文档和代码，名称不同则定位等价文件：

- `README.md`、`AGENT_HANDOFF.md`、`MODEL_COMPLETION_MATRIX.md`、`QA.md`、`ROUND17_QA.md`、`ROUND17_DEVICE_RELEASE_MATRIX.md`、`DEPLOYMENT_STAGING.md`、`CLASSROOM_DEVICE_QA.md`、`ROUND16_QA.md`。
- `src/app/App.tsx`、`registry.ts`、`WholeProblemLab.tsx`、`buildWholeProblem.ts`、`problemCompiler.ts`、教师题 schema/store、`ParamSlider.tsx`、真实求解器。
- `vite.config.*`、PWA plugin / service worker、`netlify.toml`、`public/_headers`、`scripts/check-static-build.mjs`、`package.json`、Playwright/Vitest 配置。
- 浏览器本地数据命名空间：16 模型场景 v2、132 道题答题进度、9 案例进度、教师草稿与本地设备检测；明确哪些已经可以导出/恢复，哪些还不能。
- 检查 `dist` 是否意外带入 `.env`、API key、私有教案、教师草稿、解锁标记、源映射、未经授权原卷或日志。

在真实仓库创建 `docs/ROUND18_RELEASE_BASELINE.md`，记录源代码状态/提交哈希、构建和测试的真实结果、当前可复现的问题、部署目标、权限边界、Web 与原生接口差异；新增功能前先保存可回滚的 Git 标记或分支。

推荐分支：`feat/round18-staging-qa` 和 `spike/round18-capacitor`，是否使用 worktree 按当前环境决定。并行开发不得同时修改共享 `App.tsx`、Vite、PWA manifest、全局 CSS、题库或现有场景存储。

---

## 2. Track A — HTTPS staging 发布与线上发布验收

### 2.1 发布策略

- 先选择**稳定的 staging URL**，优先复用项目已有 Netlify 配置；不要为测试强制购买域名、开通收费计划或新增后端。
- 若用户可登录 Netlify，允许采用控制台手工上传**已核验的 `dist/` 构建产物**；Codex 可以给出逐步操作清单。若 CI/CLI 凭据经用户显式授权可用，按最小权限创建站点或部署，不擅自购买服务或暴露 token。
- 若托管授权仍不可用，Track A 的实际外部状态必须保留 `BLOCKED`；仍须完成全部本地测试、部署包、可执行脚本、发布检查单和回滚手册。
- Netlify staging 仅是技术选择，不保证中国大陆课堂访问稳定。后续通过至少两条实际中国大陆网络链路测量（可由用户/学生在浙江、黑龙江真实执行）；结果不足时将生产托管迁移列为决策项。
- 初期仅发布用户原创内容和元数据链接，**不复制任何未授权的真题原卷**。

### 2.2 静态发布验证

- `npm ci`（若项目使用 npm lockfile；否则保持项目包管理器）→ `npm run typecheck` → `npx vitest run` → `npx playwright test` → `npm run build` → `npm run verify:static` → `npm run test:pwa`，顺序和脚本可按真实仓库调整。
- 为发布产物提供稳定的构建版本/提交 SHA、asset manifest、文件哈希和回滚包；如能产生 build provenance，禁止嵌入本机路径与私有数据。
- 检查 HTTPS、Content-Type、缓存响应头、Hash 深链、manifest scope、PWA icons、Service Worker 注册、懒加载 Three.js 块、`index.html` 缓存行为以及 HTTP→HTTPS 跳转（如托管支持）。
- `index.html`、SW 更新脚本、哈希化 chunk 使用适合版本更新的缓存策略。严格验证头规则没有使旧 HTML 长期缓存指向已删除的 chunk。
- 检查 CSP、安全头不会误伤合法 Three/WebGL、KaTeX、JSON 导入、Blob 下载以及应用的静态动态导入；不要用允许任意远程 JS 的宽泛配置换取绿色测试。
- 首次在线完成必要资源加载后，才能测试离线；不要声称从未连接网络的全新安装可以凭空离线获取应用。

### 2.3 两版本 PWA 真实升级测试

在同一 staging origin 上形成可追溯的 Build A、Build B（可以用两个已记录的真实提交）：

1. 使用干净浏览器配置加载 Build A，实际操作一项 P07 多粒子场景、一项 I05/I07 手动历史、一道题进度、一个内置案例、一个教师私有草稿。
2. 记录全部存储数据的**前后不变性**，通过导出/已知数据校验而非笼统地说“应该没问题”。
3. 更新服务器为 Build B；验证新版本发现/提示/刷新策略、旧标签页正在使用时行为、缓存更新、懒加载 chunk，保持本地数据。
4. 分别验证浏览器网络在线、网络断开、重新开启、关闭后重开、返回前/后导航、刷新 `/#/cases/...`、`/#/teacher/problems/...`、P01 3D。
5. 验证无 SW、被清缓存、更新中断时有可恢复路径；不要把 `localStorage.clear()` 当修复策略。
6. 测试失败时按已保存的发布包回滚；列出回滚与浏览器本地数据版本不兼容的风险。

如果没有 staging URL，先做可复现的**本地双版本更新模拟**，标记 `SIMULATED`，保留 `REAL_STAGING_UPGRADE: BLOCKED`。

### 2.4 学生与教师端实际发布边界

- 教师题目前只是**同一个用户浏览器中的本地私有草稿**，不是带账号和权限隔离的教师后台。公开网站上的“教师入口”不等于服务端认证；不要声称学生无法打开该页面。
- 教师题不应进入仓库、静态构建或 PWA precache，也不得自动上传。
- 首发用明显的本地数据说明：未登录；换设备、换浏览器、无痕模式、删除站点数据都可能导致进度或草稿不再可用。**提供显式备份与导入/恢复路径**，不得宣称跨设备云同步。
- 由于 PWA 主屏幕、Safari、原生 WebView 可能存在不同数据容器，不能假定它们自动共享相同的本地进度。
- 题源展示仍应区分原创案例、未核验来源、核验身份和转载权；原卷权利与物理仿真正确性相互独立。

---

## 3. Track A — 真实 iPadOS 与 Android 课堂验收

### 3.1 设备验收包升级

复用 `/#/device-check` 与 schema v2，提供简明可操作的**实体设备自测流程**和本地 JSON 脱敏导出。使用真实浏览器 user agent、视口、DPR、真实触控和用户手动确认（自报）记录，不允许仅根据 UA 就标记 PASS。

每一项状态必须是 `PASS / FAIL / BLOCKED / NOT_TESTED`，标明 `source=physical-device-self-reported` 或 `source=simulated`。自动化合成触控不可提升为真实设备通过。

**iPadOS Safari 必测：**
- 普通浏览器与“添加到主屏幕”两种访问方式；PWA install/offline/更新、返回深链。
- P01 3D 空白旋转、双指捏合、手柄拖动、第二指取消、前后台切换/WebGL context loss/恢复。
- P02/P03/P04/P05/P06/P07/P08 的 1–5 粒子，共同时钟和单粒子编辑语义。
- `√3/2`、`π`、`1/3`、`5 T` 超滑块合法输入，软键盘 Enter/Done、选区、复制粘贴、中文输入法、物理单位与错误回退。
- I02/I05/I06/I07/I08 手动拖拽、放手速度归零/外力模式差异，I01/I04 手动场变 ramp 的真实时间语义。
- 教师题新建→预览→导出→在另一浏览器/设备导入（如果该功能实际存在），不会影响之前存档。
- 横屏、竖屏、刘海/安全区、文字放大、VoiceOver 操作、页面滚动和舞台 touch-action 冲突。
- 15 分钟连续运行的实际发热/耗电主观记录（无需夸大成实验室级功率测量），后台回来是否仍保持正确状态。

**Android Chrome 必测：**
- 同等 PWA 访问/安装/离线与更新，以及系统返回手势、地址栏动态高度、软键盘重新布局、TalkBack、真实多点触控。
- 如发布原生 Android 测试包，与 Chrome PWA 的离线、WebGL、存档导出分别验证并对照；不要自动假设 WebView 与 Chrome 行为一致。

设备不可得时保留 `NOT_TESTED`，但提供最短真实自测说明和一键导出诊断结果。能在本轮由用户/教师自己测试的项目，不必依赖 Codex 所在机器持有设备。

### 3.2 性能、负载与网络

- 在真实设备记录适用的帧间隔代理指标、长任务/交互延迟、自报设备型号和系统版本、显存失败/回退、JS heap（浏览器支持时）、从打开到 P01 3D 首次可交互的主观时间。
- 指标要同时注明是否 VSync 锁帧、是否移动后台、是否省电模式；`requestAnimationFrame` 间隔不能直接当 GPU FPS 或设备刷新率。
- 首次弱网加载：检查 4 MB 左右缓存资源、P01 大型懒加载 chunk、404、SW 版本、真实失败恢复。不要为了缩包无依据地改变物理算法和精度。
- 建立一张 `浙江/黑龙江/其他` 实际接入网络的可见性能记录表；用户未提供真实数据时标 `NOT_TESTED`，不要虚构国内可访问性。

### 3.3 修复策略

只修**有真实复现证据**的卡顿、失焦、触摸冲突、PWA 更新或设备兼容问题。采用先复现→失败测试→最小修复→物理回归→真机复核，禁止整体重写 UI 或对求解器降精度。

---

## 4. Track B — 原生安装包技术验证（不是商店上架）

### 4.1 为什么先验证而不立即重写

用户已有成熟 React/TypeScript/PWA、SVG/WebGL 与物理引擎。建议首先保留 Web/PWA 为主线，**在独立分支做 Capacitor native shell 技术验证**。本轮仅证明是否能无损复用现有前端与离线实验体验，不能靠“创建 ios/android 文件夹”就标 `NATIVE_COMPLETE`。

在项目约束表里比较：

| 路线 | 优点 | 代价/限制 | 本轮决策 |
| --- | --- | --- | --- |
| 现有 HTTPS Web | 链接即可打开，更新快 | 需要网络首次加载与浏览器兼容 | 主发布入口 |
| 现有 PWA 主屏幕 | 接近 App 的安装体验，最大复用 | 平台细节、离线和存储需实测 | 首选学生端 |
| Capacitor Android/iPadOS | 可以制作原生安装包、调用可控原生能力 | 新构建链、签名、WebView QA、应用商店维护 | 可并行 PoC |
| Flutter/React Native 重写 | 完全原生化选项 | 大量重复工程且物理引擎迁移风险高 | 本轮不做 |

### 4.2 环境与依赖审计

- 检查当前 Node、npm、React/Vite、Three、Capacitor 最新可兼容主版本与 Android Studio/Android SDK；避免盲目用 `latest` 破坏兼容锁文件。
- Android 构建若可用，应给出**可复现的 debug APK**，仅用于授权测试，不签发正式商店发布包；没有 Android SDK 则提供准确的准备清单和可执行配置，不伪造 APK 文件。
- iOS/iPadOS 构建需要可用 Mac、Xcode 与相应开发签名/设备条件。若缺失，保留 `IOS_NATIVE_BUILD: BLOCKED`，但可完成依赖和静态配置审计。
- 不强制申请开发者账号，不请求共享 Apple ID 密码、签名私钥或托管 token；正式分发条件单独列出。

### 4.3 原生壳工程边界

推荐采用项目现有构建输出 `webDir: 'dist'`，在**受控构建产物本地打包**，而不是把 `server.url` 指向远程网站伪装离线。保留 Hash router；禁止将教师草稿预打包进原生资产。

- 原生环境检测必须明确且有测试；Browser/PWA 路径继续保持 Service Worker，Capacitor WebView 路径则按支持情况选择禁用或跳过 SW；**不要假设 native WebView 与网页 SW 缓存机制相同**。
- 只申请必要的系统权限；不添加位置、相机、录音、通讯录或后台跟踪权限。
- 处理 Android 系统返回键、软键盘升起/收起、安全区域、状态栏、横竖屏、Deep Link（本轮仅需站内导航）、外链跳系统浏览器。
- 本地数据容器与原网站不共享，明确告诉用户需要手动备份迁移；不能宣称 Web/PWA 与原生自动同步。
- 题目 JSON 导入/导出、Blob 下载、文件选择/分享在原生 WebView 中要实际验证；必要时使用经过审核的最小 Capacitor 插件适配，但不得把私有题目上传到服务器。
- 兼容 P01 WebGL 真 3D、SVG 触摸、KaTeX、公式输入、1–5 粒子、I01–I08 手动历史；WebGL 失败时仍有可用的 2D fallback。
- 测试安装包内断网冷启动（在打包后没有首次远程访问的情况下）是否可打开核心实验和原创案例；原生打包资源若确实内置，不能继续用“需要先网站联网缓存”解释原生离线失败。

### 4.4 Native Pilot 明确验收

- 有 SDK 时，成功构建并在**真实 Android 设备**安装运行一个 debug 包，打开 P01、P07、I05、A17-01，验证触控、数学输入、离线、预览与 JSON 备份；记录设备型号、OS、日志和源码提交 SHA。
- 有 Xcode/真实 iPad 时，构建 iPadOS 开发版并在设备运行；若只有模拟器，记 `IOS_SIMULATOR_PASS`，不得记 `IPADOS_DEVICE_VERIFIED`。
- 缺设备时仅能声明 `NATIVE_PROJECT_READY` 或 `DEBUG_APK_BUILT`，不能写设备已通过。
- 明确 App Store / Play 商店上架 **不属于本轮验收**；任何发布需另行考虑签名、商店审查、隐私披露、合法内容与分发渠道。

---

## 5. Release Gate — 教师题目、变式解析与用户数据安全

### 5.1 动态参数下的解题解析可信度

Round 17 报告明确：教师推导中部分数值仍写在标准题设文本里；变式时系统已提示“原值失效”，并刷新可计算参考值。发布前需要进一步避免学生在变式条件下误读固定推导为当前答案。

至少实现以下**两种互补机制之一并有测试**：

1. 可复用的安全参数化模板，教师从白名单物理观察量、符号、算式构成逐问推导，运行时用当前求解器的真实结果填入数值，且与答案判定使用相同快照；或
2. 对尚未参数化的整段推导强制显示 `仅适用于标准题设`，变式时默认折叠/禁止当作当前解答展示，只给当前有效的物理量、计算结果与明确重解入口。

优先按既有结构实现可扩展模板，不用 `eval`、`Function`、动态远程组件或任意脚本。禁止仅靠字符串全局替换把公式冒充精确解析；注意符号、方向、单位、小数容差与不唯一解状态（P08 `uncertain` 等）。

### 5.2 本地数据备份/迁移

- 确认所有可恢复数据分类：教师草稿、物理场景、案例进度、学习路线/练习进度、偏好设置；已有导出功能应被复用，不应重造不兼容 schema。
- 至少提供一条教师自建题的稳健备份/恢复路径和用于迁移测试的快照；若实现统一备份包，要按大小/深度限额、类型/版本校验，禁止任意对象原型污染或越权合并。
- 导入失败必须保持原始数据不变；导入前预览和冲突策略、覆盖确认、只在用户点击后导出，禁止自动上传。
- 测试不同 origin（staging→正式域名）、Safari→主屏幕 PWA、PWA→Capacitor 的数据隔离差异；**迁移必须显式导出/导入**，不能假称自动同步。
- 若师生共用平板，说明本地共享数据风险。没有账户系统，不应声称用户之间的数据严格隔离。

### 5.3 内容与授权门槛

- 保留 5 条未核验真题 `unverified / link_only`；不得将它们导入内置整题题库并称真实高考真题。
- 上传教师题是本地私有编辑，不意味着受版权保护内容有公开分发权；发布网站也不能未经授权缓存教师导入的原卷图片。
- 公众页面清楚标注 `原创练习`、`原创整题` 和 `外部真题来源链接`，不会把“高考风格”写成“高考原题”。
- 如需要图片附件和更多解析模板，单独立项；不在本轮为此引入不透明的大体积 localStorage base64 或云后端。

---

## 6. 工程结构与预期文件改动

按仓库真实组织调整，不要强制重构旧文件。建议最小结构：

```text
src/
  platform/
    runtimePlatform.ts            # browser / pwa / capacitor detection
    storagePortability.ts         # tested backup/import contracts, if needed
  features/release/
    BuildVersionNotice.tsx        # optional safe update prompt / errors
  features/cases/
    liveDerivation.ts             # safe values/templates or answer stale guard
  pages/
    DeviceCheckPage.tsx           # extend actual checklist rather than fork
scripts/
  check-static-build.mjs          # existing; strengthen if needed
  verify-deploy-ready.mjs         # optional deterministic static policy checks
  smoke-staging.mjs               # accepts explicit HTTPS URL, no invented value
native/ or apps/native-shell/     # isolated Capacitor pilot; avoid polluting root

docs/
  ROUND18_RELEASE_BASELINE.md
  ROUND18_STAGING_RUNBOOK.md
  ROUND18_DEVICE_ACCEPTANCE.md
  ROUND18_NATIVE_FEASIBILITY.md
  ROUND18_QA.md
```

**必须保持测试职责分离：**

- 纯物理准确性与新的参数化答案渲染（Vitest）。
- 页面导航、教学工作台、触控及错误反馈（Playwright，标 simulated）。
- PWA 首装/离线/版本升级（浏览器自动化 + 真实线上证据）。
- Capacitor 配置与构建/安装（原生工具与真实设备日志，不能用浏览器测试代替）。

---

## 7. TDD 分阶段实施计划与门槛

### Task 1 — 审计和安全发布包

**先写失败测试：** `releaseArtifacts.spec` 检测 build manifest 跟文件内容一致；禁止 secrets、个人数据、教师题样本泄漏；验证当前首页、case、teacher、16 模型路由资源。

- [ ] 核对工作树、依赖锁、原有 593/180/3 测试基线并记录真实结果。
- [ ] 给当前构建分配版本标识、产物哈希和可回滚归档。
- [ ] 扩充静态包与 PWA 清单检查，确定是否支持当前 Netlify headers。
- [ ] 验证构建不包含未获授权的真题全文或私有教师内容。
- [ ] 运行本任务新增测试并提交独立变更。

### Task 2 — 可执行 staging 发布与站点冒烟检查

**先写失败测试：** staging smoke 针对 URL：TLS、首页、案例路由、完整模型加载、manifest、SW 注册、离线边界、合法安全头。

- [ ] 完成无需任何 token 就能运行的本地构建与一键检查。
- [ ] 发布平台经用户选择/授权后才执行实际部署；没有授权则创建清晰的人手操作清单。
- [ ] 若真实部署成功，记录不包含口令的 URL、时间、commit、build manifest SHA，运行真实网址冒烟测试。
- [ ] 若未成功，报告唯一明确 blocker，保留 `STAGING_DEPLOYED=BLOCKED`。
- [ ] 写入 `ROUND18_STAGING_RUNBOOK.md` 并演练回滚。

### Task 3 — 两版本 SW 与数据保留

**先写失败测试：** Build A 含 16 模型 v2 场景、练习、整题进度、教师草稿 → Build B 升级后这些记录不丢失；旧 chunk 更新/离线失败可恢复。

- [ ] 构造两个可复现版本，并运行当前 origin 的自动化更新测试。
- [ ] 如有 staging 域名，执行真实 HTTPS Build A→B；无域名标模拟。
- [ ] 修正已复现的旧 SW/页面白屏或缓存不一致问题，不清空整体 localStorage。
- [ ] 确认第一次离线安装先完成在线资源缓存。
- [ ] 记录升级、失败恢复和回滚证据。

### Task 4 — 设备 QA 与关键触控问题

**先写失败测试：** 设备报告默认 NOT_TESTED，CDP 不可升级成真实 PASS，隐私字段过滤；前后台/WebGL/多指/键盘回归。

- [ ] 从 `/#/device-check` 导出包含版本与隐私自检的报告。
- [ ] 提供每类设备可在浏览器完成的步骤，能加载记录真实人工结果。
- [ ] 真实设备可用时执行 iPadOS/Android 各自测试；缺设备如实标记。
- [ ] 仅修复实际复现的 P01、多粒子、拖线框、数学表达式问题。
- [ ] 记录真实网络接入情况与实测/未知的区别。

### Task 5 — 教师推导变式防误导与迁移

**先写失败测试：** 变式后不得把标准题设数值推导作为当前结果；导出/导入错误不改变既有教师草稿；跨 origin 不宣称自动共享。

- [ ] 对每一类现有整题逐问输出当前值 / 标准值 / 仅适用于原题设状态。
- [ ] 实现或加固安全参数化模板或标准推导失效遮罩。
- [ ] 保留安全数学表达式、单位/符号校验与多结果状态。
- [ ] 优先复用教师题 JSON 导入导出，并形成迁移操作说明。
- [ ] 写回归证明原题解读与变式数值一致或标明不可直接套用。

### Task 6 — Capacitor Android Pilot 与 iPadOS 条件验证

**先写失败测试：** 平台判断/原生配置不破坏 Web；native bundle 不依赖首次远程 URL；外链与回退受控；教师 JSON 不预打包。

- [ ] 独立分支安装兼容 Capacitor 核心并记录许可证、最低平台与环境需求。
- [ ] 配置 `webDir=dist` 并审计 native SW 行为、Hash 路由、安全权限与文件导出。
- [ ] 有 Android 工具链则构建 debug APK；有真机才标安装和物理交互通过。
- [ ] 有 Mac/Xcode 则搭建 iOS 工程；有真实 iPad 才标 iPadOS 设备通过。
- [ ] 验证 P01 WebGL、P07 轨迹、I05 手动时序、A17-01 整题/教师预览、断网冷启动和返回操作。
- [ ] 编写 `ROUND18_NATIVE_FEASIBILITY.md` 对比 PWA 与 Native 实测差异、未解风险和是否建议继续产品化。

### Task 7 — 全量回归、截图、发布决策

- [ ] 运行：`npm run typecheck`、`npx vitest run`、`npx playwright test`、`npm run build`、`npm run test:pwa`、`npm run verify:static`；当前基线 593/180/3 需要仓库实测确认。
- [ ] 实测 staging 允许时额外执行线上 smoke；真机/原生工具存在时完成对应专项。
- [ ] 截图：发布首页/16 模型、P01 3D、整题 A17-01、教师题/变式警示、离线/版本提示、DeviceCheck、Native POC（如确实构建运行）。
- [ ] 将物理准确性、浏览器模拟、真实网站、真实设备、原生包五类证据分别记录。
- [ ] 更新 `README.md`、`QA.md`、`DECISIONS.md`、`AGENT_HANDOFF.md`、`ROUND18_*` 文档，不删减已有测试，不用忽略错误换取绿色。

---

## 8. 最终验收矩阵

| 层级 | 可验收条件 | 证据 | 无外部权限时状态 |
| --- | --- | --- | --- |
| Web `CODE_READY` | 16 模型/132 题/9 内置案例、教师功能、回归全绿 | 本地日志与源码提交 | 可以完成 |
| Staging `STAGING_DEPLOYED` | 真正的 HTTPS URL；首页/Hash 深链、SW、P01 WebGL、原创整题可加载 | HTTPS 实测 URL + 截图 + Build SHA | `BLOCKED` |
| PWA `UPGRADE_VERIFIED` | 同一 origin Build A→B，核心数据无丢失、旧缓存恢复 | 实际升级脚本与存储 diff | 本地可模拟，线上 BLOCKED |
| 设备 `IPAD_DEVICE_VERIFIED` | 真实 iPad Safari PWA 完整 QA、软键盘/WebGL/手势/离线 | 物理设备日志及人工核对 | `NOT_TESTED` |
| 设备 `ANDROID_DEVICE_VERIFIED` | 真实 Android Chrome PWA 完整 QA | 同上 | `NOT_TESTED` |
| 原生 `ANDROID_DEBUG_BUILT` | Android debug 安装包可从源码复现 | Gradle/Android Studio 构建输出 | 取决于 SDK |
| 原生 `ANDROID_NATIVE_DEVICE_VERIFIED` | APK 在真实 Android 上运行且专项场景通过 | 设备日志、截图 | `NOT_TESTED` |
| 原生 `IPADOS_DEV_BUILD_VERIFIED` | 真实签名的 iPadOS 开发版本在真机运行 | Xcode/设备证据 | 取决于 Mac/Xcode/签名 |
| `STORE_PUBLISHED` | 商店实际审核通过并发布 | 商店条目 | **本轮不做** |

**不允许把 `CODE_READY`、`NATIVE_PROJECT_READY` 或浏览器模拟等同于 `PUBLIC_RELEASE_READY`。**

### 8.1 推荐的本轮 Go / No-Go 标准

- **允许发布小范围测试 URL（Alpha）：** 静态 HTTPS 正常、原创与版权边界清楚、导入安全、备份说明、至少浏览器自动化和实际线上 smoke 通过。真机项仍应清楚声明未验证。
- **允许邀请学生实际课堂使用（Beta）：** 至少用户自己的目标 iPad/Android 设备真实触控、输入、离线恢复通过；没有严重数据丢失/崩溃/物理错误；主要网络接入可靠。
- **允许宣称正式成熟产品：** 多设备课堂实测、升级回滚、持续故障反馈流程、版权许可/原创建模边界和教师数据风险说明均已妥善处理。

---

## 9. Codex 最终交付报告模板

### A. 项目状态（基于仓库而非旧报告）
- Git commit / branch、16 模型、基础题数、内置案例数、教师草稿能力。
- 原物理求解器是否改动，为什么；旧回归是否全部通过。
- 发布产物大小、离线缓存大小、Three 懒加载策略。

### B. HTTPS 发布
- 是否有用户授权？`STAGING_DEPLOYED` 具体状态及真实 URL（仅在已部署且访问验证成功时填写）。
- `npm run verify:static`、线上首装/离线、Build A→B 更新、缓存/Hash 深链和回滚实证。
- 中国大陆目标网络可访问性真实数据或 `NOT_TESTED`。

### C. 设备验收
- 分别列 iPadOS Safari 和 Android Chrome 的真实设备 / SIMULATED 项；禁止汇总成“平板测试通过”。
- 设备型号、系统/浏览器、手势、软键盘、WebGL、PWA、15 分钟热稳定记录。
- 诊断 JSON 脱敏/人工结果来源及复现问题。

### D. Native Pilot
- Capacitor 兼容版本、依赖、SDK、工作树与 commit。
- Android 包是否实际可安装、iPadOS 是否实际编译、真正离线和 WebGL/手势行为。
- 是否推荐继续做原生：依据客观设备差异，不以包装成功充当产品完成。

### E. 内容、数据、QA
- 变式推导是否能够动态生成或是否已经安全隐藏失效数字。
- 教师草稿备份/恢复、原站数据隔离、跨设备迁移的真实能力。
- 真实 Vitest / Playwright / PWA / typecheck / build / static 结果，失败重跑记录和未解决项。
- 5 条真题索引继续 `unverified/link_only`，未经许可未复制内容。

---

## 10. 直接发送给 Codex 的启动提示词（也可单独发送）

请完整阅读项目根目录的 `EM_Physics_Lab_Round18_Release_and_Native_Pilot_Codex.md`，作为 Round 18 的完整技术任务书。本轮不新增物理模型，目标是 **把已经实现的 16 模型 + 132 题 + 9 内置整题 + 教师工作台推到真实学生可试用的发布阶段，并开始原生应用技术验证**。

两项必须并行：Track A 完成 HTTPS staging 准备/真实发布（仅在获得用户托管授权时）、真实 PWA 更新/离线与 iPad/Android 设备 QA；Track B 在独立工作树验证 Capacitor Android debug 应用，具备 Mac/Xcode 时验证 iPadOS 开发包，保留 PWA 为主产品。

重点补好教师题变式条件下推导数值失效提示/安全模板、本地数据备份/迁移、Service Worker 双版本升级及 P01 3D 真机触控风险。严格区分 `CODE_READY / STAGING_DEPLOYED / DEVICE_VERIFIED / NATIVE_BUILD_VERIFIED`，无权限和硬件时只填 `BLOCKED / NOT_TESTED`，不要伪造链接、测试报告或安装包。

首先审计真实仓库并运行基线测试，随后按先失败测试、再最小实现、再回归的顺序推进。保留全部物理准确性、多粒子实时交互、安全数学输入、教师草稿隐私与离线能力。最终交付源码、部署操作/真实 URL（若存在）、应用可复现构建证据、实际截图和每个平台剩余风险。请直接开始实施，不只输出计划。

---

## 11. 参考技术文档（需按实际依赖版本复核）

- Netlify deploy: https://docs.netlify.com/deploy/create-deploys/
- Apple iPad Safari Web App: https://support.apple.com/guide/ipad/bookmark-a-website-ipadc602b75b/ipados
- Capacitor getting started and native platforms: https://capacitorjs.com/docs/
- Capacitor development environment: https://capacitorjs.com/docs/getting-started/environment-setup
- MDN Service Worker secure contexts: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

**结束语：** 本任务书不要求再次用 Codex 制造大量新模型，而是把已建成的物理教学系统转化为真正能够在平板上安全、稳定地试用并可维护升级的产品。真实外部发布和设备验证必须以实际操作证据为准。
