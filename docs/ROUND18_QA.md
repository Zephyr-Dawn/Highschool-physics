# Round 18 QA 与交付证据

日期：2026-11-06  
环境：Windows 10.0.26100 x64；Node v22.20.0；npm 11.7.0；Playwright 1.64.1；本机 Chrome headless。  
状态口径：代码/本地可验证项与外部授权/真机/原生构建证据严格分开。

## 1. 最终状态矩阵

| 状态 | 结果 | 说明 |
|---|---|---|
| Web `CODE_READY` | **是** | typecheck、607 Vitest、183 Playwright、3 PWA、静态包检查通过 |
| `STAGING_DEPLOYED` | **BLOCKED** | 无托管账号/站点授权/令牌；没有公网 URL |
| `PWA_UPGRADE_VERIFIED` | **本地 SIMULATED 通过；线上 BLOCKED** | `npm run simulate:upgrade` 通过；真实同 origin Build A→B 未执行 |
| `DEVICE_VERIFIED` | **NOT_TESTED** | 无真实 iPadOS Safari/Android Chrome；Playwright 只记 SIMULATED |
| `NATIVE_BUILD_VERIFIED` | **BLOCKED** | 无 Android SDK/现代 JDK/adb/Gradle；Windows 无 Xcode/签名；未生成 APK/IPA |
| `STORE_PUBLISHED` | **不适用** | 本轮不做商店上架 |

## 2. 实际命令与结果

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npx vitest run` | **607 / 607 通过**，57 文件 |
| `npx playwright test` | **183 / 183 通过**，约 6.4 分钟（headless = SIMULATED） |
| `npm run test:pwa` | **3 / 3 通过**；16 模型、9 案例、教师离线、旧进度/场景保留、备份面板离线可用 |
| `npm run build` | 通过；入口 340.35 kB（gzip 103.65），CSS 140.99 kB（gzip 28.84），PWA 144 项 / 4308.13 KiB |
| `npm run verify:static` | 通过：`72 JS, 1 CSS, assets 4249.4 KiB, 140 files, sha 53e1bb251445`；写出 `release-manifest.json`（schemaVersion 2、buildId） |
| `npm run smoke:headers` | 通过：CSP/安全头本地静态服务器验证首页/A17/教师页 |
| `npm run simulate:upgrade` | 通过：`PWA_UPGRADE_SIMULATED_PASS`；Build A→B SW 更新后四个数据键保持 |
| `npm run smoke:staging -- http://127.0.0.1:4174` | 本地 `SMOKE OK`，buildId=local；**不是公网部署** |

## 3. 本轮代码交付

### 3.1 变式推导防误导

- `WholeProblemLab.tsx`：当某问的 `dependsOn` 参数被变式改变时，标准题设推导默认折叠；显式点击“仍查看标准推导（仅参考）”才展示。
- 当前判题与参考值继续使用当前求解器结果；无唯一值返回 `needs_review`。
- 适用于内置 C01–C08/A17-01 和教师自建题的学生预览；教师模式也不把标准推导伪装成当前解答。
- 测试：`tests/tablet/round18-release.spec.ts` 第一项；原有 Round17 变式测试继续通过。

### 3.2 完整本地数据备份与迁移

- `src/features/release/localBackup.ts`：
  - 导出 16 模型场景、132 题进度、案例逐问、教师草稿、讲解/模式、设备自测；
  - 排除临时 `emplab.case.sceneBackup.v1` / `emplab.case.return.v1` / 教师编辑器返回；
  - 单键 1 MiB、总包 4 MiB、1000 键上限；
  - 拒绝损坏 JSON、错误格式/版本、`__proto__`/`prototype`/`constructor`、非法键与教师草稿结构；
  - 应用前预览；写入失败回滚已写入键；不调用 `localStorage.clear()`。
- `LocalBackupPanel` 位于“我的记录”：导出/选择文件/预览/确认恢复；教师题包仍是单题导出路径。
- 测试：`tests/release/localBackup.test.ts`（6）、`tests/tablet/round18-release.spec.ts` 第二项（含场景与无关键保留）。

### 3.3 运行时平台检测与原生 SW 边界

- `src/platform/runtimePlatform.ts`：区分 browser / standalone PWA / Capacitor；保留 `webdriver` 可观察性。
- `src/main.tsx`：原生壳 `isNativeShell` 时跳过 `registerSW`；浏览器/PWA 保持 SW。
- DeviceCheck schema v2 报告新增 `runtime.platform / nativeShell / displayMode`；仍区分 `simulated` 与 `physical-device-self-reported`，不把 UA 当 PASS。
- 测试：`tests/platform/runtimePlatform.test.ts`（2）、`round18-release.spec.ts` 第三项。

### 3.4 静态发布硬化

- `scripts/check-static-build.mjs`：
  - manifest schemaVersion 2，含 `buildId`（GITHUB_SHA/COMMIT_REF/BUILD_ID，本地 `local`）、appVersion/appBuildLabel、文件 SHA-256；
  - 禁止 `.map`、`.env`、证书/密钥/签名文件；高置信度 secret 扫描；
  - 检查 manifest、SW、`_headers`、CSP/Permissions-Policy、无第三方 script。
- `public/_headers`：CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`；`sw.js`/manifest no-cache；assets immutable。
- `scripts/check-release-headers.mjs` + `npm run smoke:headers`：本地应用安全头后打开首页/A17/教师页，无控制台错误。
- `scripts/smoke-staging.mjs`：只接受显式 HTTPS URL（localhost 可例外），检查首页/manifest/SW/release manifest；没有默认 URL。
- 源码/构建高置信度 secret 扫描：未见匹配；`dist` 扫描由 `verify:static` 通过。

### 3.5 本地 Build A→B PWA 升级模拟

- `scripts/simulate-pwa-upgrade.mjs`：真实 `dist` 复制为 Build A/B，B 修改 SW 内容；同一 localhost origin 下验证 SW 更新和 4 个数据键（132 题、案例进度、I05 场景、教师草稿）保持。
- 结果：`PWA_UPGRADE_SIMULATED_PASS`。**不是真实 staging 升级**；线上 `REAL_STAGING_UPGRADE=BLOCKED`。

## 4. 教师/学生公开边界

- `/teacher/problems` 只是当前浏览器的本地私有工作台，不是账号认证后台；公开网站上的入口不等于学生无法打开。
- 教师草稿不进入 `dist`、PWA precache、诊断 JSON 或自动上传；统一备份包含草稿，用户需自行保管文件。
- 5 条真题索引仍 `unverified/link_only`；不复制题干/图片/答案；物理仿真通过不提升来源/权利状态。
- 备份/恢复是人工迁移，不宣称云同步；Web/PWA/Capacitor WebView 数据不自动共享。

## 5. Native Pilot

- `native/capacitor-pilot`：Capacitor 8.6.0 固定版本、`webDir='../../dist'`、无 `server.url`、无额外权限/插件。
- 本机仅 JDK 8，无 Android SDK/adb/Gradle；无 Xcode/CocoaPods。`ANDROID_DEBUG_BUILT=BLOCKED`、`IOS_DEV_BUILD=BLOCKED`。
- 未生成 APK/IPA，未在真实设备安装；不得写 `NATIVE_BUILD_VERIFIED` 或 `DEVICE_VERIFIED`。
- 详见 `docs/ROUND18_NATIVE_FEASIBILITY.md` 和 `native/capacitor-pilot/README.md`。

## 6. 截图

- `docs/screenshots/round18-stale-derivation-guard.png`（变式下标准推导默认折叠、参考值已重算）
- `docs/screenshots/round18-stale-derivation-revealed.png`（显式查看标准推导参考文本）
- `docs/screenshots/round18-backup-panel.png`（完整本地备份 UI）
- 既有 Round17 A17/教师/设备截图仍作为功能回归证据；本轮新增无真机/原生截图，因为未执行。

## 7. 仍未解决

- **STAGING_DEPLOYED=BLOCKED**：需要用户提供 Netlify 登录/站点授权；然后按 `ROUND18_STAGING_RUNBOOK.md` 发布并运行 `smoke:staging`。
- **真实 iPadOS/Android=NOT_TESTED**：安装、软键盘、读屏、WebGL 恢复、发热/续航未执行；见 `ROUND18_DEVICE_ACCEPTANCE.md`。
- **真实 PWA Build A→B=BLOCKED**：当前只有本地 SW 模拟。
- **Android debug APK=BLOCKED**：缺 JDK/SDK/工具链；iPadOS 构建缺 Mac/Xcode/签名。
- **真题**：仍无权威原卷/转载授权；5 条保持 unverified/link_only。
- 教师新建题仍只开放 A17-01/A17-02 白名单适配器；不支持任意求解器拼接。
- C02 仅 A 初速变式、C05 规定速度、C06 固定初速、C08 接触停止等 Round16 限制保持不变。
- 中国大陆网络链路未实测；不得声称 Netlify 在课堂网络稳定可用。
