import { estimateManualVelocity } from './manualRodMotion';
import {
  computeI07Snapshot,
  i07WallLimit,
  type I07Params,
  type I07Snapshot,
} from './oppositeFieldsWallLoop';

export interface ManualWallLoopSettings {
  velocityWindowS: number;
  maxDtS: number;
  maxHistoryS: number;
  maxPoints: number;
  maxSpeedMps: number;
}

export const MANUAL_WALL_LOOP_SETTINGS: ManualWallLoopSettings = {
  velocityWindowS: 0.3,
  maxDtS: 0.25,
  maxHistoryS: 20,
  maxPoints: 800,
  maxSpeedMps: 20,
};

const APPROXIMATION =
  '手动手势速度由单调时间戳样本估计；不提供精确手部作用力或能量残差。挡板处位置被夹持，不穿透。';

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function manualSnapshot(
  params: I07Params,
  timeS: number,
  xM: number,
  velocityMps: number,
  heat: number,
): I07Snapshot {
  return computeI07Snapshot(
    params,
    timeS,
    xM,
    velocityMps,
    { jouleHeatJ: heat, externalWorkJ: 0, impactLossJ: 0 },
    { approximation: APPROXIMATION },
  );
}

/**
 * I07-D: the loop position is externally imposed by a finger. The hand force is
 * never inferred; the session reports estimated heat only. Releasing the finger
 * means "held at rest", not an elastic collision.
 */
export class ManualWallLoopSession {
  private readonly params: I07Params;
  private readonly settings: ManualWallLoopSettings;
  private samples: Array<{ tS: number; xM: number }> = [];
  private history: I07Snapshot[] = [];
  private snapshotValue: I07Snapshot;
  private lastT = 0;
  private lastX: number;
  private lastPower = 0;
  private heat = 0;
  private dragging = false;
  private truncated = false;

  constructor(params: I07Params, settings: ManualWallLoopSettings = MANUAL_WALL_LOOP_SETTINGS) {
    this.params = { ...params, mode: 'manual-x' };
    this.settings = settings;
    this.lastX = params.startXM;
    this.snapshotValue = manualSnapshot(this.params, 0, params.startXM, 0, 0);
    this.history = [this.snapshotValue];
  }

  private clampX(raw: number): number {
    const limit = i07WallLimit(this.params);
    const upper = limit === null ? 1e6 : Math.min(1e6, limit);
    return Math.max(-1e6, Math.min(upper, raw));
  }

  reset(timeS: number, xM = this.params.startXM): I07Snapshot {
    const t = Math.max(0, finiteOr(timeS, 0));
    const x = this.clampX(finiteOr(xM, this.params.startXM));
    this.lastT = t;
    this.lastX = x;
    this.samples = [{ tS: t, xM: x }];
    this.heat = 0;
    this.lastPower = 0;
    this.dragging = false;
    this.truncated = false;
    this.snapshotValue = manualSnapshot(this.params, t, x, 0, 0);
    this.history = [this.snapshotValue];
    return this.snapshotValue;
  }

  beginDrag(timeS: number, xM: number): I07Snapshot {
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    const x = this.clampX(finiteOr(xM, this.lastX));
    this.dragging = true;
    this.samples = [{ tS: t, xM: x }];
    this.lastT = t;
    this.lastX = x;
    this.lastPower = 0;
    this.snapshotValue = manualSnapshot(this.params, t, x, 0, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  record(timeS: number, xM: number): I07Snapshot {
    const t = finiteOr(timeS, this.lastT);
    const rawX = finiteOr(xM, this.lastX);
    const x = this.clampX(rawX);
    if (t <= this.lastT + 1e-9) {
      this.lastX = x;
      if (this.samples.length > 0) this.samples[this.samples.length - 1] = { tS: this.lastT, xM: x };
      const velocity = estimateManualVelocity(this.samples, this.lastT, this.settings);
      this.snapshotValue = manualSnapshot(this.params, this.lastT, x, velocity, this.heat);
      return this.snapshotValue;
    }
    const dt = t - this.lastT;
    if (dt > this.settings.maxDtS) {
      this.samples = [{ tS: t, xM: x }];
      this.lastPower = 0;
    } else {
      this.samples.push({ tS: t, xM: x });
      const cutoff = t - this.settings.velocityWindowS * 3;
      while (this.samples.length > 2 && this.samples[0].tS < cutoff) this.samples.shift();
    }
    const velocity = estimateManualVelocity(this.samples, t, this.settings);
    const next = manualSnapshot(this.params, t, x, velocity, this.heat);
    if (dt > 0 && dt <= this.settings.maxDtS && next.joulePowerW !== null) {
      this.heat += 0.5 * (this.lastPower + next.joulePowerW) * dt;
      if (!Number.isFinite(this.heat) || this.heat < 0) this.heat = Math.max(0, this.heat);
    }
    this.lastPower = next.joulePowerW ?? 0;
    this.lastT = t;
    this.lastX = x;
    this.snapshotValue = manualSnapshot(this.params, t, x, velocity, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  endDrag(timeS: number): I07Snapshot {
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    this.dragging = false;
    this.samples = [];
    this.lastPower = 0;
    this.lastT = t;
    this.snapshotValue = manualSnapshot(this.params, t, this.lastX, 0, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  cancel(timeS: number): I07Snapshot {
    return this.endDrag(timeS);
  }

  idle(timeS: number): I07Snapshot {
    if (this.dragging) return this.snapshotValue;
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    if (t - this.lastT < 1e-6) return this.snapshotValue;
    const next = manualSnapshot(this.params, t, this.lastX, 0, this.heat);
    const dt = t - this.lastT;
    if (dt <= this.settings.maxDtS && next.joulePowerW !== null) {
      this.heat += 0.5 * (this.lastPower + next.joulePowerW) * dt;
      if (!Number.isFinite(this.heat) || this.heat < 0) this.heat = Math.max(0, this.heat);
    }
    this.lastPower = next.joulePowerW ?? 0;
    this.lastT = t;
    this.snapshotValue = manualSnapshot(this.params, t, this.lastX, 0, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  getSnapshot(): I07Snapshot {
    return this.snapshotValue;
  }

  getHistory(): readonly I07Snapshot[] {
    return this.history;
  }

  getHistoryTruncated(): boolean {
    return this.truncated;
  }

  isDragging(): boolean {
    return this.dragging;
  }

  getLastTime(): number {
    return this.lastT;
  }

  getLastX(): number {
    return this.lastX;
  }

  private pushHistory(snapshot: I07Snapshot): void {
    this.history.push(snapshot);
    while (
      this.history.length > 2 &&
      (this.history.length > this.settings.maxPoints ||
        snapshot.timeS - this.history[0].timeS > this.settings.maxHistoryS)
    ) {
      this.history.shift();
      this.truncated = true;
    }
  }
}
