import { z } from 'zod';

export const questionStatusSchema = z.enum([
  'original',
  'exam_reference',
  'licensed_exam',
  'unverified',
]);

export const moduleSchema = z.enum(['particles', 'induction']);
export const difficultySchema = z.enum(['basic', 'intermediate', 'advanced']);
export const questionTypeSchema = z.enum(['single', 'multiple', 'numeric']);
export const modelIdSchema = z.enum(['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'i01', 'i02', 'i03', 'i04', 'i05', 'i06', 'i07', 'i08']);

const solutionStepSchema = z.object({
  text: z.string().min(1),
  formula: z.string().optional(),
});

const questionBase = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  module: moduleSchema,
  sourceStatus: questionStatusSchema,
  modelId: modelIdSchema.optional(),
  presetId: z.string().optional(),
  tags: z.array(z.string().min(1)).min(1),
  difficulty: difficultySchema,
  stem: z.string().min(1),
  hints: z.array(z.string().min(1)).min(1),
  solution: z.array(solutionStepSchema).min(1),
  commonMistakes: z.array(z.string().min(1)).optional(),
  verified: z.boolean(),
  licenseNote: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  year: z.number().int().optional(),
  region: z.string().optional(),
  examName: z.string().optional(),
  questionNumber: z.string().optional(),
});

const singleSchema = questionBase.extend({
  type: z.literal('single'),
  options: z.array(z.string().min(1)).min(2),
  answer: z.number().int().min(0),
});

const multipleSchema = questionBase.extend({
  type: z.literal('multiple'),
  options: z.array(z.string().min(1)).min(2),
  answer: z.array(z.number().int().min(0)).min(1),
});

const numericSchema = questionBase.extend({
  type: z.literal('numeric'),
  answer: z.object({
    value: z.number().finite(),
    tolerance: z.number().positive(),
    unit: z.string().min(1),
  }),
});

export const questionSchema = z
  .discriminatedUnion('type', [singleSchema, multipleSchema, numericSchema])
  .superRefine((question, ctx) => {
    if (question.type === 'single' && question.answer >= question.options.length) {
      ctx.addIssue({ code: 'custom', message: `${question.id}: single-choice answer is out of range` });
    }
    if (question.type === 'multiple') {
      const unique = new Set(question.answer);
      if (unique.size !== question.answer.length) {
        ctx.addIssue({ code: 'custom', message: `${question.id}: duplicate multi-choice answers` });
      }
      for (const index of question.answer) {
        if (index >= question.options.length) {
          ctx.addIssue({ code: 'custom', message: `${question.id}: multi-choice answer is out of range` });
        }
      }
      if (question.answer.length < 2) {
        ctx.addIssue({ code: 'custom', message: `${question.id}: multi-choice questions need at least two answers` });
      }
    }
    if (question.sourceStatus === 'original' && !question.verified) {
      ctx.addIssue({ code: 'custom', message: `${question.id}: original questions must be verified before publishing` });
    }
    if (question.sourceStatus !== 'original' && question.modelId === undefined) {
      ctx.addIssue({ code: 'custom', message: `${question.id}: non-original questions must stay ungraded without a model reference` });
    }
  });

export const questionsSchema = z.array(questionSchema).min(1);

export const examReferenceSchema = z.object({
  id: z.string().min(1),
  year: z.number().int(),
  examName: z.string().min(1),
  region: z.string().min(1),
  questionNumber: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1),
  sourceUrl: z.string().url(),
  verifiedOnline: z.boolean(),
  sourceNote: z.string().min(1),
  relatedModelId: modelIdSchema.optional(),
  relatedPresetId: z.string().optional(),
  sourceKind: z.literal('exam_reference').optional(),
  verification: z.enum(['unverified', 'metadata_verified', 'paper_and_solution_verified']).optional(),
  rights: z.enum(['original', 'link_only', 'permission_granted', 'unknown']).optional(),
  sourcePublisher: z.string().min(1).optional(),
  reviewNotes: z.string().min(1).optional(),
});

export const examReferencesSchema = z.array(examReferenceSchema);

export type Question = z.infer<typeof questionSchema>;
export type QuestionStatus = z.infer<typeof questionStatusSchema>;
export type ModuleId = z.infer<typeof moduleSchema>;
export type ModelId = z.infer<typeof modelIdSchema>;
export type Difficulty = z.infer<typeof difficultySchema>;
export type ExamReference = z.infer<typeof examReferenceSchema>;
export type SolutionStep = z.infer<typeof solutionStepSchema>;

export type UserAnswer =
  | { kind: 'single'; value: number | null }
  | { kind: 'multiple'; value: number[] }
  | { kind: 'numeric'; value: string };

export function emptyAnswer(question: Question): UserAnswer {
  if (question.type === 'single') return { kind: 'single', value: null };
  if (question.type === 'multiple') return { kind: 'multiple', value: [] };
  return { kind: 'numeric', value: '' };
}

export function isAnswerComplete(question: Question, answer: UserAnswer): boolean {
  if (question.type === 'single') {
    return answer.kind === 'single' && answer.value !== null;
  }
  if (question.type === 'multiple') {
    return answer.kind === 'multiple' && answer.value.length > 0;
  }
  return answer.kind === 'numeric' && answer.value.trim() !== '' && Number.isFinite(Number(answer.value));
}

export function checkAnswer(question: Question, answer: UserAnswer): boolean {
  if (question.type === 'single') {
    return answer.kind === 'single' && answer.value === question.answer;
  }
  if (question.type === 'multiple') {
    if (answer.kind !== 'multiple') return false;
    const expected = [...question.answer].sort((a, b) => a - b);
    const actual = [...answer.value].sort((a, b) => a - b);
    return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
  }
  if (answer.kind !== 'numeric') return false;
  const parsed = Number(answer.value);
  return Number.isFinite(parsed) && Math.abs(parsed - question.answer.value) <= question.answer.tolerance;
}

export function formatAnswer(question: Question): string {
  if (question.type === 'single') {
    return `${String.fromCharCode(65 + question.answer)}. ${question.options[question.answer]}`;
  }
  if (question.type === 'multiple') {
    return question.answer
      .slice()
      .sort((a, b) => a - b)
      .map((index) => `${String.fromCharCode(65 + index)}. ${question.options[index]}`)
      .join('；');
  }
  return `${question.answer.value} ${question.answer.unit}（容差 ±${question.answer.tolerance}）`;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  basic: '基础巩固',
  intermediate: '模型提升',
  advanced: '高考综合',
};

export const MODULE_LABEL: Record<ModuleId, string> = {
  particles: '粒子运动',
  induction: '电磁感应',
};
