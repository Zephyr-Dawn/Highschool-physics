import { describe, expect, it } from 'vitest';
import { addParticle, createScene } from '../../src/physics/particles/multiParticle';
import {
  P06_CROSSED_WINDOW_S,
  P06_PRESETS,
  decodeP06SceneJson,
  p06BuildParticle,
  p06GlobalDuration,
  p06ParticleDisplay,
  p06SeedFromDisplay,
  p06StateAt,
  serializeP06Scene,
  toP06StoredScene,
} from '../../src/simulations/particle/p06Scene';

describe('P06 scene and persistence', () => {
  it('builds the selector scene with three independent particles and an 8 s crossed-field window', () => {
    const scene = P06_PRESETS['p06-selector'];
    expect(scene.field.mode).toBe('crossed');
    expect(scene.particles).toHaveLength(3);
    const evaluations = scene.particles.map((particle) =>
      p06BuildParticle(particle, scene.runtimeById[particle.id], scene.field),
    );
    expect(p06GlobalDuration(scene, evaluations)).toBe(P06_CROSSED_WINDOW_S);
    const states = evaluations.map((item) => p06StateAt(item, 0));
    expect(states[0]?.force.y).toBeGreaterThan(0);
    expect(states[1]?.force.y).toBeCloseTo(0, 10);
    expect(states[2]?.force.y).toBeLessThan(0);
    expect(states[1]?.selectorMatched).toBe(true);
  });

  it('uses explicit segmented durations and continuous states in mode B', () => {
    const scene = P06_PRESETS['p06-accelerate'];
    const particle = scene.particles[0];
    const evaluation = p06BuildParticle(particle, scene.runtimeById[particle.id], scene.field);
    expect(evaluation.solutionB).not.toBeNull();
    expect(p06GlobalDuration(scene, [evaluation])).toBeGreaterThanOrEqual(evaluation.solutionB!.durationS);
    const entry = evaluation.solutionB!.events.find((event) => event.toRegion === 'magnetic')!;
    const before = p06StateAt(evaluation, entry.timeS - 1e-7);
    const after = p06StateAt(evaluation, entry.timeS + 1e-7);
    expect(before?.region).toBe('electric');
    expect(after?.region).toBe('magnetic');
    expect(before?.position.x).toBeCloseTo(after?.position.x ?? Number.NaN, 5);
    expect(before?.velocity.x).toBeCloseTo(after?.velocity.x ?? Number.NaN, 5);
  });

  it('round-trips display units, launch times and active selection', () => {
    const scene = P06_PRESETS['p06-sign'];
    const tagged = {
      ...scene,
      runtimeById: { ...scene.runtimeById, p2: { launchTimeSec: 0.4 } },
      activeParticleId: 'p2',
    };
    const parsed = decodeP06SceneJson(serializeP06Scene(tagged));
    expect(parsed.error).toBeNull();
    expect(parsed.scene?.field.mode).toBe('crossed');
    expect(parsed.scene?.particles).toHaveLength(2);
    expect(parsed.scene?.runtimeById.p2.launchTimeSec).toBeCloseTo(0.4, 12);
    expect(parsed.scene?.activeParticleId).toBe('p2');
    const display = p06ParticleDisplay(parsed.scene!.particles[0]);
    const seed = p06SeedFromDisplay(display);
    expect(seed.chargeC).toBe(parsed.scene!.particles[0].chargeC);
    expect(seed.massKg).toBe(parsed.scene!.particles[0].massKg);
    expect(seed.position).toEqual(parsed.scene!.particles[0].position);
  });

  it('rejects corrupt or over-limit P06 imports without creating a blank stage', () => {
    expect(decodeP06SceneJson('{bad').scene).toBeNull();
    const preset = P06_PRESETS['p06-default'];
    const stored = toP06StoredScene(preset);
    const tooMany = {
      ...stored,
      particles: Array.from({ length: 6 }, (_, index) => ({
        ...preset.particles[0],
        id: `x${index}`,
        label: ['A', 'B', 'C', 'D', 'E', 'A'][index],
      })),
    };
    const result = decodeP06SceneJson(JSON.stringify(tooMany));
    expect(result.scene).toBeNull();
    expect(result.error).toContain('1–5');
    const empty = createScene(preset.field, []);
    const added = addParticle(empty, preset.particles[0], 0);
    expect(added.particle).not.toBeNull();
  });
});
