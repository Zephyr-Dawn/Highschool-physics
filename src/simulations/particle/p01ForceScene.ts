import {
  MAX_PARTICLES,
  PARTICLE_COLORS,
  PARTICLE_LABELS,
  PARTICLE_LINE_STYLES,
  type ParticleLineStyle,
} from '../../physics/particles/multiParticle';
import { isFiniteVec3, type Vec3 } from '../../physics/particles/lorentzForce';
import { isRecord, readLocalValue } from './sceneStorage';

export const P01_FORCE_SCENE_KEY = 'emplab.p01.force.scene.v1';

export interface P01ForceField {
  B: Vec3;
}

export interface P01ForceParticle {
  id: string;
  label: string;
  color: string;
  lineStyle: ParticleLineStyle;
  chargeC: number;
  massKg: number;
  velocity: Vec3;
  visible: boolean;
}

export interface P01ForceScene {
  version: 1;
  field: P01ForceField;
  particles: P01ForceParticle[];
  activeParticleId: string;
}

export type P01ForceParticleSeed = Omit<P01ForceParticle, 'id' | 'label' | 'color' | 'lineStyle'>;

interface ParticleSpec {
  chargeC: number;
  massKg: number;
  velocity: Vec3;
}

function metadataFor(index: number): { color: string; lineStyle: ParticleLineStyle } {
  return {
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
    lineStyle: PARTICLE_LINE_STYLES[index % PARTICLE_LINE_STYLES.length],
  };
}

function buildScene(field: Vec3, specs: ParticleSpec[]): P01ForceScene {
  const particles = specs.slice(0, MAX_PARTICLES).map((spec, index) => ({
    ...spec,
    velocity: { ...spec.velocity },
    id: `p${index + 1}`,
    label: PARTICLE_LABELS[index],
    ...metadataFor(index),
    visible: true,
  }));
  return {
    version: 1,
    field: { B: { ...field } },
    particles,
    activeParticleId: particles[0]?.id ?? '',
  };
}

const DEFAULT_B: Vec3 = { x: 0, y: 0, z: -4 };

export const P01_FORCE_PRESETS: Record<string, P01ForceScene> = {
  'p01-force-default': buildScene(DEFAULT_B, [
    { chargeC: 2, massKg: 1, velocity: { x: 3, y: 0, z: 0 } },
    { chargeC: -2, massKg: 1, velocity: { x: 3, y: 0, z: 0 } },
    { chargeC: 2, massKg: 1, velocity: { x: 0, y: 3, z: 0 } },
  ]),
  'p01-force-negative': buildScene(DEFAULT_B, [
    { chargeC: -2, massKg: 1, velocity: { x: 3, y: 0, z: 0 } },
  ]),
  'p01-force-parallel': buildScene(
    { x: 0, y: 0, z: 4 },
    [{ chargeC: 2, massKg: 1, velocity: { x: 0, y: 0, z: 3 } }],
  ),
  'p01-force-anti-parallel': buildScene(
    { x: 0, y: 0, z: 4 },
    [{ chargeC: -2, massKg: 1, velocity: { x: 0, y: 0, z: -3 } }],
  ),
  'p01-force-oblique': buildScene(
    { x: -2, y: 1, z: 4 },
    [{ chargeC: 2, massKg: 1, velocity: { x: 1, y: 2, z: 3 } }],
  ),
  'p01-force-angle': buildScene(
    { x: 0, y: 0, z: 3 },
    [{ chargeC: 2, massKg: 1, velocity: { x: 1, y: 0, z: Math.sqrt(3) } }],
  ),
  'p01-force-zero-charge': buildScene(DEFAULT_B, [
    { chargeC: 0, massKg: 1, velocity: { x: 3, y: 1, z: 2 } },
  ]),
  'p01-force-zero-field': buildScene({ x: 0, y: 0, z: 0 }, [
    { chargeC: 2, massKg: 1, velocity: { x: 3, y: 1, z: 2 } },
  ]),
  'p01-force-five': buildScene(DEFAULT_B, [
    { chargeC: 2, massKg: 1, velocity: { x: 3, y: 0, z: 0 } },
    { chargeC: -2, massKg: 1, velocity: { x: 3, y: 0, z: 0 } },
    { chargeC: 2, massKg: 2, velocity: { x: 0, y: 3, z: 0 } },
    { chargeC: -1, massKg: 1, velocity: { x: 0, y: 0, z: 3 } },
    { chargeC: 1, massKg: 1, velocity: { x: 1, y: 2, z: 3 } },
  ]),
};

export const P01_FORCE_DEFAULT = P01_FORCE_PRESETS['p01-force-default'];

export function activeForceParticle(scene: P01ForceScene): P01ForceParticle | undefined {
  return scene.particles.find((particle) => particle.id === scene.activeParticleId) ?? scene.particles[0];
}

export function forceParticleById(scene: P01ForceScene, id: string): P01ForceParticle | undefined {
  return scene.particles.find((particle) => particle.id === id);
}

function nextLabel(scene: P01ForceScene): (typeof PARTICLE_LABELS)[number] | null {
  const used = new Set(scene.particles.map((particle) => particle.label));
  return PARTICLE_LABELS.find((label) => !used.has(label)) ?? null;
}

function nextId(scene: P01ForceScene): string {
  const used = new Set(scene.particles.map((particle) => particle.id));
  for (let index = 1; index <= 999; index++) {
    if (!used.has(`p${index}`)) return `p${index}`;
  }
  return `p${Date.now()}`;
}

function validSeed(seed: P01ForceParticleSeed): boolean {
  return (
    Number.isFinite(seed.chargeC) &&
    Number.isFinite(seed.massKg) &&
    seed.massKg > 0 &&
    isFiniteVec3(seed.velocity) &&
    typeof seed.visible === 'boolean'
  );
}

export function addForceParticle(
  scene: P01ForceScene,
  seed: P01ForceParticleSeed,
): { scene: P01ForceScene; particle: P01ForceParticle | null } {
  if (scene.particles.length >= MAX_PARTICLES || !validSeed(seed)) return { scene, particle: null };
  const label = nextLabel(scene);
  if (!label) return { scene, particle: null };
  const index = PARTICLE_LABELS.indexOf(label);
  const particle: P01ForceParticle = {
    ...seed,
    velocity: { ...seed.velocity },
    id: nextId(scene),
    label,
    ...metadataFor(index),
  };
  return {
    scene: {
      ...scene,
      particles: [...scene.particles, particle],
      activeParticleId: particle.id,
    },
    particle,
  };
}

export function duplicateForceParticle(
  scene: P01ForceScene,
  id: string,
): { scene: P01ForceScene; particle: P01ForceParticle | null } {
  const source = forceParticleById(scene, id);
  if (!source) return { scene, particle: null };
  return addForceParticle(scene, {
    chargeC: source.chargeC,
    massKg: source.massKg,
    velocity: source.velocity,
    visible: source.visible,
  });
}

export function removeForceParticle(scene: P01ForceScene, id: string): P01ForceScene {
  if (scene.particles.length <= 1 || !forceParticleById(scene, id)) return scene;
  const particles = scene.particles.filter((particle) => particle.id !== id);
  return {
    ...scene,
    particles,
    activeParticleId: scene.activeParticleId === id ? particles[0].id : scene.activeParticleId,
  };
}

export function selectForceParticle(scene: P01ForceScene, id: string): P01ForceScene {
  if (!forceParticleById(scene, id) || scene.activeParticleId === id) return scene;
  return { ...scene, activeParticleId: id };
}

export function updateForceParticle(
  scene: P01ForceScene,
  id: string,
  patch: Partial<P01ForceParticleSeed>,
): P01ForceScene {
  const current = forceParticleById(scene, id);
  if (!current) return scene;
  const next: P01ForceParticleSeed = {
    chargeC: patch.chargeC ?? current.chargeC,
    massKg: patch.massKg ?? current.massKg,
    velocity: patch.velocity ? { ...patch.velocity } : { ...current.velocity },
    visible: patch.visible ?? current.visible,
  };
  if (!validSeed(next)) return scene;
  return {
    ...scene,
    particles: scene.particles.map((particle) =>
      particle.id === id ? { ...particle, ...next, velocity: { ...next.velocity } } : particle,
    ),
  };
}

export function applyForceField(scene: P01ForceScene, B: Vec3): P01ForceScene {
  if (!isFiniteVec3(B)) return scene;
  return { ...scene, field: { B: { ...B } } };
}

export function serializeForceScene(scene: P01ForceScene): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      model: 'p01-force',
      field: { B: { ...scene.field.B } },
      particles: scene.particles.map((particle) => ({ ...particle, velocity: { ...particle.velocity } })),
      activeParticleId: scene.activeParticleId,
    },
    null,
    2,
  );
}

export function parseForceScene(raw: unknown): { scene: P01ForceScene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.model !== 'p01-force') {
    return { scene: null, error: '无法识别的 P01 受力场景格式。' };
  }
  if (!isRecord(raw.field) || !isRecord(raw.field.B)) {
    return { scene: null, error: 'P01 磁场向量无效。' };
  }
  const B = raw.field.B;
  if (!Number.isFinite(B.x) || !Number.isFinite(B.y) || !Number.isFinite(B.z)) {
    return { scene: null, error: 'P01 磁场向量必须为有限数。' };
  }
  if (!Array.isArray(raw.particles) || raw.particles.length < 1 || raw.particles.length > MAX_PARTICLES) {
    return { scene: null, error: `P01 粒子数必须为 1–${MAX_PARTICLES}。` };
  }
  const usedLabels = new Set<string>();
  const usedIds = new Set<string>();
  const particles: P01ForceParticle[] = [];
  for (const item of raw.particles) {
    if (!isRecord(item) || !isRecord(item.velocity)) return { scene: null, error: 'P01 粒子数据无效。' };
    const velocity = item.velocity;
    if (
      !Number.isFinite(item.chargeC) ||
      !Number.isFinite(item.massKg) ||
      (item.massKg as number) <= 0 ||
      !Number.isFinite(velocity.x) ||
      !Number.isFinite(velocity.y) ||
      !Number.isFinite(velocity.z)
    ) {
      return { scene: null, error: 'P01 粒子参数必须有限且质量为正。' };
    }
    const label =
      typeof item.label === 'string' && PARTICLE_LABELS.includes(item.label as (typeof PARTICLE_LABELS)[number])
        ? item.label
        : PARTICLE_LABELS.find((candidate) => !usedLabels.has(candidate));
    if (!label || usedLabels.has(label)) return { scene: null, error: 'P01 粒子标签无效或重复。' };
    const id =
      typeof item.id === 'string' && item.id.length > 0 && !usedIds.has(item.id)
        ? item.id
        : `p${particles.length + 1}`;
    usedLabels.add(label);
    usedIds.add(id);
    const index = PARTICLE_LABELS.indexOf(label as (typeof PARTICLE_LABELS)[number]);
    particles.push({
      id,
      label,
      ...metadataFor(index),
      chargeC: item.chargeC as number,
      massKg: item.massKg as number,
      velocity: { x: velocity.x as number, y: velocity.y as number, z: velocity.z as number },
      visible: item.visible !== false,
    });
  }
  const activeParticleId =
    typeof raw.activeParticleId === 'string' && particles.some((particle) => particle.id === raw.activeParticleId)
      ? raw.activeParticleId
      : particles[0].id;
  return {
    scene: {
      version: 1,
      field: { B: { x: B.x as number, y: B.y as number, z: B.z as number } },
      particles,
      activeParticleId,
    },
    error: null,
  };
}

export function decodeForceSceneJson(text: string): { scene: P01ForceScene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseForceScene(candidate);
}

export function loadInitialForceScene(): P01ForceScene {
  const stored = readLocalValue(P01_FORCE_SCENE_KEY);
  if (stored) {
    const parsed = parseForceScene(stored);
    if (parsed.scene) return parsed.scene;
  }
  return P01_FORCE_DEFAULT;
}
