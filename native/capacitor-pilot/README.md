# Capacitor Native Pilot

**状态：`CAPACITOR_CONFIG_READY`；`ANDROID_DEBUG_BUILT = BLOCKED`；`IOS_DEV_BUILD = BLOCKED`。**

这是与 Web/PWA 主线隔离的 Capacitor 技术验证目录，不是应用商店发布工程，也不改变根目录 Vite/PWA 构建。

## 固定版本

- `@capacitor/core` / `@capacitor/cli` / `@capacitor/android`：**8.6.0**（本文件编写时锁定的兼容版本；安装前请按官方环境要求复核）。
- `webDir`：`../../dist`，只打包根仓库已验证的生产构建。
- 不设置 `server.url`。原生包必须验证内置资源离线冷启动，而不是指向远程网站伪装离线。
- 原生 WebView 路径通过 `src/platform/runtimePlatform.ts` 检测；`src/main.tsx` 在 `isNativeShell` 时跳过 Service Worker 注册。浏览器/PWA 路径保持 SW。

## 本机环境结论

- Node v22.20.0 可用。
- `java` 不在 PATH；只发现 Android Studio 附带的 **JDK 8**（`C:\Program Files\Android\jdk`），没有 Android SDK、`adb` 或 Gradle。
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` 为空。
- Windows 无 `xcodebuild`/CocoaPods，无法构建 iPadOS。

因此本轮不能诚实生成或验证 APK/IPA；不得创建空文件冒充安装包。

## 获得 Android 工具链后的步骤

```bash
# 1. 根仓库生成已验证 Web 构建
cd <仓库根目录>
npm ci
npm run typecheck
npx vitest run
npm run build
npm run verify:static

# 2. 安装 Capacitor pilot（仅在此目录）
cd native/capacitor-pilot
npm install
npx cap add android
npx cap sync android

# 3. 在 Android Studio / Gradle 中构建 debug
npx cap open android
# 或使用 Android Studio：Build > Build Bundle(s) / APK(s) > Build APK(s)
```

验收 APK 时必须记录：Gradle/Android Studio 版本、JDK 版本、SDK/API 级别、源码构建标识、设备型号/系统、安装日志；并在真实 Android 上验证 P01 WebGL、P07 轨迹、I05 手动历史、A17-01 教师预览、断网冷启动、数学软键盘、JSON 备份。截图与日志不能由浏览器模拟替代。

## 数据边界

- 原生 WebView 的 origin/localStorage 与网站/PWA 不自动共享；迁移必须通过“我的记录 → 完整本地数据备份”导出/导入。
- 教师草稿不出现在 `dist`、PWA precache 或诊断报告中；原生包也不得预置教师私有内容。
- 不申请位置、相机、录音、通讯录、后台跟踪等与教学无关的权限；本 pilot 不添加任何插件。
- 商店签名、隐私披露、审核和正式分发不属于本轮；`STORE_PUBLISHED` 不适用。

## 状态升级规则

- 只有真实 Gradle/Android Studio 构建产物存在，才可写 `ANDROID_DEBUG_BUILT`。
- 只有 APK 在真实 Android 设备安装并完成专项场景，才可写 `ANDROID_NATIVE_DEVICE_VERIFIED`。
- 只有 Xcode 开发签名版本在真实 iPad 运行，才可写 `IPADOS_DEV_BUILD_VERIFIED`。
- 无设备/无 SDK/无签名的项保持 `BLOCKED` / `NOT_TESTED`。
