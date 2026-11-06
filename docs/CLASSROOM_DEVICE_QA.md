# 课堂平板设备 QA 与诊断（Round 15/18）

> Round 18 的最新真机验收清单与运行时平台字段见 [ROUND18_DEVICE_ACCEPTANCE.md](ROUND18_DEVICE_ACCEPTANCE.md)。

## 1. 原则

- 真实设备结果是唯一能标记 `PASS` / `FAIL` 的依据；当前 iPadOS Safari、Android Chrome 均为 **NOT_TESTED**。
- Playwright、CDP 触摸、无头 Chrome、桌面浏览器结果一律标记 **SIMULATED**，不得写成“真机通过”。
- 本工具是学习工具，不是监考系统；诊断报告不得包含题目答案、个人场景、学习进度或身份信息。
- 每台设备单独记录，不用一台设备的结论代表平台结论。

## 2. 入口与报告

1. 用 HTTPS 打开站点的 `/#/device-check`（本地开发可用 `http://localhost`）。
2. 填写「设备型号」「系统 / 浏览器」，例如 `iPad Air (第 5 代)` / `iPadOS 18.3 Safari`。
3. 页面自动显示：视口、DPR、横竖屏、`isSecureContext`、Service Worker、在线状态、standalone、WebGL/渲染器、CPU/内存、UA。
4. 点「WebGL 丢失/恢复测试」：只能说明事件链，P01 3D 画面是否恢复仍需真机人工确认。
5. 点「10 秒帧间隔探测」或「60 秒」：结果是 rAF 调度间隔，不是 GPU FPS，也不是真机帧率结论。
6. 逐项完成 12 项人工检查并选择状态：`NOT_TESTED` / `PASS` / `FAIL` / `BLOCKED` / `N/A`，必要时写备注。
7. 点「导出诊断 JSON」，与本节记录一起归档。导出内容仅包含上述环境信息、人工状态备注和探针数值，不包含答案、场景与进度。

状态定义：

| 状态 | 含义 |
| --- | --- |
| `NOT_TESTED` | 尚未在该设备上执行；默认值 |
| `PASS` | 该设备、该浏览器、该操作下实际通过 |
| `FAIL` | 可复现失败，需记录步骤与截图 |
| `BLOCKED` | 环境限制（无设备、无 HTTPS、无账号等） |
| `N/A` | 该设备/场景不适用，需写明原因 |

## 3. 必测设备矩阵

| 设备 | 浏览器 | 安装/PWA | 离线 | 更新保数据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| iPad（任一在售型号） | iPadOS Safari | — | — | — | NOT_TESTED |
| Android 平板 | Chrome | — | — | — | NOT_TESTED |
| 桌面 Chrome（开发参考） | Chrome | — | — | — | SIMULATED |
| 桌面 Safari（开发参考） | Safari | — | — | — | NOT_TESTED |

设备型号、系统版本和测试日期必须写入结果；不得用“iPad 已通过”概括不同型号与系统版本。

## 4. 15 分钟课堂暖机脚本

按顺序执行并记录每步结果与耗时：

1. 打开 `/#/cases`，进入 C01，启动实验，返回题目，确认个人场景仍存在。
2. 打开 P04：编辑单粒子参数，拖动时间轴；确认其它粒子保持独立状态。
3. 打开 P07：输入 `√3/2`、`1/3`、`2π`，确认软键盘弹出时不遮挡关键按钮与舞台。
4. 打开 P01：旋转/缩放，观察 WebGL；切后台 30 秒再回来，记录画面与时钟状态。
5. 打开 I05/I07：改变磁场/速度，确认图像与数值同步，无控制台错误。
6. 横竖屏切换 3 次，检查无横向溢出、安全区内按钮可点。
7. 开启 VoiceOver/TalkBack，遍历主要按钮与表单，记录焦点顺序与名称。
8. 断网后重载，确认已缓存案例/模型可进入；外链真题来源不可用属预期。
9. 恢复网络，等待更新/刷新，确认场景、答题、错题、学习路线与案例进度仍存在。
10. 连续运行 15 分钟，记录发热、掉电、崩溃、Safari/Chrome 会话是否被系统回收。

任一失败都记录复现步骤、设备、系统版本、截图与导出 JSON；修复后必须在新构建上复测，不得用桌面模拟结果代替。

## 5. 结果记录模板

```text
设备：____________________  系统/浏览器：____________________
日期：________  构建：0.1.0-round17（或实际版本）  入口：HTTPS / localhost
安装/PWA：PASS / FAIL / BLOCKED / NOT_TESTED
离线：PASS / FAIL / BLOCKED / NOT_TESTED
更新保数据：PASS / FAIL / BLOCKED / NOT_TESTED
触控手柄：PASS / FAIL / BLOCKED / NOT_TESTED
双指缩放/旋转：PASS / FAIL / BLOCKED / NOT_TESTED
速度矢量/初态编辑：PASS / FAIL / BLOCKED / NOT_TESTED
软键盘/表达式：PASS / FAIL / BLOCKED / NOT_TESTED
切后台：PASS / FAIL / BLOCKED / NOT_TESTED
持久化：PASS / FAIL / BLOCKED / NOT_TESTED
案例返回：PASS / FAIL / BLOCKED / NOT_TESTED
大字号/安全区：PASS / FAIL / BLOCKED / NOT_TESTED
读屏焦点：PASS / FAIL / BLOCKED / NOT_TESTED
15 分钟暖机：PASS / FAIL / BLOCKED / NOT_TESTED
备注/复现步骤：____________________________________________
```

## 6. 当前结论边界

- 自动化测试中的触控、键盘与探针结果均为 `SIMULATED`，只证明代码路径，不证明硬件体验。
- 未经真实 HTTPS 部署，无法验证 PWA 安装、真实离线首启与线上更新；相应项目保持 `BLOCKED` 或 `NOT_TESTED`。
- 不得声称未实测的 60 fps、发热改善或系统级稳定性。

## 7. Round 17 追加（2026-11-05）

- `/#/device-check` 现导出 schemaVersion 2：`source.evidenceSource` 为 `simulated` 或 `physical-device-self-reported`，并记录目标设备类型。
- 自动浏览器默认 `navigator.webdriver=true`，报告必须标记 `simulated`，不得计入真机 PASS。
- 新增人工项：教师自建题本机创建/编辑/预览、PWA 更新保留旧数据。
- 报告继续不包含教师题干/答案、学生答案、场景 JSON 或账号/位置信息。
- 真机 iPadOS Safari / Android Chrome 仍全部 `NOT_TESTED`。执行脚本与状态矩阵见 `ROUND17_DEVICE_RELEASE_MATRIX.md`。
- 教师工作台平板验收重点：`/#/teacher/problems` 模板卡片、编辑器表单、标准值数学输入（如 `√3/2`）、逐问答案绑定、预览变式滑块、软键盘弹起时的保存/预览按钮、横竖屏无横向溢出。自动化仅证明 DOM 路径，不证明真实软键盘/Safari 行为。
