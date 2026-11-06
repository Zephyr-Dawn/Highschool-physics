/**
 * I08: AC generator with a rigid N-turn coil rotating in a static uniform B.
 *
 * Conventions (same as I01/I04/I05/I07):
 * - +z out of the page; negative current is the opposite sense.
 * - theta is the signed angle between the coil normal and B (not the plane angle).
 * - Phi = B A cos(theta) per turn; Psi = N Phi.
 * - emf = -dPsi/dt = N B A omega sin(theta).
 * - Positive current follows the right-hand circuit orientation.
 * - The circuit is purely resistive: load R_L in series with internal r.
 * - The motion is prescribed; no self-inductance, friction, or angular dynamics.
 */

export interface GeneratorParams {
  turns: number;
  areaM2: number;
  bTesla: number;
  theta0Rad: number;
  omegaRadPerS: number;
  loadResistanceOhm: number;
  internalResistanceOhm: number;
  circuitClosed: boolean;
  durationS: number;
}

export interface CircuitSwitchEvent {
  timeS: number;
  closed: boolean;
}

export interface GeneratorEnergy {
  driveJ: number;
  loadJ: number;
  internalJ: number;
  residualJ: number | null;
  estimated?: boolean;
}

export interface GeneratorSnapshot {
  timeS: number;
  thetaRad: number;
  thetaWrappedRad: number;
  fluxWb: number;
  linkageWbTurn: number;
  emfV: number;
  currentA: number | null;
  torqueEmNm: number;
  torqueDriveNm: number;
  pGenerationW: number;
  pDriveW: number;
  pLoadW: number;
  pInternalW: number;
  emfPeakV: number;
  emfRmsV: number | null;
  currentPeakA: number | null;
  currentRmsA: number | null;
  frequencyHz: number | null;
  periodS: number | null;
  omegaRadPerS: number;
  energy: GeneratorEnergy;
  status: 'active' | 'open-circuit' | 'short-circuit' | 'zero-field' | 'zero-speed';
  eventFlags: string[];
  approximation?: string;
  issues: string[];
}

export interface GeneratorSolution {
  params: GeneratorParams;
  timeline: CircuitSwitchEvent[];
  initial: GeneratorSnapshot;
  final: GeneratorSnapshot;
  samples: GeneratorSnapshot[];
  keyTimesS: number[];
  durationS: number;
  status: 'ok' | 'invalid';
  issue: string | null;
}

export interface GeneratorValidation {
  valid: boolean;
  params: GeneratorParams | null;
  issues: string[];
}

const TWO_PI = 2 * Math.PI;
const MAX_TURNS = 10000;
const MAX_DURATION_S = 60;
const MAX_OMEGA = 1e6;
const MAX_B = 100;
const MAX_AREA = 1e4;
const MAX_RESISTANCE = 1e9;
const EPS = 1e-12;

export const GENERATOR_DEFAULT: GeneratorParams = {
  turns: 10,
  areaM2: 0.02,
  bTesla: 0.5,
  theta0Rad: 0,
  omegaRadPerS: 2 * Math.PI,
  loadResistanceOhm: 4,
  internalResistanceOhm: 1,
  circuitClosed: true,
  durationS: 1,
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function wrapAngle(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

export function validateGeneratorParams(input: GeneratorParams): GeneratorValidation {
  const issues: string[] = [];
  for (const [label, value] of [
    ['N', input.turns],
    ['A', input.areaM2],
    ['B', input.bTesla],
    ['θ₀', input.theta0Rad],
    ['ω', input.omegaRadPerS],
    ['R_L', input.loadResistanceOhm],
    ['r', input.internalResistanceOhm],
    ['时长', input.durationS],
  ] as const) {
    if (!finite(value)) issues.push(`${label} 必须是有限数值。`);
  }
  if (issues.length > 0) return { valid: false, params: null, issues };
  if (!Number.isInteger(input.turns) || input.turns < 1 || input.turns > MAX_TURNS) {
    issues.push(`匝数 N 必须为 1–${MAX_TURNS} 的整数。`);
  }
  if (input.areaM2 <= 0 || input.areaM2 > MAX_AREA) {
    issues.push(`线圈面积 A 必须为正且不超过 ${MAX_AREA} m²。`);
  }
  if (Math.abs(input.bTesla) > MAX_B) issues.push(`|B| 超出稳定范围（≤${MAX_B} T）。`);
  if (Math.abs(input.omegaRadPerS) > MAX_OMEGA) issues.push(`|ω| 超出稳定范围（≤${MAX_OMEGA} rad/s）。`);
  if (input.loadResistanceOhm < 0 || input.loadResistanceOhm > MAX_RESISTANCE) {
    issues.push('负载电阻 R_L 必须为非负有限值。');
  }
  if (input.internalResistanceOhm < 0 || input.internalResistanceOhm > MAX_RESISTANCE) {
    issues.push('内阻 r 必须为非负有限值。');
  }
  if (input.loadResistanceOhm + input.internalResistanceOhm <= 0) {
    issues.push('总电阻 R_L+r 必须严格大于 0（R_L=0 且 r>0 是合法短路）。');
  }
  if (input.durationS < 0.2 || input.durationS > MAX_DURATION_S) {
    issues.push(`演示时长必须在 0.2–${MAX_DURATION_S} s 内。`);
  }
  if (typeof input.circuitClosed !== 'boolean') issues.push('circuitClosed 必须为布尔值。');
  if (issues.length > 0) return { valid: false, params: null, issues };
  return { valid: true, params: { ...input }, issues: [] };
}

export function totalResistance(params: Pick<GeneratorParams, 'loadResistanceOhm' | 'internalResistanceOhm'>): number {
  return params.loadResistanceOhm + params.internalResistanceOhm;
}

export function normalizeCircuitTimeline(
  events: CircuitSwitchEvent[] | undefined,
  initialClosed: boolean,
  durationS: number,
): CircuitSwitchEvent[] {
  const source = events ?? [];
  const normalized: CircuitSwitchEvent[] = [{ timeS: 0, closed: initialClosed }];
  for (const event of source) {
    if (!Number.isFinite(event.timeS) || typeof event.closed !== 'boolean') continue;
    const time = Math.max(0, Math.min(durationS, event.timeS));
    if (time === 0) {
      normalized[0] = { timeS: 0, closed: event.closed };
    } else if (time < durationS - EPS) {
      normalized.push({ timeS: time, closed: event.closed });
    }
  }
  normalized.sort((a, b) => a.timeS - b.timeS);
  const deduped: CircuitSwitchEvent[] = [];
  for (const event of normalized) {
    if (deduped.length > 0 && Math.abs(deduped[deduped.length - 1].timeS - event.timeS) < 1e-10) {
      deduped[deduped.length - 1] = event;
    } else {
      deduped.push(event);
    }
  }
  return deduped;
}

export function circuitClosedAt(timeline: CircuitSwitchEvent[], timeS: number): boolean {
  let closed = timeline[0]?.closed ?? true;
  for (const event of timeline) {
    if (event.timeS <= timeS + 1e-10) closed = event.closed;
    else break;
  }
  return closed;
}

/**
 * ∫_0^t sin²(theta0 + omega s) ds.
 * For omega≈0 the sin(omega t)/omega quotient is evaluated by a stable series.
 */
export function integralSinSquared(theta0: number, omega: number, timeS: number): number {
  const t = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
  if (t <= 0) return 0;
  if (!Number.isFinite(omega) || Math.abs(omega) <= 1e-18) {
    return t * Math.sin(theta0) ** 2;
  }
  const z = omega * t;
  const quotient = Math.abs(z) < 1e-4
    ? t * (1 - z * z / 6 + z ** 4 / 120)
    : Math.sin(z) / omega;
  return t / 2 - Math.cos(2 * theta0 + z) * quotient / 2;
}

export function generatorEnergyAt(
  params: GeneratorParams,
  timeS: number,
  timeline?: CircuitSwitchEvent[],
): GeneratorEnergy {
  const t = Number.isFinite(timeS) ? Math.max(0, Math.min(params.durationS, timeS)) : 0;
  if (t <= 0) return { driveJ: 0, loadJ: 0, internalJ: 0, residualJ: 0 };
  const rTotal = totalResistance(params);
  if (!(rTotal > 0) || !Number.isFinite(rTotal)) {
    return { driveJ: 0, loadJ: 0, internalJ: 0, residualJ: null };
  }
  const normalized = normalizeCircuitTimeline(timeline, params.circuitClosed, params.durationS);
  const peak = params.turns * Math.abs(params.bTesla) * params.areaM2 * Math.abs(params.omegaRadPerS);
  const factor = (peak * peak) / rTotal;
  let driveJ = 0;
  for (let index = 0; index < normalized.length; index++) {
    const start = normalized[index].timeS;
    const end = index + 1 < normalized.length
      ? Math.min(t, normalized[index + 1].timeS)
      : t;
    if (end <= start + EPS || !normalized[index].closed) continue;
    const thetaAtStart = params.theta0Rad + params.omegaRadPerS * start;
    driveJ += factor * integralSinSquared(thetaAtStart, params.omegaRadPerS, end - start);
  }
  const loadJ = driveJ * (params.loadResistanceOhm / rTotal);
  const internalJ = driveJ * (params.internalResistanceOhm / rTotal);
  return {
    driveJ: Math.max(0, nz(driveJ)),
    loadJ: Math.max(0, nz(loadJ)),
    internalJ: Math.max(0, nz(internalJ)),
    residualJ: nz(driveJ - loadJ - internalJ),
  };
}

export interface GeneratorSnapshotOptions {
  rmsMode?: 'analytic' | 'none';
  approximation?: string;
  issues?: string[];
}

export function computeGeneratorSnapshot(
  params: GeneratorParams,
  timeS: number,
  thetaRad: number,
  omegaRadPerS: number,
  energy: GeneratorEnergy,
  options: GeneratorSnapshotOptions = {},
): GeneratorSnapshot {
  const closed = params.circuitClosed;
  const rTotal = totalResistance(params);
  const fluxWb = nz(params.bTesla * params.areaM2 * Math.cos(thetaRad));
  const linkageWbTurn = nz(params.turns * fluxWb);
  const emfV = nz(params.turns * params.bTesla * params.areaM2 * omegaRadPerS * Math.sin(thetaRad));
  const currentA = closed && rTotal > 0 ? nz(emfV / rTotal) : 0;
  const pLoadW = closed ? nz(currentA * currentA * params.loadResistanceOhm) : 0;
  const pInternalW = closed ? nz(currentA * currentA * params.internalResistanceOhm) : 0;
  const pGenerationW = closed ? nz(emfV * currentA) : 0;
  const torqueEmNm = closed ? nz(-params.turns * params.bTesla * params.areaM2 * currentA * Math.sin(thetaRad)) : 0;
  const torqueDriveNm = closed ? nz(-torqueEmNm) : 0;
  const pDriveW = closed ? nz(pGenerationW) : 0;
  const emfPeakV = nz(params.turns * Math.abs(params.bTesla) * params.areaM2 * Math.abs(omegaRadPerS));
  const rmsMode = options.rmsMode ?? 'analytic';
  const angularSpeed = Math.abs(omegaRadPerS);
  const emfRmsV = rmsMode === 'analytic' && angularSpeed > 0 ? nz(emfPeakV / Math.SQRT2) : null;
  const currentRmsA = rmsMode === 'analytic' && closed && angularSpeed > 0 && rTotal > 0
    ? nz(emfPeakV / rTotal / Math.SQRT2)
    : null;
  const currentPeakA = closed && rTotal > 0 ? nz(emfPeakV / rTotal) : null;
  const frequencyHz = angularSpeed > 0 ? angularSpeed / TWO_PI : null;
  const periodS = angularSpeed > 0 ? TWO_PI / angularSpeed : null;
  const eventFlags: string[] = [];
  if (!closed) eventFlags.push('open-circuit');
  if (closed && params.loadResistanceOhm === 0) eventFlags.push('short-circuit');
  if (Math.abs(params.bTesla) <= EPS) eventFlags.push('zero-field');
  if (angularSpeed <= EPS) eventFlags.push('zero-speed');
  if (Math.abs(Math.sin(thetaRad)) <= 1e-12) eventFlags.push('zero-emf-phase');
  if (Math.abs(Math.cos(thetaRad)) <= 1e-12) eventFlags.push('maximum-emf-phase');
  const status = !closed
    ? 'open-circuit'
    : params.loadResistanceOhm === 0
      ? 'short-circuit'
      : Math.abs(params.bTesla) <= EPS
        ? 'zero-field'
        : angularSpeed <= EPS
          ? 'zero-speed'
          : 'active';
  return {
    timeS,
    thetaRad,
    thetaWrappedRad: wrapAngle(thetaRad),
    fluxWb,
    linkageWbTurn,
    emfV,
    currentA: closed ? currentA : 0,
    torqueEmNm,
    torqueDriveNm,
    pGenerationW,
    pDriveW,
    pLoadW,
    pInternalW,
    emfPeakV,
    emfRmsV,
    currentPeakA,
    currentRmsA,
    frequencyHz,
    periodS,
    omegaRadPerS,
    energy,
    status,
    eventFlags,
    approximation: options.approximation,
    issues: options.issues ?? [],
  };
}

export function generatorStateAt(
  params: GeneratorParams,
  timeS: number,
  timeline?: CircuitSwitchEvent[],
): GeneratorSnapshot {
  const t = Number.isFinite(timeS) ? Math.max(0, Math.min(params.durationS, timeS)) : 0;
  const normalized = normalizeCircuitTimeline(timeline, params.circuitClosed, params.durationS);
  const closed = circuitClosedAt(normalized, t);
  const theta = params.theta0Rad + params.omegaRadPerS * t;
  const energy = generatorEnergyAt(params, t, normalized);
  return computeGeneratorSnapshot(
    { ...params, circuitClosed: closed },
    t,
    theta,
    params.omegaRadPerS,
    energy,
  );
}

function keyTimesFor(params: GeneratorParams, timeline: CircuitSwitchEvent[]): number[] {
  const times = new Set<number>([0, params.durationS]);
  const period = Math.abs(params.omegaRadPerS) > 0 ? TWO_PI / Math.abs(params.omegaRadPerS) : null;
  if (period !== null) {
    for (let index = 1; index <= 8; index++) {
      const time = (period * index) / 8;
      if (time < params.durationS - 1e-10) times.add(time);
    }
  }
  for (const event of timeline) {
    if (event.timeS > 0 && event.timeS < params.durationS - 1e-10) times.add(event.timeS);
  }
  return [...times].sort((a, b) => a - b);
}

export function solveGenerator(
  paramsInput: GeneratorParams,
  timelineInput?: CircuitSwitchEvent[],
): GeneratorSolution {
  const validation = validateGeneratorParams(paramsInput);
  if (!validation.valid || !validation.params) {
    const fallback = { ...GENERATOR_DEFAULT, durationS: 1 };
    const energy: GeneratorEnergy = { driveJ: 0, loadJ: 0, internalJ: 0, residualJ: 0 };
    const state = computeGeneratorSnapshot(fallback, 0, fallback.theta0Rad, fallback.omegaRadPerS, energy, {
      issues: validation.issues,
    });
    return {
      params: fallback,
      timeline: [{ timeS: 0, closed: fallback.circuitClosed }],
      initial: state,
      final: state,
      samples: [state],
      keyTimesS: [0, 1],
      durationS: 1,
      status: 'invalid',
      issue: validation.issues.join(' '),
    };
  }
  const params = validation.params;
  const timeline = normalizeCircuitTimeline(timelineInput, params.circuitClosed, params.durationS);
  const samples: GeneratorSnapshot[] = [];
  const count = 720;
  for (let index = 0; index <= count; index++) {
    samples.push(generatorStateAt(params, (params.durationS * index) / count, timeline));
  }
  const initial = generatorStateAt(params, 0, timeline);
  const final = generatorStateAt(params, params.durationS, timeline);
  return {
    params,
    timeline,
    initial,
    final,
    samples,
    keyTimesS: keyTimesFor(params, timeline),
    durationS: params.durationS,
    status: 'ok',
    issue: null,
  };
}
