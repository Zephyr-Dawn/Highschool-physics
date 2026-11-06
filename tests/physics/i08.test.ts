import { describe, expect, it } from 'vitest';
import {
  GENERATOR_DEFAULT,
  circuitClosedAt,
  generatorEnergyAt,
  generatorStateAt,
  integralSinSquared,
  solveGenerator,
  validateGeneratorParams,
  type CircuitSwitchEvent,
  type GeneratorParams,
} from '../../src/physics/induction/acGenerator';
import { ManualGeneratorSession } from '../../src/physics/induction/manualGeneratorMotion';

const PI = Math.PI;

function base(patch: Partial<GeneratorParams> = {}): GeneratorParams {
  return {
    ...GENERATOR_DEFAULT,
    turns: 10,
    areaM2: 0.02,
    bTesla: 0.5,
    theta0Rad: 0,
    omegaRadPerS: 2 * PI,
    loadResistanceOhm: 4,
    internalResistanceOhm: 1,
    circuitClosed: true,
    durationS: 1,
    ...patch,
  };
}

function close(actual: number | null | undefined, expected: number, tolerance = 1e-10): void {
  expect(actual).not.toBeNull();
  expect(actual).not.toBeUndefined();
  expect(Number.isFinite(actual as number)).toBe(true);
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(
    tolerance * Math.max(1, Math.abs(expected)),
  );
}

describe('I08 G01-G20 analytic generator anchors', () => {
  it('G01: t=0 has maximum flux and zero EMF/current', () => {
    const state = generatorStateAt(base(), 0);
    close(state.fluxWb, 0.01, 1e-12);
    close(state.linkageWbTurn, 0.1, 1e-12);
    close(state.emfV, 0, 1e-12);
    close(state.currentA, 0, 1e-12);
    close(state.thetaRad, 0, 1e-12);
  });

  it('G02: quarter period is maximum EMF with zero linkage', () => {
    const state = generatorStateAt(base(), 0.25);
    close(state.thetaRad, PI / 2, 1e-12);
    close(state.linkageWbTurn, 0, 1e-12);
    close(state.emfV, 0.2 * PI, 1e-12);
    close(state.currentA, 0.04 * PI, 1e-12);
  });

  it('G03: half period has negative maximum flux and zero EMF', () => {
    const state = generatorStateAt(base(), 0.5);
    close(state.thetaRad, PI, 1e-12);
    close(state.linkageWbTurn, -0.1, 1e-12);
    close(state.emfV, 0, 1e-12);
  });

  it('G04: three-quarter period has negative EMF/current but non-negative powers', () => {
    const state = generatorStateAt(base(), 0.75);
    close(state.emfV, -0.2 * PI, 1e-12);
    close(state.currentA, -0.04 * PI, 1e-12);
    expect(state.pGenerationW).toBeGreaterThanOrEqual(0);
    expect(state.pLoadW).toBeGreaterThanOrEqual(0);
    expect(state.pInternalW).toBeGreaterThanOrEqual(0);
  });

  it('G05: peak and RMS values', () => {
    const state = generatorStateAt(base(), 0.25);
    close(state.emfPeakV, 0.2 * PI, 1e-12);
    close(state.emfRmsV, (0.2 * PI) / Math.SQRT2, 1e-12);
    close(state.currentRmsA, (0.04 * PI) / Math.SQRT2, 1e-12);
  });

  it('G06: instantaneous power split between load and internal resistance', () => {
    const state = generatorStateAt(base(), 0.25);
    close(state.pGenerationW, 0.008 * PI * PI, 1e-11);
    close(state.pLoadW, 0.0064 * PI * PI, 1e-11);
    close(state.pInternalW, 0.0016 * PI * PI, 1e-11);
    close(state.pGenerationW, state.pLoadW + state.pInternalW, 1e-11);
  });

  it('G07: electromagnetic torque and required drive torque', () => {
    const state = generatorStateAt(base(), 0.25);
    close(state.torqueEmNm, -0.004 * PI, 1e-12);
    close(state.torqueDriveNm, 0.004 * PI, 1e-12);
    close(state.pDriveW, state.pGenerationW, 1e-11);
    close(state.pDriveW, state.torqueDriveNm * state.omegaRadPerS, 1e-11);
  });

  it('G08: full-cycle energy ledger closes with a hand-checkable value', () => {
    const energy = generatorEnergyAt(base(), 1);
    close(energy.driveJ, 0.004 * PI * PI, 1e-11);
    close(energy.loadJ, 0.0032 * PI * PI, 1e-11);
    close(energy.internalJ, 0.0008 * PI * PI, 1e-11);
    close(energy.residualJ ?? Number.NaN, 0, 1e-11);
  });

  it('G09: open circuit keeps EMF but zero current, torque and powers', () => {
    const state = generatorStateAt(base({ circuitClosed: false }), 0.25);
    close(state.emfV, 0.2 * PI, 1e-12);
    close(state.currentA, 0, 1e-12);
    close(state.torqueEmNm, 0, 1e-12);
    close(state.pGenerationW, 0, 1e-12);
    expect(state.emfRmsV).not.toBeNull();
    expect(state.currentRmsA).toBeNull();
  });

  it('G10: reversing B reverses flux, linkage, EMF and current, not power', () => {
    const normal = generatorStateAt(base(), 0.25);
    const reversed = generatorStateAt(base({ bTesla: -0.5 }), 0.25);
    close(reversed.fluxWb, -normal.fluxWb, 1e-12);
    close(reversed.linkageWbTurn, -normal.linkageWbTurn, 1e-12);
    close(reversed.emfV, -normal.emfV, 1e-12);
    close(reversed.currentA, -(normal.currentA ?? 0), 1e-12);
    close(reversed.pGenerationW, normal.pGenerationW, 1e-12);
  });

  it('G11: doubling N doubles peak EMF/current and quadruples resistive power', () => {
    const normal = generatorStateAt(base(), 0.25);
    const doubled = generatorStateAt(base({ turns: 20 }), 0.25);
    close(doubled.emfPeakV, 2 * normal.emfPeakV, 1e-12);
    close(doubled.currentA ?? 0, 2 * (normal.currentA ?? 0), 1e-12);
    close(doubled.pGenerationW, 4 * normal.pGenerationW, 1e-11);
  });

  it('G12: at the same theta, reversing omega reverses EMF', () => {
    const plus = generatorStateAt(base({ theta0Rad: PI / 2, omegaRadPerS: 2 * PI }), 0);
    const minus = generatorStateAt(base({ theta0Rad: PI / 2, omegaRadPerS: -2 * PI }), 0);
    close(plus.emfV, 0.2 * PI, 1e-12);
    close(minus.emfV, -0.2 * PI, 1e-12);
  });

  it('G13: theta0 phase produces the expected EMF at t=0', () => {
    const state = generatorStateAt(base({ theta0Rad: PI / 2 }), 0);
    close(state.linkageWbTurn, 0, 1e-12);
    close(state.emfV, 0.2 * PI, 1e-12);
  });

  it('G14: omega=0 has no EMF/current and no finite period', () => {
    const state = generatorStateAt(base({ omegaRadPerS: 0 }), 0.3);
    close(state.emfV, 0, 1e-12);
    close(state.currentA, 0, 1e-12);
    expect(state.periodS).toBeNull();
    expect(state.frequencyHz).toBeNull();
  });

  it('G15: R_L=0 with r>0 is a legal short circuit', () => {
    const state = generatorStateAt(base({ loadResistanceOhm: 0 }), 0.25);
    close(state.currentA ?? 0, 0.2 * PI, 1e-12);
    close(state.pLoadW, 0, 1e-12);
    close(state.pInternalW, 0.04 * PI * PI, 1e-11);
    expect(state.status).toBe('short-circuit');
  });

  it('G16: zero total resistance, negative or non-finite values are rejected', () => {
    expect(validateGeneratorParams(base({ loadResistanceOhm: 0, internalResistanceOhm: 0 })).valid).toBe(false);
    expect(validateGeneratorParams(base({ loadResistanceOhm: -1 })).valid).toBe(false);
    expect(validateGeneratorParams(base({ internalResistanceOhm: -1 })).valid).toBe(false);
    expect(validateGeneratorParams(base({ bTesla: Number.NaN })).valid).toBe(false);
    expect(validateGeneratorParams(base({ turns: 1.5 })).valid).toBe(false);
    expect(validateGeneratorParams(base({ areaM2: 0 })).valid).toBe(false);
    expect(validateGeneratorParams(base()).valid).toBe(true);
  });

  it('G17: manual angles unwrap 359°→1° as +2° and repeated timestamps do not fake speed', () => {
    const session = new ManualGeneratorSession(base({ circuitClosed: true, durationS: 20 }));
    const start = (359 * PI) / 180;
    const end = PI / 180;
    session.reset(0, start);
    session.begin(0, start);
    const first = session.record(0.1, start);
    expect((first.thetaRad * 180) / PI).toBeCloseTo(359, 9);
    const second = session.record(0.2, end);
    expect((second.thetaRad * 180) / PI).toBeCloseTo(361, 9);
    const omega = second.omegaRadPerS;
    const repeated = session.record(0.2, end);
    expect(Math.abs(repeated.omegaRadPerS - omega)).toBeLessThan(1e-9);
    expect(Number.isFinite(repeated.thetaRad)).toBe(true);
  });

  it('G18: manual fast rotation then stop decays EMF to zero and keeps real time', () => {
    const session = new ManualGeneratorSession(base({ durationS: 20 }));
    session.reset(0, 0);
    session.begin(0, 0);
    const moving = session.record(0.15, 0.8);
    expect(Math.abs(moving.emfV)).toBeGreaterThan(0.1);
    expect(moving.approximation).toBeTruthy();
    const stopped = session.end(0.3);
    close(stopped.omegaRadPerS, 0, 1e-12);
    close(stopped.emfV, 0, 1e-12);
    expect(stopped.timeS).toBeCloseTo(0.3, 12);
    expect(session.getHistory().length).toBeGreaterThan(2);
  });

  it('G19: opening and closing the circuit preserves phase and switches I/P immediately', () => {
    const timeline: CircuitSwitchEvent[] = [
      { timeS: 0, closed: true },
      { timeS: 0.25, closed: false },
      { timeS: 0.5, closed: true },
    ];
    const openState = generatorStateAt(base(), 0.3, timeline);
    close(openState.thetaRad, 0.6 * PI, 1e-12);
    close(openState.emfV, 0.2 * PI * Math.sin(0.6 * PI), 1e-12);
    close(openState.currentA, 0, 1e-12);
    expect(circuitClosedAt(timeline, 0.3)).toBe(false);
    const closedState = generatorStateAt(base(), 0.6, timeline);
    expect(circuitClosedAt(timeline, 0.6)).toBe(true);
    expect(Math.abs(closedState.currentA ?? 0)).toBeGreaterThan(0);
    const energy = generatorEnergyAt(base(), 0.75, timeline);
    const openEnergy = generatorEnergyAt(base(), 0.3, timeline);
    expect(energy.driveJ).toBeGreaterThan(openEnergy.driveJ);
    close(energy.residualJ ?? Number.NaN, 0, 1e-11);
  });

  it('G20: mathematical expression values stay exact and out-of-slider values are accepted', () => {
    const symbolic = base({
      turns: Math.sqrt(64),
      bTesla: Math.SQRT1_2,
      loadResistanceOhm: 1 / 3,
      omegaRadPerS: 2 * PI,
    });
    expect(validateGeneratorParams(symbolic).valid).toBe(true);
    const state = generatorStateAt(symbolic, 0.25);
    close(state.emfPeakV, 8 * Math.SQRT1_2 * 0.02 * 2 * PI, 1e-11);
    expect(validateGeneratorParams(base({ turns: 3 / 2 })).valid).toBe(false);
    expect(validateGeneratorParams(base({ bTesla: 5 })).valid).toBe(true);
  });

  it('matches a finite-difference derivative of linkage and integrates energy independently', () => {
    const params = base();
    const h = 1e-6;
    const fluxLeft = generatorStateAt(params, 0.23 - h).linkageWbTurn;
    const fluxRight = generatorStateAt(params, 0.23 + h).linkageWbTurn;
    const numeric = -(fluxRight - fluxLeft) / (2 * h);
    close(numeric, generatorStateAt(params, 0.23).emfV, 1e-6);
    const energy = generatorEnergyAt(params, 0.37);
    const simpson = (() => {
      const n = 2000;
      let sum = 0;
      for (let index = 0; index <= n; index++) {
        const t = (0.37 * index) / n;
        const weight = index === 0 || index === n ? 1 : index % 2 === 1 ? 4 : 2;
        sum += weight * generatorStateAt(params, t).pGenerationW;
      }
      return (sum * 0.37) / n / 3;
    })();
    close(energy.driveJ, simpson, 1e-6);
  });

  it('is stable for very small omega and long durations', () => {
    const params = base({ omegaRadPerS: 1e-9, durationS: 60 });
    const energy = generatorEnergyAt(params, 60);
    expect(Number.isFinite(energy.driveJ)).toBe(true);
    expect(Number.isFinite(energy.loadJ)).toBe(true);
    expect(Number.isFinite(energy.internalJ)).toBe(true);
    close(integralSinSquared(0.3, 1e-9, 60), 60 * Math.sin(0.3) ** 2, 1e-5);
    const state = generatorStateAt(params, 60);
    expect(Number.isFinite(state.emfV)).toBe(true);
  });

  it('solves a full deterministic sample set with stable key times', () => {
    const solution = solveGenerator(base());
    expect(solution.status).toBe('ok');
    expect(solution.samples.length).toBeGreaterThan(100);
    expect(solution.keyTimesS[0]).toBe(0);
    expect(solution.keyTimesS[solution.keyTimesS.length - 1]).toBeCloseTo(1, 12);
    expect(solution.samples.every((sample) => Number.isFinite(sample.emfV))).toBe(true);
    expect(solution.final.energy.residualJ).not.toBeNull();
    expect(Math.abs(solution.final.energy.residualJ ?? Number.NaN)).toBeLessThan(1e-9);
  });
});
