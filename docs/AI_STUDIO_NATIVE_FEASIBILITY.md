# AI Studio / 原生封装可行性评估

日期：2026-11-06  
结论：**PWA 是当前主产品；Capacitor 是唯一推荐的受控原生试点；Kotlin/Compose 重写不进本轮主线。**

## 1. 本机实际环境检查

| 条件 | 实际结果 |
|---|---|
| 现有 React/Vite/PWA | 是；React 19、Vite 7、vite-plugin-pwa；hash 路由；Three.js 仅 P01 |
| 包管理器 | npm；仅有 `package-lock.json`，无 pnpm/yarn/bun 锁文件 |
| Node | v22.20.0（npm 11.7.0） |
| Java / Android SDK | 未找到 `java`、`adb`、`gradle`；`ANDROID_HOME`/`ANDROID_SDK_ROOT` 为空 |
| Android Studio | 未检测到；无法本机生成 APK |
| Xcode / CocoaPods | Windows，无 `xcodebuild`/`pod`；无法构建 iOS/iPadOS |
| Capacitor 依赖 | 未安装（`npm ls @capacitor/core` 为空） |
| 原生工程目录 | 无 `android/`、`ios/` |

因此本轮原生状态：

- `NATIVE_BUILD_VERIFIED = BLOCKED`
- Android：`BLOCKED: ANDROID_SDK`
- iPadOS：`BLOCKED: XCODE_OR_SIGNING`
- 没有 APK/IPA 产物；不伪造构建日志。

## 2. 三条路线对比

| 维度 | Web + PWA（当前） | Capacitor + 现有 React | Google AI Studio Android Native |
|---|---|---|---|
| 物理求解复用 | 100% 现有代码 | **100%**（同一 `dist`/WebView） | 重写风险高；不能直接复用 16 个求解器 |
| 实现成本 | 已完成 | 中：容器、origin 存储、文件导出、软键盘/返回键 | 高：新 Kotlin UI、状态与题目运行时 |
| 离线 | SW 已实现 | 复用 SW/资源，需要 WebView 调试 | 需自行重建离线/缓存 |
| P01 WebGL | 已验证 fallback | WebView WebGL 需真机验证 | 另做原生 3D，成本极高 |
| PWA 安装 | iOS/Android 浏览器 | 应用商店/侧载包 | 商店/侧载 |
| 数据迁移 | 同 origin 自动 | **新 origin，必须导入导出** | 再次新 schema/迁移 |
| iPadOS | Safari 支持 | 需 Mac + Xcode + 签名 | 同样需 Mac/Xcode |
| 推荐 | 现在先发布/验收 | **首选受控试点** | 仅隔离 UI 原型，不替换主线 |

## 3. Capacitor 试点建议（尚未执行）

前提：独立 `native-pilot/*` 分支、用户批准、不修改 `main` 物理/PWA 配置。

建议步骤：

```bash
# 仅在获批的 native-pilot 分支执行；本轮未安装
npm install @capacitor/core @capacitor/cli
npx cap init "EM Physics Lab" "com.example.emplab" --web-dir dist
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

需要配置/验证：

- `webDir: 'dist'`，hash 路由在 WebView 容器内可回退。
- PWA Service Worker 在 WebView 中的行为不能假设与浏览器一致；可禁用 SW、由容器提供离线资源。
- WebView 的 origin 与网站不同：模型场景/132 题/教师草稿需 JSON 导入导出迁移；不得声称自动同步。
- 软键盘/`Done`、返回键、safe-area、文件下载/导入（教师题包、诊断 JSON）。
- P01 WebGL 初始化、context loss、2D fallback；触摸手势与双指。
- 不申请无关权限、不接遥测/强制联网/付费 SDK。
- 构建成功前 `NATIVE_NOT_BUILT`；APK 只在真实 Gradle 日志存在时记 `NATIVE_BUILD_VERIFIED`。

### Android 环境要求（用户后续提供）

- JDK 17+（以当前 Capacitor/Android Gradle Plugin 官方要求为准）
- Android Studio / Android SDK（API 版本以构建时官方要求为准）
- 可用 USB 调试/模拟器用于验证；真机仍单独记录
- 签名仅用于正式包；debug APK 不包含生产签名

### iPadOS 环境要求

- macOS + Xcode（版本以 Capacitor 官方要求为准）
- Apple Developer 签名条件（真机/分发）
- Windows 环境无法完成 `xcodebuild`，因此本机为 `BLOCKED`

## 4. Google AI Studio 原生模式

官方 Build 的 Android Native 输出为 Kotlin/Jetpack Compose，并非 React 源项目的“转换器”。可用于：

- 单页 UI/导航/触控观感原型；
- 原生文件选择/Safe Area 可行性参考；
- 与 WebView 方案的性能对比。

不可用于：

- 声称直接复用 16 个物理求解器；
- 替换现有 React 主线；
- 作为 iPadOS 构建产物（仍需 Mac/Xcode）。

## 5. 学生端网络与 Gemini

- 本轮不接入 Gemini/任何云端 AI 依赖；核心教学与离线必须独立可用。
- 如未来单独增加 AI 辅导，须是可选功能、明确费用/隐私/网络失败降级；不得阻塞 PWA 离线或上传教师/学生数据。
