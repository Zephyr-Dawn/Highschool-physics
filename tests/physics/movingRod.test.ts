import { describe, expect, it } from 'vitest';
import {
  formatRodCurrentDirection,
  rodCurrentDirection,
  rodStateAt,
  solveRod,
  type RodParams,
} from '../../src/physics/induction/movingRod';

const base: RodParams = {
  mode: 'constant-speed',
  BzTesla: 1,
  lengthM: 2,
  resistanceOhm: 4,
  circuitClosed: true,
  startXM: 1,
  initialSpeedMps: 3,
  massKg: 1,
  externalForceN: 0,
};

function rod(patch: Partial<RodParams>): RodParams {
  return { ...base, ...patch };
}

describe('I02 moving rod analytic model', () => {
  it('T1 computes signed motional EMF, current, drag and Joule power', () => {
    const solution = solveRod(rod({}));
    const state = rodStateAt(solution, 0);
    expect(state.fluxWb).toBeCloseTo(2, 12);
    expect(state.emfV).toBeCloseTo(-6, 12);
    expect(state.currentA).toBeCloseTo(-1.5, 12);
    expect(state.magneticForceXN).toBeCloseTo(-3, 12);
    expect(state.joulePowerW).toBeCloseTo(9, 12);
    expect(state.externalForceN).toBeCloseTo(3, 12);
    expect(rodCurrentDirection(state)).toBe('down');
    expect(formatRodCurrentDirection(state)).toContain('向下');
  });

  it('T2 reverses only velocity and flips EMF, current and drag', () => {
    const state = rodStateAt(solveRod(rod({ initialSpeedMps: -3 })), 0);
    expect(state.emfV).toBeCloseTo(6, 12);
    expect(state.currentA).toBeCloseTo(1.5, 12);
    expect(state.magneticForceXN).toBeCloseTo(3, 12);
    expect(state.joulePowerW).toBeCloseTo(9, 12);
    expect(rodCurrentDirection(state)).toBe('up');
  });

  it('T3 reverse B flips current but the drag still opposes velocity', () => {
    const state = rodStateAt(solveRod(rod({ BzTesla: -1 })), 0);
    expect(state.emfV).toBeCloseTo(6, 12);
    expect(state.currentA).toBeCloseTo(1.5, 12);
    expect(state.magneticForceXN).toBeCloseTo(-3, 12);
    expect(state.emfV * state.currentA).toBeGreaterThan(0);
  });

  it('T4 open circuit keeps EMF but removes current, force and Joule power', () => {
    const solution = solveRod(rod({ circuitClosed: false }));
    const state = rodStateAt(solution, 0);
    expect(state.emfV).toBeCloseTo(-6, 12);
    expect(state.currentA).toBe(0);
    expect(state.magneticForceXN).toBe(0);
    expect(state.joulePowerW).toBe(0);
    expect(state.jouleHeatJ).toBe(0);
    expect(rodCurrentDirection(state)).toBe('none');
    expect(formatRodCurrentDirection(state)).toContain('无');
  });

  it('T5 B=0 removes flux, EMF, current and magnetic force', () => {
    const state = rodStateAt(solveRod(rod({ BzTesla: 0 })), 0);
    expect(state.fluxWb).toBe(0);
    expect(state.emfV).toBe(0);
    expect(state.currentA).toBe(0);
    expect(state.magneticForceXN).toBe(0);
    expect(state.joulePowerW).toBe(0);
  });

  it('T6 constant-speed external work equals Joule heat with no kinetic change', () => {
    const solution = solveRod(rod({}));
    const state = rodStateAt(solution, 2);
    const initial = rodStateAt(solution, 0);
    expect(state.xM).toBeCloseTo(7, 12);
    expect(state.externalWorkJ).toBeCloseTo(18, 10);
    expect(state.jouleHeatJ).toBeCloseTo(18, 10);
    expect(state.kineticEnergyJ - initial.kineticEnergyJ).toBeCloseTo(0, 10);
    expect(state.externalPowerW).toBeCloseTo(9, 10);
    expect(state.energyResidualJ).toBeCloseTo(0, 10);
  });

  it('T7 free decay follows the exponential velocity and integrated position', () => {
    const solution = solveRod(
      rod({
        mode: 'free-decay',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 1,
        initialSpeedMps: 2,
        massKg: 1,
      }),
    );
    expect(solution.k).toBeCloseTo(0.5, 12);
    expect(solution.alphaPerS).toBeCloseTo(0.5, 12);
    const state = rodStateAt(solution, 2);
    expect(state.velocityMps).toBeCloseTo(2 * Math.exp(-1), 10);
    expect(state.xM).toBeCloseTo(1 + 4 * (1 - Math.exp(-1)), 10);
  });

  it('T8 free decay conserves kinetic energy plus Joule heat', () => {
    const solution = solveRod(
      rod({
        mode: 'free-decay',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 1,
        initialSpeedMps: 2,
        massKg: 1,
      }),
    );
    const state = rodStateAt(solution, 2);
    expect(state.jouleHeatJ).toBeCloseTo(2 * (1 - Math.exp(-2)), 10);
    expect(state.kineticEnergyJ + (state.jouleHeatJ ?? NaN)).toBeCloseTo(2, 10);
    expect(state.energyResidualJ).toBeCloseTo(0, 10);
  });

  it('T9 free sliding with B=0 or an open circuit never damps', () => {
    for (const patch of [
      { BzTesla: 0, circuitClosed: true },
      { BzTesla: 1, circuitClosed: false },
    ] as Array<Partial<RodParams>>) {
      const solution = solveRod(
        rod({
          mode: 'free-decay',
          startXM: 1,
          initialSpeedMps: 2,
          massKg: 1,
          ...patch,
        }),
      );
      const state = rodStateAt(solution, 2);
      expect(state.velocityMps).toBeCloseTo(2, 12);
      expect(state.xM).toBeCloseTo(5, 12);
      expect(state.jouleHeatJ).toBe(0);
      expect(state.magneticForceXN).toBe(0);
    }
  });

  it('T10 constant force approaches the terminal velocity with the exact solution', () => {
    const solution = solveRod(
      rod({
        mode: 'constant-force',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 1,
        initialSpeedMps: 0,
        massKg: 1,
        externalForceN: 1,
      }),
    );
    expect(solution.terminalVelocityMps).toBeCloseTo(2, 12);
    const state = rodStateAt(solution, 2);
    expect(state.velocityMps).toBeCloseTo(2 * (1 - Math.exp(-1)), 10);
    expect(state.xM).toBeCloseTo(1 + 4 * Math.exp(-1), 10);
  });

  it('T11 independently integrated heat closes the work-energy identity', () => {
    const solution = solveRod(
      rod({
        mode: 'constant-force',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 1,
        initialSpeedMps: 0,
        massKg: 1,
        externalForceN: 1,
      }),
    );
    const initial = rodStateAt(solution, 0);
    const state = rodStateAt(solution, 2);
    const expectedHeat =
      0.5 *
      (4 * 2 +
        (2 * 2 * -2 * (1 - Math.exp(-1))) / 0.5 +
        (4 * (1 - Math.exp(-2))) / 1);
    expect(state.jouleHeatJ).toBeCloseTo(expectedHeat, 9);
    const deltaK = state.kineticEnergyJ - initial.kineticEnergyJ;
    expect((state.externalWorkJ ?? 0) - deltaK - (state.jouleHeatJ ?? 0)).toBeCloseTo(0, 8);
    expect(state.energyResidualJ).toBeCloseTo(0, 8);
  });

  it('T12 constant force with B=0 reduces to uniform acceleration', () => {
    const solution = solveRod(
      rod({
        mode: 'constant-force',
        BzTesla: 0,
        startXM: 1,
        initialSpeedMps: 1,
        massKg: 2,
        externalForceN: 4,
      }),
    );
    const state = rodStateAt(solution, 2);
    expect(state.velocityMps).toBeCloseTo(5, 10);
    expect(state.xM).toBeCloseTo(7, 10);
    expect(state.jouleHeatJ).toBe(0);
    expect(state.currentA).toBe(0);
    expect(state.energyResidualJ).toBeCloseTo(0, 10);
  });

  it('T13 reversed constant force crosses zero and flips current and drag signs', () => {
    const solution = solveRod(
      rod({
        mode: 'constant-force',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 2,
        initialSpeedMps: 2,
        massKg: 1,
        externalForceN: -1,
      }),
    );
    const zeroEvent = solution.events.find((event) => event.kind === 'zero-velocity');
    expect(zeroEvent).toBeDefined();
    const zeroTime = 2 * Math.log(2);
    expect(zeroEvent!.tS).toBeCloseTo(zeroTime, 8);
    const before = rodStateAt(solution, zeroTime - 1e-6);
    const after = rodStateAt(solution, zeroTime + 1e-6);
    expect(before.velocityMps).toBeGreaterThan(0);
    expect(after.velocityMps).toBeLessThan(0);
    expect(before.currentA).toBeLessThan(0);
    expect(after.currentA).toBeGreaterThan(0);
    expect(before.magneticForceXN).toBeLessThan(0);
    expect(after.magneticForceXN).toBeGreaterThan(0);
    expect(after.externalForceN).toBeCloseTo(-1, 12);
  });

  it('T14 magnetic power is exactly minus Joule power and drag removes kinetic energy', () => {
    const cases: Array<Partial<RodParams> & { time: number }> = [
      { BzTesla: 1, lengthM: 2, resistanceOhm: 4, initialSpeedMps: 3, time: 0.7 },
      { BzTesla: -1.4, lengthM: 0.8, resistanceOhm: 1.3, initialSpeedMps: -2.2, time: 0.3 },
      { BzTesla: 0.35, lengthM: 3.1, resistanceOhm: 8, initialSpeedMps: 0.9, time: 2.3 },
    ];
    for (const item of cases) {
      const solution = solveRod(rod({ ...item }));
      const initial = rodStateAt(solution, 0);
      const state = rodStateAt(solution, item.time);
      expect(state.joulePowerW).toBeCloseTo(state.currentA * state.currentA * solution.params.resistanceOhm, 10);
      expect(state.magneticForceXN * state.velocityMps).toBeCloseTo(-state.joulePowerW, 10);
      expect(state.joulePowerW).toBeGreaterThan(0);
      expect(state.joulePowerW).toBeGreaterThanOrEqual(0);
      expect(state.kineticEnergyJ).toBeLessThanOrEqual(initial.kineticEnergyJ + 1e-10);
    }
  });

  it('T15 handles tiny k, huge R, very short time and t=0 without NaN', () => {
    const solution = solveRod(
      rod({
        mode: 'free-decay',
        BzTesla: 1e-6,
        lengthM: 0.5,
        resistanceOhm: 1e9,
        startXM: 1,
        initialSpeedMps: 2,
        massKg: 1,
      }),
    );
    for (const time of [0, 1e-9, 1e-6, 0.5, 2]) {
      const state = rodStateAt(solution, time);
      expect(Number.isFinite(state.xM)).toBe(true);
      expect(Number.isFinite(state.velocityMps)).toBe(true);
      expect(Number.isFinite(state.emfV)).toBe(true);
      expect(Number.isFinite(state.jouleHeatJ)).toBe(true);
    }
  });

  it('T16 rejects zero resistance, invalid geometry and non-finite input safely', () => {
    const invalidInputs: Array<Partial<RodParams>> = [
      { resistanceOhm: 0 },
      { massKg: 0 },
      { lengthM: -1 },
      { BzTesla: Number.NaN },
      { startXM: -2 },
      { initialSpeedMps: Number.POSITIVE_INFINITY },
      { externalForceN: Number.NaN },
    ];
    for (const patch of invalidInputs) {
      const solution = solveRod(rod(patch));
      expect(solution.issue).not.toBeNull();
      const state = rodStateAt(solution, 1);
      expect(Number.isFinite(state.xM)).toBe(true);
      expect(Number.isFinite(state.velocityMps)).toBe(true);
      expect(Number.isFinite(state.emfV)).toBe(true);
      expect(Number.isFinite(state.currentA)).toBe(true);
      expect(solution.samples.every((sample) => Number.isFinite(sample.xM) && Number.isFinite(sample.emfV))).toBe(true);
      expect(state.xM).toBeGreaterThanOrEqual(0);
    }
  });

  it('T19 finds the first left-end contact, stops there, and does not add contact loss to Joule heat', () => {
    const solution = solveRod(
      rod({
        mode: 'free-decay',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 1,
        initialSpeedMps: -2,
        massKg: 1,
      }),
    );
    expect(solution.boundaryTimeS).not.toBeNull();
    const boundaryTime = solution.boundaryTimeS!;
    expect(boundaryTime).toBeCloseTo(-Math.log(0.75) / 0.5, 10);
    const event = solution.events.find((item) => item.kind === 'boundary-stop');
    expect(event).toBeDefined();
    expect(event!.tS).toBeCloseTo(boundaryTime, 10);
    const atBoundary = rodStateAt(solution, boundaryTime);
    expect(atBoundary.xM).toBe(0);
    expect(atBoundary.velocityMps).toBe(0);
    expect(atBoundary.status).toBe('boundary-stop');
    expect(atBoundary.emfV).toBe(0);
    expect(atBoundary.energyResidualJ).toBeNull();
    const after = rodStateAt(solution, boundaryTime + 1);
    expect(after.xM).toBe(0);
    expect(after.jouleHeatJ).toBeCloseTo(atBoundary.jouleHeatJ ?? NaN, 12);
    expect(solution.samples.every((sample) => sample.xM >= 0)).toBe(true);
  });

  it('finds the first contact after a constant-force turnaround instead of an unrelated root', () => {
    const solution = solveRod(
      rod({
        mode: 'constant-force',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 1,
        initialSpeedMps: 2,
        massKg: 1,
        externalForceN: -1,
      }),
    );
    expect(solution.boundaryTimeS).not.toBeNull();
    const boundaryTime = solution.boundaryTimeS!;
    const before = rodStateAt(solution, boundaryTime - 1e-4);
    const atBoundary = rodStateAt(solution, boundaryTime);
    expect(before.xM).toBeGreaterThan(0);
    expect(before.velocityMps).toBeLessThan(0);
    expect(atBoundary.xM).toBeCloseTo(0, 10);
    expect(atBoundary.status).toBe('boundary-stop');
  });

  it('T20 analytic velocity derivative and position integral match the equation of motion', () => {
    const solution = solveRod(
      rod({
        mode: 'constant-force',
        BzTesla: 1,
        lengthM: 1,
        resistanceOhm: 2,
        startXM: 1,
        initialSpeedMps: 0.5,
        massKg: 1,
        externalForceN: 1,
      }),
    );
    const h = 1e-4;
    for (const time of [0.7, 1.7, 3]) {
      const state = rodStateAt(solution, time);
      const plus = rodStateAt(solution, time + h);
      const minus = rodStateAt(solution, time - h);
      const dvdt = (plus.velocityMps - minus.velocityMps) / (2 * h);
      const dxdt = (plus.xM - minus.xM) / (2 * h);
      expect(dvdt).toBeCloseTo((1 - solution.k * state.velocityMps) / 1, 6);
      expect(dxdt).toBeCloseTo(state.velocityMps, 6);
    }
  });

  it('keeps dΦ/dt = Bz L v and ε = −dΦ/dt for every mode at a common instant', () => {
    const modes = ['constant-speed', 'free-decay', 'constant-force'] as const;
    for (const mode of modes) {
      const solution = solveRod(
        rod({
          mode,
          BzTesla: 0.8,
          lengthM: 1.5,
          resistanceOhm: 2.5,
          startXM: 1,
          initialSpeedMps: 1.2,
          massKg: 1,
          externalForceN: 0.7,
        }),
      );
      const state = rodStateAt(solution, 1.1);
      expect(state.fluxRateWbPerS).toBeCloseTo(solution.params.BzTesla * solution.params.lengthM * state.velocityMps, 12);
      expect(state.emfV).toBeCloseTo(-state.fluxRateWbPerS, 12);
    }
  });

  it('clamps time to the valid interval and returns finite sampled charts', () => {
    const solution = solveRod(rod({ mode: 'free-decay', BzTesla: 1, lengthM: 1, resistanceOhm: 2, startXM: 1, initialSpeedMps: 2, massKg: 1 }));
    expect(rodStateAt(solution, -10).tS).toBe(0);
    expect(rodStateAt(solution, solution.durationS + 10).tS).toBeCloseTo(solution.durationS, 12);
    expect(solution.samples.length).toBeGreaterThan(100);
    expect(solution.samples.every((sample) => Number.isFinite(sample.xM) && Number.isFinite(sample.currentA))).toBe(true);
    expect(solution.keyTimesS[0]).toBe(0);
    expect(solution.keyTimesS[solution.keyTimesS.length - 1]).toBeCloseTo(solution.durationS, 12);
  });
});
