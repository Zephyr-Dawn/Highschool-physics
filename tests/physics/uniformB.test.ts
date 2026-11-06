import { describe, expect, it } from 'vitest';
import {
  buildUniformBInput,
  createUniformBModel,
  particleStateAt,
  sampleTrajectory,
  CHARGE_UNIT_C,
  MASS_UNIT_KG,
  SPEED_UNIT_MPS,
} from '../../src/physics/particles/uniformB';
import type { UniformBInput } from '../../src/physics/particles/uniformB';
import { distance, dot, sub, length } from '../../src/physics/core/vec2';

function input(overrides: Partial<UniformBInput> = {}): UniformBInput {
  return {
    massKg: MASS_UNIT_KG,
    chargeC: CHARGE_UNIT_C,
    BzTesla: 0.5,
    initialPosition: { x: 0, y: 0 },
    initialVelocity: { x: 2 * SPEED_UNIT_MPS, y: 0 },
    ...overrides,
  };
}

function numericStep(inputValue: UniformBInput, tEnd: number, steps = 20000) {
  const dt = tEnd / steps;
  let x = inputValue.initialPosition.x;
  let y = inputValue.initialPosition.y;
  let vx = inputValue.initialVelocity.x;
  let vy = inputValue.initialVelocity.y;
  const qm = inputValue.chargeC / inputValue.massKg;
  const B = inputValue.BzTesla;
  const accel = (vxNow: number, vyNow: number) => ({
    ax: qm * vyNow * B,
    ay: -qm * vxNow * B,
  });
  for (let i = 0; i < steps; i++) {
    const k1v = accel(vx, vy);
    const k1x = vx;
    const k1y = vy;
    const k2x = vx + (dt / 2) * k1v.ax;
    const k2y = vy + (dt / 2) * k1v.ay;
    const k2v = accel(k2x, k2y);
    const k3x = vx + (dt / 2) * k2v.ax;
    const k3y = vy + (dt / 2) * k2v.ay;
    const k3v = accel(k3x, k3y);
    const k4x = vx + dt * k3v.ax;
    const k4y = vy + dt * k3v.ay;
    const k4v = accel(k4x, k4y);
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    vx += (dt / 6) * (k1v.ax + 2 * k2v.ax + 2 * k3v.ax + k4v.ax);
    vy += (dt / 6) * (k1v.ay + 2 * k2v.ay + 2 * k3v.ay + k4v.ay);
  }
  return { x, y, vx, vy };
}

describe('P02 uniform magnetic field analytic model', () => {
  it('q>0, vx>0, Bz>0 gives a downward Lorentz force and a clockwise turn', () => {
    const model = createUniformBModel(input());
    const state = particleStateAt(model, 0);
    expect(state.force.y).toBeLessThan(0);
    expect(state.force.x).toBeCloseTo(0, 12);
    expect(state.direction).toBe('clockwise');
  });

  it('reversing charge reverses the force and turn while keeping |r| and T', () => {
    const positive = createUniformBModel(input());
    const negative = createUniformBModel(input({ chargeC: -CHARGE_UNIT_C }));
    const sp = particleStateAt(positive, 0);
    const sn = particleStateAt(negative, 0);
    expect(sp.force.y).toBeLessThan(0);
    expect(sn.force.y).toBeGreaterThan(0);
    expect(sn.radiusM).toBeCloseTo(sp.radiusM, 12);
    expect(sn.periodS).toBeCloseTo(sp.periodS, 12);
    expect(sn.direction).toBe('counterclockwise');
  });

  it('reversing B reverses the turn while preserving radius and period', () => {
    const out = createUniformBModel(input());
    const into = createUniformBModel(input({ BzTesla: -0.5 }));
    expect(into.direction).not.toBe(out.direction);
    expect(into.radiusM).toBeCloseTo(out.radiusM, 12);
    expect(into.periodS).toBeCloseTo(out.periodS, 12);
    const s = particleStateAt(into, 0);
    expect(s.force.y).toBeGreaterThan(0);
  });

  it('matches r = mv/(|q|B), T = 2πm/(|q|B) and keeps the circle geometry consistent', () => {
    const model = createUniformBModel(input());
    const rExpected = (MASS_UNIT_KG * 2 * SPEED_UNIT_MPS) / (CHARGE_UNIT_C * 0.5);
    const tExpected = (2 * Math.PI * MASS_UNIT_KG) / (CHARGE_UNIT_C * 0.5);
    expect(model.radiusM).toBeCloseTo(rExpected, 12);
    expect(model.periodS).toBeCloseTo(tExpected, 14);

    for (const t of [0, model.periodS * 0.13, model.periodS * 0.5, model.periodS * 0.83]) {
      const s = particleStateAt(model, t);
      expect(distance(s.position, model.center!)).toBeCloseTo(model.radiusM, 12);
      // For a circular orbit F is centripetal: F ⟂ v and F points to the centre.
      expect(dot(s.force, s.velocity)).toBeCloseTo(0, 12);
      const toCenter = sub(s.center!, s.position);
      expect(dot(s.force, toCenter)).toBeGreaterThan(0);
      expect(s.speed).toBeCloseTo(model.speed0, 9);
    }
  });

  it('is periodic: the state after exactly one period equals the initial state', () => {
    const model = createUniformBModel(input());
    const s0 = particleStateAt(model, 0);
    const s1 = particleStateAt(model, model.periodS);
    expect(distance(s0.position, s1.position) / model.radiusM).toBeLessThan(1e-12);
    expect(s1.velocity.x).toBeCloseTo(s0.velocity.x, 9);
    expect(s1.velocity.y).toBeCloseTo(s0.velocity.y, 9);
  });

  it('agrees with an independent RK4 integration and conserves speed', () => {
    const values = input();
    const model = createUniformBModel(values);
    const tEnd = model.periodS * 0.37;
    const numerical = numericStep(values, tEnd);
    const analytic = particleStateAt(model, tEnd);
    const scale = model.radiusM;
    expect(Math.abs(numerical.x - analytic.position.x) / scale).toBeLessThan(2e-6);
    expect(Math.abs(numerical.y - analytic.position.y) / scale).toBeLessThan(2e-6);
    expect(Math.hypot(numerical.vx, numerical.vy)).toBeCloseTo(model.speed0, 6);
  });

  it('doubling speed doubles the radius but leaves the period unchanged', () => {
    const slow = createUniformBModel(input({ initialVelocity: { x: SPEED_UNIT_MPS, y: 0 } }));
    const fast = createUniformBModel(input({ initialVelocity: { x: 2 * SPEED_UNIT_MPS, y: 0 } }));
    expect(fast.radiusM / slow.radiusM).toBeCloseTo(2, 12);
    expect(fast.periodS).toBeCloseTo(slow.periodS, 15);
  });

  it('B=0 gives a straight line with no force and no division by zero', () => {
    const model = createUniformBModel(input({ BzTesla: 0 }));
    expect(model.circular).toBe(false);
    expect(model.radiusM).toBe(Infinity);
    expect(model.center).toBeNull();
    const s = particleStateAt(model, 1e-6);
    expect(Number.isFinite(s.position.x)).toBe(true);
    expect(Number.isFinite(s.velocity.x)).toBe(true);
    expect(s.position.y).toBeCloseTo(0, 12);
    expect(s.force.x).toBe(0);
    expect(s.force.y).toBe(0);
    expect(model.issue).toContain('磁感应强度为 0');
  });

  it('q=0 gives a straight line and no force', () => {
    const model = createUniformBModel(input({ chargeC: 0 }));
    expect(model.circular).toBe(false);
    const s = particleStateAt(model, 1e-7);
    expect(s.force.x).toBe(0);
    expect(s.force.y).toBe(0);
    expect(Number.isFinite(s.velocity.x)).toBe(true);
    expect(model.issue).toContain('电荷量为 0');
  });

  it('v=0 stays at rest without NaN', () => {
    const model = createUniformBModel(input({ initialVelocity: { x: 0, y: 0 } }));
    expect(model.circular).toBe(false);
    const s = particleStateAt(model, 1);
    expect(s.position).toEqual({ x: 0, y: 0 });
    expect(s.speed).toBe(0);
    expect(s.force.x).toBe(0);
    expect(s.force.y).toBe(0);
    expect(model.issue).toContain('初速度为 0');
  });

  it('extreme and non-finite inputs never produce NaN in the rendered state', () => {
    const cases: UniformBInput[] = [
      input({ massKg: Number.NaN }),
      input({ massKg: 0 }),
      input({ BzTesla: Number.POSITIVE_INFINITY }),
      input({ initialVelocity: { x: Number.NaN, y: 1 } }),
      input({ massKg: 1e-60, chargeC: 1e-19, BzTesla: 1e-30 }),
      input({ massKg: 1e-6, chargeC: 1e-19, BzTesla: 50, initialVelocity: { x: 1e9, y: 1e9 } }),
    ];
    for (const value of cases) {
      const model = createUniformBModel(value);
      for (const t of [0, 1e-6, 1]) {
        const s = particleStateAt(model, t);
        expect(Number.isFinite(s.position.x)).toBe(true);
        expect(Number.isFinite(s.position.y)).toBe(true);
        expect(Number.isFinite(s.velocity.x)).toBe(true);
        expect(Number.isFinite(s.velocity.y)).toBe(true);
        expect(Number.isFinite(s.force.x)).toBe(true);
        expect(Number.isFinite(s.force.y)).toBe(true);
      }
    }
  });

  it('trajectory sampler starts at the initial position and has no non-finite points', () => {
    const model = createUniformBModel(input());
    const points = sampleTrajectory(model, model.periodS * 1.5, 64);
    expect(points).toHaveLength(65);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(length(sub(points[points.length - 1], points[0]))).toBeGreaterThan(0);
  });

  it('builds teaching-unit input without leaking display units into the engine', () => {
    const values = buildUniformBInput({
      massUnits: 2,
      chargeUnits: -1.5,
      BzTesla: -0.4,
      speedUnits: 3,
      directionDeg: 90,
      start: { x: 0.1, y: -0.2 },
    });
    expect(values.massKg).toBeCloseTo(2 * MASS_UNIT_KG, 30);
    expect(values.chargeC).toBeCloseTo(-1.5 * CHARGE_UNIT_C, 30);
    expect(values.initialVelocity.x).toBeCloseTo(0, 6);
    expect(values.initialVelocity.y).toBeCloseTo(3 * SPEED_UNIT_MPS, 6);
  });
});
