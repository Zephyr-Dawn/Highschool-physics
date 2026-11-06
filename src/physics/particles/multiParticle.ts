import type { Vec2 } from '../core/vec2';

/**
 * Multi-particle scene conventions:
 * - One shared external field, one global clock, independent initial states.
 * - launchTimeSec is the global time at which the particle's local motion starts.
 * - Particles never interact with each other in this model.
 * - Initial states use SI units; UI unit conversions stay outside this module.
 */

export const MAX_PARTICLES = 5;
export const PARTICLE_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
export const PARTICLE_COLORS = ['#1d4ed8', '#c2410c', '#0f766e', '#7e22ce', '#b91c1c'] as const;
export type ParticleLineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'long-dash';
export const PARTICLE_LINE_STYLES: readonly ParticleLineStyle[] = [
  'solid',
  'dashed',
  'dotted',
  'dash-dot',
  'long-dash',
];

export interface ParticleInitialState {
  id: string;
  label: string;
  color: string;
  lineStyle: ParticleLineStyle;
  position: Vec2;
  velocity: Vec2;
  chargeC: number;
  massKg: number;
  visible: boolean;
  showTrail: boolean;
}

export interface ParticleRuntime {
  launchTimeSec: number;
}

export interface MultiParticleScene<TField> {
  version: 1;
  field: TField;
  particles: ParticleInitialState[];
  runtimeById: Record<string, ParticleRuntime>;
  activeParticleId: string;
}

export interface ParticleDraft {
  particleId: string;
  committedParticle: ParticleInitialState;
  draftParticle: ParticleInitialState;
  startedAtGlobalTime: number;
}

export type ParticleSeed = Omit<ParticleInitialState, 'id' | 'label' | 'color' | 'lineStyle'>;

function finiteVec(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

export function isValidParticleSeed(seed: ParticleSeed): boolean {
  return (
    finiteVec(seed.position) &&
    finiteVec(seed.velocity) &&
    Number.isFinite(seed.chargeC) &&
    Number.isFinite(seed.massKg) &&
    seed.massKg > 0 &&
    typeof seed.visible === 'boolean' &&
    typeof seed.showTrail === 'boolean'
  );
}

export function createScene<TField>(
  field: TField,
  particles: ParticleInitialState[] = [],
  activeParticleId = '',
): MultiParticleScene<TField> {
  const runtimeById: Record<string, ParticleRuntime> = {};
  for (const particle of particles) runtimeById[particle.id] = { launchTimeSec: 0 };
  const active = particles.some((particle) => particle.id === activeParticleId)
    ? activeParticleId
    : particles[0]?.id ?? '';
  return { version: 1, field, particles, runtimeById, activeParticleId: active };
}

function nextId(particles: ParticleInitialState[], prefix = 'p'): string {
  const used = new Set(particles.map((particle) => particle.id));
  for (let index = 1; index <= 999; index++) {
    const candidate = `${prefix}${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

function nextLabel(particles: ParticleInitialState[]): (typeof PARTICLE_LABELS)[number] | null {
  const used = new Set(particles.map((particle) => particle.label));
  return PARTICLE_LABELS.find((label) => !used.has(label)) ?? null;
}

function metadataForLabel(label: string) {
  const index = PARTICLE_LABELS.indexOf(label as (typeof PARTICLE_LABELS)[number]);
  const safeIndex = index >= 0 ? index : 0;
  return {
    color: PARTICLE_COLORS[safeIndex],
    lineStyle: PARTICLE_LINE_STYLES[safeIndex],
  };
}

export function particleById<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
): ParticleInitialState | undefined {
  return scene.particles.find((particle) => particle.id === id);
}

export function activeParticle<TField>(scene: MultiParticleScene<TField>): ParticleInitialState | undefined {
  return particleById(scene, scene.activeParticleId);
}

export function addParticle<TField>(
  scene: MultiParticleScene<TField>,
  seed: ParticleSeed,
  launchTimeSec: number,
  options: { label?: string } = {},
): { scene: MultiParticleScene<TField>; particle: ParticleInitialState | null } {
  if (scene.particles.length >= MAX_PARTICLES || !isValidParticleSeed(seed)) {
    return { scene, particle: null };
  }
  const label = options.label && !scene.particles.some((particle) => particle.label === options.label)
    ? options.label
    : nextLabel(scene.particles);
  if (!label) return { scene, particle: null };
  const particle: ParticleInitialState = {
    ...seed,
    position: { ...seed.position },
    velocity: { ...seed.velocity },
    id: nextId(scene.particles),
    label,
    ...metadataForLabel(label),
  };
  const particles = [...scene.particles, particle];
  const launch = Number.isFinite(launchTimeSec) ? Math.max(0, launchTimeSec) : 0;
  const runtimeById = { ...scene.runtimeById, [particle.id]: { launchTimeSec: launch } };
  return {
    scene: {
      ...scene,
      particles,
      runtimeById,
      activeParticleId: particle.id,
    },
    particle,
  };
}

export function duplicateParticle<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
  launchTimeSec: number,
): { scene: MultiParticleScene<TField>; particle: ParticleInitialState | null } {
  const source = particleById(scene, id);
  if (!source) return { scene, particle: null };
  return addParticle(
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

export function removeParticle<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
): MultiParticleScene<TField> {
  if (scene.particles.length <= 1 || !scene.particles.some((particle) => particle.id === id)) return scene;
  const particles = scene.particles.filter((particle) => particle.id !== id);
  const runtimeById = { ...scene.runtimeById };
  delete runtimeById[id];
  const activeParticleId =
    scene.activeParticleId === id ? particles[0]?.id ?? '' : scene.activeParticleId;
  return { ...scene, particles, runtimeById, activeParticleId };
}

export function selectParticle<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
): MultiParticleScene<TField> {
  if (!scene.particles.some((particle) => particle.id === id) || scene.activeParticleId === id) return scene;
  return { ...scene, activeParticleId: id };
}

export function updateParticleInitial<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
  patch: Partial<ParticleSeed>,
): MultiParticleScene<TField> {
  const current = particleById(scene, id);
  if (!current) return scene;
  const nextSeed: ParticleSeed = {
    position: patch.position ?? current.position,
    velocity: patch.velocity ?? current.velocity,
    chargeC: patch.chargeC ?? current.chargeC,
    massKg: patch.massKg ?? current.massKg,
    visible: patch.visible ?? current.visible,
    showTrail: patch.showTrail ?? current.showTrail,
  };
  if (!isValidParticleSeed(nextSeed)) return scene;
  const nextParticle: ParticleInitialState = {
    ...current,
    ...nextSeed,
    position: { ...nextSeed.position },
    velocity: { ...nextSeed.velocity },
  };
  return {
    ...scene,
    particles: scene.particles.map((particle) => (particle.id === id ? nextParticle : particle)),
  };
}

export function updateParticleAndRelaunch<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
  patch: Partial<ParticleSeed>,
  nowGlobalTimeS: number,
): MultiParticleScene<TField> {
  return relaunchParticle(updateParticleInitial(scene, id, patch), id, nowGlobalTimeS);
}

export function relaunchParticle<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
  nowGlobalTimeS: number,
): MultiParticleScene<TField> {
  if (!scene.runtimeById[id]) return scene;
  const launch = Number.isFinite(nowGlobalTimeS) ? Math.max(0, nowGlobalTimeS) : 0;
  return {
    ...scene,
    runtimeById: { ...scene.runtimeById, [id]: { launchTimeSec: launch } },
  };
}

export function relaunchAll<TField>(scene: MultiParticleScene<TField>): MultiParticleScene<TField> {
  const runtimeById: Record<string, ParticleRuntime> = {};
  for (const particle of scene.particles) runtimeById[particle.id] = { launchTimeSec: 0 };
  return { ...scene, runtimeById, activeParticleId: scene.activeParticleId || scene.particles[0]?.id || '' };
}

export function applySharedField<TField>(
  scene: MultiParticleScene<TField>,
  field: TField,
): MultiParticleScene<TField> {
  return relaunchAll({ ...scene, field });
}

export function particleTau(runtime: ParticleRuntime | undefined, globalTimeS: number): number | null {
  if (!runtime || !Number.isFinite(globalTimeS)) return null;
  if (globalTimeS + 1e-12 < runtime.launchTimeSec) return null;
  return Math.max(0, globalTimeS - runtime.launchTimeSec);
}

export function createParticleDraft<TField>(
  scene: MultiParticleScene<TField>,
  id: string,
  nowGlobalTimeS: number,
): ParticleDraft | null {
  const particle = particleById(scene, id);
  if (!particle) return null;
  return {
    particleId: id,
    committedParticle: particle,
    draftParticle: { ...particle, position: { ...particle.position }, velocity: { ...particle.velocity } },
    startedAtGlobalTime: Number.isFinite(nowGlobalTimeS) ? Math.max(0, nowGlobalTimeS) : 0,
  };
}

export function updateDraft(
  draft: ParticleDraft,
  patch: Partial<Omit<ParticleInitialState, 'id' | 'label' | 'color' | 'lineStyle'>>,
): ParticleDraft {
  const next = {
    ...draft.draftParticle,
    ...patch,
    position: patch.position ? { ...patch.position } : draft.draftParticle.position,
    velocity: patch.velocity ? { ...patch.velocity } : draft.draftParticle.velocity,
    id: draft.draftParticle.id,
    label: draft.draftParticle.label,
    color: draft.draftParticle.color,
    lineStyle: draft.draftParticle.lineStyle,
  };
  if (!isValidParticleSeed(next)) return draft;
  return { ...draft, draftParticle: next };
}

export function commitDraft<TField>(
  scene: MultiParticleScene<TField>,
  draft: ParticleDraft,
  nowGlobalTimeS: number,
): MultiParticleScene<TField> {
  const updated = updateParticleInitial(scene, draft.particleId, {
    position: draft.draftParticle.position,
    velocity: draft.draftParticle.velocity,
    chargeC: draft.draftParticle.chargeC,
    massKg: draft.draftParticle.massKg,
    visible: draft.draftParticle.visible,
    showTrail: draft.draftParticle.showTrail,
  });
  return relaunchParticle(selectParticle(updated, draft.particleId), draft.particleId, nowGlobalTimeS);
}
