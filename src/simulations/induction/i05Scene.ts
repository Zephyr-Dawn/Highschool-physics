import {
  I05_DEFAULT,
  validateI05Params,
  type I05Params,
} from '../../physics/induction/movingLoopTimeField';
import type { WaveformConfig } from '../../physics/induction/timeVaryingField';

export interface I05Layers {
  field: boolean;
  overlap: boolean;
  current: boolean;
  velocity: boolean;
  force: boolean;
  emfDecomposition: boolean;
  energy: boolean;
  events: boolean;
  maskAnswers: boolean;
}

export const I05_DEFAULT_LAYERS: I05Layers = {
  field: true,
  overlap: true,
  current: true,
  velocity: true,
  force: true,
  emfDecomposition: true,
  energy: true,
  events: true,
  maskAnswers: false,
};

export const I05_SCENE_STORAGE_KEY = 'emplab.i05.scene.v2';

function wave(patch: Partial<WaveformConfig>): WaveformConfig {
  return { ...I05_DEFAULT.waveform, ...patch };
}

function preset(patch: Partial<I05Params>): I05Params {
  return {
    ...I05_DEFAULT,
    ...patch,
    waveform: patch.waveform ? { ...patch.waveform } : { ...I05_DEFAULT.waveform },
  };
}

export const I05_PRESETS: Record<string, I05Params> = {
  'i05-static-entry': preset({
    mode: 'prescribed',
    startXM: -0.8,
    initialSpeedMps: 1,
    durationS: 4,
    waveform: wave({ kind: 'constant', b0Tesla: 2, durationS: 4 }),
  }),
  'i05-transformer-only': preset({
    mode: 'prescribed',
    startXM: 0.5,
    initialSpeedMps: 0,
    durationS: 4,
    waveform: wave({ kind: 'linear', b0Tesla: 0, slopeTeslaPerS: 1, durationS: 4 }),
  }),
  'i05-reinforce': preset({
    mode: 'prescribed',
    startXM: -1,
    initialSpeedMps: 1,
    durationS: 4,
    waveform: wave({ kind: 'linear', b0Tesla: 2, slopeTeslaPerS: 1, durationS: 4 }),
  }),
  'i05-cancel': preset({
    mode: 'prescribed',
    startXM: 0,
    initialSpeedMps: -0.25,
    durationS: 2,
    waveform: wave({ kind: 'linear', b0Tesla: 0, slopeTeslaPerS: 1, durationS: 2 }),
  }),
  'i05-contained': preset({
    mode: 'prescribed',
    startXM: 0.5,
    initialSpeedMps: 0,
    durationS: 4,
    waveform: wave({ kind: 'linear', b0Tesla: 1, slopeTeslaPerS: 1, durationS: 4 }),
  }),
  'i05-exit': preset({
    mode: 'prescribed',
    startXM: 2.5,
    initialSpeedMps: 1,
    durationS: 1.5,
    waveform: wave({ kind: 'constant', b0Tesla: 2, durationS: 1.5 }),
  }),
  'i05-exit-reverse': preset({
    mode: 'prescribed',
    startXM: 2.5,
    initialSpeedMps: 1,
    durationS: 1.5,
    waveform: wave({ kind: 'constant', b0Tesla: -2, durationS: 1.5 }),
  }),
  'i05-open': preset({
    mode: 'prescribed',
    circuitClosed: false,
    startXM: -1,
    initialSpeedMps: 1,
    durationS: 4,
    waveform: wave({ kind: 'constant', b0Tesla: 2, durationS: 4 }),
  }),
  'i05-free-damping': preset({
    mode: 'dynamic',
    startXM: -0.5,
    initialSpeedMps: 1,
    externalForceN: 0,
    durationS: 3,
    waveform: wave({ kind: 'constant', b0Tesla: 2, durationS: 3 }),
  }),
  'i05-driven': preset({
    mode: 'dynamic',
    startXM: -0.5,
    initialSpeedMps: 1,
    externalForceN: 1,
    durationS: 3,
    waveform: wave({ kind: 'constant', b0Tesla: 2, durationS: 3 }),
  }),
  'i05-manual-b': preset({
    mode: 'manual-b',
    startXM: -0.5,
    initialSpeedMps: 0,
    durationS: 8,
    manualStartBzTesla: 2,
    waveform: wave({ kind: 'constant', b0Tesla: 2, durationS: 8 }),
  }),
  'i05-manual-x': preset({
    mode: 'manual-x',
    startXM: -0.5,
    initialSpeedMps: 0,
    durationS: 8,
    manualStartBzTesla: 2,
    waveform: wave({ kind: 'constant', b0Tesla: 2, durationS: 8 }),
  }),
  'i05-triangle-kink': preset({
    mode: 'prescribed',
    startXM: 0.5,
    initialSpeedMps: 0,
    durationS: 2,
    waveform: wave({
      kind: 'triangle',
      b0Tesla: 0,
      amplitudeTesla: 1,
      riseS: 0.5,
      topS: 0.5,
      fallS: 0.5,
      bottomS: 0.5,
      durationS: 2,
    }),
  }),
};

export const I05_DEFAULT_SCENE: I05Scene = {
  schemaVersion: 2,
  model: 'i05',
  params: { ...I05_PRESETS['i05-static-entry'] },
  layers: { ...I05_DEFAULT_LAYERS },
};

export interface I05Scene {
  schemaVersion: 2;
  model: 'i05';
  params: I05Params;
  layers: I05Layers;
}

export function i05SceneFromPreset(preset: I05Params): I05Scene {
  return {
    schemaVersion: 2,
    model: 'i05',
    params: { ...preset, waveform: { ...preset.waveform } },
    layers: { ...I05_DEFAULT_LAYERS },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedLayers(raw: unknown): I05Layers {
  const value = isRecord(raw) ? raw : {};
  return {
    field: value.field !== false,
    overlap: value.overlap !== false,
    current: value.current !== false,
    velocity: value.velocity !== false,
    force: value.force !== false,
    emfDecomposition: value.emfDecomposition !== false,
    energy: value.energy !== false,
    events: value.events !== false,
    maskAnswers: value.maskAnswers === true,
  };
}

export function parseI05StoredScene(raw: unknown): { scene: I05Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'i05') {
    return { scene: null, error: '无法识别的 I05 场景格式。' };
  }
  if (!isRecord(raw.params)) return { scene: null, error: 'I05 参数缺失。' };
  const validation = validateI05Params(raw.params as unknown as I05Params);
  if (!validation.valid || !validation.params) {
    return { scene: null, error: validation.issues.join(' ') || 'I05 参数无效。' };
  }
  return {
    scene: {
      schemaVersion: 2,
      model: 'i05',
      params: validation.params,
      layers: normalizedLayers(raw.layers),
    },
    error: null,
  };
}

export function serializeI05Scene(scene: I05Scene): string {
  return JSON.stringify(scene, null, 2);
}

export function decodeI05SceneJson(text: string): { scene: I05Scene | null; error: string | null } {
  if (text.length > 1_000_000) return { scene: null, error: '场景 JSON 文件过大。' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseI05StoredScene(candidate);
}

export function loadInitialI05Scene(): I05Scene {
  if (typeof window === 'undefined') return I05_DEFAULT_SCENE;
  try {
    const raw = window.localStorage.getItem(I05_SCENE_STORAGE_KEY);
    if (raw) {
      const parsed = parseI05StoredScene(JSON.parse(raw));
      if (parsed.scene) return parsed.scene;
    }
  } catch {
    // fall through to the default scene
  }
  return I05_DEFAULT_SCENE;
}
