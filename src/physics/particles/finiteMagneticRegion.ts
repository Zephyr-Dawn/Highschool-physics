import {
  add,
  clamp,
  dot,
  length,
  rotate,
  scale,
  type Vec2,
} from '../core/vec2';

export type FiniteFieldGeometry =
  | { kind: 'strip'; xMin: number; xMax: number }
  | { kind: 'rectangle'; xMin: number; xMax: number; yMin: number; yMax: number };

export interface FiniteFieldInput {
  geometry: FiniteFieldGeometry;
  Bz: number;
  startPosition: Vec2;
  initialVelocity: Vec2;
  chargeC: number;
  massKg: number;
  timeHorizonS?: number;
  maxEvents?: number;
}

export type FiniteEventKind =
  | 'entry'
  | 'exit'
  | 'crossing'
  | 'tangent'
  | 'corner-contact'
  | 'window-end'
  | 'event-limit';

export interface FiniteFieldEvent {
  timeS: number;
  kind: FiniteEventKind;
  position: Vec2;
  velocity: Vec2;
  boundaryIds: string[];
  fromInside: boolean;
  toInside: boolean;
  explanation: string;
}

export interface FiniteFieldSegment {
  kind: 'line' | 'arc';
  inside: boolean;
  startTimeS: number;
  endTimeS: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  center: Vec2 | null;
  radiusM: number | null;
  omegaRadPerS: number;
  Bz: number;
}

export type FiniteFieldStatus =
  | 'entered-and-exited'
  | 'starts-inside-and-exited'
  | 'entered-no-exit'
  | 'starts-inside-no-exit'
  | 'tangent-no-exit'
  | 'tangent-no-entry'
  | 'no-entry'
  | 'no-magnetic-field'
  | 'stationary'
  | 'invalid';

export interface FiniteFieldSolution {
  input: FiniteFieldInput;
  geometry: FiniteFieldGeometry;
  status: FiniteFieldStatus;
  statusExplanation: string;
  issue: string | null;
  initialRegion: 'inside' | 'outside' | 'boundary' | 'invalid';
  launchPoint: Vec2;
  entry: FiniteFieldEvent | null;
  exit: FiniteFieldEvent | null;
  tangent: FiniteFieldEvent | null;
  events: FiniteFieldEvent[];
  segments: FiniteFieldSegment[];
  entryTimeS: number | null;
  exitTimeS: number | null;
  fieldTimeS: number | null;
  deflectionDegrees: number | null;
  radiusM: number | null;
  periodS: number | null;
  turn: 'clockwise' | 'counterclockwise' | null;
  eventLimited: boolean;
  windowEnded: boolean;
  durationS: number;
}

export interface FiniteFieldState {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  force: Vec2;
  speedMps: number;
  region: 'inside' | 'outside' | 'boundary';
  inField: boolean;
  phase: 'before-entry' | 'in-field' | 'after-exit' | 'outside' | 'stationary' | 'invalid';
  segmentIndex: number;
}

export interface BoundarySegment {
  id: string;
  axis: 'x' | 'y';
  fixed: number;
  min: number;
  max: number;
  outward: Vec2;
}

interface BoundaryCandidate {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  boundaryIds: string[];
  toInside: boolean;
  kind: 'entry' | 'exit' | 'tangent' | 'corner-contact';
  explanation: string;
}

const TWO_PI = Math.PI * 2;
const DEFAULT_HORIZON = 8;
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

function geometryScale(geometry: FiniteFieldGeometry): number {
  return Math.max(1e-9, geometry.xMax - geometry.xMin, geometry.kind === 'rectangle' ? geometry.yMax - geometry.yMin : 0);
}

function geometryTolerance(geometry: FiniteFieldGeometry): number {
  // A very wide strip is used as a half-plane limit; do not let its full
  // width inflate the local boundary tolerance.
  return Math.max(1e-10, Math.min(geometryScale(geometry), 10) * 1e-8);
}

function timeTolerance(horizon: number): number {
  return Math.max(1e-11, Math.abs(horizon) * 1e-10);
}

function probeStep(geometry: FiniteFieldGeometry, speed: number): number {
  return Math.max(1e-10, Math.min(1e-4, (geometryScale(geometry) / Math.max(speed, MIN_SPEED)) * 1e-7));
}

function validGeometry(geometry: FiniteFieldGeometry): boolean {
  if (!Number.isFinite(geometry.xMin) || !Number.isFinite(geometry.xMax) || !(geometry.xMax > geometry.xMin)) return false;
  if (geometry.kind === 'rectangle') {
    return Number.isFinite(geometry.yMin) && Number.isFinite(geometry.yMax) && geometry.yMax > geometry.yMin;
  }
  return true;
}

export function finiteFieldContains(
  geometry: FiniteFieldGeometry,
  point: Vec2,
  tolerance = 0,
): boolean {
  if (!finiteVec(point)) return false;
  if (point.x < geometry.xMin - tolerance || point.x > geometry.xMax + tolerance) return false;
  if (geometry.kind === 'rectangle' && (point.y < geometry.yMin - tolerance || point.y > geometry.yMax + tolerance)) {
    return false;
  }
  return true;
}

function classifyPoint(
  geometry: FiniteFieldGeometry,
  point: Vec2,
  tolerance: number,
): 'inside' | 'outside' | 'boundary' {
  if (!finiteFieldContains(geometry, point, tolerance)) return 'outside';
  const distances = [
    Math.abs(point.x - geometry.xMin),
    Math.abs(point.x - geometry.xMax),
    ...(geometry.kind === 'rectangle'
      ? [Math.abs(point.y - geometry.yMin), Math.abs(point.y - geometry.yMax)]
      : []),
  ];
  return Math.min(...distances) <= tolerance ? 'boundary' : 'inside';
}

function boundarySegments(geometry: FiniteFieldGeometry): BoundarySegment[] {
  if (geometry.kind === 'strip') {
    return [
      { id: 'left', axis: 'x', fixed: geometry.xMin, min: -Infinity, max: Infinity, outward: { x: -1, y: 0 } },
      { id: 'right', axis: 'x', fixed: geometry.xMax, min: -Infinity, max: Infinity, outward: { x: 1, y: 0 } },
    ];
  }
  return [
    { id: 'left', axis: 'x', fixed: geometry.xMin, min: geometry.yMin, max: geometry.yMax, outward: { x: -1, y: 0 } },
    { id: 'right', axis: 'x', fixed: geometry.xMax, min: geometry.yMin, max: geometry.yMax, outward: { x: 1, y: 0 } },
    { id: 'bottom', axis: 'y', fixed: geometry.yMin, min: geometry.xMin, max: geometry.xMax, outward: { x: 0, y: -1 } },
    { id: 'top', axis: 'y', fixed: geometry.yMax, min: geometry.xMin, max: geometry.xMax, outward: { x: 0, y: 1 } },
  ];
}

function withinSegment(segment: BoundarySegment, point: Vec2, tolerance: number): boolean {
  const value = segment.axis === 'x' ? point.y : point.x;
  return value >= segment.min - tolerance && value <= segment.max + tolerance;
}

function lineBoundaryTime(
  segment: BoundarySegment,
  position: Vec2,
  velocity: Vec2,
): number | null {
  const normalSpeed = segment.axis === 'x' ? velocity.x : velocity.y;
  if (Math.abs(normalSpeed) < 1e-14) return null;
  const coordinate = segment.axis === 'x' ? position.x : position.y;
  const time = (segment.fixed - coordinate) / normalSpeed;
  if (!Number.isFinite(time) || time <= 0) return null;
  const point = add(position, scale(velocity, time));
  return withinSegment(segment, point, geometryTolerance({ kind: 'strip', xMin: segment.fixed - 1, xMax: segment.fixed + 1 }) + 1e-8)
    ? time
    : null;
}

function circleBoundaryPoints(
  center: Vec2,
  radius: number,
  segment: BoundarySegment,
  tolerance: number,
): Array<{ point: Vec2; tangent: boolean }> {
  const centerCoordinate = segment.axis === 'x' ? center.x : center.y;
  const difference = segment.fixed - centerCoordinate;
  const discriminant = radius * radius - difference * difference;
  if (discriminant < -tolerance * Math.max(1, radius)) return [];
  const roots = discriminant <= tolerance * Math.max(1, radius)
    ? [0]
    : [Math.sqrt(Math.max(0, discriminant)), -Math.sqrt(Math.max(0, discriminant))];
  const tangent = roots.length === 1;
  const points: Array<{ point: Vec2; tangent: boolean }> = [];
  for (const root of roots) {
    const point =
      segment.axis === 'x'
        ? { x: segment.fixed, y: center.y + root }
        : { x: center.x + root, y: segment.fixed };
    if (withinSegment(segment, point, tolerance)) points.push({ point, tangent });
  }
  return points;
}

function linePositionAt(position: Vec2, velocity: Vec2, startTime: number, time: number): Vec2 {
  return add(position, scale(velocity, time - startTime));
}

function arcPositionAt(
  center: Vec2,
  omega: number,
  startPosition: Vec2,
  startTime: number,
  time: number,
): Vec2 {
  const angle = omega * (time - startTime);
  return add(center, rotate({ x: startPosition.x - center.x, y: startPosition.y - center.y }, angle));
}

function arcVelocityAt(
  omega: number,
  center: Vec2,
  position: Vec2,
): Vec2 {
  const radial = { x: position.x - center.x, y: position.y - center.y };
  return { x: -omega * radial.y, y: omega * radial.x };
}

function arcCenter(position: Vec2, velocity: Vec2, omega: number): Vec2 {
  return { x: position.x - velocity.y / omega, y: position.y + velocity.x / omega };
}

function segmentFor(
  inside: boolean,
  Bz: number,
  chargeC: number,
  massKg: number,
  startTimeS: number,
  endTimeS: number,
  position: Vec2,
  velocity: Vec2,
): FiniteFieldSegment {
  const omega = inside ? (-chargeC * Bz) / massKg : 0;
  const speed = length(velocity);
  const magnetic = inside && Math.abs(omega) >= MIN_OMEGA && speed > MIN_SPEED;
  return {
    kind: magnetic ? 'arc' : 'line',
    inside,
    startTimeS,
    endTimeS,
    startPosition: { ...position },
    startVelocity: { ...velocity },
    center: magnetic ? arcCenter(position, velocity, omega) : null,
    radiusM: magnetic ? speed / Math.abs(omega) : null,
    omegaRadPerS: magnetic ? omega : 0,
    Bz,
  };
}

function stateInSegment(segment: FiniteFieldSegment, timeS: number): { position: Vec2; velocity: Vec2 } {
  if (segment.kind === 'line' || !segment.center || segment.radiusM === null) {
    return {
      position: linePositionAt(segment.startPosition, segment.startVelocity, segment.startTimeS, timeS),
      velocity: { ...segment.startVelocity },
    };
  }
  return {
    position: arcPositionAt(segment.center, segment.omegaRadPerS, segment.startPosition, segment.startTimeS, timeS),
    velocity: arcVelocityAt(segment.omegaRadPerS, segment.center, arcPositionAt(
      segment.center,
      segment.omegaRadPerS,
      segment.startPosition,
      segment.startTimeS,
      timeS,
    )),
  };
}

function mergeCandidate(
  candidates: BoundaryCandidate[],
  candidate: BoundaryCandidate,
  tolerance: number,
): void {
  const existing = candidates.find((item) => Math.abs(item.timeS - candidate.timeS) <= tolerance);
  if (!existing) {
    candidates.push(candidate);
    return;
  }
  existing.boundaryIds = [...new Set([...existing.boundaryIds, ...candidate.boundaryIds])];
  if (!candidate.toInside) existing.toInside = false;
  if (candidate.kind === 'entry') existing.kind = 'entry';
  if (candidate.kind === 'exit') existing.kind = existing.boundaryIds.length > 1 ? 'corner-contact' : 'exit';
  if (candidate.kind === 'corner-contact') existing.kind = 'corner-contact';
  if (candidate.kind === 'tangent' && existing.boundaryIds.length <= 1) existing.kind = 'tangent';
}

function candidateFromPoint(options: {
  geometry: FiniteFieldGeometry;
  inside: boolean;
  magnetic: boolean;
  Bz: number;
  chargeC: number;
  massKg: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  startTime: number;
  timeS: number;
  point: Vec2;
  boundaryIds: string[];
  tangentPoint?: boolean;
  probeS: number;
}): BoundaryCandidate {
  const {
    geometry,
    inside,
    magnetic,
    Bz,
    chargeC,
    massKg,
    startPosition,
    startVelocity,
    startTime,
    timeS,
    point,
    boundaryIds,
    probeS,
  } = options;
  const omega = inside && magnetic ? (-chargeC * Bz) / massKg : 0;
  const center = inside && magnetic ? arcCenter(startPosition, startVelocity, omega) : null;
  const velocity = inside && magnetic && center
    ? arcVelocityAt(omega, center, point)
    : { ...startVelocity };
  const afterPosition = inside && magnetic && center
    ? arcPositionAt(center, omega, startPosition, startTime, timeS + probeS)
    : linePositionAt(startPosition, startVelocity, startTime, timeS + probeS);
  const after = finiteFieldContains(geometry, afterPosition, 0);
  if (inside) {
    return {
      timeS,
      position: point,
      velocity,
      boundaryIds,
      toInside: after,
      kind: after ? 'tangent' : boundaryIds.length > 1 ? 'corner-contact' : 'exit',
      explanation: after
        ? '轨迹接触边界后仍留在场内；切触不等同于出场。'
        : '轨迹从场内穿过边界离开磁场区域；位置与速度连续。',
    };
  }
  return {
    timeS,
    position: point,
    velocity,
    boundaryIds,
    toInside: after,
    kind: after ? 'entry' : 'corner-contact',
    explanation: after
      ? '从场外沿直线或圆弧进入磁场区域；位置与速度连续。'
      : '轨迹只接触边界，没有进入磁场区域。',
  };
}

function findNextTransition(options: {
  geometry: FiniteFieldGeometry;
  inside: boolean;
  magnetic: boolean;
  Bz: number;
  chargeC: number;
  massKg: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  startTime: number;
  horizon: number;
  probeS: number;
}): { transition: BoundaryCandidate | null; tangents: BoundaryCandidate[] } {
  const { geometry, inside, magnetic, Bz, chargeC, massKg, startPosition, startVelocity, startTime, horizon, probeS } = options;
  const segments = boundarySegments(geometry);
  const tolerance = geometryTolerance(geometry);
  const timeTol = timeTolerance(horizon);
  const candidates: BoundaryCandidate[] = [];

  if (!inside || !magnetic) {
    for (const boundary of segments) {
      const timeDelta = lineBoundaryTime(boundary, startPosition, startVelocity);
      if (timeDelta === null) continue;
      const timeS = startTime + timeDelta;
      if (timeS <= startTime + timeTol || timeS > horizon + timeTol) continue;
      const point = linePositionAt(startPosition, startVelocity, startTime, timeS);
      if (!withinSegment(boundary, point, tolerance)) continue;
      mergeCandidate(candidates, candidateFromPoint({
        geometry,
        inside,
        magnetic: false,
        Bz,
        chargeC,
        massKg,
        startPosition,
        startVelocity,
        startTime,
        timeS,
        point,
        boundaryIds: [boundary.id],
        probeS,
      }), timeTol);
    }
  } else {
    const omega = (-chargeC * Bz) / massKg;
    const radius = length(startVelocity) / Math.abs(omega);
    const center = arcCenter(startPosition, startVelocity, omega);
    const startAngle = angleOf({ x: startPosition.x - center.x, y: startPosition.y - center.y });
    for (const boundary of segments) {
      const points = circleBoundaryPoints(center, radius, boundary, tolerance);
      for (const item of points) {
        const angle = angleOf({ x: item.point.x - center.x, y: item.point.y - center.y });
        const delta = wrapAngle(Math.sign(omega) * (angle - startAngle));
        if (delta <= 1e-10 || TWO_PI - delta <= 1e-10) continue;
        const timeS = startTime + delta / Math.abs(omega);
        if (timeS <= startTime + timeTol || timeS > horizon + timeTol) continue;
        mergeCandidate(candidates, candidateFromPoint({
          geometry,
          inside,
          magnetic,
          Bz,
          chargeC,
          massKg,
          startPosition,
          startVelocity,
          startTime,
          timeS,
          point: item.point,
          boundaryIds: [boundary.id],
          tangentPoint: item.tangent,
          probeS,
        }), timeTol);
      }
    }
  }

  candidates.sort((left, right) => left.timeS - right.timeS);
  const transition = candidates.find((candidate) => candidate.toInside !== inside);
  if (transition) {
    const tangents = candidates.filter((candidate) => candidate.timeS < transition.timeS - timeTol && candidate.toInside === inside);
    return { transition, tangents };
  }
  return {
    transition: null,
    tangents: candidates.filter((candidate) => candidate.toInside === inside),
  };
}

function invalidSolution(input: FiniteFieldInput, issue: string): FiniteFieldSolution {
  const safePoint = finiteVec(input?.startPosition) ? { ...input.startPosition } : { x: 0, y: 0 };
  const duration = Number.isFinite(input?.timeHorizonS) ? Math.max(0.1, input.timeHorizonS as number) : DEFAULT_HORIZON;
  return {
    input,
    geometry: input?.geometry ?? { kind: 'strip', xMin: 0, xMax: 1 },
    status: 'invalid',
    statusExplanation: '输入无效，未生成物理轨迹。',
    issue,
    initialRegion: 'invalid',
    launchPoint: safePoint,
    entry: null,
    exit: null,
    tangent: null,
    events: [],
    segments: [{
      kind: 'line',
      inside: false,
      startTimeS: 0,
      endTimeS: duration,
      startPosition: safePoint,
      startVelocity: { x: 0, y: 0 },
      center: null,
      radiusM: null,
      omegaRadPerS: 0,
      Bz: 0,
    }],
    entryTimeS: null,
    exitTimeS: null,
    fieldTimeS: null,
    deflectionDegrees: null,
    radiusM: null,
    periodS: null,
    turn: null,
    eventLimited: false,
    windowEnded: true,
    durationS: duration,
  };
}

function staticSolution(
  input: FiniteFieldInput,
  status: 'stationary' | 'invalid',
  issue: string | null,
  initialRegion: 'inside' | 'outside' | 'boundary' | 'invalid',
  duration: number,
): FiniteFieldSolution {
  const point = finiteVec(input.startPosition) ? { ...input.startPosition } : { x: 0, y: 0 };
  return {
    input,
    geometry: input.geometry,
    status,
    statusExplanation: status === 'stationary' ? '初速度为 0，粒子保持静止。' : '输入无效。',
    issue,
    initialRegion,
    launchPoint: point,
    entry: null,
    exit: null,
    tangent: null,
    events: status === 'stationary'
      ? [{ timeS: 0, kind: 'window-end', position: point, velocity: { x: 0, y: 0 }, boundaryIds: [], fromInside: initialRegion === 'inside', toInside: initialRegion === 'inside', explanation: '静止，无边界事件。' }]
      : [],
    segments: [{
      kind: 'line',
      inside: initialRegion === 'inside',
      startTimeS: 0,
      endTimeS: duration,
      startPosition: point,
      startVelocity: { x: 0, y: 0 },
      center: null,
      radiusM: null,
      omegaRadPerS: 0,
      Bz: input.Bz,
    }],
    entryTimeS: null,
    exitTimeS: null,
    fieldTimeS: initialRegion === 'inside' ? duration : 0,
    deflectionDegrees: null,
    radiusM: null,
    periodS: null,
    turn: null,
    eventLimited: false,
    windowEnded: true,
    durationS: duration,
  };
}

function chooseInitialRegion(options: {
  geometry: FiniteFieldGeometry;
  startPosition: Vec2;
  startVelocity: Vec2;
  Bz: number;
  chargeC: number;
  massKg: number;
  magnetic: boolean;
  probeS: number;
  tolerance: number;
}): { region: 'inside' | 'outside' | 'boundary'; chosenInside: boolean; entryAtZero: boolean } {
  const { geometry, startPosition, startVelocity, Bz, chargeC, massKg, magnetic, probeS, tolerance } = options;
  const classification = classifyPoint(geometry, startPosition, tolerance);
  if (classification === 'inside') return { region: 'inside', chosenInside: true, entryAtZero: false };
  if (classification === 'outside') return { region: 'outside', chosenInside: false, entryAtZero: false };
  const omega = magnetic ? (-chargeC * Bz) / massKg : 0;
  const speed = length(startVelocity);
  const acceleration = magnetic
    ? { x: (chargeC * startVelocity.y * Bz) / massKg, y: (-chargeC * startVelocity.x * Bz) / massKg }
    : { x: 0, y: 0 };
  const velocityTol = Math.max(1e-12, speed * 1e-9);
  const accelerationTol = Math.max(1e-12, speed * Math.abs(omega) * 1e-9);
  const touching = boundarySegments(geometry).filter((boundary) => {
    const distance = boundary.axis === 'x'
      ? Math.abs(startPosition.x - boundary.fixed)
      : Math.abs(startPosition.y - boundary.fixed);
    return distance <= tolerance && withinSegment(boundary, startPosition, tolerance);
  });
  if (touching.length > 0) {
    let inward = false;
    let outward = false;
    for (const boundary of touching) {
      const normalSpeed = dot(startVelocity, boundary.outward);
      const normalAcceleration = dot(acceleration, boundary.outward);
      if (normalSpeed < -velocityTol || (Math.abs(normalSpeed) <= velocityTol && normalAcceleration < -accelerationTol)) inward = true;
      if (normalSpeed > velocityTol || (Math.abs(normalSpeed) <= velocityTol && normalAcceleration > accelerationTol)) outward = true;
    }
    if (inward && !outward) return { region: 'boundary', chosenInside: true, entryAtZero: true };
    if (outward && !inward) return { region: 'boundary', chosenInside: false, entryAtZero: false };
  }
  const center = magnetic && Math.abs(omega) > MIN_OMEGA ? arcCenter(startPosition, startVelocity, omega) : null;
  const insideAfter = center
    ? arcPositionAt(center, omega, startPosition, 0, probeS)
    : linePositionAt(startPosition, startVelocity, 0, probeS);
  const outsideAfter = linePositionAt(startPosition, startVelocity, 0, probeS);
  const insideCandidate = classifyPoint(geometry, insideAfter, tolerance) === 'inside';
  const outsideCandidate = classifyPoint(geometry, outsideAfter, tolerance) === 'outside';
  if (insideCandidate && !outsideCandidate) return { region: 'boundary', chosenInside: true, entryAtZero: true };
  if (!insideCandidate && outsideCandidate) return { region: 'boundary', chosenInside: false, entryAtZero: false };
  if (insideCandidate) return { region: 'boundary', chosenInside: true, entryAtZero: true };
  return { region: 'boundary', chosenInside: false, entryAtZero: false };
}

export function solveFiniteFieldTrajectory(inputValue: FiniteFieldInput): FiniteFieldSolution {
  if (
    !inputValue ||
    !finiteVec(inputValue.startPosition) ||
    !finiteVec(inputValue.initialVelocity) ||
    !Number.isFinite(inputValue.chargeC) ||
    !Number.isFinite(inputValue.Bz) ||
    !Number.isFinite(inputValue.massKg) ||
    !inputValue.geometry ||
    !validGeometry(inputValue.geometry)
  ) {
    return invalidSolution(inputValue, '几何区域、质量、电荷、速度或磁场包含无效值。');
  }
  if (inputValue.massKg <= 0) return invalidSolution(inputValue, '质量必须为正数。');

  const input = inputValue;
  const horizon = Number.isFinite(input.timeHorizonS)
    ? clamp(input.timeHorizonS as number, 0.1, MAX_HORIZON)
    : DEFAULT_HORIZON;
  const maxEvents = Number.isFinite(input.maxEvents) ? Math.max(1, Math.min(100, Math.floor(input.maxEvents as number))) : 24;
  const speed = length(input.initialVelocity);
  if (speed <= MIN_SPEED) {
    const initial = classifyPoint(input.geometry, input.startPosition, geometryTolerance(input.geometry));
    return staticSolution(input, 'stationary', '初速度为 0。', initial, horizon);
  }
  const omega = (-input.chargeC * input.Bz) / input.massKg;
  const magnetic = Math.abs(omega) >= MIN_OMEGA;
  const initialChoice = chooseInitialRegion({
    geometry: input.geometry,
    startPosition: input.startPosition,
    startVelocity: input.initialVelocity,
    Bz: input.Bz,
    chargeC: input.chargeC,
    massKg: input.massKg,
    magnetic,
    probeS: probeStep(input.geometry, speed),
    tolerance: geometryTolerance(input.geometry),
  });
  const initialInside = initialChoice.chosenInside;
  const startTime = 0;
  const startPosition = { ...input.startPosition };
  const startVelocity = { ...input.initialVelocity };
  const events: FiniteFieldEvent[] = [];
  const segments: FiniteFieldSegment[] = [];
  const entryEvent: FiniteFieldEvent | null = initialChoice.entryAtZero
    ? {
        timeS: 0,
        kind: 'entry',
        position: { ...startPosition },
        velocity: { ...startVelocity },
        boundaryIds: boundarySegments(input.geometry).filter((segment) => Math.abs(
          segment.axis === 'x' ? startPosition.x - segment.fixed : startPosition.y - segment.fixed,
        ) <= geometryTolerance(input.geometry)).map((segment) => segment.id),
        fromInside: false,
        toInside: true,
        explanation: '初始点在边界上，前向运动进入区域；从入射点开始场内运动。',
      }
    : null;
  if (entryEvent) events.push(entryEvent);

  let inside = initialInside;
  let time = startTime;
  let position = startPosition;
  let velocity = startVelocity;
  let entry = entryEvent;
  let exit: FiniteFieldEvent | null = null;
  let tangent: FiniteFieldEvent | null = null;
  let eventLimited = false;
  let windowEnded = false;
  let insideTime = 0;
  let firstArcAngle: number | null = null;
  const probeS = probeStep(input.geometry, speed);

  for (let iteration = 0; iteration < maxEvents; iteration++) {
    if (time >= horizon - timeTolerance(horizon)) {
      windowEnded = true;
      break;
    }
    const result = findNextTransition({
      geometry: input.geometry,
      inside,
      magnetic,
      Bz: input.Bz,
      chargeC: input.chargeC,
      massKg: input.massKg,
      startPosition: position,
      startVelocity: velocity,
      startTime: time,
      horizon,
      probeS,
    });
    for (const tangentCandidate of result.tangents) {
      if (!tangent) {
        tangent = {
          timeS: tangentCandidate.timeS,
          kind: 'tangent',
          position: tangentCandidate.position,
          velocity: tangentCandidate.velocity,
          boundaryIds: tangentCandidate.boundaryIds,
          fromInside: inside,
          toInside: inside,
          explanation: tangentCandidate.explanation,
        };
        events.push(tangent);
      }
    }
    const transition = result.transition;
    const segmentEnd = transition ? Math.min(horizon, transition.timeS) : horizon;
    if (segmentEnd <= time + timeTolerance(horizon)) {
      eventLimited = true;
      events.push({
        timeS: time,
        kind: 'event-limit',
        position: { ...position },
        velocity: { ...velocity },
        boundaryIds: [],
        fromInside: inside,
        toInside: inside,
        explanation: '事件无法继续推进，已安全停止求解。',
      });
      break;
    }
    const segment = segmentFor(inside, input.Bz, input.chargeC, input.massKg, time, segmentEnd, position, velocity);
    segments.push(segment);
    if (inside) insideTime += segmentEnd - time;
    if (segment.kind === 'arc' && firstArcAngle === null) {
      const end = stateInSegment(segment, segmentEnd);
      firstArcAngle = Math.abs(Math.acos(clamp(dot(velocity, end.velocity) / (speed * speed), -1, 1)));
    }
    if (!transition) {
      time = horizon;
      position = stateInSegment(segment, horizon).position;
      velocity = stateInSegment(segment, horizon).velocity;
      windowEnded = true;
      break;
    }
    time = transition.timeS;
    position = { ...transition.position };
    velocity = { ...transition.velocity };
    const event: FiniteFieldEvent = {
      timeS: transition.timeS,
      kind: transition.kind,
      position: { ...transition.position },
      velocity: { ...transition.velocity },
      boundaryIds: [...transition.boundaryIds],
      fromInside: inside,
      toInside: transition.toInside,
      explanation: transition.explanation,
    };
    if (!transition.toInside && inside && !exit) exit = event;
    if (transition.toInside && !inside && !entry) {
      entry = event;
      events.unshift(event);
    } else {
      events.push(event);
    }
    inside = transition.toInside;
    if (inside && !events.includes(entry as FiniteFieldEvent)) {
      // Entry is kept in events below; no-op for type narrowing.
    }
    if (iteration === maxEvents - 1) {
      eventLimited = true;
      events.push({
        timeS: time,
        kind: 'event-limit',
        position: { ...position },
        velocity: { ...velocity },
        boundaryIds: [],
        fromInside: inside,
        toInside: inside,
        explanation: '达到事件数量上限，轨迹可能尚未结束。',
      });
      break;
    }
  }

  if (segments.length === 0) {
    segments.push(segmentFor(inside, input.Bz, input.chargeC, input.massKg, 0, horizon, position, velocity));
    if (inside) insideTime = horizon;
  }
  if (!windowEnded && !eventLimited) {
    if (time < horizon - timeTolerance(horizon)) {
      const tail = segmentFor(inside, input.Bz, input.chargeC, input.massKg, time, horizon, position, velocity);
      segments.push(tail);
      if (inside) insideTime += horizon - time;
      time = horizon;
    }
    windowEnded = true;
  }
  const durationS = eventLimited ? Math.min(time, horizon) : horizon;
  const radiusM = magnetic ? speed / Math.abs(omega) : null;
  const periodS = magnetic ? TWO_PI / Math.abs(omega) : null;
  let status: FiniteFieldStatus;
  let explanation: string;
  if (!magnetic) {
    status = 'no-magnetic-field';
    explanation = 'q·Bz = 0：粒子不发生磁偏转，边界只作为几何穿越事件。';
  } else if (entry && exit) {
    status = 'entered-and-exited';
    explanation = '粒子从场外进入，沿圆弧运动并从真实边界离开。';
  } else if (!entry && exit) {
    status = 'starts-inside-and-exited';
    explanation = '粒子初始就在场内，并从真实边界离开。';
  } else if (entry) {
    status = 'entered-no-exit';
    explanation = '粒子已进入磁场，但在当前时间窗口内没有真实出场。';
  } else if (initialChoice.region === 'inside' || initialChoice.chosenInside) {
    status = tangent ? 'tangent-no-exit' : 'starts-inside-no-exit';
    explanation = tangent
      ? '粒子始终在场内，轨迹与边界相切接触但没有穿越。'
      : '粒子初始就在场内，当前窗口内没有出场。';
  } else if (tangent) {
    status = 'tangent-no-entry';
    explanation = '轨迹只与边界相切接触，没有进入磁场。';
  } else {
    status = 'no-entry';
    explanation = '前向直线轨迹没有进入磁场区域。';
  }
  if (eventLimited) explanation += ' 达到事件上限，结果已截断。';

  return {
    input,
    geometry: input.geometry,
    status,
    statusExplanation: explanation,
    issue: eventLimited ? '达到事件上限，轨迹可能尚未结束。' : null,
    initialRegion: initialChoice.region,
    launchPoint: startPosition,
    entry,
    exit,
    tangent,
    events: [...events].sort((left, right) => left.timeS - right.timeS),
    segments,
    entryTimeS: entry?.timeS ?? null,
    exitTimeS: exit?.timeS ?? null,
    fieldTimeS: insideTime,
    deflectionDegrees: firstArcAngle === null ? null : (firstArcAngle * 180) / Math.PI,
    radiusM,
    periodS,
    turn: magnetic ? (omega > 0 ? 'counterclockwise' : 'clockwise') : null,
    eventLimited,
    windowEnded,
    durationS,
  };
}

export function finiteFieldStateAt(solution: FiniteFieldSolution, timeS: number): FiniteFieldState {
  const t = Number.isFinite(timeS) ? clamp(timeS, 0, solution.durationS) : 0;
  let segmentIndex = solution.segments.length - 1;
  for (let index = 0; index < solution.segments.length; index++) {
    if (t <= solution.segments[index].endTimeS + 1e-12) {
      segmentIndex = index;
      break;
    }
  }
  const segment = solution.segments[Math.max(0, Math.min(solution.segments.length - 1, segmentIndex))];
  if (!segment) {
    return {
      timeS: t,
      position: solution.launchPoint,
      velocity: { x: 0, y: 0 },
      force: { x: 0, y: 0 },
      speedMps: 0,
      region: 'outside',
      inField: false,
      phase: solution.status === 'stationary' ? 'stationary' : 'outside',
      segmentIndex: 0,
    };
  }
  const state = stateInSegment(segment, Math.min(t, segment.endTimeS));
  const magnetic = segment.kind === 'arc';
  const force = magnetic
    ? {
        x: nz(solution.input.chargeC * state.velocity.y * solution.input.Bz),
        y: nz(-solution.input.chargeC * state.velocity.x * solution.input.Bz),
      }
    : { x: 0, y: 0 };
  let phase: FiniteFieldState['phase'];
  if (solution.status === 'invalid') phase = 'invalid';
  else if (solution.status === 'stationary') phase = 'stationary';
  else if (solution.entry && t < (solution.entryTimeS ?? 0) - 1e-12) phase = 'before-entry';
  else if (solution.exit && t >= (solution.exitTimeS ?? Infinity) - 1e-12) phase = 'after-exit';
  else if (segment.inside) phase = 'in-field';
  else phase = 'outside';
  return {
    timeS: t,
    position: state.position,
    velocity: state.velocity,
    force,
    speedMps: length(state.velocity),
    region: segment.inside ? 'inside' : 'outside',
    inField: segment.inside,
    phase,
    segmentIndex,
  };
}

export function sampleFiniteFieldTrajectory(
  solution: FiniteFieldSolution,
  durationS: number,
  count = 180,
): Vec2[] {
  const duration = clamp(durationS, 0, solution.durationS);
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let index = 0; index <= n; index++) {
    points.push(finiteFieldStateAt(solution, (duration * index) / n).position);
  }
  return points;
}

export function finiteFieldBoundarySegments(geometry: FiniteFieldGeometry): BoundarySegment[] {
  return boundarySegments(geometry);
}
