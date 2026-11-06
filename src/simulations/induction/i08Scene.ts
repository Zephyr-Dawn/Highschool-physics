import {
  GENERATOR_DEFAULT,
  normalizeCircuitTimeline,
  solveGenerator,
  validateGeneratorParams,
  type CircuitSwitchEvent,
  type GeneratorParams,
  type GeneratorSolution,
} from '../../physics/induction/acGenerator';

export type I08Mode = 'auto' | 'manual';

export interface I08Layers {
  field: boolean;
  normal: boolean;
  coil: boolean;
  current: boolean;
  flux: boolean;
  emf: boolean;
  power: boolean;
  energy: boolean;
  load: boolean;
  maskAnswers: boolean;
}

export const I08_DEFAULT_LAYERS: I08Layers = {
  field: true,
  normal: true,
  coil: true,
  current: true,
  flux: true,
  emf: true,
  power: true,
  energy: true,
  load: true,
  maskAnswers: false,
};

export const I08_SCENE_STORAGE_KEY = 'emplab.i08.scene.v2';

export interface I08Scene {
  schemaVersion: 2;
  model: 'i08';
  mode: I08Mode;
  params: GeneratorParams;
  circuitTimeline: CircuitSwitchEvent[];
  layers: I08Layers;
}

function params(patch: Partial<GeneratorParams>): GeneratorParams {
  return { ...GENERATOR_DEFAULT, durationS: 2, ...patch };
}

function scene(
  mode: I08Mode,
  paramsValue: GeneratorParams,
  timeline: CircuitSwitchEvent[] = [{ timeS: 0, closed: paramsValue.circuitClosed }],
  layers: I08Layers = I08_DEFAULT_LAYERS,
): I08Scene {
  return {
    schemaVersion: 2,
    model: 'i08',
    mode,
    params: { ...paramsValue },
    circuitTimeline: timeline.map((event) => ({ ...event })),
    layers: { ...layers },
  };
}

export const I08_PRESETS: Record<string, I08Scene> = {
  'i08-standard': scene('auto', params({})),
  'i08-peak-start': scene('auto', params({ theta0Rad: Math.PI / 2, durationS: 1.5 })),
  'i08-reverse': scene('auto', params({ omegaRadPerS: -2 * Math.PI })),
  'i08-flip-b': scene('auto', params({ bTesla: -0.5 })),
  'i08-open': scene('auto', params({ circuitClosed: false })),
  'i08-short': scene('auto', params({ loadResistanceOhm: 0, internalResistanceOhm: 1 })),
  'i08-loaded': scene('auto', params({ loadResistanceOhm: 1, internalResistanceOhm: 1 })),
  'i08-internal': scene('auto', params({ loadResistanceOhm: 1, internalResistanceOhm: 3 })),
  'i08-n-gain': scene('auto', params({ turns: 20 })),
  'i08-slow': scene('auto', params({ omegaRadPerS: Math.PI, durationS: 4 })),
  'i08-zero-speed': scene('auto', params({ omegaRadPerS: 0, theta0Rad: Math.PI / 3 })),
  'i08-manual': scene('manual', params({ omegaRadPerS: 0, durationS: 20 }), [
    { timeS: 0, closed: true },
  ]),
  'i08-manual-slow': scene('manual', params({ omegaRadPerS: 0, durationS: 20, theta0Rad: Math.PI / 6 }), [
    { timeS: 0, closed: true },
  ]),
};

export const I08_DEFAULT_SCENE = I08_PRESETS['i08-standard'];

export function i08SceneFromPreset(preset: I08Scene): I08Scene {
  return {
    ...scene(preset.mode, preset.params, preset.circuitTimeline, preset.layers),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedLayers(raw: unknown): I08Layers {
  const value = isRecord(raw) ? raw : {};
  const boolean = (key: keyof I08Layers, fallback: boolean) => (
    typeof value[key] === 'boolean' ? value[key] as boolean : fallback
  );
  return {
    field: boolean('field', true),
    normal: boolean('normal', true),
    coil: boolean('coil', true),
    current: boolean('current', true),
    flux: boolean('flux', true),
    emf: boolean('emf', true),
    power: boolean('power', true),
    energy: boolean('energy', true),
    load: boolean('load', true),
    maskAnswers: boolean('maskAnswers', false),
  };
}

function parseTimeline(raw: unknown, durationS: number): CircuitSwitchEvent[] {
  if (!Array.isArray(raw)) return [{ timeS: 0, closed: true }];
  const events: CircuitSwitchEvent[] = [];
  for (const item of raw.slice(0, 200)) {
    if (!isRecord(item)) continue;
    if (typeof item.timeS !== 'number' || !Number.isFinite(item.timeS)) continue;
    if (typeof item.closed !== 'boolean') continue;
    events.push({ timeS: Math.max(0, Math.min(durationS, item.timeS)), closed: item.closed });
  }
  return normalizeCircuitTimeline(events, events[0]?.closed ?? true, durationS);
}

export function parseI08StoredScene(raw: unknown): { scene: I08Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'i08') {
    return { scene: null, error: '无法识别的 I08 场景格式。' };
  }
  if (!isRecord(raw.params)) return { scene: null, error: 'I08 参数缺失。' };
  const validation = validateGeneratorParams(raw.params as unknown as GeneratorParams);
  if (!validation.valid || !validation.params) {
    return { scene: null, error: validation.issues.join(' ') || 'I08 参数无效。' };
  }
  const mode: I08Mode = raw.mode === 'manual' ? 'manual' : 'auto';
  return {
    scene: {
      schemaVersion: 2,
      model: 'i08',
      mode,
      params: validation.params,
      circuitTimeline: parseTimeline(raw.circuitTimeline, validation.params.durationS),
      layers: normalizedLayers(raw.layers),
    },
    error: null,
  };
}

export function serializeI08Scene(sceneValue: I08Scene): string {
  return JSON.stringify(sceneValue, null, 2);
}

export function decodeI08SceneJson(text: string): { scene: I08Scene | null; error: string | null } {
  if (text.length > 500_000) return { scene: null, error: '场景 JSON 文件过大。' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseI08StoredScene(candidate);
}

export function loadInitialI08Scene(): I08Scene {
  if (typeof window === 'undefined') return I08_DEFAULT_SCENE;
  try {
    const raw = window.localStorage.getItem(I08_SCENE_STORAGE_KEY);
    if (raw) {
      const parsed = parseI08StoredScene(JSON.parse(raw));
      if (parsed.scene) return parsed.scene;
    }
  } catch {
    // fall through to the default scene
  }
  return I08_DEFAULT_SCENE;
}

export function i08SolutionFor(paramsValue: GeneratorParams, timeline: CircuitSwitchEvent[]): GeneratorSolution {
  return solveGenerator(paramsValue, timeline);
}

export function i08TimelineFor(sceneValue: I08Scene): CircuitSwitchEvent[] {
  return normalizeCircuitTimeline(sceneValue.circuitTimeline, sceneValue.params.circuitClosed, sceneValue.params.durationS);
}
