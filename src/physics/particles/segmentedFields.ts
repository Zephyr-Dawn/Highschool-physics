import { add, length, rotate, scale, type Vec2 } from '../core/vec2';

/**
 * P06 mode B: three vertical regions.
 * x < -d: free; -d <= x < 0: E only; x >= 0: B only.
 * SI units. Position and velocity are continuous at crossings; fields may jump.
 */
export interface SegmentedFieldInput {
  massKg: number;
  chargeC: number;
  dM: number;
  Ex: number;
  Ey: number;
  Bz: number;
  initialPosition: Vec2;
  initialVelocity: Vec2;
  maxTimeS?: number;
  maxEvents?: number;
}

export type FieldRegion = 'free' | 'electric' | 'magnetic';
export type SegmentedSegmentKind = 'line' | 'quadratic' | 'arc';
export type SegmentedEventKind =
  | 'start'
  | 'crossing'
  | 'tangent'
  | 'turn-around'
  | 'window-end'
  | 'event-limit';

export interface SegmentedFieldSegment {
  region: FieldRegion;
  kind: SegmentedSegmentKind;
  startTimeS: number;
  endTimeS: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  acceleration: Vec2;
  omegaRadPerS: number;
  center: Vec2 | null;
  radiusM: number | null;
  workAtStartJ: number;
}

export interface SegmentedEvent {
  timeS: number;
  kind: SegmentedEventKind;
  fromRegion: FieldRegion;
  toRegion: FieldRegion;
  position: Vec2;
  velocity: Vec2;
  explanation: string;
}

export interface SegmentedState {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  region: FieldRegion;
  forceE: Vec2;
  forceB: Vec2;
  force: Vec2;
  acceleration: Vec2;
  speed: number;
  kineticEnergyJ: number;
  workJ: number;
  energyResidualJ: number;
  segmentIndex: number;
}

export interface SegmentedSolution {
  input: SegmentedFieldInput;
  segments: SegmentedFieldSegment[];
  events: SegmentedEvent[];
  durationS: number;
  finalState: SegmentedState;
  issue: string | null;
  eventLimited: boolean;
  windowEnded: boolean;
}

const EPS = 1e-10;
const GEOMETRY = 1e-10;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function finiteVec(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function normalizeInput(input: SegmentedFieldInput): SegmentedFieldInput {
  return {
    massKg: Number.isFinite(input.massKg) && input.massKg > 0 ? input.massKg : 1,
    chargeC: Number.isFinite(input.chargeC) ? input.chargeC : 0,
    dM: Number.isFinite(input.dM) && input.dM > 0 ? input.dM : 1,
    Ex: Number.isFinite(input.Ex) ? input.Ex : 0,
    Ey: Number.isFinite(input.Ey) ? input.Ey : 0,
    Bz: Number.isFinite(input.Bz) ? input.Bz : 0,
    initialPosition: finiteVec(input.initialPosition) ? { ...input.initialPosition } : { x: 0, y: 0 },
    initialVelocity: finiteVec(input.initialVelocity) ? { ...input.initialVelocity } : { x: 0, y: 0 },
    maxTimeS: Number.isFinite(input.maxTimeS) ? Math.max(0.1, Math.min(120, input.maxTimeS!)) : 12,
    maxEvents: Number.isFinite(input.maxEvents) ? Math.max(1, Math.min(500, Math.floor(input.maxEvents!))) : 80,
  };
}

function inputIssue(input: SegmentedFieldInput): string | null {
  if (
    !Number.isFinite(input.massKg) ||
    !Number.isFinite(input.chargeC) ||
    !Number.isFinite(input.dM) ||
    !Number.isFinite(input.Ex) ||
    !Number.isFinite(input.Ey) ||
    !Number.isFinite(input.Bz) ||
    !finiteVec(input.initialPosition) ||
    !finiteVec(input.initialVelocity)
  ) {
    return '输入包含非有限数值，已采用安全值。';
  }
  if (input.massKg <= 0) return '质量必须为正数。';
  if (input.dM <= 0) return '电场区域宽度 d 必须为正数。';
  if (input.initialPosition.x < -input.dM) {
    // This is a valid free-region start; keep the case for completeness.
  }
  return null;
}

function classifyInitial(input: SegmentedFieldInput): FieldRegion {
  const x = input.initialPosition.x;
  const vx = input.initialVelocity.x;
  const tol = GEOMETRY * Math.max(1, input.dM, Math.abs(x));
  if (Math.abs(x + input.dM) <= tol) return vx < -1e-12 ? 'free' : 'electric';
  if (Math.abs(x) <= tol) return vx < -1e-12 ? 'electric' : 'magnetic';
  if (x < -input.dM) return 'free';
  if (x < 0) return 'electric';
  return 'magnetic';
}

function accelerationFor(input: SegmentedFieldInput, region: FieldRegion): Vec2 {
  if (region !== 'electric') return { x: 0, y: 0 };
  return {
    x: (input.chargeC * input.Ex) / input.massKg,
    y: (input.chargeC * input.Ey) / input.massKg,
  };
}

function forcesFor(input: SegmentedFieldInput, region: FieldRegion, velocity: Vec2): { forceE: Vec2; forceB: Vec2 } {
  const forceE = region === 'electric'
    ? { x: input.chargeC * input.Ex, y: input.chargeC * input.Ey }
    : { x: 0, y: 0 };
  const forceB = region === 'magnetic'
    ? { x: input.chargeC * velocity.y * input.Bz, y: -input.chargeC * velocity.x * input.Bz }
    : { x: 0, y: 0 };
  return { forceE, forceB };
}

function segmentState(segment: SegmentedFieldSegment, timeS: number): {
  position: Vec2;
  velocity: Vec2;
  workJ: number;
} {
  const dt = Math.max(0, Math.min(segment.endTimeS - segment.startTimeS, timeS - segment.startTimeS));
  if (segment.kind === 'line') {
    return {
      position: add(segment.startPosition, scale(segment.startVelocity, dt)),
      velocity: segment.startVelocity,
      workJ: segment.workAtStartJ,
    };
  }
  if (segment.kind === 'quadratic') {
    const a = segment.acceleration;
    return {
      position: add(segment.startPosition, add(scale(segment.startVelocity, dt), scale(a, 0.5 * dt * dt))),
      velocity: add(segment.startVelocity, scale(a, dt)),
      workJ: segment.workAtStartJ + segment.startPosition.x * 0, // replaced by caller for E only
    };
  }
  const omega = segment.omegaRadPerS;
  if (Math.abs(omega) < 1e-14 || !segment.center) {
    return {
      position: add(segment.startPosition, scale(segment.startVelocity, dt)),
      velocity: segment.startVelocity,
      workJ: segment.workAtStartJ,
    };
  }
  const rotatedVelocity = rotate(segment.startVelocity, omega * dt);
  const radial = rotate({
    x: segment.startPosition.x - segment.center.x,
    y: segment.startPosition.y - segment.center.y,
  }, omega * dt);
  return {
    position: { x: segment.center.x + radial.x, y: segment.center.y + radial.y },
    velocity: rotatedVelocity,
    workJ: segment.workAtStartJ,
  };
}

function makeSegment(
  input: SegmentedFieldInput,
  region: FieldRegion,
  startTimeS: number,
  endTimeS: number,
  startPosition: Vec2,
  startVelocity: Vec2,
  workAtStartJ: number,
): SegmentedFieldSegment {
  const acceleration = accelerationFor(input, region);
  if (region === 'electric') {
    return {
      region,
      kind: Math.abs(acceleration.x) + Math.abs(acceleration.y) < 1e-15 ? 'line' : 'quadratic',
      startTimeS,
      endTimeS,
      startPosition,
      startVelocity,
      acceleration,
      omegaRadPerS: 0,
      center: null,
      radiusM: null,
      workAtStartJ,
    };
  }
  if (region === 'magnetic') {
    const omega = -(input.chargeC * input.Bz) / input.massKg;
    if (Math.abs(omega) < 1e-14) {
      return {
        region,
        kind: 'line',
        startTimeS,
        endTimeS,
        startPosition,
        startVelocity,
        acceleration: { x: 0, y: 0 },
        omegaRadPerS: 0,
        center: null,
        radiusM: null,
        workAtStartJ,
      };
    }
    const center = {
      x: startPosition.x - startVelocity.y / omega,
      y: startPosition.y + startVelocity.x / omega,
    };
    return {
      region,
      kind: 'arc',
      startTimeS,
      endTimeS,
      startPosition,
      startVelocity,
      acceleration: { x: 0, y: 0 },
      omegaRadPerS: omega,
      center,
      radiusM: length(startVelocity) / Math.abs(omega),
      workAtStartJ,
    };
  }
  return {
    region,
    kind: 'line',
    startTimeS,
    endTimeS,
    startPosition,
    startVelocity,
    acceleration: { x: 0, y: 0 },
    omegaRadPerS: 0,
    center: null,
    radiusM: null,
    workAtStartJ,
  };
}

function electricWork(input: SegmentedFieldInput, from: Vec2, to: Vec2): number {
  return input.chargeC * (input.Ex * (to.x - from.x) + input.Ey * (to.y - from.y));
}

interface BoundaryCandidate {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  kind: 'crossing' | 'tangent';
  toRegion: FieldRegion;
  explanation: string;
}

function electricBoundaryCandidate(
  input: SegmentedFieldInput,
  startTimeS: number,
  position: Vec2,
  velocity: Vec2,
  maxTimeS: number,
): BoundaryCandidate | null {
  const ax = (input.chargeC * input.Ex) / input.massKg;
  const vx = velocity.x;
  const epsilon = 1e-9;
  const targets: Array<{ x: number; direction: -1 | 1; to: FieldRegion; label: string }> = [
    { x: -input.dM, direction: -1, to: 'free', label: '离开电场进入自由区' },
    { x: 0, direction: 1, to: 'magnetic', label: '离开电场进入磁场' },
  ];
  let best: BoundaryCandidate | null = null;
  for (const target of targets) {
    const roots: number[] = [];
    if (Math.abs(ax) < 1e-14) {
      if (Math.abs(vx) > 1e-14) roots.push((target.x - position.x) / vx);
    } else {
      const dx = target.x - position.x;
      const disc = vx * vx + 2 * ax * dx;
      if (disc >= -1e-12) {
        const root = Math.sqrt(Math.max(0, disc));
        roots.push((-vx + root) / ax, (-vx - root) / ax);
      }
    }
    for (const root of roots) {
      if (!Number.isFinite(root) || root <= EPS) continue;
      const absolute = startTimeS + root;
      if (absolute > maxTimeS + 1e-12) continue;
      const vAt = vx + ax * root;
      if (vAt * target.direction <= epsilon) continue;
      if (best === null || absolute < best.timeS) {
        const pAt = {
          x: position.x + vx * root + 0.5 * ax * root * root,
          y: position.y + velocity.y * root + 0.5 * ((input.chargeC * input.Ey) / input.massKg) * root * root,
        };
        best = {
          timeS: absolute,
          position: pAt,
          velocity: { x: vAt, y: velocity.y + ((input.chargeC * input.Ey) / input.massKg) * root },
          kind: 'crossing',
          toRegion: target.to,
          explanation: target.label,
        };
      }
    }
  }
  return best;
}

function freeBoundaryCandidate(
  input: SegmentedFieldInput,
  startTimeS: number,
  position: Vec2,
  velocity: Vec2,
  maxTimeS: number,
): BoundaryCandidate | null {
  if (velocity.x <= 1e-12) return null;
  const time = (-input.dM - position.x) / velocity.x;
  if (!Number.isFinite(time) || time <= EPS) return null;
  const absolute = startTimeS + time;
  if (absolute > maxTimeS + 1e-12) return null;
  return {
    timeS: absolute,
    position: { x: -input.dM, y: position.y + velocity.y * time },
    velocity: { ...velocity },
    kind: 'crossing',
    toRegion: 'electric',
    explanation: '从自由区进入电场区',
  };
}

function magneticBoundary(
  input: SegmentedFieldInput,
  startTimeS: number,
  position: Vec2,
  velocity: Vec2,
  maxTimeS: number,
): { crossing: BoundaryCandidate | null; tangent: BoundaryCandidate | null } {
  const omega = -(input.chargeC * input.Bz) / input.massKg;
  if (Math.abs(omega) < 1e-14) {
    if (velocity.x < -1e-12) {
      const time = -position.x / velocity.x;
      if (Number.isFinite(time) && time > EPS && startTimeS + time <= maxTimeS + 1e-12) {
        return {
          crossing: {
            timeS: startTimeS + time,
            position: { x: 0, y: position.y + velocity.y * time },
            velocity: { ...velocity },
            kind: 'crossing',
            toRegion: 'electric',
            explanation: '无磁场直线运动离开磁场区',
          },
          tangent: null,
        };
      }
    }
    return { crossing: null, tangent: null };
  }
  const center = {
    x: position.x - velocity.y / omega,
    y: position.y + velocity.x / omega,
  };
  const radius = length(velocity) / Math.abs(omega);
  const discriminant = radius * radius - center.x * center.x;
  if (discriminant < -1e-9) return { crossing: null, tangent: null };
  const root = Math.sqrt(Math.max(0, discriminant));
  const yValues = [center.y + root, center.y - root];
  let crossing: BoundaryCandidate | null = null;
  let tangent: BoundaryCandidate | null = null;
  const startAngle = Math.atan2(position.y - center.y, position.x - center.x);
  for (const y of yValues) {
    const angle = Math.atan2(y - center.y, -center.x);
    const signedDelta = (angle - startAngle) * Math.sign(omega);
    let delta = signedDelta % (2 * Math.PI);
    if (delta < 0) delta += 2 * Math.PI;
    if (delta <= 1e-9) delta += 2 * Math.PI;
    const time = delta / Math.abs(omega);
    if (!Number.isFinite(time) || time <= EPS) continue;
    const absolute = startTimeS + time;
    if (absolute > maxTimeS + 1e-12) continue;
    const segment = makeSegment(input, 'magnetic', startTimeS, absolute, position, velocity, 0);
    const state = segmentState(segment, absolute);
    const p = { x: 0, y: state.position.y };
    const v = state.velocity;
    if (v.x < -1e-9) {
      if (!crossing || absolute < crossing.timeS) {
        crossing = {
          timeS: absolute,
          position: p,
          velocity: v,
          kind: 'crossing',
          toRegion: 'electric',
          explanation: '磁场圆周回到 x=0 并向左离开磁场',
        };
      }
    } else if (Math.abs(v.x) <= 1e-8) {
      if (!tangent || absolute < tangent.timeS) {
        tangent = {
          timeS: absolute,
          position: p,
          velocity: v,
          kind: 'tangent',
          toRegion: 'magnetic',
          explanation: '轨迹与磁场边界相切，未穿越边界',
        };
      }
    }
  }
  return { crossing, tangent };
}

function buildFinalState(
  input: SegmentedFieldInput,
  segments: SegmentedFieldSegment[],
  timeS: number,
): SegmentedState {
  return stateFromSegments(input, segments, timeS);
}

function stateFromSegments(
  input: SegmentedFieldInput,
  segments: SegmentedFieldSegment[],
  timeS: number,
): SegmentedState {
  const t = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
  let index = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    if (t < segments[i].endTimeS - 1e-12) {
      index = i;
      break;
    }
    if (i + 1 < segments.length && t <= segments[i].endTimeS + 1e-12) {
      index = i + 1;
      break;
    }
  }
  const segment = segments[Math.max(0, Math.min(segments.length - 1, index))];
  const raw = segmentState(segment, t);
  const inElectric = segment.region === 'electric';
  const workJ = raw.workJ + (inElectric ? electricWork(input, segment.startPosition, raw.position) : 0);
  const { forceE, forceB } = forcesFor(input, segment.region, raw.velocity);
  const force = { x: nz(forceE.x + forceB.x), y: nz(forceE.y + forceB.y) };
  const speed = length(raw.velocity);
  return {
    timeS: t,
    position: raw.position,
    velocity: raw.velocity,
    region: segment.region,
    forceE,
    forceB,
    force,
    acceleration: {
      x: force.x / input.massKg,
      y: force.y / input.massKg,
    },
    speed,
    kineticEnergyJ: 0.5 * input.massKg * speed * speed,
    workJ,
    energyResidualJ: 0.5 * input.massKg * speed * speed
      - 0.5 * input.massKg * length(input.initialVelocity) ** 2
      - workJ,
    segmentIndex: Math.max(0, Math.min(segments.length - 1, index)),
  };
}

export function solveSegmentedTrajectory(inputValue: SegmentedFieldInput): SegmentedSolution {
  const input = normalizeInput(inputValue);
  const issue = inputIssue(inputValue);
  const maxTime = input.maxTimeS ?? 12;
  const maxEvents = input.maxEvents ?? 80;
  let region = classifyInitial(input);
  let time = 0;
  let position = { ...input.initialPosition };
  let velocity = { ...input.initialVelocity };
  let work = 0;
  const segments: SegmentedFieldSegment[] = [];
  const events: SegmentedEvent[] = [
    {
      timeS: 0,
      kind: 'start',
      fromRegion: region,
      toRegion: region,
      position: { ...position },
      velocity: { ...velocity },
      explanation: `从${region === 'free' ? '自由区' : region === 'electric' ? '电场区' : '磁场区'}出发`,
    },
  ];
  let eventLimited = false;
  let windowEnded = false;

  for (let iteration = 0; iteration < maxEvents; iteration++) {
    if (time >= maxTime - EPS) {
      windowEnded = true;
      events.push({
        timeS: maxTime,
        kind: 'window-end',
        fromRegion: region,
        toRegion: region,
        position: { ...position },
        velocity: { ...velocity },
        explanation: '达到演示时间窗口',
      });
      break;
    }
    const freeCandidate = region === 'free'
      ? freeBoundaryCandidate(input, time, position, velocity, maxTime)
      : null;
    const electricCandidate = region === 'electric'
      ? electricBoundaryCandidate(input, time, position, velocity, maxTime)
      : null;
    const magneticCandidates = region === 'magnetic'
      ? magneticBoundary(input, time, position, velocity, maxTime)
      : { crossing: null, tangent: null };
    const boundary = freeCandidate ?? electricCandidate ?? magneticCandidates.crossing;
    const endTime = boundary ? Math.min(maxTime, boundary.timeS) : maxTime;
    if (endTime <= time + EPS) {
      // Defensive guard: never emit zero-duration crossing loops.
      eventLimited = true;
      events.push({
        timeS: time,
        kind: 'event-limit',
        fromRegion: region,
        toRegion: region,
        position: { ...position },
        velocity: { ...velocity },
        explanation: '边界事件无法继续推进，已停止求解',
      });
      break;
    }
    const segment = makeSegment(input, region, time, endTime, position, velocity, work);
    segments.push(segment);

    if (region === 'electric') {
      const ax = (input.chargeC * input.Ex) / input.massKg;
      if (Math.abs(ax) > 1e-14) {
        const turnTime = time - velocity.x / ax;
        if (turnTime > time + EPS && turnTime < endTime - EPS) {
          const turnState = segmentState(segment, turnTime);
          events.push({
            timeS: turnTime,
            kind: 'turn-around',
            fromRegion: 'electric',
            toRegion: 'electric',
            position: turnState.position,
            velocity: turnState.velocity,
            explanation: '电场中速度的 x 分量减为零并折返',
          });
        }
      }
    }

    if (region === 'magnetic' && magneticCandidates.tangent && !boundary) {
      events.push({
        ...magneticCandidates.tangent,
        kind: 'tangent',
        fromRegion: 'magnetic',
      });
    }

    if (boundary && boundary.kind === 'crossing') {
      const atBoundary = segmentState(segment, boundary.timeS);
      if (region === 'electric') work += electricWork(input, segment.startPosition, atBoundary.position);
      events.push({
        timeS: boundary.timeS,
        kind: 'crossing',
        fromRegion: region,
        toRegion: boundary.toRegion,
        position: atBoundary.position,
        velocity: atBoundary.velocity,
        explanation: boundary.explanation,
      });
      time = boundary.timeS;
      position = atBoundary.position;
      velocity = atBoundary.velocity;
      region = boundary.toRegion;
      continue;
    }

    if (endTime >= maxTime - EPS) {
      time = maxTime;
      position = segmentState(segment, maxTime).position;
      velocity = segmentState(segment, maxTime).velocity;
      windowEnded = true;
      events.push({
        timeS: maxTime,
        kind: 'window-end',
        fromRegion: region,
        toRegion: region,
        position: { ...position },
        velocity: { ...velocity },
        explanation: '达到演示时间窗口',
      });
      break;
    }

    time = endTime;
    position = segmentState(segment, endTime).position;
    velocity = segmentState(segment, endTime).velocity;
    if (iteration === maxEvents - 1) {
      eventLimited = true;
      events.push({
        timeS: time,
        kind: 'event-limit',
        fromRegion: region,
        toRegion: region,
        position: { ...position },
        velocity: { ...velocity },
        explanation: '达到事件数量上限',
      });
    }
  }

  if (!windowEnded && !eventLimited) {
    eventLimited = true;
    events.push({
      timeS: time,
      kind: 'event-limit',
      fromRegion: region,
      toRegion: region,
      position: { ...position },
      velocity: { ...velocity },
      explanation: '达到事件数量上限',
    });
  }

  if (segments.length === 0) {
    const segment = makeSegment(input, region, 0, maxTime, position, velocity, 0);
    segments.push(segment);
    time = maxTime;
    position = segmentState(segment, maxTime).position;
    velocity = segmentState(segment, maxTime).velocity;
  }
  const durationS = Math.min(maxTime, Math.max(time, 0));
  const uniqueEvents = [...new Map(events.map((event) => [`${event.kind}-${event.timeS.toFixed(10)}-${event.toRegion}`, event])).values()]
    .sort((a, b) => a.timeS - b.timeS);
  const finalState = buildFinalState(input, segments, durationS);
  const finalIssue = eventLimited
    ? `${issue ? `${issue} ` : ''}达到事件上限，已停止求解。`
    : issue;
  return {
    input,
    segments,
    events: uniqueEvents,
    durationS,
    finalState,
    issue: finalIssue,
    eventLimited,
    windowEnded,
  };
}

export function segmentedStateAt(solution: SegmentedSolution, timeS: number): SegmentedState {
  const t = Number.isFinite(timeS) ? Math.max(0, Math.min(solution.durationS, timeS)) : 0;
  return stateFromSegments(solution.input, solution.segments, t);
}

export function sampleSegmentedTrajectory(
  solution: SegmentedSolution,
  durationS: number,
  count = 180,
): Vec2[] {
  const duration = Math.max(0, Math.min(durationS, solution.durationS));
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let index = 0; index <= n; index++) {
    points.push(segmentedStateAt(solution, (duration * index) / n).position);
  }
  return points;
}
