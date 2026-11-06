import { questionPartSchema, type QuestionPart } from '../../content/problemCaseSchema';
import type { WholeProblemModel } from '../cases/wholeProblem/types';
import type { TeacherPart } from './teacherProblemSchema';

export interface PartBindingResult {
  ok: boolean;
  errors: string[];
  part: QuestionPart | null;
  observedValue: number | null;
  observedUnit: string | null;
  answerLabel: string | null;
}

function cleanList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function resolveObservable(model: WholeProblemModel, quantity: string) {
  return Object.prototype.hasOwnProperty.call(model.answers, quantity)
    ? model.answers[quantity]
    : null;
}

export function bindTeacherPart(
  part: TeacherPart,
  model: WholeProblemModel,
  allVariationKeys: string[],
): PartBindingResult {
  const errors: string[] = [];
  const quantity = part.answerSpec.quantity.trim();
  const observable = quantity ? resolveObservable(model, quantity) : null;
  if (!quantity) {
    errors.push(`小问 ${part.id} 未绑定观测量。`);
  } else if (!observable) {
    errors.push(`小问 ${part.id} 绑定了当前适配器不存在的观测量 ${quantity}。`);
  }
  if (observable && observable.unit !== part.answerSpec.unit) {
    errors.push(`小问 ${part.id} 的答案单位 ${part.answerSpec.unit} 与观测量单位 ${observable.unit} 不一致。`);
  }
  if (observable && (observable.value === null || !Number.isFinite(observable.value))) {
    errors.push(`小问 ${part.id} 在当前标准参数下没有唯一数值答案（可能未命中、被吸收或处于临界）。`);
  }
  const targetQuantities = cleanList([...part.targetQuantities, quantity].filter(Boolean));
  if (!targetQuantities.includes(quantity)) {
    errors.push(`小问 ${part.id} 的目标量列表必须包含答案观测量 ${quantity}。`);
  }
  const knownKeys = new Set(allVariationKeys);
  for (const key of part.answerSpec.dependsOn) {
    if (!knownKeys.has(key)) errors.push(`小问 ${part.id} 引用了未知参数依赖 ${key}。`);
  }
  const dependencies = allVariationKeys.length > 0
    ? [...new Set(allVariationKeys)]
    : cleanList(part.answerSpec.dependsOn);
  const candidate: QuestionPart = {
    id: part.id,
    prompt: part.prompt,
    targetQuantities,
    hints: cleanList(part.hints),
    derivationSteps: part.derivationSteps.map((step) => ({
      id: step.id,
      title: step.title,
      explanation: step.explanation,
      formula: step.formula,
      ...(step.assumptions?.length ? { assumptions: cleanList(step.assumptions) } : {}),
      ...(step.referenceEventId ? { referenceEventId: step.referenceEventId } : {}),
    })),
    answerSpec: {
      quantity,
      unit: part.answerSpec.unit,
      baselineValue: observable?.value ?? 0,
      tolerance: {
        abs: part.answerSpec.tolerance.abs,
        rel: part.answerSpec.tolerance.rel,
      },
      dependsOn: dependencies,
    },
    misconception: part.misconception,
    independentProofRef: part.independentProofRef,
  };
  const parsed = questionPartSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 6)) {
      errors.push(`小问 ${part.id} 内容不完整：${issue.path.join('.') || 'root'} ${issue.message}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    part: errors.length === 0 ? parsed.success ? parsed.data : null : null,
    observedValue: observable?.value ?? null,
    observedUnit: observable?.unit ?? null,
    answerLabel: observable?.label ?? null,
  };
}

export function observableOptionsForModel(model: WholeProblemModel): Array<{ key: string; label: string; unit: string }> {
  return Object.entries(model.answers).map(([key, observable]) => ({
    key,
    label: observable.label,
    unit: observable.unit,
  }));
}
