import type { RodMode, RodParams } from '../../physics/induction/movingRod';

export interface I02Params {
  mode: RodMode;
  BzSign: 1 | -1;
  BzMagnitudeT: number;
  lengthM: number;
  resistanceOhm: number;
  massKg: number;
  startXM: number;
  initialSpeedMps: number;
  externalForceN: number;
  circuitClosed: boolean;
}

export const I02_DEFAULT: I02Params = {
  mode: 'constant-speed',
  BzSign: 1,
  BzMagnitudeT: 1,
  lengthM: 1,
  resistanceOhm: 2,
  massKg: 1,
  startXM: 1.5,
  initialSpeedMps: 1.5,
  externalForceN: 0.8,
  circuitClosed: true,
};

export const I02_PRESETS: Record<string, I02Params> = {
  'i02-default': { ...I02_DEFAULT },
  'i02-reverse-field': { ...I02_DEFAULT, BzSign: -1 },
  'i02-reverse-motion': { ...I02_DEFAULT, startXM: 2, initialSpeedMps: -1.2 },
  'i02-open-circuit': { ...I02_DEFAULT, circuitClosed: false },
  'i02-free-decay': {
    ...I02_DEFAULT,
    mode: 'free-decay',
    startXM: 1,
    initialSpeedMps: 2,
  },
  'i02-constant-force': {
    ...I02_DEFAULT,
    mode: 'constant-force',
    startXM: 1,
    initialSpeedMps: 0,
    externalForceN: 1,
  },
  'i02-turnaround': {
    ...I02_DEFAULT,
    mode: 'constant-force',
    startXM: 2,
    initialSpeedMps: 2,
    externalForceN: -1,
  },
  'i02-manual': {
    ...I02_DEFAULT,
    mode: 'manual-drag',
    startXM: 1,
  },
  'i02-q1-emf': {
    ...I02_DEFAULT,
    BzMagnitudeT: 0.5,
    lengthM: 2,
    startXM: 1,
    initialSpeedMps: 3,
  },
};

export function i02EngineParams(params: I02Params): RodParams {
  return {
    mode: params.mode,
    BzTesla: params.BzSign * params.BzMagnitudeT,
    lengthM: params.lengthM,
    resistanceOhm: params.resistanceOhm,
    circuitClosed: params.circuitClosed,
    massKg: params.massKg,
    startXM: params.startXM,
    initialSpeedMps: params.initialSpeedMps,
    externalForceN: params.externalForceN,
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampValue(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, finiteOr(value, fallback)));
}

function positiveOr(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function sanitizeI02Params(input: Partial<I02Params> | null | undefined): I02Params {
  const value = input ?? {};
  const mode: RodMode =
    value.mode === 'free-decay' || value.mode === 'constant-force' || value.mode === 'manual-drag'
      ? value.mode
      : 'constant-speed';
  return {
    mode,
    BzSign: value.BzSign === -1 ? -1 : 1,
    BzMagnitudeT: clampValue(value.BzMagnitudeT, 0, 100, I02_DEFAULT.BzMagnitudeT),
    lengthM: positiveOr(value.lengthM, 1e-12, 1e4, I02_DEFAULT.lengthM),
    resistanceOhm: positiveOr(value.resistanceOhm, 1e-9, 1e9, I02_DEFAULT.resistanceOhm),
    massKg: positiveOr(value.massKg, 1e-12, 1e6, I02_DEFAULT.massKg),
    startXM: positiveOr(value.startXM, 1e-12, 1e6, I02_DEFAULT.startXM),
    initialSpeedMps: clampValue(value.initialSpeedMps, -1e8, 1e8, I02_DEFAULT.initialSpeedMps),
    externalForceN: clampValue(value.externalForceN, -1e9, 1e9, I02_DEFAULT.externalForceN),
    circuitClosed: value.circuitClosed !== false,
  };
}
