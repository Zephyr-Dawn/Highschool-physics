import type { ModelId } from './schema';

export type LearningPathId = 'particles' | 'induction';

export interface LearningPathStep {
  modelId: ModelId;
  concept: string;
  presetId: string;
  presetLabel: string;
  extraPresetIds?: string[];
}

export interface LearningPath {
  id: LearningPathId;
  title: string;
  description: string;
  goal: string;
  steps: LearningPathStep[];
}

export interface DemoRoute {
  id: string;
  title: string;
  description: string;
  steps: Array<{ modelId: ModelId; presetId: string; label: string }>;
}

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: 'particles',
    title: '粒子与电磁场',
    description: '从受力方向到圆周运动，再到有界场、复合场与目标反求。',
    goal: '按“受力 → 圆周 → 边界 → 复合场 → 束线 → 约束反求”的顺序建立空间与临界意识。',
    steps: [
      {
        modelId: 'p01',
        concept: '洛伦兹力方向与真实 3D 运动；直线、圆周与螺旋。',
        presetId: 'p01-3d-force-front',
        presetLabel: '3D 受力正面',
        extraPresetIds: ['p01-motion3d-helix'],
      },
      {
        modelId: 'p02',
        concept: '匀强磁场中的 r、T、圆心与 1–5 粒子比较。',
        presetId: 'p02-default',
        presetLabel: '标准圆周',
        extraPresetIds: ['p02-multi-radius'],
      },
      {
        modelId: 'p03',
        concept: '半平面边界：入场、出场、相切与无入场。',
        presetId: 'p03-default',
        presetLabel: '标准出场',
        extraPresetIds: ['p03-tangent'],
      },
      {
        modelId: 'p04',
        concept: '条带/矩形边界事件、临界宽度与角点。',
        presetId: 'p04-strip-cross',
        presetLabel: '条带穿越',
        extraPresetIds: ['p04-rect-top'],
      },
      {
        modelId: 'p05',
        concept: '相反磁区、多次跨界、区内时间与粒子时序。',
        presetId: 'p05-two-halves',
        presetLabel: '双半平面',
        extraPresetIds: ['p05-cross-not-simultaneous'],
      },
      {
        modelId: 'p06',
        concept: '同区 E+B、速度选择与“电场→磁场”分段。',
        presetId: 'p06-selector',
        presetLabel: '速度选择器',
        extraPresetIds: ['p06-accelerate'],
      },
      {
        modelId: 'p07',
        concept: '加速、狭缝/吸收板、选速、磁分析、末段偏转与屏幕。',
        presetId: 'p07-standard',
        presetLabel: '标准束线',
        extraPresetIds: ['p07-screen-miss'],
      },
      {
        modelId: 'p08',
        concept: '目标线段/时间窗/方向约束、临界与单参数反求。',
        presetId: 'p08-tangent',
        presetLabel: '相切临界',
        extraPresetIds: ['p08-inverse-ey'],
      },
    ],
  },
  {
    id: 'induction',
    title: '电磁感应',
    description: '从磁通量与楞次定律开始，逐步加入运动、耦合、挡板与交流电。',
    goal: '按“磁通 → 变化率 → 单棒/线框 → 耦合/冲击 → 发电机”的顺序串起感应与能量。',
    steps: [
      {
        modelId: 'i01',
        concept: '有符号 Φ/Ψ、B/A/θ 三种变化与楞次方向。',
        presetId: 'i01-field-increase',
        presetLabel: '磁场增大',
        extraPresetIds: ['i01-angle-auto'],
      },
      {
        modelId: 'i04',
        concept: '固定线圈中的 B(t)、ε/ I 符号与四轨图像。',
        presetId: 'i04-sine',
        presetLabel: '正弦 B(t)',
        extraPresetIds: ['i04-manual'],
      },
      {
        modelId: 'i02',
        concept: '单棒切割：ε/I/F 符号与匀速、自由、恒力、手推。',
        presetId: 'i02-default',
        presetLabel: '匀速切割',
        extraPresetIds: ['i02-free-decay'],
      },
      {
        modelId: 'i03',
        concept: '线框进入/离开磁场、Φ/ε/I/F/热与自由滑行。',
        presetId: 'i03-default',
        presetLabel: '标准进出',
        extraPresetIds: ['i03-free'],
      },
      {
        modelId: 'i05',
        concept: '时变 B 与运动线框耦合：感生/动生分解与场源能量。',
        presetId: 'i05-static-entry',
        presetLabel: '静态场进入',
        extraPresetIds: ['i05-cancel'],
      },
      {
        modelId: 'i06',
        concept: '双棒共享电流、相对速度、动量与接触停止。',
        presetId: 'i06-free-symmetric',
        presetLabel: '对称自由双棒',
        extraPresetIds: ['i06-contact'],
      },
      {
        modelId: 'i07',
        concept: '相反磁区带符号通量、真实挡板与焦耳热/冲击分账。',
        presetId: 'i07-interface',
        presetLabel: '跨相反场界面',
        extraPresetIds: ['i07-free-wall'],
      },
      {
        modelId: 'i08',
        concept: '转动线圈的正弦电动势、有效值、负载与机械输入。',
        presetId: 'i08-standard',
        presetLabel: '标准自动发电',
        extraPresetIds: ['i08-peak-start'],
      },
    ],
  },
];

export const DEMO_ROUTES: DemoRoute[] = [
  {
    id: 'demo-induction-core',
    title: '课堂演示：感应四连',
    description: '磁通变化 → 单棒切割 → 运动线框 → 交流发电机。',
    steps: [
      { modelId: 'i01', presetId: 'i01-field-increase', label: 'I01 磁场增大' },
      { modelId: 'i02', presetId: 'i02-default', label: 'I02 单棒切割' },
      { modelId: 'i05', presetId: 'i05-static-entry', label: 'I05 运动线框' },
      { modelId: 'i08', presetId: 'i08-standard', label: 'I08 正弦交流' },
    ],
  },
  {
    id: 'demo-field-geometry',
    title: '课堂演示：磁场几何',
    description: '圆周 → 半平面 → 条形场 → 相反分区。',
    steps: [
      { modelId: 'p02', presetId: 'p02-default', label: 'P02 圆周' },
      { modelId: 'p03', presetId: 'p03-default', label: 'P03 半平面' },
      { modelId: 'p04', presetId: 'p04-strip-cross', label: 'P04 条带' },
      { modelId: 'p05', presetId: 'p05-two-halves', label: 'P05 相反分区' },
    ],
  },
  {
    id: 'demo-composite',
    title: '课堂演示：复合场到反求',
    description: 'E+B → 多级束线 → 目标约束与反向求解。',
    steps: [
      { modelId: 'p06', presetId: 'p06-selector', label: 'P06 速度选择' },
      { modelId: 'p07', presetId: 'p07-standard', label: 'P07 标准束线' },
      { modelId: 'p08', presetId: 'p08-inverse-ey', label: 'P08 反求 Ey' },
    ],
  },
];

export function pathById(id: string): LearningPath | undefined {
  return LEARNING_PATHS.find((path) => path.id === id);
}

export function stepForModel(path: LearningPath, modelId: string): { step: LearningPathStep; index: number } | null {
  const index = path.steps.findIndex((step) => step.modelId === modelId);
  if (index < 0) return null;
  return { step: path.steps[index], index };
}
