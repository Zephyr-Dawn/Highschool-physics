import { buildUniformBInput, type UniformBInput } from '../../physics/particles/uniformB';

export interface P02Params {
  massUnits: number;
  chargeSign: 1 | -1;
  chargeMag: number;
  fieldDir: 1 | -1;
  fieldMag: number;
  speedUnits: number;
  directionDeg: number;
  startX: number;
  startY: number;
}

export const P02_DEFAULT: P02Params = {
  massUnits: 1,
  chargeSign: 1,
  chargeMag: 1,
  fieldDir: 1,
  fieldMag: 0.5,
  speedUnits: 2,
  directionDeg: 0,
  startX: -0.15,
  startY: 0,
};

export const P02_PRESETS: Record<string, P02Params> = {
  'p02-default': { ...P02_DEFAULT },
  'p02-negative-charge': { ...P02_DEFAULT, chargeSign: -1 },
  'p02-into-page': { ...P02_DEFAULT, fieldDir: -1 },
  'p02-strong-field': { ...P02_DEFAULT, fieldMag: 1 },
  'p02-fast': { ...P02_DEFAULT, speedUnits: 4 },
  'p02-zero-field': { ...P02_DEFAULT, fieldMag: 0 },
  'p02-vertical-entry': { ...P02_DEFAULT, directionDeg: 90, startX: 0, startY: -0.15 },
  'p02-q3-radius': {
    ...P02_DEFAULT,
    massUnits: 0.16,
    fieldMag: 0.5,
    speedUnits: 2,
    startX: -0.02,
    startY: 0.02,
  },
  'p02-q5-half-period': {
    ...P02_DEFAULT,
    massUnits: 0.16,
    fieldMag: 0.2,
    speedUnits: 2,
    startX: -0.05,
    startY: 0.05,
  },
  'p02-q6-both-reverse': { ...P02_DEFAULT, chargeSign: -1, fieldDir: -1 },
};

export function p02Input(params: P02Params): UniformBInput {
  return buildUniformBInput({
    massUnits: params.massUnits,
    chargeUnits: params.chargeSign * params.chargeMag,
    BzTesla: params.fieldDir * params.fieldMag,
    speedUnits: params.speedUnits,
    directionDeg: params.directionDeg,
    start: { x: params.startX, y: params.startY },
  });
}
