# Round 18 HTTPS Staging 发布 Runbook

日期：2026-11-06  
目标平台：Netlify（现有 `netlify.toml`）；没有授权时本文件不产生任何公网 URL。

## 1. 当前状态

| 项目 | 状态 |
|---|---|
| 本地静态构建与自检 | `CODE_READY`（见 `verify:static`） |
| 外部 HTTPS staging | **BLOCKED**：无托管账号/站点授权/令牌 |
| 线上深链/离线/更新 | **NOT_TESTED**，真实升级 `BLOCKED` |
| 本地 Build A→B SW 升级模拟 | `SIMULATED`（`npm run simulate:upgrade`） |
| 真实 iPadOS/Android | **NOT_TESTED** |

**不得在未部署时填写 URL 或写 `STAGING_DEPLOYED`。**

## 2. 发布前本地门禁

```bash
npm ci
npm run typecheck
npx vitest run
npx playwright test
npm run build
npm run verify:static
npm run test:pwa
npm run smoke:headers          # 本地应用 CSP/安全头后打开首页/A17/教师页
```

`verify:static` 生成 `dist/release-manifest.json`（schemaVersion 2）：
- `buildId`：优先读取 `GITHUB_SHA` / `COMMIT_REF` / `BUILD_ID`，本地为 `local`；
- `appVersion` / `appBuildLabel`、每个文件 bytes + SHA-256；
- 禁止 source map、`.env`、密钥/证书/签名文件、高置信度 secret 模式；
- 检查 `manifest.webmanifest`、`sw.js`、`_headers`、CSP/Permissions-Policy、无第三方 script。

本地预览只是 `http://localhost:4174`，不是公网 HTTPS，也不用于 PWA 安装/真机验收。

## 3. 获得授权后的 Netlify 发布

需要用户完成登录或授权；不要把 token 写入仓库、聊天或日志。推荐在平台 UI 连接仓库，或由用户在本机执行登录：

1. 平台选择：Netlify（`netlify.toml` 已配置 `npm run build`、`dist`、`/* → /index.html 200`）。
2. 用户登录/授权站点；Codex 不索要密码、token 或私钥。
3. 使用最小权限发布：优先平台连接仓库自动构建；或用户明确授权后执行 `npx netlify-cli deploy --prod --dir=dist`。
4. 记录：真实 HTTPS URL、deploy ID、`release-manifest.json` 的 `buildId`/SW sha、发布时间。
5. 运行线上冒烟：

```bash
npm run smoke:staging -- https://<用户提供的真实 staging URL>
```

只有命令输出 `SMOKE OK`、手动打开页面无控制台错误、manifest/SW/深链正常，才能把 `STAGING_DEPLOYED` 改为已部署。仍需把真机项保持 `NOT_TESTED`。

## 4. 线上必测清单

- 证书/HTTPS；`/`、`/manifest.webmanifest`、`/sw.js`、`/release-manifest.json` 200；
- `sw.js` `Cache-Control: no-cache`；manifest `standalone`、3 图标、scope；
- CSP、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 实际响应头；
- `/#/`、`/#/cases`、`/#/cases/case-a17-electric-magnetic-screen`、`/#/teacher/problems`、`/#/device-check`、`/#/path` 直接打开/刷新；
- 16 模型、P01 3D lazy chunk、A17 整题、教师编辑器 lazy chunk 加载；
- 首次在线加载完成后断网重载；未联网首次安装不得声称可凭空离线；
- 教师草稿不进入 SW/precache/诊断；5 条真题仍只显示元数据/外链；
- 中国大陆网络链路需单独实测；没有数据时 `NOT_TESTED`。

## 5. 两版本 PWA 升级（真实）

只有同一 staging origin 可用时执行；否则记录 `REAL_STAGING_UPGRADE: BLOCKED`，并使用本地模拟：

1. 构建并发布 Build A（记录 `buildId`/manifest sha）。
2. 在干净浏览器配置中：保存一个 P07 多粒子场景、一个 I05/I07 手动历史、一道题进度、一个内置案例逐问答案、一个教师草稿。
3. 导出统一本地备份或记录 localStorage 前后值。
4. 发布 Build B（另一个已记录构建），等待 `autoUpdate` 激活/刷新。
5. 校验场景、132 题、案例进度、教师草稿、讲解/模式、设备记录仍存在；旧标签页与新标签页均可加载。
6. 断网/恢复/重开/返回深链；检查旧 chunk 404 与 SW 恢复路径。
7. 回滚：平台选择上一个已验证 deploy，或重新发布归档 `dist` + manifest；不调用 `localStorage.clear()`。

本地模拟：

```bash
npm run build
npm run simulate:upgrade
```

输出 `PWA_UPGRADE_SIMULATED_PASS` 只代表“真实 dist 的 A→B SW 更新与数据键保留”模拟，不是线上升级证据。

## 6. 回滚手册

- 记录回滚前 URL、deploy ID、buildId、SW sha。
- Netlify：Deploys → 选择上一已验证生产 deploy → Publish deploy；或用归档 `dist` 重新部署。
- Service Worker 可能仍持有旧缓存：按平台流程等待更新/注销旧 SW 后重载，**不要清空用户数据**。
- 回滚后重跑：深链、manifest/SW、CSP、A17、教师页、统一备份、离线。
- 若回滚版本与本地数据 schema 不兼容，停止写入并让用户先导出备份；不得自动迁移/覆盖教师草稿。

## 7. 网络与目标用户

Netlify 只是技术选择，不保证中国大陆课堂网络质量。发布后在浙江、黑龙江等真实网络分别记录：
首页首字节/首屏可交互、P01 3D chunk、A17 教师预览、离线缓存、失败恢复。
没有真实测量时标 `NOT_TESTED`；不得用本机/无头浏览器结果替代。

## 8. 状态填写

| 字段 | 允许值 |
|---|---|
| `CODE_READY` | 本地门禁全绿 |
| `STAGING_DEPLOYED` | 真实 HTTPS URL + smoke + 线上截图 |
| `PWA_UPGRADE_VERIFIED` | 同 origin Build A→B 真实数据 diff |
| `DEVICE_VERIFIED` | 真机自述 + 设备日志（按平台分开） |
| `NATIVE_BUILD_VERIFIED` | 真实 Gradle/Xcode 构建日志 |
| `STORE_PUBLISHED` | 应用商店条目；本轮不做 |

当前只能填写：`CODE_READY`；其余为 `BLOCKED`/`NOT_TESTED`/`SIMULATED`。
