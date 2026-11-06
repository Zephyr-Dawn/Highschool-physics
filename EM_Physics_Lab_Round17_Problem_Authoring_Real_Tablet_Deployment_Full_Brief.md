# EM Physics Lab — Round 17 完整开发任务书

**主题：教师复杂题目建模工作台 + 真实平板交付闭环（双轨并行）**  
**日期：2026-11-05**  
**定位：交付给 Codex 的执行级技术规范，不是已经实施的代码报告。**  
**语言：所有面向学生/教师的界面与教学说明为简体中文；程序标识符和测试命名按现有仓库习惯。**  
**优先级：物理正确性 > 整题教学真实性 > 既有存档安全 > 平板可用性 > 性能/视觉微调。**

---

## 0. 与 Round 16 的衔接、边界和成功标准

### 0.1 当前报告基线（必须从仓库复核）

根据用户提供的 Round 16 交付报告，当前系统已包含：

- 16 个 COMPLETE 物理模型：P01–P08、I01–I08。
- 132 道原创基础练习；另有 8 道原创整题案例 C01–C08，每题 3 个小问、共 24 小问。这两个计数必须分开。
- `/#/cases` 和 `/#/cases/:caseId`，`WholeProblemLab.tsx`、`buildWholeProblem.ts`、`types.ts`：8 道原创案例均达到项目定义的 `full_problem_simulated`，每案在同舞台使用原有求解器、统一时钟，具备事件、逐问解析、单位答案、变式。
- C02 两粒子同场独立 `launchTime`；P01 真 WebGL 3D；I05/I07 等连续感应、碰撞能量账本；统一 `ParamSlider` + 安全数学表达式解析器。
- 学习路线、教师遮答案、练习回链、场景备份恢复、版本化 localStorage、场景导入导出和离线 PWA。
- 已报告最近测试：`npm run typecheck` 通过、Vitest **556/556**、Playwright **172/172**、PWA **2/2**、`npm run verify:static` 通过。这是用户上一轮的报告，**不是本任务书对当前仓库的实测认证**。
- 5 条高考真题索引仍 `unverified/link_only`；尚无可信的全原卷与可转载授权，**不应将任何未核实真题说成已完整复现**。
- 公网 HTTPS 发布 `BLOCKED`（无托管授权），真实 iPadOS Safari / Android Chrome `NOT_TESTED`；CDP 测试仅 `SIMULATED`。

Codex 第一件事必须读取：`ROUND16_QA.md`、`WHOLE_PROBLEM_SIMULATION_SPEC.md`、`CASE_FULL_SOLUTION_AUDIT.md`、`ROUND16_GAP_AUDIT.md`、`EXAM_SOURCE_AUDIT.md`、`AGENT_HANDOFF.md`、`MODEL_COMPLETION_MATRIX.md`、`PHYSICS_SPEC.md`、`REQUIREMENTS.md`、`PARAMETER_INPUT_SPEC.md`、`DEPLOYMENT_STAGING.md`、`CLASSROOM_DEVICE_QA.md`，然后查找对应真实源码和测试。文件路径如有差异以仓库现状为准。

### 0.2 本轮不是继续“新增几个演示案例”

Round 16 解决了八道**内置原创题**的整题仿真与解析。下一个根本问题是：**教师拿到一道新的、多阶段的电磁学综合题，能否在不写 TypeScript、不修改物理引擎的情况下，用现有物理工具建立整题、逐问讲解并交给学生在平板上探索？**

因此，本轮同时完成两个实际可用交付：

- **Track A — 教师复杂题目建模工作台（Problem Authoring Studio）**：私有题目创建/导入、参数映射、白名单物理阶段组合、连续状态交接、逐问解析编辑和真题来源/权利标记；必须能构建至少一套真正跨求解器的**同一舞台连续物理题**，不再只是链接模型。
- **Track B — 真实平板交付与发布验收**：在现有静态部署基础上形成可操作的 HTTPS staging/正式发布手册及可复核的真机测试包；如果有授权和硬件则真正完成发布/测试，缺少时保留 `BLOCKED` / `NOT_TESTED` 并让用户可自行执行，不能以模拟器冒充真机。

双轨都要有可运行代码、测试、界面、文档；不能仅交付设计稿或清单。

### 0.3 保留的不可变约束

1. 不删除、不削弱原有 16 个物理求解器、132 基础题、8 原创整题、教师视图、数学表达式、学习路线、数据迁移、离线能力、P01 3D 及其回退。
2. **同一物理舞台 / 统一全局时间轴**是整题连续仿真的核心；不得用几个 iframe、分屏舞台或跳转模型伪造全程运动。
3. 原有 P02–P08 的 1–5 粒子机制保持 `launchTime_i`，编辑 A 的初态不能重发射 B/C；共享场/器件改变时按已有约定整场重演。
4. 时变磁场、手指推拉、感应电流、碰撞等都保留真实时间语义和力学/能量限制；不可为了通用编排而将已有 I05/I07 等求解器降级成可视插值。
5. 数学参数输入必须继续支持 `√2`、`√3/2`、`π`、括号、分数、科学记数法；非物理合法输入不 clamp、不吞错；不得用 `eval`、`new Function`、外部代码执行来实现题目/公式。
6. 公开发布的所有题目、图示、解析必须有独立 provenance 和 rights 证据；教师私有录入不能自动等价于获得可对外转载的许可。

---

## 1. 方案取舍与目标架构

考虑过三种实现方向：

- **方案 A：继续编写更多内置 C09/C10 案例。** 成本最低，但不能让教师为新题建模，问题仍会反复发生；**不采用为本轮主目标**。
- **方案 B：自由式通用物理建模器/脚本环境。** 看似最灵活，但绕过既有求解器、引入不可信代码、难以保证物理正确性；**不采用**。
- **方案 C：受限的教师案例编辑器 + 白名单阶段编排 + 已有模型的真实状态交接。** 首次支持教师自建复杂题，同时能继承过去十六轮的物理正确性和自动化测试；**采用**。

两个层次必须明确分离：

1. **内容层（题干、逐问、提示、图示、来源和授权）**：可以由教师编辑；不自动视为数学证明或已核验真题。
2. **物理层（几何、场、动力学、事件、答案量值）**：只能由经过校验的本地数据和受信任的物理求解器产生；不可执行任意题目文本里的程序代码。

不要开发一个全新的 17 号物理模型；这是现有 16 个模型之上的教学编排能力。

---

## 2. Track A：教师题目工作台——可操作的真实产品

### 2.1 入口和用户流

建议新增路由（可按现有路由体系适配）：

- `/#/teacher/problems`：本机私有题目列表，创建/复制/删除/导入/导出草稿，展示状态（草稿、已通过物理检查、缺失解析、来源/权限待核验）。
- `/#/teacher/problems/:draftId/edit`：编辑题干、题图、已知条件、几何配置、物理阶段和逐问解析。
- `/#/teacher/problems/:draftId/preview`：使用已有整题工作台在**同一个学生视图**预览；按用户原有教师/学生模式隐藏答案。草稿预览显示“本机教师草稿，非官方真题”。

教师可以：

1. 从空白创建题目，或复制 C01–C08 作为自己的**私有草稿**（不得修改内置原始内容）。
2. 输入题目名称、题干（仅本人拥有或有权使用的内容）、每一小问、教师讲解、知识点、来源/核验/授权状态。
3. 在条件面板中输入带单位参数，使用原安全表达式解析器，对数值、单位、维度、物理有效域进行校验。
4. 通过可选且明确受限的几何器件模板，配置 1–N 个受支持阶段；实时看到真实模拟状态和几何交界。
5. 对每个小问绑定一个或多个可验证观测量（到达时刻、位置、速度、电流、磁通、感生/动生电动势、焦耳热等）。输入人工审核的推导步骤/单位答案/常见错误；可以用引擎核验数值，但不得自动冒充“完整证明”。
6. 运行**检查与预演**，生成可读报告；只有通过物理编排校验后，才可标为 `simulation_verified`，不能自动设置 `source_verified` 或 `publication_authorized`。
7. 在本机存档；明确选择“导出私有题包 JSON”供教师备份。学生观看本机草稿仅能在获得题包并主动导入后实现，无任何服务器同步/公开题库的假象。

### 2.2 内容结构和白名单校验

尽可能扩展 `problemCaseSchema.ts`、`WholeProblemLab` 的既有类型/状态契约，而非复制一套案例运行时。若必须拆分，保持一个共同 runtime：`ProblemCase` 用于只读内置题；`TeacherProblemDraft` 经过校验编译为只读、不可执行的 `CompiledProblemCase`。

建议数据契约：

```ts
type DraftReviewStatus =
  | 'draft' | 'content_incomplete' | 'physics_unverified'
  | 'simulation_verified' | 'unsupported';

type PublicationRights = 'original' | 'link_only' | 'permission_granted' | 'unknown';

type ExamSourceReview = 'unverified' | 'metadata_verified' | 'paper_and_solution_verified';

type StageSupport = 'continuous' | 'independent_stage' | 'concept_only' | 'unsupported';

interface TeacherProblemDraftV1 {
  schema: 'emplab.teacher-problem.v1';
  id: string;
  title: string;
  content: {
    stem: string;
    parts: Array<{
      id: string;
      prompt: string;
      hints: string[];
      derivationSteps: string[];
      expectedObservableKeys: string[];
      explanationReviewed: boolean;
    }>;
  };
  provenance: {
    kind: 'original_case' | 'exam_reference' | 'teacher_private';
    sourceUrl?: string;
    examYear?: number;
    paperName?: string;
    questionNumber?: string;
    sourceReview: ExamSourceReview;
    rights: PublicationRights;
    reviewEvidence?: string;
  };
  stages: unknown[]; // persisted values MUST be narrowed by runtime whitelist validator
  updatedAt: string;
}
```

以上是设计意图，Codex 应以真实仓库的现有类型为准，不要直接留下 `unknown[]` 给业务代码任意访问。请明确：

- 每个可编辑 JSON 字段具有边界：题干、说明、公式长度、阶段数量、答案小问数量、总文件大小。
- 符号表达式通过已有 `parameterExpression.ts` 白名单解析；数学输入保持量纲和单位映射，例如 cm→m、mT→T、ms→s，禁止在运行时改变 SI 内部语义。
- 不允许 `eval`、函数体字符串、动态 import path、任意 class/function 名、自由 HTML、JS 事件处理属性、外部脚本、危险 URL scheme。
- 渲染教师文本时防范注入：默认纯文本/安全 Markdown 白名单，数学展示仅可信解析或严格安全渲染器，不允许任意 HTML。
- 导入的 JSON 具有总大小/深度限制；损坏/超大/恶意数据不改变既存题库或模型存档。
- 来源和版权为两个**独立字段**；源信息已查证不表示允许公开转载。

### 2.3 私有题目存储安全

推荐在已有本地存储架构中新增版本化命名空间：`emplab.teacher-problems.v1`。小型文本题可采用受控 localStorage；如允许教师在本地附原卷图片，则应使用 IndexedDB/Blob，**不可将大型 base64 图写入 localStorage、PWA 预缓存或公开构建资产**。图片导入并非本轮必需功能；如开发，必须具有类型/体积限制、本机访问提示和删除清理。

- 所有私有题目默认 `local_only`，UI 明确说明浏览器清理存储会丢失草稿，建议用户自行导出备份。
- 初次创建、编辑未保存、取消修改、切换路由/返回实验必须无意外覆盖；可提供显式保存/撤销和“离开有未保存更改”提示。
- 原始 C01–C08 及 132 道基础练习永远保持不可变；复制后形成新 ID 和独立进度。
- 不允许 private draft 自行改写 `verifiedOnline`、`rights`、公开题库统计或任何官方认证标识。
- 共享私有题包必须带“本地自建内容，来源与使用权限由导入者核实”；默认不会远程同步。

### 2.4 真题工作流的现实边界

现有 5 个引用仍为 `unverified/link_only`；本轮不要再用没有依据的网络片段“补齐”成官方题目。

- 若教师主动提供其有权使用的原题资料，本机录入可辅助个人教学建模，但**个人持有文件不自动授予公开转载权**。
- 未经确认的年份、地区、题号、图像、答案和署名不得自动标真；即使题目成功仿真也只能标 `simulation_verified`。
- 支持“仅保留合法外链/来源元信息 + 教师私有题设”两条分离的流程；公开题库默认只包含项目原创内容和获得授权的内容。
- 不开发“根据一道图片自动保证完整仿真”的虚假功能。OCR/视觉题意识别可在未来单独规划，本轮不依赖 AI API，不将整题原卷上传第三方。
- 如果真实原卷/授权证据不可获取，实测要用新增的原创复杂题和复制草稿覆盖全部编辑功能；真题复现仍列为 BLOCKED 而非 COMPLETE。

---

## 3. Track A：跨求解器连续阶段编排（本轮最重要的技术能力）

### 3.1 三类能力，严禁混淆

必须在学生视图和教师编辑器中清楚展示：

1. `continuous`：阶段与阶段之间具有**经物理验证的状态交接**，在同一物理坐标系和全局时间轴上，粒子/器件没有时间或位置跳变。
2. `independent_stage`：用不同模型独立讲解同一综合题的不同推理，但没有真实连续状态交接；每段独立初值与时间，不得显示“连续整题动画”徽标。
3. `concept_only` / `unsupported`：只能辅助理解概念或完全未覆盖的假设；不能给学生虚假的求解结果。

本轮不要求实现“任意十六种求解器自由相连”；这是不具有明确物理意义的。必须至少落地一个**有严格物理接口和验算锚点的跨求解器组合**，其他组合通过 capability registry 明确声明不可拼接。

### 3.2 统一物理阶段契约

建议内部定义可判别的状态接口：

```ts
type PhysicalStageKind = 'charged-particle-2d' | 'moving-loop' | 'coupled-rods';

type ParticleSnapshotSI = {
  kind: 'charged-particle-2d';
  globalTime: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  chargeC: number;
  massKg: number;
  particleId: string;
};

type StageExit = {
  status: 'transition' | 'absorbed' | 'screen-hit' | 'stopped' | 'event-limited' | 'unsupported';
  atGlobalTime: number;
  boundaryId?: string;
  physicalState: ParticleSnapshotSI | /* existing discriminated types */ unknown;
};
```

请在仓库真实类型中完成必要的 TypeScript discriminated union：

- `globalTime`、`localTime`、`launchTime_i` 转换规则明确，`tGlobal=launchTime_i + tau_i`；不得将两段本地 `t=0` 偷偷连接为连续全程。
- 同一粒子跨区保持 `q,m` 和粒子稳定 ID（若题设确实要求粒子发生物理变化，需要明确建模，不能隐式修改）。
- 交接位置、速度分量、全局时间必须连续，除非有**明确的真实碰撞或外冲量**事件；事件终止时不得继续后续轨迹。
- 场、装置几何与单位必须兼容，右端点应作为下段起点，必须处理边界起点的前向方向选择、相切、反向、零速度和同一时刻复合事件。
- Induction 类型如运动线框与双棒，不得仅因为都有 x、v 就自动拼接：导体拓扑、电路电流、储能、约束和质量必须兼容。没有明确定义的转换只能 `independent_stage`。
- 若无可验证的共享物理契约，应在编辑器显示“此组合仅支持分阶段独立建模，不能连续仿真”，不运行伪造动画。

### 3.3 白名单编排注册表

每种可连接阶段以受信任代码注册为受限适配器，例如：

```ts
interface StageAdapterRegistryEntry {
  id: string; // stable allowlisted adapter identifier
  kind: PhysicalStageKind;
  canAcceptPreviousState: boolean;
  supportedTransitions: string[];
  validateConfig: (unknownConfig: unknown) => ValidationResult;
  // actual solver interfaces should reuse existing project types
}
```

不要把函数/类序列化到 JSON：持久化只保存 adapter ID 与有限参数数据，由本地白名单查表。禁止从用户输入构造动态 import 字符串。

建议优先复用 P06 的纯电场运动、P04 的有限磁区事件、P07 的自由漂移/屏幕交点能力；P01/P02/P03/P05/P08 不要求本轮全部接入自动组合器，后续只需注册适配器即可。适配层应尽可能调用既有 `crossedFields.ts`、`finiteMagneticRegion.ts`、`beamline.ts` 等纯函数，不能复制一份“教学专用近似求解器”。

### 3.4 强制落地的跨引擎原创验证案例（A17-01）

**题目结构：纯电场加速 → 有限磁场偏转 → 无场自由飞行 → 探测屏**。若现有引擎对坐标/几何接口有差异，完成明确的单位/坐标映射，并在 QA 中报告等价实现，不可为了通过预期结果篡改物理求解器。

取 SI 单位：

- `q=+1 C, m=1 kg`（教学尺度解析锚点，并非真实微观粒子数值）。
- 起点 `(x,y)=(0,0)`；初速度 `(vx,vy)=(1,0)`。
- **阶段 A**：纯匀强电场 `E=(+1,0) V/m`，从 `x=0` 到 `x=1`，无磁场；到达边界前不考虑其他力。
- **阶段 B**：磁条带 `1≤x≤1+√3/2`，`Bz=-1 T`，`E=0`，以 A 阶段的出射物理状态直接进入（不是手工重填 `v`）。
- **阶段 C**：从磁条带右边界在无场中漂移至 `x_screen=2+√3/2` 的零厚度屏幕；若未真正向右到达屏幕，状态应报告未检出/不可到达，不硬显示光斑。

独立解析标准答案：

1. A 阶段电场做功 `qE Δx=1 J`，初动能 `K0=1/2 J`，末动能 `K1=3/2 J`；因此 `v1=√3 m/s`，`t_A=√3−1 s`，出射 `(1,0)`，速度 `(√3,0)`。
2. B 阶段 `ω=−qB/m=+1 rad/s`、`R=√3 m`，首次到右边界时相位角 `π/6`，`Δt_B=π/6 s`；出射位置 `(1+√3/2, √3−3/2)`，速度 `(3/2, √3/2)`。
3. C 阶段 `Δx=1 m`，`Δt_C=2/3 s`；屏幕命中位置 `y_screen=4√3/3−3/2 m`，总时间 `t_total=√3−1+π/6+2/3 s`。
4. 通过 `qEΔx` 验证 A 阶段能量、通过 `|v_B|=|v_A|=√3` 验证 B 阶段磁场不做功；C 阶段速度不变。
5. 连续阶段交接点比较：位置误差 `≤1e-9 m`，速度误差 `≤1e-9 m/s`，全局时间误差 `≤1e-9 s`（若现有求解器浮点条件不能达到，应基于独立误差分析解释并建立合理容差，不要通过改写预期值掩盖）。

测试必须检查：学生仅修改 `E_x` 或磁场 `Bz` 时，下游阶段状态、事件、光斑与答案一起重新求解；不允许仍显示前一解。反向磁场、零场、临界相切、屏幕越界、粒子停滞、无解/多路径等应给出**正确的物理状态与可解释原因**，而不是强行输出默认答案。

> **注意：** 这个 A17-01 是全新原创案例，不属于任何实际高考试卷。它应以“电场加速—有界磁场—屏幕的复合整题”为学生可复现演示。若正式题目需要其他参数，可以建立额外实例，但不得覆盖这个独立解析锚点。

### 3.5 第二个教师可编辑案例（A17-02）

选择 I05、I06 或 I07 中一个有成熟独立解析锚点的复杂感应题，完成**同一求解器内部多事件全程**的教师编辑/预览：例如 I07 的 `相反双磁区→挡板碰撞→反向再入`，逐问分析 `Φ/ε/I/F/反弹时间/Q_J/Q_impact`。

- 本例不强制跨 induction 求解器拼接，以免虚构电路连续性；但必须是教师能够修改题设和小问并重新求解的真实私有题。
- 至少覆盖 3 个小问：一问几何/磁通、一问电流或力、一问能量/事件；教师给出逐步推导，学习视图有单位答案检查和两层提示。
- 若选择 I07，弹性/非弹性碰撞与焦耳热必须分别记账，不能用 `Q_J` 代替冲击损失。

### 3.6 编辑器教学功能必须可使用

- **逐问**：创建/排序/删除小问、编辑两层提示和推导步骤；选择已注册 observable（与求解器绑定），设答案单位和容差；计算出有效结果才可通过物理校验。
- **预览**：同屏题干 + 单舞台完整演示 + 全局时间轴 + 事件定位 + 逐问答案折叠 + 变式。尽可能直接复用 `WholeProblemLab`，而不是复制新舞台。
- **变式**：可将具体数值绑定白名单参数，例如电场、磁场、速度、间距、挡板位置；改变后自动 invalidates 依赖的答案和讲解数值，不能留下旧解。
- **语义标注**：某一步只能做概念辅助时，显示 `concept_only`；只有真实物理状态交接才可显示 `continuous`。
- **图示**：优先复用受信任舞台和现有图层；新增教师标注可包含文本、圆心/边界/角度参考标记，但不能把教师手绘轨迹作为真实求解轨迹。
- **存档/恢复**：编辑自建题不能改变原有个人实验场景、原题进度和 132 练习进度；预览后回到编辑器应保持草稿与焦点位置。

---

## 4. Track A 的测试门槛和安全威胁模型

### 4.1 必需自动化测试

- 案例序列化/导入/导出、旧版本与损坏 JSON、空字段、重复 ID、超长输入、过多阶段、未知 adapter、非有限数、非法单位、非法 URL、恶意 Markdown/HTML、`__proto__` 污染输入；均安全拒绝且原存档不变。
- `√3/2`、`π/6`、`1/3`、`1e-6`、超 slider 合法值和非法根号/除零，以及 mass/匝数等整数与正值域验证。
- A17-01 电场功—磁场圆弧—屏幕的上述解析锚点；更改场参数后事件/答案一致变化；无入场、不命中、相切和中途终止不会穿越到不存在的下一段。
- 同舞台/同全局时间轴、A/B 两粒子保持其他粒子运行、全局时间不回退、场变化按现有重演语义重算；不依赖样条插值制造轨迹。
- A17-02 感应/挡板完整多事件测试；碰撞损失、焦耳热、外功分离；教师修改题目后展示结果更新。
- 教师私人题版权标签 `teacher_private/rights=unknown` 不可提升为“官方真题/可公开转载”；source verification 与 physical simulation verification 独立。
- private draft 的数据绝不进入生产静态构建、离线 precache、日志或诊断 JSON；导出仅响应明确点击。
- 手机/平板软键盘弹出时表单可滚动；44 CSS px 触控区域、屏幕旋转、模型舞台与编辑器滚动互不争抢。
- 无障碍：键盘可达、输入错误可感知、读屏说明不靠颜色、长公式有换行/替代读法。

### 4.2 错误与降级必须“物理诚实”

新增状态 `unsupported`、`no-event`、`event-limited`、`needs-review`、`ambiguous-multiple-solutions` 等时应将用户可见文字与模型分开；不可将计算失败当作严格物理解不存在。数值求根如果只做有限区间扫描，必须显示限制。教师可以编辑解释，但**标为模拟已验证**必须由引擎和测试生成证据。

---

## 5. Track B：HTTPS 部署与真实设备验收——把 BLOCKED 变成可操作

### 5.1 检查现有工程

必须检查现有 `netlify.toml`、`public/_headers`、`npm run verify:static`、`npm run preview:staging`、Service Worker 更新策略、hash 路由和静态资源路径。不要因为 Round 15 已写配置就假设实际公网可访问。

交付两类清晰步骤：

1. **无托管凭据也能做的本地准备和模拟验收**：生产构建、静态资源哈希与校验、离线/升级测试、模拟视口、PWA installability 先决条件检查、发布包和回滚说明。
2. **只有持有托管授权才可执行的真实 staging 发布**：由用户选择已有平台（如 Netlify 或 Cloudflare Pages；优先复用仓库现有 Netlify 配置）、提供连接/登录/授权后发布。不可尝试绕开认证，不可自行创建付费服务，不得虚构公网 URL。

如果发布凭证仍不存在，最终应明确：`STATIC_PACKAGE_READY / HTTPS_DEPLOYMENT_BLOCKED / USER_ACTION_REQUIRED`，并写具体 UI/CLI 操作说明，便于用户自行将构建产物部署至可信托管站点。

### 5.2 静态部署正确性

- 验证 `/#/teacher/problems`、`/#/cases`、`/#/cases/:id`、16 模型、学习路线、`/#/device-check` 等路由在新浏览器、直接深链、刷新、在线→离线状态下一致；确保用户不依赖开发服务器。
- 构建 `dist` 的文件路径和运行时 base 一致，Service Worker 和 manifest 使用合法安全上下文；不要把 `http://192.168.*` 当作一般浏览器可信的 HTTPS 等价物。
- 从上一版本缓存升级后，不会导致模型 lazy chunk 加载失败/404 和永久白屏；有可恢复的“新版本可用/刷新”提示和失败恢复路径。
- PWA 数据保留：16 个模型的 v2 场景、132 题进度、8 个 C01–C08 案例进度、新教师草稿都在升级中保留；不得清空整个 origin storage 来解决缓存问题。
- 外部真题来源 URL 在离线时显示“需联网打开外部资料”，不将未授权原卷自动加入 precache。
- CSP/headers 与 WebGL 和字体加载兼容（遵循现有项目构建）；不建议盲目设置会阻断 worker/wasm/3D 的规则。无凭据时可用本地静态服务检查头部模板，但不能声称已验证真实 CDN/HTTPS 头部。

### 5.3 真实 iPad/Android 验收脚本（可以手动执行）

以现有 `/#/device-check` 为基础，生成两个真实设备的可执行测试包：

**iPadOS Safari**：首次 HTTPS 访问→安装到主屏（若系统支持）→首轮缓存完成→飞行模式离线重启；横竖屏、安全区、动态字体、软键盘/Done 键、长按复制、数学表达式输入、P01 WebGL 单指旋转/双指缩放/矢量手柄、第二指取消、后台 1 分钟/恢复、P07 五粒子、I05/I07 手动时间、案例返回/进度恢复、教师自建题预览。

**Android Chrome**：同样的安装/离线/切后台/旋转/触控/数值输入，含 Android Chrome 地址栏高度变化、返回手势、物理手指触控、TalkBack；与 iPad 结果独立记录。

**长时验收**：真实设备至少 15 分钟演示循环，观察发热/耗电（用户主观/系统可得信息）、异常退出、WebGL context lost 恢复、输入延迟、场景状态保持。必须记录设备/OS/浏览器版本和日期。不要承诺能自动读到精确温度、电池健康数据。

状态必须区分 `PASS | FAIL | BLOCKED | NOT_TESTED`；自动 Playwright 的 `SIMULATED_PASS` 必须在另一层，不能汇总进真实设备 PASS 计数。没有真机访问时只交付测试清单与导出工具，**保留全部真机项目为 NOT_TESTED**。

### 5.4 诊断报告和隐私

用户显式同意并点击时才允许导出：设备信息、视口尺寸、可用 WebGL、SW 状态、性能测量的 p50/p95/p99、人工勾选测试结果、时间和渲染条件。严格**不包含**自编题干/原卷图片、学生回答、姓名、账号、位置信息、IP、访问 token、具体场景数值或手势轨迹。

诊断 JSON 必须有明确 schema 和来源标签：`simulated` 或 `physical-device-self-reported`。不得因为 User-Agent 像 iPad 就自动标“真机测试通过”。

### 5.5 有证据才优化性能

针对 P01 3D 首次加载约 978 kB 原始 chunk（来自此前报告）、P07/P08 五粒子教师模式、复杂案例整题、教师编辑器的实时预览进行控制变量测试。只有观测到卡顿/资源泄漏，才有针对性地优化路径 LOD、缓存与 DPR；不得减少物理事件精度、减少可调整粒子数量或修改引擎以伪造高帧率。

保存生产预览的 rAF 间隔与 JS heap、设备实际报告分开；禁止在没有真机时写“稳定 60 fps”。

---

## 6. 技术实现边界与建议文件分工

**先审计真实仓库，路径按实际目录调整**。建议新文件（仅是模块职责建议，非强制照抄）：

```text
src/features/problem-authoring/
  teacherProblemSchema.ts       # runtime parsing, validation, typed DTO
  teacherProblemStore.ts        # local_only versioned state and safe import/export
  problemAdapterRegistry.ts     # whitelist of supported physics adapters
  continuousStageRuntime.ts     # global timeline and verified state handoff
  problemCompiler.ts            # validated draft -> read-only executable case
  solutionBinding.ts            # part -> trusted observable / valid units / freshness
  TeacherProblemListPage.tsx    # draft list
  TeacherProblemEditorPage.tsx  # content, stages, parts, preview
  TeacherProblemPreviewPage.tsx # reuse WholeProblemLab
  fixtures/                    # A17-01 and A17-02 original fixtures

src/features/problem-authoring/__tests__/
  teacherProblemSchema.test.ts
  teacherProblemStore.test.ts
  continuousStageRuntime.test.ts
  problemCompiler.test.ts
  solutionBinding.test.ts

tests/tablet/
  round17-authoring.spec.ts
  round17-stage-handoff.spec.ts
  round17-release-regression.spec.ts

scripts/
  verify-release-artifact.mjs   # may extend existing verify:static

docs/
  ROUND17_BASELINE_AUDIT.md
  ROUND17_PROBLEM_AUTHORING_SPEC.md
  ROUND17_COMPOSITE_PHYSICS_PROOF.md
  ROUND17_DEVICE_RELEASE_MATRIX.md
  ROUND17_QA.md
```

- 一个 agent/工作树专做 **Track A 的物理状态契约和纯逻辑编排**；另一 agent 专做 **Track B 的静态包、设备 QA 与文档**；主 agent 负责共享路由、首页、PWA manifest、全局样式和整体验收。
- 如果子代理不能互相看到同一工作区或文件树，采用串行集成；不得假装并行完成。
- 不新建重复 `ParticleRoster`、全局 clock、`ParamSlider`、`WholeProblemLab`、`sceneStorage`、练习成绩存储。
- 教师题目编排 UI 不能依赖 Three.js/R3F 首屏加载；只打开 P01 3D 时按既有机制 lazy import。

---

## 7. 实施顺序与可复核里程碑

### Phase 0 — 仓库审计（开始写代码前）

查明 `buildWholeProblem` 的注册机制、C01–C08 的结构和预设入口、现有多粒子状态、场景恢复、数学表达式单位层、I07/I06 终止事件、`netlify.toml`、PWA 缓存版本。写 `ROUND17_BASELINE_AUDIT.md`，记录本轮真实起点、所有新增改动影响面、测试基线、组件复用判断。

### Phase 1A — 可信的数据和物理类型（必须先于 UI）

先写失败测试再实现：教师草稿 schema、单位解析、来源/权利逻辑、白名单适配器注册、阶段交接契约、下游答案失效传播。完成纯函数单测。

### Phase 1B — 发布与设备基础

验证静态构建、缓存升级和新路由离线深链；实现/扩充设备 QA 状态导出及使用说明。没有外部凭据也要独立完成。

### Phase 2A — 真实完整纵向案例

先将 A17-01 实现为**同一舞台**的真实跨引擎连续场景，接入教师草稿编辑器；跑解析锚点、Playwright 事件/答案测试；不接受“几个独立实验链接”作为通过。

### Phase 2B — 教师编辑/预览与感应案例

完成 CRUD、逐问解析、两层提示、参数变式、存档、导出导入、权限/来源标注；实现 A17-02；复用已有 WholeProblemLab 和答案检查功能。验证修改题设后所有相关数值答案和图表自动更新。

### Phase 3 — 静态交付与平板

生成可分发的静态发布包、部署指导与回滚流程；有真实托管权限时部署 staging 并核验 URL，若没有就明确 BLOCKED。真实设备有条件就填写 QA，没条件就保留 NOT_TESTED；不以设备模拟结论冒充真机。

### Phase 4 — 全量回归与文档

执行完整 typecheck/Vitest/Playwright/PWA/verify:static/build，关键用户流程截图，更新所有受影响文档。最终报告两轨结果、实际权限/设备状态和剩余风险。

---

## 8. 独立验收矩阵（每项都须有测试或实际证据）

### Track A 必过

1. 一位教师能在**无代码操作**下创建一份本机私有综合题，编辑题干、各小问、解析与参数，并成功预览。
2. A17-01 从纯电场加速到有限磁场到屏幕是在**同一舞台、同一时间轴、状态连续**；至少记录 2 个精确交接事件与屏幕事件；具有独立可手算解析锚点。
3. 改变 A17-01 的 `E_x`、磁场宽度或 `Bz` 后，后续物理状态/到达事件/逐问答案全部重新计算，无陈旧结果。无事件时不生成假屏幕光斑。
4. A17-02 可由教师编辑，展示感应电动势、电流、受力、真实边界/挡板事件及能量关系；如果不具备条件，应显示 `needs-review`，而不是编造数值答案。
5. 复制 C03/C08 为私人草稿不会改动内置题目；导入导出再导入后，物理状态与小问绑定正确；删除私人草稿不影响其他进度/实验。
6. 非法题包（恶意字段、超大内容、非法数学表达式、unknown adapter、损坏 JSON）安全拒绝，无脚本执行、原数据不丢失。
7. 标注真实考试来源但未验原题/未获公开授权时，公开案例列表不显示原题干/图片/官方解析；成功求解物理题不自动更改其 rights 或 verification。
8. 平板模拟 1194×834、1024×768、768×1024 等视口，编辑器表单、软键盘模拟、纵向滚动、模拟舞台拖动、答案输入均可用。

### Track B 必过

1. 真实可执行的构建和静态文件校验，说明部署位置/可操作步骤；所有新旧 hash 路由深链正确。
2. 新版本 PWA 更新时，旧场景、132 题进度、8 内置原创案例和新教师私有草稿保存完好。
3. 新浏览器完成一次合法在线加载后，可在离线状态访问 16 个模型、案例、学习路线、教师自建题和所需 lazy chunks（本地数据同源保存）。
4. 设备检测初始人工项目均为 `NOT_TESTED`；用户可自行执行、勾选并导出 JSON；诊断绝不包含题干、答案或个人实验数据。
5. 真正的公网 HTTPS staging 只有在实际授权并经访问核验后标 `DEPLOYED`；无授权必须标 `BLOCKED`。不能把本地预览或局域网 HTTP 当作 staging。
6. iPadOS/Android 只可根据实际设备报告标 `PASS`；CDP 合成触摸只可算模拟通过。真实设备没测试必须原样报告 `NOT_TESTED`。
7. P01 3D 上下文丢失/恢复或 2D fallback 可用，长时运行如果无法实测则明列缺口；不修改旧物理引擎以换取帧率数字。

### 全量测试（由 Codex 在真实仓库运行）

```bash
npm run typecheck
npx vitest run
npx playwright test
npm run build
npm run test:pwa
npm run verify:static
```

当前**报告参考基线**为 Vitest 556/556、Playwright 172/172、PWA 2/2；Codex 必须实际查证现有测试数和新增测试，不能直接复述上一轮数字。任何偶发测试超时必须保留日志、排除真实回归，不得通过跳过测试或放宽物理断言处理。

---

## 9. 文档、截图与最终报告规范

### 必需文档

- `ROUND17_BASELINE_AUDIT.md`：真实仓库基线与依赖/分工。
- `ROUND17_PROBLEM_AUTHORING_SPEC.md`：自建题 JSON schema、白名单 adapter、版权/来源、存储与迁移。
- `ROUND17_COMPOSITE_PHYSICS_PROOF.md`：A17-01 独立解析全过程与数值容差，A17-02 的感应能量证明、事件/交接记录。
- `ROUND17_DEVICE_RELEASE_MATRIX.md`：静态部署配置、可访问 URL（如真实成功）、人工 QA 设备/版本/时间、PASS/FAIL/BLOCKED/NOT_TESTED 清单。
- `ROUND17_QA.md`：新旧所有测试、截图、性能数据、失败重跑和真实限制。
- 同步 `README.md`、`REQUIREMENTS.md`、`CONTENT_MAP.md`、`QA.md`、`DECISIONS.md`、`AGENT_HANDOFF.md`、`EXAM_SOURCE_AUDIT.md`、`WHOLE_PROBLEM_SIMULATION_SPEC.md`；`MODEL_COMPLETION_MATRIX.md` 仍 16/16，不把教师题工具算作第 17 个模型。

### 截图及浏览器证据

至少拍摄：教师草稿列表、编辑题干/逐问、A17-01 三阶段同屏场景、A17-01 推导与屏幕结果、A17-01 修改参数后的结果、A17-02 真实感应过程、来源未核验/私有标识、导入/导出、平板模拟横竖屏、设备诊断与导出、离线访问。区分 `SIMULATED` 截图与真实硬件截图。

### 交付报告要回答的 8 个问题

1. 两个 Track 分别完成了哪些真实代码、页面和文件？
2. A17-01 的加速末速度、磁场出射状态、屏幕落点、总时间的独立解析值与求解器值误差多大？
3. A17-02 能否教师独立修改、答案是否动态验证，是否有不可连续的阶段被错误连接？
4. 题包恶意导入、版权与来源状态、浏览器存储丢失的安全处理结果如何？
5. 16 个模型、132 题、8 个原案例是否无回归？新教师草稿计数单独列出。
6. 真实 HTTPS URL 是什么？若无，精确阻碍、下一步用户需要的授权是什么？
7. 哪些项在真实 iPad/Android 上实际做过？哪些仍是 `NOT_TESTED`？自动化数据是否清楚标 `SIMULATED`？
8. 全量测试、PWA 更新、图片和日志的原始证据及剩余限制是什么？

---

## 10. 不要做的事

- 不复制真实高考题全文/原图/答案进入公共资源目录，除非授权或其他合法使用依据已被核实和记录。
- 不根据题号猜测某道真题的物理装置，不把“高考风格原创”标作“真题复现”。
- 不开发聊天 AI 自动解题、不依赖云模型 API 或未付费的外部识别服务作为本轮完成条件。
- 不允许本地题包的自定义表达式执行 JavaScript、DOM、网络请求、任意代码；所有计算必须走可信白名单。
- 不将互不兼容的物理模型仅凭公共变量名“拼接”，不把分屏/跳转伪装为单场景完整仿真。
- 不因为新增教师工作台就重写 16 个求解器或任意更改其物理定义。
- 不把 `SIMULATED` 测试当真机 PASS，不凭本地 `localhost` 预览声称公网 HTTPS 部署成功。
- 不通过清空存储强制修复 PWA 更新；不丢失用户原有实验或进度。
- 不要求用户购买托管、提供秘密密钥或公开个人账号才能完成可本地交付的部分。

---

## 11. 推荐并行安排

在 Codex 支持隔离工作树/子代理时：

- Agent A：A17-01 的纯物理阶段契约、白名单 adapter、解析锚点、单元测试。
- Agent B：教师题目内容/schema/store/editor、A17-02 与 E2E，不修改 Agent A 的物理 adapter 文件，先约定接口。
- Agent C 或主 Agent：Track B 的发布包、设备 QA、PWA 升级测试、文档。
- 主 Agent 负责全局路由/首页/导航/样式/测试总入口/共享类型的集成和全部回归；代理合并前需检查冲突。

如果 Agent 数量/调用成本受限，优先主 Codex 串行完成核心实现：**schema → 跨求解器物理锚点 → editor/preview → deployment/device QA → regression**。不要求为并行而调用昂贵模型，也不允许对同一共享文件并发覆盖。

---

## 12. 本轮完成定义（DoD）

**Track A COMPLETE** 当且仅当：教师可以自己在界面内创建、编辑、保存/导出、预览一份至少 3 小问的复杂题；A17-01 经独立解析证明为真实跨求解器、同舞台、同时间轴、正确状态交接；A17-02 展示感应多事件和逐问数据；用户修改条件后答案可靠更新；非法数据、权利状态、原有存档均有自动化回归。

**Track B CODE_COMPLETE** 当且仅当：存在可靠的 HTTPS 静态发布包/操作步骤、新旧路由与 PWA 更新回归、真实设备验收流程和脱敏导出工具。**Track B PUBLIC_DEPLOYED** 仅当有真正在公网可访问且通过核验的 HTTPS URL；**HARDWARE_VERIFIED** 仅当记录真实 iPad/Android 实测。这三种状态不可合并。

**Round 17 总结** 不得用 Track B 的实际外部权限/硬件缺口掩盖 Track A 已完成代码；也不得以“没权限上线”为由放弃所有本地可完成的开发。最终写明每个独立完成状态和 blockers。

---

## 13. 可直接发送 Codex 的简短启动指令

> 将本文件放入仓库根目录或让 Codex 使用绝对路径读取，然后发送：
>
> 请完整阅读 `EM_Physics_Lab_Round17_Problem_Authoring_Real_Tablet_Deployment_Full_Brief.md`。本轮必须完成 Track A 教师私有复杂题建模工作台及跨求解器的真实连续状态交接（优先 A17-01 电加速→有限磁场→无场屏幕，且解析、事件和逐问答案可复核），和 Track B 的 HTTPS 静态发布包、PWA 升级/离线与真实平板验收流程。保留既有 16 个模型、132 题、C01–C08 八道整题、数学表达式、多粒子和真实物理求解器；私有录入不代表真题核验或转载授权。没有托管账户/真机时，继续完成所有可本地开发部分，外部发布标 BLOCKED、硬件标 NOT_TESTED，禁止伪造公网 URL 或模拟器结果。先审计，再写独立物理单测，再完成 UI 和全量回归，最终提交证据与限制。直接实现，不要只给规划。
