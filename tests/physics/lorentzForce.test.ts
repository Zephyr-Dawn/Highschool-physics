import { describe, expect, it } from 'vitest';
import {
  cross3,
  dot3,
  lorentzForceSnapshot,
  magnitude3,
  type Vec3,
} from '../../src/physics/particles/lorentzForce';
import { createUniformBModel, particleStateAt } from '../../src/physics/particles/uniformB';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

describe('P01 Lorentz force core', () => {
  it('P1 computes F = q v × B for a positive charge', () => {
    const snapshot = lorentzForceSnapshot({
      chargeC: 2,
      massKg: 1,
      velocity: v(3, 0, 0),
      B: v(0, 0, -4),
    });
    expect(snapshot.vCrossB).toEqual({ x: 0, y: 12, z: 0 });
    expect(snapshot.force).toEqual({ x: 0, y: 24, z: 0 });
    expect(snapshot.magnitude).toBeCloseTo(24, 12);
    expect(snapshot.thetaDeg).toBeCloseTo(90, 12);
    expect(snapshot.zeroForceReason).toBe('none');
  });

  it('P2 reverses force when only the charge sign reverses', () => {
    const positive = lorentzForceSnapshot({ chargeC: 2, massKg: 1, velocity: v(3, 0, 0), B: v(0, 0, -4) });
    const negative = lorentzForceSnapshot({ chargeC: -2, massKg: 1, velocity: v(3, 0, 0), B: v(0, 0, -4) });
    expect(negative.force.x).toBeCloseTo(-positive.force.x, 12);
    expect(negative.force.y).toBeCloseTo(-positive.force.y, 12);
    expect(negative.force.z).toBeCloseTo(-positive.force.z, 12);
    expect(negative.magnitude).toBeCloseTo(24, 12);
  });

  it('P3 has exactly zero force for parallel and anti-parallel v and B', () => {
    const parallel = lorentzForceSnapshot({ chargeC: 2, massKg: 1, velocity: v(0, 0, 3), B: v(0, 0, 4) });
    const anti = lorentzForceSnapshot({ chargeC: -2, massKg: 1, velocity: v(0, 0, 3), B: v(0, 0, -4) });
    expect(parallel.zeroForceReason).toBe('parallel');
    expect(anti.zeroForceReason).toBe('anti-parallel');
    expect(parallel.magnitude).toBe(0);
    expect(anti.magnitude).toBe(0);
    expect(parallel.forceDirection).toBeNull();
    expect(anti.forceDirection).toBeNull();
  });

  it('P4 handles q=0, B=0 and v=0 separately', () => {
    const zeroCharge = lorentzForceSnapshot({ chargeC: 0, massKg: 1, velocity: v(2, 3, 4), B: v(1, 0, 0) });
    const zeroField = lorentzForceSnapshot({ chargeC: 2, massKg: 1, velocity: v(2, 3, 4), B: v(0, 0, 0) });
    const zeroVelocity = lorentzForceSnapshot({ chargeC: 2, massKg: 1, velocity: v(0, 0, 0), B: v(0, 1, 0) });
    expect(zeroCharge.zeroForceReason).toBe('zero-charge');
    expect(zeroField.zeroForceReason).toBe('zero-field');
    expect(zeroVelocity.zeroForceReason).toBe('zero-velocity');
    for (const snapshot of [zeroCharge, zeroField, zeroVelocity]) {
      expect(snapshot.magnitude).toBe(0);
      expect(snapshot.force).toEqual({ x: 0, y: 0, z: 0 });
      expect(snapshot.forceDirection).toBeNull();
    }
  });

  it('P5 matches the full 3D cross product and is perpendicular to v and B', () => {
    const velocity = v(1, 2, 3);
    const field = v(-2, 1, 4);
    const snapshot = lorentzForceSnapshot({ chargeC: 2, massKg: 1, velocity, B: field });
    expect(cross3(velocity, field)).toEqual({ x: 5, y: -10, z: 5 });
    expect(snapshot.force).toEqual({ x: 10, y: -20, z: 10 });
    expect(Math.abs(dot3(snapshot.force, velocity))).toBeLessThan(1e-10);
    expect(Math.abs(dot3(snapshot.force, field))).toBeLessThan(1e-10);
    expect(Math.abs(snapshot.magneticPowerW)).toBeLessThan(1e-10);
  });

  it('P6 mass changes acceleration and 2D R/T but never the instantaneous force', () => {
    const light = lorentzForceSnapshot({ chargeC: 2, massKg: 1, velocity: v(3, 0, 0), B: v(0, 0, -4) });
    const heavy = lorentzForceSnapshot({ chargeC: 2, massKg: 4, velocity: v(3, 0, 0), B: v(0, 0, -4) });
    expect(heavy.force).toEqual(light.force);
    expect(magnitude3(heavy.acceleration)).toBeCloseTo(magnitude3(light.acceleration) / 4, 12);

    const modelLight = createUniformBModel({
      massKg: 1,
      chargeC: 1,
      BzTesla: 1,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 2, y: 0 },
    });
    const modelHeavy = createUniformBModel({
      massKg: 4,
      chargeC: 1,
      BzTesla: 1,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 2, y: 0 },
    });
    expect(modelHeavy.radiusM).toBeCloseTo(modelLight.radiusM * 4, 12);
    expect(modelHeavy.periodS).toBeCloseTo(modelLight.periodS * 4, 12);
    const forceAtStart = Math.hypot(
      modelLight.input.chargeC * modelLight.input.initialVelocity.x * modelLight.input.BzTesla,
      modelLight.input.chargeC * modelLight.input.initialVelocity.y * modelLight.input.BzTesla,
    );
    expect(forceAtStart).toBeGreaterThan(0);
  });

  it('P7 confirms the P02 uniform-B trajectory and initial force', () => {
    const model = createUniformBModel({
      massKg: 1,
      chargeC: 1,
      BzTesla: -1,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 2, y: 0 },
    });
    const initial = lorentzForceSnapshot({ chargeC: 1, massKg: 1, velocity: v(2, 0, 0), B: v(0, 0, -1) });
    expect(initial.force.y).toBeCloseTo(2, 12);
    expect(initial.force.x).toBeCloseTo(0, 12);
    expect(model.radiusM).toBeCloseTo(2, 12);
    expect(model.periodS).toBeCloseTo(2 * Math.PI, 12);
    expect(model.center).toEqual({ x: 0, y: 2 });
    const state = particleStateAt(model, Math.PI / 2);
    expect(state.position.x).toBeCloseTo(2, 12);
    expect(state.position.y).toBeCloseTo(2, 12);
    expect(state.velocity.x).toBeCloseTo(0, 12);
    expect(state.velocity.y).toBeCloseTo(2, 12);
  });

  it('P8 equal-speed positive and negative charges turn oppositely with zero magnetic power', () => {
    const positive = createUniformBModel({
      massKg: 1,
      chargeC: 1,
      BzTesla: 1,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 2, y: 0 },
    });
    const negative = createUniformBModel({
      massKg: 1,
      chargeC: -1,
      BzTesla: 1,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 2, y: 0 },
    });
    expect(positive.direction).not.toBe(negative.direction);
    for (const time of [0, 0.2, 1.1, 3]) {
      const positiveState = particleStateAt(positive, time);
      const negativeState = particleStateAt(negative, time);
      expect(positiveState.speed).toBeCloseTo(2, 12);
      expect(negativeState.speed).toBeCloseTo(2, 12);
      expect(Math.hypot(positiveState.force.x, positiveState.force.y)).toBeCloseTo(
        Math.hypot(negativeState.force.x, negativeState.force.y),
        12,
      );
      expect(positiveState.force.x * positiveState.velocity.x + positiveState.force.y * positiveState.velocity.y).toBeCloseTo(0, 12);
      expect(negativeState.force.x * negativeState.velocity.x + negativeState.force.y * negativeState.velocity.y).toBeCloseTo(0, 12);
    }
    const positiveStart = particleStateAt(positive, 0);
    const negativeStart = particleStateAt(negative, 0);
    expect(positiveStart.force.x).toBeCloseTo(-negativeStart.force.x, 12);
    expect(positiveStart.force.y).toBeCloseTo(-negativeStart.force.y, 12);
  });

  it('P10 safely handles invalid and near-zero vectors', () => {
    const invalid = lorentzForceSnapshot({
      chargeC: Number.NaN,
      massKg: 0,
      velocity: v(Number.POSITIVE_INFINITY, 0, 0),
      B: v(0, 0, Number.NaN),
    });
    expect(invalid.zeroForceReason).toBe('invalid');
    expect(Number.isFinite(invalid.force.x)).toBe(true);
    expect(Number.isFinite(invalid.acceleration.x)).toBe(true);
    const tiny = lorentzForceSnapshot({ chargeC: 1e-13, massKg: 1, velocity: v(1e-13, 0, 0), B: v(0, 0, 1e-13) });
    expect(tiny.magnitude).toBe(0);
    expect(tiny.forceDirection).toBeNull();
  });
});
