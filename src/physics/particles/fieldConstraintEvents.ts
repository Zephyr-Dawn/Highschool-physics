import {
  createCrossedFieldModel,
  crossedStateAt,
  type CrossedFieldInput,
  type CrossedFieldModel,
  type CrossedFieldState,
} from './crossedFields';
import type { Vec2 } from '../core/vec2';

/**
 * P08-A: forward target-line events for a static uniform E+B field.
 *
 * This module does not simulate a device: the target is an abstract line segment.
 * Roots are bracketed on analytic monotonic intervals (normal velocity zeros)
 * and refined by bisection. Render sampling never decides an event.
 */

export type TargetOrientation = 'vertical' | 'horizontal';
export type TargetDirection = 'any' | 'positive' | 'negative';

export interface TargetSegment {
  orientation: TargetOrientation;
  coordinate: number;
  min: number;
  max: number;
}

export interface ConstraintWindow {
  maxTimeS: number;
  arrivalMinS: number;
  arrivalMaxS: number;
  direction: TargetDirection;
  allowTangent: boolean;
}

export interface FieldConstraintInput extends CrossedFieldInput {
  target: TargetSegment;
  window: ConstraintWindow;
}

export type ConstraintEventKind = 'crossing' | 'tangent-touch' | 'start-on-target';
export type ConstraintEventDirection = 'positive' | 'negative' | 'zero';

export interface ConstraintEvent {
  index: number;
  kind: ConstraintEventKind;
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  normalVelocity: number;
  direction: ConstraintEventDirection;
  withinSegment: boolean;
  withinWindow: boolean;
  directionAccepted: boolean;
  accepted: boolean;
  branchIndex: number;
  residualM: number;
  flags: string[];
}

export type ConstraintStatus =
  | 'reachable'
  | 'tangent-only'
  | 'wrong-direction'
  | 'outside-segment'
  | 'outside-time-window'
  | 'no-reach'
  | 'degenerate-on-line'
  | 'solver-limited'
  | 'invalid';

export interface ConstraintSolution {
  input: FieldConstraintInput;
  model: CrossedFieldModel;
  events: ConstraintEvent[];
  acceptedEvents: ConstraintEvent[];
  tangentEvents: ConstraintEvent[];
  status: ConstraintStatus;
  issue: string | null;
  maxTimeS: number;
  stationaryTimesS: number[];
  solverLimited: boolean;
}

export interface FieldConstraintValidation {
  valid: boolean;
  input: FieldConstraintInput | null;
  issues: string[];
}

const B_EPS = 1e-12;
const Q_EPS = 1e-30;
const TIME_EPS = 1e-9;
const MAX_TIME_S = 60;
const MAX_CYCLES = 5000;
const MAX_EVENTS = 2000;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteVec(value: Vec2): boolean {
  return finite(value.x) && finite(value.y);
}

export function validateFieldConstraintInput(input: FieldConstraintInput): FieldConstraintValidation {
  const issues: string[] = [];
  for (const [label, value] of [
    ['m', input.massKg],
    ['q', input.chargeC],
    ['Ex', input.Ex],
    ['Ey', input.Ey],
    ['Bz', input.Bz],
    ['目标坐标', input.target.coordinate],
    ['目标范围下限', input.target.min],
    ['目标范围上限', input.target.max],
    ['时间窗上限', input.window.maxTimeS],
    ['到达时间下限', input.window.arrivalMinS],
    ['到达时间上限', input.window.arrivalMaxS],
  ] as const) {
    if (!finite(value)) issues.push(`${label} 必须是有限数值。`);
  }
  if (!finiteVec(input.initialPosition) || !finiteVec(input.initialVelocity)) {
    issues.push('初态位置/速度必须是有限数值。');
  }
  if (issues.length > 0) return { valid: false, input: null, issues };
  if (input.massKg <= 0) issues.push('质量 m 必须严格大于 0。');
  if (!['vertical', 'horizontal'].includes(input.target.orientation)) issues.push('未知的目标线段方向。');
  if (!(input.target.max >= input.target.min)) issues.push('目标线段需要 max ≥ min。');
  if (input.window.maxTimeS <= 0 || input.window.maxTimeS > MAX_TIME_S) {
    issues.push(`求解时间窗必须在 (0, ${MAX_TIME_S}] s 内。`);
  }
  if (input.window.arrivalMinS < 0) issues.push('到达时间下限不能为负。');
  if (!(input.window.arrivalMaxS >= input.window.arrivalMinS)) {
    issues.push('到达时间上限必须不小于下限。');
  }
  if (input.window.arrivalMaxS > input.window.maxTimeS + 1e-12) {
    issues.push('到达时间窗不能超过全局求解时间窗。');
  }
  if (!['any', 'positive', 'negative'].includes(input.window.direction)) {
    issues.push('未知的法向方向要求。');
  }
  if (typeof input.window.allowTangent !== 'boolean') issues.push('allowTangent 必须为布尔值。');
  if (Math.abs(input.Bz) > 100) issues.push('|Bz| 超出本模型的稳定计算范围（≤100 T）。');
  if (Math.abs(input.Ex) > 1e6 || Math.abs(input.Ey) > 1e6) issues.push('|E| 超出稳定计算范围。');
  if (input.massKg < 1e-12 || input.massKg > 1e6) issues.push('质量超出稳定计算范围。');
  if (Math.abs(input.chargeC) > 1e6) issues.push('电荷量超出稳定计算范围。');
  if (Math.abs(input.initialVelocity.x) > 1e7 || Math.abs(input.initialVelocity.y) > 1e7) {
    issues.push('初速度超出稳定计算范围。');
  }
  if (issues.length > 0) return { valid: false, input: null, issues };
  return {
    valid: true,
    input: {
      ...input,
      initialPosition: { ...input.initialPosition },
      initialVelocity: { ...input.initialVelocity },
      target: { ...input.target },
      window: { ...input.window },
    },
    issues: [],
  };
}

function normalValue(position: Vec2, target: TargetSegment): number {
  return target.orientation === 'vertical' ? position.x : position.y;
}

function perpendicularValue(position: Vec2, target: TargetSegment): number {
  return target.orientation === 'vertical' ? position.y : position.x;
}

function normalVelocityValue(state: CrossedFieldState, target: TargetSegment): number {
  return target.orientation === 'vertical' ? state.velocity.x : state.velocity.y;
}

export function constraintPointAt(input: FieldConstraintInput, timeS: number): CrossedFieldState {
  const model = createCrossedFieldModel(input);
  return crossedStateAt(model, timeS);
}

interface StationaryTimes {
  times: number[];
  solverLimited: boolean;
}

function stationaryTimes(input: FieldConstraintInput): StationaryTimes {
  const target = input.target;
  const q = input.chargeC;
  const m = input.massKg;
  const maxT = input.window.maxTimeS;
  const v0n = target.orientation === 'vertical' ? input.initialVelocity.x : input.initialVelocity.y;
  const an = q * (target.orientation === 'vertical' ? input.Ex : input.Ey) / m;
  if (Math.abs(input.Bz) <= B_EPS || Math.abs(q) <= Q_EPS) {
    if (Math.abs(an) > 1e-14) {
      const root = -v0n / an;
      if (root > TIME_EPS && root < maxT - TIME_EPS) {
        return { times: [root], solverLimited: false };
      }
    }
    return { times: [], solverLimited: false };
  }
  const omega = -(q * input.Bz) / m;
  if (Math.abs(omega) <= 1e-12) {
    if (Math.abs(an) > 1e-14) {
      const root = -v0n / an;
      if (root > TIME_EPS && root < maxT - TIME_EPS) return { times: [root], solverLimited: false };
    }
    return { times: [], solverLimited: false };
  }
  const cycles = (Math.abs(omega) * maxT) / (2 * Math.PI);
  if (cycles > MAX_CYCLES) return { times: [], solverLimited: true };
  const drift = {
    x: input.Ey / input.Bz,
    y: -input.Ex / input.Bz,
  };
  const w = {
    x: input.initialVelocity.x - drift.x,
    y: input.initialVelocity.y - drift.y,
  };
  const amplitude = Math.hypot(w.x, w.y);
  if (amplitude <= 1e-14) return { times: [], solverLimited: false };
  const phi = Math.atan2(w.y, w.x);
  const driftN = target.orientation === 'vertical' ? drift.x : drift.y;
  const ratio = -driftN / amplitude;
  if (Math.abs(ratio) > 1 + 1e-12) return { times: [], solverLimited: false };
  const cosine = Math.max(-1, Math.min(1, ratio));
  const bases = target.orientation === 'vertical'
    ? [Math.acos(cosine), -Math.acos(cosine)]
    : [Math.asin(cosine), Math.PI - Math.asin(cosine)];
  const kMax = Math.ceil(cycles) + 2;
  const times: number[] = [];
  for (let k = -kMax; k <= kMax; k++) {
    for (const base of bases) {
      const u = base + 2 * Math.PI * k;
      const t = (u - phi) / omega;
      if (t > TIME_EPS && t < maxT - TIME_EPS) times.push(t);
    }
  }
  times.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const time of times) {
    if (unique.length === 0 || Math.abs(time - unique[unique.length - 1]) > 1e-8 * Math.max(1, maxT)) {
      unique.push(time);
    }
  }
  return { times: unique, solverLimited: false };
}

function bisect(
  low: number,
  high: number,
  f: (t: number) => number,
  timeTol: number,
): number {
  let a = low;
  let b = high;
  let fa = f(a);
  for (let iteration = 0; iteration < 100; iteration++) {
    const mid = (a + b) / 2;
    const fm = f(mid);
    if (Math.abs(fm) <= 1e-14 * Math.max(1, Math.abs(mid)) || b - a <= timeTol) return mid;
    if ((fa <= 0 && fm >= 0) || (fa >= 0 && fm <= 0)) {
      b = mid;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

function constantNormalMotion(
  input: FieldConstraintInput,
  velocityTol: number,
): boolean {
  const target = input.target;
  const v0n = target.orientation === 'vertical' ? input.initialVelocity.x : input.initialVelocity.y;
  const an = input.chargeC * (target.orientation === 'vertical' ? input.Ex : input.Ey) / input.massKg;
  if (Math.abs(input.Bz) <= B_EPS || Math.abs(input.chargeC) <= Q_EPS) {
    return Math.abs(v0n) <= velocityTol && Math.abs(an) <= velocityTol;
  }
  const omega = -(input.chargeC * input.Bz) / input.massKg;
  if (Math.abs(omega) <= 1e-12) {
    return Math.abs(v0n) <= velocityTol && Math.abs(an) <= velocityTol;
  }
  const drift = { x: input.Ey / input.Bz, y: -input.Ex / input.Bz };
  const w = {
    x: input.initialVelocity.x - drift.x,
    y: input.initialVelocity.y - drift.y,
  };
  const amplitude = Math.hypot(w.x, w.y);
  const driftN = target.orientation === 'vertical' ? drift.x : drift.y;
  return amplitude <= velocityTol && Math.abs(driftN) <= velocityTol;
}

export function solveFieldConstraint(inputValue: FieldConstraintInput): ConstraintSolution {
  const validation = validateFieldConstraintInput(inputValue);
  if (!validation.valid || !validation.input) {
    const fallback: FieldConstraintInput = {
      massKg: 1,
      chargeC: 1,
      Ex: 0,
      Ey: 0,
      Bz: 0,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 1, y: 0 },
      target: { orientation: 'vertical', coordinate: 1, min: -1, max: 1 },
      window: {
        maxTimeS: 1,
        arrivalMinS: 0,
        arrivalMaxS: 1,
        direction: 'any',
        allowTangent: false,
      },
    };
    const model = createCrossedFieldModel(fallback);
    return {
      input: fallback,
      model,
      events: [],
      acceptedEvents: [],
      tangentEvents: [],
      status: 'invalid',
      issue: validation.issues.join(' '),
      maxTimeS: 1,
      stationaryTimesS: [],
      solverLimited: false,
    };
  }
  const input = validation.input;
  const target = input.target;
  const maxT = input.window.maxTimeS;
  const model = createCrossedFieldModel(input);
  const timeTol = 1e-9 * Math.max(1, maxT);
  const scale = Math.max(1, Math.abs(target.coordinate), Math.abs(input.initialPosition.x), Math.abs(input.initialPosition.y));
  const positionTol = 1e-8 * scale;
  const speedScale = Math.max(
    1,
    Math.hypot(input.initialVelocity.x, input.initialVelocity.y),
    Math.abs(input.Bz) > B_EPS ? Math.hypot(input.Ey / input.Bz, -input.Ex / input.Bz) : 0,
  );
  const velocityTol = 1e-8 * speedScale;
  const f = (t: number) => {
    const state = crossedStateAt(model, t);
    return normalValue(state.position, target) - target.coordinate;
  };

  if (constantNormalMotion(input, velocityTol)) {
    const f0 = f(0);
    const onLine = Math.abs(f0) <= positionTol;
    return {
      input,
      model,
      events: [],
      acceptedEvents: [],
      tangentEvents: [],
      status: onLine ? 'degenerate-on-line' : 'no-reach',
      issue: onLine
        ? '轨迹始终位于目标线所在平面；没有孤立穿越事件。'
        : '法向位置保持不变，轨迹不会到达目标平面。',
      maxTimeS: maxT,
      stationaryTimesS: [],
      solverLimited: false,
    };
  }

  const stationary = stationaryTimes(input);
  if (stationary.solverLimited) {
    return {
      input,
      model,
      events: [],
      acceptedEvents: [],
      tangentEvents: [],
      status: 'solver-limited',
      issue: '回旋次数超过求解预算；提高时间窗会显著增加事件数量。',
      maxTimeS: maxT,
      stationaryTimesS: [],
      solverLimited: true,
    };
  }

  const breakpoints = [0, ...stationary.times, maxT]
    .filter((time, index, array) => index === 0 || time > array[index - 1] + TIME_EPS)
    .map((time) => Math.max(0, Math.min(maxT, time)));
  const roots: number[] = [];
  const addRoot = (time: number) => {
    if (time <= TIME_EPS - 1e-12) return;
    if (roots.some((existing) => Math.abs(existing - time) <= 1e-8 * Math.max(1, maxT))) return;
    roots.push(time);
  };
  for (let index = 0; index < breakpoints.length - 1; index++) {
    const a = breakpoints[index];
    const b = breakpoints[index + 1];
    if (b - a <= 1e-14) continue;
    const fa = f(a);
    const fb = f(b);
    if (Math.abs(fa) <= positionTol) addRoot(a);
    if (Math.abs(fb) <= positionTol) addRoot(b);
    if (fa * fb < 0) addRoot(bisect(a, b, f, timeTol));
  }

  const startOnLine = Math.abs(f(0)) <= positionTol;

  const delta = Math.max(1e-7, 1e-6 * maxT);
  const events: ConstraintEvent[] = [];
  if (startOnLine) {
    const state = crossedStateAt(model, 0);
    const vn = normalVelocityValue(state, target);
    const direction = vn > velocityTol ? 'positive' : vn < -velocityTol ? 'negative' : 'zero';
    events.push({
      index: 0,
      kind: 'start-on-target',
      timeS: 0,
      position: { ...state.position },
      velocity: { ...state.velocity },
      normalVelocity: vn,
      direction,
      withinSegment: perpendicularValue(state.position, target) >= target.min - positionTol
        && perpendicularValue(state.position, target) <= target.max + positionTol,
      withinWindow: true,
      directionAccepted: input.window.direction === 'any'
        || (input.window.direction === 'positive' && direction === 'positive')
        || (input.window.direction === 'negative' && direction === 'negative'),
      accepted: false,
      branchIndex: 0,
      residualM: f(0),
      flags: ['start-at-target'],
    });
  }
  for (const time of roots.sort((a, b) => a - b)) {
    const state = crossedStateAt(model, time);
    const vn = normalVelocityValue(state, target);
    const before = f(Math.max(0, time - delta));
    const after = f(Math.min(maxT, time + delta));
    const signChange = before * after < 0;
    const kind: ConstraintEventKind = Math.abs(vn) <= velocityTol && !signChange
      ? 'tangent-touch'
      : 'crossing';
    const direction = vn > velocityTol ? 'positive' : vn < -velocityTol ? 'negative' : 'zero';
    const perp = perpendicularValue(state.position, target);
    const withinSegment = perp >= target.min - positionTol && perp <= target.max + positionTol;
    const withinWindow = time >= input.window.arrivalMinS - timeTol
      && time <= input.window.arrivalMaxS + timeTol;
    const directionAccepted = input.window.direction === 'any'
      || (input.window.direction === 'positive' && direction === 'positive')
      || (input.window.direction === 'negative' && direction === 'negative');
    const accepted = (kind === 'crossing' || (kind === 'tangent-touch' && input.window.allowTangent))
      && withinSegment
      && withinWindow
      && directionAccepted;
    const flags: string[] = [];
    if (kind === 'tangent-touch') flags.push('tangent');
    if (!withinSegment) flags.push('outside-segment');
    if (!withinWindow) flags.push('outside-window');
    if (!directionAccepted) flags.push('wrong-direction');
    events.push({
      index: events.length,
      kind,
      timeS: time,
      position: { ...state.position },
      velocity: { ...state.velocity },
      normalVelocity: vn,
      direction,
      withinSegment,
      withinWindow,
      directionAccepted,
      accepted,
      branchIndex: events.length,
      residualM: f(time),
      flags,
    });
    if (events.length > MAX_EVENTS) break;
  }

  const acceptedEvents = events.filter((event) => event.accepted);
  const tangentEvents = events.filter((event) => event.kind === 'tangent-touch');
  let status: ConstraintStatus = 'no-reach';
  let issue: string | null = null;
  if (acceptedEvents.length > 0) {
    status = 'reachable';
  } else if (tangentEvents.some((event) => event.withinSegment && event.withinWindow)) {
    status = 'tangent-only';
    issue = input.window.allowTangent
      ? '只存在相切接触，且它不被当作有向穿越。'
      : '只存在相切接触；当前约束不接受相切为成功穿越。';
  } else if (events.some((event) => event.kind === 'crossing' && !event.withinSegment)) {
    status = 'outside-segment';
    issue = '交点位于目标线段之外。';
  } else if (events.some((event) => event.kind === 'crossing' && !event.withinWindow)) {
    status = 'outside-time-window';
    issue = '交点存在，但不在允许的到达时间窗内。';
  } else if (events.some((event) => event.kind === 'crossing' && !event.directionAccepted)) {
    status = 'wrong-direction';
    issue = '交点存在，但法向速度方向不符合要求。';
  } else if (events.length === 0) {
    status = 'no-reach';
    issue = '时间窗内轨迹没有到达目标平面。';
  } else {
    status = 'no-reach';
  }
  const solverLimited = events.length > MAX_EVENTS;
  return {
    input,
    model,
    events,
    acceptedEvents,
    tangentEvents,
    status: solverLimited ? 'solver-limited' : status,
    issue: solverLimited ? '事件数量超过上限；结果被截断。' : issue,
    maxTimeS: maxT,
    stationaryTimesS: stationary.times,
    solverLimited,
  };
}
