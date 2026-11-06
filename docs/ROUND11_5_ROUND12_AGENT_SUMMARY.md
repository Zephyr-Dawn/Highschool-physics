# Round 11.5 + Round 12 交接总结（给下一个 Agent）

生成时间：2026-11-04  
用途：把本轮实际完成的 **全模型数学表达式参数输入（Round 11.5）** 与 **I05 + I06 双模型（Round 12）** 一次性交接给下一个 agent。  
> **历史基线说明（2026-11-04 追加）**：本文的 13 模型 / 108 题 / 430 Vitest / 136 Playwright 是 Round 12 结束时的数字。Round 13 已新增 I07 与 P08，当前基线为 15 模型 / 124 题 / 484 Vitest / 149 Playwright / 2 PWA；以 `docs/AGENT_HANDOFF.md` 和 `docs/QA.md` §16 为准。  
原则：本文中的“已实现 / 已通过”均来自本仓库最终实跑；不要用旧报告里的数字覆盖本文。先读本文，再按需读对应源码，避免重新做全仓库审计。

---

## 0. 30 秒快照

- 工作区：`H:\programming\EM_Physics_Lab`，Windows，**不是 git 仓库**；不要假设可以用 `git reset/revert` 回滚。
- 当前模型：**13 个 COMPLETE**（P01–P07、I01–I06）+ **108 道原创题**。
- 本轮新增：
  - Round 11.5：13 个模型全部物理数值控件统一为“原滑动条 + 安全数学表达式输入”，当前 **153 个 `<ParamSlider>` 调用点 / 运行时最多 164 个控件**。
  - Round 12：I05 运动线框与 I06 双导体棒两个独立 COMPLETE 模型，均含四模式、预设、讲解、8 题、图表、教师层、v2 场景、导入导出、平板触控与 PWA 离线。
- 最终验证：typecheck 通过、Vitest **430/430**（36 文件）、Playwright **136/136**、PWA **2/2**。
- 真实 iPadOS / Android、公网 HTTPS、真题授权核验仍为 **NOT_TESTED / 未完成**。
- 下一模型级任务建议：**I07**（反向磁区 + 线框 + 弹性挡板）；P08 仍 PARTIAL 需先做去重；I08 OPTIONAL。

---

## 1. 可直接信任的最终实测基线

环境：Node v22.20.0、npm 11.7.0、本机 Google Chrome 156.0.8078.79（Playwright `channel: 'chrome'`）、Playwright 1.64.1、Vite 7.3.7。

| 命令 | 最终结果 |
|---|---|
| `npm run typecheck` | 通过，无错误 |
| `npx vitest run` | **430 / 430 通过**，36 个测试文件 |
| `npx playwright test` | **136 / 136 通过** |
| `npm run test:pwa` | **2 / 2 通过**（生产构建 + 离线） |
| `npm run build` | 通过；入口 322.35 kB（gzip 99.45 kB） |

最终构建体积：

| 资产 | 大小 |
|---|---|
| 入口 JS | 322.35 kB（gzip 99.45） |
| CSS | 107.12 kB（gzip 23.27） |
| I05 `CoupledLoopPage` | 68.98 kB（gzip 24.07） |
| I06 `DualRodsPage` | 54.12 kB（gzip 19.17） |
| P07 `BeamlinePage` | 74.42 kB（gzip 23.42） |
| P06 | 59.60 kB（gzip 19.04） |
| P01 3D Stage | 978.28 kB（gzip 263.05，懒加载） |
| PWA 预缓存 | 103 项 / 3780.35 KiB |

**测试计数变更不是削弱测试**：旧计数 92 题 / 117 浏览器 / 388 Vitest 是因为当时只有 11 模型；Round 12 之后是 108 题、136 浏览器、430 Vitest。相关旧断言已按真实内容量更新，且全部保留原有物理与交互测试。

---

## 2. Round 11.5：全模型数学表达式参数输入

### 2.1 已完成的能力

- 所有物理数值控件保留原滑动条 `min/max/step`、触控尺寸和旧 aria-label：`<label>数值（<unit>）`。
- 紧邻文本框支持：分数、根式、π、四则运算、括号、隐式乘法、幂、科学计数法、带符号数值。
- 合法值**不受滑块范围限制**：超范围时照常提交，滑块虚线标记并显示“实验仍使用该数值，未做钳制”。
- 非法输入不提交，不改变当前实验，显示具体原因和“当前实验仍为 …”。
- 没有 `eval` / `new Function`；白名单解析器限制 128 字符 / 32 层 / 256 节点。
- 物理参数仍全部是 `number`；场景 v2、旧 localStorage、导入导出格式不变。
- 表达式原式只在页面会话内记忆（跨 tab/重挂载）；刷新后回到已提交数值文本，不写 localStorage。

### 2.2 关键文件

| 文件 | 说明 |
|---|---|
| `src/math/parameterExpression.ts` | 归一化、tokenizer、递归下降 AST、求值、错误分类、资源限制；纯函数 |
| `src/math/parameterValidation.ts` | 物理域、整数约束、稳定域、单位/标签域解析 |
| `src/math/parameterExpressionMemory.ts` | 会话内原式记忆，key = `当前 hash + label + unit` |
| `src/components/ParamSlider.tsx` | `ParamSlider`（滑块 + 表达式）与 `MathTargetInput`（连续目标，无滑块） |
| `tests/math/parameterExpression.test.ts` | 46 项解析/安全/资源测试 |
| `tests/math/parameterValidation.test.ts` | 12 项域测试 |
| `tests/integration/mathParameterControl.test.tsx` | 17 项组件/交互测试 |
| `tests/integration/mathParameterPages.test.tsx` | 5 项真实页面联动 |
| `tests/physics/mathParameterPhysics.test.ts` | 16 项求解器端到端 |
| `tests/tablet/math-parameters.spec.ts` | 17 项 11 模型浏览器覆盖（后续模型另见 i05/i06 spec） |
| `docs/PARAMETER_INPUT_SPEC.md` | 语法、单位、提交/预览、时间语义 |
| `docs/PARAMETER_INPUT_AUDIT.md` | 逐模型逐参数清单、域、语义、例外 |

### 2.3 必须保持的语义

- 提交时机：Enter / 软键盘 Done / 失焦提交；Escape 回退；输入中不调用物理 `onChange`，不逐字符重置时间轴。
- 滑块操作：更新同一数值并清除原式，文本变为数字文本。
- 外部值变化（拖动、预设、导入）：清除原式并显示新数字文本。
- 单粒子参数：只重发射当前粒子；共享场/器件：整场重演。
- I01/I04 手动目标：仍走 `applyManualTarget` 的 0.4 s / 4 T·s⁻¹ ramp；暂停或查看旧历史时拒绝追加。I05 也使用同一 `MathTargetInput` 语义。
- I02 手指推拉、I05 M4 拖线框、I06 D4 手推杆：速度只来自真实 pointer 时间戳样本；文本框不伪造手势历史。
- I01/I04 手动目标域为 ±10 T（既有 timeline 内部夹取）；UI 提前拒绝，避免“显示 20、实际 10”。

### 2.4 单位与表达式

- 表达式在显示单位空间求值，再走原有换算：cm→m、e/C、×10⁻²⁶ kg、×10⁶ m/s、°→rad。
- 换算**不得 `toFixed`**；已有坑：曾用 `toFixed(4)` 改值，已移除，别加回。
- `°` 控件中的 `π/2` 表示约 1.57°，不是 90°；需要 90° 时输入 `90`。
- `N` 必须是整数；`3/2` 明确拒绝，不取整。
- 教学中稳定域不是自然定律：`|B|≤100 T`、`|E|≤1e6 V/m`、`|v|≤1e7 m/s`、质量 `1e-12…1e6 kg`、电阻 `1e-9…1e9 Ω` 等。

---

## 3. Round 12：I05 运动线框

### 3.1 路由、模式、文件

- 路由：`/#/induction/coupled-loop`
- 四模式：
  - `prescribed`：M1 匀速约束；
  - `dynamic`：M2 自由动力学；
  - `manual-b`：M3 手动调磁；
  - `manual-x`：M4 手动拖线框。
- 文件：
  - `src/physics/induction/movingLoopTimeField.ts`：几何、符号、快照、验证；
  - `src/physics/induction/movingLoopSolver.ts`：M1 解析积分、M2/M3 RK4 步加倍、事件、采样；
  - `src/physics/induction/manualLoopMotion.ts`：M4 手势会话；
  - `src/simulations/induction/i05Scene.ts`：13 个预设、v2 场景；
  - `src/simulations/induction/CoupledLoopPage.tsx`；
  - `src/simulations/induction/I05Stage.tsx`；
  - `src/simulations/induction/I05Charts.tsx`；
  - `src/content/i05Lesson.ts`（10 步）、`src/content/i05Questions.ts`（8 题）。

### 3.2 固定物理语义

```text
ℓ(x) = max(0, min(x+w,b) − max(x,a))
g = dℓ/dx：进入 +1，离开 −1，两侧都在场内/场外或跨满条带 0
Φ = Bz hℓ, Ψ = NΦ
ε_t = −N hℓ Bdot
ε_m = −N hBz g vx
ε = ε_t + ε_m
I = ε/R（闭合；开路 I=0，但 ε 仍存在）
F_Bx = N I h Bz g
P_J = I²R
P_mech = F_Bx vx = −I ε_m
P_ts = I ε_t
(K−K0) + Q_J = W_ext + W_ts
```

- 精确落在几何阈值时，`g` 是单侧值，UI 标记 `slopeOneSided`；不能把阈值点的 0 当成唯一导数。
- `B=0` 但 `Bdot≠0`：ε_t 非零、I 有限，但 F_Bx=0。
- 完全在场内 `g=0`：可有感生电流，但 F_Bx=0。
- 开路：EMF 保留，I=F_Bx=Q_J=0。
- M1 所需外力是 `F_ext,required = −F_Bx`，不是参数里的 `F_ext`。
- M4 手部作用力不可知：`W_ext`、精确能量残差不显示；松手后外部保持静止；若 B 仍在变，感生电流仍可存在。

### 3.3 积分/事件

- M1：`x=x0+v0t`；`Q_J/W_ext/W_ts` 用分区 Simpson 功率积分；阈值/折点解析事件。
- M2/M3：RK4 步加倍误差控制，`dtMax=2 ms`、`dtMin=1e-7 s`、误差阈值 2e-9、最大步数 50k、最大事件 400、采样上限 1200。
- 几何阈值 `{a−w,a,b−w,b}` 在步内二分到约 1e-10 s；B(t) 折点作为单独事件，右导数向前推进；显示时保留左右值。
- 达到步数/事件上限返回 `solver-limited` / `event-limited`，不外推假轨迹。
- `stateAtI05Time` 用 cubic Hermite 插值 x/v/Q/W/W_ts，不要退回线性插值，否则 t=0.5 的解析锚点会差约 1e-5。

### 3.4 已锁定锚点

`tests/physics/movingLoopTimeField.test.ts`（19 tests，N=1,h=1,w=1,R=2,a=0,b=3）：

- A 静态 B=2，x=−0.5,v=1：ℓ=0.5、g=1、ε_t=0、ε_m=−2 V、I=−1 A、F_Bx=−2 N、P_J=2 W。
- B B=2+t，t=0.5（B=2.5、Bdot=1、x=−0.5）：ε_t=−0.5、ε_m=−2.5、ε=−3 V、I=−1.5 A、F_Bx=−3.75 N、P_J=4.5 W、P_mech=−3.75 W、P_ts=+0.75 W、P_ext=+3.75 W。
- C 抵消：B=2,Bdot=1,ℓ=0.5,g=1,vx=−0.25 → ε_t=−0.5、ε_m=+0.5、ε=I=F=P_J=0。
- D 完全在场内：x=0.5,ℓ=1,g=0,Bdot=1 → ε_t=−1、ε_m=0、I=−0.5、F=0、P_J=0.5、P_ts=0.5。
- E 离开：x=2.5,v=1,B=2,ℓ=0.5,g=−1 → ε_m=+2、I=+1、F=−2、P_J=2。
- F 静态自由减速：γ=N²h²B²/(mR)=2 s⁻¹，v=e^{−2t}，x=−0.5+(1−e^{−2t})/2，K=e^{−4t}/2，Q_J=(1−e^{−4t})/2；t=0.5 时 v=e⁻¹，能量残差 <2e−6 J。

### 3.5 手动语义

- M3：只有播放时记录 B 目标；目标追加在 `clock.getTime()`；必须复用 `applyManualTarget` 的 0.4 s / 4 T/s ramp；时钟早于最后 keyframe 时拒绝（避免把目标写进过去）。
- M4：`ManualLoopSession` 使用单调时间戳估计速度；第二指取消；松手 `v=0`；不显示精确 W_ext/残差。
- M1/M2/M3/M4 共享同一符号、同一快照、同一图表。

---

## 4. Round 12：I06 双导体棒

### 4.1 路由、模式、文件

- 路由：`/#/induction/dual-rods`
- 四模式：`free` / `forces` / `manual-rod1` / `manual-rod2`。
- D3（同速、B 反向、开路等比较）通过预设和开闭回路/B 符号控件完成，不是第五个模式。
- 文件：
  - `src/physics/induction/dualRodCoupling.ts`：快照 + 常力解析解 + 接触 + 能量；
  - `src/physics/induction/manualDualRodMotion.ts`：D4 夹持杆手势会话；
  - `src/simulations/induction/i06Scene.ts`：12 个预设、v2 场景；
  - `src/simulations/induction/DualRodsPage.tsx`；
  - `src/simulations/induction/DualRodsStage.tsx`；
  - `src/simulations/induction/I06Charts.tsx`；
  - `src/content/i06Lesson.ts`（10 步）、`src/content/i06Questions.ts`（8 题）。

### 4.2 固定物理语义

```text
d = x2 − x1 > 0
Φ = Bz L d
ε1 = +Bz L v1
ε2 = −Bz L v2
ε = ε1 + ε2 = −Bz L (v2 − v1)
I = ε / R（闭合）；开路 I = 0
F_B1 = −I Bz L = +k(v2 − v1)
F_B2 = +I Bz L = −k(v2 − v1)
k = (Bz L)² / R
α = k(1/m1 + 1/m2)
Vcm = Vcm0 + a_cm t
Δv = Δv∞ + (Δv0 − Δv∞) e^{−αt}
d(t) = d0 + Δv∞t + (Δv0 − Δv∞)(1 − e^{−αt})/α
K − K0 + Q_J = W_ext
```

- 回路只有一个电流，不能画成两个独立单棒；两杆磁场力始终等大反向。
- 同速：ε=0、I=0、F=0；B 反向：I/EMF 反号，轨迹与 Q_J 不变。
- 接触：`d(t)=0` 首次根停止，状态 `contact-stop`；不穿透、不模拟弹性碰撞、不把冲击耗散算进焦耳热。
- D4：被选杆由手指驱动，另一杆明确“外部夹持”，速度为 0；不显示精确外功或能量残差；手动拖动保留 0.02 m 最小接触间隙。
- 初始几何必须 x₂>x₁；非法时拒绝，不自动交换杆。

### 4.3 已锁定锚点

`tests/physics/dualRodCoupling.test.ts`（15 tests）：

- R1 对称自由双棒：k=0.5、α=1、v₁=1−e⁻ᵗ、v₂=1+e⁻ᵗ、I=−e⁻ᵗ A、F_B1=+e⁻ᵗ、F_B2=−e⁻ᵗ、p=2、K+Q_J=2 J、残差 <1e−9。
- R2 同速：总 ε=0、I=0、F=0、Q_J=0。
- R3 B 反向：轨迹/Q_J 不变，EMF/I 反号。
- R4 开路：EMF 保留，I=F=Q_J=0。
- R5 接触：t=ln2、v₁=1.5、v₂=0.5、K=1.25、Q_J=0.75，不越界。
- R6 不等质量：α=2/3、总动量 6。
- R7 相反外力：v₁=1−e⁻ᵗ、v₂=−(1−e⁻ᵗ)、W_ext=2e⁻¹≈0.7358 J、残差 <1e−9、p=0。
- R8 同加速度；R9 方向/力对；R10 非法/近接触；R11 手推夹持杆；R12 表达式输入（如 Bz=√2、R=1/3）。
- 解析容差 1e−10…1e−12；接触时刻 1e−8…1e−10。

---

## 5. 两模型共用的 UI/集成设施

- `ParamSlider` 覆盖 I05 22 处、I06 12 处，含 B/L/R/m/N/q/v/x/F/波形/时长等；仍使用 Round 11.5 的解析器与提交语义。
- `MathTargetInput` 仅 I05 手动 B 使用；I01/I04 原有目标输入保持。
- 播放、暂停、上一/下一关键帧、时间轴、倍速沿用 `usePlaybackClock`；I05 M3/M4、I06 D4 固定 1× 真实仿真时间。
- 图表使用 `SeriesChart`，I05/I06 各有四组图像（场/磁通、EMF/电流、运动/力、能量/动量），能量组显示独立残差。
- 教师层：`TeacherDock` + 图层 chips；I05 支持 B/重叠/电流/速度/力/EMF 分解/能量/事件/答案遮蔽；I06 支持场/电流/速度/力/面积/动量/能量/事件/答案遮蔽。
- 触控：I05 拖线框、I06 拖杆、第二指取消；命中区域 ≥44 CSS px；pan/zoom 复用 `useStageView`。
- PWA：I05/I06 均为 2D SVG，不加载 three/R3F；离线路由、参数编辑、图表、108 题均已纳入 `tests/pwa/pwa.spec.ts`。
- 持久化：`emplab.i05.scene.v2` / `emplab.i06.scene.v2`；导入导出不包含无界手势历史；损坏 JSON 回退默认场景。

---

## 6. 共享文件改动（下一个 agent 必看）

新增/修改的共享集成点：

- `src/simulations/registry.ts`：新增 `I05_SIM`、`I06_SIM`，扩展 `routeForModel` / `simTitleForModel` 联合类型。
- `src/app/App.tsx`：I05/I06 懒加载、路由、页面标题、页脚。
- `src/pages/HomePage.tsx`：I05/I06 真实模型卡与预览；统计数据改为 13 模型 / 108 题。
- `src/features/practice/PracticePanel.tsx`、`src/pages/PracticePage.tsx`：modelId 联合类型、i05/i06 模块筛选。
- `src/content/schema.ts`：modelId 增加 i05/i06。
- `src/content/questions.ts`：引入 `I05_QUESTIONS`/`I06_QUESTIONS`；共 108 题。
- `src/content/questionStats.ts`：total 108，i05/i06 各 8。
- `src/content/lessons.ts`：re-export `I05_LESSON`/`I06_LESSON`（实际定义在独立文件）。
- `src/styles/global.css`：mode cards、chart group tabs、stage status、energy residual、I05/I06 小屏适配。
- `tests/content/content.test.ts`、`tests/integration/pages.test.tsx`、`tests/tablet/tablet.spec.ts`、`tests/tablet/multi-particle.spec.ts`：题目/筛选/模型数量已从旧的真实 92/11 更新为 108/13；**不是降低覆盖**。
- `tests/pwa/pwa.spec.ts`：标题与题目数更新为 13 / 108；离线增加 I05 参数编辑与 I06 图表。

---

## 7. 新增测试与截图索引

### 7.1 测试

| 文件 | 数量 | 覆盖 |
|---|---:|---|
| `tests/physics/movingLoopTimeField.test.ts` | 19 | I05 A–F、动态、开路、B=0+Bdot、N scaling、宽线框、单侧边界、事件、手动 B/x、非法输入 |
| `tests/physics/dualRodCoupling.test.ts` | 15 | I06 R1–R12、接触、动量、能量、手推夹持、表达式 |
| `tests/physics/i05i06Scenes.test.ts` | 4 | 两模型 v2 场景/预设/损坏 JSON/跨杆几何 |
| `tests/integration/i05i06Pages.test.tsx` | 4 | 两页面、四模式、图表、能量残差、表达式、x2>x1 拒绝 |
| `tests/tablet/i05.spec.ts` | 9 | M1–M4、表达式/超范围、开路、第二指取消、练习回链、横竖屏、损坏 JSON |
| `tests/tablet/i06.spec.ts` | 10 | D1/D2/D4、同速零电流、接触、开路、表达式、第二指取消、练习回链、横竖屏、损坏 JSON |

### 7.2 截图

I05：`i05-static-entry.png`、`i05-expression-overflow.png`、`i05-free-damping.png`、`i05-manual-b.png`、`i05-manual-x.png`、`i05-open.png`、`i05-touch-cancel.png`、`i05-portrait.png`。  
I06：`i06-free-rods.png`、`i06-same-speed.png`、`i06-contact.png`、`i06-forces.png`、`i06-open.png`、`i06-expression-r.png`、`i06-manual-rod.png`、`i06-touch-cancel.png`、`i06-portrait.png`。  
Round 11.5 数学输入：`math-expression-fraction.png`、`math-expression-error.png`、`math-expression-overflow.png`、`math-p01-3d.png`、`math-p07-multi.png`、`math-i01-manual.png`、`math-i04-manual.png`、`math-landscape.png`、`math-portrait.png`。

---

## 8. 生产预览性能（非真机，不能当 60 fps）

环境：Chrome 156 headless，生产 preview `127.0.0.1:4175`，1194×834，每场景 180 帧 rAF；无头 Chrome 不锁 VSync。

| 场景 | avg | p95 | p99 | max | >20 ms | heap |
|---|---:|---:|---:|---:|---:|---:|
| I05 M2 动态 + 图像 | 5.85 ms | 6.1 | 6.6 | 6.6 | 0/180 | 17.0 MB |
| I05 M3 手动 B + 图像 | 5.90 ms | 6.2 | 6.5 | 6.5 | 0/180 | 19.0 MB |
| I06 D1 自由双棒 + 图像 | 5.89 ms | 6.1 | 6.3 | 6.4 | 0/180 | 16.2 MB |
| I06 D4 手推 + 图像 | 5.90 ms | 6.1 | 6.5 | 6.6 | 0/180 | 21.4 MB |

**不要**把这些数字写成 iPad/Android 60 fps；真实设备仍为 NOT_TESTED。

---

## 9. 文档地图（避免重复阅读）

| 需求 | 直接读 |
|---|---|
| 当前架构、命令、硬约束、已知坑 | `docs/AGENT_HANDOFF.md` |
| I05/I06 物理公式、符号、锚点 | `docs/PHYSICS_SPEC.md` §13.5 / §13.6 |
| 两轮实测记录、构建、性能、截图 | `docs/QA.md` §14 / §15 |
| 13 模型完成度与 16 编号矩阵 | `docs/MODEL_COMPLETION_MATRIX.md` |
| 表达式语法/单位/提交语义 | `docs/PARAMETER_INPUT_SPEC.md` |
| 逐模型逐参数域与语义 | `docs/PARAMETER_INPUT_AUDIT.md` |
| 模型内容/讲解/题目映射 | `docs/CONTENT_MAP.md` |
| 设计决策 | `docs/DECISIONS.md` D28/D29/D30 |
| 真题来源状态 | `docs/EXAM_SOURCES.md`（全部未在线复核） |

---

## 10. 已知坑（本轮真实踩过，优先读）

1. **I05 `g` 的阈值单侧值**：精确落在 `{a−w,a,b−w,b}` 时不能把 0 当唯一导数；UI 用 `slopeOneSided` 标记。完全在场内 `g=0` 时仍有 ε_t/I，但 F_Bx=0。
2. **I05 M1 的外力**：M1 的所需外力是 `−F_Bx`，不是 `externalForceN`；`W_ext=∫(−F_Bx)vx dt`。
3. **I05 M3 手动 B**：必须走 `applyManualTarget` 的 ramp；暂停/查看旧历史时拒绝追加，否则会把目标写进过去。手动目标域 ±10 T。
4. **I05 M4**：松手后外部保持静止（v=0），但若 B 仍在变化，感生电流仍可由 ε_t 产生；不报告精确手部 W_ext/残差。
5. **I05 状态插值**：`stateAtI05Time` 必须用 cubic Hermite（x/v/Q/W/W_ts），线性插值会让 t=0.5 的解析锚点差约 1e-5。
6. **I06 单回路**：两杆共享一个电流；不能画成两个独立单棒；F_B1+F_B2=0。
7. **I06 接触**：`d(t)=0` 首次根停止；不得继续推入 d<0，不得把碰撞冲击耗散计入 Q_J。
8. **I06 D4 夹持**：被夹持杆 v=0，是外部约束，不是自由动力学；手动拖动保留 0.02 m 最小接触间隙。
9. **参数输入**：不要用 `Math.min/max` 把合法表达式夹回滑块范围；不要 `toFixed` 改写 cm→m；不要把表达式文本写进物理参数对象。
10. **表达式原式记忆**：仅 session Map，不写 localStorage；刷新后恢复数值文本，这是有意行为。
11. **测试计数更新**：旧断言中的 92 题 / 1/92 / 11 模型已按真实增长更新到 108/108/13；不要误以为是在放宽测试。
12. **不要用 headless Chrome 帧间隔宣称真机 60 fps**；CDP 合成触摸也不是真实平板验收。

---

## 11. 明确未完成 / 下一步建议

| 项目 | 状态 | 建议 |
|---|---|---|
| I07 反向磁区 + 线框 + 弹性挡板 | MISSING | **下一个推荐模型级任务**；复用 P05 分区 + I03 线框 + 碰撞分段 |
| P08 E+B/特殊约束综合 | PARTIAL | 与 P06 模式 A + P07 束线重叠，先做去重评估，不新建壳页面 |
| I08 旋转线圈/交流发电机 | OPTIONAL | 仅明确排期后再做 |
| 真实 iPadOS Safari / Android Chrome | NOT_TESTED | 真机清单见 `docs/QA.md` 末尾；软键盘、第二指、字号、安全区、VoiceOver/TalkBack、热稳定 |
| 公网 HTTPS + PWA 安装 | 未执行 | 需要域名/证书；本仓库只验证 `vite preview` |
| 真题授权录入与在线核验 | 未完成 | 保持 `verifiedOnline:false`，不转载题干/答案 |
| 表达式原式跨刷新持久化 | 未实现（可选） | 若要做，需版本化 `expressions` metadata，导入时重新解析并核对 SI 值 |
| I05 自感/互感/边缘场、I06 碰撞/时变场 | 模型边界外 | 当前明确列为限制，不要声称已支持 |

---

## 12. 给下一个 agent 的最短工作流

1. 先读本文；需要细节时再按 §9 跳转，不要从零审计全仓库。
2. 改任何物理参数控件：先读 `docs/PARAMETER_INPUT_SPEC.md` + `docs/PARAMETER_INPUT_AUDIT.md`；保持 `ParamSlider` 的提交/域/原式记忆语义。
3. 改 I05/I06：先读 `docs/PHYSICS_SPEC.md` §13.5/13.6 与对应 anchor 测试；不要重写已验证的 solver。
4. 新增模型：按 `AGENT_HANDOFF.md` §4 的共享文件清单串行集成；共享文件不要并行编辑。
5. 任何改动后的验收顺序：`npm run typecheck` → `npx vitest run` → `npm run build` → `npx playwright test` → `npm run test:pwa`。
6. 最后同步 `docs/QA.md`、`README.md`、`docs/MODEL_COMPLETION_MATRIX.md`、`docs/CONTENT_MAP.md`、`docs/PHYSICS_SPEC.md`、`docs/DECISIONS.md`、`docs/AGENT_HANDOFF.md` 的数字。

**交付边界**：本仓库不是 git 仓库；不要执行回滚类 git 命令。I05/I06 已完成并通过最终基线；除真实设备、部署、真题授权和下一模型外，不需要重新证明本两轮的物理与测试结果。
