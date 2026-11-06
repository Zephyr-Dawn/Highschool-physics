import {
  addParticle,
  createScene,
  type MultiParticleScene,
  type ParticleInitialState,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import {
  finiteFieldContains,
  solveFiniteFieldTrajectory,
  type FiniteFieldGeometry,
  type FiniteFieldSolution,
} from '../../physics/particles/finiteMagneticRegion';
import { isRecord, parseParticleList, readLocalValue } from './sceneStorage';

export const P04_SCENE_STORAGE_KEY = 'emplab.p04.scene.v2';

export interface P04Field {
  geometry: FiniteFieldGeometry;
  Bz: number;
}

export type P04Scene = MultiParticleScene<P04Field>;

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
  geometry: FiniteFieldGeometry,
  Bz: number,
  seeds: Array<ParticleSeed & { launchTimeSec?: number }>,
): P04Scene {
  let scene = createScene<P04Field>({ geometry, Bz }, []);
  for (const item of seeds) {
    const { launchTimeSec = 0, ...particleSeed } = item;
    scene = addParticle(scene, particleSeed, launchTimeSec).scene;
  }
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

const strip = (xMin: number, xMax: number): FiniteFieldGeometry => ({ kind: 'strip', xMin, xMax });
const rect = (xMin: number, xMax: number, yMin: number, yMax: number): FiniteFieldGeometry => ({
  kind: 'rectangle',
  xMin,
  xMax,
  yMin,
  yMax,
});

export const P04_DEFAULT = sceneWithField(strip(0, 4), -1, [seed({ x: 0, y: 0 }, { x: 1, y: 0 })]);

export const P04_PRESETS: Record<string, P04Scene> = {
  'p04-default': P04_DEFAULT,
  'p04-strip-return': sceneWithField(strip(0, 4), -1, [seed({ x: 0, y: 0 }, { x: 1, y: 0 })]),
  'p04-strip-cross': sceneWithField(strip(0, 0.5), -1, [seed({ x: 0, y: 0 }, { x: 1, y: 0 })]),
  'p04-strip-critical': sceneWithField(strip(0, 1), -1, [seed({ x: 0, y: 0 }, { x: 1, y: 0 })]),
  'p04-rect-right': sceneWithField(rect(0, 2, -3, 3), 1, [seed({ x: 0.5, y: 0 }, { x: 0, y: 1 })]),
  'p04-rect-top': sceneWithField(rect(0, 4, -0.5, 0.5), -1, [seed({ x: 0, y: 0 }, { x: 1, y: 0 })]),
  'p04-tangent': sceneWithField(strip(0, 10), -1, [seed({ x: 1, y: -1 }, { x: 1, y: 0 })]),
  'p04-corner': sceneWithField(rect(0, Math.sqrt(3) / 2, -0.5, 0.5), -1, [
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }),
  ]),
  'p04-three': sceneWithField(strip(0, 0.5), -1, [
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }),
    seed({ x: 0, y: 0.1 }, { x: 0.3, y: 0 }),
    seed({ x: -0.5, y: 0 }, { x: -1, y: 0 }),
  ]),
  'p04-sign': sceneWithField(rect(0, 4, -0.5, 0.5), -1, [
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }, 1),
    seed({ x: 0, y: 0 }, { x: 1, y: 0 }, -1),
  ]),
};

export function p04SolutionFor(
  field: P04Field,
  particle: Pick<ParticleInitialState, 'position' | 'velocity' | 'chargeC' | 'massKg'>,
  timeHorizonS = 5.5,
): FiniteFieldSolution {
  return solveFiniteFieldTrajectory({
    geometry: field.geometry,
    Bz: field.Bz,
    startPosition: particle.position,
    initialVelocity: particle.velocity,
    chargeC: particle.chargeC,
    massKg: particle.massKg,
    timeHorizonS,
    maxEvents: 24,
  });
}

export function p04GlobalDuration(scene: P04Scene, timeHorizonS = 5.5): number {
  let duration = 0.1;
  for (const particle of scene.particles) {
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    duration = Math.max(duration, launch + p04SolutionFor(scene.field, particle, timeHorizonS).durationS);
  }
  return duration;
}

export function p04KeyFrames(scene: P04Scene): Array<{ time: number; label: string }> {
  const frames: Array<{ time: number; label: string }> = [{ time: 0, label: '全局起点' }];
  for (const particle of scene.particles) {
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    const solution = p04SolutionFor(scene.field, particle);
    if (solution.entry) frames.push({ time: launch + solution.entry.timeS, label: `${particle.label} 入场` });
    if (solution.exit) frames.push({ time: launch + solution.exit.timeS, label: `${particle.label} 出场` });
    if (solution.tangent) frames.push({ time: launch + solution.tangent.timeS, label: `${particle.label} 相切` });
    frames.push({ time: launch + solution.durationS, label: `${particle.label} 窗口结束` });
  }
  frames.push({ time: p04GlobalDuration(scene), label: '全局结束' });
  const unique = new Map<number, { time: number; label: string }>();
  for (const frame of frames) {
    if (!Number.isFinite(frame.time) || frame.time < 0) continue;
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!unique.has(key)) unique.set(key, frame);
  }
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

export function p04SceneFromPreset(id: string): P04Scene | null {
  return P04_PRESETS[id] ?? null;
}

export function p04SceneFromSeeds(
  geometry: FiniteFieldGeometry,
  Bz: number,
  seeds: Array<ParticleSeed & { launchTimeSec?: number }>,
): P04Scene {
  return sceneWithField(geometry, Bz, seeds);
}

export interface P04StoredScene {
  schemaVersion: 2;
  model: 'p04';
  field: P04Field;
  particles: ParticleInitialState[];
  runtimeById: Record<string, { launchTimeSec: number }>;
  activeParticleId: string;
}

function normalizeGeometry(raw: unknown): FiniteFieldGeometry | null {
  if (!isRecord(raw)) return null;
  if (raw.kind !== 'strip' && raw.kind !== 'rectangle') return null;
  if (!Number.isFinite(raw.xMin) || !Number.isFinite(raw.xMax) || (raw.xMax as number) <= (raw.xMin as number)) {
    return null;
  }
  if (raw.kind === 'rectangle') {
    if (!Number.isFinite(raw.yMin) || !Number.isFinite(raw.yMax) || (raw.yMax as number) <= (raw.yMin as number)) {
      return null;
    }
    return {
      kind: 'rectangle',
      xMin: raw.xMin as number,
      xMax: raw.xMax as number,
      yMin: raw.yMin as number,
      yMax: raw.yMax as number,
    };
  }
  return { kind: 'strip', xMin: raw.xMin as number, xMax: raw.xMax as number };
}

function normalizeField(raw: unknown): P04Field | null {
  if (!isRecord(raw)) return null;
  const geometry = normalizeGeometry(raw.geometry);
  if (!geometry || !Number.isFinite(raw.Bz)) return null;
  return { geometry, Bz: raw.Bz as number };
}

export function toP04StoredScene(scene: P04Scene): P04StoredScene {
  return {
    schemaVersion: 2,
    model: 'p04',
    field: {
      geometry: { ...scene.field.geometry },
      Bz: scene.field.Bz,
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

export function serializeP04Scene(scene: P04Scene): string {
  return JSON.stringify(toP04StoredScene(scene), null, 2);
}

export function parseP04StoredScene(raw: unknown): { scene: P04Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'p04') {
    return { scene: null, error: '无法识别的 P04 场景格式。' };
  }
  const field = normalizeField(raw.field);
  if (!field) return { scene: null, error: 'P04 磁场区域无效。' };
  const parsedParticles = parseParticleList(raw.particles);
  if (!parsedParticles.particles) return { scene: null, error: parsedParticles.error ?? 'P04 粒子配置无效。' };
  const parsed = createScene<P04Field>(field, parsedParticles.particles);
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

export function decodeP04SceneJson(text: string): { scene: P04Scene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP04StoredScene(candidate);
}

export function loadInitialP04Scene(): P04Scene {
  const stored = readLocalValue(P04_SCENE_STORAGE_KEY);
  if (stored) {
    const parsed = parseP04StoredScene(stored);
    if (parsed.scene) return parsed.scene;
  }
  return P04_DEFAULT;
}

export function p04Contains(field: P04Field, point: { x: number; y: number }): boolean {
  return finiteFieldContains(field.geometry, point);
}
