import {
  add,
  clamp,
  dot,
  length,
  normalize,
  rotate,
  scale,
  sub,
  type Vec2,
} from '../core/vec2';

export type HalfPlaneStatus =
  | 'entered-and-exited'
  | 'entered-no-exit'
  | 'tangent-no-exit'
  | 'starts-inside-and-exited'
  | 'starts-inside-no-exit'
  | 'no-entry'
  | 'no-magnetic-field'
  | 'stationary'
  | 'invalid';

export type BoundaryEventKind = 'entry' | 'exit' | 'tangent' | 'no-entry' | 'stays-inside';

export interface BoundaryEvent {
  kind: BoundaryEventKind;
  timeS: number | null;
  position: Vec2 | null;
  velocity: Vec2 | null;
  explanation: string;
}

export interface HalfPlaneFieldInput {
  startPosition: Vec2;
  initialVelocity: Vec2;
  massKg: number;
  chargeC: number;
  BzTesla: number;
  boundaryPoint: Vec2;
  boundaryNormal: Vec2;
  timeHorizonS?: number;
}

export interface LineSegment {
  kind: 'line';
  startTimeS: number;
  endTimeS: number;
  position: Vec2;
  velocity: Vec2;
}

export interface ArcSegment {
  kind: 'arc';
  startTimeS: number;
  endTimeS: number;
  center: Vec2;
  radiusM: number;
  omegaRadPerS: number;
  startPosition: Vec2;
  startVelocity: Vec2;
}

export type HalfPlaneSegment = LineSegment | ArcSegment;

export interface HalfPlaneCircle {
  center: Vec2;
  radiusM: number;
  periodS: number;
  omegaRadPerS: number;
  turn: 'clockwise' | 'counterclockwise';
}

export interface HalfPlaneSolution {
  input: HalfPlaneFieldInput;
  boundaryNormal: Vec2;
  status: HalfPlaneStatus;
  statusExplanation: string;
  issue: string | null;
  initialRegion: 'inside' | 'outside' | 'boundary' | 'invalid';
  launchPoint: Vec2;
  entry: BoundaryEvent | null;
  exit: BoundaryEvent | null;
  tangent: BoundaryEvent | null;
  events: BoundaryEvent[];
  circle: HalfPlaneCircle | null;
  magneticRadiusM: number | null;
  magneticPeriodS: number | null;
  turn: 'clockwise' | 'counterclockwise' | null;
  entryTimeS: number | null;
  exitTimeS: number | null;
  fieldTimeS: number | null;
  deflectionDegrees: number | null;
  segments: HalfPlaneSegment[];
  durationS: number;
}

export interface HalfPlaneParticleState {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  force: Vec2;
  speedMps: number;
  region: 'inside' | 'outside' | 'boundary';
  phase: 'before-entry' | 'in-field' | 'after-exit' | 'outside' | 'stationary' | 'invalid';
  inField: boolean;
}

const MIN_OMEGA_RAD_PER_S = 1e-9;
const VEL_EPS_MPS = 1e-12;
const ACCEL_EPS = 1e-9;
const TWO_PI = Math.PI * 2;
const FALLBACK_DURATION_S = 2e-7;
const NORMALIZED_PERIODS_NO_EXIT = 2;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function finiteVec(value: Vec2 | undefined): value is Vec2 {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y));
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function wrapAngle(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function angleOf(value: Vec2): number {
  return Math.atan2(value.y, value.x);
}

function geometryTolerance(radius: number, distance: number): number {
  return 1e-8 * Math.max(1e-6, Math.abs(radius), Math.abs(distance));
}

function regionTolerance(radius: number): number {
  return Math.max(1e-10, radius * 1e-8);
}

export function signedDistanceToBoundary(
  point: Vec2,
  boundaryPoint: Vec2,
  boundaryNormal: Vec2,
): number {
  return dot(boundaryNormal, sub(point, boundaryPoint));
}

export function classifyBoundaryRegion(
  signedDistance: number,
  tolerance = 1e-10,
): 'inside' | 'outside' | 'boundary' {
  if (signedDistance > tolerance) return 'inside';
  if (signedDistance < -tolerance) return 'outside';
  return 'boundary';
}

function makeStaticSolution(
  input: HalfPlaneFieldInput,
  status: HalfPlaneStatus,
  explanation: string,
  issue: string | null,
  initialRegion: HalfPlaneSolution['initialRegion'] = 'invalid',
): HalfPlaneSolution {
  const safePoint = finiteVec(input.startPosition) ? input.startPosition : { x: 0, y: 0 };
  const duration = finitePositive(input.timeHorizonS ?? Number.NaN)
    ? (input.timeHorizonS as number)
    : FALLBACK_DURATION_S;
  return {
    input,
    boundaryNormal: finiteVec(input.boundaryNormal) ? input.boundaryNormal : { x: 1, y: 0 },
    status,
    statusExplanation: explanation,
    issue,
    initialRegion,
    launchPoint: safePoint,
    entry: null,
    exit: null,
    tangent: null,
    events: [],
    circle: null,
    magneticRadiusM: null,
    magneticPeriodS: null,
    turn: null,
    entryTimeS: null,
    exitTimeS: null,
    fieldTimeS: null,
    deflectionDegrees: null,
    segments: [
      {
        kind: 'line',
        startTimeS: 0,
        endTimeS: duration,
        position: safePoint,
        velocity: { x: 0, y: 0 },
      },
    ],
    durationS: duration,
  };
}

function tangentEvent(
  timeS: number,
  position: Vec2,
  velocity: Vec2,
  explanation = '轨迹与边界相切接触；接触不是穿越，因此不产生离场事件。',
): BoundaryEvent {
  return { kind: 'tangent', timeS, position, velocity, explanation };
}

function statusEvent(
  kind: 'no-entry' | 'stays-inside',
  explanation: string,
): BoundaryEvent {
  return { kind, timeS: null, position: null, velocity: null, explanation };
}

function arcStateAt(
  segment: ArcSegment,
  timeS: number,
): { position: Vec2; velocity: Vec2 } {
  const tau = timeS - segment.startTimeS;
  const angle = segment.omegaRadPerS * tau;
  return {
    position: add(segment.center, rotate(sub(segment.startPosition, segment.center), angle)),
    velocity: rotate(segment.startVelocity, angle),
  };
}

function circleIntersectionVelocity(
  omega: number,
  radius: number,
  unitRadial: Vec2,
): Vec2 {
  return scale({ x: -unitRadial.y, y: unitRadial.x }, omega * radius);
}

interface ExitSearch {
  exit: BoundaryEvent | null;
  tangent: BoundaryEvent | null;
  arcAngleRad: number | null;
}

function searchExitAndTangency(options: {
  center: Vec2;
  radiusM: number;
  omega: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  arcStartTimeS: number;
  boundaryPoint: Vec2;
  normal: Vec2;
  forcedCrossing: boolean;
}): ExitSearch {
  const { center, radiusM, omega, startPosition, startVelocity, arcStartTimeS } = options;
  const { boundaryPoint, normal, forcedCrossing } = options;
  const u0 = sub(startPosition, center);
  const psi0 = angleOf(u0);
  const centerDistance = dot(normal, sub(center, boundaryPoint));
  const absDistance = Math.abs(centerDistance);
  const radialDifference = radiusM - absDistance;
  const tol = geometryTolerance(radiusM, centerDistance);

  if (absDistance > radiusM + tol) {
    return { exit: null, tangent: null, arcAngleRad: null };
  }

  const tangentLike = Math.abs(radialDifference) <= tol;
  if (tangentLike && !forcedCrossing) {
    if (centerDistance <= tol) {
      return { exit: null, tangent: null, arcAngleRad: null };
    }
    const tangentUnit = { x: -normal.x, y: -normal.y };
    const tangentTimeDelta = wrapAngle(Math.sign(omega) * (angleOf(tangentUnit) - psi0));
    const delta = tangentTimeDelta < 1e-12 ? 0 : tangentTimeDelta;
    const timeS = arcStartTimeS + delta / Math.abs(omega);
    const position = add(center, scale(normal, -radiusM));
    const velocity = rotate(startVelocity, omega * (timeS - arcStartTimeS));
    return {
      exit: null,
      tangent: tangentEvent(timeS, position, velocity, '圆周与边界内切/相切；轨迹只接触边界，没有全场穿越。'),
      arcAngleRad: delta,
    };
  }

  const cosValue = clamp(-centerDistance / radiusM, -1, 1);
  const beta = Math.acos(cosValue);
  const normalAngle = angleOf(normal);
  const candidates = [normalAngle + beta, normalAngle - beta];
  let best: { delta: number; timeS: number; position: Vec2; velocity: Vec2 } | null = null;

  for (const candidateAngle of candidates) {
    const unit: Vec2 = { x: Math.cos(candidateAngle), y: Math.sin(candidateAngle) };
    const velocity = circleIntersectionVelocity(omega, radiusM, unit);
    const normalVelocity = dot(normal, velocity);
    if (normalVelocity >= -VEL_EPS_MPS) continue;
    const rawDelta = wrapAngle(Math.sign(omega) * (candidateAngle - psi0));
    if (rawDelta < 1e-10 || TWO_PI - rawDelta < 1e-10) continue;
    if (!best || rawDelta < best.delta) {
      best = {
        delta: rawDelta,
        timeS: arcStartTimeS + rawDelta / Math.abs(omega),
        position: add(center, scale(unit, radiusM)),
        velocity,
      };
    }
  }

  if (best) {
    return {
      exit: {
        kind: 'exit',
        timeS: best.timeS,
        position: best.position,
        velocity: best.velocity,
        explanation: '同一圆周与边界的第二个交点，且法向速度指向场外；这是真实离场事件。',
      },
      tangent: null,
      arcAngleRad: best.delta,
    };
  }

  if (tangentLike) {
    return { exit: null, tangent: null, arcAngleRad: null };
  }
  return { exit: null, tangent: null, arcAngleRad: null };
}

export function solveHalfPlaneTrajectory(input: HalfPlaneFieldInput): HalfPlaneSolution {
  const finiteInput =
    finiteVec(input.startPosition) &&
    finiteVec(input.initialVelocity) &&
    finiteVec(input.boundaryPoint) &&
    finiteVec(input.boundaryNormal) &&
    Number.isFinite(input.massKg) &&
    Number.isFinite(input.chargeC) &&
    Number.isFinite(input.BzTesla);

  if (!finiteInput) {
    return makeStaticSolution(input, 'invalid', '输入包含非有限数值，无法求解。', '请输入有限的质量、电荷、速度、磁场与边界。');
  }
  if (!finitePositive(input.massKg)) {
    return makeStaticSolution(input, 'invalid', '质量必须为正数。', 'm ≤ 0，不能形成有效加速度。');
  }
  const normalLength = length(input.boundaryNormal);
  if (normalLength < 1e-12) {
    return makeStaticSolution(input, 'invalid', '磁场边界法向无效。', '边界法向不能为零向量。');
  }

  const normal = normalize(input.boundaryNormal);
  const start = input.startPosition;
  const v0 = input.initialVelocity;
  const speed = length(v0);
  const h0 = dot(normal, sub(start, input.boundaryPoint));
  const regionTol = Math.max(1e-10, geometryTolerance(0, h0));
  const initialRegion = classifyBoundaryRegion(h0, regionTol);

  if (speed <= VEL_EPS_MPS) {
    const result = makeStaticSolution(
      input,
      'stationary',
      '初速度为 0：粒子保持静止，没有入场或出场事件。',
      null,
      initialRegion,
    );
    return {
      ...result,
      boundaryNormal: normal,
      launchPoint: start,
    };
  }

  const omega = (-input.chargeC * input.BzTesla) / input.massKg;
  const magnetic = Math.abs(omega) >= MIN_OMEGA_RAD_PER_S;
  const turn = magnetic ? (omega > 0 ? 'counterclockwise' : 'clockwise') : null;
  const magneticRadius = magnetic ? speed / Math.abs(omega) : null;
  const magneticPeriod = magnetic ? TWO_PI / Math.abs(omega) : null;
  const vn0 = dot(normal, v0);
  const normalVelocityTolerance = Math.max(VEL_EPS_MPS, speed * 1e-9);
  const fallbackHorizon = finitePositive(input.timeHorizonS ?? Number.NaN)
    ? (input.timeHorizonS as number)
    : FALLBACK_DURATION_S;

  if (!magnetic) {
    return solveStraightSolution({
      input,
      normal,
      start,
      v0,
      speed,
      h0,
      initialRegion,
      fallbackHorizon,
    });
  }

  let arcStartPosition = start;
  let arcStartVelocity = v0;
  let arcStartTimeS = 0;
  let entry: BoundaryEvent | null = null;
  let tangent: BoundaryEvent | null = null;
  let tangentEntry = false;
  let noEntry = false;

  if (initialRegion === 'outside') {
    if (vn0 > normalVelocityTolerance) {
      const entryTime = -h0 / vn0;
      const entryPosition = add(start, scale(v0, entryTime));
      arcStartPosition = entryPosition;
      arcStartTimeS = entryTime;
      entry = {
        kind: 'entry',
        timeS: entryTime,
        position: entryPosition,
        velocity: v0,
        explanation: '从场外沿直线到达边界，法向速度指向场内；位置与速度均连续。',
      };
    } else {
      noEntry = true;
    }
  } else if (initialRegion === 'boundary') {
    if (vn0 > normalVelocityTolerance) {
      entry = {
        kind: 'entry',
        timeS: 0,
        position: start,
        velocity: v0,
        explanation: '初始点位于边界，速度法向分量指向场内；从入射点开始圆弧运动。',
      };
    } else if (vn0 < -normalVelocityTolerance) {
      noEntry = true;
    } else {
      const acceleration = scale({ x: -v0.y, y: v0.x }, omega);
      const normalAcceleration = dot(normal, acceleration);
      if (normalAcceleration > ACCEL_EPS) {
        tangentEntry = true;
        tangent = tangentEvent(
          0,
          start,
          v0,
          '初始速度平行于边界，洛伦兹力指向场内：轨迹从相切点开始向内弯曲，不构成穿越。',
        );
      } else {
        noEntry = true;
        tangent = tangentEvent(
          0,
          start,
          v0,
          '初始速度平行于边界，但洛伦兹力指向场外；相切接触，不进入磁场。',
        );
      }
    }
  }

  if (noEntry) {
    const duration = (magneticPeriod as number) * 0.5;
    const events: BoundaryEvent[] = [];
    if (tangent) events.push(tangent);
    events.push(statusEvent('no-entry', '速度法向分量不指向场内，或者从边界相切后离开；没有有效入场。'));
    return {
      input,
      boundaryNormal: normal,
      status: 'no-entry',
      statusExplanation: '没有有效入场：边界只被离开或平行掠过，磁场从未作用于粒子。',
      issue: null,
      initialRegion,
      launchPoint: start,
      entry: null,
      exit: null,
      tangent,
      events,
      circle: null,
      magneticRadiusM: magneticRadius,
      magneticPeriodS: magneticPeriod,
      turn,
      entryTimeS: null,
      exitTimeS: null,
      fieldTimeS: null,
      deflectionDegrees: null,
      segments: [
        {
          kind: 'line',
          startTimeS: 0,
          endTimeS: duration,
          position: start,
          velocity: v0,
        },
      ],
      durationS: duration,
    };
  }

  const center = add(arcStartPosition, {
    x: -arcStartVelocity.y / omega,
    y: arcStartVelocity.x / omega,
  });
  const radius = speed / Math.abs(omega);
  const period = TWO_PI / Math.abs(omega);
  const forcedCrossing = Boolean(entry);
  const search = searchExitAndTangency({
    center,
    radiusM: radius,
    omega,
    startPosition: arcStartPosition,
    startVelocity: arcStartVelocity,
    arcStartTimeS,
    boundaryPoint: input.boundaryPoint,
    normal,
    forcedCrossing,
  });

  const circle: HalfPlaneCircle = {
    center,
    radiusM: radius,
    periodS: period,
    omegaRadPerS: omega,
    turn: omega > 0 ? 'counterclockwise' : 'clockwise',
  };
  const exit = search.exit;
  const tangentFound = tangent ?? search.tangent;
  const entryTimeS = entry?.timeS ?? null;
  const exitTimeS = exit?.timeS ?? null;
  const insideStartTimeS = entry?.timeS ?? 0;
  const fieldTimeS =
    exitTimeS !== null ? Math.max(0, exitTimeS - insideStartTimeS) : null;
  const deflectionDegrees =
    exit && search.arcAngleRad !== null ? (search.arcAngleRad * 180) / Math.PI : null;

  const postExitTime = radius > 0 ? radius / speed : 0;
  const durationS =
    exitTimeS !== null
      ? exitTimeS + postExitTime
      : insideStartTimeS + NORMALIZED_PERIODS_NO_EXIT * period;

  const events: BoundaryEvent[] = [];
  if (entry) events.push(entry);
  if (tangentFound) events.push(tangentFound);
  if (exit) events.push(exit);

  if (!exit) {
    events.push(
      statusEvent(
        'stays-inside',
        tangentFound
          ? '轨迹与边界接触但不穿越，粒子始终留在场内；没有离场事件。'
          : '圆周轨迹未与边界相交，粒子始终留在场内；没有离场事件。',
      ),
    );
  }

  let status: HalfPlaneStatus;
  let statusExplanation: string;
  if (exit) {
    status = entry ? 'entered-and-exited' : 'starts-inside-and-exited';
    statusExplanation = entry
      ? '粒子从场外直线进入磁场，沿圆弧偏转后在真实交点离开磁场。'
      : '粒子初始就在场内，沿圆弧运动后在真实边界交点离开。';
  } else if (tangentEntry) {
    status = 'tangent-no-exit';
    statusExplanation = '轨迹从边界相切点向场内弯曲并与边界保持内切；接触不等于穿越，因此没有离场事件。';
  } else if (entry) {
    status = 'entered-no-exit';
    statusExplanation = '粒子进入磁场，但在当前模型范围内没有找到真实离场交点。';
  } else {
    status = 'starts-inside-no-exit';
    statusExplanation = tangentFound
      ? '粒子初始就在场内，轨迹与边界相切接触但未穿越，始终留在场内。'
      : '粒子初始就在场内，圆周轨迹未与边界相交，没有离场事件。';
  }

  const segments: HalfPlaneSegment[] = [];
  if (entry && (entry.timeS ?? 0) > 1e-12) {
    segments.push({
      kind: 'line',
      startTimeS: 0,
      endTimeS: entry.timeS as number,
      position: start,
      velocity: v0,
    });
  }
  segments.push({
    kind: 'arc',
    startTimeS: insideStartTimeS,
    endTimeS: exitTimeS ?? durationS,
    center,
    radiusM: radius,
    omegaRadPerS: omega,
    startPosition: arcStartPosition,
    startVelocity: arcStartVelocity,
  });
  if (exit) {
    segments.push({
      kind: 'line',
      startTimeS: exitTimeS as number,
      endTimeS: durationS,
      position: exit.position as Vec2,
      velocity: exit.velocity as Vec2,
    });
  }

  return {
    input,
    boundaryNormal: normal,
    status,
    statusExplanation,
    issue: null,
    initialRegion,
    launchPoint: start,
    entry,
    exit,
    tangent: tangentFound,
    events,
    circle,
    magneticRadiusM: magneticRadius,
    magneticPeriodS: magneticPeriod,
    turn,
    entryTimeS,
    exitTimeS,
    fieldTimeS,
    deflectionDegrees,
    segments,
    durationS,
  };
}

function solveStraightSolution(options: {
  input: HalfPlaneFieldInput;
  normal: Vec2;
  start: Vec2;
  v0: Vec2;
  speed: number;
  h0: number;
  initialRegion: 'inside' | 'outside' | 'boundary';
  fallbackHorizon: number;
}): HalfPlaneSolution {
  const { input, normal, start, v0, h0, initialRegion, fallbackHorizon } = options;
  const vn = dot(normal, v0);
  const events: BoundaryEvent[] = [];
  let entry: BoundaryEvent | null = null;
  let exit: BoundaryEvent | null = null;
  let noEntry = false;

  if (initialRegion === 'outside') {
    if (vn > VEL_EPS_MPS) {
      const entryTime = -h0 / vn;
      entry = {
        kind: 'entry',
        timeS: entryTime,
        position: add(start, scale(v0, entryTime)),
        velocity: v0,
        explanation: '直线轨迹几何上进入磁场区域；由于 qBz = 0，磁场不对粒子施加洛伦兹力。',
      };
      events.push(entry);
    } else {
      noEntry = true;
    }
  } else if (initialRegion === 'boundary') {
    if (vn > VEL_EPS_MPS) {
      entry = {
        kind: 'entry',
        timeS: 0,
        position: start,
        velocity: v0,
        explanation: '从边界进入磁场区域；qBz = 0，因此轨迹不发生磁偏转。',
      };
      events.push(entry);
    } else if (vn < -VEL_EPS_MPS) {
      noEntry = true;
    } else {
      noEntry = true;
    }
  } else if (vn < -VEL_EPS_MPS) {
    const exitTime = -h0 / vn;
    exit = {
      kind: 'exit',
      timeS: exitTime,
      position: add(start, scale(v0, exitTime)),
      velocity: v0,
      explanation: '直线轨迹几何上离开磁场区域；由于 qBz = 0，没有磁偏转。',
    };
    events.push(exit);
  }

  if (noEntry) {
    events.push(statusEvent('no-entry', '没有与磁场区域形成有效的正向穿越。'));
  } else if (!exit) {
    events.push(
      statusEvent('stays-inside', '粒子保持在磁场区域内；但由于 qBz = 0，没有圆周偏转。'),
    );
  }

  const lastEventTime = Math.max(entry?.timeS ?? 0, exit?.timeS ?? 0);
  const duration = Math.max(fallbackHorizon, lastEventTime + fallbackHorizon);
  return {
    input,
    boundaryNormal: normal,
    status: 'no-magnetic-field',
    statusExplanation:
      'qBz = 0：没有洛伦兹力，粒子按直线运动。边界事件只是区域穿越，不是磁偏转轨迹。',
    issue: 'q·Bz = 0：当前轨迹为直线，不能形成圆周或由磁场产生的出射角。',
    initialRegion,
    launchPoint: start,
    entry,
    exit,
    tangent: null,
    events,
    circle: null,
    magneticRadiusM: null,
    magneticPeriodS: null,
    turn: null,
    entryTimeS: entry?.timeS ?? null,
    exitTimeS: exit?.timeS ?? null,
    fieldTimeS:
      exit !== null
        ? Math.max(0, (exit.timeS as number) - (entry?.timeS ?? 0))
        : null,
    deflectionDegrees: null,
    segments: [
      {
        kind: 'line',
        startTimeS: 0,
        endTimeS: duration,
        position: start,
        velocity: v0,
      },
    ],
    durationS: duration,
  };
}

export function sampleHalfPlaneTrajectory(
  solution: HalfPlaneSolution,
  timeS: number,
): HalfPlaneParticleState {
  const duration = Number.isFinite(solution.durationS) ? solution.durationS : 0;
  const t = Number.isFinite(timeS) ? clamp(timeS, 0, duration) : 0;
  const segments = solution.segments;
  let segment: HalfPlaneSegment | undefined = segments[0];
  for (const candidate of segments) {
    if (t >= candidate.startTimeS - 1e-15) segment = candidate;
  }
  if (!segment) {
    return {
      timeS: t,
      position: solution.launchPoint,
      velocity: { x: 0, y: 0 },
      force: { x: 0, y: 0 },
      speedMps: 0,
      region: classifyBoundaryRegion(
        signedDistanceToBoundary(solution.launchPoint, solution.input.boundaryPoint, solution.boundaryNormal),
        1e-10,
      ),
      phase: solution.status === 'stationary' ? 'stationary' : 'outside',
      inField: false,
    };
  }

  const sampled =
    segment.kind === 'line'
      ? {
          position: add(segment.position, scale(segment.velocity, t - segment.startTimeS)),
          velocity: segment.velocity,
        }
      : arcStateAt(segment, t);

  const signedDistance = signedDistanceToBoundary(
    sampled.position,
    solution.input.boundaryPoint,
    solution.boundaryNormal,
  );
  const radius = solution.circle?.radiusM ?? 0;
  const region = classifyBoundaryRegion(signedDistance, regionTolerance(radius));
  const force =
    region === 'inside' && solution.circle
      ? {
          x: solution.input.chargeC * sampled.velocity.y * solution.input.BzTesla,
          y: -solution.input.chargeC * sampled.velocity.x * solution.input.BzTesla,
        }
      : { x: 0, y: 0 };

  let phase: HalfPlaneParticleState['phase'];
  if (solution.status === 'stationary') {
    phase = 'stationary';
  } else if (solution.status === 'invalid') {
    phase = 'invalid';
  } else if (solution.entry && t < (solution.entry.timeS ?? 0) - 1e-15) {
    phase = 'before-entry';
  } else if (solution.exit && t >= (solution.exit.timeS ?? Infinity) - 1e-15) {
    phase = 'after-exit';
  } else if (
    solution.circle &&
    t >= (solution.entry?.timeS ?? 0) - 1e-15 &&
    (!solution.exit || t <= (solution.exit.timeS ?? Infinity) + 1e-15)
  ) {
    phase = 'in-field';
  } else {
    phase = region === 'inside' ? 'in-field' : 'outside';
  }

  return {
    timeS: t,
    position: sampled.position,
    velocity: sampled.velocity,
    force: { x: nz(force.x), y: nz(force.y) },
    speedMps: length(sampled.velocity),
    region,
    phase,
    inField: region === 'inside',
  };
}
