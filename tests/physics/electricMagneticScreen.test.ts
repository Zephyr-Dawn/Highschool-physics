import { describe, expect, it } from 'vitest';
import {
  A17_DEFAULT_INPUT,
  compositeElectricWorkCheck,
  compositeMagneticWorkCheck,
  compositeScreenX,
  solveElectricMagneticScreen,
  verifyCompositeContinuity,
  type ElectricMagneticScreenInput,
} from '../../src/physics/composite/electricMagneticScreen';

const SQRT3 = Math.sqrt(3);

function withInput(patch: Partial<ElectricMagneticScreenInput>): ElectricMagneticScreenInput {
  return { ...A17_DEFAULT_INPUT, ...patch };
}

describe('A17-01 continuous electric acceleration -> magnetic strip -> free drift -> screen', () => {
  it('matches the independent analytic anchor at every stage', () => {
    const solution = solveElectricMagneticScreen(A17_DEFAULT_INPUT);
    expect(solution.outcome).toBe('screen-hit');
    expect(solution.issue).toBeNull();
    expect(solution.exitAElectric).not.toBeNull();
    expect(solution.exitBMagnetic).not.toBeNull();
    expect(solution.screen).not.toBeNull();

    expect(solution.stageTimings.electricS).toBeCloseTo(SQRT3 - 1, 10);
    expect(solution.exitAElectric!.position.x).toBeCloseTo(1, 10);
    expect(solution.exitAElectric!.position.y).toBeCloseTo(0, 10);
    expect(solution.exitAElectric!.velocity.x).toBeCloseTo(SQRT3, 10);
    expect(solution.exitAElectric!.velocity.y).toBeCloseTo(0, 10);
    expect(solution.exitAElectric!.speedMps).toBeCloseTo(SQRT3, 10);

    expect(solution.stageTimings.magneticS).toBeCloseTo(Math.PI / 6, 9);
    expect(solution.exitBMagnetic!.position.x).toBeCloseTo(1 + SQRT3 / 2, 9);
    expect(solution.exitBMagnetic!.position.y).toBeCloseTo(SQRT3 - 1.5, 9);
    expect(solution.exitBMagnetic!.velocity.x).toBeCloseTo(1.5, 9);
    expect(solution.exitBMagnetic!.velocity.y).toBeCloseTo(SQRT3 / 2, 9);

    expect(solution.stageTimings.driftS).toBeCloseTo(2 / 3, 9);
    expect(solution.screen!.position.x).toBeCloseTo(2 + SQRT3 / 2, 9);
    expect(solution.screen!.position.y).toBeCloseTo((4 * SQRT3) / 3 - 1.5, 9);
    expect(solution.screen!.timeS).toBeCloseTo(SQRT3 - 1 + Math.PI / 6 + 2 / 3, 9);
    expect(solution.stageTimings.totalS).toBeCloseTo(solution.screen!.timeS, 12);
  });

  it('records two physically continuous handoffs within 1e-9 SI tolerance', () => {
    const solution = solveElectricMagneticScreen(A17_DEFAULT_INPUT);
    expect(solution.handoffs).toHaveLength(2);
    expect(solution.handoffs.map((item) => `${item.from}->${item.to}`)).toEqual([
      'electric-acceleration->magnetic-strip',
      'magnetic-strip->free-drift',
    ]);
    for (const item of solution.handoffs) {
      expect(item.status).toBe('continuous');
      expect(item.positionErrorM).toBeLessThanOrEqual(1e-9);
      expect(item.velocityErrorMps).toBeLessThanOrEqual(1e-9);
      expect(item.timeErrorS).toBeLessThanOrEqual(1e-9);
    }
    expect(verifyCompositeContinuity(solution)).toBe(true);
    expect(solution.events.find((event) => event.id === 'a-exit')?.tGlobalS).toBeCloseTo(solution.stageTimings.electricS, 12);
    expect(solution.events.find((event) => event.id === 'b-exit')?.tGlobalS).toBeCloseTo(
      solution.stageTimings.electricS + solution.stageTimings.magneticS,
      9,
    );
    expect(solution.events.find((event) => event.id === 'screen-hit')?.tGlobalS).toBeCloseTo(solution.screen!.timeS, 9);
  });

  it('conserves the expected energy and magnetic-work invariants', () => {
    const solution = solveElectricMagneticScreen(A17_DEFAULT_INPUT);
    expect(compositeElectricWorkCheck(solution)).toBeCloseTo(1, 10);
    expect(compositeMagneticWorkCheck(solution)).toBeCloseTo(0, 10);
    const initial = solution.stateAt(0);
    const screen = solution.stateAt(solution.durationS);
    expect(screen.kineticEnergyJ - initial.kineticEnergyJ).toBeCloseTo(1, 9);
    expect(solution.screen!.snapshot.speedMps).toBeCloseTo(solution.exitBMagnetic!.speedMps, 12);
  });

  it('rewrites every downstream state and answer after changing E_x', () => {
    const base = solveElectricMagneticScreen(A17_DEFAULT_INPUT);
    const stronger = solveElectricMagneticScreen(withInput({ electricFieldXVPerM: 2 }));
    expect(stronger.outcome).toBe('screen-hit');
    expect(stronger.stageTimings.electricS).toBeCloseTo((Math.sqrt(5) - 1) / 2, 9);
    expect(stronger.exitAElectric!.velocity.x).toBeCloseTo(Math.sqrt(5), 9);
    expect(stronger.exitBMagnetic!.position.y).not.toBeCloseTo(base.exitBMagnetic!.position.y, 6);
    expect(stronger.screen!.position.y).not.toBeCloseTo(base.screen!.position.y, 6);
    expect(stronger.stageTimings.totalS).not.toBeCloseTo(base.stageTimings.totalS, 6);
    expect(verifyCompositeContinuity(stronger)).toBe(true);
  });

  it('recomputes downstream events after changing Bz, width and screen gap', () => {
    const reversed = solveElectricMagneticScreen(withInput({ magneticFieldZT: 1 }));
    expect(reversed.outcome).toBe('screen-hit');
    expect(reversed.screen!.position.y).toBeCloseTo(-((4 * SQRT3) / 3 - 1.5), 9);
    expect(reversed.events.find((event) => event.id === 'screen-hit')?.position.y).toBeCloseTo(reversed.screen!.position.y, 9);

    const zeroField = solveElectricMagneticScreen(withInput({ magneticFieldZT: 0 }));
    expect(zeroField.outcome).toBe('screen-hit');
    expect(zeroField.stageTimings.magneticS).toBeCloseTo(SQRT3 / 2 / SQRT3, 9);
    expect(zeroField.screen!.position.y).toBeCloseTo(0, 9);

    const wider = solveElectricMagneticScreen(withInput({ magneticWidthM: 0.6 }));
    expect(wider.screen!.position.x).toBeCloseTo(compositeScreenX(withInput({ magneticWidthM: 0.6 })), 9);
    expect(wider.screen!.position.y).not.toBeCloseTo(solveElectricMagneticScreen(A17_DEFAULT_INPUT).screen!.position.y, 6);

    const farther = solveElectricMagneticScreen(withInput({ screenGapM: 1.4 }));
    expect(farther.stageTimings.driftS).toBeCloseTo(1.4 / 1.5, 9);
    expect(farther.screen!.position.y).not.toBeCloseTo(solveElectricMagneticScreen(A17_DEFAULT_INPUT).screen!.position.y, 6);
  });

  it('does not fabricate an entry, exit or screen spot in degenerate geometry', () => {
    const noReach = solveElectricMagneticScreen(withInput({ electricFieldXVPerM: -2, initialVelocity: { x: 1, y: 0 } }));
    expect(noReach.outcome).toBe('boundary-not-reached');
    expect(noReach.screen).toBeNull();
    expect(noReach.exitBMagnetic).toBeNull();
    expect(noReach.handoffs).toHaveLength(0);

    const tangent = solveElectricMagneticScreen(withInput({ magneticFieldZT: -2 }));
    expect(tangent.outcome).toBe('screen-missed');
    expect(tangent.screen).toBeNull();
    expect(tangent.events.some((event) => event.id === 'screen-hit')).toBe(false);

    const tooNarrowScreen = solveElectricMagneticScreen(withInput({ screenHalfHeightM: 0.5 }));
    expect(tooNarrowScreen.outcome).toBe('screen-outside');
    expect(tooNarrowScreen.screen).not.toBeNull();
    expect(tooNarrowScreen.screen!.accepted).toBe(false);
    expect(tooNarrowScreen.events.some((event) => event.id === 'screen-outside')).toBe(true);
  });

  it('rejects invalid physical inputs without producing traces', () => {
    const invalidMass = solveElectricMagneticScreen(withInput({ massKg: 0 }));
    expect(invalidMass.outcome).toBe('invalid');
    expect(invalidMass.issue).toContain('质量');
    expect(invalidMass.trace).toHaveLength(0);
    const invalidWidth = solveElectricMagneticScreen(withInput({ magneticWidthM: 0 }));
    expect(invalidWidth.outcome).toBe('invalid');
    expect(invalidWidth.screen).toBeNull();
  });
});
