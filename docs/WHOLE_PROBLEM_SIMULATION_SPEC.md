# 整题连续仿真规范（Round 16）

## 1. 目标与边界

整题工作台用一个真实求解器、一个坐标系和一个 `tGlobal` 时间轴，展示一道综合题从初态到关键事件/终止事件的全部可模拟过程。它不是把多个基础模型 iframe 拼在一起，也不是用 UI 采样绘制预制轨迹。

实现位置：

- `src/features/cases/wholeProblem/types.ts`：统一帧、事件、轨迹、几何、答案契约。
- `src/features/cases/wholeProblem/buildWholeProblem.ts`：白名单求解器适配层。
- `src/features/cases/wholeProblem/WholeProblemLab.tsx`：统一舞台、事件时间轴、逐问解析、答案检查、变式参数。
- `src/features/cases/solutions/caseAnswerCheck.ts`：安全表达式、单位换算、答案有效性。
- `src/content/caseSolutions.ts`：C01–C08 的逐问数据与整题场景元数据。

不得从 URL/JSON 接受函数名、模块名、类名或脚本；`adapterId` 是固定联合类型，场景由案例 ID 白名单构造。

## 2. 统一物理契约

每个适配器输出 `WholeProblemModel`：

- `coverage`：`full_problem_simulated | partial_stage | concept_illustration | unsupported`。
- `durationS`、`geometry`（坐标系范围、场区、屏幕、挡板、狭缝、线框/导轨）。
- `traces`：由求解器逐时刻采样得到的轨迹；采样只用于绘图，不定义事件。
- `events`：由求解器事件表映射的 `{id,t,kind,label,x,y}`；`id` 是解析步骤可引用的稳定字符串。
- `frameAt(t)`：同一 `t` 下的标记、线框/杆位置和实时可观测量。
- `answers`：当前参数下用于判题的目标量，不从旧的 `expected` 表读取。
- `parameterValues` / `baselineValues`：判断答案依赖是否变化。
- `charts`：电动势、电流、焦耳热等由真实采样生成。

坐标/单位约定沿用各模型：P04/P05/P07 为二维 x-y；I03/I05/I06/I07 为一维位置 x（+x 向右，Bz 正方向纸外，正电流按各模型约定）。所有内置量使用 SI。

## 3. 适配器与事件映射

| 案例 | 适配器 | 真实引擎 | 统一舞台 | 关键事件 | 覆盖 |
|---|---|---|---|---|---|
| C01 | `p04-boundary` | `solveFiniteFieldTrajectory` | 条带 + 粒子轨迹 | 起点、出场 | `full_problem_simulated` |
| C02 | `p05-multizone` | `solveAlternatingFieldTrajectory` | 双磁区 + A/B 两条轨迹 | A 两次跨界、B 首次跨界 | `full_problem_simulated` |
| C03 | `p07-beamline` | `solveBeamlineTrajectory` | 源点→狭缝→选速→分析→偏转→屏幕 | 入口/出口狭缝、分析区出口、屏幕命中/越界/吸收 | `full_problem_simulated` |
| C04 | `i03-loop-entry` | `simulateLoop` | 场条带 + 线框 | 进入、完全进入、离开、完全离开 | `full_problem_simulated` |
| C05 | `i05-loop-field` | `solveI05` | 场条带 + 线框 + ε/I/Q 图表 | 几何事件、场波折点、结束 | `full_problem_simulated` |
| C06 | `i07-opposite-wall` | `solveI07` | 反向双场 + 挡板 + 线框 | 界面、出场、碰板/反弹、再入 | `full_problem_simulated` |
| C07 | `p07-beamline` | `solveBeamlineTrajectory` | 选速→可调磁分析→自由段→屏幕 | 狭缝、分析区出口、屏幕 | `full_problem_simulated` |
| C08 | `i06-dual-rod` | `solveDualRod` | 双导轨 + 两杆 + 共享电流 | 起点、接触/停止 | `full_problem_simulated` |

事件 ID 的 UI 语义：

- P07：`entry-slit`、`exit-slit`、`analyzer-exit`、`screen`、`absorbed`。
- P04：`start`、`exit`。
- P05：`a-start`、`a-cross-1`、`a-cross-2`、`b-start`、`b-cross-1`。
- I03：`enter`、`inside`、`leave`、`after`。
- I05：`start`、`geometry-N`、`end`。
- I07：`start`、`interface`、`field-exit`、`wall-bounce`、`re-enter`。
- I06：`start`、`contact`、`end`。

解析步骤中的 `referenceEventId` 由测试逐项检查必须存在于当前适配器事件表；不存在的引用视为内容错误。

## 4. 答案有效性

`QuestionPart.answerSpec` 有：

- `quantity`：与适配器 `answers` 的键对应。
- `baselineValue`、`tolerance`、`dependsOn`。
- `dependsOn` 必须指向 `wholeProblem.variations` 的 `parameterKey`。

判题流程：

1. 用安全表达式解析学生输入；`1/0`、非有限值、非法语法直接拒绝，不执行 `eval/Function`。
2. 单位换算到目标单位；量纲不匹配返回 `unit_error`。
3. 若任一依赖参数相对基线改变，使用当前求解器的 `answers[quantity]` 作为期望值；如果当前参数下没有唯一值（被吸收、未命中、无碰撞、临界），返回 `needs_review`，绝不沿用标准答案。
4. 否则使用基线值；容差取 `max(abs, rel·|expected|)`。
5. 变式切换不会静默保留旧的标准数值；`WholeProblemLab` 清空已判结果并显示“当前为变式”警告。

## 5. 页面状态与交互

- 舞台、事件条、时间滑块、播放/暂停、上一/下一事件来自同一 `WholeProblemModel`。
- 点击解析中的事件引用会定位 `tGlobal`，暂停并高亮事件。
- C02 的“A 初速度”是单粒子变式：重建 A 轨迹但保留全局时间；B 的同一 `tGlobal` 状态不变。改变共享场/发射延迟仍从 0 重演。
- 案例答题进度写入既有 `emplab.cases.progress.v1` 的 `parts` 可选字段（输入、单位、正确性、提示数、是否揭示），与 132 题进度和场景存档分离；损坏字段被 sanitizer 丢弃。
- 深链支持 `?part=a|b|c`；阶段仍由 `?stage=` 控制。所有 ID 只接受白名单/存在性检查。

## 6. 明确限制

- C02 单粒子编辑目前提供“初速度”变式，不提供舞台拖拽手柄的全部几何编辑；仍然使用 P05 的真实多粒子解和统一 `tGlobal`。
- C05 整题使用 I05 规定速度（prescribed）模式；自由动力学与手动 B/手势属于基础模型页面，不在整题标准场景中混用。
- C06 连续舞台固定初速 8 m/s 以在有限时间内到达挡板；旧的 0.375 J 挡板实验保留为 B=0 分阶段控制实验，不混为同一物理条件。
- C07 的临界/反号结果是同一 P07 前向求解器在不同 B 下的分支/解析临界，不是新造的约束引擎。
- C08 在几何接触处停止，不模拟碰撞或形变；接触时两杆仍有相对速度，焦耳热 0.75 J 是求解器给出的标准答案。
- 所有结果都受各基础模型的理想化限制：忽略边缘场、自感、摩擦、相对论与器件厚度。真实 iPad/Android 和公网 HTTPS 仍为 `NOT_TESTED` / `BLOCKED`。

## 8. Round 17 追加：A17-01 跨求解器阶段交接

- 新增唯一适配器 `a17-electric-magnetic-screen`；它不属于第 17 个基础物理模型，仍是整题运行层。
- 阶段 A 用 `crossedFields` 的纯 E 解析状态；阶段 B 用 `finiteMagneticRegion` 的有限条带真实出入场；阶段 C 为解析自由漂移；屏幕命中/越界为真实事件。
- 纯运行时位于 `src/physics/composite/electricMagneticScreen.ts`，`stageTimings` 区分 A/B/C 本地时间，`events[].tGlobalS` 为统一全局时间。
- 两个交接点 `electric-acceleration → magnetic-strip`、`magnetic-strip → free-drift` 必须通过位置/速度/全局时间 ≤1e-9 与粒子身份检查；本轮实测误差为 0。
- 无边界到达、磁场无出场、屏幕未命中或越界时不生成后续伪造轨迹/光斑；`screenY` 返回 `null`。
- 答案依赖在教师编译时覆盖适配器全部变式键，判题重新读取当前 `model.answers`；变式参考值也读取当前值，不再直接使用旧基线。
- A17-01 内置案例仍使用既有案例 schema 的最小必要字段；教师草稿不写入 `ProblemCase` 数据文件，而是编译为 `WholeProblemLab` 的窄化运行时对象。
- C01–C08 与 A17 相关计数：内置原创案例 9 个；16 个模型与 132 道基础题不变。A17-02 是教师模板，不增加公开题库计数。
