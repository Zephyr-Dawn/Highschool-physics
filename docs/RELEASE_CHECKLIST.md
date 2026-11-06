# 发布检查清单

日期：2026-11-06  
适用：`main` 的公开静态 PWA（<https://soft-toffee-cbd208.netlify.app/>）。所有修改经 `codex/<task>` 分支、PR、CI 与代码审查后合并；不直接 push `main`，不强制推送。

## 1. 状态标签

`LOCAL_BASELINE_VERIFIED` / `CI_VERIFIED` / `STAGING_DEPLOYED` / `DEVICE_VERIFIED` / `NATIVE_BUILD_VERIFIED` / `STORE_PUBLISHED`；无证据写 `BLOCKED` 或 `NOT_TESTED`。

当前（2026-11-06）：**正式站点 `LIVE`**（匿名 HTTPS 访问与安全头已复查）；`release-manifest.json` 待下次部署；`DEVICE_VERIFIED` 仅 iPad Safari 基本打开/安装；Android 与完整专项 `NOT_TESTED`；真实双版本升级与原生构建 `BLOCKED`。

## 2. 代码与 CI

- [ ] 从最新 `main` 创建 `codex/<task>` 分支；无直接 push main，无 force push。
- [ ] PR 分支保护已启用，`verify` 检查必需。
- [ ] `npm run typecheck` 通过。
- [ ] `npx vitest run` 610/610（以当次实际为准）。
- [ ] `npx playwright test` 183/183（SIMULATED）。
- [ ] `npm run test:pwa` 3/3。
- [ ] `npm run build` 通过；`postbuild` 生成 schemaVersion 2 `release-manifest.json`（buildId + SHA-256 + secret/私有文件扫描）。
- [ ] `npm run verify:static` 通过。
- [ ] `npm run smoke:headers` 通过（CSP/安全头下首页/A17/教师页）。
- [ ] `npm run simulate:upgrade` 通过（本地 SIMULATED，非线上升级）。
- [ ] 安全扫描无高置信度凭据；没有未授权真题内容。
- [ ] 16 模型、132 题、C01–C08 + A17-01、教师工作台、P01 3D、数学 parser 保留。

## 3. 静态发布

- [ ] 托管平台确认为 Netlify；默认分支 `main`，发布目录 `dist`；不改动站点权限或生产设置。
- [ ] `netlify.toml`/`public/_headers` 与平台等价回退配置正确。
- [ ] HTTPS 证书有效；`sw.js` 为 `no-cache`；manifest/icons 200。
- [ ] `/#/`、`/#/cases`、`/#/cases/case-a17-electric-magnetic-screen`、`/#/teacher/problems`、`/#/device-check`、`/#/path` 直接打开/刷新正常。
- [ ] 16 模型与 lazy chunks 在线可用；PWA 首轮缓存后离线可用。
- [ ] 外部真题来源链接离线不可用时显示“需联网”，不自动缓存未授权资料。
- [ ] release manifest 文件哈希与线上部署记录可对应。

## 4. PWA 更新与数据

- [ ] 用两个受控实际版本验证 `autoUpdate`/刷新流程（未完成两版本线上发布前为 `BLOCKED`）。
- [ ] 更新不调用 `localStorage.clear()`、不清所有缓存。
- [ ] 旧场景键、`emplab.progress.v1`、`emplab.cases.progress.v1`、`emplab.teacher-problems.v1` 保留。
- [ ] 教师草稿不进入构建、precache、日志或诊断。
- [ ] “我的记录 → 完整本地数据备份”可导出/预览/恢复；恢复不调用 `localStorage.clear()`。
- [ ] 变式下标准推导默认折叠，参考值/判题用当前求解器。

## 5. 真实设备

- [ ] iPadOS Safari 清单（`docs/device-test-packages/ipados-safari.md`）逐项记录。
- [ ] Android Chrome 清单（`docs/device-test-packages/android-chrome.md`）逐项记录。
- [ ] 15 分钟暖机记录发热/耗电/崩溃/输入延迟；无精确温度/电池数据时不编造。
- [ ] CDP/Playwright/模拟器只标 `SIMULATED`，不能计入真机 PASS。

## 6. 原生

- [ ] Android SDK/JDK/Android Studio 条件已具备。
- [ ] macOS/Xcode/签名条件已具备（iOS）。
- [ ] `native/capacitor-pilot` 已完成 Capacitor 8.6.0 配置；不得在根 App/PWA 中混入原生目录。
- [ ] 无 JDK 21/Android SDK/Xcode 时保持 `ANDROID_DEBUG_BUILT=BLOCKED`、`IOS_DEV_BUILD=BLOCKED`。
- [ ] WebView 新 origin 的草稿/进度通过 JSON 导入导出迁移。
- [ ] 只有真实 Gradle/Xcode 日志才写 `NATIVE_BUILD_VERIFIED`。

## 7. 回滚

1. 选择上一个已验证的托管 deploy，或发布保留的已验证 `dist`。
2. 不移除用户 localStorage；Service Worker 需按平台流程更新/注销。
3. 重新执行深链、离线、case/teacher/device 检查。
4. Git 回滚使用 `git revert <sha>`，不 force push；保留审计历史。
5. 记录回滚前的 URL、deploy ID、commit SHA 与 release manifest 哈希。
