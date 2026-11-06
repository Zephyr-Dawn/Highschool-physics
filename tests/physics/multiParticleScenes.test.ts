import { describe, expect, it } from 'vitest';
import { particleStateAt } from '../../src/physics/particles/uniformB';
import { particleTau, addParticle, createScene } from '../../src/physics/particles/multiParticle';
import {
  P02_DEFAULT,
  decodeP02SceneJson,
  loadInitialP02Scene,
  p02ModelFor,
  p02ParticleDisplay,
  p02SceneFromPreset,
  p02SeedFromDisplay,
  p02GlobalDuration,
  type P02Field,
  type P02ParticleParams,
} from '../../src/simulations/particle/p02Scene';
import {
  P03_DEFAULT,
  decodeP03SceneJson,
  loadInitialP03Scene,
  p03GlobalDuration,
  p03ParticleDisplay,
  p03SceneFromPreset,
  p03SeedFromDisplay,
  toP03StoredScene,
  p03SolutionFor,
  type P03Field,
  type P03ParticleParams,
} from '../../src/simulations/particle/p03Scene';

const p02Field: P02Field = { fieldDir: -1, fieldMag: 0.5 };
const p03Field: P03Field = { fieldDir: -1, fieldMag: 0.8, boundaryX: 0 };

const p02Base: P02ParticleParams = {
  massUnits: 1,
  chargeSign: 1,
  chargeMag: 1,
  speedUnits: 2,
  directionDeg: 0,
  startX: -0.15,
  startY: 0,
};

const p03Base: P03ParticleParams = {
  massUnits: 1,
  chargeSign: 1,
  chargeMag: 1,
  speedUnits: 2,
  directionDeg: 0,
  startX: 0,
  startY: 0,
};

describe('P02 multi-particle analytic scenes', () => {
  it('gives two same-field particles a 1:2 radius ratio and identical period', () => {
    const slow = p02ModelFor(p02Field, p02SeedFromDisplay(p02Base));
    const fast = p02ModelFor(p02Field, p02SeedFromDisplay({ ...p02Base, speedUnits: 4 }));
    expect(fast.radiusM / slow.radiusM).toBeCloseTo(2, 12);
    expect(fast.periodS).toBeCloseTo(slow.periodS, 18);
    expect(fast.direction).toBe(slow.direction);
  });

  it('turns opposite signs in opposite directions using the real solver', () => {
    const positive = p02ModelFor(p02Field, p02SeedFromDisplay({ ...p02Base, chargeSign: 1 }));
    const negative = p02ModelFor(p02Field, p02SeedFromDisplay({ ...p02Base, chargeSign: -1 }));
    const positiveState = particleStateAt(positive, 0);
    const negativeState = particleStateAt(negative, 0);
    expect(positiveState.force.y).toBeGreaterThan(0);
    expect(negativeState.force.y).toBeLessThan(0);
    expect(positive.direction).not.toBe(negative.direction);
    expect(positive.radiusM).toBeCloseTo(negative.radiusM, 18);
  });

  it('uses independent launch times; an unlaunched particle has no fake position', () => {
    let scene = createScene<P02Field>(p02Field, []);
    scene = addParticle(scene, p02SeedFromDisplay(p02Base), 0).scene;
    const second = addParticle(scene, p02SeedFromDisplay({ ...p02Base, speedUnits: 4 }), 0.3);
    scene = second.scene;
    const modelB = p02ModelFor(p02Field, second.particle!);
    expect(particleTau(scene.runtimeById.p1, 0.2)).toBeCloseTo(0.2, 12);
    expect(particleTau(scene.runtimeById.p2, 0.2)).toBeNull();
    const tau = particleTau(scene.runtimeById.p2, 0.5);
    expect(tau).toBeCloseTo(0.2, 12);
    const state = particleStateAt(modelB, tau!);
    expect(state.timeS).toBeCloseTo(0.2, 12);
    expect(state.position.x).not.toBeCloseTo(particleStateAt(modelB, 0.5).position.x, 6);
  });

  it('keeps identical initial states exactly overlapping and extends the common duration by launch time', () => {
    let scene = createScene<P02Field>(p02Field, []);
    scene = addParticle(scene, p02SeedFromDisplay(p02Base), 0).scene;
    scene = addParticle(scene, p02SeedFromDisplay(p02Base), 0.2).scene;
    const a = p02ModelFor(p02Field, scene.particles[0]);
    const b = p02ModelFor(p02Field, scene.particles[1]);
    expect(particleStateAt(a, 0.15).position).toEqual(particleStateAt(b, 0.15).position);
    expect(p02GlobalDuration(scene)).toBeGreaterThanOrEqual(0.2 + 2 * a.periodS);
  });

  it('round-trips SI particle state through display units', () => {
    const display = { ...p02Base, massUnits: 0.16, chargeSign: -1 as const, chargeMag: 1.4, speedUnits: 2.5, directionDeg: 37, startX: 0.08, startY: -0.09 };
    const roundTrip = p02ParticleDisplay(p02SeedFromDisplay(display));
    expect(roundTrip.massUnits).toBeCloseTo(display.massUnits, 12);
    expect(roundTrip.chargeSign).toBe(-1);
    expect(roundTrip.chargeMag).toBeCloseTo(display.chargeMag, 9);
    expect(roundTrip.speedUnits).toBeCloseTo(display.speedUnits, 9);
    expect(roundTrip.directionDeg).toBeCloseTo(display.directionDeg, 3);
    expect(roundTrip.startX).toBeCloseTo(display.startX, 12);
    expect(roundTrip.startY).toBeCloseTo(display.startY, 12);
  });

  it('migrates a single-particle preset into a valid one-particle scene', () => {
    const scene = p02SceneFromPreset({ ...P02_DEFAULT, speedUnits: 4 });
    expect(scene.particles).toHaveLength(1);
    expect(scene.particles[0].label).toBe('A');
    expect(scene.activeParticleId).toBe(scene.particles[0].id);
    expect(scene.particles[0].velocity.x).toBeGreaterThan(0);
    expect(p02ModelFor(scene.field, scene.particles[0]).speed0).toBeCloseTo(4e6, 6);
  });
});

describe('P03 multi-particle half-plane scenes', () => {
  it('gives boundary-entered particles 2R exit heights and T/2 field time at both speeds', () => {
    const slowParticle = p03SeedFromDisplay(p03Base);
    const fastParticle = p03SeedFromDisplay({ ...p03Base, speedUnits: 4 });
    const slow = p03SolutionFor(p03Field, slowParticle);
    const fast = p03SolutionFor(p03Field, fastParticle);
    expect(slow.status).toBe('entered-and-exited');
    expect(fast.status).toBe('entered-and-exited');
    expect(slow.exit!.position!.y).toBeCloseTo(2 * slow.magneticRadiusM!, 9);
    expect(fast.exit!.position!.y).toBeCloseTo(2 * fast.magneticRadiusM!, 9);
    expect(fast.magneticRadiusM! / slow.magneticRadiusM!).toBeCloseTo(2, 12);
    expect(slow.fieldTimeS).toBeCloseTo(slow.magneticPeriodS! / 2, 12);
    expect(fast.fieldTimeS).toBeCloseTo(fast.magneticPeriodS! / 2, 12);
  });

  it('gives opposite charge signs opposite exit heights with equal magnitude', () => {
    const positive = p03SolutionFor(p03Field, p03SeedFromDisplay(p03Base));
    const negative = p03SolutionFor(p03Field, p03SeedFromDisplay({ ...p03Base, chargeSign: -1 }));
    expect(positive.exit!.position!.y).toBeGreaterThan(0);
    expect(negative.exit!.position!.y).toBeLessThan(0);
    expect(Math.abs(positive.exit!.position!.y)).toBeCloseTo(Math.abs(negative.exit!.position!.y), 12);
  });

  it('coexists normal exit, tangent-only and no-entry particles under one shared field', () => {
    const normal = p03SolutionFor(p03Field, p03SeedFromDisplay(p03Base));
    const tangent = p03SolutionFor(
      p03Field,
      p03SeedFromDisplay({ ...p03Base, chargeSign: -1, directionDeg: 90 }),
    );
    const noEntry = p03SolutionFor(
      p03Field,
      p03SeedFromDisplay({ ...p03Base, directionDeg: 180 }),
    );
    expect(normal.status).toBe('entered-and-exited');
    expect(tangent.status).toBe('tangent-no-exit');
    expect(tangent.exit).toBeNull();
    expect(noEntry.status).toBe('no-entry');
    expect(noEntry.entry).toBeNull();
    expect(normal.entry).not.toBeNull();
  });

  it('computes one global duration that accommodates different launch times and solutions', () => {
    let scene = createScene<P03Field>(p03Field, []);
    const normal = addParticle(scene, p03SeedFromDisplay(p03Base), 0);
    scene = normal.scene;
    const delayed = addParticle(scene, p03SeedFromDisplay({ ...p03Base, speedUnits: 3 }), 0.4);
    scene = delayed.scene;
    const durationA = p03SolutionFor(p03Field, scene.particles[0]).durationS;
    const durationB = p03SolutionFor(p03Field, scene.particles[1]).durationS;
    expect(p03GlobalDuration(scene)).toBeGreaterThanOrEqual(Math.max(durationA, 0.4 + durationB));
  });

  it('round-trips P03 display units and migrates a single preset', () => {
    const display = { ...p03Base, massUnits: 0.16, chargeSign: -1 as const, chargeMag: 1, directionDeg: 25, startX: -0.2, startY: 0.03 };
    const roundTrip = p03ParticleDisplay(p03SeedFromDisplay(display));
    expect(roundTrip.massUnits).toBeCloseTo(display.massUnits, 12);
    expect(roundTrip.chargeSign).toBe(-1);
    expect(roundTrip.directionDeg).toBeCloseTo(display.directionDeg, 6);
    const scene = p03SceneFromPreset(P03_DEFAULT);
    expect(scene.particles).toHaveLength(1);
    expect(scene.particles[0].label).toBe('A');
    expect(scene.field.boundaryX).toBe(P03_DEFAULT.boundaryX);
  });
});

describe('multi-particle scene persistence and migration', () => {
  it('serializes P02 launch times and active selection and restores particles independently', () => {
    let scene = createScene<P02Field>(p02Field, []);
    scene = addParticle(scene, p02SeedFromDisplay(p02Base), 0).scene;
    scene = addParticle(scene, p02SeedFromDisplay({ ...p02Base, speedUnits: 4 }), 0.3).scene;
    scene = { ...scene, activeParticleId: 'p2' };
    const json = JSON.stringify({
      schemaVersion: 2,
      model: 'p02',
      field: scene.field,
      particles: scene.particles,
      runtimeById: scene.runtimeById,
      activeParticleId: scene.activeParticleId,
    });
    const parsed = decodeP02SceneJson(json);
    expect(parsed.error).toBeNull();
    expect(parsed.scene?.particles).toHaveLength(2);
    expect(parsed.scene?.activeParticleId).toBe('p2');
    expect(parsed.scene?.runtimeById.p2.launchTimeSec).toBeCloseTo(0.3, 12);
  });

  it('accepts a legacy single-particle P02/P03 object and rejects corrupt or over-limit imports', () => {
    const legacyP02 = decodeP02SceneJson(JSON.stringify(P02_DEFAULT));
    expect(legacyP02.scene?.particles).toHaveLength(1);
    expect(legacyP02.scene?.particles[0].label).toBe('A');
    const legacyP03 = decodeP03SceneJson(JSON.stringify(P03_DEFAULT));
    expect(legacyP03.scene?.particles).toHaveLength(1);
    expect(legacyP03.scene?.particles[0].position.x).toBeCloseTo(P03_DEFAULT.startX, 12);

    const invalid = decodeP02SceneJson('{not json');
    expect(invalid.scene).toBeNull();
    expect(invalid.error).toContain('JSON');

    const six = {
      schemaVersion: 2,
      model: 'p02',
      field: p02Field,
      particles: Array.from({ length: 6 }, (_, index) => ({
        ...p02SeedFromDisplay(p02Base),
        id: `x${index}`,
        label: ['A', 'B', 'C', 'D', 'E', 'A'][index],
        color: '#000',
        lineStyle: 'solid',
      })),
      activeParticleId: 'x0',
    };
    const overflow = decodeP02SceneJson(JSON.stringify(six));
    expect(overflow.scene).toBeNull();
    expect(overflow.error).toContain('1–5');
  });

  it('rejects duplicate IDs and nonpositive mass without crashing', () => {
    const base = {
      schemaVersion: 2,
      model: 'p03',
      field: p03Field,
      particles: [
        { ...p03SeedFromDisplay(p03Base), id: 'same', label: 'A', color: '#1d4ed8', lineStyle: 'solid' },
        { ...p03SeedFromDisplay(p03Base), id: 'same', label: 'B', color: '#c2410c', lineStyle: 'dashed' },
      ],
      activeParticleId: 'same',
    };
    const duplicate = decodeP03SceneJson(JSON.stringify(base));
    expect(duplicate.scene).toBeNull();
    expect(duplicate.error).toContain('重复');
    base.particles[1].id = 'other';
    base.particles[1].massKg = 0;
    const negativeMass = decodeP03SceneJson(JSON.stringify(base));
    expect(negativeMass.scene).toBeNull();
    expect(negativeMass.error).toContain('质量');
  });
});


describe('multi-particle localStorage migration', () => {
  it('migrates old P02/P03 single-particle params and renders at t=0 without losing the scene', () => {
    window.localStorage.clear();
    window.localStorage.setItem('emplab.p02.params.v1', JSON.stringify({ ...P02_DEFAULT, speedUnits: 3.5 }));
    const p02 = loadInitialP02Scene();
    expect(p02.particles).toHaveLength(1);
    expect(p02.particles[0].label).toBe('A');
    expect(p02.runtimeById.p1.launchTimeSec).toBe(0);
    expect(p02ModelFor(p02.field, p02.particles[0]).speed0).toBeCloseTo(3.5e6, 3);

    window.localStorage.removeItem('emplab.p02.params.v1');
    window.localStorage.setItem('emplab.p03.params.v1', JSON.stringify({ ...P03_DEFAULT, directionDeg: 25 }));
    const p03 = loadInitialP03Scene();
    expect(p03.particles).toHaveLength(1);
    expect(p03.particles[0].label).toBe('A');
    expect(p03.runtimeById.p1.launchTimeSec).toBe(0);
    expect(p03ParticleDisplay(p03.particles[0]).directionDeg).toBeCloseTo(25, 5);
  });

  it('resets stored runtime launch times on reload while keeping particle configuration', () => {
    const base = p03SceneFromPreset(P03_DEFAULT);
    const stored = toP03StoredScene({ ...base, runtimeById: { p1: { launchTimeSec: 0.75 } } });
    window.localStorage.clear();
    window.localStorage.setItem('emplab.p03.scene.v2', JSON.stringify(stored));
    const loaded = loadInitialP03Scene();
    expect(loaded.runtimeById.p1.launchTimeSec).toBe(0);
    expect(loaded.particles[0].position.x).toBeCloseTo(base.particles[0].position.x, 12);
  });
});
