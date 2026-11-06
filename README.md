# EM Physics Lab｜高中电磁学交互实验室

平板优先（Tablet-first）的高中电磁学交互教学 PWA。面向黑龙江新高考物理复习，Phase 1 当前交付十六个完整垂直切片：

- **P01 真实 WebGL 三维洛伦兹力与磁场运动**
- **P02 匀强磁场内的多粒子圆周运动**
- **P03 直线边界半平面有界磁场的多粒子运动**
- **P04 条形 / 矩形有界磁场及临界条件**
- **P05 相反磁场多区域与粒子时序**
- **P06 电磁复合场（同区 E+B 与电场→磁场）**
- **P07 多级带电粒子束线综合实验（加速、狭缝、选速、磁分析、电偏转、屏幕）**
- **P08 复合电磁场约束、临界条件与单参数反求（目标线段 / 时间窗 / 正向复核）**
- **I01 磁通量与楞次定律（B / 面积 / 角度三模式）**
- **I02 单导体棒切割磁感线（匀速 / 自由滑行 / 恒力 / 手指推拉）**
- **I03 矩形线框进入 / 离开磁场**
- **I04 时变磁场中的静止线圈**
- **I07 相反磁场双区域、运动线框与弹性挡板（带符号磁通 / 真实碰撞 / 能量分账）**
- **I08 交流发电机与交变电流（正弦电动势 / 有效值 / 负载功率 / 手动转动）**
- **I05 时变磁场中的运动线框（感生 + 动生耦合）**
- **I06 双导体棒在平行导轨上的电磁耦合**

这十六个页面都包含触控参数、可暂停/倍速/逐步回放的同一物理状态、分步引导讲解、实时数据、边界/波形事件、原创练习与本地学习记录。不是静态设计稿或仅有播放按钮的动画。

Round 15/16 在十六个模型之上新增题目实验：`/#/cases` 现提供 9 个**原创·高考风格**案例，其中 C01–C08 与 A17-01 全部在同一物理舞台上使用真实求解器、统一 `tGlobal`、事件时间轴和逐问解析。每案先预测；整题不再以“能跳到基础模型”作为完成标准。真题只保留元数据外链，全部标记“未在线复核”。

Round 17 新增两条并行交付：

- **教师题目工作台（Track A）**：`/#/teacher/problems` 支持本机私有草稿、A17 模板、复制内置案例、导入/导出题包、逐问推导/提示/答案绑定、已注册参数变式与来源/权利独立标注。A17-01 在**同一舞台、统一全局时间**完成电场加速→有限磁场→无场漂移→屏幕，两个状态交接点由真实求解器连续传递；A17-02 使用 I07 同一引擎展示感应电流、挡板冲击与焦耳热分账。教师可编辑题目但不执行任意代码，核心草稿只保存在 `emplab.teacher-problems.v1`。
- **发布与真实设备验收（Track B）**：静态构建自检生成 `dist/release-manifest.json`（文件哈希清单）；设备诊断升级为 source-labelled schema v2，区分模拟与真机自述；PWA 离线/重载保留模型场景、132 题进度、案例进度与教师草稿。**真实外部 HTTPS 部署仍为 BLOCKED（无托管授权），没有公网 URL；真实 iPadOS/Android 仍为 NOT_TESTED。**

Round 18 进入发布准备：变式下标准推导默认折叠；新增完整本地数据备份/迁移（场景、132 题、案例进度、教师草稿、设备自测）；运行时平台检测与 Capacitor 原生壳跳过 SW；静态包增加 buildId/SHA-256、secret/私有文件扫描、CSP/安全头、staging smoke、本地 Build A→B PWA 升级模拟。**外部 HTTPS 仍 BLOCKED（无托管授权），真实 iPad/Android 仍 NOT_TESTED，原生 APK/IPA 因缺 SDK/JDK/Xcode 仍 BLOCKED。** 详见 [ROUND18_QA](docs/ROUND18_QA.md)。

## GitHub / AI Studio 协作入口

- 目标仓库：`https://github.com/Zephyr-Dawn/Highschool-physics`（推送状态与授权以 `docs/GITHUB_HANDOFF_BASELINE.md` 为准）。
- 稳定分支：`main`；AI Studio 工作分支：`ai-studio-dev`。禁止直接推送 `main`，禁止 force push。
- AI Studio 必须先读根目录 [AI_STUDIO_HANDOFF.md](AI_STUDIO_HANDOFF.md)，再读 [docs/AI_STUDIO_FULL_PROMPT.md](docs/AI_STUDIO_FULL_PROMPT.md) 与 [docs/AI_STUDIO_SCOPE_AND_CONTRACT.md](docs/AI_STUDIO_SCOPE_AND_CONTRACT.md)。
- 分支同步守卫、ZIP fallback、PR/CI/回滚见 [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)；CI 与环境排障见 [docs/CI_RUNBOOK.md](docs/CI_RUNBOOK.md)；发布与真机清单见 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。
- 用户于 2026-11-06 明确授权使用该 public 仓库；只提交经过审计的源代码、原创内容与脱敏文档，不提交教师/学生私有数据或凭据。

## 当前真实状态（2026-11-06）

| 能力 | 状态 |
|---|---|
| P01–P08 / I01–I08 可运行交互模型 | 已实现；模型页按路由懒加载 |
| **P01 真实 WebGL 三维受力** | **已实现**：真实深度场景、单指旋转/双指缩放、v/B/F 世界矢量、相机预设、约束平面手柄与教师图层；不再用 SVG 等轴测冒充 3D |
| **P01 三维解析运动** | **已实现**：同一 3D 画布中的直线、圆周与螺旋；1–5 粒子共享 B 与全局时钟，独立 launchTime 与播放中单粒子重发射；2D 平面视图保留 |
| **I01 磁通量与楞次定律** | **已实现**：连续改变 B、面积或角度的三种真实时间实验；开路、历史曲线与方向遮蔽 |
| **P02 / P03 / P04 / P05 同场多粒子 + 播放中单粒子编辑** | **已实现**：1–5 颗粒子共享场和全局时钟；编辑 A 时 B/C 继续运动，松手只重发射 A |
| **P04 有限条形 / 矩形磁场** | **已实现**：解析入场、任一边出场、同侧返回、临界、相切、角点合并；区域几何与 Bz 可调 |
| **P05 相反磁场多区域** | **已实现**：2–4 个竖直区域、多次跨界、区内停留时间、不同 launchTime 与同时刻位置对照 |
| **I08 交流发电机** | **已实现**：自动匀速/手指转动、正弦 Φ/Ψ/ε/I、峰值/有效值、负载/内阻功率、滑环与开关事件、机械输入能量 |
| **I04 连续手动调磁** | **已实现**：播放中在真实仿真时间拖动 B，使用分段线性 ramp 的实际斜率计算 ε；不是重置动画 |
| **I05 运动线框 + 时变场** | **已实现**：M1 匀速约束、M2 自由动力学、M3 手动调磁、M4 手动拖线框；感生/动生分解、场源功率、独立能量账本、边界事件与四组图像 |
| **I06 双导体棒耦合** | **已实现**：D1 自由双棒、D2 恒力驱动、D4 手推杆 1/2；同一回路电流、成对磁场力、质心动量、解析速度趋同、接触停止与能量账本 |
| **全模型数学表达式参数输入** | **已实现（Round 11.5/12/13/14）**：16 个模型的 197 个 `<ParamSlider>` 调用点（运行时最多 208 个控件）同时保留原滑动条并支持分数、根式、π、括号、幂和科学计数法；合法输入不受滑块 min/max 限制、不 clamp；非法输入不改变实验并显示原因；单粒子/共享场/I01–I06 手动 ramp 与手势语义不变。详见 [参数审计](docs/PARAMETER_INPUT_AUDIT.md) 与 [输入规范](docs/PARAMETER_INPUT_SPEC.md) |
| I03 参数编辑 | 保留原滑动条并接入数学表达式（Round 11.5）；仍不宣称具备 P02 式实时初态预览 |
| 引导学习 / 自由实验 / 教师演示模式 | 已实现 |
| 触控拖动、双指缩放、平移模式、适配视图 | 已实现（双指缩放、单指拖动及手势冲突有自动化触摸测试） |
| 播放、暂停、上一/下一关键帧、0.25×–2×、时间轴 | 已实现；I04 手动模式固定 1× 实时 |
| 原创练习 132 道（P01 14 道，P02–P08/I01/I02/I05/I06/I07/I08 各 8 道，I03 6 道，I04 8 道），分层提示、解析、收藏、错题标记 | 已实现 |
| 本地进度持久化、JSON 导出/导入、清空 | 已实现 |
| 真题索引 | 已实现外链索引，**5 条全部未在线复核**，只显示年份/卷别/题号/来源链接，不转载题干/图片/答案 |
| **题目实验（Round 15/16/17）** | **已实现 9 个原创·高考风格案例**：C01 边界出场、C02 交替磁区、C03 束线探测、C04 线框入场、C05 时变场+动生、C06 反向场+挡板、C07 可调分析器、C08 双棒接触、A17-01 电场加速→有限磁场→屏幕；全部 `full_problem_simulated`，同一舞台/统一时钟、逐问解析、答案输入与变式 |
| **教师题目工作台（Round 17）** | **已实现**：`/#/teacher/problems` 列表、编辑器、学生视图预览；A17-01/A17-02 模板，C01–C08 复制；本机私有存储、题包导入导出、白名单适配器、逐问答案重新绑定、来源/核验/权利独立标注与安全阻断。教师题不进入 16 模型计数或公开构建 |
| **A17-01 跨求解器连续仿真（Round 17）** | **已实现并验证**：电场加速 → 有限磁场 → 无场漂移 → 屏幕；A→B、B→C 的位置/速度/时间误差均为 0（门槛 1e−9），独立解析锚点与变式重算测试通过；无出场/未命中/屏幕越界不生成光斑 |
| **来源与授权分层（Round 15）** | 原创案例 `original_case/original/paper_and_solution_verified`；真题仅 `exam_reference/unverified/link_only`，`verifiedOnline` 与转载授权分离；审计见 [EXAM_SOURCE_AUDIT](docs/EXAM_SOURCE_AUDIT.md) |
| **设备检测（Round 15/17）** | `/#/device-check`：安全本地诊断、WebGL 丢失/恢复、rAF 探针、12 项人工检查默认 `NOT_TESTED`、脱敏 JSON 导出；schema v2 区分 `simulated` / 真机自述，声明不含教师内容与答案 |
| PWA 安装与离线缓存 | 已构建并通过无头 Chrome 离线实测（十六个模型、9 个案例、教师工作台/预览、设备检测、学习路线与 P01 3D 均可离线打开）；PWA 重载保留教师草稿与旧进度键；尚未在真实 iPad/Android 上验证 |
| **发布门禁（Round 18）** | 变式下标准推导默认折叠；完整本地备份/迁移（场景、132 题、案例、教师草稿、设备记录）；教师草稿不进入构建/PWA/precache；`smoke:headers` 验证 CSP/安全头 |
| **原生 Pilot（Round 18）** | `native/capacitor-pilot`：Capacitor 8.6.0、`webDir='../../dist'`、无 `server.url`、原生壳跳过 SW；**无 Android SDK/JDK/Xcode，APK/IPA 未生成** |
| **静态 HTTPS 部署包（Round 15/18）** | `netlify.toml`、CSP/安全头 `_headers`、`verify:static`（buildId + SHA-256 + secret/私有文件扫描）、`smoke:staging`、`smoke:headers`、`simulate:upgrade`；**外部部署 BLOCKED（无托管授权），没有公网 URL** |
| **统一学习路线** | **已实现**：`/#/path` 两条学生路线、真实讲解/预设/练习深链、上一站/下一站、教师演示路径与模型精确筛选 |
| P01/P04/P05/I01 | **已实现**：P01 3D 受力/3D 运动/2D 运动三子视图，P04 有限区域，P05 相反磁区，I01 B/面积/角度三模式；真实路由与练习回链 |
| I04 时变磁场 | **已实现**：四种解析波形、折点显式处理、手动连续调磁、B/Φ/ε/I 联动图像与教师方向图层 |
| P06 电磁复合场 | **已实现**：同区 E+B 解析运动、速度选择条件、E→B 三段解析分区、真实边界事件、多粒子与教师力矢量 |
| **P07 多级束线** | **已实现**：可选加速区、真实入口/出口狭缝与吸收板、E+B 选速、磁分析、末段电偏转、屏幕命中/越界；1–5 粒子、真实事件表、到达时间比较与教师图层 |
| I02 单导体棒切割磁感线 | **已实现**：四种驱动模式、符号一致的 ε/I/F_B、解析指数/恒力解、左端接触事件、连续手指推拉与估算热量、能量图像与教师图层 |
| P01–P07 场景持久化 | **已实现**：P01 三维版本 2 场景与旧 P01 受力场景迁移；P02/P03/P04/P05/P06/P07 版本 2 场景；刷新后 t=0 重建，收藏/错题独立保留 |
| 部署到公网 HTTPS | **BLOCKED**：构建/配置就绪，但无托管授权，未发布、无公网 URL |

物理引擎与交互测试结果见 [docs/QA.md](docs/QA.md) 与 Round 18 实测 [docs/ROUND18_QA.md](docs/ROUND18_QA.md)，物理约定见 [docs/PHYSICS_SPEC.md](docs/PHYSICS_SPEC.md)，参数输入语法/单位/提交语义见 [docs/PARAMETER_INPUT_SPEC.md](docs/PARAMETER_INPUT_SPEC.md)，逐控件覆盖见 [docs/PARAMETER_INPUT_AUDIT.md](docs/PARAMETER_INPUT_AUDIT.md)。题目案例 schema 与作者规范见 [docs/PROBLEM_CASE_SCHEMA.md](docs/PROBLEM_CASE_SCHEMA.md)，案例-模型映射与锚点见 [docs/CASE_MODEL_MAPPING.md](docs/CASE_MODEL_MAPPING.md)，真题来源审计见 [docs/EXAM_SOURCE_AUDIT.md](docs/EXAM_SOURCE_AUDIT.md)，部署步骤见 [docs/DEPLOYMENT_STAGING.md](docs/DEPLOYMENT_STAGING.md)，课堂设备验收见 [docs/CLASSROOM_DEVICE_QA.md](docs/CLASSROOM_DEVICE_QA.md)。Round 12 历史交接总结见 [docs/ROUND11_5_ROUND12_AGENT_SUMMARY.md](docs/ROUND11_5_ROUND12_AGENT_SUMMARY.md)；P08 与 P06/P07 的去重审计见 [docs/P08_SCOPE_DECISION.md](docs/P08_SCOPE_DECISION.md)；16 模型学习路线与覆盖核验见 [docs/ROUND14_MODEL_COVERAGE_AUDIT.md](docs/ROUND14_MODEL_COVERAGE_AUDIT.md)；Round 15 基线见 [docs/ROUND15_BASELINE_AUDIT.md](docs/ROUND15_BASELINE_AUDIT.md)；Round 16 缺口见 [docs/ROUND16_GAP_AUDIT.md](docs/ROUND16_GAP_AUDIT.md)，整题契约见 [docs/WHOLE_PROBLEM_SIMULATION_SPEC.md](docs/WHOLE_PROBLEM_SIMULATION_SPEC.md)，逐问证据见 [docs/CASE_FULL_SOLUTION_AUDIT.md](docs/CASE_FULL_SOLUTION_AUDIT.md)，Round 16 最终 QA 见 [docs/ROUND16_QA.md](docs/ROUND16_QA.md)，Round 17 基线见 [docs/ROUND17_BASELINE_AUDIT.md](docs/ROUND17_BASELINE_AUDIT.md)，教师题目规范见 [docs/ROUND17_PROBLEM_AUTHORING_SPEC.md](docs/ROUND17_PROBLEM_AUTHORING_SPEC.md)，复合物理证明见 [docs/ROUND17_COMPOSITE_PHYSICS_PROOF.md](docs/ROUND17_COMPOSITE_PHYSICS_PROOF.md)，发布与真机矩阵见 [docs/ROUND17_DEVICE_RELEASE_MATRIX.md](docs/ROUND17_DEVICE_RELEASE_MATRIX.md)，Round 17 QA 见 [docs/ROUND17_QA.md](docs/ROUND17_QA.md)，Round 18 QA 见 [docs/ROUND18_QA.md](docs/ROUND18_QA.md)，发布 runbook 见 [docs/ROUND18_STAGING_RUNBOOK.md](docs/ROUND18_STAGING_RUNBOOK.md)，数据迁移见 [docs/ROUND18_DATA_MIGRATION.md](docs/ROUND18_DATA_MIGRATION.md)，原生评估见 [docs/ROUND18_NATIVE_FEASIBILITY.md](docs/ROUND18_NATIVE_FEASIBILITY.md)。最近六轮（Round 13–18）的交接总览见 [SUMMARY.md](SUMMARY.md)；要把工作交接给其他 agent（架构地图、验证命令、禁止事项、路线图），先读 [SUMMARY.md](SUMMARY.md) 与 [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)。

## 本地启动

```bash
npm install
npm run dev
```

默认地址 `http://localhost:5173`。

在局域网内用平板调试：

```bash
npm run dev -- --host 0.0.0.0
```

然后在平板浏览器访问电脑的局域网 IP 与端口。PWA 安装与 Service Worker 需要 **HTTPS 或 localhost**（局域网 HTTP 只能用于页面调试，不能作为正式课堂部署）。

## 构建与测试

```bash
npm run typecheck        # TypeScript 项目检查
npm test                 # Vitest：物理、内容、练习与页面冒烟测试
npm run build            # 生产构建（含 PWA Service Worker）
npm run preview          # 本地预览生产构建，默认 4173
npm run test:tablet      # Playwright，对开发服务器做多视口/交互测试
npm run test:pwa         # 先 build，再对 preview 做离线/PWA 测试
npm run preview:staging  # 0.0.0.0:4174 生产预览（课堂/局域网）
npm run verify:static    # build + 检查 dist 静态产物完整性（含 secret/私有文件）
npm run smoke:headers    # 本地应用 CSP/安全头后打开首页/A17/教师页
npm run smoke:staging -- https://<真实 staging URL>  # 只接受显式 URL
npm run simulate:upgrade # 本地 Build A→B SW 更新与数据保留模拟
```

Playwright 使用本机 **Google Chrome 156 headless**（`channel: 'chrome'`）；CDP 触摸、无头帧率与 `vite preview` 都不是真实平板/公网验收。截图与证据见 [docs/ROUND15_QA.md](docs/ROUND15_QA.md) 和 [docs/screenshots](docs/screenshots)。

Round 18 最终实测：`npm run typecheck` 通过；Vitest **607 / 607**（57 文件）；Playwright **183 / 183**；PWA **3 / 3**；`npm run verify:static` 输出 `Static build OK: 72 JS, 1 CSS, assets 4249.4 KiB, 140 files`（release manifest schemaVersion 2 + buildId）。生产构建入口 JS **340.35 kB（gzip 103.65 kB）**；CSS **140.99 kB（gzip 28.84 kB）**；PWA 预缓存 **144 项 / 4308.13 KiB**。P01ThreeDStage 仍约 978 kB（gzip 263 kB）且只在 P01 3D 中加载。无头 Chrome 数字仅作相对比较，不是真机 60 fps 结论。完整证据见 [ROUND18_QA](docs/ROUND18_QA.md)。

Round 17 最终实测：`npm run typecheck` 通过；Vitest **593 / 593**（54 文件）；Playwright **180 / 180**；PWA **3 / 3**；`npm run verify:static` 输出 `Static build OK: 71 JS, 1 CSS, assets 4239.4 KiB, 139 files` 并生成 `dist/release-manifest.json`。生产构建入口 JS **339.74 kB（gzip 103.33 kB）**，CSS **140.61 kB（gzip 28.78 kB）**；教师列表/编辑器/预览 chunk 分别为 **17.82 / 25.07 / 4.54 kB**；PWA 预缓存 **143 项 / 4298.11 KiB**。P01ThreeDStage 仍约 **978.52 kB（gzip 263.16 kB）** 且只在 P01 3D 中加载。以上 Playwright/PWA 数字均为 SIMULATED/headless，不是真机 60 fps 或真实 iPadOS/Android 通过。完整证据见 [ROUND17_QA](docs/ROUND17_QA.md)、[ROUND17_COMPOSITE_PHYSICS_PROOF](docs/ROUND17_COMPOSITE_PHYSICS_PROOF.md) 与 [ROUND17_DEVICE_RELEASE_MATRIX](docs/ROUND17_DEVICE_RELEASE_MATRIX.md)。

## 部署到 HTTPS 静态托管

**当前状态：BLOCKED — 本环境没有托管账号/站点授权，未执行外部部署，也没有公网 URL。** 完整步骤、验证清单与回滚流程见 [docs/DEPLOYMENT_STAGING.md](docs/DEPLOYMENT_STAGING.md)。

1. `npm ci && npm run typecheck && npm run build && npm run verify:static`。
2. Netlify 配置已就绪：`netlify.toml` 使用 `npm run build`、发布 `dist`、HashRouter 回退；`public/_headers` 设置 `sw.js`/manifest 不缓存、`/assets/*` 长缓存。
3. 获得授权后登录平台并生产发布（例如 `npx netlify-cli deploy --prod --dir=dist`），记录平台返回的真实 HTTPS 地址与 deploy ID；只有此时才能声称已部署。
4. 发布后逐项验证 `/#/`、`/#/cases`、`/#/cases/case-c01-boundary-exit?stage=...`、`/#/path`、`/#/device-check` 及 16 个模型深链接的直接刷新，`manifest.webmanifest`/图标/`sw.js` 响应头，首次加载后的离线重载，更新后本地进度与世界场景保留。
5. 真实设备安装/离线/更新验收按 [CLASSROOM_DEVICE_QA](docs/CLASSROOM_DEVICE_QA.md) 执行，默认 `NOT_TESTED`。`http://localhost` 生产预览不是公网 HTTPS 部署。

本环境没有部署权限，因此没有对外发布地址，也没有使用真实 iPad/Android 设备做安装测试。CDP/无头浏览器触摸结果均不是真机通过。

## 平板使用说明

- 顶栏：首页 / 粒子运动 / 电磁感应 / **题目实验** / 学习路线 / 练习与真题 / 我的记录。
- **题目实验**：`/#/cases` → 选择案例 → 读题/预测 → 查看符号映射与模型覆盖 → 启动真实模型 → 返回题目 → 显示推导与期望值 → 变式。启动案例前会保存该模型的个人场景，返回时恢复；案例进度独立存储，不覆盖 132 道题、收藏、错题、学习路线或其它模型场景。
- **设备检测**：`/#/device-check`。环境信息、WebGL 丢失/恢复、10 秒/60 秒 rAF 调度探针为自动化或模拟结果；12 项课堂检查默认 `NOT_TESTED`，必须由真实设备操作后改为 `PASS/FAIL/BLOCKED/N/A`。导出 JSON 不含答案、场景、进度或身份信息。
- 模型页默认进入 **引导学习**；可切换 **自由实验**；**教师视图** 隐藏控制台，下方保留实时数据与公式 dock，适合投屏。
- **P02/P03 多粒子**：默认一个粒子；在粒子条点“添加/复制当前”最多到 5 个。所有粒子共享同一磁场/边界和全局时钟，但各有独立初态、轨迹、事件、launchTime 与可见性。粒子条可点选粒子；只有选中粒子显示操作手柄和详细几何。
- **播放中单粒子编辑**：拖动选中粒子的入射点/发射点或速度方向时，只显示该粒子的新初态预测；全局时钟不暂停、不归零，B/C 继续运动。松手只把 A 的 launchTime 设为当前全局时间，其他粒子不被重置。原先播放则继续，原先暂停则保持暂停。
  - 数值框改变 q/m/v 或快捷电荷只重发射当前粒子；拖动“添加”出来的新粒子也从当前 tGlobal 发射。
  - 双指缩放不会修改初态；第二根手指在拖动中加入会取消草稿，不提交半完成编辑。
  - 修改共享 B 或 P03 共享边界是“更换实验环境”，会显示全场预览并同步从 t=0 重新演示；P03 边界拖动预览期间冻结时钟。
- **P01 真实三维洛伦兹力**：顶部切换“3D 受力 / 3D 运动 / 2D 运动”。
  - **3D 受力**：单指在空白处旋转相机，双指缩放/平移；拖动 44 px 的 r₀/v 手柄，拖动平面固定为 XY/XZ/YZ 三选一，未被拖动的分量保持不变。相机预设包括正视 +z、侧视 +x、俯视 +y、斜视和重置；B 在接近视轴时用 ⊙/⊗ 方向徽标提示出/入屏。B 只能通过单独标注的 Bx/By/Bz 控件修改，不会被粒子手柄误改。
  - **3D 运动**：共享静态 B 与全局 tGlobal，1–5 个粒子各有 r₀、v₀、q、m、颜色、可见性和 launchTime。播放中拖动 A 的手柄只改 A 的候选轨迹，B/C 继续运动；松手只把 A 从当前 tGlobal 重发射。共享 B 变化会明确整场重算并从 t=0 重演。相机旋转/缩放不改变 B、v、F、q、m 或仿真时间。
  - **2D 运动**：保留原有 P02 Bz 平面解析视图、多粒子和教师全矢量，适合快速课堂对比。
  - 无 WebGL、上下文丢失或创建失败时自动显示原有 2D 受力 SVG 和“切换到二维运动”入口；不会留下空白画布。
- **P03 有界磁场**：每个粒子独立显示入场、出射、相切或无入场状态；同一场中可以同时存在正常出场、相切无出场和无入场粒子。教师视图可显示全部圆心/矢量，公式可显隐。
- **P04 有限磁场**：顶部/参数区切换条形或矩形，修改 x/y 边界与 Bz 会整场重算；单粒子手柄只改该粒子。数据面板列出真实入场/出场/相切/角点事件、出射边和场内时间。
- **P05 相反磁区**：2–4 个竖直区域，每区独立 Bz；跨界时间、区内停留时间、R/T 与不同 launchTime 都来自同一解析事件序列。数据面板的“同一全局时刻位置”只做严格时间对照，不把轨迹交叉当碰撞。
- **I01 磁通量与楞次**：顶部固定“改变磁场 / 改变面积 / 转动线圈”。B 模式播放中拖动右侧 B 手柄（复用 I04 的 0.4 s ramp 实际斜率）；面积模式拖动滑动边；角度模式可自动旋转或手动转动并 unwrap 跨越 0/2π。一次只让一个量连续变化，N/R/开闭是结构参数；历史曲线按真实时间记录，暂停时不记假变化。
- **数学表达式参数**：每个物理数值框都可直接输入 `1/3`、`√3/2`、`(1+√5)/2`、`2π`、`1e-9`、`2(1+√3)` 等；Enter/软键盘 Done 或点走提交，Escape 取消。合法值不受滑动条范围限制（例如 P02 的 B 滑块 0–1.5 T，但可提交 5 T），滑块会标明“超出快捷范围”且实验仍使用真实值；非法表达式显示原因并保持上一次有效实验。聚焦时出现 `√( ) π / ( ) ^ ×10^` 快捷符号。单粒子编辑仍只重发射当前粒子；I01/I04/I05 手动目标仍使用 0.4 s ramp；I02/I05/I06 手指推拉/拖动仍由真实触摸时间戳驱动。详见 [参数输入规范](docs/PARAMETER_INPUT_SPEC.md)。
- **场景持久化**：P02/P03/P04/P05/P06/P07 使用版本 2 场景 JSON；旧 P02/P03 单粒子参数会自动迁移为 A。P01 三维场景使用 `emplab.p01.three.scene.v2`（含 r₀、v₀、launchTime、选中粒子），并能从旧 `emplab.p01.force.scene.v1` 迁移 q/m/v/B；P01 2D 平面场景使用独立 v2 键。I01 参数/模式/图层本地校验持久化；I02 持久化参数、模式与图层。P07 使用 `emplab.p07.scene.v2` 保存束线装置、1–5 粒子和 runtime，并校验区间次序、孔径和屏幕范围；I05/I06/I07 使用独立 `emplab.i05.scene.v2` / `emplab.i06.scene.v2` / `emplab.i07.scene.v2`；P08 使用 `emplab.p08.scene.v2` 保存公共 E/B、目标线段、时间窗、反求设置和 1–5 粒子；I08 使用 `emplab.i08.scene.v2` 保存线圈/场/负载/开关时间线。页面刷新后在 t=0 重建。练习、收藏、错题和 132 道题的本地进度独立保存。P06 切换同区/分段模式会载入对应单粒子示例（视为更换实验定义）。
- **I05 运动线框**：`/#/induction/coupled-loop`。M1 匀速约束、M2 自由动力学、M3 手动调磁、M4 手动拖线框；同一快照分解 ε_t/ε_m，显示 I、F_Bx、场源功率/功、焦耳热与能量残差。M3 的 B 目标按 0.4 s / 4 T/s ramp，M4 使用真实时间戳手势；第二指取消。
- **I06 双导体棒**：`/#/induction/dual-rods`。D1 自由双棒、D2 恒力驱动、D4 手推杆 1/2；两杆共享一个回路电流，磁场力成对反对相对运动，质心动量与能量独立核对；首次接触时解析解停止，不模拟碰撞。
- **I04 时变磁场**：线圈固定，选择恒定、线性、正弦或三角波 B(t)，或切换到手动调磁。播放中上下拖动舞台右侧 B 手柄即可连续改变 B；停止拖动后 B 保持，ε、I 在 0.4 s 仿真 ramp 结束后回到 0。数据面板的 B/Φ/ε/I 共用同一时间轴，折点会明确标注“不可导”并显示左右斜率。
- **P06 电磁复合场**：顶部切换“同区 E+B”与“电场→磁场”。同区模式提供速度选择条件、E/F_E/F_B/合力与多粒子轨迹；分段模式显示自由区、电场区、磁场半平面和真实跨界/折返/相切事件。选中粒子初态编辑不暂停其他粒子；E/B/边界变化整场重演。
- **P07 多级束线**：顶部只有一个共享束线舞台；参数区可改加速开关/E_x、选速 E_y/B_z、分析 B_z、末段 E_y、入口/出口孔径、屏幕位置/高度和各区段长度。粒子源点/速度方向手柄只改选中粒子；播放中编辑 A 时 B/C 继续运动。绿色/橙色/紫色区域分别表示选速、磁分析与末段电场；黑色厚线是狭缝外的吸收板，紫色粗线是屏幕有效高度。数据面板给出实时/最终判定、全局/局部到达时刻、屏幕 y 与同刻位置距离；只有真实命中才出现实心光斑，越界交点保持虚线方框。
- **I02 单导体棒**：四种模式——匀速切割、自由滑行、恒力驱动、手指推拉。前三种可拖动“初始位置”手柄预览并重演；手指推拉直接拖导体棒，时间不归零，速度由最近约 0.12 s 的位置样本估计。松手后 ε/I/F/P 归零并保留历史曲线；该停止是外部约束，不是自由滑行。开路保留 ε 但 I=F=P_J=0。
- 舞台工具栏：
  - **操作元素**：拖动白圈（P02 入射点 / P03 发射点）、拖动速度箭头端点（方向）、拖动线框或磁场边界（I03/P03）、拖动 I02 导体棒（手指模式）或初始位置手柄、拖动 I01 的 B 手柄/面积滑动边/旋转手柄。
  - **平移视野**：单指平移舞台。双指缩放始终可用。
  - **适配视图 / ±**：重置或调整缩放。
- 每个参数都有滑块与可直接输入的数值框。强烈建议课堂使用数值框复现精确条件。
- 播放条支持暂停、上一/下一关键帧、时间轴拖动与回到起点。关键帧包含 P02 的四分之一周期、P03 的入场/出场（及相切接触）、I03 的进入/完全进入/离开/完全离开、I02 的速度过零/左端接触/时间常数、I01 的旋转角关键点、I04 的波形过零/极值/折点，以及 I05 的几何/折点事件与 I06 的接触/相对速度过零事件。I01 手动/自动实验与 I02 手指模式、I04 手动模式固定 1× 实时，避免把播放慢放误当成导数时间。
- 练习作答前默认隐藏答案；点“看提示”才会逐层展开。错误后会继续给出下一层提示。解析与常见错误在提交后可见。
- 学习记录仅存储在本机 `localStorage`，可在“我的记录”导出/导入 JSON。

## 物理范围说明

### P01

三个子视图，共用同一套物理状态：

- **3D 受力检查**：真实 WebGL 透视场景。共享 `B=(Bx,By,Bz)`，每个粒子独立 q、m、r₀、v₀；解析计算 `F_B=q(v×B)`、`|F_B|=|q||v||B|sinθ`、`F_B·v=0`、`F_B·B=0`。q=0、B=0、v=0、v∥B 时零力不画方向箭头。相机旋转/缩放只改变屏幕投影，世界分量、初态和仿真时间不变。
- **3D 运动**：静态均匀 B 下的解析解，`b=B/|B|`、`ω=−q|B|/m`：
  ```text
  vPar=(v0·b)b，vPerp=v0−vPar，C=b×vPerp，θ=ω(t−launch)
  v(τ)=vPar+vPerp cosθ+C sinθ
  r(τ)=r0+vPar τ+vPerp sinθ/ω+C(1−cosθ)/ω
  ```
  小 `θ` 使用 `sinc/cosc` 级数，`B→0` 连续退化为直线。按 `v⊥`、`v∥` 区分静止、直线、圆和螺旋；`R=mv⊥/(|q||B|)`、`T=2πm/(|q||B|)`、`p=v∥T`。`v⊥=0` 不虚构半径，`v=0` 保持静止。轨迹、当前位置、v/F、时间轴和教师层全部来自同一时刻的解析快照。
- **2D 运动**：令 `B=(0,0,Bz)`、速度在 xy 平面，复用 `uniformB.ts` 与多粒子控制器，作为原有的快速教学视图保留。
- 1–5 个粒子共享 B 与 tGlobal；每个粒子有独立 launchTime。播放中编辑 A 只重发射 A，共享 B 变化整场重算。粒子之间无库仑力、相互作用磁场或碰撞。
- 质量不改变瞬时 `F_B`，只影响加速度和未来轨迹；负电荷与正电荷在同一 v、B 下受力相反。

### P02

采用 SI 解析解：

```text
ω = qBz/m
v(t) = R(−ωt) v0
c = p + (vy/ω, −vx/ω)
r = |v| / |ω|
T = 2π / |ω|
```

- 仅磁场，忽略重力、辐射阻尼与相对论修正；多个粒子之间没有库仑力、相互作用磁场或碰撞。
- 每个粒子用同一 Bz 独立求解；同参数、同初态粒子应完全重合。全局时间 tGlobal 与每个粒子的 launchTime、局部 τ = tGlobal − launchTime 分开。
- 速度以 `10⁶ m/s`、质量以 `10⁻²⁶ kg` 为显示单位；引擎内部仍按 SI 计算，因此实际周期在纳秒量级。动画为按周期归一化的示教慢放。
- `B=0`、`q=0`、`v=0` 等边界输入会给出直线/静止的状态与提示，不产生 NaN。

### P03

一条无限直线边界，场区在法向一侧。采用解析分段解：

```text
n·(r−b) > 0   : 场内；n·(r−b) ≤ 0 : 场外
ω = −qBz/m
R = m|v| / |qBz|
T = 2π/|ω|
c = re + (−vey/ω, vex/ω)
```

- 场外为直线；只有速度法向分量指向场内、且在正时间与边界相交时才真正入场。起点在边界上时，用瞬时速度与短时间洛伦兹力方向判断是否相切向内/向外。
- 场内为圆弧；与边界的真实交点按旋转方向和法向速度筛选第一个“场内 → 场外”的离场事件，场内时间 `t = Δφ/|ω|`。
- 相切只接触边界，不是出射；圆完全在场内或仅内切时没有出场事件，可演示完整周期。
- UI 的边界固定为竖直、场区在右；纯求解器接受任意单位法向，但本版不提供旋转边界控件。发射点在场外、边界上或场内均有明确状态；场外发射点与真实入射点分开标记。
- 忽略重力、电场、相对论修正、边缘效应和多区域场；粒子之间无相互作用。
- 每个粒子独立求入场/出场/相切；共享边界或 B 的变化是重新演示全部粒子，不是运动中的连续时变外场。单粒子初态编辑只按当前全局时间重发射该粒子。

### P04

条形区域 `xMin<x<xMax` 或矩形区域 `xMin<x<xMax, yMin<y<yMax` 内 `Bz` 常量，外部 `B=0`。在无场区为直线、有场区为圆弧，使用解析边界求交：

- 圆心、半径和周期：`c=r0+(−vy/ω,vx/ω)`、`R=m|v|/(|qBz|)`、`T=2πm/(|qBz|)`。
- 入场/出场要求前向正时间的真实交点；每次真实跨界都保持位置和速度连续。
- 相切只记录 tangent，不切换区域；矩形角点同时命中两条边时合并为一个 corner-contact 事件。
- 临界宽度、窄条带右侧出射与宽条带同侧返回由同一求解器输出；事件时间与可视采样密度无关。

### P05

`boundaries` 把平面划分为 2–4 个竖直区域，每区独立 `Bz`（可为 0）；跨区时位置和速度连续，下一段重新计算 `ω、R、T`：

- 双半平面基准：右侧 `Bz=+1`、左侧 `Bz=−1`，`q=m=1` 从 (0,0) 以 v=(1,0) 进入右侧，t=π 在 (0,−2) 跨界，t=2π 在 (0,−4) 再次跨界。
- 无场区段为直线；相切不切区；事件时间严格递增，达到事件上限时明确标记 `event-limited`。
- 多粒子共享区域配置与全局时钟，独立 launchTime；数据面板只在同一个 tGlobal 比较位置，轨迹交叉不自动标为相遇或碰撞。

### I01

线圈固定于空间，正法向 +n 与 +z 夹角 θ；外场 `B=(0,0,Bz)`：

```text
Φ = Bz A cosθ
Ψ = NΦ
ε = −dΨ/dt
I = ε/R（闭合）；I=0（开路）
P_J = I²R
ε = −N[ A cosθ dBz/dt + Bz cosθ dA/dt − Bz A sinθ dθ/dt ]
```

- **改变磁场**：B(t) 可自动线性变化，也可在播放中拖动 B 手柄；手动目标按 I04 的 0.4 s ramp 跟随，ε 使用实际斜率，停止后归零。
- **改变面积**：A=Lx，滑动边位置有下限；扩大/缩小面积时 ε/I 符号反转。手动位置用单调时间戳估计 dA/dt，停手后速度衰减；这是外部规定形变，不求反作用力/自感。
- **转动线圈**：自动模式 `θ=θ0+ωt`，`ε=N Bz A ω sinθ`，θ=0/π 时 ε=0、θ=π/2 时峰值；手动角度 unwrap，跨越 359°/1° 不产生假尖峰。
- 开路时 ε 仍存在但 I=P_J=0；Φ 与 Ψ、单匝与 N 匝不混用；楞次定律阻碍磁通量的变化，不是“感应场总与原磁场反向”。

### I03

磁场是一条竖直方向的无限长条形区域；矩形刚性线框沿水平方向平移。

```text
Φ = Bz · S_有效
ε = −dΦ/dt
I = ε/R
F_x = Σ (I dl × B)_x
```

- 正电流为从纸外看的逆时针；进入/离开阶段的电流方向相反，安培力始终阻碍相对运动。
- 完全进入匀强磁场后总 ε = 0、I = 0；左右竖直边各自有动生电动势，但沿闭合回路相互抵消。
- 自由滑行只受安培力，按固定步长 RK4 积分，并对焦耳热 `∫I²R dt` 与机械能损失做核对。
- 忽略自感、边缘效应、摩擦与空气阻力；仅支持单一匀强磁场区，不支持反向分区或碰撞。

### I02

单根导体棒横跨平行导轨，左侧电阻闭合回路；Bz 在单次实验内恒定。取 +z 出纸面、正电流逆时针：

```text
Φ = Bz L x
ε = −dΦ/dt = −Bz L v
I = ε/R（闭合）；I = 0（开路）
k = Bz²L²/R
F_Bx = I L Bz = −k v
P_J = k v² = −F_Bx v
```

- **匀速切割**：`v=v_set`，`F_ext=k v`；闭合时 `W_ext=Q_J=k v²t`，`ΔK=0`。
- **自由滑行**：`v=v0e^{−αt}`、`x=x0+v0(1−e^{−αt})/α`、`K+Q_J=K(0)`，接触前成立；`k=0` 严格退化为匀速。
- **恒力驱动**：`v=v∞+(v0−v∞)e^{−αt}`，`v∞=F_ext/k`；位置为解析积分，`Q_J` 使用独立解析式并核对 `W_ext−ΔK−Q_J≈0`。
- **手指推拉**：直接拖棒构成连续外部规定运动；速度由最近约 120 ms 的时间戳位置样本估计，松手强制归零并保留历史。它是估算过程，不声称能量守恒涵盖外部停止。
- 只允许 `x>0`；首次接触 `x=0` 时停止并标记 `boundary-stop`，接触耗能不计入焦耳热。`R=0`、非正质量/间距、非有限输入安全拒绝。
- 忽略自感、摩擦、空气阻力、运动导轨电阻、碰撞耗散、非均匀/时变磁场和粒子间效应。

### P06

两种可运行模式：

- **同区 E+B**：均匀静态 `E=(Ex,Ey,0)` 与 `B=(0,0,Bz)`，使用解析解 `v=v_d+Rot(ωt)(v0−v_d)`、`ω=−qBz/m`、`v_d=(Ey/Bz,−Ex/Bz)`；`Bz→0` 用稳定展开退化到纯电场。
- **电场→磁场**：自由区 `x<−d`、电场区 `−d≤x<0`、磁场半平面 `x≥0`；按段求最早真实边界事件，位置/速度连续、加速度可跳变，支持折返、出射后再入电场、相切无跨界和事件上限。

同区速度选择只在 `q≠0、Bz≠0、v0=v_d` 时给出零合力直线；没有真实狭缝/吸收板时只是条件演示，不能声称物理筛选。多粒子共享场和全局时钟，粒子间无相互作用与碰撞。

### P07

P07 是独立的多级束线模块，不是 P06 的换皮页面。沿 x 轴依次为：可选加速区、自由漂移、入口狭缝/吸收板、E+B 速度选择器、出口狭缝/吸收板、磁分析区、末段电偏转区、屏幕。所有粒子按当前位置的场演化，只有真实狭缝开口、吸收板与屏幕事件能终止或切换轨迹。

- 场内运动为解析状态；纯 B 为圆弧，纯 E 为抛物线，E+B 使用漂移速度 + 旋转速度的解析解。场区边界用解析状态求值并按 `v_x=0` 的单调区间括根、二分，不依赖动画采样。
- 狭缝开口按 `|y−y_c|≤halfWidth` 判定（等号通过）；开口外为吸收板。屏幕在有效高度内返回 `screen-hit`，范围外返回 `screen-outside`，二者都终止并保留真实终点；时间/事件上限返回 `not-arrived` 或 `event-limited`，不伪造光斑。
- 同区边界的相切只记录 `tangent`、不切换区域；`v_x=0` 的内部转折记录 `turning`。位置、速度在跨界处连续，磁场不做功，电场做功按 `ΔK=qE·Δr` 核对。
- 1–5 粒子共享装置和全局时钟，各有独立 `launchTime` 与初态；播放中编辑 A 只重发射 A，B/C 保持自己的发射时刻和运动；改变公共场/狭缝/屏幕/区段长度才整场重演。
- 数据面板同时给出实时状态与最终解析判定、全局/局部到达时刻、屏幕 y 或吸收板位置，以及同一 `tGlobal` 的真实位置和距离。轨迹相交不等于同时到达。
- 场景使用 `emplab.p07.scene.v2`，支持导入导出、1–5 粒子上限、区间次序与孔径/屏幕范围校验；刷新后在 t=0 重建。P07 为 2D SVG，不加载 three/R3F。

### I04

线圈与磁场区域固定，只让垂直穿过回路的 Bz 随时间变化。取 +z 出纸面、从 +z 看逆时针电流为正：

```text
Φ = Bz A
Ψ = NΦ
ε = −dΨ/dt = −N A dBz/dt
I = ε/R（闭合）；I = 0（断开）
P = I²R
```

- 四种预设：恒定、线性、正弦、连续分段线性/三角波；线性/正弦/三角波使用解析或严格分段斜率，不用逐帧差分。
- 三角波折点处 `dB/dt` 不唯一：数据层显式返回 `kink`，同时提供左右斜率；UI 不伪造唯一方向或零电流，曲线显示有限跳变。
- 手动调磁：拖动是相对手势，目标值在 0.4 s 仿真时间的线性 ramp 内跟随，斜率上限 4 T/s；ε 使用实际 ramp 斜率计算。1× 为真实仿真时间，暂停时不记录变化；这是带平滑/延迟的估计值，预设波形仍为解析精确。
- 断开回路时 ε 仍可非零而 I = 0；`B = 0` 但斜率非零时 ε 不消失。忽略自感、互感、电容、辐射与线圈反馈。

详见 [docs/PHYSICS_SPEC.md](docs/PHYSICS_SPEC.md)。

## 内容与版权

- 132 道题均为 **原创**，没有把原创题标成高考真题；题目标注 `original` 并通过 Zod 校验、答案核对和 KaTeX 渲染校验。P01 14 道，P02–P08/I01/I02/I05/I06/I07/I08 各 8 道，I03 6 道，I04 8 道；I08 覆盖相位、峰值/有效值、开路、负载/内阻功率与手动估计，P08 覆盖相切/穿越、方向与时间窗过滤、纯 E 反求、选速反求、临界与多解，I07 覆盖带符号通量、零磁通非零电动势、弹性/非弹性碰撞与能量分账；P04 覆盖条带/矩形出射边、临界、相切、角点与场内时间，P05 覆盖双区/多区、跨界时间、区内半径、相同时刻到达与轨迹交叉辨析，P07 覆盖选速、狭缝吸收、磁分析半径、末段电偏转、屏幕落点/总时间、能量与多粒子到达时刻。
- 真题页只提供年份/卷名/题号/考点/外链，**未在线复核**，不转载题干、图片或答案，也不自动评分或声称实验完整复现真题。详见 [docs/EXAM_SOURCES.md](docs/EXAM_SOURCES.md)。
- 未使用 PhET、GeoGebra 或其他项目的源码、截图或商标；视觉与代码均为本项目实现。

## 目录结构

```text
src/
  app/           路由与顶栏
  components/    通用 UI、舞台工具栏、播放条、KaTeX；three/ 3D 箭头、坐标指示器、WebGL 回退
  content/       讲解、原创题、真题外链索引、题目案例/逐问数据、Zod schema（problemCaseSchema/problemCases/caseSolutions）
  features/      引导讲解、练习卡片、本地进度、案例会话与场景备份（features/cases）
  hooks/         持久化、播放时钟、舞台缩放/平移
  lib/           数值/单位格式化、应用版本标签
  physics/       P01 三维叉乘与 uniformB3D 解析解、P02 解析解、P03 半平面边界、P04 有限区域、P05 多磁区、P06 E+B/分段场、P07 多级束线与器件事件、I01 磁通/楞次、I02 单棒解析/手势估计、I03 磁通量、I04 时变场、I05 运动线框快照/RK4/手动 B，I06 双棒解析/接触、I07 反向场/挡板、I08 交流发电机、多粒子状态控制
  simulations/   各模型注册、参数/场景预设、P01 3D 场景/WebGL 页面与 2D 舞台、P02–P08/I01–I08 页面
  pages/         案例列表/详情、设备检测、学习路线、练习、进度等路由页
  styles/        全局平板优先样式
tests/
  physics/       物理正确性测试
  content/       题库、预设、课标/真题索引、题目案例、静态部署约束
  integration/   练习卡片、讲解流程、页面冒烟、案例会话
  tablet/        Playwright 多视口、触控与 Round 15 案例/设备检测
  pwa/           生产构建离线测试
docs/            需求、物理规范、内容映射、来源审计、案例 schema/映射、部署、设备 QA、决策与截图
```

## 尚未完成 / 下一步

1. Phase 1 已完成十六个可运行模型（P01–P08、I01–I08）+ 9 个原创整题案例；下一轮优先做真实平板课堂验收与案例教学试点。
2. 真题复核与授权材料流程：5 条索引全部 `unverified` / `link_only`；对照权威原卷与至少一个独立可信解析、取得明确授权后，才可展示更多内容。
3. **真实外部 HTTPS 部署 BLOCKED（无托管账号/站点授权）**；获得授权后按 `docs/ROUND18_STAGING_RUNBOOK.md` 发布并运行 `smoke:staging`，不得用 localhost 预览冒充公网部署。
4. **原生 APK/IPA BLOCKED**：本机无 Android SDK/现代 JDK/Xcode；`native/capacitor-pilot` 已就绪，详见 `docs/ROUND18_NATIVE_FEASIBILITY.md`。
5. 真实 iPadOS Safari / Android Chrome 设备、离线首开、横竖屏切换、软键盘、WebGL 上下文恢复与低性能帧率实测；当前全部 `NOT_TESTED`，自动化/CDP 结果标 `SIMULATED`。
6. 教师自定义预设、分步填空/解答题、手写批注属于后续阶段。
7. 可选的题库继续扩展；当前 132 题覆盖 P01–P08 与 I01–I08，9 个题目案例单独计数，不加入 132 题。
8. **P04/P05/P07 与 P01 3D 都必须在真实 iPadOS Safari / Android Chrome 上验收**：单指旋转、双指缩放、手柄拖动、第二指取消、狭缝/屏幕触控、横竖屏、WebGL 上下文恢复、离线首开、五粒子教师层与发热/续航。无头 Chrome 的 rAF 数字不是真机 60 fps 证据。
9. P01 3D chunk 约 978 kB（gzip 263 kB），虽然仅在 3D 视图加载，仍可评估 three/R3F 的进一步按需拆分；I04/P01/I01/I05/I06 首屏 KaTeX 与图表仍有优化空间。
10. P07 首版是二维 x–y、竖直分区与理想薄板；不支持任意多边形、时变场、衍射、粒子碰撞、空间电荷、探测器噪声或相对论修正。P06 分段场与 P07 都可继续扩展这些方向。

本项目为教学辅助工具，不替代教师讲解、实验操作与正式教材。所有未核验内容在界面中明确标注“待核验 / 未在线复核”。
