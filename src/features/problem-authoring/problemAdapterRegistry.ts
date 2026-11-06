import type { WholeProblemScenario, WholeProblemVariation } from '../../content/problemCaseSchema';

export type WholeProblemAdapterId = WholeProblemScenario['adapterId'];
export type TeacherStageSupport = 'continuous' | 'independent_stage' | 'concept_only' | 'unsupported';

export interface AdapterObservableDefinition {
  key: string;
  label: string;
  unit: string;
  note?: string;
}

export interface AdapterParameterDefinition {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  baseValue: number;
  expectedBehavior: string;
}

export interface AuthoringAdapterRegistryEntry {
  id: WholeProblemAdapterId;
  label: string;
  shortLabel: string;
  support: TeacherStageSupport;
  coverage: WholeProblemScenario['coverage'];
  authorable: boolean;
  engine: string;
  limitations: string[];
  parameters: AdapterParameterDefinition[];
  observables: AdapterObservableDefinition[];
  originDescription: string;
  teacherAnnotations: string[];
  defaultPhysicalStages: WholeProblemScenario['physicalStages'];
}

const A17_PARAMETERS: AdapterParameterDefinition[] = [
  {
    key: 'electricFieldX',
    label: '加速电场 Eₓ',
    unit: 'V/m',
    min: -2,
    max: 4,
    step: 0.1,
    baseValue: 1,
    expectedBehavior: 'A 阶段出射速率、磁场半径、下游出射状态与屏幕落点同步重算。',
  },
  {
    key: 'magneticFieldZ',
    label: '磁场 Bz',
    unit: 'T',
    min: -3,
    max: 3,
    step: 0.1,
    baseValue: -1,
    expectedBehavior: '反向磁场使轨迹镜像；相切或无法从右边界出场时不生成屏幕光斑。',
  },
  {
    key: 'magneticWidthM',
    label: '磁场条带宽度 w',
    unit: 'm',
    min: 0.2,
    max: 2.8,
    step: 0.05,
    baseValue: Math.sqrt(3) / 2,
    expectedBehavior: '磁场出口相位、位置与自由漂移起点改变。',
  },
  {
    key: 'screenGapM',
    label: '屏幕距离 Δx',
    unit: 'm',
    min: 0.2,
    max: 2.5,
    step: 0.05,
    baseValue: 1,
    expectedBehavior: '屏幕位置、漂移时间与落点 y 重算。',
  },
];

const A17_OBSERVABLES: AdapterObservableDefinition[] = [
  { key: 'accelerationExitSpeedMps', label: 'A 阶段出射速率', unit: 'm/s' },
  { key: 'accelerationTimeS', label: 'A 阶段加速时间', unit: 's' },
  { key: 'magneticExitTimeS', label: 'B 阶段磁场内时间', unit: 's' },
  { key: 'magneticExitY', label: 'B 阶段出射点 y', unit: 'm' },
  { key: 'magneticExitVx', label: 'B 阶段出射 vx', unit: 'm/s' },
  { key: 'magneticExitVy', label: 'B 阶段出射 vy', unit: 'm/s' },
  { key: 'screenY', label: '屏幕有效区落点 y', unit: 'm' },
  { key: 'totalTimeS', label: '到屏幕的总时间', unit: 's' },
];

const I07_PARAMETERS: AdapterParameterDefinition[] = [
  {
    key: 'restitution',
    label: '恢复系数 e',
    unit: '1',
    min: 0,
    max: 1,
    step: 0.05,
    baseValue: 0.5,
    expectedBehavior: '反弹速度、冲击损失与再入轨迹同步重算；焦耳热与冲击损失分别记账。',
  },
  {
    key: 'field2Bz',
    label: '第二区 Bz',
    unit: 'T',
    min: -2,
    max: 2,
    step: 0.1,
    baseValue: -1,
    expectedBehavior: '带符号磁通、S、初始电动势与碰前速度改变；零磁通临界条件可能消失。',
  },
];

const I07_OBSERVABLES: AdapterObservableDefinition[] = [
  { key: 'initialEmfV', label: '初始感应电动势', unit: 'V' },
  { key: 'jouleHeatAtBounceJ', label: '碰板时累计焦耳热', unit: 'J' },
  { key: 'impactLossJ', label: '挡板冲击损失', unit: 'J' },
  { key: 'postBounceSpeedMps', label: '反弹后速度', unit: 'm/s' },
];

const GENERIC_ADAPTERS: Record<Exclude<WholeProblemAdapterId, 'a17-electric-magnetic-screen' | 'i07-opposite-wall'>, string> = {
  'p04-boundary': 'P04 有限磁场边界',
  'p05-multizone': 'P05 相反磁场多区域',
  'p07-beamline': 'P07 多级束线',
  'i03-loop-entry': 'I03 线框进出磁场',
  'i05-loop-field': 'I05 运动线框与时变场',
  'i06-dual-rod': 'I06 双导体棒耦合',
};

function genericEntry(id: keyof typeof GENERIC_ADAPTERS): AuthoringAdapterRegistryEntry {
  return {
    id,
    label: GENERIC_ADAPTERS[id],
    shortLabel: id.split('-')[0].toUpperCase(),
    support: 'continuous',
    coverage: 'full_problem_simulated',
    authorable: false,
    engine: 'built-in whole-problem adapter',
    limitations: ['仅用于复制已有内置案例后的只读物理适配器；不作为新建题目的通用拼接目标。'],
    parameters: [],
    observables: [],
    originDescription: '复制自内置案例，沿用其经过验证的整题适配器。',
    teacherAnnotations: ['该适配器只在复制内置案例时保留；新建题目请选择 A17-01 或 A17-02 模板。'],
    defaultPhysicalStages: [],
  };
}

const A17_ENTRY: AuthoringAdapterRegistryEntry = {
  id: 'a17-electric-magnetic-screen',
  label: 'A17-01 电场加速 → 有限磁场 → 自由漂移 → 屏幕',
  shortLabel: 'A17-01',
  support: 'continuous',
  coverage: 'full_problem_simulated',
  authorable: true,
  engine: 'crossedFields + finiteMagneticRegion + free drift',
  limitations: [
    '二维、静态均匀场与理想边界；忽略重力、边缘场与辐射。',
    '阶段交接必须保持位置、速度、全局时间与粒子身份连续。',
    '只拼接已经注册的电场/有限磁场/自由漂移阶段，不允许任意求解器组合。',
  ],
  parameters: A17_PARAMETERS,
  observables: A17_OBSERVABLES,
  originDescription:
    '同一二维坐标与全局时间：匀强电场加速 → 有限磁场条带偏转 → 无场漂移 → 探测屏；每个阶段入口直接使用上一阶段的真实出射状态。',
  teacherAnnotations: [
    '先定位 a-exit、b-exit 两个交接事件，再讨论屏幕命中。',
    '任何参数变化都要重新读取事件表，不能沿用旧屏幕落点。',
    '无真实出场或屏幕越界时，正确的结果是“未命中/不可达”，不是默认光斑。',
  ],
  defaultPhysicalStages: [
    { id: 'accelerate', title: '阶段 A：匀强电场加速', startEventId: 'start', endEventId: 'a-exit', limitations: ['匀强电场', '忽略重力与边缘场'] },
    { id: 'magnetic', title: '阶段 B：有限磁场偏转', startEventId: 'a-exit', endEventId: 'b-exit', limitations: ['理想条带边界', '磁场不做功'] },
    { id: 'drift', title: '阶段 C：无场漂移与屏幕', startEventId: 'b-exit', limitations: ['匀速直线', '未命中不生成光斑'] },
  ],
};

const I07_ENTRY: AuthoringAdapterRegistryEntry = {
  id: 'i07-opposite-wall',
  label: 'A17-02 相反磁区 → 感应电流 → 挡板碰撞 → 再入',
  shortLabel: 'A17-02',
  support: 'continuous',
  coverage: 'full_problem_simulated',
  authorable: true,
  engine: 'oppositeFieldsWallLoop / solveI07',
  limitations: [
    '一维刚性线框、集中电阻；忽略自感、边缘场与导线厚度。',
    '挡板为恢复系数模型；冲击损失与焦耳热分开记账。',
    '同一求解器内部的事件连续；不虚构跨 induction 求解器的电路连续性。',
  ],
  parameters: I07_PARAMETERS,
  observables: I07_OBSERVABLES,
  originDescription:
    '同一线框与全局时间：反向双磁区中产生感应电流与磁场阻尼 → 出场后撞挡板 → 以反弹速度重新进入磁场；碰撞损失与焦耳热分别记录。',
  teacherAnnotations: [
    '在碰板事件处同时读取 Q_impact 与 Q_J，不能互相替代。',
    '把 e 改为 0 或 1，观察反弹速度与冲击损失，而焦耳热仍来自电阻耗散。',
    '改变第二区 Bz 后，零磁通结论可能失效，必须重新计算带符号通量。',
  ],
  defaultPhysicalStages: [
    { id: 'fields', title: '反向双场中的感应与阻尼', startEventId: 'start', endEventId: 'field-exit', limitations: ['理想集中电阻', '静态均匀分区'] },
    { id: 'bounce', title: '出场后撞板反弹', startEventId: 'field-exit', endEventId: 'wall-bounce', limitations: ['恢复系数模型', '冲击与焦耳热分账'] },
    { id: 'return', title: '反弹后重新进入磁场', startEventId: 'wall-bounce', endEventId: 're-enter', limitations: ['历史不重置'] },
  ],
};

export const AUTHORING_ADAPTERS: Record<WholeProblemAdapterId, AuthoringAdapterRegistryEntry> = {
  'a17-electric-magnetic-screen': A17_ENTRY,
  'i07-opposite-wall': I07_ENTRY,
  'p04-boundary': genericEntry('p04-boundary'),
  'p05-multizone': genericEntry('p05-multizone'),
  'p07-beamline': genericEntry('p07-beamline'),
  'i03-loop-entry': genericEntry('i03-loop-entry'),
  'i05-loop-field': genericEntry('i05-loop-field'),
  'i06-dual-rod': genericEntry('i06-dual-rod'),
};

export const SUPPORTED_ADAPTER_IDS = Object.keys(AUTHORING_ADAPTERS) as WholeProblemAdapterId[];
export const AUTHORABLE_ADAPTER_IDS = SUPPORTED_ADAPTER_IDS.filter((id) => AUTHORING_ADAPTERS[id].authorable);

export function adapterRegistryEntry(id: string): AuthoringAdapterRegistryEntry | null {
  return Object.prototype.hasOwnProperty.call(AUTHORING_ADAPTERS, id)
    ? AUTHORING_ADAPTERS[id as WholeProblemAdapterId]
    : null;
}

export function defaultVariationsForAdapter(id: WholeProblemAdapterId): WholeProblemVariation[] {
  return AUTHORING_ADAPTERS[id].parameters.map((parameter) => ({
    id: `variation-${parameter.key.replace(/[A-Z]/g, (letter) => letter.toLowerCase())}`,
    label: parameter.label,
    parameterKey: parameter.key,
    unit: parameter.unit,
    min: parameter.min,
    max: parameter.max,
    step: parameter.step,
    baseValue: parameter.baseValue,
    expectedBehavior: parameter.expectedBehavior,
  }));
}

export function adapterSupportLabel(support: TeacherStageSupport): string {
  switch (support) {
    case 'continuous':
      return '连续整题：阶段间有真实状态交接';
    case 'independent_stage':
      return '独立阶段：只做分段讲解，不连成全程动画';
    case 'concept_only':
      return '仅概念辅助';
    default:
      return '不支持';
  }
}
