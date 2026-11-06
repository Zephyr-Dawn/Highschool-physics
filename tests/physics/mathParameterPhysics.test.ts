import { describe, expect, it } from 'vitest';
import { parseParameterExpression } from '../../src/math/parameterExpression';
import { PARAMETER_DOMAINS, validateParameterValue } from '../../src/math/parameterValidation';
import { P02_DEFAULT, p02ModelFor, p02SceneFromPreset } from '../../src/simulations/particle/p02Scene';
import {
  P06_PRESETS,
  p06ParticleDisplay,
  p06SeedFromDisplay,
} from '../../src/simulations/particle/p06Scene';
import {
  P07_PRESETS,
  p07ParticleDisplay,
  p07SeedFromDisplay,
} from '../../src/simulations/particle/p07Scene';
import {
  activeParticle,
  updateParticleAndRelaunch,
} from '../../src/physics/particles/multiParticle';
import {
  solveBeamlineTrajectory,
  validateBeamlineApparatus,
  type BeamlineApparatus,
  type BeamlineInput,
} from '../../src/physics/particles/beamline';
import { uniformB3DModel } from '../../src/physics/particles/uniformB3D';
import { evaluateFluxLenz } from '../../src/physics/induction/fluxLenz';
import {
  applyManualTarget,
  createManualTimeline,
  evaluateInduction,
  evaluateManualField,
  evaluateWaveform,
} from '../../src/physics/induction/timeVaryingField';
import { rodStateAt, solveRod, type RodParams } from '../../src/physics/induction/movingRod';
import {
  DEFAULT_LOOP_PARAMS,
  simulateLoop,
  stateAtTime,
} from '../../src/physics/induction/loopField';

function expression(text: string): number {
  const result = parseParameterExpression(text);
  if (!result.ok) throw new Error(`${text}: ${result.message}`);
  return result.value;
}

const CHARGE_E_C = 1.602176634e-19;
const MASS_UNIT_KG = 1e-26;
const SPEED_UNIT_MPS = 1e6;

const standardApparatus: BeamlineApparatus = {
  acceleration: { enabled: false, x0: -2, x1: -0.5, Ex: 1 },
  selector: { x0: 0, x1: 2, Ey: -2, Bz: -1 },
  analyzer: { x0: 2, x1: 3, Bz: -1 },
  deflector: { x0: 3, x1: 5, Ey: -0.5 },
  entranceSlit: { x: 0, yCenter: 0, halfWidth: 0.12 },
  exitSlit: { x: 2, yCenter: 0, halfWidth: 0.12 },
  screen: { x: 5, yMin: -2.5, yMax: 2.5 },
};

const beamInput: BeamlineInput = {
  massKg: 1,
  chargeC: 1,
  initialPosition: { x: -2, y: 0 },
  initialVelocity: { x: 2, y: 0 },
  apparatus: standardApparatus,
  maxTimeS: 8,
  maxEvents: 60,
};

const rodBase: RodParams = {
  mode: 'constant-speed',
  BzTesla: 1,
  lengthM: 2,
  resistanceOhm: 4,
  circuitClosed: true,
  startXM: 1,
  initialSpeedMps: 3,
  massKg: 1,
  externalForceN: 0,
};

describe('P02/P03: expression values reach the analytic solver without slider clamping', () => {
  it('uses B = √3/2 T and B = 5 T directly in R = mv/(qB)', () => {
    const B = expression('√3/2');
    const scene = p02SceneFromPreset({ ...P02_DEFAULT, fieldMag: B });
    const model = p02ModelFor(scene.field, scene.particles[0]);
    const expected = (MASS_UNIT_KG * 2 * SPEED_UNIT_MPS) / (CHARGE_E_C * B);
    expect(model.radiusM).toBeCloseTo(expected, 15);
    expect(model.radiusM).toBeCloseTo(0.14414, 4);

    const strong = p02SceneFromPreset({ ...P02_DEFAULT, fieldMag: 5 });
    const strongModel = p02ModelFor(strong.field, strong.particles[0]);
    expect(strong.field.fieldMag).toBe(5);
    expect(strongModel.radiusM).toBeCloseTo(expected * (B / 5), 14);
    expect(strongModel.radiusM).toBeCloseTo(0.024966, 5);
  });

  it('converts a √2 cm input exactly to metres before solving', () => {
    const startX = expression('√2') / 100;
    const scene = p02SceneFromPreset({ ...P02_DEFAULT, startX });
    const model = p02ModelFor(scene.field, scene.particles[0]);
    expect(model.input.initialPosition.x).toBeCloseTo(Math.SQRT2 / 100, 16);
  });
});

describe('P01 3D: expression Bz = √2 T drives radius, period, pitch and force', () => {
  it('matches the analytic 3D helix values', () => {
    const B = expression('√2');
    const model = uniformB3DModel({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 2, y: 0, z: 1 },
      chargeC: 1,
      massKg: 1,
      B: { x: 0, y: 0, z: B },
    });
    expect(model.valid).toBe(true);
    expect(model.radiusM).toBeCloseTo(2 / B, 14);
    expect(model.periodS).toBeCloseTo((2 * Math.PI) / B, 14);
    expect(model.pitchSignedM).toBeCloseTo((2 * Math.PI) / B, 14);
    expect(Math.hypot(model.initialForce.x, model.initialForce.y, model.initialForce.z)).toBeCloseTo(2 * B, 14);
  });
});

describe('P06/P07: single-particle expression edits keep the shared clock semantics', () => {
  it('P06 edits A speed = √3 m/s and relaunches only A', () => {
    const scene = P06_PRESETS['p06-sign'];
    const a = activeParticle(scene)!;
    const b = scene.particles[1] ?? scene.particles[0];
    const beforeB = { ...scene.runtimeById[b.id] };
    const now = 1.25;
    const seed = p06SeedFromDisplay({
      ...p06ParticleDisplay(a),
      speedMps: expression('√3'),
    });
    const next = updateParticleAndRelaunch(scene, a.id, seed, now);
    const nextA = next.particles.find((particle) => particle.id === a.id)!;
    expect(Math.hypot(nextA.velocity.x, nextA.velocity.y)).toBeCloseTo(Math.sqrt(3), 14);
    expect(next.runtimeById[a.id].launchTimeSec).toBe(now);
    for (const particle of scene.particles.filter((item) => item.id !== a.id)) {
      expect(next.runtimeById[particle.id]).toEqual(scene.runtimeById[particle.id]);
      expect(next.particles.find((item) => item.id === particle.id)).toEqual(particle);
    }
    expect(beforeB.launchTimeSec).toBe(next.runtimeById[b.id].launchTimeSec);
  });

  it('P07 edits A speed = √3 m/s and leaves B/C launch times untouched', () => {
    const scene = P07_PRESETS['p07-multi'];
    const a = scene.particles[0];
    const now = 2.5;
    const seed = p07SeedFromDisplay({
      ...p07ParticleDisplay(a),
      speedMps: expression('√3'),
    });
    const next = updateParticleAndRelaunch(scene, a.id, seed, now);
    const nextA = next.particles.find((particle) => particle.id === a.id)!;
    expect(Math.hypot(nextA.velocity.x, nextA.velocity.y)).toBeCloseTo(Math.sqrt(3), 14);
    expect(next.runtimeById[a.id].launchTimeSec).toBe(now);
    for (const particle of scene.particles.filter((item) => item.id !== a.id)) {
      expect(next.runtimeById[particle.id]).toEqual(scene.runtimeById[particle.id]);
      expect(next.particles.find((item) => item.id === particle.id)).toEqual(particle);
    }
  });

  it('P07 fractional slit half-width 1/3 m admits 0.2 m offset and absorbs 0.4 m', () => {
    const halfWidth = expression('1/3');
    const apparatus: BeamlineApparatus = {
      ...standardApparatus,
      entranceSlit: { x: 0, yCenter: 0, halfWidth },
    };
    const passing = solveBeamlineTrajectory({
      ...beamInput,
      apparatus,
      initialPosition: { x: -2, y: 0.2 },
    });
    expect(passing.absorption?.slitId).not.toBe('entrance');

    const blocked = solveBeamlineTrajectory({
      ...beamInput,
      apparatus,
      initialPosition: { x: -2, y: 0.4 },
    });
    expect(blocked.outcome).toBe('absorbed');
    expect(blocked.absorption?.slitId).toBe('entrance');
    expect(blocked.absorption?.timeS).toBeCloseTo(1, 10);
    expect(blocked.absorption?.position.y).toBeCloseTo(0.4, 10);
  });

  it('P07 rejects a screen upstream of the deflector instead of silently moving it', () => {
    const invalid: BeamlineApparatus = {
      ...standardApparatus,
      screen: { ...standardApparatus.screen, x: 2 },
    };
    expect(validateBeamlineApparatus(invalid)).toContain('屏幕必须位于');
  });
});

describe('I01: N and B expressions plus the real manual ramp', () => {
  it('uses N = 8 and B = 5 T in flux linkage', () => {
    const snapshot = evaluateFluxLenz({
      mode: 'field',
      Bz: 5,
      areaM2: 0.02,
      thetaRad: 0,
      dBdt: 0,
      dAdt: 0,
      dThetaDt: 0,
      turns: 8,
      resistanceOhm: 4,
      circuitClosed: true,
      derivativeQuality: 'exact',
    });
    expect(snapshot.psiWbTurn).toBeCloseTo(8 * 5 * 0.02, 12);
    expect(snapshot.phiWb).toBeCloseTo(0.1, 12);
  });

  it('rejects N = 3/2 instead of rounding it', () => {
    const parsed = parseParameterExpression('3/2');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const validation = validateParameterValue(parsed.value, PARAMETER_DOMAINS.turns, '匝数 N', '匝');
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toBe('not-integer');
      expect(validation.message).toContain('不会被四舍五入');
    }
  });

  it('applies a 5 T manual target through the finite 0.4 s / 4 T·s⁻¹ ramp, not a jump', () => {
    const timeline = createManualTimeline(0, { rampSeconds: 0.4, maxAbsRateTeslaPerS: 4 });
    const result = applyManualTarget(timeline, 0, 5);
    expect(result.limited).toBe(true);
    expect(result.appliedTargetBzTesla).toBeCloseTo(1.6, 12);
    expect(result.rateTeslaPerS).toBeCloseTo(4, 12);
    expect(evaluateManualField(result.timeline, 0).dbdt).toBeCloseTo(4, 12);
    expect(evaluateManualField(result.timeline, 0.2).bzTesla).toBeCloseTo(0.8, 12);
    expect(evaluateManualField(result.timeline, 0.4).bzTesla).toBeCloseTo(1.6, 12);
  });
});

describe('I02: R = 1/3 Ω and F = √2 N stay finite and conserve energy', () => {
  it('computes a finite terminal velocity and a small energy residual', () => {
    const solution = solveRod({
      ...rodBase,
      mode: 'constant-force',
      resistanceOhm: 1 / 3,
      externalForceN: Math.SQRT2,
      initialSpeedMps: 0,
    });
    expect(solution.k).toBeCloseTo(12, 12);
    expect(solution.terminalVelocityMps).toBeCloseTo(Math.SQRT2 / 12, 12);
    const final = rodStateAt(solution, solution.durationS);
    expect(Number.isFinite(final.energyResidualJ ?? Number.NaN)).toBe(true);
    expect(Math.abs(final.energyResidualJ ?? Number.POSITIVE_INFINITY)).toBeLessThan(1e-6);
  });

  it('uses R = 1/3 Ω in the constant-speed EMF/current ratio', () => {
    const solution = solveRod({ ...rodBase, resistanceOhm: 1 / 3 });
    const state = rodStateAt(solution, 0);
    expect(state.emfV).toBeCloseTo(-6, 12);
    expect(state.currentA).toBeCloseTo(-18, 12);
  });
});

describe('I03: B = √2 T and loop width = 1/3 m are not clamped to slider ranges', () => {
  it('uses the true B beyond the slider maximum in every sample', () => {
    const one = simulateLoop({ ...DEFAULT_LOOP_PARAMS, BzTesla: 1 });
    const stronger = simulateLoop({ ...DEFAULT_LOOP_PARAMS, BzTesla: 5 });
    const sample = one.samples.find((item) => item.tS > 0.2 && item.overlapAreaM2 > 1e-6);
    expect(sample).toBeDefined();
    if (!sample) return;
    const strongerState = stateAtTime(stronger, sample.tS);
    expect(sample.fluxWb).toBeCloseTo(sample.overlapAreaM2, 12);
    expect(strongerState.fluxWb).toBeCloseTo(5 * sample.overlapAreaM2, 12);
    for (const value of stronger.samples.flatMap((item) => [item.xM, item.fluxWb, item.emfV, item.currentA])) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('accepts a 1/3 m loop width and produces finite events', () => {
    const sim = simulateLoop({
      ...DEFAULT_LOOP_PARAMS,
      loopWidthM: 1 / 3,
      BzTesla: Math.SQRT2,
      fieldRightM: 0.7,
    });
    expect(sim.durationS).toBeGreaterThan(0);
    expect(sim.events.length).toBeGreaterThan(0);
    for (const value of sim.samples.flatMap((item) => [item.fluxWb, item.emfV, item.currentA, item.forceXN])) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(sim.params.loopWidthM).toBeCloseTo(1 / 3, 15);
  });
});

describe('I04: slope = √2 T/s drives the analytic Faraday EMF', () => {
  it('uses the exact slope beyond the slider range', () => {
    const slope = expression('√2');
    const wave = evaluateWaveform(
      {
        kind: 'linear',
        durationS: 4,
        b0Tesla: 0.2,
        slopeTeslaPerS: slope,
        amplitudeTesla: 0.3,
        frequencyHz: 1,
        phaseRad: 0,
        riseS: 1,
        topS: 1,
        fallS: 1,
        bottomS: 1,
      },
      0.5,
    );
    const snapshot = evaluateInduction(
      { turns: 10, areaM2: 0.02, resistanceOhm: 5, circuitClosed: true },
      wave,
      true,
    );
    expect(snapshot.emfV).toBeCloseTo(-10 * 0.02 * slope, 12);
    expect(snapshot.currentA).toBeCloseTo((-10 * 0.02 * slope) / 5, 12);
  });

  it('rejects a manual target outside the model stability range before solving', () => {
    const validation = validateParameterValue(12, PARAMETER_DOMAINS.manualField, '实时目标 B', 'T');
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.reason).toBe('unstable');
  });
});
