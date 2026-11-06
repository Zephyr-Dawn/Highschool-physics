import {
  computeI05Snapshot,
  i05FieldAt,
  i05FieldKnots,
  I05_DEFAULT,
  validateI05Params,
  type I05Cumulative,
  type I05Event,
  type I05FieldSource,
  type I05Params,
  type I05Snapshot,
  type I05Solution,
  type I05Status,
} from './movingLoopTimeField';

const MAX_SAMPLES = 1200;
const MAX_STEPS = 50_000;
const MAX_EVENTS = 400;
const EVENT_TIME_TOL = 1e-10;
const THRESHOLD_TOL = 1e-10;

interface I05EventCandidate {
  timeS: number;
  label: string;
  boundaryIds: string[];
}

function near(value: number, threshold: number): boolean {
  return Math.abs(value - threshold) <= THRESHOLD_TOL * Math.max(1, Math.abs(value), Math.abs(threshold));
}

function geometryThresholds(params: I05Params): Array<{ value: number; id: string; edge: 'left' | 'right' }> {
  const a = params.fieldLeftM;
  const b = params.fieldRightM;
  const w = params.widthM;
  return [
    { value: a, id: 'left-a', edge: 'left' },
    { value: b, id: 'left-b', edge: 'left' },
    { value: a - w, id: 'right-a', edge: 'right' },
    { value: b - w, id: 'right-b', edge: 'right' },
  ];
}

function edgePosition(xM: number, widthM: number, edge: 'left' | 'right'): number {
  return edge === 'left' ? xM : xM + widthM;
}

function boundaryLabel(boundaryIds: string[], params: I05Params): string {
  const names: Record<string, string> = {
    'left-a': '左边缘到达 a',
    'left-b': '左边缘到达 b',
    'right-a': '右边缘到达 a',
    'right-b': '右边缘到达 b',
  };
  const unique = [...new Set(boundaryIds)];
  return `几何事件：${unique.map((id) => names[id] ?? id).join(' / ')}（a=${params.fieldLeftM} m，b=${params.fieldRightM} m）`;
}

function prescribedEventCandidates(params: I05Params, source: I05FieldSource): I05EventCandidate[] {
  const v = params.initialSpeedMps;
  const events: I05EventCandidate[] = [];
  if (Math.abs(v) > 1e-14) {
    const byTime = new Map<number, string[]>();
    for (const threshold of geometryThresholds(params)) {
      const t = (threshold.value - params.startXM) / v;
      if (!Number.isFinite(t) || t <= 1e-9 || t >= params.durationS - 1e-9) continue;
      const key = Math.round(t * 1e9) / 1e9;
      byTime.set(key, [...(byTime.get(key) ?? []), threshold.id]);
    }
    for (const [timeS, ids] of byTime) {
      events.push({ timeS, label: boundaryLabel(ids, params), boundaryIds: ids });
    }
  }
  for (const knot of i05FieldKnots(source, params.durationS)) {
    events.push({ timeS: knot, label: 'B(t) 波形折点 / 斜率切换', boundaryIds: [] });
  }
  return events.sort((a, b) => a.timeS - b.timeS);
}

function powerAt(
  params: I05Params,
  source: I05FieldSource,
  timeS: number,
): { joule: number; external: number; transformer: number } {
  const x = params.startXM + params.initialSpeedMps * timeS;
  const snapshot = computeI05Snapshot(
    params,
    timeS,
    x,
    params.initialSpeedMps,
    i05FieldAt(source, timeS),
    { jouleHeatJ: 0, externalWorkJ: 0, transformerSourceWorkJ: 0 },
    { derivativeSide: 'right' },
  );
  return {
    joule: snapshot.joulePowerW ?? 0,
    external: snapshot.externalPowerW ?? 0,
    transformer: snapshot.transformerSourcePowerW ?? 0,
  };
}

function integratePowerInterval(
  params: I05Params,
  source: I05FieldSource,
  startS: number,
  endS: number,
): I05Cumulative {
  const span = endS - startS;
  if (span <= 1e-12) return { jouleHeatJ: 0, externalWorkJ: 0, transformerSourceWorkJ: 0 };
  const raw = Math.max(2, Math.ceil(span / 0.002));
  const n = raw % 2 === 0 ? raw : raw + 1;
  const h = span / n;
  let sumJ = 0;
  let sumExt = 0;
  let sumTs = 0;
  for (let index = 0; index <= n; index++) {
    const t = startS + span * (index / n);
    const power = powerAt(params, source, t);
    const weight = index === 0 || index === n ? 1 : index % 2 === 1 ? 4 : 2;
    sumJ += weight * power.joule;
    sumExt += weight * power.external;
    sumTs += weight * power.transformer;
  }
  const factor = h / 3;
  return {
    jouleHeatJ: Math.max(0, sumJ * factor),
    externalWorkJ: sumExt * factor,
    transformerSourceWorkJ: sumTs * factor,
  };
}

function staticSolution(
  params: I05Params,
  source: I05FieldSource,
  issue: string | null = null,
): I05Solution {
  const field = i05FieldAt(source, 0);
  const snapshot = computeI05Snapshot(
    params,
    0,
    params.startXM,
    params.initialSpeedMps,
    field,
    { jouleHeatJ: 0, externalWorkJ: 0, transformerSourceWorkJ: 0 },
  );
  return {
    params,
    fieldSource: source,
    sourceKind: source.kind,
    initial: snapshot,
    final: snapshot,
    samples: [snapshot],
    events: [{ kind: 'start', timeS: 0, label: '实验起点', xM: snapshot.xM, velocityMps: snapshot.velocityMps, boundaryIds: [] }],
    keyTimesS: [0],
    durationS: Math.max(0.25, params.durationS),
    status: 'ok',
    issue,
  };
}

function solvePrescribed(params: I05Params, source: I05FieldSource): I05Solution {
  const candidates = prescribedEventCandidates(params, source);
  const timeSet = new Set<number>([0, params.durationS]);
  for (const candidate of candidates) timeSet.add(candidate.timeS);
  const sampleCount = 720;
  for (let index = 0; index <= sampleCount; index++) {
    timeSet.add((params.durationS * index) / sampleCount);
  }
  const times = [...timeSet].filter((t) => t >= 0 && t <= params.durationS + 1e-12).sort((a, b) => a - b);
  const samples: I05Snapshot[] = [];
  let cumulative: I05Cumulative = { jouleHeatJ: 0, externalWorkJ: 0, transformerSourceWorkJ: 0 };
  let previousTime = 0;
  for (const t of times) {
    if (t > previousTime + 1e-12) {
      const interval = integratePowerInterval(params, source, previousTime, t);
      cumulative = {
        jouleHeatJ: cumulative.jouleHeatJ + interval.jouleHeatJ,
        externalWorkJ: cumulative.externalWorkJ + interval.externalWorkJ,
        transformerSourceWorkJ:
          cumulative.transformerSourceWorkJ + interval.transformerSourceWorkJ,
      };
    }
    previousTime = t;
    const x = params.startXM + params.initialSpeedMps * t;
    const field = i05FieldAt(source, t);
    samples.push(computeI05Snapshot(params, t, x, params.initialSpeedMps, field, cumulative));
  }
  const events: I05Event[] = [
    { kind: 'start', timeS: 0, label: '实验起点', xM: params.startXM, velocityMps: params.initialSpeedMps, boundaryIds: [] },
    ...candidates.map((candidate) => ({
      kind: candidate.boundaryIds.length > 0 ? ('geometry' as const) : ('field-knot' as const),
      timeS: candidate.timeS,
      label: candidate.label,
      xM: params.startXM + params.initialSpeedMps * candidate.timeS,
      velocityMps: params.initialSpeedMps,
      boundaryIds: candidate.boundaryIds,
    })),
    {
      kind: 'end',
      timeS: params.durationS,
      label: '演示结束',
      xM: params.startXM + params.initialSpeedMps * params.durationS,
      velocityMps: params.initialSpeedMps,
      boundaryIds: [],
    },
  ];
  const initial = samples[0];
  const final = samples[samples.length - 1];
  return {
    params,
    fieldSource: source,
    sourceKind: source.kind,
    initial,
    final,
    samples,
    events,
    keyTimesS: [...new Set([0, params.durationS, ...events.map((event) => event.timeS)])].sort((a, b) => a - b),
    durationS: params.durationS,
    status: samples.length > MAX_SAMPLES ? 'event-limited' : 'ok',
    issue: null,
  };
}

type I05State = [x: number, v: number, q: number, wExt: number, wTs: number];

function stateSnapshot(
  params: I05Params,
  source: I05FieldSource,
  state: I05State,
  timeS: number,
  derivativeSide: 'point' | 'right' = 'point',
): I05Snapshot {
  const field = i05FieldAt(source, timeS);
  return computeI05Snapshot(
    params,
    timeS,
    state[0],
    state[1],
    field,
    { jouleHeatJ: state[2], externalWorkJ: state[3], transformerSourceWorkJ: state[4] },
    { derivativeSide },
  );
}

function stateDerivative(params: I05Params, source: I05FieldSource, state: I05State, timeS: number): I05State {
  const snapshot = stateSnapshot(params, source, state, timeS, 'right');
  const magneticForce = params.circuitClosed ? snapshot.magneticForceX ?? 0 : 0;
  return [
    state[1],
    (params.externalForceN + magneticForce) / params.massKg,
    snapshot.joulePowerW ?? 0,
    snapshot.externalPowerW ?? 0,
    snapshot.transformerSourcePowerW ?? 0,
  ];
}

function addScaled(base: I05State, derivative: I05State, scale: number): I05State {
  return [
    base[0] + derivative[0] * scale,
    base[1] + derivative[1] * scale,
    base[2] + derivative[2] * scale,
    base[3] + derivative[3] * scale,
    base[4] + derivative[4] * scale,
  ];
}

function rk4Step(params: I05Params, source: I05FieldSource, state: I05State, timeS: number, dt: number): I05State {
  const k1 = stateDerivative(params, source, state, timeS);
  const k2 = stateDerivative(params, source, addScaled(state, k1, dt / 2), timeS + dt / 2);
  const k3 = stateDerivative(params, source, addScaled(state, k2, dt / 2), timeS + dt / 2);
  const k4 = stateDerivative(params, source, addScaled(state, k3, dt), timeS + dt);
  return [
    state[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    state[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    state[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    state[3] + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
    state[4] + (dt / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]),
  ];
}

function crossedThresholds(
  params: I05Params,
  oldState: I05State,
  newState: I05State,
): Array<{ value: number; id: string; edge: 'left' | 'right' }> {
  const crossed: Array<{ value: number; id: string; edge: 'left' | 'right' }> = [];
  for (const threshold of geometryThresholds(params)) {
    const oldEdge = edgePosition(oldState[0], params.widthM, threshold.edge);
    const newEdge = edgePosition(newState[0], params.widthM, threshold.edge);
    if (near(oldEdge, threshold.value)) continue;
    if (
      (oldEdge < threshold.value && newEdge >= threshold.value) ||
      (oldEdge > threshold.value && newEdge <= threshold.value)
    ) {
      crossed.push(threshold);
    }
  }
  return crossed;
}

function solveDynamic(params: I05Params, source: I05FieldSource): I05Solution {
  let state: I05State = [params.startXM, params.initialSpeedMps, 0, 0, 0];
  let timeS = 0;
  let dt = Math.min(0.002, Math.max(1e-4, params.durationS / 4000));
  const dtMin = 1e-7;
  const dtMax = 0.002;
  const samples: I05Snapshot[] = [];
  const events: I05Event[] = [];
  let status: I05Status = 'ok';
  let steps = 0;
  let eventCount = 0;
  const sampleInterval = 0.002;
  let lastSampleTime = -1;
  const knots = i05FieldKnots(source, params.durationS);
  let knotIndex = 0;
  const pushSample = (snapshot: I05Snapshot) => {
    samples.push(snapshot);
    lastSampleTime = snapshot.timeS;
    if (samples.length > MAX_SAMPLES) {
      status = 'event-limited';
      samples.splice(0, samples.length - MAX_SAMPLES);
    }
  };
  pushSample(stateSnapshot(params, source, state, 0));
  events.push({
    kind: 'start',
    timeS: 0,
    label: '实验起点',
    xM: state[0],
    velocityMps: state[1],
    boundaryIds: [],
  });

  while (timeS < params.durationS - 1e-12) {
    if (steps >= MAX_STEPS) {
      status = 'solver-limited';
      break;
    }
    if (eventCount >= MAX_EVENTS) {
      status = 'event-limited';
      break;
    }
    const remaining = params.durationS - timeS;
    let step = Math.min(dt, dtMax, remaining);
    const nextKnot = knots[knotIndex];
    if (nextKnot !== undefined && nextKnot > timeS + 1e-12 && timeS + step > nextKnot) {
      step = nextKnot - timeS;
    }
    const full = rk4Step(params, source, state, timeS, step);
    const half = rk4Step(
      params,
      source,
      rk4Step(params, source, state, timeS, step / 2),
      timeS + step / 2,
      step / 2,
    );
    const error = Math.max(
      Math.abs(full[0] - half[0]),
      Math.abs(full[1] - half[1]),
      Math.abs(full[2] - half[2]) / (1 + Math.abs(half[2])),
      Math.abs(full[3] - half[3]) / (1 + Math.abs(half[3])),
      Math.abs(full[4] - half[4]) / (1 + Math.abs(half[4])),
    );
    const crossed = crossedThresholds(params, state, half);
    if (crossed.length === 0 && error > 2e-9 && step > dtMin) {
      dt = Math.max(dtMin, step / 2);
      continue;
    }
    let acceptedTime = timeS + step;
    let acceptedState = half;
    if (crossed.length > 0) {
      let low = 0;
      let high = step;
      for (let iteration = 0; iteration < 70; iteration++) {
        const mid = (low + high) / 2;
        const probe = rk4Step(params, source, state, timeS, mid);
        if (crossedThresholds(params, state, probe).length > 0) high = mid;
        else low = mid;
      }
      const eventDt = Math.max(0, (low + high) / 2);
      acceptedTime = timeS + eventDt;
      acceptedState = rk4Step(params, source, state, timeS, eventDt);
      const ids = crossed.map((item) => item.id);
      events.push({
        kind: 'geometry',
        timeS: acceptedTime,
        label: boundaryLabel(ids, params),
        xM: acceptedState[0],
        velocityMps: acceptedState[1],
        boundaryIds: ids,
      });
      eventCount += 1;
      pushSample(stateSnapshot(params, source, acceptedState, acceptedTime));
    } else if (
      nextKnot !== undefined &&
      Math.abs(acceptedTime - nextKnot) <= EVENT_TIME_TOL &&
      acceptedTime < params.durationS - 1e-12
    ) {
      events.push({
        kind: 'field-knot',
        timeS: acceptedTime,
        label: 'B(t) 波形折点 / 斜率切换',
        xM: acceptedState[0],
        velocityMps: acceptedState[1],
        boundaryIds: [],
      });
      eventCount += 1;
      knotIndex += 1;
      pushSample(stateSnapshot(params, source, acceptedState, acceptedTime));
    } else if (acceptedTime - lastSampleTime >= sampleInterval || acceptedTime >= params.durationS - 1e-12) {
      pushSample(stateSnapshot(params, source, acceptedState, acceptedTime));
    }
    if (acceptedTime <= timeS + 1e-12) {
      timeS += dtMin;
      state = [state[0] + state[1] * dtMin, state[1], state[2], state[3], state[4]];
    } else {
      timeS = acceptedTime;
      state = acceptedState;
    }
    dt = Math.min(dtMax, Math.max(dtMin, step * 1.5));
    steps += 1;
  }

  const finalTime = Math.min(params.durationS, timeS);
  const finalSnapshot = stateSnapshot(params, source, state, finalTime);
  if (samples.length === 0 || samples[samples.length - 1].timeS < finalTime - 1e-12) {
    pushSample(finalSnapshot);
  }
  events.push({
    kind: 'end',
    timeS: finalTime,
    label: status === 'solver-limited'
      ? '求解器步数上限：已停止'
      : status === 'event-limited'
        ? '事件/采样上限：已停止'
        : '演示结束',
    xM: state[0],
    velocityMps: state[1],
    boundaryIds: [],
  });
  const initialState: I05State = [params.startXM, params.initialSpeedMps, 0, 0, 0];
  const initial = stateSnapshot(params, source, initialState, 0);
  const final = stateSnapshot(params, source, state, finalTime);
  return {
    params,
    fieldSource: source,
    sourceKind: source.kind,
    initial,
    final,
    samples,
    events,
    keyTimesS: [...new Set([0, finalTime, ...events.map((event) => event.timeS)])].sort((a, b) => a - b),
    durationS: finalTime,
    status,
    issue: status === 'solver-limited'
      ? '求解器达到步数上限；结果在最后一个安全状态停止，不伪造后续轨迹。'
      : status === 'event-limited'
        ? '事件/采样数量达到上限；结果在最后一个安全状态停止。'
        : null,
  };
}

export function solveI05(paramsInput: I05Params, source?: I05FieldSource): I05Solution {
  const validation = validateI05Params(paramsInput);
  if (!validation.valid || !validation.params) {
    const fallback: I05Params = {
      ...I05_DEFAULT,
      mode: 'prescribed',
      startXM: I05_DEFAULT.startXM,
      initialSpeedMps: 0,
      durationS: 1,
      waveform: { ...I05_DEFAULT.waveform },
    };
    const sourceFallback: I05FieldSource = { kind: 'waveform', waveform: fallback.waveform };
    const snapshot = computeI05Snapshot(
      fallback,
      0,
      fallback.startXM,
      0,
      i05FieldAt(sourceFallback, 0),
      { jouleHeatJ: 0, externalWorkJ: 0, transformerSourceWorkJ: 0 },
    );
    const invalid = { ...snapshot, issue: validation.issues.join(' ') };
    return {
      params: fallback,
      fieldSource: sourceFallback,
      sourceKind: 'waveform',
      initial: invalid,
      final: invalid,
      samples: [invalid],
      events: [],
      keyTimesS: [0],
      durationS: 1,
      status: 'invalid',
      issue: validation.issues.join(' '),
    };
  }
  const params = validation.params;
  const fieldSource: I05FieldSource = source
    ?? (params.mode === 'manual-b'
      ? {
          kind: 'manual',
          timeline: {
            settings: { rampSeconds: 0.4, maxAbsRateTeslaPerS: 4 },
            keyframes: [{ tS: 0, bzTesla: params.manualStartBzTesla }],
          },
        }
      : { kind: 'waveform', waveform: params.waveform });
  if (params.mode === 'manual-x') {
    return staticSolution(params, fieldSource, '手动拖动线框模式由手势历史驱动；此纯函数解只保留初始状态。');
  }
  if (params.mode === 'prescribed') {
    return solvePrescribed(params, fieldSource);
  }
  return solveDynamic(params, fieldSource);
}

export function stateAtI05Time(solution: I05Solution, timeS: number): I05Snapshot {
  if (solution.status === 'invalid' || solution.samples.length === 0) return solution.initial;
  const t = Number.isFinite(timeS) ? Math.max(0, Math.min(solution.durationS, timeS)) : 0;
  const samples = solution.samples;
  if (t <= samples[0].timeS) return samples[0];
  if (t >= samples[samples.length - 1].timeS) return samples[samples.length - 1];
  let low = 0;
  let high = samples.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].timeS <= t) low = mid;
    else high = mid;
  }
  const a = samples[low];
  const b = samples[high];
  const span = b.timeS - a.timeS;
  const h = Math.max(1e-12, span);
  const s = Math.max(0, Math.min(1, (t - a.timeS) / h));
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const x = h00 * a.xM + h10 * h * a.velocityMps + h01 * b.xM + h11 * h * b.velocityMps;
  const v = ((6 * s2 - 6 * s) / h) * a.xM
    + (3 * s2 - 4 * s + 1) * a.velocityMps
    + ((-6 * s2 + 6 * s) / h) * b.xM
    + (3 * s2 - 2 * s) * b.velocityMps;
  const hermite = (
    leftValue: number,
    rightValue: number,
    leftRate: number | null,
    rightRate: number | null,
  ) => h00 * leftValue + h10 * h * (leftRate ?? 0) + h01 * rightValue + h11 * h * (rightRate ?? 0);
  const field = i05FieldAt(solution.fieldSource, t);
  return computeI05Snapshot(
    solution.params,
    t,
    x,
    v,
    field,
    {
      jouleHeatJ: hermite(a.jouleHeatJ, b.jouleHeatJ, a.joulePowerW, b.joulePowerW),
      externalWorkJ: hermite(a.externalWorkJ, b.externalWorkJ, a.externalPowerW, b.externalPowerW),
      transformerSourceWorkJ: hermite(
        a.transformerSourceWorkJ,
        b.transformerSourceWorkJ,
        a.transformerSourcePowerW,
        b.transformerSourcePowerW,
      ),
    },
  );
}

export function downsampleI05Samples(samples: I05Snapshot[], maxPoints = 300): I05Snapshot[] {
  if (samples.length <= maxPoints) return samples;
  const step = (samples.length - 1) / (maxPoints - 1);
  const out: I05Snapshot[] = [];
  for (let index = 0; index < maxPoints; index++) out.push(samples[Math.round(index * step)]);
  return out;
}
