export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type ZeroForceReason =
  | 'none'
  | 'invalid'
  | 'zero-charge'
  | 'zero-field'
  | 'zero-velocity'
  | 'parallel'
  | 'anti-parallel';

export interface LorentzForceInput {
  chargeC: number;
  massKg: number;
  velocity: Vec3;
  B: Vec3;
}

export interface LorentzForceSnapshot {
  chargeC: number;
  massKg: number;
  velocity: Vec3;
  B: Vec3;
  vCrossB: Vec3;
  force: Vec3;
  acceleration: Vec3;
  magnitude: number;
  thetaRad: number;
  thetaDeg: number;
  sinTheta: number;
  zeroForceReason: ZeroForceReason;
  forceDirection: Vec3 | null;
  equivalentCurrentDirection: Vec3 | null;
  forceDotVelocity: number;
  forceDotField: number;
  magneticPowerW: number;
  diagnostics: string[];
}

const ZERO_CHARGE_EPS = 1e-12;
const ZERO_VECTOR_EPS = 1e-12;
const SIN_PARALLEL_EPS = 1e-9;

export const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };

export function add3(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function subtract3(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function scale3(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

export function dot3(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function cross3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function magnitude3(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function normalize3(vector: Vec3): Vec3 | null {
  const magnitude = magnitude3(vector);
  if (!Number.isFinite(magnitude) || magnitude <= ZERO_VECTOR_EPS) return null;
  return scale3(vector, 1 / magnitude);
}

export function isFiniteVec3(vector: Vec3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function clean3(vector: Vec3): Vec3 {
  return { x: nz(vector.x), y: nz(vector.y), z: nz(vector.z) };
}

export function lorentzForceSnapshot(input: LorentzForceInput): LorentzForceSnapshot {
  const invalid =
    !Number.isFinite(input.chargeC) ||
    !Number.isFinite(input.massKg) ||
    input.massKg <= 0 ||
    !isFiniteVec3(input.velocity) ||
    !isFiniteVec3(input.B);

  const chargeC = Number.isFinite(input.chargeC) ? input.chargeC : 0;
  const massKg = Number.isFinite(input.massKg) && input.massKg > 0 ? input.massKg : 1;
  const velocity = isFiniteVec3(input.velocity) ? clean3(input.velocity) : ZERO_VEC3;
  const B = isFiniteVec3(input.B) ? clean3(input.B) : ZERO_VEC3;

  const speed = magnitude3(velocity);
  const fieldMagnitude = magnitude3(B);
  const vCrossB = clean3(cross3(velocity, B));
  const rawForce = clean3(scale3(vCrossB, chargeC));
  const crossMagnitude = magnitude3(vCrossB);
  const sinTheta =
    speed > ZERO_VECTOR_EPS && fieldMagnitude > ZERO_VECTOR_EPS
      ? Math.min(1, Math.max(0, crossMagnitude / (speed * fieldMagnitude)))
      : 0;
  const dotVB = dot3(velocity, B);
  const cosTheta =
    speed > ZERO_VECTOR_EPS && fieldMagnitude > ZERO_VECTOR_EPS
      ? Math.max(-1, Math.min(1, dotVB / (speed * fieldMagnitude)))
      : 1;
  const thetaRad = Math.acos(cosTheta);

  let zeroForceReason: ZeroForceReason = 'none';
  const diagnostics: string[] = [];
  if (invalid) {
    zeroForceReason = 'invalid';
    diagnostics.push('输入包含非有限数值或非正质量，已采用安全的零向量/默认质量。');
  } else if (Math.abs(chargeC) <= ZERO_CHARGE_EPS) {
    zeroForceReason = 'zero-charge';
    diagnostics.push('q=0：无论 v、B 为何，洛伦兹力都为零。');
  } else if (fieldMagnitude <= ZERO_VECTOR_EPS) {
    zeroForceReason = 'zero-field';
    diagnostics.push('B=0：没有磁场，洛伦兹力为零。');
  } else if (speed <= ZERO_VECTOR_EPS) {
    zeroForceReason = 'zero-velocity';
    diagnostics.push('v=0：静止电荷不受洛伦兹力。');
  } else if (sinTheta <= SIN_PARALLEL_EPS) {
    if (dotVB >= 0) {
      zeroForceReason = 'parallel';
      diagnostics.push('v ∥ B：sinθ=0，洛伦兹力为零。');
    } else {
      zeroForceReason = 'anti-parallel';
      diagnostics.push('v 与 B 反平行：sinθ=0，洛伦兹力为零。');
    }
  } else {
    diagnostics.push('F_B=q(v×B)，且 F_B·v=0、F_B·B=0；磁力瞬时功率为零。');
  }

  const force = zeroForceReason === 'none' ? rawForce : ZERO_VEC3;
  const magnitude = magnitude3(force);
  const acceleration = clean3(scale3(force, 1 / massKg));
  const forceDotVelocity = dot3(force, velocity);
  const forceDotField = dot3(force, B);

  return {
    chargeC,
    massKg,
    velocity,
    B,
    vCrossB,
    force,
    acceleration,
    magnitude: nz(magnitude),
    thetaRad,
    thetaDeg: (thetaRad * 180) / Math.PI,
    sinTheta,
    zeroForceReason,
    forceDirection: magnitude > ZERO_VECTOR_EPS ? normalize3(force) : null,
    equivalentCurrentDirection:
      Math.abs(chargeC) > ZERO_CHARGE_EPS && speed > ZERO_VECTOR_EPS
        ? normalize3(chargeC > 0 ? velocity : scale3(velocity, -1))
        : null,
    forceDotVelocity: nz(forceDotVelocity),
    forceDotField: nz(forceDotField),
    magneticPowerW: nz(forceDotVelocity),
    diagnostics,
  };
}

export function forceDirectionText(snapshot: LorentzForceSnapshot): string {
  if (!snapshot.forceDirection) return '零力（无方向）';
  const components = [
    { axis: '+x', value: snapshot.force.x },
    { axis: '−x', value: -snapshot.force.x },
    { axis: '+y', value: snapshot.force.y },
    { axis: '−y', value: -snapshot.force.y },
    { axis: '+z', value: snapshot.force.z },
    { axis: '−z', value: -snapshot.force.z },
  ].sort((left, right) => right.value - left.value);
  const dominant = components[0];
  const others = Math.max(components[2]?.value ?? 0, components[3]?.value ?? 0);
  if (dominant.value > 1e-12 && others < dominant.value * 0.12) return dominant.axis;
  return `斜向 (${signed(snapshot.force.x)}, ${signed(snapshot.force.y)}, ${signed(snapshot.force.z)})`;
}

function signed(value: number): string {
  if (Math.abs(value) < 5e-4) return '0';
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}
