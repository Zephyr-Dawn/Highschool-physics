import {
  DEFAULT_SCALAR_RATE_SETTINGS,
  estimateScalarRate,
  unwrapAngle,
  type ScalarRateSettings,
  type ScalarSample,
} from './fluxLenz';

export interface ScalarMotionSettings extends ScalarRateSettings {
  maxDtSeconds: number;
}

export const DEFAULT_SCALAR_MOTION_SETTINGS: ScalarMotionSettings = {
  ...DEFAULT_SCALAR_RATE_SETTINGS,
  maxDtSeconds: 0.25,
};

export class ManualScalarSession {
  private readonly settings: ScalarMotionSettings;
  private samples: ScalarSample[] = [];
  private lastT = 0;
  private value = 0;
  private rate = 0;
  private active = false;

  constructor(settings: ScalarMotionSettings = DEFAULT_SCALAR_MOTION_SETTINGS) {
    this.settings = settings;
  }

  reset(timeS: number, value: number): void {
    const t = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
    const v = Number.isFinite(value) ? value : 0;
    this.lastT = t;
    this.value = v;
    this.rate = 0;
    this.active = false;
    this.samples = [{ tS: t, value: v }];
  }

  begin(timeS: number, value: number): void {
    const t = Math.max(this.lastT, Number.isFinite(timeS) ? timeS : this.lastT);
    const v = Number.isFinite(value) ? value : this.value;
    this.active = true;
    this.lastT = t;
    this.value = v;
    this.rate = 0;
    this.samples = [{ tS: t, value: v }];
  }

  record(timeS: number, rawValue: number, angle = false): { value: number; rate: number } {
    const t = Number.isFinite(timeS) ? timeS : this.lastT;
    const safeRaw = Number.isFinite(rawValue) ? rawValue : this.value;
    const nextValue = angle ? unwrapAngle(this.value, safeRaw) : safeRaw;
    if (t <= this.lastT + 1e-9) {
      this.value = nextValue;
      if (this.samples.length > 0) this.samples[this.samples.length - 1] = { tS: this.lastT, value: nextValue };
      return { value: this.value, rate: this.rate };
    }
    const dt = t - this.lastT;
    if (dt > this.settings.maxDtSeconds) {
      this.samples = [{ tS: t, value: nextValue }];
      this.rate = 0;
    } else {
      this.samples.push({ tS: t, value: nextValue });
      const cutoff = t - this.settings.windowSeconds * 3;
      while (this.samples.length > 2 && this.samples[0].tS < cutoff) this.samples.shift();
      this.rate = estimateScalarRate(this.samples, t, this.settings);
    }
    this.lastT = t;
    this.value = nextValue;
    return { value: this.value, rate: this.rate };
  }

  idle(timeS: number): { value: number; rate: number } {
    if (!this.active) return { value: this.value, rate: 0 };
    return this.record(timeS, this.value, false);
  }

  end(timeS: number): { value: number; rate: number } {
    const t = Math.max(this.lastT, Number.isFinite(timeS) ? timeS : this.lastT);
    this.lastT = t;
    this.rate = 0;
    this.active = false;
    this.samples = [];
    return { value: this.value, rate: 0 };
  }

  cancel(timeS: number): { value: number; rate: number } {
    return this.end(timeS);
  }

  getValue(): number {
    return this.value;
  }

  getRate(): number {
    return this.rate;
  }

  getLastTime(): number {
    return this.lastT;
  }

  isActive(): boolean {
    return this.active;
  }
}
