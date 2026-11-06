import { describe, expect, it } from 'vitest';
import {
  P01_THREE_DEFAULT,
  P01_THREE_PRESETS,
  P01_THREE_SCENE_KEY,
  addThreeDParticle,
  applySharedB,
  createThreeDScene,
  decodeP01ThreeDSceneJson,
  duplicateThreeDParticle,
  parseP01ThreeDScene,
  p01ThreeDKeyFrames,
  p01ThreeDModelFor,
  p01ThreeDStateFor,
  p01ThreeDDuration,
  relaunchThreeDParticle,
  removeThreeDParticle,
  selectThreeDParticle,
  serializeP01ThreeDScene,
  updateThreeDParticleAndRelaunch,
  type P01ThreeDSeed,
} from '../../src/simulations/particle/p01ThreeDScene';
import { P01_FORCE_PRESETS } from '../../src/simulations/particle/p01ForceScene';
import { migrateForceSceneToThreeD } from '../../src/simulations/particle/p01ThreeDScene';
import type { Vec3 } from '../../src/physics/particles/lorentzForce';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function seed(velocity: Vec3, chargeC = 1, massKg = 1): P01ThreeDSeed {
  return {
    position: v(0, 0, 0),
    velocity,
    chargeC,
    massKg,
    visible: true,
    showTrail: true,
  };
}

describe('P01 3D scene adapter and persistence', () => {
  it('D11 keeps independent launch times and editing A does not change B/C', () => {
    const initial = createThreeDScene({ B: v(0, 0, 1) }, [
      seed(v(1, 0, 0)),
      seed(v(1, 0, 0), -1),
      seed(v(1, 0, 1)),
    ]);
    const [a, b, c] = initial.particles;
    let scene = relaunchThreeDParticle(initial, b.id, 1);
    scene = relaunchThreeDParticle(scene, c.id, 2);

    const atHalf = scene.particles.map((particle) => p01ThreeDStateFor(scene, particle, 0.5));
    expect(atHalf[0].tauS).toBeCloseTo(0.5, 12);
    expect(atHalf[1].tauS).toBeNull();
    expect(atHalf[2].tauS).toBeNull();

    const atOneAndHalf = scene.particles.map((particle) => p01ThreeDStateFor(scene, particle, 1.5));
    expect(atOneAndHalf[0].tauS).toBeCloseTo(1.5, 12);
    expect(atOneAndHalf[1].tauS).toBeCloseTo(0.5, 12);
    expect(atOneAndHalf[2].tauS).toBeNull();
    const bBefore = atOneAndHalf[1].state!.position;
    const cRuntimeBefore = scene.runtimeById[c.id].launchTimeSec;

    scene = updateThreeDParticleAndRelaunch(scene, a.id, { velocity: v(2, 0, 0) }, 1.5);
    expect(scene.runtimeById[a.id].launchTimeSec).toBeCloseTo(1.5, 12);
    expect(scene.runtimeById[b.id].launchTimeSec).toBeCloseTo(1, 12);
    expect(scene.runtimeById[c.id].launchTimeSec).toBeCloseTo(cRuntimeBefore, 12);
    const afterA = p01ThreeDStateFor(scene, scene.particles[0], 1.5);
    const afterB = p01ThreeDStateFor(scene, scene.particles[1], 1.5);
    const afterC = p01ThreeDStateFor(scene, scene.particles[2], 1.5);
    expect(afterA.tauS).toBeCloseTo(0, 12);
    expect(afterB.state!.position.x).toBeCloseTo(bBefore.x, 12);
    expect(afterB.state!.position.y).toBeCloseTo(bBefore.y, 12);
    expect(afterC.tauS).toBeNull();
  });

  it('D12 shared B change resets every particle together', () => {
    const initial = createThreeDScene({ B: v(0, 0, 1) }, [
      seed(v(1, 0, 0)),
      seed(v(0, 1, 0)),
    ]);
    const [a, b] = initial.particles;
    let scene = relaunchThreeDParticle(initial, a.id, 2);
    scene = relaunchThreeDParticle(scene, b.id, 3);
    const changed = applySharedB(scene, v(0, 2, 1));
    expect(changed.field.B).toEqual(v(0, 2, 1));
    expect(changed.runtimeById[a.id].launchTimeSec).toBe(0);
    expect(changed.runtimeById[b.id].launchTimeSec).toBe(0);
    expect(changed.activeParticleId).toBe(scene.activeParticleId);
  });

  it('supports 1-5 particles, duplicate, delete, select and update', () => {
    let scene = createThreeDScene({ B: v(0, 0, 1) }, [seed(v(1, 0, 0))]);
    for (let index = 0; index < 4; index++) {
      const result = addThreeDParticle(scene, seed(v(1, 0, index), -1));
      expect(result.particle).not.toBeNull();
      scene = result.scene;
    }
    expect(scene.particles).toHaveLength(5);
    expect(addThreeDParticle(scene, seed(v(1, 0, 0))).particle).toBeNull();

    const duplicated = duplicateThreeDParticle(relaunchThreeDParticle(scene, scene.particles[0].id, 2), scene.particles[0].id);
    expect(duplicated.particle).toBeNull();

    const removed = removeThreeDParticle(scene, scene.particles[4].id);
    expect(removed.particles).toHaveLength(4);
    expect(removeThreeDParticle(createThreeDScene({ B: v(0, 0, 1) }, [seed(v(1, 0, 0))]), 'p1').particles).toHaveLength(1);

    const selected = selectThreeDParticle(scene, scene.particles[2].id);
    expect(selected.activeParticleId).toBe(scene.particles[2].id);
    const updated = updateThreeDParticleAndRelaunch(scene, scene.particles[0].id, { chargeC: -2, massKg: 3 }, 4);
    expect(updated.particles[0].chargeC).toBe(-2);
    expect(updated.particles[0].massKg).toBe(3);
    expect(updated.runtimeById[scene.particles[1].id].launchTimeSec).toBe(0);
  });

  it('serializes v2 and rejects corrupt data safely', () => {
    const scene = createThreeDScene({ B: v(0, 1, 2) }, [seed(v(1, 0, 0), -2, 2)]);
    const text = serializeP01ThreeDScene(scene);
    const parsed = parseP01ThreeDScene(JSON.parse(text));
    expect(parsed.error).toBeNull();
    expect(parsed.scene?.version).toBe(2);
    expect(parsed.scene?.particles[0].velocity).toEqual(v(1, 0, 0));
    expect(parsed.scene?.particles[0].position).toEqual(v(0, 0, 0));
    expect(parsed.scene?.field.B).toEqual(v(0, 1, 2));
    expect(decodeP01ThreeDSceneJson(text).scene?.particles).toHaveLength(1);
    expect(decodeP01ThreeDSceneJson('{').scene).toBeNull();
    expect(parseP01ThreeDScene({ schemaVersion: 2, model: 'p01-three', field: { B: v(0, 0, 1) }, particles: [] }).error).toBeTruthy();
    expect(
      parseP01ThreeDScene({
        schemaVersion: 2,
        model: 'p01-three',
        field: { B: v(0, 0, 1) },
        particles: [{ ...scene.particles[0], massKg: 0 }],
        runtimeById: scene.runtimeById,
      }).error,
    ).toBeTruthy();
    expect(
      parseP01ThreeDScene({
        schemaVersion: 2,
        model: 'p01-three',
        field: { B: v(Number.NaN, 0, 1) },
        particles: scene.particles,
        runtimeById: scene.runtimeById,
      }).error,
    ).toBeTruthy();
  });

  it('migrates the existing v1 force scene without losing q/m/v/B', () => {
    const old = P01_FORCE_PRESETS['p01-force-oblique'];
    const migrated = migrateForceSceneToThreeD(old);
    expect(migrated.field.B).toEqual(old.field.B);
    expect(migrated.particles).toHaveLength(old.particles.length);
    migrated.particles.forEach((particle, index) => {
      expect(particle.chargeC).toBe(old.particles[index].chargeC);
      expect(particle.massKg).toBe(old.particles[index].massKg);
      expect(particle.velocity).toEqual(old.particles[index].velocity);
      expect(Number.isFinite(particle.position.x)).toBe(true);
      expect(Number.isFinite(particle.position.y)).toBe(true);
      expect(Number.isFinite(particle.position.z)).toBe(true);
      expect(migrated.runtimeById[particle.id].launchTimeSec).toBe(0);
    });
  });

  it('exposes valid presets and analytic models/keyframes/duration', () => {
    expect(P01_THREE_SCENE_KEY).toBe('emplab.p01.three.scene.v2');
    expect(P01_THREE_DEFAULT.particles.length).toBeGreaterThanOrEqual(1);
    for (const id of [
      'p01-3d-force-front',
      'p01-3d-force-negative',
      'p01-motion3d-circle',
      'p01-motion3d-helix',
      'p01-motion3d-reverse',
      'p01-motion3d-sign',
      'p01-motion3d-three',
      'p01-motion3d-five',
    ]) {
      expect(P01_THREE_PRESETS[id], id).toBeDefined();
      const preset = P01_THREE_PRESETS[id];
      expect(preset.particles.length).toBeGreaterThanOrEqual(1);
      expect(preset.particles.length).toBeLessThanOrEqual(5);
      for (const particle of preset.particles) {
        const model = p01ThreeDModelFor(preset, particle);
        expect(model.valid).toBe(true);
        expect(Number.isFinite(model.radiusM ?? 0)).toBe(true);
      }
    }
    const helix = P01_THREE_PRESETS['p01-motion3d-helix'];
    const model = p01ThreeDModelFor(helix, helix.particles[0]);
    expect(model.kind).toBe('helix');
    expect(p01ThreeDDuration(helix)).toBeGreaterThan(0);
    const frames = p01ThreeDKeyFrames(helix);
    expect(frames.length).toBeGreaterThan(2);
    expect(frames[0].time).toBe(0);
    expect(frames.every((frame, index) => index === 0 || frame.time >= frames[index - 1].time)).toBe(true);
    const state = p01ThreeDStateFor(helix, helix.particles[0], 1);
    expect(state.state).not.toBeNull();
    expect(state.state!.speed).toBeCloseTo(model.speed0, 10);
  });
});
