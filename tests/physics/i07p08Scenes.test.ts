import { describe, expect, it } from 'vitest';
import { I07_DEFAULT, solveI07 } from '../../src/physics/induction/oppositeFieldsWallLoop';
import {
  I07_PRESETS,
  I07_SCENE_STORAGE_KEY,
  decodeI07SceneJson,
  parseI07StoredScene,
  serializeI07Scene,
  i07SceneFromPreset,
} from '../../src/simulations/induction/i07Scene';
import {
  P08_PRESETS,
  P08_SCENE_STORAGE_KEY,
  decodeP08SceneJson,
  parseP08StoredScene,
  p08ApplyField,
  p08GlobalDuration,
  p08SolutionFor,
  serializeP08Scene,
} from '../../src/simulations/particle/p08Scene';

describe('I07 scene and presets', () => {
  it('ships every preset as a solvable scene with the expected status', () => {
    expect(Object.keys(I07_PRESETS).length).toBeGreaterThanOrEqual(12);
    for (const [id, params] of Object.entries(I07_PRESETS)) {
      const solution = solveI07(params);
      expect(solution.status, id).not.toBe('invalid');
      expect(solution.initial.timeS).toBe(0);
      expect(Number.isFinite(solution.final.xM)).toBe(true);
    }
    expect(solveI07(I07_PRESETS['i07-free-wall']).events.some((event) => event.kind === 'wall-bounce')).toBe(true);
    expect(solveI07(I07_PRESETS['i07-wall-held']).status).toBe('wall-held');
    expect(solveI07(I07_PRESETS['i07-open']).final.currentA).toBe(0);
  });

  it('round-trips a v2 I07 scene and rejects malformed JSON', () => {
    const scene = i07SceneFromPreset(I07_PRESETS['i07-free-wall']);
    const parsed = parseI07StoredScene(JSON.parse(serializeI07Scene(scene)));
    expect(parsed.error).toBeNull();
    expect(parsed.scene?.params.restitution).toBe(1);
    expect(parsed.scene?.params.wallEnabled).toBe(true);
    expect(decodeI07SceneJson('{not json').scene).toBeNull();
    expect(parseI07StoredScene({ schemaVersion: 2, model: 'i07', params: { ...I07_DEFAULT, widthM: 0 } }).scene).toBeNull();
    expect(window.localStorage.getItem(I07_SCENE_STORAGE_KEY)).toBeNull();
  });
});

describe('P08 scene and presets', () => {
  it('solves every preset and carries independent launch times', () => {
    expect(Object.keys(P08_PRESETS).length).toBeGreaterThanOrEqual(10);
    for (const [id, scene] of Object.entries(P08_PRESETS)) {
      expect(scene.particles.length, id).toBeGreaterThanOrEqual(1);
      const solution = p08SolutionFor(scene.particles[0], scene.field, scene.constraint);
      expect(solution.status, id).not.toBe('invalid');
    }
    const multi = P08_PRESETS['p08-multi'];
    expect(multi.particles.length).toBe(3);
    expect(multi.runtimeById[multi.particles[1].id].launchTimeSec).toBeCloseTo(0.6, 9);
    expect(p08GlobalDuration(multi)).toBeGreaterThan(multi.constraint.window.maxTimeS);
    expect(P08_PRESETS['p08-tangent'].constraint.window.direction).toBe('any');
    expect(P08_PRESETS['p08-direction'].constraint.window.direction).toBe('positive');
  });

  it('round-trips v2 scenes, keeps target/inverse settings and resets launch times on shared field change', () => {
    const scene = P08_PRESETS['p08-five'];
    const parsed = parseP08StoredScene(JSON.parse(serializeP08Scene(scene)));
    expect(parsed.error).toBeNull();
    expect(parsed.scene?.particles.length).toBe(5);
    expect(parsed.scene?.constraint.target.coordinate).toBeCloseTo(0.8, 12);
    expect(parsed.scene?.inverse.parameter).toBe('Ey');
    const reset = p08ApplyField(scene, { ...scene.field, Bz: -1.5 });
    expect(Object.values(reset.runtimeById).every((runtime) => runtime.launchTimeSec === 0)).toBe(true);
    expect(reset.field.Bz).toBe(-1.5);
  });

  it('rejects malformed P08 scenes without producing NaN particles', () => {
    expect(decodeP08SceneJson('{bad').scene).toBeNull();
    expect(parseP08StoredScene({ schemaVersion: 2, model: 'p08' }).scene).toBeNull();
    const scene = P08_PRESETS['p08-tangent'];
    const badParticle = JSON.parse(serializeP08Scene(scene));
    badParticle.particles[0].massKg = 0;
    expect(parseP08StoredScene(badParticle).scene).toBeNull();
    const badTarget = JSON.parse(serializeP08Scene(scene));
    badTarget.constraint.target.max = -10;
    expect(parseP08StoredScene(badTarget).scene).toBeNull();
    expect(window.localStorage.getItem(P08_SCENE_STORAGE_KEY)).toBeNull();
  });
});
