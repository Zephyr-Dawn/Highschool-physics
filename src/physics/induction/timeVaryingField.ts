import { clamp } from '../core/vec2';

/**
 * I04 conventions:
 * - +z points out of the screen; the loop normal is +z.
 * - Bz > 0 is drawn as dots (out of page), Bz < 0 as crosses (into page).
 * - Positive current is counter-clockwise as seen from +z and produces +z field.
 * - Phi = Bz A (one turn), Psi = N Phi, emf = -dPsi/dt = -N A dBz/dt.
 */

export type WaveformKind = 'constant' | 'linear' | 'sine' | 'triangle';
export type DerivativeSide = 'left' | 'right';
export type CurrentDirection = 'counterclockwise' | 'clockwise' | 'none' | 'undefined';

export interface WaveformConfig {
  kind: WaveformKind;
  durationS: number;
  b0Tesla: number;
  slopeTeslaPerS: number;
  amplitudeTesla: number;
  frequencyHz: number;
  phaseRad: number;
  riseS: number;
  topS: number;
  fallS: number;
  bottomS: number;
}

export interface WaveformPoint {
  timeS: number;
  bzTesla: number;
  /** Null exactly at a non-differentiable kink; use the one-sided slopes instead. */
  dbdt: number | null;
  dbdtLeft: number | null;
  dbdtRight: number | null;
  atKink: boolean;
  atBoundary: boolean;
  eventLabel: string | null;
  nextEventTimeS: number | null;
}

export type WaveformEventKind = 'start' | 'end' | 'kink' | 'zero' | 'extremum';

export interface WaveformEvent {
  timeS: number;
  kind: WaveformEventKind;
  label: string;
  dbdtLeft: number | null;
  dbdtRight: number | null;
}

export interface InductionParams {
  turns: number;
  areaM2: number;
  resistanceOhm: number;
  circuitClosed: boolean;
}

export interface NormalizedInductionParams {
  params: InductionParams;
  issues: string[];
}

export interface InductionSnapshot {
  bzTesla: number;
  dbdt: number | null;
  fluxPerTurnWb: number;
  fluxLinkageWbTurn: number;
  emfV: number | null;
  currentA: number | null;
  resistivePowerW: number | null;
  emfLeftV: number | null;
  emfRightV: number | null;
  currentLeftA: number | null;
  currentRightA: number | null;
  currentDirection: CurrentDirection;
  inducedFieldDirection: 'out-of-page' | 'into-page' | 'none' | 'undefined';
  lenzSummary: string;
}

export type SeriesSide = 'point' | 'left' | 'right';

export interface InductionSeriesPoint {
  tS: number;
  side: SeriesSide;
  atKink: boolean;
  bzTesla: number;
  fluxPerTurnWb: number;
  fluxLinkageWbTurn: number;
  emfV: number | null;
  currentA: number | null;
  resistivePowerW: number | null;
}

export interface InductionSeries {
  points: InductionSeriesPoint[];
  events: WaveformEvent[];
  durationS: number;
  keyTimesS: number[];
}

export interface ManualFieldSettings {
  rampSeconds: number;
  maxAbsRateTeslaPerS: number;
}

export interface ManualFieldKeyframe {
  tS: number;
  bzTesla: number;
}

export interface ManualFieldTimeline {
  settings: ManualFieldSettings;
  keyframes: ManualFieldKeyframe[];
}

export interface ManualTargetResult {
  timeline: ManualFieldTimeline;
  currentBzTesla: number;
  requestedTargetBzTesla: number;
  appliedTargetBzTesla: number;
  rateTeslaPerS: number;
  limited: boolean;
}

export const DEFAULT_WAVEFORM: WaveformConfig = {
  kind: 'linear',
  durationS: 4,
  b0Tesla: 0.2,
  slopeTeslaPerS: 0.5,
  amplitudeTesla: 0.3,
  frequencyHz: 1,
  phaseRad: 0,
  riseS: 0.5,
  topS: 0.5,
  fallS: 0.5,
  bottomS: 0.5,
};

export const DEFAULT_MANUAL_SETTINGS: ManualFieldSettings = {
  rampSeconds: 0.4,
  maxAbsRateTeslaPerS: 4,
};

const MIN_RAMP_SECONDS = 0.06;
const MAX_RAMP_SECONDS = 1.2;
const MIN_AREA_M2 = 1e-6;
const MAX_AREA_M2 = 100;
const MIN_RESISTANCE_OHM = 1e-9;
const MAX_RESISTANCE_OHM = 1e9;
const MAX_TURNS = 1000;
const NEGLIGIBLE_CURRENT_A = 1e-14;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: number, fallback: number): number {
  return Math.max(0, finiteOr(value, fallback));
}

export function normalizeInductionParams(input: InductionParams): NormalizedInductionParams {
  const issues: string[] = [];
  const rawTurns = finiteOr(input.turns, 1);
  const turns = clamp(Math.round(rawTurns), 1, MAX_TURNS);
  if (turns !== input.turns) issues.push(`匝数 N 必须为正整数；已按 ${turns} 匝计算。`);

  const rawArea = finiteOr(input.areaM2, 0.01);
  const areaM2 = clamp(rawArea, MIN_AREA_M2, MAX_AREA_M2);
  if (areaM2 !== input.areaM2) issues.push(`有效面积必须为正且有限；已按 ${areaM2} m² 计算。`);

  const rawResistance = finiteOr(input.resistanceOhm, 1);
  const resistanceOhm = clamp(rawResistance, MIN_RESISTANCE_OHM, MAX_RESISTANCE_OHM);
  if (resistanceOhm !== input.resistanceOhm) issues.push('总电阻必须为正且有限；已采用安全的极限值。');
  if (resistanceOhm < 1e-6) issues.push('电阻处于极小值，电流会非常大；计算仍按 SI 单位保留。');

  return {
    params: { turns, areaM2, resistanceOhm, circuitClosed: Boolean(input.circuitClosed) },
    issues,
  };
}

export function normalizeWaveformConfig(input: WaveformConfig): {
  config: WaveformConfig;
  issues: string[];
} {
  const issues: string[] = [];
  const kind: WaveformKind = ['constant', 'linear', 'sine', 'triangle'].includes(input.kind)
    ? input.kind
    : 'linear';
  if (kind !== input.kind) issues.push('未知波形，已改用线性波形。');

  const durationS = clamp(finiteOr(input.durationS, 4), 0.2, 60);
  const b0Tesla = clamp(finiteOr(input.b0Tesla, 0), -10, 10);
  const slopeTeslaPerS = clamp(finiteOr(input.slopeTeslaPerS, 0.5), -20, 20);
  const amplitudeTesla = clamp(Math.abs(finiteOr(input.amplitudeTesla, 0.3)), 0, 10);
  const frequencyHz = clamp(finiteOr(input.frequencyHz, 1), 0.01, 20);
  const phaseRad = finiteOr(input.phaseRad, 0);
  const riseS = Math.max(0.05, finiteOr(input.riseS, 0.5));
  const fallS = Math.max(0.05, finiteOr(input.fallS, 0.5));
  const topS = nonNegative(input.topS, 0.5);
  const bottomS = nonNegative(input.bottomS, 0.5);

  if (
    !Number.isFinite(input.durationS) ||
    !Number.isFinite(input.b0Tesla) ||
    !Number.isFinite(input.slopeTeslaPerS) ||
    !Number.isFinite(input.amplitudeTesla) ||
    !Number.isFinite(input.frequencyHz) ||
    !Number.isFinite(input.phaseRad) ||
    !Number.isFinite(input.riseS) ||
    !Number.isFinite(input.topS) ||
    !Number.isFinite(input.fallS) ||
    !Number.isFinite(input.bottomS)
  ) {
    issues.push('波形参数包含无效数值，已采用有限的安全值。');
  }
  if (durationS !== input.durationS) issues.push('波形时长已限制在 0.2–60 s。');
  if (Math.abs(b0Tesla) !== Math.abs(input.b0Tesla) || b0Tesla !== input.b0Tesla) {
    issues.push('B₀ 已限制在 −10–10 T。');
  }
  if (amplitudeTesla !== Math.abs(input.amplitudeTesla) || amplitudeTesla !== input.amplitudeTesla) {
    issues.push('振幅按绝对值处理，并限制在 0–10 T。');
  }
  if (frequencyHz !== input.frequencyHz) issues.push('频率已限制在 0.01–20 Hz。');

  return {
    config: {
      kind,
      durationS,
      b0Tesla,
      slopeTeslaPerS,
      amplitudeTesla,
      frequencyHz,
      phaseRad,
      riseS,
      topS,
      fallS,
      bottomS,
    },
    issues,
  };
}

function sineEvents(config: WaveformConfig): WaveformEvent[] {
  const events: WaveformEvent[] = [];
  const angular = 2 * Math.PI * config.frequencyHz;
  const phase = config.phaseRad;
  const maxCount = 240;
  let count = 0;
  for (let k = 0; count < maxCount; k++) {
    const zero = (-phase + k * Math.PI) / angular;
    if (zero >= config.durationS - 1e-10) break;
    if (zero > 1e-10) {
      const dbdt = angular * config.amplitudeTesla * Math.cos(angular * zero + phase);
      const rising = dbdt > 0;
      events.push({
        timeS: zero,
        kind: 'zero',
        label: `B 过零，正在${rising ? '增大' : '减小'}`,
        dbdtLeft: dbdt,
        dbdtRight: dbdt,
      });
      count += 1;
    }
  }
  for (let k = 0; count < maxCount; k++) {
    const extremum = (Math.PI / 2 - phase + k * Math.PI) / angular;
    if (extremum >= config.durationS - 1e-10) break;
    if (extremum > 1e-10) {
      const value = config.b0Tesla + config.amplitudeTesla * Math.sin(angular * extremum + phase);
      events.push({
        timeS: extremum,
        kind: 'extremum',
        label: `B 达到${value >= config.b0Tesla ? '最大' : '最小'}值（斜率为 0）`,
        dbdtLeft: 0,
        dbdtRight: 0,
      });
      count += 1;
    }
  }
  return events;
}

function triangleBoundaries(config: WaveformConfig): number[] {
  const boundaries = new Set<number>();
  const cycle = config.riseS + config.topS + config.fallS + config.bottomS;
  for (let cycleStart = 0; cycleStart < config.durationS + 1e-9; cycleStart += cycle) {
    for (const offset of [
      0,
      config.riseS,
      config.riseS + config.topS,
      config.riseS + config.topS + config.fallS,
      cycle,
    ]) {
      const time = cycleStart + offset;
      if (time >= -1e-10 && time <= config.durationS + 1e-10) {
        boundaries.add(Math.min(config.durationS, Math.max(0, time)));
      }
      if (boundaries.size > 600) return [...boundaries];
    }
  }
  return [...boundaries];
}

function triangleAt(config: WaveformConfig, timeS: number): { bzTesla: number; slope: number } {
  const cycle = config.riseS + config.topS + config.fallS + config.bottomS;
  let local = timeS % cycle;
  if (Math.abs(local - cycle) < 1e-10) local = 0;
  if (local < config.riseS) {
    return { bzTesla: config.b0Tesla + config.amplitudeTesla * (local / config.riseS), slope: config.amplitudeTesla / config.riseS };
  }
  if (local < config.riseS + config.topS) {
    return { bzTesla: config.b0Tesla + config.amplitudeTesla, slope: 0 };
  }
  if (local < config.riseS + config.topS + config.fallS) {
    const down = (local - config.riseS - config.topS) / config.fallS;
    return { bzTesla: config.b0Tesla + config.amplitudeTesla * (1 - down), slope: -config.amplitudeTesla / config.fallS };
  }
  return { bzTesla: config.b0Tesla, slope: 0 };
}

function waveformAtRaw(config: WaveformConfig, timeS: number): { bzTesla: number; slope: number } {
  switch (config.kind) {
    case 'constant':
      return { bzTesla: config.b0Tesla, slope: 0 };
    case 'sine': {
      const angular = 2 * Math.PI * config.frequencyHz;
      const argument = angular * timeS + config.phaseRad;
      const cosine = Math.cos(argument);
      return {
        bzTesla: config.b0Tesla + config.amplitudeTesla * Math.sin(argument),
        slope: Math.abs(cosine) < 1e-12 ? 0 : config.amplitudeTesla * angular * cosine,
      };
    }
    case 'triangle':
      return triangleAt(config, timeS);
    case 'linear':
    default:
      return {
        bzTesla: config.b0Tesla + config.slopeTeslaPerS * timeS,
        slope: config.slopeTeslaPerS,
      };
  }
}

function oneSidedSlope(config: WaveformConfig, timeS: number, side: DerivativeSide): number | null {
  const safeTime = clamp(timeS, 0, config.durationS);
  if (side === 'left' && safeTime <= 1e-10) return waveformAtRaw(config, 0).slope;
  if (side === 'right' && safeTime >= config.durationS - 1e-10) {
    return waveformAtRaw(config, config.durationS).slope;
  }
  const delta = Math.max(1e-9, config.durationS * 1e-9);
  if (side === 'left') return waveformAtRaw(config, Math.max(0, safeTime - delta)).slope;
  return waveformAtRaw(config, Math.min(config.durationS, safeTime + delta)).slope;
}

function isTriangleBoundary(config: WaveformConfig, timeS: number): boolean {
  if (config.kind !== 'triangle') return false;
  const tolerance = Math.max(1e-9, config.durationS * 1e-9);
  return triangleBoundaries(config).some((boundary) => Math.abs(boundary - timeS) <= tolerance);
}

export function waveformEvents(configInput: WaveformConfig): WaveformEvent[] {
  const { config } = normalizeWaveformConfig(configInput);
  const events: WaveformEvent[] = [];

  if (config.kind === 'sine') {
    events.push(...sineEvents(config));
  } else if (config.kind === 'triangle') {
    const tolerance = Math.max(1e-9, config.durationS * 1e-9);
    for (const rawTime of triangleBoundaries(config)) {
      const time = clamp(rawTime, 0, config.durationS);
      if (time <= tolerance || time >= config.durationS - tolerance) continue;
      const left = oneSidedSlope(config, time, 'left');
      const right = oneSidedSlope(config, time, 'right');
      if (left === null || right === null) continue;
      if (Math.abs(left - right) > 1e-10) {
        events.push({
          timeS: time,
          kind: 'kink',
          label: `折点：斜率从 ${left.toFixed(3)} T/s 切换到 ${right.toFixed(3)} T/s`,
          dbdtLeft: left,
          dbdtRight: right,
        });
      }
    }
  }

  events.push({
    timeS: config.durationS,
    kind: 'end',
    label: '当前波形区间结束',
    dbdtLeft: oneSidedSlope(config, config.durationS, 'left'),
    dbdtRight: oneSidedSlope(config, config.durationS, 'right'),
  });

  return events
    .filter((event) => Number.isFinite(event.timeS) && event.timeS >= 0 && event.timeS <= config.durationS + 1e-9)
    .sort((a, b) => a.timeS - b.timeS);
}

export function evaluateWaveform(configInput: WaveformConfig, timeInput: number): WaveformPoint {
  const { config } = normalizeWaveformConfig(configInput);
  const timeS = clamp(finiteOr(timeInput, 0), 0, config.durationS);
  const raw = waveformAtRaw(config, timeS);
  const atBoundary = timeS <= 1e-10 || timeS >= config.durationS - 1e-10;
  const triangleBoundary = isTriangleBoundary(config, timeS);
  const boundaryLeft = triangleBoundary || atBoundary ? oneSidedSlope(config, timeS, 'left') : raw.slope;
  const boundaryRight = triangleBoundary || atBoundary ? oneSidedSlope(config, timeS, 'right') : raw.slope;
  const atKink =
    triangleBoundary &&
    boundaryLeft !== null &&
    boundaryRight !== null &&
    Math.abs(boundaryLeft - boundaryRight) > 1e-10;
  const events = waveformEvents(config);
  const tolerance = Math.max(1e-9, config.durationS * 1e-9);
  const next = events.find((event) => event.timeS > timeS + tolerance);
  const exact = events.find((event) => Math.abs(event.timeS - timeS) <= tolerance);
  return {
    timeS,
    bzTesla: raw.bzTesla,
    dbdt: atKink ? null : raw.slope,
    dbdtLeft: boundaryLeft,
    dbdtRight: boundaryRight,
    atKink,
    atBoundary,
    eventLabel: exact?.label ?? null,
    nextEventTimeS: next?.timeS ?? null,
  };
}

export function waveformAtSide(
  configInput: WaveformConfig,
  timeInput: number,
  side: DerivativeSide,
): WaveformPoint {
  const normal = evaluateWaveform(configInput, timeInput);
  const slope = side === 'left' ? normal.dbdtLeft : normal.dbdtRight;
  return { ...normal, dbdt: slope, dbdtLeft: slope, dbdtRight: slope, atKink: false };
}

function directionForCurrent(currentA: number | null): CurrentDirection {
  if (currentA === null) return 'undefined';
  if (!Number.isFinite(currentA) || Math.abs(currentA) <= NEGLIGIBLE_CURRENT_A) return 'none';
  return currentA > 0 ? 'counterclockwise' : 'clockwise';
}

function inducedFieldForDirection(
  direction: CurrentDirection,
): 'out-of-page' | 'into-page' | 'none' | 'undefined' {
  if (direction === 'undefined') return 'undefined';
  if (direction === 'none') return 'none';
  return direction === 'counterclockwise' ? 'out-of-page' : 'into-page';
}

function lenzSummaryFor(wave: WaveformPoint, currentA: number | null): string {
  if (wave.dbdt === null) return '折点：dB/dt 不唯一，感应电动势与电流发生有限跳变。';
  if (Math.abs(wave.dbdt) <= 1e-14) return 'B 恒定，穿过回路的磁通量不变，因此没有感应电动势。';
  if (currentA === null) return '电路状态抑制了电流。';
  const fluxTrend = wave.dbdt > 0 ? '代数值增大' : '代数值减小';
  const induced = currentA > 0 ? '指向纸外' : '指向纸里';
  return `磁通量${fluxTrend}；感应电流的磁场${induced}，阻碍这一变化。`;
}

export function evaluateInduction(
  paramsInput: InductionParams,
  wave: WaveformPoint,
  circuitClosed = paramsInput.circuitClosed,
): InductionSnapshot {
  const { params } = normalizeInductionParams(paramsInput);
  const closed = Boolean(circuitClosed);
  const fluxPerTurnWb = wave.bzTesla * params.areaM2;
  const fluxLinkageWbTurn = params.turns * fluxPerTurnWb;
  const emfFrom = (slope: number | null): number | null =>
    slope === null ? null : -params.turns * params.areaM2 * slope;
  const emfV = emfFrom(wave.dbdt);
  const emfLeftV = emfFrom(wave.dbdtLeft);
  const emfRightV = emfFrom(wave.dbdtRight);
  const currentFrom = (emf: number | null): number | null =>
    emf === null || !closed ? (emf === null ? null : 0) : emf / params.resistanceOhm;
  const currentA = currentFrom(emfV);
  const currentLeftA = currentFrom(emfLeftV);
  const currentRightA = currentFrom(emfRightV);
  const resistivePowerW =
    currentA === null ? null : Math.abs(currentA) < NEGLIGIBLE_CURRENT_A ? 0 : currentA * currentA * params.resistanceOhm;
  const currentDirection = directionForCurrent(currentA);

  return {
    bzTesla: wave.bzTesla,
    dbdt: wave.dbdt,
    fluxPerTurnWb,
    fluxLinkageWbTurn,
    emfV,
    currentA,
    resistivePowerW,
    emfLeftV,
    emfRightV,
    currentLeftA,
    currentRightA,
    currentDirection,
    inducedFieldDirection: inducedFieldForDirection(currentDirection),
    lenzSummary: lenzSummaryFor(wave, currentA),
  };
}

export function sampleInductionSeries(
  paramsInput: InductionParams,
  configInput: WaveformConfig,
  circuitClosed = paramsInput.circuitClosed,
  maxPoints = 260,
): InductionSeries {
  const { config } = normalizeWaveformConfig(configInput);
  const events = waveformEvents(config);
  const pointCount = clamp(Math.round(finiteOr(maxPoints, 260)), 32, 1200);
  const uniformTimes: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    uniformTimes.push((config.durationS * i) / Math.max(1, pointCount - 1));
  }
  const times = new Set<number>(uniformTimes);
  times.add(0);
  times.add(config.durationS);
  for (const event of events) times.add(event.timeS);
  const sortedTimes = [...times].sort((a, b) => a - b);

  const points: InductionSeriesPoint[] = [];
  for (const timeS of sortedTimes) {
    const wave = evaluateWaveform(config, timeS);
    if (wave.atKink) {
      for (const side of ['left', 'right'] as const) {
        const sideWave = waveformAtSide(config, timeS, side);
        const state = evaluateInduction(paramsInput, sideWave, circuitClosed);
        points.push({
          tS: timeS,
          side,
          atKink: true,
          bzTesla: state.bzTesla,
          fluxPerTurnWb: state.fluxPerTurnWb,
          fluxLinkageWbTurn: state.fluxLinkageWbTurn,
          emfV: state.emfV,
          currentA: state.currentA,
          resistivePowerW: state.resistivePowerW,
        });
      }
    } else {
      const state = evaluateInduction(paramsInput, wave, circuitClosed);
      points.push({
        tS: timeS,
        side: 'point',
        atKink: false,
        bzTesla: state.bzTesla,
        fluxPerTurnWb: state.fluxPerTurnWb,
        fluxLinkageWbTurn: state.fluxLinkageWbTurn,
        emfV: state.emfV,
        currentA: state.currentA,
        resistivePowerW: state.resistivePowerW,
      });
    }
  }

  const keyTimesS = [...new Set([0, config.durationS, ...events.map((event) => event.timeS)])]
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);

  return { points, events, durationS: config.durationS, keyTimesS };
}

export function createManualTimeline(
  startBzTesla: number,
  settings: Partial<ManualFieldSettings> = {},
): ManualFieldTimeline {
  const start = clamp(finiteOr(startBzTesla, 0), -10, 10);
  const normalized: ManualFieldSettings = {
    rampSeconds: clamp(finiteOr(settings.rampSeconds ?? DEFAULT_MANUAL_SETTINGS.rampSeconds, DEFAULT_MANUAL_SETTINGS.rampSeconds), MIN_RAMP_SECONDS, MAX_RAMP_SECONDS),
    maxAbsRateTeslaPerS: clamp(
      Math.abs(finiteOr(settings.maxAbsRateTeslaPerS ?? DEFAULT_MANUAL_SETTINGS.maxAbsRateTeslaPerS, DEFAULT_MANUAL_SETTINGS.maxAbsRateTeslaPerS)),
      0.1,
      20,
    ),
  };
  return {
    settings: normalized,
    keyframes: [{ tS: 0, bzTesla: start }],
  };
}

export function evaluateManualField(timeline: ManualFieldTimeline, timeInput: number): WaveformPoint {
  const timeS = Math.max(0, finiteOr(timeInput, 0));
  const keyframes = timeline.keyframes.length > 0 ? timeline.keyframes : createManualTimeline(0).keyframes;
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (timeS <= first.tS + 1e-12) {
    const rightSlope =
      keyframes.length > 1 && keyframes[1].tS > first.tS + 1e-12
        ? (keyframes[1].bzTesla - first.bzTesla) / (keyframes[1].tS - first.tS)
        : 0;
    return {
      timeS,
      bzTesla: first.bzTesla,
      dbdt: rightSlope,
      dbdtLeft: rightSlope,
      dbdtRight: rightSlope,
      atKink: false,
      atBoundary: true,
      eventLabel: '手动调磁起点',
      nextEventTimeS: keyframes[1]?.tS ?? null,
    };
  }
  if (timeS >= last.tS - 1e-12) {
    const previous = keyframes.length > 1 ? keyframes[keyframes.length - 2] : null;
    const leftSlope =
      previous && last.tS > previous.tS + 1e-12
        ? (last.bzTesla - previous.bzTesla) / (last.tS - previous.tS)
        : 0;
    const atKink = Math.abs(leftSlope) > 1e-12;
    return {
      timeS,
      bzTesla: last.bzTesla,
      dbdt: 0,
      dbdtLeft: leftSlope,
      dbdtRight: 0,
      atKink,
      atBoundary: true,
      eventLabel: atKink ? '手动调磁停止：斜率回到 0' : null,
      nextEventTimeS: null,
    };
  }

  let index = 0;
  while (index < keyframes.length - 2 && keyframes[index + 1].tS <= timeS + 1e-12) index += 1;
  const a = keyframes[index];
  const b = keyframes[index + 1];
  const span = Math.max(1e-12, b.tS - a.tS);
  const slope = (b.bzTesla - a.bzTesla) / span;
  const atKink = Math.abs(timeS - b.tS) <= 1e-10;
  if (!atKink) {
    const fraction = clamp((timeS - a.tS) / span, 0, 1);
    return {
      timeS,
      bzTesla: a.bzTesla + (b.bzTesla - a.bzTesla) * fraction,
      dbdt: slope,
      dbdtLeft: slope,
      dbdtRight: slope,
      atKink: false,
      atBoundary: false,
      eventLabel: null,
      nextEventTimeS: b.tS,
    };
  }

  const next = keyframes[index + 2];
  const nextSlope = next ? (next.bzTesla - b.bzTesla) / Math.max(1e-12, next.tS - b.tS) : 0;
  return {
    timeS,
    bzTesla: b.bzTesla,
    dbdt: nextSlope,
    dbdtLeft: slope,
    dbdtRight: nextSlope,
    atKink: Math.abs(nextSlope - slope) > 1e-12,
    atBoundary: true,
    eventLabel: '手动调磁斜率切换',
    nextEventTimeS: next?.tS ?? b.tS,
  };
}

export function applyManualTarget(
  timeline: ManualFieldTimeline,
  timeInput: number,
  targetInput: number,
): ManualTargetResult {
  const timeS = Math.max(0, finiteOr(timeInput, 0));
  const current = evaluateManualField(timeline, timeS);
  if (!Number.isFinite(targetInput) || !Number.isFinite(timeS)) {
    return {
      timeline,
      currentBzTesla: current.bzTesla,
      requestedTargetBzTesla: current.bzTesla,
      appliedTargetBzTesla: current.bzTesla,
      rateTeslaPerS: 0,
      limited: false,
    };
  }

  const requested = Math.max(-10, Math.min(10, targetInput));
  const requestedDelta = requested - current.bzTesla;
  if (Math.abs(requestedDelta) <= 1e-12) {
    return {
      timeline,
      currentBzTesla: current.bzTesla,
      requestedTargetBzTesla: requested,
      appliedTargetBzTesla: current.bzTesla,
      rateTeslaPerS: 0,
      limited: false,
    };
  }

  const maxDelta = timeline.settings.maxAbsRateTeslaPerS * timeline.settings.rampSeconds;
  const appliedDelta = clamp(requestedDelta, -maxDelta, maxDelta);
  const limited = Math.abs(appliedDelta - requestedDelta) > 1e-10;
  const appliedTarget = current.bzTesla + appliedDelta;
  const rate = appliedDelta / timeline.settings.rampSeconds;
  const kept = timeline.keyframes.filter((frame) => frame.tS < timeS - 1e-10);
  const keyframes = [
    ...kept,
    { tS: timeS, bzTesla: current.bzTesla },
    { tS: timeS + timeline.settings.rampSeconds, bzTesla: appliedTarget },
  ].sort((a, b) => a.tS - b.tS);

  return {
    timeline: { settings: timeline.settings, keyframes },
    currentBzTesla: current.bzTesla,
    requestedTargetBzTesla: requested,
    appliedTargetBzTesla: appliedTarget,
    rateTeslaPerS: rate,
    limited,
  };
}

export function manualFieldEvents(timeline: ManualFieldTimeline): WaveformEvent[] {
  const events: WaveformEvent[] = [];
  for (let i = 1; i < timeline.keyframes.length; i++) {
    const frame = timeline.keyframes[i];
    const wave = evaluateManualField(timeline, frame.tS);
    if (wave.atKink) {
      events.push({
        timeS: frame.tS,
        kind: i === timeline.keyframes.length - 1 ? 'end' : 'kink',
        label: i === timeline.keyframes.length - 1 ? '手动调磁停止' : '手动调磁斜率切换',
        dbdtLeft: wave.dbdtLeft,
        dbdtRight: wave.dbdtRight,
      });
    }
  }
  return events;
}

export function sampleManualSeries(
  timeline: ManualFieldTimeline,
  paramsInput: InductionParams,
  circuitClosed: boolean,
  endTimeS: number,
  maxPoints = 240,
): InductionSeries {
  const end = Math.max(0, finiteOr(endTimeS, 0));
  const count = clamp(Math.round(finiteOr(maxPoints, 240)), 16, 800);
  const times = new Set<number>();
  for (let i = 0; i < count; i++) {
    times.add((end * i) / Math.max(1, count - 1));
  }
  for (const frame of timeline.keyframes) {
    if (frame.tS >= 0 && frame.tS <= end + 1e-12) times.add(Math.min(end, frame.tS));
  }
  const sorted = [...times].sort((a, b) => a - b);
  const points: InductionSeriesPoint[] = sorted.map((time) => {
    const wave = evaluateManualField(timeline, time);
    const state = evaluateInduction(paramsInput, wave, circuitClosed);
    return {
      tS: time,
      side: 'point',
      atKink: wave.atKink,
      bzTesla: state.bzTesla,
      fluxPerTurnWb: state.fluxPerTurnWb,
      fluxLinkageWbTurn: state.fluxLinkageWbTurn,
      emfV: state.emfV,
      currentA: state.currentA,
      resistivePowerW: state.resistivePowerW,
    };
  });
  const events = manualFieldEvents(timeline);
  return {
    points,
    events,
    durationS: end,
    keyTimesS: [0, ...times].filter((time) => Number.isFinite(time)).sort((a, b) => a - b),
  };
}

export function formatCurrentDirection(direction: CurrentDirection): string {
  if (direction === 'undefined') return '折点处方向不唯一';
  if (direction === 'none') return '无感应电流';
  return direction === 'counterclockwise' ? '逆时针（从纸外看）' : '顺时针（从纸外看）';
}

export const WAVEFORM_LABEL: Record<WaveformKind, string> = {
  constant: '恒定 B',
  linear: '线性变化 B',
  sine: '正弦 B',
  triangle: '分段线性 / 三角波',
};
