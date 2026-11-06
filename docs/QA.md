# 质量保证与回归证据

日期：2026-11-06  
正式站点：<https://soft-toffee-cbd208.netlify.app/>

本文件记录可复现的工程证据。浏览器自动化只证明代码路径，不等同真实 iPad/Android 通过；无证据的项目保持 `NOT_TESTED`。

## 1. 当前回归基线（2026-11-06，GPLv3/仓库清理分支）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npx vitest run` | **610 / 610 通过**，58 个文件（新增许可/文档一致性 3 项） |
| `npx playwright test` | **183 / 183 通过**（`SIMULATED`），约 8.1 分钟 |
| `npm run test:pwa` | **3 / 3 通过**；precache 144 项 / 4308.13 KiB |
| `npm run build` | 通过；入口 340.35 kB（gzip 103.65），CSS 140.99 kB（gzip 28.84） |
| `npm run verify:static` | 通过；72 JS / 1 CSS / 4249.4 KiB / 140 files / sha `53e1bb251445`；release manifest 已生成 |
| `npm run smoke:headers` | 通过；CSP/安全头下首页、A17、教师页无控制台错误 |
| `npm run smoke:staging -- http://127.0.0.1:4174` | `SMOKE OK`（本地生产预览） |
| `npm run smoke:staging -- https://soft-toffee-cbd208.netlify.app` | **部分失败**：线上旧构建的 `release-manifest.json` 返回 HTML；下次部署后复验 |
| `npm run simulate:upgrade` | `PWA_UPGRADE_SIMULATED_PASS`（本地模拟，非线上升级） |

不得删除、跳过或放宽旧断言来换取绿色。纯文档/许可证修改未改变物理求解器、数据 schema 或 PWA 生命周期。

## 2. 分层证据

| 层级 | 工具/证据 | 能证明 | 不能证明 |
|---|---|---|---|
| 物理求解器 | Vitest | 解析锚点、事件、单位、能量与边界 | 浏览器交互体验 |
| 页面与路由 | Vitest 集成 + Playwright | 页面渲染、导航、表单、触控代码路径 | 真实触控手感 |
| PWA | Playwright PWA 配置 | 生产构建、SW、离线重载、缓存数据保留 | 真实 iPad/Android 安装 |
| 静态发布 | `verify:static` / `smoke:staging` | 产物完整性、安全头、线上基础可访问性 | 完整课堂网络与设备矩阵 |
| 真机 | 人工记录（`/#/device-check`） | 具体设备、系统、浏览器下的实际行为 | 其他型号或平台 |

`navigator.webdriver=true` 的自动浏览器结果必须标为 `SIMULATED`。CDP 合成触摸只验证 Pointer Events 分支。

## 3. 内容与物理覆盖

- 16 个模型：P01–P08、I01–I08；每个模型有独立求解器、讲解、原创题、场景持久化与离线入口。
- 132 道原创练习；9 个原创整题案例：C01–C08 + A17-01；A17-02 仅为教师本机模板，不计入公开案例。
- 5 条高考来源保持 `exam_reference / unverified / link_only`，应用内无题干、图片或第三方答案。
- 物理测试覆盖圆周/半平面/有限区域/多区域/复合场/束线/约束反求、磁通与楞次、单棒、线框、时变场、双棒、反向场挡板、交流发电机及整题跨求解器交接。
- 代表性锚点包括 P07 屏幕命中 `y≈1.0893163975 m`、I05 手动 B 的 `ε_t=−0.5 V, ε_m=−2.5 V, ε=−3 V`、C08 接触焦耳热 `0.75 J`、A17-01 跨阶段交接误差 `<1e-9`。完整清单以各物理测试文件为准。

## 4. 数据与离线

- 所有学习数据保存在浏览器 `localStorage`：模型场景 `emplab.<model>.scene.v2`、132 题进度 `emplab.progress.v1`、案例进度 `emplab.cases.progress.v1`、教师草稿 `emplab.teacher-problems.v1`、设备记录 `emplab.deviceCheck.*.v1`。
- “完整本地数据备份”`emplab.local-backup` v1 可导出/预览/恢复；导入失败保持原数据，不调用 `localStorage.clear()`。
- PWA 首次离线必须先在线加载完成 SW 缓存；测试覆盖生产构建、SW 激活、断网重载与数据保留。
- 网站、PWA 主屏幕与 Capacitor WebView 是不同存储容器，迁移必须显式导出/导入，不存在自动同步。

## 5. 发布与设备状态

- 正式 HTTPS 站点已上线；2026-11-06 复查首页 200、CSP/HSTS/安全头、manifest 与 `sw.js` 正确。
- 线上构建尚缺 `release-manifest.json`，下一次部署后应复查。
- iPadOS Safari：基本打开与“添加到主屏幕”已由使用者完成；完整触控、软键盘、WebGL 恢复、读屏、离线/更新与 15 分钟暖机为 `NOT_TESTED`。
- Android Chrome：`NOT_TESTED`。
- 真实双版本线上 SW 升级：`BLOCKED`；本地升级模拟只算 `SIMULATED`。
- 原生 Android/iPadOS 包：`BLOCKED`（无 Android SDK/JDK 21/Xcode）；详见 [NATIVE_FEASIBILITY.md](NATIVE_FEASIBILITY.md)。

逐项设备清单见 [DEVICE_ACCEPTANCE.md](DEVICE_ACCEPTANCE.md) 与 [DEVICE_RELEASE_MATRIX.md](DEVICE_RELEASE_MATRIX.md)。

## 6. 已知限制

- 仿真为教学理想模型：忽略边缘场、自感/互感、摩擦、相对论、器件厚度与粒子间相互作用（另有说明的模型除外）。
- 手动拖动量由时间戳估计，存在跟随延迟；rAF 间隔不是 GPU FPS，无头 Chrome 数据不是真机帧率。
- 没有账号系统；教师入口不是服务端认证，师生共用平板时本地数据可见。
- 未授权真题、外部图片与第三方依赖不因项目采用 GPL 而被重新许可。

## 7. 缺陷处理

先复现 → 写失败测试 → 最小修复 → 物理与全量回归 → 需要时真机复测。不得为通过测试降低物理精度、删除断言或跳过失败用例。
