import {
  DUAL_ROD_DEFAULT,
  validateDualRodParams,
  type DualRodParams,
} from '../../physics/induction/dualRodCoupling';

export interface I06Layers {
  field: boolean;
  current: boolean;
  velocity: boolean;
  force: boolean;
  flux: boolean;
  momentum: boolean;
  energy: boolean;
  events: boolean;
  maskAnswers: boolean;
}

export const I06_DEFAULT_LAYERS: I06Layers = {
  field: true,
  current: true,
  velocity: true,
  force: true,
  flux: true,
  momentum: true,
  energy: true,
  events: true,
  maskAnswers: false,
};

export const I06_SCENE_STORAGE_KEY = 'emplab.i06.scene.v2';

export interface I06Scene {
  schemaVersion: 2;
  model: 'i06';
  params: DualRodParams;
  layers: I06Layers;
}

function preset(patch: Partial<DualRodParams>): DualRodParams {
  return { ...DUAL_ROD_DEFAULT, ...patch };
}

export const I06_PRESETS: Record<string, DualRodParams> = {
  'i06-free-symmetric': preset({}),
  'i06-free-opposite': preset({
    x1M: 0,
    x2M: 3,
    v1Mps: 2,
    v2Mps: -1,
  }),
  'i06-same-speed': preset({
    v1Mps: 3,
    v2Mps: 3,
    BzTesla: 2,
    x1M: 0,
    x2M: 3,
  }),
  'i06-reverse-field': preset({ BzTesla: -1 }),
  'i06-open': preset({ circuitClosed: false }),
  'i06-unequal-masses': preset({
    mass1Kg: 1,
    mass2Kg: 3,
    v1Mps: 0,
    v2Mps: 2,
  }),
  'i06-contact': preset({
    x1M: 0,
    x2M: 1,
    v1Mps: 2,
    v2Mps: 0,
    durationS: 3,
  }),
  'i06-opposed-forces': preset({
    mode: 'forces',
    x1M: -5,
    x2M: 5,
    v1Mps: 0,
    v2Mps: 0,
    force1N: 1,
    force2N: -1,
    durationS: 4,
  }),
  'i06-common-force': preset({
    mode: 'forces',
    v1Mps: 0,
    v2Mps: 0,
    force1N: 0.5,
    force2N: 0.5,
    durationS: 4,
  }),
  'i06-zero-field': preset({ BzTesla: 0, v1Mps: 0, v2Mps: 2 }),
  'i06-manual-rod1': preset({
    mode: 'manual-rod1',
    x1M: 0,
    x2M: 3,
    v1Mps: 0,
    v2Mps: 0,
  }),
  'i06-manual-rod2': preset({
    mode: 'manual-rod2',
    x1M: 0,
    x2M: 3,
    v1Mps: 0,
    v2Mps: 0,
  }),
};

export const I06_DEFAULT_SCENE: I06Scene = {
  schemaVersion: 2,
  model: 'i06',
  params: { ...I06_PRESETS['i06-free-symmetric'] },
  layers: { ...I06_DEFAULT_LAYERS },
};

export function i06SceneFromPreset(params: DualRodParams): I06Scene {
  return {
    schemaVersion: 2,
    model: 'i06',
    params: { ...params },
    layers: { ...I06_DEFAULT_LAYERS },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedLayers(raw: unknown): I06Layers {
  const value = isRecord(raw) ? raw : {};
  return {
    field: value.field !== false,
    current: value.current !== false,
    velocity: value.velocity !== false,
    force: value.force !== false,
    flux: value.flux !== false,
    momentum: value.momentum !== false,
    energy: value.energy !== false,
    events: value.events !== false,
    maskAnswers: value.maskAnswers === true,
  };
}

export function parseI06StoredScene(raw: unknown): { scene: I06Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'i06') {
    return { scene: null, error: '无法识别的 I06 场景格式。' };
  }
  if (!isRecord(raw.params)) return { scene: null, error: 'I06 参数缺失。' };
  const validation = validateDualRodParams(raw.params as unknown as DualRodParams);
  if (!validation.valid || !validation.params) {
    return { scene: null, error: validation.issues.join(' ') || 'I06 参数无效。' };
  }
  return {
    scene: {
      schemaVersion: 2,
      model: 'i06',
      params: validation.params,
      layers: normalizedLayers(raw.layers),
    },
    error: null,
  };
}

export function serializeI06Scene(scene: I06Scene): string {
  return JSON.stringify(scene, null, 2);
}

export function decodeI06SceneJson(text: string): { scene: I06Scene | null; error: string | null } {
  if (text.length > 1_000_000) return { scene: null, error: '场景 JSON 文件过大。' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseI06StoredScene(candidate);
}

export function loadInitialI06Scene(): I06Scene {
  if (typeof window === 'undefined') return I06_DEFAULT_SCENE;
  try {
    const raw = window.localStorage.getItem(I06_SCENE_STORAGE_KEY);
    if (raw) {
      const parsed = parseI06StoredScene(JSON.parse(raw));
      if (parsed.scene) return parsed.scene;
    }
  } catch {
    // fall through to the default scene
  }
  return I06_DEFAULT_SCENE;
}
