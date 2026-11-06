import {
  rodElectromagneticOutputs,
  type RodMedium,
  type RodSnapshot,
} from './movingRod';

export interface ManualRodSample {
  tS: number;
  xM: number;
}

export interface ManualRodSettings {
  velocityWindowS: number;
  maxDtS: number;
  maxHistoryS: number;
  maxPoints: number;
  maxSpeedMps: number;
}

export const MANUAL_ROD_SETTINGS: ManualRodSettings = {
  velocityWindowS: 0.12,
  maxDtS: 0.25,
  maxHistoryS: 20,
  maxPoints: 800,
  maxSpeedMps: 20,
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function estimateManualVelocity(
  samples: ManualRodSample[],
  nowS: number,
  settings: Pick<ManualRodSettings, 'velocityWindowS' | 'maxSpeedMps'> = MANUAL_ROD_SETTINGS,
): number {
  const window = Math.max(1e-6, settings.velocityWindowS);
  const recent = samples
    .filter((sample) => Number.isFinite(sample.tS) && sample.tS <= nowS + 1e-9 && sample.tS >= nowS - window)
    .sort((left, right) => left.tS - right.tS);

  const unique: ManualRodSample[] = [];
  for (const sample of recent) {
    if (!Number.isFinite(sample.xM)) continue;
    const previous = unique[unique.length - 1];
    if (previous && Math.abs(previous.tS - sample.tS) < 1e-9) {
      unique[unique.length - 1] = sample;
    } else {
      unique.push(sample);
    }
  }
  if (unique.length < 2) return 0;
  const span = unique[unique.length - 1].tS - unique[0].tS;
  if (span < 0.01) return 0;

  const meanT = unique.reduce((sum, sample) => sum + sample.tS, 0) / unique.length;
  const meanX = unique.reduce((sum, sample) => sum + sample.xM, 0) / unique.length;
  let numerator = 0;
  let denominator = 0;
  for (const sample of unique) {
    const dt = sample.tS - meanT;
    numerator += dt * (sample.xM - meanX);
    denominator += dt * dt;
  }
  if (denominator < 1e-12) return 0;
  const slope = numerator / denominator;
  if (!Number.isFinite(slope)) return 0;
  return Math.max(-settings.maxSpeedMps, Math.min(settings.maxSpeedMps, slope));
}

function manualSnapshot(
  medium: RodMedium,
  xM: number,
  velocityMps: number,
  jouleHeatJ: number,
  timeS: number,
): RodSnapshot {
  const outputs = rodElectromagneticOutputs(medium, xM, velocityMps);
  return {
    ...outputs,
    tS: timeS,
    xM,
    velocityMps,
    status: Math.abs(velocityMps) < 1e-6 ? 'rest' : 'moving',
    estimated: true,
    jouleHeatJ: Number.isFinite(jouleHeatJ) ? Math.max(0, jouleHeatJ) : 0,
    externalWorkJ: null,
    externalPowerW: null,
    energyResidualJ: null,
    externalForceN: null,
    circuitClosed: medium.circuitClosed,
    alphaPerS: outputs.k / medium.massKg,
    terminalVelocityMps: null,
    boundaryTimeS: null,
  };
}

export class ManualRodSession {
  private readonly medium: RodMedium;
  private readonly settings: ManualRodSettings;
  private samples: ManualRodSample[] = [];
  private history: RodSnapshot[] = [];
  private snapshot: RodSnapshot;
  private lastT = 0;
  private lastX = 0;
  private lastPower = 0;
  private heat = 0;
  private dragging = false;
  private truncated = false;

  constructor(medium: RodMedium, settings: ManualRodSettings = MANUAL_ROD_SETTINGS) {
    this.medium = medium;
    this.settings = settings;
    this.snapshot = manualSnapshot(medium, 0, 0, 0, 0);
  }

  reset(timeS: number, xM: number): RodSnapshot {
    const t = Math.max(0, finiteOr(timeS, 0));
    const x = Math.max(0, finiteOr(xM, 0));
    this.samples = [{ tS: t, xM: x }];
    this.heat = 0;
    this.lastPower = 0;
    this.lastT = t;
    this.lastX = x;
    this.dragging = false;
    this.truncated = false;
    this.snapshot = manualSnapshot(this.medium, x, 0, 0, t);
    this.history = [this.snapshot];
    return this.snapshot;
  }

  beginDrag(timeS: number, xM: number): RodSnapshot {
    if (this.history.length === 0) this.reset(timeS, xM);
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    const x = Math.max(0, finiteOr(xM, this.lastX));
    this.dragging = true;
    this.samples = [{ tS: t, xM: x }];
    this.lastT = t;
    this.lastX = x;
    this.lastPower = 0;
    this.snapshot = manualSnapshot(this.medium, x, 0, this.heat, t);
    this.pushHistory(this.snapshot);
    return this.snapshot;
  }

  record(timeS: number, xM: number): RodSnapshot {
    if (this.history.length === 0) this.reset(timeS, xM);
    const t = finiteOr(timeS, this.lastT);
    const x = Math.max(0, finiteOr(xM, this.lastX));

    if (t <= this.lastT + 1e-9) {
      this.lastX = x;
      if (this.samples.length > 0) this.samples[this.samples.length - 1] = { tS: this.lastT, xM: x };
      const velocity = estimateManualVelocity(this.samples, this.lastT, this.settings);
      this.snapshot = manualSnapshot(this.medium, x, velocity, this.heat, this.lastT);
      return this.snapshot;
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
    const outputs = rodElectromagneticOutputs(this.medium, x, velocity);
    if (dt > 0 && dt <= this.settings.maxDtS) {
      this.heat += 0.5 * (this.lastPower + outputs.joulePowerW) * dt;
      if (!Number.isFinite(this.heat) || this.heat < 0) this.heat = this.heat < 0 ? 0 : this.heat;
    }
    this.lastPower = outputs.joulePowerW;
    this.lastT = t;
    this.lastX = x;
    this.snapshot = manualSnapshot(this.medium, x, velocity, this.heat, t);
    this.pushHistory(this.snapshot);
    return this.snapshot;
  }

  endDrag(timeS: number): RodSnapshot {
    if (!this.dragging) return this.snapshot;
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    this.dragging = false;
    this.samples = [];
    this.lastPower = 0;
    this.lastT = t;
    this.snapshot = manualSnapshot(this.medium, this.lastX, 0, this.heat, t);
    this.pushHistory(this.snapshot);
    return this.snapshot;
  }

  cancel(timeS: number): RodSnapshot {
    if (this.dragging) return this.endDrag(timeS);
    if (this.history.length === 0) return this.reset(timeS, this.lastX);
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    this.samples = [];
    this.lastPower = 0;
    this.lastT = t;
    this.snapshot = manualSnapshot(this.medium, this.lastX, 0, this.heat, t);
    this.pushHistory(this.snapshot);
    return this.snapshot;
  }

  idle(timeS: number): RodSnapshot {
    if (this.dragging) return this.snapshot;
    if (this.history.length === 0) return this.reset(timeS, this.lastX);
    const t = Math.max(this.lastT, finiteOr(timeS, this.lastT));
    if (t - this.lastT < 0.04) return this.snapshot;
    this.samples = [];
    this.lastPower = 0;
    this.lastT = t;
    this.snapshot = manualSnapshot(this.medium, this.lastX, 0, this.heat, t);
    this.pushHistory(this.snapshot);
    return this.snapshot;
  }

  getSnapshot(): RodSnapshot {
    return this.snapshot;
  }

  getHistory(): readonly RodSnapshot[] {
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

  private pushHistory(snapshot: RodSnapshot): void {
    this.history.push(snapshot);
    while (
      this.history.length > 2 &&
      (this.history.length > this.settings.maxPoints ||
        snapshot.tS - this.history[0].tS > this.settings.maxHistoryS)
    ) {
      this.history.shift();
      this.truncated = true;
    }
  }
}
