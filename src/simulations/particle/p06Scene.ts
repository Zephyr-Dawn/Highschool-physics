import {
  createCrossedFieldModel,
  crossedStateAt,
  type CrossedFieldModel,
} from '../../physics/particles/crossedFields';
import {
  segmentedStateAt,
  solveSegmentedTrajectory,
  type FieldRegion,
  type SegmentedFieldInput,
  type SegmentedSolution,
} from '../../physics/particles/segmentedFields';
import {
  addParticle,
  createScene,
  relaunchAll,
  type MultiParticleScene,
  type ParticleInitialState,
  type ParticleRuntime,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import { isRecord, parseParticleList, readLocalValue } from './sceneStorage';

export type P06Mode = 'crossed' | 'segmented';

export interface P06Field {
  mode: P06Mode;
  Ex: number;
  Ey: number;
  Bz: number;
  dM: number;
}

export interface P06ParticleDisplay {
  massKg: number;
  chargeC: number;
  speedMps: number;
  directionDeg: number;
  startX: number;
  startY: number;
}

export type P06Scene = MultiParticleScene<P06Field>;
export const P06_SCENE_STORAGE_KEY = 'emplab.p06.scene.v2';
export const P06_CROSSED_WINDOW_S = 8;

export const P06_DEFAULT_FIELD: P06Field = {
  mode: 'crossed',
  Ex: 0,
  Ey: 2,
  Bz: 1,
  dM: 2,
};

export interface P06ParticleModel {
  particle: ParticleInitialState;
  runtime: ParticleRuntime;
  modelA: CrossedFieldModel | null;
  solutionB: SegmentedSolution | null;
}

export interface P06UnifiedState {
  timeS: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  region: 'crossed' | FieldRegion;
  forceE: { x: number; y: number };
  forceB: { x: number; y: number };
  force: { x: number; y: number };
  acceleration: { x: number; y: number };
  speed: number;
  kineticEnergyJ: number;
  workJ: number;
  energyResidualJ: number;
  selectorMatched: boolean;
}

export function p06ParticleDisplay(particle: ParticleInitialState): P06ParticleDisplay {
  const speed = Math.hypot(particle.velocity.x, particle.velocity.y);
  let directionDeg = speed > 1e-12 ? (Math.atan2(particle.velocity.y, particle.velocity.x) * 180) / Math.PI : 0;
  if (directionDeg < 0) directionDeg += 360;
  return {
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    speedMps: speed,
    directionDeg,
    startX: particle.position.x,
    startY: particle.position.y,
  };
}

export function p06SeedFromDisplay(display: P06ParticleDisplay): ParticleSeed {
  const angle = (display.directionDeg * Math.PI) / 180;
  return {
    position: { x: display.startX, y: display.startY },
    velocity: {
      x: display.speedMps * Math.cos(angle),
      y: display.speedMps * Math.sin(angle),
    },
    chargeC: display.chargeC,
    massKg: display.massKg,
    visible: true,
    showTrail: true,
  };
}

export function p06ModeAInput(field: P06Field, particle: ParticleInitialState) {
  return {
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    Ex: field.Ex,
    Ey: field.Ey,
    Bz: field.Bz,
    initialPosition: particle.position,
    initialVelocity: particle.velocity,
  };
}

export function p06ModeBInput(field: P06Field, particle: ParticleInitialState): SegmentedFieldInput {
  return {
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    dM: field.dM,
    Ex: field.Ex,
    Ey: field.Ey,
    Bz: field.Bz,
    initialPosition: particle.position,
    initialVelocity: particle.velocity,
    maxTimeS: 12,
    maxEvents: 80,
  };
}

export function p06BuildParticle(
  particle: ParticleInitialState,
  runtime: ParticleRuntime,
  field: P06Field,
): P06ParticleModel {
  return {
    particle,
    runtime,
    modelA: field.mode === 'crossed' ? createCrossedFieldModel(p06ModeAInput(field, particle)) : null,
    solutionB: field.mode === 'segmented' ? solveSegmentedTrajectory(p06ModeBInput(field, particle)) : null,
  };
}

export function p06StateAt(evaluation: P06ParticleModel, localTimeS: number): P06UnifiedState | null {
  if (!Number.isFinite(localTimeS) || localTimeS < 0) return null;
  if (evaluation.modelA) {
    const state = crossedStateAt(evaluation.modelA, localTimeS);
    return {
      timeS: state.timeS,
      position: state.position,
      velocity: state.velocity,
      region: 'crossed',
      forceE: state.forceE,
      forceB: state.forceB,
      force: state.force,
      acceleration: state.acceleration,
      speed: state.speed,
      kineticEnergyJ: state.kineticEnergyJ,
      workJ: state.workJ,
      energyResidualJ: state.energyResidualJ,
      selectorMatched: state.selectorMatched,
    };
  }
  if (evaluation.solutionB) {
    const state = segmentedStateAt(evaluation.solutionB, localTimeS);
    return {
      timeS: state.timeS,
      position: state.position,
      velocity: state.velocity,
      region: state.region,
      forceE: state.forceE,
      forceB: state.forceB,
      force: state.force,
      acceleration: state.acceleration,
      speed: state.speed,
      kineticEnergyJ: state.kineticEnergyJ,
      workJ: state.workJ,
      energyResidualJ: state.energyResidualJ,
      selectorMatched: false,
    };
  }
  return null;
}

export function p06GlobalDuration(scene: P06Scene, evaluations: P06ParticleModel[]): number {
  if (scene.field.mode === 'crossed') return P06_CROSSED_WINDOW_S;
  let duration = 0.2;
  for (const item of evaluations) {
    const launch = scene.runtimeById[item.particle.id]?.launchTimeSec ?? 0;
    duration = Math.max(duration, launch + (item.solutionB?.durationS ?? 0));
  }
  return duration;
}

export function p06SceneFromDisplays(field: P06Field, displays: P06ParticleDisplay[]): P06Scene {
  let scene = createScene<P06Field>(field, []);
  for (const display of displays) {
    scene = addParticle(scene, p06SeedFromDisplay(display), 0).scene;
  }
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

const crossedBase = (patch: Partial<P06ParticleDisplay> = {}): P06ParticleDisplay => ({
  massKg: 1,
  chargeC: 1,
  speedMps: 2,
  directionDeg: 0,
  startX: 0,
  startY: 0,
  ...patch,
});

const segmentedBase = (patch: Partial<P06ParticleDisplay> = {}): P06ParticleDisplay => ({
  massKg: 1,
  chargeC: 1,
  speedMps: 2,
  directionDeg: 0,
  startX: -2,
  startY: 0,
  ...patch,
});

export const P06_PRESETS: Record<string, P06Scene> = {
  'p06-default': p06SceneFromDisplays(
    { mode: 'crossed', Ex: 0, Ey: 2, Bz: 1, dM: 2 },
    [crossedBase()],
  ),
  'p06-pure-e': p06SceneFromDisplays(
    { mode: 'crossed', Ex: 0, Ey: 2, Bz: 0, dM: 2 },
    [crossedBase({ speedMps: 3, startX: -1, startY: -0.4 })],
  ),
  'p06-pure-b': p06SceneFromDisplays(
    { mode: 'crossed', Ex: 0, Ey: 0, Bz: 1, dM: 2 },
    [crossedBase({ startX: -0.3, startY: -0.3 })],
  ),
  'p06-selector': p06SceneFromDisplays(
    { mode: 'crossed', Ex: 0, Ey: 2, Bz: 1, dM: 2 },
    [
      crossedBase({ speedMps: 1, startX: -1.6, startY: -0.7 }),
      crossedBase({ speedMps: 2, startX: -1.6, startY: 0 }),
      crossedBase({ speedMps: 3, startX: -1.6, startY: 0.7 }),
    ],
  ),
  'p06-sign': p06SceneFromDisplays(
    { mode: 'crossed', Ex: 0, Ey: 2, Bz: 1, dM: 2 },
    [
      crossedBase({ chargeC: 1, speedMps: 1, directionDeg: 0 }),
      crossedBase({ chargeC: -1, speedMps: 1, directionDeg: 0 }),
    ],
  ),
  'p06-general': p06SceneFromDisplays(
    { mode: 'crossed', Ex: 0, Ey: 2, Bz: 1, dM: 2 },
    [
      crossedBase({ chargeC: 1, speedMps: 0.6, directionDeg: 0, startX: -1.2 }),
      crossedBase({ chargeC: -1, speedMps: 0.6, directionDeg: 180, startX: 1.2 }),
    ],
  ),
  'p06-accelerate': p06SceneFromDisplays(
    { mode: 'segmented', Ex: 1, Ey: 0, Bz: -1, dM: 2 },
    [segmentedBase()],
  ),
  'p06-turnback': p06SceneFromDisplays(
    { mode: 'segmented', Ex: -1, Ey: 0, Bz: -1, dM: 2 },
    [segmentedBase({ speedMps: 1 })],
  ),
  'p06-exit-electric': p06SceneFromDisplays(
    { mode: 'segmented', Ex: 1, Ey: 0, Bz: -1, dM: 2 },
    [segmentedBase(), segmentedBase({ chargeC: -1 })],
  ),
  'p06-reverse': p06SceneFromDisplays(
    { mode: 'segmented', Ex: 1, Ey: 0, Bz: 1, dM: 2 },
    [segmentedBase()],
  ),
};

export interface P06StoredScene {
  schemaVersion: 2;
  model: 'p06';
  field: P06Field;
  particles: ParticleInitialState[];
  runtimeById: Record<string, { launchTimeSec: number }>;
  activeParticleId: string;
}

function normalizeField(raw: unknown): P06Field | null {
  if (!isRecord(raw)) return null;
  const mode: P06Mode = raw.mode === 'segmented' ? 'segmented' : 'crossed';
  if (!Number.isFinite(raw.Ex) || !Number.isFinite(raw.Ey) || !Number.isFinite(raw.Bz) || !Number.isFinite(raw.dM)) {
    return null;
  }
  if (Math.abs(raw.Ex as number) > 1e6 || Math.abs(raw.Ey as number) > 1e6 || Math.abs(raw.Bz as number) > 100) {
    return null;
  }
  const dM = raw.dM as number;
  if (!(dM > 0) || dM > 1e4) return null;
  return {
    mode,
    Ex: raw.Ex as number,
    Ey: raw.Ey as number,
    Bz: raw.Bz as number,
    dM,
  };
}

export function toP06StoredScene(scene: P06Scene): P06StoredScene {
  return {
    schemaVersion: 2,
    model: 'p06',
    field: { ...scene.field },
    particles: scene.particles.map((particle) => ({
      ...particle,
      position: { ...particle.position },
      velocity: { ...particle.velocity },
    })),
    runtimeById: Object.fromEntries(
      scene.particles.map((particle) => [particle.id, { ...(scene.runtimeById[particle.id] ?? { launchTimeSec: 0 }) }]),
    ),
    activeParticleId: scene.activeParticleId,
  };
}

export function serializeP06Scene(scene: P06Scene): string {
  return JSON.stringify(toP06StoredScene(scene), null, 2);
}

export function parseP06StoredScene(raw: unknown): { scene: P06Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'p06') {
    return { scene: null, error: '无法识别的 P06 场景格式。' };
  }
  const field = normalizeField(raw.field);
  if (!field) return { scene: null, error: 'P06 场配置无效。' };
  const parsed = parseParticleList(raw.particles);
  if (!parsed.particles) return { scene: null, error: parsed.error ?? '粒子配置无效。' };
  const scene = createScene(field, parsed.particles);
  const rawRuntimeMap = raw.runtimeById;
  const runtimeById = isRecord(rawRuntimeMap)
    ? Object.fromEntries(scene.particles.map((particle) => {
        const runtime = rawRuntimeMap[particle.id];
        const launch = isRecord(runtime) && Number.isFinite(runtime.launchTimeSec)
          ? Math.max(0, runtime.launchTimeSec as number)
          : 0;
        return [particle.id, { launchTimeSec: launch }];
      }))
    : scene.runtimeById;
  const activeParticleId = typeof raw.activeParticleId === 'string' &&
    parsed.particles.some((particle) => particle.id === raw.activeParticleId)
    ? raw.activeParticleId
    : parsed.particles[0].id;
  return { scene: { ...scene, runtimeById, activeParticleId }, error: null };
}

export function decodeP06SceneJson(text: string): { scene: P06Scene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP06StoredScene(candidate);
}

export function loadInitialP06Scene(): P06Scene {
  const current = readLocalValue(P06_SCENE_STORAGE_KEY);
  if (current) {
    const parsed = parseP06StoredScene(current);
    if (parsed.scene) return relaunchAll(parsed.scene);
  }
  return P06_PRESETS['p06-default'];
}
