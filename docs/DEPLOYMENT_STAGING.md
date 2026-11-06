# HTTPS 静态部署与 PWA 验收（Round 15）

## 1. 当前状态

**BLOCKED: hosting authorization unavailable**

本仓库已经具备可静态托管的构建、Netlify 配置、缓存头、离线 PWA 与构建自检脚本；但当前执行环境没有可用的托管平台账号、站点令牌或发布授权，因此**没有执行真实外部部署，也没有可报告的公网 URL**。本文不虚构任何 `*.netlify.app` 或其他公网地址。**Round 18 的最新发布步骤、CSP/安全头、`smoke:staging`、两版本升级与回滚以 [ROUND18_STAGING_RUNBOOK.md](ROUND18_STAGING_RUNBOOK.md) 为准。**

已完成、可复现的部分：

- `npm run verify:static`：生产构建 + `dist` 静态产物自检（必需文件、JS/CSS、Service Worker、manifest、图标、`_headers`）。
- `netlify.toml`：`npm run build`、发布 `dist`、HashRouter 深链接回退到 `index.html`。
- `public/_headers`：`sw.js`/manifest 不缓存、`/assets/*` 长缓存、图标 7 天缓存。
- `npm run preview:staging`：本地生产预览（`vite preview`，端口 4174）。

未完成、不得声称完成的部分：

- 真实 HTTPS 站点创建与线上 URL 验证；
- 真实 iPadOS Safari / Android Chrome 的安装、离线与更新验收；
- 真机性能、发热、软键盘与 WebGL 上下文丢失结论。

## 2. 前置条件

- Node.js 22+（`netlify.toml` 已固定 `NODE_VERSION=22`）。
- 可用 `npm ci` 干净安装依赖。
- 一个已授权的静态托管账号（推荐 Netlify；Cloudflare Pages / Vercel 亦可，需等价 SPA 回退与缓存头）。
- 发布令牌只放在平台环境变量或本地未跟踪的环境中，**不得写入仓库**。

## 3. 构建与本地生产预览

```bash
npm ci
npm run typecheck
npm run build
npm run verify:static
npm run preview:staging
```

`verify:static` 必须输出各必需文件 OK，并在缺少 `index.html`、`sw.js`、`manifest.webmanifest`、图标或构建资源时以非零码退出。

本地预览地址为 `http://localhost:4174/`（仅本机验证，不是公网部署，也不能代替 HTTPS 真机验收）。

## 4. Netlify 发布（获得授权后）

配置已就绪，无需新增后端：

1. 登录/授权：`npx netlify-cli login`，或在平台 UI 连接本仓库。
2. 首次关联站点：`npx netlify-cli init`（选择现有仓库，构建命令与发布目录由 `netlify.toml` 提供）。
3. 生产发布：`npx netlify-cli deploy --prod --dir=dist`。
4. 记录平台返回的真实 HTTPS 地址与 deploy ID，写入发布记录；**只有此时**才能对外声称已部署。
5. 平台自动签发 HTTPS 证书；若使用自定义域，等待证书状态为 issued 后再做 PWA 验收。

发布后必须逐项验证：

- `/#/`、`/#/cases`、`/#/cases/case-c01-boundary-exit?stage=...`、`/#/path`、`/#/device-check` 直接打开与刷新均正常；
- 16 个模型路由直接刷新（P01–P08、I01–I08）均由同一外壳加载；
- `manifest.webmanifest` 与图标 200，`sw.js` 为 `no-cache`；
- 首次加载后离线重载仍能进入已缓存的案例与模型（P01 3D 懒加载资源需单独确认已预缓存）；
- 站外真题来源链接离线不可用属于预期，文案不得承诺离线可访问；
- 旧版本的场景、答题、收藏、错题、学习路线与案例进度在更新后仍可读取。

## 5. PWA 安装、离线与更新

- 安装：HTTPS 下 Safari「添加到主屏幕」或 Android Chrome「安装应用」。`display-mode: standalone` 可在 `/#/device-check` 查看。
- 首次离线可用要求先完成一次成功加载并等待 Service Worker 激活；未安装/未缓存时不得承诺离线。
- 更新：`vite-plugin-pwa` 使用 `autoUpdate`。新版本激活后刷新一次即生效；本地数据键独立于构建，不会被清除。
- 更新后核对：`emplab.progress.v1`、各模型场景键（如 `emplab.p04.scene.v2`）、`emplab.cases.progress.v1`、`emplab.deviceCheck.manual.v1`。
- 若线上看到旧资源，先确认 `sw.js` 响应头为 `no-cache`，再在 DevTools/设备设置中注销旧 Service Worker 后重试。

## 6. 回滚

- Netlify：在 Deploys 中选择上一个已验证的生产 deploy，执行 Publish deploy；或用 `npx netlify-cli deploy --prod` 重新发布保留的已验证 `dist`。
- 回滚后重新执行第 4 节深链接与离线检查；不要假设 Service Worker 会立即回退，必要时注销后重载。
- 本地数据无需迁移；回滚不得清理用户 localStorage。

## 7. 已知阻碍与后续证据

| 项目 | 状态 | 所需证据 |
| --- | --- | --- |
| 外部 HTTPS 部署 | BLOCKED | 托管账号/站点授权 + 真实 URL + 部署日志 |
| 线上深链接/离线/更新 | NOT_TESTED | 上述部署完成后的逐项记录与截图 |
| iPadOS Safari 真机 | NOT_TESTED | 真机型号、系统版本、安装/离线/WebGL/软键盘记录 |
| Android Chrome 真机 | NOT_TESTED | 同上 |
| 真机性能/发热 | NOT_TESTED | 15 分钟暖机记录，不得用 headless 数据替代 |

真机验收流程见 `docs/CLASSROOM_DEVICE_QA.md`。任何 CDP、Playwright 或无头浏览器结果只能标记为 `SIMULATED`，不能写成真机通过。

## 8. Round 17 追加（2026-11-05）

- `verify:static` 现在生成 `dist/release-manifest.json`（版本、时间、文件字节与 SHA-256），并检查 manifest 安装字段、`_headers`、Service Worker precache 与 `index.html` 不含第三方脚本。
- 新路由必须纳入深链验收：`/#/teacher/problems`、`/#/teacher/problems/:draftId/edit`、`/#/teacher/problems/:draftId/preview`、`/#/cases/case-a17-electric-magnetic-screen`。
- PWA 更新后继续保留 `emplab.teacher-problems.v1`、模型场景、`emplab.progress.v1`、`emplab.cases.progress.v1`；不得用清空 storage 修复缓存。
- 教师题包只由用户点击导出，不进入 `dist`、precache、日志或设备诊断。
- 当前状态仍为：`STATIC_PACKAGE_READY / HTTPS_DEPLOYMENT_BLOCKED / USER_ACTION_REQUIRED`。没有真实外网 URL；真实 iPad/Android 未测试。
- 完整设备矩阵、回滚和操作步骤见 `docs/ROUND17_DEVICE_RELEASE_MATRIX.md`。
