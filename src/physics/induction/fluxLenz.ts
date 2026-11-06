export type FluxMode = 'field' | 'area' | 'angle';
export type DerivativeQuality = 'exact' | 'estimated' | 'undefined';
export type CurrentSense =
  | 'counterclockwise-relative-normal'
  | 'clockwise-relative-normal'
  | 'none'
  | 'open-no-current'
  | 'undefined';
export type EmfSense = 'positive' | 'negative' | 'zero' | 'undefined';
export type InducedFieldDirection = 'along-normal' | 'opposite-normal' | 'none' | 'undefined';
export type FluxTrend = 'increasing' | 'decreasing' | 'zero' | 'undefined';

export interface FluxLenzInput {
  mode: FluxMode;
  Bz: number;
  areaM2: number;
  thetaRad: number;
  dBdt: number;
  dAdt: number;
  dThetaDt: number;
  turns: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  derivativeQuality?: DerivativeQuality;
  timeS?: number;
}

export interface FluxLenzSnapshot {
  timeS: number;
  mode: FluxMode;
  Bz: number;
  areaM2: number;
  thetaRad: number;
  thetaDeg: number;
  turns: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  phiWb: number;
  psiWbTurn: number;
  dBdt: number;
  dAdt: number;
  dThetaDt: number;
  dPsiDtWbTurnPerS: number | null;
  emfV: number | null;
  currentA: number | null;
  joulePowerW: number | null;
  derivativeQuality: DerivativeQuality;
  emfSense: EmfSense;
  currentSense: CurrentSense;
  inducedFieldDirection: InducedFieldDirection;
  fluxTrend: FluxTrend;
  issues: string[];
}

export interface ScalarSample {
  tS: number;
  value: number;
}

export interface ScalarRateSettings {
  windowSeconds: number;
  maxAbsRate: number;
  minSpanSeconds: number;
}

export const DEFAULT_SCALAR_RATE_SETTINGS: ScalarRateSettings = {
  windowSeconds: 0.12,
  maxAbsRate: 20,
  minSpanSeconds: 0.01,
};

const MIN_AREA_M2 = 1e-6;
const MAX_AREA_M2 = 100;
const MIN_RESISTANCE_OHM = 1e-9;
const MAX_RESISTANCE_OHM = 1e9;
const MAX_TURNS = 1000;
const NEGLIGIBLE_CURRENT_A = 1e-14;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeInput(input: FluxLenzInput): {
  mode: FluxMode;
  Bz: number;
  areaM2: number;
  thetaRad: number;
  dBdt: number;
  dAdt: number;
  dThetaDt: number;
  turns: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  derivativeQuality: DerivativeQuality;
  timeS: number;
  issues: string[];
} {
  const issues: string[] = [];
  const rawTurns = finiteOr(input.turns, 1);
  const turns = clamp(Math.round(rawTurns), 1, MAX_TURNS);
  if (turns !== input.turns) issues.push(`匝数 N 必须为 1–${MAX_TURNS} 的整数；已按 ${turns} 匝计算。`);

  const rawArea = finiteOr(input.areaM2, 0.01);
  const areaM2 = clamp(rawArea, MIN_AREA_M2, MAX_AREA_M2);
  if (areaM2 !== input.areaM2) issues.push('有效面积必须有限且大于 0；已采用安全范围。');

  const resistanceOhm = clamp(finiteOr(input.resistanceOhm, 4), MIN_RESISTANCE_OHM, MAX_RESISTANCE_OHM);
  if (resistanceOhm !== input.resistanceOhm) issues.push('电阻必须为正且有限；已采用安全极限值。');

  const derivativesFinite =
    Number.isFinite(input.dBdt) && Number.isFinite(input.dAdt) && Number.isFinite(input.dThetaDt);
  if (!derivativesFinite) issues.push('磁通量导数包含非有限值，当前电动势与电流标为“不可用”。');

  const derivativeQuality: DerivativeQuality = derivativesFinite
    ? input.derivativeQuality === 'estimated'
      ? 'estimated'
      : input.derivativeQuality === 'undefined'
        ? 'undefined'
        : 'exact'
    : 'undefined';

  return {
    mode: input.mode === 'area' || input.mode === 'angle' ? input.mode : 'field',
    Bz: finiteOr(input.Bz, 0),
    areaM2,
    thetaRad: finiteOr(input.thetaRad, 0),
    dBdt: derivativesFinite ? input.dBdt : 0,
    dAdt: derivativesFinite ? input.dAdt : 0,
    dThetaDt: derivativesFinite ? input.dThetaDt : 0,
    turns,
    resistanceOhm,
    circuitClosed: input.circuitClosed !== false,
    derivativeQuality,
    timeS: Math.max(0, finiteOr(input.timeS ?? 0, 0)),
    issues,
  };
}

export function evaluateFluxLenz(input: FluxLenzInput): FluxLenzSnapshot {
  const params = normalizeInput(input);
  const cosTheta = Math.cos(params.thetaRad);
  const sinTheta = Math.sin(params.thetaRad);
  const phiWb = nz(params.Bz * params.areaM2 * cosTheta);
  const psiWbTurn = nz(params.turns * phiWb);

  let dPsiDt: number | null = null;
  let emfV: number | null = null;
  let currentA: number | null = null;
  let joulePowerW: number | null = null;
  let emfSense: EmfSense = 'undefined';
  let currentSense: CurrentSense = 'undefined';
  let inducedFieldDirection: InducedFieldDirection = 'undefined';
  let fluxTrend: FluxTrend = 'undefined';

  if (params.derivativeQuality !== 'undefined') {
    const perTurnDerivative =
      cosTheta * (params.areaM2 * params.dBdt + params.Bz * params.dAdt) -
      params.Bz * params.areaM2 * sinTheta * params.dThetaDt;
    dPsiDt = nz(params.turns * perTurnDerivative);
    emfV = nz(-dPsiDt);
    emfSense = Math.abs(emfV) < 1e-12 ? 'zero' : emfV > 0 ? 'positive' : 'negative';
    fluxTrend = Math.abs(dPsiDt) < 1e-12 ? 'zero' : dPsiDt > 0 ? 'increasing' : 'decreasing';

    if (!params.circuitClosed) {
      currentA = 0;
      joulePowerW = 0;
      currentSense = 'open-no-current';
      inducedFieldDirection = 'none';
    } else {
      currentA = nz(emfV / params.resistanceOhm);
      joulePowerW = nz(currentA * currentA * params.resistanceOhm);
      if (Math.abs(currentA) < NEGLIGIBLE_CURRENT_A) {
        currentSense = 'none';
        inducedFieldDirection = 'none';
      } else {
        currentSense = currentA > 0 ? 'counterclockwise-relative-normal' : 'clockwise-relative-normal';
        inducedFieldDirection = currentA > 0 ? 'along-normal' : 'opposite-normal';
      }
    }
  }

  return {
    ...params,
    phiWb,
    psiWbTurn,
    dPsiDtWbTurnPerS: dPsiDt,
    emfV,
    currentA,
    joulePowerW,
    emfSense,
    currentSense,
    inducedFieldDirection,
    fluxTrend,
    thetaDeg: (params.thetaRad * 180) / Math.PI,
    issues: params.issues,
  };
}

export function estimateScalarRate(
  samples: ScalarSample[],
  nowS: number,
  settings: ScalarRateSettings = DEFAULT_SCALAR_RATE_SETTINGS,
): number {
  const now = Number.isFinite(nowS) ? nowS : 0;
  const window = Math.max(1e-6, finiteOr(settings.windowSeconds, DEFAULT_SCALAR_RATE_SETTINGS.windowSeconds));
  const recent = samples
    .filter((sample) => Number.isFinite(sample.tS) && sample.tS <= now + 1e-9 && sample.tS >= now - window)
    .sort((left, right) => left.tS - right.tS);

  const unique: ScalarSample[] = [];
  for (const sample of recent) {
    if (!Number.isFinite(sample.value)) continue;
    const previous = unique[unique.length - 1];
    if (previous && Math.abs(previous.tS - sample.tS) < 1e-9) {
      unique[unique.length - 1] = sample;
    } else {
      unique.push(sample);
    }
  }
  if (unique.length < 2) return 0;
  const span = unique[unique.length - 1].tS - unique[0].tS;
  if (span < Math.max(1e-6, settings.minSpanSeconds)) return 0;

  const meanT = unique.reduce((sum, sample) => sum + sample.tS, 0) / unique.length;
  const meanValue = unique.reduce((sum, sample) => sum + sample.value, 0) / unique.length;
  let numerator = 0;
  let denominator = 0;
  for (const sample of unique) {
    const dt = sample.tS - meanT;
    numerator += dt * (sample.value - meanValue);
    denominator += dt * dt;
  }
  if (denominator < 1e-12) return 0;
  const slope = numerator / denominator;
  if (!Number.isFinite(slope)) return 0;
  return clamp(slope, -settings.maxAbsRate, settings.maxAbsRate);
}

/** Returns the representation of rawAngle closest to the previous unwrapped angle. */
export function unwrapAngle(previousUnwrapped: number, rawAngle: number): number {
  if (!Number.isFinite(previousUnwrapped) || !Number.isFinite(rawAngle)) return previousUnwrapped;
  const twoPi = Math.PI * 2;
  const delta = ((((rawAngle - previousUnwrapped + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return previousUnwrapped + delta;
}
