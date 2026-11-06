import { describe, expect, it } from 'vitest';
import {
  I08_DEFAULT_SCENE,
  I08_PRESETS,
  I08_SCENE_STORAGE_KEY,
  decodeI08SceneJson,
  i08SolutionFor,
  i08TimelineFor,
  parseI08StoredScene,
  serializeI08Scene,
} from '../../src/simulations/induction/i08Scene';
import { validateGeneratorParams } from '../../src/physics/induction/acGenerator';

describe('I08 scene and presets', () => {
  it('ships at least ten deterministic presets with valid generators', () => {
    expect(Object.keys(I08_PRESETS).length).toBeGreaterThanOrEqual(10);
    for (const [id, preset] of Object.entries(I08_PRESETS)) {
      expect(validateGeneratorParams(preset.params).valid, id).toBe(true);
      const timeline = i08TimelineFor(preset);
      const solution = i08SolutionFor(preset.params, timeline);
      expect(solution.status, id).toBe('ok');
      expect(solution.samples.length).toBeGreaterThan(10);
    }
    expect(I08_PRESETS['i08-open'].params.circuitClosed).toBe(false);
    expect(I08_PRESETS['i08-short'].params.loadResistanceOhm).toBe(0);
    expect(I08_PRESETS['i08-n-gain'].params.turns).toBe(20);
    expect(I08_PRESETS['i08-manual'].mode).toBe('manual');
    expect(I08_DEFAULT_SCENE.params.omegaRadPerS).toBeCloseTo(2 * Math.PI, 12);
  });

  it('round-trips a v2 scene with circuit switch history', () => {
    const base = I08_PRESETS['i08-standard'];
    const scene = {
      ...base,
      circuitTimeline: [
        { timeS: 0, closed: true },
        { timeS: 0.4, closed: false },
        { timeS: 0.8, closed: true },
      ],
    };
    const parsed = parseI08StoredScene(JSON.parse(serializeI08Scene(scene)));
    expect(parsed.error).toBeNull();
    expect(parsed.scene?.circuitTimeline.map((event) => event.closed)).toEqual([true, false, true]);
    expect(parsed.scene?.mode).toBe('auto');
    expect(i08TimelineFor(parsed.scene!)[1].timeS).toBeCloseTo(0.4, 12);
  });

  it('rejects malformed scenes and invalid parameters safely', () => {
    expect(decodeI08SceneJson('{bad').scene).toBeNull();
    expect(parseI08StoredScene({ schemaVersion: 2, model: 'i08' }).scene).toBeNull();
    const base = JSON.parse(serializeI08Scene(I08_PRESETS['i08-standard']));
    base.params.loadResistanceOhm = 0;
    base.params.internalResistanceOhm = 0;
    expect(parseI08StoredScene(base).scene).toBeNull();
    const badTimeline = JSON.parse(serializeI08Scene(I08_PRESETS['i08-standard']));
    badTimeline.circuitTimeline = [{ timeS: 'x', closed: 'yes' }];
    const parsed = parseI08StoredScene(badTimeline);
    expect(parsed.scene).not.toBeNull();
    expect(parsed.scene?.circuitTimeline).toHaveLength(1);
    expect(window.localStorage.getItem(I08_SCENE_STORAGE_KEY)).toBeNull();
  });

  it('keeps manual scenes at zero analytic omega and auto scenes finite', () => {
    expect(I08_PRESETS['i08-manual'].params.omegaRadPerS).toBe(0);
    const solution = i08SolutionFor(
      I08_PRESETS['i08-zero-speed'].params,
      i08TimelineFor(I08_PRESETS['i08-zero-speed']),
    );
    expect(solution.final.frequencyHz).toBeNull();
    expect(solution.final.emfV).toBe(0);
  });
});
