# 真实平板验收

日期：2026-11-06  
正式地址：<https://soft-toffee-cbd208.netlify.app/>  
原则：真实设备、真实 HTTPS、真实输入法/读屏/触控才可写 `PASS`；CDP/Playwright/模拟器只能写 `SIMULATED`。没有证据一律 `NOT_TESTED`。

**已完成（physical-device-self-reported）**：iPadOS Safari 使用正式 HTTPS 地址打开成功，并已完成“添加到主屏幕”。下列 iPad 专项与 Android 全项仍未执行。

## 1. 状态字段

每台设备单独记录：

```text
设备型号：
系统 / 浏览器：
测试日期：
访问方式：Safari 标签页 / 添加到主屏幕 / Chrome / Capacitor 原生壳
URL / 构建 buildId：
source：physical-device-self-reported / simulated
```

`/#/device-check` 导出 schemaVersion 2 报告，包含 `runtime.platform`（browser/pwa/capacitor）、`source.evidenceSource` 与 12 项人工检查；默认全部 `NOT_TESTED`。诊断不读取教师草稿、答案、场景或账号。

## 2. iPadOS Safari 必测

| 项目 | 操作 | 状态 |
|---|---|---|
| PWA 安装 | Safari → 分享 → 添加到主屏幕，从主屏启动，确认 standalone | NOT_TESTED |
| 首装/离线 | 在线完整打开一次 → 飞行模式 → 重载 A17、C03、教师列表 | NOT_TESTED |
| 更新 | 部署 Build B 后等待更新/刷新一次，检查旧进度与教师草稿 | NOT_TESTED |
| 深链 | 直接打开 `/#/cases/case-a17-electric-magnetic-screen`、`/#/teacher/problems`、`/#/device-check` | NOT_TESTED |
| P01 3D | 单指旋转、双指缩放、手柄拖动、第二指取消、切后台 1 分钟/WebGL 恢复 | NOT_TESTED |
| 多粒子 | P02–P08 的 1–5 粒子、共同时钟、单粒子编辑不打断其它粒子 | NOT_TESTED |
| 数学输入 | `√3/2`、`π`、`1/3`、`5 T` 超滑块；键盘 Done、选区、复制粘贴、中文输入法、非法回退 | NOT_TESTED |
| 手动历史 | I02/I05/I06/I07/I08 拖拽/松手归零；I01/I04 ramp 真实时间 | NOT_TESTED |
| 教师 | 新建 A17 草稿 → 编辑 → 预览 → 导出 → 另一浏览器/设备导入 | NOT_TESTED |
| 适配 | 横竖屏、刘海/安全区、文字放大、VoiceOver、滚动/舞台 touch-action | NOT_TESTED |
| 稳定性 | 15 分钟连续运行；发热/掉电/会话回收/输入延迟主观记录 | NOT_TESTED |

## 3. Android Chrome 必测

| 项目 | 操作 | 状态 |
|---|---|---|
| PWA 安装 | Chrome 菜单 → 安装应用/添加到主屏幕，从桌面启动 | NOT_TESTED |
| 首装/离线/更新 | 同 iPad 流程；检查系统返回手势、地址栏动态高度 | NOT_TESTED |
| 输入 | 软键盘/完成键、数学符号、中文输入法、选区/粘贴 | NOT_TESTED |
| 触控 | P01 3D、P07 手柄、A17 变式滑块、教师表单 44 CSS px | NOT_TESTED |
| 读屏 | TalkBack 遍历主导航、教师编辑器、答案输入 | NOT_TESTED |
| 稳定性 | 切后台、旋转、15 分钟暖机、发热/电量 | NOT_TESTED |
| 原生对照（如 APK 可用） | Capacitor 与 Chrome PWA 分别测 WebGL/离线/存档导出，不假设相同 | NOT_TESTED |

## 4. 数据迁移与边界

- Web/PWA/原生 WebView 的 origin/localStorage 不自动共享；使用 `/#/progress` 的“完整本地数据备份”导出/导入。
- 备份包含 16 模型场景、132 题、案例进度、教师草稿、讲解/模式、设备记录；不包含临时案例备份/返回上下文。
- 教师草稿是本地私有数据，不是账号隔离；师生共用平板时需说明共享风险。
- 换设备、换浏览器、无痕模式、删除站点数据都会丢失；没有云同步。
- 首次离线必须先在线加载并完成 SW 缓存；原生包必须真实验证内置 `dist` 冷启动，不能用“先联网缓存”解释。

## 5. 性能/网络记录

- 只记录系统/浏览器可见指标：rAF 间隔、长任务/交互延迟、JS heap（支持时）、P01 3D 首次可交互时间、设备型号/OS、是否省电/后台/VSync。
- rAF 间隔不是 GPU FPS 或刷新率。
- 弱网检查约 4 MB 缓存资源、P01 大 chunk、404、SW 版本与恢复。
- 浙江/黑龙江/其它真实网络分别记录；无数据标 `NOT_TESTED`，不编造国内可访问性。

## 6. 缺陷修复原则

先复现 → 写失败测试 → 最小修复 → 物理回归 → 真机复测。只修有真实证据的触控/失焦/滚动/PWA/WebGL 问题；不整体重写 UI、不降低物理精度、不跳过旧测试。

## 7. 当前结论

- iPadOS Safari 基本打开 + 添加到主屏幕：**PASS**（physical-device-self-reported）。
- iPadOS Safari 完整专项（触控、软键盘、WebGL、读屏、离线/更新、15 分钟暖机）：**NOT_TESTED**。
- Android Chrome：**NOT_TESTED**。
- 15 分钟暖机/发热/续航：**NOT_TESTED**。
- 真实双版本 SW 升级：**BLOCKED**（尚无受控两版本线上发布）；仅有本地 `SIMULATED`。
- 原生 Android/iPadOS 包：**BLOCKED**（本机无 SDK/JDK 21/Xcode）；构建条件与限制见 [NATIVE_FEASIBILITY.md](NATIVE_FEASIBILITY.md)。
