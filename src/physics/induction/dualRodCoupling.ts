/**
 * I06: two independent conducting rods on ideal parallel rails.
 *
 * Conventions:
 * - +z is out of the page; Bz > 0 is drawn as dots.
 * - Positive current is counter-clockwise seen from +z.
 * - Rod 1 is the left rod (x1), rod 2 the right rod (x2), always x2 > x1.
 * - A single loop is formed by both rods and both rails; there is one current.
 * - The field is static and spatially uniform. Time-varying B belongs to I05.
 */

export type DualRodMode = 'free' | 'forces' | 'manual-rod1' | 'manual-rod2';
export type DualRodStatus =
  | 'active'
  | 'open-circuit'
  | 'contact-stop'
  | 'invalid'
  | 'solver-limited';

export interface DualRodParams {
  mode: DualRodMode;
  BzTesla: number;
  lengthM: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  mass1Kg: number;
  mass2Kg: number;
  x1M: number;
  x2M: number;
  v1Mps: number;
  v2Mps: number;
  force1N: number;
  force2N: number;
  durationS: number;
}

export interface DualRodState {
  timeS: number;
  x1M: number;
  x2M: number;
  v1Mps: number;
  v2Mps: number;
  a1Mps2: number | null;
  a2Mps2: number | null;
  jouleHeatJ: number;
  externalWorkJ: number;
}

export interface DualRodSnapshot {
  timeS: number;
  rod1: { x: number; v: number; a: number | null; massKg: number };
  rod2: { x: number; v: number; a: number | null; massKg: number };
  separationM: number;
  relativeVelocityMS: number;
  centerOfMassVelocityMS: number;
  centerOfMassPositionM: number;
  fluxWb: number;
  emfRod1V: number;
  emfRod2V: number;
  emfTotalV: number;
  currentA: number;
  forceRod1N: number;
  forceRod2N: number;
  magneticPowerW: number;
  joulePowerW: number;
  externalPowerW: number;
  kineticEnergyJ: number;
  totalMomentumKgMS: number;
  jouleHeatJ: number;
  externalWorkJ: number;
  energyResidualJ: number | null;
  status: DualRodStatus;
  eventFlags: string[];
  approximation?: string;
  issue?: string;
}

export interface DualRodEvent {
  kind: 'contact' | 'relative-velocity-zero' | 'start' | 'end';
  timeS: number;
  label: string;
  separationM: number;
  relativeVelocityMS: number;
  currentA: number;
}

export interface DualRodSolution {
  params: DualRodParams;
  k: number;
  alpha: number;
  centerOfMassVelocity0: number;
  centerOfMassAcceleration: number;
  relativeVelocity0: number;
  relativeVelocityInfinity: number | null;
  initial: DualRodSnapshot;
  final: DualRodSnapshot;
  samples: DualRodSnapshot[];
  events: DualRodEvent[];
  keyTimesS: number[];
  durationS: number;
  contactTimeS: number | null;
  status: DualRodStatus;
  issue: string | null;
}

export interface DualRodValidation {
  valid: boolean;
  params: DualRodParams | null;
  issues: string[];
}

const EPS = 1e-12;
const MAX_DURATION_S = 60;
const MAX_SAMPLES = 900;
const CONTACT_SCAN_POINTS = 4096;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function validateDualRodParams(input: DualRodParams): DualRodValidation {
  const issues: string[] = [];
  const numeric: Array<[keyof DualRodParams, unknown]> = [
    ['BzTesla', input.BzTesla],
    ['lengthM', input.lengthM],
    ['resistanceOhm', input.resistanceOhm],
    ['mass1Kg', input.mass1Kg],
    ['mass2Kg', input.mass2Kg],
    ['x1M', input.x1M],
    ['x2M', input.x2M],
    ['v1Mps', input.v1Mps],
    ['v2Mps', input.v2Mps],
    ['force1N', input.force1N],
    ['force2N', input.force2N],
    ['durationS', input.durationS],
  ];
  for (const [key, value] of numeric) {
    if (!finite(value)) issues.push(`${String(key)} 必须是有限数值。`);
  }
  if (issues.length > 0) return { valid: false, params: null, issues };
  if (!['free', 'forces', 'manual-rod1', 'manual-rod2'].includes(input.mode)) {
    issues.push('未知的双棒运动模式。');
  }
  if (input.lengthM <= 0) issues.push('导轨间距 L 必须严格大于 0。');
  if (input.resistanceOhm <= 0) issues.push('回路总电阻 R 必须严格大于 0（忽略自感的理想模型）。');
  if (input.mass1Kg <= 0) issues.push('杆 1 质量 m₁ 必须严格大于 0。');
  if (input.mass2Kg <= 0) issues.push('杆 2 质量 m₂ 必须严格大于 0。');
  if (!(input.x2M > input.x1M)) issues.push('必须保持 x₂ > x₁，不能自动交换两根杆。');
  if (input.durationS <= 0 || input.durationS > MAX_DURATION_S) {
    issues.push(`演示时长必须在 (0, ${MAX_DURATION_S}] s 内。`);
  }
  if (Math.abs(input.BzTesla) > 100) issues.push('|Bz| 超出本模型的稳定计算范围（≤100 T）。');
  if (input.lengthM > 1e4) issues.push('导轨间距超出稳定计算范围。');
  if (input.resistanceOhm < 1e-9 || input.resistanceOhm > 1e9) {
    issues.push('总电阻超出稳定计算范围（1e-9…1e9 Ω）。');
  }
  if (input.mass1Kg < 1e-12 || input.mass2Kg < 1e-12) {
    issues.push('杆质量低于稳定计算下限。');
  }
  if (Math.abs(input.v1Mps) > 1e7 || Math.abs(input.v2Mps) > 1e7) {
    issues.push('速度超出本模型的稳定计算范围。');
  }
  if (Math.abs(input.force1N) > 1e9 || Math.abs(input.force2N) > 1e9) {
    issues.push('外力超出本模型的稳定计算范围。');
  }
  if (issues.length > 0) return { valid: false, params: null, issues };
  return { valid: true, params: { ...input }, issues: [] };
}

export function dualRodK(params: Pick<DualRodParams, 'BzTesla' | 'lengthM' | 'resistanceOhm' | 'circuitClosed'>): number {
  if (!params.circuitClosed) return 0;
  return (params.BzTesla * params.lengthM) ** 2 / params.resistanceOhm;
}

export function dualRodElectromagneticSnapshot(
  params: DualRodParams,
  state: DualRodState,
): DualRodSnapshot {
  const emfRod1V = nz(params.BzTesla * params.lengthM * state.v1Mps);
  const emfRod2V = nz(-params.BzTesla * params.lengthM * state.v2Mps);
  const emfTotalV = nz(emfRod1V + emfRod2V);
  const currentA = params.circuitClosed ? nz(emfTotalV / params.resistanceOhm) : 0;
  const forceRod1N = params.circuitClosed ? nz(-currentA * params.BzTesla * params.lengthM) : 0;
  const forceRod2N = params.circuitClosed ? nz(currentA * params.BzTesla * params.lengthM) : 0;
  const separationM = state.x2M - state.x1M;
  const relativeVelocityMS = state.v2Mps - state.v1Mps;
  const totalMass = params.mass1Kg + params.mass2Kg;
  const kineticEnergyJ =
    0.5 * params.mass1Kg * state.v1Mps ** 2 + 0.5 * params.mass2Kg * state.v2Mps ** 2;
  const magneticPowerW = nz(forceRod1N * state.v1Mps + forceRod2N * state.v2Mps);
  const joulePowerW = params.circuitClosed ? nz(currentA * currentA * params.resistanceOhm) : 0;
  const externalPowerW = nz(params.force1N * state.v1Mps + params.force2N * state.v2Mps);
  const initialKinetic =
    0.5 * params.mass1Kg * params.v1Mps ** 2 + 0.5 * params.mass2Kg * params.v2Mps ** 2;
  const residual =
    params.mode === 'manual-rod1' || params.mode === 'manual-rod2'
      ? null
      : nz(
          kineticEnergyJ -
            initialKinetic +
            state.jouleHeatJ -
            state.externalWorkJ,
        );
  const eventFlags: string[] = [];
  if (!params.circuitClosed) eventFlags.push('open-circuit');
  if (Math.abs(separationM) <= EPS) eventFlags.push('contact');
  if (Math.abs(relativeVelocityMS) <= 1e-10) eventFlags.push('zero-relative-velocity');
  return {
    timeS: state.timeS,
    rod1: { x: state.x1M, v: state.v1Mps, a: state.a1Mps2, massKg: params.mass1Kg },
    rod2: { x: state.x2M, v: state.v2Mps, a: state.a2Mps2, massKg: params.mass2Kg },
    separationM,
    relativeVelocityMS,
    centerOfMassVelocityMS: (params.mass1Kg * state.v1Mps + params.mass2Kg * state.v2Mps) / totalMass,
    centerOfMassPositionM: (params.mass1Kg * state.x1M + params.mass2Kg * state.x2M) / totalMass,
    fluxWb: nz(params.BzTesla * params.lengthM * separationM),
    emfRod1V,
    emfRod2V,
    emfTotalV,
    currentA,
    forceRod1N,
    forceRod2N,
    magneticPowerW,
    joulePowerW,
    externalPowerW,
    kineticEnergyJ,
    totalMomentumKgMS: params.mass1Kg * state.v1Mps + params.mass2Kg * state.v2Mps,
    jouleHeatJ: state.jouleHeatJ,
    externalWorkJ: state.externalWorkJ,
    energyResidualJ: residual,
    status: !params.circuitClosed ? 'open-circuit' : 'active',
    eventFlags,
    approximation:
      params.mode === 'manual-rod1' || params.mode === 'manual-rod2'
        ? '手动手势速度由单调时间戳样本估计；不提供精确手部作用力或能量残差。'
        : undefined,
  };
}

interface AnalyticCoefficients {
  params: DualRodParams;
  k: number;
  alpha: number;
  vcm0: number;
  acm: number;
  deltaV0: number;
  source: number;
  deltaVInf: number | null;
  xcm0: number;
  d0: number;
}

function coefficients(params: DualRodParams): AnalyticCoefficients {
  const k = dualRodK(params);
  const alpha = k * (1 / params.mass1Kg + 1 / params.mass2Kg);
  const totalMass = params.mass1Kg + params.mass2Kg;
  return {
    params,
    k,
    alpha,
    vcm0: (params.mass1Kg * params.v1Mps + params.mass2Kg * params.v2Mps) / totalMass,
    acm: (params.force1N + params.force2N) / totalMass,
    deltaV0: params.v2Mps - params.v1Mps,
    source: params.force2N / params.mass2Kg - params.force1N / params.mass1Kg,
    deltaVInf: alpha > 1e-14 ? (params.force2N / params.mass2Kg - params.force1N / params.mass1Kg) / alpha : null,
    xcm0:
      (params.mass1Kg * params.x1M + params.mass2Kg * params.x2M) / totalMass,
    d0: params.x2M - params.x1M,
  };
}

function relativeVelocityAt(c: AnalyticCoefficients, t: number): number {
  if (c.alpha > 1e-14 && c.deltaVInf !== null) {
    return c.deltaVInf + (c.deltaV0 - c.deltaVInf) * Math.exp(-c.alpha * t);
  }
  return c.deltaV0 + c.source * t;
}

function relativeDisplacementAt(c: AnalyticCoefficients, t: number): number {
  if (c.alpha > 1e-14 && c.deltaVInf !== null) {
    const b = c.deltaV0 - c.deltaVInf;
    const oneMinus = -Math.expm1(-c.alpha * t);
    return c.deltaVInf * t + (b * oneMinus) / c.alpha;
  }
  return c.deltaV0 * t + 0.5 * c.source * t * t;
}

function separationAt(c: AnalyticCoefficients, t: number): number {
  return c.d0 + relativeDisplacementAt(c, t);
}

function velocityAt(c: AnalyticCoefficients, t: number): { v1: number; v2: number; x1: number; x2: number } {
  const totalMass = c.params.mass1Kg + c.params.mass2Kg;
  const vcm = c.vcm0 + c.acm * t;
  const deltaV = relativeVelocityAt(c, t);
  const v1 = vcm - (c.params.mass2Kg / totalMass) * deltaV;
  const v2 = vcm + (c.params.mass1Kg / totalMass) * deltaV;
  const xcm = c.xcm0 + c.vcm0 * t + 0.5 * c.acm * t * t;
  const d = c.d0 + relativeDisplacementAt(c, t);
  return {
    v1,
    v2,
    x1: xcm - (c.params.mass2Kg / totalMass) * d,
    x2: xcm + (c.params.mass1Kg / totalMass) * d,
  };
}

function jouleHeatAt(c: AnalyticCoefficients, t: number): number {
  if (!c.params.circuitClosed || c.k <= 0) return 0;
  if (c.alpha > 1e-14 && c.deltaVInf !== null) {
    const a = c.deltaVInf;
    const b = c.deltaV0 - c.deltaVInf;
    const oneMinusA = -Math.expm1(-c.alpha * t);
    const oneMinus2A = -Math.expm1(-2 * c.alpha * t);
    return c.k * (a * a * t + (2 * a * b * oneMinusA) / c.alpha + (b * b * oneMinus2A) / (2 * c.alpha));
  }
  // alpha = 0 only when k = 0, hence the Joule heat is zero.
  return 0;
}

function externalWorkAt(c: AnalyticCoefficients, t: number): number {
  const state = velocityAt(c, t);
  return c.params.force1N * (state.x1 - c.params.x1M) + c.params.force2N * (state.x2 - c.params.x2M);
}

function findContactTime(c: AnalyticCoefficients, durationS: number): number | null {
  if (c.d0 <= 0) return 0;
  let previousT = 0;
  for (let index = 1; index <= CONTACT_SCAN_POINTS; index++) {
    const t = (durationS * index) / CONTACT_SCAN_POINTS;
    const d = separationAt(c, t);
    if (d <= 0) {
      let low = previousT;
      let high = t;
      for (let iteration = 0; iteration < 80; iteration++) {
        const mid = 0.5 * (low + high);
        if (separationAt(c, mid) > 0) low = mid;
        else high = mid;
      }
      return 0.5 * (low + high);
    }
    previousT = t;
  }
  return null;
}

function findRelativeVelocityZero(c: AnalyticCoefficients, durationS: number): number | null {
  if (Math.abs(c.deltaV0) < 1e-12) return 0;
  if (Math.abs(relativeVelocityAt(c, durationS)) < 1e-12) return durationS;
  if (c.alpha > 1e-14 && c.deltaVInf !== null) {
    const b = c.deltaV0 - c.deltaVInf;
    if (Math.abs(b) < 1e-14) return null;
    const ratio = -c.deltaVInf / b;
    if (ratio <= 0 || ratio >= 1) return null;
    const t = -Math.log(ratio) / c.alpha;
    return t > 0 && t < durationS ? t : null;
  }
  if (Math.abs(c.source) < 1e-14) return null;
  const t = -c.deltaV0 / c.source;
  return t > 0 && t < durationS ? t : null;
}

function snapshotAt(c: AnalyticCoefficients, t: number, contactTime: number | null): DualRodSnapshot {
  const state = velocityAt(c, t);
  const q = jouleHeatAt(c, t);
  const w = externalWorkAt(c, t);
  const status: DualRodStatus = contactTime !== null && t >= contactTime - 1e-12
    ? 'contact-stop'
    : c.params.circuitClosed
      ? 'active'
      : 'open-circuit';
  const snap = dualRodElectromagneticSnapshot(c.params, {
    timeS: t,
    x1M: state.x1,
    x2M: state.x2,
    v1Mps: state.v1,
    v2Mps: state.v2,
    a1Mps2: (c.params.force1N + (c.params.circuitClosed ? -c.k * (state.v2 - state.v1) : 0)) / c.params.mass1Kg,
    a2Mps2: (c.params.force2N + (c.params.circuitClosed ? c.k * (state.v2 - state.v1) : 0)) / c.params.mass2Kg,
    jouleHeatJ: q,
    externalWorkJ: w,
  });
  return { ...snap, status };
}

export function solveDualRod(input: DualRodParams): DualRodSolution {
  const validation = validateDualRodParams(input);
  if (!validation.valid || !validation.params) {
    const fallback: DualRodParams = {
      ...input,
      mode: 'free',
      BzTesla: 0,
      lengthM: 1,
      resistanceOhm: 1,
      mass1Kg: 1,
      mass2Kg: 1,
      x1M: 0,
      x2M: 1,
      v1Mps: 0,
      v2Mps: 0,
      force1N: 0,
      force2N: 0,
      durationS: 1,
    };
    const initial = dualRodElectromagneticSnapshot(fallback, {
      timeS: 0,
      x1M: 0,
      x2M: 1,
      v1Mps: 0,
      v2Mps: 0,
      a1Mps2: null,
      a2Mps2: null,
      jouleHeatJ: 0,
      externalWorkJ: 0,
    });
    return {
      params: fallback,
      k: 0,
      alpha: 0,
      centerOfMassVelocity0: 0,
      centerOfMassAcceleration: 0,
      relativeVelocity0: 0,
      relativeVelocityInfinity: null,
      initial: { ...initial, status: 'invalid', issue: validation.issues.join(' ') },
      final: { ...initial, status: 'invalid', issue: validation.issues.join(' ') },
      samples: [{ ...initial, status: 'invalid', issue: validation.issues.join(' ') }],
      events: [],
      keyTimesS: [0],
      durationS: 1,
      contactTimeS: null,
      status: 'invalid',
      issue: validation.issues.join(' '),
    };
  }

  const params = validation.params;
  const c = coefficients(params);
  const manual = params.mode === 'manual-rod1' || params.mode === 'manual-rod2';
  const contact = manual ? null : findContactTime(c, params.durationS);
  const durationS = contact !== null ? contact : params.durationS;
  const status: DualRodStatus = contact !== null
    ? 'contact-stop'
    : !params.circuitClosed
      ? 'open-circuit'
      : 'active';
  const initial = snapshotAt(c, 0, contact);
  const final = snapshotAt(c, durationS, contact);
  const events: DualRodEvent[] = [
    {
      kind: 'start',
      timeS: 0,
      label: '两杆初态',
      separationM: c.d0,
      relativeVelocityMS: c.deltaV0,
      currentA: initial.currentA,
    },
  ];
  const relativeZero = findRelativeVelocityZero(c, durationS);
  if (relativeZero !== null && relativeZero > 1e-9 && relativeZero < durationS - 1e-9) {
    events.push({
      kind: 'relative-velocity-zero',
      timeS: relativeZero,
      label: '两杆瞬时速度相等：I = 0',
      separationM: separationAt(c, relativeZero),
      relativeVelocityMS: 0,
      currentA: 0,
    });
  }
  if (contact !== null) {
    events.push({
      kind: 'contact',
      timeS: contact,
      label: '两杆到达接触间距：解析解停止，不模拟碰撞',
      separationM: 0,
      relativeVelocityMS: relativeVelocityAt(c, contact),
      currentA: snapshotAt(c, contact, contact).currentA,
    });
  }
  events.push({
    kind: 'end',
    timeS: durationS,
    label: contact !== null ? '接触停止' : '演示结束',
    separationM: final.separationM,
    relativeVelocityMS: final.relativeVelocityMS,
    currentA: final.currentA,
  });

  const timeSet = new Set<number>([0, durationS, ...events.map((event) => event.timeS)]);
  for (let index = 0; index < 9; index++) timeSet.add((durationS * index) / 8);
  const times = [...timeSet].filter((t) => t >= 0 && t <= durationS + 1e-12).sort((a, b) => a - b);
  const samples: DualRodSnapshot[] = [];
  const sampleCount = Math.min(MAX_SAMPLES, Math.max(times.length, 161));
  for (let index = 0; index < sampleCount; index++) {
    const t = (durationS * index) / (sampleCount - 1);
    samples.push(snapshotAt(c, t, contact));
  }
  for (const event of events) {
    samples.push(snapshotAt(c, event.timeS, contact));
  }
  samples.sort((a, b) => a.timeS - b.timeS);
  const deduped: DualRodSnapshot[] = [];
  for (const sample of samples) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.timeS - sample.timeS) <= 1e-12) deduped[deduped.length - 1] = sample;
    else deduped.push(sample);
  }

  const issue = !params.circuitClosed
    ? '开路：感应电动势存在，但 I = 0、P_J = 0、两杆不受磁场力。'
    : Math.abs(params.BzTesla) < 1e-15
      ? 'B = 0：无磁耦合，两杆按外力自由运动。'
      : contact !== null
        ? '两杆在接触间距处停止；未模拟弹性碰撞或碰撞耗能。'
        : null;

  return {
    params,
    k: c.k,
    alpha: c.alpha,
    centerOfMassVelocity0: c.vcm0,
    centerOfMassAcceleration: c.acm,
    relativeVelocity0: c.deltaV0,
    relativeVelocityInfinity: c.deltaVInf,
    initial,
    final,
    samples: deduped,
    events,
    keyTimesS: [...new Set(deduped.map((s) => Math.round(s.timeS * 1e9) / 1e9))].sort((a, b) => a - b),
    durationS,
    contactTimeS: contact,
    status,
    issue,
  };
}

export function stateAtDualRodTime(solution: DualRodSolution, timeS: number): DualRodSnapshot {
  if (solution.status === 'invalid') return solution.initial;
  if (solution.params.mode === 'manual-rod1' || solution.params.mode === 'manual-rod2') {
    return solution.initial;
  }
  const t = Number.isFinite(timeS)
    ? Math.max(0, Math.min(solution.durationS, timeS))
    : 0;
  const c = coefficients(solution.params);
  return snapshotAt(c, t, solution.contactTimeS);
}

export function dualRodCurrentDirection(currentA: number): 'counterclockwise' | 'clockwise' | 'none' {
  if (Math.abs(currentA) < 1e-12) return 'none';
  return currentA > 0 ? 'counterclockwise' : 'clockwise';
}

export function formatDualRodCurrentDirection(currentA: number): string {
  const direction = dualRodCurrentDirection(currentA);
  if (direction === 'none') return '无感应电流';
  return direction === 'counterclockwise' ? '逆时针（从纸外看）' : '顺时针（从纸外看）';
}

export const DUAL_ROD_DEFAULT: DualRodParams = {
  mode: 'free',
  BzTesla: 1,
  lengthM: 1,
  resistanceOhm: 2,
  circuitClosed: true,
  mass1Kg: 1,
  mass2Kg: 1,
  x1M: 0,
  x2M: 3,
  v1Mps: 0,
  v2Mps: 2,
  force1N: 0,
  force2N: 0,
  durationS: 6,
};
