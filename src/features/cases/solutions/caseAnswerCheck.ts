import type { QuestionPart } from '../../../content/problemCaseSchema';
import { parseParameterExpression } from '../../../math/parameterExpression';
import type { WholeProblemModel } from '../wholeProblem/types';

export type AnswerCheckStatus = 'empty' | 'correct' | 'incorrect' | 'needs_review' | 'unit_error' | 'invalid';

export interface AnswerCheckResult {
  status: AnswerCheckStatus;
  message: string;
  expected: number | null;
  expectedUnit: string;
  observed: number | null;
  recomputed: boolean;
  normalized: string | null;
}

const UNIT_TABLE: Record<string, { dimension: string; factor: number }> = {
  m: { dimension: 'length', factor: 1 },
  cm: { dimension: 'length', factor: 0.01 },
  mm: { dimension: 'length', factor: 0.001 },
  s: { dimension: 'time', factor: 1 },
  ms: { dimension: 'time', factor: 0.001 },
  V: { dimension: 'voltage', factor: 1 },
  mV: { dimension: 'voltage', factor: 0.001 },
  A: { dimension: 'current', factor: 1 },
  mA: { dimension: 'current', factor: 0.001 },
  N: { dimension: 'force', factor: 1 },
  mN: { dimension: 'force', factor: 0.001 },
  J: { dimension: 'energy', factor: 1 },
  mJ: { dimension: 'energy', factor: 0.001 },
  W: { dimension: 'power', factor: 1 },
  mW: { dimension: 'power', factor: 0.001 },
  T: { dimension: 'field', factor: 1 },
  mT: { dimension: 'field', factor: 0.001 },
  Wb: { dimension: 'flux', factor: 1 },
  mWb: { dimension: 'flux', factor: 0.001 },
  'm/s': { dimension: 'speed', factor: 1 },
  'cm/s': { dimension: 'speed', factor: 0.01 },
  'T/s': { dimension: 'fieldRate', factor: 1 },
  'T·m': { dimension: 'fieldLength', factor: 1 },
  '1': { dimension: 'dimensionless', factor: 1 },
  '—': { dimension: 'dimensionless', factor: 1 },
};

export const ANSWER_UNIT_OPTIONS: Record<string, string[]> = {
  m: ['m', 'cm', 'mm'],
  s: ['s', 'ms'],
  V: ['V', 'mV'],
  A: ['A', 'mA'],
  N: ['N', 'mN'],
  J: ['J', 'mJ'],
  W: ['W', 'mW'],
  T: ['T', 'mT'],
  Wb: ['Wb', 'mWb'],
  'm/s': ['m/s', 'cm/s'],
  'T/s': ['T/s'],
  'T·m': ['T·m'],
  '1': ['1'],
  '—': ['—'],
};

function convert(value: number, from: string, to: string): number | null {
  const source = UNIT_TABLE[from];
  const target = UNIT_TABLE[to];
  if (!source || !target || source.dimension !== target.dimension) return null;
  return (value * source.factor) / target.factor;
}

function format(value: number): string {
  if (Math.abs(value) >= 1e5 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) return value.toExponential(6);
  return String(Number(value.toPrecision(10)));
}

export function checkCaseAnswer(
  part: QuestionPart,
  raw: string,
  unit: string,
  model: WholeProblemModel,
): AnswerCheckResult {
  const spec = part.answerSpec;
  const observed = model.answers[spec.quantity]?.value ?? null;
  const changed = spec.dependsOn.some((key) => Math.abs((model.parameterValues[key] ?? 0) - (model.baselineValues[key] ?? 0)) > 1e-12);
  const recomputed = changed && observed !== null;
  const expected = changed ? observed : spec.baselineValue;
  const expectedUnit = spec.unit;
  const base = { expected, expectedUnit, observed, recomputed, normalized: null };

  if (!raw.trim()) {
    return { ...base, status: 'empty', message: '先输入数值或安全表达式，再检查答案。' };
  }
  const parsed = parseParameterExpression(raw);
  if (!parsed.ok) {
    return {
      ...base,
      status: 'invalid',
      message: `表达式无效：${parsed.message}`,
    };
  }
  const converted = convert(parsed.value, unit, expectedUnit);
  if (converted === null) {
    return {
      ...base,
      status: 'unit_error',
      message: `单位 ${unit} 与目标量 ${expectedUnit} 不属于同一量纲。`,
    };
  }
  if (expected === null) {
    return {
      ...base,
      status: 'needs_review',
      message: '当前参数下求解器没有给出唯一数值答案（可能被吸收、未命中或处于临界），请结合事件表判断。',
      normalized: parsed.normalized,
    };
  }
  const tolerance = Math.max(spec.tolerance.abs, spec.tolerance.rel * Math.abs(expected));
  if (Math.abs(converted - expected) <= tolerance) {
    return {
      ...base,
      status: 'correct',
      message: recomputed
        ? `正确；已按当前参数重新求解，目标值为 ${format(expected)} ${expectedUnit}。`
        : `正确；目标值为 ${format(expected)} ${expectedUnit}。`,
      normalized: parsed.normalized,
    };
  }
  return {
    ...base,
    status: 'incorrect',
    message: recomputed
      ? `还不对；当前参数下求解结果为 ${format(expected)} ${expectedUnit}，你输入的是 ${format(converted)} ${expectedUnit}。`
      : `还不对；正确答案是 ${format(expected)} ${expectedUnit}；请检查符号、单位与推导。`,
    normalized: parsed.normalized,
  };
}
