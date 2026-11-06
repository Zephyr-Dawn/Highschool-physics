import { describe, expect, it } from 'vitest';
import {
  finiteFieldContains,
  finiteFieldStateAt,
  sampleFiniteFieldTrajectory,
  solveFiniteFieldTrajectory,
  type FiniteFieldGeometry,
} from '../../src/physics/particles/finiteMagneticRegion';
import type { Vec2 } from '../../src/physics/core/vec2';

const v = (x: number, y: number): Vec2 => ({ x, y });

const strip = (xMin: number, xMax: number): FiniteFieldGeometry => ({ kind: 'strip', xMin, xMax });
const rect = (xMin: number, xMax: number, yMin: number, yMax: number): FiniteFieldGeometry => ({
  kind: 'rectangle',
  xMin,
  xMax,
  yMin,
  yMax,
});

function anchor(geometry: FiniteFieldGeometry, overrides: Partial<Parameters<typeof solveFiniteFieldTrajectory>[0]> = {}) {
  return solveFiniteFieldTrajectory({
    geometry,
    Bz: -1,
    startPosition: v(0, 0),
    initialVelocity: v(1, 0),
    chargeC: 1,
    massKg: 1,
    timeHorizonS: 8,
    maxEvents: 20,
    ...overrides,
  });
}

function timesIncreasing(events: Array<{ timeS: number }>): boolean {
  return events.every((event, index) => index === 0 || event.timeS >= events[index - 1].timeS);
}

describe('P04 finite magnetic region analytic solver', () => {
  it('classifies strip and rectangle membership including boundaries', () => {
    expect(finiteFieldContains(strip(0, 2), v(1, 100))).toBe(true);
    expect(finiteFieldContains(strip(0, 2), v(-1, 0))).toBe(false);
    expect(finiteFieldContains(rect(0, 2, -1, 1), v(1, 0))).toBe(true);
    expect(finiteFieldContains(rect(0, 2, -1, 1), v(1, 2))).toBe(false);
    expect(finiteFieldContains(rect(0, 2, -1, 1), v(0, 0))).toBe(true);
  });

  it('reproduces the P03 right-half-plane limit: exit at (0,2) after t=pi', () => {
    const solution = anchor(strip(0, 1_000_000));
    expect(solution.status).toBe('entered-and-exited');
    expect(solution.entryTimeS).toBeCloseTo(0, 10);
    expect(solution.exitTimeS).toBeCloseTo(Math.PI, 10);
    expect(solution.exit?.position.x).toBeCloseTo(0, 10);
    expect(solution.exit?.position.y).toBeCloseTo(2, 10);
    expect(solution.exit?.velocity.x).toBeCloseTo(-1, 10);
    expect(solution.exit?.velocity.y).toBeCloseTo(0, 10);
    expect(solution.fieldTimeS).toBeCloseTo(Math.PI, 10);
    expect(solution.exit?.boundaryIds).toContain('left');
  });

  it('strip width 0.5 exits the right edge at t=pi/6 with exact position and velocity', () => {
    const solution = anchor(strip(0, 0.5));
    expect(solution.exitTimeS).toBeCloseTo(Math.PI / 6, 10);
    expect(solution.exit?.position.x).toBeCloseTo(0.5, 10);
    expect(solution.exit?.position.y).toBeCloseTo(1 - Math.sqrt(3) / 2, 10);
    expect(solution.exit?.velocity.x).toBeCloseTo(Math.sqrt(3) / 2, 10);
    expect(solution.exit?.velocity.y).toBeCloseTo(0.5, 10);
    expect(solution.exit?.boundaryIds).toContain('right');
    expect(solution.deflectionDegrees).toBeCloseTo(30, 8);
  });

  it('strip width 4 returns through the left edge after t=pi', () => {
    const solution = anchor(strip(0, 4));
    expect(solution.exitTimeS).toBeCloseTo(Math.PI, 10);
    expect(solution.exit?.position.x).toBeCloseTo(0, 10);
    expect(solution.exit?.position.y).toBeCloseTo(2, 10);
    expect(solution.exit?.velocity.x).toBeCloseTo(-1, 10);
    expect(solution.exit?.velocity.y).toBeCloseTo(0, 10);
    expect(solution.exit?.boundaryIds).toContain('left');
  });

  it('rectangle exits through the top at t=pi/3 and not through the right', () => {
    const solution = anchor(rect(0, 4, -0.5, 0.5));
    expect(solution.exitTimeS).toBeCloseTo(Math.PI / 3, 10);
    expect(solution.exit?.position.x).toBeCloseTo(Math.sqrt(3) / 2, 10);
    expect(solution.exit?.position.y).toBeCloseTo(0.5, 10);
    expect(solution.exit?.boundaryIds).toContain('top');
    expect(solution.exit?.boundaryIds).not.toContain('right');
  });

  it('rectangle can exit bottom, left and right in distinct configurations', () => {
    const bottom = anchor(rect(0, 4, -0.5, 0.5), { startPosition: v(2, 0), initialVelocity: v(0, -1), Bz: -1 });
    expect(bottom.status).toBe('starts-inside-and-exited');
    expect(bottom.exit?.boundaryIds).toContain('bottom');

    const left = anchor(rect(0, 4, -2, 2), { startPosition: v(0.5, 0), initialVelocity: v(0, 1), Bz: -1 });
    expect(left.status).toBe('starts-inside-and-exited');
    expect(left.exit?.boundaryIds).toContain('left');

    const right = anchor(rect(0, 2, -3, 3), { startPosition: v(0.5, 0), initialVelocity: v(0, 1), Bz: 1 });
    expect(right.status).toBe('starts-inside-and-exited');
    expect(right.exit?.boundaryIds).toContain('right');
  });

  it('records tangency without leaving the field', () => {
    const solution = anchor(strip(0, 10), { startPosition: v(1, -1), initialVelocity: v(1, 0), Bz: -1 });
    expect(solution.tangent).not.toBeNull();
    expect(solution.tangent?.kind).toBe('tangent');
    expect(solution.tangent?.timeS).toBeCloseTo((3 * Math.PI) / 2, 9);
    expect(solution.tangent?.position.x).toBeCloseTo(0, 9);
    expect(solution.tangent?.position.y).toBeCloseTo(0, 9);
    expect(solution.exit).toBeNull();
    expect(solution.status).toBe('tangent-no-exit');
  });

  it('merges simultaneous corner contact into one event with two boundary ids', () => {
    const corner = Math.sqrt(3) / 2;
    const solution = anchor(rect(0, corner, -0.5, 0.5));
    expect(solution.exitTimeS).toBeCloseTo(Math.PI / 3, 10);
    expect(solution.exit?.position.x).toBeCloseTo(corner, 10);
    expect(solution.exit?.position.y).toBeCloseTo(0.5, 10);
    expect(solution.exit?.kind).toBe('corner-contact');
    expect(solution.exit?.boundaryIds).toEqual(expect.arrayContaining(['top', 'right']));
    const cornerEvents = solution.events.filter((event) => Math.abs(event.timeS - Math.PI / 3) < 1e-8);
    expect(cornerEvents).toHaveLength(1);
  });

  it('handles B=0 as straight geometric entry and exit with no magnetic radius', () => {
    const solution = anchor(strip(0, 2), {
      Bz: 0,
      startPosition: v(-1, 0.2),
      initialVelocity: v(1, 0),
    });
    expect(solution.status).toBe('no-magnetic-field');
    expect(solution.entryTimeS).toBeCloseTo(1, 10);
    expect(solution.exitTimeS).toBeCloseTo(3, 10);
    expect(solution.entry?.position.x).toBeCloseTo(0, 10);
    expect(solution.exit?.position.x).toBeCloseTo(2, 10);
    expect(solution.radiusM).toBeNull();
    expect(solution.turn).toBeNull();
  });

  it('reverses the trajectory when the charge or the field sign reverses', () => {
    const positive = anchor(strip(0, 4));
    const negative = anchor(strip(0, 4), { chargeC: -1 });
    const reversedField = anchor(strip(0, 4), { Bz: 1 });
    expect(negative.exit?.position.y).toBeCloseTo(-positive.exit!.position.y, 10);
    expect(reversedField.exit?.position.y).toBeCloseTo(-positive.exit!.position.y, 10);
    expect(negative.radiusM).toBeCloseTo(positive.radiusM!, 10);
    expect(negative.periodS).toBeCloseTo(positive.periodS!, 10);
  });

  it('reports no entry for a line that misses a rectangle', () => {
    const solution = anchor(rect(0, 2, -0.5, 0.5), { startPosition: v(-1, 1), initialVelocity: v(1, 0) });
    expect(solution.status).toBe('no-entry');
    expect(solution.entry).toBeNull();
    expect(solution.exit).toBeNull();
    expect(solution.events.some((event) => event.kind === 'entry' || event.kind === 'exit')).toBe(false);
  });

  it('applies the forward-entry rule when starting exactly on a boundary', () => {
    const inward = anchor(strip(0, 10), { startPosition: v(0, 0), initialVelocity: v(0, 1), Bz: 1 });
    expect(inward.initialRegion).toBe('boundary');
    expect(inward.entryTimeS).toBeCloseTo(0, 10);
    expect(inward.status).toBe('entered-no-exit');

    const outward = anchor(strip(0, 10), { startPosition: v(0, 0), initialVelocity: v(0, 1), Bz: -1 });
    expect(outward.entry).toBeNull();
    expect(outward.status).toBe('no-entry');
  });

  it('keeps a small circular orbit entirely inside a large rectangle', () => {
    const solution = anchor(rect(-2, 2, -2, 2), { startPosition: v(0, 0), initialVelocity: v(0.1, 0) });
    expect(solution.status).toBe('starts-inside-no-exit');
    expect(solution.exit).toBeNull();
    expect(solution.fieldTimeS).toBeCloseTo(solution.durationS, 8);
  });

  it('distinguishes critical width: thinner than diameter exits right, exactly diameter is tangent', () => {
    const thin = anchor(strip(0, 0.5));
    const critical = anchor(strip(0, 1));
    const wide = anchor(strip(0, 2));
    expect(thin.exit?.boundaryIds).toContain('right');
    expect(critical.tangent).not.toBeNull();
    expect(critical.tangent?.position.x).toBeCloseTo(1, 9);
    expect(critical.tangent?.position.y).toBeCloseTo(1, 9);
    expect(critical.exit?.boundaryIds).toContain('left');
    expect(wide.exit?.boundaryIds).toContain('left');
  });

  it('keeps position and velocity continuous at every real crossing and speed constant', () => {
    const solution = anchor(strip(0, 0.5));
    expect(solution.segments.length).toBeGreaterThanOrEqual(1);
    for (const segment of solution.segments) {
      expect(Number.isFinite(segment.startTimeS)).toBe(true);
      expect(Number.isFinite(segment.endTimeS)).toBe(true);
      expect(segment.endTimeS).toBeGreaterThanOrEqual(segment.startTimeS - 1e-12);
    }
    for (let index = 1; index < solution.segments.length; index++) {
      const before = solution.segments[index - 1];
      const after = solution.segments[index];
      const beforeEnd = before.kind === 'line'
        ? {
            x: before.startPosition.x + before.startVelocity.x * (before.endTimeS - before.startTimeS),
            y: before.startPosition.y + before.startVelocity.y * (before.endTimeS - before.startTimeS),
          }
        : null;
      if (beforeEnd) {
        expect(after.startPosition.x).toBeCloseTo(beforeEnd.x, 8);
        expect(after.startPosition.y).toBeCloseTo(beforeEnd.y, 8);
      }
      expect(Math.hypot(after.startVelocity.x, after.startVelocity.y)).toBeCloseTo(1, 8);
    }
    for (const event of solution.events) {
      expect(Number.isFinite(event.timeS)).toBe(true);
      expect(Number.isFinite(event.position.x)).toBe(true);
      expect(Number.isFinite(event.position.y)).toBe(true);
    }
    expect(timesIncreasing(solution.events)).toBe(true);
  });

  it('conserves speed and keeps magnetic force perpendicular to velocity in the arc', () => {
    const solution = anchor(strip(0, 0.5));
    for (const time of [0, 0.1, 0.3, 0.5]) {
      const state = finiteFieldStateAt(solution, time);
      expect(state.speedMps).toBeCloseTo(1, 10);
      if (state.inField && state.region === 'inside') {
        const dot = state.force.x * state.velocity.x + state.force.y * state.velocity.y;
        expect(Math.abs(dot)).toBeLessThan(1e-9);
      }
    }
  });

  it('returns finite invalid/stationary states for bad geometry and non-finite input', () => {
    const invalid = solveFiniteFieldTrajectory({
      geometry: strip(1, 1),
      Bz: -1,
      startPosition: v(0, 0),
      initialVelocity: v(1, 0),
      chargeC: 1,
      massKg: 1,
    });
    expect(invalid.status).toBe('invalid');
    expect(invalid.issue).toBeTruthy();
    const state = finiteFieldStateAt(invalid, 1);
    for (const value of [state.position.x, state.position.y, state.velocity.x, state.velocity.y, state.force.x, state.force.y]) {
      expect(Number.isFinite(value)).toBe(true);
    }

    const stationary = solveFiniteFieldTrajectory({
      geometry: rect(0, 2, -1, 1),
      Bz: -1,
      startPosition: v(0.5, 0),
      initialVelocity: v(0, 0),
      chargeC: 1,
      massKg: 1,
    });
    expect(stationary.status).toBe('stationary');
    expect(stationary.exit).toBeNull();
  });

  it('keeps event times exact when only visual sampling density changes', () => {
    const solution = anchor(strip(0, 0.5));
    const coarse = sampleFiniteFieldTrajectory(solution, solution.durationS, 12);
    const fine = sampleFiniteFieldTrajectory(solution, solution.durationS, 300);
    expect(coarse.length).toBe(13);
    expect(fine.length).toBe(301);
    expect(solution.exitTimeS).toBeCloseTo(Math.PI / 6, 12);
    for (const point of [...coarse, ...fine]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});
