import { z } from 'zod';
import {
  rightsStatusSchema,
  verificationStatusSchema,
  type QuestionPart,
  type WholeProblemScenario,
} from '../../content/problemCaseSchema';
import {
  AUTHORING_ADAPTERS,
  SUPPORTED_ADAPTER_IDS,
  defaultVariationsForAdapter,
} from './problemAdapterRegistry';

export const TEACHER_PROBLEM_SCHEMA = 'emplab.teacher-problem.v1';
export const TEACHER_PROBLEM_STORAGE_KEY = 'emplab.teacher-problems.v1';
export const TEACHER_PACKAGE_FORMAT = 'emplab.teacher-problem-package';
export const MAX_TEACHER_DRAFT_BYTES = 256 * 1024;
export const MAX_TEACHER_PACKAGE_BYTES = 512 * 1024;
export const MAX_TEACHER_JSON_DEPTH = 24;
export const MAX_TEACHER_STAGES = 8;
export const MAX_TEACHER_PARTS = 12;
export const MAX_TEACHER_VARIATIONS = 6;
export const MAX_TEACHER_STRING = 8000;

export type DraftReviewStatus =
  | 'draft'
  | 'content_incomplete'
  | 'physics_unverified'
  | 'simulation_verified'
  | 'unsupported';

export type TeacherSourceKind = 'teacher_private' | 'original_case' | 'exam_reference';
export type TeacherStageSupportStatus = 'continuous' | 'independent_stage' | 'concept_only' | 'unsupported';

const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SAFE_CONTENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function safeText(max: number) {
  return z
    .string()
    .max(max)
    .refine((value) => !CONTROL_CHARACTERS.test(value), { message: '文本包含非法控制字符。' });
}

function safeMultiLine(max: number) {
  return safeText(max);
}

function safeId(label = 'ID') {
  return z.string().regex(SAFE_ID, `${label} 仅允许小写字母、数字和连字符，长度 3–64。`);
}

function safeContentId(label = 'ID') {
  return z.string().regex(SAFE_CONTENT_ID, `${label} 仅允许小写字母、数字和连字符，长度 1–64。`);
}

function isSafeHttpUrl(value: string): boolean {
  if (value.length > 500) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

const safeUrlSchema = z
  .string()
  .max(500)
  .refine(isSafeHttpUrl, { message: '来源链接只允许不含账号信息的 http/https URL。' });

const isoDateSchema = z
  .string()
  .max(64)
  .refine(isIsoDate, { message: '时间必须是可解析的 ISO 日期字符串。' });

export const teacherAnswerUnitSchema = z.enum([
  'm',
  'cm',
  'mm',
  's',
  'ms',
  'V',
  'mV',
  'A',
  'mA',
  'N',
  'mN',
  'J',
  'mJ',
  'W',
  'mW',
  'T',
  'mT',
  'Wb',
  'mWb',
  'm/s',
  'cm/s',
  'T/s',
  'T·m',
  'V/m',
  '1',
  '—',
]);

const boundedNumber = z.number().finite().min(-1e6).max(1e6);

export const teacherProvenanceSchema = z
  .object({
    kind: z.enum(['teacher_private', 'original_case', 'exam_reference']),
    sourceUrl: safeUrlSchema.optional(),
    examYear: z.number().int().min(1900).max(2200).optional(),
    paperName: safeText(200).optional(),
    questionNumber: safeText(40).optional(),
    sourcePublisher: safeText(200).optional(),
    sourceReview: verificationStatusSchema,
    rights: rightsStatusSchema,
    reviewEvidence: safeMultiLine(1000).optional(),
    rightsEvidence: safeMultiLine(1000).optional(),
    reviewNotes: safeMultiLine(1000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sourceReview !== 'unverified' && (value.reviewEvidence?.trim().length ?? 0) < 10) {
      ctx.addIssue({ code: 'custom', message: '来源核验状态不是 unverified 时，必须填写至少 10 个字符的核验证据。' });
    }
    if (value.rights !== 'unknown' && value.rights !== 'link_only' && (value.rightsEvidence?.trim().length ?? 0) < 10) {
      ctx.addIssue({ code: 'custom', message: '声明原创或已获转载许可时，必须填写至少 10 个字符的权利依据。' });
    }
    if (value.kind === 'exam_reference' && value.sourceReview !== 'unverified' && !value.sourceUrl) {
      ctx.addIssue({ code: 'custom', message: '真题引用声明已核验时必须保留来源链接。' });
    }
  });

const teacherDerivationStepSchema = z
  .object({
    id: safeContentId('推导步骤 ID'),
    title: safeText(160),
    explanation: safeMultiLine(3000),
    formula: safeText(500),
    assumptions: z.array(safeText(400)).max(6).optional(),
    referenceEventId: z.string().max(80).optional(),
  })
  .strict();

const teacherAnswerSpecSchema = z
  .object({
    quantity: z.string().max(64),
    unit: teacherAnswerUnitSchema,
    tolerance: z
      .object({
        abs: z.number().finite().positive().max(1e6),
        rel: z.number().finite().positive().max(1),
      })
      .strict(),
    dependsOn: z.array(z.string().max(80)).max(8),
  })
  .strict();

export const teacherPartSchema = z
  .object({
    id: safeContentId('小问 ID'),
    prompt: safeMultiLine(3000),
    targetQuantities: z.array(z.string().max(64)).max(6),
    hints: z.array(safeMultiLine(1000)).max(6),
    derivationSteps: z.array(teacherDerivationStepSchema).max(8),
    answerSpec: teacherAnswerSpecSchema,
    misconception: safeMultiLine(2000),
    independentProofRef: safeMultiLine(2000),
  })
  .strict();

const teacherPhysicalStageSchema = z
  .object({
    id: safeContentId('阶段 ID'),
    title: safeText(160),
    startEventId: z.string().max(80).optional(),
    endEventId: z.string().max(80).optional(),
    limitations: z.array(safeText(400)).max(6),
  })
  .strict();

const teacherVariationSchema = z
  .object({
    id: safeContentId('变式 ID'),
    label: safeText(160),
    parameterKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,63}$/, '参数键必须以字母开头，只含字母、数字或下划线。'),
    unit: teacherAnswerUnitSchema,
    min: boundedNumber,
    max: boundedNumber,
    step: boundedNumber.positive().max(1000),
    baseValue: boundedNumber,
    expectedBehavior: safeMultiLine(600),
  })
  .strict();

const adapterIdSchema = z
  .string()
  .max(80)
  .refine((value) => SUPPORTED_ADAPTER_IDS.includes(value as (typeof SUPPORTED_ADAPTER_IDS)[number]), {
    message: '未知的物理阶段适配器。',
  });

export const teacherScenarioSchema = z
  .object({
    adapterId: adapterIdSchema,
    originDescription: safeMultiLine(1500),
    physicalStages: z.array(teacherPhysicalStageSchema).max(MAX_TEACHER_STAGES),
    teacherAnnotations: z.array(safeMultiLine(600)).max(8),
    variations: z.array(teacherVariationSchema).max(MAX_TEACHER_VARIATIONS),
  })
  .strict()
  .superRefine((value, ctx) => {
    const stageIds = new Set<string>();
    for (const stage of value.physicalStages) {
      if (stageIds.has(stage.id)) ctx.addIssue({ code: 'custom', message: `重复的阶段 ID：${stage.id}` });
      stageIds.add(stage.id);
    }
    const variationIds = new Set<string>();
    const parameterKeys = new Set<string>();
    for (const variation of value.variations) {
      if (variationIds.has(variation.id)) ctx.addIssue({ code: 'custom', message: `重复的变式 ID：${variation.id}` });
      variationIds.add(variation.id);
      if (parameterKeys.has(variation.parameterKey)) ctx.addIssue({ code: 'custom', message: `重复的参数键：${variation.parameterKey}` });
      parameterKeys.add(variation.parameterKey);
    }
  });

export const teacherProblemDraftSchema = z
  .object({
    schema: z.literal(TEACHER_PROBLEM_SCHEMA),
    version: z.literal(1),
    id: safeId('草稿 ID'),
    title: safeText(160),
    subtitle: safeText(300),
    provenance: teacherProvenanceSchema,
    topicTags: z.array(safeText(80)).max(8),
    difficulty: z.enum(['basic', 'advanced', 'integrated']),
    stem: safeMultiLine(8000),
    scenario: teacherScenarioSchema,
    parts: z.array(teacherPartSchema).max(MAX_TEACHER_PARTS),
    sourceCaseId: z.string().max(80).optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const partIds = new Set<string>();
    for (const part of value.parts) {
      if (partIds.has(part.id)) ctx.addIssue({ code: 'custom', message: `重复的小问 ID：${part.id}` });
      partIds.add(part.id);
      const stepIds = new Set<string>();
      for (const step of part.derivationSteps) {
        if (stepIds.has(step.id)) ctx.addIssue({ code: 'custom', message: `${part.id} 内重复的推导步骤 ID：${step.id}` });
        stepIds.add(step.id);
      }
    }
    if (value.sourceCaseId && !SAFE_ID.test(value.sourceCaseId)) {
      ctx.addIssue({ code: 'custom', message: '复制来源案例 ID 格式无效。' });
    }
  });

export type TeacherAnswerUnit = z.infer<typeof teacherAnswerUnitSchema>;
export type TeacherProvenance = z.infer<typeof teacherProvenanceSchema>;
export type TeacherPart = z.infer<typeof teacherPartSchema>;
export type TeacherScenario = z.infer<typeof teacherScenarioSchema>;
export type TeacherProblemDraft = z.infer<typeof teacherProblemDraftSchema>;

export interface TeacherPackage {
  format: typeof TEACHER_PACKAGE_FORMAT;
  schemaVersion: 1;
  exportedAt: string;
  draft: TeacherProblemDraft;
}

export const teacherPackageSchema = z
  .object({
    format: z.literal(TEACHER_PACKAGE_FORMAT),
    schemaVersion: z.literal(1),
    exportedAt: isoDateSchema,
    draft: teacherProblemDraftSchema,
  })
  .strict();

export const draftReviewStatusSchema = z.enum([
  'draft',
  'content_incomplete',
  'physics_unverified',
  'simulation_verified',
  'unsupported',
]);

export interface TeacherCompiledItem {
  id: string;
  title: string;
  subtitle: string;
  stem: string;
  parts: QuestionPart[];
  wholeProblem: WholeProblemScenario;
  provenance: TeacherProvenance;
  sourceCaseId?: string;
  adapterId: WholeProblemScenario['adapterId'];
  support: TeacherStageSupportStatus;
}

export function teacherUnitFromString(unit: string): TeacherAnswerUnit {
  const parsed = teacherAnswerUnitSchema.safeParse(unit);
  if (!parsed.success) throw new Error(`不受支持的答案单位：${unit}`);
  return parsed.data;
}

export function newTeacherDraftId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `teacher-${uuid.replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase()}`;
  return `teacher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newTeacherPartId(index: number): string {
  return `part-${Math.max(1, Math.round(index))}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createBlankTeacherDraft(
  adapterId: (typeof SUPPORTED_ADAPTER_IDS)[number] = 'a17-electric-magnetic-screen',
): TeacherProblemDraft {
  const adapter = AUTHORING_ADAPTERS[adapterId];
  const now = new Date().toISOString();
  return {
    schema: TEACHER_PROBLEM_SCHEMA,
    version: 1,
    id: newTeacherDraftId(),
    title: '未命名教师题目',
    subtitle: `本机私有草稿 · ${adapter.shortLabel}`,
    provenance: {
      kind: 'teacher_private',
      sourceReview: 'unverified',
      rights: 'unknown',
      reviewNotes: '本机教师草稿，不是官方真题；公开使用前必须独立核实来源与授权。',
    },
    topicTags: [],
    difficulty: 'integrated',
    stem: '',
    scenario: {
      adapterId,
      originDescription: adapter.originDescription,
      physicalStages: adapter.defaultPhysicalStages.map((stage) => ({
        ...stage,
        limitations: [...stage.limitations],
      })),
      teacherAnnotations: [...adapter.teacherAnnotations],
      variations: defaultVariationsForAdapter(adapterId).map((variation) => ({
        ...variation,
        unit: teacherUnitFromString(variation.unit),
      })),
    },
    parts: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneTeacherDraft(draft: TeacherProblemDraft, titleSuffix = '副本'): TeacherProblemDraft {
  const now = new Date().toISOString();
  return {
    ...draft,
    id: newTeacherDraftId(),
    title: `${draft.title} · ${titleSuffix}`.slice(0, 160),
    parts: draft.parts.map((part) => ({
      ...part,
      id: newTeacherPartId(1 + Math.floor(Math.random() * 1000)),
      derivationSteps: part.derivationSteps.map((step) => ({ ...step })),
    })),
    scenario: {
      ...draft.scenario,
      physicalStages: draft.scenario.physicalStages.map((stage) => ({ ...stage, limitations: [...stage.limitations] })),
      teacherAnnotations: [...draft.scenario.teacherAnnotations],
      variations: draft.scenario.variations.map((variation) => ({ ...variation })),
    },
    createdAt: now,
    updatedAt: now,
  };
}
