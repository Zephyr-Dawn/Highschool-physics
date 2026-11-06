import { describe, expect, it } from 'vitest';
import {
  P01_FORCE_DEFAULT,
  P01_FORCE_PRESETS,
  activeForceParticle,
  addForceParticle,
  decodeForceSceneJson,
  duplicateForceParticle,
  parseForceScene,
  removeForceParticle,
  selectForceParticle,
  serializeForceScene,
  updateForceParticle,
  type P01ForceParticle,
} from '../../src/simulations/particle/p01ForceScene';
import {
  P01_PLANAR_PRESETS,
  decodeP01PlanarSceneJson,
  serializeP01PlanarScene,
} from '../../src/simulations/particle/p01PlanarScene';
import { lorentzForceSnapshot } from '../../src/physics/particles/lorentzForce';

function seedFrom(particle: P01ForceParticle) {
  return {
    chargeC: particle.chargeC,
    massKg: particle.massKg,
    velocity: { ...particle.velocity },
    visible: particle.visible,
  };
}

describe('P01 force scene and planar scene adapters', () => {
  it('starts with a valid selected particle and computes finite forces for all force presets', () => {
    expect(P01_FORCE_DEFAULT.particles).toHaveLength(3);
    expect(activeForceParticle(P01_FORCE_DEFAULT)?.label).toBe('A');
    for (const scene of Object.values(P01_FORCE_PRESETS)) {
      for (const particle of scene.particles) {
        const snapshot = lorentzForceSnapshot({
          chargeC: particle.chargeC,
          massKg: particle.massKg,
          velocity: particle.velocity,
          B: scene.field.B,
        });
        expect(Number.isFinite(snapshot.magnitude)).toBe(true);
        expect(Number.isFinite(snapshot.force.x)).toBe(true);
      }
    }
  });

  it('supports add, duplicate, select, update and remove with a five-particle limit', () => {
    let scene = P01_FORCE_DEFAULT;
    const active = activeForceParticle(scene);
    expect(active).toBeDefined();
    const selected = selectForceParticle(scene, scene.particles[1].id);
    expect(activeForceParticle(selected)?.label).toBe('B');

    const duplicated = duplicateForceParticle(scene, scene.particles[0].id);
    expect(duplicated.scene.particles).toHaveLength(4);
    expect(duplicated.scene.particles[3].velocity).toEqual(scene.particles[0].velocity);
    expect(duplicated.scene.activeParticleId).toBe(duplicated.particle?.id);

    const added = addForceParticle(scene, seedFrom(scene.particles[0]));
    expect(added.scene.particles).toHaveLength(4);
    const fifth = addForceParticle(added.scene, seedFrom(scene.particles[0]));
    expect(fifth.scene.particles).toHaveLength(5);
    const sixth = addForceParticle(fifth.scene, seedFrom(scene.particles[0]));
    expect(sixth.particle).toBeNull();
    expect(sixth.scene.particles).toHaveLength(5);

    scene = updateForceParticle(fifth.scene, fifth.scene.particles[0].id, {
      chargeC: -3,
      velocity: { x: 0, y: 1, z: 2 },
    });
    expect(scene.particles[0].chargeC).toBe(-3);
    const removed = removeForceParticle(scene, scene.particles[0].id);
    expect(removed.particles).toHaveLength(4);
  });

  it('round-trips the force scene and rejects malformed or over-limit data', () => {
    const text = serializeForceScene(P01_FORCE_DEFAULT);
    const parsed = decodeForceSceneJson(text);
    expect(parsed.scene?.particles).toHaveLength(P01_FORCE_DEFAULT.particles.length);
    expect(parseForceScene({ schemaVersion: 1, model: 'bad' }).scene).toBeNull();
    expect(parseForceScene({ schemaVersion: 1, field: { B: { x: Number.NaN, y: 0, z: 0 } }, particles: [] }).scene).toBeNull();
    expect(
      decodeForceSceneJson(
        JSON.stringify({
          ...JSON.parse(serializeForceScene(P01_FORCE_DEFAULT)),
          particles: Array.from({ length: 6 }, () => JSON.parse(serializeForceScene(P01_FORCE_DEFAULT)).particles[0]),
        }),
      ).scene,
    ).toBeNull();
  });

  it('provides valid v2 planar presets with 1–5 particles and safe JSON', () => {
    expect(P01_PLANAR_PRESETS['p01-motion-default']).toBeDefined();
    expect(P01_PLANAR_PRESETS['p01-motion-five'].particles).toHaveLength(5);
    expect(P01_PLANAR_PRESETS['p01-motion-sign'].particles).toHaveLength(2);
    const encoded = JSON.stringify({ scene: JSON.parse(serializeP01PlanarScene(P01_PLANAR_PRESETS['p01-motion-default'])) });
    const decoded = decodeP01PlanarSceneJson(encoded);
    expect(decoded.scene?.particles.length).toBeGreaterThan(0);
    expect(decodeP01PlanarSceneJson('{bad').scene).toBeNull();
  });
});
