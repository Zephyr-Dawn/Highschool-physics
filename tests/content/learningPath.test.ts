import { describe, expect, it } from 'vitest';
import { DEMO_ROUTES, LEARNING_PATHS } from '../../src/content/learningPath';
import { LESSON_BY_MODEL } from '../../src/content/pathLessonCatalog';
import { QUESTION_STATS } from '../../src/content/questionStats';
import { SIMULATIONS, routeForModel, simTitleForModel } from '../../src/simulations/registry';
import type { ModelId } from '../../src/content/schema';
import { P01_FORCE_PRESETS } from '../../src/simulations/particle/p01ForceScene';
import { P01_PLANAR_PRESETS } from '../../src/simulations/particle/p01PlanarScene';
import { P01_THREE_PRESETS } from '../../src/simulations/particle/p01ThreeDScene';
import { P02_PRESETS } from '../../src/simulations/particle/params';
import { P02_MULTI_PRESETS } from '../../src/simulations/particle/p02Scene';
import { P03_PRESETS } from '../../src/simulations/particle/halfPlaneParams';
import { P03_MULTI_PRESETS } from '../../src/simulations/particle/p03Scene';
import { P04_PRESETS } from '../../src/simulations/particle/p04Scene';
import { P05_PRESETS } from '../../src/simulations/particle/p05Scene';
import { P06_PRESETS } from '../../src/simulations/particle/p06Scene';
import { P07_PRESETS } from '../../src/simulations/particle/p07Scene';
import { P08_PRESETS } from '../../src/simulations/particle/p08Scene';
import { I01_PRESETS } from '../../src/simulations/induction/fluxLenzParams';
import { I02_PRESETS } from '../../src/simulations/induction/movingRodParams';
import { I03_PRESETS } from '../../src/simulations/induction/params';
import { I04_PRESETS } from '../../src/simulations/induction/timeVaryingParams';
import { I05_PRESETS } from '../../src/simulations/induction/i05Scene';
import { I06_PRESETS } from '../../src/simulations/induction/i06Scene';
import { I07_PRESETS } from '../../src/simulations/induction/i07Scene';
import { I08_PRESETS } from '../../src/simulations/induction/i08Scene';

const PRESETS: Record<ModelId, Record<string, unknown>> = {
  p01: { ...P01_FORCE_PRESETS, ...P01_PLANAR_PRESETS, ...P01_THREE_PRESETS },
  p02: { ...P02_PRESETS, ...P02_MULTI_PRESETS },
  p03: { ...P03_PRESETS, ...P03_MULTI_PRESETS },
  p04: P04_PRESETS,
  p05: P05_PRESETS,
  p06: P06_PRESETS,
  p07: P07_PRESETS,
  p08: P08_PRESETS,
  i01: I01_PRESETS,
  i02: I02_PRESETS,
  i03: I03_PRESETS,
  i04: I04_PRESETS,
  i05: I05_PRESETS,
  i06: I06_PRESETS,
  i07: I07_PRESETS,
  i08: I08_PRESETS,
};

const ALL_MODEL_IDS: ModelId[] = [
  'p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08',
  'i01', 'i02', 'i03', 'i04', 'i05', 'i06', 'i07', 'i08',
];

describe('16-model curriculum coverage', () => {
  it('registers exactly the 16 original model IDs with unique routes and titles', () => {
    expect(SIMULATIONS).toHaveLength(16);
    expect(new Set(SIMULATIONS.map((simulation) => simulation.id)).size).toBe(16);
    expect(SIMULATIONS.map((simulation) => simulation.id).sort()).toEqual([...ALL_MODEL_IDS].sort());
    const routes = SIMULATIONS.map((simulation) => simulation.route);
    expect(new Set(routes).size).toBe(16);
    for (const id of ALL_MODEL_IDS) {
      expect(routeForModel(id)).toMatch(/^\/(particle|induction)\//);
      expect(simTitleForModel(id).length).toBeGreaterThan(2);
    }
  });

  it('places every model exactly once on a learning path', () => {
    const pathIds = LEARNING_PATHS.flatMap((path) => path.steps.map((step) => step.modelId));
    expect(pathIds).toHaveLength(16);
    expect(new Set(pathIds).size).toBe(16);
    expect(pathIds.sort()).toEqual([...ALL_MODEL_IDS].sort());
    for (const path of LEARNING_PATHS) {
      expect(path.steps.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('links every path step to a real preset, lesson and question count', () => {
    for (const path of LEARNING_PATHS) {
      for (const step of path.steps) {
        expect(PRESETS[step.modelId][step.presetId], `${step.modelId} → ${step.presetId}`).toBeDefined();
        for (const presetId of step.extraPresetIds ?? []) {
          expect(PRESETS[step.modelId][presetId], `${step.modelId} → ${presetId}`).toBeDefined();
        }
        expect(LESSON_BY_MODEL[step.modelId].length, step.modelId).toBeGreaterThan(0);
        expect(QUESTION_STATS.byModel[step.modelId], step.modelId).toBeGreaterThanOrEqual(6);
      }
    }
    expect(LESSON_BY_MODEL.i08.length).toBeGreaterThanOrEqual(8);
    expect(QUESTION_STATS.byModel.i08).toBeGreaterThanOrEqual(8);
  });

  it('keeps all classroom demo routes on real models and presets', () => {
    expect(DEMO_ROUTES.length).toBeGreaterThanOrEqual(3);
    for (const route of DEMO_ROUTES) {
      expect(route.steps.length).toBeGreaterThanOrEqual(2);
      for (const step of route.steps) {
        expect(PRESETS[step.modelId][step.presetId], `${route.id} → ${step.modelId}/${step.presetId}`).toBeDefined();
      }
    }
  });

  it('contains no fake planned route in the model registry', () => {
    for (const simulation of SIMULATIONS) {
      expect(simulation.status).toBe('available');
      expect(simulation.title.length).toBeGreaterThan(4);
      expect(simulation.description.length).toBeGreaterThan(10);
    }
  });
});
