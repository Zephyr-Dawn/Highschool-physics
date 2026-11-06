import { describe, expect, it } from 'vitest';
import {
  solveHalfPlaneTrajectory,
  sampleHalfPlaneTrajectory,
  type HalfPlaneFieldInput,
} from '../../src/physics/particles/halfPlane';
import type { Vec2 } from '../../src/physics/core/vec2';
import { P03_PRESETS, p03Input } from '../../src/simulations/particle/halfPlaneParams';

const M = 1e-26;
const Q = 1.602176634e-19;
const V = 2e6;
const B = 0.5;
const R = (M * V) / (Q * B);
const T = (2 * Math.PI * M) / (Q * B);

const boundaryPoint: Vec2 = { x: 0, y: 0 };
const boundaryNormal: Vec2 = { x: 1, y: 0 };

function input(overrides: Partial<HalfPlaneFieldInput> = {}): HalfPlaneFieldInput {
  return {
    startPosition: { x: 0, y: 0 },
    initialVelocity: { x: V, y: 0 },
    massKg: M,
    chargeC: Q,
    BzTesla: -B,
    boundaryPoint,
    boundaryNormal,
    ...overrides,
  };
}

function relativeError(a: number, b: number, scale = 1): number {
  return Math.abs(a - b) / Math.max(Math.abs(scale), 1e-30);
}

describe('P03 half-plane analytic solver: crossing baselines', () => {
  it('positive charge, B into page: enters at the boundary, curves upward, exits after T/2 at (0,2R) with (-v,0)', () => {
    const sol = solveHalfPlaneTrajectory(input());
    const circle = sol.circle;
    expect(circle).not.toBeNull();
    expect(circle!.radiusM).toBeCloseTo(R, 12);
    expect(circle!.periodS).toBeCloseTo(T, 12);
    expect(circle!.turn).toBe('counterclockwise');
    expect(circle!.center.x).toBeCloseTo(0, 10);
    expect(circle!.center.y).toBeCloseTo(R, 10);

    expect(sol.entry).not.toBeNull();
    expect(sol.entry!.timeS).toBeCloseTo(0, 12);
    expect(sol.exit).not.toBeNull();
    expect(sol.exit!.timeS).toBeCloseTo(T / 2, 11);
    expect(relativeError(sol.exit!.position!.x, 0, R)).toBeLessThan(1e-9);
    expect(relativeError(sol.exit!.position!.y, 2 * R, R)).toBeLessThan(1e-9);
    expect(relativeError(sol.exit!.velocity!.x, -V, V)).toBeLessThan(1e-9);
    expect(relativeError(sol.exit!.velocity!.y, 0, V)).toBeLessThan(1e-9);
    expect(sol.fieldTimeS).toBeCloseTo(T / 2, 11);
    expect(sol.deflectionDegrees).toBeCloseTo(180, 9);
    expect(sol.status).toBe('entered-and-exited');
    const justInside = sampleHalfPlaneTrajectory(sol, 1e-12);
    expect(justInside.force.y).toBeGreaterThan(0);
    expect(justInside.force.x).toBeCloseTo(0, 6);
    expect(justInside.speedMps).toBeCloseTo(V, 6);
  });

  it('reversing B mirrors the motion downward while keeping R and T', () => {
    const up = solveHalfPlaneTrajectory(input());
    const down = solveHalfPlaneTrajectory(input({ BzTesla: B }));
    expect(down.circle!.radiusM).toBeCloseTo(up.circle!.radiusM, 12);
    expect(down.circle!.periodS).toBeCloseTo(up.circle!.periodS, 12);
    expect(down.circle!.turn).toBe('clockwise');
    expect(down.circle!.center.y).toBeCloseTo(-R, 10);
    expect(down.exit).not.toBeNull();
    expect(down.exit!.position!.y).toBeCloseTo(-2 * R, 10);
    expect(down.exit!.velocity!.x).toBeCloseTo(-V, 6);
    expect(down.fieldTimeS).toBeCloseTo(T / 2, 11);
  });

  it('detects an outside launch, computes the entry point and keeps position/velocity continuous', () => {
    const sol = solveHalfPlaneTrajectory(
      input({ startPosition: { x: -R, y: 0 }, initialVelocity: { x: V, y: 0 } }),
    );
    expect(sol.launchPoint).toEqual({ x: -R, y: 0 });
    expect(sol.entry).not.toBeNull();
    expect(sol.entry!.timeS).toBeCloseTo(R / V, 12);
    expect(sol.entry!.position!.x).toBeCloseTo(0, 10);
    expect(sol.entry!.position!.y).toBeCloseTo(0, 10);
    expect(sol.exit).not.toBeNull();
    expect(sol.exit!.timeS).toBeCloseTo(R / V + T / 2, 10);

    const eps = 1e-12;
    const motionTolerance = V * eps * 2 + R * 1e-9;
    const entryTime = sol.entry!.timeS as number;
    const before = sampleHalfPlaneTrajectory(sol, entryTime - eps);
    const atEntry = sampleHalfPlaneTrajectory(sol, entryTime);
    const after = sampleHalfPlaneTrajectory(sol, entryTime + eps);
    expect(Math.abs(before.position.x - atEntry.position.x)).toBeLessThan(motionTolerance);
    expect(Math.abs(before.position.y - atEntry.position.y)).toBeLessThan(motionTolerance);
    expect(Math.abs(after.position.x - atEntry.position.x)).toBeLessThan(motionTolerance);
    expect(Math.abs(after.velocity.x - atEntry.velocity.x)).toBeLessThan(V * 1e-4);
    expect(Math.abs(after.velocity.y - atEntry.velocity.y)).toBeLessThan(V * 1e-4);
    expect(before.region).not.toBe('inside');
    expect(after.region).toBe('inside');
  });

  it('keeps speed and radius constant inside and makes a continuous exit transition', () => {
    const sol = solveHalfPlaneTrajectory(input());
    const samples = Array.from({ length: 40 }, (_, index) =>
      sampleHalfPlaneTrajectory(sol, ((sol.exit!.timeS as number) * index) / 39),
    );
    for (const sample of samples.slice(0, 39)) {
      expect(Math.hypot(sample.velocity.x, sample.velocity.y)).toBeCloseTo(V, 6);
      expect(Math.hypot(sample.position.x, sample.position.y - R)).toBeCloseTo(R, 8);
    }
    const eps = 1e-12;
    const motionTolerance = V * eps * 2 + R * 1e-9;
    const exitTime = sol.exit!.timeS as number;
    const exitMinus = sampleHalfPlaneTrajectory(sol, exitTime - eps);
    const exitAt = sampleHalfPlaneTrajectory(sol, exitTime);
    const exitPlus = sampleHalfPlaneTrajectory(sol, exitTime + eps);
    expect(Math.abs(exitMinus.position.x - exitAt.position.x)).toBeLessThan(motionTolerance);
    expect(Math.abs(exitMinus.position.y - exitAt.position.y)).toBeLessThan(motionTolerance);
    expect(Math.abs(exitPlus.position.x - exitAt.position.x)).toBeLessThan(motionTolerance);
    expect(Math.abs(exitPlus.velocity.x - exitAt.velocity.x)).toBeLessThan(V * 1e-4);
    expect(exitAt.region).toBe('boundary');
    expect(exitPlus.region).toBe('outside');
    expect(sol.fieldTimeS).toBeCloseTo((sol.deflectionDegrees! / 360) * T, 9);
  });
});

describe('P03 half-plane analytic solver: tangential contact and no entry', () => {
  it('a boundary start with velocity parallel to the boundary and inward curvature is tangent, not an exit', () => {
    const sol = solveHalfPlaneTrajectory(
      input({
        initialVelocity: { x: 0, y: V },
        BzTesla: B,
      }),
    );
    expect(sol.entry).toBeNull();
    expect(sol.exit).toBeNull();
    expect(sol.tangent).not.toBeNull();
    expect(sol.tangent!.timeS).toBeCloseTo(0, 12);
    expect(sol.events.some((event) => event.kind === 'stays-inside')).toBe(true);
    expect(sol.status).toBe('tangent-no-exit');
    expect(sol.circle!.center.x).toBeCloseTo(R, 10);
    expect(sol.circle!.center.y).toBeCloseTo(0, 10);
    const inside = sampleHalfPlaneTrajectory(sol, T / 4);
    expect(inside.region).toBe('inside');
    expect(Number.isFinite(inside.position.x)).toBe(true);
    expect(Number.isFinite(inside.position.y)).toBe(true);
  });

  it('the mirrored tangent with outward curvature does not enter the field', () => {
    const sol = solveHalfPlaneTrajectory(
      input({
        initialVelocity: { x: 0, y: V },
        BzTesla: -B,
      }),
    );
    expect(sol.entry).toBeNull();
    expect(sol.exit).toBeNull();
    expect(sol.tangent).not.toBeNull();
    expect(sol.status).toBe('no-entry');
    expect(sol.events.some((event) => event.kind === 'no-entry')).toBe(true);
    const later = sampleHalfPlaneTrajectory(sol, T / 4);
    expect(later.region).not.toBe('inside');
    expect(Number.isFinite(later.position.x)).toBe(true);
    expect(Number.isFinite(later.position.y)).toBe(true);
  });

  it('classifies an outside particle moving away or parallel as no-entry', () => {
    const away = solveHalfPlaneTrajectory(
      input({ startPosition: { x: -R, y: 0 }, initialVelocity: { x: -V, y: 0 } }),
    );
    expect(away.entry).toBeNull();
    expect(away.exit).toBeNull();
    expect(away.status).toBe('no-entry');
    expect(away.events.some((event) => event.kind === 'no-entry')).toBe(true);

    const parallel = solveHalfPlaneTrajectory(
      input({ startPosition: { x: -R, y: 0 }, initialVelocity: { x: 0, y: V } }),
    );
    expect(parallel.entry).toBeNull();
    expect(parallel.exit).toBeNull();
    expect(parallel.status).toBe('no-entry');
    const end = sampleHalfPlaneTrajectory(parallel, parallel.durationS);
    expect(end.region).not.toBe('inside');
    expect(Number.isFinite(end.position.x)).toBe(true);
  });

  it('classifies an inside start that crosses the boundary as starts-inside-and-exited without inventing an entry', () => {
    const sol = solveHalfPlaneTrajectory(
      input({ startPosition: { x: 0.5 * R, y: 0 }, initialVelocity: { x: 0, y: V } }),
    );
    expect(sol.initialRegion).toBe('inside');
    expect(sol.entry).toBeNull();
    expect(sol.exit).not.toBeNull();
    expect(sol.status).toBe('starts-inside-and-exited');
    expect(sol.fieldTimeS).toBeCloseTo(sol.exit!.timeS as number, 12);
    expect(sol.deflectionDegrees).toBeCloseTo(((sol.fieldTimeS as number) * 360) / T, 8);
    expect(sampleHalfPlaneTrajectory(sol, 0).region).toBe('inside');
    expect(sampleHalfPlaneTrajectory(sol, sol.durationS).region).toBe('outside');
  });

  it('reports a future tangent contact of an inside circle but no exit', () => {
    const sol = solveHalfPlaneTrajectory(
      input({ startPosition: { x: 2 * R, y: 0 }, initialVelocity: { x: 0, y: V } }),
    );
    expect(sol.entry).toBeNull();
    expect(sol.exit).toBeNull();
    expect(sol.tangent).not.toBeNull();
    expect(sol.tangent!.timeS).toBeCloseTo(T / 2, 10);
    expect(sol.status).toBe('starts-inside-no-exit');
    expect(sol.events.some((event) => event.kind === 'tangent')).toBe(true);
    expect(sol.events.some((event) => event.kind === 'stays-inside')).toBe(true);
  });

  it('classifies a boundary start with velocity pointing out as no-entry without a circle', () => {
    const sol = solveHalfPlaneTrajectory(
      input({ initialVelocity: { x: -V, y: 0 } }),
    );
    expect(sol.entry).toBeNull();
    expect(sol.exit).toBeNull();
    expect(sol.circle).toBeNull();
    expect(sol.status).toBe('no-entry');
    expect(sol.events.some((event) => event.kind === 'no-entry')).toBe(true);
    const later = sampleHalfPlaneTrajectory(sol, sol.durationS);
    expect(later.region).not.toBe('inside');
    expect(Number.isFinite(later.position.x)).toBe(true);
  });

  it('keeps a circle fully inside the half-plane and reports no exit', () => {
    // start inside at x=3R, v along +y; with Bz<0 the center is (2R,0), radius R.
    const sol = solveHalfPlaneTrajectory(
      input({ startPosition: { x: 3 * R, y: 0 }, initialVelocity: { x: 0, y: V } }),
    );
    expect(sol.entry).toBeNull();
    expect(sol.exit).toBeNull();
    expect(sol.status).toBe('starts-inside-no-exit');
    expect(sol.events.some((event) => event.kind === 'stays-inside')).toBe(true);
    const later = sampleHalfPlaneTrajectory(sol, T / 4);
    expect(later.region).toBe('inside');
  });

  it('distinguishes a tiny inward crossing from a near-tangent no-entry configuration', () => {
    const nearInside = solveHalfPlaneTrajectory(
      input({
        startPosition: { x: 1e-6, y: 0 },
        initialVelocity: { x: 0, y: V },
        BzTesla: B,
      }),
    );
    expect(nearInside.entry).toBeNull();
    expect(nearInside.exit).toBeNull();
    expect(Number.isFinite(nearInside.durationS)).toBe(true);
    expect(nearInside.events.every((event) => event.timeS === null || Number.isFinite(event.timeS))).toBe(true);

    const nearOutside = solveHalfPlaneTrajectory(
      input({
        startPosition: { x: -1e-6, y: 0 },
        initialVelocity: { x: 0, y: V },
        BzTesla: B,
      }),
    );
    expect(nearOutside.entry).toBeNull();
    expect(nearOutside.exit).toBeNull();
    expect(nearOutside.status).toBe('no-entry');

    // Above the relative normal-velocity tolerance this is a genuine entry.
    const smallInward = solveHalfPlaneTrajectory(
      input({
        initialVelocity: { x: 1, y: V },
        BzTesla: B,
      }),
    );
    expect(smallInward.entry).not.toBeNull();
    expect(Number.isFinite(smallInward.entry!.timeS)).toBe(true);
    expect(smallInward.events.every((event) => event.timeS === null || Number.isFinite(event.timeS))).toBe(true);

    // Below the scale-aware tolerance, treat it as a tangential contact rather than
    // numerically manufacturing a tiny crossing.
    const belowTolerance = solveHalfPlaneTrajectory(
      input({
        initialVelocity: { x: 1e-6, y: V },
        BzTesla: B,
      }),
    );
    expect(belowTolerance.entry).toBeNull();
    expect(belowTolerance.exit).toBeNull();
    expect(belowTolerance.tangent).not.toBeNull();
    expect(belowTolerance.events.every((event) => event.timeS === null || Number.isFinite(event.timeS))).toBe(true);
  });
});

describe('P03 half-plane analytic solver: degenerate inputs and arbitrary boundary orientation', () => {
  it('handles qBz=0 as straight motion without NaN or a fake circle', () => {
    const cases = [
      input({ BzTesla: 0, startPosition: { x: -R, y: 0 }, initialVelocity: { x: V, y: 0 } }),
      input({ chargeC: 0, startPosition: { x: -R, y: 0 }, initialVelocity: { x: V, y: 0 } }),
    ];
    for (const value of cases) {
      const sol = solveHalfPlaneTrajectory(value);
      expect(sol.circle).toBeNull();
      expect(sol.status).toBe('no-magnetic-field');
      const samples = [0, sol.durationS / 2, sol.durationS].map((time) =>
        sampleHalfPlaneTrajectory(sol, time),
      );
      for (const sample of samples) {
        expect(Number.isFinite(sample.position.x)).toBe(true);
        expect(Number.isFinite(sample.position.y)).toBe(true);
        expect(Number.isFinite(sample.velocity.x)).toBe(true);
        expect(Number.isFinite(sample.velocity.y)).toBe(true);
      }
    }
  });

  it('handles v=0 and non-finite/negative physical inputs safely', () => {
    const staticCase = solveHalfPlaneTrajectory(input({ initialVelocity: { x: 0, y: 0 } }));
    expect(staticCase.status).toBe('stationary');
    expect(staticCase.circle).toBeNull();
    expect(Number.isFinite(staticCase.durationS)).toBe(true);
    const state = sampleHalfPlaneTrajectory(staticCase, staticCase.durationS / 2);
    expect(state.position).toEqual({ x: 0, y: 0 });
    expect(state.velocity).toEqual({ x: 0, y: 0 });

    const unsafe = solveHalfPlaneTrajectory(
      input({
        massKg: Number.NaN,
        chargeC: Number.POSITIVE_INFINITY,
        initialVelocity: { x: Number.NaN, y: V },
        boundaryNormal: { x: 0, y: 0 },
      }),
    );
    expect(Number.isFinite(unsafe.durationS)).toBe(true);
    for (const time of [0, unsafe.durationS / 2, unsafe.durationS]) {
      const state = sampleHalfPlaneTrajectory(unsafe, time);
      expect(Number.isFinite(state.position.x)).toBe(true);
      expect(Number.isFinite(state.position.y)).toBe(true);
      expect(Number.isFinite(state.velocity.x)).toBe(true);
      expect(Number.isFinite(state.velocity.y)).toBe(true);
    }
  });

  it('supports an arbitrary boundary normal and keeps events finite', () => {
    const normal = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const point = { x: 0.05, y: -0.05 };
    const length = 0.2;
    const startPosition = {
      x: point.x - normal.x * length,
      y: point.y - normal.y * length,
    };
    const sol = solveHalfPlaneTrajectory({
      startPosition,
      initialVelocity: { x: normal.x * V, y: normal.y * V },
      massKg: M,
      chargeC: Q,
      BzTesla: -B,
      boundaryPoint: point,
      boundaryNormal: normal,
    });
    expect(sol.entry).not.toBeNull();
    expect(sol.exit).not.toBeNull();
    expect(sol.entry!.timeS).toBeCloseTo(length / V, 11);
    expect(sol.entry!.position!.x).toBeCloseTo(point.x, 8);
    expect(sol.entry!.position!.y).toBeCloseTo(point.y, 8);
    expect(sol.fieldTimeS).toBeCloseTo(T / 2, 9);
    for (const event of sol.events) {
      if (event.timeS !== null) expect(Number.isFinite(event.timeS)).toBe(true);
    }
  });

  it('samples finite positions across the whole solution duration for both entry and no-entry cases', () => {
    for (const value of [
      input({ startPosition: { x: -R, y: 0 }, initialVelocity: { x: V, y: 0 } }),
      input({ startPosition: { x: -R, y: 0 }, initialVelocity: { x: -V, y: 0 } }),
      input({ initialVelocity: { x: 0, y: V }, BzTesla: B }),
    ]) {
      const sol = solveHalfPlaneTrajectory(value);
      for (let i = 0; i <= 40; i++) {
        const state = sampleHalfPlaneTrajectory(sol, (sol.durationS * i) / 40);
        expect(Number.isFinite(state.timeS)).toBe(true);
        expect(Number.isFinite(state.position.x)).toBe(true);
        expect(Number.isFinite(state.position.y)).toBe(true);
        expect(Number.isFinite(state.velocity.x)).toBe(true);
        expect(Number.isFinite(state.velocity.y)).toBe(true);
        expect(Number.isFinite(state.force.x)).toBe(true);
        expect(Number.isFinite(state.force.y)).toBe(true);
      }
    }
  });
});


describe('P03 presets match the teaching scenarios', () => {
  it('the tangent preset enters tangentially and has no exit', () => {
    const sol = solveHalfPlaneTrajectory(p03Input(P03_PRESETS['p03-tangent']));
    expect(sol.status).toBe('tangent-no-exit');
    expect(sol.entry).toBeNull();
    expect(sol.exit).toBeNull();
    expect(sol.tangent).not.toBeNull();
  });

  it('the no-entry preset stays outside and the reverse preset mirrors the default', () => {
    const noEntry = solveHalfPlaneTrajectory(p03Input(P03_PRESETS['p03-no-entry']));
    expect(noEntry.status).toBe('no-entry');
    const reverse = solveHalfPlaneTrajectory(p03Input(P03_PRESETS['p03-reverse']));
    expect(reverse.status).toBe('entered-and-exited');
    expect(reverse.circle!.center.y).toBeLessThan(0);
  });

  it('the q3/q4 presets produce the baseline exit separation and half-period', () => {
    const sol = solveHalfPlaneTrajectory(p03Input(P03_PRESETS['p03-q3-exit']));
    expect(sol.circle).not.toBeNull();
    const exitDistance = Math.abs((sol.exit!.position as Vec2).y - (sol.entry!.position as Vec2).y);
    expect(exitDistance).toBeCloseTo(2 * sol.circle!.radiusM, 8);
    expect(sol.fieldTimeS).toBeCloseTo(sol.circle!.periodS / 2, 9);
  });
});
