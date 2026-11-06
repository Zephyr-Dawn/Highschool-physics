import { describe, expect, it } from 'vitest';
import {
  computeI05Snapshot,
  i05FieldAt,
  validateI05Params,
  type I05FieldPoint,
  type I05Params,
} from '../../src/physics/induction/movingLoopTimeField';
import {
  solveI05,
  stateAtI05Time,
} from '../../src/physics/induction/movingLoopSolver';
import {
  applyManualTarget,
  createManualTimeline,
  type WaveformConfig,
} from '../../src/physics/induction/timeVaryingField';

const constantWave = (b0: number, durationS = 2): WaveformConfig => ({
  kind: 'constant',
  durationS,
  b0Tesla: b0,
  slopeTeslaPerS: 0,
  amplitudeTesla: 0,
  frequencyHz: 1,
  phaseRad: 0,
  riseS: 0.5,
  topS: 0.5,
  fallS: 0.5,
  bottomS: 0.5,
});

const linearWave = (b0: number, slope: number, durationS = 2): WaveformConfig => ({
  ...constantWave(b0, durationS),
  kind: 'linear',
  slopeTeslaPerS: slope,
});

function baseParams(patch: Partial<I05Params> = {}): I05Params {
  return {
    mode: 'prescribed',
    turns: 1,
    heightM: 1,
    widthM: 1,
    massKg: 1,
    resistanceOhm: 2,
    circuitClosed: true,
    fieldLeftM: 0,
    fieldRightM: 3,
    startXM: -1,
    initialSpeedMps: 1,
    externalForceN: 0,
    durationS: 2,
    waveform: constantWave(2),
    manualStartBzTesla: 2,
    ...patch,
  };
}

function field(bzTesla: number, dbdt: number | null): I05FieldPoint {
  return {
    bzTesla,
    dbdt,
    dbdtLeft: dbdt,
    dbdtRight: dbdt,
    atKink: false,
    eventLabel: null,
  };
}

function snapshotAt(params: I05Params, x: number, v: number, bz: number, dbdt: number | null, cumulative = { jouleHeatJ: 0, externalWorkJ: 0, transformerSourceWorkJ: 0 }) {
  return computeI05Snapshot(params, 0, x, v, field(bz, dbdt), cumulative);
}

describe('I05 anchor A: static field, entering loop', () => {
  it('matches motional EMF, current, force, Joule power and mechanical power', () => {
    const params = baseParams({ durationS: 1 });
    const snapshot = snapshotAt(params, -0.5, 1, 2, 0);
    expect(snapshot.overlapLengthM).toBeCloseTo(0.5, 12);
    expect(snapshot.overlapSlope).toBe(1);
    expect(snapshot.fluxWb).toBeCloseTo(1, 12);
    expect(snapshot.emfTransformerV).toBeCloseTo(0, 12);
    expect(snapshot.emfMotionalV).toBeCloseTo(-2, 12);
    expect(snapshot.emfTotalV).toBeCloseTo(-2, 12);
    expect(snapshot.currentA).toBeCloseTo(-1, 12);
    expect(snapshot.joulePowerW).toBeCloseTo(2, 12);
    expect(snapshot.magneticForceX).toBeCloseTo(-2, 12);
    expect(snapshot.magneticMechanicalPowerW).toBeCloseTo(-2, 12);
    expect(snapshot.transformerSourcePowerW).toBeCloseTo(0, 12);
  });
});

describe('I05 anchor B: moving loop + changing field', () => {
  it('matches the exact snapshot at t=0.5 and the instantaneous power balance', () => {
    const params = baseParams({
      mode: 'prescribed',
      startXM: -1,
      initialSpeedMps: 1,
      durationS: 1,
      waveform: linearWave(2, 1, 1),
    });
    const solution = solveI05(params);
    const snapshot = stateAtI05Time(solution, 0.5);
    expect(snapshot.Bz).toBeCloseTo(2.5, 12);
    expect(snapshot.dBzDt).toBeCloseTo(1, 12);
    expect(snapshot.overlapLengthM).toBeCloseTo(0.5, 12);
    expect(snapshot.overlapSlope).toBe(1);
    expect(snapshot.fluxWb).toBeCloseTo(1.25, 12);
    expect(snapshot.emfTransformerV).toBeCloseTo(-0.5, 12);
    expect(snapshot.emfMotionalV).toBeCloseTo(-2.5, 12);
    expect(snapshot.emfTotalV).toBeCloseTo(-3, 12);
    expect(snapshot.currentA).toBeCloseTo(-1.5, 12);
    expect(snapshot.magneticForceX).toBeCloseTo(-3.75, 12);
    expect(snapshot.joulePowerW).toBeCloseTo(4.5, 12);
    expect(snapshot.magneticMechanicalPowerW).toBeCloseTo(-3.75, 12);
    expect(snapshot.transformerSourcePowerW).toBeCloseTo(0.75, 12);
    expect(snapshot.externalForceRequiredN).toBeCloseTo(3.75, 12);
    expect(snapshot.externalPowerW).toBeCloseTo(3.75, 12);
    expect(snapshot.externalPowerW! + snapshot.transformerSourcePowerW!).toBeCloseTo(4.5, 12);
    expect(Math.abs(snapshot.energyResidualJ ?? Number.NaN)).toBeLessThan(2e-6);
  });
});

describe('I05 anchor C: exact cancellation', () => {
  it('has nonzero EMF contributions but zero total EMF, current and force', () => {
    const params = baseParams({
      mode: 'prescribed',
      startXM: 0,
      initialSpeedMps: -0.25,
      durationS: 2,
      waveform: linearWave(0, 1, 2),
    });
    const solution = solveI05(params);
    const snapshot = stateAtI05Time(solution, 2);
    expect(snapshot.overlapLengthM).toBeCloseTo(0.5, 12);
    expect(snapshot.overlapSlope).toBe(1);
    expect(snapshot.Bz).toBeCloseTo(2, 12);
    expect(snapshot.dBzDt).toBeCloseTo(1, 12);
    expect(snapshot.emfTransformerV).toBeCloseTo(-0.5, 12);
    expect(snapshot.emfMotionalV).toBeCloseTo(0.5, 12);
    expect(snapshot.emfTotalV).toBeCloseTo(0, 12);
    expect(snapshot.currentA).toBeCloseTo(0, 12);
    expect(snapshot.magneticForceX).toBeCloseTo(0, 12);
    expect(snapshot.joulePowerW).toBeCloseTo(0, 12);
    expect(snapshot.eventFlags).toContain('emf-cancellation');
  });
});

describe('I05 anchor D: loop fully inside the strip', () => {
  it('has transformer current but zero motional EMF and zero x magnetic force', () => {
    const params = baseParams({ mode: 'prescribed', startXM: 0.5, initialSpeedMps: 0, durationS: 2, waveform: linearWave(1, 1, 2) });
    const solution = solveI05(params);
    const snapshot = stateAtI05Time(solution, 1);
    expect(snapshot.overlapLengthM).toBeCloseTo(1, 12);
    expect(snapshot.overlapSlope).toBe(0);
    expect(snapshot.emfTransformerV).toBeCloseTo(-1, 12);
    expect(snapshot.emfMotionalV).toBeCloseTo(0, 12);
    expect(snapshot.currentA).toBeCloseTo(-0.5, 12);
    expect(snapshot.magneticForceX).toBeCloseTo(0, 12);
    expect(snapshot.joulePowerW).toBeCloseTo(0.5, 12);
    expect(snapshot.transformerSourcePowerW).toBeCloseTo(0.5, 12);
    expect(snapshot.kineticEnergyJ).toBe(0);
    expect(Math.abs(snapshot.energyResidualJ ?? Number.NaN)).toBeLessThan(1e-6);
  });
});

describe('I05 anchor E: exit reverses motional current', () => {
  it('has g=-1 and positive motional EMF/current with a leftward force', () => {
    const params = baseParams({ mode: 'prescribed', startXM: 2.5, initialSpeedMps: 1, durationS: 1 });
    const snapshot = snapshotAt(params, 2.5, 1, 2, 0);
    expect(snapshot.overlapSlope).toBe(-1);
    expect(snapshot.overlapLengthM).toBeCloseTo(0.5, 12);
    expect(snapshot.emfMotionalV).toBeCloseTo(2, 12);
    expect(snapshot.currentA).toBeCloseTo(1, 12);
    expect(snapshot.magneticForceX).toBeCloseTo(-2, 12);
    expect(snapshot.joulePowerW).toBeCloseTo(2, 12);
  });
});

describe('I05 anchor F: static-B free damping exact reference', () => {
  it('matches exp(-2t) velocity, position, K, Q and energy residual', () => {
    const params = baseParams({
      mode: 'dynamic',
      startXM: -0.5,
      initialSpeedMps: 1,
      durationS: 1,
      waveform: constantWave(2, 1),
    });
    const solution = solveI05(params);
    expect(solution.status).toBe('ok');
    const snapshot = stateAtI05Time(solution, 0.5);
    const decay = Math.exp(-1);
    expect(snapshot.velocityMps).toBeCloseTo(decay, 6);
    expect(snapshot.xM).toBeCloseTo(-0.5 + (1 - decay) / 2, 6);
    expect(snapshot.kineticEnergyJ).toBeCloseTo(0.5 * decay * decay, 6);
    expect(snapshot.jouleHeatJ).toBeCloseTo(0.5 * (1 - decay * decay), 6);
    expect(snapshot.externalWorkJ).toBeCloseTo(0, 8);
    expect(snapshot.transformerSourceWorkJ).toBeCloseTo(0, 8);
    expect(Math.abs(snapshot.energyResidualJ ?? Number.NaN)).toBeLessThan(2e-6);
  });
});

describe('I05 additional invariants', () => {
  it('open circuit preserves EMF but sets current, force, Joule heat and Q_J to zero', () => {
    const params = baseParams({ circuitClosed: false, durationS: 1 });
    const solution = solveI05(params);
    const snapshot = stateAtI05Time(solution, 0.5);
    expect(snapshot.emfTotalV).toBeCloseTo(-2, 10);
    expect(snapshot.currentA).toBe(0);
    expect(snapshot.magneticForceX).toBe(0);
    expect(snapshot.joulePowerW).toBe(0);
    expect(snapshot.jouleHeatJ).toBe(0);
    expect(snapshot.velocityMps).toBeCloseTo(1, 8);
    expect(snapshot.xM).toBeCloseTo(-0.5, 8);
  });

  it('B=0 with Bdot!=0 yields transformer EMF and finite current but zero magnetic force', () => {
    const params = baseParams({ mode: 'prescribed', startXM: -0.5, initialSpeedMps: 0, durationS: 1, waveform: linearWave(0, 1, 1) });
    const solution = solveI05(params);
    const snapshot = stateAtI05Time(solution, 0);
    expect(snapshot.Bz).toBeCloseTo(0, 10);
    expect(snapshot.emfTransformerV).toBeCloseTo(-0.5, 10);
    expect(snapshot.emfMotionalV).toBeCloseTo(0, 10);
    expect(snapshot.currentA).toBeCloseTo(-0.25, 10);
    expect(snapshot.magneticForceX).toBeCloseTo(0, 10);
  });

  it('N scaling: EMFs/I linear, F_Bx and P_J quadratic with N', () => {
    const one = snapshotAt(baseParams({ turns: 1 }), -0.5, 1, 2, 1);
    const two = snapshotAt(baseParams({ turns: 2 }), -0.5, 1, 2, 1);
    expect(two.emfTransformerV!).toBeCloseTo(2 * one.emfTransformerV!, 10);
    expect(two.emfMotionalV!).toBeCloseTo(2 * one.emfMotionalV!, 10);
    expect(two.currentA!).toBeCloseTo(2 * one.currentA!, 10);
    expect(two.magneticForceX!).toBeCloseTo(4 * one.magneticForceX!, 10);
    expect(two.joulePowerW!).toBeCloseTo(4 * one.joulePowerW!, 10);
  });

  it('handles w > strip width and zero-overlap cases', () => {
    const wide = baseParams({ widthM: 5, startXM: -1, initialSpeedMps: 1, durationS: 1 });
    const snapshot = snapshotAt(wide, -1, 1, 2, 0);
    expect(snapshot.overlapLengthM).toBeCloseTo(3, 12);
    expect(snapshot.overlapSlope).toBe(0);
    expect(snapshot.emfMotionalV).toBeCloseTo(0, 12);
    const outside = snapshotAt(wide, -8, 1, 2, 0);
    expect(outside.overlapLengthM).toBeCloseTo(0, 12);
    expect(outside.fluxWb).toBeCloseTo(0, 12);
    expect(outside.emfTotalV).toBeCloseTo(0, 12);
  });

  it('handles a one-sided boundary slope without dividing by zero or fabricating a unique derivative', () => {
    const params = baseParams({ startXM: -1, initialSpeedMps: 1 });
    const snapshot = computeI05Snapshot(
      params,
      0,
      -1,
      1,
      field(2, 0),
      { jouleHeatJ: 0, externalWorkJ: 0, transformerSourceWorkJ: 0 },
    );
    expect(snapshot.overlapSlope).toBe(1);
    expect(snapshot.slopeOneSided).toBe(true);
    expect(Number.isFinite(snapshot.emfMotionalV ?? Number.NaN)).toBe(true);
  });

  it('records geometry events at exact prescribed threshold times', () => {
    const params = baseParams({ startXM: -1, initialSpeedMps: 1, durationS: 4 });
    const solution = solveI05(params);
    const times = solution.events.filter((event) => event.kind === 'geometry').map((event) => event.timeS);
    expect(times).toContain(1);
    expect(times).toContain(3);
    expect(solution.events.every((event) => Number.isFinite(event.timeS))).toBe(true);
  });

  it('accepts a manual B target through the existing 0.4 s / 4 T/s ramp while the loop responds', () => {
    const timeline = createManualTimeline(2, { rampSeconds: 0.4, maxAbsRateTeslaPerS: 4 });
    const target = applyManualTarget(timeline, 0, 5);
    const params = baseParams({
      mode: 'manual-b',
      startXM: -0.5,
      initialSpeedMps: 0,
      durationS: 1,
      waveform: constantWave(2, 1),
    });
    const solution = solveI05(params, { kind: 'manual', timeline: target.timeline });
    const before = i05FieldAt({ kind: 'manual', timeline: target.timeline }, 0.2);
    const after = i05FieldAt({ kind: 'manual', timeline: target.timeline }, 0.4);
    expect(before.bzTesla).toBeCloseTo(2.8, 10);
    expect(after.bzTesla).toBeCloseTo(3.6, 10);
    const snapshot = stateAtI05Time(solution, 0.2);
    expect(snapshot.Bz).toBeCloseTo(2.8, 10);
    expect(snapshot.emfTransformerV).not.toBeNull();
    expect(snapshot.currentA).not.toBeNull();
  });

  it('rejects invalid geometry, mass, resistance, turns and non-finite inputs', () => {
    for (const patch of [
      { widthM: 0 },
      { heightM: 0 },
      { massKg: 0 },
      { resistanceOhm: 0 },
      { fieldRightM: 0, fieldLeftM: 0 },
      { turns: 1.5 },
      { startXM: Number.NaN },
      { initialSpeedMps: Number.POSITIVE_INFINITY },
    ]) {
      const validation = validateI05Params(baseParams(patch));
      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(solveI05(baseParams(patch)).status).toBe('invalid');
    }
  });
});

describe('I05 dynamic external force, open circuit and field knots', () => {
  it('matches the forced first-order damping v(t)=0.5+0.5e^(-2t)', () => {
    const params = baseParams({
      mode: 'dynamic',
      startXM: -0.5,
      initialSpeedMps: 1,
      externalForceN: 1,
      durationS: 0.6,
      waveform: constantWave(2, 0.6),
    });
    const solution = solveI05(params);
    for (const t of [0.2, 0.4, 0.5]) {
      const snapshot = stateAtI05Time(solution, t);
      expect(snapshot.velocityMps).toBeCloseTo(0.5 + 0.5 * Math.exp(-2 * t), 5);
      expect(Math.abs(snapshot.energyResidualJ ?? Number.NaN)).toBeLessThan(2e-5);
    }
  });

  it('open circuit under a constant external force is pure constant acceleration with no heat', () => {
    const params = baseParams({
      mode: 'dynamic',
      circuitClosed: false,
      startXM: -0.5,
      initialSpeedMps: 0,
      externalForceN: 0.5,
      durationS: 2,
    });
    const solution = solveI05(params);
    const snapshot = stateAtI05Time(solution, 2);
    expect(snapshot.velocityMps).toBeCloseTo(1, 8);
    expect(snapshot.xM).toBeCloseTo(0.5, 8);
    expect(snapshot.jouleHeatJ).toBeCloseTo(0, 10);
    expect(snapshot.currentA).toBe(0);
    expect(Math.abs(snapshot.energyResidualJ ?? Number.NaN)).toBeLessThan(1e-8);
  });

  it('uses one-sided field derivatives at a triangle-wave knot', () => {
    const waveform: WaveformConfig = {
      ...constantWave(0, 2),
      kind: 'triangle',
      amplitudeTesla: 1,
      riseS: 0.5,
      topS: 0.5,
      fallS: 0.5,
      bottomS: 0.5,
    };
    const params = baseParams({
      mode: 'prescribed',
      startXM: -0.5,
      initialSpeedMps: 0,
      durationS: 1.5,
      waveform,
    });
    const solution = solveI05(params);
    const knot = stateAtI05Time(solution, 0.5);
    expect(knot.dBzDt).toBeNull();
    expect(knot.emfTransformerV).toBeNull();
    expect(knot.currentA).toBeNull();
    expect(knot.dBzDtLeft).not.toBeNull();
    expect(knot.dBzDtRight).not.toBeNull();
    expect(knot.dBzDtLeft).not.toBeCloseTo(knot.dBzDtRight ?? 0, 3);
  });

  it('records geometry events during a dynamic crossing', () => {
    const params = baseParams({
      mode: 'dynamic',
      startXM: -1,
      initialSpeedMps: 2,
      durationS: 2,
      waveform: constantWave(0.2, 2),
    });
    const solution = solveI05(params);
    const events = solution.events.filter((event) => event.kind === 'geometry');
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].timeS).toBeCloseTo(0.5, 2);
    expect(events[1].timeS).toBeCloseTo(1.0, 1);
    expect(solution.samples.every((sample) => Number.isFinite(sample.xM) && Number.isFinite(sample.velocityMps))).toBe(true);
  });
});

describe('I05 manual-x gesture session', () => {
  it('estimates signed velocity, current and heat without claiming exact external work', async () => {
    const { ManualLoopSession } = await import('../../src/physics/induction/manualLoopMotion');
    const params = baseParams({
      mode: 'manual-x',
      startXM: -0.5,
      initialSpeedMps: 0,
      durationS: 4,
      waveform: constantWave(2, 4),
    });
    const source = { kind: 'waveform' as const, waveform: params.waveform };
    const session = new ManualLoopSession(params, source);
    session.reset(0, -0.5);
    session.beginDrag(0, -0.5);
    session.record(0.05, -0.45);
    const moving = session.record(0.1, -0.4);
    expect(moving.velocityMps).toBeGreaterThan(0);
    expect(moving.currentA).toBeLessThan(0);
    expect(moving.magneticForceX).toBeLessThan(0);
    expect(moving.jouleHeatJ).toBeGreaterThan(0);
    expect(moving.externalWorkJ).toBe(0);
    expect(moving.energyResidualJ).toBeNull();
    expect(moving.externalForceRequiredN).toBeNull();

    const still = session.record(0.6, -0.4);
    expect(Math.abs(still.velocityMps)).toBeLessThan(1e-9);
    expect(Math.abs(still.currentA ?? Number.NaN)).toBeLessThan(1e-9);
    expect(still.joulePowerW).toBeCloseTo(0, 12);
    expect(session.cancel(0.7).velocityMps).toBe(0);
    expect(session.getHistory().length).toBeGreaterThan(2);
  });
});
