import {
  DEFAULT_MANUAL_SETTINGS,
  type InductionParams,
  type WaveformConfig,
  type WaveformKind,
} from '../../physics/induction/timeVaryingField';

export type I04Mode = 'waveform' | 'manual';

export interface I04Params {
  mode: I04Mode;
  waveform: WaveformKind;
  durationS: number;
  b0Tesla: number;
  slopeTeslaPerS: number;
  amplitudeTesla: number;
  frequencyHz: number;
  phaseDeg: number;
  riseS: number;
  topS: number;
  fallS: number;
  bottomS: number;
  turns: number;
  loopWidthM: number;
  loopHeightM: number;
  resistanceOhm: number;
  circuitClosed: boolean;
  manualStartBzTesla: number;
}

export const I04_DEFAULT: I04Params = {
  mode: 'waveform',
  waveform: 'linear',
  durationS: 4,
  b0Tesla: 0.2,
  slopeTeslaPerS: 0.5,
  amplitudeTesla: 0.3,
  frequencyHz: 1,
  phaseDeg: 0,
  riseS: 0.5,
  topS: 0.5,
  fallS: 0.5,
  bottomS: 0.5,
  turns: 10,
  loopWidthM: 0.2,
  loopHeightM: 0.1,
  resistanceOhm: 5,
  circuitClosed: true,
  manualStartBzTesla: 0.4,
};

export const I04_PRESETS: Record<string, I04Params> = {
  'i04-default': { ...I04_DEFAULT },
  'i04-constant': {
    ...I04_DEFAULT,
    waveform: 'constant',
    b0Tesla: 0.4,
    slopeTeslaPerS: 0,
    durationS: 4,
  },
  'i04-sine': {
    ...I04_DEFAULT,
    waveform: 'sine',
    b0Tesla: 0.25,
    amplitudeTesla: 0.3,
    frequencyHz: 1,
    phaseDeg: 0,
  },
  'i04-sine-peak': {
    ...I04_DEFAULT,
    waveform: 'sine',
    b0Tesla: 0.25,
    amplitudeTesla: 0.3,
    frequencyHz: 1,
    phaseDeg: 90,
  },
  'i04-triangle': {
    ...I04_DEFAULT,
    waveform: 'triangle',
    b0Tesla: -0.2,
    amplitudeTesla: 0.5,
    riseS: 0.6,
    topS: 0.4,
    fallS: 0.6,
    bottomS: 0.4,
    durationS: 4,
  },
  'i04-falling': {
    ...I04_DEFAULT,
    b0Tesla: 0.9,
    slopeTeslaPerS: -0.5,
    durationS: 4,
  },
  'i04-zero-cross': {
    ...I04_DEFAULT,
    b0Tesla: -0.1,
    slopeTeslaPerS: 0.5,
    durationS: 4,
  },
  'i04-open': {
    ...I04_DEFAULT,
    circuitClosed: false,
  },
  'i04-manual': {
    ...I04_DEFAULT,
    mode: 'manual',
    manualStartBzTesla: 0.4,
    circuitClosed: true,
  },
  'i04-q5-scale': {
    ...I04_DEFAULT,
    turns: 20,
    loopWidthM: 0.4,
    loopHeightM: 0.1,
  },
  'i04-resistance': {
    ...I04_DEFAULT,
    resistanceOhm: 10,
  },
};

export function i04WaveformConfig(params: I04Params): WaveformConfig {
  return {
    kind: params.waveform,
    durationS: params.durationS,
    b0Tesla: params.b0Tesla,
    slopeTeslaPerS: params.slopeTeslaPerS,
    amplitudeTesla: params.amplitudeTesla,
    frequencyHz: params.frequencyHz,
    phaseRad: (params.phaseDeg * Math.PI) / 180,
    riseS: params.riseS,
    topS: params.topS,
    fallS: params.fallS,
    bottomS: params.bottomS,
  };
}

export function i04AreaM2(params: I04Params): number {
  return params.loopWidthM * params.loopHeightM;
}

export function i04InductionParams(params: I04Params): InductionParams {
  return {
    turns: params.turns,
    areaM2: i04AreaM2(params),
    resistanceOhm: params.resistanceOhm,
    circuitClosed: params.circuitClosed,
  };
}

export const I04_MANUAL_SETTINGS = DEFAULT_MANUAL_SETTINGS;
export const I04_MANUAL_DURATION_S = 20;

export function isWaveformAffectingChange(prev: I04Params, next: I04Params): boolean {
  return (
    prev.mode !== next.mode ||
    prev.waveform !== next.waveform ||
    prev.durationS !== next.durationS ||
    prev.b0Tesla !== next.b0Tesla ||
    prev.slopeTeslaPerS !== next.slopeTeslaPerS ||
    prev.amplitudeTesla !== next.amplitudeTesla ||
    prev.frequencyHz !== next.frequencyHz ||
    prev.phaseDeg !== next.phaseDeg ||
    prev.riseS !== next.riseS ||
    prev.topS !== next.topS ||
    prev.fallS !== next.fallS ||
    prev.bottomS !== next.bottomS ||
    prev.turns !== next.turns ||
    prev.loopWidthM !== next.loopWidthM ||
    prev.loopHeightM !== next.loopHeightM
  );
}
