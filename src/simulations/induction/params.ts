import { DEFAULT_LOOP_PARAMS, type LoopFieldParams } from '../../physics/induction/loopField';

export interface I03Params {
  loopWidthM: number;
  loopHeightM: number;
  startXM: number;
  initialSpeedMps: number;
  fieldLeftM: number;
  fieldWidthM: number;
  BzSign: 1 | -1;
  BzMagnitudeT: number;
  resistanceOhm: number;
  massKg: number;
  mode: 'uniform' | 'free';
}

export const I03_DEFAULT: I03Params = {
  loopWidthM: DEFAULT_LOOP_PARAMS.loopWidthM,
  loopHeightM: DEFAULT_LOOP_PARAMS.loopHeightM,
  startXM: DEFAULT_LOOP_PARAMS.startXM,
  initialSpeedMps: DEFAULT_LOOP_PARAMS.initialSpeedMps,
  fieldLeftM: 0.2,
  fieldWidthM: 0.5,
  BzSign: 1,
  BzMagnitudeT: 1,
  resistanceOhm: 0.5,
  massKg: 0.2,
  mode: 'uniform',
};

export const I03_PRESETS: Record<string, I03Params> = {
  'i03-default': { ...I03_DEFAULT },
  'i03-free': { ...I03_DEFAULT, mode: 'free' },
  'i03-fast': { ...I03_DEFAULT, initialSpeedMps: 2.5 },
  'i03-weak-field': { ...I03_DEFAULT, BzMagnitudeT: 0.25 },
  'i03-strong-field': { ...I03_DEFAULT, BzMagnitudeT: 1.8 },
  'i03-zero-field': { ...I03_DEFAULT, BzMagnitudeT: 0 },
  'i03-reverse-field': { ...I03_DEFAULT, BzSign: -1 },
  'i03-q2-current': {
    ...I03_DEFAULT,
    BzMagnitudeT: 0.5,
    initialSpeedMps: 2,
    loopHeightM: 0.2,
    resistanceOhm: 0.5,
  },
  'i03-q4-force': {
    ...I03_DEFAULT,
    BzMagnitudeT: 1,
    initialSpeedMps: 1.5,
    loopHeightM: 0.2,
    resistanceOhm: 0.3,
  },
  'i03-q6-heat': {
    ...I03_DEFAULT,
    BzMagnitudeT: 1,
    initialSpeedMps: 1.5,
    loopWidthM: 0.3,
    loopHeightM: 0.2,
    resistanceOhm: 0.3,
    mode: 'uniform',
  },
};

export function i03EngineParams(params: I03Params): LoopFieldParams {
  return {
    loopWidthM: params.loopWidthM,
    loopHeightM: params.loopHeightM,
    startXM: params.startXM,
    initialSpeedMps: params.initialSpeedMps,
    BzTesla: params.BzSign * params.BzMagnitudeT,
    fieldLeftM: params.fieldLeftM,
    fieldRightM: params.fieldLeftM + params.fieldWidthM,
    resistanceOhm: params.resistanceOhm,
    massKg: params.massKg,
    mode: params.mode,
  };
}
