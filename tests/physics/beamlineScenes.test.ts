import { describe, expect, it } from 'vitest';
import {
  P07_APPARATUS_DEFAULT,
  P07_DEFAULT,
  P07_PRESETS,
  P07_SCENE_STORAGE_KEY,
  decodeP07SceneJson,
  p07BuildParticle,
  p07DetectionGlobalTime,
  p07GlobalDuration,
  p07KeyFrames,
  p07OutcomeAt,
  p07ParticleDisplay,
  p07SeedFromDisplay,
  p07SolutionFor,
  p07StateFor,
  parseP07StoredScene,
  serializeP07Scene,
  toP07StoredScene,
} from '../../src/simulations/particle/p07Scene';
import { applySharedField, particleTau } from '../../src/physics/particles/multiParticle';

const SQRT3 = Math.sqrt(3);
const TAU_STANDARD = 2 + Math.PI / 6 + 2 / SQRT3;
const Y_STANDARD = 2 - SQRT3 + 2 / SQRT3 - 1 / 3;

function evaluationFor(presetId: string, index = 0) {
  const scene = P07_PRESETS[presetId];
  const particle = scene.particles[index];
  const runtime = scene.runtimeById[particle.id] ?? { launchTimeSec: 0 };
  return p07BuildParticle(particle, runtime, scene.field);
}

describe('P07 scene presets and multi-particle adapters', () => {
  it('ships the required reproducible presets on the standard apparatus', () => {
    for (const id of [
      'p07-standard',
      'p07-slow',
      'p07-fast',
      'p07-offset-entry',
      'p07-negative',
      'p07-reverse-analyzer',
      'p07-deflector-off',
      'p07-deflector-reverse',
      'p07-screen-miss',
      'p07-accelerated',
      'p07-arrival',
      'p07-multi',
      'p07-five',
    ]) {
      expect(P07_PRESETS[id], id).toBeDefined();
      expect(P07_PRESETS[id].particles.length).toBeGreaterThanOrEqual(1);
      expect(P07_PRESETS[id].particles.length).toBeLessThanOrEqual(5);
    }
    expect(P07_DEFAULT.particles).toHaveLength(1);
    expect(P07_DEFAULT.field).toEqual(P07_APPARATUS_DEFAULT);
    expect(P07_SCENE_STORAGE_KEY).toBe('emplab.p07.scene.v2');
  });

  it('marks the standard particle as a screen hit at the analytic spot', () => {
    const evaluation = evaluationFor('p07-standard');
    expect(evaluation.solution.outcome).toBe('screen-hit');
    expect(evaluation.solution.detection?.yHit).toBeCloseTo(Y_STANDARD, 8);
    expect(evaluation.solution.detection?.localTimeS).toBeCloseTo(TAU_STANDARD, 8);
    expect(p07DetectionGlobalTime(evaluation)).toBeCloseTo(TAU_STANDARD, 8);
    expect(p07OutcomeAt(evaluation, 2)).toBe('flying');
    expect(p07OutcomeAt(evaluation, 4)).toBe('screen-hit');
    const mid = p07StateFor(evaluation, 2.4);
    expect(mid?.regionKind).toBe('analyzer');
    const stopped = p07StateFor(evaluation, 9);
    expect(stopped?.position.x).toBeCloseTo(5, 8);
    expect(stopped?.position.y).toBeCloseTo(Y_STANDARD, 8);
    expect(stopped?.timeS).toBeCloseTo(TAU_STANDARD, 8);
  });

  it('runs slow, fast and off-axis presets into their real plates', () => {
    const slow = evaluationFor('p07-slow');
    expect(slow.solution.outcome).toBe('absorbed');
    expect(slow.solution.absorption?.slitId).toBe('exit');
    expect(slow.solution.detection).toBeNull();
    expect(p07OutcomeAt(slow, 0)).toBe('flying');
    expect(p07OutcomeAt(slow, 3)).toBe('absorbed');
    expect(p07StateFor(slow, 0)?.position.x).toBeCloseTo(-2, 8);
    expect(p07StateFor(slow, 3)?.position.x).toBeCloseTo(2, 8);
    expect(p07StateFor(slow, 3)?.timeS).toBeCloseTo(slow.solution.durationS, 8);

    const fast = evaluationFor('p07-fast');
    expect(fast.solution.outcome).toBe('absorbed');
    expect(fast.solution.absorption?.slitId).toBe('exit');

    const offset = evaluationFor('p07-offset-entry');
    expect(offset.solution.outcome).toBe('absorbed');
    expect(offset.solution.absorption?.slitId).toBe('entrance');
  });

  it('runs negative charge, reversed analyzer, deflector and screen-miss presets honestly', () => {
    const negative = evaluationFor('p07-negative');
    expect(negative.solution.outcome).toBe('screen-hit');
    expect(negative.solution.detection?.yHit).toBeCloseTo(-Y_STANDARD, 8);
    expect(negative.solution.selectorMatch?.matched).toBe(true);

    const reverse = evaluationFor('p07-reverse-analyzer');
    expect(reverse.solution.outcome).toBe('screen-outside');
    expect(reverse.solution.detection).toBeNull();
    expect(reverse.solution.screenCrossing?.yHit).toBeCloseTo(-1.755983064143708, 8);

    const deflectorOff = evaluationFor('p07-deflector-off');
    expect(deflectorOff.solution.outcome).toBe('screen-hit');
    expect(deflectorOff.solution.detection?.yHit).toBeCloseTo(2 - SQRT3 + 2 / SQRT3, 8);

    const deflectorReverse = evaluationFor('p07-deflector-reverse');
    expect(deflectorReverse.solution.outcome).toBe('screen-hit');
    expect(deflectorReverse.solution.detection?.yHit).toBeCloseTo(2 - SQRT3 + 2 / SQRT3 + 1 / 3, 8);

    const screenMiss = evaluationFor('p07-screen-miss');
    expect(screenMiss.solution.outcome).toBe('screen-outside');
    expect(screenMiss.solution.detection).toBeNull();
    expect(screenMiss.solution.screenCrossing?.yHit).toBeCloseTo(Y_STANDARD, 8);
  });

  it('accelerates from 1 to 2 m/s and reaches the same screen point later', () => {
    const evaluation = evaluationFor('p07-accelerated');
    expect(evaluation.solution.outcome).toBe('screen-hit');
    expect(evaluation.solution.detection?.yHit).toBeCloseTo(Y_STANDARD, 8);
    expect(evaluation.solution.detection?.localTimeS).toBeCloseTo(3.9282993139775506, 8);
    expect(evaluation.solution.finalState.workJ).toBeCloseTo(
      1.5 - 0.5 * (Y_STANDARD - (2 - SQRT3)),
      8,
    );
  });

  it('compares three particles with distinct true outcomes and global times', () => {
    const scene = P07_PRESETS['p07-multi'];
    expect(scene.particles).toHaveLength(3);
    const evaluations = scene.particles.map((particle) => {
      const runtime = scene.runtimeById[particle.id] ?? { launchTimeSec: 0 };
      return p07BuildParticle(particle, runtime, scene.field);
    });
    expect(evaluations.map((item) => item.solution.outcome)).toEqual([
      'screen-hit',
      'absorbed',
      'screen-hit',
    ]);
    const globalTimes = evaluations.map(p07DetectionGlobalTime);
    expect(globalTimes[0]).toBeCloseTo(TAU_STANDARD, 8);
    expect(globalTimes[1]).toBeNull();
    expect(globalTimes[2]).toBeCloseTo(0.6 + TAU_STANDARD, 8);
    expect(evaluations[1].solution.absorption?.timeS).toBeCloseTo(
      2 / 1.5 + 1.236129988702027,
      8,
    );
    expect(p07GlobalDuration(scene, evaluations)).toBeCloseTo(0.6 + TAU_STANDARD, 8);
  });

  it('models two matched particles launched at different times with the same screen y', () => {
    const scene = P07_PRESETS['p07-arrival'];
    expect(scene.particles).toHaveLength(2);
    const evaluations = scene.particles.map((particle) => {
      const runtime = scene.runtimeById[particle.id] ?? { launchTimeSec: 0 };
      return p07BuildParticle(particle, runtime, scene.field);
    });
    expect(evaluations[0].solution.detection?.yHit).toBeCloseTo(
      evaluations[1].solution.detection?.yHit ?? Number.NaN,
      8,
    );
    expect(p07DetectionGlobalTime(evaluations[0])).toBeCloseTo(TAU_STANDARD, 8);
    expect(p07DetectionGlobalTime(evaluations[1])).toBeCloseTo(0.4 + TAU_STANDARD, 8);
    expect(p07GlobalDuration(scene, evaluations)).toBeCloseTo(0.4 + TAU_STANDARD, 8);
  });

  it('supports five independent particles in one shared apparatus', () => {
    const scene = P07_PRESETS['p07-five'];
    expect(scene.particles).toHaveLength(5);
    expect(new Set(scene.particles.map((particle) => particle.id)).size).toBe(5);
    expect(new Set(scene.particles.map((particle) => particle.label))).toEqual(
      new Set(['A', 'B', 'C', 'D', 'E']),
    );
    const outcomes = scene.particles.map((particle) => {
      const runtime = scene.runtimeById[particle.id] ?? { launchTimeSec: 0 };
      return p07BuildParticle(particle, runtime, scene.field).solution.outcome;
    });
    expect(outcomes).toContain('screen-hit');
    expect(outcomes).toContain('absorbed');
  });

  it('produces real key frames for slit passes, absorption, screen hits and launches', () => {
    const scene = P07_PRESETS['p07-multi'];
    const evaluations = scene.particles.map((particle) => {
      const runtime = scene.runtimeById[particle.id] ?? { launchTimeSec: 0 };
      return p07BuildParticle(particle, runtime, scene.field);
    });
    const frames = p07KeyFrames(scene, evaluations);
    expect(frames[0]).toMatchObject({ time: 0, label: '全局起点' });
    expect(frames.some((frame) => frame.label.includes('命中屏幕') && Math.abs(frame.time - TAU_STANDARD) < 1e-8)).toBe(true);
    expect(frames.some((frame) => frame.label.includes('被吸收'))).toBe(true);
    expect(frames[frames.length - 1].time).toBeCloseTo(p07GlobalDuration(scene, evaluations), 8);
    for (let index = 1; index < frames.length; index++) {
      expect(frames[index].time).toBeGreaterThanOrEqual(frames[index - 1].time);
    }
  });

  it('keeps waiting particles out of the motion state', () => {
    const scene = P07_PRESETS['p07-arrival'];
    const particle = scene.particles[1];
    const runtime = scene.runtimeById[particle.id] ?? { launchTimeSec: 0 };
    const evaluation = p07BuildParticle(particle, runtime, scene.field);
    expect(particleTau(runtime, 0.2)).toBeNull();
    expect(p07StateFor(evaluation, particleTau(runtime, 0.2))).toBeNull();
    expect(p07OutcomeAt(evaluation, particleTau(runtime, 0.2))).toBe('waiting');
  });

  it('converts between SI particle state and display values', () => {
    const particle = P07_DEFAULT.particles[0];
    const display = p07ParticleDisplay(particle);
    const seed = p07SeedFromDisplay(display);
    expect(seed.position).toEqual(particle.position);
    expect(seed.velocity.x).toBeCloseTo(particle.velocity.x, 10);
    expect(seed.velocity.y).toBeCloseTo(particle.velocity.y, 10);
    expect(seed.chargeC).toBe(particle.chargeC);
    expect(seed.massKg).toBe(particle.massKg);
  });

  it('re-solves a single particle when only its initial state changes', () => {
    const scene = P07_PRESETS['p07-arrival'];
    const particle = scene.particles[0];
    const changed = { ...particle, velocity: { x: 1.5, y: 0 } };
    const original = p07SolutionFor(scene.field, particle);
    const updated = p07SolutionFor(scene.field, changed);
    expect(original.outcome).toBe('screen-hit');
    expect(updated.outcome).toBe('absorbed');
    expect(updated.absorption?.slitId).toBe('exit');
  });
});

describe('P07 scene persistence and shared-field reset', () => {
  it('round-trips field, particles, runtime and active selection through JSON', () => {
    const scene = P07_PRESETS['p07-arrival'];
    const stored = toP07StoredScene(scene);
    const parsed = parseP07StoredScene(stored);
    expect(parsed.error).toBeNull();
    expect(parsed.scene).not.toBeNull();
    expect(parsed.scene?.particles).toHaveLength(2);
    expect(parsed.scene?.runtimeById).toEqual(scene.runtimeById);
    expect(parsed.scene?.activeParticleId).toBe(scene.activeParticleId);
    expect(parsed.scene?.field).toEqual(scene.field);

    const roundTrip = decodeP07SceneJson(serializeP07Scene(scene));
    expect(roundTrip.scene?.particles.map((particle) => particle.id)).toEqual(
      scene.particles.map((particle) => particle.id),
    );
    expect(roundTrip.scene?.field.selector).toEqual(scene.field.selector);
  });

  it('rejects invalid apparatus, duplicate IDs and unknown models', () => {
    const stored = toP07StoredScene(P07_DEFAULT);
    const brokenField = {
      ...stored,
      field: {
        ...stored.field,
        selector: { ...stored.field.selector, x1: stored.field.selector.x0 },
      },
    };
    expect(parseP07StoredScene(brokenField).scene).toBeNull();
    expect(parseP07StoredScene(brokenField).error).toBeTruthy();

    const duplicate = {
      ...stored,
      particles: [
        stored.particles[0],
        { ...stored.particles[0], label: 'B' },
      ],
    };
    expect(parseP07StoredScene(duplicate).scene).toBeNull();

    expect(parseP07StoredScene({ ...stored, model: 'p06' }).scene).toBeNull();
  });

  it('returns safe fallback for malformed JSON', () => {
    expect(decodeP07SceneJson('{not json').scene).toBeNull();
    expect(decodeP07SceneJson('{}').scene).toBeNull();
  });

  it('resets all launch times only when the shared apparatus changes', () => {
    const scene = P07_PRESETS['p07-arrival'];
    expect(scene.runtimeById[scene.particles[1].id].launchTimeSec).toBeCloseTo(0.4, 10);
    const nextField = {
      ...scene.field,
      analyzer: { ...scene.field.analyzer, Bz: scene.field.analyzer.Bz + 0.2 },
    };
    const reset = applySharedField(scene, nextField);
    expect(reset.field).toEqual(nextField);
    for (const particle of reset.particles) {
      expect(reset.runtimeById[particle.id].launchTimeSec).toBe(0);
    }
    expect(reset.particles.map((particle) => particle.id)).toEqual(
      scene.particles.map((particle) => particle.id),
    );
  });
});
