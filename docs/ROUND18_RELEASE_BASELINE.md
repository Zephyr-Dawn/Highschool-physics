# Round 18 发布基线审计

日期：2026-11-06  
工作区：`H:\programming\EM_Physics_Lab`（Windows 10.0.26100，**非 git 仓库操作**；用户已备份到 GitHub，但本轮不执行 git 命令）

## 1. 实际基线（本轮开工前）

| 项目 | 实测/来源 | 结果 |
|---|---|---|
| `npm run typecheck` | 本轮实跑 | 通过 |
| `npx vitest run` | 本轮实跑 | **593 / 593**，54 文件 |
| `npx playwright test` | 本轮实跑 | **180 / 180**，约 6.5 分钟，headless Chrome = `SIMULATED` |
| `npm run test:pwa` | 本轮实跑 | **3 / 3**；生产构建 + 离线 16 模型/9 案例/教师草稿/旧场景/进度保留 |
| 生产构建 | Round 17 记录，最终构建待本轮末尾复测 | 入口 339.74 kB（gzip 103.33），CSS 140.61 kB（gzip 28.78） |
| PWA 预缓存 | Round 17 记录 | 143 项 / 4298.11 KiB |
| `verify:static` | Round 17 记录 | 71 JS / 1 CSS / 4239.4 KiB / 139 files / sha f3ea43f6b30e |

结论：Round 17 报告中的 593/180/3 与仓库实跑一致；未发现旧测试被删除或跳过。

## 2. 环境与外部能力

| 能力 | 状态 | 证据 |
|---|---|---|
| Node / npm | 可用 | v22.20.0 / 11.7.0 |
| Java / Android SDK | **不可用** | `java` 不在 PATH；仅有 Android Studio 附带 JDK 8（`C:\Program Files\Android\jdk`）；`ANDROID_HOME`/`ANDROID_SDK_ROOT` 为空；无 `adb`/Gradle |
| Android APK 构建 | **BLOCKED** | 缺 JDK 21/SDK/Android 工具链；未生成 APK |
| Xcode / iPadOS | **BLOCKED** | Windows；无 Xcode/CocoaPods/签名 |
| Netlify 授权 | **BLOCKED** | 无账号/站点/令牌；不提供 URL |
| 真实 iPadOS/Android | **NOT_TESTED** | 无真机；CDP/Playwright 不可升级为 PASS |

## 3. 数据与版本审计

| 数据 | 存储键 | 是否进入构建/PWA | 备份 |
|---|---|---|---|
| 16 模型场景 v2 | `emplab.p0x.scene.v2` / `emplab.i0x.scene.v2` | 否 | 新增统一本地备份可导出 |
| 132 题答题/收藏/错题 | `emplab.progress.v1` | 否 | 旧 JSON + 新统一备份 |
| 案例逐问进度 | `emplab.cases.progress.v1` | 否 | 统一备份 |
| 教师私有草稿 | `emplab.teacher-problems.v1` | 否（仅代码字符串） | 单独题包 + 统一备份 |
| 设备自测记录 | `emplab.deviceCheck.*.v1` | 否 | 统一备份 |
| 案例临时备份/返回 | `emplab.case.sceneBackup.v1` / `emplab.case.return.v1` | 否 | 统一备份明确排除 |

- 教师草稿只在用户导出/统一备份时离开浏览器；不进入构建、PWA precache 或诊断报告。
- 公开网站上的教师入口不是服务端认证；同一浏览器用户共享本地存储，换设备/无痕/清站点数据会丢失，必须手动导出/导入。
- `localStorage.clear()` 不作为更新/回滚/修复策略；统一备份恢复按同名键覆盖并支持失败回滚。

## 4. 发布风险与已发现缺口

1. **变式推导误导**：Round 17 已显示“标准推导数值失效”提示，但推导仍默认展开；Round 18 改为默认折叠，需显式“仍查看标准推导（仅参考）”。
2. **跨 origin/原生存储隔离**：Web、PWA 主屏、Capacitor WebView 不自动共享 localStorage；本轮新增统一备份，不宣称自动同步。
3. **真机与部署证据缺失**：无 URL、无真机、无原生 SDK；必须保持 `STAGING_DEPLOYED=BLOCKED`、`DEVICE_VERIFIED=NOT_TESTED`、`NATIVE_BUILD_VERIFIED=BLOCKED`。
4. **静态包私密数据/秘密风险**：本轮强化 `verify:static`：禁止 source map、`.env`、证书/密钥/签名文件；高置信度 secret 扫描；manifest 增加 buildId/appVersion。
5. **CSP 误伤风险**：新增 `_headers` CSP、Permissions-Policy，并用本地静态服务器 + Playwright 验证首页、A17-01、教师列表无控制台错误。
6. **Service Worker 更新**：无 staging 只能做本地 Build A→B 模拟；真实两版本线上升级仍为 `BLOCKED`/`SIMULATED`。

## 5. 本轮发布目标与边界

- Web 主版本保持 HashRouter + PWA；原生 pilot 不改变 `App`、16 模型、132 题、C01–C08/A17-01 或场景 v2。
- 目标托管：Netlify（现有 `netlify.toml`）；真实发布只在用户授权后执行。
- Capacitor pilot：固定在 `native/capacitor-pilot`，Capacitor 8.6.0，`webDir='../../dist'`，不使用 `server.url`；无 Android SDK 时不生成 APK。
- 5 条真题继续 `unverified/link_only`；不复制题干、图片或答案。
- 当前状态：`CODE_READY` 的代码工作可推进；`STAGING_DEPLOYED=BLOCKED`、`DEVICE_VERIFIED=NOT_TESTED`、`NATIVE_BUILD_VERIFIED=BLOCKED`、`STORE_PUBLISHED` 不适用。
