import {
  beamlineStateAt,
  solveBeamlineTrajectory,
  validateBeamlineApparatus,
  type BeamlineApparatus,
  type BeamlineSolution,
  type BeamState,
  type BeamOutcome,
} from '../../physics/particles/beamline';
import {
  addParticle,
  createScene,
  relaunchAll,
  type MultiParticleScene,
  type ParticleInitialState,
  type ParticleRuntime,
  type ParticleSeed,
} from '../../physics/particles/multiParticle';
import { isRecord, parseParticleList, readLocalValue } from './sceneStorage';

export type P07Apparatus = BeamlineApparatus;
export type P07Scene = MultiParticleScene<P07Apparatus>;
export type P07LiveOutcome = 'waiting' | 'flying' | BeamOutcome;

export const P07_SCENE_STORAGE_KEY = 'emplab.p07.scene.v2';
export const P07_MAX_TIME_S = 10;
export const P07_MAX_EVENTS = 200;

export const P07_APPARATUS_DEFAULT: P07Apparatus = {
  acceleration: { enabled: false, x0: -2, x1: -0.5, Ex: 1 },
  selector: { x0: 0, x1: 2, Ey: -2, Bz: -1 },
  analyzer: { x0: 2, x1: 3, Bz: -1 },
  deflector: { x0: 3, x1: 5, Ey: -0.5 },
  entranceSlit: { x: 0, yCenter: 0, halfWidth: 0.12 },
  exitSlit: { x: 2, yCenter: 0, halfWidth: 0.12 },
  screen: { x: 5, yMin: -2.5, yMax: 2.5 },
};

export interface P07ParticleDisplay {
  massKg: number;
  chargeC: number;
  speedMps: number;
  directionDeg: number;
  startX: number;
  startY: number;
}

export interface P07ParticleEvaluation {
  particle: ParticleInitialState;
  runtime: ParticleRuntime;
  solution: BeamlineSolution;
}

export interface P07KeyFrame {
  time: number;
  label: string;
}

export function cloneP07Apparatus(apparatus: P07Apparatus): P07Apparatus {
  return {
    acceleration: { ...apparatus.acceleration },
    selector: { ...apparatus.selector },
    analyzer: { ...apparatus.analyzer },
    deflector: { ...apparatus.deflector },
    entranceSlit: { ...apparatus.entranceSlit },
    exitSlit: { ...apparatus.exitSlit },
    screen: { ...apparatus.screen },
  };
}

export function p07ParticleDisplay(particle: ParticleInitialState): P07ParticleDisplay {
  const speed = Math.hypot(particle.velocity.x, particle.velocity.y);
  let directionDeg = speed > 1e-12 ? (Math.atan2(particle.velocity.y, particle.velocity.x) * 180) / Math.PI : 0;
  if (directionDeg < 0) directionDeg += 360;
  return {
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    speedMps: speed,
    directionDeg,
    startX: particle.position.x,
    startY: particle.position.y,
  };
}

export function p07SeedFromDisplay(display: P07ParticleDisplay): ParticleSeed {
  const angle = (display.directionDeg * Math.PI) / 180;
  return {
    position: { x: display.startX, y: display.startY },
    velocity: {
      x: display.speedMps * Math.cos(angle),
      y: display.speedMps * Math.sin(angle),
    },
    chargeC: display.chargeC,
    massKg: display.massKg,
    visible: true,
    showTrail: true,
  };
}

export function p07SolutionFor(apparatus: P07Apparatus, particle: ParticleInitialState): BeamlineSolution {
  return solveBeamlineTrajectory({
    massKg: particle.massKg,
    chargeC: particle.chargeC,
    initialPosition: particle.position,
    initialVelocity: particle.velocity,
    apparatus: cloneP07Apparatus(apparatus),
    maxTimeS: P07_MAX_TIME_S,
    maxEvents: P07_MAX_EVENTS,
  });
}

export function p07BuildParticle(
  particle: ParticleInitialState,
  runtime: ParticleRuntime,
  apparatus: P07Apparatus,
): P07ParticleEvaluation {
  return {
    particle,
    runtime,
    solution: p07SolutionFor(apparatus, particle),
  };
}

export function p07GlobalDuration(scene: P07Scene, evaluations: P07ParticleEvaluation[]): number {
  let duration = 0.2;
  for (const item of evaluations) {
    const launch = scene.runtimeById[item.particle.id]?.launchTimeSec ?? 0;
    duration = Math.max(duration, launch + item.solution.durationS);
  }
  return duration;
}

export function p07StateFor(
  evaluation: P07ParticleEvaluation,
  tauS: number | null,
): BeamState | null {
  if (tauS === null) return null;
  return beamlineStateAt(evaluation.solution, tauS);
}

export function p07DetectionGlobalTime(evaluation: P07ParticleEvaluation): number | null {
  const detection = evaluation.solution.detection;
  return detection ? evaluation.runtime.launchTimeSec + detection.localTimeS : null;
}

export function p07AbsorptionGlobalTime(evaluation: P07ParticleEvaluation): number | null {
  const absorption = evaluation.solution.absorption;
  return absorption ? evaluation.runtime.launchTimeSec + absorption.timeS : null;
}

export function p07OutcomeAt(
  evaluation: P07ParticleEvaluation,
  tauS: number | null,
): P07LiveOutcome {
  if (tauS === null || !Number.isFinite(tauS) || tauS < 0) return 'waiting';
  const { solution } = evaluation;
  if (solution.absorption && tauS >= solution.absorption.timeS - 1e-12) return 'absorbed';
  if (solution.detection && tauS >= solution.detection.localTimeS - 1e-12) return 'screen-hit';
  if (solution.screenCrossing && tauS >= solution.screenCrossing.localTimeS - 1e-12) return 'screen-outside';
  if (tauS >= solution.durationS - 1e-12) return solution.outcome;
  return 'flying';
}

function eventLabel(event: BeamlineSolution['events'][number]): string {
  if (event.kind === 'slit-pass') return event.objectIds.includes('entrance') ? '过入口狭缝' : '过出口狭缝';
  if (event.kind === 'absorbed-at-slit') return '被吸收';
  if (event.kind === 'screen-hit') return '命中屏幕';
  if (event.kind === 'screen-outside') return '屏幕越界';
  if (event.kind === 'enter-region') return `进入${event.explanation.replace(/^粒子进入/, '')}`;
  if (event.kind === 'tangent') return '相切';
  if (event.kind === 'turning') return '折返';
  return '事件';
}

function uniqueFrames(frames: P07KeyFrame[]): P07KeyFrame[] {
  const map = new Map<number, P07KeyFrame>();
  for (const frame of frames) {
    const key = Math.round(frame.time * 1e9) / 1e9;
    if (!map.has(key)) map.set(key, frame);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function p07KeyFrames(
  scene: P07Scene,
  evaluations: P07ParticleEvaluation[],
): P07KeyFrame[] {
  const frames: P07KeyFrame[] = [{ time: 0, label: '全局起点' }];
  for (const item of evaluations) {
    const launch = scene.runtimeById[item.particle.id]?.launchTimeSec ?? 0;
    if (launch > 1e-9) frames.push({ time: launch, label: `${item.particle.label} 发射` });
    for (const event of item.solution.events) {
      if (event.timeS <= 1e-12) continue;
      frames.push({
        time: launch + event.timeS,
        label: `${item.particle.label} ${eventLabel(event)}`,
      });
    }
    frames.push({
      time: launch + item.solution.durationS,
      label: `${item.particle.label} 结束`,
    });
  }
  const duration = p07GlobalDuration(scene, evaluations);
  frames.push({ time: duration, label: '全局结束' });
  return uniqueFrames(frames.filter((frame) => frame.time >= 0 && frame.time <= duration + 1e-12));
}

export function p07SceneFromDisplays(
  apparatus: P07Apparatus,
  displays: P07ParticleDisplay[],
  launchTimes: number[] = [],
): P07Scene {
  let scene = createScene<P07Apparatus>(cloneP07Apparatus(apparatus), []);
  displays.forEach((display, index) => {
    const result = addParticle(scene, p07SeedFromDisplay(display), launchTimes[index] ?? 0);
    if (result.particle) scene = result.scene;
  });
  return { ...scene, activeParticleId: scene.particles[0]?.id ?? '' };
}

const baseDisplay = (patch: Partial<P07ParticleDisplay> = {}): P07ParticleDisplay => ({
  massKg: 1,
  chargeC: 1,
  speedMps: 2,
  directionDeg: 0,
  startX: -2,
  startY: 0,
  ...patch,
});

const standardApparatus = (patch: Partial<P07Apparatus> = {}): P07Apparatus => ({
  ...cloneP07Apparatus(P07_APPARATUS_DEFAULT),
  ...patch,
});

export const P07_PRESETS: Record<string, P07Scene> = {
  'p07-standard': p07SceneFromDisplays(P07_APPARATUS_DEFAULT, [baseDisplay()]),
  'p07-c07-analyzer': p07SceneFromDisplays(
    {
      ...P07_APPARATUS_DEFAULT,
      selector: { x0: 0, x1: 2, Ey: -2, Bz: -1 },
      analyzer: { x0: 2, x1: 3, Bz: -1 },
      deflector: { x0: 3, x1: 4, Ey: 0 },
      screen: { x: 4, yMin: -2.5, yMax: 2.5 },
    },
    [{ massKg: 1, chargeC: 1, speedMps: 2, directionDeg: 0, startX: -2, startY: 0 }],
  ),
  'p07-slow': p07SceneFromDisplays(P07_APPARATUS_DEFAULT, [baseDisplay({ speedMps: 1.5 })]),
  'p07-fast': p07SceneFromDisplays(P07_APPARATUS_DEFAULT, [baseDisplay({ speedMps: 2.5 })]),
  'p07-offset-entry': p07SceneFromDisplays(P07_APPARATUS_DEFAULT, [baseDisplay({ startY: 0.2 })]),
  'p07-negative': p07SceneFromDisplays(P07_APPARATUS_DEFAULT, [baseDisplay({ chargeC: -1 })]),
  'p07-reverse-analyzer': p07SceneFromDisplays(
    standardApparatus({
      analyzer: { x0: 2, x1: 3, Bz: 1 },
      screen: { x: 5, yMin: -0.5, yMax: 2.5 },
    }),
    [baseDisplay()],
  ),
  'p07-deflector-off': p07SceneFromDisplays(
    standardApparatus({ deflector: { x0: 3, x1: 5, Ey: 0 } }),
    [baseDisplay()],
  ),
  'p07-deflector-reverse': p07SceneFromDisplays(
    standardApparatus({ deflector: { x0: 3, x1: 5, Ey: 0.5 } }),
    [baseDisplay()],
  ),
  'p07-screen-miss': p07SceneFromDisplays(
    standardApparatus({ screen: { x: 5, yMin: 1.2, yMax: 2.5 } }),
    [baseDisplay()],
  ),
  'p07-accelerated': p07SceneFromDisplays(
    standardApparatus({ acceleration: { enabled: true, x0: -2, x1: -0.5, Ex: 1 } }),
    [baseDisplay({ speedMps: 1 })],
  ),
  'p07-arrival': p07SceneFromDisplays(
    P07_APPARATUS_DEFAULT,
    [baseDisplay(), baseDisplay()],
    [0, 0.4],
  ),
  'p07-multi': p07SceneFromDisplays(
    P07_APPARATUS_DEFAULT,
    [baseDisplay(), baseDisplay({ speedMps: 1.5 }), baseDisplay({ chargeC: -1 })],
    [0, 0.3, 0.6],
  ),
  'p07-five': p07SceneFromDisplays(
    P07_APPARATUS_DEFAULT,
    [
      baseDisplay(),
      baseDisplay({ startY: 0.04 }),
      baseDisplay({ speedMps: 1.5 }),
      baseDisplay({ speedMps: 2.5 }),
      baseDisplay({ chargeC: -1 }),
    ],
    [0, 0.1, 0.2, 0.3, 0.4],
  ),
};

export const P07_DEFAULT: P07Scene = P07_PRESETS['p07-standard'];

export interface P07StoredScene {
  schemaVersion: 2;
  model: 'p07';
  field: P07Apparatus;
  particles: ParticleInitialState[];
  runtimeById: Record<string, { launchTimeSec: number }>;
  activeParticleId: string;
}

function cloneParticle(particle: ParticleInitialState): ParticleInitialState {
  return {
    ...particle,
    position: { ...particle.position },
    velocity: { ...particle.velocity },
  };
}

function cloneScene(scene: P07Scene): P07Scene {
  return {
    ...scene,
    field: cloneP07Apparatus(scene.field),
    particles: scene.particles.map(cloneParticle),
    runtimeById: Object.fromEntries(
      scene.particles.map((particle) => [particle.id, { ...(scene.runtimeById[particle.id] ?? { launchTimeSec: 0 }) }]),
    ),
    activeParticleId: scene.activeParticleId,
  };
}

export function toP07StoredScene(scene: P07Scene): P07StoredScene {
  return {
    schemaVersion: 2,
    model: 'p07',
    field: cloneP07Apparatus(scene.field),
    particles: scene.particles.map(cloneParticle),
    runtimeById: Object.fromEntries(
      scene.particles.map((particle) => [particle.id, { ...(scene.runtimeById[particle.id] ?? { launchTimeSec: 0 }) }]),
    ),
    activeParticleId: scene.activeParticleId,
  };
}

export function serializeP07Scene(scene: P07Scene): string {
  return JSON.stringify(toP07StoredScene(scene), null, 2);
}

export function parseP07StoredScene(raw: unknown): { scene: P07Scene | null; error: string | null } {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || raw.model !== 'p07') {
    return { scene: null, error: '无法识别的 P07 场景格式。' };
  }
  if (!isRecord(raw.field)) return { scene: null, error: 'P07 束线装置配置缺失。' };
  const apparatus = raw.field as unknown as P07Apparatus;
  const apparatusIssue = validateBeamlineApparatus(apparatus);
  if (apparatusIssue) return { scene: null, error: apparatusIssue };
  const parsed = parseParticleList(raw.particles);
  if (!parsed.particles) return { scene: null, error: parsed.error ?? '粒子配置无效。' };
  const scene = createScene<P07Apparatus>(cloneP07Apparatus(apparatus), parsed.particles);
  const rawRuntimeMap = raw.runtimeById;
  const runtimeById = isRecord(rawRuntimeMap)
    ? Object.fromEntries(scene.particles.map((particle) => {
        const runtime = rawRuntimeMap[particle.id];
        const launch = isRecord(runtime) && Number.isFinite(runtime.launchTimeSec)
          ? Math.max(0, runtime.launchTimeSec as number)
          : 0;
        return [particle.id, { launchTimeSec: launch }];
      }))
    : scene.runtimeById;
  const activeParticleId = typeof raw.activeParticleId === 'string'
    && scene.particles.some((particle) => particle.id === raw.activeParticleId)
    ? raw.activeParticleId
    : scene.particles[0].id;
  return { scene: { ...scene, runtimeById, activeParticleId }, error: null };
}

export function decodeP07SceneJson(text: string): { scene: P07Scene | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { scene: null, error: '文件不是有效的 JSON。' };
  }
  const candidate = isRecord(parsed) && isRecord(parsed.scene) ? parsed.scene : parsed;
  return parseP07StoredScene(candidate);
}

export function loadInitialP07Scene(): P07Scene {
  const current = readLocalValue(P07_SCENE_STORAGE_KEY);
  if (current) {
    const parsed = parseP07StoredScene(current);
    if (parsed.scene) return relaunchAll(parsed.scene);
  }
  return relaunchAll(cloneScene(P07_DEFAULT));
}
