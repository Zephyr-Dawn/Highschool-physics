import {
  CHARGE_UNIT_C,
  MASS_UNIT_KG,
  SPEED_UNIT_MPS,
  createUniformBModel,
  type UniformBModel,
} from '../../physics/particles/uniformB';
import {
  addParticle,
  createScene,
  relaunchAll,
  type MultiParticleScene,
  type ParticleInitialState,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import { P02_DEFAULT, P02_PRESETS, type P02Params } from './params';
import { isRecord, parseParticleList, readLocalValue } from './sceneStorage';

export { P02_DEFAULT, P02_PRESETS };

export interface P02Field {
  fieldDir: 1 | -1;
  fieldMag: number;
}

export type P02ParticleParams = Omit<P02Params, 'fieldDir' | 'fieldMag'>;
export type P02Scene = MultiParticleScene<P02Field>;
export const P02_SCENE_STORAGE_KEY = 'emplab.p02.scene.v2';

export function p02FieldFromParams(params: P02Params): P02Field {
  return { fieldDir: params.fieldDir, fieldMag: params.fieldMag };
}

export function p02SeedFromDisplay(display: P02ParticleParams): ParticleSeed {
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

export function p02ParticleDisplay(particle: ParticlePhysicalState): P02ParticleParams {
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

type ParticlePhysicalState = Pick<ParticleInitialState, 'position' | 'velocity' | 'chargeC' | 'massKg'>;

export function p02ModelFor(field: P02Field, particle: ParticlePhysicalState): UniformBModel {
  return createUniformBModel({
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    BzTesla: field.fieldDir * field.fieldMag,
    initialPosition: particle.position,
    initialVelocity: particle.velocity,
  });
}

export function p02SingleDuration(model: UniformBModel): number {
  if (model.circular) return 2 * model.periodS;
  if (model.speed0 > 1e-9) return 0.6 / model.speed0;
  return 2e-7;
}

export function p02GlobalDuration(scene: P02Scene): number {
  let duration = 1e-7;
  for (const particle of scene.particles) {
    const model = p02ModelFor(scene.field, particle);
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    duration = Math.max(duration, launch + p02SingleDuration(model));
  }
  return duration;
}

export function p02SceneFromPreset(preset: P02Params): P02Scene {
  const field = p02FieldFromParams(preset);
  const seed = p02SeedFromDisplay(preset);
  const base = createScene<P02Field>(field, []);
  const { scene } = addParticle(base, seed, 0);
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

export function p02SceneFromDisplays(
  field: P02Field,
  displays: P02ParticleParams[],
): P02Scene {
  let scene = createScene<P02Field>(field, []);
  for (const display of displays) {
    scene = addParticle(scene, p02SeedFromDisplay(display), 0).scene;
  }
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

export interface P02StoredScene {
  schemaVersion: 2;
  model: 'p02';
  field: P02Field;
  particles: ParticleInitialState[];
  runtimeById: Record<string, { launchTimeSec: number }>;
  activeParticleId: string;
}

function normalizeP02Field(raw: unknown): P02Field | null {
  if (!isRecord(raw)) return null;
  if (!Number.isFinite(raw.fieldMag)) return null;
  const fieldMag = Math.max(0, Math.min(100, raw.fieldMag as number));
  const fieldDir = raw.fieldDir === -1 ? -1 : 1;
  return { fieldDir, fieldMag };
}

function legacyP02Params(raw: unknown): P02Params | null {
  if (!isRecord(raw)) return null;
  const keys = ['massUnits', 'chargeMag', 'fieldMag', 'speedUnits', 'directionDeg', 'startX', 'startY'] as const;
  if (!keys.every((key) => Number.isFinite(raw[key]))) return null;
  const chargeSign = raw.chargeSign === -1 ? -1 : 1;
  const fieldDir = raw.fieldDir === -1 ? -1 : 1;
  return {
    massUnits: Math.max(1e-9, raw.massUnits as number),
    chargeSign,
    chargeMag: Math.max(0, Math.min(1e6, raw.chargeMag as number)),
    fieldDir,
    fieldMag: Math.max(0, Math.min(100, raw.fieldMag as number)),
    speedUnits: Math.max(0, Math.min(100, raw.speedUnits as number)),
    directionDeg: Number.isFinite(raw.directionDeg) ? (raw.directionDeg as number) : 0,
    startX: Number.isFinite(raw.startX) ? (raw.startX as number) : P02_DEFAULT.startX,
    startY: Number.isFinite(raw.startY) ? (raw.startY as number) : P02_DEFAULT.startY,
  };
}

export function toP02StoredScene(scene: P02Scene): P02StoredScene {
  return {
    schemaVersion: 2,
    model: 'p02',
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

export function serializeP02Scene(scene: P02Scene): string {
  return JSON.stringify(toP02StoredScene(scene), null, 2);
}

export function parseP02StoredScene(raw: unknown): { scene: P02Scene | null; error: string | null } {
  if (isRecord(raw) && raw.schemaVersion === 2 && raw.model === 'p02') {
    const field = normalizeP02Field(raw.field);
    if (!field) return { scene: null, error: '磁场配置无效。' };
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
  const legacy = legacyP02Params(raw);
  if (legacy) return { scene: p02SceneFromPreset(legacy), error: null };
  return { scene: null, error: '无法识别的 P02 场景格式。' };
}

export function decodeP02SceneJson(text: string): { scene: P02Scene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP02StoredScene(candidate);
}

export function loadInitialP02Scene(): P02Scene {
  const current = readLocalValue(P02_SCENE_STORAGE_KEY);
  if (current) {
    const parsed = parseP02StoredScene(current);
    if (parsed.scene) return relaunchAll(parsed.scene);
  }
  const legacy = readLocalValue('emplab.p02.params.v1');
  const migrated = parseP02StoredScene(legacy);
  return migrated.scene ? relaunchAll(migrated.scene) : p02SceneFromPreset(P02_DEFAULT);
}

export const P02_MULTI_PRESETS: Record<string, P02Scene> = {
  'p02-multi-radius': p02SceneFromDisplays(
    { fieldDir: 1, fieldMag: 0.5 },
    [
      { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
      { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 4, directionDeg: 0, startX: -0.15, startY: 0 },
    ],
  ),
  'p02-multi-sign': p02SceneFromDisplays(
    { fieldDir: -1, fieldMag: 0.5 },
    [
      { massUnits: 1, chargeSign: 1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
      { massUnits: 1, chargeSign: -1, chargeMag: 1, speedUnits: 2, directionDeg: 0, startX: -0.15, startY: 0 },
    ],
  ),
};
