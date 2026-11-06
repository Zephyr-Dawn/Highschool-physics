import { describe, expect, it } from 'vitest';
import {
  alternatingRegionAtX,
  alternatingStateAt,
  sampleAlternatingTrajectory,
  solveAlternatingFieldTrajectory,
  type AlternatingFieldInput,
} from '../../src/physics/particles/alternatingMagneticRegions';
import type { Vec2 } from '../../src/physics/core/vec2';

const v = (x: number, y: number): Vec2 => ({ x, y });

function solve(overrides: Partial<AlternatingFieldInput> = {}) {
  return solveAlternatingFieldTrajectory({
    boundaries: [0],
    fields: [-1, 1],
    startPosition: v(0, 0),
    initialVelocity: v(1, 0),
    chargeC: 1,
    massKg: 1,
    timeHorizonS: 2.5 * Math.PI,
    maxEvents: 30,
    ...overrides,
  });
}

function crossings(solution: ReturnType<typeof solve>) {
  return solution.events.filter((event) => event.kind === 'crossing');
}

describe('P05 alternating magnetic regions analytic solver', () => {
  it('classifies left/right regions and supports fields of either sign and zero', () => {
    const input = { boundaries: [-1, 1], fields: [2, 0, -3] } as const;
    expect(alternatingRegionAtX(input, -2)).toBe(0);
    expect(alternatingRegionAtX(input, -0.5)).toBe(1);
    expect(alternatingRegionAtX(input, 2)).toBe(2);
  });

  it('two opposite half-planes: first crossing at (0,-2), t=pi; second at (0,-4), t=2pi', () => {
    const solution = solve();
    const found = crossings(solution);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found[0].timeS).toBeCloseTo(Math.PI, 10);
    expect(found[0].position.x).toBeCloseTo(0, 10);
    expect(found[0].position.y).toBeCloseTo(-2, 10);
    expect(found[0].velocity.x).toBeCloseTo(-1, 10);
    expect(found[0].velocity.y).toBeCloseTo(0, 10);
    expect(found[0].fromRegion).toBe(1);
    expect(found[0].toRegion).toBe(0);
    expect(found[1].timeS).toBeCloseTo(2 * Math.PI, 10);
    expect(found[1].position.x).toBeCloseTo(0, 10);
    expect(found[1].position.y).toBeCloseTo(-4, 10);
    expect(found[1].velocity.x).toBeCloseTo(1, 10);
    expect(found[1].fromRegion).toBe(0);
    expect(found[1].toRegion).toBe(1);
    expect(solution.crossingCount).toBeGreaterThanOrEqual(2);
  });

  it('keeps speed constant and position/velocity continuous at both crossings', () => {
    const solution = solve();
    const found = crossings(solution);
    for (const event of found.slice(0, 2)) {
      expect(Math.hypot(event.velocity.x, event.velocity.y)).toBeCloseTo(1, 10);
    }
    for (let index = 1; index < solution.segments.length; index++) {
      const before = solution.segments[index - 1];
      const after = solution.segments[index];
      expect(after.startTimeS).toBeCloseTo(before.endTimeS, 10);
      expect(after.startPosition.x).toBeCloseTo(
        before.kind === 'line'
          ? before.startPosition.x + before.startVelocity.x * (before.endTimeS - before.startTimeS)
          : before.center === null
            ? before.startPosition.x
            : before.center.x + Math.cos(before.omegaRadPerS * (before.endTimeS - before.startTimeS)) * (before.startPosition.x - before.center.x) - Math.sin(before.omegaRadPerS * (before.endTimeS - before.startTimeS)) * (before.startPosition.y - before.center.y),
        8,
      );
      expect(Math.hypot(after.startVelocity.x, after.startVelocity.y)).toBeCloseTo(1, 10);
    }
  });

  it('flips the path when all fields are reversed', () => {
    const normal = solve();
    const reversed = solve({ fields: [1, -1] });
    const normalCrossings = crossings(normal);
    const reversedCrossings = crossings(reversed);
    expect(reversedCrossings[0].position.y).toBeCloseTo(-normalCrossings[0].position.y, 10);
    expect(reversedCrossings[1].position.y).toBeCloseTo(-normalCrossings[1].position.y, 10);
    expect(reversed.segments[0].radiusM).toBeCloseTo(normal.segments[0].radiusM!, 10);
  });

  it('updates R/T after crossing into a region with a different field magnitude', () => {
    const solution = solve({ fields: [-2, 1] });
    const found = crossings(solution);
    expect(solution.segments[0].radiusM).toBeCloseTo(1, 10);
    expect(solution.segments[0].periodS).toBeCloseTo(2 * Math.PI, 10);
    expect(solution.segments[1].radiusM).toBeCloseTo(0.5, 10);
    expect(solution.segments[1].periodS).toBeCloseTo(Math.PI, 10);
    expect(found[1].timeS).toBeCloseTo(1.5 * Math.PI, 10);
    expect(found[1].position.y).toBeCloseTo(-3, 10);
  });

  it('supports +B / 0 / -B with a straight section between two arcs', () => {
    const solution = solve({
      boundaries: [-0.5, 0.5],
      fields: [1, 0, -1],
      startPosition: v(-1, 0),
      timeHorizonS: 4,
    });
    const sequence = solution.segments.map((segment) => segment.regionIndex);
    expect(sequence.slice(0, 3)).toEqual([0, 1, 2]);
    expect(solution.segments[0].kind).toBe('arc');
    expect(solution.segments[1].kind).toBe('line');
    expect(solution.segments[1].Bz).toBe(0);
    const found = crossings(solution);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found[0].fromRegion).toBe(0);
    expect(found[0].toRegion).toBe(1);
    expect(found[1].toRegion).toBe(2);
  });

  it('negative charge mirrors the two-region path', () => {
    const positive = solve();
    const negative = solve({ chargeC: -1 });
    expect(crossings(negative)[0].position.y).toBeCloseTo(-crossings(positive)[0].position.y, 10);
    expect(crossings(negative)[1].position.y).toBeCloseTo(-crossings(positive)[1].position.y, 10);
  });

  it('records tangency without a crossing', () => {
    const solution = solve({ startPosition: v(1, 1), initialVelocity: v(1, 0) });
    expect(solution.tangentCount).toBeGreaterThanOrEqual(1);
    expect(solution.crossingCount).toBe(0);
    expect(solution.status).toBe('tangent-only');
    const tangent = solution.events.find((event) => event.kind === 'tangent');
    expect(tangent?.timeS).toBeCloseTo((3 * Math.PI) / 2, 9);
    expect(tangent?.position.x).toBeCloseTo(0, 9);
    expect(tangent?.position.y).toBeCloseTo(0, 9);
  });

  it('produces strictly increasing crossing times over multiple alternations', () => {
    const solution = solve({ timeHorizonS: 3.5 * Math.PI, maxEvents: 30 });
    const found = crossings(solution);
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < found.length; index++) {
      expect(found[index].timeS).toBeGreaterThan(found[index - 1].timeS + 1e-8);
    }
    expect(found[0].timeS).toBeCloseTo(Math.PI, 9);
    expect(found[1].timeS).toBeCloseTo(2 * Math.PI, 9);
    expect(found[2].timeS).toBeCloseTo(3 * Math.PI, 9);
  });

  it('marks event-limited truncation honestly and keeps finite state', () => {
    const solution = solve({ timeHorizonS: 10, maxEvents: 1 });
    expect(solution.eventLimited).toBe(true);
    expect(solution.durationS).toBeLessThan(10);
    const state = alternatingStateAt(solution, solution.durationS);
    for (const value of [state.position.x, state.position.y, state.velocity.x, state.velocity.y, state.force.x, state.force.y]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('handles q=0 as a straight geometric crossing with zero force', () => {
    const solution = solve({ startPosition: v(-1, 0), chargeC: 0, timeHorizonS: 4 });
    expect(crossings(solution)).toHaveLength(1);
    expect(crossings(solution)[0].timeS).toBeCloseTo(1, 10);
    const state = alternatingStateAt(solution, 0.5);
    expect(state.force.x).toBe(0);
    expect(state.force.y).toBe(0);
    expect(state.speed).toBeCloseTo(1, 10);
  });

  it('handles zero fields and no crossing without NaN', () => {
    const solution = solve({ fields: [0, 0], startPosition: v(0, 0), timeHorizonS: 3 });
    expect(solution.crossingCount).toBe(0);
    expect(solution.status).toBe('no-crossing');
    const state = alternatingStateAt(solution, 2);
    expect(state.position.x).toBeCloseTo(2, 10);
    expect(state.force.x).toBe(0);
    expect(state.force.y).toBe(0);
  });

  it('handles zero speed as stationary and rejects invalid geometry safely', () => {
    const stationary = solve({ startPosition: v(0.2, 0), initialVelocity: v(0, 0) });
    expect(stationary.status).toBe('stationary');
    expect(alternatingStateAt(stationary, 2).position).toEqual({ x: 0.2, y: 0 });

    for (const invalid of [
      solve({ boundaries: [0, 0], fields: [1, -1, 0] }),
      solve({ fields: [1] }),
      solve({ boundaries: [Number.NaN], fields: [1, -1] }),
      solve({ massKg: 0 }),
    ]) {
      expect(invalid.status).toBe('invalid');
      expect(invalid.issue).toBeTruthy();
      const state = alternatingStateAt(invalid, 1);
      expect(Number.isFinite(state.position.x)).toBe(true);
      expect(Number.isFinite(state.velocity.x)).toBe(true);
    }
  });

  it('keeps event times exact when sampling density changes', () => {
    const solution = solve();
    const coarse = sampleAlternatingTrajectory(solution, solution.durationS, 10);
    const fine = sampleAlternatingTrajectory(solution, solution.durationS, 240);
    expect(coarse).toHaveLength(11);
    expect(fine).toHaveLength(241);
    expect(crossings(solution)[0].timeS).toBeCloseTo(Math.PI, 12);
    for (const point of [...coarse, ...fine]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('reports region dwell times and a finite final state', () => {
    const solution = solve({ timeHorizonS: 2.5 * Math.PI });
    expect(solution.regionTimesS.length).toBe(2);
    expect(solution.regionTimesS[0]).toBeCloseTo(Math.PI, 8);
    expect(solution.regionTimesS[1]).toBeCloseTo(1.5 * Math.PI, 8);
    expect(solution.finalState.speed).toBeCloseTo(1, 10);
    expect(solution.finalState.kineticEnergyJ).toBeCloseTo(0.5, 10);
  });
});
