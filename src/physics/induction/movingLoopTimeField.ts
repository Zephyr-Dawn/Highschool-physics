import {
  evaluateManualField,
  evaluateWaveform,
  waveformEvents,
  type ManualFieldTimeline,
  type WaveformConfig,
  type WaveformPoint,
} from './timeVaryingField';

/**
 * I05: a rigid rectangular loop moving through a fixed magnetic strip while the
 * external field Bz(t) changes in time.
 *
 * Conventions (same as I01/I03/I04):
 * - +z out of page; Bz>0 is dots.
 * - Positive current is counter-clockwise seen from +z.
 * - Loop left edge is x; right edge is x+w; strip is [a,b], Bz uniform in y.
 * - Phi = Bz*h*ell, Psi=N*Phi.
 * - emfT=-N*h*ell*Bdot, emfM=-N*h*B*g*vx, emfTotal=emfT+emfM.
 * - F_Bx=N*I*h*B*g; P_mech_field=F_Bx*vx=-I*emfM.
 */

export type I05Mode = 'prescribed' | 'dynamic' | 'manual-b' | 'manual-x';
export type I05Status = 'ok' | 'event-limited' | 'solver-limited' | 'invalid';

export interface I05Params {
  mode: I05Mode;
  turns: number;
  heightM: number;
  widthM: number;
  massKg: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  fieldLeftM: number;
  fieldRightM: number;
  startXM: number;
  initialSpeedMps: number;
  externalForceN: number;
  durationS: number;
  waveform: WaveformConfig;
  manualStartBzTesla: number;
}

export type I05FieldSource =
  | { kind: 'waveform'; waveform: WaveformConfig }
  | { kind: 'manual'; timeline: ManualFieldTimeline };

export interface I05FieldPoint {
  bzTesla: number;
  dbdt: number | null;
  dbdtLeft: number | null;
  dbdtRight: number | null;
  atKink: boolean;
  eventLabel: string | null;
}

export interface I05Snapshot {
  timeS: number;
  xM: number;
  velocityMps: number;
  Bz: number;
  dBzDt: number | null;
  dBzDtLeft: number | null;
  dBzDtRight: number | null;
  overlapLengthM: number;
  effectiveAreaM2: number;
  overlapSlope: -1 | 0 | 1 | null;
  slopeOneSided: boolean;
  fluxWb: number;
  linkageWbTurn: number;
  emfTransformerV: number | null;
  emfMotionalV: number | null;
  emfTotalV: number | null;
  currentA: number | null;
  magneticForceX: number | null;
  joulePowerW: number | null;
  magneticMechanicalPowerW: number | null;
  transformerSourcePowerW: number | null;
  externalForceRequiredN: number | null;
  externalPowerW: number | null;
  kineticEnergyJ: number;
  jouleHeatJ: number;
  externalWorkJ: number;
  transformerSourceWorkJ: number;
  energyResidualJ: number | null;
  status: 'active' | 'open-circuit' | 'at-boundary';
  eventFlags: string[];
  approximation?: string;
  issue?: string;
}

export interface I05Event {
  kind: 'start' | 'geometry' | 'field-knot' | 'end' | 'boundary-contact';
  timeS: number;
  label: string;
  xM: number;
  velocityMps: number;
  boundaryIds: string[];
}

export interface I05Solution {
  params: I05Params;
  fieldSource: I05FieldSource;
  sourceKind: I05FieldSource['kind'];
  initial: I05Snapshot;
  final: I05Snapshot;
  samples: I05Snapshot[];
  events: I05Event[];
  keyTimesS: number[];
  durationS: number;
  status: I05Status;
  issue: string | null;
}

export interface I05Validation {
  valid: boolean;
  params: I05Params | null;
  issues: string[];
}

const EPS = 1e-12;
const MAX_DURATION_S = 60;
const MIN_DURATION_S = 0.2;
const MAX_TURNS = 1000;
const THRESHOLD_TOL = 1e-10;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function validateI05Params(input: I05Params): I05Validation {
  const issues: string[] = [];
  const numeric: Array<[string, unknown]> = [
    ['N', input.turns],
    ['h', input.heightM],
    ['w', input.widthM],
    ['m', input.massKg],
    ['R', input.resistanceOhm],
    ['a', input.fieldLeftM],
    ['b', input.fieldRightM],
    ['x₀', input.startXM],
    ['v₀', input.initialSpeedMps],
    ['F_ext', input.externalForceN],
    ['演示时长', input.durationS],
  ];
  for (const [label, value] of numeric) {
    if (!finite(value)) issues.push(`${label} 必须是有限数值。`);
  }
  if (issues.length > 0) return { valid: false, params: null, issues };
  if (input.heightM <= 0) issues.push('线框高度 h 必须严格大于 0。');
  if (input.widthM <= 0) issues.push('线框宽度 w 必须严格大于 0。');
  if (input.massKg <= 0) issues.push('线框质量 m 必须严格大于 0。');
  if (input.resistanceOhm <= 0) issues.push('回路总电阻 R 必须严格大于 0（忽略自感的理想模型）。');
  if (!Number.isInteger(input.turns) || input.turns < 1 || input.turns > MAX_TURNS) {
    issues.push(`匝数 N 必须为 1–${MAX_TURNS} 的整数。`);
  }
  if (!(input.fieldRightM > input.fieldLeftM)) {
    issues.push('磁场右边界 b 必须严格大于左边界 a。');
  }
  if (input.durationS < MIN_DURATION_S || input.durationS > MAX_DURATION_S) {
    issues.push(`演示时长必须在 ${MIN_DURATION_S}–${MAX_DURATION_S} s 内。`);
  }
  if (input.heightM > 1e4 || input.widthM > 1e4) issues.push('线框尺寸超出稳定计算范围。');
  if (Math.abs(input.fieldLeftM) > 1e6 || Math.abs(input.fieldRightM) > 1e6) {
    issues.push('磁场边界位置超出稳定计算范围。');
  }
  if (input.massKg < 1e-12 || input.massKg > 1e6) issues.push('线框质量超出稳定计算范围。');
  if (input.resistanceOhm < 1e-9 || input.resistanceOhm > 1e9) {
    issues.push('总电阻超出稳定计算范围（1e-9…1e9 Ω）。');
  }
  if (Math.abs(input.initialSpeedMps) > 1e7) issues.push('初速度超出稳定计算范围。');
  if (Math.abs(input.externalForceN) > 1e9) issues.push('外力超出稳定计算范围。');
  if (!['prescribed', 'dynamic', 'manual-b', 'manual-x'].includes(input.mode)) {
    issues.push('未知的 I05 模式。');
  }
  if (input.mode !== 'manual-b') {
    const waveformIssues = validateI05Waveform(input.waveform);
    issues.push(...waveformIssues);
  }
  if (issues.length > 0) return { valid: false, params: null, issues };
  return { valid: true, params: { ...input, waveform: { ...input.waveform } }, issues: [] };
}

function validateI05Waveform(waveform: WaveformConfig): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(waveform.durationS) || waveform.durationS <= 0) issues.push('B(t) 波形时长必须大于 0。');
  if (!Number.isFinite(waveform.b0Tesla) || Math.abs(waveform.b0Tesla) > 100) issues.push('B₀ 必须有限且 |B₀|≤100 T。');
  if (!Number.isFinite(waveform.slopeTeslaPerS) || Math.abs(waveform.slopeTeslaPerS) > 20) {
    issues.push('B(t) 斜率必须有限且 |k|≤20 T/s。');
  }
  if (!Number.isFinite(waveform.amplitudeTesla) || waveform.amplitudeTesla < 0 || waveform.amplitudeTesla > 10) {
    issues.push('B(t) 振幅必须在 0–10 T。');
  }
  if (!Number.isFinite(waveform.frequencyHz) || waveform.frequencyHz <= 0 || waveform.frequencyHz > 20) {
    issues.push('B(t) 频率必须在 (0,20] Hz。');
  }
  if (!Number.isFinite(waveform.phaseRad)) issues.push('B(t) 相位必须有限。');
  for (const [label, value] of [
    ['上升时间', waveform.riseS],
    ['顶部平台', waveform.topS],
    ['下降时间', waveform.fallS],
    ['底部平台', waveform.bottomS],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) issues.push(`${label}必须为非负有限值。`);
  }
  return issues;
}

export function i05FieldAt(source: I05FieldSource, timeS: number): I05FieldPoint {
  const t = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
  if (source.kind === 'manual') {
    const point = evaluateManualField(source.timeline, t);
    return {
      bzTesla: point.bzTesla,
      dbdt: point.dbdt,
      dbdtLeft: point.dbdtLeft,
      dbdtRight: point.dbdtRight,
      atKink: point.atKink,
      eventLabel: point.eventLabel,
    };
  }
  const config = source.waveform;
  const end = config.durationS;
  if (t > end) {
    const last = evaluateWaveform(config, end);
    return {
      bzTesla: last.bzTesla,
      dbdt: 0,
      dbdtLeft: last.dbdtLeft,
      dbdtRight: 0,
      atKink: false,
      eventLabel: '波形结束：磁场保持',
    };
  }
  const point: WaveformPoint = evaluateWaveform(config, t);
  return {
    bzTesla: point.bzTesla,
    dbdt: point.dbdt,
    dbdtLeft: point.dbdtLeft,
    dbdtRight: point.dbdtRight,
    atKink: point.atKink,
    eventLabel: point.eventLabel,
  };
}

export function i05FieldKnots(source: I05FieldSource, durationS: number): number[] {
  const times = source.kind === 'manual'
    ? source.timeline.keyframes.map((frame) => frame.tS)
    : waveformEvents(source.waveform).map((event) => event.timeS);
  return [...new Set(times.filter((time) => Number.isFinite(time) && time > 1e-10 && time < durationS - 1e-10))]
    .sort((a, b) => a - b);
}

function near(value: number, threshold: number): boolean {
  return Math.abs(value - threshold) <= THRESHOLD_TOL * Math.max(1, Math.abs(threshold), Math.abs(value));
}

function overlapSlopeAt(params: I05Params, x: number, v: number, side: 'point' | 'right'): {
  slope: -1 | 0 | 1 | null;
  oneSided: boolean;
} {
  const a = params.fieldLeftM;
  const b = params.fieldRightM;
  const w = params.widthM;
  const right = x + w;
  const atThreshold = near(x, a) || near(x, b) || near(right, a) || near(right, b);
  const evaluate = (probe: number): -1 | 0 | 1 => {
    const leftInside = probe > a && probe < b;
    const rightInside = probe + w > a && probe + w < b;
    return (rightInside ? 1 : 0) - (leftInside ? 1 : 0) as -1 | 0 | 1;
  };
  if (!atThreshold) {
    return { slope: evaluate(x), oneSided: false };
  }
  if (Math.abs(v) <= 1e-12) {
    return { slope: side === 'right' ? evaluate(x) : null, oneSided: true };
  }
  const direction = v > 0 ? 1 : -1;
  const probe = x + direction * 1e-7 * Math.max(1, Math.abs(x));
  return { slope: evaluate(probe), oneSided: true };
}

export interface I05Cumulative {
  jouleHeatJ: number;
  externalWorkJ: number;
  transformerSourceWorkJ: number;
}

export function computeI05Snapshot(
  params: I05Params,
  timeS: number,
  xM: number,
  velocityMps: number,
  field: I05FieldPoint,
  cumulative: I05Cumulative,
  options: { derivativeSide?: 'point' | 'right'; approximation?: string } = {},
): I05Snapshot {
  const side = options.derivativeSide ?? 'point';
  const a = params.fieldLeftM;
  const b = params.fieldRightM;
  const h = params.heightM;
  const w = params.widthM;
  const overlapLeft = Math.max(xM, a);
  const overlapRight = Math.min(xM + w, b);
  const overlapLengthM = Math.max(0, overlapRight - overlapLeft);
  const effectiveAreaM2 = h * overlapLengthM;
  const { slope, oneSided } = overlapSlopeAt(params, xM, velocityMps, side);
  const effectiveSlope = slope ?? 0;
  const Bz = field.bzTesla;
  const dbdt = side === 'right' ? field.dbdtRight ?? field.dbdtLeft ?? 0 : field.dbdt;
  const fluxWb = nz(Bz * effectiveAreaM2);
  const linkageWbTurn = nz(params.turns * fluxWb);
  const emfTransformerV = dbdt === null ? null : nz(-params.turns * h * overlapLengthM * dbdt);
  const emfMotionalV = slope === null
    ? null
    : nz(-params.turns * h * Bz * effectiveSlope * velocityMps);
  const emfTotalV = emfTransformerV === null || emfMotionalV === null
    ? null
    : nz(emfTransformerV + emfMotionalV);
  const currentA = params.circuitClosed
    ? emfTotalV === null
      ? null
      : nz(emfTotalV / params.resistanceOhm)
    : 0;
  const magneticForceX = params.circuitClosed
    ? currentA === null
      ? null
      : nz(params.turns * currentA * h * Bz * effectiveSlope)
    : 0;
  const joulePowerW = params.circuitClosed
    ? currentA === null
      ? null
      : nz(currentA * currentA * params.resistanceOhm)
    : 0;
  const magneticMechanicalPowerW = magneticForceX === null
    ? null
    : nz(magneticForceX * velocityMps);
  const transformerSourcePowerW = params.circuitClosed
    ? currentA === null || emfTransformerV === null
      ? null
      : nz(currentA * emfTransformerV)
    : 0;
  const manualMotion = params.mode === 'manual-x' || options.approximation !== undefined;
  const externalForceRequiredN = manualMotion || magneticForceX === null
    ? null
    : params.mode === 'prescribed'
      ? nz(-magneticForceX)
      : params.externalForceN;
  const externalPowerW = externalForceRequiredN === null
    ? null
    : nz(externalForceRequiredN * velocityMps);
  const kineticEnergyJ = 0.5 * params.massKg * velocityMps * velocityMps;
  const initialKinetic = 0.5 * params.massKg * params.initialSpeedMps * params.initialSpeedMps;
  const residual = options.approximation
    ? null
    : kineticEnergyJ - initialKinetic
      + cumulative.jouleHeatJ
      - cumulative.externalWorkJ
      - cumulative.transformerSourceWorkJ;
  const atBoundary = near(xM, a) || near(xM, b) || near(xM + w, a) || near(xM + w, b);
  const eventFlags: string[] = [];
  if (atBoundary) eventFlags.push('at-boundary');
  if (overlapLengthM <= EPS) eventFlags.push('no-overlap');
  if (!params.circuitClosed) eventFlags.push('open-circuit');
  if (field.atKink) eventFlags.push('field-kink');
  if (emfTotalV !== null && Math.abs(emfTotalV) <= 1e-12 && (Math.abs(emfTransformerV ?? 0) > 1e-12 || Math.abs(emfMotionalV ?? 0) > 1e-12)) {
    eventFlags.push('emf-cancellation');
  }
  return {
    timeS,
    xM,
    velocityMps,
    Bz,
    dBzDt: side === 'right' ? dbdt : field.dbdt,
    dBzDtLeft: field.dbdtLeft,
    dBzDtRight: field.dbdtRight,
    overlapLengthM,
    effectiveAreaM2,
    overlapSlope: slope,
    slopeOneSided: oneSided,
    fluxWb,
    linkageWbTurn,
    emfTransformerV,
    emfMotionalV,
    emfTotalV,
    currentA,
    magneticForceX,
    joulePowerW,
    magneticMechanicalPowerW,
    transformerSourcePowerW,
    externalForceRequiredN,
    externalPowerW,
    kineticEnergyJ,
    jouleHeatJ: cumulative.jouleHeatJ,
    externalWorkJ: cumulative.externalWorkJ,
    transformerSourceWorkJ: cumulative.transformerSourceWorkJ,
    energyResidualJ: residual !== null && Number.isFinite(residual) ? nz(residual) : null,
    status: !params.circuitClosed ? 'open-circuit' : atBoundary ? 'at-boundary' : 'active',
    eventFlags,
    approximation: options.approximation,
  };
}

export const I05_DEFAULT: I05Params = {
  mode: 'prescribed',
  turns: 1,
  heightM: 1,
  widthM: 1,
  massKg: 1,
  resistanceOhm: 2,
  circuitClosed: true,
  fieldLeftM: 0,
  fieldRightM: 3,
  startXM: -1,
  initialSpeedMps: 1,
  externalForceN: 0,
  durationS: 4,
  waveform: {
    kind: 'linear',
    durationS: 4,
    b0Tesla: 2,
    slopeTeslaPerS: 1,
    amplitudeTesla: 0.5,
    frequencyHz: 1,
    phaseRad: 0,
    riseS: 0.5,
    topS: 0.5,
    fallS: 0.5,
    bottomS: 0.5,
  },
  manualStartBzTesla: 2,
};
