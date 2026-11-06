/**
 * I07: rigid rectangular loop crossing two static magnetic strips in opposite
 * directions, with an optional ideal right-hand wall.
 *
 * Conventions (same as I01/I03/I05):
 * - +z out of the page; Bz>0 is drawn as dots.
 * - Positive current is counter-clockwise seen from +z.
 * - Loop left edge is x; right edge is x+w.
 * - ell_j(x) = overlap of [x,x+w] with [aj,bj].
 * - Phi = h*(B1*ell1 + B2*ell2), Psi=N*Phi.
 * - S = B1*g1 + B2*g2 with gj = 1(right edge inside) - 1(left edge inside).
 * - emf=-N*h*S*v; I=emf/R; F_Bx=N*I*h*S; P_J=I^2 R.
 *
 * Dynamics in a fixed-S interval: m dv/dt = F_ext - k v, k=(N h S)^2/R.
 * The solution uses the exact exponential integral, not a rendered animation.
 */

export type I07Mode = 'prescribed' | 'free' | 'forces' | 'manual-x';
export type I07Status =
  | 'ok'
  | 'wall-stop'
  | 'wall-held'
  | 'event-limited'
  | 'solver-limited'
  | 'invalid';

export interface I07Params {
  mode: I07Mode;
  turns: number;
  heightM: number;
  widthM: number;
  massKg: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  field1LeftM: number;
  field1RightM: number;
  field1Bz: number;
  field2LeftM: number;
  field2RightM: number;
  field2Bz: number;
  startXM: number;
  initialSpeedMps: number;
  externalForceN: number;
  durationS: number;
  wallEnabled: boolean;
  wallXM: number;
  restitution: number;
}

export interface I07Cumulative {
  jouleHeatJ: number;
  externalWorkJ: number;
  impactLossJ: number;
}

export interface I07Snapshot {
  timeS: number;
  xM: number;
  velocityMps: number;
  overlap1M: number;
  overlap2M: number;
  fluxWb: number;
  linkageWbTurn: number;
  S: number;
  g1: -1 | 0 | 1;
  g2: -1 | 0 | 1;
  SLeft: number;
  SRight: number;
  slopeOneSided: boolean;
  emfV: number;
  currentA: number | null;
  magneticForceN: number | null;
  magneticMechanicalPowerW: number | null;
  joulePowerW: number | null;
  kineticEnergyJ: number;
  jouleHeatJ: number;
  externalWorkJ: number;
  impactLossJ: number;
  energyResidualJ: number | null;
  wallGapM: number | null;
  status: 'active' | 'open-circuit' | 'at-boundary' | 'wall-held' | 'wall-stop';
  eventFlags: string[];
  approximation?: string;
  issue?: string;
}

export type I07EventKind =
  | 'start'
  | 'geometry'
  | 'turning'
  | 'wall-bounce'
  | 'wall-stop'
  | 'wall-held'
  | 'end';

export interface I07Event {
  kind: I07EventKind;
  timeS: number;
  label: string;
  xM: number;
  velocityBeforeMps: number;
  velocityAfterMps: number;
  boundaryIds: string[];
  impactLossJ: number;
}

export interface I07Segment {
  startTimeS: number;
  endTimeS: number;
  x0M: number;
  v0Mps: number;
  x1M: number;
  v1Mps: number;
  S: number;
  k: number;
  externalForceN: number;
  prescribed: boolean;
  jouleHeatStartJ: number;
  externalWorkStartJ: number;
  impactLossStartJ: number;
  endKind: I07EventKind | 'end';
}

export interface I07Solution {
  params: I07Params;
  initial: I07Snapshot;
  final: I07Snapshot;
  samples: I07Snapshot[];
  events: I07Event[];
  segments: I07Segment[];
  keyTimesS: number[];
  durationS: number;
  status: I07Status;
  issue: string | null;
  totalImpactLossJ: number;
  bounceCount: number;
}

export interface I07Validation {
  valid: boolean;
  params: I07Params | null;
  issues: string[];
}

export interface I07EdgeSum {
  S: number;
  SLeft: number;
  SRight: number;
  g1: -1 | 0 | 1;
  g2: -1 | 0 | 1;
  oneSided: boolean;
}

export const I07_DEFAULT: I07Params = {
  mode: 'prescribed',
  turns: 1,
  heightM: 1,
  widthM: 1,
  massKg: 1,
  resistanceOhm: 1,
  circuitClosed: true,
  field1LeftM: 0,
  field1RightM: 1,
  field1Bz: 1,
  field2LeftM: 1,
  field2RightM: 2,
  field2Bz: -1,
  startXM: -0.5,
  initialSpeedMps: 2,
  externalForceN: 0,
  durationS: 2.5,
  wallEnabled: false,
  wallXM: 10,
  restitution: 1,
};

const THRESHOLD_TOL = 1e-10;
const TIME_EPS = 1e-12;
const ROOT_TIME_EPS = 1e-9;
const START_NEAR_TOL = 1e-7;
const MAX_DURATION_S = 60;
const MAX_EVENTS = 400;
const MAX_TURNS = 1000;
const SAMPLE_TARGET = 640;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function near(value: number, target: number): boolean {
  return Math.abs(value - target) <= THRESHOLD_TOL * Math.max(1, Math.abs(value), Math.abs(target));
}

export function i07WallLimit(params: Pick<I07Params, 'wallEnabled' | 'wallXM' | 'widthM'>): number | null {
  if (!params.wallEnabled) return null;
  return params.wallXM - params.widthM;
}

export function i07GeometryThresholds(params: I07Params): Array<{
  value: number;
  id: string;
  edge: 'left' | 'right';
}> {
  const w = params.widthM;
  return [
    { value: params.field1LeftM, id: 'left-a1', edge: 'left' },
    { value: params.field1RightM, id: 'left-b1', edge: 'left' },
    { value: params.field2LeftM, id: 'left-a2', edge: 'left' },
    { value: params.field2RightM, id: 'left-b2', edge: 'left' },
    { value: params.field1LeftM - w, id: 'right-a1', edge: 'right' },
    { value: params.field1RightM - w, id: 'right-b1', edge: 'right' },
    { value: params.field2LeftM - w, id: 'right-a2', edge: 'right' },
    { value: params.field2RightM - w, id: 'right-b2', edge: 'right' },
  ];
}

export function validateI07Params(input: I07Params): I07Validation {
  const issues: string[] = [];
  const numeric: Array<[string, unknown]> = [
    ['N', input.turns],
    ['h', input.heightM],
    ['w', input.widthM],
    ['m', input.massKg],
    ['R', input.resistanceOhm],
    ['a₁', input.field1LeftM],
    ['b₁', input.field1RightM],
    ['B₁', input.field1Bz],
    ['a₂', input.field2LeftM],
    ['b₂', input.field2RightM],
    ['B₂', input.field2Bz],
    ['x₀', input.startXM],
    ['v₀', input.initialSpeedMps],
    ['F_ext', input.externalForceN],
    ['时长', input.durationS],
    ['x_wall', input.wallXM],
    ['恢复系数', input.restitution],
  ];
  for (const [label, value] of numeric) {
    if (!finite(value)) issues.push(`${label} 必须是有限数值。`);
  }
  if (issues.length > 0) return { valid: false, params: null, issues };
  if (!['prescribed', 'free', 'forces', 'manual-x'].includes(input.mode)) {
    issues.push('未知的 I07 模式。');
  }
  if (input.heightM <= 0) issues.push('线框高度 h 必须严格大于 0。');
  if (input.widthM <= 0) issues.push('线框宽度 w 必须严格大于 0。');
  if (input.massKg <= 0) issues.push('线框质量 m 必须严格大于 0。');
  if (input.resistanceOhm <= 0) issues.push('回路总电阻 R 必须严格大于 0。');
  if (!Number.isInteger(input.turns) || input.turns < 1 || input.turns > MAX_TURNS) {
    issues.push(`匝数 N 必须为 1–${MAX_TURNS} 的整数。`);
  }
  if (!(input.field1RightM > input.field1LeftM)) {
    issues.push('B₁ 区右边界必须严格大于左边界。');
  }
  if (!(input.field2RightM > input.field2LeftM)) {
    issues.push('B₂ 区右边界必须严格大于左边界。');
  }
  if (!(input.field2LeftM >= input.field1RightM)) {
    issues.push('两磁区不得重叠：需要 b₁ ≤ a₂。');
  }
  if (input.durationS < 0.2 || input.durationS > MAX_DURATION_S) {
    issues.push(`演示时长必须在 0.2–${MAX_DURATION_S} s 内。`);
  }
  if (input.restitution < 0 || input.restitution > 1) {
    issues.push('恢复系数 e 必须在 0–1 之间。');
  }
  if (Math.abs(input.field1Bz) > 100 || Math.abs(input.field2Bz) > 100) {
    issues.push('|B| 超出本模型的稳定计算范围（≤100 T）。');
  }
  if (input.heightM > 1e4 || input.widthM > 1e4) issues.push('线框尺寸超出稳定计算范围。');
  if (input.massKg < 1e-12 || input.massKg > 1e6) issues.push('线框质量超出稳定计算范围。');
  if (input.resistanceOhm < 1e-9 || input.resistanceOhm > 1e9) {
    issues.push('总电阻超出稳定计算范围（1e-9…1e9 Ω）。');
  }
  if (Math.abs(input.initialSpeedMps) > 1e7) issues.push('初速度超出稳定计算范围。');
  if (Math.abs(input.externalForceN) > 1e9) issues.push('外力超出稳定计算范围。');
  for (const [label, value] of [
    ['a₁', input.field1LeftM],
    ['b₁', input.field1RightM],
    ['a₂', input.field2LeftM],
    ['b₂', input.field2RightM],
    ['x₀', input.startXM],
  ] as const) {
    if (Math.abs(value) > 1e6) issues.push(`${label} 超出稳定计算范围。`);
  }
  if (input.wallEnabled) {
    const limit = input.wallXM - input.widthM;
    if (input.startXM > limit + 1e-9 * Math.max(1, Math.abs(limit))) {
      issues.push('线框起点已经穿过挡板；不允许从墙体右侧开始。');
    }
    if (Math.abs(input.wallXM) > 1e6) issues.push('挡板位置超出稳定计算范围。');
  }
  if (issues.length > 0) return { valid: false, params: null, issues };
  return { valid: true, params: { ...input }, issues: [] };
}

function inside(value: number, left: number, right: number): boolean {
  return value > left && value < right;
}

function slopesAt(params: I07Params, xM: number): { g1: -1 | 0 | 1; g2: -1 | 0 | 1 } {
  const right = xM + params.widthM;
  const g1 = (inside(right, params.field1LeftM, params.field1RightM) ? 1 : 0)
    - (inside(xM, params.field1LeftM, params.field1RightM) ? 1 : 0);
  const g2 = (inside(right, params.field2LeftM, params.field2RightM) ? 1 : 0)
    - (inside(xM, params.field2LeftM, params.field2RightM) ? 1 : 0);
  return { g1: g1 as -1 | 0 | 1, g2: g2 as -1 | 0 | 1 };
}

export function i07EdgeSum(params: I07Params, xM: number, motionSign = 0): I07EdgeSum {
  const thresholds = i07GeometryThresholds(params).map((item) => item.value);
  const atThreshold = thresholds.some((value) => near(xM, value));
  const point = slopesAt(params, xM);
  const SPoint = params.field1Bz * point.g1 + params.field2Bz * point.g2;
  if (!atThreshold) {
    return {
      S: nz(SPoint),
      SLeft: nz(SPoint),
      SRight: nz(SPoint),
      g1: point.g1,
      g2: point.g2,
      oneSided: false,
    };
  }
  const delta = 1e-7 * Math.max(1, Math.abs(xM), params.widthM);
  const left = slopesAt(params, xM - delta);
  const right = slopesAt(params, xM + delta);
  const SLeft = nz(params.field1Bz * left.g1 + params.field2Bz * left.g2);
  const SRight = nz(params.field1Bz * right.g1 + params.field2Bz * right.g2);
  const chooseRight = motionSign >= 0;
  const chosen = chooseRight ? right : left;
  const S = chooseRight ? SRight : SLeft;
  return {
    S,
    SLeft,
    SRight,
    g1: chosen.g1,
    g2: chosen.g2,
    oneSided: true,
  };
}

export function i07OverlapLengths(params: I07Params, xM: number): [number, number] {
  const right = xM + params.widthM;
  const overlap1 = Math.max(0, Math.min(right, params.field1RightM) - Math.max(xM, params.field1LeftM));
  const overlap2 = Math.max(0, Math.min(right, params.field2RightM) - Math.max(xM, params.field2LeftM));
  return [nz(overlap1), nz(overlap2)];
}

export function computeI07Snapshot(
  params: I07Params,
  timeS: number,
  xM: number,
  velocityMps: number,
  cumulative: I07Cumulative,
  options: {
    slopeS?: number;
    wallState?: 'active' | 'wall-held' | 'wall-stop';
    approximation?: string;
  } = {},
): I07Snapshot {
  const [overlap1M, overlap2M] = i07OverlapLengths(params, xM);
  const motionSign = Math.abs(velocityMps) > 1e-14
    ? Math.sign(velocityMps)
    : Math.sign(params.mode === 'forces' ? params.externalForceN : 0);
  const edge = i07EdgeSum(params, xM, motionSign);
  const S = options.slopeS ?? edge.S;
  const g1 = edge.g1;
  const g2 = edge.g2;
  const fluxWb = nz(params.heightM * (params.field1Bz * overlap1M + params.field2Bz * overlap2M));
  const linkageWbTurn = nz(params.turns * fluxWb);
  const emfV = nz(-params.turns * params.heightM * S * velocityMps);
  const currentA = params.circuitClosed ? nz(emfV / params.resistanceOhm) : 0;
  const magneticForceN = params.circuitClosed ? nz(params.turns * currentA * params.heightM * S) : 0;
  const joulePowerW = params.circuitClosed ? nz(currentA * currentA * params.resistanceOhm) : 0;
  const magneticMechanicalPowerW = nz(magneticForceN * velocityMps);
  const kineticEnergyJ = 0.5 * params.massKg * velocityMps * velocityMps;
  const initialKinetic = 0.5 * params.massKg * params.initialSpeedMps * params.initialSpeedMps;
  const residual = options.approximation
    ? null
    : kineticEnergyJ - initialKinetic
      + cumulative.jouleHeatJ
      + cumulative.impactLossJ
      - cumulative.externalWorkJ;
  const wallLimit = i07WallLimit(params);
  const wallGapM = wallLimit === null ? null : nz(wallLimit - xM);
  const atBoundary = i07GeometryThresholds(params).some((item) => near(xM, item.value));
  const eventFlags: string[] = [];
  if (atBoundary) eventFlags.push('at-boundary');
  if (!params.circuitClosed) eventFlags.push('open-circuit');
  if (Math.abs(fluxWb) <= 1e-12) eventFlags.push('zero-flux');
  if (Math.abs(emfV) <= 1e-12) eventFlags.push('zero-emf');
  if (Math.abs(fluxWb) <= 1e-12 && Math.abs(emfV) > 1e-12) eventFlags.push('zero-flux-nonzero-emf');
  if (Math.abs(fluxWb) > 1e-12 && Math.abs(emfV) <= 1e-12) eventFlags.push('flux-without-emf');
  if (magneticForceN !== null && magneticForceN * velocityMps < -1e-12) eventFlags.push('magnetic-braking');
  if (wallGapM !== null && Math.abs(wallGapM) <= 1e-9) eventFlags.push('wall-contact');
  const status = !params.circuitClosed
    ? 'open-circuit'
    : options.wallState === 'wall-held'
      ? 'wall-held'
      : options.wallState === 'wall-stop'
        ? 'wall-stop'
        : atBoundary
          ? 'at-boundary'
          : 'active';
  return {
    timeS,
    xM,
    velocityMps,
    overlap1M,
    overlap2M,
    fluxWb,
    linkageWbTurn,
    S,
    g1,
    g2,
    SLeft: edge.SLeft,
    SRight: edge.SRight,
    slopeOneSided: options.slopeS === undefined ? edge.oneSided : false,
    emfV,
    currentA: params.circuitClosed ? currentA : 0,
    magneticForceN: params.circuitClosed ? magneticForceN : 0,
    magneticMechanicalPowerW,
    joulePowerW: params.circuitClosed ? joulePowerW : 0,
    kineticEnergyJ,
    jouleHeatJ: cumulative.jouleHeatJ,
    externalWorkJ: cumulative.externalWorkJ,
    impactLossJ: cumulative.impactLossJ,
    energyResidualJ: residual !== null && Number.isFinite(residual) ? nz(residual) : null,
    wallGapM,
    status,
    eventFlags,
    approximation: options.approximation,
  };
}

function expIntegrals(dt: number, lambda: number): {
  T1: number;
  T2: number;
  I1: number;
  I01: number;
  I11: number;
} {
  const z = lambda * dt;
  if (z < 1e-3) {
    const z2 = z * z;
    const z3 = z2 * z;
    const z4 = z3 * z;
    return {
      T1: dt * (1 - z / 2 + z2 / 6 - z3 / 24 + z4 / 120),
      T2: dt * (1 - z + (2 * z2) / 3 - z3 / 3 + (2 * z4) / 15),
      I1: dt * dt * (1 / 2 - z / 6 + z2 / 24 - z3 / 120),
      I01: dt * dt * (1 / 2 - z / 2 + (5 * z2) / 24 - z3 / 12),
      I11: dt * dt * dt * (1 / 3 - z / 4 + (7 * z2) / 60),
    };
  }
  const T1 = -Math.expm1(-z) / lambda;
  const T2 = -Math.expm1(-2 * z) / lambda / 2;
  return {
    T1,
    T2,
    I1: (dt - T1) / lambda,
    I01: (T1 - T2) / lambda,
    I11: (dt - 2 * T1 + T2) / (lambda * lambda),
  };
}

interface Kinematics {
  x: number;
  v: number;
  deltaQ: number;
  deltaW: number;
}

function analyticKinematics(
  x0: number,
  v0: number,
  dt: number,
  k: number,
  massKg: number,
  force: number,
): Kinematics {
  if (dt <= 0) return { x: x0, v: v0, deltaQ: 0, deltaW: 0 };
  if (k <= 0) {
    const acceleration = force / massKg;
    const v = v0 + acceleration * dt;
    const x = x0 + v0 * dt + 0.5 * acceleration * dt * dt;
    return { x, v, deltaQ: 0, deltaW: nz(force * (x - x0)) };
  }
  const lambda = k / massKg;
  const { T1, T2, I1, I01, I11 } = expIntegrals(dt, lambda);
  const ratio = force / massKg;
  const v = v0 * Math.exp(-lambda * dt) + ratio * T1;
  const x = x0 + v0 * T1 + ratio * I1;
  const deltaQ = k * (v0 * v0 * T2 + 2 * v0 * ratio * I01 + ratio * ratio * I11);
  return {
    x,
    v,
    deltaQ: Math.max(0, nz(deltaQ)),
    deltaW: nz(force * (x - x0)),
  };
}

function effectiveForce(params: I07Params): number {
  return params.mode === 'forces' ? params.externalForceN : 0;
}

function dampingK(params: I07Params, S: number): number {
  if (!params.circuitClosed) return 0;
  return (params.turns * params.heightM * S) ** 2 / params.resistanceOhm;
}

function boundaryLabel(ids: string[], params: I07Params): string {
  const names: Record<string, string> = {
    'left-a1': '左边缘到达 a₁',
    'left-b1': '左边缘到达 b₁',
    'left-a2': '左边缘到达 a₂',
    'left-b2': '左边缘到达 b₂',
    'right-a1': '右边缘到达 a₁',
    'right-b1': '右边缘到达 b₁',
    'right-a2': '右边缘到达 a₂',
    'right-b2': '右边缘到达 b₂',
  };
  const unique = [...new Set(ids)];
  const place = `（a₁=${params.field1LeftM}, b₁=${params.field1RightM}, a₂=${params.field2LeftM}, b₂=${params.field2RightM} m）`;
  return `几何事件：${unique.map((id) => names[id] ?? id).join(' / ')}${place}`;
}

interface EventCandidate {
  timeS: number;
  boundaryIds: string[];
  wall: boolean;
  turning: boolean;
}

function bisectRoot(
  low: number,
  high: number,
  valueAt: (dt: number) => number,
  target: number,
): number {
  let a = low;
  let b = high;
  for (let iteration = 0; iteration < 90; iteration++) {
    const mid = (a + b) / 2;
    const value = valueAt(mid) - target;
    if (Math.abs(value) <= 1e-14 * Math.max(1, Math.abs(target))) return mid;
    const left = valueAt(a) - target;
    if ((left <= 0 && value >= 0) || (left >= 0 && value <= 0)) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}

interface PieceContext {
  params: I07Params;
  x0: number;
  v0: number;
  k: number;
  force: number;
  horizon: number;
  wallLimit: number | null;
}

function crossingCandidates(context: PieceContext): EventCandidate[] {
  const { params, x0, v0, k, force, horizon, wallLimit } = context;
  const candidates: EventCandidate[] = [];
  const xAt = (dt: number) => analyticKinematics(x0, v0, dt, k, params.massKg, force).x;
  const vAt = (dt: number) => analyticKinematics(x0, v0, dt, k, params.massKg, force).v;

  let turning: number | null = null;
  if (k > 0) {
    const lambda = k / params.massKg;
    const vInf = force / k;
    const denominator = v0 - vInf;
    if (Math.abs(denominator) > 1e-300) {
      const ratio = -vInf / denominator;
      if (ratio > 0 && ratio < 1) turning = -Math.log(ratio) / lambda;
    }
  } else if (Math.abs(force) > 1e-14) {
    const acceleration = force / params.massKg;
    const root = -v0 / acceleration;
    if (root > 0) turning = root;
  }
  const turnInside = turning !== null && turning > ROOT_TIME_EPS && turning < horizon - ROOT_TIME_EPS;
  const intervals: Array<[number, number]> = [];
  if (turnInside && turning !== null) {
    intervals.push([0, turning], [turning, horizon]);
  } else {
    intervals.push([0, horizon]);
  }

  const candidatesForThreshold = (target: number, ids: string[], wall: boolean) => {
    for (const [start, end] of intervals) {
      const xa = xAt(start);
      const xb = xAt(end);
      if (Math.abs(xa - target) <= START_NEAR_TOL * Math.max(1, Math.abs(target), Math.abs(x0))) continue;
      const within = (xa < target && xb > target) || (xa > target && xb < target)
        || (Math.abs(xb - target) <= THRESHOLD_TOL * Math.max(1, Math.abs(target)) && xb !== xa);
      if (!within) continue;
      const root = bisectRoot(start, end, xAt, target);
      if (root <= ROOT_TIME_EPS) continue;
      if (wall) {
        const velocityAtRoot = vAt(root);
        if (velocityAtRoot <= 1e-12) continue;
      }
      candidates.push({ timeS: root, boundaryIds: ids, wall, turning: false });
      return;
    }
  };

  const byTime = new Map<number, string[]>();
  for (const threshold of i07GeometryThresholds(params)) {
    const keyTime = (() => {
      for (const [start, end] of intervals) {
        const xa = xAt(start);
        const xb = xAt(end);
        if (Math.abs(xa - threshold.value) <= START_NEAR_TOL * Math.max(1, Math.abs(threshold.value), Math.abs(x0))) return null;
        const within = (xa < threshold.value && xb > threshold.value)
          || (xa > threshold.value && xb < threshold.value)
          || (Math.abs(xb - threshold.value) <= THRESHOLD_TOL * Math.max(1, Math.abs(threshold.value)) && xb !== xa);
        if (!within) continue;
        return bisectRoot(start, end, xAt, threshold.value);
      }
      return null;
    })();
    if (keyTime === null || keyTime <= ROOT_TIME_EPS) continue;
    const key = Math.round(keyTime * 1e9) / 1e9;
    byTime.set(key, [...(byTime.get(key) ?? []), threshold.id]);
  }
  for (const [timeS, ids] of byTime) {
    candidates.push({ timeS, boundaryIds: ids, wall: false, turning: false });
  }

  if (wallLimit !== null) {
    candidatesForThreshold(wallLimit, ['wall'], true);
  }

  if (turnInside && turning !== null) {
    const xTurn = xAt(turning);
    const vTurn = vAt(turning);
    if (i07GeometryThresholds(params).some((item) => near(xTurn, item.value))) {
      // The turn is coincident with a geometry threshold; the geometry group owns the event.
    }
    candidates.push({ timeS: turning, boundaryIds: [], wall: false, turning: true });
    if (Math.abs(vTurn) > 1e-6) {
      // Numerically this should not happen; keep the event but do not fake a turn.
      candidates.pop();
    }
  }
  return candidates.sort((a, b) => a.timeS - b.timeS);
}

function staticSolution(params: I07Params, issue: string | null = null): I07Solution {
  const cumulative = { jouleHeatJ: 0, externalWorkJ: 0, impactLossJ: 0 };
  const snapshot = computeI07Snapshot(params, 0, params.startXM, params.initialSpeedMps, cumulative);
  return {
    params,
    initial: snapshot,
    final: snapshot,
    samples: [snapshot],
    events: [
      {
        kind: 'start',
        timeS: 0,
        label: '实验起点',
        xM: params.startXM,
        velocityBeforeMps: params.initialSpeedMps,
        velocityAfterMps: params.initialSpeedMps,
        boundaryIds: [],
        impactLossJ: 0,
      },
    ],
    segments: [],
    keyTimesS: [0],
    durationS: Math.max(0.2, params.durationS),
    status: 'ok',
    issue,
    totalImpactLossJ: 0,
    bounceCount: 0,
  };
}

function solvePrescribed(params: I07Params): I07Solution {
  const wallLimit = i07WallLimit(params);
  const v = params.initialSpeedMps;
  const events: I07Event[] = [
    {
      kind: 'start',
      timeS: 0,
      label: '实验起点',
      xM: params.startXM,
      velocityBeforeMps: v,
      velocityAfterMps: v,
      boundaryIds: [],
      impactLossJ: 0,
    },
  ];
  let stopTime: number | null = null;
  let wallStopped = false;

  if (wallLimit !== null && v > TIME_EPS) {
    const wallTime = (wallLimit - params.startXM) / v;
    if (wallTime <= TIME_EPS) {
      stopTime = 0;
      wallStopped = true;
    } else if (wallTime <= params.durationS) {
      stopTime = wallTime;
      wallStopped = true;
    }
  }

  const rawCandidates: Array<{ timeS: number; ids: string[] }> = [];
  if (Math.abs(v) > 1e-14) {
    const byTime = new Map<number, string[]>();
    for (const threshold of i07GeometryThresholds(params)) {
      const time = (threshold.value - params.startXM) / v;
      if (!Number.isFinite(time) || time <= TIME_EPS || time >= params.durationS - TIME_EPS) continue;
      if (stopTime !== null && time >= stopTime - TIME_EPS) continue;
      const key = Math.round(time * 1e9) / 1e9;
      byTime.set(key, [...(byTime.get(key) ?? []), threshold.id]);
    }
    for (const [timeS, ids] of byTime) rawCandidates.push({ timeS, ids });
  }
  rawCandidates.sort((a, b) => a.timeS - b.timeS);

  const finalTime = stopTime ?? params.durationS;
  const breakpoints = [0, ...rawCandidates.map((item) => item.timeS), finalTime]
    .filter((time, index, array) => index === 0 || time > array[index - 1] + 1e-12);

  const segments: I07Segment[] = [];
  let cumulative: I07Cumulative = { jouleHeatJ: 0, externalWorkJ: 0, impactLossJ: 0 };
  for (let index = 0; index < breakpoints.length - 1; index++) {
    const start = breakpoints[index];
    const end = breakpoints[index + 1];
    const span = end - start;
    if (span <= 0) continue;
    const midX = params.startXM + v * ((start + end) / 2);
    const edge = i07EdgeSum(params, midX, Math.sign(v));
    const S = edge.S;
    const k = dampingK(params, S);
    const q = k * v * v * span;
    const startCumulative = { ...cumulative };
    cumulative = {
      ...cumulative,
      jouleHeatJ: cumulative.jouleHeatJ + q,
      externalWorkJ: cumulative.externalWorkJ + q,
    };
    const x1 = params.startXM + v * end;
    segments.push({
      startTimeS: start,
      endTimeS: end,
      x0M: params.startXM + v * start,
      v0Mps: v,
      x1M: x1,
      v1Mps: v,
      S,
      k,
      externalForceN: 0,
      prescribed: true,
      jouleHeatStartJ: startCumulative.jouleHeatJ,
      externalWorkStartJ: startCumulative.externalWorkJ,
      impactLossStartJ: startCumulative.impactLossJ,
      endKind: end === finalTime ? 'end' : 'geometry',
    });
  }

  for (const candidate of rawCandidates) {
    events.push({
      kind: 'geometry',
      timeS: candidate.timeS,
      label: boundaryLabel(candidate.ids, params),
      xM: params.startXM + v * candidate.timeS,
      velocityBeforeMps: v,
      velocityAfterMps: v,
      boundaryIds: candidate.ids,
      impactLossJ: 0,
    });
  }
  if (wallStopped && stopTime !== null) {
    events.push({
      kind: 'wall-stop',
      timeS: stopTime,
      label: '规定运动到达挡板：约束运动结束（不反弹）',
      xM: wallLimit ?? params.startXM + v * stopTime,
      velocityBeforeMps: v,
      velocityAfterMps: 0,
      boundaryIds: ['wall'],
      impactLossJ: 0,
    });
  }
  events.push({
    kind: 'end',
    timeS: finalTime,
    label: wallStopped ? '约束运动在挡板处截止' : '演示结束',
    xM: params.startXM + v * finalTime,
    velocityBeforeMps: wallStopped ? 0 : v,
    velocityAfterMps: wallStopped ? 0 : v,
    boundaryIds: [],
    impactLossJ: 0,
  });

  if (wallStopped && stopTime === 0) {
    const stopped = computeI07Snapshot(
      params,
      0,
      params.startXM,
      0,
      cumulative,
      { wallState: 'wall-stop', slopeS: segments[0]?.S },
    );
    return {
      params,
      initial: stopped,
      final: stopped,
      samples: [stopped],
      events,
      segments,
      keyTimesS: [0, params.durationS],
      durationS: params.durationS,
      status: 'wall-stop',
      issue: '线框起点已与挡板接触；规定运动无法继续。',
      totalImpactLossJ: 0,
      bounceCount: 0,
    };
  }

  const solution: I07Solution = {
    params,
    initial: computeI07Snapshot(params, 0, params.startXM, v, { jouleHeatJ: 0, externalWorkJ: 0, impactLossJ: 0 }),
    final: computeI07Snapshot(params, finalTime, params.startXM + v * finalTime, wallStopped ? 0 : v, cumulative, {
      wallState: wallStopped ? 'wall-stop' : 'active',
      slopeS: segments[segments.length - 1]?.S,
    }),
    samples: [],
    events,
    segments,
    keyTimesS: [...new Set([0, finalTime, ...events.map((event) => event.timeS)])].sort((a, b) => a - b),
    durationS: finalTime,
    status: wallStopped ? 'wall-stop' : 'ok',
    issue: wallStopped ? '规定运动在挡板处停止；没有伪装成自由反弹。' : null,
    totalImpactLossJ: 0,
    bounceCount: 0,
  };
  solution.samples = buildSamples(solution);
  return solution;
}

function solveDynamic(params: I07Params): I07Solution {
  const wallLimit = i07WallLimit(params);
  let timeS = 0;
  let xM = params.startXM;
  let velocityMps = params.initialSpeedMps;
  let cumulative: I07Cumulative = { jouleHeatJ: 0, externalWorkJ: 0, impactLossJ: 0 };
  let totalImpactLossJ = 0;
  let bounceCount = 0;
  let status: I07Status = 'ok';
  let issue: string | null = null;
  const segments: I07Segment[] = [];
  const events: I07Event[] = [
    {
      kind: 'start',
      timeS: 0,
      label: '实验起点',
      xM,
      velocityBeforeMps: velocityMps,
      velocityAfterMps: velocityMps,
      boundaryIds: [],
      impactLossJ: 0,
    },
  ];

  if (wallLimit !== null && xM >= wallLimit - 1e-9) {
    if (velocityMps > 0) {
      const before = velocityMps;
      const after = -params.restitution * before;
      const loss = 0.5 * params.massKg * (before * before - after * after);
      totalImpactLossJ += loss;
      cumulative = { ...cumulative, impactLossJ: cumulative.impactLossJ + loss };
      velocityMps = after;
      bounceCount += 1;
      events.push({
        kind: 'wall-bounce',
        timeS: 0,
        label: `起点接触挡板：弹性/非弹性反弹（e=${params.restitution}）`,
        xM,
        velocityBeforeMps: before,
        velocityAfterMps: after,
        boundaryIds: ['wall'],
        impactLossJ: loss,
      });
      if (Math.abs(after) <= 1e-12 && effectiveForce(params) > 0) {
        status = 'wall-held';
        issue = '恒定外力把线框压在挡板上：进入 wall-held 静力约束。';
        events.push({
          kind: 'wall-held',
          timeS: 0,
          label: '挡板静力约束：外力向内，线框保持不动',
          xM,
          velocityBeforeMps: 0,
          velocityAfterMps: 0,
          boundaryIds: ['wall'],
          impactLossJ: 0,
        });
      }
    } else if (Math.abs(velocityMps) <= 1e-12 && effectiveForce(params) > 0) {
      velocityMps = 0;
      status = 'wall-held';
      issue = '恒定外力把线框压在挡板上：进入 wall-held 静力约束。';
      events.push({
        kind: 'wall-held',
        timeS: 0,
        label: '挡板静力约束：外力向内，线框保持不动',
        xM,
        velocityBeforeMps: 0,
        velocityAfterMps: 0,
        boundaryIds: ['wall'],
        impactLossJ: 0,
      });
    }
  }

  if (status === 'wall-held') {
    const snapshot = computeI07Snapshot(params, 0, xM, 0, cumulative, { wallState: 'wall-held' });
    return {
      params,
      initial: snapshot,
      final: snapshot,
      samples: [snapshot],
      events,
      segments,
      keyTimesS: [0, params.durationS],
      durationS: Math.max(0.2, params.durationS),
      status,
      issue,
      totalImpactLossJ,
      bounceCount,
    };
  }

  let eventCount = 0;
  let guard = 0;
  while (timeS < params.durationS - TIME_EPS) {
    if (guard++ > 20000 || eventCount >= MAX_EVENTS) {
      status = 'event-limited';
      issue = '事件数量达到上限；轨迹在最后一个安全状态停止。';
      break;
    }
    const remaining = params.durationS - timeS;
    const motionSign = Math.abs(velocityMps) > 1e-14
      ? Math.sign(velocityMps)
      : Math.sign(effectiveForce(params));
    const edge = i07EdgeSum(params, xM, motionSign);
    const S = edge.S;
    const k = dampingK(params, S);
    const force = effectiveForce(params);
    const context: PieceContext = {
      params,
      x0: xM,
      v0: velocityMps,
      k,
      force,
      horizon: remaining,
      wallLimit,
    };
    const candidates = crossingCandidates(context);
    const earliest = candidates[0];
    if (!earliest) {
      const end = analyticKinematics(xM, velocityMps, remaining, k, params.massKg, force);
      cumulative = {
        jouleHeatJ: cumulative.jouleHeatJ + end.deltaQ,
        externalWorkJ: cumulative.externalWorkJ + end.deltaW,
        impactLossJ: cumulative.impactLossJ,
      };
      segments.push({
        startTimeS: timeS,
        endTimeS: params.durationS,
        x0M: xM,
        v0Mps: velocityMps,
        x1M: end.x,
        v1Mps: end.v,
        S,
        k,
        externalForceN: force,
        prescribed: false,
        jouleHeatStartJ: cumulative.jouleHeatJ - end.deltaQ,
        externalWorkStartJ: cumulative.externalWorkJ - end.deltaW,
        impactLossStartJ: cumulative.impactLossJ,
        endKind: 'end',
      });
      timeS = params.durationS;
      xM = end.x;
      velocityMps = end.v;
      break;
    }

    const group = candidates.filter((item) => item.timeS <= earliest.timeS + 1e-9);
    const dt = Math.min(...group.map((item) => item.timeS));
    const absoluteEventTime = timeS + dt;
    const startX = xM;
    const startV = velocityMps;
    const pre = analyticKinematics(xM, velocityMps, dt, k, params.massKg, force);
    const startCumulative = { ...cumulative };
    cumulative = {
      jouleHeatJ: cumulative.jouleHeatJ + pre.deltaQ,
      externalWorkJ: cumulative.externalWorkJ + pre.deltaW,
      impactLossJ: cumulative.impactLossJ,
    };
    const boundaryIds = group.flatMap((item) => item.boundaryIds);
    const hasWall = group.some((item) => item.wall);
    const hasTurning = group.some((item) => item.turning);

    velocityMps = pre.v;
    xM = pre.x;

    if (hasWall) {
      const before = pre.v;
      if (params.mode === 'prescribed') {
        // Not reached: prescribed is solved separately.
        status = 'wall-stop';
        break;
      }
      const after = -params.restitution * before;
      const loss = Math.max(0, 0.5 * params.massKg * (before * before - after * after));
      totalImpactLossJ += loss;
      cumulative = { ...cumulative, impactLossJ: cumulative.impactLossJ + loss };
      const held = Math.abs(after) <= 1e-12 && effectiveForce(params) > 0;
      segments.push({
        startTimeS: timeS,
        endTimeS: absoluteEventTime,
        x0M: startX,
        v0Mps: startV,
        x1M: xM,
        v1Mps: pre.v,
        S,
        k,
        externalForceN: force,
        prescribed: false,
        jouleHeatStartJ: startCumulative.jouleHeatJ,
        externalWorkStartJ: startCumulative.externalWorkJ,
        impactLossStartJ: startCumulative.impactLossJ,
        endKind: held ? 'wall-held' : 'wall-bounce',
      });
      events.push({
        kind: held ? 'wall-held' : 'wall-bounce',
        timeS: absoluteEventTime,
        label: held
          ? '挡板静力约束：恢复系数使速度归零，外力仍向内'
          : `挡板反弹：v_before=${before.toFixed(6)} m/s，v_after=${after.toFixed(6)} m/s`,
        xM,
        velocityBeforeMps: before,
        velocityAfterMps: held ? 0 : after,
        boundaryIds: ['wall', ...boundaryIds.filter((id) => id !== 'wall')],
        impactLossJ: loss,
      });
      timeS = absoluteEventTime;
      eventCount += 1;
      if (held) {
        velocityMps = 0;
        status = 'wall-held';
        issue = '恒定外力把线框压在挡板上：进入 wall-held 静力约束。';
        break;
      }
      velocityMps = after;
      bounceCount += 1;
      continue;
    }

    segments.push({
      startTimeS: timeS,
      endTimeS: absoluteEventTime,
      x0M: startX,
      v0Mps: startV,
      x1M: xM,
      v1Mps: pre.v,
      S,
      k,
      externalForceN: force,
      prescribed: false,
      jouleHeatStartJ: startCumulative.jouleHeatJ,
      externalWorkStartJ: startCumulative.externalWorkJ,
      impactLossStartJ: startCumulative.impactLossJ,
      endKind: hasTurning ? 'turning' : 'geometry',
    });
    events.push({
      kind: hasTurning && boundaryIds.length === 0 ? 'turning' : 'geometry',
      timeS: absoluteEventTime,
      label: hasTurning && boundaryIds.length === 0
        ? '速度过零：运动方向改变（磁场阻尼/外力驱动）'
        : boundaryLabel(boundaryIds, params),
      xM,
      velocityBeforeMps: pre.v,
      velocityAfterMps: pre.v,
      boundaryIds,
      impactLossJ: 0,
    });
    timeS = absoluteEventTime;
    velocityMps = pre.v;
    eventCount += 1;
    if (timeS <= TIME_EPS && eventCount > 2) {
      status = 'solver-limited';
      issue = '事件时间无法前进；求解器停止，不伪造后续轨迹。';
      break;
    }
  }

  events.push({
    kind: 'end',
    timeS,
    label: status === 'event-limited' ? '事件上限：已停止' : '演示结束',
    xM,
    velocityBeforeMps: velocityMps,
    velocityAfterMps: velocityMps,
    boundaryIds: [],
    impactLossJ: 0,
  });

  const finalSegment = segments[segments.length - 1];
  const held = status === 'wall-held';
  const finalSnapshot = computeI07Snapshot(
    params,
    timeS,
    xM,
    held ? 0 : velocityMps,
    cumulative,
    {
      wallState: held ? 'wall-held' : 'active',
      slopeS: finalSegment?.S,
    },
  );
  const solution: I07Solution = {
    params,
    initial: computeI07Snapshot(params, 0, params.startXM, params.initialSpeedMps, {
      jouleHeatJ: 0,
      externalWorkJ: 0,
      impactLossJ: 0,
    }),
    final: finalSnapshot,
    samples: [],
    events,
    segments,
    keyTimesS: [...new Set([0, timeS, ...events.map((event) => event.timeS)])].sort((a, b) => a - b),
    durationS: timeS,
    status,
    issue,
    totalImpactLossJ,
    bounceCount,
  };
  solution.samples = buildSamples(solution);
  return solution;
}

function stateInSegment(params: I07Params, segment: I07Segment, absoluteTime: number): I07Snapshot {
  const dt = Math.max(0, Math.min(segment.endTimeS, absoluteTime) - segment.startTimeS);
  if (segment.prescribed) {
    const x = segment.x0M + segment.v0Mps * dt;
    const k = segment.k;
    const q = k * segment.v0Mps * segment.v0Mps * dt;
    return computeI07Snapshot(
      params,
      absoluteTime,
      x,
      segment.v0Mps,
      {
        jouleHeatJ: segment.jouleHeatStartJ + q,
        externalWorkJ: segment.externalWorkStartJ + q,
        impactLossJ: segment.impactLossStartJ,
      },
      { slopeS: segment.S, wallState: segment.endKind === 'wall-stop' ? 'wall-stop' : 'active' },
    );
  }
  const motion = analyticKinematics(
    segment.x0M,
    segment.v0Mps,
    dt,
    segment.k,
    params.massKg,
    segment.externalForceN,
  );
  return computeI07Snapshot(
    params,
    absoluteTime,
    motion.x,
    motion.v,
    {
      jouleHeatJ: segment.jouleHeatStartJ + motion.deltaQ,
      externalWorkJ: segment.externalWorkStartJ + motion.deltaW,
      impactLossJ: segment.impactLossStartJ,
    },
    {
      slopeS: segment.S,
      wallState: segment.endKind === 'wall-held' ? 'wall-held' : 'active',
    },
  );
}

function buildSamples(solution: I07Solution): I07Snapshot[] {
  if (solution.segments.length === 0) return [solution.initial];
  const total = Math.max(1e-9, solution.durationS);
  const samples: I07Snapshot[] = [];
  for (const segment of solution.segments) {
    const span = Math.max(0, segment.endTimeS - segment.startTimeS);
    const count = Math.max(3, Math.round((SAMPLE_TARGET * span) / total));
    for (let index = 0; index < count; index++) {
      const time = segment.startTimeS + (span * index) / count;
      samples.push(stateInSegment(solution.params, segment, time));
    }
    samples.push(stateInSegment(solution.params, segment, segment.endTimeS));
  }
  if (samples.length === 0) samples.push(solution.initial);
  const last = samples[samples.length - 1];
  if (
    Math.abs(last.timeS - solution.durationS) > 1e-12
    || Math.abs(last.velocityMps - solution.final.velocityMps) > 1e-9
    || last.status !== solution.final.status
  ) {
    samples.push(solution.final);
  }
  return samples;
}

export function stateAtI07Time(solution: I07Solution, timeS: number): I07Snapshot {
  if (solution.status === 'invalid' || solution.segments.length === 0) return solution.initial;
  const t = Number.isFinite(timeS) ? Math.max(0, Math.min(solution.durationS, timeS)) : 0;
  let low = 0;
  let high = solution.segments.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (solution.segments[mid].startTimeS <= t + TIME_EPS) low = mid;
    else high = mid - 1;
  }
  return stateInSegment(solution.params, solution.segments[low], t);
}

export function downsampleI07Samples(samples: I07Snapshot[], maxPoints = 320): I07Snapshot[] {
  if (samples.length <= maxPoints) return samples;
  const step = (samples.length - 1) / (maxPoints - 1);
  const out: I07Snapshot[] = [];
  for (let index = 0; index < maxPoints; index++) out.push(samples[Math.round(index * step)]);
  return out;
}

export function solveI07(paramsInput: I07Params): I07Solution {
  const validation = validateI07Params(paramsInput);
  if (!validation.valid || !validation.params) {
    const issue = validation.issues.join(' ');
    const fallback: I07Params = {
      ...I07_DEFAULT,
      mode: 'prescribed',
      initialSpeedMps: 0,
      durationS: 1,
    };
    const snapshot = computeI07Snapshot(fallback, 0, fallback.startXM, 0, {
      jouleHeatJ: 0,
      externalWorkJ: 0,
      impactLossJ: 0,
    });
    return {
      params: fallback,
      initial: { ...snapshot, issue },
      final: { ...snapshot, issue },
      samples: [{ ...snapshot, issue }],
      events: [],
      segments: [],
      keyTimesS: [0],
      durationS: 1,
      status: 'invalid',
      issue,
      totalImpactLossJ: 0,
      bounceCount: 0,
    };
  }
  const params = validation.params;
  if (params.mode === 'manual-x') {
    return staticSolution(params, '手动拖动线框模式由手势历史驱动；此纯函数解只保留初始状态。');
  }
  if (params.mode === 'prescribed') return solvePrescribed(params);
  return solveDynamic(params);
}
