# Round 16 QA 与交付证据

日期：2026-11-05  
工作区：`H:\programming\EM_Physics_Lab`（Windows 10.0.26100，**非 git 仓库**）

## 1. 最终实测

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **通过** |
| `npx vitest run` | **556 / 556 通过**，50 个测试文件（Round 15 基线 541/48；新增 10 项整题适配器 + 5 项答案校验） |
| `npx playwright test` | **172 / 172 通过**，约 7.9 分钟（Round 15 基线 165；新增 7 项 Round 16） |
| `npm run test:pwa` | **2 / 2 通过**（离线覆盖 16 模型、8 案例、整题工作台、设备检测、学习路线、P01 3D） |
| `npm run verify:static` | **通过**：`62 JS, 1 CSS, assets 4128.4 KiB, sha 8838` |
| 入口 JS | 337.32 kB（gzip 102.71 kB） |
| 案例详情 chunk | 46.57 kB（gzip 15.13），含整题适配与解析数据 |
| 案例会话 chunk | 83.02 kB（gzip 27.36） |
| CSS | 131.81 kB（gzip 27.32） |
| PWA 预缓存 | 134 项 / 4187.14 KiB |

环境：Node v22.20.0 / npm 11.7.0；Playwright 1.64.1，本机 Chrome 156 headless；真实 iPadOS/Android、公网 HTTPS 未测试。

## 2. Track A — 整题连续仿真

8 个案例均达到 `full_problem_simulated`（定义与限制见 `docs/WHOLE_PROBLEM_SIMULATION_SPEC.md`）：

| 案例 | 引擎 | 统一舞台/事件 | 关键独立锚点 |
|---|---|---|---|
| C01 | P04 | 条带 + 粒子；起点/出场 | `t=π/6`、`(0.5,1−√3/2)`、临界宽度 1 m |
| C02 | P05 | 双磁区 + A/B 同场；A 两次跨界、B 首次跨界 | A `π→(0,−2)`, `2π→(0,−4)`；B 首次 `1+π s` |
| C03 | P07 | 源点→狭缝→选速→分析→偏转→屏幕 | 屏幕 `y=1.0893163975 m`，到达 `3.678299314 s` |
| C04 | I03 | 场条带 + 线框；进入/完全进入/离开 | `t=0.1 s`: `Φ=.01 Wb, ε=−.3 V, I=−.6 A` |
| C05 | I05 | 场条带 + 线框 + 图表；几何事件 | `ε_t=−.5, ε=−3 V, P_J=4.5 W` at `t=.5 s` |
| C06 | I07 | 反向双场 + 挡板；界面/出场/反弹/再入 | `ε₀=16 V`、碰前 1.8 m/s、`Q_impact=1.215 J`、反弹 −0.9 m/s |
| C07 | P07 | 选速 + 可调分析 + 屏幕 | `y=2−2√3/3≈.8452995 m`；临界 `|B|=2 T` |
| C08 | I06 | 双导轨 + 两杆；接触停止 | `I₀=1 A`、`t=ln2`、接触 `Q_J=0.75 J` |

- 同一舞台、统一 `tGlobal`、真实事件表；点击事件可定位时间与舞台位置。
- C02 的两粒子共用场但独立 launchTime；修改 A 初速保留全局时间和 B 的同一时刻状态（Playwright 断言 B marker 不变）。
- C03 变式 1.5 m/s 真实变为出口板吸收；屏幕/到达时间无唯一值，判题返回 `needs_review`，不沿用标准答案。
- C06 变式 e=1 → 冲击损失 0、反弹 −1.8 m/s；C08 Bz=0 → 接触 0.5 s、Q=0；C07 B=+1 镜像。
- 答案输入支持 `1/3`、`√3/2`、`1+π` 等安全表达式、单位换算（m/cm、s/ms、V/mV、A/mA、J/mJ、W/mW 等）与 `needs_review`。

## 3. Track B — 逐问解析与真实来源

- C01–C08 每案 **3 个小问**；每问 3–4 步独立推导、2 个提示层级、单位/符号说明、典型错误、独立验算、至少 2 个变式。
- 答案/揭示/提示状态写入既有 `emplab.cases.progress.v1` 的可选 `parts` 字段；输入在刷新后保留，且不触碰 132 题进度或基础模型场景。
- 真实来源实际检索结果（2026-11-05）：0 条找到权威考试院完整原卷；2 条第三方页公开可见题面/解析但版权保留；1 条题面可见但答案被付费限制；2 条地区标签/真题身份不足。应用仍全部保持 `unverified / link_only`，没有复制题干/图片/答案。详见 `docs/EXAM_SOURCE_AUDIT.md` §6。

## 4. 本轮修复与测试记录

- C06 整题适配最初重复使用 `re-enter` 事件 ID，React 报重复 key；已按第 1/2/… 次再入生成唯一 ID，Round16 Playwright 无 console error。
- C08 的“接触焦耳热”最初按两杆最终同速错算为 1 J；求解器实际在首次几何接触停止，`v₁=1.5, v₂=0.5 m/s`，`Q_J=0.75 J`。已修正数据、推导、检查点与测试；这是本轮发现并修正的物理内容错误。
- C03 的“屏幕落点”与“是否命中”分开：屏幕窗口变窄时轨迹几何交点仍可计算，但命中结果由 `outcome` 决定；判题不把未命中写成命中。
- 旧测试只更新了案例数量 6→8（Round 15 测试与 PWA 清单），没有删除、跳过或降低任何物理断言。全量 Playwright **172/172**、Vitest **556/556** 一次通过。
- Round15 C06 的 0.375 J B=0 挡板实验保留为“分阶段基础模型对照”；整题场景明确使用 v=8 的连续反向场+挡板，二者不混为同一物理条件。

## 5. 截图

- `docs/screenshots/round16-c03-lab.png`（C03 整题舞台 + 逐问答案）
- `docs/screenshots/round16-c03-variant.png`（速度变式导致吸收/答案待复核）
- `docs/screenshots/round16-c02-lab.png`（A/B 同一舞台）
- `docs/screenshots/round16-c06-lab.png`（反向场+挡板连续事件）
- `docs/screenshots/round16-c08-lab.png`（双杆接触）
- `docs/screenshots/round16-c03-lab-viewport.png`（C03 舞台视口）
- `docs/screenshots/round16-c03-solution-viewport.png`（推导/答案视口）
- `docs/screenshots/round16-c03-portrait.png`（竖屏无横向溢出）

## 6. 明确限制

- 真实 iPadOS Safari / Android Chrome、软键盘、读屏、安全区、发热/续航：`NOT_TESTED`；CDP/headless 数字只标 `SIMULATED`。
- 外部 HTTPS 部署：`BLOCKED`（无托管授权）；没有公网 URL。
- 真题：无权威原卷、无转载授权；不展示/复制题面、图片或答案；不做“官方解析”。
- C02 只提供 A 初速变式，不复制全部拖拽手柄；C05 整题使用规定速度模式；C06 固定初速 8 m/s 以到达挡板；C08 在首次接触停止，不模拟碰撞。以上均在案例限制中显示。
- 整题工作台是二维 SVG/图表，不使用 P01 3D；P01 3D 与 16 个基础模型保持原实现。
