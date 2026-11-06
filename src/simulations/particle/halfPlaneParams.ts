import {
  CHARGE_UNIT_C,
  MASS_UNIT_KG,
  SPEED_UNIT_MPS,
} from '../../physics/particles/uniformB';
import type { HalfPlaneFieldInput } from '../../physics/particles/halfPlane';

export interface P03Params {
  massUnits: number;
  chargeSign: 1 | -1;
  chargeMag: number;
  fieldDir: 1 | -1;
  fieldMag: number;
  speedUnits: number;
  directionDeg: number;
  startX: number;
  startY: number;
  boundaryX: number;
}

export const P03_DEFAULT: P03Params = {
  massUnits: 1,
  chargeSign: 1,
  chargeMag: 1,
  fieldDir: -1,
  fieldMag: 0.8,
  speedUnits: 2,
  directionDeg: 0,
  startX: -0.22,
  startY: 0,
  boundaryX: 0,
};

export const P03_PRESETS: Record<string, P03Params> = {
  'p03-default': { ...P03_DEFAULT },
  'p03-boundary-entry': { ...P03_DEFAULT, startX: 0, startY: 0, directionDeg: 0 },
  'p03-angle': { ...P03_DEFAULT, directionDeg: 25, startY: -0.02 },
  'p03-reverse': { ...P03_DEFAULT, fieldDir: 1 },
  'p03-no-entry': { ...P03_DEFAULT, directionDeg: 180 },
  'p03-tangent': {
    ...P03_DEFAULT,
    fieldDir: 1,
    startX: 0,
    startY: 0,
    directionDeg: 90,
  },
  'p03-q3-exit': {
    ...P03_DEFAULT,
    massUnits: 0.16,
    fieldMag: 0.5,
    speedUnits: 2,
    startX: 0,
    startY: 0,
    directionDeg: 0,
  },
  'p03-q4-time': {
    ...P03_DEFAULT,
    massUnits: 0.16,
    fieldMag: 0.5,
    speedUnits: 2,
    startX: 0,
    startY: 0,
    directionDeg: 0,
  },
  'p03-q6-tangent': {
    ...P03_DEFAULT,
    fieldDir: 1,
    startX: 0,
    startY: 0,
    directionDeg: 90,
  },
};

export function p03Input(params: P03Params): HalfPlaneFieldInput {
  const angle = (params.directionDeg * Math.PI) / 180;
  const speed = params.speedUnits * SPEED_UNIT_MPS;
  return {
    startPosition: { x: params.startX, y: params.startY },
    initialVelocity: { x: speed * Math.cos(angle), y: speed * Math.sin(angle) },
    massKg: params.massUnits * MASS_UNIT_KG,
    chargeC: params.chargeSign * params.chargeMag * CHARGE_UNIT_C,
    BzTesla: params.fieldDir * params.fieldMag,
    boundaryPoint: { x: params.boundaryX, y: 0 },
    boundaryNormal: { x: 1, y: 0 },
  };
}
