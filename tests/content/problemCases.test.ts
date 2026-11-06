import { describe, expect, it } from 'vitest';
import { PROBLEM_CASES, problemCaseById } from '../../src/content/problemCases';
import { problemCasesSchema } from '../../src/content/problemCaseSchema';
import { SIMULATIONS } from '../../src/simulations/registry';
import { P04_PRESETS, p04SolutionFor } from '../../src/simulations/particle/p04Scene';
import { P05_PRESETS, p05SolutionFor } from '../../src/simulations/particle/p05Scene';
import { P07_PRESETS, p07SolutionFor } from '../../src/simulations/particle/p07Scene';
import { P06_PRESETS } from '../../src/simulations/particle/p06Scene';
import { I03_PRESETS, i03EngineParams } from '../../src/simulations/induction/params';
import { simulateLoop, stateAtTime } from '../../src/physics/induction/loopField';
import { I05_PRESETS } from '../../src/simulations/induction/i05Scene';
import { solveI05, stateAtI05Time } from '../../src/physics/induction/movingLoopSolver';
import { I07_PRESETS } from '../../src/simulations/induction/i07Scene';
import { I06_PRESETS } from '../../src/simulations/induction/i06Scene';
import { computeI07Snapshot, solveI07 } from '../../src/physics/induction/oppositeFieldsWallLoop';

const MODEL_IDS = new Set(SIMULATIONS.map((simulation) => simulation.id));
const PRESETS: Record<string, Record<string, unknown>> = {
  p04: P04_PRESETS,
  p05: P05_PRESETS,
  p07: P07_PRESETS,
  p06: P06_PRESETS,
  i03: I03_PRESETS,
  i05: I05_PRESETS,
  i07: I07_PRESETS,
  i06: I06_PRESETS,
};

function expected(caseId: string, stageId: string, key: string): number {
  const value = problemCaseById(caseId)?.stages.find((stage) => stage.id === stageId)?.expected[key]?.value;
  expect(value, `${caseId}/${stageId}/${key}`).toBeTypeOf('number');
  return value as number;
}

describe('Round 15 typed problem cases', () => {
  it('validates nine unique original cases with particle/induction and multistage coverage', () => {
    expect(problemCasesSchema.safeParse(PROBLEM_CASES).success).toBe(true);
    expect(PROBLEM_CASES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(PROBLEM_CASES.map((item) => item.id)).size).toBe(PROBLEM_CASES.length);
    const particle = PROBLEM_CASES.filter((item) => item.stages.some((stage) => stage.modelId.startsWith('p')));
    const induction = PROBLEM_CASES.filter((item) => item.stages.some((stage) => stage.modelId.startsWith('i')));
    expect(particle.length).toBeGreaterThanOrEqual(3);
    expect(induction.length).toBeGreaterThanOrEqual(3);
    expect(PROBLEM_CASES.filter((item) => item.stages.length >= 2).length).toBeGreaterThanOrEqual(2);
    for (const item of PROBLEM_CASES) {
      expect(item.provenance.sourceKind).toBe('original_case');
      expect(item.provenance.verification).toBe('paper_and_solution_verified');
      expect(item.provenance.rights).toBe('original');
      expect(item.stem.length).toBeGreaterThan(40);
      expect(item.reasoningSteps.length).toBeGreaterThanOrEqual(4);
      expect(item.variations.length).toBeGreaterThanOrEqual(2);
      expect(item.dimensionalCheck.length).toBeGreaterThan(10);
    }
  });

  it('maps every stage to a real model and an existing preset', () => {
    for (const item of PROBLEM_CASES) {
      for (const stage of item.stages) {
        expect(MODEL_IDS.has(stage.modelId), `${item.id}/${stage.id}`).toBe(true);
        const presets = PRESETS[stage.modelId];
        expect(presets, `${item.id}/${stage.modelId}`).toBeDefined();
        expect(presets[stage.presetId], `${item.id} → ${stage.presetId}`).toBeDefined();
        expect(stage.parameterMappings.length).toBeGreaterThan(0);
        for (const variation of item.variations) {
          if (!variation.presetId) continue;
          expect(presets[variation.presetId], `${item.id} variation → ${variation.presetId}`).toBeDefined();
        }
      }
    }
  });

  it('checks C01 against the independent P04 strip anchor', () => {
    const scene = P04_PRESETS['p04-strip-cross'];
    const solution = p04SolutionFor(scene.field, scene.particles[0]);
    const exit = solution.events.find((event) => event.kind === 'exit');
    expect(exit).toBeDefined();
    expect(exit!.timeS).toBeCloseTo(expected('case-c01-boundary-exit', 'c01-strip', 'exitTimeS'), 8);
    expect(exit!.position.x).toBeCloseTo(0.5, 9);
    expect(exit!.position.y).toBeCloseTo(1 - Math.sqrt(3) / 2, 8);
    expect(exit!.velocity.x).toBeCloseTo(Math.sqrt(3) / 2, 9);
    expect(exit!.velocity.y).toBeCloseTo(0.5, 9);
  });

  it('checks C02 against the P05 alternating-zone anchors', () => {
    const scene = P05_PRESETS['p05-two-halves'];
    const solution = p05SolutionFor(scene.field, scene.particles[0]);
    const crossings = solution.events.filter((event) => event.kind === 'crossing');
    expect(crossings.length).toBeGreaterThanOrEqual(2);
    expect(crossings[0].timeS).toBeCloseTo(Math.PI, 8);
    expect(crossings[0].position.y).toBeCloseTo(-2, 8);
    expect(crossings[1].timeS).toBeCloseTo(2 * Math.PI, 8);
    expect(crossings[1].position.y).toBeCloseTo(-4, 8);
  });

  it('checks C03 standard/miss screen anchors against P07', () => {
    const standard = P07_PRESETS['p07-standard'];
    const hit = p07SolutionFor(standard.field, standard.particles[0]);
    expect(hit.outcome).toBe('screen-hit');
    expect(hit.detection?.yHit).toBeCloseTo(expected('case-c03-beamline-detector', 'c03-standard', 'screenY'), 8);
    expect(hit.detection?.localTimeS).toBeCloseTo(expected('case-c03-beamline-detector', 'c03-standard', 'arrivalTimeS'), 8);
    const missPreset = P07_PRESETS['p07-screen-miss'];
    const miss = p07SolutionFor(missPreset.field, missPreset.particles[0]);
    expect(miss.outcome).toBe('screen-outside');
    expect(miss.screenCrossing?.yHit).toBeCloseTo(1.0893163975, 8);
  });

  it('checks C04 against the I03 entry snapshot', () => {
    const sim = simulateLoop(i03EngineParams(I03_PRESETS['i03-default']));
    const state = stateAtTime(sim, 0.1);
    expect(state.phase).toBe('entering');
    expect(state.fluxWb).toBeCloseTo(expected('case-c04-loop-entry', 'c04-entry', 'fluxWb'), 9);
    expect(state.emfV).toBeCloseTo(-0.3, 9);
    expect(state.currentA).toBeCloseTo(-0.6, 9);
    expect(state.forceXN).toBeCloseTo(-0.12, 9);
  });

  it('checks C05 against the I05 product-rule anchor', () => {
    const solution = solveI05(I05_PRESETS['i05-reinforce']);
    const state = stateAtI05Time(solution, 0.5);
    expect(state.overlapLengthM).toBeCloseTo(0.5, 9);
    expect(state.Bz).toBeCloseTo(2.5, 9);
    expect(state.emfTransformerV).toBeCloseTo(-0.5, 9);
    expect(state.emfMotionalV).toBeCloseTo(-2.5, 9);
    expect(state.emfTotalV).toBeCloseTo(-3, 9);
    expect(state.currentA).toBeCloseTo(-1.5, 9);
    expect(state.joulePowerW).toBeCloseTo(4.5, 9);
  });

  it('checks C06 signed flux and impact ledger separately', () => {
    const scene = I07_PRESETS['i07-interface'];
    const state = computeI07Snapshot(scene, 0, scene.startXM, scene.initialSpeedMps, { jouleHeatJ: 0, externalWorkJ: 0, impactLossJ: 0 });
    expect(state.fluxWb).toBeCloseTo(0, 12);
    expect(state.S).toBeCloseTo(-2, 12);
    expect(state.emfV).toBeCloseTo(2, 12);
    expect(state.currentA).toBeCloseTo(2, 12);
    expect(state.magneticForceN).toBeCloseTo(-4, 12);
    expect(state.joulePowerW).toBeCloseTo(4, 12);
    const wall = solveI07(I07_PRESETS['i07-inelastic-wall']);
    const bounce = wall.events.find((event) => event.kind === 'wall-bounce');
    expect(bounce).toBeDefined();
    expect(bounce!.timeS).toBeCloseTo(1, 8);
    expect(bounce!.velocityAfterMps).toBeCloseTo(-0.5, 8);
    expect(bounce!.impactLossJ).toBeCloseTo(0.375, 8);
    expect(wall.final.jouleHeatJ).toBeCloseTo(0, 12);
  });
});
