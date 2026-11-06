import { describe, expect, it } from 'vitest';
import {
  uniformB3DModel,
  uniformB3DStateAt,
  sampleUniformB3DPath,
  type Vec3,
} from '../../src/physics/particles/uniformB3D';
import {
  createUniformBModel,
  particleStateAt,
} from '../../src/physics/particles/uniformB';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function model(overrides: {
  chargeC?: number;
  massKg?: number;
  B?: Vec3;
  position?: Vec3;
  velocity?: Vec3;
} = {}) {
  return uniformB3DModel({
    chargeC: overrides.chargeC ?? 1,
    massKg: overrides.massKg ?? 1,
    B: overrides.B ?? v(0, 0, 1),
    position: overrides.position ?? v(0, 0, 0),
    velocity: overrides.velocity ?? v(1, 0, 1),
  });
}

describe('uniformB3D analytic solver', () => {
  it('D1 gives R=1, T=2pi, pitch=2pi and the exact pi/2 state', () => {
    const m = model();
    expect(m.valid).toBe(true);
    expect(m.kind).toBe('helix');
    expect(m.radiusM).toBeCloseTo(1, 12);
    expect(m.periodS).toBeCloseTo(2 * Math.PI, 12);
    expect(m.pitchSignedM).toBeCloseTo(2 * Math.PI, 12);
    expect(m.vParallelSigned).toBeCloseTo(1, 12);
    expect(m.vPerpMagnitude).toBeCloseTo(1, 12);

    const state = uniformB3DStateAt(m, Math.PI / 2);
    expect(state.position.x).toBeCloseTo(1, 12);
    expect(state.position.y).toBeCloseTo(-1, 12);
    expect(state.position.z).toBeCloseTo(Math.PI / 2, 12);
    expect(state.velocity.x).toBeCloseTo(0, 12);
    expect(state.velocity.y).toBeCloseTo(-1, 12);
    expect(state.velocity.z).toBeCloseTo(1, 12);
    expect(state.force.x).toBeCloseTo(-1, 12);
    expect(state.force.y).toBeCloseTo(0, 12);
    expect(state.force.z).toBeCloseTo(0, 12);
    expect(state.speed).toBeCloseTo(Math.sqrt(2), 12);
    expect(state.kineticEnergyJ).toBeCloseTo(1, 12);
  });

  it('D2 with v0=(1,0,0) is a pure circle with no z drift', () => {
    const m = model({ velocity: v(1, 0, 0) });
    expect(m.kind).toBe('circle');
    expect(m.radiusM).toBeCloseTo(1, 12);
    expect(m.pitchSignedM).toBe(0);
    for (const time of [0, 0.4, Math.PI / 2, 2.3, 9]) {
      const state = uniformB3DStateAt(m, time);
      expect(state.position.z).toBeCloseTo(0, 12);
      expect(state.velocity.z).toBeCloseTo(0, 12);
    }
    const quarter = uniformB3DStateAt(m, Math.PI / 2);
    expect(quarter.position.x).toBeCloseTo(1, 12);
    expect(quarter.position.y).toBeCloseTo(-1, 12);
  });

  it('D3 reverses B and reverses the curvature', () => {
    const m = model({ B: v(0, 0, -1), velocity: v(1, 0, 0) });
    const state = uniformB3DStateAt(m, Math.PI / 2);
    expect(state.position.x).toBeCloseTo(1, 12);
    expect(state.position.y).toBeCloseTo(1, 12);
    expect(state.position.z).toBeCloseTo(0, 12);
    expect(state.velocity.x).toBeCloseTo(0, 12);
    expect(state.velocity.y).toBeCloseTo(1, 12);
  });

  it('D4 negative charge with +z field matches reversing B', () => {
    const negative = model({ chargeC: -1, velocity: v(1, 0, 0) });
    const reversed = model({ B: v(0, 0, -1), velocity: v(1, 0, 0) });
    for (const time of [0, 0.3, 1.2, Math.PI / 2, 4]) {
      const left = uniformB3DStateAt(negative, time);
      const right = uniformB3DStateAt(reversed, time);
      expect(left.position.x).toBeCloseTo(right.position.x, 12);
      expect(left.position.y).toBeCloseTo(right.position.y, 12);
      expect(left.position.z).toBeCloseTo(right.position.z, 12);
      expect(left.velocity.x).toBeCloseTo(right.velocity.x, 12);
      expect(left.velocity.y).toBeCloseTo(right.velocity.y, 12);
      expect(left.velocity.z).toBeCloseTo(right.velocity.z, 12);
    }
  });

  it('D5 parallel and antiparallel velocities stay exactly straight with zero force', () => {
    for (const velocity of [v(0, 0, 2), v(0, 0, -2)]) {
      const m = model({ velocity });
      expect(m.kind).toBe('straight');
      expect(m.radiusM).toBeNull();
      expect(m.pitchSignedM).toBeNull();
      for (const time of [0, 1.7, 8]) {
        const state = uniformB3DStateAt(m, time);
        expect(state.position.x).toBeCloseTo(0, 12);
        expect(state.position.y).toBeCloseTo(0, 12);
        expect(state.position.z).toBeCloseTo(velocity.z * time, 12);
        expect(state.velocity).toEqual(velocity);
        expect(state.force).toEqual(v(0, 0, 0));
      }
    }
  });

  it('D6 handles q=0, B=0 and v0=0 without NaN or fake radii', () => {
    const zeroCharge = model({ chargeC: 0 });
    const zeroField = model({ B: v(0, 0, 0) });
    const atRest = model({ velocity: v(0, 0, 0) });

    expect(zeroCharge.kind).toBe('straight');
    expect(zeroField.kind).toBe('straight');
    expect(atRest.kind).toBe('stationary');
    for (const m of [zeroCharge, zeroField, atRest]) {
      expect(m.radiusM).toBeNull();
      expect(m.periodS).toBeNull();
      expect(m.pitchSignedM).toBeNull();
      const state = uniformB3DStateAt(m, 3);
      expect(Number.isFinite(state.position.x)).toBe(true);
      expect(Number.isFinite(state.position.y)).toBe(true);
      expect(Number.isFinite(state.position.z)).toBe(true);
      expect(Number.isFinite(state.velocity.x)).toBe(true);
      expect(Number.isFinite(state.force.x)).toBe(true);
      expect(Number.isFinite(state.kineticEnergyJ)).toBe(true);
    }
    expect(uniformB3DStateAt(atRest, 5).position).toEqual(v(0, 0, 0));
  });

  it('D7 matches q(v cross B) and is perpendicular to v and B', () => {
    const cases = [
      { chargeC: 2, B: v(-1.4, 0.7, 2.2), velocity: v(0.8, -1.3, 2.1) },
      { chargeC: -1.7, B: v(0.4, -2.2, 1.1), velocity: v(-1.2, 0.5, 0.9) },
      { chargeC: 3, B: v(2.5, 1.5, -0.4), velocity: v(0.2, -0.7, 1.8) },
    ];
    for (const item of cases) {
      const m = model(item);
      const state = uniformB3DStateAt(m, 1.37);
      const expected = {
        x: item.chargeC * (state.velocity.y * item.B.z - state.velocity.z * item.B.y),
        y: item.chargeC * (state.velocity.z * item.B.x - state.velocity.x * item.B.z),
        z: item.chargeC * (state.velocity.x * item.B.y - state.velocity.y * item.B.x),
      };
      expect(state.force.x).toBeCloseTo(expected.x, 10);
      expect(state.force.y).toBeCloseTo(expected.y, 10);
      expect(state.force.z).toBeCloseTo(expected.z, 10);
      const fv = state.force.x * state.velocity.x + state.force.y * state.velocity.y + state.force.z * state.velocity.z;
      const fb = state.force.x * item.B.x + state.force.y * item.B.y + state.force.z * item.B.z;
      expect(Math.abs(fv)).toBeLessThan(1e-10);
      expect(Math.abs(fb)).toBeLessThan(1e-10);
    }
  });

  it('D8 keeps speed/energy and its derivatives match the equations of motion', () => {
    const m = model({
      chargeC: 1.4,
      massKg: 2.2,
      B: v(-0.8, 1.7, 2.4),
      position: v(0.3, -0.4, 0.7),
      velocity: v(1.1, -2.0, 0.6),
    });
    const t = 1.15;
    const h = 1e-5;
    const state = uniformB3DStateAt(m, t);
    const before = uniformB3DStateAt(m, t - h);
    const after = uniformB3DStateAt(m, t + h);
    const speed0 = Math.hypot(m.input.velocity.x, m.input.velocity.y, m.input.velocity.z);
    expect(state.speed).toBeCloseTo(speed0, 10);
    expect(state.kineticEnergyJ).toBeCloseTo(0.5 * 2.2 * speed0 * speed0, 10);

    const numericVelocity = {
      x: (after.position.x - before.position.x) / (2 * h),
      y: (after.position.y - before.position.y) / (2 * h),
      z: (after.position.z - before.position.z) / (2 * h),
    };
    expect(numericVelocity.x).toBeCloseTo(state.velocity.x, 6);
    expect(numericVelocity.y).toBeCloseTo(state.velocity.y, 6);
    expect(numericVelocity.z).toBeCloseTo(state.velocity.z, 6);

    const numericAcceleration = {
      x: (after.velocity.x - before.velocity.x) / (2 * h),
      y: (after.velocity.y - before.velocity.y) / (2 * h),
      z: (after.velocity.z - before.velocity.z) / (2 * h),
    };
    expect(numericAcceleration.x).toBeCloseTo(state.force.x / 2.2, 5);
    expect(numericAcceleration.y).toBeCloseTo(state.force.y / 2.2, 5);
    expect(numericAcceleration.z).toBeCloseTo(state.force.z / 2.2, 5);
  });

  it('D9 converges smoothly to the straight-line limit as B approaches zero', () => {
    const position = v(0.2, -0.3, 0.1);
    const velocity = v(1.2, -0.7, 1.6);
    const time = 2.0;
    let previousError = Infinity;
    for (const bz of [0.1, 0.01, 0.001, 0.000001]) {
      const m = model({ B: v(0, 0, bz), position, velocity });
      const state = uniformB3DStateAt(m, time);
      const straight = {
        x: position.x + velocity.x * time,
        y: position.y + velocity.y * time,
        z: position.z + velocity.z * time,
      };
      const error = Math.hypot(
        state.position.x - straight.x,
        state.position.y - straight.y,
        state.position.z - straight.z,
      );
      expect(Number.isFinite(error)).toBe(true);
      expect(error).toBeLessThanOrEqual(previousError + 1e-12);
      previousError = error;
      expect(state.speed).toBeCloseTo(Math.hypot(velocity.x, velocity.y, velocity.z), 8);
    }
    const zero = model({ B: v(0, 0, 0), position, velocity });
    const limit = uniformB3DStateAt(zero, time);
    expect(limit.position.x).toBeCloseTo(position.x + velocity.x * time, 12);
    expect(limit.position.y).toBeCloseTo(position.y + velocity.y * time, 12);
    expect(limit.position.z).toBeCloseTo(position.z + velocity.z * time, 12);
  });

  it('D10 matches the validated P02 planar solver when B is along z', () => {
    const p02 = createUniformBModel({
      massKg: 1,
      chargeC: 1,
      BzTesla: -1,
      initialPosition: { x: 0.3, y: -0.2 },
      initialVelocity: { x: 2, y: 0.4 },
    });
    const m = model({
      B: v(0, 0, -1),
      position: v(0.3, -0.2, 0),
      velocity: v(2, 0.4, 0),
    });
    for (const time of [0, 0.15, 0.8, Math.PI / 2, 4.2, 9]) {
      const flat = particleStateAt(p02, time);
      const space = uniformB3DStateAt(m, time);
      expect(space.position.x).toBeCloseTo(flat.position.x, 10);
      expect(space.position.y).toBeCloseTo(flat.position.y, 10);
      expect(space.position.z).toBeCloseTo(0, 12);
      expect(space.velocity.x).toBeCloseTo(flat.velocity.x, 10);
      expect(space.velocity.y).toBeCloseTo(flat.velocity.y, 10);
      expect(space.velocity.z).toBeCloseTo(0, 12);
      expect(space.radiusM).toBeCloseTo(p02.radiusM, 10);
      expect(space.periodS).toBeCloseTo(p02.periodS, 10);
    }
  });

  it('D13 safely rejects oversized, non-finite and invalid-mass input', () => {
    const invalid = uniformB3DModel({
      chargeC: Number.NaN,
      massKg: 0,
      B: v(Number.POSITIVE_INFINITY, 0, Number.NaN),
      position: v(Number.NaN, 0, 0),
      velocity: v(0, Number.NEGATIVE_INFINITY, 0),
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.issue).toBeTruthy();
    const state = uniformB3DStateAt(invalid, 2);
    for (const value of [
      state.position.x,
      state.position.y,
      state.position.z,
      state.velocity.x,
      state.velocity.y,
      state.velocity.z,
      state.force.x,
      state.force.y,
      state.force.z,
      state.speed,
      state.kineticEnergyJ,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('D14 charge sign flips force, mass changes acceleration but not force', () => {
    const positive = model({ chargeC: 2, massKg: 1, velocity: v(1.3, -0.4, 0.8) });
    const negative = model({ chargeC: -2, massKg: 1, velocity: v(1.3, -0.4, 0.8) });
    const heavy = model({ chargeC: 2, massKg: 4, velocity: v(1.3, -0.4, 0.8) });
    const p = uniformB3DStateAt(positive, 0);
    const n = uniformB3DStateAt(negative, 0);
    const h = uniformB3DStateAt(heavy, 0);
    expect(n.force.x).toBeCloseTo(-p.force.x, 12);
    expect(n.force.y).toBeCloseTo(-p.force.y, 12);
    expect(n.force.z).toBeCloseTo(-p.force.z, 12);
    expect(h.force.x).toBeCloseTo(p.force.x, 12);
    expect(h.force.y).toBeCloseTo(p.force.y, 12);
    expect(h.force.z).toBeCloseTo(p.force.z, 12);
    expect(h.acceleration.x).toBeCloseTo(p.acceleration.x / 4, 12);
    expect(h.acceleration.y).toBeCloseTo(p.acceleration.y / 4, 12);
    expect(h.acceleration.z).toBeCloseTo(p.acceleration.z / 4, 12);
  });

  it('samples analytic paths with exact endpoints and finite values', () => {
    const m = model({ velocity: v(1, 0, 1) });
    const points = sampleUniformB3DPath(m, 0, Math.PI * 2, 33);
    expect(points).toHaveLength(34);
    expect(points[0].x).toBeCloseTo(0, 12);
    expect(points[0].y).toBeCloseTo(0, 12);
    expect(points[0].z).toBeCloseTo(0, 12);
    const end = uniformB3DStateAt(m, Math.PI * 2);
    expect(points[33].x).toBeCloseTo(end.position.x, 12);
    expect(points[33].y).toBeCloseTo(end.position.y, 12);
    expect(points[33].z).toBeCloseTo(end.position.z, 12);
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(Number.isFinite(point.z)).toBe(true);
    }
  });

  it('classifies reversed B and oblique B with signed curvature and a unit axis', () => {
    const outOfPage = model({ B: v(0, 0, 1), velocity: v(1, 0, 0) });
    const intoPage = model({ B: v(0, 0, -1), velocity: v(1, 0, 0) });
    expect(uniformB3DStateAt(outOfPage, 0.2).position.y).toBeLessThan(0);
    expect(uniformB3DStateAt(intoPage, 0.2).position.y).toBeGreaterThan(0);
    expect(outOfPage.omegaSigned).toBeCloseTo(-1, 12);
    expect(intoPage.omegaSigned).toBeCloseTo(-1, 12);
    const oblique = model({ B: v(1, 1, 1), velocity: v(1, 0, 0) });
    expect(oblique.kind).toBe('helix');
    expect(oblique.axis).not.toBeNull();
    expect(Math.hypot(oblique.axis!.x, oblique.axis!.y, oblique.axis!.z)).toBeCloseTo(1, 12);
  });
});
