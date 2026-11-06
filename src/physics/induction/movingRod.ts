import { clamp } from '../core/vec2';

export type RodMode = 'constant-speed' | 'free-decay' | 'constant-force' | 'manual-drag';

export interface RodMedium {
  BzTesla: number;
  lengthM: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  massKg: number;
}

export interface RodParams extends RodMedium {
  mode: RodMode;
  startXM: number;
  initialSpeedMps: number;
  externalForceN: number;
}

export interface RodElectromagneticOutputs {
  fluxWb: number;
  fluxRateWbPerS: number;
  emfV: number;
  currentA: number;
  magneticForceXN: number;
  joulePowerW: number;
  kineticEnergyJ: number;
  k: number;
}

export type RodStatus = 'moving' | 'rest' | 'boundary-stop' | 'invalid';

export interface RodSnapshot extends RodElectromagneticOutputs {
  tS: number;
  xM: number;
  velocityMps: number;
  status: RodStatus;
  estimated: boolean;
  jouleHeatJ: number | null;
  externalWorkJ: number | null;
  externalPowerW: number | null;
  energyResidualJ: number | null;
  externalForceN: number | null;
  circuitClosed: boolean;
  alphaPerS: number;
  terminalVelocityMps: number | null;
  boundaryTimeS: number | null;
}

export interface RodEvent {
  tS: number;
  kind: 'boundary-stop' | 'zero-velocity';
  label: string;
  xM: number;
  velocityMps: number;
  emfV: number;
  currentA: number;
  magneticForceXN: number;
}

export interface RodSolution {
  params: RodParams;
  issue: string | null;
  k: number;
  alphaPerS: number;
  terminalVelocityMps: number | null;
  boundaryTimeS: number | null;
  durationS: number;
  events: RodEvent[];
  keyTimesS: number[];
  samples: RodSnapshot[];
  initial: RodSnapshot;
  final: RodSnapshot;
  boundaryState: RodSnapshot | null;
  zeroVelocityTimeS: number | null;
}

export const ROD_MODE_LABEL: Record<RodMode, string> = {
  'constant-speed': '匀速切割',
  'free-decay': '自由滑行',
  'constant-force': '恒力驱动',
  'manual-drag': '手指推拉',
};

export const ROD_DEFAULT_PARAMS: RodParams = {
  mode: 'constant-speed',
  BzTesla: 1,
  lengthM: 1,
  resistanceOhm: 2,
  circuitClosed: true,
  startXM: 0.5,
  initialSpeedMps: 1.5,
  massKg: 1,
  externalForceN: 0.8,
};

const TOL = 1e-9;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeRodParams(input: RodParams): { params: RodParams; issue: string | null } {
  const issues: string[] = [];
  const params: RodParams = {
    mode: input.mode,
    BzTesla: finiteOr(input.BzTesla, 0),
    lengthM: finiteOr(input.lengthM, 1),
    resistanceOhm: finiteOr(input.resistanceOhm, 2),
    circuitClosed: input.circuitClosed !== false,
    startXM: finiteOr(input.startXM, 0.5),
    initialSpeedMps: finiteOr(input.initialSpeedMps, 0),
    massKg: finiteOr(input.massKg, 1),
    externalForceN: finiteOr(input.externalForceN, 0),
  };

  if (
    !Number.isFinite(input.BzTesla) ||
    !Number.isFinite(input.lengthM) ||
    !Number.isFinite(input.resistanceOhm) ||
    !Number.isFinite(input.startXM) ||
    !Number.isFinite(input.initialSpeedMps) ||
    !Number.isFinite(input.massKg) ||
    !Number.isFinite(input.externalForceN)
  ) {
    issues.push('输入包含非有限数值，已采用安全值，非法输入不参与物理计算。');
  }
  if (!Number.isFinite(params.lengthM) || params.lengthM <= 0) {
    params.lengthM = 1;
    issues.push('导轨间距 L 必须大于 0；已回退为 1 m。');
  }
  if (!Number.isFinite(params.resistanceOhm) || params.resistanceOhm <= 0) {
    params.resistanceOhm = 2;
    issues.push('电阻必须严格大于 0；R=0 且忽略自感的理想模型是奇异的，已回退为 2 Ω。');
  }
  if (!Number.isFinite(params.massKg) || params.massKg <= 0) {
    params.massKg = 1;
    issues.push('导体棒质量必须大于 0；已回退为 1 kg。');
  }
  if (!Number.isFinite(params.startXM) || params.startXM <= 0) {
    params.startXM = 0.5;
    issues.push('初始位置必须满足 x>0 才能保持正面积回路；已回退为 0.5 m。');
  }
  if (!Number.isFinite(params.BzTesla)) {
    params.BzTesla = 0;
  }
  if (!Number.isFinite(params.initialSpeedMps)) {
    params.initialSpeedMps = 0;
  }
  if (!Number.isFinite(params.externalForceN)) {
    params.externalForceN = 0;
  }
  if (!['constant-speed', 'free-decay', 'constant-force', 'manual-drag'].includes(params.mode)) {
    params.mode = 'constant-speed';
    issues.push('未知运动模式；已回退为匀速切割。');
  }

  return { params, issue: issues.length > 0 ? issues.join(' ') : null };
}

export function rodElectromagneticOutputs(
  medium: RodMedium,
  xM: number,
  velocityMps: number,
): RodElectromagneticOutputs {
  const k = medium.circuitClosed
    ? (medium.BzTesla * medium.BzTesla * medium.lengthM * medium.lengthM) / medium.resistanceOhm
    : 0;
  const fluxWb = nz(medium.BzTesla * medium.lengthM * xM);
  const fluxRateWbPerS = nz(medium.BzTesla * medium.lengthM * velocityMps);
  const emfV = nz(-fluxRateWbPerS);
  const currentA = medium.circuitClosed ? nz(emfV / medium.resistanceOhm) : 0;
  const magneticForceXN = nz(-k * velocityMps);
  const joulePowerW = nz(k * velocityMps * velocityMps);
  return {
    fluxWb,
    fluxRateWbPerS,
    emfV,
    currentA,
    magneticForceXN,
    joulePowerW,
    kineticEnergyJ: 0.5 * medium.massKg * velocityMps * velocityMps,
    k,
  };
}

export type RodCurrentDirection = 'up' | 'down' | 'none';

export function rodCurrentDirection(snapshot: Pick<RodSnapshot, 'currentA'>): RodCurrentDirection {
  if (Math.abs(snapshot.currentA) < 1e-12) return 'none';
  return snapshot.currentA > 0 ? 'up' : 'down';
}

export function formatRodCurrentDirection(snapshot: Pick<RodSnapshot, 'currentA' | 'circuitClosed'>): string {
  const direction = rodCurrentDirection(snapshot);
  if (!snapshot.circuitClosed) return '开路：I = 0，无闭合电流';
  if (direction === 'none') return '无感应电流';
  return direction === 'up' ? '棒中电流向上（回路逆时针）' : '棒中电流向下（回路顺时针）';
}

function freeDecayBoundaryTime(params: RodParams, k: number): number | null {
  if (params.initialSpeedMps >= 0) return null;
  if (params.startXM <= 0) return 0;
  const alpha = k / params.massKg;
  if (k <= TOL || alpha <= TOL) return -params.startXM / params.initialSpeedMps;
  const ratio = 1 + (params.startXM * alpha) / params.initialSpeedMps;
  if (ratio > TOL && ratio < 1) return -Math.log(ratio) / alpha;
  return null;
}

function constantForceX(params: RodParams, k: number, timeS: number): number {
  const mass = params.massKg;
  if (k <= TOL) {
    return params.startXM + params.initialSpeedMps * timeS + (params.externalForceN * timeS * timeS) / (2 * mass);
  }
  const alpha = k / mass;
  const terminal = params.externalForceN / k;
  const delta = params.initialSpeedMps - terminal;
  return (
    params.startXM +
    terminal * timeS +
    (delta * -Math.expm1(-alpha * timeS)) / alpha
  );
}

function firstPositiveRoot(a: number, b: number, c: number): number | null {
  if (Math.abs(a) < TOL) {
    if (Math.abs(b) < TOL) return null;
    const root = -c / b;
    return root > TOL ? root : null;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-14) return null;
  const sqrt = Math.sqrt(Math.max(0, discriminant));
  const roots = [(-b - sqrt) / (2 * a), (-b + sqrt) / (2 * a)]
    .filter((root) => Number.isFinite(root) && root > TOL)
    .sort((left, right) => left - right);
  return roots[0] ?? null;
}

function bisectZero(fn: (timeS: number) => number, left: number, right: number): number {
  let lo = left;
  let hi = right;
  let fLo = fn(lo);
  for (let index = 0; index < 90; index++) {
    const mid = (lo + hi) / 2;
    const fMid = fn(mid);
    if (Math.abs(fMid) < 1e-13 || hi - lo < 1e-11) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

function constantForceBoundaryTime(params: RodParams, k: number): number | null {
  if (k <= TOL) {
    return firstPositiveRoot(
      params.externalForceN / (2 * params.massKg),
      params.initialSpeedMps,
      params.startXM,
    );
  }
  const alpha = k / params.massKg;
  const terminal = params.externalForceN / k;
  if (Math.abs(params.externalForceN) < TOL) return freeDecayBoundaryTime({ ...params, mode: 'free-decay' }, k);
  if (terminal >= 0 && params.initialSpeedMps >= 0) return null;

  const delta = params.initialSpeedMps - terminal;
  if (params.initialSpeedMps < 0 && terminal >= 0) {
    const ratio = -terminal / delta;
    const turnTime = ratio > 0 && ratio < 1 ? -Math.log(ratio) / alpha : 0;
    const minX = constantForceX(params, k, turnTime);
    if (minX > TOL) return null;
  }

  const absTerminal = Math.abs(terminal);
  const horizon = clamp(
    Math.max(10, ((params.startXM + Math.abs(delta) / Math.max(alpha, TOL) + 1) / Math.max(absTerminal, 1e-9)) * 1.5),
    10,
    600,
  );
  const steps = 4000;
  let previousTime = 0;
  let previousX = params.startXM;
  for (let index = 1; index <= steps; index++) {
    const time = (horizon * index) / steps;
    const x = constantForceX(params, k, time);
    if (x <= 0) {
      return bisectZero((candidate) => constantForceX(params, k, candidate), previousTime, time);
    }
    previousTime = time;
    previousX = x;
  }
  return previousX <= 0 ? horizon : null;
}

function boundaryTimeFor(params: RodParams, k: number): number | null {
  if (params.mode === 'constant-speed') {
    if (params.initialSpeedMps < 0) return params.startXM / -params.initialSpeedMps;
    return null;
  }
  if (params.mode === 'free-decay') return freeDecayBoundaryTime(params, k);
  if (params.mode === 'constant-force') return constantForceBoundaryTime(params, k);
  return null;
}

function zeroVelocityTimeFor(params: RodParams, k: number): number | null {
  if (params.mode !== 'constant-force') return null;
  if (k <= TOL) {
    const acceleration = params.externalForceN / params.massKg;
    if (Math.abs(acceleration) < TOL) return null;
    const time = -params.initialSpeedMps / acceleration;
    return time > TOL ? time : null;
  }
  if (Math.abs(params.externalForceN) < TOL) return null;
  const alpha = k / params.massKg;
  const terminal = params.externalForceN / k;
  const delta = params.initialSpeedMps - terminal;
  if (Math.abs(delta) < TOL) return null;
  const ratio = -terminal / delta;
  if (ratio > TOL && ratio < 1) return -Math.log(ratio) / alpha;
  return null;
}

function preContactState(
  params: RodParams,
  k: number,
  alphaPerS: number,
  terminalVelocityMps: number | null,
  boundaryTimeS: number | null,
  timeS: number,
): RodSnapshot {
  const t = Math.max(0, timeS);
  let x = params.startXM;
  let v = params.initialSpeedMps;
  let heat = 0;
  let externalWork = 0;
  let externalForce: number | null = null;
  let status: RodStatus = 'moving';

  if (params.mode === 'constant-speed') {
    v = params.initialSpeedMps;
    x = params.startXM + v * t;
    externalForce = params.circuitClosed ? k * v : 0;
    externalWork = externalForce * (x - params.startXM);
    heat = k * v * v * t;
    status = Math.abs(v) < TOL ? 'rest' : 'moving';
  } else if (params.mode === 'free-decay') {
    externalForce = 0;
    externalWork = 0;
    if (k <= TOL || alphaPerS <= TOL) {
      v = params.initialSpeedMps;
      x = params.startXM + v * t;
      heat = 0;
    } else {
      v = params.initialSpeedMps * Math.exp(-alphaPerS * t);
      x = params.startXM + (params.initialSpeedMps * -Math.expm1(-alphaPerS * t)) / alphaPerS;
      heat = Math.max(0, 0.5 * params.massKg * params.initialSpeedMps ** 2 - 0.5 * params.massKg * v * v);
    }
    status = Math.abs(v) < TOL ? 'rest' : 'moving';
  } else if (params.mode === 'constant-force') {
    externalForce = params.externalForceN;
    if (k <= TOL) {
      const acceleration = params.externalForceN / params.massKg;
      v = params.initialSpeedMps + acceleration * t;
      x = params.startXM + params.initialSpeedMps * t + 0.5 * acceleration * t * t;
      heat = 0;
    } else {
      const alpha = k / params.massKg;
      const terminal = params.externalForceN / k;
      const delta = params.initialSpeedMps - terminal;
      v = terminal + delta * Math.exp(-alpha * t);
      x = params.startXM + terminal * t + (delta * -Math.expm1(-alpha * t)) / alpha;
      const terminalSq = terminal * terminal;
      const first = terminalSq * t;
      const second = (2 * terminal * delta * -Math.expm1(-alpha * t)) / alpha;
      const third = (delta * delta * -Math.expm1(-2 * alpha * t)) / (2 * alpha);
      heat = Math.max(0, k * (first + second + third));
    }
    externalWork = params.externalForceN * (x - params.startXM);
    status =
      Math.abs(v) < TOL && Math.abs(params.externalForceN) < TOL
        ? 'rest'
        : 'moving';
  } else {
    externalForce = null;
    externalWork = 0;
    heat = 0;
  }

  const outputs = rodElectromagneticOutputs(params, x, v);
  const externalPower = externalForce === null ? null : externalForce * v;
  const residual =
    params.mode === 'constant-speed'
      ? (externalWork ?? 0) - heat
      : params.mode === 'free-decay'
        ? 0.5 * params.massKg * params.initialSpeedMps ** 2 - outputs.kineticEnergyJ - heat
        : (externalWork ?? 0) - (outputs.kineticEnergyJ - 0.5 * params.massKg * params.initialSpeedMps ** 2) - heat;

  return {
    ...outputs,
    tS: t,
    xM: nz(x),
    velocityMps: nz(v),
    status,
    estimated: false,
    jouleHeatJ: Number.isFinite(heat) ? Math.max(0, heat) : 0,
    externalWorkJ: externalWork,
    externalPowerW: externalPower,
    energyResidualJ: Number.isFinite(residual) ? residual : null,
    externalForceN: externalForce,
    circuitClosed: params.circuitClosed,
    alphaPerS,
    terminalVelocityMps,
    boundaryTimeS,
  };
}

function boundarySnapshot(
  params: RodParams,
  alphaPerS: number,
  terminalVelocityMps: number | null,
  boundaryTimeS: number,
  preContact: RodSnapshot,
): RodSnapshot {
  const outputs = rodElectromagneticOutputs(params, 0, 0);
  const externalForce = params.mode === 'constant-force' ? params.externalForceN : 0;
  return {
    ...outputs,
    tS: boundaryTimeS,
    xM: 0,
    velocityMps: 0,
    status: 'boundary-stop',
    estimated: false,
    jouleHeatJ: preContact.jouleHeatJ,
    externalWorkJ: preContact.externalWorkJ,
    externalPowerW: 0,
    energyResidualJ: null,
    externalForceN: externalForce,
    circuitClosed: params.circuitClosed,
    alphaPerS,
    terminalVelocityMps,
    boundaryTimeS,
  };
}

function makeEvents(
  params: RodParams,
  boundaryTimeS: number | null,
  boundaryPre: RodSnapshot | null,
  zeroVelocityTimeS: number | null,
  durationS: number,
): RodEvent[] {
  const events: RodEvent[] = [];
  if (boundaryTimeS !== null && boundaryTimeS <= durationS + 1e-9 && boundaryPre) {
    events.push({
      tS: boundaryTimeS,
      kind: 'boundary-stop',
      label: '导体棒第一次接触左端：外部约束停止运动，接触耗散不计入焦耳热',
      xM: boundaryPre.xM,
      velocityMps: boundaryPre.velocityMps,
      emfV: boundaryPre.emfV,
      currentA: boundaryPre.currentA,
      magneticForceXN: boundaryPre.magneticForceXN,
    });
  }
  if (
    zeroVelocityTimeS !== null &&
    zeroVelocityTimeS > TOL &&
    zeroVelocityTimeS <= durationS + 1e-9 &&
    (boundaryTimeS === null || zeroVelocityTimeS < boundaryTimeS - 1e-9)
  ) {
    const zero = preContactState(params, params.circuitClosed ? (params.BzTesla ** 2 * params.lengthM ** 2) / params.resistanceOhm : 0, kAlpha(params), terminalFor(params), boundaryTimeS, zeroVelocityTimeS);
    events.push({
      tS: zeroVelocityTimeS,
      kind: 'zero-velocity',
      label: '速度过零：电流与磁阻力随速度方向翻转到另一侧',
      xM: zero.xM,
      velocityMps: zero.velocityMps,
      emfV: zero.emfV,
      currentA: zero.currentA,
      magneticForceXN: zero.magneticForceXN,
    });
  }
  return events.sort((left, right) => left.tS - right.tS);
}

function kFor(params: RodParams): number {
  return params.circuitClosed
    ? (params.BzTesla * params.BzTesla * params.lengthM * params.lengthM) / params.resistanceOhm
    : 0;
}

function kAlpha(params: RodParams): number {
  return kFor(params) / params.massKg;
}

function terminalFor(params: RodParams): number | null {
  const k = kFor(params);
  return k > TOL && params.mode === 'constant-force' ? params.externalForceN / k : null;
}

function uniqueTimes(times: number[], durationS: number): number[] {
  const seen: number[] = [];
  for (const time of times) {
    if (!Number.isFinite(time) || time < -1e-9 || time > durationS + 1e-9) continue;
    const safe = clamp(time, 0, durationS);
    if (!seen.some((existing) => Math.abs(existing - safe) < 1e-7)) seen.push(safe);
  }
  return seen.sort((left, right) => left - right);
}

export function solveRod(input: RodParams): RodSolution {
  const { params, issue } = normalizeRodParams(input);
  const k = kFor(params);
  const alphaPerS = k / params.massKg;
  const terminalVelocityMps = terminalFor(params);
  const boundaryTimeS = boundaryTimeFor(params, k);
  const zeroVelocityTimeS = zeroVelocityTimeFor(params, k);

  const baseDuration = params.mode === 'constant-speed' ? 4 : 6;
  const durationS =
    boundaryTimeS !== null && boundaryTimeS <= 30
      ? Math.max(baseDuration, boundaryTimeS + 0.2)
      : baseDuration;

  const boundaryPre =
    boundaryTimeS !== null && boundaryTimeS <= durationS + 1e-9
      ? preContactState(params, k, alphaPerS, terminalVelocityMps, boundaryTimeS, boundaryTimeS)
      : null;
  const boundaryState =
    boundaryTimeS !== null && boundaryPre
      ? boundarySnapshot(params, alphaPerS, terminalVelocityMps, boundaryTimeS, boundaryPre)
      : null;

  const stateAt = (timeS: number): RodSnapshot => {
    const safeTime = Number.isFinite(timeS) ? clamp(timeS, 0, durationS) : 0;
    if (boundaryTimeS !== null && boundaryState && safeTime >= boundaryTimeS - 1e-10) {
      return { ...boundaryState, tS: safeTime };
    }
    return preContactState(params, k, alphaPerS, terminalVelocityMps, boundaryTimeS, safeTime);
  };

  const events = makeEvents(params, boundaryTimeS, boundaryPre, zeroVelocityTimeS, durationS);
  const characteristic: number[] = [0, durationS];
  if (alphaPerS > TOL && params.mode !== 'constant-speed') {
    characteristic.push(1 / alphaPerS, 3 / alphaPerS);
  }
  for (const event of events) characteristic.push(event.tS);
  const keyTimesS = uniqueTimes(characteristic, durationS);

  const sampleTimes = uniqueTimes(
    [
      ...Array.from({ length: 241 }, (_, index) => (durationS * index) / 240),
      ...keyTimesS,
    ],
    durationS,
  );
  const samples = sampleTimes.map(stateAt);
  const initial = stateAt(0);
  const final = stateAt(durationS);

  return {
    params,
    issue,
    k,
    alphaPerS,
    terminalVelocityMps,
    boundaryTimeS,
    durationS,
    events,
    keyTimesS,
    samples,
    initial,
    final,
    boundaryState,
    zeroVelocityTimeS,
  };
}

export function rodStateAt(solution: RodSolution, timeS: number): RodSnapshot {
  const safeTime = Number.isFinite(timeS) ? clamp(timeS, 0, solution.durationS) : 0;
  if (
    solution.boundaryTimeS !== null &&
    solution.boundaryState &&
    safeTime >= solution.boundaryTimeS - 1e-10
  ) {
    return { ...solution.boundaryState, tS: safeTime };
  }
  return preContactState(
    solution.params,
    solution.k,
    solution.alphaPerS,
    solution.terminalVelocityMps,
    solution.boundaryTimeS,
    safeTime,
  );
}

export function downsampleRodSamples(samples: RodSnapshot[], maxPoints = 240): RodSnapshot[] {
  if (samples.length <= maxPoints) return samples;
  const stride = (samples.length - 1) / (maxPoints - 1);
  const points: RodSnapshot[] = [];
  for (let index = 0; index < maxPoints; index++) {
    points.push(samples[Math.round(index * stride)]);
  }
  return points;
}
