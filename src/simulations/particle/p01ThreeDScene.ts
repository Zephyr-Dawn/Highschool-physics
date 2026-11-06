import {
  MAX_PARTICLES,
  PARTICLE_COLORS,
  PARTICLE_LABELS,
  PARTICLE_LINE_STYLES,
  particleTau,
  type ParticleLineStyle,
} from '../../physics/particles/multiParticle';
import {
  isFiniteVec3,
  type Vec3,
} from '../../physics/particles/lorentzForce';
import {
  uniformB3DModel,
  uniformB3DStateAt,
  type UniformB3DModel,
  type UniformB3DState,
} from '../../physics/particles/uniformB3D';
import { P01_FORCE_SCENE_KEY, parseForceScene, type P01ForceScene } from './p01ForceScene';
import { isRecord, readLocalValue } from './sceneStorage';

export const P01_THREE_SCENE_KEY = 'emplab.p01.three.scene.v2';

export type P01CameraPreset = 'front' | 'side' | 'top' | 'oblique' | 'reset' | 'custom';
export type P01EditPlane = 'XY' | 'XZ' | 'YZ';

export interface P01ThreeDField {
  B: Vec3;
}

export interface P01ThreeDParticle {
  id: string;
  label: string;
  color: string;
  lineStyle: ParticleLineStyle;
  position: Vec3;
  velocity: Vec3;
  chargeC: number;
  massKg: number;
  visible: boolean;
  showTrail: boolean;
}

export interface P01ThreeDRuntime {
  launchTimeSec: number;
}

export interface P01ThreeDScene {
  version: 2;
  field: P01ThreeDField;
  particles: P01ThreeDParticle[];
  runtimeById: Record<string, P01ThreeDRuntime>;
  activeParticleId: string;
}

export type P01ThreeDSeed = Omit<P01ThreeDParticle, 'id' | 'label' | 'color' | 'lineStyle'>;

export interface P01ThreeDEvaluation {
  particle: P01ThreeDParticle;
  model: UniformB3DModel;
  tauS: number | null;
  state: UniformB3DState | null;
}

interface ParticleSpec {
  position: Vec3;
  velocity: Vec3;
  chargeC: number;
  massKg: number;
  launchTimeSec?: number;
  visible?: boolean;
  showTrail?: boolean;
}

function metadataFor(index: number): { color: string; lineStyle: ParticleLineStyle } {
  return {
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
    lineStyle: PARTICLE_LINE_STYLES[index % PARTICLE_LINE_STYLES.length],
  };
}

function buildScene(field: Vec3, specs: ParticleSpec[]): P01ThreeDScene {
  const particles = specs.slice(0, MAX_PARTICLES).map((spec, index) => ({
    id: `p${index + 1}`,
    label: PARTICLE_LABELS[index],
    ...metadataFor(index),
    position: { ...spec.position },
    velocity: { ...spec.velocity },
    chargeC: spec.chargeC,
    massKg: spec.massKg,
    visible: spec.visible !== false,
    showTrail: spec.showTrail !== false,
  }));
  const runtimeById: Record<string, P01ThreeDRuntime> = {};
  particles.forEach((particle, index) => {
    runtimeById[particle.id] = { launchTimeSec: Math.max(0, specs[index]?.launchTimeSec ?? 0) };
  });
  return {
    version: 2,
    field: { B: { ...field } },
    particles,
    runtimeById,
    activeParticleId: particles[0]?.id ?? '',
  };
}

const Z: Vec3 = { x: 0, y: 0, z: 0 };
const BZ: Vec3 = { x: 0, y: 0, z: 1 };
const BZ_NEGATIVE: Vec3 = { x: 0, y: 0, z: -1 };
const BZ_DEFAULT: Vec3 = { x: 0, y: 0, z: 2 };
const BZ_STRONG: Vec3 = { x: 0, y: 0, z: 4 };

export const P01_THREE_DEFAULT = buildScene(BZ_DEFAULT, [
  { position: { x: -1.5, y: -0.55, z: 0 }, velocity: { x: 2, y: 0, z: 1 }, chargeC: 2, massKg: 1 },
]);

export const P01_THREE_PRESETS: Record<string, P01ThreeDScene> = {
  'p01-3d-default': P01_THREE_DEFAULT,
  'p01-3d-force-front': buildScene(BZ_STRONG, [
    { position: { x: -1.5, y: -0.6, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, chargeC: 2, massKg: 1 },
  ]),
  'p01-3d-force-negative': buildScene(BZ_STRONG, [
    { position: { x: -1.5, y: -0.6, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, chargeC: -2, massKg: 1 },
  ]),
  'p01-3d-force-parallel': buildScene(BZ_STRONG, [
    { position: { x: -1.4, y: -0.8, z: 0 }, velocity: { x: 0, y: 0, z: 3 }, chargeC: 2, massKg: 1 },
  ]),
  'p01-3d-force-oblique': buildScene({ x: -2, y: 1, z: 4 }, [
    { position: { x: -1.4, y: -0.7, z: 0 }, velocity: { x: 1, y: 2, z: 3 }, chargeC: 2, massKg: 1 },
  ]),
  'p01-3d-force-five': buildScene(BZ, [
    { position: { x: -1.4, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.4, y: 1.1, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: -1, massKg: 1 },
    { position: { x: -1.4, y: -1.1, z: 0 }, velocity: { x: 0, y: 1, z: 0.6 }, chargeC: 2, massKg: 2 },
    { position: { x: -1.4, y: 0, z: 1.1 }, velocity: { x: 0, y: 0, z: 1.5 }, chargeC: -1, massKg: 1 },
    { position: { x: -1.4, y: 0, z: -1.1 }, velocity: { x: 1, y: 0.5, z: 1 }, chargeC: 1, massKg: 2.5 },
  ]),
  'p01-motion3d-circle': buildScene(BZ, [
    { position: Z, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
  ]),
  'p01-motion3d-helix': buildScene(BZ, [
    { position: Z, velocity: { x: 1, y: 0, z: 1 }, chargeC: 1, massKg: 1 },
  ]),
  'p01-motion3d-reverse': buildScene(BZ_NEGATIVE, [
    { position: Z, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
  ]),
  'p01-motion3d-sign': buildScene(BZ, [
    { position: { x: -1, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
    { position: { x: -1, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: -1, massKg: 1 },
  ]),
  'p01-motion3d-mass': buildScene(BZ, [
    { position: { x: -1, y: 0.25, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
    { position: { x: -1, y: -0.25, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 4 },
  ]),
  'p01-motion3d-three': buildScene(BZ, [
    { position: { x: -1.5, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: 0.8, z: 0 }, velocity: { x: 1, y: 0, z: 1 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: -0.8, z: 0 }, velocity: { x: 1, y: 0, z: -0.5 }, chargeC: -1, massKg: 1 },
  ]),
  'p01-motion3d-five': buildScene(BZ, [
    { position: { x: -1.5, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: 0.8, z: 0 }, velocity: { x: 1, y: 0, z: 1 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: -0.8, z: 0 }, velocity: { x: 1, y: 0, z: -0.5 }, chargeC: -1, massKg: 1 },
    { position: { x: -1.5, y: 0, z: 1.1 }, velocity: { x: 0.8, y: 0.3, z: 0.8 }, chargeC: 2, massKg: 2 },
    { position: { x: -1.5, y: 0, z: -1.1 }, velocity: { x: 0.8, y: -0.3, z: -0.8 }, chargeC: -2, massKg: 2 },
  ]),
  'p01-motion3d-restart': buildScene(BZ, [
    { position: { x: -1.5, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: 0.8, z: 0 }, velocity: { x: 1, y: 0, z: 1 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: -0.8, z: 0 }, velocity: { x: 1, y: 0, z: -0.5 }, chargeC: -1, massKg: 1 },
  ]),
  'p01-motion3d-live-edit': buildScene(BZ, [
    { position: { x: -1.5, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: 0.8, z: 0 }, velocity: { x: 1, y: 0, z: 1 }, chargeC: 1, massKg: 1 },
    { position: { x: -1.5, y: -0.8, z: 0 }, velocity: { x: 1, y: 0, z: -0.5 }, chargeC: -1, massKg: 1 },
  ]),
  'p01-motion3d-waiting': buildScene(BZ, [
    { position: { x: -1.5, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, chargeC: 1, massKg: 1, launchTimeSec: 0 },
    { position: { x: -1.5, y: 0.8, z: 0 }, velocity: { x: 1, y: 0, z: 1 }, chargeC: 1, massKg: 1, launchTimeSec: 1.2 },
    { position: { x: -1.5, y: -0.8, z: 0 }, velocity: { x: 1, y: 0, z: -0.5 }, chargeC: -1, massKg: 1, launchTimeSec: 2.4 },
  ]),
};

export const P01_THREE_PRESET_CAMERAS: Record<string, P01CameraPreset> = {
  'p01-3d-default': 'oblique',
  'p01-3d-force-front': 'front',
  'p01-3d-force-negative': 'front',
  'p01-3d-force-parallel': 'side',
  'p01-3d-force-oblique': 'oblique',
  'p01-3d-force-five': 'oblique',
  'p01-motion3d-circle': 'front',
  'p01-motion3d-helix': 'oblique',
  'p01-motion3d-reverse': 'front',
  'p01-motion3d-sign': 'front',
  'p01-motion3d-mass': 'front',
  'p01-motion3d-three': 'oblique',
  'p01-motion3d-five': 'oblique',
  'p01-motion3d-restart': 'oblique',
  'p01-motion3d-live-edit': 'oblique',
  'p01-motion3d-waiting': 'oblique',
};

export function activeThreeDParticle(scene: P01ThreeDScene): P01ThreeDParticle | undefined {
  return scene.particles.find((particle) => particle.id === scene.activeParticleId) ?? scene.particles[0];
}

export function threeDParticleById(scene: P01ThreeDScene, id: string): P01ThreeDParticle | undefined {
  return scene.particles.find((particle) => particle.id === id);
}

function nextId(scene: P01ThreeDScene): string {
  const used = new Set(scene.particles.map((particle) => particle.id));
  for (let index = 1; index <= 999; index++) {
    if (!used.has(`p${index}`)) return `p${index}`;
  }
  return `p${Date.now()}`;
}

function nextLabel(scene: P01ThreeDScene): (typeof PARTICLE_LABELS)[number] | null {
  const used = new Set(scene.particles.map((particle) => particle.label));
  return PARTICLE_LABELS.find((label) => !used.has(label)) ?? null;
}

function validSeed(seed: P01ThreeDSeed): boolean {
  return (
    isFiniteVec3(seed.position) &&
    isFiniteVec3(seed.velocity) &&
    Number.isFinite(seed.chargeC) &&
    Number.isFinite(seed.massKg) &&
    seed.massKg > 0 &&
    typeof seed.visible === 'boolean' &&
    typeof seed.showTrail === 'boolean'
  );
}

export function createThreeDScene(field: P01ThreeDField, seeds: P01ThreeDSeed[]): P01ThreeDScene {
  return buildScene(field.B, seeds);
}

export function addThreeDParticle(
  scene: P01ThreeDScene,
  seed: P01ThreeDSeed,
  launchTimeSec = 0,
): { scene: P01ThreeDScene; particle: P01ThreeDParticle | null } {
  if (scene.particles.length >= MAX_PARTICLES || !validSeed(seed)) return { scene, particle: null };
  const label = nextLabel(scene);
  if (!label) return { scene, particle: null };
  const index = PARTICLE_LABELS.indexOf(label);
  const particle: P01ThreeDParticle = {
    ...seed,
    id: nextId(scene),
    label,
    ...metadataFor(index),
    position: { ...seed.position },
    velocity: { ...seed.velocity },
  };
  return {
    scene: {
      ...scene,
      particles: [...scene.particles, particle],
      runtimeById: {
        ...scene.runtimeById,
        [particle.id]: { launchTimeSec: Math.max(0, Number.isFinite(launchTimeSec) ? launchTimeSec : 0) },
      },
      activeParticleId: particle.id,
    },
    particle,
  };
}

export function duplicateThreeDParticle(
  scene: P01ThreeDScene,
  id: string,
  launchTimeSec = 0,
): { scene: P01ThreeDScene; particle: P01ThreeDParticle | null } {
  const source = threeDParticleById(scene, id);
  if (!source) return { scene, particle: null };
  return addThreeDParticle(
    scene,
    {
      position: source.position,
      velocity: source.velocity,
      chargeC: source.chargeC,
      massKg: source.massKg,
      visible: source.visible,
      showTrail: source.showTrail,
    },
    launchTimeSec,
  );
}

export function removeThreeDParticle(scene: P01ThreeDScene, id: string): P01ThreeDScene {
  if (scene.particles.length <= 1 || !threeDParticleById(scene, id)) return scene;
  const particles = scene.particles.filter((particle) => particle.id !== id);
  const runtimeById = { ...scene.runtimeById };
  delete runtimeById[id];
  return {
    ...scene,
    particles,
    runtimeById,
    activeParticleId: scene.activeParticleId === id ? particles[0]?.id ?? '' : scene.activeParticleId,
  };
}

export function selectThreeDParticle(scene: P01ThreeDScene, id: string): P01ThreeDScene {
  if (!threeDParticleById(scene, id) || scene.activeParticleId === id) return scene;
  return { ...scene, activeParticleId: id };
}

export function updateThreeDParticle(
  scene: P01ThreeDScene,
  id: string,
  patch: Partial<P01ThreeDSeed>,
): P01ThreeDScene {
  const current = threeDParticleById(scene, id);
  if (!current) return scene;
  const next: P01ThreeDSeed = {
    position: patch.position ? { ...patch.position } : { ...current.position },
    velocity: patch.velocity ? { ...patch.velocity } : { ...current.velocity },
    chargeC: patch.chargeC ?? current.chargeC,
    massKg: patch.massKg ?? current.massKg,
    visible: patch.visible ?? current.visible,
    showTrail: patch.showTrail ?? current.showTrail,
  };
  if (!validSeed(next)) return scene;
  return {
    ...scene,
    particles: scene.particles.map((particle) =>
      particle.id === id
        ? { ...particle, ...next, position: { ...next.position }, velocity: { ...next.velocity } }
        : particle,
    ),
  };
}

export function relaunchThreeDParticle(
  scene: P01ThreeDScene,
  id: string,
  nowGlobalTimeS: number,
): P01ThreeDScene {
  if (!scene.runtimeById[id]) return scene;
  const launch = Number.isFinite(nowGlobalTimeS) ? Math.max(0, nowGlobalTimeS) : 0;
  return {
    ...scene,
    runtimeById: { ...scene.runtimeById, [id]: { launchTimeSec: launch } },
  };
}

export function updateThreeDParticleAndRelaunch(
  scene: P01ThreeDScene,
  id: string,
  patch: Partial<P01ThreeDSeed>,
  nowGlobalTimeS: number,
): P01ThreeDScene {
  return relaunchThreeDParticle(updateThreeDParticle(scene, id, patch), id, nowGlobalTimeS);
}

export function relaunchAllThreeD(scene: P01ThreeDScene): P01ThreeDScene {
  const runtimeById: Record<string, P01ThreeDRuntime> = {};
  for (const particle of scene.particles) runtimeById[particle.id] = { launchTimeSec: 0 };
  return { ...scene, runtimeById };
}

export function applySharedB(scene: P01ThreeDScene, B: Vec3): P01ThreeDScene {
  if (!isFiniteVec3(B)) return scene;
  return relaunchAllThreeD({ ...scene, field: { B: { ...B } } });
}

export function p01ThreeDCircleCenter(
  model: UniformB3DModel,
  particle: P01ThreeDParticle,
): Vec3 | null {
  if (!model.axis || model.radiusM === null || Math.abs(model.omegaSigned) < 1e-12) return null;
  const offset = {
    x: model.axis.y * model.vPerp.z - model.axis.z * model.vPerp.y,
    y: model.axis.z * model.vPerp.x - model.axis.x * model.vPerp.z,
    z: model.axis.x * model.vPerp.y - model.axis.y * model.vPerp.x,
  };
  return {
    x: particle.position.x + offset.x / model.omegaSigned,
    y: particle.position.y + offset.y / model.omegaSigned,
    z: particle.position.z + offset.z / model.omegaSigned,
  };
}

export function p01ThreeDModelFor(scene: P01ThreeDScene, particle: P01ThreeDParticle): UniformB3DModel {
  return uniformB3DModel({
    position: particle.position,
    velocity: particle.velocity,
    chargeC: particle.chargeC,
    massKg: particle.massKg,
    B: scene.field.B,
  });
}

export function p01ThreeDStateFor(
  scene: P01ThreeDScene,
  particle: P01ThreeDParticle,
  globalTimeS: number,
): P01ThreeDEvaluation {
  const model = p01ThreeDModelFor(scene, particle);
  const tauS = particleTau(scene.runtimeById[particle.id], globalTimeS);
  return {
    particle,
    model,
    tauS,
    state: tauS === null ? null : uniformB3DStateAt(model, tauS),
  };
}

export function p01ThreeDEvaluations(scene: P01ThreeDScene, globalTimeS: number): P01ThreeDEvaluation[] {
  return scene.particles.map((particle) => p01ThreeDStateFor(scene, particle, globalTimeS));
}

export function p01ThreeDDuration(scene: P01ThreeDScene): number {
  let duration = 6;
  for (const particle of scene.particles) {
    const model = p01ThreeDModelFor(scene, particle);
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    if (model.periodS !== null && Number.isFinite(model.periodS) && model.periodS > 0) {
      duration = Math.max(duration, launch + 2 * model.periodS);
    } else {
      duration = Math.max(duration, launch + 4);
    }
  }
  return Math.min(24, Math.max(6, duration));
}

export function p01ThreeDKeyFrames(scene: P01ThreeDScene): Array<{ time: number; label: string }> {
  const frames: Array<{ time: number; label: string }> = [];
  for (const particle of scene.particles) {
    const model = p01ThreeDModelFor(scene, particle);
    const launch = scene.runtimeById[particle.id]?.launchTimeSec ?? 0;
    frames.push({ time: launch, label: `${particle.label} 发射` });
    if (model.periodS !== null && Number.isFinite(model.periodS) && model.periodS > 0) {
      for (let quarter = 1; quarter <= 8; quarter++) {
        frames.push({
          time: launch + (quarter * model.periodS) / 4,
          label: `${particle.label} ${quarter % 4 === 0 ? `${quarter / 4}T` : `${quarter}T/4`}`,
        });
      }
    } else {
      for (const offset of [1, 2, 3, 4]) {
        frames.push({ time: launch + offset, label: `${particle.label} +${offset}s` });
      }
    }
  }
  const duration = p01ThreeDDuration(scene);
  frames.push({ time: 0, label: '全局起点' }, { time: duration, label: '全局结束' });
  const unique = new Map<number, { time: number; label: string }>();
  for (const frame of frames) {
    if (frame.time < 0 || frame.time > duration + 1e-9) continue;
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!unique.has(key)) unique.set(key, frame);
  }
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

export function serializeP01ThreeDScene(scene: P01ThreeDScene): string {
  return JSON.stringify(
    {
      schemaVersion: 2,
      model: 'p01-three',
      field: { B: { ...scene.field.B } },
      particles: scene.particles.map((particle) => ({
        ...particle,
        position: { ...particle.position },
        velocity: { ...particle.velocity },
      })),
      runtimeById: Object.fromEntries(
        Object.entries(scene.runtimeById).map(([id, runtime]) => [id, { ...runtime }]),
      ),
      activeParticleId: scene.activeParticleId,
    },
    null,
    2,
  );
}

function parseVec3(value: unknown): Vec3 | null {
  if (!isRecord(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    return null;
  }
  return { x: value.x as number, y: value.y as number, z: value.z as number };
}

export function parseP01ThreeDScene(raw: unknown): { scene: P01ThreeDScene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'p01-three') {
    return { scene: null, error: '无法识别的 P01 三维场景格式。' };
  }
  if (!isRecord(raw.field)) return { scene: null, error: 'P01 三维磁场缺失。' };
  const B = parseVec3(raw.field.B);
  if (!B) return { scene: null, error: 'P01 三维磁场向量必须为有限数。' };
  if (!Array.isArray(raw.particles) || raw.particles.length < 1 || raw.particles.length > MAX_PARTICLES) {
    return { scene: null, error: `P01 三维粒子数必须为 1–${MAX_PARTICLES}。` };
  }
  const usedIds = new Set<string>();
  const usedLabels = new Set<string>();
  const particles: P01ThreeDParticle[] = [];
  for (const item of raw.particles) {
    if (!isRecord(item)) return { scene: null, error: 'P01 三维粒子数据无效。' };
    const position = parseVec3(item.position);
    const velocity = parseVec3(item.velocity);
    if (!position || !velocity) return { scene: null, error: 'P01 三维粒子位置或速度包含无效数值。' };
    if (
      typeof item.label !== 'string' ||
      !PARTICLE_LABELS.includes(item.label as (typeof PARTICLE_LABELS)[number]) ||
      usedLabels.has(item.label)
    ) {
      return { scene: null, error: 'P01 三维粒子标签必须是唯一的 A–E。' };
    }
    if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 80 || usedIds.has(item.id)) {
      return { scene: null, error: 'P01 三维粒子 ID 为空、过长或重复。' };
    }
    if (!Number.isFinite(item.chargeC)) return { scene: null, error: 'P01 三维粒子电荷量无效。' };
    if (!Number.isFinite(item.massKg) || (item.massKg as number) <= 0) {
      return { scene: null, error: 'P01 三维粒子质量必须为正数。' };
    }
    usedIds.add(item.id);
    usedLabels.add(item.label);
    const index = PARTICLE_LABELS.indexOf(item.label as (typeof PARTICLE_LABELS)[number]);
    particles.push({
      id: item.id,
      label: item.label,
      ...metadataFor(index),
      position,
      velocity,
      chargeC: item.chargeC as number,
      massKg: item.massKg as number,
      visible: item.visible !== false,
      showTrail: item.showTrail !== false,
    });
  }
  const runtimeById: Record<string, P01ThreeDRuntime> = {};
  for (const particle of particles) {
    const rawRuntime = isRecord(raw.runtimeById) ? raw.runtimeById[particle.id] : null;
    const launch = isRecord(rawRuntime) && Number.isFinite(rawRuntime.launchTimeSec)
      ? Math.max(0, rawRuntime.launchTimeSec as number)
      : 0;
    runtimeById[particle.id] = { launchTimeSec: launch };
  }
  const activeParticleId =
    typeof raw.activeParticleId === 'string' && particles.some((particle) => particle.id === raw.activeParticleId)
      ? raw.activeParticleId
      : particles[0].id;
  return {
    scene: {
      version: 2,
      field: { B },
      particles,
      runtimeById,
      activeParticleId,
    },
    error: null,
  };
}

export function decodeP01ThreeDSceneJson(text: string): { scene: P01ThreeDScene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP01ThreeDScene(candidate);
}

const MIGRATION_POSITIONS: Vec3[] = [
  { x: -1.2, y: 0, z: 0 },
  { x: -1.2, y: 1.2, z: 0 },
  { x: -1.2, y: -1.2, z: 0 },
  { x: -1.2, y: 0, z: 1.2 },
  { x: -1.2, y: 0, z: -1.2 },
];

export function migrateForceSceneToThreeD(old: P01ForceScene): P01ThreeDScene {
  return buildScene(
    old.field.B,
    old.particles.map((particle, index) => ({
      position: MIGRATION_POSITIONS[index] ?? { x: -1.2, y: 0, z: 0 },
      velocity: particle.velocity,
      chargeC: particle.chargeC,
      massKg: particle.massKg,
      visible: particle.visible,
      launchTimeSec: 0,
    })),
  );
}

export function toLegacyForceScene(scene: P01ThreeDScene): P01ForceScene {
  return {
    version: 1,
    field: { B: { ...scene.field.B } },
    particles: scene.particles.map((particle) => ({
      id: particle.id,
      label: particle.label,
      color: particle.color,
      lineStyle: particle.lineStyle,
      chargeC: particle.chargeC,
      massKg: particle.massKg,
      velocity: { ...particle.velocity },
      visible: particle.visible,
    })),
    activeParticleId: scene.activeParticleId,
  };
}

export function loadInitialP01ThreeDScene(): P01ThreeDScene {
  const stored = readLocalValue(P01_THREE_SCENE_KEY);
  if (stored) {
    const parsed = parseP01ThreeDScene(stored);
    if (parsed.scene) return parsed.scene;
  }
  const legacy = readLocalValue(P01_FORCE_SCENE_KEY);
  if (legacy) {
    const parsed = parseForceScene(legacy);
    if (parsed.scene) return migrateForceSceneToThreeD(parsed.scene);
  }
  return P01_THREE_DEFAULT;
}

export function p01ThreeDPreset(id: string): P01ThreeDScene | null {
  return P01_THREE_PRESETS[id] ?? null;
}
