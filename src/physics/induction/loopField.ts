import { clamp } from '../core/vec2';

/**
 * Geometry convention:
 * - Physical x points right, y points up, z points out of the page.
 * - The magnetic field occupies an infinite vertical strip [fieldLeft, fieldRight].
 * - The rectangular loop is a rigid conductor in the xy plane and moves along x.
 * - Positive induced current is counter-clockwise as seen from +z (out of page);
 *   the loop normal is +z, so Φ = Bz · overlapArea.
 */
export interface LoopFieldParams {
  loopWidthM: number;
  loopHeightM: number;
  startXM: number;
  initialSpeedMps: number;
  BzTesla: number;
  fieldLeftM: number;
  fieldRightM: number;
  resistanceOhm: number;
  massKg: number;
  mode: 'uniform' | 'free';
}

export type LoopPhase = 'before' | 'entering' | 'inside' | 'spanning' | 'leaving' | 'after';

export interface LoopSnapshot {
  xM: number;
  velocityMps: number;
  overlapWidthM: number;
  overlapAreaM2: number;
  /** Signed flux using the +z loop normal. */
  fluxWb: number;
  /** Signed dΦ/dt. */
  fluxRateWbPerS: number;
  emfV: number;
  currentA: number;
  /** Net magnetic force along x from the true force on every conductor side. */
  forceXN: number;
  /** True when the corresponding vertical side lies inside the field strip. */
  leftSideInside: boolean;
  rightSideInside: boolean;
  dOverlapDx: number;
  phase: LoopPhase;
}

export interface LoopSample extends LoopSnapshot {
  tS: number;
}

export interface LoopEvent {
  tS: number;
  phase: LoopPhase;
  label: string;
  xM: number;
  velocityMps: number;
  fluxWb: number;
  emfV: number;
  currentA: number;
  forceXN: number;
}

export interface LoopSimulation {
  params: LoopFieldParams;
  samples: LoopSample[];
  durationS: number;
  events: LoopEvent[];
  keyTimesS: number[];
  final: LoopSample;
  initial: LoopSample;
  /** Heat from I²R integrated over the simulated motion. */
  jouleHeatJ: number;
  mechanicalEnergyLossJ: number;
  stoppedInsideField: boolean;
  issue: string | null;
}

export const LOOP_PHASE_LABEL: Record<LoopPhase, string> = {
  before: '未进入磁场',
  entering: '进入磁场中',
  inside: '完全在磁场中',
  spanning: '线框跨越整个磁场（Φ 不变）',
  leaving: '离开磁场中',
  after: '已完全离开磁场',
};

const PHASE_CHANGE_LABEL: Partial<Record<`${LoopPhase}>${LoopPhase}`, string>> = {
  'before>entering': '右边缘到达磁场左边界：开始进入',
  'before>spanning': '开始覆盖磁场两端',
  'before>inside': '线框整体进入磁场',
  'entering>inside': '左边缘进入：线框完全在磁场中',
  'entering>spanning': '右边缘越过磁场右边界：开始完全罩住磁场',
  'entering>leaving': '线框开始离开磁场',
  'inside>leaving': '右边缘越过磁场右边界：开始离开',
  'spanning>leaving': '左边缘越过磁场左边界：开始离开',
  'leaving>after': '左边缘越过磁场右边界：完全离开磁场',
  'spanning>after': '左边缘越过磁场右边界：完全离开磁场',
};

const TOL = 1e-10;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeLoopParams(input: LoopFieldParams): { params: LoopFieldParams; issue: string | null } {
  let issue: string | null = null;
  if (
    !Number.isFinite(input.loopWidthM) ||
    !Number.isFinite(input.loopHeightM) ||
    !Number.isFinite(input.startXM) ||
    !Number.isFinite(input.initialSpeedMps) ||
    !Number.isFinite(input.BzTesla) ||
    !Number.isFinite(input.fieldLeftM) ||
    !Number.isFinite(input.fieldRightM) ||
    !Number.isFinite(input.resistanceOhm) ||
    !Number.isFinite(input.massKg)
  ) {
    issue = '输入包含无效数值，已采用安全默认值。';
  }
  const fieldLeftM = finiteOr(input.fieldLeftM, 0.2);
  const fieldRightM = Math.max(fieldLeftM + 0.01, finiteOr(input.fieldRightM, 0.7));
  const resistanceOhm = finiteOr(input.resistanceOhm, 0.5);
  if (resistanceOhm <= 0) issue = issue ?? '电阻必须为正数；当前按极小电阻的极限显示。';
  const params: LoopFieldParams = {
    loopWidthM: Math.max(0.001, finiteOr(input.loopWidthM, 0.3)),
    loopHeightM: Math.max(0.001, finiteOr(input.loopHeightM, 0.2)),
    startXM: finiteOr(input.startXM, -0.2),
    initialSpeedMps: Math.max(0, finiteOr(input.initialSpeedMps, 1.5)),
    BzTesla: finiteOr(input.BzTesla, 1),
    fieldLeftM,
    fieldRightM,
    resistanceOhm: Math.max(1e-9, resistanceOhm),
    massKg: Math.max(1e-9, finiteOr(input.massKg, 0.2)),
    mode: input.mode === 'free' ? 'free' : 'uniform',
  };
  return { params, issue };
}

export function computeLoopSnapshot(params: LoopFieldParams, xM: number, velocityMps: number): LoopSnapshot {
  const L = params.loopWidthM;
  const H = params.loopHeightM;
  const b1 = Math.min(params.fieldLeftM, params.fieldRightM);
  const b2 = Math.max(params.fieldLeftM, params.fieldRightM);

  const overlapLeft = Math.max(xM, b1);
  const overlapRight = Math.min(xM + L, b2);
  const overlapWidthM = Math.max(0, overlapRight - overlapLeft);
  const overlapAreaM2 = overlapWidthM * H;

  let dOverlapDx = 0;
  if (overlapWidthM > TOL) {
    const rightEdgeAdvancing = xM + L < b2 ? 1 : 0;
    const leftEdgeAdvancing = xM > b1 ? 1 : 0;
    dOverlapDx = rightEdgeAdvancing - leftEdgeAdvancing;
  }

  const fluxWb = nz(params.BzTesla * overlapAreaM2);
  const fluxRateWbPerS = nz(params.BzTesla * H * dOverlapDx * velocityMps);
  const emfV = nz(-fluxRateWbPerS);
  const currentA = nz(emfV / params.resistanceOhm);

  const leftSideInside = xM >= b1 - TOL && xM <= b2 + TOL;
  const rightSideInside = xM + L >= b1 - TOL && xM + L <= b2 + TOL;
  // Every side: dF = I dl × B. Top and bottom contribute equal and opposite
  // vertical forces (they cancel); only the vertical sides can contribute net Fx.
  const forceXN = nz(
    currentA * H * params.BzTesla * ((rightSideInside ? 1 : 0) - (leftSideInside ? 1 : 0)),
  );

  let phase: LoopPhase;
  if (overlapWidthM <= TOL) {
    phase = xM + L <= b1 + TOL ? 'before' : 'after';
  } else if (xM < b1 - TOL && xM + L > b2 + TOL) {
    phase = 'spanning';
  } else if (xM >= b1 - TOL && xM + L <= b2 + TOL) {
    phase = 'inside';
  } else if (xM < b1 - TOL) {
    phase = 'entering';
  } else if (xM + L > b2 + TOL) {
    phase = 'leaving';
  } else {
    phase = 'entering';
  }

  return {
    xM,
    velocityMps,
    overlapWidthM,
    overlapAreaM2,
    fluxWb,
    fluxRateWbPerS,
    emfV,
    currentA,
    forceXN,
    leftSideInside,
    rightSideInside,
    dOverlapDx,
    phase,
  };
}

function toEvent(tS: number, snapshot: LoopSnapshot, phase: LoopPhase, prevPhase: LoopPhase): LoopEvent {
  return {
    tS,
    phase,
    label: PHASE_CHANGE_LABEL[`${prevPhase}>${phase}`] ?? `状态变为：${LOOP_PHASE_LABEL[phase]}`,
    xM: snapshot.xM,
    velocityMps: snapshot.velocityMps,
    fluxWb: snapshot.fluxWb,
    emfV: snapshot.emfV,
    currentA: snapshot.currentA,
    forceXN: snapshot.forceXN,
  };
}

export function loopPhaseLabel(phase: LoopPhase): string {
  return LOOP_PHASE_LABEL[phase];
}

export function currentDirection(currentA: number): 'clockwise' | 'counterclockwise' | 'none' {
  if (Math.abs(currentA) < 1e-12) return 'none';
  return currentA > 0 ? 'counterclockwise' : 'clockwise';
}

export function formatCurrentDirection(currentA: number): string {
  const dir = currentDirection(currentA);
  if (dir === 'none') return '无感应电流';
  return dir === 'counterclockwise' ? '逆时针（从纸外看）' : '顺时针（从纸外看）';
}

function staticSimulation(params: LoopFieldParams, issue: string | null): LoopSimulation {
  const snapshot = computeLoopSnapshot(params, params.startXM, params.initialSpeedMps);
  const first: LoopSample = { ...snapshot, tS: 0 };
  const durationS = 0.25;
  const staticSample: LoopSample = { ...snapshot, tS: durationS, velocityMps: 0 };
  const samples = [first, staticSample];
  const final = samples[samples.length - 1];
  return {
    params,
    samples,
    durationS,
    events: [],
    keyTimesS: [0, durationS],
    final,
    initial: first,
    jouleHeatJ: 0,
    mechanicalEnergyLossJ: 0,
    stoppedInsideField: false,
    issue,
  };
}

export function simulateLoop(input: LoopFieldParams): LoopSimulation {
  const { params, issue: inputIssue } = normalizeLoopParams(input);
  const b2 = Math.max(params.fieldLeftM, params.fieldRightM);
  const speed = params.initialSpeedMps;

  let issue = inputIssue;
  if (params.BzTesla === 0) issue = 'B = 0：磁通量始终为零，没有感应电动势与安培力。';
  if (speed === 0) issue = '初速度为 0：线框静止，没有磁通量变化。';
  if (params.startXM >= b2) issue = '线框初始位置已在磁场右侧，不会发生进入过程。';

  if (speed <= 0 || params.startXM >= b2) {
    return staticSimulation(params, issue ?? null);
  }

  const initialSnapshot = computeLoopSnapshot(params, params.startXM, speed);
  const initial: LoopSample = { ...initialSnapshot, tS: 0 };
  const samples: LoopSample[] = [initial];
  const events: LoopEvent[] = [];
  const keySet = new Set<number>([0]);
  let phase = initialSnapshot.phase;
  let jouleHeatJ = 0;
  let x = params.startXM;
  let v = speed;
  let t = 0;
  const initialKinetic = 0.5 * params.massKg * speed * speed;

  const pushSample = (sample: LoopSample) => {
    samples.push(sample);
    if (sample.phase !== phase) {
      const event = toEvent(sample.tS, sample, sample.phase, phase);
      events.push(event);
      keySet.add(sample.tS);
      phase = sample.phase;
    }
  };

  if (params.mode === 'uniform') {
    const duration = Math.max(0, (b2 - params.startXM) / speed);
    const dt = 0.0005;
    const steps = Math.max(1, Math.ceil(duration / dt));
    let prev = initialSnapshot;
    for (let i = 1; i <= steps; i++) {
      const tt = (duration * i) / steps;
      const xx = params.startXM + speed * tt;
      const snap = computeLoopSnapshot(params, xx, speed);
      jouleHeatJ += 0.5 * (prev.currentA * prev.currentA + snap.currentA * snap.currentA) * params.resistanceOhm * (duration / steps);
      const sample = { ...snap, tS: tt };
      pushSample(sample);
      prev = snap;
    }
    const final = samples[samples.length - 1];
    return {
      params,
      samples,
      durationS: final.tS,
      events,
      keyTimesS: [...keySet].sort((a, b) => a - b),
      final,
      initial,
      jouleHeatJ,
      mechanicalEnergyLossJ: 0,
      stoppedInsideField: false,
      issue,
    };
  }

  // Free sliding: only the magnetic force acts. Integrate with fixed-step RK4
  // while detecting boundary/phase transitions; the strip is dissipative, not a trap.
  const accel = (stateX: number, stateV: number) => {
    const snap = computeLoopSnapshot(params, stateX, stateV);
    return snap.forceXN / params.massKg;
  };
  const dt = 0.0002;
  const maxTime = 12;
  const recordEvery = 3;
  let step = 0;
  let prev = initialSnapshot;
  let stopped = false;

  while (t < maxTime) {
    if (x >= b2) break;
    if (v <= 1e-7) {
      const snap = computeLoopSnapshot(params, x, 0);
      if (Math.abs(snap.forceXN) < 1e-14) {
        stopped = true;
        break;
      }
    }
    const k1x = v;
    const k1v = accel(x, v);
    const k2x = v + (dt / 2) * k1v;
    const k2v = accel(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
    const k3x = v + (dt / 2) * k2v;
    const k3v = accel(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
    const k4x = v + dt * k3v;
    const k4v = accel(x + dt * k3x, v + dt * k3v);

    const nextX = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    const nextV = Math.max(0, v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v));
    t += dt;
    x = Number.isFinite(nextX) ? nextX : x;
    v = Number.isFinite(nextV) ? nextV : 0;
    step += 1;

    const snap = computeLoopSnapshot(params, x, v);
    jouleHeatJ +=
      0.5 *
      (prev.currentA * prev.currentA + snap.currentA * snap.currentA) *
      params.resistanceOhm *
      dt;

    if (step % recordEvery === 0 || snap.phase !== phase || x >= b2) {
      pushSample({ ...snap, tS: t });
    }
    prev = snap;
    if (x >= b2) break;
  }

  let final: LoopSample;
  if (samples[samples.length - 1].tS < t) {
    final = { ...computeLoopSnapshot(params, x, v), tS: t };
    pushSample(final);
  } else {
    final = samples[samples.length - 1];
  }

  const finalKinetic = 0.5 * params.massKg * v * v;
  if (t < 0.25) {
    // Keep the timeline usable for very short runs; the physical state is frozen.
    samples.push({ ...final, tS: 0.25 });
  }

  return {
    params,
    samples,
    durationS: Math.max(final.tS, 0.25),
    events,
    keyTimesS: [...keySet].sort((a, b) => a - b),
    final,
    initial,
    jouleHeatJ,
    mechanicalEnergyLossJ: Math.max(0, initialKinetic - finalKinetic),
    stoppedInsideField: stopped && final.phase !== 'after' && final.phase !== 'before',
    issue,
  };
}

function sampleIndexAtTime(samples: LoopSample[], t: number): number {
  if (t <= samples[0].tS) return 0;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tS <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function stateAtTime(sim: LoopSimulation, timeS: number): LoopSample {
  const t = Number.isFinite(timeS) ? clamp(timeS, 0, sim.durationS) : 0;
  const samples = sim.samples;
  const i = sampleIndexAtTime(samples, t);
  const a = samples[i];
  const b = samples[Math.min(samples.length - 1, i + 1)];
  const span = b.tS - a.tS;
  const f = span > 1e-12 ? clamp((t - a.tS) / span, 0, 1) : 0;
  const x = a.xM + (b.xM - a.xM) * f;
  const v = a.velocityMps + (b.velocityMps - a.velocityMps) * f;
  return { ...computeLoopSnapshot(sim.params, x, v), tS: t };
}

export function downsampleLoopSamples(samples: LoopSample[], maxPoints = 240): LoopSample[] {
  if (samples.length <= maxPoints) return samples;
  const step = (samples.length - 1) / (maxPoints - 1);
  const out: LoopSample[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(samples[Math.round(i * step)]);
  }
  return out;
}

export const DEFAULT_LOOP_PARAMS: LoopFieldParams = {
  loopWidthM: 0.3,
  loopHeightM: 0.2,
  startXM: -0.2,
  initialSpeedMps: 1.5,
  BzTesla: 1,
  fieldLeftM: 0.2,
  fieldRightM: 0.7,
  resistanceOhm: 0.5,
  massKg: 0.2,
  mode: 'uniform',
};
