import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCALAR_RATE_SETTINGS,
  estimateScalarRate,
  evaluateFluxLenz,
  unwrapAngle,
  type FluxLenzInput,
} from '../../src/physics/induction/fluxLenz';

const base: FluxLenzInput = {
  mode: 'field',
  Bz: 0.5,
  areaM2: 0.02,
  thetaRad: 0,
  dBdt: 0,
  dAdt: 0,
  dThetaDt: 0,
  turns: 10,
  resistanceOhm: 4,
  circuitClosed: true,
  derivativeQuality: 'exact',
};

function flux(patch: Partial<FluxLenzInput>) {
  return evaluateFluxLenz({ ...base, ...patch });
}

describe('I01 flux, flux linkage and Lenz law', () => {
  it('L1 computes Φ and Ψ with the correct turn count', () => {
    const snapshot = flux({});
    expect(snapshot.phiWb).toBeCloseTo(0.01, 12);
    expect(snapshot.psiWbTurn).toBeCloseTo(0.1, 12);
  });

  it('L2 increasing B drives the expected EMF, current and induced field', () => {
    const snapshot = flux({ dBdt: 2 });
    expect(snapshot.dPsiDtWbTurnPerS).toBeCloseTo(0.4, 12);
    expect(snapshot.emfV).toBeCloseTo(-0.4, 12);
    expect(snapshot.currentA).toBeCloseTo(-0.1, 12);
    expect(snapshot.joulePowerW).toBeCloseTo(0.04, 12);
    expect(snapshot.currentSense).toBe('clockwise-relative-normal');
    expect(snapshot.inducedFieldDirection).toBe('opposite-normal');
  });

  it('L3 increasing and decreasing area reverse the EMF and current', () => {
    const increasing = flux({ mode: 'area', turns: 1, Bz: 0.5, areaM2: 0.12, dAdt: 0.2 });
    const decreasing = flux({ mode: 'area', turns: 1, Bz: 0.5, areaM2: 0.12, dAdt: -0.2 });
    expect(increasing.emfV).toBeCloseTo(-0.1, 12);
    expect(decreasing.emfV).toBeCloseTo(0.1, 12);
    expect(increasing.currentSense).not.toBe(decreasing.currentSense);
  });

  it('L4 rotating coil has zero EMF at θ=0 and peak EMF at θ=π/2', () => {
    const atZero = flux({ mode: 'angle', turns: 1, Bz: 1, areaM2: 0.1, thetaRad: 0, dThetaDt: 2 });
    const atQuarter = flux({ mode: 'angle', turns: 1, Bz: 1, areaM2: 0.1, thetaRad: Math.PI / 2, dThetaDt: 2 });
    expect(atZero.emfV).toBeCloseTo(0, 12);
    expect(atQuarter.emfV).toBeCloseTo(0.2, 12);
    expect(atQuarter.currentSense).toBe('counterclockwise-relative-normal');
  });

  it('L5 open circuit keeps EMF but removes current and Joule power', () => {
    const closed = flux({ dBdt: 2 });
    const open = flux({ dBdt: 2, circuitClosed: false });
    expect(open.emfV).toBeCloseTo(closed.emfV ?? NaN, 12);
    expect(open.currentA).toBe(0);
    expect(open.joulePowerW).toBe(0);
    expect(open.currentSense).toBe('open-no-current');
    expect(open.inducedFieldDirection).toBe('none');
    expect(open.emfSense).toBe('negative');
  });

  it('L6 zero flux does not imply zero EMF', () => {
    const snapshot = flux({ Bz: 0, dBdt: 3, thetaRad: 0, turns: 1, areaM2: 0.02 });
    expect(snapshot.phiWb).toBe(0);
    expect(snapshot.emfV).toBeCloseTo(-0.06, 12);
    expect(snapshot.emfV).not.toBe(0);
  });

  it('L7 large flux with zero all derivatives has zero EMF and current', () => {
    const snapshot = flux({ Bz: 2, areaM2: 0.5, dBdt: 0, dAdt: 0, dThetaDt: 0, turns: 5 });
    expect(snapshot.phiWb).toBeCloseTo(1, 12);
    expect(snapshot.emfV).toBe(0);
    expect(snapshot.currentA).toBe(0);
    expect(snapshot.currentSense).toBe('none');
  });

  it('L8 normal flip changes Φ sign and the EMF sign for the same dB/dt', () => {
    const zero = flux({ mode: 'angle', thetaRad: 0, dBdt: 2, turns: 1, areaM2: 0.02 });
    const flipped = flux({ mode: 'angle', thetaRad: Math.PI, dBdt: 2, turns: 1, areaM2: 0.02 });
    expect(zero.phiWb).toBeCloseTo(0.01, 12);
    expect(flipped.phiWb).toBeCloseTo(-0.01, 12);
    expect((zero.emfV ?? 0) * (flipped.emfV ?? 0)).toBeLessThan(0);
  });

  it('L9 full product-rule derivative matches an independent hand calculation', () => {
    const snapshot = evaluateFluxLenz({
      mode: 'angle',
      Bz: 0.4,
      areaM2: 0.5,
      thetaRad: 1.1,
      dBdt: 0.7,
      dAdt: 0.2,
      dThetaDt: -0.3,
      turns: 3,
      resistanceOhm: 5,
      circuitClosed: true,
      derivativeQuality: 'exact',
    });
    const cos = Math.cos(1.1);
    const sin = Math.sin(1.1);
    const expectedDPsi = 3 * (0.5 * cos * 0.7 + 0.4 * cos * 0.2 - 0.4 * 0.5 * sin * -0.3);
    expect(snapshot.dPsiDtWbTurnPerS).toBeCloseTo(expectedDPsi, 10);
    expect(snapshot.emfV).toBeCloseTo(-expectedDPsi, 10);
    expect(snapshot.currentA).toBeCloseTo(-expectedDPsi / 5, 10);
  });

  it('L10 timestamped area motion gives the correct sign, decays on hold and stays monotonic', () => {
    const samples = [
      { tS: 0, value: 0.5 },
      { tS: 0.04, value: 0.54 },
      { tS: 0.09, value: 0.59 },
      { tS: 0.14, value: 0.64 },
      { tS: 0.18, value: 0.68 },
    ];
    const rate = estimateScalarRate(samples, 0.18, DEFAULT_SCALAR_RATE_SETTINGS);
    expect(rate).toBeGreaterThan(0.9);
    expect(rate).toBeLessThan(1.1);
    const increasing = flux({ mode: 'area', turns: 1, Bz: 0.5, areaM2: 0.12, dAdt: 0.2, derivativeQuality: 'estimated' });
    const decreasing = flux({ mode: 'area', turns: 1, Bz: 0.5, areaM2: 0.12, dAdt: -0.2, derivativeQuality: 'estimated' });
    expect(increasing.emfV).toBeLessThan(0);
    expect(decreasing.emfV).toBeGreaterThan(0);
    const held = samples.map((sample) => ({ tS: sample.tS, value: 0.68 }));
    expect(Math.abs(estimateScalarRate(held, 0.18, DEFAULT_SCALAR_RATE_SETTINGS))).toBeLessThan(1e-9);
    expect(samples.every((sample, index) => index === 0 || sample.tS > samples[index - 1].tS)).toBe(true);
  });

  it('L11 unwraps angles across 359°/1° without a large false rate', () => {
    const deg = Math.PI / 180;
    const first = unwrapAngle(350 * deg, 359 * deg);
    const second = unwrapAngle(first, 1 * deg);
    expect(first / deg).toBeCloseTo(359, 10);
    expect(second / deg).toBeCloseTo(361, 10);
    const unwrapped = [
      { tS: 0, value: 350 * deg },
      { tS: 0.05, value: first },
      { tS: 0.1, value: second },
    ];
    const rate = estimateScalarRate(unwrapped, 0.1, DEFAULT_SCALAR_RATE_SETTINGS);
    expect(rate).toBeGreaterThan(1);
    expect(rate).toBeLessThan(6);

    const reverseFirst = unwrapAngle(1 * deg, 359 * deg);
    expect(reverseFirst / deg).toBeCloseTo(-1, 10);
  });

  it('L12 Lenz direction: increasing outward flux opposes; decreasing inward flux restores outward', () => {
    const outwardIncreasing = flux({ Bz: 0.5, dBdt: 2, thetaRad: 0 });
    expect(outwardIncreasing.emfSense).toBe('negative');
    expect(outwardIncreasing.inducedFieldDirection).toBe('opposite-normal');
    const inwardMoreNegative = flux({ Bz: -0.5, dBdt: -2, thetaRad: 0 });
    expect(inwardMoreNegative.emfSense).toBe('positive');
    expect(inwardMoreNegative.inducedFieldDirection).toBe('along-normal');
  });

  it('L13 rejects illegal parameters and non-finite derivatives safely', () => {
    const invalid = evaluateFluxLenz({
      ...base,
      turns: 0,
      resistanceOhm: 0,
      areaM2: -1,
      dBdt: Number.NaN,
    });
    expect(invalid.issues.length).toBeGreaterThan(0);
    expect(Number.isFinite(invalid.phiWb)).toBe(true);
    expect(Number.isFinite(invalid.psiWbTurn)).toBe(true);
    expect(invalid.emfV).toBeNull();
    expect(invalid.currentA).toBeNull();
    expect(invalid.joulePowerW).toBeNull();
    expect(invalid.derivativeQuality).toBe('undefined');
    expect(Number.isFinite(invalid.turns)).toBe(true);
    expect(invalid.resistanceOhm).toBeGreaterThan(0);
  });

  it('L14 scalar estimator rejects huge gaps and duplicate timestamps', () => {
    expect(
      estimateScalarRate(
        [
          { tS: 0, value: 0 },
          { tS: 2, value: 10 },
        ],
        2,
        DEFAULT_SCALAR_RATE_SETTINGS,
      ),
    ).toBe(0);
    expect(
      estimateScalarRate(
        [
          { tS: 0.1, value: 0 },
          { tS: 0.1, value: 1 },
        ],
        0.1,
        DEFAULT_SCALAR_RATE_SETTINGS,
      ),
    ).toBe(0);
  });

  it('keeps IR=ε, P_J≥0 and the no-change identities', () => {
    const snapshot = flux({ dBdt: 2, dAdt: 0.1, dThetaDt: 0.2, thetaRad: 0.4 });
    expect(snapshot.currentA).not.toBeNull();
    expect((snapshot.currentA ?? 0) * 4).toBeCloseTo(snapshot.emfV ?? NaN, 10);
    expect(snapshot.joulePowerW ?? -1).toBeGreaterThanOrEqual(0);
    const noChange = flux({ Bz: 1.2, areaM2: 0.2, thetaRad: 0.9, dBdt: 0, dAdt: 0, dThetaDt: 0 });
    expect(noChange.emfV).toBe(0);
    expect(noChange.currentA).toBe(0);
  });
});
