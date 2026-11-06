import {
  add,
  clamp,
  dot,
  length,
  rotate,
  scale,
  type Vec2,
} from '../core/vec2';

export interface AlternatingFieldInput {
  boundaries: readonly number[];
  /** Bz for each region; length must be boundaries.length + 1. */
  fields: readonly number[];
  startPosition: Vec2;
  initialVelocity: Vec2;
  chargeC: number;
  massKg: number;
  timeHorizonS?: number;
  maxEvents?: number;
}

export type AlternatingEventKind = 'start' | 'crossing' | 'tangent' | 'window-end' | 'event-limit';

export interface AlternatingEvent {
  timeS: number;
  kind: AlternatingEventKind;
  fromRegion: number;
  toRegion: number;
  position: Vec2;
  velocity: Vec2;
  boundaryIndex: number | null;
  explanation: string;
}

export interface AlternatingSegment {
  regionIndex: number;
  Bz: number;
  kind: 'line' | 'arc';
  startTimeS: number;
  endTimeS: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  center: Vec2 | null;
  radiusM: number | null;
  periodS: number | null;
  omegaRadPerS: number;
}

export interface AlternatingState {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  force: Vec2;
  speed: number;
  kineticEnergyJ: number;
  regionIndex: number;
  Bz: number;
  inMagneticField: boolean;
  segmentIndex: number;
}

export type AlternatingStatus =
  | 'crossed'
  | 'tangent-only'
  | 'no-crossing'
  | 'event-limited'
  | 'stationary'
  | 'invalid';

export interface AlternatingSolution {
  input: AlternatingFieldInput;
  boundaries: readonly number[];
  fields: readonly number[];
  events: AlternatingEvent[];
  segments: AlternatingSegment[];
  crossingCount: number;
  tangentCount: number;
  regionTimesS: number[];
  durationS: number;
  finalState: AlternatingState;
  status: AlternatingStatus;
  issue: string | null;
  eventLimited: boolean;
  windowEnded: boolean;
  initialRegion: number;
}

const TWO_PI = Math.PI * 2;
const DEFAULT_HORIZON = 10;
const MAX_HORIZON = 120;
const MIN_SPEED = 1e-12;
const MIN_OMEGA = 1e-12;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function finiteVec(value: Vec2 | null | undefined): value is Vec2 {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y));
}

function wrapAngle(value: number): number {
  const wrapped = value % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function angleOf(value: Vec2): number {
  return Math.atan2(value.y, value.x);
}

function validInput(input: AlternatingFieldInput): boolean {
  return Boolean(
    input &&
    finiteVec(input.startPosition) &&
    finiteVec(input.initialVelocity) &&
    Number.isFinite(input.chargeC) &&
    Number.isFinite(input.massKg) &&
    input.massKg > 0 &&
    Array.isArray(input.boundaries) &&
    Array.isArray(input.fields) &&
    input.fields.length === input.boundaries.length + 1 &&
    input.boundaries.every((value, index) =>
      Number.isFinite(value) && (index === 0 || value > input.boundaries[index - 1]),
    ) &&
    input.fields.every((value) => Number.isFinite(value)),
  );
}

export function alternatingRegionAtX(
  input: Pick<AlternatingFieldInput, 'boundaries' | 'fields'>,
  x: number,
): number {
  if (!Number.isFinite(x) || input.boundaries.length === 0) return 0;
  for (let index = 0; index < input.boundaries.length; index++) {
    if (x < input.boundaries[index]) return index;
  }
  return input.fields.length - 1;
}

function boundaryTolerance(input: AlternatingFieldInput, speed: number): number {
  const scale = Math.max(1, speed, ...input.boundaries.map((value) => Math.abs(value)));
  return scale * 1e-9;
}

function probeStep(speed: number): number {
  return Math.max(1e-10, Math.min(1e-4, 1e-7 / Math.max(speed, MIN_SPEED)));
}

function initialRegion(input: AlternatingFieldInput): number {
  const x = input.startPosition.x;
  const tolerance = boundaryTolerance(input, 0);
  const boundaryIndex = input.boundaries.findIndex((value) => Math.abs(value - x) <= tolerance);
  if (boundaryIndex >= 0) {
    const vx = input.initialVelocity.x;
    const velocityTolerance = Math.max(1e-12, length(input.initialVelocity) * 1e-9);
    if (vx > velocityTolerance) return boundaryIndex + 1;
    if (vx < -velocityTolerance) return boundaryIndex;
    const leftField = input.fields[boundaryIndex];
    const rightField = input.fields[boundaryIndex + 1];
    const accelerationFor = (Bz: number): number => (input.chargeC * Bz * input.initialVelocity.y) / input.massKg;
    const leftAcceleration = accelerationFor(leftField);
    const rightAcceleration = accelerationFor(rightField);
    if (rightAcceleration > velocityTolerance && leftAcceleration <= 0) return boundaryIndex + 1;
    if (leftAcceleration < -velocityTolerance && rightAcceleration >= 0) return boundaryIndex;
    return vx >= 0 ? boundaryIndex + 1 : boundaryIndex;
  }
  return alternatingRegionAtX(input, x);
}

function createSegment(
  input: AlternatingFieldInput,
  regionIndex: number,
  startTimeS: number,
  endTimeS: number,
  startPosition: Vec2,
  startVelocity: Vec2,
): AlternatingSegment {
  const Bz = input.fields[regionIndex] ?? 0;
  const omega = (-input.chargeC * Bz) / input.massKg;
  const speed = length(startVelocity);
  const magnetic = Math.abs(omega) >= MIN_OMEGA && speed > MIN_SPEED;
  return {
    regionIndex,
    Bz,
    kind: magnetic ? 'arc' : 'line',
    startTimeS,
    endTimeS,
    startPosition: { ...startPosition },
    startVelocity: { ...startVelocity },
    center: magnetic
      ? { x: startPosition.x - startVelocity.y / omega, y: startPosition.y + startVelocity.x / omega }
      : null,
    radiusM: magnetic ? speed / Math.abs(omega) : null,
    periodS: magnetic ? TWO_PI / Math.abs(omega) : null,
    omegaRadPerS: magnetic ? omega : 0,
  };
}

function stateInSegment(segment: AlternatingSegment, timeS: number): { position: Vec2; velocity: Vec2 } {
  if (segment.kind === 'line' || !segment.center || segment.radiusM === null) {
    return {
      position: add(segment.startPosition, scale(segment.startVelocity, timeS - segment.startTimeS)),
      velocity: { ...segment.startVelocity },
    };
  }
  const angle = segment.omegaRadPerS * (timeS - segment.startTimeS);
  const radial = rotate(
    { x: segment.startPosition.x - segment.center.x, y: segment.startPosition.y - segment.center.y },
    angle,
  );
  const position = { x: segment.center.x + radial.x, y: segment.center.y + radial.y };
  return {
    position,
    velocity: {
      x: -segment.omegaRadPerS * radial.y,
      y: segment.omegaRadPerS * radial.x,
    },
  };
}

interface CrossingCandidate {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  boundaryIndex: number;
  toRegion: number;
  kind: 'crossing' | 'tangent';
  explanation: string;
}

function verticalLineTimes(
  center: Vec2,
  radius: number,
  boundaryX: number,
  startPosition: Vec2,
  omega: number,
  startTimeS: number,
  horizon: number,
  tolerance: number,
): Array<{ timeS: number; position: Vec2; velocity: Vec2 }> {
  const difference = boundaryX - center.x;
  const discriminant = radius * radius - difference * difference;
  if (discriminant < -tolerance * Math.max(1, radius)) return [];
  const roots = discriminant <= tolerance * Math.max(1, radius)
    ? [0]
    : [Math.sqrt(Math.max(0, discriminant)), -Math.sqrt(Math.max(0, discriminant))];
  const startAngle = angleOf({ x: startPosition.x - center.x, y: startPosition.y - center.y });
  const results: Array<{ timeS: number; position: Vec2; velocity: Vec2 }> = [];
  for (const root of roots) {
    const position = { x: boundaryX, y: center.y + root };
    const angle = angleOf({ x: position.x - center.x, y: position.y - center.y });
    const delta = wrapAngle(Math.sign(omega) * (angle - startAngle));
    if (delta <= 1e-10 || TWO_PI - delta <= 1e-10) continue;
    const timeS = startTimeS + delta / Math.abs(omega);
    if (timeS <= startTimeS + 1e-10 || timeS > horizon + 1e-10) continue;
    const radial = { x: position.x - center.x, y: position.y - center.y };
    results.push({
      timeS,
      position,
      velocity: { x: -omega * radial.y, y: omega * radial.x },
    });
  }
  return results;
}

function findNextCrossing(options: {
  input: AlternatingFieldInput;
  regionIndex: number;
  startTimeS: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  horizon: number;
  probeS: number;
}): { crossing: CrossingCandidate | null; tangents: CrossingCandidate[] } {
  const { input, regionIndex, startTimeS, startPosition, startVelocity, horizon, probeS } = options;
  const Bz = input.fields[regionIndex] ?? 0;
  const omega = (-input.chargeC * Bz) / input.massKg;
  const speed = length(startVelocity);
  const magnetic = Math.abs(omega) >= MIN_OMEGA && speed > MIN_SPEED;
  const tolerance = Math.max(1e-10, Math.max(1, speed) * 1e-8);
  const candidates: CrossingCandidate[] = [];
  const timeTolerance = Math.max(1e-10, horizon * 1e-10);

  if (!magnetic) {
    if (Math.abs(startVelocity.x) < 1e-14) return { crossing: null, tangents: [] };
    for (let boundaryIndex = 0; boundaryIndex < input.boundaries.length; boundaryIndex++) {
      const boundaryX = input.boundaries[boundaryIndex];
      const delta = (boundaryX - startPosition.x) / startVelocity.x;
      if (!Number.isFinite(delta) || delta <= timeTolerance) continue;
      const timeS = startTimeS + delta;
      if (timeS <= startTimeS + timeTolerance || timeS > horizon + timeTolerance) continue;
      const position = add(startPosition, scale(startVelocity, delta));
      const toRegion = startVelocity.x > 0 ? boundaryIndex + 1 : boundaryIndex;
      if (toRegion === regionIndex) continue;
      candidates.push({
        timeS,
        position,
        velocity: { ...startVelocity },
        boundaryIndex,
        toRegion,
        kind: 'crossing',
        explanation: startVelocity.x > 0 ? '直线向右跨越区域边界' : '直线向左跨越区域边界',
      });
    }
  } else {
    const radius = speed / Math.abs(omega);
    const center = {
      x: startPosition.x - startVelocity.y / omega,
      y: startPosition.y + startVelocity.x / omega,
    };
    for (let boundaryIndex = 0; boundaryIndex < input.boundaries.length; boundaryIndex++) {
      const hits = verticalLineTimes(
        center,
        radius,
        input.boundaries[boundaryIndex],
        startPosition,
        omega,
        startTimeS,
        horizon,
        tolerance,
      );
      for (const hit of hits) {
        const after = stateInSegment(
          {
            regionIndex,
            Bz,
            kind: 'arc',
            startTimeS,
            endTimeS: horizon,
            startPosition,
            startVelocity,
            center,
            radiusM: radius,
            periodS: TWO_PI / Math.abs(omega),
            omegaRadPerS: omega,
          },
          hit.timeS + probeS,
        );
        const toRegion = alternatingRegionAtX(input, after.position.x);
        if (toRegion === regionIndex) {
          candidates.push({
            timeS: hit.timeS,
            position: hit.position,
            velocity: hit.velocity,
            boundaryIndex,
            toRegion,
            kind: 'tangent',
            explanation: '轨迹与区域边界相切接触，没有改变区域。',
          });
        } else {
          candidates.push({
            timeS: hit.timeS,
            position: hit.position,
            velocity: hit.velocity,
            boundaryIndex,
            toRegion,
            kind: 'crossing',
            explanation: '圆弧在边界处位置与速度连续，随后切换磁区。',
          });
        }
      }
    }
  }

  candidates.sort((left, right) => left.timeS - right.timeS);
  const crossing = candidates.find((candidate) => candidate.kind === 'crossing') ?? null;
  const tangents = crossing
    ? candidates.filter((candidate) => candidate.kind === 'tangent' && candidate.timeS < crossing.timeS - timeTolerance)
    : candidates.filter((candidate) => candidate.kind === 'tangent');
  return { crossing, tangents };
}

function invalidSolution(input: AlternatingFieldInput, issue: string): AlternatingSolution {
  const safePoint = finiteVec(input?.startPosition) ? { ...input.startPosition } : { x: 0, y: 0 };
  const safeVelocity = { x: 0, y: 0 };
  const duration = 1;
  return {
    input,
    boundaries: Array.isArray(input?.boundaries) ? input.boundaries : [],
    fields: Array.isArray(input?.fields) ? input.fields : [],
    events: [],
    segments: [],
    crossingCount: 0,
    tangentCount: 0,
    regionTimesS: Array.isArray(input?.fields) ? input.fields.map(() => 0) : [],
    durationS: duration,
    finalState: {
      timeS: 0,
      position: safePoint,
      velocity: safeVelocity,
      force: { x: 0, y: 0 },
      speed: 0,
      kineticEnergyJ: 0,
      regionIndex: 0,
      Bz: 0,
      inMagneticField: false,
      segmentIndex: 0,
    },
    status: 'invalid',
    issue,
    eventLimited: false,
    windowEnded: true,
    initialRegion: 0,
  };
}

export function solveAlternatingFieldTrajectory(inputValue: AlternatingFieldInput): AlternatingSolution {
  if (!validInput(inputValue)) {
    return invalidSolution(inputValue, '区域边界必须严格递增、Bz 数量必须匹配，且输入必须有限。');
  }
  const input = inputValue;
  const horizon = Number.isFinite(input.timeHorizonS)
    ? clamp(input.timeHorizonS as number, 0.1, MAX_HORIZON)
    : DEFAULT_HORIZON;
  const maxEvents = Number.isFinite(input.maxEvents)
    ? Math.max(1, Math.min(100, Math.floor(input.maxEvents as number)))
    : 40;
  const speed = length(input.initialVelocity);
  if (speed <= MIN_SPEED) {
    const region = initialRegion(input);
    const segment = createSegment(input, region, 0, horizon, input.startPosition, input.initialVelocity);
    const finalState = stateAtSegments(input, [segment], region, horizon);
    return {
      input,
      boundaries: input.boundaries,
      fields: input.fields,
      events: [],
      segments: [segment],
      crossingCount: 0,
      tangentCount: 0,
      regionTimesS: input.fields.map((_, index) => (index === region ? horizon : 0)),
      durationS: horizon,
      finalState,
      status: 'stationary',
      issue: null,
      eventLimited: false,
      windowEnded: true,
      initialRegion: region,
    };
  }

  let region = initialRegion(input);
  let time = 0;
  let position = { ...input.startPosition };
  let velocity = { ...input.initialVelocity };
  const events: AlternatingEvent[] = [{
    timeS: 0,
    kind: 'start',
    fromRegion: region,
    toRegion: region,
    position: { ...position },
    velocity: { ...velocity },
    boundaryIndex: null,
    explanation: `从区域 ${region + 1} 出发`,
  }];
  const segments: AlternatingSegment[] = [];
  let eventLimited = false;
  let windowEnded = false;
  let crossingCount = 0;
  let tangentCount = 0;
  const probeS = probeStep(speed);

  for (let iteration = 0; iteration < maxEvents; iteration++) {
    if (time >= horizon - 1e-12) {
      windowEnded = true;
      break;
    }
    const result = findNextCrossing({
      input,
      regionIndex: region,
      startTimeS: time,
      startPosition: position,
      startVelocity: velocity,
      horizon,
      probeS,
    });
    for (const tangent of result.tangents) {
      tangentCount += 1;
      events.push({
        timeS: tangent.timeS,
        kind: 'tangent',
        fromRegion: region,
        toRegion: region,
        position: tangent.position,
        velocity: tangent.velocity,
        boundaryIndex: tangent.boundaryIndex,
        explanation: tangent.explanation,
      });
    }
    const crossing = result.crossing;
    const endTime = crossing ? Math.min(horizon, crossing.timeS) : horizon;
    if (endTime <= time + 1e-10) {
      eventLimited = true;
      events.push({
        timeS: time,
        kind: 'event-limit',
        fromRegion: region,
        toRegion: region,
        position: { ...position },
        velocity: { ...velocity },
        boundaryIndex: null,
        explanation: '事件无法继续推进，已安全停止。',
      });
      break;
    }
    const segment = createSegment(input, region, time, endTime, position, velocity);
    segments.push(segment);
    if (!crossing) {
      time = horizon;
      const tail = stateInSegment(segment, horizon);
      position = tail.position;
      velocity = tail.velocity;
      windowEnded = true;
      break;
    }
    const atCrossing = stateInSegment(segment, crossing.timeS);
    crossingCount += 1;
    events.push({
      timeS: crossing.timeS,
      kind: 'crossing',
      fromRegion: region,
      toRegion: crossing.toRegion,
      position: atCrossing.position,
      velocity: atCrossing.velocity,
      boundaryIndex: crossing.boundaryIndex,
      explanation: crossing.explanation,
    });
    time = crossing.timeS;
    position = atCrossing.position;
    velocity = atCrossing.velocity;
    region = crossing.toRegion;
    if (iteration === maxEvents - 1) {
      eventLimited = true;
      events.push({
        timeS: time,
        kind: 'event-limit',
        fromRegion: region,
        toRegion: region,
        position: { ...position },
        velocity: { ...velocity },
        boundaryIndex: null,
        explanation: '达到事件上限，轨迹可能尚未结束。',
      });
      break;
    }
  }

  if (segments.length === 0) {
    segments.push(createSegment(input, region, 0, horizon, position, velocity));
    time = horizon;
    const tail = stateInSegment(segments[0], horizon);
    position = tail.position;
    velocity = tail.velocity;
    windowEnded = true;
  } else if (time < horizon - 1e-10 && !eventLimited) {
    const tail = createSegment(input, region, time, horizon, position, velocity);
    segments.push(tail);
    time = horizon;
    windowEnded = true;
  }

  const durationS = eventLimited ? Math.min(time, horizon) : horizon;
  const regionTimesS = input.fields.map((_, index) =>
    segments
      .filter((segment) => segment.regionIndex === index)
      .reduce((total, segment) => total + Math.max(0, Math.min(segment.endTimeS, durationS) - segment.startTimeS), 0),
  );
  const finalState = stateAtSegments(input, segments, region, durationS);
  let status: AlternatingStatus;
  if (eventLimited) status = 'event-limited';
  else if (crossingCount > 0) status = 'crossed';
  else if (tangentCount > 0) status = 'tangent-only';
  else status = 'no-crossing';

  return {
    input,
    boundaries: input.boundaries,
    fields: input.fields,
    events: [...events].sort((left, right) => left.timeS - right.timeS),
    segments,
    crossingCount,
    tangentCount,
    regionTimesS,
    durationS,
    finalState,
    status,
    issue: eventLimited ? '达到事件上限，轨迹可能尚未结束。' : null,
    eventLimited,
    windowEnded,
    initialRegion: initialRegion(input),
  };
}

function stateAtSegments(
  input: AlternatingFieldInput,
  segments: AlternatingSegment[],
  regionIndex: number,
  timeS: number,
): AlternatingState {
  const t = Number.isFinite(timeS) ? clamp(timeS, 0, Number.MAX_VALUE) : 0;
  let index = segments.length - 1;
  for (let candidate = 0; candidate < segments.length; candidate++) {
    if (t <= segments[candidate].endTimeS + 1e-12) {
      index = candidate;
      break;
    }
  }
  const segment = segments[Math.max(0, Math.min(segments.length - 1, index))];
  if (!segment) {
    return {
      timeS: t,
      position: { ...input.startPosition },
      velocity: { ...input.initialVelocity },
      force: { x: 0, y: 0 },
      speed: length(input.initialVelocity),
      kineticEnergyJ: 0.5 * input.massKg * length(input.initialVelocity) ** 2,
      regionIndex,
      Bz: input.fields[regionIndex] ?? 0,
      inMagneticField: false,
      segmentIndex: 0,
    };
  }
  const state = stateInSegment(segment, Math.min(t, segment.endTimeS));
  const magnetic = segment.kind === 'arc';
  const force = magnetic
    ? {
        x: nz(input.chargeC * state.velocity.y * segment.Bz),
        y: nz(-input.chargeC * state.velocity.x * segment.Bz),
      }
    : { x: 0, y: 0 };
  const speed = length(state.velocity);
  return {
    timeS: t,
    position: state.position,
    velocity: state.velocity,
    force,
    speed,
    kineticEnergyJ: 0.5 * input.massKg * speed * speed,
    regionIndex: segment.regionIndex,
    Bz: segment.Bz,
    inMagneticField: magnetic,
    segmentIndex: Math.max(0, Math.min(segments.length - 1, index)),
  };
}

export function alternatingStateAt(solution: AlternatingSolution, timeS: number): AlternatingState {
  return stateAtSegments(solution.input, solution.segments, solution.initialRegion, timeS);
}

export function sampleAlternatingTrajectory(
  solution: AlternatingSolution,
  durationS: number,
  count = 180,
): Vec2[] {
  const duration = clamp(durationS, 0, solution.durationS);
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let index = 0; index <= n; index++) {
    points.push(alternatingStateAt(solution, (duration * index) / n).position);
  }
  return points;
}

export function alternatingRegionDurations(solution: AlternatingSolution): number[] {
  return [...solution.regionTimesS];
}

export function alternatingForceDotVelocity(state: AlternatingState): number {
  return dot(state.force, state.velocity);
}
