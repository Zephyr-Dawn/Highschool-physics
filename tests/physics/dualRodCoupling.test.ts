import { describe, expect, it } from 'vitest';
import {
  DUAL_ROD_DEFAULT,
  solveDualRod,
  stateAtDualRodTime,
  validateDualRodParams,
  type DualRodParams,
} from '../../src/physics/induction/dualRodCoupling';
import { ManualDualRodSession } from '../../src/physics/induction/manualDualRodMotion';

function params(patch: Partial<DualRodParams> = {}): DualRodParams {
  return {
    ...DUAL_ROD_DEFAULT,
    mode: 'free',
    BzTesla: 1,
    lengthM: 1,
    resistanceOhm: 2,
    circuitClosed: true,
    mass1Kg: 1,
    mass2Kg: 1,
    x1M: 0,
    x2M: 3,
    v1Mps: 0,
    v2Mps: 2,
    force1N: 0,
    force2N: 0,
    durationS: 4,
    ...patch,
  };
}

function close(value: number, expected: number, digits = 10) {
  expect(value).toBeCloseTo(expected, digits);
}

describe('I06 R1: symmetric free rods', () => {
  it('matches velocities, positions, EMF/current/forces, momentum and energy at t=0,1,2', () => {
    const solution = solveDualRod(params({ durationS: 3 }));
    expect(solution.k).toBeCloseTo(0.5, 12);
    expect(solution.alpha).toBeCloseTo(1, 12);
    expect(solution.centerOfMassVelocity0).toBeCloseTo(1, 12);
    for (const t of [0, 1, 2]) {
      const state = stateAtDualRodTime(solution, t);
      const decay = Math.exp(-t);
      close(state.rod1.v, 1 - decay);
      close(state.rod2.v, 1 + decay);
      close(state.rod1.x, t - (1 - decay));
      close(state.rod2.x, 3 + t + (1 - decay));
      close(state.separationM, 3 + 2 * (1 - decay));
      close(state.relativeVelocityMS, 2 * decay);
      close(state.emfTotalV, -2 * decay);
      close(state.currentA, -decay);
      close(state.forceRod1N, decay);
      close(state.forceRod2N, -decay);
      close(state.kineticEnergyJ, 1 + decay * decay);
      close(state.jouleHeatJ, 1 - decay * decay);
      close(state.totalMomentumKgMS, 2, 12);
      expect(Math.abs(state.energyResidualJ ?? Number.NaN)).toBeLessThan(1e-9);
    }
  });
});

describe('I06 R2/R8/R9: same-speed and force/direction checks', () => {
  it('R2: equal velocities produce opposite rod EMFs but zero total EMF/current/force/heat', () => {
    const solution = solveDualRod(params({ v1Mps: 3, v2Mps: 3, BzTesla: 2 }));
    const state = stateAtDualRodTime(solution, 1);
    close(state.emfRod1V, 6, 12);
    close(state.emfRod2V, -6, 12);
    close(state.emfTotalV, 0, 12);
    close(state.currentA, 0, 12);
    close(state.forceRod1N, 0, 12);
    close(state.forceRod2N, 0, 12);
    close(state.jouleHeatJ, 0, 12);
    close(state.rod1.x, 3, 12);
    close(state.rod2.x, 6, 12);
    close(state.separationM, 3, 12);
  });

  it('R8: equal acceleration keeps deltaV=0 while the pair accelerates together', () => {
    const solution = solveDualRod(params({ v1Mps: 0, v2Mps: 0, force1N: 0.5, force2N: 0.5 }));
    const state = stateAtDualRodTime(solution, 2);
    close(state.rod1.v, 1, 12);
    close(state.rod2.v, 1, 12);
    close(state.currentA, 0, 12);
    close(state.relativeVelocityMS, 0, 12);
    close(state.rod1.x, 1, 12);
    close(state.rod2.x, 4, 12);
  });

  it('R9: current and forces reverse with relative velocity, but the force pair remains equal and opposite', () => {
    const positive = stateAtDualRodTime(solveDualRod(params({ v1Mps: 0, v2Mps: 1 })), 0);
    expect(positive.currentA).toBeLessThan(0);
    expect(positive.forceRod1N).toBeGreaterThan(0);
    expect(positive.forceRod2N).toBeLessThan(0);
    close(positive.forceRod1N + positive.forceRod2N, 0, 12);

    const negative = stateAtDualRodTime(solveDualRod(params({ v1Mps: 1, v2Mps: 0 })), 0);
    expect(negative.currentA).toBeGreaterThan(0);
    expect(negative.forceRod1N).toBeLessThan(0);
    expect(negative.forceRod2N).toBeGreaterThan(0);
    close(negative.forceRod1N + negative.forceRod2N, 0, 12);
  });
});

describe('I06 R3/R4: B reversal, open circuit and zero field', () => {
  it('R3: reversing B reverses EMF/current but leaves motion and heat unchanged', () => {
    const positive = solveDualRod(params());
    const reversed = solveDualRod(params({ BzTesla: -1 }));
    for (const t of [0.5, 1.5, 3]) {
      const a = stateAtDualRodTime(positive, t);
      const b = stateAtDualRodTime(reversed, t);
      close(a.rod1.x, b.rod1.x, 12);
      close(a.rod2.x, b.rod2.x, 12);
      close(a.rod1.v, b.rod1.v, 12);
      close(a.rod2.v, b.rod2.v, 12);
      close(a.emfTotalV, -b.emfTotalV, 12);
      close(a.currentA, -b.currentA, 12);
      close(a.jouleHeatJ, b.jouleHeatJ, 12);
    }
  });

  it('R4: open circuit keeps EMF but removes current, magnetic force and heat', () => {
    const solution = solveDualRod(params({ circuitClosed: false, durationS: 2 }));
    const state = stateAtDualRodTime(solution, 1);
    close(state.emfTotalV, -2, 12);
    close(state.currentA, 0, 12);
    close(state.forceRod1N, 0, 12);
    close(state.forceRod2N, 0, 12);
    close(state.jouleHeatJ, 0, 12);
    close(state.rod1.v, 0, 12);
    close(state.rod2.v, 2, 12);
    close(state.rod1.x, 0, 12);
    close(state.rod2.x, 5, 12);
    expect(solution.status).toBe('open-circuit');
  });

  it('B=0 removes all electromagnetic coupling and keeps free motion', () => {
    const solution = solveDualRod(params({ BzTesla: 0 }));
    const state = stateAtDualRodTime(solution, 1);
    close(state.fluxWb, 0, 12);
    close(state.emfTotalV, 0, 12);
    close(state.currentA, 0, 12);
    close(state.forceRod1N, 0, 12);
    close(state.forceRod2N, 0, 12);
    close(state.jouleHeatJ, 0, 12);
    close(state.rod1.v, 0, 12);
    close(state.rod2.v, 2, 12);
  });
});

describe('I06 R5/R6: contact and unequal masses', () => {
  it('stops at the analytic contact time ln2 without crossing or adding collision heat', () => {
    const solution = solveDualRod(
      params({ x1M: 0, x2M: 1, v1Mps: 2, v2Mps: 0, durationS: 5 }),
    );
    expect(solution.contactTimeS).not.toBeNull();
    close(solution.contactTimeS ?? -1, Math.log(2), 10);
    close(solution.durationS, Math.log(2), 10);
    expect(solution.status).toBe('contact-stop');
    close(solution.final.rod1.v, 1.5, 10);
    close(solution.final.rod2.v, 0.5, 10);
    close(solution.final.kineticEnergyJ, 1.25, 10);
    close(solution.final.jouleHeatJ, 0.75, 10);
    expect(solution.final.separationM).toBeGreaterThanOrEqual(-1e-10);
    for (const sample of solution.samples) {
      expect(sample.separationM).toBeGreaterThanOrEqual(-1e-9);
      expect(Number.isFinite(sample.kineticEnergyJ)).toBe(true);
    }
    expect(solution.events.some((event) => event.kind === 'contact')).toBe(true);
  });

  it('R6: unequal masses keep momentum 6 and use alpha=2/3', () => {
    const solution = solveDualRod(params({ mass2Kg: 3, durationS: 2 }));
    close(solution.alpha, 2 / 3, 12);
    for (const t of [0.5, 1, 2]) {
      const state = stateAtDualRodTime(solution, t);
      const decay = Math.exp((-2 * t) / 3);
      close(state.rod1.v, 1.5 - 1.5 * decay, 12);
      close(state.rod2.v, 1.5 + 0.5 * decay, 12);
      close(state.totalMomentumKgMS, 6, 12);
    }
  });
});

describe('I06 R7: opposite external forces and independent energy ledger', () => {
  it('matches K, Q_J, W_ext and keeps total momentum zero', () => {
    const solution = solveDualRod(
      params({
        mode: 'forces',
        x1M: -5,
        x2M: 5,
        v1Mps: 0,
        v2Mps: 0,
        force1N: 1,
        force2N: -1,
        durationS: 3,
      }),
    );
    for (const t of [0.5, 1, 2]) {
      const state = stateAtDualRodTime(solution, t);
      const decay = Math.exp(-t);
      close(state.rod1.v, 1 - decay, 10);
      close(state.rod2.v, -(1 - decay), 10);
      const expectedK = (1 - decay) ** 2;
      const expectedW = 2 * (t - (1 - decay));
      const expectedQ = 2 * (t - 2 * (1 - decay) + (1 - Math.exp(-2 * t)) / 2);
      close(state.kineticEnergyJ, expectedK, 10);
      close(state.externalWorkJ, expectedW, 10);
      close(state.jouleHeatJ, expectedQ, 10);
      expect(Math.abs((state.energyResidualJ ?? Number.NaN))).toBeLessThan(1e-9);
      close(state.totalMomentumKgMS, 0, 10);
      expect(state.joulePowerW).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('I06 R10/R12: invalid input, close start and math-expression values', () => {
  it('rejects non-positive masses/geometry/resistance and non-finite values explicitly', () => {
    for (const patch of [
      { mass1Kg: 0 },
      { mass2Kg: -1 },
      { lengthM: 0 },
      { resistanceOhm: 0 },
      { x1M: 3, x2M: 3 },
      { v1Mps: Number.NaN },
      { force2N: Number.POSITIVE_INFINITY },
    ]) {
      const validation = validateDualRodParams(params(patch));
      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(solveDualRod(params(patch)).status).toBe('invalid');
    }
  });

  it('detects contact from a very close start without NaN', () => {
    const solution = solveDualRod(params({ x1M: 0, x2M: 0.05, v1Mps: 1, v2Mps: -1, durationS: 2 }));
    expect(solution.contactTimeS).not.toBeNull();
    expect((solution.contactTimeS ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(solution.final.rod1.v)).toBe(true);
    expect(Number.isFinite(solution.final.rod2.v)).toBe(true);
    expect(solution.final.separationM).toBeGreaterThanOrEqual(-1e-9);
  });

  it('accepts sqrt(2) T and 1/3 ohm values without slider clamping', () => {
    const solution = solveDualRod(params({ BzTesla: Math.SQRT2, resistanceOhm: 1 / 3, durationS: 1 }));
    close(solution.k, (Math.SQRT2 ** 2) / (1 / 3), 12);
    const state = stateAtDualRodTime(solution, 0);
    close(state.emfTotalV, -Math.SQRT2 * 2, 12);
    close(state.currentA, (-Math.SQRT2 * 2) / (1 / 3), 12);
  });

  it('keeps the same contact time under coarse/fine display sampling', () => {
    const solution = solveDualRod(params({ x1M: 0, x2M: 1, v1Mps: 2, v2Mps: 0, durationS: 3 }));
    expect(solution.samples.length).toBeGreaterThan(30);
    close(solution.contactTimeS ?? -1, Math.log(2), 10);
    close(solution.final.separationM, 0, 8);
  });
});

describe('I06 R11: manual rod drag with a clamped second rod', () => {
  it('uses signed estimated velocity, produces one shared current and accumulates nonnegative heat', () => {
    const manualParams = params({ mode: 'manual-rod1', x1M: 0, x2M: 3, v1Mps: 0, v2Mps: 0 });
    const session = new ManualDualRodSession(manualParams);
    session.reset(0, 0, 3);
    session.beginDrag(0, 0);
    session.record(0.05, 0.05);
    const moving = session.record(0.1, 0.1);
    expect(moving.rod1.v).toBeGreaterThan(0);
    expect(moving.rod2.v).toBe(0);
    expect(moving.currentA).toBeGreaterThan(0);
    expect(moving.forceRod1N).toBeLessThan(0);
    expect(moving.forceRod2N).toBeGreaterThan(0);
    expect(moving.jouleHeatJ).toBeGreaterThan(0);
    expect(moving.energyResidualJ).toBeNull();

    const still = session.record(0.5, 0.1);
    expect(Math.abs(still.rod1.v)).toBeLessThan(1e-9);
    expect(Math.abs(still.currentA)).toBeLessThan(1e-9);
    expect(still.joulePowerW).toBe(0);

    const atContact = session.record(0.6, 3);
    expect(atContact.rod2.x - atContact.rod1.x).toBeGreaterThanOrEqual(0.019);
    expect(atContact.status).toBe('contact-stop');
    expect(session.getContactLimited()).toBe(true);
  });
});
