# 发布检查清单

日期：2026-11-06  
适用：`main` 的静态 PWA；AI Studio 修改必须经 `ai-studio-dev` PR 与 CI 后才能进入发布。

## 1. 状态标签

`LOCAL_BASELINE_VERIFIED` / `GITHUB_PUSHED` / `AI_STUDIO_BRANCH_READY` / `CI_VERIFIED` / `AI_STUDIO_IMPORT_VERIFIED` / `STAGING_DEPLOYED` / `NATIVE_BUILD_VERIFIED` / `REAL_TABLET_VERIFIED`；无证据写 `BLOCKED` 或 `NOT_TESTED`。

当前：`LOCAL_BASELINE_VERIFIED`（见 `GITHUB_HANDOFF_BASELINE.md`），其余待授权/待真实环境。

## 2. 代码与 CI

- [ ] `main` 与 `ai-studio-dev` 同基线 SHA；无直接 push main。
- [ ] PR 分支保护已启用，`verify` 检查必需。
- [ ] `npm run typecheck` 通过。
- [ ] `npx vitest run` 593/593（以当次实际为准）。
- [ ] `npx playwright test` 180/180（SIMULATED）。
- [ ] `npm run test:pwa` 3/3。
- [ ] `npm run build` 通过。
- [ ] `npm run verify:static` 通过并生成 `dist/release-manifest.json`。
- [ ] 安全扫描无高置信度凭据；没有未授权真题内容。
- [ ] 16 模型、132 题、C01–C08 + A17-01、教师工作台、P01 3D、数学 parser 保留。

## 3. 静态发布

- [ ] 明确托管平台、站点权限、默认分支与发布目录；未经授权不发布。
- [ ] `netlify.toml`/`public/_headers` 与平台等价回退配置正确。
- [ ] HTTPS 证书有效；`sw.js` 为 `no-cache`；manifest/icons 200。
- [ ] `/#/`、`/#/cases`、`/#/cases/case-a17-electric-magnetic-screen`、`/#/teacher/problems`、`/#/device-check`、`/#/path` 直接打开/刷新正常。
- [ ] 16 模型与 lazy chunks 在线可用；PWA 首轮缓存后离线可用。
- [ ] 外部真题来源链接离线不可用时显示“需联网”，不自动缓存未授权资料。
- [ ] release manifest 文件哈希与线上部署记录可对应。

## 4. PWA 更新与数据

- [ ] 用两个实际版本验证 `autoUpdate`/刷新流程（未部署前为 `BLOCKED`）。
- [ ] 更新不调用 `localStorage.clear()`、不清所有缓存。
- [ ] 旧场景键、`emplab.progress.v1`、`emplab.cases.progress.v1`、`emplab.teacher-problems.v1` 保留。
- [ ] 教师草稿不进入构建、precache、日志或诊断。

## 5. 真实设备

- [ ] iPadOS Safari 清单（`docs/device-test-packages/ipados-safari-round17.md`）逐项记录。
- [ ] Android Chrome 清单（`docs/device-test-packages/android-chrome-round17.md`）逐项记录。
- [ ] 15 分钟暖机记录发热/耗电/崩溃/输入延迟；无精确温度/电池数据时不编造。
- [ ] CDP/Playwright/模拟器只标 `SIMULATED`，不能计入真机 PASS。

## 6. 原生

- [ ] Android SDK/JDK/Android Studio 条件已具备。
- [ ] macOS/Xcode/签名条件已具备（iOS）。
- [ ] 在独立 `native-pilot/*` 分支执行 Capacitor；不修改 main 的物理/PWA/schema。
- [ ] WebView 新 origin 的草稿/进度通过 JSON 导入导出迁移。
- [ ] 只有真实 Gradle/Xcode 日志才写 `NATIVE_BUILD_VERIFIED`。

## 7. 回滚

1. 选择上一个已验证的托管 deploy，或发布保留的已验证 `dist`。
2. 不移除用户 localStorage；Service Worker 需按平台流程更新/注销。
3. 重新执行深链、离线、case/teacher/device 检查。
4. Git 回滚使用 `git revert <sha>`，不 force push；保留审计历史。
5. 记录回滚前的 URL、deploy ID、commit SHA 与 release manifest 哈希。
