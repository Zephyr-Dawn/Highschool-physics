import {
  addParticle,
  createScene,
  type MultiParticleScene,
  type ParticleInitialState,
  type ParticleRuntime,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import {
  solveFieldConstraint,
  validateFieldConstraintInput,
  type ConstraintSolution,
  type FieldConstraintInput,
  type TargetSegment,
} from '../../physics/particles/fieldConstraintEvents';
import type { InverseParameter } from '../../physics/particles/fieldConstraintInverse';
import { isRecord, parseParticleList } from './sceneStorage';
import type { ConstraintWindow } from '../../physics/particles/fieldConstraintEvents';

export interface P08Field {
  Ex: number;
  Ey: number;
  Bz: number;
}

export interface P08Constraint {
  target: TargetSegment;
  window: ConstraintWindow;
}

export interface P08InverseSettings {
  parameter: InverseParameter;
  min: number;
  max: number;
  targetNormalCoordinate: number;
}

export interface P08Layers {
  predicted: boolean;
  trail: boolean;
  fieldE: boolean;
  fieldB: boolean;
  velocity: boolean;
  force: boolean;
  target: boolean;
  events: boolean;
  accepted: boolean;
  aux: boolean;
  allVectors: boolean;
  maskAnswers: boolean;
}

export const P08_DEFAULT_LAYERS: P08Layers = {
  predicted: true,
  trail: true,
  fieldE: true,
  fieldB: true,
  velocity: true,
  force: true,
  target: true,
  events: true,
  accepted: true,
  aux: true,
  allVectors: false,
  maskAnswers: false,
};

export const P08_SCENE_STORAGE_KEY = 'emplab.p08.scene.v2';

export interface P08Scene extends MultiParticleScene<P08Field> {
  schemaVersion: 2;
  model: 'p08';
  constraint: P08Constraint;
  inverse: P08InverseSettings;
  layers: P08Layers;
}

export interface P08ParticleDisplay {
  chargeC: number;
  massKg: number;
  startX: number;
  startY: number;
  speedMps: number;
  directionDeg: number;
  launchTimeSec: number;
}

const DEFAULT_CONSTRAINT: P08Constraint = {
  target: { orientation: 'vertical', coordinate: 1, min: -3, max: 3 },
  window: {
    maxTimeS: 5,
    arrivalMinS: 0,
    arrivalMaxS: 5,
    direction: 'any',
    allowTangent: false,
  },
};

const DEFAULT_INVERSE: P08InverseSettings = {
  parameter: 'Ey',
  min: -4,
  max: 4,
  targetNormalCoordinate: 1,
};

function display(patch: Partial<P08ParticleDisplay> = {}): P08ParticleDisplay {
  return {
    chargeC: 1,
    massKg: 1,
    startX: 0,
    startY: 0,
    speedMps: 1,
    directionDeg: 0,
    launchTimeSec: 0,
    ...patch,
  };
}

export function p08SeedFromDisplay(value: P08ParticleDisplay): ParticleSeed {
  const angle = (value.directionDeg * Math.PI) / 180;
  return {
    position: { x: value.startX, y: value.startY },
    velocity: { x: value.speedMps * Math.cos(angle), y: value.speedMps * Math.sin(angle) },
    chargeC: value.chargeC,
    massKg: value.massKg,
    visible: true,
    showTrail: true,
  };
}

export function p08SceneFromDisplays(
  field: P08Field,
  displays: P08ParticleDisplay[],
  constraint: P08Constraint = DEFAULT_CONSTRAINT,
  inverse: P08InverseSettings = DEFAULT_INVERSE,
  layers: P08Layers = P08_DEFAULT_LAYERS,
): P08Scene {
  let scene = createScene(field, [], '');
  const launchTimes: Record<string, number> = {};
  for (const item of displays) {
    const added = addParticle(scene, p08SeedFromDisplay(item), item.launchTimeSec);
    scene = added.scene;
    if (added.particle) launchTimes[added.particle.id] = item.launchTimeSec;
  }
  const runtimeById: Record<string, ParticleRuntime> = {};
  for (const particle of scene.particles) {
    runtimeById[particle.id] = { launchTimeSec: launchTimes[particle.id] ?? 0 };
  }
  return {
    ...scene,
    activeParticleId: scene.particles[0]?.id ?? '',
    schemaVersion: 2,
    model: 'p08',
    constraint: {
      target: { ...constraint.target },
      window: { ...constraint.window },
    },
    inverse: { ...inverse },
    layers: { ...layers },
  } as P08Scene;
}

const DEFAULT_SCENE: P08Scene = p08SceneFromDisplays(
  { Ex: 0, Ey: 0, Bz: -1 },
  [display()],
);

function preset(
  field: P08Field,
  displays: P08ParticleDisplay[],
  constraint: P08Constraint = DEFAULT_CONSTRAINT,
  inverse: P08InverseSettings = DEFAULT_INVERSE,
): P08Scene {
  return p08SceneFromDisplays(field, displays, constraint, inverse);
}

export const P08_PRESETS: Record<string, P08Scene> = {
  'p08-tangent': preset({ Ex: 0, Ey: 0, Bz: -1 }, [display()]),
  'p08-two-crossings': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [display()],
    { ...DEFAULT_CONSTRAINT, target: { orientation: 'vertical', coordinate: 0.8, min: -3, max: 3 } },
    { ...DEFAULT_INVERSE, targetNormalCoordinate: 0.4 },
  ),
  'p08-unreachable': preset(
    { Ex: 0, Ey: 0, Bz: -2 },
    [display()],
    { ...DEFAULT_CONSTRAINT, target: { orientation: 'vertical', coordinate: 0.8, min: -3, max: 3 } },
  ),
  'p08-pure-e': preset(
    { Ex: 0, Ey: 1.5, Bz: 0 },
    [display()],
    { ...DEFAULT_CONSTRAINT, target: { orientation: 'vertical', coordinate: 2, min: -4, max: 4 } },
    { parameter: 'Ey', min: -4, max: 4, targetNormalCoordinate: 3 },
  ),
  'p08-inverse-ey': preset(
    { Ex: 0, Ey: 1.5, Bz: 0 },
    [display()],
    {
      ...DEFAULT_CONSTRAINT,
      target: { orientation: 'vertical', coordinate: 2, min: -4, max: 4 },
    },
    { parameter: 'Ey', min: -4, max: 4, targetNormalCoordinate: 3 },
  ),
  'p08-selector': preset(
    { Ex: 0, Ey: -2, Bz: -1 },
    [display({ speedMps: 2 })],
    {
      ...DEFAULT_CONSTRAINT,
      target: { orientation: 'vertical', coordinate: 1, min: -2, max: 2 },
    },
    { parameter: 'Ey', min: -4, max: 4, targetNormalCoordinate: 0 },
  ),
  'p08-direction': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [display()],
    {
      ...DEFAULT_CONSTRAINT,
      window: { ...DEFAULT_CONSTRAINT.window, direction: 'positive' },
    },
    { ...DEFAULT_INVERSE, targetNormalCoordinate: 0.4 },
  ),
  'p08-time-window': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [display()],
    {
      ...DEFAULT_CONSTRAINT,
      target: { orientation: 'vertical', coordinate: 0.8, min: -3, max: 3 },
      window: { ...DEFAULT_CONSTRAINT.window, arrivalMinS: 1.5, arrivalMaxS: 2.5 },
    },
    { ...DEFAULT_INVERSE, targetNormalCoordinate: 1.6 },
  ),
  'p08-horizontal': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [display()],
    {
      ...DEFAULT_CONSTRAINT,
      target: { orientation: 'horizontal', coordinate: 0.5, min: -3, max: 3 },
      window: { ...DEFAULT_CONSTRAINT.window, maxTimeS: 6, arrivalMaxS: 6, direction: 'positive' },
    },
    { ...DEFAULT_INVERSE, targetNormalCoordinate: 0.8660254 },
  ),
  'p08-narrow': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [display()],
    { ...DEFAULT_CONSTRAINT, target: { orientation: 'vertical', coordinate: 0.8, min: 0.9, max: 1.1 } },
    { ...DEFAULT_INVERSE, targetNormalCoordinate: 1 },
  ),
  'p08-five': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [
      display({ speedMps: 1 }),
      display({ speedMps: 2 }),
      display({ speedMps: 1, chargeC: -1 }),
      display({ speedMps: 1.2, directionDeg: 20 }),
      display({ speedMps: 0.8, directionDeg: -15, chargeC: -1 }),
    ],
    { ...DEFAULT_CONSTRAINT, target: { orientation: 'vertical', coordinate: 0.8, min: -3, max: 3 } },
  ),
  'p08-multi': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [
      display({ speedMps: 1, launchTimeSec: 0 }),
      display({ speedMps: 1.4, directionDeg: 10, launchTimeSec: 0.6 }),
      display({ speedMps: 0.8, directionDeg: -10, launchTimeSec: 1.2 }),
    ],
    { ...DEFAULT_CONSTRAINT, target: { orientation: 'vertical', coordinate: 0.8, min: -3, max: 3 } },
  ),
  'p08-critical': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [display()],
    { ...DEFAULT_CONSTRAINT, target: { orientation: 'vertical', coordinate: 1, min: -3, max: 3 } },
    { parameter: 'Bz', min: -2, max: 2, targetNormalCoordinate: 1 },
  ),
  'p08-v0-inverse': preset(
    { Ex: 0, Ey: 0, Bz: -1 },
    [display()],
    {
      ...DEFAULT_CONSTRAINT,
      target: { orientation: 'vertical', coordinate: 0.8, min: -3, max: 3 },
    },
    { parameter: 'v0x', min: 0.2, max: 3, targetNormalCoordinate: 0.4 },
  ),
};

export const P08_DEFAULT_SCENE = P08_PRESETS['p08-tangent'] ?? DEFAULT_SCENE;

function normalizedLayers(raw: unknown): P08Layers {
  const value = isRecord(raw) ? raw : {};
  const boolean = (key: keyof P08Layers, fallback: boolean) => (
    typeof value[key] === 'boolean' ? value[key] as boolean : fallback
  );
  return {
    predicted: boolean('predicted', true),
    trail: boolean('trail', true),
    fieldE: boolean('fieldE', true),
    fieldB: boolean('fieldB', true),
    velocity: boolean('velocity', true),
    force: boolean('force', true),
    target: boolean('target', true),
    events: boolean('events', true),
    accepted: boolean('accepted', true),
    aux: boolean('aux', true),
    allVectors: boolean('allVectors', false),
    maskAnswers: boolean('maskAnswers', false),
  };
}

function finiteField(raw: unknown): P08Field | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.Ex !== 'number' || !Number.isFinite(raw.Ex)) return null;
  if (typeof raw.Ey !== 'number' || !Number.isFinite(raw.Ey)) return null;
  if (typeof raw.Bz !== 'number' || !Number.isFinite(raw.Bz)) return null;
  if (Math.abs(raw.Bz) > 100 || Math.abs(raw.Ex) > 1e6 || Math.abs(raw.Ey) > 1e6) return null;
  return { Ex: raw.Ex, Ey: raw.Ey, Bz: raw.Bz };
}

function constraintFromRaw(raw: unknown, field: P08Field, particle: ParticleInitialState | null): { constraint: P08Constraint | null; error: string | null } {
  if (!isRecord(raw) || !isRecord(raw.target) || !isRecord(raw.window)) {
    return { constraint: null, error: 'P08 目标约束缺失。' };
  }
  const target = raw.target;
  const window = raw.window;
  const orientation = target.orientation === 'horizontal' ? 'horizontal' : target.orientation === 'vertical' ? 'vertical' : null;
  if (!orientation) return { constraint: null, error: '目标线段方向无效。' };
  const constraint: P08Constraint = {
    target: {
      orientation,
      coordinate: Number(target.coordinate),
      min: Number(target.min),
      max: Number(target.max),
    },
    window: {
      maxTimeS: Number(window.maxTimeS),
      arrivalMinS: Number(window.arrivalMinS),
      arrivalMaxS: Number(window.arrivalMaxS),
      direction: window.direction === 'positive' ? 'positive' : window.direction === 'negative' ? 'negative' : 'any',
      allowTangent: window.allowTangent === true,
    },
  };
  const validation = validateFieldConstraintInput({
    massKg: particle?.massKg ?? 1,
    chargeC: particle?.chargeC ?? 1,
    Ex: field.Ex,
    Ey: field.Ey,
    Bz: field.Bz,
    initialPosition: particle?.position ?? { x: 0, y: 0 },
    initialVelocity: particle?.velocity ?? { x: 1, y: 0 },
    target: constraint.target,
    window: constraint.window,
  });
  if (!validation.valid) return { constraint: null, error: validation.issues.join(' ') };
  return { constraint, error: null };
}

function inverseFromRaw(raw: unknown): P08InverseSettings {
  const value = isRecord(raw) ? raw : {};
  const parameter: InverseParameter = value.parameter === 'Bz'
    ? 'Bz'
    : value.parameter === 'v0x'
      ? 'v0x'
      : value.parameter === 'v0y'
        ? 'v0y'
        : 'Ey';
  const min = typeof value.min === 'number' && Number.isFinite(value.min) ? value.min : DEFAULT_INVERSE.min;
  const max = typeof value.max === 'number' && Number.isFinite(value.max) ? value.max : DEFAULT_INVERSE.max;
  const targetNormalCoordinate = typeof value.targetNormalCoordinate === 'number' && Number.isFinite(value.targetNormalCoordinate)
    ? value.targetNormalCoordinate
    : DEFAULT_INVERSE.targetNormalCoordinate;
  if (!(max > min)) return { ...DEFAULT_INVERSE };
  return { parameter, min, max, targetNormalCoordinate };
}

export function parseP08StoredScene(raw: unknown): { scene: P08Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'p08') {
    return { scene: null, error: '无法识别的 P08 场景格式。' };
  }
  const field = finiteField(raw.field);
  if (!field) return { scene: null, error: 'P08 场参数无效或超出稳定范围。' };
  const parsedParticles = parseParticleList(raw.particles);
  if (!parsedParticles.particles) return { scene: null, error: parsedParticles.error };
  const particles = parsedParticles.particles;
  const constraint = constraintFromRaw(raw.constraint, field, particles[0] ?? null);
  if (!constraint.constraint) return { scene: null, error: constraint.error };
  const rawRuntime = isRecord(raw.runtimeById) ? raw.runtimeById : {};
  const runtimeById: Record<string, ParticleRuntime> = {};
  for (const particle of particles) {
    const runtime = isRecord(rawRuntime[particle.id]) ? rawRuntime[particle.id] as Record<string, unknown> : {};
    const launch = typeof runtime.launchTimeSec === 'number' && Number.isFinite(runtime.launchTimeSec)
      ? Math.max(0, runtime.launchTimeSec)
      : 0;
    runtimeById[particle.id] = { launchTimeSec: launch };
  }
  const activeParticleId = typeof raw.activeParticleId === 'string'
    && particles.some((particle) => particle.id === raw.activeParticleId)
    ? raw.activeParticleId
    : particles[0].id;
  return {
    scene: {
      version: 1,
      schemaVersion: 2,
      model: 'p08',
      field,
      particles,
      runtimeById,
      activeParticleId,
      constraint: constraint.constraint,
      inverse: inverseFromRaw(raw.inverse),
      layers: normalizedLayers(raw.layers),
    },
    error: null,
  };
}

export function serializeP08Scene(scene: P08Scene): string {
  return JSON.stringify(scene, null, 2);
}

export function decodeP08SceneJson(text: string): { scene: P08Scene | null; error: string | null } {
  if (text.length > 1_500_000) return { scene: null, error: '场景 JSON 文件过大。' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP08StoredScene(candidate);
}

export function loadInitialP08Scene(): P08Scene {
  if (typeof window === 'undefined') return P08_DEFAULT_SCENE;
  try {
    const raw = window.localStorage.getItem(P08_SCENE_STORAGE_KEY);
    if (raw) {
      const parsed = parseP08StoredScene(JSON.parse(raw));
      if (parsed.scene) return parsed.scene;
    }
  } catch {
    // fall through to the default scene
  }
  return P08_DEFAULT_SCENE;
}

export function p08ConstraintInput(
  particle: ParticleInitialState,
  field: P08Field,
  constraint: P08Constraint,
): FieldConstraintInput {
  return {
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    Ex: field.Ex,
    Ey: field.Ey,
    Bz: field.Bz,
    initialPosition: { ...particle.position },
    initialVelocity: { ...particle.velocity },
    target: { ...constraint.target },
    window: { ...constraint.window },
  };
}

export function p08SolutionFor(
  particle: ParticleInitialState,
  field: P08Field,
  constraint: P08Constraint,
): ConstraintSolution {
  return solveFieldConstraint(p08ConstraintInput(particle, field, constraint));
}

export function p08GlobalDuration(scene: P08Scene): number {
  let duration = scene.constraint.window.maxTimeS;
  for (const particle of scene.particles) {
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    duration = Math.max(duration, launch + scene.constraint.window.maxTimeS);
  }
  return Math.max(0.5, Math.min(60, duration));
}

export function p08ApplyField(
  scene: P08Scene,
  field: P08Field,
): P08Scene {
  return { ...scene, field: { ...field }, runtimeById: relaunchAllTimes(scene) };
}

function relaunchAllTimes(scene: P08Scene): Record<string, ParticleRuntime> {
  const runtimeById: Record<string, ParticleRuntime> = {};
  for (const particle of scene.particles) runtimeById[particle.id] = { launchTimeSec: 0 };
  return runtimeById;
}
