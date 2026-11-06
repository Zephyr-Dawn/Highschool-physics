import {
  addParticle,
  createScene,
  particleTau,
  type MultiParticleScene,
  type ParticleInitialState,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import {
  alternatingRegionAtX,
  alternatingStateAt,
  solveAlternatingFieldTrajectory,
  type AlternatingFieldInput,
  type AlternatingSolution,
  type AlternatingState,
} from '../../physics/particles/alternatingMagneticRegions';
import { isRecord, parseParticleList, readLocalValue } from './sceneStorage';

export const P05_SCENE_STORAGE_KEY = 'emplab.p05.scene.v2';

export interface P05Field {
  boundaries: number[];
  fields: number[];
}

export type P05Scene = MultiParticleScene<P05Field>;

function seed(
  startPosition: { x: number; y: number },
  initialVelocity: { x: number; y: number },
  chargeC = 1,
  massKg = 1,
): ParticleSeed {
  return {
    position: { ...startPosition },
    velocity: { ...initialVelocity },
    chargeC,
    massKg,
    visible: true,
    showTrail: true,
  };
}

function sceneWithField(
  boundaries: number[],
  fields: number[],
  seeds: Array<ParticleSeed & { launchTimeSec?: number }>,
): P05Scene {
  let scene = createScene<P05Field>({ boundaries: [...boundaries], fields: [...fields] }, []);
  for (const item of seeds) {
    const { launchTimeSec = 0, ...particleSeed } = item;
    scene = addParticle(scene, particleSeed, launchTimeSec).scene;
  }
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

export const P05_DEFAULT = sceneWithField([0], [-1, 1], [
  seed({ x: 0, y: 0 }, { x: 1, y: 0 }),
]);

export const P05_PRESETS: Record<string, P05Scene> = {
  'p05-default': P05_DEFAULT,
  'p05-two-halves': P05_DEFAULT,
  'p05-reversed': sceneWithField([0], [1, -1], [seed({ x: 0, y: 0 }, { x: 1, y: 0 })]),
  'p05-unequal': sceneWithField([0], [-2, 1], [seed({ x: 0, y: 0 }, { x: 1, y: 0 })]),
  'p05-three-zone': sceneWithField([-0.5, 0.5], [1, 0, -1], [
    seed({ x: -1, y: 0 }, { x: 1, y: 0 }),
  ]),
  'p05-sign': sceneWithField([0], [-1, 1], [
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }, 1),
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }, -1),
  ]),
  'p05-launch-delay': sceneWithField([0], [0, 0], [
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }),
    { ...seed({ x: 0, y: 0 }, { x: 1, y: 0 }), launchTimeSec: 1 },
  ]),
  'p05-arrival-same': sceneWithField([0], [0, 0], [
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }),
    { ...seed({ x: 0, y: 0 }, { x: 2, y: 0 }), launchTimeSec: 1 },
  ]),
  'p05-cross-not-simultaneous': sceneWithField([0], [0, 0], [
    seed({ x: -1, y: 0 }, { x: 1, y: 0 }),
    seed({ x: 0, y: -2 }, { x: 0, y: 1 }),
  ]),
  'p05-tangent': sceneWithField([0], [-1, 1], [
    seed({ x: 1, y: 1 }, { x: 1, y: 0 }),
  ]),
  'p05-multi': sceneWithField([-0.5, 0.5], [-1, 1, -1], [
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }),
    seed({ x: 0, y: 0.4 }, { x: 1, y: 0 }),
    { ...seed({ x: -0.8, y: 0 }, { x: 1, y: 0 }), launchTimeSec: 0.8 },
  ]),
};

export function p05SolutionFor(
  field: P05Field,
  particle: Pick<ParticleInitialState, 'position' | 'velocity' | 'chargeC' | 'massKg'>,
  timeHorizonS = 8,
): AlternatingSolution {
  const input: AlternatingFieldInput = {
    boundaries: field.boundaries,
    fields: field.fields,
    startPosition: particle.position,
    initialVelocity: particle.velocity,
    chargeC: particle.chargeC,
    massKg: particle.massKg,
    timeHorizonS,
    maxEvents: 40,
  };
  return solveAlternatingFieldTrajectory(input);
}

export function p05GlobalDuration(scene: P05Scene, timeHorizonS = 8): number {
  let duration = 0.1;
  for (const particle of scene.particles) {
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    duration = Math.max(duration, launch + p05SolutionFor(scene.field, particle, timeHorizonS).durationS);
  }
  return duration;
}

export function p05KeyFrames(scene: P05Scene, timeHorizonS = 8): Array<{ time: number; label: string }> {
  const frames: Array<{ time: number; label: string }> = [{ time: 0, label: '全局起点' }];
  for (const particle of scene.particles) {
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    const solution = p05SolutionFor(scene.field, particle, timeHorizonS);
    for (const event of solution.events) {
      if (event.kind === 'crossing') {
        frames.push({
          time: launch + event.timeS,
          label: `${particle.label} 跨界 ${event.fromRegion + 1}→${event.toRegion + 1}`,
        });
      }
      if (event.kind === 'tangent') {
        frames.push({ time: launch + event.timeS, label: `${particle.label} 相切` });
      }
    }
    frames.push({ time: launch + solution.durationS, label: `${particle.label} 窗口结束` });
  }
  frames.push({ time: p05GlobalDuration(scene, timeHorizonS), label: '全局结束' });
  const unique = new Map<number, { time: number; label: string }>();
  for (const frame of frames) {
    if (!Number.isFinite(frame.time) || frame.time < 0) continue;
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!unique.has(key)) unique.set(key, frame);
  }
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

export function p05StateFor(
  scene: P05Scene,
  particle: P05Scene['particles'][number],
  globalTimeS: number,
  timeHorizonS = 8,
): { tauS: number | null; state: AlternatingState | null; solution: AlternatingSolution } {
  const solution = p05SolutionFor(scene.field, particle, timeHorizonS);
  const tau = particleTau(scene.runtimeById[particle.id], globalTimeS);
  return { tauS: tau, state: tau === null ? null : alternatingStateAt(solution, tau), solution };
}

export function p05SameTimeDistance(
  scene: P05Scene,
  globalTimeS: number,
  firstId: string,
  secondId: string,
  timeHorizonS = 8,
): { distanceM: number; first: { x: number; y: number } | null; second: { x: number; y: number } | null } {
  const first = scene.particles.find((particle) => particle.id === firstId);
  const second = scene.particles.find((particle) => particle.id === secondId);
  if (!first || !second) return { distanceM: Infinity, first: null, second: null };
  const a = p05StateFor(scene, first, globalTimeS, timeHorizonS).state;
  const b = p05StateFor(scene, second, globalTimeS, timeHorizonS).state;
  if (!a || !b) return { distanceM: Infinity, first: a?.position ?? null, second: b?.position ?? null };
  return {
    distanceM: Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y),
    first: a.position,
    second: b.position,
  };
}

export function p05RegionAt(field: P05Field, x: number): number {
  return alternatingRegionAtX(field, x);
}

export function p05SceneFromPreset(id: string): P05Scene | null {
  return P05_PRESETS[id] ?? null;
}

export function p05SceneFromSeeds(
  field: P05Field,
  seeds: Array<ParticleSeed & { launchTimeSec?: number }>,
): P05Scene {
  return sceneWithField(field.boundaries, field.fields, seeds);
}

export interface P05StoredScene {
  schemaVersion: 2;
  model: 'p05';
  field: P05Field;
  particles: ParticleInitialState[];
  runtimeById: Record<string, { launchTimeSec: number }>;
  activeParticleId: string;
}

function normalizeField(raw: unknown): P05Field | null {
  if (!isRecord(raw) || !Array.isArray(raw.boundaries) || !Array.isArray(raw.fields)) return null;
  if (raw.boundaries.length < 1 || raw.boundaries.length > 4) return null;
  if (raw.fields.length !== raw.boundaries.length + 1) return null;
  const boundaries: number[] = [];
  for (let index = 0; index < raw.boundaries.length; index++) {
    const value = raw.boundaries[index];
    if (!Number.isFinite(value) || (index > 0 && (value as number) <= boundaries[index - 1])) return null;
    boundaries.push(value as number);
  }
  const fields: number[] = [];
  for (const value of raw.fields) {
    if (!Number.isFinite(value)) return null;
    fields.push(Math.max(-100, Math.min(100, value as number)));
  }
  return { boundaries, fields };
}

export function toP05StoredScene(scene: P05Scene): P05StoredScene {
  return {
    schemaVersion: 2,
    model: 'p05',
    field: {
      boundaries: [...scene.field.boundaries],
      fields: [...scene.field.fields],
    },
    particles: scene.particles.map((particle) => ({
      ...particle,
      position: { ...particle.position },
      velocity: { ...particle.velocity },
    })),
    runtimeById: Object.fromEntries(
      scene.particles.map((particle) => [
        particle.id,
        { ...(scene.runtimeById[particle.id] ?? { launchTimeSec: 0 }) },
      ]),
    ),
    activeParticleId: scene.activeParticleId,
  };
}

export function serializeP05Scene(scene: P05Scene): string {
  return JSON.stringify(toP05StoredScene(scene), null, 2);
}

export function parseP05StoredScene(raw: unknown): { scene: P05Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'p05') {
    return { scene: null, error: '无法识别的 P05 场景格式。' };
  }
  const field = normalizeField(raw.field);
  if (!field) return { scene: null, error: 'P05 区域边界必须严格递增，Bz 数量必须匹配。' };
  const parsedParticles = parseParticleList(raw.particles);
  if (!parsedParticles.particles) return { scene: null, error: parsedParticles.error ?? 'P05 粒子配置无效。' };
  const parsed = createScene<P05Field>(field, parsedParticles.particles);
  const rawRuntime = isRecord(raw.runtimeById) ? raw.runtimeById : {};
  const runtimeById = Object.fromEntries(
    parsed.particles.map((particle) => {
      const value = rawRuntime[particle.id];
      const launch = isRecord(value) && Number.isFinite(value.launchTimeSec)
        ? Math.max(0, value.launchTimeSec as number)
        : 0;
      return [particle.id, { launchTimeSec: launch }];
    }),
  );
  return {
    scene: {
      ...parsed,
      runtimeById,
      activeParticleId:
        typeof raw.activeParticleId === 'string' && parsed.particles.some((particle) => particle.id === raw.activeParticleId)
          ? raw.activeParticleId
          : parsed.particles[0].id,
    },
    error: null,
  };
}

export function decodeP05SceneJson(text: string): { scene: P05Scene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP05StoredScene(candidate);
}

export function loadInitialP05Scene(): P05Scene {
  const stored = readLocalValue(P05_SCENE_STORAGE_KEY);
  if (stored) {
    const parsed = parseP05StoredScene(stored);
    if (parsed.scene) return parsed.scene;
  }
  return P05_DEFAULT;
}
