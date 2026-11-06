import { describe, expect, it } from 'vitest';
import {
  createCrossedFieldModel,
  crossedDriftVelocity,
  crossedStateAt,
  sampleCrossedTrajectory,
  type CrossedFieldInput,
} from '../../src/physics/particles/crossedFields';

const base: CrossedFieldInput = {
  massKg: 1,
  chargeC: 1,
  Ex: 0,
  Ey: 2,
  Bz: 1,
  initialPosition: { x: 0, y: 0 },
  initialVelocity: { x: 2, y: 0 },
};

describe('P06 mode A crossed electric and magnetic fields', () => {
  it('A1 keeps a matched drift particle straight for either charge sign', () => {
    for (const chargeC of [1, -1]) {
      const model = createCrossedFieldModel({ ...base, chargeC });
      expect(crossedDriftVelocity(model)?.x).toBeCloseTo(2, 12);
      expect(crossedDriftVelocity(model)?.y).toBeCloseTo(0, 12);
      for (const time of [0, 0.4, 1, Math.PI]) {
        const state = crossedStateAt(model, time);
        expect(state.velocity.x).toBeCloseTo(2, 10);
        expect(state.velocity.y).toBeCloseTo(0, 10);
        expect(state.position.x).toBeCloseTo(2 * time, 10);
        expect(state.position.y).toBeCloseTo(0, 10);
        expect(state.forceE.x).toBeCloseTo(0, 12);
        expect(state.forceE.y).toBeCloseTo(2 * chargeC, 12);
        expect(state.forceB.y).toBeCloseTo(-2 * chargeC, 12);
        expect(state.force.x + state.force.y).toBeCloseTo(0, 12);
        expect(state.netForceMagnitude).toBeCloseTo(0, 10);
        expect(state.selectorMatched).toBe(true);
      }
    }
  });

  it('A2 follows the exact cycloid at a non-matching velocity and conserves E work', () => {
    const model = createCrossedFieldModel({ ...base, initialVelocity: { x: 0, y: 0 } });
    const initial = crossedStateAt(model, 0);
    const state = crossedStateAt(model, Math.PI);
    expect(state.position.x).toBeCloseTo(2 * Math.PI, 9);
    expect(state.position.y).toBeCloseTo(4, 9);
    expect(state.velocity.x).toBeCloseTo(4, 9);
    expect(state.velocity.y).toBeCloseTo(0, 9);
    expect(state.kineticEnergyJ - initial.kineticEnergyJ).toBeCloseTo(8, 9);
    expect(state.electricWorkJ).toBeCloseTo(8, 9);
    expect(state.energyResidualJ).toBeCloseTo(0, 9);
  });

  it('A3 reduces to the exact pure-magnetic circle', () => {
    const model = createCrossedFieldModel({ ...base, Ey: 0, Bz: 1, initialVelocity: { x: 2, y: 0 } });
    const state = crossedStateAt(model, Math.PI / 2);
    expect(state.position.x).toBeCloseTo(2, 10);
    expect(state.position.y).toBeCloseTo(-2, 10);
    expect(state.velocity.x).toBeCloseTo(0, 10);
    expect(state.velocity.y).toBeCloseTo(-2, 10);
    expect(state.speed).toBeCloseTo(2, 10);
    expect(state.kineticEnergyJ).toBeCloseTo(2, 10);
    expect(state.workJ).toBeCloseTo(0, 12);
    expect(state.forceE.x).toBe(0);
    expect(state.forceE.y).toBe(0);
  });

  it('A4 reduces to the exact pure-electric parabola for negative charge', () => {
    const model = createCrossedFieldModel({
      massKg: 1,
      chargeC: -2,
      Ex: 1,
      Ey: 0,
      Bz: 0,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 0, y: 1 },
    });
    const state = crossedStateAt(model, 2);
    expect(state.velocity.x).toBeCloseTo(-4, 10);
    expect(state.velocity.y).toBeCloseTo(1, 10);
    expect(state.position.x).toBeCloseTo(-4, 10);
    expect(state.position.y).toBeCloseTo(2, 10);
    expect(state.workJ).toBeCloseTo(8, 10);
    expect(state.kineticEnergyJ - 0.5).toBeCloseTo(8, 10);
  });

  it('A5 ignores both fields for a neutral particle', () => {
    for (const Bz of [0, 1, -3]) {
      const model = createCrossedFieldModel({ ...base, chargeC: 0, Bz, initialVelocity: { x: 0.4, y: -0.2 } });
      const state = crossedStateAt(model, 5);
      expect(state.position.x).toBeCloseTo(2, 10);
      expect(state.position.y).toBeCloseTo(-1, 10);
      expect(state.velocity.x).toBeCloseTo(0.4, 10);
      expect(state.velocity.y).toBeCloseTo(-0.2, 10);
      expect(state.netForceMagnitude).toBe(0);
    }
  });

  it('A6 is numerically stable as Bz tends to zero and over many periods', () => {
    const pureElectric = crossedStateAt(
      createCrossedFieldModel({ ...base, Bz: 0, initialVelocity: { x: 1, y: 0 } }),
      1,
    );
    for (const Bz of [1e-12, 1e-9, 1e-6, 1e-4]) {
      const small = crossedStateAt(
        createCrossedFieldModel({ ...base, Bz, initialVelocity: { x: 1, y: 0 } }),
        1,
      );
      expect(Number.isFinite(small.position.x)).toBe(true);
      expect(Number.isFinite(small.position.y)).toBe(true);
      const scale = Math.max(1e-9, Math.abs(Bz));
      expect(Math.abs(small.position.x - pureElectric.position.x)).toBeLessThan(5 * scale);
      expect(Math.abs(small.position.y - pureElectric.position.y)).toBeLessThan(5 * scale);
    }
    for (const Bz of [0.4, -0.7, 1.3]) {
      const model = createCrossedFieldModel({ ...base, Bz, initialVelocity: { x: 0.3, y: -1.1 } });
      for (const time of [10, 50, 200]) {
        const state = crossedStateAt(model, time);
        expect(Number.isFinite(state.position.x)).toBe(true);
        expect(Number.isFinite(state.velocity.y)).toBe(true);
      }
    }
  });

  it('A7 satisfies force decomposition, magnetic power and electric work identity', () => {
    const cases: Array<Partial<CrossedFieldInput> & { time: number }> = [
      { chargeC: 1.3, Bz: -0.8, Ex: 1.7, Ey: -0.4, initialVelocity: { x: 0.9, y: 1.2 }, time: 0.7 },
      { chargeC: -2.1, Bz: 0.5, Ex: -0.3, Ey: 2.2, initialVelocity: { x: -1.4, y: 0.6 }, time: 3.2 },
      { chargeC: 0.4, Bz: 2.1, Ex: 0, Ey: 0, initialVelocity: { x: 2, y: -3 }, time: 11 },
    ];
    for (const item of cases) {
      const model = createCrossedFieldModel({ ...base, ...item });
      const initial = crossedStateAt(model, 0);
      const state = crossedStateAt(model, item.time);
      const fbDotV = state.forceB.x * state.velocity.x + state.forceB.y * state.velocity.y;
      expect(Math.abs(fbDotV)).toBeLessThan(1e-8);
      expect(state.force.x).toBeCloseTo(state.forceE.x + state.forceB.x, 10);
      expect(state.force.y).toBeCloseTo(state.forceE.y + state.forceB.y, 10);
      const dp = { x: state.position.x - initial.position.x, y: state.position.y - initial.position.y };
      expect(state.kineticEnergyJ - initial.kineticEnergyJ).toBeCloseTo(
        model.input.chargeC * (model.input.Ex * dp.x + model.input.Ey * dp.y),
        8,
      );
      expect(state.energyResidualJ).toBeCloseTo(0, 5);
    }
  });

  it('samples a finite trajectory and rejects invalid mass safely', () => {
    const model = createCrossedFieldModel({ ...base, initialVelocity: { x: 0, y: 0 } });
    const points = sampleCrossedTrajectory(model, 3, 40);
    expect(points).toHaveLength(41);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(points[0]).toEqual(base.initialPosition);
    const invalid = createCrossedFieldModel({ ...base, massKg: 0 });
    expect(invalid.issue).not.toBeNull();
    const invalidState = crossedStateAt(invalid, 2);
    expect(Number.isFinite(invalidState.position.x)).toBe(true);
    expect(Number.isFinite(invalidState.velocity.x)).toBe(true);
  });
});
