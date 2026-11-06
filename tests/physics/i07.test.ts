import { describe, expect, it } from 'vitest';
import {
  I07_DEFAULT,
  computeI07Snapshot,
  downsampleI07Samples,
  i07EdgeSum,
  i07OverlapLengths,
  i07WallLimit,
  solveI07,
  stateAtI07Time,
  validateI07Params,
  type I07Params,
  type I07Snapshot,
} from '../../src/physics/induction/oppositeFieldsWallLoop';
import { ManualWallLoopSession } from '../../src/physics/induction/manualWallLoopMotion';

const ZERO = { jouleHeatJ: 0, externalWorkJ: 0, impactLossJ: 0 };

function base(patch: Partial<I07Params> = {}): I07Params {
  return {
    ...I07_DEFAULT,
    mode: 'prescribed',
    turns: 1,
    heightM: 1,
    widthM: 1,
    massKg: 1,
    resistanceOhm: 1,
    circuitClosed: true,
    field1LeftM: 0,
    field1RightM: 1,
    field1Bz: 1,
    field2LeftM: 1,
    field2RightM: 2,
    field2Bz: -1,
    startXM: -0.5,
    initialSpeedMps: 2,
    externalForceN: 0,
    durationS: 2.5,
    wallEnabled: false,
    wallXM: 10,
    restitution: 1,
    ...patch,
  };
}

function snapshotAt(params: I07Params, x: number, v: number): I07Snapshot {
  return computeI07Snapshot(params, 0, x, v, ZERO);
}

function expectClose(actual: number | null | undefined, expected: number, tolerance = 1e-10): void {
  expect(actual).not.toBeNull();
  expect(actual).not.toBeUndefined();
  expect(Number.isFinite(actual as number)).toBe(true);
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(
    tolerance * Math.max(1, Math.abs(expected)),
  );
}

describe('I07 dual-region signed flux and edge events', () => {
  it('I7-01: entering B1 gives positive signed flux, S=+1, braking force', () => {
    const params = base();
    const snapshot = snapshotAt(params, -0.5, 2);
    expectClose(snapshot.overlap1M, 0.5);
    expectClose(snapshot.overlap2M, 0);
    expectClose(snapshot.fluxWb, 0.5);
    expectClose(snapshot.S, 1);
    expectClose(snapshot.emfV, -2);
    expectClose(snapshot.currentA, -2);
    expectClose(snapshot.magneticForceN, -2);
    expectClose(snapshot.joulePowerW, 4);
    expectClose(snapshot.magneticMechanicalPowerW, -4);
  });

  it('I7-02: flux cancels across the interface but both edges cut, S=-2 and emf=+4', () => {
    const params = base();
    const snapshot = snapshotAt(params, 0.5, 2);
    expectClose(snapshot.overlap1M, 0.5);
    expectClose(snapshot.overlap2M, 0.5);
    expectClose(snapshot.fluxWb, 0, 1e-12);
    expectClose(snapshot.S, -2);
    expectClose(snapshot.emfV, 4);
    expectClose(snapshot.currentA, 4);
    expectClose(snapshot.magneticForceN, -8);
    expectClose(snapshot.joulePowerW, 16);
  });

  it('I7-03: leaving into B2 keeps the signed sum correct', () => {
    const params = base();
    const snapshot = snapshotAt(params, 1.5, 2);
    expectClose(snapshot.overlap1M, 0);
    expectClose(snapshot.overlap2M, 0.5);
    expectClose(snapshot.fluxWb, -0.5);
    expectClose(snapshot.S, 1);
    expectClose(snapshot.emfV, -2);
    expectClose(snapshot.currentA, -2);
    expectClose(snapshot.magneticForceN, -2);
  });

  it('I7-04: a loop fully inside B1 has nonzero flux but zero motional emf', () => {
    const params = base({ widthM: 0.4, startXM: 0.3 });
    const snapshot = snapshotAt(params, 0.3, 2);
    expectClose(snapshot.fluxWb, 0.4);
    expectClose(snapshot.S, 0);
    expectClose(snapshot.emfV, 0);
    expectClose(snapshot.currentA, 0);
    expectClose(snapshot.magneticForceN, 0);
    expectClose(snapshot.joulePowerW, 0);
  });

  it('I7-06: reversing both fields reverses flux, emf and current but not force or heat', () => {
    const normal = snapshotAt(base(), -0.5, 2);
    const reversed = snapshotAt(base({ field1Bz: -1, field2Bz: 1 }), -0.5, 2);
    expectClose(reversed.fluxWb, -normal.fluxWb);
    expectClose(reversed.emfV, -normal.emfV);
    expectClose(reversed.currentA, -(normal.currentA ?? Number.NaN));
    expectClose(reversed.magneticForceN, normal.magneticForceN ?? Number.NaN);
    expectClose(reversed.joulePowerW, normal.joulePowerW ?? Number.NaN);
  });

  it('I7-07: open circuit keeps emf but zero current, force and Joule heat', () => {
    const params = base({ circuitClosed: false });
    const snapshot = snapshotAt(params, -0.5, 2);
    expectClose(snapshot.emfV, -2);
    expect(snapshot.currentA).toBe(0);
    expect(snapshot.magneticForceN).toBe(0);
    expect(snapshot.joulePowerW).toBe(0);
    expect(snapshot.eventFlags).toContain('open-circuit');
  });

  it('uses one-sided signed slope exactly on a boundary', () => {
    const params = base();
    const sum = i07EdgeSum(params, 0, 1);
    expect(sum.oneSided).toBe(true);
    expectClose(sum.S, -2);
    expectClose(sum.SLeft, 1);
    expectClose(sum.SRight, -2);
  });

  it('handles signed overlap in a gap between the two regions', () => {
    const params = base({
      field2LeftM: 1.5,
      field2RightM: 2.5,
      widthM: 1.2,
    });
    const snapshot = snapshotAt(params, 0.4, 1);
    expectClose(snapshot.overlap1M, 0.6);
    expectClose(snapshot.overlap2M, 0.1);
    expectClose(snapshot.fluxWb, 0.5);
    expectClose(snapshot.S, -2);
    expectClose(snapshot.emfV, 2);
    expectClose(snapshot.currentA, 2);
    expectClose(snapshot.magneticForceN, -4);
  });
});

describe('I07 analytic piecewise dynamics and wall events', () => {
  it('I7-05: free damping in the S=-2 interval follows the exponential solution', () => {
    const params = base({
      mode: 'free',
      startXM: 0.4,
      initialSpeedMps: 1,
      durationS: 1,
    });
    const solution = solveI07(params);
    const state = stateAtI07Time(solution, 0.5);
    const decay = Math.exp(-2);
    expectClose(state.velocityMps, decay, 1e-9);
    expectClose(state.xM, 0.4 + (1 - decay) / 4, 1e-9);
    expectClose(state.jouleHeatJ, 0.5 * (1 - Math.exp(-4)), 1e-9);
    expectClose(state.kineticEnergyJ + state.jouleHeatJ, 0.5, 1e-9);
    expectClose((state.magneticForceN ?? Number.NaN) * state.velocityMps, -(state.joulePowerW ?? 0), 1e-9);
  });

  it('I7-08: ideal wall bounce at xWall-w preserves kinetic energy and adds no heat', () => {
    const params = base({
      mode: 'free',
      widthM: 0.5,
      startXM: 1.5,
      initialSpeedMps: 1,
      field1Bz: 0,
      field2Bz: 0,
      wallEnabled: true,
      wallXM: 3,
      restitution: 1,
      durationS: 2.5,
    });
    const solution = solveI07(params);
    const bounce = solution.events.find((event) => event.kind === 'wall-bounce');
    expect(bounce).toBeDefined();
    expectClose(bounce?.timeS, 1, 1e-9);
    expectClose(bounce?.xM, 2.5, 1e-9);
    expectClose(bounce?.velocityBeforeMps, 1, 1e-9);
    expectClose(bounce?.velocityAfterMps, -1, 1e-9);
    expectClose(bounce?.impactLossJ, 0, 1e-12);
    expectClose(solution.totalImpactLossJ, 0, 1e-12);
    expectClose(solution.final.xM, 1, 1e-9);
    expectClose(solution.final.velocityMps, -1, 1e-9);
    expectClose(solution.final.jouleHeatJ, 0, 1e-12);
    expectClose(i07WallLimit(params), 2.5);
  });

  it('I7-09: restitution 0.5 books impact loss separately from Joule heat', () => {
    const params = base({
      mode: 'free',
      widthM: 0.5,
      startXM: 1.5,
      initialSpeedMps: 1,
      field1Bz: 0,
      field2Bz: 0,
      wallEnabled: true,
      wallXM: 3,
      restitution: 0.5,
      durationS: 2.5,
    });
    const solution = solveI07(params);
    const bounce = solution.events.find((event) => event.kind === 'wall-bounce');
    expectClose(bounce?.velocityAfterMps, -0.5, 1e-9);
    expectClose(bounce?.impactLossJ, 0.375, 1e-10);
    expectClose(solution.totalImpactLossJ, 0.375, 1e-10);
    expectClose(solution.final.jouleHeatJ, 0, 1e-12);
    expectClose(solution.final.kineticEnergyJ + solution.final.jouleHeatJ + solution.final.impactLossJ, 0.5, 1e-9);
  });

  it('I7-13: a driven loop can bounce repeatedly without penetrating the wall', () => {
    const params = base({
      mode: 'forces',
      widthM: 0.5,
      startXM: 2,
      initialSpeedMps: 1,
      externalForceN: 1,
      field1Bz: 0,
      field2Bz: 0,
      wallEnabled: true,
      wallXM: 3,
      restitution: 1,
      durationS: 4,
    });
    const solution = solveI07(params);
    const bounces = solution.events.filter((event) => event.kind === 'wall-bounce');
    expect(bounces.length).toBeGreaterThanOrEqual(2);
    expectClose(bounces[0].timeS, Math.SQRT2 - 1, 1e-8);
    expectClose(bounces[1].timeS, 3 * Math.SQRT2 - 1, 1e-8);
    const limit = i07WallLimit(params) ?? Number.NaN;
    for (const event of bounces) {
      expect(limit - event.xM).toBeLessThanOrEqual(1e-9);
    }
    for (const sample of solution.samples) {
      expect(limit - sample.xM).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('starts exactly on a boundary and moves with the one-sided slope', () => {
    const params = base({ startXM: 0, initialSpeedMps: 1, durationS: 1 });
    const solution = solveI07(params);
    const state = stateAtI07Time(solution, 0.25);
    expectClose(state.S, -2, 1e-9);
    expect(state.xM).toBeGreaterThan(0);
    expect(Number.isFinite(state.emfV)).toBe(true);
  });

  it('bounces once at t=0 when starting exactly against the wall', () => {
    const params = base({
      mode: 'free',
      widthM: 0.5,
      startXM: 2.5,
      initialSpeedMps: 1,
      field1Bz: 0,
      field2Bz: 0,
      wallEnabled: true,
      wallXM: 3,
      restitution: 1,
      durationS: 1,
    });
    const solution = solveI07(params);
    const bounce = solution.events.find((event) => event.kind === 'wall-bounce');
    expect(bounce).toBeDefined();
    expectClose(bounce?.timeS, 0, 1e-9);
    expectClose(solution.final.velocityMps, -1, 1e-9);
    expect(solution.events.filter((event) => event.kind === 'wall-bounce').length).toBe(1);
  });

  it('prescribed motion stops at the wall instead of faking a bounce', () => {
    const params = base({
      mode: 'prescribed',
      widthM: 0.5,
      startXM: 2,
      initialSpeedMps: 1,
      field1Bz: 0,
      field2Bz: 0,
      wallEnabled: true,
      wallXM: 3,
      durationS: 3,
    });
    const solution = solveI07(params);
    expect(solution.status).toBe('wall-stop');
    expectClose(solution.final.xM, 2.5, 1e-9);
    expect(solution.events.some((event) => event.kind === 'wall-stop')).toBe(true);
    expect(solution.events.some((event) => event.kind === 'wall-bounce')).toBe(false);
  });

  it('holds at the wall when a constant force presses inward after an inelastic stop', () => {
    const params = base({
      mode: 'forces',
      widthM: 0.5,
      startXM: 2.4,
      initialSpeedMps: 0.5,
      externalForceN: 1,
      field1Bz: 0,
      field2Bz: 0,
      wallEnabled: true,
      wallXM: 3,
      restitution: 0,
      durationS: 2,
    });
    const solution = solveI07(params);
    expect(solution.status).toBe('wall-held');
    expect(solution.events.some((event) => event.kind === 'wall-held')).toBe(true);
    expectClose(solution.final.xM, 2.5, 1e-9);
    expectClose(solution.final.velocityMps, 0, 1e-12);
  });

  it('keeps the energy ledger closed for a driven damped trajectory', () => {
    const params = base({
      mode: 'forces',
      startXM: 0.4,
      initialSpeedMps: 1,
      externalForceN: 0.5,
      durationS: 2,
    });
    const solution = solveI07(params);
    expectClose(solution.final.energyResidualJ, 0, 1e-9);
    expect(solution.final.jouleHeatJ).toBeGreaterThan(0);
    expectClose(solution.final.kineticEnergyJ - 0.5 + solution.final.jouleHeatJ, solution.final.externalWorkJ, 1e-9);
  });

  it('keeps |F_B v| = I^2 R for static fields in every sample', () => {
    const params = base({ mode: 'forces', startXM: 0.4, initialSpeedMps: 1, externalForceN: 0.2, durationS: 2 });
    const solution = solveI07(params);
    for (const sample of solution.samples) {
      if (sample.currentA === null) continue;
      expect(Math.abs((sample.magneticForceN ?? Number.NaN) * sample.velocityMps + (sample.joulePowerW ?? Number.NaN))).toBeLessThan(1e-8);
    }
  });

  it('agrees with a finite-difference derivative of x', () => {
    const params = base({ mode: 'free', startXM: 0.4, initialSpeedMps: 1, durationS: 1 });
    const solution = solveI07(params);
    const h = 1e-6;
    const left = stateAtI07Time(solution, 0.3 - h).xM;
    const right = stateAtI07Time(solution, 0.3 + h).xM;
    const numeric = (right - left) / (2 * h);
    expectClose(numeric, stateAtI07Time(solution, 0.3).velocityMps, 1e-6);
  });

  it('keeps events independent of display downsampling', () => {
    const solution = solveI07(base({ mode: 'free', startXM: 0.4, initialSpeedMps: 1, durationS: 2 }));
    const eventsBefore = solution.events.map((event) => `${event.kind}@${event.timeS.toFixed(9)}`);
    downsampleI07Samples(solution.samples, 10);
    const eventsAfter = solution.events.map((event) => `${event.kind}@${event.timeS.toFixed(9)}`);
    expect(eventsAfter).toEqual(eventsBefore);
    expect(solution.events.every((event, index) => index === 0 || event.timeS >= solution.events[index - 1].timeS - 1e-12)).toBe(true);
  });

  it('reduces to the single-strip geometry when B2=0', () => {
    const params = base({ field2Bz: 0, widthM: 1 });
    const snapshot = snapshotAt(params, -0.5, 2);
    expectClose(snapshot.S, i07EdgeSum({ ...params, field2Bz: 0 }, -0.5, 2).S);
    const lengths = i07OverlapLengths(params, -0.5);
    expectClose(lengths[0], 0.5);
    expectClose(lengths[1], 0);
    expectClose(snapshot.fluxWb, 0.5);
  });

  it('rejects invalid geometry, mass, resistance, turns and non-finite values', () => {
    expect(validateI07Params(base({ widthM: 0 })).valid).toBe(false);
    expect(validateI07Params(base({ massKg: 0 })).valid).toBe(false);
    expect(validateI07Params(base({ resistanceOhm: 0 })).valid).toBe(false);
    expect(validateI07Params(base({ turns: 1.5 })).valid).toBe(false);
    expect(validateI07Params(base({ field1RightM: 1.5, field2LeftM: 1 })).valid).toBe(false);
    expect(validateI07Params(base({ restitution: 1.2 })).valid).toBe(false);
    expect(validateI07Params(base({ initialSpeedMps: Number.NaN })).valid).toBe(false);
    expect(validateI07Params(base({ startXM: 3, wallEnabled: true, wallXM: 3 })).valid).toBe(false);
    expect(validateI07Params(base({ wallEnabled: true, wallXM: 0.2 })).valid).toBe(false);
    expect(validateI07Params(base()).valid).toBe(true);
  });
});

describe('I07 manual push/pull session', () => {
  it('estimates velocity from timestamps, integrates heat and never penetrates the wall', () => {
    const params = base({
      mode: 'manual-x',
      startXM: 0.4,
      widthM: 0.5,
      wallEnabled: true,
      wallXM: 1.1,
      durationS: 8,
    });
    const session = new ManualWallLoopSession(params);
    session.reset(0, 0.4);
    session.beginDrag(0, 0.4);
    session.record(0.1, 0.45);
    const moving = session.record(0.2, 0.5);
    expect(moving.velocityMps).toBeGreaterThan(0);
    expect(moving.currentA).not.toBeNull();
    expect(moving.jouleHeatJ).toBeGreaterThan(0);
    const clamped = session.record(0.3, 1.4);
    expect(clamped.xM).toBeLessThanOrEqual(0.6 + 1e-9);
    const heatBeforeRelease = clamped.jouleHeatJ;
    const released = session.endDrag(0.4);
    expect(released.velocityMps).toBe(0);
    expect(released.jouleHeatJ).toBeGreaterThanOrEqual(heatBeforeRelease - 1e-12);
    expect(session.getHistory().length).toBeGreaterThan(1);
  });

  it('cancels a second-finger gesture without a velocity spike', () => {
    const params = base({ mode: 'manual-x', startXM: 0.4, durationS: 8 });
    const session = new ManualWallLoopSession(params);
    session.reset(0, 0.4);
    session.beginDrag(0, 0.4);
    session.record(0.1, 0.5);
    const cancelled = session.cancel(0.2);
    expect(cancelled.velocityMps).toBe(0);
    expect(cancelled.jouleHeatJ).toBeGreaterThanOrEqual(0);
  });
});
