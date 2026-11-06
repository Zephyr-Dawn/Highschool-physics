import {
  CHARGE_UNIT_C,
  MASS_UNIT_KG,
  SPEED_UNIT_MPS,
} from '../../physics/particles/uniformB';
import { solveHalfPlaneTrajectory, type HalfPlaneSolution } from '../../physics/particles/halfPlane';
import {
  addParticle,
  createScene,
  relaunchAll,
  type MultiParticleScene,
  type ParticleInitialState,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import { P03_DEFAULT, P03_PRESETS, type P03Params } from './halfPlaneParams';
import { isRecord, parseParticleList, readLocalValue } from './sceneStorage';

export { P03_DEFAULT, P03_PRESETS };

export interface P03Field {
  fieldDir: 1 | -1;
  fieldMag: number;
  boundaryX: number;
}

export type P03ParticleParams = Omit<P03Params, 'fieldDir' | 'fieldMag' | 'boundaryX'>;
export type P03Scene = MultiParticleScene<P03Field>;
export const P03_SCENE_STORAGE_KEY = 'emplab.p03.scene.v2';

export function p03FieldFromParams(params: P03Params): P03Field {
  return { fieldDir: params.fieldDir, fieldMag: params.fieldMag, boundaryX: params.boundaryX };
}

export function p03SeedFromDisplay(display: P03ParticleParams): ParticleSeed {
  const angle = (display.directionDeg * Math.PI) / 180;
  const speed = display.speedUnits * SPEED_UNIT_MPS;
  return {
    position: { x: display.startX, y: display.startY },
    velocity: { x: speed * Math.cos(angle), y: speed * Math.sin(angle) },
    chargeC: display.chargeSign * display.chargeMag * CHARGE_UNIT_C,
    massKg: display.massUnits * MASS_UNIT_KG,
    visible: true,
    showTrail: true,
  };
}

type ParticlePhysicalState = Pick<ParticleInitialState, 'position' | 'velocity' | 'chargeC' | 'massKg'>;

export function p03ParticleDisplay(particle: ParticlePhysicalState): P03ParticleParams {
  const speed = Math.hypot(particle.velocity.x, particle.velocity.y);
  let directionDeg = speed > 1e-12 ? (Math.atan2(particle.velocity.y, particle.velocity.x) * 180) / Math.PI : 0;
  if (directionDeg < 0) directionDeg += 360;
  return {
    massUnits: particle.massKg / MASS_UNIT_KG,
    chargeSign: particle.chargeC < 0 ? -1 : 1,
    chargeMag: Math.abs(particle.chargeC) / CHARGE_UNIT_C,
    speedUnits: speed / SPEED_UNIT_MPS,
    directionDeg,
    startX: particle.position.x,
    startY: particle.position.y,
  };
}

export function p03SolutionFor(field: P03Field, particle: ParticlePhysicalState): HalfPlaneSolution {
  return solveHalfPlaneTrajectory({
    startPosition: particle.position,
    initialVelocity: particle.velocity,
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    BzTesla: field.fieldDir * field.fieldMag,
    boundaryPoint: { x: field.boundaryX, y: 0 },
    boundaryNormal: { x: 1, y: 0 },
  });
}

export function p03GlobalDuration(scene: P03Scene): number {
  let duration = 1e-7;
  for (const particle of scene.particles) {
    const solution = p03SolutionFor(scene.field, particle);
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    duration = Math.max(duration, launch + solution.durationS);
  }
  return duration;
}

export function p03SceneFromPreset(preset: P03Params): P03Scene {
  const field = p03FieldFromParams(preset);
  const seed = p03SeedFromDisplay(preset);
  const base = createScene<P03Field>(field, []);
  const { scene } = addParticle(base, seed, 0);
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

export function p03SceneFromDisplays(
  field: P03Field,
  displays: P03ParticleParams[],
): P03Scene {
  let scene = createScene<P03Field>(field, []);
  for (const display of displays) {
    scene = addParticle(scene, p03SeedFromDisplay(display), 0).scene;
  }
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

export interface P03StoredScene {
  schemaVersion: 2;
  model: 'p03';
  field: P03Field;
  particles: ParticleInitialState[];
  runtimeById: Record<string, { launchTimeSec: number }>;
  activeParticleId: string;
}

function normalizeP03Field(raw: unknown): P03Field | null {
  if (!isRecord(raw)) return null;
  if (!Number.isFinite(raw.fieldMag) || !Number.isFinite(raw.boundaryX)) return null;
  return {
    fieldDir: raw.fieldDir === -1 ? -1 : 1,
    fieldMag: Math.max(0, Math.min(100, raw.fieldMag as number)),
    boundaryX: Math.max(-1e6, Math.min(1e6, raw.boundaryX as number)),
  };
}

function legacyP03Params(raw: unknown): P03Params | null {
  if (!isRecord(raw)) return null;
  const keys = ['massUnits', 'chargeMag', 'fieldMag', 'speedUnits', 'directionDeg', 'startX', 'startY', 'boundaryX'] as const;
  if (!keys.every((key) => Number.isFinite(raw[key]))) return null;
  return {
    massUnits: Math.max(1e-9, raw.massUnits as number),
    chargeSign: raw.chargeSign === -1 ? -1 : 1,
    chargeMag: Math.max(0, Math.min(1e6, raw.chargeMag as number)),
    fieldDir: raw.fieldDir === -1 ? -1 : 1,
    fieldMag: Math.max(0, Math.min(100, raw.fieldMag as number)),
    speedUnits: Math.max(0, Math.min(100, raw.speedUnits as number)),
    directionDeg: Number.isFinite(raw.directionDeg) ? (raw.directionDeg as number) : 0,
    startX: Number.isFinite(raw.startX) ? (raw.startX as number) : P03_DEFAULT.startX,
    startY: Number.isFinite(raw.startY) ? (raw.startY as number) : P03_DEFAULT.startY,
    boundaryX: Math.max(-1e6, Math.min(1e6, raw.boundaryX as number)),
  };
}

export function toP03StoredScene(scene: P03Scene): P03StoredScene {
  return {
    schemaVersion: 2,
    model: 'p03',
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

export function serializeP03Scene(scene: P03Scene): string {
  return JSON.stringify(toP03StoredScene(scene), null, 2);
}

export function parseP03StoredScene(raw: unknown): { scene: P03Scene | null; error: string | null } {
  if (isRecord(raw) && raw.schemaVersion === 2 && raw.model === 'p03') {
    const field = normalizeP03Field(raw.field);
    if (!field) return { scene: null, error: '磁场或边界配置无效。' };
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
    const hydrated = { ...scene, runtimeById };
    const activeParticleId = typeof raw.activeParticleId === 'string' && scene.particles.some(
      (particle) => particle.id === raw.activeParticleId,
    )
      ? raw.activeParticleId
      : scene.particles[0].id;
    return { scene: { ...hydrated, activeParticleId }, error: null };
  }
  const legacy = legacyP03Params(raw);
  if (legacy) return { scene: p03SceneFromPreset(legacy), error: null };
  return { scene: null, error: '无法识别的 P03 场景格式。' };
}

export function decodeP03SceneJson(text: string): { scene: P03Scene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP03StoredScene(candidate);
}

export function loadInitialP03Scene(): P03Scene {
  const current = readLocalValue(P03_SCENE_STORAGE_KEY);
  if (current) {
    const parsed = parseP03StoredScene(current);
    if (parsed.scene) return relaunchAll(parsed.scene);
  }
  const legacy = readLocalValue('emplab.p03.params.v1');
  const migrated = parseP03StoredScene(legacy);
  return migrated.scene ? relaunchAll(migrated.scene) : p03SceneFromPreset(P03_DEFAULT);
}

const p03MultiBase: P03ParticleParams = {
  massUnits: 1,
  chargeSign: 1,
  chargeMag: 1,
  speedUnits: 2,
  directionDeg: 0,
  startX: 0,
  startY: 0,
};

export const P03_MULTI_PRESETS: Record<string, P03Scene> = {
  'p03-multi-exit': p03SceneFromDisplays(
    { fieldDir: -1, fieldMag: 0.8, boundaryX: 0 },
    [p03MultiBase, { ...p03MultiBase, speedUnits: 4 }],
  ),
  'p03-multi-sign': p03SceneFromDisplays(
    { fieldDir: -1, fieldMag: 0.8, boundaryX: 0 },
    [p03MultiBase, { ...p03MultiBase, chargeSign: -1 }],
  ),
  'p03-multi-mixed': p03SceneFromDisplays(
    { fieldDir: -1, fieldMag: 0.8, boundaryX: 0 },
    [
      p03MultiBase,
      { ...p03MultiBase, chargeSign: -1, directionDeg: 90 },
      { ...p03MultiBase, directionDeg: 180, startX: -0.22 },
    ],
  ),
};
