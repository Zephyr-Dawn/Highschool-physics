# Round 17 QA 与交付证据

日期：2026-11-05  
环境：Windows 10.0.26100 x64；Node v22.20.0；npm 11.7.0；Playwright 1.64.1；本机 Chrome headless。  
状态口径：真实设备与外部部署不使用自动化数字替代。

## 1. 最终结论

| 轨道 | 状态 | 说明 |
|---|---|---|
| Track A 教师题目工作台 | **COMPLETE** | 列表/编辑/学生视图预览；A17-01/A17-02 模板；复制内置案例；本机私有导入导出；白名单物理；逐问答案重算 |
| Track A A17-01 跨求解器连续题 | **COMPLETE** | 同一舞台、统一 `tGlobal`；两个交接点误差 0（门槛 1e-9）；独立解析锚点与退化分支测试 |
| Track A A17-02 教师感应模板 | **COMPLETE** | I07 同一引擎；4 问；Q_J 与 Q_impact 独立绑定；教师可在预览中修改变式并重算 |
| Track B 静态发布包 | **STATIC_PACKAGE_READY** | 构建与 `release-manifest.json` 校验；无公网部署 |
| Track B 外部 HTTPS | **BLOCKED** | 无托管账号/授权；无真实 URL |
| Track B 真实 iPadOS/Android | **NOT_TESTED** | 无真机；全部硬件项保持未测 |
| 自动化触控/离线 | **SIMULATED** | Playwright/headless；不得计入真机 PASS |

## 2. 实际执行命令与结果

> 以下数字必须来自本轮最终一次执行；如有重跑，以最后一节记录为准。

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npx vitest run` | **593/593**，54 个测试文件 |
| `npx playwright test` | **180/180**，6.9 分钟，1 worker（SIMULATED） |
| `npm run build` | 通过；333 modules；入口 JS 339.74 kB（gzip 103.33 kB），CSS 140.61 kB（gzip 28.78 kB），P01 3D chunk 978.52 kB（gzip 263.16 kB） |
| `npm run test:pwa` | **3/3**；PWA precache 143 项 / 4298.11 KiB |
| `npm run verify:static` | 通过：`71 JS, 1 CSS, assets 4239.4 KiB, 139 files, sha f3ea43f6b30e`；写出 `release-manifest.json` |

## 3. 测试覆盖新增

### 单元/集成

- `tests/physics/electricMagneticScreen.test.ts`：A17-01 解析锚点、2 个交接点、能量/磁场做功、E/Bz/宽度/屏幕距离变式、无出场/相切/越界/不可达/非法输入。
- `tests/content/wholeProblem.test.ts`：A17-01 整题适配器、屏幕事件、下游参数重算、无命中隐藏答案；原有 C01–C08 锚点与九案覆盖。
- `tests/content/teacherProblemAuthoring.test.ts`：白名单注册表、A17 模板编译、A17-02 Q_J/Q_impact 分账、C01–C08/A17 复制、S/U 单位、恶意 URL、未知 adapter、超限/深度/原型污染导入、原存档不变、导出导入重算。
- `tests/integration/round17Authoring.test.tsx`：列表/编辑/预览、保存、`√2` 数学输入、参数变化参考值、HTML 惰性渲染、危险公式阻断。
- `tests/content/round17Release.test.ts`：release manifest 脚本、无第三方脚本、教师路由懒加载、16 模型注册表无 teacher/A17、部署文档诚实状态。

### Playwright（headless = SIMULATED）

- `tests/tablet/round17-authoring.spec.ts`：教师完整闭环、A17-02、数学/预览、导入导出、1194/768/430 视口与 44 px 保存按钮。
- `tests/tablet/round17-stage-handoff.spec.ts`：两个交接事件、Bz=−2 无光斑、Bz=0 恢复、参考值非陈旧、变式推导失效提示。
- `tests/tablet/round17-release-regression.spec.ts`：深链/刷新、设备诊断 schema v2 与 sanitization、1024×768/768×1024。
- `tests/pwa/pwa.spec.ts` 新增：离线教师页/预览、教师草稿与旧场景/进度/案例进度键在离线重载后保留。
- 既有 16 模型/132 题/C01–C08/数学表达式/多粒子/手动控制回归全量重跑。

## 4. 证据截图（均为 SIMULATED，不是真机）

- `docs/screenshots/round17-teacher-list.png`
- `docs/screenshots/round17-teacher-editor.png`
- `docs/screenshots/round17-a17-preview.png`
- `docs/screenshots/round17-a17-stage.png`
- `docs/screenshots/round17-a17-derivation.png`
- `docs/screenshots/round17-a17-variant.png`
- `docs/screenshots/round17-a17-02-preview.png`
- `docs/screenshots/round17-a17-no-hit.png`
- `docs/screenshots/round17-import-export.png`
- `docs/screenshots/round17-tablet-landscape.png`
- `docs/screenshots/round17-tablet-portrait.png`
- `docs/screenshots/round17-device-check.png`
- `docs/screenshots/round17-offline-teacher.png`

教师列表/编辑/预览截图包含“本机教师草稿，非官方真题”和来源/核验/权利信息；A17 变式截图显示参考值 0.594599 m（Eₓ=2 V/m），证明不是旧 0.809401 m。

## 5. 物理与安全证据

- A17-01：`tA=√3−1`、`tB=π/6`、`tC=2/3`、总时间 `1.9223162498 s`；B 出射 `(1.8660254038, 0.2320508076)`，屏幕 `(2.8660254038, 0.8094010768)`；两交接误差均 0。详见 `ROUND17_COMPOSITE_PHYSICS_PROOF.md`。
- A17-02：初始 ε=16 V；碰板时 Q_J≈30.38 J；Q_impact=1.215 J；反弹 −0.9 m/s；e=1 时 Q_impact=0。
- 导入安全：超过 512 KiB、损坏 JSON、深层嵌套、`__proto__`、未知 adapter、危险 URL、危险公式均安全拒绝；失败不写原存档。
- 教师 HTML-like 文本以 React 纯文本渲染；无注入执行。
- 私有键 `emplab.teacher-problems.v1` 不进入构建/precache/诊断；设备报告 `containsTeacherContent:false`。

## 5A. 测试失败与重跑记录

- 首次定向 Playwright：A17-02 的 `[data-testid^="wpl-part-"]` 同时匹配了 4 个选项卡和 `wpl-part-body`，预期 4 实得 5；另一次点击 `b-exit` 检查了出场事件而非 handoff 事件。均为测试定位器错误，改为 `.wpl-part-tab` 和 `handoff-magnetic-strip` 后通过；未修改物理实现。
- 随后定向 14 项、全量 180 项均通过；没有通过跳过、放宽断言或删除测试来消除失败。
- PWA 构建 + 3 项离线测试连续通过；未出现超时重跑。

## 6. 构建与资源

- 生产构建配置：`netlify.toml`、`public/_headers`、PWA `autoUpdate`。
- `verify:static` 生成 `dist/release-manifest.json`，包含每个静态文件的 SHA-256。
- P01 3D 仍单独 lazy load（约 978 kB）；教师页面有独立 lazy chunks。
- 最终构建入口 339.74 kB（gzip 103.33）；教师列表 chunk 17.82 kB、编辑器 25.07 kB、预览 4.54 kB、存储 27.17 kB；PWA precache 143 项 / 4298.11 KiB。
- 未据此断言真机 60 fps 或发热改善。

## 7. 真实设备与部署边界

- 公网 HTTPS：**BLOCKED**；用户需提供托管平台登录/站点授权，然后按 `ROUND17_DEVICE_RELEASE_MATRIX.md` 发布。
- iPadOS Safari / Android Chrome：**NOT_TESTED**；可执行清单见 `docs/device-test-packages/ipados-safari-round17.md` 与 `docs/device-test-packages/android-chrome-round17.md`；安装、离线、软键盘、读屏、WebGL context loss、15 分钟暖机均未执行。
- Playwright 的触摸/离线/视口均为 **SIMULATED**；不能转写为真机 PASS。
- 未执行真题原卷核验/公开转载；5 条索引仍 `unverified/link_only`。

## 8. 已知限制与风险

- 教师新题仅开放 A17-01/A17-02 两种白名单适配器；不支持任意求解器拼接。
- 教师推导文本不会自动重写数值；变式下 UI 明确标记标准推导数值失效，参考值和判题使用当前求解器结果。
- 预览不持久化学生逐问作答；教师草稿需导出后在另一台设备导入。
- 大型图片附件未实现，避免 localStorage 超限。
- 变式后的讲解公式仍以标准题设文本展示，只加失效提示；后续可扩展参数化讲解模板。
- 无服务器同步、账号、公开题库。
- 未在同一 URL 上执行“两版 Service Worker 真实升级”的自动化测试；当前 PWA 3/3 覆盖离线重载与数据键保留。真实版本切换必须在有托管授权后按 `ROUND17_DEVICE_RELEASE_MATRIX.md` 手工验证。
