# 题目案例与物理模型映射（Round 15/16/17）

共 **9 个原创高考风格整题案例**（不是高考原题）。题面、解析和数值均由本项目原创；案例不加入 132 道原创选择题的计数。

| 案例 | 主模型 / 预设 | 阶段 | 独立核验锚点 | 覆盖与限制 |
|---|---|---|---|---|
| C01 有界磁场中的临界出场 | P04 `p04-strip-cross` | 单段 | t=π/6, exit (0.5, 1−√3/2), v=(√3/2, 1/2) | `exact_model`；二维、静态均匀条带、理想边界 |
| C02 相反磁场两次跨界 | P05 `p05-two-halves`；P05 `p05-cross-not-simultaneous` | 多段 | t=π→(0,−2)，t=2π→(0,−4)；另一段 A 在 t=1 s、B 在 t=2 s 到达同一交点 | 第 1 段 `exact_model`；第 2 段是 `concept_illustration`（无场直线，用于轨迹/同时性辨析） |
| C03 选速、磁分析与屏幕 | P07 `p07-standard`；P07 `p07-screen-miss` | 多段 | 屏幕 y=1.0893164 m，t=3.6782993 s；窗口 [1.2,2.5] 时为 screen-outside | `exact_model`；二维竖直分区、理想薄板；不代表未核验真题 |
| C04 线框进入磁场 | I03 `i03-default` | 单段 | t=0.1 s: Φ=0.01 Wb, ε=−0.3 V, I=−0.6 A, F=−0.12 N | `exact_model`；单一条形场、集中电阻、无自感 |
| C05 变化 B + 运动线框 | I05 `i05-reinforce` | 单段 | t=0.5 s: ε_t=−0.5, ε_m=−2.5, ε=−3 V, I=−1.5 A, P_J=4.5 W | `exact_model`；一维运动、无自感/互感、B(t)=2+t |
| C06 相反磁区 + 挡板 | I07 `i07-interface`；I07 `i07-inelastic-wall` | 多段 | Φ=0, S=−2, ε=2 V, I=2 A, F=−4 N, P=4 W；e=0.5: Q_impact=0.375 J, Q_J=0 | 每段 `exact_model`；两段几何独立，不传播上一段位置/速度 |
| A17-01 电场—磁场—屏幕 | 复合适配器 `a17-electric-magnetic-screen`；P06 `p06-accelerate` 仅作基础组件对照 | 三阶段连续 | `tA=√3−1`、`tB=π/6`、`tC=2/3`；屏幕 `y=4√3/3−3/2`；两个交接误差 0 | `full_problem_simulated`；P06 阶段标记 `partial_stage`，整题以复合适配器为准 |

## 多阶段声明

- **C02** 第 1 段是真实 P05 磁区分段；第 2 段换成无场直线只用于“轨迹交叉不等于同时到达”的概念检查。页面明确写“分阶段独立建模”和限制。
- **C03** 两段共用 P07 标准束线；第 2 段只改变屏幕接收窗口，轨迹相同。页面明确区分“轨迹未改变”和“未被接收”。
- **C06** 第 1 段是 I07 双区界面；第 2 段是独立挡板几何，不从第 1 段继承位置/速度。页面明确提示。
- **A17-01** 的三个阶段不是独立实验链接：A→B、B→C 使用真实位置/速度/时间交接，在同一个 `WholeProblemLab` 舞台上连续运行；P06 只作为组件对照。

## 独立验算来源

`tests/content/problemCases.test.ts` 直接调用真实 P04/P05/P07/I03/I05/I07 求解器，与手算/分段解析得到的期望值比较；引擎输出不是期望值的唯一来源。每个案例还包含独立量纲核对（字段 `dimensionalCheck`），例如 `Φ=BA → Wb`、`ε=−dΦ/dt → V`、`F=BIh → N`、`Q=½m(v²−v′²) → J`。详细推导见每个案例的“推导与结果核验”面板和 `PHYSICS_SPEC.md`。

## 来源与权利

- 9 个案例：`sourceKind='original_case'`、`verification='paper_and_solution_verified'`、`rights='original'`。
- 5 条真题索引：全部 `verifiedOnline:false`、`verification='unverified'`、`rights='link_only'`；只显示元数据和外链，不显示题干/答案/图片。
- 授权与核验待办见 [EXAM_SOURCE_AUDIT.md](EXAM_SOURCE_AUDIT.md)。

## Round 16 整题场景补充

| 案例 | 整题适配 | 统一场景 | 独立锚点 | 覆盖 |
|---|---|---|---|---|
| C02 | `p05-multizone` | 双磁区 + A/B 同场；B 延迟 1 s 发射 | A `π→(0,−2)`、`2π→(0,−4)`；B 首次到 `(0,−2)` 的 `tGlobal=1+π` | `full_problem_simulated` |
| C06 | `i07-opposite-wall` | 反向双场 + 挡板连续；宽 1 m、v=8 m/s、e=0.5、wall x=3.2 m | `ε₀=16 V`、碰前 1.8 m/s、`Q_impact=1.215 J`、反弹 −0.9 m/s | `full_problem_simulated` |
| C07 | `p07-beamline` | 选速 v=2 + 可调分析 B + 无末段场 + 屏幕 x=4 | `y=2−2√3/3`；反号取负；临界 `|B|=2 T` | `full_problem_simulated` |
| C08 | `i06-dual-rod` | 双杆同轨、单回路；初始 v₁=2,v₂=0，间距 1 m | `I₀=1 A`、`t=ln2`、`Q_J=0.75 J`（首次接触停止） | `full_problem_simulated` |

旧 C06 的 `0.375 J` 保留为 B=0、宽 0.5 m、碰前 1 m/s 的**分阶段控制实验**，不并入连续主场景。

A17-01 使用新增白名单复合适配器；详细独立解析与交接误差见 [COMPOSITE_PHYSICS_PROOF.md](COMPOSITE_PHYSICS_PROOF.md)。A17-02 为教师私有模板，使用 I07 连续事件，不增加公开案例计数。C02 的旧 `p05-cross-not-simultaneous` 只作为“轨迹交叉≠同刻相遇”的补充概念图，不用于整题答案。
