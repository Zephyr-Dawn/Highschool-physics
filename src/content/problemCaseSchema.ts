import { z } from 'zod';
import { modelIdSchema } from './schema';

export const sourceKindSchema = z.enum(['original_case', 'exam_reference']);
export const verificationStatusSchema = z.enum(['unverified', 'metadata_verified', 'paper_and_solution_verified']);
export const rightsStatusSchema = z.enum(['original', 'link_only', 'permission_granted', 'unknown']);
export const matchLevelSchema = z.enum(['exact_model', 'partial_stage', 'concept_illustration', 'unsupported']);

export const caseProvenanceSchema = z.object({
  sourceKind: sourceKindSchema,
  examYear: z.number().int().optional(),
  examRegion: z.string().min(1).optional(),
  questionNumber: z.string().min(1).optional(),
  paperSourceUrl: z.string().url().optional(),
  answerSourceUrl: z.string().url().optional(),
  sourcePublisher: z.string().min(1).optional(),
  checkedAt: z.string().min(1).optional(),
  verification: verificationStatusSchema,
  rights: rightsStatusSchema,
  rightsEvidence: z.string().min(1).optional(),
  reviewNotes: z.string().min(1).optional(),
});

export const parameterMappingSchema = z.object({
  questionSymbol: z.string().min(1),
  modelParameter: z.string().min(1),
  units: z.string().min(1),
  explanation: z.string().min(1),
});

export const expectedObservableSchema = z.object({
  value: z.number().finite(),
  unit: z.string().min(1),
  tolerance: z.number().positive(),
  note: z.string().min(1).optional(),
});

export const caseStageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  modelId: modelIdSchema,
  modelMatch: matchLevelSchema,
  presetId: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
  parameterMappings: z.array(parameterMappingSchema).min(1),
  checkableObservables: z.array(z.string().min(1)).min(1),
  expected: z.record(z.string(), expectedObservableSchema),
  conceptualCheckpoint: z.string().min(1),
});

export const predictionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correct: z.number().int().min(0),
  explain: z.string().min(1),
});

export const caseVariationSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  presetId: z.string().min(1).optional(),
});

export const coverageSchema = z.enum([
  'full_problem_simulated',
  'partial_stage',
  'concept_illustration',
  'unsupported',
]);

export const derivationStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string().min(10),
  formula: z.string().min(1),
  assumptions: z.array(z.string().min(1)).optional(),
  referenceEventId: z.string().min(1).optional(),
});

export const answerSpecSchema = z.object({
  quantity: z.string().min(1),
  unit: z.string().min(1),
  baselineValue: z.number().finite(),
  tolerance: z.object({
    abs: z.number().positive(),
    rel: z.number().positive(),
  }),
  dependsOn: z.array(z.string().min(1)),
});

export const questionPartSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(12),
  targetQuantities: z.array(z.string().min(1)).min(1),
  hints: z.array(z.string().min(1)).min(2),
  derivationSteps: z.array(derivationStepSchema).min(3),
  answerSpec: answerSpecSchema,
  misconception: z.string().min(8),
  independentProofRef: z.string().min(8),
});

export const physicalStageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startEventId: z.string().min(1).optional(),
  endEventId: z.string().min(1).optional(),
  limitations: z.array(z.string().min(1)).min(1),
});

export const wholeProblemVariationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  parameterKey: z.string().min(1),
  unit: z.string().min(1),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().positive(),
  baseValue: z.number().finite(),
  expectedBehavior: z.string().min(8),
});

export const wholeProblemScenarioSchema = z.object({
  adapterId: z.enum([
    'p04-boundary',
    'p05-multizone',
    'p07-beamline',
    'i03-loop-entry',
    'i05-loop-field',
    'i06-dual-rod',
    'i07-opposite-wall',
    'a17-electric-magnetic-screen',
  ]),
  coverage: coverageSchema,
  originDescription: z.string().min(10),
  physicalStages: z.array(physicalStageSchema).min(1),
  teacherAnnotations: z.array(z.string().min(1)).min(1),
  variations: z.array(wholeProblemVariationSchema).min(2),
});

export const problemCaseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    provenance: caseProvenanceSchema,
    topicTags: z.array(z.string().min(1)).min(1),
    difficulty: z.enum(['basic', 'advanced', 'integrated']),
    stem: z.string().min(20),
    prediction: predictionSchema,
    stages: z.array(caseStageSchema).min(1),
    guidingQuestions: z.array(z.string().min(1)).min(1),
    reasoningSteps: z.array(z.string().min(1)).min(4).max(8),
    variations: z.array(caseVariationSchema).min(2),
    parts: z.array(questionPartSchema).min(3),
    wholeProblem: wholeProblemScenarioSchema,
    checkpoint: predictionSchema,
    independentVerification: z.string().min(20),
    dimensionalCheck: z.string().min(10),
    commonMistakes: z.array(z.string().min(1)).min(1),
  })
  .superRefine((value, ctx) => {
    if (value.provenance.sourceKind === 'original_case') {
      if (value.provenance.verification !== 'paper_and_solution_verified') {
        ctx.addIssue({ code: 'custom', message: `${value.id}: 原创案例也必须经过独立核验` });
      }
      if (value.provenance.rights !== 'original') {
        ctx.addIssue({ code: 'custom', message: `${value.id}: 原创案例必须标注 original rights` });
      }
    }
    if (value.provenance.sourceKind === 'exam_reference' && value.stem.length > 0 && value.provenance.rights !== 'permission_granted') {
      ctx.addIssue({ code: 'custom', message: `${value.id}: 未获转载授权的真题引用不能内嵌题面` });
    }
    if (value.prediction.correct >= value.prediction.options.length) {
      ctx.addIssue({ code: 'custom', message: `${value.id}: prediction answer out of range` });
    }
    if (value.checkpoint.correct >= value.checkpoint.options.length) {
      ctx.addIssue({ code: 'custom', message: `${value.id}: checkpoint answer out of range` });
    }
    const partIds = new Set<string>();
    for (const part of value.parts) {
      if (partIds.has(part.id)) ctx.addIssue({ code: 'custom', message: `${value.id}: duplicate part id ${part.id}` });
      partIds.add(part.id);
      if (part.answerSpec.baselineValue !== undefined && !part.targetQuantities.includes(part.answerSpec.quantity)) {
        ctx.addIssue({ code: 'custom', message: `${value.id}/${part.id}: answer quantity must be listed in targetQuantities` });
      }
    }
    const variationKeys = new Set(value.wholeProblem.variations.map((variation) => variation.parameterKey));
    for (const part of value.parts) {
      for (const key of part.answerSpec.dependsOn) {
        if (!variationKeys.has(key)) {
          ctx.addIssue({ code: 'custom', message: `${value.id}/${part.id}: unknown dependency ${key}` });
        }
      }
    }
    for (const variation of value.wholeProblem.variations) {
      if (!(variation.max > variation.min)) {
        ctx.addIssue({ code: 'custom', message: `${value.id}: variation range must be increasing` });
      }
      if (variation.baseValue < variation.min || variation.baseValue > variation.max) {
        ctx.addIssue({ code: 'custom', message: `${value.id}: variation base outside slider range` });
      }
    }
  });

export const problemCasesSchema = z.array(problemCaseSchema).min(1);

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type RightsStatus = z.infer<typeof rightsStatusSchema>;
export type MatchLevel = z.infer<typeof matchLevelSchema>;
export type CaseProvenance = z.infer<typeof caseProvenanceSchema>;
export type CaseStage = z.infer<typeof caseStageSchema>;
export type ProblemCase = z.infer<typeof problemCaseSchema>;
export type QuestionPart = z.infer<typeof questionPartSchema>;
export type WholeProblemScenario = z.infer<typeof wholeProblemScenarioSchema>;
export type WholeProblemVariation = z.infer<typeof wholeProblemVariationSchema>;
export type ExpectedObservable = z.infer<typeof expectedObservableSchema>;
export type CaseVariation = z.infer<typeof caseVariationSchema>;
