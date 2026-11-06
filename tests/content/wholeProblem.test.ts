import { describe, expect, it } from 'vitest';
import { PROBLEM_CASES, problemCaseById } from '../../src/content/problemCases';
import { buildWholeProblemModel } from '../../src/features/cases/wholeProblem/buildWholeProblem';
import type { WholeProblemModel } from '../../src/features/cases/wholeProblem/types';

function build(caseId: string, overrides: Record<string, number> = {}): WholeProblemModel {
  const item = problemCaseById(caseId);
  if (!item) throw new Error(`missing case ${caseId}`);
  const baseline = Object.fromEntries(
    item.wholeProblem.variations.map((variation) => [variation.parameterKey, variation.baseValue]),
  );
  return buildWholeProblemModel({
    caseId,
    adapterId: item.wholeProblem.adapterId,
    overrides,
    baseline,
  });
}

function answer(model: WholeProblemModel, key: string): number {
  const observable = model.answers[key];
  expect(observable, `${model.caseId}/${key}`).toBeDefined();
  expect(observable.value, `${model.caseId}/${key}`).not.toBeNull();
  return observable.value as number;
}

describe('Round 16/17 whole-problem adapter anchors', () => {
  it('builds all nine cases with real events and no stale derivation event references', () => {
    expect(PROBLEM_CASES).toHaveLength(9);
    for (const item of PROBLEM_CASES) {
      const model = build(item.id);
      expect(model.coverage).toBe('full_problem_simulated');
      expect(model.durationS).toBeGreaterThan(0);
      expect(model.events.length).toBeGreaterThanOrEqual(2);
      for (const part of item.parts) {
        for (const step of part.derivationSteps) {
          if (!step.referenceEventId) continue;
          expect(model.events.some((event) => event.id === step.referenceEventId), `${item.id}/${part.id}/${step.id} -> ${step.referenceEventId}`).toBe(true);
        }
      }
    }
  });

  it('keeps every part baseline consistent with the current solver answers', () => {
    for (const item of PROBLEM_CASES) {
      const model = build(item.id);
      for (const part of item.parts) {
        const observable = model.answers[part.answerSpec.quantity];
        expect(observable, `${item.id}/${part.id}`).toBeDefined();
        expect(observable.value, `${item.id}/${part.id}`).not.toBeNull();
        expect(observable.unit).toBe(part.answerSpec.unit);
        const value = observable.value as number;
        const tolerance = Math.max(part.answerSpec.tolerance.abs, part.answerSpec.tolerance.rel * Math.abs(value));
        expect(Math.abs(value - part.answerSpec.baselineValue), `${item.id}/${part.id}`).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it('matches C01 P04 and C04 I03 independent anchors', () => {
    const c01 = build('case-c01-boundary-exit');
    expect(answer(c01, 'exitTimeS')).toBeCloseTo(Math.PI / 6, 8);
    expect(answer(c01, 'exitY')).toBeCloseTo(1 - Math.sqrt(3) / 2, 8);
    expect(answer(c01, 'criticalWidthM')).toBeCloseTo(1, 8);
    const c04 = build('case-c04-loop-entry');
    expect(answer(c04, 'fluxWb')).toBeCloseTo(0.01, 9);
    expect(answer(c04, 'emfV')).toBeCloseTo(-0.3, 8);
    expect(answer(c04, 'currentA')).toBeCloseTo(-0.6, 8);
  });

  it('matches C02 multi-particle global-time anchors', () => {
    const model = build('case-c02-alternating-time');
    expect(answer(model, 'aFirstCrossTimeS')).toBeCloseTo(Math.PI, 8);
    expect(answer(model, 'aSecondCrossY')).toBeCloseTo(-4, 8);
    expect(answer(model, 'bFirstCrossGlobalS')).toBeCloseTo(1 + Math.PI, 8);
    const bEvent = model.events.find((event) => event.id === 'b-cross-1');
    expect(bEvent?.t).toBeCloseTo(1 + Math.PI, 8);
  });

  it('matches C03 P07 continuous beamline anchors', () => {
    const model = build('case-c03-beamline-detector');
    expect(answer(model, 'selectorExitSpeed')).toBeCloseTo(2, 8);
    expect(answer(model, 'analyzerRadiusM')).toBeCloseTo(2, 8);
    expect(answer(model, 'arrivalTimeS')).toBeCloseTo(3.678299314, 8);
    expect(answer(model, 'screenY')).toBeCloseTo(1.0893163975, 8);
    const screen = model.events.find((event) => event.id === 'screen');
    expect(screen?.t).toBeCloseTo(answer(model, 'arrivalTimeS'), 8);
    expect(screen?.y).toBeCloseTo(answer(model, 'screenY'), 8);
  });

  it('matches C05 I05 product-rule and power anchors', () => {
    const model = build('case-c05-loop-changing-field');
    expect(answer(model, 'emfTransformerV')).toBeCloseTo(-0.5, 8);
    expect(answer(model, 'emfTotalV')).toBeCloseTo(-3, 8);
    expect(answer(model, 'joulePowerW')).toBeCloseTo(4.5, 8);
  });

  it('matches C06 I07 field-plus-wall continuous anchors', () => {
    const model = build('case-c06-opposite-wall');
    expect(answer(model, 'initialEmfV')).toBeCloseTo(16, 6);
    expect(answer(model, 'impactLossJ')).toBeCloseTo(1.215, 6);
    expect(answer(model, 'postBounceSpeedMps')).toBeCloseTo(-0.9, 6);
    const bounce = model.events.find((event) => event.id === 'wall-bounce');
    expect(bounce).toBeDefined();
    expect(bounce?.t).toBeGreaterThan(0.3);
    expect(bounce?.t).toBeLessThan(1);
  });

  it('matches C07 analyzer geometry and critical field anchors', () => {
    const model = build('case-c07-analyzer-critical');
    expect(answer(model, 'screenY')).toBeCloseTo(2 - 2 * Math.sqrt(3) / 3, 8);
    expect(answer(model, 'screenYOpposite')).toBeCloseTo(-(2 - 2 * Math.sqrt(3) / 3), 8);
    expect(answer(model, 'criticalAnalyzerB')).toBeCloseTo(2, 8);
  });

  it('matches C08 I06 contact and energy anchors', () => {
    const model = build('case-c08-dual-rod-contact');
    expect(answer(model, 'initialCurrentA')).toBeCloseTo(1, 8);
    expect(answer(model, 'contactTimeS')).toBeCloseTo(Math.log(2), 8);
    expect(answer(model, 'contactHeatJ')).toBeCloseTo(0.75, 8);
    const contact = model.events.find((event) => event.id === 'contact');
    expect(contact?.t).toBeCloseTo(Math.log(2), 8);
  });

  it('matches the Round 17 A17-01 cross-solver continuous anchors and events', () => {
    const model = build('case-a17-electric-magnetic-screen');
    expect(model.adapterId).toBe('a17-electric-magnetic-screen');
    expect(answer(model, 'accelerationExitSpeedMps')).toBeCloseTo(Math.sqrt(3), 9);
    expect(answer(model, 'accelerationTimeS')).toBeCloseTo(Math.sqrt(3) - 1, 9);
    expect(answer(model, 'magneticExitY')).toBeCloseTo(Math.sqrt(3) - 1.5, 9);
    expect(answer(model, 'screenY')).toBeCloseTo((4 * Math.sqrt(3)) / 3 - 1.5, 9);
    expect(answer(model, 'totalTimeS')).toBeCloseTo(Math.sqrt(3) - 1 + Math.PI / 6 + 2 / 3, 9);
    const handoffs = model.events.filter((event) => event.kind === 'handoff');
    expect(handoffs).toHaveLength(2);
    expect(handoffs.every((event) => event.label.includes('位置误差'))).toBe(true);
    expect(model.events.some((event) => event.id === 'a-exit')).toBe(true);
    expect(model.events.some((event) => event.id === 'b-exit')).toBe(true);
    expect(model.events.some((event) => event.id === 'screen-hit')).toBe(true);
    const frame = model.frameAt(answer(model, 'totalTimeS'));
    expect(frame.markers[0].x).toBeCloseTo(2 + Math.sqrt(3) / 2, 8);
    expect(frame.markers[0].y).toBeCloseTo((4 * Math.sqrt(3)) / 3 - 1.5, 8);
    expect(frame.observables.stage.note).toContain('阶段 C');
  });

  it('recomputes A17-01 downstream trajectories and hides stale screen answers', () => {
    const stronger = build('case-a17-electric-magnetic-screen', { electricFieldX: 2 });
    expect(stronger.hasChanges).toBe(true);
    expect(answer(stronger, 'accelerationExitSpeedMps')).toBeCloseTo(Math.sqrt(5), 8);
    expect(answer(stronger, 'magneticExitY')).not.toBeCloseTo(Math.sqrt(3) - 1.5, 5);
    expect(answer(stronger, 'screenY')).not.toBeCloseTo((4 * Math.sqrt(3)) / 3 - 1.5, 5);

    const noScreen = build('case-a17-electric-magnetic-screen', { magneticFieldZ: -2 });
    expect(noScreen.issue).toContain('出场');
    expect(noScreen.answers.screenY.value).toBeNull();
    expect(noScreen.events.some((event) => event.id === 'screen-hit')).toBe(false);
    expect(noScreen.events.some((event) => event.id === 'screen-missed')).toBe(true);
  });

  it('recomputes answers and outcomes after variations', () => {
    const absorbed = build('case-c03-beamline-detector', { incidentSpeedMps: 1.5 });
    expect(absorbed.hasChanges).toBe(true);
    expect(absorbed.answers.screenY.value).toBeNull();
    expect(absorbed.observations.outcome.value).toBeNull();
    expect(absorbed.events.some((event) => event.id === 'absorbed')).toBe(true);

    const elastic = build('case-c06-opposite-wall', { restitution: 1 });
    expect(elastic.answers.impactLossJ.value).toBeCloseTo(0, 8);
    expect(elastic.answers.postBounceSpeedMps.value).toBeCloseTo(-1.8, 5);

    const noField = build('case-c08-dual-rod-contact', { bz: 0 });
    expect(noField.answers.contactTimeS.value).toBeCloseTo(0.5, 8);
    expect(noField.answers.contactHeatJ.value).toBeCloseTo(0, 8);

    const reversed = build('case-c07-analyzer-critical', { analyzerBz: 1 });
    expect(reversed.answers.screenY.value).toBeCloseTo(-(2 - 2 * Math.sqrt(3) / 3), 8);
  });
});
