import { add, length, rotate, scale, type Vec2 } from '../core/vec2';

/** Teaching-scale constants. See docs/PHYSICS_SPEC.md. */
export const MASS_UNIT_KG = 1e-26;
export const CHARGE_UNIT_C = 1.602176634e-19;
export const SPEED_UNIT_MPS = 1e6;

export interface UniformBInput {
  massKg: number;
  /** Signed charge in coulombs. */
  chargeC: number;
  /** Signed field along +z (out of page when positive), in tesla. */
  BzTesla: number;
  initialPosition: Vec2;
  /** Initial velocity in m/s, in the physical x-right / y-up frame. */
  initialVelocity: Vec2;
}

export type TurnDirection = 'clockwise' | 'counterclockwise' | 'none';

export interface UniformBModel {
  input: UniformBInput;
  omega: number;
  speed0: number;
  circular: boolean;
  direction: TurnDirection;
  radiusM: number;
  periodS: number;
  frequencyHz: number;
  center: Vec2 | null;
  issue: string | null;
}

export interface ParticleState {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  force: Vec2;
  acceleration: Vec2;
  speed: number;
  center: Vec2 | null;
  radiusM: number;
  periodS: number;
  angularVelocity: number;
  direction: TurnDirection;
  circular: boolean;
}

const ZERO_CHARGE_EPS_C = 1e-30;
const ZERO_FIELD_EPS_T = 1e-15;
const ZERO_SPEED_EPS_MPS = 1e-12;
const MIN_ANGULAR_SPEED = 1e-9;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function createUniformBModel(input: UniformBInput): UniformBModel {
  const finite =
    Number.isFinite(input.massKg) &&
    Number.isFinite(input.chargeC) &&
    Number.isFinite(input.BzTesla) &&
    Number.isFinite(input.initialPosition.x) &&
    Number.isFinite(input.initialPosition.y) &&
    Number.isFinite(input.initialVelocity.x) &&
    Number.isFinite(input.initialVelocity.y);

  const safeInput: UniformBInput = {
    massKg: finite ? input.massKg : 0,
    chargeC: finite ? input.chargeC : 0,
    BzTesla: finite ? input.BzTesla : 0,
    initialPosition: finite ? input.initialPosition : { x: 0, y: 0 },
    initialVelocity: finite ? input.initialVelocity : { x: 0, y: 0 },
  };

  const speed0 = length(safeInput.initialVelocity);
  const massValid = Number.isFinite(safeInput.massKg) && safeInput.massKg > 0;
  const omega = massValid ? (safeInput.chargeC * safeInput.BzTesla) / safeInput.massKg : 0;
  const circular =
    massValid && Math.abs(omega) >= MIN_ANGULAR_SPEED && speed0 > ZERO_SPEED_EPS_MPS;
  const radiusM = circular ? speed0 / Math.abs(omega) : Infinity;
  const periodS = circular ? (2 * Math.PI) / Math.abs(omega) : Infinity;
  const direction: TurnDirection = circular ? (omega > 0 ? 'clockwise' : 'counterclockwise') : 'none';
  const center = circular ? circleCenter(safeInput.initialPosition, safeInput.initialVelocity, omega) : null;

  let issue: string | null = null;
  if (!finite) issue = '输入包含无效数值，已采用安全默认值。';
  else if (!massValid) issue = '质量必须为正数。';
  else if (Math.abs(safeInput.chargeC) <= ZERO_CHARGE_EPS_C)
    issue = '电荷量为 0：粒子不受洛伦兹力，做匀速直线运动。';
  else if (Math.abs(safeInput.BzTesla) <= ZERO_FIELD_EPS_T)
    issue = '磁感应强度为 0：粒子不受洛伦兹力，做匀速直线运动。';
  else if (speed0 <= ZERO_SPEED_EPS_MPS) issue = '初速度为 0：粒子保持静止，尚未形成圆周轨迹。';

  return {
    input: safeInput,
    omega,
    speed0,
    circular,
    direction,
    radiusM,
    periodS,
    frequencyHz: Number.isFinite(periodS) && periodS > 0 ? 1 / periodS : 0,
    center,
    issue,
  };
}

function circleCenter(position: Vec2, velocity: Vec2, omega: number): Vec2 {
  // c = p + (v_y / ω, −v_x / ω); the acceleration points from p to c.
  return add(position, { x: velocity.y / omega, y: -velocity.x / omega });
}

/**
 * Analytic solution of m dv/dt = q v × B for B = (0, 0, Bz).
 * The velocity rotates by −ωt with ω = qBz/m; no numerical drift is introduced.
 */
export function particleStateAt(model: UniformBModel, timeS: number): ParticleState {
  const t = Number.isFinite(timeS) ? timeS : 0;
  const { initialPosition: p0, initialVelocity: v0, massKg, chargeC, BzTesla } = model.input;
  const { omega } = model;

  let position: Vec2;
  let velocity: Vec2;

  if (!model.circular) {
    position = add(p0, scale(v0, t));
    velocity = v0;
  } else {
    const wt = omega * t;
    const sin = Math.sin(wt);
    const cos = Math.cos(wt);
    velocity = rotate(v0, -wt);
    position = add(p0, {
      x: (v0.x * sin + v0.y * (1 - cos)) / omega,
      y: (-v0.x * (1 - cos) + v0.y * sin) / omega,
    });
  }

  const force = {
    x: nz(chargeC * velocity.y * BzTesla),
    y: nz(-chargeC * velocity.x * BzTesla),
  };
  const accelScale = Number.isFinite(massKg) && massKg > 0 ? 1 / massKg : 0;
  const acceleration = scale(force, accelScale);

  return {
    timeS: t,
    position,
    velocity,
    force,
    acceleration,
    speed: length(velocity),
    center: model.center,
    radiusM: model.radiusM,
    periodS: model.periodS,
    angularVelocity: omega,
    direction: model.direction,
    circular: model.circular,
  };
}

/** Samples [0, timeS] for drawing the analytic trail. */
export function sampleTrajectory(model: UniformBModel, timeS: number, samples = 160): Vec2[] {
  const t = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
  if (!model.circular) {
    return [model.input.initialPosition, particleStateAt(model, t).position];
  }
  const count = Math.max(2, Math.floor(samples));
  const points: Vec2[] = [];
  for (let i = 0; i <= count; i++) {
    points.push(particleStateAt(model, (t * i) / count).position);
  }
  return points;
}

export function speedFromTeachingUnits(speedUnits: number): number {
  return speedUnits * SPEED_UNIT_MPS;
}

export function massFromTeachingUnits(massUnits: number): number {
  return massUnits * MASS_UNIT_KG;
}

export function chargeFromTeachingUnits(chargeUnits: number): number {
  return chargeUnits * CHARGE_UNIT_C;
}

export function buildUniformBInput(params: {
  massUnits: number;
  chargeUnits: number;
  BzTesla: number;
  speedUnits: number;
  directionDeg: number;
  start: Vec2;
}): UniformBInput {
  const speed = speedFromTeachingUnits(params.speedUnits);
  const angle = (params.directionDeg * Math.PI) / 180;
  return {
    massKg: massFromTeachingUnits(params.massUnits),
    chargeC: chargeFromTeachingUnits(params.chargeUnits),
    BzTesla: params.BzTesla,
    initialPosition: params.start,
    initialVelocity: { x: speed * Math.cos(angle), y: speed * Math.sin(angle) },
  };
}
