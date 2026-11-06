import type { ProblemCase, QuestionPart } from './problemCaseSchema';

const SQRT3 = Math.sqrt(3);
const SCREEN_Y = (4 * SQRT3) / 3 - 1.5;
const CHECKED = '2026-11-05';

type RawCase = Omit<ProblemCase, 'parts' | 'wholeProblem'>;

function part(value: QuestionPart): QuestionPart {
  return value;
}

export const A17_CASE_ID = 'case-a17-electric-magnetic-screen';

export const A17_CASE_RAW: RawCase = {
  id: A17_CASE_ID,
  title: 'A17-01 电场加速—有限磁场—探测屏',
  subtitle: '跨求解器连续状态交接与屏幕落点',
  provenance: {
    sourceKind: 'original_case',
    verification: 'paper_and_solution_verified',
    rights: 'original',
    rightsEvidence: '题面、图示、解析、数值与阶段组合器均由本项目原创。',
    checkedAt: CHECKED,
    reviewNotes: '独立解析锚点与连续阶段运行时测试同时通过；不是高考原题。',
  },
  topicTags: ['电场加速', '有界磁场', '跨阶段连续', '屏幕探测'],
  difficulty: 'integrated',
  stem:
    `q=+1 C、m=1 kg 的粒子从原点以 v₀=(1,0) m/s 出发。第一阶段 0≤x≤1 m 只有匀强电场 E=(+1,0) V/m；第二阶段 1≤x≤1+√3/2 m 只有垂直纸面向里的磁场 Bz=−1 T；随后无场漂移，探测屏在 x=2+√3/2 m。忽略重力、边缘场与器件厚度。粒子从电场出射的真实位置和速度直接进入磁场，再从磁场真实出射状态进入无场区，全程使用同一坐标与全局时间。求 (a) 电场出射速率；(b) 磁场出射点的 y 坐标；(c) 屏幕有效接收区的落点 y。若中途没有真实出场或没有到达屏幕，不得强行显示下一阶段或光斑。`,
  prediction: {
    question: '粒子从电场边界 (1,0) 以速度 (√3,0) 进入 Bz=−1 T 的条带。磁场出口的速度方向最接近：',
    options: ['仍沿 +x，因为磁场不做功', '斜向右上，y 分量为正', '斜向右下，y 分量为负', '沿 −x 返回电场'],
    correct: 1,
    explain: 'q>0、Bz<0 时洛伦兹力使速度向 +y 偏转；速率大小不变，但方向由 +x 转向右上。',
  },
  stages: [
    {
      id: 'a17-component-link',
      title: 'A17-01 复合整题锚点（P06 仅作组件概念对照）',
      modelId: 'p06',
      modelMatch: 'partial_stage',
      presetId: 'p06-accelerate',
      limitations: [
        'P06 页面不能替代本整题的跨阶段连续状态交接',
        '单一基础模型预设只用于观察电场或磁场组件',
        '整题以同一舞台的 A17-01 运行时为准',
      ],
      parameterMappings: [
        { questionSymbol: 'E_x', modelParameter: 'electricFieldX', units: 'V/m', explanation: '阶段 A 的匀强电场' },
        { questionSymbol: 'Bz', modelParameter: 'magneticFieldZ', units: 'T', explanation: '阶段 B 的有符号磁场' },
        { questionSymbol: 'w', modelParameter: 'magneticWidthM', units: 'm', explanation: '有限磁场条带宽度' },
        { questionSymbol: 'x_screen', modelParameter: 'screenGapM', units: 'm', explanation: '屏幕相对磁场右边界的距离' },
      ],
      checkableObservables: ['accelerationExitSpeedMps', 'magneticExitY', 'screenY'],
      expected: {
        accelerationExitSpeedMps: { value: SQRT3, unit: 'm/s', tolerance: 1e-9 },
        magneticExitY: { value: SQRT3 - 1.5, unit: 'm', tolerance: 1e-9 },
        screenY: { value: SCREEN_Y, unit: 'm', tolerance: 1e-9 },
      },
      conceptualCheckpoint: '为什么不能把磁场出口的 y 直接当作屏幕落点？',
    },
  ],
  guidingQuestions: [
    '电场做功如何决定出射速率？',
    '进入磁场时的位置和速度来自哪里？',
    '圆周轨迹第一次穿过磁场右边界对应多大的圆心角？',
    '离开磁场后为什么必须继续使用同一速度与全局时间？',
  ],
  reasoningSteps: [
    '阶段 A：qEΔx=1 J，初动能 0.5 J，所以末动能 1.5 J，出射速率 √3 m/s。',
    '阶段 A：a=1 m/s²，1+t+t²/2=1，t=√3−1 s；出射位置 (1,0)，速度 (√3,0)。',
    '阶段 B：ω=−qBz/m=1 rad/s、R=√3 m，圆心 (1,√3)，右边界对应相位 π/6。',
    '阶段 B 出射：位置 (1+√3/2, √3−3/2)，速度 (3/2, √3/2)，速率仍为 √3 m/s。',
    '阶段 C：水平距离 1 m、vx=3/2 m/s，所以 Δt=2/3 s，屏幕落点 y=4√3/3−3/2 m。',
    '全程：磁场不做功；电场做功与动能增加一致；阶段交接的位置、速度、全局时间连续。',
  ],
  variations: [
    { title: '把加速电场加倍', detail: '出射速率、磁场中半径、下游出射状态和屏幕落点都改变；不能沿用 √3 的标准答案。' },
    { title: '把 Bz 反号或减弱到零', detail: '轨迹镜像或不再偏转；修改后必须以当前参数重新求解事件与屏幕命中。' },
  ],
  checkpoint: {
    question: '若把 Bz 改为 +1 T，而其余条件不变，最合理的结果是：',
    options: ['屏幕落点与原来完全相同', '轨迹上下镜像，屏幕落点 y 反号', '电场出射速率变为零', '磁场阶段不再存在'],
    correct: 1,
    explain: 'q、v 的大小与电场阶段不变；B 反号只反转洛伦兹力方向，使磁场阶段及其后续自由漂移关于 x 轴镜像。',
  },
  independentVerification:
    '阶段 A 用恒加速度学与动能定理；阶段 B 用圆心 (1,√3)、半径 √3 的圆与 x=1+√3/2 求交；阶段 C 用匀速直线。三条路径分别与连续运行时的两个交接点和屏幕事件交叉核对。',
  dimensionalCheck:
    'qEΔx 为 J，½mv² 为 J；R=mv/(qB) 为 m；t=Rθ/v 为 s；自由漂移 y=v_yΔt 为 m。',
  commonMistakes: [
    '把电场末速写成 1 m/s，忽略初动能与电场做功。',
    '进入磁场时重新使用初速度，而不是电场出射速度。',
    '把磁场出射点直接当成屏幕落点，漏掉无场漂移段。',
  ],
};

export const A17_CASE_SOLUTION: Pick<ProblemCase, 'parts' | 'wholeProblem'> = {
  parts: [
    part({
      id: 'a',
      prompt: '求粒子到达电场右边界时的速率。',
      targetQuantities: ['accelerationExitSpeedMps', 'accelerationTimeS'],
      hints: ['先用动能定理比较初动能与电场做功。', '电场力 qE=1 N，位移 1 m；再核对 a=1 m/s²。'],
      derivationSteps: [
        {
          id: 'a1',
          title: '电场做功',
          explanation: '匀强电场沿 +x，粒子从 x=0 到 x=1 m，电势能减少 1 J。',
          formula: 'W_E=qE_x\\Delta x=1\\times1\\times1=1\\,\\mathrm{J}',
        },
        {
          id: 'a2',
          title: '动能定理',
          explanation: '初动能 ½×1×1²=0.5 J；电场做功后末动能为 1.5 J。',
          formula: '\\frac12m v_1^2=\\frac12m v_0^2+W_E=\\frac32\\,\\mathrm{J}\\Rightarrow v_1=\\sqrt3\\,\\mathrm{m/s}',
          referenceEventId: 'a-exit',
        },
        {
          id: 'a3',
          title: '时间核对',
          explanation: '加速度 a=qE/m=1 m/s²，x=t+t²/2=1 m，取正根 t=√3−1 s。',
          formula: 't_A=\\sqrt3-1\\,\\mathrm{s}',
          referenceEventId: 'a-exit',
        },
      ],
      answerSpec: {
        quantity: 'accelerationExitSpeedMps',
        unit: 'm/s',
        baselineValue: SQRT3,
        tolerance: { abs: 1e-9, rel: 1e-9 },
        dependsOn: ['electricFieldX'],
      },
      misconception: '把末速写成初速 1 m/s，或把初动能误当成零；电场已经做了 1 J 的功。',
      independentProofRef: 'W_E=qEΔx=1 J，K₀=0.5 J，K₁=1.5 J，v₁=√3 m/s；与恒加速度解 t=√3−1 s 一致。',
    }),
    part({
      id: 'b',
      prompt: '求粒子离开磁场条带时的 y 坐标。',
      targetQuantities: ['magneticExitY', 'magneticExitVx', 'magneticExitVy'],
      hints: ['磁场入场状态取上问的出射位置与速度，而不是重新设置 v。', '磁场使轨迹沿半径 √3 m 的圆运动；求右边界第一次交点。'],
      derivationSteps: [
        {
          id: 'b1',
          title: '从真实入场状态建立圆弧',
          explanation: '粒子在 (1,0) 以 (√3,0) 进入磁场，ω=−qBz/m=1 rad/s，半径 R=v/ω=√3 m。',
          formula: '\\omega=1\\,\\mathrm{rad/s},\\quad R=\\sqrt3\\,\\mathrm{m},\\quad C=(1,\\sqrt3)',
          referenceEventId: 'a-exit',
        },
        {
          id: 'b2',
          title: '右边界第一次相交',
          explanation: '右边界 x=1+√3/2 距圆心 √3/2，弦高为 1.5 m；从出发点转到该点的圆心角为 π/6。',
          formula: '\\cos\\Delta\\theta=\\frac{\\sqrt3/2}{\\sqrt3}=\\frac12\\Rightarrow\\Delta\\theta=\\frac{\\pi}{6}',
        },
        {
          id: 'b3',
          title: '出射状态',
          explanation: '逆时针旋转 π/6 后，位置 y=√3−3/2 m，速度分量变为 (3/2, √3/2) m/s。',
          formula: 'y_B=\\sqrt3-\\frac32\\approx0.232\\,\\mathrm{m},\\quad (v_x,v_y)=\\left(\\frac32,\\frac{\\sqrt3}{2}\\right)',
          referenceEventId: 'b-exit',
        },
      ],
      answerSpec: {
        quantity: 'magneticExitY',
        unit: 'm',
        baselineValue: SQRT3 - 1.5,
        tolerance: { abs: 1e-9, rel: 1e-9 },
        dependsOn: ['electricFieldX', 'magneticFieldZ', 'magneticWidthM'],
      },
      misconception: '把入射速度仍写成 (1,0)，或把磁场出射位置当作屏幕位置。',
      independentProofRef: '圆心 (1,√3)、半径 √3 的圆与 x=1+√3/2 求交，取第一次右边界交点，得到 y=√3−3/2 m。',
    }),
    part({
      id: 'c',
      prompt: '求粒子命中探测屏有效接收区时的 y 坐标。',
      targetQuantities: ['screenY', 'totalTimeS'],
      hints: ['出磁场后无电场、无磁场，速度保持不变。', '屏幕比磁场右边界再远 1 m；用 vx=3/2 m/s 求漂移时间。'],
      derivationSteps: [
        {
          id: 'c1',
          title: '无场漂移时间',
          explanation: '从磁场右边界到屏幕的水平距离为 1 m，水平速度为 3/2 m/s。',
          formula: '\\Delta t_C=\\frac{1}{3/2}=\\frac23\\,\\mathrm{s}',
          referenceEventId: 'b-exit',
        },
        {
          id: 'c2',
          title: '屏幕落点',
          explanation: '竖直方向速度保持 √3/2 m/s，从磁场出射高度继续向上漂移 2/3 s。',
          formula: 'y_{\\mathrm{screen}}=\\sqrt3-\\frac32+\\frac{\\sqrt3}{2}\\cdot\\frac23=\\frac{4\\sqrt3}{3}-\\frac32\\approx0.809\\,\\mathrm{m}',
          referenceEventId: 'screen-hit',
        },
        {
          id: 'c3',
          title: '总时间',
          explanation: '把三个阶段所用时间相加；时间轴不重置，也不使用任何阶段的本地时间冒充总时间。',
          formula: 't_{\\mathrm{total}}=(\\sqrt3-1)+\\frac{\\pi}{6}+\\frac23\\approx1.923\\,\\mathrm{s}',
          referenceEventId: 'screen-hit',
        },
      ],
      answerSpec: {
        quantity: 'screenY',
        unit: 'm',
        baselineValue: SCREEN_Y,
        tolerance: { abs: 1e-9, rel: 1e-9 },
        dependsOn: ['electricFieldX', 'magneticFieldZ', 'magneticWidthM', 'screenGapM'],
      },
      misconception: '从磁场出射点立刻停止，漏掉无场漂移；或把磁场中水平速度误当成 0。',
      independentProofRef: '屏幕落点 = 磁场出射 y + v_y·(Δx/v_x) = √3−3/2 + (√3/2)(2/3) = 4√3/3−3/2 m。',
    }),
  ],
  wholeProblem: {
    adapterId: 'a17-electric-magnetic-screen',
    coverage: 'full_problem_simulated',
    originDescription:
      '同一二维坐标与全局时间：阶段 A 从 x=0 匀强电场加速到 x=1 m；阶段 B 从 A 的真实出射状态进入有限磁场条带；阶段 C 从 B 的真实出射状态无场漂移到屏幕。',
    physicalStages: [
      {
        id: 'accelerate',
        title: '阶段 A：匀强电场加速',
        startEventId: 'start',
        endEventId: 'a-exit',
        limitations: ['一维匀强电场', '忽略边缘场与重力'],
      },
      {
        id: 'magnetic',
        title: '阶段 B：有限磁场圆弧偏转',
        startEventId: 'a-exit',
        endEventId: 'b-exit',
        limitations: ['理想条带边界', '磁场不做功', '位置、速度与时间连续'],
      },
      {
        id: 'drift',
        title: '阶段 C：无场漂移与屏幕命中',
        startEventId: 'b-exit',
        endEventId: 'screen-hit',
        limitations: ['无场匀速直线', '屏幕为理想接收面', '未命中时不得显示光斑'],
      },
    ],
    teacherAnnotations: [
      '逐点检查 A→B、B→C 的位置与速度误差，不能用动画插值代替。',
      '改变 E_x 后，下游磁场阶段、屏幕落点与三问答案必须一起重算。',
      '若 B 反向或宽度进入临界，先读取事件表判断是否真实出场/命中。',
    ],
    variations: [
      {
        id: 'electric',
        label: '加速电场 Eₓ',
        parameterKey: 'electricFieldX',
        unit: 'V/m',
        min: -2,
        max: 4,
        step: 0.1,
        baseValue: 1,
        expectedBehavior: 'A 阶段出射速率、磁场中半径、下游出射状态和屏幕落点同步重算；负场可能导致无法到达边界。',
      },
      {
        id: 'magnetic',
        label: '磁场 Bz',
        parameterKey: 'magneticFieldZ',
        unit: 'T',
        min: -3,
        max: 3,
        step: 0.1,
        baseValue: -1,
        expectedBehavior: '反向磁场使轨迹镜像；过强或过弱磁场可能不再从右边界出场，屏幕光斑不得伪造。',
      },
      {
        id: 'width',
        label: '磁场条带宽度 w',
        parameterKey: 'magneticWidthM',
        unit: 'm',
        min: 0.2,
        max: 2.8,
        step: 0.05,
        baseValue: Math.sqrt(3) / 2,
        expectedBehavior: '出口位置、相位与自由漂移起点改变；临界宽度可能导致相切而不穿越。',
      },
      {
        id: 'screen-gap',
        label: '屏幕距离 Δx',
        parameterKey: 'screenGapM',
        unit: 'm',
        min: 0.2,
        max: 2.5,
        step: 0.05,
        baseValue: 1,
        expectedBehavior: '屏幕位置、漂移时间与落点 y 重算；屏幕越界时不生成有效光斑。',
      },
    ],
  },
};
