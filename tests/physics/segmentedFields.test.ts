import { describe, expect, it } from 'vitest';
import {
  sampleSegmentedTrajectory,
  segmentedStateAt,
  solveSegmentedTrajectory,
  type SegmentedFieldInput,
} from '../../src/physics/particles/segmentedFields';

const base: SegmentedFieldInput = {
  massKg: 1,
  chargeC: 1,
  dM: 2,
  Ex: 1,
  Ey: 0,
  Bz: -1,
  initialPosition: { x: -2, y: 0 },
  initialVelocity: { x: 2, y: 0 },
  maxTimeS: 12,
  maxEvents: 80,
};

function solve(patch: Partial<SegmentedFieldInput>) {
  return solveSegmentedTrajectory({ ...base, ...patch });
}

describe('P06 mode B segmented regions and events', () => {
  it('B1 accelerates in E, crosses continuously into B, exits after a half circle', () => {
    const solution = solve({});
    const sqrt8 = Math.sqrt(8);
    const entry = solution.events.find((event) => event.kind === 'crossing' && event.toRegion === 'magnetic');
    expect(entry).toBeDefined();
    expect(entry!.timeS).toBeCloseTo(sqrt8 - 2, 9);
    expect(entry!.position.x).toBeCloseTo(0, 9);
    expect(entry!.velocity.x).toBeCloseTo(sqrt8, 9);
    expect(segmentedStateAt(solution, entry!.timeS).region).toBe('magnetic');

    const before = segmentedStateAt(solution, entry!.timeS - 1e-7);
    const after = segmentedStateAt(solution, entry!.timeS + 1e-7);
    expect(Math.abs(before.position.x - after.position.x)).toBeLessThan(2e-5);
    expect(Math.abs(before.position.y - after.position.y)).toBeLessThan(2e-5);
    expect(Math.abs(before.velocity.x - after.velocity.x)).toBeLessThan(2e-5);
    expect(Math.abs(before.velocity.y - after.velocity.y)).toBeLessThan(2e-5);

    const exit = solution.events.find((event) => event.kind === 'crossing' && event.fromRegion === 'magnetic');
    expect(exit).toBeDefined();
    expect(exit!.timeS - entry!.timeS).toBeCloseTo(Math.PI, 8);
    expect(exit!.position.y).toBeCloseTo(2 * sqrt8, 8);
    expect(exit!.velocity.x).toBeCloseTo(-sqrt8, 8);
    expect(exit!.toRegion).toBe('electric');
  });

  it('B2 reverses B and sends the exit to the opposite y side', () => {
    const solution = solve({ Bz: 1 });
    const exit = solution.events.find((event) => event.kind === 'crossing' && event.fromRegion === 'magnetic');
    expect(exit).toBeDefined();
    expect(exit!.position.y).toBeCloseTo(-2 * Math.sqrt(8), 8);
    expect(exit!.velocity.x).toBeCloseTo(-Math.sqrt(8), 8);
  });

  it('B3 decelerates and turns around in E without a false magnetic entry', () => {
    const solution = solve({ Ex: -1, initialVelocity: { x: 1, y: 0 } });
    expect(solution.events.some((event) => event.toRegion === 'magnetic')).toBe(false);
    const turn = solution.events.find((event) => event.kind === 'turn-around');
    expect(turn).toBeDefined();
    expect(turn!.velocity.x).toBeCloseTo(0, 8);
    const state = segmentedStateAt(solution, turn!.timeS);
    expect(state.region).toBe('electric');
    expect(state.position.x).toBeGreaterThan(-2);
    expect(state.position.x).toBeLessThan(0);
    expect(Number.isFinite(solution.finalState.position.x)).toBe(true);
  });

  it('B4 exits B back into E and continues the piecewise solve instead of stopping', () => {
    const solution = solve({});
    const firstExit = solution.events.find((event) => event.kind === 'crossing' && event.fromRegion === 'magnetic');
    expect(firstExit).toBeDefined();
    const afterExit = segmentedStateAt(solution, firstExit!.timeS + 1e-7);
    expect(afterExit.region).toBe('electric');
    expect(afterExit.velocity.x).toBeLessThan(0);
    const laterCrossings = solution.events.filter((event) => event.kind === 'crossing' && event.timeS > firstExit!.timeS);
    expect(laterCrossings.length).toBeGreaterThanOrEqual(1);
    expect(solution.durationS).toBeGreaterThan(firstExit!.timeS);
    expect(Number.isFinite(solution.finalState.position.x)).toBe(true);
  });

  it('B5 records boundary tangency without fabricating a crossing', () => {
    const solution = solve({
      Ex: 0,
      Ey: 0,
      initialPosition: { x: 0, y: 0 },
      initialVelocity: { x: 0, y: 1 },
      Bz: 1,
    });
    expect(solution.events.some((event) => event.kind === 'tangent')).toBe(true);
    expect(solution.events.some((event) => event.kind === 'crossing' && (event.fromRegion === 'magnetic' || event.toRegion === 'magnetic'))).toBe(false);
    expect(solution.events.some((event) => event.kind === 'crossing')).toBe(false);
    expect(segmentedStateAt(solution, solution.durationS).region).toBe('magnetic');
  });

  it('B6 stays finite at boundary starts, zero velocity, zero B, and invalid input', () => {
    const cases: Array<Partial<SegmentedFieldInput>> = [
      { initialPosition: { x: -2, y: 0 }, initialVelocity: { x: 0, y: 0 } },
      { initialPosition: { x: 0, y: 0 }, initialVelocity: { x: 0, y: 1 }, Bz: 1 },
      { initialPosition: { x: 1, y: 0 }, initialVelocity: { x: -1, y: 0 }, Bz: 0 },
      { initialPosition: { x: -3, y: 0 }, initialVelocity: { x: 0, y: 2 }, Ex: 0, Bz: 1 },
      { massKg: 0, initialPosition: { x: Number.NaN, y: 0 } },
      { Bz: Number.POSITIVE_INFINITY },
    ];
    for (const item of cases) {
      const solution = solve(item);
      expect(Number.isFinite(solution.durationS)).toBe(true);
      expect(Number.isFinite(solution.finalState.position.x)).toBe(true);
      expect(Number.isFinite(solution.finalState.velocity.y)).toBe(true);
      expect(solution.events.length).toBeLessThanOrEqual((solution.input.maxEvents ?? 80) + 2);
      expect(solution.segments.length).toBeGreaterThan(0);
    }
    const zero = solve({ initialPosition: { x: -2, y: 0 }, initialVelocity: { x: 0, y: 0 } });
    expect(zero.events.filter((event) => event.kind === 'crossing').length).toBeLessThan(10);
  });

  it('B7 preserves position/velocity and energy identities across all segment seams', () => {
    const solution = solve({});
    const crossings = solution.events.filter((event) => event.kind === 'crossing');
    expect(crossings.length).toBeGreaterThan(2);
    for (const event of crossings) {
      const before = segmentedStateAt(solution, event.timeS - 1e-7);
      const after = segmentedStateAt(solution, event.timeS + 1e-7);
      expect(Math.abs(before.position.x - after.position.x)).toBeLessThan(2e-5);
      expect(Math.abs(before.position.y - after.position.y)).toBeLessThan(2e-5);
      expect(Math.abs(before.velocity.x - after.velocity.x)).toBeLessThan(2e-5);
      expect(Math.abs(before.velocity.y - after.velocity.y)).toBeLessThan(2e-5);
      expect(after.kineticEnergyJ).toBeGreaterThanOrEqual(0);
      expect(Math.abs(after.energyResidualJ)).toBeLessThan(1e-6);
    }
  });

  it('respects an explicit event cap and samples a finite predicted trajectory', () => {
    const capped = solve({ maxEvents: 2 });
    expect(capped.eventLimited).toBe(true);
    expect(capped.events.some((event) => event.kind === 'event-limit')).toBe(true);
    expect(Number.isFinite(capped.finalState.position.x)).toBe(true);
    const solution = solve({});
    const points = sampleSegmentedTrajectory(solution, Math.min(5, solution.durationS), 90);
    expect(points.length).toBe(91);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(points[0].x).toBeCloseTo(-2, 12);
  });
});
