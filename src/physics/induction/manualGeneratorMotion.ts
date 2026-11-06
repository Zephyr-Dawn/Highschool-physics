import { ManualScalarSession, DEFAULT_SCALAR_MOTION_SETTINGS } from './manualFluxMotion';
import {
  computeGeneratorSnapshot,
  totalResistance,
  type GeneratorEnergy,
  type GeneratorParams,
  type GeneratorSnapshot,
} from './acGenerator';

const APPROXIMATION =
  '手动角速度由单调 pointer 时间戳样本估计；有效值与能量为估计值，不是传感器实测或解析整周期值。';

export class ManualGeneratorSession {
  private params: GeneratorParams;
  private readonly scalar: ManualScalarSession;
  private snapshotValue: GeneratorSnapshot;
  private history: GeneratorSnapshot[] = [];
  private energy: GeneratorEnergy = { driveJ: 0, loadJ: 0, internalJ: 0, residualJ: null, estimated: true };
  private readonly maxPoints = 800;
  private readonly maxHistoryS = 20;
  private truncated = false;

  constructor(params: GeneratorParams) {
    this.params = { ...params };
    this.scalar = new ManualScalarSession({
      ...DEFAULT_SCALAR_MOTION_SETTINGS,
      windowSeconds: 0.3,
      maxDtSeconds: 0.25,
    });
    this.snapshotValue = this.makeSnapshot(0, params.theta0Rad, 0, this.energy);
    this.history = [this.snapshotValue];
  }

  private makeSnapshot(timeS: number, thetaRad: number, omegaRadPerS: number, energy: GeneratorEnergy): GeneratorSnapshot {
    return computeGeneratorSnapshot(
      { ...this.params },
      timeS,
      thetaRad,
      omegaRadPerS,
      energy,
      { rmsMode: 'none', approximation: APPROXIMATION },
    );
  }

  private integrate(
    before: GeneratorSnapshot,
    after: { pDriveW: number; pLoadW: number; pInternalW: number },
    dt: number,
  ): GeneratorEnergy {
    if (!(dt > 0) || dt > 0.25 || !Number.isFinite(dt)) return this.energy;
    const drive = this.energy.driveJ + 0.5 * (before.pDriveW + after.pDriveW) * dt;
    const load = this.energy.loadJ + 0.5 * (before.pLoadW + after.pLoadW) * dt;
    const internal = this.energy.internalJ + 0.5 * (before.pInternalW + after.pInternalW) * dt;
    return {
      driveJ: Math.max(0, drive),
      loadJ: Math.max(0, load),
      internalJ: Math.max(0, internal),
      residualJ: drive - load - internal,
      estimated: true,
    };
  }

  private pushHistory(snapshot: GeneratorSnapshot): void {
    this.history.push(snapshot);
    while (
      this.history.length > 2 &&
      (this.history.length > this.maxPoints ||
        snapshot.timeS - this.history[0].timeS > this.maxHistoryS)
    ) {
      this.history.shift();
      this.truncated = true;
    }
  }

  reset(timeS: number, thetaRad = this.params.theta0Rad): GeneratorSnapshot {
    const t = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
    const theta = Number.isFinite(thetaRad) ? thetaRad : this.params.theta0Rad;
    this.scalar.reset(t, theta);
    this.energy = { driveJ: 0, loadJ: 0, internalJ: 0, residualJ: null, estimated: true };
    this.snapshotValue = this.makeSnapshot(t, theta, 0, this.energy);
    this.history = [this.snapshotValue];
    return this.snapshotValue;
  }

  begin(timeS: number, thetaRad: number): GeneratorSnapshot {
    const t = Math.max(this.snapshotValue.timeS, Number.isFinite(timeS) ? timeS : this.snapshotValue.timeS);
    this.scalar.begin(t, thetaRad);
    this.snapshotValue = this.makeSnapshot(t, thetaRad, 0, this.energy);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  record(timeS: number, rawAngleRad: number): GeneratorSnapshot {
    const before = this.snapshotValue;
    const t = Number.isFinite(timeS) ? timeS : before.timeS;
    const dt = t - before.timeS;
    const result = this.scalar.record(t, rawAngleRad, true);
    const provisional = this.makeSnapshot(t, result.value, result.rate, this.energy);
    const energy = this.integrate(before, provisional, dt);
    this.energy = energy;
    const snapshot = this.makeSnapshot(t, result.value, result.rate, energy);
    this.snapshotValue = snapshot;
    this.pushHistory(snapshot);
    return snapshot;
  }

  end(timeS: number): GeneratorSnapshot {
    const before = this.snapshotValue;
    const t = Math.max(before.timeS, Number.isFinite(timeS) ? timeS : before.timeS);
    const dt = t - before.timeS;
    const result = this.scalar.end(t);
    const provisional = this.makeSnapshot(t, result.value, 0, this.energy);
    this.energy = this.integrate(before, provisional, dt);
    this.snapshotValue = this.makeSnapshot(t, result.value, 0, this.energy);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  cancel(timeS: number): GeneratorSnapshot {
    return this.end(timeS);
  }

  idle(timeS: number): GeneratorSnapshot {
    const before = this.snapshotValue;
    const t = Math.max(before.timeS, Number.isFinite(timeS) ? timeS : before.timeS);
    if (t - before.timeS < 1e-6) return before;
    const result = this.scalar.idle(t);
    const provisional = this.makeSnapshot(t, result.value, 0, this.energy);
    this.energy = this.integrate(before, provisional, t - before.timeS);
    this.snapshotValue = this.makeSnapshot(t, result.value, 0, this.energy);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  setCircuitClosed(timeS: number, closed: boolean): GeneratorSnapshot {
    const t = Math.max(this.snapshotValue.timeS, Number.isFinite(timeS) ? timeS : this.snapshotValue.timeS);
    this.params = { ...this.params, circuitClosed: closed };
    const theta = this.scalar.getValue();
    const rate = this.scalar.isActive() ? this.scalar.getRate() : 0;
    this.snapshotValue = this.makeSnapshot(t, theta, rate, this.energy);
    this.pushHistory(this.snapshotValue);
    return this.snapshotValue;
  }

  updateParams(params: GeneratorParams): void {
    this.params = { ...params };
  }

  getSnapshot(): GeneratorSnapshot {
    return this.snapshotValue;
  }

  getHistory(): readonly GeneratorSnapshot[] {
    return this.history;
  }

  getHistoryTruncated(): boolean {
    return this.truncated;
  }

  getLastTheta(): number {
    return this.scalar.getValue();
  }

  getLastTime(): number {
    return this.snapshotValue.timeS;
  }

  isActive(): boolean {
    return this.scalar.isActive();
  }

  getResistanceTotal(): number {
    return totalResistance(this.params);
  }
}
