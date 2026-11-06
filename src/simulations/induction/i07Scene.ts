import {
  I07_DEFAULT,
  solveI07,
  validateI07Params,
  type I07Params,
  type I07Solution,
} from '../../physics/induction/oppositeFieldsWallLoop';

export interface I07Layers {
  field: boolean;
  overlap: boolean;
  current: boolean;
  velocity: boolean;
  magneticForce: boolean;
  externalForce: boolean;
  wall: boolean;
  heat: boolean;
  events: boolean;
  maskAnswers: boolean;
}

export const I07_DEFAULT_LAYERS: I07Layers = {
  field: true,
  overlap: true,
  current: true,
  velocity: true,
  magneticForce: true,
  externalForce: true,
  wall: true,
  heat: true,
  events: true,
  maskAnswers: false,
};

export const I07_SCENE_STORAGE_KEY = 'emplab.i07.scene.v2';

function preset(patch: Partial<I07Params>): I07Params {
  return { ...I07_DEFAULT, ...patch };
}

export const I07_PRESETS: Record<string, I07Params> = {
  'i07-enter': preset({}),
  'i07-interface': preset({ startXM: 0.5, initialSpeedMps: 1, durationS: 2.5 }),
  'i07-cancel-flux': preset({ startXM: 0.4, initialSpeedMps: 2, durationS: 2 }),
  'i07-contained': preset({ widthM: 0.4, startXM: 0.3, initialSpeedMps: 0.5, durationS: 0.5 }),
  'i07-exit': preset({ startXM: 1.5, initialSpeedMps: 1, durationS: 2 }),
  'i07-gap': preset({
    startXM: 0.4,
    initialSpeedMps: 1,
    field2LeftM: 1.5,
    field2RightM: 2.5,
    durationS: 2.5,
  }),
  'i07-free-damping': preset({
    mode: 'free',
    startXM: 0.4,
    initialSpeedMps: 1,
    durationS: 3,
  }),
  'i07-free-wall': preset({
    mode: 'free',
    widthM: 0.5,
    startXM: 1.5,
    initialSpeedMps: 1,
    field1Bz: 0,
    field2Bz: 0,
    wallEnabled: true,
    wallXM: 3,
    restitution: 1,
    durationS: 2.5,
  }),
  'i07-inelastic-wall': preset({
    mode: 'free',
    widthM: 0.5,
    startXM: 1.5,
    initialSpeedMps: 1,
    field1Bz: 0,
    field2Bz: 0,
    wallEnabled: true,
    wallXM: 3,
    restitution: 0.5,
    durationS: 2.5,
  }),
  'i07-driven': preset({
    mode: 'forces',
    startXM: 0.4,
    initialSpeedMps: 1,
    externalForceN: 0.5,
    durationS: 3,
  }),
  'i07-wall-held': preset({
    mode: 'forces',
    widthM: 0.5,
    startXM: 2.4,
    initialSpeedMps: 0.5,
    externalForceN: 1,
    field1Bz: 0,
    field2Bz: 0,
    wallEnabled: true,
    wallXM: 3,
    restitution: 0,
    durationS: 2,
  }),
  'i07-reverse': preset({
    startXM: -0.5,
    initialSpeedMps: 2,
    field1Bz: -1,
    field2Bz: 1,
    durationS: 2.5,
  }),
  'i07-open': preset({ circuitClosed: false }),
  'i07-zero-b': preset({ field1Bz: 0, field2Bz: 0, initialSpeedMps: 1 }),
  'i07-manual': preset({
    mode: 'manual-x',
    startXM: -0.5,
    initialSpeedMps: 0,
    wallEnabled: true,
    wallXM: 4,
    durationS: 8,
  }),
};

export interface I07Scene {
  schemaVersion: 2;
  model: 'i07';
  params: I07Params;
  layers: I07Layers;
}

export const I07_DEFAULT_SCENE: I07Scene = {
  schemaVersion: 2,
  model: 'i07',
  params: { ...I07_PRESETS['i07-enter'] },
  layers: { ...I07_DEFAULT_LAYERS },
};

export function i07SceneFromPreset(params: I07Params): I07Scene {
  return {
    schemaVersion: 2,
    model: 'i07',
    params: { ...params },
    layers: { ...I07_DEFAULT_LAYERS },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedLayers(raw: unknown): I07Layers {
  const value = isRecord(raw) ? raw : {};
  return {
    field: value.field !== false,
    overlap: value.overlap !== false,
    current: value.current !== false,
    velocity: value.velocity !== false,
    magneticForce: value.magneticForce !== false,
    externalForce: value.externalForce !== false,
    wall: value.wall !== false,
    heat: value.heat !== false,
    events: value.events !== false,
    maskAnswers: value.maskAnswers === true,
  };
}

export function parseI07StoredScene(raw: unknown): { scene: I07Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'i07') {
    return { scene: null, error: '无法识别的 I07 场景格式。' };
  }
  if (!isRecord(raw.params)) return { scene: null, error: 'I07 参数缺失。' };
  const validation = validateI07Params(raw.params as unknown as I07Params);
  if (!validation.valid || !validation.params) {
    return { scene: null, error: validation.issues.join(' ') || 'I07 参数无效。' };
  }
  return {
    scene: {
      schemaVersion: 2,
      model: 'i07',
      params: validation.params,
      layers: normalizedLayers(raw.layers),
    },
    error: null,
  };
}

export function serializeI07Scene(scene: I07Scene): string {
  return JSON.stringify(scene, null, 2);
}

export function decodeI07SceneJson(text: string): { scene: I07Scene | null; error: string | null } {
  if (text.length > 1_000_000) return { scene: null, error: '场景 JSON 文件过大。' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseI07StoredScene(candidate);
}

export function loadInitialI07Scene(): I07Scene {
  if (typeof window === 'undefined') return I07_DEFAULT_SCENE;
  try {
    const raw = window.localStorage.getItem(I07_SCENE_STORAGE_KEY);
    if (raw) {
      const parsed = parseI07StoredScene(JSON.parse(raw));
      if (parsed.scene) return parsed.scene;
    }
  } catch {
    // fall through to the default scene
  }
  return I07_DEFAULT_SCENE;
}

export function i07SolutionFor(params: I07Params): I07Solution {
  return solveI07(params);
}

export function i07PlaybackDuration(params: I07Params, solution: I07Solution): number {
  const solved = solution.status === 'invalid' ? params.durationS : solution.durationS;
  return Math.max(0.25, Math.min(params.durationS, Number.isFinite(solved) && solved > 0 ? solved : params.durationS));
}

export function i07KeyTimes(solution: I07Solution): number[] {
  return [...new Set([0, solution.durationS, ...solution.events.map((event) => event.timeS)])]
    .filter((time) => Number.isFinite(time) && time >= 0)
    .sort((a, b) => a - b);
}
