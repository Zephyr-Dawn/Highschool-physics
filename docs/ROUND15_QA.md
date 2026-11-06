# Round 15 QA 与交付证据（Track A / Track B）

测试日期：2026-11-04  
工作区：`H:\programming\EM_Physics_Lab`（Windows 10.0.26100，**非 git 仓库**）  
结论：代码、测试、构建与本地生产预览通过；**外部 HTTPS 部署 BLOCKED，真实平板 NOT_TESTED**。

## 1. 最终命令与结果

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **通过**（`tsc -b --noEmit`，无错误输出） |
| `npx vitest run` | **541 / 541 通过**，48 个文件（Round 14 基线 521/44，新增 20） |
| `npx playwright test` | **165 / 165 通过**，约 7.3 分钟（基线 159，新增 6） |
| `npm run test:pwa` | **2 / 2 通过**（生产构建 + SW + 离线） |
| `npm run build` | **通过**；入口 336.85 kB（gzip 102.48），CSS 125.95 kB（gzip 26.24），PWA 125 项 / 4094.90 KiB |
| `npm run verify:static` | **通过**：`Static build OK: 53 JS, 1 CSS, assets 4036.2 KiB, sha 8376` |
| `npm run preview:staging` | 已配置，未作为公网部署验证；`http://localhost:4174` 不是 HTTPS 外部发布 |

环境：Node.js v22.20.0 / npm 11.7.0；Playwright 1.64.1，`channel: 'chrome'`，本机 Chrome 156 headless；Vite 7；React 19；Windows x64。真实 iPadOS Safari、Android Chrome、系统 VoiceOver/TalkBack、软键盘与发热均未测试。

## 2. Track A — 题目实验

### 2.1 交付内容

- `/cases` 列表：6 张原创案例卡、阶段/模型摘要、本地完成状态、来源审计入口、设备检测入口。
- `/cases/:caseId?stage=...` 详情：读题/预测 → 符号映射与模型覆盖 → 启动真实实验 → 隐藏推导 → 变式 → 最终检查；教师模式可显隐答案。每个案例带独立验算与量纲核对（如 `ε=Sv` 的 `T·m·m/s=V`、碰撞动能差的 `J`）。
- 启动实验使用真实模型路由与现有 `?preset=`，不复制求解器；启动前 `backupCaseScene(modelId)`，返回时 `restoreCaseBackups()`；案例进度在 `emplab.cases.progress.v1`，与答题/场景/学习路线隔离。
- 案例数据由 Zod 校验；阶段只允许 16 个真实 model ID 与已存在的 preset ID；URL 只接受 `/#/cases/<id>?stage=<id>`，不执行外部脚本或任意 JSON。

### 2.2 六个案例与独立锚点

| 案例 | 模型/预设 | 覆盖 | 独立验证锚点 |
|---|---|---|---|
| C01 边界出场 | P04 `p04-strip-cross` | `exact_model` | 出场 `t=π/6`、`(0.5, 1−√3/2)`、`v=(√3/2, 1/2)` |
| C02 交替磁区时序 | P05 `p05-two-halves` / `p05-cross-not-simultaneous` | `exact_model` + `concept_illustration` | `t=π→(0,−2)`、`t=2π→(0,−4)`；A 在 `t=1 s`、B 在 `t=2 s` 到达同一交点 |
| C03 束线/屏幕 | P07 `p07-standard` / `p07-screen-miss` | `exact_model` 多阶段 | 命中屏幕 `y=1.0893163975 m`、局部时间 `3.678299314 s`；越界为 `screen-outside` |
| C04 线框入场 | I03 `i03-default` | `exact_model` | `t=0.1 s`: `Φ=0.01 Wb`、`ε=−0.3 V`、`I=−0.6 A`、`F=−0.12 N` |
| C05 时变场+动生 | I05 `i05-reinforce` | `exact_model` | `t=0.5 s`: `ε_t=−0.5`、`ε_m=−2.5`、`ε=−3 V`、`I=−1.5 A`、`P_J=4.5 W` |
| C06 反向场+挡板 | I07 `i07-interface` / `i07-inelastic-wall` | `exact_model` 多阶段 | `Φ=0, S=−2, ε=2 V, I=2 A, F=−4 N, P=4 W`；挡板 `v_after=−0.5 m/s, Q_impact=0.375 J, Q_J=0` |

覆盖：3 个粒子案例（C01/C02/C03）、3 个感应案例（C04/C05/C06）、3 个多阶段（C02/C03/C06）。所有锚点由独立公式/解析解核对，且测试同时与真实预设/求解器交叉验证；不是把引擎输出回填成“标准答案”。

### 2.3 真题来源与授权

- 5 条 `EXAM_REFERENCES`：`sourceKind='exam_reference'`、`verification='unverified'`、`rights='link_only'`、`verifiedOnline=false`；应用不显示题干、图片、答案，也不自动评分。
- 6 个案例：`sourceKind='original_case'`、`verification='paper_and_solution_verified'`、`rights='original'`；标注“原创·高考风格”，不冒充官方真题。
- `verifiedOnline`（来源核验）与转载授权分离；未找到权威原卷/书面授权，因此不升级任何标记。详见 `docs/EXAM_SOURCE_AUDIT.md`。
- 第三方页面 `https://www.jhcee.cn/pc/gk_information/consultation_detail-d6278da9-0614-42f2-b955-956d684bd64c.html` 仅作为线索记录，不是权威答案或授权。

### 2.4 测试与截图

- `tests/content/problemCases.test.ts`（8）：schema、6 案例/3+3/多阶段、真实 model/preset、C01–C06 独立锚点。
- `tests/integration/caseSession.test.ts`（4）：场景备份/恢复、无原场景时删除案例场景、备份幂等、进度损坏回退。
- `tests/integration/round15Pages.test.tsx`（4）：案例列表与来源、答案遮罩、阶段切换、设备检测默认值/导出。
- `tests/tablet/round15.spec.ts` 前 5 项：列表、P04 个人场景恢复、C03 遮罩/阶段、C06 碰撞、竖屏无横向溢出。
- 截图：`docs/screenshots/cases-list.png`、`case-detail-solved.png`、`case-wall-solved.png`、`case-portrait.png`。

## 3. Track B — 静态 HTTPS / PWA / 设备诊断

### 3.1 部署包

- `netlify.toml`：`npm run build`、发布 `dist`、HashRouter 回退到 `index.html`，`NODE_VERSION=22`，无令牌/密钥。
- `public/_headers`：`/sw.js` 与 manifest `no-cache`；`/assets/*` 一年 immutable；图标 7 天。
- `scripts/check-static-build.mjs` + `npm run verify:static`：校验必需文件、manifest、图标、SW、JS/CSS 资源非空。
- `npm run preview:staging`：本地生产预览；不是公网 HTTPS。
- PWA 构建：`vite-plugin-pwa` `generateSW`，125 项预缓存 / 4094.90 KiB；HTML/manifest/SW 与案例/设备路由均可离线打开。
- **BLOCKED**：无托管账号/站点授权，未执行外部部署，未创建或猜测 URL。真实发布步骤、验证与回滚见 `docs/DEPLOYMENT_STAGING.md`。

### 3.2 设备诊断

`/#/device-check` 实现：

- 环境信息：UA、平台、语言、视口、DPR、屏幕、方向、`isSecureContext`、在线、standalone、Service Worker、WebGL/渲染器、CPU/内存。
- WebGL 丢失/恢复：使用 `WEBGL_lose_context` 事件链；结果只标 `SIMULATED_PASS/FAIL/UNSUPPORTED`，不能证明 P01 3D 画面真机恢复。
- rAF 调度探针：10 s / 60 s，p50/p95/p99/max 与堆内存；不是 GPU FPS，也不是真机帧率。
- 10 项人工检查：触控手柄、双指缩放/旋转、速度矢量/初态编辑、软键盘/表达式、切后台、持久化、案例返回、大字号/安全区、读屏焦点、15 分钟暖机；默认 `NOT_TESTED`，可改 `PASS/FAIL/BLOCKED/N/A`。
- 脱敏 JSON 导出：仅环境、人工状态、备注与探针；不含答案、场景、学习进度、身份或 IP 上传。
- 持久化：`emplab.deviceCheck.manual.v1`、`emplab.deviceCheck.model.v1`、`emplab.deviceCheck.os.v1`。

测试：`tests/tablet/round15.spec.ts` 最后 1 项与 `tests/integration/round15Pages.test.tsx`；截图 `device-check.png`、`device-check-probe.png`。真实设备矩阵与 15 分钟脚本见 `docs/CLASSROOM_DEVICE_QA.md`，全部真机项为 `NOT_TESTED`。

### 3.3 PWA 覆盖

`npm run test:pwa` 2/2 通过，验证：

- manifest `name`、`display: standalone`、≥3 图标；
- Service Worker 激活并控制页面；
- 离线重载 16 个模型、`/#/cases`、`/#/cases/case-c01-boundary-exit`、案例真实实验与返回、`/#/device-check`、`/#/path`、`/#/practice`（132 题）；
- 离线刷新保留已提交的数学表达式数值；
- P01 旧受力场景迁移与 3D/2D 切换。

外部真题来源链接不缓存，离线不可用是预期；未声称离线可访问外部站点。

## 4. 回归与不可回退项

- 16 个模型（P01–P08、I01–I08）路由、求解器、预设、多粒子 `tGlobal`/`launchTime`/单粒子重发射、共享场重置语义未改。
- 132 道原创题、收藏/错题/进度、学习路线、PWA、安全表达式输入（197 个 `<ParamSlider>` 调用点 / 运行时最多 208 个控件）、I01/I04 手动 ramp、I05/I06/I07 手势、P01 3D 回退均保持；Round 15 未新增 ParamSlider，案例页面复用现有模型控件。
- 未新增 P09/I09，未重建求解器，未引入账号/支付/分析上传/任意脚本执行器。

## 5. 测试稳定性修正（透明记录）

全量 Playwright 首轮出现 I06 D4 与 I07 手动拖动失败，单独运行通过。用临时用例测得：拖动刚结束时 `I=1.9586 A`，静止 120 ms 后 `I=0`。原因是电流只在实际拖动时非零，而原测试在最后一次移动后固定等待 45/150 ms；机器繁忙时等待越过 `manualDualRodMotion` 的 0.12 s 速度窗口，应用正确归零，测试却仍断言非零。

修正仅改变采样时机：在按住鼠标持续小幅拖动时用 `expect.poll` 等待电流超过原阈值（I06 `>0.05 A`，I07 `>1e-6 A`），保留全部位置、夹持、松手和能量断言。未删除、跳过或放宽物理阈值。修正后全量 **165/165** 通过。

## 6. 明确限制

- 无真实外部部署 URL；无托管授权，线上深链接/缓存头/更新回滚均为 `NOT_TESTED`。
- 无 iPadOS Safari / Android Chrome 真机结果；触摸、软键盘、读屏、安全区、WebGL 恢复、发热与续航全部 `NOT_TESTED`。
- CDP/无头 Chrome 结果标 `SIMULATED`；不能声称 60 fps。
- 5 条真题索引均未在线复核、仅外链；无授权，不复制题干/图片/答案。
- 案例是原创教学练习，不是高考原题，也不声称完整复现任何试卷。
