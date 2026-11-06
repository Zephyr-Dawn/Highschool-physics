import { describe, expect, it } from 'vitest';
import {
  P04_PRESETS,
  P04_DEFAULT,
  decodeP04SceneJson,
  p04SolutionFor,
  parseP04StoredScene,
  p04GlobalDuration,
  serializeP04Scene,
  toP04StoredScene,
} from '../../src/simulations/particle/p04Scene';
import {
  P05_PRESETS,
  P05_DEFAULT,
  decodeP05SceneJson,
  p05SameTimeDistance,
  p05SolutionFor,
  p05StateFor,
  parseP05StoredScene,
  serializeP05Scene,
  toP05StoredScene,
} from '../../src/simulations/particle/p05Scene';
import {
  addParticle,
  applySharedField,
  relaunchParticle,
  updateParticleAndRelaunch,
} from '../../src/physics/particles/multiParticle';

describe('P04 scene adapter, presets and persistence', () => {
  it('ships preset names that match their actual boundary outcomes', () => {
    expect(Object.keys(P04_PRESETS).length).toBeGreaterThanOrEqual(8);
    expect(p04SolutionFor(P04_PRESETS['p04-strip-cross'].field, P04_PRESETS['p04-strip-cross'].particles[0]).exit?.boundaryIds).toContain('right');
    expect(p04SolutionFor(P04_PRESETS['p04-strip-return'].field, P04_PRESETS['p04-strip-return'].particles[0]).exit?.boundaryIds).toContain('left');
    expect(p04SolutionFor(P04_PRESETS['p04-rect-top'].field, P04_PRESETS['p04-rect-top'].particles[0]).exit?.boundaryIds).toContain('top');
    expect(p04SolutionFor(P04_PRESETS['p04-rect-right'].field, P04_PRESETS['p04-rect-right'].particles[0]).exit?.boundaryIds).toContain('right');
    expect(p04SolutionFor(P04_PRESETS['p04-tangent'].field, P04_PRESETS['p04-tangent'].particles[0]).tangent).not.toBeNull();
    expect(p04SolutionFor(P04_PRESETS['p04-corner'].field, P04_PRESETS['p04-corner'].particles[0]).exit?.boundaryIds).toEqual(expect.arrayContaining(['top', 'right']));
    expect(P04_PRESETS['p04-three'].particles).toHaveLength(3);
    expect(P04_PRESETS['p04-sign'].particles).toHaveLength(2);
  });

  it('keeps 1–5 particles, independent launch times and a finite global duration', () => {
    let scene = P04_DEFAULT;
    for (let index = 0; index < 4; index++) {
      scene = addParticle(scene, {
        position: { x: index * 0.1, y: index * 0.1 },
        velocity: { x: 1, y: 0 },
        chargeC: 1,
        massKg: 1,
        visible: true,
        showTrail: true,
      }, index).scene;
    }
    expect(scene.particles).toHaveLength(5);
    expect(addParticle(scene, scene.particles[0], 0).particle).toBeNull();
    expect(scene.particles.some((particle) => (scene.runtimeById[particle.id]?.launchTimeSec ?? 0) > 0)).toBe(true);
    expect(p04GlobalDuration(scene)).toBeGreaterThan(0);
    const b = scene.particles[1];
    const before = p04SolutionFor(scene.field, b);
    const edited = updateParticleAndRelaunch(scene, scene.particles[0].id, { velocity: { x: 0.5, y: 0 } }, 2);
    expect(edited.runtimeById[b.id].launchTimeSec).toBe(scene.runtimeById[b.id].launchTimeSec);
    expect(p04SolutionFor(edited.field, b).exitTimeS).toBe(before.exitTimeS);
  });

  it('shared field edits reset all launch times together', () => {
    let scene = P04_DEFAULT;
    scene = relaunchParticle(scene, scene.particles[0].id, 2);
    const changed = applySharedField(scene, { ...scene.field, Bz: 1 });
    expect(changed.field.Bz).toBe(1);
    expect(changed.runtimeById[scene.particles[0].id].launchTimeSec).toBe(0);
  });

  it('round-trips and rejects corrupt P04 storage', () => {
    const text = serializeP04Scene(P04_PRESETS['p04-three']);
    expect(parseP04StoredScene(JSON.parse(text)).scene?.particles).toHaveLength(3);
    expect(decodeP04SceneJson(text).error).toBeNull();
    expect(decodeP04SceneJson('{').scene).toBeNull();
    expect(parseP04StoredScene({ schemaVersion: 2, model: 'p04', field: { geometry: { kind: 'strip', xMin: 2, xMax: 1 }, Bz: 1 }, particles: [] }).error).toBeTruthy();
    const stored = toP04StoredScene(P04_DEFAULT);
    stored.particles[0] = { ...stored.particles[0], massKg: 0 };
    expect(parseP04StoredScene(stored).error).toBeTruthy();
  });
});

describe('P05 scene adapter, timing and persistence', () => {
  it('ships at least 8 presets with analytic crossing/tangent markers', () => {
    expect(Object.keys(P05_PRESETS).length).toBeGreaterThanOrEqual(8);
    const two = P05_PRESETS['p05-two-halves'];
    const solution = p05SolutionFor(two.field, two.particles[0]);
    const crossings = solution.events.filter((event) => event.kind === 'crossing');
    expect(crossings[0].timeS).toBeCloseTo(Math.PI, 10);
    expect(crossings[1].timeS).toBeCloseTo(2 * Math.PI, 10);
    expect(P05_PRESETS['p05-tangent']).toBeDefined();
    expect(P05_PRESETS['p05-three-zone']).toBeDefined();
    expect(P05_PRESETS['p05-sign'].particles).toHaveLength(2);
  });

  it('compares same global time, not geometric path intersections', () => {
    const same = P05_PRESETS['p05-arrival-same'];
    const atTwo = p05SameTimeDistance(same, 2, same.particles[0].id, same.particles[1].id);
    expect(atTwo.distanceM).toBeCloseTo(0, 10);
    expect(atTwo.first?.x).toBeCloseTo(2, 10);
    expect(atTwo.second?.x).toBeCloseTo(2, 10);
    const atHalf = p05SameTimeDistance(same, 1.5, same.particles[0].id, same.particles[1].id);
    expect(atHalf.distanceM).toBeGreaterThan(0.1);

    const crossing = P05_PRESETS['p05-cross-not-simultaneous'];
    const atOne = p05SameTimeDistance(crossing, 1, crossing.particles[0].id, crossing.particles[1].id);
    const atTwoCross = p05SameTimeDistance(crossing, 2, crossing.particles[0].id, crossing.particles[1].id);
    expect(atOne.distanceM).toBeGreaterThan(0.5);
    expect(atTwoCross.distanceM).toBeGreaterThan(0.5);
    expect(atOne.first).toEqual({ x: expect.closeTo(0, 8), y: expect.closeTo(0, 8) });
    expect(atTwoCross.second).toEqual({ x: expect.closeTo(0, 8), y: expect.closeTo(0, 8) });
  });

  it('keeps independent launch times and edits A without changing B/C', () => {
    const scene = P05_PRESETS['p05-launch-delay'];
    const [a, b] = scene.particles;
    expect(scene.runtimeById[b.id].launchTimeSec).toBe(1);
    const beforeB = p05StateFor(scene, b, 1.5);
    const edited = updateParticleAndRelaunch(scene, a.id, { velocity: { x: 2, y: 0 } }, 1.5);
    const afterB = p05StateFor(edited, b, 1.5);
    expect(edited.runtimeById[a.id].launchTimeSec).toBeCloseTo(1.5, 10);
    expect(edited.runtimeById[b.id].launchTimeSec).toBe(1);
    expect(afterB.tauS).toBeCloseTo(beforeB.tauS!, 10);
    expect(afterB.state?.position.x).toBeCloseTo(beforeB.state!.position.x, 10);
    expect(afterB.state?.position.y).toBeCloseTo(beforeB.state!.position.y, 10);
  });

  it('shared field changes reset every particle launch time', () => {
    const scene = P05_PRESETS['p05-launch-delay'];
    const changed = applySharedField(scene, { ...scene.field, fields: [0, 0] });
    for (const particle of changed.particles) {
      expect(changed.runtimeById[particle.id].launchTimeSec).toBe(0);
    }
  });

  it('round-trips and rejects corrupt P05 storage', () => {
    const text = serializeP05Scene(P05_PRESETS['p05-multi']);
    expect(parseP05StoredScene(JSON.parse(text)).scene?.particles).toHaveLength(3);
    expect(decodeP05SceneJson(text).error).toBeNull();
    expect(decodeP05SceneJson('{').scene).toBeNull();
    expect(parseP05StoredScene({ schemaVersion: 2, model: 'p05', field: { boundaries: [0, 0], fields: [1, -1, 0] }, particles: [] }).error).toBeTruthy();
    const stored = toP05StoredScene(P05_DEFAULT);
    stored.field.fields = [1];
    expect(parseP05StoredScene(stored).error).toBeTruthy();
  });
});
