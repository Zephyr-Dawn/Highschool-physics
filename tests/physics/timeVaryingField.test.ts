import { describe, expect, it } from 'vitest';
import {
  applyManualTarget,
  createManualTimeline,
  evaluateInduction,
  evaluateManualField,
  evaluateWaveform,
  normalizeInductionParams,
  sampleInductionSeries,
  waveformEvents,
  type InductionParams,
  type WaveformConfig,
} from '../../src/physics/induction/timeVaryingField';

const baseParams: InductionParams = {
  turns: 10,
  areaM2: 0.02,
  resistanceOhm: 5,
  circuitClosed: true,
};

function waveform(patch: Partial<WaveformConfig>): WaveformConfig {
  return {
    kind: 'linear',
    durationS: 4,
    b0Tesla: 0.2,
    slopeTeslaPerS: 0.5,
    amplitudeTesla: 0.3,
    frequencyHz: 1,
    phaseRad: 0,
    riseS: 1,
    topS: 1,
    fallS: 1,
    bottomS: 1,
    ...patch,
  };
}

describe('I04 analytic induction physics', () => {
  it('T1: linear rising field uses Faraday flux linkage and produces clockwise current', () => {
    const wave = evaluateWaveform(waveform({ kind: 'linear', b0Tesla: 0.2, slopeTeslaPerS: 0.5 }), 0);
    const state = evaluateInduction(baseParams, wave, true);

    expect(wave.bzTesla).toBeCloseTo(0.2, 12);
    expect(wave.dbdt).toBeCloseTo(0.5, 12);
    expect(state.fluxPerTurnWb).toBeCloseTo(0.004, 12);
    expect(state.fluxLinkageWbTurn).toBeCloseTo(0.04, 12);
    expect(state.emfV).toBeCloseTo(-0.1, 12);
    expect(state.currentA).toBeCloseTo(-0.02, 12);
    expect(state.resistivePowerW).toBeCloseTo(0.002, 12);
    expect(state.currentDirection).toBe('clockwise');
    expect(state.inducedFieldDirection).toBe('into-page');
  });

  it('T2: a nonzero constant field has zero EMF and current', () => {
    const wave = evaluateWaveform(waveform({ kind: 'constant', b0Tesla: 0.2 }), 1.3);
    const state = evaluateInduction(baseParams, wave, true);

    expect(wave.bzTesla).toBeCloseTo(0.2, 12);
    expect(state.fluxPerTurnWb).toBeCloseTo(0.004, 12);
    expect(state.emfV).toBeCloseTo(0, 12);
    expect(state.currentA).toBeCloseTo(0, 12);
    expect(state.currentDirection).toBe('none');
  });

  it('T3: sine field and its analytic cosine derivative match the benchmark times', () => {
    const cosine = waveform({ kind: 'sine', b0Tesla: 0, amplitudeTesla: 0.3, frequencyHz: 1 });
    const params: InductionParams = { turns: 20, areaM2: 0.01, resistanceOhm: 4, circuitClosed: true };

    const t0 = evaluateInduction(params, evaluateWaveform(cosine, 0), true);
    expect(t0.emfV).toBeCloseTo(-0.12 * Math.PI, 12);
    expect(t0.currentA).toBeCloseTo(-0.03 * Math.PI, 12);

    const quarter = evaluateInduction(params, evaluateWaveform(cosine, 0.25), true);
    expect(quarter.fluxPerTurnWb).toBeCloseTo(0.003, 12);
    expect(quarter.bzTesla).toBeCloseTo(0.3, 12);
    expect(quarter.emfV).toBeCloseTo(0, 12);
    expect(quarter.currentA).toBeCloseTo(0, 12);

    const half = evaluateInduction(params, evaluateWaveform(cosine, 0.5), true);
    expect(half.bzTesla).toBeCloseTo(0, 12);
    expect(half.emfV).toBeCloseTo(0.12 * Math.PI, 12);
    expect(half.currentA).toBeCloseTo(0.03 * Math.PI, 12);
    expect(half.currentDirection).toBe('counterclockwise');
  });

  it('T4: an open circuit keeps EMF but has zero current and zero power', () => {
    const wave = evaluateWaveform(waveform({ kind: 'linear' }), 0);
    const open = evaluateInduction({ ...baseParams, circuitClosed: false }, wave, false);

    expect(open.emfV).toBeCloseTo(-0.1, 12);
    expect(open.currentA).toBe(0);
    expect(open.resistivePowerW).toBe(0);
    expect(open.currentDirection).toBe('none');
  });

  it('T5: doubling turns doubles EMF and current at fixed total resistance', () => {
    const wave = evaluateWaveform(waveform({ kind: 'linear' }), 0);
    const base = evaluateInduction(baseParams, wave, true);
    const doubled = evaluateInduction({ ...baseParams, turns: 20 }, wave, true);

    expect(Math.abs(doubled.emfV!)).toBeCloseTo(Math.abs(base.emfV!) * 2, 12);
    expect(Math.abs(doubled.currentA!)).toBeCloseTo(Math.abs(base.currentA!) * 2, 12);
  });

  it('T6: doubling resistance halves current and power but leaves EMF unchanged', () => {
    const wave = evaluateWaveform(waveform({ kind: 'linear' }), 0);
    const base = evaluateInduction(baseParams, wave, true);
    const doubled = evaluateInduction({ ...baseParams, resistanceOhm: 10 }, wave, true);

    expect(doubled.emfV).toBeCloseTo(base.emfV!, 12);
    expect(doubled.currentA).toBeCloseTo(base.currentA! / 2, 12);
    expect(doubled.resistivePowerW).toBeCloseTo(base.resistivePowerW! / 2, 12);
  });

  it('T7: B passing through zero does not suppress or reverse EMF when the slope is unchanged', () => {
    const atZero = evaluateInduction(
      baseParams,
      evaluateWaveform(waveform({ kind: 'linear', b0Tesla: -0.1, slopeTeslaPerS: 0.5 }), 0.2),
      true,
    );

    expect(atZero.bzTesla).toBeCloseTo(0, 12);
    expect(atZero.emfV).toBeCloseTo(-0.1, 12);
    expect(atZero.currentA).toBeCloseTo(-0.02, 12);
    expect(atZero.currentDirection).toBe('clockwise');
  });

  it('T8: triangle kinks are explicitly non-differentiable and keep both one-sided slopes', () => {
    const triangle = waveform({
      kind: 'triangle',
      b0Tesla: 0,
      amplitudeTesla: 0.4,
      riseS: 1,
      topS: 1,
      fallS: 1,
      bottomS: 1,
      durationS: 4,
    });
    const kink = evaluateWaveform(triangle, 1);
    expect(kink.atKink).toBe(true);
    expect(kink.dbdt).toBeNull();
    expect(kink.dbdtLeft).toBeCloseTo(0.4, 12);
    expect(kink.dbdtRight).toBeCloseTo(0, 12);

    const atKinkState = evaluateInduction(
      { turns: 1, areaM2: 1, resistanceOhm: 1, circuitClosed: true },
      kink,
      true,
    );
    expect(atKinkState.emfV).toBeNull();
    expect(atKinkState.currentA).toBeNull();
    expect(atKinkState.emfLeftV).toBeCloseTo(-0.4, 12);
    expect(atKinkState.emfRightV).toBeCloseTo(0, 12);
    expect(Number.isFinite(atKinkState.fluxPerTurnWb)).toBe(true);

    const fallingKink = evaluateWaveform(triangle, 2);
    expect(fallingKink.atKink).toBe(true);
    expect(fallingKink.dbdtLeft).toBeCloseTo(0, 12);
    expect(fallingKink.dbdtRight).toBeCloseTo(-0.4, 12);
    const fallingState = evaluateInduction(
      { turns: 1, areaM2: 1, resistanceOhm: 1, circuitClosed: true },
      fallingKink,
      true,
    );
    expect(fallingState.emfLeftV).toBeCloseTo(0, 12);
    expect(fallingState.emfRightV).toBeCloseTo(0.4, 12);
    expect(fallingState.currentDirection).toBe('undefined');

    const noPlateau = waveform({
      kind: 'triangle',
      b0Tesla: 0,
      amplitudeTesla: 0.4,
      riseS: 1,
      topS: 0,
      fallS: 1,
      bottomS: 0,
      durationS: 2,
    });
    const opposite = evaluateWaveform(noPlateau, 1);
    expect(opposite.atKink).toBe(true);
    expect(opposite.dbdtLeft).toBeCloseTo(0.4, 12);
    expect(opposite.dbdtRight).toBeCloseTo(-0.4, 12);

    const events = waveformEvents(triangle);
    expect(events.filter((event) => event.kind === 'kink').length).toBeGreaterThanOrEqual(3);
    const series = sampleInductionSeries(
      { turns: 1, areaM2: 1, resistanceOhm: 1, circuitClosed: true },
      triangle,
      true,
    );
    expect(series.points.every((point) => Number.isFinite(point.fluxPerTurnWb))).toBe(true);
    expect(series.points.some((point) => point.side === 'left')).toBe(true);
    expect(series.points.some((point) => point.side === 'right')).toBe(true);
    expect(series.points.some((point) => point.emfV !== null && Math.abs(point.emfV) > 1e-12)).toBe(true);
  });

  it('T9: manual field ramps are continuous, direction-sensitive and settle to zero', () => {
    let timeline = createManualTimeline(0.5, { rampSeconds: 0.2, maxAbsRateTeslaPerS: 4 });
    const up = applyManualTarget(timeline, 0, 1.1);
    timeline = up.timeline;
    expect(up.limited).toBe(false);
    expect(up.rateTeslaPerS).toBeCloseTo(3, 12);

    const mid = evaluateManualField(timeline, 0.1);
    expect(mid.bzTesla).toBeCloseTo(0.8, 12);
    expect(mid.dbdt).toBeCloseTo(3, 12);

    const beforeBoundary = evaluateManualField(timeline, 0.199999);
    const atBoundary = evaluateManualField(timeline, 0.2);
    expect(Math.abs(atBoundary.bzTesla - beforeBoundary.bzTesla)).toBeLessThan(1e-5);
    expect(atBoundary.bzTesla).toBeCloseTo(1.1, 12);
    expect(atBoundary.dbdt).toBeCloseTo(0, 12);

    const down = applyManualTarget(timeline, 0.2, 0.3);
    timeline = down.timeline;
    expect(down.rateTeslaPerS).toBeCloseTo(-4, 12);
    expect(evaluateManualField(timeline, 0.3).dbdt).toBeCloseTo(-4, 12);
    expect(evaluateManualField(timeline, 0.4).dbdt).toBeCloseTo(0, 12);
    expect(evaluateManualField(timeline, 0.4).bzTesla).toBeCloseTo(0.3, 12);

    const slower = applyManualTarget(createManualTimeline(0.5, { rampSeconds: 0.4, maxAbsRateTeslaPerS: 4 }), 0, 1.1);
    expect(Math.abs(slower.rateTeslaPerS)).toBeLessThan(Math.abs(up.rateTeslaPerS));

    const limited = applyManualTarget(
      createManualTimeline(0, { rampSeconds: 0.1, maxAbsRateTeslaPerS: 1 }),
      0,
      2,
    );
    expect(limited.limited).toBe(true);
    expect(limited.rateTeslaPerS).toBeCloseTo(1, 12);

    const unchanged = applyManualTarget(timeline, 0.5, Number.NaN);
    expect(unchanged.timeline).toBe(timeline);
    expect(evaluateManualField(timeline, 0.5).bzTesla).toBeCloseTo(0.3, 12);
  });

  it('T10: invalid and extreme parameters are finite and never produce NaN or Infinity', () => {
    const normalized = normalizeInductionParams({
      turns: Number.NaN,
      areaM2: -3,
      resistanceOhm: 0,
      circuitClosed: true,
    });
    expect(Number.isInteger(normalized.params.turns)).toBe(true);
    expect(normalized.params.turns).toBeGreaterThanOrEqual(1);
    expect(normalized.params.areaM2).toBeGreaterThan(0);
    expect(normalized.params.resistanceOhm).toBeGreaterThan(0);
    expect(normalized.issues.length).toBeGreaterThan(0);

    const extreme = evaluateInduction(
      { turns: 1000, areaM2: 100, resistanceOhm: 1e-9, circuitClosed: true },
      evaluateWaveform(waveform({ kind: 'sine', amplitudeTesla: 10, frequencyHz: 20 }), 0),
      true,
    );
    expect(Number.isFinite(extreme.fluxPerTurnWb)).toBe(true);
    expect(Number.isFinite(extreme.emfV!)).toBe(true);
    expect(Number.isFinite(extreme.currentA!)).toBe(true);
    expect(Number.isFinite(extreme.resistivePowerW!)).toBe(true);
  });

  it('keeps EMF/current direction and series consistent with dB/dt', () => {
    const rising = evaluateInduction(baseParams, evaluateWaveform(waveform({ slopeTeslaPerS: 0.5 }), 0), true);
    const falling = evaluateInduction(baseParams, evaluateWaveform(waveform({ slopeTeslaPerS: -0.5 }), 0), true);

    expect(rising.emfV!).toBeLessThan(0);
    expect(rising.currentA!).toBeLessThan(0);
    expect(rising.currentDirection).toBe('clockwise');
    expect(falling.emfV!).toBeGreaterThan(0);
    expect(falling.currentA!).toBeGreaterThan(0);
    expect(falling.currentDirection).toBe('counterclockwise');

    const series = sampleInductionSeries(baseParams, waveform({ kind: 'linear' }), true, 120);
    expect(series.durationS).toBe(4);
    for (const point of series.points) {
      expect(Number.isFinite(point.bzTesla)).toBe(true);
      expect(Number.isFinite(point.fluxPerTurnWb)).toBe(true);
      expect(Number.isFinite(point.fluxLinkageWbTurn)).toBe(true);
      if (point.emfV !== null) expect(Number.isFinite(point.emfV)).toBe(true);
      if (point.currentA !== null) expect(Number.isFinite(point.currentA)).toBe(true);
    }
    const definite = series.points.filter((point) => point.currentA !== null);
    expect(definite.length).toBeGreaterThan(20);
    expect(definite.every((point) => Math.abs(point.currentA! + 0.02) < 1e-9)).toBe(true);
  });
});
