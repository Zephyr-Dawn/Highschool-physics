import { estimateManualVelocity } from './manualRodMotion';
import {
  dualRodElectromagneticSnapshot,
  type DualRodParams,
  type DualRodSnapshot,
} from './dualRodCoupling';

export interface DualRodManualSettings {
  velocityWindowS: number;
  maxDtS: number;
  maxHistoryS: number;
  maxPoints: number;
  maxSpeedMps: number;
  minSeparationM: number;
}

export const DUAL_ROD_MANUAL_SETTINGS: DualRodManualSettings = {
  velocityWindowS: 0.12,
  maxDtS: 0.25,
  maxHistoryS: 20,
  maxPoints: 800,
  maxSpeedMps: 20,
  minSeparationM: 0.02,
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function manualSnapshot(
  params: DualRodParams,
  x1M: number,
  x2M: number,
  v1Mps: number,
  v2Mps: number,
  jouleHeatJ: number,
  timeS: number,
  contactLimited: boolean,
): DualRodSnapshot {
  const snapshot = dualRodElectromagneticSnapshot(params, {
    timeS,
    x1M,
    x2M,
    v1Mps,
    v2Mps,
    a1Mps2: null,
    a2Mps2: null,
    jouleHeatJ,
    externalWorkJ: 0,
  });
  return {
    ...snapshot,
    status: contactLimited ? 'contact-stop' : snapshot.status,
    eventFlags: contactLimited ? [...snapshot.eventFlags, 'contact-limit'] : snapshot.eventFlags,
    approximation: '手动手势速度由单调时间戳样本估计；不提供精确手部作用力、外功或能量残差。',
  };
}

/**
 * D4: one rod is hand-driven, the other is explicitly clamped by an external
 * holder. The clamped rod is not modelled as freely moving.
 */
export class ManualDualRodSession {
  private readonly params: DualRodParams;
  private readonly settings: DualRodManualSettings;
  private samples: Array<{ tS: number; xM: number }> = [];
  private history: DualRodSnapshot[] = [];
  private snapshotValue: DualRodSnapshot;
  private lastT = 0;
  private lastX1: number;
  private lastX2: number;
  private lastPower = 0;
  private heat = 0;
  private dragging = false;
  private contactLimited = false;
  private truncated = false;

  constructor(params: DualRodParams, settings: DualRodManualSettings = DUAL_ROD_MANUAL_SETTINGS) {
    this.params = { ...params };
    this.settings = settings;
    this.lastX1 = params.x1M;
    this.lastX2 = params.x2M;
    this.snapshotValue = manualSnapshot(params, params.x1M, params.x2M, 0, 0, 0, 0, false);
    this.history = [this.snapshotValue];
  }

  reset(timeS: number, x1M = this.params.x1M, x2M = this.params.x2M): DualRodSnapshot {
    const t = Math.max(0, finiteOr(timeS, 0));
    const x1 = Math.max(-1e6, Math.min(1e6, finiteOr(x1M, this.params.x1M)));
    const x2 = Math.max(x1 + this.settings.minSeparationM, finiteOr(x2M, this.params.x2M));
    this.lastT = t;
    this.lastX1 = x1;
    this.lastX2 = x2;
    this.samples = [{ tS: t, xM: this.draggingX(x1, x2) }];
    this.heat = 0;
    this.lastPower = 0;
    this.dragging = false;
    this.contactLimited = false;
    this.truncated = false;
    this.snapshotValue = manualSnapshot(this.params, x1, x2, 0, 0, 0, t, false);
    this.history = [this.snapshotValue];
    return this.snapshotValue;
  }

  beginDrag(timeS: number, xM: number): DualRodSnapshot {
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    const x = this.clampDragged(finiteOr(xM, this.draggingX(this.lastX1, this.lastX2)));
    const [x1, x2] = this.applyDraggedX(x);
    this.dragging = true;
    this.samples = [{ tS: t, xM: x }];
    this.lastT = t;
    this.lastX1 = x1;
    this.lastX2 = x2;
    this.lastPower = 0;
    this.snapshotValue = manualSnapshot(this.params, x1, x2, 0, 0, this.heat, t, this.contactLimited);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  record(timeS: number, xM: number): DualRodSnapshot {
    const t = finiteOr(timeS, this.lastT);
    const rawX = finiteOr(xM, this.draggingX(this.lastX1, this.lastX2));
    const x = this.clampDragged(rawX);
    if (rawX !== x) this.contactLimited = true;
    const [x1, x2] = this.applyDraggedX(x);
    if (t <= this.lastT + 1e-9) {
      this.lastX1 = x1;
      this.lastX2 = x2;
      if (this.samples.length > 0) this.samples[this.samples.length - 1] = { tS: this.lastT, xM: x };
      const velocity = estimateManualVelocity(this.samples, this.lastT, this.settings);
      this.snapshotValue = manualSnapshot(
        this.params,
        x1,
        x2,
        this.draggedRodIndex() === 1 ? velocity : 0,
        this.draggedRodIndex() === 2 ? velocity : 0,
        this.heat,
        this.lastT,
        this.contactLimited,
      );
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
    const v1 = this.draggedRodIndex() === 1 ? velocity : 0;
    const v2 = this.draggedRodIndex() === 2 ? velocity : 0;
    const outputs = dualRodElectromagneticSnapshot(this.params, {
      timeS: t,
      x1M: x1,
      x2M: x2,
      v1Mps: v1,
      v2Mps: v2,
      a1Mps2: null,
      a2Mps2: null,
      jouleHeatJ: this.heat,
      externalWorkJ: 0,
    });
    if (dt > 0 && dt <= this.settings.maxDtS) {
      this.heat += 0.5 * (this.lastPower + outputs.joulePowerW) * dt;
      if (!Number.isFinite(this.heat) || this.heat < 0) this.heat = Math.max(0, this.heat);
    }
    this.lastPower = outputs.joulePowerW;
    this.lastT = t;
    this.lastX1 = x1;
    this.lastX2 = x2;
    this.snapshotValue = manualSnapshot(this.params, x1, x2, v1, v2, this.heat, t, this.contactLimited);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  endDrag(timeS: number): DualRodSnapshot {
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    this.dragging = false;
    this.samples = [];
    this.lastPower = 0;
    this.lastT = t;
    this.snapshotValue = manualSnapshot(
      this.params,
      this.lastX1,
      this.lastX2,
      0,
      0,
      this.heat,
      t,
      this.contactLimited,
    );
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  cancel(timeS: number): DualRodSnapshot {
    return this.endDrag(timeS);
  }

  idle(timeS: number): DualRodSnapshot {
    if (this.dragging) return this.snapshotValue;
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    if (t - this.lastT < 0.04) return this.snapshotValue;
    this.samples = [];
    this.lastPower = 0;
    this.lastT = t;
    this.snapshotValue = manualSnapshot(
      this.params,
      this.lastX1,
      this.lastX2,
      0,
      0,
      this.heat,
      t,
      this.contactLimited,
    );
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  getSnapshot(): DualRodSnapshot {
    return this.snapshotValue;
  }

  getHistory(): readonly DualRodSnapshot[] {
    return this.history;
  }

  isDragging(): boolean {
    return this.dragging;
  }

  getContactLimited(): boolean {
    return this.contactLimited;
  }

  getHistoryTruncated(): boolean {
    return this.truncated;
  }

  getLastTime(): number {
    return this.lastT;
  }

  getLastX(): number {
    return this.draggingX(this.lastX1, this.lastX2);
  }

  getPositions(): { x1: number; x2: number } {
    return { x1: this.lastX1, x2: this.lastX2 };
  }

  private draggedRodIndex(): 1 | 2 {
    return this.params.mode === 'manual-rod2' ? 2 : 1;
  }

  private draggingX(x1: number, x2: number): number {
    return this.draggedRodIndex() === 1 ? x1 : x2;
  }

  private applyDraggedX(x: number): [number, number] {
    return this.draggedRodIndex() === 1 ? [x, this.lastX2] : [this.lastX1, x];
  }

  private clampDragged(x: number): number {
    if (this.draggedRodIndex() === 1) {
      return Math.min(x, this.lastX2 - this.settings.minSeparationM);
    }
    return Math.max(x, this.lastX1 + this.settings.minSeparationM);
  }

  private pushHistory(snapshot: DualRodSnapshot): void {
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
