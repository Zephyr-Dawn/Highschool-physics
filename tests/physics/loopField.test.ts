import { describe, expect, it } from 'vitest';
import {
  computeLoopSnapshot,
  currentDirection,
  DEFAULT_LOOP_PARAMS,
  formatCurrentDirection,
  simulateLoop,
  stateAtTime,
  type LoopFieldParams,
} from '../../src/physics/induction/loopField';

function params(overrides: Partial<LoopFieldParams> = {}): LoopFieldParams {
  return { ...DEFAULT_LOOP_PARAMS, ...overrides };
}

function sampleFinite(sim: ReturnType<typeof simulateLoop>) {
  for (const s of sim.samples) {
    for (const key of [
      'tS',
      'xM',
      'velocityMps',
      'overlapWidthM',
      'overlapAreaM2',
      'fluxWb',
      'fluxRateWbPerS',
      'emfV',
      'currentA',
      'forceXN',
    ] as const) {
      expect(Number.isFinite(s[key]), `${key} at t=${s.tS}`).toBe(true);
    }
  }
}

describe('I03 rectangular loop crossing a magnetic strip', () => {
  it('computes overlap area and signed flux for a partially entered loop', () => {
    const p = params();
    // Loop spans x ∈ [0, 0.3], field spans [0.2, 0.7] → overlap width 0.1 m.
    const s = computeLoopSnapshot(p, 0, 1.5);
    expect(s.overlapWidthM).toBeCloseTo(0.1, 12);
    expect(s.overlapAreaM2).toBeCloseTo(0.1 * 0.2, 12);
    expect(s.fluxWb).toBeCloseTo(1 * 0.02, 12);
    expect(s.phase).toBe('entering');
    expect(s.emfV).toBeCloseTo(-1 * 0.2 * 1.5, 12);
    expect(s.currentA).toBeCloseTo(s.emfV / 0.5, 12);
    expect(s.forceXN).toBeLessThan(0);
  });

  it('uses signed flux: reversing B reverses Φ, ε and I but the drag force still opposes motion', () => {
    const positive = computeLoopSnapshot(params(), 0, 1.5);
    const negative = computeLoopSnapshot(params({ BzTesla: -1 }), 0, 1.5);
    expect(positive.fluxWb).toBeGreaterThan(0);
    expect(negative.fluxWb).toBeLessThan(0);
    expect(negative.emfV).toBeGreaterThan(0);
    expect(negative.currentA).toBeGreaterThan(0);
    expect(positive.forceXN).toBeLessThan(0);
    expect(negative.forceXN).toBeLessThan(0);
    expect(currentDirection(negative.currentA)).toBe('counterclockwise');
    expect(formatCurrentDirection(positive.currentA)).toContain('顺时针');
  });

  it('matches the motional EMF magnitude B·H·v and the drag force B²H²v/R while entering', () => {
    const p = params();
    const v = 1.5;
    const s = computeLoopSnapshot(p, 0, v);
    expect(Math.abs(s.emfV)).toBeCloseTo(p.BzTesla * p.loopHeightM * v, 12);
    expect(Math.abs(s.forceXN)).toBeCloseTo(
      (p.BzTesla * p.BzTesla * p.loopHeightM * p.loopHeightM * v) / p.resistanceOhm,
      12,
    );
  });

  it('has zero total EMF, current and net force when the loop is fully inside and moving uniformly', () => {
    const p = params();
    const s = computeLoopSnapshot(p, 0.3, 1.5);
    expect(s.phase).toBe('inside');
    expect(s.fluxWb).toBeCloseTo(1 * 0.3 * 0.2, 12);
    expect(s.fluxRateWbPerS).toBe(0);
    expect(s.emfV).toBe(0);
    expect(s.currentA).toBe(0);
    expect(s.forceXN).toBe(0);
  });

  it('runs entering → inside → leaving → after with the correct EMF signs and opposing force', () => {
    const sim = simulateLoop(params());
    sampleFinite(sim);
    const phases = new Set(sim.samples.map((s) => s.phase));
    expect(phases.has('entering')).toBe(true);
    expect(phases.has('inside')).toBe(true);
    expect(phases.has('leaving')).toBe(true);
    expect(phases.has('after')).toBe(true);

    const entering = sim.samples.find((s) => s.phase === 'entering' && s.overlapWidthM > 0.02);
    const inside = sim.samples.find((s) => s.phase === 'inside');
    const leaving = sim.samples.find((s) => s.phase === 'leaving' && s.overlapWidthM > 0.02);
    expect(entering!.emfV).toBeLessThan(0);
    expect(inside!.emfV).toBeCloseTo(0, 10);
    expect(leaving!.emfV).toBeGreaterThan(0);

    for (const s of sim.samples) {
      expect(s.forceXN).toBeLessThanOrEqual(1e-12);
    }

    expect(sim.events.map((e) => e.phase)).toEqual(['entering', 'inside', 'leaving', 'after']);
    expect(sim.events.every((event, index) => index === 0 || event.tS >= sim.events[index - 1].tS)).toBe(true);
  });

  it('reports a signed flux change and event keyframes across the strip', () => {
    const sim = simulateLoop(params());
    expect(sim.durationS).toBeGreaterThan(0);
    expect(sim.keyTimesS[0]).toBe(0);
    expect(sim.events.length).toBeGreaterThanOrEqual(4);
    for (const event of sim.events) {
      expect(event.tS).toBeGreaterThanOrEqual(0);
      expect(event.tS).toBeLessThanOrEqual(sim.durationS + 1e-9);
    }
    const midBefore = stateAtTime(sim, sim.durationS * 0.25);
    const midAfter = stateAtTime(sim, sim.durationS * 0.75);
    expect(midBefore.fluxWb).toBeGreaterThanOrEqual(0);
    expect(midAfter.fluxWb).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(stateAtTime(sim, -1).tS)).toBe(true);
    expect(stateAtTime(sim, -1).tS).toBe(0);
    expect(stateAtTime(sim, sim.durationS + 100).tS).toBeCloseTo(sim.durationS, 9);
  });

  it('uniform traversal dissipates exactly the expected Joule heat for constant speed', () => {
    const p = params();
    const sim = simulateLoop(p);
    // Entering and leaving each last Δx = loop width, with F = B²H²v/R.
    const expectedHeat =
      2 * ((p.BzTesla * p.BzTesla * p.loopHeightM * p.loopHeightM * p.initialSpeedMps) / p.resistanceOhm) *
      p.loopWidthM;
    expect(sim.jouleHeatJ).toBeGreaterThan(0);
    expect(Math.abs(sim.jouleHeatJ - expectedHeat) / expectedHeat).toBeLessThan(0.01);
  });

  it('free sliding loses kinetic energy equal to Joule heat within tolerance', () => {
    const p = params({ mode: 'free' });
    const sim = simulateLoop(p);
    sampleFinite(sim);
    expect(sim.final.velocityMps).toBeLessThan(p.initialSpeedMps);
    expect(sim.jouleHeatJ).toBeGreaterThan(0);
    const relative = Math.abs(sim.mechanicalEnergyLossJ - sim.jouleHeatJ) / sim.jouleHeatJ;
    expect(relative).toBeLessThan(0.01);
    expect(sim.final.phase).toBe('after');
    expect(sim.stoppedInsideField).toBe(false);
  });

  it('free sliding never accelerates and never produces ∞ for a weak field', () => {
    const sim = simulateLoop(params({ mode: 'free', BzTesla: 0.15, massKg: 0.4 }));
    sampleFinite(sim);
    for (const s of sim.samples) {
      expect(s.velocityMps).toBeLessThanOrEqual(DEFAULT_LOOP_PARAMS.initialSpeedMps + 1e-9);
      expect(s.velocityMps).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles B=0, v=0, touching boundaries and huge parameters without NaN/Infinity', () => {
    const cases: LoopFieldParams[] = [
      params({ BzTesla: 0 }),
      params({ initialSpeedMps: 0 }),
      params({ startXM: 0.2 - DEFAULT_LOOP_PARAMS.loopWidthM }),
      params({ startXM: 0.2 }),
      params({ startXM: 0.7 - 1e-12 }),
      params({ resistanceOhm: 1e-9 }),
      params({ massKg: 1e-9, mode: 'free' }),
      params({ loopWidthM: 1e-4, loopHeightM: 1e-4 }),
      params({ BzTesla: 50, initialSpeedMps: 3 }),
      {
        ...params({ mode: 'free' }),
        loopWidthM: Number.NaN,
        fieldLeftM: Number.POSITIVE_INFINITY,
        resistanceOhm: 0,
      },
    ];
    for (const p of cases) {
      const sim = simulateLoop(p);
      expect(Number.isFinite(sim.durationS)).toBe(true);
      expect(sim.durationS).toBeGreaterThan(0);
      expect(sim.jouleHeatJ).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(sim.jouleHeatJ)).toBe(true);
      sampleFinite(sim);
    }
  });

  it('handles loops wider or narrower than the field and labels the spanning phase', () => {
    const wide = simulateLoop(params({ loopWidthM: 0.8, startXM: -0.3 }));
    const phases = new Set(wide.samples.map((s) => s.phase));
    expect(phases.has('spanning')).toBe(true);
    for (const s of wide.samples) {
      if (s.phase === 'spanning') {
        expect(s.emfV).toBeCloseTo(0, 10);
        expect(s.overlapWidthM).toBeCloseTo(0.5, 10);
      }
    }

    const narrow = simulateLoop(params({ loopWidthM: 0.1 }));
    expect(narrow.samples.some((s) => s.phase === 'inside')).toBe(true);
    expect(narrow.events.at(-1)?.phase).toBe('after');
    sampleFinite(wide);
    sampleFinite(narrow);
  });

  it('keeps interpolation deterministic for repeated scrubbing', () => {
    const sim = simulateLoop(params());
    const times = [0.03, 0.2, 0.1, 0.2, 0.03];
    const a = times.map((t) => stateAtTime(sim, t));
    const b = times.map((t) => stateAtTime(sim, t));
    expect(b.map((s) => s.fluxWb)).toEqual(a.map((s) => s.fluxWb));
    expect(b.map((s) => s.currentA)).toEqual(a.map((s) => s.currentA));
  });
});
