import { add, length, scale, type Vec2 } from '../core/vec2';
import { createCrossedFieldModel, crossedStateAt } from '../particles/crossedFields';
import {
  finiteFieldStateAt,
  solveFiniteFieldTrajectory,
  type FiniteFieldSolution,
} from '../particles/finiteMagneticRegion';

export type CompositeStageId = 'electric-acceleration' | 'magnetic-strip' | 'free-drift';

export type CompositeOutcome =
  | 'screen-hit'
  | 'screen-outside'
  | 'screen-missed'
  | 'boundary-not-reached'
  | 'magnetic-no-exit'
  | 'invalid';

export interface ElectricMagneticScreenInput {
  chargeC: number;
  massKg: number;
  startPosition: Vec2;
  initialVelocity: Vec2;
  electricFieldXVPerM: number;
  boundaryXM: number;
  magneticFieldZT: number;
  magneticWidthM: number;
  screenGapM: number;
  screenHalfHeightM: number;
}

export interface CompositeSnapshot {
  particleId: string;
  stage: CompositeStageId;
  globalTimeS: number;
  localTimeS: number;
  position: Vec2;
  velocity: Vec2;
  speedMps: number;
  kineticEnergyJ: number;
  chargeC: number;
  massKg: number;
}

export interface CompositeEvent {
  id: string;
  stage: CompositeStageId;
  kind: string;
  tGlobalS: number;
  position: Vec2;
  velocity: Vec2;
  label: string;
}

export interface CompositeHandoff {
  from: CompositeStageId;
  to: CompositeStageId;
  atGlobalTimeS: number;
  status: 'continuous' | 'blocked';
  positionErrorM: number;
  velocityErrorMps: number;
  timeErrorS: number;
  explanation: string;
}

export interface CompositeStageTimings {
  electricS: number;
  magneticS: number;
  driftS: number;
  totalS: number;
}

export interface ElectricMagneticScreenSolution {
  input: ElectricMagneticScreenInput;
  outcome: CompositeOutcome;
  issue: string | null;
  durationS: number;
  stageTimings: CompositeStageTimings;
  magnetic: FiniteFieldSolution | null;
  entryAElectric: CompositeSnapshot | null;
  exitAElectric: CompositeSnapshot | null;
  entryBMagnetic: CompositeSnapshot | null;
  exitBMagnetic: CompositeSnapshot | null;
  screen: {
    timeS: number;
    position: Vec2;
    velocity: Vec2;
    snapshot: CompositeSnapshot;
    accepted: boolean;
  } | null;
  events: CompositeEvent[];
  handoffs: CompositeHandoff[];
  trace: Array<{ t: number; x: number; y: number }>;
  stateAt(timeS: number): CompositeSnapshot;
}

export const A17_DEFAULT_INPUT: ElectricMagneticScreenInput = {
  chargeC: 1,
  massKg: 1,
  startPosition: { x: 0, y: 0 },
  initialVelocity: { x: 1, y: 0 },
  electricFieldXVPerM: 1,
  boundaryXM: 1,
  magneticFieldZT: -1,
  magneticWidthM: Math.sqrt(3) / 2,
  screenGapM: 1,
  screenHalfHeightM: 3,
};

const PARTICLE_ID = 'A';
const HANDOFF_TOLERANCE_M = 1e-9;
const HANDOFF_TOLERANCE_V = 1e-9;
const HANDOFF_TOLERANCE_T = 1e-9;

function finiteVec(value: Vec2 | null | undefined): value is Vec2 {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y));
}

function validInput(input: ElectricMagneticScreenInput): string | null {
  if (!input || typeof input !== 'object') return '题目参数无效。';
  if (!finiteVec(input.startPosition) || !finiteVec(input.initialVelocity)) return '初态坐标或速度包含非有限数值。';
  if (!Number.isFinite(input.chargeC) || !Number.isFinite(input.massKg)) return '电荷量或质量无效。';
  if (!(input.massKg > 0)) return '质量必须为正数。';
  if (!Number.isFinite(input.electricFieldXVPerM)) return '加速电场包含非有限数值。';
  if (!Number.isFinite(input.magneticFieldZT)) return '磁场包含非有限数值。';
  if (!Number.isFinite(input.boundaryXM)) return '电场边界位置无效。';
  if (!(input.boundaryXM > input.startPosition.x)) return '电场边界必须在起点右侧。';
  if (!(input.magneticWidthM > 0)) return '磁场宽度必须为正数。';
  if (!(input.screenGapM > 0)) return '屏幕与磁场右边界之间的距离必须为正数。';
  if (!(input.screenHalfHeightM > 0)) return '屏幕半高必须为正数。';
  return null;
}

function kinetic(input: ElectricMagneticScreenInput, velocity: Vec2): number {
  return 0.5 * input.massKg * length(velocity) ** 2;
}

function snapshot(
  input: ElectricMagneticScreenInput,
  stage: CompositeStageId,
  globalTimeS: number,
  localTimeS: number,
  position: Vec2,
  velocity: Vec2,
): CompositeSnapshot {
  return {
    particleId: PARTICLE_ID,
    stage,
    globalTimeS,
    localTimeS,
    position: { ...position },
    velocity: { ...velocity },
    speedMps: length(velocity),
    kineticEnergyJ: kinetic(input, velocity),
    chargeC: input.chargeC,
    massKg: input.massKg,
  };
}

function makeStateAt(
  input: ElectricMagneticScreenInput,
  timings: CompositeStageTimings,
  electricState: (localTime: number) => { position: Vec2; velocity: Vec2 },
  magnetic: FiniteFieldSolution | null,
  driftStart: CompositeSnapshot | null,
): (timeS: number) => CompositeSnapshot {
  const bounded = (time: number) =>
    Number.isFinite(time) ? Math.max(0, Math.min(time, timings.totalS)) : 0;
  return (rawTime: number) => {
    const time = bounded(rawTime);
    if (time <= timings.electricS + 1e-12) {
      const local = Math.max(0, time);
      const state = electricState(local);
      return snapshot(input, 'electric-acceleration', time, local, state.position, state.velocity);
    }
    if (magnetic && driftStart && time <= timings.electricS + timings.magneticS + 1e-12) {
      const local = Math.max(0, time - timings.electricS);
      const state = finiteFieldStateAt(magnetic, Math.min(local, timings.magneticS));
      return snapshot(input, 'magnetic-strip', time, local, state.position, state.velocity);
    }
    if (driftStart) {
      const local = Math.max(0, time - timings.electricS - timings.magneticS);
      const position = add(driftStart.position, scale(driftStart.velocity, local));
      return snapshot(input, 'free-drift', time, local, position, driftStart.velocity);
    }
    const local = Math.max(0, time);
    const state = electricState(local);
    return snapshot(input, 'electric-acceleration', time, local, state.position, state.velocity);
  };
}

function boundaryArrivalTime(
  input: ElectricMagneticScreenInput,
  electricState: (localTime: number) => { position: Vec2; velocity: Vec2 },
): number | null {
  const accelerationX = (input.chargeC * input.electricFieldXVPerM) / input.massKg;
  const dx = input.boundaryXM - input.startPosition.x;
  const vx = input.initialVelocity.x;
  let candidates: number[] = [];
  if (Math.abs(accelerationX) < 1e-12) {
    if (vx > 1e-12) candidates = [dx / vx];
  } else {
    const discriminant = vx * vx + 2 * accelerationX * dx;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      candidates = [
        (-vx + root) / accelerationX,
        (-vx - root) / accelerationX,
      ].filter((time) => Number.isFinite(time) && time > 0);
    }
  }
  candidates.sort((left, right) => left - right);
  for (const candidate of candidates) {
    const state = electricState(candidate);
    if (Math.abs(state.position.x - input.boundaryXM) > 1e-8) continue;
    if (state.velocity.x <= 1e-10) continue;
    return candidate;
  }
  return null;
}

function handoff(
  from: CompositeStageId,
  to: CompositeStageId,
  before: CompositeSnapshot | null,
  after: CompositeSnapshot | null,
  atGlobalTimeS: number,
): CompositeHandoff {
  if (!before || !after) {
    return {
      from,
      to,
      atGlobalTimeS,
      status: 'blocked',
      positionErrorM: Number.POSITIVE_INFINITY,
      velocityErrorMps: Number.POSITIVE_INFINITY,
      timeErrorS: Number.POSITIVE_INFINITY,
      explanation: '缺少阶段出口或入口状态，未建立连续交接。',
    };
  }
  const positionErrorM = Math.hypot(
    before.position.x - after.position.x,
    before.position.y - after.position.y,
  );
  const velocityErrorMps = Math.hypot(
    before.velocity.x - after.velocity.x,
    before.velocity.y - after.velocity.y,
  );
  const timeErrorS = Math.abs(before.globalTimeS - after.globalTimeS);
  const continuous =
    positionErrorM <= HANDOFF_TOLERANCE_M &&
    velocityErrorMps <= HANDOFF_TOLERANCE_V &&
    timeErrorS <= HANDOFF_TOLERANCE_T &&
    before.chargeC === after.chargeC &&
    before.massKg === after.massKg &&
    before.particleId === after.particleId;
  return {
    from,
    to,
    atGlobalTimeS,
    status: continuous ? 'continuous' : 'blocked',
    positionErrorM,
    velocityErrorMps,
    timeErrorS,
    explanation: continuous
      ? '位置、速度、全局时间和粒子身份均由同一物理状态传递。'
      : '交接状态不连续；后续阶段不应继续绘制为同一整题。',
  };
}

function sampleTrace(
  stateAt: (time: number) => CompositeSnapshot,
  durationS: number,
  count = 240,
): Array<{ t: number; x: number; y: number }> {
  const total = Math.max(durationS, 1e-9);
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = (total * index) / count;
    const state = stateAt(t);
    return { t, x: state.position.x, y: state.position.y };
  });
}

export function solveElectricMagneticScreen(inputValue: ElectricMagneticScreenInput): ElectricMagneticScreenSolution {
  const fallbackInput: ElectricMagneticScreenInput = {
    ...A17_DEFAULT_INPUT,
    ...(inputValue && typeof inputValue === 'object' ? inputValue : {}),
  };
  const issue = validInput(fallbackInput);
  if (issue) {
    const timings = { electricS: 1, magneticS: 0, driftS: 0, totalS: 1 };
    const stateAt = (time: number) => snapshot(
      fallbackInput,
      'electric-acceleration',
      Math.max(0, Math.min(time, 1)),
      Math.max(0, Math.min(time, 1)),
      fallbackInput.startPosition,
      fallbackInput.initialVelocity,
    );
    return {
      input: fallbackInput,
      outcome: 'invalid',
      issue,
      durationS: 1,
      stageTimings: timings,
      magnetic: null,
      entryAElectric: stateAt(0),
      exitAElectric: null,
      entryBMagnetic: null,
      exitBMagnetic: null,
      screen: null,
      events: [],
      handoffs: [],
      trace: [],
      stateAt,
    };
  }
  const input = fallbackInput;
  const crossed = createCrossedFieldModel({
    massKg: input.massKg,
    chargeC: input.chargeC,
    Ex: input.electricFieldXVPerM,
    Ey: 0,
    Bz: 0,
    initialPosition: input.startPosition,
    initialVelocity: input.initialVelocity,
  });
  const electricState = (localTime: number) => {
    const state = crossedStateAt(crossed, localTime);
    return { position: state.position, velocity: state.velocity };
  };
  const initial = snapshot(input, 'electric-acceleration', 0, 0, input.startPosition, input.initialVelocity);
  const arrival = boundaryArrivalTime(input, electricState);

  if (arrival === null) {
    const durationS = 2;
    const timings = { electricS: durationS, magneticS: 0, driftS: 0, totalS: durationS };
    const stateAt = makeStateAt(input, timings, electricState, null, null);
    const end = stateAt(durationS);
    return {
      input,
      outcome: 'boundary-not-reached',
      issue: '在当前电场与初速度下，粒子没有向右到达电场边界，因此不能生成后续磁场或屏幕事件。',
      durationS,
      stageTimings: timings,
      magnetic: null,
      entryAElectric: initial,
      exitAElectric: null,
      entryBMagnetic: null,
      exitBMagnetic: null,
      screen: null,
      events: [{
        id: 'boundary-not-reached',
        stage: 'electric-acceleration',
        kind: 'boundary-not-reached',
        tGlobalS: durationS,
        position: end.position,
        velocity: end.velocity,
        label: '粒子未向右到达电场边界；后续阶段未执行。',
      }],
      handoffs: [],
      trace: sampleTrace((time) => stateAt(time), durationS),
      stateAt,
    };
  }

  const exitAElectric = (() => {
    const state = electricState(arrival);
    return snapshot(input, 'electric-acceleration', arrival, arrival, state.position, state.velocity);
  })();
  const geometry = { kind: 'strip' as const, xMin: input.boundaryXM, xMax: input.boundaryXM + input.magneticWidthM };
  const magnetic = solveFiniteFieldTrajectory({
    geometry,
    Bz: input.magneticFieldZT,
    startPosition: exitAElectric.position,
    initialVelocity: exitAElectric.velocity,
    chargeC: input.chargeC,
    massKg: input.massKg,
    timeHorizonS: 30,
    maxEvents: 40,
  });
  const entryBMagnetic = snapshot(
    input,
    'magnetic-strip',
    arrival,
    0,
    exitAElectric.position,
    exitAElectric.velocity,
  );
  const magneticExit = magnetic.exit;
  const tMagnetic = magneticExit?.timeS ?? magnetic.durationS;
  const exitBMagnetic = magneticExit
    ? (() => {
        const state = finiteFieldStateAt(magnetic, tMagnetic);
        return snapshot(
          input,
          'magnetic-strip',
          arrival + tMagnetic,
          tMagnetic,
          state.position,
          state.velocity,
        );
      })()
    : null;

  const events: CompositeEvent[] = [{
    id: 'start',
    stage: 'electric-acceleration',
    kind: 'start',
    tGlobalS: 0,
    position: initial.position,
    velocity: initial.velocity,
    label: '粒子从电场区左端由静止速度 v₀ 出发。',
  }, {
    id: 'a-exit',
    stage: 'electric-acceleration',
    kind: 'electric-exit',
    tGlobalS: arrival,
    position: exitAElectric.position,
    velocity: exitAElectric.velocity,
    label: '粒子到达电场边界，以连续状态进入磁场条带。',
  }];

  const handoffs: CompositeHandoff[] = [
    handoff('electric-acceleration', 'magnetic-strip', exitAElectric, entryBMagnetic, arrival),
  ];

  let screen: ElectricMagneticScreenSolution['screen'] = null;
  let timings: CompositeStageTimings;
  let outcome: CompositeOutcome;
  let solutionIssue: string | null = null;
  let driftStart: CompositeSnapshot | null = null;

  if (!magneticExit || !exitBMagnetic) {
    const durationS = arrival + tMagnetic;
    timings = { electricS: arrival, magneticS: tMagnetic, driftS: 0, totalS: durationS };
    outcome = magnetic.status === 'invalid' ? 'invalid' : 'magnetic-no-exit';
    solutionIssue = magnetic.issue ?? '磁场阶段在求解时间窗口内没有真实出场事件，因此不生成自由漂移或屏幕光斑。';
    const lastMagnetic = snapshot(
      input,
      'magnetic-strip',
      durationS,
      tMagnetic,
      magneticExit?.position ?? finiteFieldStateAt(magnetic, tMagnetic).position,
      magneticExit?.velocity ?? finiteFieldStateAt(magnetic, tMagnetic).velocity,
    );
    events.push({
      id: 'magnetic-no-exit',
      stage: 'magnetic-strip',
      kind: 'magnetic-no-exit',
      tGlobalS: durationS,
      position: lastMagnetic.position,
      velocity: lastMagnetic.velocity,
      label: solutionIssue,
    });
    const stateAt = makeStateAt(input, timings, electricState, magnetic, null);
    return {
      input,
      outcome,
      issue: solutionIssue,
      durationS,
      stageTimings: timings,
      magnetic,
      entryAElectric: initial,
      exitAElectric,
      entryBMagnetic,
      exitBMagnetic: null,
      screen: null,
      events,
      handoffs,
      trace: sampleTrace(stateAt, durationS),
      stateAt,
    };
  }

  events.push({
    id: 'b-exit',
    stage: 'magnetic-strip',
    kind: 'magnetic-exit',
    tGlobalS: arrival + tMagnetic,
    position: exitBMagnetic.position,
    velocity: exitBMagnetic.velocity,
    label: '粒子从磁场右边界（或真实出场边界）离开，状态连续进入无场区。',
  });
  driftStart = exitBMagnetic;
  const driftStartTime = arrival + tMagnetic;
  const entryCDrift = snapshot(
    input,
    'free-drift',
    driftStartTime,
    0,
    exitBMagnetic.position,
    exitBMagnetic.velocity,
  );
  handoffs.push(handoff('magnetic-strip', 'free-drift', exitBMagnetic, entryCDrift, driftStartTime));
  const screenX = input.boundaryXM + input.magneticWidthM + input.screenGapM;
  const vx = exitBMagnetic.velocity.x;

  if (vx > 1e-12 && screenX > exitBMagnetic.position.x) {
    const driftS = (screenX - exitBMagnetic.position.x) / vx;
    const hitPosition = add(exitBMagnetic.position, scale(exitBMagnetic.velocity, driftS));
    const accepted = Math.abs(hitPosition.y) <= input.screenHalfHeightM + 1e-12;
    const hitTime = driftStartTime + driftS;
    const hitSnapshot = snapshot(input, 'free-drift', hitTime, driftS, hitPosition, exitBMagnetic.velocity);
    screen = {
      timeS: hitTime,
      position: hitPosition,
      velocity: { ...exitBMagnetic.velocity },
      snapshot: hitSnapshot,
      accepted,
    };
    timings = { electricS: arrival, magneticS: tMagnetic, driftS, totalS: hitTime };
    outcome = accepted ? 'screen-hit' : 'screen-outside';
    if (!accepted) solutionIssue = '粒子到达屏幕所在直线，但落点超出屏幕有效高度；不显示为有效光斑。';
    events.push({
      id: accepted ? 'screen-hit' : 'screen-outside',
      stage: 'free-drift',
      kind: accepted ? 'screen-hit' : 'screen-outside',
      tGlobalS: hitTime,
      position: hitPosition,
      velocity: hitSnapshot.velocity,
      label: accepted ? '粒子命中探测屏的有效接收区。' : '粒子到达屏幕直线但落点超出有效接收区。',
    });
  } else {
    const driftS = 1.5;
    timings = { electricS: arrival, magneticS: tMagnetic, driftS, totalS: driftStartTime + driftS };
    outcome = 'screen-missed';
    solutionIssue = '出场速度不指向屏幕或屏幕位于粒子后方，后续未出现屏幕命中事件。';
    events.push({
      id: 'screen-missed',
      stage: 'free-drift',
      kind: 'screen-missed',
      tGlobalS: driftStartTime,
      position: exitBMagnetic.position,
      velocity: exitBMagnetic.velocity,
      label: solutionIssue,
    });
  }

  const stateAt = makeStateAt(input, timings, electricState, magnetic, driftStart);
  const blocked = handoffs.some((item) => item.status !== 'continuous');
  if (blocked) {
    outcome = 'invalid';
    solutionIssue = '阶段交接未通过连续性检查，已停止将后续轨迹视为同一整题。';
  }
  return {
    input,
    outcome,
    issue: solutionIssue,
    durationS: timings.totalS,
    stageTimings: timings,
    magnetic,
    entryAElectric: initial,
    exitAElectric,
    entryBMagnetic,
    exitBMagnetic,
    screen,
    events: events.sort((left, right) => left.tGlobalS - right.tGlobalS),
    handoffs,
    trace: sampleTrace(stateAt, timings.totalS),
    stateAt,
  };
}

export function verifyCompositeContinuity(
  solution: ElectricMagneticScreenSolution,
  positionToleranceM = HANDOFF_TOLERANCE_M,
  velocityToleranceMps = HANDOFF_TOLERANCE_V,
  timeToleranceS = HANDOFF_TOLERANCE_T,
): boolean {
  return solution.handoffs.length === 2
    && solution.handoffs.every((item) =>
      item.status === 'continuous' &&
      item.positionErrorM <= positionToleranceM &&
      item.velocityErrorMps <= velocityToleranceMps &&
      item.timeErrorS <= timeToleranceS);
}

export function compositeScreenX(input: ElectricMagneticScreenInput): number {
  return input.boundaryXM + input.magneticWidthM + input.screenGapM;
}

export function compositeExitSpeedAnchor(input: ElectricMagneticScreenInput): number | null {
  const solution = solveElectricMagneticScreen(input);
  return solution.exitAElectric?.speedMps ?? null;
}

export function compositeMagneticWorkCheck(solution: ElectricMagneticScreenSolution): number | null {
  if (!solution.entryBMagnetic || !solution.exitBMagnetic) return null;
  return Math.abs(solution.exitBMagnetic.speedMps - solution.entryBMagnetic.speedMps);
}

export function compositeElectricWorkCheck(solution: ElectricMagneticScreenSolution): number | null {
  if (!solution.entryAElectric || !solution.exitAElectric) return null;
  return solution.exitAElectric.kineticEnergyJ - solution.entryAElectric.kineticEnergyJ;
}

export { HANDOFF_TOLERANCE_M, HANDOFF_TOLERANCE_V, HANDOFF_TOLERANCE_T };
