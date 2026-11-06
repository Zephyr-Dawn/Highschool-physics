import { length, type Vec2 } from '../core/vec2';

/** P06 mode A: static uniform E in the xy plane and B along +z. */
export interface CrossedFieldInput {
  massKg: number;
  chargeC: number;
  Ex: number;
  Ey: number;
  Bz: number;
  initialPosition: Vec2;
  initialVelocity: Vec2;
}

export interface CrossedFieldModel {
  input: CrossedFieldInput;
  omega: number;
  driftVelocity: Vec2 | null;
  selectorMatched: boolean;
  issue: string | null;
}

export interface CrossedFieldState {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  forceE: Vec2;
  forceB: Vec2;
  force: Vec2;
  acceleration: Vec2;
  speed: number;
  kineticEnergyJ: number;
  electricWorkJ: number;
  workJ: number;
  energyResidualJ: number;
  netForceMagnitude: number;
  electricPowerW: number;
  magneticPowerW: number;
  omega: number;
  driftVelocity: Vec2 | null;
  selectorMatched: boolean;
}

const ZERO_FIELD_EPS = 1e-12;
const SMALL_ANGLE = 1e-3;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function finiteVec(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function finiteInput(input: CrossedFieldInput): boolean {
  return (
    Number.isFinite(input.massKg) &&
    Number.isFinite(input.chargeC) &&
    Number.isFinite(input.Ex) &&
    Number.isFinite(input.Ey) &&
    Number.isFinite(input.Bz) &&
    finiteVec(input.initialPosition) &&
    finiteVec(input.initialVelocity)
  );
}

function safeInput(input: CrossedFieldInput): CrossedFieldInput {
  return {
    massKg: Number.isFinite(input.massKg) && input.massKg > 0 ? input.massKg : 1,
    chargeC: Number.isFinite(input.chargeC) ? input.chargeC : 0,
    Ex: Number.isFinite(input.Ex) ? input.Ex : 0,
    Ey: Number.isFinite(input.Ey) ? input.Ey : 0,
    Bz: Number.isFinite(input.Bz) ? input.Bz : 0,
    initialPosition: finiteVec(input.initialPosition) ? { ...input.initialPosition } : { x: 0, y: 0 },
    initialVelocity: finiteVec(input.initialVelocity) ? { ...input.initialVelocity } : { x: 0, y: 0 },
  };
}

export function crossedDriftVelocity(model: CrossedFieldModel): Vec2 | null {
  if (Math.abs(model.input.Bz) <= ZERO_FIELD_EPS) return null;
  return {
    x: model.input.Ey / model.input.Bz,
    y: -model.input.Ex / model.input.Bz,
  };
}

export function createCrossedFieldModel(input: CrossedFieldInput): CrossedFieldModel {
  const safe = safeInput(input);
  const validMass = Number.isFinite(input.massKg) && input.massKg > 0;
  const omega = -(safe.chargeC * safe.Bz) / safe.massKg;
  const drift = Math.abs(safe.Bz) <= ZERO_FIELD_EPS
    ? null
    : { x: safe.Ey / safe.Bz, y: -safe.Ex / safe.Bz };
  const selectorMatched = Boolean(
    validMass &&
      Math.abs(safe.chargeC) > 1e-30 &&
      drift &&
      length({
        x: safe.initialVelocity.x - drift.x,
        y: safe.initialVelocity.y - drift.y,
      }) <= 1e-9 * Math.max(1, length(safe.initialVelocity), length(drift)),
  );
  let issue: string | null = null;
  if (!finiteInput(input)) issue = '输入包含非有限数值，已采用安全默认值。';
  else if (!validMass) issue = '质量必须为正数。';
  else if (Math.abs(safe.chargeC) <= 1e-30) issue = 'q = 0：中性粒子不受电场力或磁场力。';
  else if (Math.abs(safe.Bz) <= ZERO_FIELD_EPS && Math.abs(safe.Ex) <= ZERO_FIELD_EPS && Math.abs(safe.Ey) <= ZERO_FIELD_EPS) {
    issue = 'E = 0 且 B = 0：粒子做匀速直线运动。';
  }
  return {
    input: safe,
    omega,
    driftVelocity: drift,
    selectorMatched,
    issue,
  };
}

function forceElectric(input: CrossedFieldInput): Vec2 {
  return { x: input.chargeC * input.Ex, y: input.chargeC * input.Ey };
}

function forceMagnetic(input: CrossedFieldInput, velocity: Vec2): Vec2 {
  return {
    x: input.chargeC * velocity.y * input.Bz,
    y: -input.chargeC * velocity.x * input.Bz,
  };
}

function jOf(w: Vec2): Vec2 {
  return { x: -w.y, y: w.x };
}

function integrateState(
  input: CrossedFieldInput,
  omega: number,
  timeS: number,
): { position: Vec2; velocity: Vec2 } {
  const t = Math.max(0, timeS);
  const v0 = input.initialVelocity;
  const a = {
    x: (input.chargeC * input.Ex) / input.massKg,
    y: (input.chargeC * input.Ey) / input.massKg,
  };
  if (Math.abs(omega * t) < SMALL_ANGLE) {
    // Stable expansion around B=0. Terms through O(omega^2) are enough for |omega t| < 1e-3.
    const jv0 = jOf(v0);
    const ja = jOf(a);
    const velocity = {
      x: v0.x + a.x * t + omega * (jv0.x * t + ja.x * t * t / 2) - omega * omega * (v0.x * t ** 3 / 6 + a.x * t ** 4 / 24),
      y: v0.y + a.y * t + omega * (jv0.y * t + ja.y * t * t / 2) - omega * omega * (v0.y * t ** 3 / 6 + a.y * t ** 4 / 24),
    };
    const position = {
      x: input.initialPosition.x + v0.x * t + a.x * t * t / 2
        + omega * (jv0.x * t * t / 2 + ja.x * t ** 3 / 6)
        - omega * omega * (v0.x * t ** 4 / 24 + a.x * t ** 5 / 120),
      y: input.initialPosition.y + v0.y * t + a.y * t * t / 2
        + omega * (jv0.y * t * t / 2 + ja.y * t ** 3 / 6)
        - omega * omega * (v0.y * t ** 4 / 24 + a.y * t ** 5 / 120),
    };
    return { position, velocity };
  }

  const drift = {
    x: input.Ey / input.Bz,
    y: -input.Ex / input.Bz,
  };
  const w = { x: v0.x - drift.x, y: v0.y - drift.y };
  const angle = omega * t;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const jw = jOf(w);
  const velocity = {
    x: drift.x + w.x * cos - w.y * sin,
    y: drift.y + w.x * sin + w.y * cos,
  };
  const position = {
    x: input.initialPosition.x + drift.x * t + (sin / omega) * w.x + ((1 - cos) / omega) * jw.x,
    y: input.initialPosition.y + drift.y * t + (sin / omega) * w.y + ((1 - cos) / omega) * jw.y,
  };
  return { position, velocity };
}

export function crossedStateAt(model: CrossedFieldModel, timeS: number): CrossedFieldState {
  const t = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
  const input = model.input;
  const { position, velocity } = integrateState(input, model.omega, t);
  const forceE = forceElectric(input);
  const forceB = forceMagnetic(input, velocity);
  const force = { x: nz(forceE.x + forceB.x), y: nz(forceE.y + forceB.y) };
  const acceleration = {
    x: force.x / input.massKg,
    y: force.y / input.massKg,
  };
  const speed = length(velocity);
  const kineticEnergyJ = 0.5 * input.massKg * speed * speed;
  const electricWorkJ = input.chargeC * (
    input.Ex * (position.x - input.initialPosition.x) +
    input.Ey * (position.y - input.initialPosition.y)
  );
  return {
    timeS: t,
    position,
    velocity,
    forceE,
    forceB,
    force,
    acceleration,
    speed,
    kineticEnergyJ,
    electricWorkJ,
    workJ: electricWorkJ,
    energyResidualJ: kineticEnergyJ - 0.5 * input.massKg * length(input.initialVelocity) ** 2 - electricWorkJ,
    netForceMagnitude: length(force),
    electricPowerW: forceE.x * velocity.x + forceE.y * velocity.y,
    magneticPowerW: forceB.x * velocity.x + forceB.y * velocity.y,
    omega: model.omega,
    driftVelocity: model.driftVelocity,
    selectorMatched: model.selectorMatched,
  };
}

export function sampleCrossedTrajectory(model: CrossedFieldModel, durationS: number, count = 180): Vec2[] {
  const duration = Number.isFinite(durationS) ? Math.max(0, durationS) : 0;
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let index = 0; index <= n; index++) {
    points.push(crossedStateAt(model, (duration * index) / n).position);
  }
  return points;
}
