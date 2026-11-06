import { CASE_SOLUTIONS } from './caseSolutions';
import { A17_CASE_RAW, A17_CASE_SOLUTION, A17_CASE_ID } from './round17Case';
import { problemCasesSchema, type ProblemCase } from './problemCaseSchema';

const PI = Math.PI;
const SQRT3 = Math.sqrt(3);
const CHECKED = '2026-11-04';

function original(): ProblemCase['provenance'] {
  return {
    sourceKind: 'original_case',
    verification: 'paper_and_solution_verified',
    rights: 'original',
    rightsEvidence: '题面、图示、解析与数值均由本项目原创，不复制任何试卷或教辅内容。',
    checkedAt: CHECKED,
    reviewNotes: '独立推导与模拟器锚点测试同时通过；不是高考原题。',
  };
}

const rawCases: Array<Omit<ProblemCase, 'parts' | 'wholeProblem'>> = [
  {
    id: 'case-c01-boundary-exit',
    title: '有界磁场中的临界出场',
    subtitle: '半平面/条带边界、半径与出射方向',
    provenance: original(),
    topicTags: ['有界磁场', '圆周运动', '边界事件'],
    difficulty: 'basic',
    stem:
      '一个电荷量 q=+1 C、质量 m=1 kg 的粒子从坐标原点以速度 v=(1,0) m/s 进入方向垂直纸面向里、Bz=−1 T 的条形匀强磁场。磁场只存在于 0≤x≤0.5 m 的区域，y 方向足够长。忽略重力与边缘场。求粒子第一次离开磁场的时间、出射点坐标与出射速度。',
    prediction: {
      question: '粒子在条形磁场中做半径 1 m 的圆周运动。它在 x=0.5 m 的右边界第一次出场时，速度方向应该是：',
      options: ['仍沿 +x，粒子会直线穿出', '斜向右上，速度的 y 分量为正', '斜向右下，速度的 y 分量为负', '沿 −x 返回左边界'],
      correct: 1,
      explain: 'q>0、Bz<0 时旋转方向使速度向下偏转；从原点出发的圆弧在右边界处具有正的 y 速度分量。',
    },
    stages: [
      {
        id: 'c01-strip',
        title: '在 P04 中复现条带出场',
        modelId: 'p04',
        modelMatch: 'exact_model',
        presetId: 'p04-strip-cross',
        limitations: ['二维、静态均匀 Bz', '条带边界理想突变，忽略边缘场', '无重力、无相对论修正'],
        parameterMappings: [
          { questionSymbol: 'q', modelParameter: 'chargeC', units: 'C', explanation: '粒子电荷量' },
          { questionSymbol: 'm', modelParameter: 'massKg', units: 'kg', explanation: '粒子质量' },
          { questionSymbol: 'Bz', modelParameter: 'Bz', units: 'T', explanation: '条带内有符号磁场' },
          { questionSymbol: '0≤x≤0.5', modelParameter: 'geometry.xMin/xMax', units: 'm', explanation: '条带几何边界' },
          { questionSymbol: 'r₀=(0,0)', modelParameter: 'particle.position', units: 'm', explanation: '入射点' },
          { questionSymbol: 'v₀=(1,0)', modelParameter: 'particle.velocity', units: 'm/s', explanation: '入射速度' },
        ],
        checkableObservables: ['exitTimeS', 'exitX', 'exitY', 'exitVx', 'exitVy'],
        expected: {
          exitTimeS: { value: PI / 6, unit: 's', tolerance: 1e-8, note: '半圆几何；不是 1 s' },
          exitX: { value: 0.5, unit: 'm', tolerance: 1e-9 },
          exitY: { value: 1 - SQRT3 / 2, unit: 'm', tolerance: 1e-8 },
          exitVx: { value: SQRT3 / 2, unit: 'm/s', tolerance: 1e-9 },
          exitVy: { value: 0.5, unit: 'm/s', tolerance: 1e-9 },
        },
        conceptualCheckpoint: '粒子的出场速度大小是否仍为 1 m/s？为什么？',
      },
    ],
    guidingQuestions: [
      'q>0、Bz<0 时，粒子向哪一侧偏转？',
      '半径 R=mv/(|qB|) 是多少？',
      '圆弧与 x=0.5 m 的右边界第一次相交在哪？',
      '速度方向如何从圆心与交点求出？',
    ],
    reasoningSteps: [
      '半径 R=mv/(|qB|)=1×1/(1×1)=1 m。',
      'Bz<0、q>0，洛伦兹力指向 +y；圆心在 (0,1) m。',
      '圆方程 x²+(y−1)²=1；右边界 x=0.5 代入得 y=1±√(1−0.25)。从原点进入后取较低的交点 y=1−√3/2。',
      '从原点转到 x=0.5 的圆心角为 π/6，所以 t=Rθ/v=π/6 s。',
      '出射点 (0.5, 1−√3/2)；速度由顺时针切向给出 (cos(π/3), sin(π/3))=(√3/2, 1/2)。',
      '核对：速率保持 1 m/s，磁场不做功。',
    ],
    variations: [
      { title: '把条带宽度改为 1 m', detail: 'Bz 保持 −1 T，半径仍为 1 m；条带宽度 1 m 恰好等于半径，粒子的最大 x 为 1 m，右边界成为相切临界。', presetId: 'p04-strip-critical' },
      { title: '把初速度改为 2 m/s', detail: '半径变为 2 m，出场点与时间都改变；用同一圆-线求交，不得只按比例猜时间。' },
    ],
    checkpoint: {
      question: '若把 Bz 改成 −2 T，条形宽度仍为 0.5 m，粒子会：',
      options: ['从右边界正常穿出', '恰好与右边界相切，不穿出', '从左边界返回', '速度变为零'],
      correct: 1,
      explain: 'R=0.5 m，最大 x=R=0.5 m；轨迹与右边界相切，属于临界接触而不是穿越。',
    },
    independentVerification:
      '独立使用圆心 (0,1)、圆半径 1 与直线 x=0.5 求交，得到 y=1−√3/2 和圆心角 π/6；再用 P04 解析解与测试断言交叉核对。',
    dimensionalCheck:
      'r=mv/(|q|B)=1·1/(1·1)=1 m；ω=qB/m=1 rad/s，t=θ/ω=(π/6)/1=π/6 s；位置与速度为 m、m/s。',
    commonMistakes: ['把出场时间当成 0.5 s（把 0.5 m 当水平位移）。', '把出场速度方向写成仍沿 +x。'],
  },
  {
    id: 'case-c02-alternating-time',
    title: '相反磁场中的两次跨界与“同时到达”',
    subtitle: '分段时间、位置连续与轨迹交叉辨析',
    provenance: original(),
    topicTags: ['相反磁场', '分段圆弧', '粒子时序'],
    difficulty: 'advanced',
    stem:
      'q=+1 C、m=1 kg 的粒子从原点以 v=(1,0) m/s 出发。x<0 的半平面有 Bz=−1 T，x>0 的半平面有 Bz=+1 T。忽略边界边缘场。求它第 1 次和第 2 次穿过 x=0 的时间、位置和速度，并解释“轨迹相交”是否等于“同时到达”。',
    prediction: {
      question: '粒子在右侧磁场中完成半圆后回到 x=0，此时它的速度方向最可能是：',
      options: ['仍沿 +x', '沿 −x', '沿 +y', '速度为零'],
      correct: 1,
      explain: '右侧半圆使速度从 +x 转到 −x；位置 y 改变但速率不变。',
    },
    stages: [
      {
        id: 'c02-two-halves',
        title: '两次跨界的解析分段',
        modelId: 'p05',
        modelMatch: 'exact_model',
        presetId: 'p05-two-halves',
        limitations: ['二维、静态均匀分区', '边界理想突变', '无碰撞、无相互作用'],
        parameterMappings: [
          { questionSymbol: 'q/m', modelParameter: 'chargeC / massKg', units: 'C / kg', explanation: '粒子属性' },
          { questionSymbol: 'B(x)', modelParameter: 'fields', units: 'T', explanation: '左右两区的有符号 Bz' },
          { questionSymbol: 'x=0', modelParameter: 'boundaries', units: 'm', explanation: '竖直分区边界' },
          { questionSymbol: 'r₀/v₀', modelParameter: 'particle.position/velocity', units: 'm, m/s', explanation: '初态' },
        ],
        checkableObservables: ['firstCrossTimeS', 'firstY', 'firstVx', 'secondCrossTimeS', 'secondY', 'secondVx'],
        expected: {
          firstCrossTimeS: { value: PI, unit: 's', tolerance: 1e-8 },
          firstY: { value: -2, unit: 'm', tolerance: 1e-8 },
          firstVx: { value: -1, unit: 'm/s', tolerance: 1e-8 },
          secondCrossTimeS: { value: 2 * PI, unit: 's', tolerance: 1e-8 },
          secondY: { value: -4, unit: 'm', tolerance: 1e-8 },
          secondVx: { value: 1, unit: 'm/s', tolerance: 1e-8 },
        },
        conceptualCheckpoint: '两次跨界之间，粒子的速率有没有改变？',
      },
      {
        id: 'c02-crossing-not-simultaneous',
        title: '轨迹交叉 ≠ 同时同地',
        modelId: 'p05',
        modelMatch: 'concept_illustration',
        presetId: 'p05-cross-not-simultaneous',
        limitations: ['此段使用无磁场直线运动，只用于时序概念', '两条轨迹几何相交不代表同一 tGlobal 到达'],
        parameterMappings: [
          { questionSymbol: 'A', modelParameter: 'particle A', units: 'm, m/s', explanation: '从 (−1,0) 以 +x 运动' },
          { questionSymbol: 'B', modelParameter: 'particle B', units: 'm, m/s', explanation: '从 (0,−2) 以 +y 运动' },
        ],
        checkableObservables: ['aAtOriginTimeS', 'bAtOriginTimeS'],
        expected: {
          aAtOriginTimeS: { value: 1, unit: 's', tolerance: 0.01 },
          bAtOriginTimeS: { value: 2, unit: 's', tolerance: 0.01 },
        },
        conceptualCheckpoint: 'A、B 的轨迹在 (0,0) 相交，但它们是否同时到达？',
      },
    ],
    guidingQuestions: [
      '右区 Bz 的符号如何决定旋转方向？',
      '每个半圆需要多少时间？',
      '第 2 次跨界的位置为什么是 −4 m，而不是回到原点？',
      '两条空间轨迹相交时，如何用同一 tGlobal 判断是否相遇？',
    ],
    reasoningSteps: [
      '右区 Bz=+1 T、q=1、m=1，ω=−qBz/m=−1 rad/s；速度从 +x 开始，圆心在 (0,−1)。',
      '第一次回到 x=0 是半个周期：T=2π/|ω|=2π，半周期 π s；位置 y=−2 m，速度 −x。',
      '左区 Bz=−1 T，ω=+1 rad/s；在同一 x=0 位置重新计算圆心与半圆，第二次跨界在 t=2π s。',
      '两次半圆的 y 位移方向相同，所以第二次跨界位置继续到 y=−4 m，而不是回到 0。',
      '另一段无场直线运动用于说明：两条轨迹可以在空间相交，但各自的到达时间不同；只有同一个 tGlobal 的位置相同才是同时同地。',
    ],
    variations: [
      { title: '把左区 Bz 改为 −2 T', detail: '左区半径与周期改变，第二段不再是完整半圆；必须重新求根，不能沿用 2π。' },
      { title: '给 B 设置 1 s 的 launchTime', detail: '空间轨迹不变，但所有全局到达时刻整体平移；这是“到达时刻”与“轨迹几何”不同的典型。' },
    ],
    checkpoint: {
      question: '两条粒子的轨迹在空间某点交叉。下列哪项足以判定它们“同时到达”？',
      options: ['只要轨迹交点相同', '只要速率相同', '必须使用同一 tGlobal 比较位置', '只要轨迹颜色相同'],
      correct: 2,
      explain: '轨迹相交只说明空间路径重合；同时到达需要同一全局时刻的位置相等。',
    },
    independentVerification:
      '用两段圆弧的圆心、半圆角度与速度旋转独立计算 t=π、2π 的位置；并用 P05 解析分段解与 tGlobal 位置表核对。',
    dimensionalCheck:
      'T=2πm/(|q|B)=2π·1/(1·1)=2π s，半周期 π s；位移 y=2r=2 m 与 4 m；速度为 m/s，tGlobal 为 s。',
    commonMistakes: ['把每次跨界都当成回到原点。', '把轨迹相交直接判为相遇。', '把 ω 的绝对值与方向混用。'],
  },
  {
    id: 'case-c03-beamline-detector',
    title: '选速、磁分析与屏幕探测',
    subtitle: '多级束线的通过条件与落点',
    provenance: original(),
    topicTags: ['速度选择', '多级束线', '屏幕探测'],
    difficulty: 'integrated',
    stem:
      '一个多级束线由入口狭缝、E+B 选速区、磁分析区和末段电场偏转区组成。q=+1 C、m=1 kg 的粒子从源点 (−2,0) 以 v=(2,0) m/s 出发；装置参数采用 P07 标准预设。忽略边缘场与狭缝厚度。求粒子是否能通过两片狭缝、分析区半径、屏幕落点 y 与总飞行时间。若把屏幕接收窗口改为 y∈[1.2,2.5] m，结果如何？',
    prediction: {
      question: '标准预设中，粒子通过选速区后进入磁分析区。若只把分析区 Bz 反号，屏幕落点最可能：',
      options: ['完全不变', '沿屏幕反向偏移，可能落到屏幕外', '被入口狭缝吸收', '速度变为零'],
      correct: 1,
      explain: '分析区 Bz 反号使圆弧向相反方向偏转；位置改变但速率不变。',
    },
    stages: [
      {
        id: 'c03-standard',
        title: '标准束线：通过、分析、命中屏幕',
        modelId: 'p07',
        modelMatch: 'exact_model',
        presetId: 'p07-standard',
        limitations: ['二维竖直分区与理想薄板', '忽略边缘场、空间电荷、衍射', '屏幕范围外按未检出处理'],
        parameterMappings: [
          { questionSymbol: 'm/q', modelParameter: 'particles.massKg/chargeC', units: 'kg / C', explanation: '粒子属性' },
          { questionSymbol: 'r₀/v₀', modelParameter: 'particle.position/velocity', units: 'm, m/s', explanation: '源点初态' },
          { questionSymbol: 'E/B/狭缝/屏幕', modelParameter: 'apparatus', units: 'SI', explanation: '标准 P07 预设装置' },
        ],
        checkableObservables: ['outcome', 'analyzerRadiusM', 'screenY', 'arrivalTimeS'],
        expected: {
          analyzerRadiusM: { value: 2, unit: 'm', tolerance: 1e-9 },
          screenY: { value: 1.0893163975, unit: 'm', tolerance: 1e-8 },
          arrivalTimeS: { value: 3.678299314, unit: 's', tolerance: 1e-8 },
        },
        conceptualCheckpoint: '粒子通过出口狭缝后，速度大小是否改变？',
      },
      {
        id: 'c03-screen-window',
        title: '缩小屏幕窗口：落点不变但未被接收',
        modelId: 'p07',
        modelMatch: 'exact_model',
        presetId: 'p07-screen-miss',
        limitations: ['只改变屏幕接收范围，不改变轨迹', '屏幕外不是“命中失败”之外的假光斑'],
        parameterMappings: [
          { questionSymbol: 'screen.yMin/yMax', modelParameter: 'apparatus.screen.yMin/yMax', units: 'm', explanation: '接收窗口改为 1.2–2.5 m' },
        ],
        checkableObservables: ['beamY', 'windowMin', 'outcome'],
        expected: {
          beamY: { value: 1.0893163975, unit: 'm', tolerance: 1e-8 },
          windowMin: { value: 1.2, unit: 'm', tolerance: 1e-9 },
        },
        conceptualCheckpoint: '轨迹没有改变，为什么这次没有“命中屏幕”？',
      },
    ],
    guidingQuestions: [
      '选速条件要求 v 与 E×B/B² 的漂移速度有什么关系？',
      '进入磁分析区时速度大小是多少？半径 R=mv/(|qB|) 是多少？',
      '为什么屏幕窗口改变不会改变束线轨迹？',
      '最终落点由哪些分段的位移相加？',
    ],
    reasoningSteps: [
      '标准装置中选速区 E=(0,−2)、Bz=−1；漂移速度 (Ey/Bz,0)=(2,0)，与初速度匹配，因此粒子直线通过选速区。',
      '入口狭缝 |y|≤0.12 m、出口狭缝同样；标准轨迹 y=0，均通过。',
      '分析区 Bz=−1、速度 2 m/s、q=m=1，R=2 m；半圆出口位置与速度由分段圆弧给出。',
      '末段偏转区 E=(0,−0.5)，粒子做抛物线运动；屏幕 x=5 处的 y 由前面的位置与速度相加。',
      '独立分段得到屏幕 y≈1.0893164 m、总时间≈3.6782993 s；屏幕窗口改为 1.2–2.5 m 后，轨迹不变但 y=1.0893 落在窗口外，故为 screen-outside。',
    ],
    variations: [
      { title: '把分析区 Bz 反号', detail: '圆弧向相反方向偏转，真实交点 y≈−1.756 m，落在屏幕范围外。', presetId: 'p07-reverse-analyzer' },
      { title: '把入口速度改为 1.5 m/s', detail: '选速区不再匹配，轨迹偏轴并被出口狭缝吸收；这是“速度选择失败”，不是屏幕误差。', presetId: 'p07-slow' },
    ],
    checkpoint: {
      question: '屏幕接收窗口缩小后，粒子轨迹与落点：',
      options: ['轨迹不变，落点不变，只是未被接收', '轨迹改变，落点仍在窗口内', '速度变小，落点变低', '被入口狭缝吸收'],
      correct: 0,
      explain: '屏幕是接收面，不是偏转器件；改窗口不会改变上游轨迹。',
    },
    independentVerification:
      '用 P07 的分段解析：选速区直线、分析区 R=2、末段抛物线，独立计算 y=1.0893164 m 与 t=3.6782993 s，再用模拟器事件表核对。',
    dimensionalCheck:
      'a=qE/m → (C·V/m)/kg=m/s²；r=mv/(|q|B) → m；t=L/v → s；屏幕落点 y 为 m，局部到达时间 t 为 s。',
    commonMistakes: ['把屏幕窗口缩小误认为改变轨迹。', '把“未命中屏幕”说成粒子没有到达屏幕平面。', '把磁分析区半径写成 1 m。'],
  },
  {
    id: 'case-c04-loop-entry',
    title: '线框进入磁场：磁通、电动势与电流',
    subtitle: '重叠面积、法拉第定律与方向',
    provenance: original(),
    topicTags: ['线框进出磁场', '磁通量', '楞次定律'],
    difficulty: 'basic',
    stem:
      '一个宽 0.3 m、高 0.2 m 的矩形线框从 x=−0.2 m 处以 1.5 m/s 向右匀速进入 Bz=+1 T 的条形磁场，磁场左边界 x=0.2 m、宽 0.5 m，回路总电阻 0.5 Ω。忽略自感。求 t=0.1 s 时线框的相态、单匝磁通、感应电动势、电流与线框所受磁场力。',
    prediction: {
      question: '线框正在进入磁场时，穿过线框的磁通量正在增大。按楞次定律，感应电流的磁场方向应为：',
      options: ['与原磁场同向', '与原磁场反向', '与线框速度同向', '没有感应电流'],
      correct: 1,
      explain: '磁通量增大时，感应电流产生的磁场阻碍原磁通增加，因此方向与原磁场相反。',
    },
    stages: [
      {
        id: 'c04-entry',
        title: '进入相态的快照',
        modelId: 'i03',
        modelMatch: 'exact_model',
        presetId: 'i03-default',
        limitations: ['单一条形磁场', '刚体线框、集中电阻、忽略自感', '均匀场与理想边界'],
        parameterMappings: [
          { questionSymbol: 'w/h', modelParameter: 'loopWidthM/loopHeightM', units: 'm', explanation: '线框尺寸' },
          { questionSymbol: 'Bz', modelParameter: 'BzSign×BzMagnitudeT', units: 'T', explanation: '磁场方向与大小' },
          { questionSymbol: 'v', modelParameter: 'initialSpeedMps', units: 'm/s', explanation: '匀速运动速度' },
          { questionSymbol: 'R', modelParameter: 'resistanceOhm', units: 'Ω', explanation: '回路总电阻' },
          { questionSymbol: 'a,b', modelParameter: 'fieldLeftM/fieldWidthM', units: 'm', explanation: '条形磁场几何' },
        ],
        checkableObservables: ['xM', 'phase', 'fluxWb', 'emfV', 'currentA', 'forceXN'],
        expected: {
          xM: { value: -0.05, unit: 'm', tolerance: 1e-9 },
          fluxWb: { value: 0.01, unit: 'Wb', tolerance: 1e-9 },
          emfV: { value: -0.3, unit: 'V', tolerance: 1e-9 },
          currentA: { value: -0.6, unit: 'A', tolerance: 1e-9 },
          forceXN: { value: -0.12, unit: 'N', tolerance: 1e-9 },
        },
        conceptualCheckpoint: '进入过程中，磁场力是帮助还是阻碍线框运动？',
      },
    ],
    guidingQuestions: [
      't=0.1 s 时线框的左右边缘在哪里？',
      '有效重叠面积与磁通量是多少？',
      '进入时 dΦ/dt 与速度的符号关系是什么？',
      '电流方向与磁场力的方向是否一致？',
    ],
    reasoningSteps: [
      't=0.1 s 时 x=−0.2+1.5×0.1=−0.05 m；右边缘 x+w=0.25 m，已经越过磁场左边界 0.2 m，线框处于 entering 相态。',
      '重叠宽度 =0.25−0.2=0.05 m；有效面积 A_eff=0.05×0.2=0.01 m²；Φ=BzA_eff=0.01 Wb。',
      '进入时只有右边缘切割，dΦ/dt=Bz h v=1×0.2×1.5=0.3 Wb/s；ε=−dΦ/dt=−0.3 V。',
      'I=ε/R=−0.3/0.5=−0.6 A（负号表示与正方向相反）。',
      '磁场力 F= I×B 作用于右边缘，大小为 |I|hB=0.12 N，方向与速度相反；功率 |Fv|=0.18 W=I²R。',
    ],
    variations: [
      { title: '把 Bz 反号', detail: '磁通、电动势和电流全部反号，但线框仍受到阻碍进入的力；功率不变。', presetId: 'i03-reverse-field' },
      { title: '把速度改为 2.5 m/s', detail: '相同位置下电动势与电流按速度比例增大，磁场力也增大；能量转化仍满足 P_J=I²R。', presetId: 'i03-fast' },
    ],
    checkpoint: {
      question: '线框进入磁场时，磁场力的方向：',
      options: ['与速度同向，帮助进入', '与速度反向，阻碍进入', '垂直于速度', '恒为零'],
      correct: 1,
      explain: '感应电流与磁场相互作用产生阻碍相对运动的力；这也是外力做功转化为焦耳热的原因。',
    },
    independentVerification:
      '用重叠几何独立计算 A_eff=0.01 m²、ε=−Bhv=−0.3 V、I=−0.6 A、F=−0.12 N，并与 I03 快照测试交叉核对。',
    dimensionalCheck:
      'Φ=BA → T·m²=Wb；ε=−dΦ/dt → Wb/s=V；I=ε/R → A；F=BIh → T·A·m=N；P=I²R → W。',
    commonMistakes: ['把磁通量变化率写成整体面积变化而不是有效重叠变化。', '忽略电动势的负号。', '把线框完全进入后的阶段与进入阶段混淆。'],
  },
  {
    id: 'case-c05-loop-changing-field',
    title: '变化磁场与运动线框的叠加',
    subtitle: '感生 + 动生电动势、功率与能量来源',
    provenance: original(),
    topicTags: ['感生电动势', '动生电动势', '能量守恒'],
    difficulty: 'integrated',
    stem:
      'N=1、h=1 m、w=1 m 的矩形线框从 x=−1 m 处以 1 m/s 向右运动，进入 a=0、b=3 m 的条带磁场。磁场随时间变化 Bz(t)=2+t（T），回路总电阻 R=2 Ω。t=0.5 s 时求感生电动势、动生电动势、总电动势、电流与焦耳热功率，并说明机械外力与场源在这一瞬间各自的能量角色。',
    prediction: {
      question: 't=0.5 s 时线框部分进入磁场，B 还在增大。感生电动势与动生电动势的方向：',
      options: ['一定同向相加', '一定反向抵消', '要分别按 Bdot 和 vx 的符号判断', '因为没有闭合回路，二者都为零'],
      correct: 2,
      explain: '感生项与 Bdot 有关，动生项与 g·vx 有关；必须分别计算再代数相加。',
    },
    stages: [
      {
        id: 'c05-reinforce',
        title: '叠加项与功率',
        modelId: 'i05',
        modelMatch: 'exact_model',
        presetId: 'i05-reinforce',
        limitations: ['一维运动、静态空间条带 + 均匀 B(t)', '忽略自感/互感、边缘场', '手动/数值模式不用于本解析锚点'],
        parameterMappings: [
          { questionSymbol: 'B(t)', modelParameter: 'waveform.b0Tesla/slopeTeslaPerS', units: 'T, T/s', explanation: 'B=2+t' },
          { questionSymbol: 'a,b', modelParameter: 'fieldLeftM/fieldRightM', units: 'm', explanation: '磁场条带' },
          { questionSymbol: 'x₀/v₀', modelParameter: 'startXM/initialSpeedMps', units: 'm, m/s', explanation: '初态' },
          { questionSymbol: 'R', modelParameter: 'resistanceOhm', units: 'Ω', explanation: '总电阻' },
        ],
        checkableObservables: ['overlapLengthM', 'Bz', 'emfTransformerV', 'emfMotionalV', 'emfTotalV', 'currentA', 'joulePowerW'],
        expected: {
          overlapLengthM: { value: 0.5, unit: 'm', tolerance: 1e-9 },
          Bz: { value: 2.5, unit: 'T', tolerance: 1e-9 },
          emfTransformerV: { value: -0.5, unit: 'V', tolerance: 1e-9 },
          emfMotionalV: { value: -2.5, unit: 'V', tolerance: 1e-9 },
          emfTotalV: { value: -3, unit: 'V', tolerance: 1e-9 },
          currentA: { value: -1.5, unit: 'A', tolerance: 1e-9 },
          joulePowerW: { value: 4.5, unit: 'W', tolerance: 1e-9 },
        },
        conceptualCheckpoint: 'P_J=4.5 W 的能量来自哪些功率项？',
      },
    ],
    guidingQuestions: [
      't=0.5 s 时线框左边缘与右边缘在哪里？',
      'ℓ 与 g 各是多少？',
      'ε_t 与 ε_m 的符号如何由 Bdot、g、vx 决定？',
      '焦耳功率是否需要外力与场源共同提供？',
    ],
    reasoningSteps: [
      't=0.5 s 时 x=−0.5 m，右边缘 x+w=0.5 m；与 [0,3] 的重叠 ℓ=0.5 m，只有右边缘在切割，g=1。',
      'B(t)=2.5 T，Bdot=1 T/s；ε_t=−N h ℓ Bdot=−1×1×0.5×1=−0.5 V。',
      'ε_m=−N h B g vx=−1×1×2.5×1×1=−2.5 V；总 ε=−3 V，I=−1.5 A。',
      'P_J=I²R=2.25×2=4.5 W；P_mech=F_Bx vx=−3.75 W，P_ts=Iε_t=0.75 W；外力功率 3.75 W 与场源功率 0.75 W 合计 4.5 W。',
      '因此不能只看“磁场力做负功”或只看“感生电动势”，两项要一起进入能量账本。',
    ],
    variations: [
      { title: '把斜率改为 −1 T/s', detail: '感生电动势反号；动生项仍由速度决定，两项可能抵消或加强。', presetId: 'i05-cancel' },
      { title: '把线框完全放入磁场', detail: 'g=0，动生项和净磁场力为零，但 Bdot 仍可产生感生电流与焦耳热。', presetId: 'i05-contained' },
    ],
    checkpoint: {
      question: '线框完全处在均匀磁场内部且 B 仍随时间增大，下列哪项正确？',
      options: ['没有感生电动势，也没有电流', '有感生电动势和电流，但净 x 磁场力为零', '有磁场力但没有电流', '所有物理量都为零'],
      correct: 1,
      explain: 'g=0 只让动生项/净磁场力为零；ℓ 不变时 Bdot 仍产生感生电动势与电流。',
    },
    independentVerification:
      '用乘积法则分解 Φ=B(t)hℓ(x)，独立计算 ε_t、ε_m、ε、I、P_J 与场源/机械功率，并与 I05 快照求解器交叉核对。',
    dimensionalCheck:
      'ε_t=A·dB/dt → m²·T/s=V；ε_m=Bℓv → T·m·m/s=V；I=ε/R → A；P_J=I²R → W；场源功率 εI → W。',
    commonMistakes: ['把感生与动生电动势重复计入。', '忘记场源能量。', '认为完全在场内就一定没有电流。'],
  },
  {
    id: 'case-c06-opposite-wall',
    title: '相反磁区、零磁通与挡板能量',
    subtitle: '带符号通量、楞次方向、冲击与焦耳热分账',
    provenance: original(),
    topicTags: ['相反磁场', '弹性挡板', '能量账本'],
    difficulty: 'integrated',
    stem:
      'N=h=1、宽 w=1 m、电阻 R=1 Ω 的线框以 8 m/s 向右运动，左边缘从 x=0.5 m 出发；B₁=+1 T 在 [0,1] m，B₂=−1 T 在 [1,2] m，挡板在 x=3.2 m，恢复系数 e=0.5。线框连续经历反向双场、出场、撞板反弹和再次进入磁场。求 (a) 初始感应电动势；(b) 碰板损失的机械能 Q_impact；(c) 反弹后瞬间速度。另用 B=0、宽 0.5 m、碰前 1 m/s 的分阶段控制实验核对 0.375 J 的冲击损失公式。',
    prediction: {
      question: '第一阶段线框左右边分别在 B₁、B₂ 两区，ℓ₁=ℓ₂，此时磁通量与电动势：',
      options: ['都为零', '磁通为零，但电动势不为零', '磁通不为零，电动势为零', '磁场力为零'],
      correct: 1,
      explain: '相反磁区的磁通可以相消，但两条竖边都在切割磁感线，S 可达到 −2B。',
    },
    stages: [
      {
        id: 'c06-interface',
        title: '跨相反场界面：零磁通非零电动势',
        modelId: 'i07',
        modelMatch: 'exact_model',
        presetId: 'i07-interface',
        limitations: ['二维刚性线框、静态均匀条带', '忽略自感、边缘场、导线厚度', '挡板为第二阶段独立模型'],
        parameterMappings: [
          { questionSymbol: 'B₁/B₂', modelParameter: 'field1Bz/field2Bz', units: 'T', explanation: '两区有符号磁场' },
          { questionSymbol: 'N/h/w', modelParameter: 'turns/heightM/widthM', units: '—, m, m', explanation: '线圈参数' },
          { questionSymbol: 'x/v', modelParameter: 'startXM/initialSpeedMps', units: 'm, m/s', explanation: '初态' },
          { questionSymbol: 'R', modelParameter: 'resistanceOhm', units: 'Ω', explanation: '总电阻' },
        ],
        checkableObservables: ['fluxWb', 'S', 'emfV', 'currentA', 'magneticForceN', 'joulePowerW'],
        expected: {
          fluxWb: { value: 0, unit: 'Wb', tolerance: 1e-12 },
          S: { value: -2, unit: '—', tolerance: 1e-12 },
          emfV: { value: 2, unit: 'V', tolerance: 1e-12 },
          currentA: { value: 2, unit: 'A', tolerance: 1e-12 },
          magneticForceN: { value: -4, unit: 'N', tolerance: 1e-12 },
          joulePowerW: { value: 4, unit: 'W', tolerance: 1e-12 },
        },
        conceptualCheckpoint: '为什么 Φ=0 时仍然可以有感应电流？',
      },
      {
        id: 'c06-inelastic-wall',
        title: '非弹性挡板：冲击损失单独记账',
        modelId: 'i07',
        modelMatch: 'exact_model',
        presetId: 'i07-inelastic-wall',
        limitations: ['第二阶段 B=0、独立几何；不从上一阶段传播位置/速度', '冲击损失不等于焦耳热'],
        parameterMappings: [
          { questionSymbol: 'e', modelParameter: 'restitution', units: '—', explanation: '恢复系数 0.5' },
          { questionSymbol: 'x_wall', modelParameter: 'wallXM', units: 'm', explanation: '挡板位置' },
          { questionSymbol: 'm/v₀', modelParameter: 'massKg/initialSpeedMps', units: 'kg, m/s', explanation: '碰撞前状态' },
        ],
        checkableObservables: ['bounceTimeS', 'velocityAfterMps', 'impactLossJ', 'jouleHeatJ'],
        expected: {
          bounceTimeS: { value: 1, unit: 's', tolerance: 1e-8 },
          velocityAfterMps: { value: -0.5, unit: 'm/s', tolerance: 1e-8 },
          impactLossJ: { value: 0.375, unit: 'J', tolerance: 1e-8 },
          jouleHeatJ: { value: 0, unit: 'J', tolerance: 1e-12 },
        },
        conceptualCheckpoint: '挡板恢复系数小于 1 时，机械能损失进入 Q_J 还是 Q_impact？',
      },
    ],
    guidingQuestions: [
      '两区的 B 符号如何进入 S？',
      '线框左右边分别在哪一区、各自给 g 什么贡献？',
      '碰撞前后哪些量连续、哪些量跳变？',
      '碰撞损失与电阻焦耳热为什么必须分开？',
    ],
    reasoningSteps: [
      '第一阶段 x=0.5 m，左边缘在 B₁、右边缘在 B₂，ℓ₁=ℓ₂=0.5 m，所以 Φ=1×(1×0.5−1×0.5)=0。',
      '左边缘给 g₁=−1，右边缘给 g₂=+1，S=1×(−1)+(−1)×(+1)=−2；ε=−N h S v=2 V，I=2 A。',
      'F_Bx=N I h S=1×2×1×(−2)=−4 N；P_J=I²R=4 W；磁场力向左，仍做负功。',
      '第二阶段采用独立几何：B=0，线框宽 0.5 m，右边缘在 x_wall 处接触；碰撞前 1 m/s，e=0.5，v_after=−0.5 m/s。',
      'Q_impact=½m(v²−v_after²)=0.375 J；B=0 时 Q_J=0，所以能量损失只在冲击项，不并入焦耳热。',
    ],
    variations: [
      { title: '把 e 改为 1', detail: '完全弹性时 v_after=−1 m/s，Q_impact=0，动能不变；仍没有焦耳热。', presetId: 'i07-free-wall' },
      { title: '把第二区 B₂ 改为 +1 T', detail: '跨界面时 Φ 不再为零；必须重新按带符号通量与 S 计算，不能沿用“零磁通”结论。', presetId: 'i07-enter' },
    ],
    checkpoint: {
      question: '连续主场景中，1.215 J 的挡板机械能损失应记入：',
      options: ['焦耳热 Q_J', '冲击损失 Q_impact', '电场源能量', '线框的磁通量'],
      correct: 1,
      explain: '非弹性碰撞的机械能损失属于接触/冲击耗散；只有电阻发热才是 Q_J。',
    },
    independentVerification:
      '第一阶段用 ℓ₁、ℓ₂ 与 g₁、g₂ 独立计算 Φ=0、S=−2、ε=2 V、I=2 A、F=−4 N；第二阶段用一维碰撞与动能差独立计算 0.375 J，并与 I07 测试交叉核对。',
    dimensionalCheck:
      'Φ=h(B₁ℓ₁+B₂ℓ₂) → m·T·m=Wb；S=B₁g₁+B₂g₂ → T·m；ε=Sv → V；I=ε/R → A；F=SI → N；Q=½m(v²−v′²) → J。',
    commonMistakes: ['把相反磁场的磁通按绝对值相加。', '看到 Φ=0 就判 I=0。', '把 0.375 J 冲击损失计入焦耳热。'],
  },
  {
    id: 'case-c07-analyzer-critical',
    title: '可调磁分析器：目标落点、镜像分支与临界场',
    subtitle: '选速器固定速度，分析区 B 可调；屏幕落点与临界条件',
    provenance: original(),
    topicTags: ['多级束线', '磁分析', '临界条件', '多结果'],
    difficulty: 'integrated',
    stem:
      'q=+1 C、m=1 kg 的粒子从源点 (−2,0) 以 2 m/s 沿 +x 射出。它先经过入口狭缝 (0,0)，在 0≤x≤2 m 的选速区中受到 Ey=−2 V/m、Bz=−1 T 的复合场；随后进入 2≤x≤3 m 的可调磁分析区，磁感应强度 Bz 可调，出口狭缝在 x=3 m。出口后 3≤x≤4 m 无场，屏幕位于 x=4 m，有效高度 ±2.5 m。求标准 Bz=−1 T 时的屏幕落点；说明 Bz 反号后的镜像结果；并求粒子仍能到达分析区出口的临界 |Bz|。忽略边缘场、狭缝厚度与重力。',
    prediction: {
      question: '若只把分析区 Bz 从 −1 T 反号为 +1 T，屏幕落点最可能：',
      options: ['完全不变', '上下镜像，y 变为相反数', '被入口狭缝吸收', '速度变为零'],
      correct: 1,
      explain: 'q>0 时 B 反号使洛伦兹力反向，圆弧上下镜像；自由段斜率也反号，因此屏幕 y 取相反数。',
    },
    stages: [
      {
        id: 'c07-analyzer',
        title: '在 P07 中复现可调分析器',
        modelId: 'p07',
        modelMatch: 'exact_model',
        presetId: 'p07-c07-analyzer',
        limitations: ['二维、静态均匀场', '理想薄狭缝', '无边缘场与相对论修正'],
        parameterMappings: [
          { questionSymbol: 'q/m', modelParameter: 'chargeC / massKg', units: 'C / kg', explanation: '粒子属性' },
          { questionSymbol: 'v0', modelParameter: 'particle.velocity', units: 'm/s', explanation: '源点速度' },
          { questionSymbol: 'Ey / Bz', modelParameter: 'selector.Ey / selector.Bz', units: 'V/m / T', explanation: '选速区复合场' },
          { questionSymbol: 'Bz,analyzer', modelParameter: 'analyzer.Bz', units: 'T', explanation: '可调分析场' },
          { questionSymbol: 'x=4', modelParameter: 'screen.x', units: 'm', explanation: '屏幕位置' },
        ],
        checkableObservables: ['screenY', 'screenYOpposite', 'criticalAnalyzerB'],
        expected: {
          screenY: { value: 0.8452994616, unit: 'm', tolerance: 1e-8 },
          screenYOpposite: { value: -0.8452994616, unit: 'm', tolerance: 1e-8 },
          criticalAnalyzerB: { value: 2, unit: 'T', tolerance: 1e-8 },
        },
        conceptualCheckpoint: 'B 反号时，速度大小是否改变？',
      },
    ],
    guidingQuestions: [
      '选速器为什么把速度固定为 2 m/s？',
      '分析区半径与 B 的关系是什么？',
      '出口边界 x=3 对应圆弧的什么几何条件？',
      '屏幕落点由哪两段运动叠加？',
    ],
    reasoningSteps: [
      '选速条件 qEy+qvB=0 给出 v=2 m/s，方向沿 +x。',
      'Bz=−1 T、q=m=1 时半径 R=2 m，圆心在 (2,2)，分析区出口为 (3,2−√3)，速度方向 (√3,1)。',
      '出口后无场，自由直线斜率 1/√3；屏幕 x=4，故 y=2−√3+1/√3≈0.8452995 m。',
      'B 反号时圆心到 (2,−2)，所有 y 坐标取相反数，屏幕落点约为 −0.8452995 m。',
      '临界到达出口条件为圆与 x=3 相切：R=1 m，即 |B|=mv/(qR)=2 T；更大的 |B| 使粒子折返。',
    ],
    variations: [
      { title: '把分析区 Bz 从 −1 T 改为 +1 T', detail: '轨迹上下镜像，屏幕 y 由 +0.8453 m 变为 −0.8453 m；这是分支结果，不是原题标准答案。' },
      { title: '把屏幕移到 x=5 m', detail: '自由段增长，落点按同一斜率重新计算；标准数值失效。' },
    ],
    checkpoint: {
      question: '分析区 |Bz| 增大到 2 T 以上时，粒子会：',
      options: ['仍从出口穿出并命中屏幕', '在分析区内折返，不能到达出口', '速度变为零但位置不变', '从入口狭缝原路返回并命中源点'],
      correct: 1,
      explain: '半径 R=2/|B|<1 m 时，圆心到出口边界的距离大于半径，轨迹最大 x<3 m，无法到达分析区出口。',
    },
    independentVerification:
      '标准落点由圆 (x−2)²+(y−2)²=4 与 x=3 的交点、再加斜率 1/√3 的自由直线独立求得；临界场由 R=1 m 与 R=mv/(q|B|) 独立求得，并与 P07 求解器逐项核对。',
    dimensionalCheck:
      'R=mv/(qB) → kg·(m/s)/(C·T)=m；自由段时间=s；屏幕 y 为 m；临界 |B|=mv/(qR) → T。',
    commonMistakes: ['把分析区出口 y=2−√3 直接当作屏幕 y。', '认为 B 反号会改变速率。', '把相切临界当成已经穿出。'],
  },
  {
    id: 'case-c08-dual-rod-contact',
    title: '双棒追及：共享电流、接触时间与焦耳热',
    subtitle: '两杆在同一均匀磁场中耦合，最终接触；动量与能量分账',
    provenance: original(),
    topicTags: ['双杆耦合', '电磁感应', '动量守恒', '焦耳热', '接触停止'],
    difficulty: 'integrated',
    stem:
      '两根质量均为 1 kg、长度均为 1 m 的导体棒放在间距 1 m 的光滑平行导轨上，回路总电阻 R=2 Ω，处于 Bz=+1 T 的均匀磁场中。初始时杆 1 在 x₁=0、速度 v₁=2 m/s 向右；杆 2 在 x₂=1 m、速度 v₂=0。导轨足够长，忽略自感、摩擦与导轨电阻。求初始共享电流；求两杆接触的时间；求接触时回路累计焦耳热。',
    prediction: {
      question: '初始时刻杆 1 受到的磁场力方向是：',
      options: ['向右，帮助杆 1 加速', '向左，阻碍杆 1 靠近杆 2', '为零', '竖直向上'],
      correct: 1,
      explain: '两杆构成单回路，感应电流使杆 1 受力向左、杆 2 受力向右；成对力阻碍相对运动。',
    },
    stages: [
      {
        id: 'c08-contact',
        title: '在 I06 中复现双棒接触',
        modelId: 'i06',
        modelMatch: 'exact_model',
        presetId: 'i06-contact',
        limitations: ['静态均匀 B', '集中电阻、无自感', '接触停止，不模拟碰撞/形变'],
        parameterMappings: [
          { questionSymbol: 'Bz', modelParameter: 'BzTesla', units: 'T', explanation: '均匀磁场' },
          { questionSymbol: 'm₁,m₂', modelParameter: 'mass1Kg,mass2Kg', units: 'kg', explanation: '两杆质量' },
          { questionSymbol: 'x₁,x₂', modelParameter: 'x1M,x2M', units: 'm', explanation: '初始位置与间距' },
          { questionSymbol: 'v₁,v₂', modelParameter: 'v1Mps,v2Mps', units: 'm/s', explanation: '初始速度' },
          { questionSymbol: 'R', modelParameter: 'resistanceOhm', units: 'Ω', explanation: '回路总电阻' },
        ],
        checkableObservables: ['initialCurrentA', 'contactTimeS', 'contactHeatJ'],
        expected: {
          initialCurrentA: { value: 1, unit: 'A', tolerance: 1e-8 },
          contactTimeS: { value: Math.log(2), unit: 's', tolerance: 1e-8 },
          contactHeatJ: { value: 0.75, unit: 'J', tolerance: 1e-8 },
        },
        conceptualCheckpoint: '接触时两杆速度相同，回路电流是否仍存在？',
      },
    ],
    guidingQuestions: [
      '为什么两杆只有一个共享电流？',
      '初始总电动势由哪两个速度决定？',
      '相对速度为什么指数衰减？',
      '接触时动量与动能各如何分配？',
    ],
    reasoningSteps: [
      '两根棒在同一均匀磁场中，导轨形成单回路，总电动势 ε=BL(v₁−v₂)=2 V，初始电流 I=ε/R=1 A。',
      '电流方向使杆 1 受力 −1 N、杆 2 受力 +1 N，两力等大反向，总动量守恒。',
      '自由模式下相对速度满足 v_rel=−2e^{−t}，相对位移 2(1−e^{−t}) 等于初始间距 1 m。',
      '解得 e^{−t}=1/2，接触时间 t=ln2≈0.6931472 s。',
      '接触时解析速度为 v₁=1.5 m/s、v₂=0.5 m/s，二者仍有相对速度；初动能 2 J、接触时 1.25 J，Q_J=0.75 J。',
    ],
    variations: [
      { title: '把 Bz 改为 0', detail: '无感应电流、无磁场阻尼，相对速度保持 2 m/s，接触时间为 0.5 s，Q_J=0；原题的 ln2 与 1 J 均失效。' },
      { title: '把杆 1 初速度改为 4 m/s', detail: '初始电流、接触时间与焦耳热全部改变；必须由当前求解器重新计算。' },
    ],
    checkpoint: {
      question: '两杆接触时，回路焦耳热最接近：',
      options: ['0 J', '0.5 J', '0.75 J', '2 J'],
      correct: 2,
      explain: '接触时 v₁=1.5 m/s、v₂=0.5 m/s，动能 1.25 J；初动能 2 J，差值为 0.75 J。',
    },
    independentVerification:
      '初始电流由 ε=BL(v₁−v₂)/R 独立计算；接触时间由相对速度指数衰减积分 2(1−e^{−t})=1 得到 ln2；接触时由解析速度 v₁=1+e^{−t}、v₂=1−e^{−t} 得 1.5/0.5 m/s，再用初末动能差得到 0.75 J，与 I06 求解器事件和能量残差交叉核对。',
    dimensionalCheck:
      'ε=BLv → T·m·m/s=V；I=ε/R → A；F=BIL → N；Q_J=K₀−K_f → J；接触时间由位移/速度 → s。',
    commonMistakes: ['把两杆当成两个独立单棒回路。', '把相对速度当恒定 2 m/s，得到 0.5 s。', '把末动能当成焦耳热。'],
  },
];

const completedCases = [
  ...rawCases.map((item) => {
    const solution = CASE_SOLUTIONS[item.id];
    if (!solution) throw new Error(`Missing Round 16 solution data for ${item.id}`);
    return { ...item, ...solution };
  }),
  { ...A17_CASE_RAW, ...A17_CASE_SOLUTION },
];

if (!completedCases.some((item) => item.id === A17_CASE_ID)) {
  throw new Error('Missing Round 17 A17-01 case');
}

export const PROBLEM_CASES = problemCasesSchema.parse(completedCases);
export const PROBLEM_CASES_BY_ID = Object.fromEntries(PROBLEM_CASES.map((item) => [item.id, item]));
export const GUIDE_CASE_COUNT = PROBLEM_CASES.length;

export function problemCaseById(id: string): ProblemCase | undefined {
  return PROBLEM_CASES_BY_ID[id];
}

export function caseStagesForModel(modelId: string) {
  return PROBLEM_CASES.flatMap((item) => item.stages.filter((stage) => stage.modelId === modelId));
}
