import {
  add3,
  cross3,
  dot3,
  isFiniteVec3,
  magnitude3,
  scale3,
  subtract3,
  ZERO_VEC3,
  type Vec3,
} from './lorentzForce';

export type { Vec3 } from './lorentzForce';

export type UniformB3DKind = 'stationary' | 'straight' | 'circle' | 'helix' | 'invalid';

export interface UniformB3DInput {
  position: Vec3;
  velocity: Vec3;
  /** Signed charge in coulombs. */
  chargeC: number;
  /** Positive mass in kilograms. */
  massKg: number;
  /** Static uniform magnetic field in tesla. */
  B: Vec3;
}

export interface UniformB3DModel {
  input: UniformB3DInput;
  valid: boolean;
  issue: string | null;
  kind: UniformB3DKind;
  bMagnitude: number;
  bHat: Vec3 | null;
  /** Signed angular rate about +B: -q|B|/m. */
  omegaSigned: number;
  speed0: number;
  vParallelSigned: number;
  vParallel: Vec3;
  vPerp: Vec3;
  vPerpMagnitude: number;
  radiusM: number | null;
  periodS: number | null;
  pitchSignedM: number | null;
  kineticEnergyJ: number;
  axis: Vec3 | null;
  initialForce: Vec3;
  initialAcceleration: Vec3;
}

export interface UniformB3DState {
  timeS: number;
  kind: UniformB3DKind;
  position: Vec3;
  velocity: Vec3;
  force: Vec3;
  acceleration: Vec3;
  speed: number;
  kineticEnergyJ: number;
  vParallelSigned: number;
  vParallel: Vec3;
  vPerp: Vec3;
  vPerpMagnitude: number;
  radiusM: number | null;
  periodS: number | null;
  pitchSignedM: number | null;
  omegaSigned: number;
}

const ZERO_CHARGE_EPS_C = 1e-30;
const ZERO_FIELD_EPS_T = 1e-15;
const ZERO_SPEED_EPS_MPS = 1e-12;
const ZERO_PARALLEL_EPS_MPS = 1e-10;
const SMALL_SERIES = 1e-4;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function safeVec(value: Vec3): Vec3 {
  return {
    x: Number.isFinite(value.x) ? nz(value.x) : 0,
    y: Number.isFinite(value.y) ? nz(value.y) : 0,
    z: Number.isFinite(value.z) ? nz(value.z) : 0,
  };
}

function velocityAt(input: UniformB3DInput, bHat: Vec3 | null, vPerp: Vec3, c: Vec3, theta: number): Vec3 {
  if (!bHat || vPerp.x === 0 && vPerp.y === 0 && vPerp.z === 0) return { ...input.velocity };
  const parallel = scale3(bHat, dot3(input.velocity, bHat));
  return add3(add3(parallel, scale3(vPerp, Math.cos(theta))), scale3(c, Math.sin(theta)));
}

function sinc(value: number): number {
  if (Math.abs(value) < SMALL_SERIES) {
    const square = value * value;
    return 1 - square / 6 + (square * square) / 120;
  }
  return Math.sin(value) / value;
}

function cosc(value: number): number {
  if (Math.abs(value) < SMALL_SERIES) {
    const square = value * value;
    return value / 2 - (value * square) / 24 + (value * square * square) / 720;
  }
  return (1 - Math.cos(value)) / value;
}

function forceOn(chargeC: number, velocity: Vec3, B: Vec3): Vec3 {
  const force = scale3(cross3(velocity, B), chargeC);
  return { x: nz(force.x), y: nz(force.y), z: nz(force.z) };
}

function classify(
  valid: boolean,
  chargeC: number,
  bHat: Vec3 | null,
  speed0: number,
  vPerpMagnitude: number,
): UniformB3DKind {
  if (!valid) return 'invalid';
  if (speed0 <= ZERO_SPEED_EPS_MPS) return 'stationary';
  if (!bHat || Math.abs(chargeC) <= ZERO_CHARGE_EPS_C) return 'straight';
  if (vPerpMagnitude <= ZERO_PARALLEL_EPS_MPS) return 'straight';
  return vPerpMagnitude >= speed0 - ZERO_PARALLEL_EPS_MPS ? 'circle' : 'helix';
}

export function uniformB3DModel(raw: UniformB3DInput): UniformB3DModel {
  const valid =
    Number.isFinite(raw.massKg) &&
    raw.massKg > 0 &&
    Number.isFinite(raw.chargeC) &&
    isFiniteVec3(raw.position) &&
    isFiniteVec3(raw.velocity) &&
    isFiniteVec3(raw.B);

  const input: UniformB3DInput = valid
    ? {
        position: { ...raw.position },
        velocity: { ...raw.velocity },
        chargeC: nz(raw.chargeC),
        massKg: raw.massKg,
        B: { ...raw.B },
      }
    : {
        position: safeVec(raw.position),
        velocity: safeVec(raw.velocity),
        chargeC: Number.isFinite(raw.chargeC) ? nz(raw.chargeC) : 0,
        massKg: Number.isFinite(raw.massKg) && raw.massKg > 0 ? raw.massKg : 1,
        B: safeVec(raw.B),
      };

  const bMagnitude = magnitude3(input.B);
  const bHat = bMagnitude > ZERO_FIELD_EPS_T ? scale3(input.B, 1 / bMagnitude) : null;
  const speed0 = magnitude3(input.velocity);
  const omegaSigned =
    valid && bMagnitude > ZERO_FIELD_EPS_T
      ? (-input.chargeC * bMagnitude) / input.massKg
      : 0;

  let vParallel = ZERO_VEC3;
  let vPerp = { ...input.velocity };
  let vPerpMagnitude = speed0;
  if (bHat) {
    const parallelSigned = dot3(input.velocity, bHat);
    vParallel = scale3(bHat, parallelSigned);
    vPerp = subtract3(input.velocity, vParallel);
    vPerpMagnitude = magnitude3(vPerp);
  }

  const kind = classify(valid, input.chargeC, bHat, speed0, vPerpMagnitude);
  const rotates =
    valid &&
    bHat !== null &&
    Math.abs(input.chargeC) > ZERO_CHARGE_EPS_C &&
    vPerpMagnitude > ZERO_PARALLEL_EPS_MPS;
  const periodS = rotates ? (2 * Math.PI * input.massKg) / (Math.abs(input.chargeC) * bMagnitude) : null;
  const radiusM = rotates
    ? (input.massKg * vPerpMagnitude) / (Math.abs(input.chargeC) * bMagnitude)
    : null;
  const pitchSignedM = rotates && kind === 'helix' ? dot3(input.velocity, bHat!) * periodS! : rotates ? 0 : null;
  const axis = rotates || kind === 'straight' ? bHat : null;

  const initialForce = forceOn(input.chargeC, input.velocity, input.B);
  const initialAcceleration = scale3(initialForce, 1 / input.massKg);

  let issue: string | null = null;
  if (!valid) issue = '输入包含无效数值或非正质量，已采用安全有限值。';
  else if (speed0 <= ZERO_SPEED_EPS_MPS) issue = '初速度为 0：粒子保持静止。';
  else if (!bHat) issue = '磁感应强度为 0：粒子做匀速直线运动。';
  else if (Math.abs(input.chargeC) <= ZERO_CHARGE_EPS_C) issue = '电荷量为 0：粒子不受洛伦兹力，做匀速直线运动。';
  else if (vPerpMagnitude <= ZERO_PARALLEL_EPS_MPS) issue = '速度与 B 平行：洛伦兹力为零，轨迹为直线。';

  return {
    input,
    valid,
    issue,
    kind,
    bMagnitude,
    bHat,
    omegaSigned,
    speed0,
    vParallelSigned: bHat ? dot3(input.velocity, bHat) : 0,
    vParallel,
    vPerp,
    vPerpMagnitude,
    radiusM,
    periodS,
    pitchSignedM,
    kineticEnergyJ: 0.5 * input.massKg * speed0 * speed0,
    axis,
    initialForce,
    initialAcceleration,
  };
}

export function uniformB3DStateAt(model: UniformB3DModel, timeS: number): UniformB3DState {
  const tau = Number.isFinite(timeS) ? timeS : 0;
  const { input, bHat, omegaSigned } = model;

  if (model.kind === 'invalid' || model.kind === 'stationary' || model.kind === 'straight') {
    const position = add3(input.position, scale3(input.velocity, tau));
    const velocity = { ...input.velocity };
    const force = forceOn(input.chargeC, velocity, input.B);
    const acceleration = scale3(force, 1 / input.massKg);
    const vParallelSigned = bHat ? dot3(velocity, bHat) : 0;
    const vParallel = bHat ? scale3(bHat, vParallelSigned) : ZERO_VEC3;
    return {
      timeS: tau,
      kind: model.kind,
      position,
      velocity,
      force,
      acceleration,
      speed: model.speed0,
      kineticEnergyJ: model.kineticEnergyJ,
      vParallelSigned,
      vParallel,
      vPerp: subtract3(velocity, vParallel),
      vPerpMagnitude: model.vPerpMagnitude,
      radiusM: model.radiusM,
      periodS: model.periodS,
      pitchSignedM: model.pitchSignedM,
      omegaSigned,
    };
  }

  const b = bHat!;
  const c = cross3(b, model.vPerp);
  const theta = omegaSigned * tau;
  const position = add3(
    add3(input.position, scale3(model.vParallel, tau)),
    add3(
      scale3(model.vPerp, tau * sinc(theta)),
      scale3(c, tau * cosc(theta)),
    ),
  );
  const velocity = velocityAt(input, b, model.vPerp, c, theta);
  const force = forceOn(input.chargeC, velocity, input.B);
  const acceleration = scale3(force, 1 / input.massKg);
  const vParallelSigned = dot3(velocity, b);
  const vParallel = scale3(b, vParallelSigned);
  const vPerp = subtract3(velocity, vParallel);

  return {
    timeS: tau,
    kind: model.kind,
    position: { x: nz(position.x), y: nz(position.y), z: nz(position.z) },
    velocity: { x: nz(velocity.x), y: nz(velocity.y), z: nz(velocity.z) },
    force,
    acceleration,
    speed: magnitude3(velocity),
    kineticEnergyJ: 0.5 * input.massKg * dot3(velocity, velocity),
    vParallelSigned,
    vParallel,
    vPerp,
    vPerpMagnitude: magnitude3(vPerp),
    radiusM: model.radiusM,
    periodS: model.periodS,
    pitchSignedM: model.pitchSignedM,
    omegaSigned,
  };
}

export function sampleUniformB3DPath(
  model: UniformB3DModel,
  fromTimeS: number,
  toTimeS: number,
  samples = 160,
): Vec3[] {
  const start = Number.isFinite(fromTimeS) ? fromTimeS : 0;
  const end = Number.isFinite(toTimeS) ? toTimeS : start;
  const count = Math.max(2, Math.min(2000, Math.floor(samples)));
  if (Math.abs(end - start) < 1e-15) return [uniformB3DStateAt(model, start).position];
  const points: Vec3[] = [];
  for (let index = 0; index <= count; index++) {
    const time = start + ((end - start) * index) / count;
    points.push(uniformB3DStateAt(model, time).position);
  }
  return points;
}

export function speed3(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function addVectors3(left: Vec3, right: Vec3): Vec3 {
  return add3(left, right);
}

export function scaleVector3(vector: Vec3, factor: number): Vec3 {
  return scale3(vector, factor);
}

export function dotVectors3(left: Vec3, right: Vec3): number {
  return dot3(left, right);
}

export function crossVectors3(left: Vec3, right: Vec3): Vec3 {
  return cross3(left, right);
}
