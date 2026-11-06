import { estimateManualVelocity } from './manualRodMotion';
import {
  computeI05Snapshot,
  i05FieldAt,
  type I05FieldSource,
  type I05Params,
  type I05Snapshot,
} from './movingLoopTimeField';

export interface ManualLoopSettings {
  velocityWindowS: number;
  maxDtS: number;
  maxHistoryS: number;
  maxPoints: number;
  maxSpeedMps: number;
}

export const MANUAL_LOOP_SETTINGS: ManualLoopSettings = {
  velocityWindowS: 0.12,
  maxDtS: 0.25,
  maxHistoryS: 20,
  maxPoints: 800,
  maxSpeedMps: 20,
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function manualSnapshot(
  params: I05Params,
  source: I05FieldSource,
  timeS: number,
  xM: number,
  velocityMps: number,
  heat: number,
): I05Snapshot {
  return computeI05Snapshot(
    params,
    timeS,
    xM,
    velocityMps,
    i05FieldAt(source, timeS),
    { jouleHeatJ: heat, externalWorkJ: 0, transformerSourceWorkJ: 0 },
    { derivativeSide: 'point', approximation: '手动手势速度由单调时间戳样本估计；不提供精确手部作用力或能量残差。' },
  );
}

/**
 * M4: the loop position is externally imposed by a finger; B(t) still follows
 * the chosen analytic/manual source. The hand force is not inferred, so this
 * session never reports an exact W_ext or energy residual.
 */
export class ManualLoopSession {
  private readonly params: I05Params;
  private readonly source: I05FieldSource;
  private readonly settings: ManualLoopSettings;
  private samples: Array<{ tS: number; xM: number }> = [];
  private history: I05Snapshot[] = [];
  private snapshotValue: I05Snapshot;
  private lastT = 0;
  private lastX: number;
  private lastPower = 0;
  private heat = 0;
  private dragging = false;
  private truncated = false;

  constructor(
    params: I05Params,
    source: I05FieldSource,
    settings: ManualLoopSettings = MANUAL_LOOP_SETTINGS,
  ) {
    this.params = { ...params, mode: 'manual-x' };
    this.source = source;
    this.settings = settings;
    this.lastX = params.startXM;
    this.snapshotValue = manualSnapshot(this.params, source, 0, params.startXM, 0, 0);
    this.history = [this.snapshotValue];
  }

  reset(timeS: number, xM = this.params.startXM): I05Snapshot {
    const t = Math.max(0, finiteOr(timeS, 0));
    const x = Math.max(-1e6, Math.min(1e6, finiteOr(xM, this.params.startXM)));
    this.lastT = t;
    this.lastX = x;
    this.samples = [{ tS: t, xM: x }];
    this.heat = 0;
    this.lastPower = 0;
    this.dragging = false;
    this.truncated = false;
    this.snapshotValue = manualSnapshot(this.params, this.source, t, x, 0, 0);
    this.history = [this.snapshotValue];
    return this.snapshotValue;
  }

  beginDrag(timeS: number, xM: number): I05Snapshot {
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    const x = Math.max(-1e6, Math.min(1e6, finiteOr(xM, this.lastX)));
    this.dragging = true;
    this.samples = [{ tS: t, xM: x }];
    this.lastT = t;
    this.lastX = x;
    this.lastPower = 0;
    this.snapshotValue = manualSnapshot(this.params, this.source, t, x, 0, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  record(timeS: number, xM: number): I05Snapshot {
    const t = finiteOr(timeS, this.lastT);
    const rawX = finiteOr(xM, this.lastX);
    const x = Math.max(-1e6, Math.min(1e6, rawX));
    if (t <= this.lastT + 1e-9) {
      this.lastX = x;
      if (this.samples.length > 0) this.samples[this.samples.length - 1] = { tS: this.lastT, xM: x };
      const velocity = estimateManualVelocity(this.samples, this.lastT, this.settings);
      this.snapshotValue = manualSnapshot(this.params, this.source, this.lastT, x, velocity, this.heat);
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
    const next = manualSnapshot(this.params, this.source, t, x, velocity, this.heat);
    if (dt > 0 && dt <= this.settings.maxDtS && next.joulePowerW !== null) {
      this.heat += 0.5 * (this.lastPower + next.joulePowerW) * dt;
      if (!Number.isFinite(this.heat) || this.heat < 0) this.heat = Math.max(0, this.heat);
    }
    this.lastPower = next.joulePowerW ?? 0;
    this.lastT = t;
    this.lastX = x;
    this.snapshotValue = manualSnapshot(this.params, this.source, t, x, velocity, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  endDrag(timeS: number): I05Snapshot {
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    this.dragging = false;
    this.samples = [];
    this.lastPower = 0;
    this.lastT = t;
    this.snapshotValue = manualSnapshot(this.params, this.source, t, this.lastX, 0, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  cancel(timeS: number): I05Snapshot {
    return this.endDrag(timeS);
  }

  idle(timeS: number): I05Snapshot {
    if (this.dragging) return this.snapshotValue;
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    if (t - this.lastT < 1e-6) return this.snapshotValue;
    const next = manualSnapshot(this.params, this.source, t, this.lastX, 0, this.heat);
    const dt = t - this.lastT;
    if (dt <= this.settings.maxDtS && next.joulePowerW !== null) {
      this.heat += 0.5 * (this.lastPower + next.joulePowerW) * dt;
      if (!Number.isFinite(this.heat) || this.heat < 0) this.heat = Math.max(0, this.heat);
    }
    this.lastPower = next.joulePowerW ?? 0;
    this.lastT = t;
    this.snapshotValue = manualSnapshot(this.params, this.source, t, this.lastX, 0, this.heat);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  getSnapshot(): I05Snapshot {
    return this.snapshotValue;
  }

  getHistory(): readonly I05Snapshot[] {
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

  private pushHistory(snapshot: I05Snapshot): void {
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
