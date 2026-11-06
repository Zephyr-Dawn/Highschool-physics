import { describe, expect, it } from 'vitest';
import {
  beamlineStateAt,
  buildBeamlineRegions,
  sampleBeamlineTrajectory,
  selectorDriftVelocity,
  solveBeamlineTrajectory,
  validateBeamlineApparatus,
  type BeamlineApparatus,
  type BeamlineInput,
} from '../../src/physics/particles/beamline';

const SQRT3 = Math.sqrt(3);
const TAU_STANDARD = 2 + Math.PI / 6 + 2 / SQRT3;
const Y_STANDARD = 2 - SQRT3 + 2 / SQRT3 - 1 / 3;

const standardApparatus: BeamlineApparatus = {
  acceleration: { enabled: false, x0: -2, x1: -0.5, Ex: 1 },
  selector: { x0: 0, x1: 2, Ey: -2, Bz: -1 },
  analyzer: { x0: 2, x1: 3, Bz: -1 },
  deflector: { x0: 3, x1: 5, Ey: -0.5 },
  entranceSlit: { x: 0, yCenter: 0, halfWidth: 0.12 },
  exitSlit: { x: 2, yCenter: 0, halfWidth: 0.12 },
  screen: { x: 5, yMin: -2.5, yMax: 2.5 },
};

const baseInput: BeamlineInput = {
  massKg: 1,
  chargeC: 1,
  initialPosition: { x: -2, y: 0 },
  initialVelocity: { x: 2, y: 0 },
  apparatus: standardApparatus,
  maxTimeS: 8,
  maxEvents: 60,
};

function solve(overrides: Partial<BeamlineInput> = {}) {
  return solveBeamlineTrajectory({ ...baseInput, ...overrides });
}

function apparatusWith(patch: Partial<BeamlineApparatus>): BeamlineApparatus {
  return { ...standardApparatus, ...patch };
}

function expectStrictlyIncreasing(times: number[]) {
  for (let index = 1; index < times.length; index++) {
    expect(times[index]).toBeGreaterThan(times[index - 1] + 1e-9);
  }
}

describe('P07 beamline apparatus geometry', () => {
  it('builds ordered free/selector/analyzer/deflector regions', () => {
    const regions = buildBeamlineRegions(standardApparatus);
    expect(regions.map((region) => region.kind)).toEqual([
      'free',
      'selector',
      'analyzer',
      'deflector',
      'free',
    ]);
    expect(regions.map((region) => region.id)).toEqual([
      'free-left',
      'selector',
      'analyzer',
      'deflector',
      'free-right',
    ]);
    expect(regions[1]).toMatchObject({ x0: 0, x1: 2, Ey: -2, Bz: -1 });
    expect(validateBeamlineApparatus(standardApparatus)).toBeNull();
  });

  it('inserts the optional acceleration region and free gaps without overlap', () => {
    const apparatus = apparatusWith({
      acceleration: { enabled: true, x0: -2, x1: -0.5, Ex: 1 },
    });
    const regions = buildBeamlineRegions(apparatus);
    expect(regions.map((region) => region.kind)).toEqual([
      'free',
      'acceleration',
      'free',
      'selector',
      'analyzer',
      'deflector',
      'free',
    ]);
    expect(validateBeamlineApparatus(apparatus)).toBeNull();
  });

  it('rejects overlapping regions and invalid hardware geometry', () => {
    expect(
      validateBeamlineApparatus(
        apparatusWith({ selector: { x0: 0, x1: 3, Ey: -2, Bz: -1 } }),
      ),
    ).toBeTruthy();
    expect(
      validateBeamlineApparatus(
        apparatusWith({ screen: { x: 5, yMin: 1, yMax: -1 } }),
      ),
    ).toBeTruthy();
    expect(
      validateBeamlineApparatus(
        apparatusWith({ entranceSlit: { x: 0, yCenter: 0, halfWidth: 0 } }),
      ),
    ).toBeTruthy();
  });

  it('computes the selector drift velocity from E and B', () => {
    expect(selectorDriftVelocity(standardApparatus.selector)).toEqual({ x: 2, y: 0 });
    expect(selectorDriftVelocity({ Ey: 0, Bz: 1 })).toEqual({ x: 0, y: 0 });
    expect(selectorDriftVelocity({ Ey: 1, Bz: 0 })).toBeNull();
  });
});

describe('P07 beamline analytic anchors', () => {
  it('passes both slits and hits the screen at the exact analytic point and time', () => {
    const solution = solve();
    expect(solution.outcome).toBe('screen-hit');
    expect(solution.detection).not.toBeNull();
    expect(solution.detection?.yHit).toBeCloseTo(Y_STANDARD, 8);
    expect(solution.detection?.localTimeS).toBeCloseTo(TAU_STANDARD, 8);
    expect(solution.detection?.velocity.x).toBeCloseTo(SQRT3, 8);
    expect(solution.detection?.velocity.y).toBeCloseTo(1 - 1 / SQRT3, 8);
    expect(solution.durationS).toBeCloseTo(TAU_STANDARD, 8);
    expect(solution.detection?.kineticEnergyJ).toBeCloseTo(0.5 * (3 + (1 - 1 / SQRT3) ** 2), 8);
    expect(solution.events.map((event) => event.kind)).toEqual([
      'slit-pass',
      'slit-pass',
      'enter-region',
      'screen-hit',
    ]);
    expectStrictlyIncreasing(solution.events.map((event) => event.timeS));

    const [entrance, exit, analyzerExit, screen] = solution.events;
    expect(entrance.timeS).toBeCloseTo(1, 8);
    expect(entrance.position.x).toBeCloseTo(0, 8);
    expect(entrance.position.y).toBeCloseTo(0, 8);
    expect(entrance.regionBefore).toBe('free-left');
    expect(entrance.regionAfter).toBe('selector');
    expect(exit.timeS).toBeCloseTo(2, 8);
    expect(exit.position.x).toBeCloseTo(2, 8);
    expect(exit.regionAfter).toBe('analyzer');
    expect(analyzerExit.timeS).toBeCloseTo(2 + Math.PI / 6, 8);
    expect(analyzerExit.position.x).toBeCloseTo(3, 8);
    expect(analyzerExit.position.y).toBeCloseTo(2 - SQRT3, 8);
    expect(analyzerExit.velocity.x).toBeCloseTo(SQRT3, 8);
    expect(analyzerExit.velocity.y).toBeCloseTo(1, 8);
    expect(analyzerExit.regionBefore).toBe('analyzer');
    expect(analyzerExit.regionAfter).toBe('deflector');
    expect(screen.timeS).toBeCloseTo(TAU_STANDARD, 8);
    expect(screen.position.x).toBeCloseTo(5, 8);
    expect(screen.position.y).toBeCloseTo(Y_STANDARD, 8);
    expect(screen.regionAfter).toBe('screen');
    expect(solution.selectorMatch?.matched).toBe(true);
    expect(solution.selectorMatch?.timeS).toBeCloseTo(1, 8);
  });

  it('keeps speed constant in the analyzer and conserves energy across all field regions', () => {
    const solution = solve();
    const analyzerSegment = solution.segments.find((segment) => segment.regionKind === 'analyzer');
    expect(analyzerSegment).toBeDefined();
    expect(analyzerSegment?.startTimeS).toBeCloseTo(2, 8);
    expect(analyzerSegment?.endTimeS).toBeCloseTo(2 + Math.PI / 6, 8);
    const mid = beamlineStateAt(solution, 2 + Math.PI / 12);
    expect(mid).not.toBeNull();
    expect(mid?.speed).toBeCloseTo(2, 8);
    expect(mid?.forceE.x).toBeCloseTo(0, 10);
    expect(mid?.forceE.y).toBeCloseTo(0, 10);
    const magneticPower = (mid?.forceB.x ?? 0) * (mid?.velocity.x ?? 0)
      + (mid?.forceB.y ?? 0) * (mid?.velocity.y ?? 0);
    expect(Math.abs(magneticPower)).toBeLessThan(1e-10);
    expect(solution.finalState.workJ).toBeCloseTo(-0.5 * (Y_STANDARD - (2 - SQRT3)), 8);
    expect(solution.finalState.energyResidualJ).toBeCloseTo(0, 8);
    expect(solution.finalState.kineticEnergyJ).toBeCloseTo(0.5 * solution.finalState.speed ** 2, 10);
  });

  it('keeps the selector balance for negative charge but mirrors the analyzer path', () => {
    const solution = solve({ chargeC: -1 });
    expect(solution.outcome).toBe('screen-hit');
    expect(solution.selectorMatch?.matched).toBe(true);
    expect(solution.detection?.yHit).toBeCloseTo(-Y_STANDARD, 8);
    expect(solution.detection?.localTimeS).toBeCloseTo(TAU_STANDARD, 8);
    expect(solution.detection?.velocity.x).toBeCloseTo(SQRT3, 8);
    expect(solution.detection?.velocity.y).toBeCloseTo(-(1 - 1 / SQRT3), 8);
    const analyzerExit = solution.events.find((event) => event.regionAfter === 'deflector');
    expect(analyzerExit?.position.y).toBeCloseTo(-(2 - SQRT3), 8);
    expect(analyzerExit?.velocity.y).toBeCloseTo(-1, 8);
  });

  it('absorbs slow and fast particles on the real exit plate without a screen spot', () => {
    const slow = solve({ initialVelocity: { x: 1.5, y: 0 } });
    expect(slow.outcome).toBe('absorbed');
    expect(slow.detection).toBeNull();
    expect(slow.screenCrossing).toBeNull();
    expect(slow.absorption?.slitId).toBe('exit');
    expect(slow.absorption?.position.x).toBeCloseTo(2, 8);
    expect(slow.absorption?.position.y).toBeLessThan(-0.12);
    expect(slow.absorption?.timeS).toBeCloseTo(2 / 1.5 + 1.236129988702027, 8);
    expect(slow.selectorMatch?.matched).toBe(false);

    const fast = solve({ initialVelocity: { x: 2.5, y: 0 } });
    expect(fast.outcome).toBe('absorbed');
    expect(fast.detection).toBeNull();
    expect(fast.absorption?.slitId).toBe('exit');
    expect(fast.absorption?.position.x).toBeCloseTo(2, 8);
    expect(fast.absorption?.position.y).toBeGreaterThan(0.12);
    expect(fast.absorption?.timeS).toBeCloseTo(2 / 2.5 + 0.8176199841936764, 8);
    expect(fast.selectorMatch?.matched).toBe(false);
  });

  it('stops at the real absorption plate at the true local time', () => {
    const solution = solve({ initialVelocity: { x: 1.5, y: 0 } });
    const expectedTime = 2 / 1.5 + 1.236129988702027;
    expect(solution.durationS).toBeCloseTo(expectedTime, 8);
    expect(solution.finalState.timeS).toBeCloseTo(expectedTime, 8);
    expect(solution.finalState.position.x).toBeCloseTo(2, 8);
    expect(solution.finalState.position.y).toBeCloseTo(-0.33577298108312764, 8);
    expect(solution.finalState.velocity.x).toBeCloseTo(
      2 + (1.5 - 2) * Math.cos(1.236129988702027),
      8,
    );
  });

  it('absorbs a matched-speed particle that starts outside the entrance aperture', () => {
    const solution = solve({ initialPosition: { x: -2, y: 0.2 } });
    expect(solution.outcome).toBe('absorbed');
    expect(solution.absorption?.slitId).toBe('entrance');
    expect(solution.absorption?.timeS).toBeCloseTo(1, 8);
    expect(solution.absorption?.position).toMatchObject({ x: 0, y: 0.2 });
    expect(solution.detection).toBeNull();
  });

  it('uses inclusive aperture equality and rejects a point just outside the opening', () => {
    const passing = solve({ initialPosition: { x: -2, y: 0.12 } });
    expect(passing.outcome).toBe('screen-hit');
    expect(passing.detection).not.toBeNull();

    const blocked = solve({ initialPosition: { x: -2, y: 0.1201 } });
    expect(blocked.outcome).toBe('absorbed');
    expect(blocked.absorption?.slitId).toBe('entrance');
    expect(blocked.detection).toBeNull();
  });

  it('computes the screen coordinate for deflector off and reverse fields', () => {
    const off = solve({ apparatus: apparatusWith({ deflector: { x0: 3, x1: 5, Ey: 0 } }) });
    expect(off.outcome).toBe('screen-hit');
    expect(off.detection?.yHit).toBeCloseTo(2 - SQRT3 + 2 / SQRT3, 8);
    expect(off.detection?.velocity.y).toBeCloseTo(1, 8);

    const reverse = solve({ apparatus: apparatusWith({ deflector: { x0: 3, x1: 5, Ey: 0.5 } }) });
    expect(reverse.outcome).toBe('screen-hit');
    expect(reverse.detection?.yHit).toBeCloseTo(2 - SQRT3 + 2 / SQRT3 + 1 / 3, 8);
    expect(reverse.detection?.velocity.y).toBeCloseTo(1 + 1 / SQRT3, 8);
  });

  it('reverses the analyzer deflection and reports screen-outside when the real spot misses', () => {
    const solution = solve({
      apparatus: apparatusWith({
        analyzer: { x0: 2, x1: 3, Bz: 1 },
        screen: { x: 5, yMin: -0.5, yMax: 2.5 },
      }),
    });
    expect(solution.outcome).toBe('screen-outside');
    expect(solution.detection).toBeNull();
    expect(solution.screenCrossing).not.toBeNull();
    expect(solution.screenCrossing?.yHit).toBeCloseTo(-1.755983064143708, 8);
    expect(solution.screenCrossing?.localTimeS).toBeCloseTo(TAU_STANDARD, 8);
  });

  it('reports screen-outside when the screen window excludes the true crossing', () => {
    const solution = solve({
      apparatus: apparatusWith({ screen: { x: 5, yMin: 1.2, yMax: 2.5 } }),
    });
    expect(solution.outcome).toBe('screen-outside');
    expect(solution.detection).toBeNull();
    expect(solution.screenCrossing?.yHit).toBeCloseTo(Y_STANDARD, 8);
    expect(solution.durationS).toBeCloseTo(TAU_STANDARD, 8);
  });

  it('accelerates from rest speed 1 to speed 2 and lands on the same analytic spot', () => {
    const apparatus = apparatusWith({
      acceleration: { enabled: true, x0: -2, x1: -0.5, Ex: 1 },
    });
    const solution = solve({ apparatus, initialVelocity: { x: 1, y: 0 } });
    expect(solution.outcome).toBe('screen-hit');
    expect(solution.detection?.yHit).toBeCloseTo(Y_STANDARD, 8);
    expect(solution.detection?.localTimeS).toBeCloseTo(3.9282993139775506, 8);
    const accelerationExit = solution.events.find((event) => event.regionBefore === 'acceleration');
    expect(accelerationExit?.timeS).toBeCloseTo(1, 8);
    expect(accelerationExit?.position.x).toBeCloseTo(-0.5, 8);
    expect(accelerationExit?.velocity.x).toBeCloseTo(2, 8);
    expect(solution.finalState.workJ).toBeCloseTo(
      1.5 - 0.5 * (Y_STANDARD - (2 - SQRT3)),
      8,
    );
    expect(solution.finalState.energyResidualJ).toBeCloseTo(0, 8);
  });

  it('handles q=0 as a straight geometric flight with no selector balance', () => {
    const solution = solve({ chargeC: 0 });
    expect(solution.outcome).toBe('screen-hit');
    expect(solution.detection?.yHit).toBeCloseTo(0, 8);
    expect(solution.detection?.localTimeS).toBeCloseTo(3.5, 8);
    expect(solution.selectorMatch?.matched).toBe(false);
    expect(solution.finalState.workJ).toBeCloseTo(0, 8);
    expect(solution.finalState.force.x).toBeCloseTo(0, 10);
    expect(solution.finalState.force.y).toBeCloseTo(0, 10);
  });

  it('treats a zero-speed particle as stationary and never fabricates a detection', () => {
    const solution = solve({ initialVelocity: { x: 0, y: 0 } });
    expect(solution.outcome).toBe('not-arrived');
    expect(solution.timeLimited).toBe(true);
    expect(solution.durationS).toBeCloseTo(8, 8);
    expect(solution.detection).toBeNull();
    expect(solution.screenCrossing).toBeNull();
    expect(solution.events).toHaveLength(0);
    for (const value of [
      solution.finalState.position.x,
      solution.finalState.position.y,
      solution.finalState.velocity.x,
      solution.finalState.velocity.y,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('returns a finite invalid solution for non-positive mass', () => {
    const solution = solve({ massKg: 0 });
    expect(solution.outcome).toBe('invalid');
    expect(solution.issue).toBeTruthy();
    expect(solution.detection).toBeNull();
    expect(Number.isFinite(solution.finalState.position.x)).toBe(true);
    expect(Number.isFinite(solution.finalState.velocity.x)).toBe(true);
  });

  it('allows a particle to return from the analyzer through a wide exit slit', () => {
    const apparatus = apparatusWith({
      analyzer: { x0: 2, x1: 3, Bz: -5 },
      exitSlit: { x: 2, yCenter: 0, halfWidth: 1 },
    });
    const solution = solve({ apparatus });
    expect(solution.outcome).not.toBe('screen-hit');
    expect(
      solution.events.some(
        (event) => event.regionBefore === 'analyzer' && event.regionAfter === 'selector',
      ),
    ).toBe(true);
    expectStrictlyIncreasing(solution.events.map((event) => event.timeS));
    expect(solution.detection).toBeNull();
  });

  it('handles starting exactly on the entrance slit without a zero-time loop', () => {
    const inside = solve({ initialPosition: { x: 0, y: 0 } });
    expect(inside.outcome).toBe('screen-hit');
    expect(inside.detection?.localTimeS).toBeCloseTo(1 + Math.PI / 6 + 2 / SQRT3, 8);
    expectStrictlyIncreasing(inside.events.map((event) => event.timeS));

    const outside = solve({ initialPosition: { x: 0, y: 0.2 } });
    expect(outside.outcome).toBe('absorbed');
    expect(outside.absorption?.slitId).toBe('entrance');
    expect(outside.durationS).toBe(0);
  });

  it('keeps event times independent of rendering sample density', () => {
    const solution = solve();
    const coarse = sampleBeamlineTrajectory(solution, solution.durationS, 10);
    const fine = sampleBeamlineTrajectory(solution, solution.durationS, 500);
    expect(coarse).toHaveLength(11);
    expect(fine).toHaveLength(501);
    expect(solution.events[0].timeS).toBeCloseTo(1, 10);
    expect(solution.events[3].timeS).toBeCloseTo(TAU_STANDARD, 10);
    expect(coarse[coarse.length - 1].x).toBeCloseTo(5, 8);
    expect(fine[fine.length - 1].y).toBeCloseTo(Y_STANDARD, 8);
  });

  it('marks event truncation honestly instead of inventing a screen hit', () => {
    const solution = solve({ maxEvents: 1 });
    expect(solution.eventLimited).toBe(true);
    expect(solution.outcome).toBe('event-limited');
    expect(solution.detection).toBeNull();
    expect(solution.durationS).toBeCloseTo(1, 8);
    expect(solution.events).toHaveLength(1);
    expect(solution.events[0].kind).toBe('slit-pass');
  });

  it('records a tangent touch without entering the next region and then continues', () => {
    const apparatus = apparatusWith({ analyzer: { x0: 2, x1: 3, Bz: -2 } });
    const solution = solve({ apparatus, maxTimeS: 6 });
    const tangent = solution.events.find((event) => event.kind === 'tangent');
    expect(tangent).toBeDefined();
    expect(tangent?.timeS).toBeCloseTo(2 + Math.PI / 4, 8);
    expect(tangent?.position.x).toBeCloseTo(3, 8);
    expect(tangent?.position.y).toBeCloseTo(1, 8);
    expect(tangent?.velocity.x).toBeCloseTo(0, 8);
    expect(tangent?.velocity.y).toBeCloseTo(2, 8);
    expect(solution.events.some((event) => event.regionAfter === 'deflector')).toBe(false);
    expect(solution.outcome).toBe('absorbed');
    expect(solution.absorption?.slitId).toBe('exit');
    expect(solution.absorption?.timeS).toBeCloseTo(2 + Math.PI / 2, 8);
    expect(solution.absorption?.position.y).toBeCloseTo(2, 8);
    expectStrictlyIncreasing(solution.events.map((event) => event.timeS));
  });

  it('marks the time window as not-arrived rather than absorbed', () => {
    const solution = solve({ maxTimeS: 1.5 });
    expect(solution.outcome).toBe('not-arrived');
    expect(solution.timeLimited).toBe(true);
    expect(solution.durationS).toBeCloseTo(1.5, 8);
    expect(solution.detection).toBeNull();
    expect(solution.events.map((event) => event.kind)).toEqual(['slit-pass']);
  });
});
