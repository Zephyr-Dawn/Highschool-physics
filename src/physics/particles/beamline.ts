import { length, type Vec2 } from '../core/vec2';

export type BeamRegionKind = 'free' | 'acceleration' | 'selector' | 'analyzer' | 'deflector';

export interface BeamAccelerationConfig {
  enabled: boolean;
  x0: number;
  x1: number;
  Ex: number;
}

export interface BeamSelectorConfig {
  x0: number;
  x1: number;
  Ey: number;
  Bz: number;
}

export interface BeamAnalyzerConfig {
  x0: number;
  x1: number;
  Bz: number;
}

export interface BeamDeflectorConfig {
  x0: number;
  x1: number;
  Ey: number;
}

export interface BeamSlitConfig {
  x: number;
  yCenter: number;
  halfWidth: number;
}

export interface BeamScreenConfig {
  x: number;
  yMin: number;
  yMax: number;
}

export interface BeamlineApparatus {
  acceleration: BeamAccelerationConfig;
  selector: BeamSelectorConfig;
  analyzer: BeamAnalyzerConfig;
  deflector: BeamDeflectorConfig;
  entranceSlit: BeamSlitConfig;
  exitSlit: BeamSlitConfig;
  screen: BeamScreenConfig;
}

export interface BeamRegion {
  id: string;
  label: string;
  kind: BeamRegionKind;
  x0: number;
  x1: number;
  Ex: number;
  Ey: number;
  Bz: number;
}

export interface BeamlineInput {
  massKg: number;
  chargeC: number;
  initialPosition: Vec2;
  initialVelocity: Vec2;
  apparatus: BeamlineApparatus;
  maxTimeS?: number;
  maxEvents?: number;
}

export type BeamEventKind =
  | 'start'
  | 'enter-region'
  | 'leave-region'
  | 'slit-pass'
  | 'absorbed-at-slit'
  | 'screen-hit'
  | 'screen-outside'
  | 'turning'
  | 'tangent'
  | 'time-limited'
  | 'event-limited';

export type BeamOutcome =
  | 'screen-hit'
  | 'screen-outside'
  | 'absorbed'
  | 'not-arrived'
  | 'event-limited'
  | 'invalid';

export interface BeamEvent {
  timeS: number;
  kind: BeamEventKind;
  position: Vec2;
  velocity: Vec2;
  regionBefore: string;
  regionAfter: string;
  objectIds: string[];
  explanation: string;
}

export interface BeamSegment {
  regionId: string;
  regionLabel: string;
  regionKind: BeamRegionKind;
  Ex: number;
  Ey: number;
  Bz: number;
  startTimeS: number;
  endTimeS: number;
  startPosition: Vec2;
  startVelocity: Vec2;
  workAtStartJ: number;
}

export interface BeamState {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  regionId: string;
  regionLabel: string;
  regionKind: BeamRegionKind;
  Ex: number;
  Ey: number;
  Bz: number;
  forceE: Vec2;
  forceB: Vec2;
  force: Vec2;
  acceleration: Vec2;
  speed: number;
  kineticEnergyJ: number;
  workJ: number;
  energyResidualJ: number;
  segmentIndex: number;
  selectorMatched: boolean;
}

export interface BeamDetection {
  xHit: number;
  yHit: number;
  localTimeS: number;
  velocity: Vec2;
  speed: number;
  kineticEnergyJ: number;
}

export interface BeamAbsorption {
  slitId: string;
  timeS: number;
  position: Vec2;
  velocity: Vec2;
}

export interface BeamSelectorMatch {
  timeS: number;
  position: Vec2;
  velocity: Vec2;
  driftVelocity: Vec2 | null;
  matched: boolean;
}

export interface BeamlineSolution {
  input: BeamlineInput;
  apparatus: BeamlineApparatus;
  regions: BeamRegion[];
  segments: BeamSegment[];
  events: BeamEvent[];
  outcome: BeamOutcome;
  detection: BeamDetection | null;
  screenCrossing: BeamDetection | null;
  absorption: BeamAbsorption | null;
  selectorMatch: BeamSelectorMatch | null;
  finalState: BeamState;
  durationS: number;
  issue: string | null;
  eventLimited: boolean;
  timeLimited: boolean;
}

interface NamedSlit extends BeamSlitConfig {
  id: 'entrance' | 'exit';
  label: string;
}

interface Kinematics {
  position: Vec2;
  velocity: Vec2;
}

interface RegionMotion {
  region: BeamRegion;
  startPosition: Vec2;
  startVelocity: Vec2;
  omega: number;
  acceleration: Vec2;
  drift: Vec2 | null;
  relativeVelocity: Vec2;
}

interface PlaneCandidate {
  x: number;
  timeS: number;
  kind: 'crossing' | 'tangent' | 'turning';
  isBoundary: boolean;
  nextRegion: BeamRegion | null;
  slits: NamedSlit[];
  isScreen: boolean;
}

const OUTER_X = 1e7;
const B_EPS = 1e-12;
const OMEGA_EPS = 1e-12;
const VELOCITY_EPS = 1e-12;
const DEFAULT_MAX_TIME = 20;
const MAX_TIME = 120;
const DEFAULT_MAX_EVENTS = 200;
const MAX_EVENTS = 1000;

function nz(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function finiteVec(value: Vec2 | null | undefined): value is Vec2 {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function geometryTolerance(apparatus: BeamlineApparatus): number {
  const values = [
    1,
    apparatus.acceleration.x0,
    apparatus.acceleration.x1,
    apparatus.selector.x0,
    apparatus.selector.x1,
    apparatus.analyzer.x0,
    apparatus.analyzer.x1,
    apparatus.deflector.x0,
    apparatus.deflector.x1,
    apparatus.entranceSlit.x,
    apparatus.exitSlit.x,
    apparatus.screen.x,
  ].map((value) => Math.abs(value));
  return Math.max(1e-10, Math.max(...values) * 1e-9);
}

function apertureTolerance(slit: BeamSlitConfig): number {
  return Math.max(1e-10, Math.max(1, Math.abs(slit.yCenter), slit.halfWidth) * 1e-9);
}

function timeTolerance(maxTimeS: number): number {
  return Math.max(1e-11, Math.abs(maxTimeS) * 1e-10);
}

function stageError(
  label: string,
  x0: number,
  x1: number,
): string | null {
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) return `${label}的边界包含无效数值。`;
  if (!(x1 > x0)) return `${label}的右边界必须大于左边界。`;
  return null;
}

export function validateBeamlineApparatus(apparatus: BeamlineApparatus): string | null {
  if (!apparatus || typeof apparatus !== 'object') return '束线装置配置缺失。';
  const acceleration = apparatus.acceleration;
  const selector = apparatus.selector;
  const analyzer = apparatus.analyzer;
  const deflector = apparatus.deflector;
  const entrance = apparatus.entranceSlit;
  const exit = apparatus.exitSlit;
  const screen = apparatus.screen;
  if (![acceleration, selector, analyzer, deflector, entrance, exit, screen].every((item) => item && typeof item === 'object')) {
    return '束线装置配置不完整。';
  }
  if (!Number.isFinite(acceleration.Ex)) return '加速区电场包含无效数值。';
  if (!Number.isFinite(selector.Ey) || !Number.isFinite(selector.Bz)) return '速度选择器场包含无效数值。';
  if (!Number.isFinite(analyzer.Bz)) return '磁分析区磁场包含无效数值。';
  if (!Number.isFinite(deflector.Ey)) return '末段电场包含无效数值。';
  if (
    Math.abs(acceleration.Ex) > 1e6
    || Math.abs(selector.Ey) > 1e6
    || Math.abs(deflector.Ey) > 1e6
    || Math.abs(selector.Bz) > 100
    || Math.abs(analyzer.Bz) > 100
  ) {
    return '束线场强超出稳定计算范围。';
  }
  const selectorError = stageError('速度选择器', selector.x0, selector.x1);
  if (selectorError) return selectorError;
  const analyzerError = stageError('磁分析区', analyzer.x0, analyzer.x1);
  if (analyzerError) return analyzerError;
  const deflectorError = stageError('末段偏转区', deflector.x0, deflector.x1);
  if (deflectorError) return deflectorError;
  if (selector.x1 > analyzer.x0) return '速度选择器与磁分析区不能重叠。';
  if (analyzer.x1 > deflector.x0) return '磁分析区与末段电场不能重叠。';
  if (acceleration.enabled) {
    const accelerationError = stageError('加速区', acceleration.x0, acceleration.x1);
    if (accelerationError) return accelerationError;
    if (acceleration.x1 > selector.x0) return '加速区与速度选择器不能重叠。';
  }
  for (const [label, slit] of [['入口狭缝', entrance], ['出口狭缝', exit]] as const) {
    if (!Number.isFinite(slit.x) || !Number.isFinite(slit.yCenter) || !Number.isFinite(slit.halfWidth)) {
      return `${label}包含无效数值。`;
    }
    if (!(slit.halfWidth > 0)) return `${label}开口半宽必须为正数。`;
  }
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.yMin) || !Number.isFinite(screen.yMax)) {
    return '屏幕位置或有效高度包含无效数值。';
  }
  if (!(screen.yMax > screen.yMin)) return '屏幕有效高度上限必须大于下限。';
  const xValues = [
    acceleration.x0,
    acceleration.x1,
    selector.x0,
    selector.x1,
    analyzer.x0,
    analyzer.x1,
    deflector.x0,
    deflector.x1,
    entrance.x,
    exit.x,
    screen.x,
  ];
  if (xValues.some((value) => Math.abs(value) > 1e6)) return '束线位置超出稳定计算范围。';
  if ([entrance.yCenter, exit.yCenter, screen.yMin, screen.yMax].some((value) => Math.abs(value) > 1e6)) {
    return '狭缝或屏幕坐标超出稳定计算范围。';
  }
  if (entrance.halfWidth > 1e3 || exit.halfWidth > 1e3) return '狭缝开口半宽超出稳定计算范围。';
  if (screen.x < deflector.x1) return '屏幕必须位于末段电场右边界或其下游。';
  return null;
}

export function selectorDriftVelocity(selector: Pick<BeamSelectorConfig, 'Ey' | 'Bz'>): Vec2 | null {
  if (!Number.isFinite(selector.Ey) || !Number.isFinite(selector.Bz) || Math.abs(selector.Bz) <= B_EPS) {
    return null;
  }
  return { x: selector.Ey / selector.Bz, y: 0 };
}

function regionLabel(kind: BeamRegionKind): string {
  if (kind === 'acceleration') return '加速区';
  if (kind === 'selector') return '速度选择器';
  if (kind === 'analyzer') return '磁分析区';
  if (kind === 'deflector') return '末段电偏转区';
  return '自由飞行区';
}

function pushFreeRegion(
  regions: BeamRegion[],
  x0: number,
  x1: number,
  index: number,
  leftmost: boolean,
  rightmost: boolean,
): void {
  const id = leftmost ? 'free-left' : rightmost ? 'free-right' : `free-gap-${index}`;
  regions.push({ id, label: regionLabel('free'), kind: 'free', x0, x1, Ex: 0, Ey: 0, Bz: 0 });
}

export function buildBeamlineRegions(apparatus: BeamlineApparatus): BeamRegion[] {
  if (validateBeamlineApparatus(apparatus)) return [];
  const stages: Array<{ kind: BeamRegionKind; id: string; x0: number; x1: number; Ex: number; Ey: number; Bz: number }> = [];
  if (apparatus.acceleration.enabled) {
    stages.push({
      kind: 'acceleration',
      id: 'acceleration',
      x0: apparatus.acceleration.x0,
      x1: apparatus.acceleration.x1,
      Ex: apparatus.acceleration.Ex,
      Ey: 0,
      Bz: 0,
    });
  }
  stages.push({
    kind: 'selector',
    id: 'selector',
    x0: apparatus.selector.x0,
    x1: apparatus.selector.x1,
    Ex: 0,
    Ey: apparatus.selector.Ey,
    Bz: apparatus.selector.Bz,
  });
  stages.push({
    kind: 'analyzer',
    id: 'analyzer',
    x0: apparatus.analyzer.x0,
    x1: apparatus.analyzer.x1,
    Ex: 0,
    Ey: 0,
    Bz: apparatus.analyzer.Bz,
  });
  stages.push({
    kind: 'deflector',
    id: 'deflector',
    x0: apparatus.deflector.x0,
    x1: apparatus.deflector.x1,
    Ex: 0,
    Ey: apparatus.deflector.Ey,
    Bz: 0,
  });
  stages.sort((a, b) => a.x0 - b.x0);
  const boundaryValues = [OUTER_X, -OUTER_X];
  for (const stage of stages) boundaryValues.push(stage.x0, stage.x1);
  const boundaries = [...new Set(boundaryValues)].sort((a, b) => a - b);
  const regions: BeamRegion[] = [];
  let gapIndex = 0;
  for (let index = 0; index < boundaries.length - 1; index++) {
    const x0 = boundaries[index];
    const x1 = boundaries[index + 1];
    if (!(x1 > x0)) continue;
    const mid = (x0 + x1) / 2;
    const stage = stages.find((item) => mid > item.x0 && mid < item.x1);
    if (stage) {
      regions.push({
        id: stage.id,
        label: regionLabel(stage.kind),
        kind: stage.kind,
        x0,
        x1,
        Ex: stage.Ex,
        Ey: stage.Ey,
        Bz: stage.Bz,
      });
    } else {
      const firstStage = stages[0];
      const lastStage = stages[stages.length - 1];
      const leftmost = firstStage ? Math.abs(x1 - firstStage.x0) <= 1e-12 : index === 0;
      const rightmost = lastStage ? Math.abs(x0 - lastStage.x1) <= 1e-12 : index === boundaries.length - 2;
      pushFreeRegion(regions, x0, x1, gapIndex++, leftmost, rightmost);
    }
  }
  return regions;
}

function initialRegion(
  regions: BeamRegion[],
  position: Vec2,
  velocity: Vec2,
): BeamRegion {
  if (regions.length === 0) {
    return { id: 'free', label: regionLabel('free'), kind: 'free', x0: -OUTER_X, x1: OUTER_X, Ex: 0, Ey: 0, Bz: 0 };
  }
  const tol = Math.max(1e-9, Math.abs(position.x) * 1e-9);
  for (const region of regions) {
    if (position.x > region.x0 + tol && position.x < region.x1 - tol) return region;
  }
  if (velocity.x < -VELOCITY_EPS) {
    const left = regions.find((region) => Math.abs(region.x1 - position.x) <= tol);
    if (left) return left;
  } else {
    const right = regions.find((region) => Math.abs(region.x0 - position.x) <= tol);
    if (right) return right;
  }
  return regions.find((region) => position.x >= region.x0 && position.x <= region.x1) ?? regions[0];
}

function regionOnSide(
  regions: BeamRegion[],
  x: number,
  velocityX: number,
): BeamRegion | null {
  const tol = Math.max(1e-9, Math.abs(x) * 1e-9);
  if (velocityX > VELOCITY_EPS) {
    return regions.find((region) => Math.abs(region.x0 - x) <= tol && region.x1 > x + tol) ?? null;
  }
  if (velocityX < -VELOCITY_EPS) {
    return regions.find((region) => Math.abs(region.x1 - x) <= tol && region.x0 < x - tol) ?? null;
  }
  return null;
}

function motionFor(
  region: BeamRegion,
  startPosition: Vec2,
  startVelocity: Vec2,
  chargeC: number,
  massKg: number,
): RegionMotion {
  const acceleration = {
    x: (chargeC * region.Ex) / massKg,
    y: (chargeC * region.Ey) / massKg,
  };
  const omega = -(chargeC * region.Bz) / massKg;
  const drift = Math.abs(region.Bz) > B_EPS
    ? { x: region.Ey / region.Bz, y: -region.Ex / region.Bz }
    : null;
  const relativeVelocity = drift
    ? { x: startVelocity.x - drift.x, y: startVelocity.y - drift.y }
    : { x: 0, y: 0 };
  return {
    region,
    startPosition: { ...startPosition },
    startVelocity: { ...startVelocity },
    omega,
    acceleration,
    drift,
    relativeVelocity,
  };
}

function kinematics(motion: RegionMotion, relativeTimeS: number): Kinematics {
  const t = Math.max(0, relativeTimeS);
  if (Math.abs(motion.omega) < OMEGA_EPS) {
    const a = motion.acceleration;
    return {
      position: {
        x: motion.startPosition.x + motion.startVelocity.x * t + 0.5 * a.x * t * t,
        y: motion.startPosition.y + motion.startVelocity.y * t + 0.5 * a.y * t * t,
      },
      velocity: {
        x: motion.startVelocity.x + a.x * t,
        y: motion.startVelocity.y + a.y * t,
      },
    };
  }
  const omega = motion.omega;
  if (Math.abs(omega * t) < 1e-3) {
    const v0 = motion.startVelocity;
    const a = motion.acceleration;
    const jv0 = { x: -v0.y, y: v0.x };
    const ja = { x: -a.y, y: a.x };
    return {
      position: {
        x: motion.startPosition.x + v0.x * t + a.x * t * t / 2
          + omega * (jv0.x * t * t / 2 + ja.x * t ** 3 / 6)
          - omega * omega * (v0.x * t ** 4 / 24 + a.x * t ** 5 / 120),
        y: motion.startPosition.y + v0.y * t + a.y * t * t / 2
          + omega * (jv0.y * t * t / 2 + ja.y * t ** 3 / 6)
          - omega * omega * (v0.y * t ** 4 / 24 + a.y * t ** 5 / 120),
      },
      velocity: {
        x: v0.x + a.x * t + omega * (jv0.x * t + ja.x * t * t / 2)
          - omega * omega * (v0.x * t ** 3 / 6 + a.x * t ** 4 / 24),
        y: v0.y + a.y * t + omega * (jv0.y * t + ja.y * t * t / 2)
          - omega * omega * (v0.y * t ** 3 / 6 + a.y * t ** 4 / 24),
      },
    };
  }
  const drift = motion.drift ?? { x: 0, y: 0 };
  const w = motion.relativeVelocity;
  const angle = omega * t;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const jw = { x: -w.y, y: w.x };
  return {
    position: {
      x: motion.startPosition.x + drift.x * t + (sin / omega) * w.x + ((1 - cos) / omega) * jw.x,
      y: motion.startPosition.y + drift.y * t + (sin / omega) * w.y + ((1 - cos) / omega) * jw.y,
    },
    velocity: {
      x: drift.x + w.x * cos - w.y * sin,
      y: drift.y + w.x * sin + w.y * cos,
    },
  };
}

function extremaTimes(motion: RegionMotion, horizonS: number): number[] {
  const times: number[] = [];
  if (horizonS <= 0) return times;
  if (Math.abs(motion.omega) < OMEGA_EPS) {
    if (Math.abs(motion.acceleration.x) > 1e-14) {
      const time = -motion.startVelocity.x / motion.acceleration.x;
      if (Number.isFinite(time) && time > 1e-10 && time < horizonS) times.push(time);
    }
  } else {
    const driftX = motion.drift?.x ?? 0;
    const amplitude = Math.hypot(motion.relativeVelocity.x, motion.relativeVelocity.y);
    if (amplitude > 1e-14) {
      const ratio = -driftX / amplitude;
      if (ratio >= -1 - 1e-12 && ratio <= 1 + 1e-12) {
        const theta = Math.acos(Math.max(-1, Math.min(1, ratio)));
        const phase = Math.atan2(-motion.relativeVelocity.y, motion.relativeVelocity.x);
        const period = (2 * Math.PI) / Math.abs(motion.omega);
        const bases = [(phase + theta) / motion.omega, (phase - theta) / motion.omega];
        const repeats = Math.ceil(horizonS / period) + 2;
        for (const base of bases) {
          if (!Number.isFinite(base)) continue;
          for (let index = -repeats; index <= repeats; index++) {
            const time = base + index * period;
            if (time > 1e-10 && time < horizonS) times.push(time);
          }
        }
      }
    }
  }
  times.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const time of times) {
    if (unique.length === 0 || time - unique[unique.length - 1] > 1e-9) unique.push(time);
  }
  return unique;
}

function xAt(motion: RegionMotion, timeS: number): number {
  return kinematics(motion, timeS).position.x;
}

function planeCrossingTime(
  motion: RegionMotion,
  targetX: number,
  horizonS: number,
  minRelativeTimeS: number,
): number | null {
  if (!Number.isFinite(targetX) || horizonS <= minRelativeTimeS) return null;
  const breakpoints = [0, ...extremaTimes(motion, horizonS), horizonS];
  for (let index = 0; index < breakpoints.length - 1; index++) {
    const lo = breakpoints[index];
    const hi = breakpoints[index + 1];
    if (hi - lo <= 1e-13) continue;
    const fLo = xAt(motion, lo) - targetX;
    const fHi = xAt(motion, hi) - targetX;
    if (Math.abs(fLo) <= 1e-12 || Math.abs(fHi) <= 1e-12) continue;
    if (fLo * fHi > 0) continue;
    let a = lo;
    let b = hi;
    let fa = fLo;
    let root = (a + b) / 2;
    for (let iteration = 0; iteration < 100; iteration++) {
      root = (a + b) / 2;
      const fm = xAt(motion, root) - targetX;
      if (Math.abs(fm) <= 1e-13) break;
      if ((fa < 0) !== (fm < 0)) {
        b = root;
      } else {
        a = root;
        fa = fm;
      }
    }
    if (root > minRelativeTimeS) return root;
  }
  return null;
}

function selectorMatchedAt(
  region: BeamRegion,
  velocity: Vec2,
  chargeC: number,
  massKg: number,
): boolean {
  if (region.kind !== 'selector' || Math.abs(chargeC) <= 1e-30) return false;
  if (!(massKg > 0)) return false;
  const drift = selectorDriftVelocity(region);
  if (!drift) return false;
  const difference = Math.hypot(velocity.x - drift.x, velocity.y - drift.y);
  return difference <= 1e-8 * Math.max(1, length(velocity), length(drift));
}

function stateFromMotion(
  motion: RegionMotion,
  relativeTimeS: number,
  workAtStartJ: number,
  chargeC: number,
  massKg: number,
  initialKineticEnergyJ: number,
  segmentIndex: number,
): BeamState {
  const t = Math.max(0, relativeTimeS);
  const { position, velocity } = kinematics(motion, t);
  const region = motion.region;
  const forceE = { x: chargeC * region.Ex, y: chargeC * region.Ey };
  const forceB = Math.abs(region.Bz) <= B_EPS
    ? { x: 0, y: 0 }
    : {
        x: chargeC * velocity.y * region.Bz,
        y: -chargeC * velocity.x * region.Bz,
      };
  const force = { x: nz(forceE.x + forceB.x), y: nz(forceE.y + forceB.y) };
  const speed = length(velocity);
  const kineticEnergyJ = 0.5 * massKg * speed * speed;
  const electricWorkJ = chargeC * (
    region.Ex * (position.x - motion.startPosition.x) +
    region.Ey * (position.y - motion.startPosition.y)
  );
  const workJ = workAtStartJ + electricWorkJ;
  return {
    timeS: t,
    position,
    velocity,
    regionId: region.id,
    regionLabel: region.label,
    regionKind: region.kind,
    Ex: region.Ex,
    Ey: region.Ey,
    Bz: region.Bz,
    forceE,
    forceB,
    force,
    acceleration: { x: force.x / massKg, y: force.y / massKg },
    speed,
    kineticEnergyJ,
    workJ,
    energyResidualJ: kineticEnergyJ - initialKineticEnergyJ - workJ,
    segmentIndex,
    selectorMatched: selectorMatchedAt(region, velocity, chargeC, massKg),
  };
}

function invalidState(position: Vec2, velocity: Vec2, finalTimeS = 0): BeamState {
  const massKg = 1;
  const speed = length(velocity);
  return {
    timeS: finalTimeS,
    position,
    velocity,
    regionId: 'invalid',
    regionLabel: '无效输入',
    regionKind: 'free',
    Ex: 0,
    Ey: 0,
    Bz: 0,
    forceE: { x: 0, y: 0 },
    forceB: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    speed,
    kineticEnergyJ: 0.5 * massKg * speed * speed,
    workJ: 0,
    energyResidualJ: 0,
    segmentIndex: 0,
    selectorMatched: false,
  };
}

function invalidSolution(input: BeamlineInput, issue: string): BeamlineSolution {
  const position = finiteVec(input?.initialPosition) ? { ...input.initialPosition } : { x: 0, y: 0 };
  const velocity = finiteVec(input?.initialVelocity) ? { ...input.initialVelocity } : { x: 0, y: 0 };
  const safeInput: BeamlineInput = {
    massKg: finiteNumber(input?.massKg) && input.massKg > 0 ? input.massKg : 1,
    chargeC: finiteNumber(input?.chargeC) ? input.chargeC : 0,
    initialPosition: position,
    initialVelocity: velocity,
    apparatus: input?.apparatus ?? {
      acceleration: { enabled: false, x0: -2, x1: -1, Ex: 0 },
      selector: { x0: 0, x1: 1, Ey: 0, Bz: 0 },
      analyzer: { x0: 1, x1: 2, Bz: 0 },
      deflector: { x0: 2, x1: 3, Ey: 0 },
      entranceSlit: { x: 0, yCenter: 0, halfWidth: 0.1 },
      exitSlit: { x: 1, yCenter: 0, halfWidth: 0.1 },
      screen: { x: 4, yMin: -1, yMax: 1 },
    },
    maxTimeS: finiteNumber(input?.maxTimeS) ? input.maxTimeS : DEFAULT_MAX_TIME,
    maxEvents: finiteNumber(input?.maxEvents) ? input.maxEvents : DEFAULT_MAX_EVENTS,
  };
  return {
    input: safeInput,
    apparatus: safeInput.apparatus,
    regions: [],
    segments: [],
    events: [],
    outcome: 'invalid',
    detection: null,
    screenCrossing: null,
    absorption: null,
    selectorMatch: null,
    finalState: invalidState(position, velocity),
    durationS: 0,
    issue,
    eventLimited: false,
    timeLimited: false,
  };
}

function normalizeInput(inputValue: BeamlineInput): { input: BeamlineInput; issue: string | null } {
  if (!inputValue || typeof inputValue !== 'object') {
    return { input: inputValue, issue: '束线输入缺失。' };
  }
  if (!Number.isFinite(inputValue.massKg) || inputValue.massKg <= 0) {
    return { input: inputValue, issue: '粒子质量必须为正数。' };
  }
  if (!Number.isFinite(inputValue.chargeC)) {
    return { input: inputValue, issue: '粒子电荷量必须是有限数值。' };
  }
  if (!finiteVec(inputValue.initialPosition) || !finiteVec(inputValue.initialVelocity)) {
    return { input: inputValue, issue: '粒子初位置或初速度包含无效数值。' };
  }
  const apparatusIssue = validateBeamlineApparatus(inputValue.apparatus);
  if (apparatusIssue) return { input: inputValue, issue: apparatusIssue };
  const maxTimeS = Number.isFinite(inputValue.maxTimeS)
    ? Math.max(0.1, Math.min(MAX_TIME, inputValue.maxTimeS as number))
    : DEFAULT_MAX_TIME;
  const maxEvents = Number.isFinite(inputValue.maxEvents)
    ? Math.max(1, Math.min(MAX_EVENTS, Math.floor(inputValue.maxEvents as number)))
    : DEFAULT_MAX_EVENTS;
  return {
    input: {
      ...inputValue,
      initialPosition: { ...inputValue.initialPosition },
      initialVelocity: { ...inputValue.initialVelocity },
      maxTimeS,
      maxEvents,
    },
    issue: null,
  };
}

function namedSlits(apparatus: BeamlineApparatus): NamedSlit[] {
  return [
    { ...apparatus.entranceSlit, id: 'entrance', label: '入口狭缝' },
    { ...apparatus.exitSlit, id: 'exit', label: '出口狭缝' },
  ];
}

function addPlane(planes: number[], value: number, tolerance: number): void {
  if (planes.some((plane) => Math.abs(plane - value) <= tolerance)) return;
  planes.push(value);
}

function detectionFromState(state: BeamState, xHit: number): BeamDetection {
  return {
    xHit,
    yHit: state.position.y,
    localTimeS: state.timeS,
    velocity: { ...state.velocity },
    speed: state.speed,
    kineticEnergyJ: state.kineticEnergyJ,
  };
}

export function solveBeamlineTrajectory(inputValue: BeamlineInput): BeamlineSolution {
  const normalized = normalizeInput(inputValue);
  if (normalized.issue) return invalidSolution(inputValue, normalized.issue);
  const input = normalized.input;
  const apparatus = input.apparatus;
  const regions = buildBeamlineRegions(apparatus);
  if (regions.length === 0) return invalidSolution(input, '束线区域无法构建。');
  const massKg = input.massKg;
  const chargeC = input.chargeC;
  const maxTimeS = input.maxTimeS ?? DEFAULT_MAX_TIME;
  const maxEvents = input.maxEvents ?? DEFAULT_MAX_EVENTS;
  const geomTol = geometryTolerance(apparatus);
  const timeTol = timeTolerance(maxTimeS);
  const slits = namedSlits(apparatus);
  const initialKineticEnergyJ = 0.5 * massKg * length(input.initialVelocity) ** 2;
  const segments: BeamSegment[] = [];
  const events: BeamEvent[] = [];
  let currentRegion = initialRegion(regions, input.initialPosition, input.initialVelocity);
  let currentTime = 0;
  let currentPosition = { ...input.initialPosition };
  let currentVelocity = { ...input.initialVelocity };
  let segmentStartTime = 0;
  let segmentStartPosition = { ...currentPosition };
  let segmentStartVelocity = { ...currentVelocity };
  let segmentStartWork = 0;
  let outcome: BeamOutcome = 'not-arrived';
  let detection: BeamDetection | null = null;
  let screenCrossing: BeamDetection | null = null;
  let absorption: BeamAbsorption | null = null;
  let selectorMatch: BeamSelectorMatch | null = null;
  let issue: string | null = null;
  let eventLimited = false;
  let timeLimited = false;
  let durationS = 0;

  if (!Number.isFinite(currentPosition.x) || !Number.isFinite(currentPosition.y)) {
    return invalidSolution(input, '粒子初位置包含无效数值。');
  }

  const registerSelectorMatch = () => {
    if (selectorMatch || currentRegion.kind !== 'selector') return;
    selectorMatch = {
      timeS: currentTime,
      position: { ...currentPosition },
      velocity: { ...currentVelocity },
      driftVelocity: selectorDriftVelocity(currentRegion),
      matched: selectorMatchedAt(currentRegion, currentVelocity, chargeC, massKg),
    };
  };

  const initialSlit = slits.find(
    (slit) => Math.abs(slit.x - currentPosition.x) <= geomTol
      && Math.abs(currentPosition.y - slit.yCenter) > slit.halfWidth + apertureTolerance(slit),
  );
  if (initialSlit) {
    absorption = {
      slitId: initialSlit.id,
      timeS: 0,
      position: { ...currentPosition },
      velocity: { ...currentVelocity },
    };
    events.push({
      timeS: 0,
      kind: 'absorbed-at-slit',
      position: { ...currentPosition },
      velocity: { ...currentVelocity },
      regionBefore: currentRegion.id,
      regionAfter: 'absorbed',
      objectIds: [initialSlit.id],
      explanation: `粒子起点落在${initialSlit.label}的吸收板上。`,
    });
    outcome = 'absorbed';
    issue = `${initialSlit.label}的吸收板终止了粒子。`;
    durationS = 0;
  }

  const appendSegment = (
    endTimeS: number,
    endPosition: Vec2,
  ): number => {
    const region = currentRegion;
    const electricWork = chargeC * (
      region.Ex * (endPosition.x - segmentStartPosition.x) +
      region.Ey * (endPosition.y - segmentStartPosition.y)
    );
    const endWork = segmentStartWork + electricWork;
    if (endTimeS > segmentStartTime + timeTol) {
      segments.push({
        regionId: region.id,
        regionLabel: region.label,
        regionKind: region.kind,
        Ex: region.Ex,
        Ey: region.Ey,
        Bz: region.Bz,
        startTimeS: segmentStartTime,
        endTimeS,
        startPosition: { ...segmentStartPosition },
        startVelocity: { ...segmentStartVelocity },
        workAtStartJ: segmentStartWork,
      });
    }
    return endWork;
  };

  if (!absorption) {
    registerSelectorMatch();
    for (let iteration = 0; iteration <= maxEvents; iteration++) {
      if (events.length >= maxEvents) {
        eventLimited = true;
        outcome = 'event-limited';
        issue = '达到事件数量上限，求解被截断。';
        durationS = currentTime;
        break;
      }
      if (currentTime >= maxTimeS - timeTol) {
        timeLimited = true;
        outcome = 'not-arrived';
        issue = '在时间窗口内未到达屏幕，也未撞上吸收板。';
        durationS = maxTimeS;
        break;
      }
      const motion = motionFor(currentRegion, currentPosition, currentVelocity, chargeC, massKg);
      const horizon = maxTimeS - currentTime;
      const minRelativeTime = Math.max(1e-10, timeTol);
      const planes: number[] = [];
      addPlane(planes, currentRegion.x0, geomTol);
      addPlane(planes, currentRegion.x1, geomTol);
      for (const slit of slits) addPlane(planes, slit.x, geomTol);
      addPlane(planes, apparatus.screen.x, geomTol);
      const candidates: PlaneCandidate[] = [];
      for (const planeX of planes) {
        if (Math.abs(planeX) >= OUTER_X - 1) continue;
        const relativeTime = planeCrossingTime(motion, planeX, horizon, minRelativeTime);
        if (relativeTime === null) continue;
        const absoluteTime = currentTime + relativeTime;
        if (!Number.isFinite(absoluteTime) || absoluteTime <= currentTime + minRelativeTime) continue;
        const eventKinematics = kinematics(motion, relativeTime);
        const isBoundary = Math.abs(planeX - currentRegion.x0) <= geomTol
          || Math.abs(planeX - currentRegion.x1) <= geomTol;
        const nextRegion = isBoundary
          ? regionOnSide(regions, planeX, eventKinematics.velocity.x)
          : null;
        candidates.push({
          x: planeX,
          timeS: absoluteTime,
          kind: 'crossing',
          isBoundary: Boolean(isBoundary && nextRegion),
          nextRegion,
          slits: slits.filter((slit) => Math.abs(slit.x - planeX) <= geomTol),
          isScreen: Math.abs(apparatus.screen.x - planeX) <= geomTol,
        });
      }
      const tangentTolerance = Math.max(1e-9, geomTol * 5);
      for (const relativeExtremum of extremaTimes(motion, horizon)) {
        if (relativeExtremum <= minRelativeTime || relativeExtremum >= horizon - timeTol) continue;
        const extremumKinematics = kinematics(motion, relativeExtremum);
        if (Math.hypot(extremumKinematics.velocity.x, extremumKinematics.velocity.y) <= VELOCITY_EPS) continue;
        const boundary = [currentRegion.x0, currentRegion.x1]
          .filter((plane) => Math.abs(plane) < OUTER_X - 1)
          .find((plane) => Math.abs(extremumKinematics.position.x - plane) <= tangentTolerance);
        candidates.push({
          x: boundary ?? extremumKinematics.position.x,
          timeS: currentTime + relativeExtremum,
          kind: boundary === undefined ? 'turning' : 'tangent',
          isBoundary: false,
          nextRegion: null,
          slits: [],
          isScreen: false,
        });
      }
      if (candidates.length === 0) {
        const finalRelativeTime = maxTimeS - currentTime;
        const finalKinematics = kinematics(motion, finalRelativeTime);
        const finalWork = appendSegment(maxTimeS, finalKinematics.position);
        segmentStartTime = maxTimeS;
        segmentStartPosition = { ...finalKinematics.position };
        segmentStartVelocity = { ...finalKinematics.velocity };
        segmentStartWork = finalWork;
        currentTime = maxTimeS;
        currentPosition = { ...finalKinematics.position };
        currentVelocity = { ...finalKinematics.velocity };
        timeLimited = true;
        outcome = 'not-arrived';
        issue = '在时间窗口内未到达屏幕，也未撞上吸收板。';
        durationS = maxTimeS;
        break;
      }
      const candidatePriority = (candidate: PlaneCandidate): number => {
        if (candidate.isScreen) return 0;
        if (candidate.slits.length > 0) return 1;
        if (candidate.kind === 'crossing') return 2;
        if (candidate.kind === 'tangent') return 3;
        return 4;
      };
      candidates.sort((a, b) => a.timeS - b.timeS || candidatePriority(a) - candidatePriority(b));
      const earliest = candidates[0];
      const simultaneous = candidates.filter((candidate) => candidate.timeS - earliest.timeS <= timeTol);
      const chosen = simultaneous.find((candidate) => candidate.isScreen)
        ?? simultaneous.find((candidate) => candidate.slits.length > 0)
        ?? simultaneous.find((candidate) => candidate.kind === 'crossing')
        ?? simultaneous.find((candidate) => candidate.kind === 'tangent')
        ?? earliest;
      const relativeTime = chosen.timeS - currentTime;
      const eventKinematics = kinematics(motion, relativeTime);
      const eventTime = chosen.timeS;
      const eventPosition = eventKinematics.position;
      const eventVelocity = eventKinematics.velocity;
      const endWork = appendSegment(eventTime, eventPosition);

      if (chosen.kind === 'tangent' || chosen.kind === 'turning') {
        events.push({
          timeS: eventTime,
          kind: chosen.kind,
          position: { ...eventPosition },
          velocity: { ...eventVelocity },
          regionBefore: currentRegion.id,
          regionAfter: currentRegion.id,
          objectIds: [currentRegion.id],
          explanation: chosen.kind === 'tangent'
            ? `轨迹与${currentRegion.label}边界相切，未切换区域。`
            : '速度的 x 分量减为零并折返。',
        });
        currentTime = eventTime;
        currentPosition = { ...eventPosition };
        currentVelocity = { ...eventVelocity };
        segmentStartTime = eventTime;
        segmentStartPosition = { ...eventPosition };
        segmentStartVelocity = { ...eventVelocity };
        segmentStartWork = endWork;
        registerSelectorMatch();
        continue;
      }

      if (chosen.isScreen) {
        const state = stateFromMotion(
          motion,
          relativeTime,
          segmentStartWork,
          chargeC,
          massKg,
          initialKineticEnergyJ,
          Math.max(0, segments.length - 1),
        );
        const record = detectionFromState({ ...state, timeS: eventTime }, apparatus.screen.x);
        screenCrossing = record;
        const inRange = eventPosition.y >= apparatus.screen.yMin - geomTol
          && eventPosition.y <= apparatus.screen.yMax + geomTol;
        if (inRange) {
          detection = record;
          outcome = 'screen-hit';
          issue = null;
          events.push({
            timeS: eventTime,
            kind: 'screen-hit',
            position: { ...eventPosition },
            velocity: { ...eventVelocity },
            regionBefore: currentRegion.id,
            regionAfter: 'screen',
            objectIds: ['screen'],
            explanation: '粒子在屏幕有效高度内被探测。',
          });
        } else {
          outcome = 'screen-outside';
          issue = '粒子穿过屏幕平面，但落点在有效探测高度之外。';
          events.push({
            timeS: eventTime,
            kind: 'screen-outside',
            position: { ...eventPosition },
            velocity: { ...eventVelocity },
            regionBefore: currentRegion.id,
            regionAfter: 'screen',
            objectIds: ['screen'],
            explanation: '粒子穿过屏幕平面，但未落在有效探测范围内。',
          });
        }
        durationS = eventTime;
        currentTime = eventTime;
        currentPosition = { ...eventPosition };
        currentVelocity = { ...eventVelocity };
        break;
      }

      const absorbingSlits = chosen.slits.filter((slit) =>
        Math.abs(eventPosition.y - slit.yCenter) > slit.halfWidth + apertureTolerance(slit),
      );
      if (absorbingSlits.length > 0) {
        const slit = absorbingSlits[0];
        absorption = {
          slitId: slit.id,
          timeS: eventTime,
          position: { ...eventPosition },
          velocity: { ...eventVelocity },
        };
        outcome = 'absorbed';
        issue = `${slit.label}的吸收板终止了粒子。`;
        events.push({
          timeS: eventTime,
          kind: 'absorbed-at-slit',
          position: { ...eventPosition },
          velocity: { ...eventVelocity },
          regionBefore: currentRegion.id,
          regionAfter: 'absorbed',
          objectIds: absorbingSlits.map((item) => item.id),
          explanation: `粒子击中${slit.label}开口外的吸收板。`,
        });
        durationS = eventTime;
        currentTime = eventTime;
        currentPosition = { ...eventPosition };
        currentVelocity = { ...eventVelocity };
        break;
      }

      const nextRegion = chosen.isBoundary ? chosen.nextRegion : null;
      if (chosen.slits.length > 0) {
        events.push({
          timeS: eventTime,
          kind: 'slit-pass',
          position: { ...eventPosition },
          velocity: { ...eventVelocity },
          regionBefore: currentRegion.id,
          regionAfter: nextRegion?.id ?? currentRegion.id,
          objectIds: chosen.slits.map((slit) => slit.id),
          explanation: `粒子通过${chosen.slits.map((slit) => slit.label).join('与')}。`,
        });
      } else if (nextRegion) {
        events.push({
          timeS: eventTime,
          kind: 'enter-region',
          position: { ...eventPosition },
          velocity: { ...eventVelocity },
          regionBefore: currentRegion.id,
          regionAfter: nextRegion.id,
          objectIds: [nextRegion.id],
          explanation: `粒子进入${nextRegion.label}。`,
        });
      }

      if (nextRegion) currentRegion = nextRegion;
      currentTime = eventTime;
      currentPosition = { ...eventPosition };
      currentVelocity = { ...eventVelocity };
      segmentStartTime = eventTime;
      segmentStartPosition = { ...eventPosition };
      segmentStartVelocity = { ...eventVelocity };
      segmentStartWork = endWork;
      registerSelectorMatch();
    }
  }

  if (outcome === 'screen-hit' || outcome === 'screen-outside' || outcome === 'absorbed') {
    durationS = currentTime;
  } else if (outcome === 'event-limited') {
    durationS = currentTime;
  } else {
    durationS = Math.min(maxTimeS, Math.max(durationS, currentTime));
  }

  if (segments.length === 0 && durationS > 0) {
    segments.push({
      regionId: currentRegion.id,
      regionLabel: currentRegion.label,
      regionKind: currentRegion.kind,
      Ex: currentRegion.Ex,
      Ey: currentRegion.Ey,
      Bz: currentRegion.Bz,
      startTimeS: 0,
      endTimeS: durationS,
      startPosition: { ...input.initialPosition },
      startVelocity: { ...input.initialVelocity },
      workAtStartJ: 0,
    });
  }

  const finalState = {
    ...stateAtSolutionTime(
      input,
      regions,
      segments,
      durationS,
      initialKineticEnergyJ,
    ),
    timeS: durationS,
  };

  return {
    input,
    apparatus,
    regions,
    segments,
    events,
    outcome,
    detection,
    screenCrossing,
    absorption,
    selectorMatch,
    finalState,
    durationS,
    issue,
    eventLimited,
    timeLimited,
  };
}

function stateAtSolutionTime(
  input: BeamlineInput,
  regions: BeamRegion[],
  segments: BeamSegment[],
  timeS: number,
  initialKineticEnergyJ: number,
): BeamState {
  if (!Number.isFinite(timeS) || timeS <= 0 || segments.length === 0) {
    const region = initialRegion(regions, input.initialPosition, input.initialVelocity);
    const motion = motionFor(region, input.initialPosition, input.initialVelocity, input.chargeC, input.massKg);
    return stateFromMotion(
      motion,
      0,
      0,
      input.chargeC,
      input.massKg,
      initialKineticEnergyJ,
      0,
    );
  }
  let index = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    if (timeS < segments[i].endTimeS - 1e-12) {
      index = i;
      break;
    }
    if (i + 1 < segments.length && timeS <= segments[i].endTimeS + 1e-12) {
      index = i + 1;
      break;
    }
  }
  const segment = segments[index];
  const localTime = Math.max(0, Math.min(segment.endTimeS - segment.startTimeS, timeS - segment.startTimeS));
  const motion = motionFor(
    {
      id: segment.regionId,
      label: segment.regionLabel,
      kind: segment.regionKind,
      x0: -OUTER_X,
      x1: OUTER_X,
      Ex: segment.Ex,
      Ey: segment.Ey,
      Bz: segment.Bz,
    },
    segment.startPosition,
    segment.startVelocity,
    input.chargeC,
    input.massKg,
  );
  return stateFromMotion(
    motion,
    localTime,
    segment.workAtStartJ,
    input.chargeC,
    input.massKg,
    initialKineticEnergyJ,
    index,
  );
}

export function beamlineStateAt(solution: BeamlineSolution, localTimeS: number): BeamState | null {
  if (!Number.isFinite(localTimeS) || localTimeS < 0) return null;
  const timeS = Math.min(solution.durationS, localTimeS);
  const state = stateAtSolutionTime(
    solution.input,
    solution.regions,
    solution.segments,
    timeS,
    0.5 * solution.input.massKg * length(solution.input.initialVelocity) ** 2,
  );
  return { ...state, timeS };
}

export function sampleBeamlineTrajectory(
  solution: BeamlineSolution,
  durationS: number,
  count = 180,
): Vec2[] {
  const duration = Math.max(0, Math.min(durationS, solution.durationS));
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let index = 0; index <= n; index++) {
    const state = beamlineStateAt(solution, (duration * index) / n);
    points.push(state ? state.position : solution.finalState.position);
  }
  return points;
}
