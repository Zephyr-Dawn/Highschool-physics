# 原生 App 路线决策

日期：2026-11-06  
状态：`NATIVE_BUILD_VERIFIED = BLOCKED`；本轮只做工程评估，不提交原生目录。

## 决策

1. **主产品继续 Web/PWA**：先完成 HTTPS 发布与真实 iPad/Android 浏览器验收。
2. **未来原生优先 Capacitor**：复用现有 React/Vite `dist`，在独立 `native-pilot/*` 分支验证 Android WebView/iOS WKWebView、WebGL、手势、软键盘、存储迁移与文件导入导出。
3. **AI Studio Kotlin/Compose** 只作为隔离 UI 原型，不做 16 个物理求解器的重写，也不作为 iPadOS 构建路径。

## 本机证据

- `java`、`adb`、`gradle` 未找到；`ANDROID_HOME`/`ANDROID_SDK_ROOT` 为空 → `BLOCKED: ANDROID_SDK`。
- Windows 无 `xcodebuild`/CocoaPods → `BLOCKED: XCODE_OR_SIGNING`。
- 未安装 Capacitor，未生成 `android/`/`ios/`，未生成 APK/IPA。
- 详细矩阵、命令与验证项见 [AI_STUDIO_NATIVE_FEASIBILITY.md](AI_STUDIO_NATIVE_FEASIBILITY.md)。

## 不得跨越的红线

- 不得在原生封装中重写/近似物理引擎；
- 不得把 WebView 新 origin 当作自动继承网站 localStorage；
- 不得为原生试验改动 `main` 的 Service Worker、hash 路由、数据 schema；
- 没有真实构建日志不写 `NATIVE_BUILD_VERIFIED`；
- 没有真机不写 `DEVICE_VERIFIED`。
