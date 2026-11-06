import { describe, expect, it } from 'vitest';
import {
  MAX_PARTICLES,
  addParticle,
  commitDraft,
  createParticleDraft,
  createScene,
  duplicateParticle,
  particleTau,
  relaunchAll,
  relaunchParticle,
  removeParticle,
  selectParticle,
  updateDraft,
  updateParticleAndRelaunch,
  applySharedField,
  type MultiParticleScene,
  type ParticleInitialState,
} from '../../src/physics/particles/multiParticle';

interface TestField {
  bz: number;
}

const baseParticle: Omit<ParticleInitialState, 'id' | 'label' | 'color' | 'lineStyle'> = {
  position: { x: -0.1, y: 0 },
  velocity: { x: 2e6, y: 0 },
  chargeC: 1.6e-19,
  massKg: 1e-26,
  visible: true,
  showTrail: true,
};

function oneParticleScene(): MultiParticleScene<TestField> {
  const empty = createScene<TestField>({ bz: -0.5 }, [], 'p1');
  return addParticle(empty, baseParticle, 0).scene;
}

describe('multi-particle scene controller', () => {
  it('adds stable IDs and high-distinction labels up to the five-particle limit', () => {
    let scene = createScene<TestField>({ bz: -0.5 }, [], '');
    const ids: string[] = [];
    for (let index = 0; index < MAX_PARTICLES; index++) {
      const result = addParticle(scene, { ...baseParticle, position: { x: -0.1 - index * 0.01, y: 0 } }, 0);
      scene = result.scene;
      expect(result.particle).not.toBeNull();
      ids.push(result.particle!.id);
    }
    expect(scene.particles).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(scene.particles.map((particle) => particle.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(new Set(scene.particles.map((particle) => particle.color)).size).toBe(5);
    expect(new Set(scene.particles.map((particle) => particle.lineStyle)).size).toBeGreaterThanOrEqual(2);
    expect(scene.activeParticleId).toBe('p5');

    const overflow = addParticle(scene, baseParticle, 0);
    expect(overflow.particle).toBeNull();
    expect(overflow.scene).toBe(scene);
  });

  it('duplicates only the selected particle, preserving its physical initial state and relaunching at now', () => {
    const scene = oneParticleScene();
    const result = duplicateParticle(scene, 'p1', 0.003);
    expect(result.particle).not.toBeNull();
    expect(result.scene.particles).toHaveLength(2);
    const original = result.scene.particles.find((particle) => particle.id === 'p1')!;
    const copy = result.scene.particles.find((particle) => particle.id === result.particle!.id)!;
    expect(original).toBe(scene.particles[0]);
    expect(copy.id).not.toBe('p1');
    expect(copy.label).toBe('B');
    expect(copy.position).toEqual(original.position);
    expect(copy.velocity).toEqual(original.velocity);
    expect(copy.chargeC).toBe(original.chargeC);
    expect(copy.massKg).toBe(original.massKg);
    expect(result.scene.runtimeById['p1'].launchTimeSec).toBe(0);
    expect(result.scene.runtimeById[copy.id].launchTimeSec).toBe(0.003);
    expect(result.scene.activeParticleId).toBe(copy.id);
  });

  it('removes by stable ID, never confuses neighbors, and keeps at least one particle', () => {
    let scene = oneParticleScene();
    scene = addParticle(scene, baseParticle, 0).scene;
    scene = addParticle(scene, baseParticle, 0).scene;
    const keepB = scene.particles.find((particle) => particle.id === 'p2')!;
    scene = selectParticle(scene, 'p1');
    scene = removeParticle(scene, 'p1');
    expect(scene.particles.map((particle) => particle.id)).toEqual(['p2', 'p3']);
    expect(scene.particles[0]).toBe(keepB);
    expect(scene.activeParticleId).toBe('p2');
    expect(scene.runtimeById.p1).toBeUndefined();
    scene = removeParticle(scene, 'p2');
    scene = removeParticle(scene, 'p3');
    expect(scene.particles).toHaveLength(1);
  });

  it('computes local launch time without inventing motion before launch', () => {
    expect(particleTau({ launchTimeSec: 0.4 }, 0.2)).toBeNull();
    expect(particleTau({ launchTimeSec: 0.4 }, 0.4)).toBe(0);
    expect(particleTau({ launchTimeSec: 0.4 }, 0.55)).toBeCloseTo(0.15, 12);
    expect(particleTau({ launchTimeSec: 0 }, 2)).toBe(2);
    expect(particleTau({ launchTimeSec: 0 }, -1)).toBeNull();
  });

  it('commits a draft only to its target and keeps other particles and launch history untouched', () => {
    let scene = oneParticleScene();
    scene = addParticle(scene, baseParticle, 0).scene;
    scene = addParticle(scene, baseParticle, 0).scene;
    const beforeB = scene.particles[1];
    const beforeC = scene.particles[2];
    const beforeBRuntime = scene.runtimeById.p2;
    const draft = createParticleDraft(scene, 'p1', 0.7);
    expect(draft).not.toBeNull();
    const edited = updateDraft(draft!, { position: { x: 0.3, y: 0.2 }, velocity: { x: 0, y: 3e6 } });
    const committed = commitDraft(scene, edited, 0.9);
    expect(committed.particles[0].position).toEqual({ x: 0.3, y: 0.2 });
    expect(committed.particles[0].velocity).toEqual({ x: 0, y: 3e6 });
    expect(committed.particles[1]).toBe(beforeB);
    expect(committed.particles[2]).toBe(beforeC);
    expect(committed.runtimeById.p2).toBe(beforeBRuntime);
    expect(committed.runtimeById.p1.launchTimeSec).toBe(0.9);
    expect(committed.activeParticleId).toBe('p1');
  });

  it('cancels a draft without changing any committed initial state or launch time', () => {
    const scene = oneParticleScene();
    const draft = createParticleDraft(scene, 'p1', 0.5);
    expect(draft).not.toBeNull();
    const edited = updateDraft(draft!, { position: { x: 0.4, y: -0.1 } });
    expect(edited.committedParticle).toBe(scene.particles[0]);
    expect(edited.draftParticle.position).toEqual({ x: 0.4, y: -0.1 });
    expect(scene.particles[0].position).toEqual({ x: -0.1, y: 0 });
    expect(scene.runtimeById.p1.launchTimeSec).toBe(0);
  });

  it('relaunches only one particle or all particles without changing shared field identity', () => {
    let scene = oneParticleScene();
    scene = addParticle(scene, baseParticle, 0.3).scene;
    const field = scene.field;
    const relaunched = relaunchParticle(scene, 'p1', 1.2);
    expect(relaunched.runtimeById.p1.launchTimeSec).toBe(1.2);
    expect(relaunched.runtimeById.p2.launchTimeSec).toBe(0.3);
    expect(relaunched.field).toBe(field);

    const all = relaunchAll(relaunched);
    expect(all.runtimeById.p1.launchTimeSec).toBe(0);
    expect(all.runtimeById.p2.launchTimeSec).toBe(0);
    expect(all.field).toBe(field);
    expect(all.particles).toBe(relaunched.particles);
  });

  it('applies a shared field change as a full-scene reset but preserves particle initial objects', () => {
    let scene = oneParticleScene();
    scene = addParticle(scene, baseParticle, 0.2).scene;
    const particles = scene.particles;
    const updated = applySharedField(scene, { bz: 0.9 });
    expect(updated.field).toEqual({ bz: 0.9 });
    expect(updated.particles).toBe(particles);
    expect(updated.runtimeById.p1.launchTimeSec).toBe(0);
    expect(updated.runtimeById.p2.launchTimeSec).toBe(0);
  });

  it('per-particle parameter commits only relaunch that particle', () => {
    let scene = oneParticleScene();
    scene = addParticle(scene, baseParticle, 0.2).scene;
    const bRuntime = scene.runtimeById.p2;
    const updated = updateParticleAndRelaunch(scene, 'p1', { chargeC: -1.6e-19 }, 0.8);
    expect(updated.particles[0].chargeC).toBe(-1.6e-19);
    expect(updated.particles[1]).toBe(scene.particles[1]);
    expect(updated.runtimeById.p2).toBe(bRuntime);
    expect(updated.runtimeById.p1.launchTimeSec).toBe(0.8);
  });

  it('selects only existing IDs and snaps new IDs to the first free stable slot', () => {
    let scene = oneParticleScene();
    scene = addParticle(scene, baseParticle, 0).scene;
    scene = addParticle(scene, baseParticle, 0).scene;
    scene = removeParticle(scene, 'p2');
    const readded = addParticle(scene, baseParticle, 0).scene;
    expect(readded.particles.map((particle) => particle.id)).toEqual(['p1', 'p3', 'p2']);
    expect(selectParticle(readded, 'missing')).toBe(readded);
    expect(selectParticle(readded, 'p3').activeParticleId).toBe('p3');
  });
});
