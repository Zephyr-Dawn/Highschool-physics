import { PROBLEM_CASES, problemCaseById } from '../../content/problemCases';
import { A17_CASE_ID } from '../../content/round17Case';
import {
  defaultVariationsForAdapter,
  AUTHORING_ADAPTERS,
} from './problemAdapterRegistry';
import {
  newTeacherDraftId,
  teacherUnitFromString,
  type TeacherPart,
  type TeacherProblemDraft,
} from './teacherProblemSchema';

function nowIso(): string {
  return new Date().toISOString();
}

function teacherPartFromCase(part: (typeof PROBLEM_CASES)[number]['parts'][number]): TeacherPart {
  return {
    id: part.id,
    prompt: part.prompt,
    targetQuantities: [...part.targetQuantities],
    hints: [...part.hints],
    derivationSteps: part.derivationSteps.map((step) => ({
      id: step.id,
      title: step.title,
      explanation: step.explanation,
      formula: step.formula,
      ...(step.assumptions ? { assumptions: [...step.assumptions] } : {}),
      ...(step.referenceEventId ? { referenceEventId: step.referenceEventId } : {}),
    })),
    answerSpec: {
      quantity: part.answerSpec.quantity,
      unit: teacherUnitFromString(part.answerSpec.unit),
      tolerance: { ...part.answerSpec.tolerance },
      dependsOn: [...part.answerSpec.dependsOn],
    },
    misconception: part.misconception,
    independentProofRef: part.independentProofRef,
  };
}

export function createA17TeacherTemplate(): TeacherProblemDraft {
  const caseItem = problemCaseById(A17_CASE_ID);
  if (!caseItem) throw new Error('A17-01 内置案例缺失');
  const now = nowIso();
  return {
    schema: 'emplab.teacher-problem.v1',
    version: 1,
    id: newTeacherDraftId(),
    title: 'A17-01 教师模板：电场—磁场—屏幕',
    subtitle: '本机教师草稿 · 可编辑的三阶段连续题',
    provenance: {
      kind: 'teacher_private',
      sourceReview: 'unverified',
      rights: 'unknown',
      reviewNotes: '本机教师草稿，不是官方真题；物理数值由当前求解器重新计算。',
    },
    topicTags: ['电场加速', '有界磁场', '屏幕探测'],
    difficulty: 'integrated',
    stem: caseItem.stem,
    scenario: {
      adapterId: caseItem.wholeProblem.adapterId,
      originDescription: caseItem.wholeProblem.originDescription,
      physicalStages: caseItem.wholeProblem.physicalStages.map((stage) => ({
        ...stage,
        limitations: [...stage.limitations],
      })),
      teacherAnnotations: [...caseItem.wholeProblem.teacherAnnotations],
      variations: caseItem.wholeProblem.variations.map((variation) => ({
        ...variation,
        unit: teacherUnitFromString(variation.unit),
      })),
    },
    parts: caseItem.parts.map(teacherPartFromCase),
    sourceCaseId: caseItem.id,
    createdAt: now,
    updatedAt: now,
  };
}

function i07PartFixture(): TeacherPart[] {
  return [
    {
      id: 'part-a-emf',
      prompt: '求初始时刻线框的感应电动势（带符号）。',
      targetQuantities: ['initialEmfV'],
      hints: [
        '先判断线框左右边缘分别落在哪个磁区。',
        '分别写出 ℓ₁、ℓ₂ 与边界速度因子 g₁、g₂，再合成 S。',
      ],
      derivationSteps: [
        {
          id: 'a1',
          title: '确定边缘位置',
          explanation: '线框左边缘从 x=0.5 m 出发、宽 1 m，所以左右边缘分别在 B₁、B₂ 两区，各重叠 0.5 m。',
          formula: '\\ell_1=\\ell_2=0.5\\,\\mathrm{m}',
        },
        {
          id: 'a2',
          title: '带符号通量相消',
          explanation: 'B₁=+1 T、B₂=−1 T，两边面积贡献相反，所以初始磁通为零。',
          formula: '\\Phi=h(B_1\\ell_1+B_2\\ell_2)=0',
        },
        {
          id: 'a3',
          title: '感应电动势',
          explanation: '两边界速度因子相加得 S=−2；ε=−NhSv=16 V。零磁通不代表零电动势。',
          formula: 'S=-2,\\quad \\varepsilon=-NhSv=16\\,\\mathrm{V}',
          referenceEventId: 'start',
        },
      ],
      answerSpec: {
        quantity: 'initialEmfV',
        unit: 'V',
        tolerance: { abs: 1e-6, rel: 1e-6 },
        dependsOn: ['field2Bz'],
      },
      misconception: '看到初始磁通为零就判定电动势为零，忽略磁通正在变化。',
      independentProofRef: '带符号通量叠加与 S 的独立代数计算；用 I07 初始快照核对 16 V。',
    },
    {
      id: 'part-b-joule',
      prompt: '求线框首次撞到挡板时，电阻中累计产生的焦耳热 Q_J。',
      targetQuantities: ['jouleHeatAtBounceJ'],
      hints: [
        '焦耳热来自运动过程中的电阻耗散，不是碰撞瞬间的机械能损失。',
        '在事件时间轴上定位 wall-bounce，读取该时刻的能量账本。',
      ],
      derivationSteps: [
        {
          id: 'b1',
          title: '区分两类耗散',
          explanation: '磁场阻尼过程中，机械能转化为电阻焦耳热；挡板碰撞则造成接触冲击损失。',
          formula: 'Q_J=\\int I^2R\\,dt',
        },
        {
          id: 'b2',
          title: '读取碰板时刻',
          explanation: '定位真实挡板事件，碰板前的焦耳热已经累积，但碰撞损失尚未计入 Q_J。',
          formula: 't=t_{\\mathrm{bounce}}',
          referenceEventId: 'wall-bounce',
        },
        {
          id: 'b3',
          title: '能量分账',
          explanation: '碰板时的 Q_J 与 Q_impact 分开记录；不能用冲击损失替代焦耳热。',
          formula: 'Q_J(t_{\\mathrm{bounce}})\\neq Q_{\\mathrm{impact}}',
          referenceEventId: 'wall-bounce',
        },
      ],
      answerSpec: {
        quantity: 'jouleHeatAtBounceJ',
        unit: 'J',
        tolerance: { abs: 1e-6, rel: 1e-6 },
        dependsOn: ['field2Bz'],
      },
      misconception: '把碰撞损失的 1.215 J 计入焦耳热；两者对应不同能量通道。',
      independentProofRef: '在 I07 碰板事件时刻读取累计焦耳热，并与完整能量账本核对。',
    },
    {
      id: 'part-c-impact',
      prompt: '求线框在挡板处碰撞损失的机械能 Q_impact。',
      targetQuantities: ['impactLossJ'],
      hints: [
        '先求碰前速度，再用 v′=−e v 求反弹速度。',
        '冲击损失等于碰前、碰后动能之差。',
      ],
      derivationSteps: [
        {
          id: 'c1',
          title: '碰前状态',
          explanation: '连续求解先得到碰前速度 1.8 m/s；它来自真实磁场阻尼，不是重新设置。',
          formula: 'v_{\\mathrm{before}}=1.8\\,\\mathrm{m/s}',
          referenceEventId: 'wall-bounce',
        },
        {
          id: 'c2',
          title: '反弹速度',
          explanation: '恢复系数 e=0.5，速度反向且大小减半。',
          formula: "v'=-ev=-0.9\\,\\mathrm{m/s}",
          referenceEventId: 'wall-bounce',
        },
        {
          id: 'c3',
          title: '冲击损失',
          explanation: '能量差只记入 Q_impact，与电阻焦耳热分开。',
          formula: "Q_{\\mathrm{impact}}=\\frac12m(v^2-v'^2)=1.215\\,\\mathrm{J}",
          referenceEventId: 'wall-bounce',
        },
      ],
      answerSpec: {
        quantity: 'impactLossJ',
        unit: 'J',
        tolerance: { abs: 1e-6, rel: 1e-6 },
        dependsOn: ['restitution', 'field2Bz'],
      },
      misconception: '把冲击损失写成焦耳热的一个分量；碰撞与电阻耗散是不同机制。',
      independentProofRef: '一维碰撞能量差：½(1.8²−0.9²)=1.215 J，并用 I07 wall-bounce 事件核对。',
    },
    {
      id: 'part-d-bounce',
      prompt: '求线框反弹后瞬间的速度（带符号）。',
      targetQuantities: ['postBounceSpeedMps'],
      hints: ['恢复系数给出 v′=−e v。', '速度正方向向右，反弹后应为负值。'],
      derivationSteps: [
        {
          id: 'd1',
          title: '读取碰前速度',
          explanation: '碰前速度由连续磁场阻尼计算，不等于初始 8 m/s。',
          formula: 'v=1.8\\,\\mathrm{m/s}',
          referenceEventId: 'wall-bounce',
        },
        {
          id: 'd2',
          title: '应用恢复系数',
          explanation: 'e=0.5 且速度方向反转。',
          formula: "v'=-0.5\\times1.8=-0.9\\,\\mathrm{m/s}",
          referenceEventId: 'wall-bounce',
        },
        {
          id: 'd3',
          title: '后续再入',
          explanation: '反弹后线框向左重新进入磁场；时间轴继续，不重置为新的独立实验。',
          formula: 'v\'<0',
          referenceEventId: 're-enter',
        },
      ],
      answerSpec: {
        quantity: 'postBounceSpeedMps',
        unit: 'm/s',
        tolerance: { abs: 1e-6, rel: 1e-6 },
        dependsOn: ['restitution', 'field2Bz'],
      },
      misconception: '把反弹速度写成 +0.9 m/s；速度是矢量，碰撞后方向反转。',
      independentProofRef: 'v′=−ev 与 I07 wall-bounce 事件的 velocityAfterMps 交叉核对。',
    },
  ];
}

export function createA17InductionTemplate(): TeacherProblemDraft {
  const now = nowIso();
  const adapter = AUTHORING_ADAPTERS['i07-opposite-wall'];
  return {
    schema: 'emplab.teacher-problem.v1',
    version: 1,
    id: newTeacherDraftId(),
    title: 'A17-02 教师模板：相反磁区、挡板与能量分账',
    subtitle: '本机教师草稿 · I07 同一求解器内的多事件全程',
    provenance: {
      kind: 'teacher_private',
      sourceReview: 'unverified',
      rights: 'unknown',
      reviewNotes: '本机教师草稿，不是官方真题；挡板损失与焦耳热由当前 I07 求解器分别计算。',
    },
    topicTags: ['相反磁场', '感应电流', '挡板碰撞', '能量分账'],
    difficulty: 'integrated',
    stem:
      'N=h=1、宽 w=1 m、电阻 R=1 Ω 的线框以 8 m/s 向右运动，左边缘从 x=0.5 m 出发；B₁=+1 T 在 [0,1] m，B₂=−1 T 在 [1,2] m，挡板在 x=3.2 m，恢复系数 e=0.5。线框连续经历反向双场、出场、撞板反弹和再次进入磁场。求初始感应电动势、碰板时累计焦耳热、碰撞冲击损失与反弹后瞬间速度。忽略自感、边缘场与导线厚度。',
    scenario: {
      adapterId: 'i07-opposite-wall',
      originDescription: adapter.originDescription,
      physicalStages: adapter.defaultPhysicalStages.map((stage) => ({
        ...stage,
        limitations: [...stage.limitations],
      })),
      teacherAnnotations: [...adapter.teacherAnnotations],
      variations: defaultVariationsForAdapter('i07-opposite-wall').map((variation) => ({
        ...variation,
        unit: teacherUnitFromString(variation.unit),
      })),
    },
    parts: i07PartFixture(),
    createdAt: now,
    updatedAt: now,
  };
}

export interface TeacherTemplateDescriptor {
  id: string;
  title: string;
  description: string;
  create: () => TeacherProblemDraft;
}

export const TEACHER_TEMPLATES: TeacherTemplateDescriptor[] = [
  {
    id: 'a17-01',
    title: 'A17-01 电场加速—有限磁场—屏幕',
    description: '跨求解器连续状态交接，3 个小问，含 4 个可调参数。',
    create: createA17TeacherTemplate,
  },
  {
    id: 'a17-02',
    title: 'A17-02 相反磁区—挡板—再入',
    description: 'I07 同一求解器多事件，4 个小问，焦耳热与冲击损失分账。',
    create: createA17InductionTemplate,
  },
];

export function copyBuiltInCaseAsDraft(caseId: string): TeacherProblemDraft | null {
  const caseItem = problemCaseById(caseId);
  if (!caseItem) return null;
  const now = nowIso();
  return {
    schema: 'emplab.teacher-problem.v1',
    version: 1,
    id: newTeacherDraftId(),
    title: `复制 · ${caseItem.title}`.slice(0, 160),
    subtitle: '本机教师私有副本 · 不修改内置案例',
    provenance: {
      kind: 'teacher_private',
      sourceReview: 'unverified',
      rights: 'unknown',
      reviewNotes: '复制自内置原创案例，仅在本机编辑；不是官方真题，也不自动获得公开转载许可。',
    },
    topicTags: [...caseItem.topicTags],
    difficulty: caseItem.difficulty,
    stem: caseItem.stem,
    scenario: {
      adapterId: caseItem.wholeProblem.adapterId,
      originDescription: caseItem.wholeProblem.originDescription,
      physicalStages: caseItem.wholeProblem.physicalStages.map((stage) => ({
        ...stage,
        limitations: [...stage.limitations],
      })),
      teacherAnnotations: [...caseItem.wholeProblem.teacherAnnotations],
      variations: caseItem.wholeProblem.variations.map((variation) => ({
        ...variation,
        unit: teacherUnitFromString(variation.unit),
      })),
    },
    parts: caseItem.parts.map(teacherPartFromCase),
    sourceCaseId: caseItem.id,
    createdAt: now,
    updatedAt: now,
  };
}

export function builtInCaseCopyOptions(): Array<{ id: string; title: string }> {
  return PROBLEM_CASES.map((item) => ({ id: item.id, title: item.title }));
}
