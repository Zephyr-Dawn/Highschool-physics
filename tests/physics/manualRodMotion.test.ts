import { describe, expect, it } from 'vitest';
import { ManualRodSession, MANUAL_ROD_SETTINGS, estimateManualVelocity } from '../../src/physics/induction/manualRodMotion';
import type { RodMedium } from '../../src/physics/induction/movingRod';

const medium: RodMedium = {
  BzTesla: 1,
  lengthM: 1,
  resistanceOhm: 2,
  circuitClosed: true,
  massKg: 1,
};

describe('I02 timestamped manual rod motion', () => {
  it('T17 estimates a uniform drag from irregular real timestamps and decays on hold', () => {
    const session = new ManualRodSession(medium, MANUAL_ROD_SETTINGS);
    session.reset(0, 1);
    const times = [0.021, 0.047, 0.072, 0.103, 0.128, 0.151, 0.179, 0.204, 0.231, 0.258, 0.281, 0.309];
    for (const time of times) session.record(time, 1 + 2 * time);
    const moving = session.getSnapshot();
    expect(moving.velocityMps).toBeGreaterThan(1.85);
    expect(moving.velocityMps).toBeLessThan(2.15);
    expect(moving.emfV).toBeLessThan(0);
    expect(moving.currentA).toBeLessThan(0);
    expect(moving.estimated).toBe(true);

    for (const time of [0.34, 0.38, 0.42, 0.46, 0.5, 0.54]) {
      session.record(time, 1 + 2 * times[times.length - 1]);
    }
    const held = session.getSnapshot();
    expect(Math.abs(held.velocityMps)).toBeLessThan(0.05);
    expect(Math.abs(held.emfV)).toBeLessThan(0.05);
    expect(Math.abs(held.currentA)).toBeLessThan(0.03);
    expect(held.jouleHeatJ).toBeGreaterThanOrEqual(moving.jouleHeatJ ?? 0);
  });

  it('T18 reverses direction, keeps heat non-negative, cancels safely and preserves history', () => {
    const session = new ManualRodSession(medium, MANUAL_ROD_SETTINGS);
    session.reset(0, 1);
    const forward = [0.031, 0.078, 0.113, 0.169, 0.224, 0.281, 0.338];
    for (const time of forward) session.record(time, 1 + 2 * time);
    const forwardState = session.getSnapshot();
    expect(forwardState.currentA).toBeLessThan(0);
    expect(forwardState.magneticForceXN).toBeLessThan(0);
    const pivotX = 1 + 2 * forward[forward.length - 1];
    const backward = [0.372, 0.421, 0.463, 0.512, 0.567];
    for (const time of backward) {
      session.record(time, pivotX - 2 * (time - forward[forward.length - 1]));
    }
    const backwardState = session.getSnapshot();
    expect(backwardState.velocityMps).toBeLessThan(0);
    expect(backwardState.currentA).toBeGreaterThan(0);
    expect(backwardState.magneticForceXN).toBeGreaterThan(0);
    expect(backwardState.jouleHeatJ).toBeGreaterThanOrEqual(0);
    const historyBeforeCancel = session.getHistory().length;
    expect(historyBeforeCancel).toBeGreaterThan(8);
    const canceled = session.cancel(0.58);
    expect(canceled.velocityMps).toBe(0);
    expect(canceled.emfV).toBe(0);
    expect(canceled.currentA).toBe(0);
    expect(canceled.magneticForceXN).toBe(0);
    expect(canceled.jouleHeatJ).toBe(backwardState.jouleHeatJ);
    expect(session.getHistory().length).toBeGreaterThanOrEqual(historyBeforeCancel);
  });

  it('never integrates an implausibly large dt after a gesture gap', () => {
    const session = new ManualRodSession(medium, MANUAL_ROD_SETTINGS);
    session.reset(0, 1);
    session.record(0.05, 1.1);
    session.record(0.10, 1.2);
    const beforeGap = session.getSnapshot();
    expect(beforeGap.jouleHeatJ).toBeGreaterThan(0);
    session.record(2.0, 3.0);
    const afterGap = session.getSnapshot();
    expect(Number.isFinite(afterGap.velocityMps)).toBe(true);
    expect(Math.abs(afterGap.velocityMps)).toBeLessThanOrEqual(MANUAL_ROD_SETTINGS.maxSpeedMps);
    expect((afterGap.jouleHeatJ ?? 0) - (beforeGap.jouleHeatJ ?? 0)).toBeLessThan(0.1);
    session.record(2.02, 3.04);
    const resumed = session.getSnapshot();
    expect(Number.isFinite(resumed.velocityMps)).toBe(true);
    expect(resumed.jouleHeatJ).toBeGreaterThanOrEqual(afterGap.jouleHeatJ ?? 0);
  });

  it('keeps the cumulative heat after history truncation and reports truncation', () => {
    const session = new ManualRodSession(medium, {
      ...MANUAL_ROD_SETTINGS,
      maxHistoryS: 0.3,
      maxPoints: 12,
    });
    session.reset(0, 1);
    let last = session.getSnapshot();
    for (let index = 1; index <= 40; index++) {
      const time = index * 0.02;
      last = session.record(time, 1 + 1.5 * time);
    }
    expect(session.getHistory().length).toBeLessThanOrEqual(12);
    expect(session.getHistoryTruncated()).toBe(true);
    expect(last.jouleHeatJ).toBeGreaterThan(0);
    expect(Number.isFinite(last.jouleHeatJ)).toBe(true);
  });

  it('applies the same electromagnetic signs in manual mode and removes them when open', () => {
    const closed = new ManualRodSession(medium);
    closed.reset(0, 1);
    closed.record(0.02, 0.98);
    closed.record(0.04, 0.96);
    const state = closed.getSnapshot();
    expect(state.velocityMps).toBeLessThan(0);
    expect(state.emfV).toBeGreaterThan(0);
    expect(state.currentA).toBeGreaterThan(0);
    expect(state.magneticForceXN).toBeGreaterThan(0);

    const open = new ManualRodSession({ ...medium, circuitClosed: false });
    open.reset(0, 1);
    open.record(0.02, 1.02);
    open.record(0.04, 1.04);
    const openState = open.getSnapshot();
    expect(openState.emfV).toBeLessThan(0);
    expect(openState.currentA).toBe(0);
    expect(openState.magneticForceXN).toBe(0);
    expect(openState.jouleHeatJ).toBe(0);
  });

  it('pure velocity estimator returns zero for duplicate times and respects the speed clamp', () => {
    expect(
      estimateManualVelocity(
        [
          { tS: 0.1, xM: 1 },
          { tS: 0.1, xM: 2 },
        ],
        0.1,
        MANUAL_ROD_SETTINGS,
      ),
    ).toBe(0);
    const samples = [
      { tS: 0, xM: 0 },
      { tS: 0.02, xM: 2 },
      { tS: 0.04, xM: 4 },
    ];
    expect(estimateManualVelocity(samples, 0.04, MANUAL_ROD_SETTINGS)).toBe(20);
    expect(estimateManualVelocity(samples, 0.04, { ...MANUAL_ROD_SETTINGS, maxSpeedMps: 5 })).toBe(5);
  });
});
