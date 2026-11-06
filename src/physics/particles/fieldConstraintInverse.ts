import {
  solveFieldConstraint,
  validateFieldConstraintInput,
  type ConstraintEvent,
  type ConstraintSolution,
  type FieldConstraintInput,
  type TargetSegment,
} from './fieldConstraintEvents';

/**
 * P08-B: single-parameter inverse search.
 *
 * Every candidate is re-inserted into the same forward engine before it is
 * reported as confirmed. A scan that finds no sign change reports
 * "not-found-within-search"; it never claims a mathematical impossibility.
 */

export type InverseParameter = 'Ey' | 'Bz' | 'v0x' | 'v0y';

export interface InverseRequest {
  base: FieldConstraintInput;
  parameter: InverseParameter;
  min: number;
  max: number;
  /** y target for a vertical line, x target for a horizontal line. */
  targetNormalCoordinate: number;
  scanPoints?: number;
  maxCandidates?: number;
  residualToleranceM?: number;
}

export type InverseCandidateStatus = 'confirmed' | 'uncertain' | 'tangent-critical' | 'failed-revalidation';

export interface InverseCandidate {
  parameterValue: number;
  residualM: number;
  eventTimeS: number;
  eventPosition: { x: number; y: number };
  normalVelocity: number;
  status: InverseCandidateStatus;
  branchIndex: number;
  note: string;
}

export type InverseStatus = 'solved' | 'boundary-only' | 'not-found-within-search' | 'invalid' | 'solver-limited';

export interface InverseScanPoint {
  parameterValue: number;
  residualM: number | null;
}

export interface InverseSolution {
  request: InverseRequest;
  candidates: InverseCandidate[];
  status: InverseStatus;
  issue: string | null;
  evaluations: number;
  confirmedCount: number;
  invalidIntervals: number;
  scan: InverseScanPoint[];
}

const DEFAULT_SCAN_POINTS = 241;
const MIN_SCAN_POINTS = 41;
const MAX_SCAN_POINTS = 801;
const DEFAULT_MAX_CANDIDATES = 8;
const MAX_EVALUATIONS = 30000;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function applyInverseParameter(
  base: FieldConstraintInput,
  parameter: InverseParameter,
  value: number,
): FieldConstraintInput {
  const next: FieldConstraintInput = {
    ...base,
    initialPosition: { ...base.initialPosition },
    initialVelocity: { ...base.initialVelocity },
    target: { ...base.target },
    window: { ...base.window },
  };
  if (parameter === 'Ey') next.Ey = value;
  else if (parameter === 'Bz') next.Bz = value;
  else if (parameter === 'v0x') next.initialVelocity = { ...next.initialVelocity, x: value };
  else next.initialVelocity = { ...next.initialVelocity, y: value };
  return next;
}

function perpendicularCoordinate(event: ConstraintEvent, target: TargetSegment): number {
  return target.orientation === 'vertical' ? event.position.y : event.position.x;
}

interface Evaluation {
  parameterValue: number;
  residualM: number;
  event: ConstraintEvent;
  solution: ConstraintSolution;
}

type EvaluationOutcome =
  | { kind: 'ok'; value: Evaluation }
  | { kind: 'no-event' }
  | { kind: 'solver-limited' };

function evaluate(
  request: InverseRequest,
  parameterValue: number,
  targetNormalCoordinate: number,
  counter: { count: number },
): EvaluationOutcome {
  counter.count += 1;
  if (counter.count > MAX_EVALUATIONS) return { kind: 'solver-limited' };
  const input = applyInverseParameter(request.base, request.parameter, parameterValue);
  const solution = solveFieldConstraint(input);
  if (solution.status === 'invalid') return { kind: 'no-event' };
  if (solution.status === 'solver-limited') return { kind: 'solver-limited' };
  const event = solution.events.find(
    (item) => item.kind === 'crossing' && item.direction === 'positive' && item.timeS > 1e-9,
  );
  if (!event) return { kind: 'no-event' };
  const perpendicular = perpendicularCoordinate(event, input.target);
  return {
    kind: 'ok',
    value: {
      parameterValue,
      residualM: perpendicular - targetNormalCoordinate,
      event,
      solution,
    },
  };
}

function validateRequest(request: InverseRequest): { valid: boolean; issues: string[]; scanPoints: number; maxCandidates: number; tolerance: number } {
  const issues: string[] = [];
  const baseValidation = validateFieldConstraintInput(request.base);
  issues.push(...baseValidation.issues);
  if (!finite(request.min) || !finite(request.max)) issues.push('反求区间端点必须是有限数值。');
  else if (!(request.max > request.min)) issues.push('反求区间必须满足 max > min。');
  if (!finite(request.targetNormalCoordinate)) issues.push('反求目标坐标必须是有限数值。');
  const scanPoints = request.scanPoints ?? DEFAULT_SCAN_POINTS;
  if (!Number.isInteger(scanPoints) || scanPoints < MIN_SCAN_POINTS || scanPoints > MAX_SCAN_POINTS) {
    issues.push(`扫描点数必须为 ${MIN_SCAN_POINTS}–${MAX_SCAN_POINTS} 的整数。`);
  }
  const maxCandidates = request.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > DEFAULT_MAX_CANDIDATES) {
    issues.push(`候选上限必须为 1–${DEFAULT_MAX_CANDIDATES} 的整数。`);
  }
  const tolerance = request.residualToleranceM ?? 1e-7;
  if (!finite(tolerance) || tolerance <= 0 || tolerance > 1) {
    issues.push('残差容差必须在 (0,1] m 内。');
  }
  return { valid: issues.length === 0, issues, scanPoints, maxCandidates, tolerance };
}

function candidateKey(value: number, min: number, max: number): number {
  return Math.round(((value - min) / Math.max(1e-12, max - min)) * 1e9);
}

function addCandidate(
  list: InverseCandidate[],
  candidate: InverseCandidate,
  maxCandidates: number,
  min: number,
  max: number,
): void {
  const key = candidateKey(candidate.parameterValue, min, max);
  const existing = list.findIndex((item) => candidateKey(item.parameterValue, min, max) === key);
  if (existing >= 0) {
    const current = list[existing];
    const priority: Record<InverseCandidateStatus, number> = {
      confirmed: 4,
      'tangent-critical': 3,
      uncertain: 2,
      'failed-revalidation': 1,
    };
    if (priority[candidate.status] > priority[current.status]) list[existing] = candidate;
    return;
  }
  if (list.length < maxCandidates) list.push(candidate);
}

export function solveFieldConstraintInverse(request: InverseRequest): InverseSolution {
  const validation = validateRequest(request);
  if (!validation.valid) {
    return {
      request,
      candidates: [],
      status: 'invalid',
      issue: validation.issues.join(' '),
      evaluations: 0,
      confirmedCount: 0,
      invalidIntervals: 0,
      scan: [],
    };
  }
  const { scanPoints, maxCandidates, tolerance } = validation;
  const counter = { count: 0 };
  const min = request.min;
  const max = request.max;
  const step = (max - min) / (scanPoints - 1);
  const values: number[] = [];
  const evaluations: Array<Evaluation | null> = [];
  let invalidIntervals = 0;
  let solverLimited = false;

  for (let index = 0; index < scanPoints; index++) {
    const value = index === scanPoints - 1 ? max : min + step * index;
    values.push(value);
    const outcome = evaluate(request, value, request.targetNormalCoordinate, counter);
    if (outcome.kind === 'ok') evaluations.push(outcome.value);
    else {
      evaluations.push(null);
      if (outcome.kind === 'solver-limited') solverLimited = true;
    }
  }

  const candidates: InverseCandidate[] = [];
  const nearZero = (value: number) => Math.abs(value) <= tolerance;

  // Adjacent valid samples with a sign change are bracketed in parameter space.
  for (let index = 0; index < scanPoints - 1; index++) {
    const left = evaluations[index];
    const right = evaluations[index + 1];
    if (!left || !right) {
      if ((left && !right) || (!left && right)) invalidIntervals += 1;
      continue;
    }
    if (nearZero(left.residualM)) {
      addCandidate(candidates, {
        parameterValue: left.parameterValue,
        residualM: left.residualM,
        eventTimeS: left.event.timeS,
        eventPosition: { ...left.event.position },
        normalVelocity: left.event.normalVelocity,
        status: 'confirmed',
        branchIndex: left.event.branchIndex,
        note: '扫描点本身满足残差容差。',
      }, maxCandidates, min, max);
      continue;
    }
    if (left.residualM * right.residualM > 0) continue;
    let pLow = left.parameterValue;
    let pHigh = right.parameterValue;
    let rLow = left.residualM;
    let tLow = left.event.timeS;
    let tHigh = right.event.timeS;
    let failed = false;
    let midValue = (pLow + pHigh) / 2;
    let midEvaluation: Evaluation | null = null;
    for (let iteration = 0; iteration < 90; iteration++) {
      midValue = (pLow + pHigh) / 2;
      const outcome = evaluate(request, midValue, request.targetNormalCoordinate, counter);
      if (outcome.kind !== 'ok') {
        failed = true;
        break;
      }
      midEvaluation = outcome.value;
      const expectedTime = (tLow + tHigh) / 2;
      const timeSpan = Math.max(1e-3, Math.abs(tHigh - tLow) * 2);
      if (Math.abs(midEvaluation.event.timeS - expectedTime) > timeSpan + 0.05) {
        failed = true;
        break;
      }
      if (nearZero(midEvaluation.residualM)) break;
      if (midEvaluation.residualM * rLow > 0) {
        pLow = midValue;
        rLow = midEvaluation.residualM;
        tLow = midEvaluation.event.timeS;
      } else {
        pHigh = midValue;
        tHigh = midEvaluation.event.timeS;
      }
    }
    if (!midEvaluation) continue;
    const forward = solveFieldConstraint(applyInverseParameter(request.base, request.parameter, midValue));
    const revalidated = forward.events.find(
      (item) => item.kind === 'crossing' && item.direction === 'positive' && item.timeS > 1e-9,
    );
    const revalidatedPerp = revalidated
      ? perpendicularCoordinate(revalidated, forward.input.target)
      : Number.NaN;
    const residual = Number.isFinite(revalidatedPerp)
      ? revalidatedPerp - request.targetNormalCoordinate
      : midEvaluation.residualM;
    if (!failed && Math.abs(residual) <= tolerance) {
      addCandidate(candidates, {
        parameterValue: midValue,
        residualM: residual,
        eventTimeS: midEvaluation.event.timeS,
        eventPosition: { ...midEvaluation.event.position },
        normalVelocity: midEvaluation.event.normalVelocity,
        status: 'confirmed',
        branchIndex: midEvaluation.event.branchIndex,
        note: `参数区间 [${left.parameterValue.toExponential(4)}, ${right.parameterValue.toExponential(4)}] 内的正向复核根。`,
      }, maxCandidates, min, max);
    } else if (Math.abs(residual) <= Math.max(1e-3, tolerance * 1000)) {
      addCandidate(candidates, {
        parameterValue: midValue,
        residualM: residual,
        eventTimeS: midEvaluation.event.timeS,
        eventPosition: { ...midEvaluation.event.position },
        normalVelocity: midEvaluation.event.normalVelocity,
        status: failed ? 'uncertain' : 'failed-revalidation',
        branchIndex: midEvaluation.event.branchIndex,
        note: failed
          ? '事件分支在参数区间内发生切换，未能确认连续根。'
          : '残差接近容差但正向复核未达到精度。',
      }, maxCandidates, min, max);
    }
  }

  // A valid→invalid transition can be a physical tangent limit, not a root.
  const criticalTolerance = Math.max(1e-6, tolerance * 10);
  for (let index = 0; index < scanPoints - 1; index++) {
    const left = evaluations[index];
    const right = evaluations[index + 1];
    if ((left && !right) || (!left && right)) {
      const valid = left ?? right;
      const invalidValue = left ? values[index + 1] : values[index];
      if (!valid) continue;
      let pValid = valid.parameterValue;
      let pInvalid = invalidValue;
      const validInside = (value: number) => {
        const outcome = evaluate(request, value, request.targetNormalCoordinate, counter);
        return outcome.kind === 'ok';
      };
      for (let iteration = 0; iteration < 60; iteration++) {
        const mid = (pValid + pInvalid) / 2;
        if (validInside(mid)) pValid = mid;
        else pInvalid = mid;
      }
      const criticalInput = applyInverseParameter(request.base, request.parameter, pValid);
      const criticalSolution = solveFieldConstraint(criticalInput);
      const tangent = criticalSolution.tangentEvents.find((event) => {
        const perpendicular = perpendicularCoordinate(event, criticalInput.target);
        return event.withinSegment
          && event.withinWindow
          && Math.abs(perpendicular - request.targetNormalCoordinate) <= Math.max(criticalTolerance, 1e-5);
      });
      if (tangent) {
        const perpendicular = perpendicularCoordinate(tangent, criticalInput.target);
        addCandidate(candidates, {
          parameterValue: pValid,
          residualM: perpendicular - request.targetNormalCoordinate,
          eventTimeS: tangent.timeS,
          eventPosition: { ...tangent.position },
          normalVelocity: tangent.normalVelocity,
          status: 'tangent-critical',
          branchIndex: tangent.branchIndex,
          note: '有效穿越区间端点：该参数只达到相切临界，不是常规穿越根。',
        }, maxCandidates, min, max);
      }
    }
  }

  // A continuum of zero residuals must not be reported as eight separate roots.
  let zeroRun = 0;
  let zeroRunStart = -1;
  let zeroRunLength = 0;
  for (let index = 0; index < scanPoints; index++) {
    const evaluation = evaluations[index];
    if (evaluation && Math.abs(evaluation.residualM) <= tolerance) {
      if (zeroRun === 0) zeroRunStart = index;
      zeroRun += 1;
      zeroRunLength = Math.max(zeroRunLength, zeroRun);
    } else {
      zeroRun = 0;
    }
  }
  if (zeroRunLength >= Math.max(5, Math.floor(scanPoints * 0.1))) {
    const middle = Math.min(scanPoints - 1, zeroRunStart + Math.floor(zeroRunLength / 2));
    const evaluation = evaluations[middle];
    if (evaluation) {
      addCandidate(candidates, {
        parameterValue: evaluation.parameterValue,
        residualM: evaluation.residualM,
        eventTimeS: evaluation.event.timeS,
        eventPosition: { ...evaluation.event.position },
        normalVelocity: evaluation.event.normalVelocity,
        status: 'uncertain',
        branchIndex: evaluation.event.branchIndex,
        note: '该参数区间存在连续零残差，不能把多解压缩为唯一答案。',
      }, maxCandidates, min, max);
    }
  }

  const confirmed = candidates.filter((item) => item.status === 'confirmed');
  const critical = candidates.filter((item) => item.status === 'tangent-critical');
  const status: InverseStatus = confirmed.length > 0
    ? 'solved'
    : critical.length > 0
      ? 'boundary-only'
      : solverLimited
        ? 'solver-limited'
        : 'not-found-within-search';
  return {
    request,
    candidates: candidates.sort((a, b) => a.parameterValue - b.parameterValue),
    status,
    issue: status === 'solved'
      ? null
      : status === 'boundary-only'
        ? '只找到相切临界参数，没有常规穿越根。'
        : status === 'solver-limited'
          ? '求解预算耗尽；结果可能不完整。'
          : '在给定扫描区间和精度内没有确认根；这不是数学上无解的证明。',
    evaluations: counter.count,
    confirmedCount: confirmed.length,
    invalidIntervals,
    scan: values.map((parameterValue, index) => ({
      parameterValue,
      residualM: evaluations[index]?.residualM ?? null,
    })),
  };
}
