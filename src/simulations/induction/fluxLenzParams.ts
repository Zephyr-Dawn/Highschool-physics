export type I01Mode = 'field' | 'area' | 'angle';
export type I01Drive = 'manual' | 'auto';

export interface I01Params {
  mode: I01Mode;
  Bz: number;
  widthM: number;
  lengthM: number;
  thetaRad: number;
  turns: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  fieldDrive: I01Drive;
  autoBRateTeslaPerS: number;
  autoBDurationS: number;
  areaDrive: I01Drive;
  autoWidthSpeedMps: number;
  angleDrive: I01Drive;
  autoOmegaRadPerS: number;
}

export const I01_DEFAULT: I01Params = {
  mode: 'field',
  Bz: 0.5,
  widthM: 0.5,
  lengthM: 0.8,
  thetaRad: 0,
  turns: 10,
  resistanceOhm: 4,
  circuitClosed: true,
  fieldDrive: 'manual',
  autoBRateTeslaPerS: 0.2,
  autoBDurationS: 4,
  areaDrive: 'manual',
  autoWidthSpeedMps: 0.08,
  angleDrive: 'auto',
  autoOmegaRadPerS: 0.8,
};

export const I01_PRESETS: Record<string, I01Params> = {
  'i01-field-manual': { ...I01_DEFAULT },
  'i01-field-increase': {
    ...I01_DEFAULT,
    mode: 'field',
    Bz: 0.2,
    fieldDrive: 'auto',
    autoBRateTeslaPerS: 0.2,
    autoBDurationS: 4,
  },
  'i01-field-decrease': {
    ...I01_DEFAULT,
    mode: 'field',
    Bz: 1,
    fieldDrive: 'auto',
    autoBRateTeslaPerS: -0.2,
    autoBDurationS: 4,
  },
  'i01-field-zero-cross': {
    ...I01_DEFAULT,
    mode: 'field',
    Bz: 0.4,
    fieldDrive: 'auto',
    autoBRateTeslaPerS: -0.2,
    autoBDurationS: 4,
  },
  'i01-area-manual': {
    ...I01_DEFAULT,
    mode: 'area',
    widthM: 0.6,
    areaDrive: 'manual',
  },
  'i01-area-expand': {
    ...I01_DEFAULT,
    mode: 'area',
    widthM: 0.2,
    areaDrive: 'auto',
    autoWidthSpeedMps: 0.08,
  },
  'i01-area-contract': {
    ...I01_DEFAULT,
    mode: 'area',
    widthM: 1,
    areaDrive: 'auto',
    autoWidthSpeedMps: -0.06,
  },
  'i01-angle-auto': {
    ...I01_DEFAULT,
    mode: 'angle',
    thetaRad: 0,
    angleDrive: 'auto',
    autoOmegaRadPerS: 0.8,
  },
  'i01-angle-reverse': {
    ...I01_DEFAULT,
    mode: 'angle',
    thetaRad: Math.PI / 3,
    angleDrive: 'auto',
    autoOmegaRadPerS: -0.8,
  },
  'i01-angle-manual': {
    ...I01_DEFAULT,
    mode: 'angle',
    thetaRad: Math.PI / 4,
    angleDrive: 'manual',
  },
  'i01-open': {
    ...I01_DEFAULT,
    mode: 'field',
    circuitClosed: false,
    fieldDrive: 'auto',
    autoBRateTeslaPerS: 0.2,
    autoBDurationS: 4,
  },
  'i01-q1-flux': {
    ...I01_DEFAULT,
    mode: 'field',
    Bz: 0.5,
    widthM: 0.1,
    lengthM: 0.2,
    turns: 10,
    resistanceOhm: 4,
    fieldDrive: 'manual',
  },
  'i01-q2-field': {
    ...I01_DEFAULT,
    mode: 'field',
    Bz: 0.5,
    widthM: 0.1,
    lengthM: 0.2,
    turns: 10,
    resistanceOhm: 4,
    fieldDrive: 'auto',
    autoBRateTeslaPerS: 2,
    autoBDurationS: 0.5,
  },
  'i01-q3-area': {
    ...I01_DEFAULT,
    mode: 'area',
    Bz: 0.5,
    widthM: 0.6,
    lengthM: 0.2,
    turns: 1,
    resistanceOhm: 4,
    areaDrive: 'auto',
    autoWidthSpeedMps: 1,
  },
  'i01-q4-angle': {
    ...I01_DEFAULT,
    mode: 'angle',
    Bz: 1,
    widthM: 0.1,
    lengthM: 1,
    thetaRad: Math.PI / 2,
    turns: 1,
    resistanceOhm: 2,
    angleDrive: 'auto',
    autoOmegaRadPerS: 2,
  },
  'i01-q6-zero-flux': {
    ...I01_DEFAULT,
    mode: 'field',
    Bz: 0,
    widthM: 0.2,
    lengthM: 0.1,
    turns: 1,
    resistanceOhm: 2,
    fieldDrive: 'auto',
    autoBRateTeslaPerS: 2,
    autoBDurationS: 1,
  },
  'i01-q7-flip': {
    ...I01_DEFAULT,
    mode: 'field',
    Bz: 0.5,
    widthM: 0.1,
    lengthM: 0.2,
    thetaRad: Math.PI,
    turns: 1,
    resistanceOhm: 4,
    fieldDrive: 'auto',
    autoBRateTeslaPerS: 0.2,
    autoBDurationS: 4,
  },
};

export function sanitizeI01Params(input: Partial<I01Params> | null | undefined): I01Params {
  const value = input ?? {};
  const finite = (raw: unknown, fallback: number) =>
    typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  const clamp = (raw: unknown, min: number, max: number, fallback: number) =>
    Math.min(max, Math.max(min, finite(raw, fallback)));
  const mode: I01Mode = value.mode === 'area' || value.mode === 'angle' ? value.mode : 'field';
  return {
    mode,
    // Storage sanitizers migrate legacy/dirty data, but never use the slider
    // quick ranges as physical limits. The control validates before commit.
    Bz: clamp(value.Bz, -10, 10, I01_DEFAULT.Bz),
    widthM: clamp(value.widthM, 1e-6, 10, I01_DEFAULT.widthM),
    lengthM: clamp(value.lengthM, 1e-6, 10, I01_DEFAULT.lengthM),
    thetaRad: finite(value.thetaRad, I01_DEFAULT.thetaRad),
    turns: Math.round(clamp(value.turns, 1, 1000, I01_DEFAULT.turns)),
    resistanceOhm: clamp(value.resistanceOhm, 1e-9, 1e9, I01_DEFAULT.resistanceOhm),
    circuitClosed: value.circuitClosed !== false,
    fieldDrive: value.fieldDrive === 'auto' ? 'auto' : 'manual',
    autoBRateTeslaPerS: clamp(value.autoBRateTeslaPerS, -1e6, 1e6, I01_DEFAULT.autoBRateTeslaPerS),
    autoBDurationS: clamp(value.autoBDurationS, 1e-6, 1e6, I01_DEFAULT.autoBDurationS),
    areaDrive: value.areaDrive === 'auto' ? 'auto' : 'manual',
    autoWidthSpeedMps: clamp(value.autoWidthSpeedMps, -1e6, 1e6, I01_DEFAULT.autoWidthSpeedMps),
    angleDrive: value.angleDrive === 'auto' ? 'auto' : 'manual',
    autoOmegaRadPerS: clamp(value.autoOmegaRadPerS, -1e7, 1e7, I01_DEFAULT.autoOmegaRadPerS),
  };
}
