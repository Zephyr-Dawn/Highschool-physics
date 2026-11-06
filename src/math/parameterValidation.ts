/**
 * Physical and numerical domain checks for parameter values.
 *
 * Slider min/max is a *quick input range* only. Text expressions are allowed
 * to exceed it. These domains describe what the existing solvers can treat as
 * a meaningful, finite physical input.
 */

export type ParameterBoundKind = 'physical' | 'stability';

export interface ParameterDomain {
  min?: number;
  max?: number;
  minOpen?: boolean;
  maxOpen?: boolean;
  integer?: boolean;
  boundKind?: ParameterBoundKind;
  /** Extra solver-stability lower bound, reported separately from physics. */
  stableMin?: number;
  /** Extra solver-stability upper bound, reported separately from physics. */
  stableMax?: number;
}

export type ParameterIssueReason = 'not-finite' | 'out-of-domain' | 'not-integer' | 'unstable';

export interface ParameterIssue {
  ok: false;
  reason: ParameterIssueReason;
  message: string;
}

export interface ParameterValid {
  ok: true;
  value: number;
}

export type ParameterValidation = ParameterValid | ParameterIssue;

/** Absolute values beyond this are rejected before any solver sees them. */
export const GLOBAL_STABILITY_LIMIT = 1e12;

const magneticField: ParameterDomain = { min: -100, max: 100, boundKind: 'stability' };
const nonNegativeMagneticField: ParameterDomain = { min: 0, max: 100, boundKind: 'physical' };
const electricField: ParameterDomain = { min: -1e6, max: 1e6, boundKind: 'stability' };
const signedLength: ParameterDomain = { min: -1e6, max: 1e6, boundKind: 'stability' };
const positiveLength: ParameterDomain = { min: 0, max: 1e4, minOpen: true, boundKind: 'physical' };
const compactLength: ParameterDomain = {
  min: 0,
  max: 10,
  minOpen: true,
  boundKind: 'physical',
  stableMin: 0.001,
  stableMax: 10,
};
const positiveMass: ParameterDomain = {
  min: 0,
  minOpen: true,
  max: 1e6,
  boundKind: 'physical',
  stableMin: 1e-12,
  stableMax: 1e6,
};
const nonNegativeCharge: ParameterDomain = { min: 0, max: 1e6, boundKind: 'physical' };
const signedCharge: ParameterDomain = { min: -1e6, max: 1e6, boundKind: 'physical' };
const speed: ParameterDomain = { min: 0, max: 1e7, boundKind: 'stability' };
const signedSpeed: ParameterDomain = { min: -1e7, max: 1e7, boundKind: 'stability' };
const angleDeg: ParameterDomain = { min: -1e7, max: 1e7, boundKind: 'stability' };
const angularVelocity: ParameterDomain = { min: -1e7, max: 1e7, boundKind: 'stability' };
const time: ParameterDomain = { min: 0, max: 1e6, minOpen: true, boundKind: 'physical' };
const signedTimeRate: ParameterDomain = { min: -1e6, max: 1e6, boundKind: 'stability' };
const frequency: ParameterDomain = { min: 0, max: 1e6, minOpen: true, boundKind: 'physical' };
const resistance: ParameterDomain = {
  min: 0,
  minOpen: true,
  boundKind: 'physical',
  stableMin: 1e-9,
  stableMax: 1e9,
};
const turns: ParameterDomain = { min: 1, max: 1000, integer: true, boundKind: 'physical' };
const dimensionlessNonNegative: ParameterDomain = { min: 0, max: 1e9, boundKind: 'physical' };
const signedDimensionless: ParameterDomain = { min: -1e9, max: 1e9, boundKind: 'stability' };
const signedForce: ParameterDomain = { min: -1e9, max: 1e9, boundKind: 'stability' };

export const PARAMETER_DOMAINS = {
  magneticField,
  nonNegativeMagneticField,
  electricField,
  positiveLength,
  compactLength,
  signedLength,
  positiveMass,
  nonNegativeCharge,
  signedCharge,
  speed,
  signedSpeed,
  angleDeg,
  angularVelocity,
  time,
  signedTimeRate,
  frequency,
  resistance,
  turns,
  dimensionlessNonNegative,
  signedDimensionless,
  signedForce,
  /** I04 waveform sanitizer clamps B0 to ±10 T. Reject instead of hiding it. */
  i04Field: { min: -10, max: 10, boundKind: 'stability' } satisfies ParameterDomain,
  /** The shared manual-field timeline clamps its start/target to ±10 T. */
  manualField: { min: -10, max: 10, boundKind: 'stability' } satisfies ParameterDomain,
  i04Slope: { min: -20, max: 20, boundKind: 'stability' } satisfies ParameterDomain,
  i04Amplitude: { min: 0, max: 10, boundKind: 'stability' } satisfies ParameterDomain,
  i04Frequency: { min: 0.01, max: 20, boundKind: 'stability' } satisfies ParameterDomain,
  i04Duration: { min: 0.2, max: 60, boundKind: 'stability' } satisfies ParameterDomain,
  i04EdgeTime: { min: 0.05, max: 1e6, boundKind: 'physical' } satisfies ParameterDomain,
  i04HoldTime: { min: 0, max: 1e6, boundKind: 'physical' } satisfies ParameterDomain,
  i01Width: compactLength,
  i01AutoDuration: { min: 0.001, max: 1e6, boundKind: 'stability' } satisfies ParameterDomain,
  i01AutoSpeed: { min: -1e6, max: 1e6, boundKind: 'stability' } satisfies ParameterDomain,
  i02StartX: {
    min: 0,
    max: 1e6,
    minOpen: true,
    boundKind: 'physical',
    stableMin: 1e-12,
  } satisfies ParameterDomain,
  i03LoopLength: compactLength,
  i03FieldWidth: { min: 0.01, max: 1e4, boundKind: 'stability' } satisfies ParameterDomain,
  i03Mass: { min: 1e-9, max: 1e4, minOpen: true, boundKind: 'stability' } satisfies ParameterDomain,
  i03Speed: speed,
  i06FieldWidth: { min: 1e-6, max: 1e4, minOpen: true, boundKind: 'stability' } satisfies ParameterDomain,
  slitHalfWidth: {
    min: 0,
    max: 1e3,
    minOpen: true,
    boundKind: 'physical',
    stableMin: 1e-9,
  } satisfies ParameterDomain,
  regionLength: {
    min: 0,
    max: 1e4,
    minOpen: true,
    boundKind: 'physical',
    stableMin: 1e-6,
  } satisfies ParameterDomain,
} as const;

const POSITIVE_LABEL = /(宽度|长度|高度|间距|半宽|边长|导轨间距|区域长度|线框水平边长|线框竖直边长|磁场宽度|线圈宽度|线圈高度)/;

export function resolveParameterDomain(label: string, unit: string): ParameterDomain {
  if (unit === 'turn' || unit === '匝' || label.includes('匝数')) return turns;
  if (unit === 'T') return label.includes('|B|') ? nonNegativeMagneticField : magneticField;
  if (unit === 'V/m') return electricField;
  if (unit === 'T/s') return signedTimeRate;
  if (unit === 'N') return signedForce;
  if (unit === 'Hz') return frequency;
  if (unit === 'Ω') return resistance;
  if (unit === 'rad/s') return angularVelocity;
  if (unit === '°') return angleDeg;
  if (unit === 's') return time;
  if (unit === 'kg' || unit.includes('kg')) return positiveMass;
  if (unit === 'm/s') return label.includes('大小') ? speed : signedSpeed;
  if (unit === '×10⁶ m/s') return speed;
  if (unit === '×10⁻²⁶ kg') return positiveMass;
  if (unit === 'e' || unit === 'C') {
    return label.includes('|q|') ? nonNegativeCharge : signedCharge;
  }
  if (unit === 'm') {
    if (label.includes('屏幕 y')) return signedLength;
    return POSITIVE_LABEL.test(label) ? positiveLength : signedLength;
  }
  if (unit === 'cm') {
    return POSITIVE_LABEL.test(label)
      ? { ...positiveLength, min: 0, max: 1e8 }
      : { ...signedLength, min: -1e8, max: 1e8 };
  }
  if (unit === '%') return dimensionlessNonNegative;
  return signedDimensionless;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
    return value.toExponential(4).replace(/\.?0+e/, 'e');
  }
  return Number(value.toPrecision(8)).toString();
}

export function formatDomainRange(domain: ParameterDomain): string {
  if (domain.min === undefined && domain.max === undefined) return '任意有限实数';
  if (domain.min === undefined) return `≤ ${formatNumber(domain.max as number)}`;
  if (domain.max === undefined) return `${domain.minOpen ? '>' : '≥'} ${formatNumber(domain.min)}`;
  return `${formatNumber(domain.min)} – ${formatNumber(domain.max)}`;
}

export function validateParameterValue(
  value: number,
  domain: ParameterDomain,
  label: string,
  unit?: string,
): ParameterValidation {
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      reason: 'not-finite',
      message: `${label}不是有限实数，无法参与物理计算。`,
    };
  }
  if (Math.abs(value) > GLOBAL_STABILITY_LIMIT) {
    return {
      ok: false,
      reason: 'unstable',
      message: `${label}的绝对值超过 ${formatNumber(GLOBAL_STABILITY_LIMIT)}，超出稳定计算能力。`,
    };
  }
  if (domain.integer && !Number.isInteger(value)) {
    return {
      ok: false,
      reason: 'not-integer',
      message: `${label}必须是整数；${formatNumber(value)} 不会被四舍五入。`,
    };
  }
  const unitText = unit ? ` ${unit}` : '';
  const range = `${formatDomainRange(domain)}${unitText}`;
  const belowMin = domain.min !== undefined
    && (domain.minOpen ? value <= domain.min : value < domain.min);
  const aboveMax = domain.max !== undefined
    && (domain.maxOpen ? value >= domain.max : value > domain.max);
  if (belowMin || aboveMax) {
    const isStability = domain.boundKind === 'stability';
    return {
      ok: false,
      reason: isStability ? 'unstable' : 'out-of-domain',
      message: isStability
        ? `${label}超出该模型的稳定计算范围（${range}）。`
        : `${label}不符合物理有效域（${range}）。`,
    };
  }
  if (domain.stableMin !== undefined && value < domain.stableMin) {
    return {
      ok: false,
      reason: 'unstable',
      message: `${label}过小，低于该模型的稳定计算下限 ${formatNumber(domain.stableMin)}${unitText}。`,
    };
  }
  if (domain.stableMax !== undefined && value > domain.stableMax) {
    return {
      ok: false,
      reason: 'unstable',
      message: `${label}过大，超过该模型的稳定计算上限 ${formatNumber(domain.stableMax)}${unitText}。`,
    };
  }
  return { ok: true, value };
}

export function isParameterDomain(value: unknown): value is ParameterDomain {
  if (!value || typeof value !== 'object') return false;
  const domain = value as ParameterDomain;
  return (domain.min === undefined || Number.isFinite(domain.min))
    && (domain.max === undefined || Number.isFinite(domain.max));
}
