# 原生 App 路线决策

日期：2026-11-06  
当前状态：`CAPACITOR_CONFIG_READY`；`NATIVE_BUILD_VERIFIED = BLOCKED`。`native/capacitor-pilot` 已加入隔离配置（8.6.0、`webDir='../../dist'`、无 `server.url`），但本机无 Android SDK/现代 JDK/Xcode，未生成 APK/IPA。

## 决策

1. **主产品继续 Web/PWA**：先完成 HTTPS 发布与真实 iPad/Android 浏览器验收。
2. **未来原生优先 Capacitor**：复用现有 React/Vite `dist`，在独立 `native-pilot/*` 分支验证 Android WebView/iOS WKWebView、WebGL、手势、软键盘、存储迁移与文件导入导出。
3. 不使用 Flutter/React Native 或 Kotlin/Compose 重写 16 个物理求解器，也不把它们作为 iPadOS 构建路径。

## 本机证据

- `java`、`adb`、`gradle` 未找到；`ANDROID_HOME`/`ANDROID_SDK_ROOT` 为空 → `BLOCKED: ANDROID_SDK`。
- Windows 无 `xcodebuild`/CocoaPods → `BLOCKED: XCODE_OR_SIGNING`。
- 未安装 Capacitor，未生成 `android/`/`ios/`，未生成 APK/IPA。
- 详细矩阵、命令与验证项见 [NATIVE_FEASIBILITY.md](NATIVE_FEASIBILITY.md)。

## 不得跨越的红线

- 不得在原生封装中重写/近似物理引擎；
- 不得把 WebView 新 origin 当作自动继承网站 localStorage；
- 不得为原生试验改动 `main` 的 Service Worker、hash 路由、数据 schema；
- 没有真实构建日志不写 `NATIVE_BUILD_VERIFIED`；
- 没有真机不写 `DEVICE_VERIFIED`。


## 原生 Pilot 现状

- 已增加 `src/platform/runtimePlatform.ts`：browser/PWA/Capacitor 检测；原生壳跳过 SW。
- 已增加 `native/capacitor-pilot`：固定 Capacitor 8.6.0，不污染根 `package.json`/PWA；教师草稿不进入 native assets。
- 本机 JDK 仅 8、无 Android SDK/adb/Gradle；Windows 无 Xcode。`ANDROID_DEBUG_BUILT = BLOCKED`、`IOS_DEV_BUILD = BLOCKED`、真机 `NOT_TESTED`。
- 只有真实 Gradle/Xcode 日志和真机日志才能升级 `NATIVE_BUILD_VERIFIED`/设备状态。
