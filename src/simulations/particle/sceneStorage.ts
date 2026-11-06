import {
  MAX_PARTICLES,
  PARTICLE_LABELS,
  PARTICLE_LINE_STYLES,
  type ParticleInitialState,
  type ParticleLineStyle,
} from '../../physics/particles/multiParticle';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function vector(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y)) return null;
  return { x: value.x, y: value.y };
}

function lineStyle(value: unknown): ParticleLineStyle {
  return PARTICLE_LINE_STYLES.includes(value as ParticleLineStyle)
    ? (value as ParticleLineStyle)
    : 'solid';
}

export function parseParticleList(value: unknown): { particles: ParticleInitialState[] | null; error: string | null } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PARTICLES) {
    return { particles: null, error: `粒子数量必须为 1–${MAX_PARTICLES}。` };
  }
  const usedIds = new Set<string>();
  const usedLabels = new Set<string>();
  const particles: ParticleInitialState[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return { particles: null, error: '粒子配置不是对象。' };
    const position = vector(raw.position);
    const velocity = vector(raw.velocity);
    if (
      typeof raw.id !== 'string' ||
      raw.id.length === 0 ||
      raw.id.length > 80 ||
      usedIds.has(raw.id)
    ) {
      return { particles: null, error: '粒子 ID 为空、过长或重复。' };
    }
    if (
      typeof raw.label !== 'string' ||
      !PARTICLE_LABELS.includes(raw.label as (typeof PARTICLE_LABELS)[number]) ||
      usedLabels.has(raw.label)
    ) {
      return { particles: null, error: '粒子标签必须是唯一的 A–E。' };
    }
    if (!position || !velocity) return { particles: null, error: '粒子位置或速度包含无效数值。' };
    if (!finiteNumber(raw.chargeC)) return { particles: null, error: '粒子电荷量无效。' };
    if (!finiteNumber(raw.massKg) || raw.massKg <= 0) {
      return { particles: null, error: '粒子质量必须为正数。' };
    }
    usedIds.add(raw.id);
    usedLabels.add(raw.label);
    particles.push({
      id: raw.id,
      label: raw.label,
      color: typeof raw.color === 'string' && raw.color.length > 0 ? raw.color : '#1d4ed8',
      lineStyle: lineStyle(raw.lineStyle),
      position,
      velocity,
      chargeC: raw.chargeC,
      massKg: raw.massKg,
      visible: raw.visible !== false,
      showTrail: raw.showTrail !== false,
    });
  }
  return { particles, error: null };
}

export function readLocalValue(key: string): unknown | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
