import { describe, expect, it } from 'vitest';
import {
  constraintPointAt,
  solveFieldConstraint,
  validateFieldConstraintInput,
  type FieldConstraintInput,
  type TargetSegment,
} from '../../src/physics/particles/fieldConstraintEvents';
import {
  applyInverseParameter,
  solveFieldConstraintInverse,
} from '../../src/physics/particles/fieldConstraintInverse';

const PI = Math.PI;

function input(patch: Partial<FieldConstraintInput> = {}): FieldConstraintInput {
  return {
    massKg: 1,
    chargeC: 1,
    Ex: 0,
    Ey: 0,
    Bz: -1,
    initialPosition: { x: 0, y: 0 },
    initialVelocity: { x: 1, y: 0 },
    target: { orientation: 'vertical', coordinate: 1, min: -3, max: 3 },
    window: {
      maxTimeS: 5,
      arrivalMinS: 0,
      arrivalMaxS: 5,
      direction: 'any',
      allowTangent: false,
    },
    ...patch,
  };
}

function verticalTarget(coordinate: number, min = -3, max = 3): TargetSegment {
  return { orientation: 'vertical', coordinate, min, max };
}

function horizontalTarget(coordinate: number, min = -3, max = 3): TargetSegment {
  return { orientation: 'horizontal', coordinate, min, max };
}

function expectClose(actual: number, expected: number, tolerance = 1e-9): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)));
}

describe('P08 forward target events', () => {
  it('P8-01: reaching x=1 at the turning point is a tangent-touch, not a crossing', () => {
    const solution = solveFieldConstraint(input());
    expect(solution.status).toBe('tangent-only');
    expect(solution.acceptedEvents).toHaveLength(0);
    expect(solution.events).toHaveLength(1);
    const event = solution.events[0];
    expect(event.kind).toBe('tangent-touch');
    expectClose(event.timeS, PI / 2, 1e-9);
    expectClose(event.position.x, 1, 1e-9);
    expectClose(event.position.y, 1, 1e-9);
    expectClose(event.normalVelocity, 0, 1e-9);
    expect(event.withinSegment).toBe(true);
    expect(event.withinWindow).toBe(true);
    expect(event.accepted).toBe(false);
  });

  it('P8-02: a reachable target keeps both forward crossings and their directions', () => {
    const solution = solveFieldConstraint(input({ target: verticalTarget(0.8) }));
    expect(solution.status).toBe('reachable');
    expect(solution.events.filter((event) => event.kind === 'crossing')).toHaveLength(2);
    const first = solution.events.find((event) => event.kind === 'crossing' && event.direction === 'positive');
    const second = solution.events.find((event) => event.kind === 'crossing' && event.direction === 'negative');
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expectClose(first?.timeS ?? Number.NaN, Math.asin(0.8), 1e-9);
    expectClose(first?.position.y ?? Number.NaN, 0.4, 1e-9);
    expectClose(second?.timeS ?? Number.NaN, PI - Math.asin(0.8), 1e-9);
    expectClose(second?.position.y ?? Number.NaN, 1.6, 1e-9);
    expect(first?.accepted).toBe(true);
    expect(second?.accepted).toBe(true);
  });

  it('P8-03: the same target is unreachable when Bz=-2 shrinks the radius', () => {
    const solution = solveFieldConstraint(input({ Bz: -2, target: verticalTarget(0.8) }));
    expect(solution.status).toBe('no-reach');
    expect(solution.events).toHaveLength(0);
  });

  it('P8-04: pure electric deflection crosses the target at t=2', () => {
    const solution = solveFieldConstraint(
      input({
        Bz: 0,
        Ey: 1.5,
        target: verticalTarget(2),
      }),
    );
    expect(solution.status).toBe('reachable');
    const event = solution.acceptedEvents[0];
    expectClose(event.timeS, 2, 1e-9);
    expectClose(event.position.y, 3, 1e-9);
    expectClose(event.velocity.y, 3, 1e-9);
  });

  it('P8-06: matched E and B give a straight line; changing v0x bends it', () => {
    const matched = input({
      Ex: 0,
      Ey: -2,
      Bz: -1,
      initialVelocity: { x: 2, y: 0 },
      target: verticalTarget(1),
    });
    const solution = solveFieldConstraint(matched);
    expect(solution.status).toBe('reachable');
    expectClose(solution.acceptedEvents[0].timeS, 0.5, 1e-9);
    expectClose(solution.acceptedEvents[0].position.y, 0, 1e-9);
    const stateAtOne = constraintPointAt(matched, 1);
    expectClose(stateAtOne.position.x, 2, 1e-9);
    expectClose(stateAtOne.position.y, 0, 1e-9);
    const changed = input({
      ...matched,
      initialVelocity: { x: 1.5, y: 0 },
    });
    const changedState = constraintPointAt(changed, 1);
    expect(Math.abs(changedState.position.y)).toBeGreaterThan(0.05);
  });

  it('P8-07: |Bz|=1 is the tangent limit for target x=1', () => {
    const tangent = solveFieldConstraint(input());
    expect(tangent.status).toBe('tangent-only');
    const unreachable = solveFieldConstraint(input({ Bz: -2 }));
    expect(unreachable.status).toBe('no-reach');
    const reachable = solveFieldConstraint(input({ Bz: -0.5, target: verticalTarget(0.5) }));
    expect(reachable.status).toBe('reachable');
    expect(reachable.acceptedEvents.length).toBeGreaterThan(0);
  });

  it('P8-08: crossing-only rejects the tangent solution', () => {
    const solution = solveFieldConstraint(
      input({ window: { ...input().window, direction: 'positive' } }),
    );
    expect(solution.status).toBe('tangent-only');
    expect(solution.acceptedEvents).toHaveLength(0);
    expect(solution.events[0].directionAccepted).toBe(false);
  });

  it('P8-09: keeps all intersections and filters by segment range and time window', () => {
    const narrow = solveFieldConstraint(
      input({ target: verticalTarget(0.8, 0.9, 1.1) }),
    );
    expect(narrow.events.filter((event) => event.kind === 'crossing')).toHaveLength(2);
    expect(narrow.status).toBe('outside-segment');
    expect(narrow.acceptedEvents).toHaveLength(0);

    const windowed = solveFieldConstraint(
      input({
        target: verticalTarget(0.8),
        window: {
          maxTimeS: 10,
          arrivalMinS: 1.5,
          arrivalMaxS: 2.5,
          direction: 'any',
          allowTangent: false,
        },
      }),
    );
    expect(windowed.status).toBe('reachable');
    expect(windowed.acceptedEvents).toHaveLength(1);
    expectClose(windowed.acceptedEvents[0].timeS, PI - Math.asin(0.8), 1e-9);
  });

  it('P8-09b: horizontal targets use vy as their normal direction', () => {
    const solution = solveFieldConstraint(
      input({
        target: horizontalTarget(0.5),
        window: {
          maxTimeS: 6,
          arrivalMinS: 0,
          arrivalMaxS: 6,
          direction: 'positive',
          allowTangent: false,
        },
      }),
    );
    expect(solution.status).toBe('reachable');
    expect(solution.events.filter((event) => event.kind === 'crossing')).toHaveLength(2);
    const accepted = solution.acceptedEvents[0];
    expectClose(accepted.timeS, PI / 3, 1e-9);
    expectClose(accepted.position.x, Math.sin(PI / 3), 1e-9);
    expect(accepted.normalVelocity).toBeGreaterThan(0);
  });

  it('distinguishes a trajectory that stays on the target line', () => {
    const solution = solveFieldConstraint(
      input({
        Bz: 0,
        chargeC: 0,
        target: horizontalTarget(0),
      }),
    );
    expect(solution.status).toBe('degenerate-on-line');
    expect(solution.events).toHaveLength(0);
  });

  it('handles q=0, v=0, zero field and invalid inputs without NaN', () => {
    const neutral = solveFieldConstraint(
      input({ chargeC: 0, Bz: 0, Ex: 1, Ey: 1, target: verticalTarget(2) }),
    );
    expect(neutral.status).toBe('reachable');
    expectClose(neutral.acceptedEvents[0].timeS, 2, 1e-9);

    const rest = solveFieldConstraint(
      input({ chargeC: 0, Bz: 0, initialVelocity: { x: 0, y: 0 }, target: verticalTarget(1) }),
    );
    expect(rest.status).toBe('no-reach');
    expect(rest.events).toHaveLength(0);

    expect(validateFieldConstraintInput(input({ massKg: 0 })).valid).toBe(false);
    expect(validateFieldConstraintInput(input({ massKg: Number.NaN })).valid).toBe(false);
    expect(validateFieldConstraintInput(input({ target: verticalTarget(1, 2, 1) })).valid).toBe(false);
    expect(validateFieldConstraintInput(input({ window: { ...input().window, maxTimeS: 0 } })).valid).toBe(false);
    expect(
      validateFieldConstraintInput(
        input({ window: { ...input().window, arrivalMinS: 2, arrivalMaxS: 1 } }),
      ).valid,
    ).toBe(false);
    const invalid = solveFieldConstraint(input({ massKg: -1 }));
    expect(invalid.status).toBe('invalid');
    expect(invalid.events).toHaveLength(0);
  });

  it('tiny B, reversed B and reversed q remain finite and directionally consistent', () => {
    const tiny = solveFieldConstraint(input({ Bz: -1e-9, target: verticalTarget(0.5) }));
    expect(Number.isFinite(tiny.events[0]?.timeS ?? 0)).toBe(true);
    const reversedB = solveFieldConstraint(input({ Bz: 1, target: verticalTarget(0.8) }));
    expect(reversedB.status).toBe('reachable');
    const reversedQ = solveFieldConstraint(input({ chargeC: -1, target: verticalTarget(0.8) }));
    expect(reversedQ.status).toBe('reachable');
    for (const event of [...reversedB.events, ...reversedQ.events]) {
      expect(Number.isFinite(event.timeS)).toBe(true);
      expect(Number.isFinite(event.position.x)).toBe(true);
      expect(Number.isFinite(event.position.y)).toBe(true);
    }
  });

  it('does not change events when the caller only changes display concerns', () => {
    const first = solveFieldConstraint(input({ target: verticalTarget(0.8) }));
    const second = solveFieldConstraint(input({ target: verticalTarget(0.8) }));
    expect(second.events.map((event) => event.timeS)).toEqual(first.events.map((event) => event.timeS));
    expect(second.events.map((event) => event.position.y)).toEqual(first.events.map((event) => event.position.y));
  });
});

describe('P08 single-parameter inverse solve', () => {
  function inverseInput(patch: Partial<FieldConstraintInput> = {}): FieldConstraintInput {
    return input({
      Bz: 0,
      target: verticalTarget(2),
      ...patch,
    });
  }

  it('P8-05: recovers Ey=1.5 and revalidates it in the forward engine', () => {
    const base = inverseInput();
    const solution = solveFieldConstraintInverse({
      base,
      parameter: 'Ey',
      min: -4,
      max: 4,
      targetNormalCoordinate: 3,
    });
    expect(solution.status).toBe('solved');
    expect(solution.confirmedCount).toBeGreaterThanOrEqual(1);
    const candidate = solution.candidates.find((item) => item.status === 'confirmed');
    expect(candidate).toBeDefined();
    expectClose(candidate?.parameterValue ?? Number.NaN, 1.5, 1e-7);
    expect(Math.abs(candidate?.residualM ?? Number.NaN)).toBeLessThan(1e-7);
    const applied = applyInverseParameter(base, 'Ey', candidate?.parameterValue ?? 0);
    const forward = solveFieldConstraint(applied);
    expect(forward.status).toBe('reachable');
    expectClose(forward.acceptedEvents[0].position.y, 3, 1e-7);
    expectClose(base.initialVelocity.x, 1, 1e-12);
    expectClose(base.massKg, 1, 1e-12);
    expectClose(base.chargeC, 1, 1e-12);
  });

  it('P8-06: recovers Ey=-2 for the velocity-selector straight line', () => {
    const base = input({
      Ex: 0,
      Ey: -2,
      Bz: -1,
      initialVelocity: { x: 2, y: 0 },
      target: verticalTarget(1),
    });
    const solution = solveFieldConstraintInverse({
      base,
      parameter: 'Ey',
      min: -4,
      max: 4,
      targetNormalCoordinate: 0,
    });
    expect(solution.status).toBe('solved');
    const candidate = solution.candidates.find((item) => item.status === 'confirmed');
    expectClose(candidate?.parameterValue ?? Number.NaN, -2, 1e-6);
    const forward = solveFieldConstraint(applyInverseParameter(base, 'Ey', candidate?.parameterValue ?? 0));
    expect(forward.status).toBe('reachable');
    expectClose(forward.acceptedEvents[0].position.y, 0, 1e-7);
  });

  it('reports a tangent critical boundary instead of pretending a regular root', () => {
    const base = input({
      target: verticalTarget(1),
      window: { ...input().window, allowTangent: false },
    });
    const solution = solveFieldConstraintInverse({
      base,
      parameter: 'Bz',
      min: -2,
      max: 2,
      targetNormalCoordinate: 1,
    });
    const critical = solution.candidates.filter((item) => item.status === 'tangent-critical');
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(critical.some((item) => Math.abs(Math.abs(item.parameterValue) - 1) < 2e-3)).toBe(true);
    expect(solution.confirmedCount).toBe(0);
    expect(solution.status === 'boundary-only' || solution.status === 'not-found-within-search').toBe(true);
  });

  it('returns not-found-within-search for an unreachable target, not a fake root', () => {
    const base = input({ Bz: -1, target: verticalTarget(2) });
    const solution = solveFieldConstraintInverse({
      base,
      parameter: 'Bz',
      min: -3,
      max: -1,
      targetNormalCoordinate: 0,
    });
    expect(solution.status).toBe('not-found-within-search');
    expect(solution.confirmedCount).toBe(0);
    expect(solution.candidates.every((item) => item.status !== 'confirmed')).toBe(true);
  });

  it('rejects invalid ranges and leaves the base input untouched', () => {
    const base = inverseInput();
    const before = JSON.stringify(base);
    const invalid = solveFieldConstraintInverse({
      base,
      parameter: 'Ey',
      min: 4,
      max: -4,
      targetNormalCoordinate: 3,
    });
    expect(invalid.status).toBe('invalid');
    expect(JSON.stringify(base)).toBe(before);
    const tooManyScanPoints = solveFieldConstraintInverse({
      base,
      parameter: 'Ey',
      min: -4,
      max: 4,
      targetNormalCoordinate: 3,
      scanPoints: 100000,
    });
    expect(tooManyScanPoints.status).toBe('invalid');
  });

  it('supports inverse in v0x and v0y with forward revalidation', () => {
    const base = input({ target: verticalTarget(0.8) });
    const byVx = solveFieldConstraintInverse({
      base,
      parameter: 'v0x',
      min: 0.2,
      max: 3,
      targetNormalCoordinate: 0.4,
    });
    const candidate = byVx.candidates.find((item) => item.status === 'confirmed');
    expect(candidate).toBeDefined();
    const forward = solveFieldConstraint(applyInverseParameter(base, 'v0x', candidate?.parameterValue ?? 0));
    expect(forward.status).toBe('reachable');
    expect(Math.abs((forward.acceptedEvents[0]?.position.y ?? Number.NaN) - 0.4)).toBeLessThan(1e-5);

    const byVy = solveFieldConstraintInverse({
      base: input({ target: verticalTarget(0.5) }),
      parameter: 'v0y',
      min: -2,
      max: 2,
      targetNormalCoordinate: 0.5,
    });
    expect(byVy.status).toBe('solved');
  });

  it('P8-12: returns multiple confirmed roots and revalidates each one', () => {
    const base = input({ Ey: -2, target: verticalTarget(0.8) });
    const solution = solveFieldConstraintInverse({
      base,
      parameter: 'v0y',
      min: -5,
      max: 5,
      targetNormalCoordinate: -1,
      scanPoints: 401,
    });
    expect(solution.confirmedCount).toBeGreaterThanOrEqual(2);
    const confirmed = solution.candidates.filter((item) => item.status === 'confirmed');
    const values = confirmed.map((item) => item.parameterValue).sort((a, b) => a - b);
    expect(values.some((value) => Math.abs(value + 1.677) < 0.02)).toBe(true);
    expect(values.some((value) => Math.abs(value - 2.208) < 0.02)).toBe(true);
    for (const candidate of confirmed) {
      expect(Math.abs(candidate.residualM)).toBeLessThan(1e-6);
      const forward = solveFieldConstraint(applyInverseParameter(base, 'v0y', candidate.parameterValue));
      expect(forward.status).toBe('reachable');
      expect(Math.abs((forward.acceptedEvents[0]?.position.y ?? Number.NaN) + 1)).toBeLessThan(1e-6);
    }
  });

  it('keeps all candidates forward-validated with finite residuals', () => {
    const base = inverseInput();
    const solution = solveFieldConstraintInverse({
      base,
      parameter: 'Ey',
      min: -4,
      max: 4,
      targetNormalCoordinate: 3,
    });
    for (const candidate of solution.candidates) {
      expect(Number.isFinite(candidate.parameterValue)).toBe(true);
      expect(Number.isFinite(candidate.residualM)).toBe(true);
      if (candidate.status === 'confirmed') {
        const forward = solveFieldConstraint(applyInverseParameter(base, 'Ey', candidate.parameterValue));
        expect(forward.status).toBe('reachable');
        expect(Math.abs((forward.acceptedEvents[0]?.position.y ?? Number.NaN) - 3)).toBeLessThan(1e-6);
      }
    }
  });
});
