# 原生应用技术验证（Capacitor Pilot）

日期：2026-11-06  
状态：`CAPACITOR_CONFIG_READY`；`ANDROID_DEBUG_BUILT = BLOCKED`；`IOS_DEV_BUILD = BLOCKED`；`ANDROID_NATIVE_DEVICE_VERIFIED = NOT_TESTED`；`IPADOS_DEV_BUILD_VERIFIED = NOT_TESTED`；`STORE_PUBLISHED` 不适用。

## 1. 结论先行

- 保留现有 React/Vite/PWA 为唯一主产品；原生只做隔离的 Capacitor 技术验证。
- 已创建 `native/capacitor-pilot/`：Capacitor **8.6.0** 固定版本、`webDir: '../../dist'`、无 `server.url`、无第三方插件。
- 本机没有可用 Android SDK/现代 JDK（仅 JDK 8）、没有 `adb`/Gradle；Windows 无 Xcode/CocoaPods。**因此没有生成 APK/IPA，不能写 NATIVE_BUILD_VERIFIED。**
- 已增加 `src/platform/runtimePlatform.ts` 与测试：区分 browser / standalone PWA / Capacitor WebView，`navigator.webdriver` 保持可观察。
- `src/main.tsx` 在 Capacitor 原生壳中跳过 Service Worker 注册；浏览器/PWA 继续注册 SW。原生包必须验证内置 `dist` 的断网冷启动，不能依赖网站首次联网缓存。
- 原生 WebView 与网站/PWA 的 localStorage 是不同容器；本轮新增统一本地备份，迁移必须手动导出/导入，不宣称自动同步。

## 2. Capacitor Pilot 配置

```text
native/capacitor-pilot/
  package.json          @capacitor/core/cli/android 8.6.0
  capacitor.config.ts   appId=com.emplab.physicslab.pilot
                        webDir='../../dist'
                        androidScheme='https'
                        android.allowMixedContent=false
  README.md             环境前提、构建步骤、验收字段、数据边界
```

没有 `server.url`，避免把远程网站伪装成本地离线应用；教师草稿不会进入 `dist`、PWA precache 或原生资产。

## 3. 环境审计

| 项 | 结果 |
|---|---|
| Node | v22.20.0 |
| npm | 11.7.0 |
| JDK | PATH 无 `java`；仅有 `C:\Program Files\Android\jdk` 的 JDK 8 |
| Android SDK | `ANDROID_HOME`/`ANDROID_SDK_ROOT` 为空；无 `adb`/Gradle/Android Studio SDK |
| Xcode | Windows，无 `xcodebuild`/CocoaPods |
| Capacitor 依赖 | 未在根项目/本机安装；pilot 目录已写死版本与命令 |

结论：`ANDROID_DEBUG_BUILT = BLOCKED`（缺 Android SDK/JDK/工具链）；`IOS_DEV_BUILD = BLOCKED`（缺 Mac/Xcode/签名）。这不是代码失败，而是环境缺失。

## 4. 获得工具链后的最小流程

```bash
# 根仓库：构建已验证 Web 产物
npm ci
npm run typecheck
npx vitest run
npm run build
npm run verify:static

# pilot：安装固定版本并生成 Android 工程
cd native/capacitor-pilot
npm install
npx cap add android
npx cap sync android
npx cap open android
# Android Studio: Build > Build APK(s) — debug only
```

构建验收必须记录：JDK/Android Studio/Gradle 版本、SDK/API、源码 buildId、APK SHA-256、设备型号/OS、安装与 logcat；并在真实设备上验证 P01 WebGL、P07 轨迹、I05 手动历史、A17-01 整题/教师预览、断网冷启动、数学软键盘、统一备份导出/导入。

## 5. WebView 行为边界

- 仅使用 `androidScheme: https`，不启用 `allowMixedContent`；不申请位置/相机/录音/通讯录/后台跟踪权限；本轮不添加插件。
- HashRouter 保留；站内深链由 WebView 导航；外链使用系统浏览器（如后续需要，经审核的最小插件或原生 Intent）。
- 返回键/软键盘/安全区/横竖屏必须在真实 Android/iPadOS 上验证；没有设备证据不写 PASS。
- PWA 主屏、浏览器标签页、Capacitor WebView 三者的数据不共享；统一备份是唯一迁移路径。
- P01 Three/WebGL、KaTeX、SVG 触控在 WebView 中必须实测；失败时保留 2D 回退，不重写求解器。
- 教师草稿/学生进度不预置进 native bundle；不自动上传。

## 6. 与 PWA 的对比与建议

| 路线 | 本轮状态 | 建议 |
|---|---|---|
| Web/PWA | 正式站点 `LIVE`；iPad Safari 基本打开/安装 PASS；完整真机专项 NOT_TESTED | 主发布入口，继续完成平板 QA |
| Capacitor Android | 配置就绪，构建 BLOCKED | 等 JDK 21+/SDK/设备到位，构建 debug APK 后用统一备份复测 |
| Capacitor iPadOS | 配置复用，Xcode/签名 BLOCKED | 等 Mac/Xcode/签名与真实 iPad 到位 |
| Flutter/RN 重写 | 不做 | 迁移物理引擎风险高，不符合本轮目标 |

**建议**：在获得工具链和真机前，不把原生包装当作产品完成；继续投资 Web/PWA 的稳定性与教师内容。只有在真实原生设备上确认 WebGL、软键盘、离线、JSON 导入导出和返回键无严重差异后，才讨论原生产品化或商店发布。
