import {
  decodeP02SceneJson,
  p02SceneFromDisplays,
  parseP02StoredScene,
  serializeP02Scene,
  type P02Scene,
} from './p02Scene';
import { readLocalValue } from './sceneStorage';

export const P01_PLANAR_SCENE_KEY = 'emplab.p01.planar.scene.v2';

function scene(fieldMag: number, displays: Parameters<typeof p02SceneFromDisplays>[1], fieldDir: 1 | -1 = 1): P02Scene {
  return p02SceneFromDisplays({ fieldDir, fieldMag }, displays);
}

export const P01_PLANAR_PRESETS: Record<string, P02Scene> = {
  'p01-motion-default': scene(0.5, [
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
    { massUnits: 1, chargeSign: -1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 4, directionDeg: 0, startX: -0.15, startY: 0 },
  ]),
  'p01-motion-sign': scene(0.5, [
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
    { massUnits: 1, chargeSign: -1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
  ]),
  'p01-motion-radius': scene(0.5, [
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
    { massUnits: 2, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
  ]),
  'p01-motion-field-in': scene(0.5, [
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
    { massUnits: 1, chargeSign: -1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
  ], -1),
  'p01-motion-five': scene(0.5, [
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.18, startY: -0.02 },
    { massUnits: 1, chargeSign: -1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.18, startY: -0.02 },
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 4, directionDeg: 0, startX: -0.18, startY: 0.04 },
    { massUnits: 2, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.18, startY: 0.02 },
    { massUnits: 0.6, chargeSign: -1, chargeMag: 1, speedUnits: 3, directionDeg: 0, startX: -0.18, startY: 0.06 },
  ]),
  'p01-motion-zero-field': scene(0, [
    { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 20, startX: -0.15, startY: -0.02 },
    { massUnits: 1, chargeSign: -1, chargeMag: 1, speedUnits: 2, directionDeg: -20, startX: -0.15, startY: 0.02 },
  ]),
};

export const P01_PLANAR_DEFAULT = P01_PLANAR_PRESETS['p01-motion-default'];

export function loadInitialP01PlanarScene(): P02Scene {
  const stored = readLocalValue(P01_PLANAR_SCENE_KEY);
  if (stored) {
    const parsed = parseP02StoredScene(stored);
    if (parsed.scene) return parsed.scene;
  }
  return P01_PLANAR_DEFAULT;
}

export function serializeP01PlanarScene(sceneValue: P02Scene): string {
  return serializeP02Scene(sceneValue);
}

export function decodeP01PlanarSceneJson(text: string) {
  return decodeP02SceneJson(text);
}
