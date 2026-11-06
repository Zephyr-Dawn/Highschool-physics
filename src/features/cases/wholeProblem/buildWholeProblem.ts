import { P04_PRESETS } from '../../../simulations/particle/p04Scene';
import { p05SceneFromSeeds, p05SolutionFor } from '../../../simulations/particle/p05Scene';
import {
  P07_APPARATUS_DEFAULT,
  P07_PRESETS,
  p07SeedFromDisplay,
  p07SolutionFor,
} from '../../../simulations/particle/p07Scene';
import { I03_PRESETS, i03EngineParams } from '../../../simulations/induction/params';
import { I05_PRESETS } from '../../../simulations/induction/i05Scene';
import { I07_PRESETS } from '../../../simulations/induction/i07Scene';
import { DUAL_ROD_DEFAULT } from '../../../physics/induction/dualRodCoupling';
import { solveDualRod, stateAtDualRodTime } from '../../../physics/induction/dualRodCoupling';
import { solveI05, stateAtI05Time } from '../../../physics/induction/movingLoopSolver';
import { computeI07Snapshot, solveI07, stateAtI07Time } from '../../../physics/induction/oppositeFieldsWallLoop';
import { simulateLoop, stateAtTime } from '../../../physics/induction/loopField';
import { solveFiniteFieldTrajectory, finiteFieldStateAt } from '../../../physics/particles/finiteMagneticRegion';
import {
  A17_DEFAULT_INPUT,
  solveElectricMagneticScreen,
} from '../../../physics/composite/electricMagneticScreen';
import { alternatingStateAt } from '../../../physics/particles/alternatingMagneticRegions';
import { beamlineStateAt } from '../../../physics/particles/beamline';
import { particleTau } from '../../../physics/particles/multiParticle';
import type {
  WholeProblemBuildInput,
  WholeProblemEvent,
  WholeProblemGeometry,
  WholeProblemModel,
  WholeProblemObservable,
  WholeProblemObservables,
  WholeProblemTrace,
} from './types';

const COLORS = ['#1d4ed8', '#c2410c', '#0f766e', '#7e22ce'];

function value(value: number | null | undefined, unit: string, label: string, note?: string): WholeProblemObservable {
  return { value: typeof value === 'number' && Number.isFinite(value) ? value : null, unit, label, note };
}

function pick(input: WholeProblemBuildInput, key: string): number {
  return input.overrides[key] ?? input.baseline[key];
}

function sameValues(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (Math.abs((left[key] ?? 0) - (right[key] ?? 0)) > 1e-12) return false;
  }
  return true;
}

function sampleTimePoints(duration: number, count = 140): number[] {
  const safe = Math.max(duration, 1e-9);
  return Array.from({ length: count + 1 }, (_, index) => (safe * index) / count);
}

function particleTrace(
  id: string,
  label: string,
  color: string,
  launchTime: number,
  duration: number,
  stateAt: (tau: number) => { position: { x: number; y: number } } | null,
): WholeProblemTrace {
  const points: WholeProblemTrace['points'] = [];
  for (const tau of sampleTimePoints(duration)) {
    const state = stateAt(tau);
    if (!state) continue;
    points.push({ t: launchTime + tau, x: state.position.x, y: state.position.y });
  }
  return { id, label, color, points };
}

function baseGeometry(patch: Partial<WholeProblemGeometry>): WholeProblemGeometry {
  return {
    mode: 'particles',
    viewBox: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    bands: [],
    verticalGuides: [],
    slits: [],
    screen: null,
    wall: null,
    loop: null,
    rods: null,
    ...patch,
  };
}

function baseModel(
  input: WholeProblemBuildInput,
  patch: Omit<WholeProblemModel, 'caseId' | 'adapterId' | 'coverage' | 'parameterValues' | 'baselineValues' | 'hasChanges'>,
): WholeProblemModel {
  return {
    caseId: input.caseId,
    adapterId: input.adapterId,
    coverage: 'full_problem_simulated',
    parameterValues: { ...input.baseline, ...input.overrides },
    baselineValues: { ...input.baseline },
    hasChanges: !sameValues(input.baseline, { ...input.baseline, ...input.overrides }),
    ...patch,
  };
}

function buildP04(input: WholeProblemBuildInput): WholeProblemModel {
  const preset = P04_PRESETS['p04-strip-cross'];
  const bz = pick(input, 'bz');
  const widthM = Math.max(0.1, pick(input, 'widthM'));
  const geometry = {
    ...preset.field.geometry,
    xMin: 0,
    xMax: widthM,
  } as typeof preset.field.geometry;
  const particle = preset.particles[0];
  const solution = solveFiniteFieldTrajectory({
    geometry,
    Bz: bz,
    startPosition: particle.position,
    initialVelocity: particle.velocity,
    chargeC: particle.chargeC,
    massKg: particle.massKg,
    timeHorizonS: 4,
    maxEvents: 40,
  });
  const exit = solution.events.find((event) => event.kind === 'exit') ?? solution.exit;
  const duration = Math.max(0.2, solution.durationS);
  const trace = particleTrace('A', '粒子 A', COLORS[0], 0, duration, (tau) => finiteFieldStateAt(solution, tau));
  const events: WholeProblemEvent[] = [
    { id: 'start', t: 0, kind: 'start', label: '从原点进入条带磁场', x: particle.position.x, y: particle.position.y },
    ...solution.events.map((event, index) => ({
      id: event.kind === 'exit' ? 'exit' : `p04-${index}-${event.kind}`,
      t: event.timeS,
      kind: event.kind,
      label: event.explanation,
      x: event.position.x,
      y: event.position.y,
    })),
  ];
  const answers: WholeProblemObservables = {
    exitTimeS: value(solution.exitTimeS, 's', '首次离开右边界时间'),
    exitY: value(exit?.position.y, 'm', '首次离开右边界的 y 坐标'),
    criticalWidthM: value(solution.radiusM, 'm', '与右边界相切的临界条带宽度'),
  };
  const observations: WholeProblemObservables = {
    timeS: value(0, 's', '全局时间'),
    x: value(particle.position.x, 'm', 'x 坐标'),
    y: value(particle.position.y, 'm', 'y 坐标'),
    speed: value(Math.hypot(particle.velocity.x, particle.velocity.y), 'm/s', '速率'),
  };
  return baseModel(input, {
    durationS: duration,
    geometry: baseGeometry({
      viewBox: { xMin: -0.2, xMax: Math.max(1.1, widthM + 0.2), yMin: -0.4, yMax: 1.4 },
      bands: [{ x0: 0, x1: widthM, label: `Bz=${bz} T`, color: bz >= 0 ? '#dbeafe' : '#fee2e2', glyph: bz >= 0 ? '+' : '-' }],
      verticalGuides: [{ x: 0, label: '左边界' }, { x: widthM, label: '右边界' }],
    }),
    traces: [trace],
    events,
    charts: [],
    observations,
    answers,
    issue: solution.issue,
    frameAt(timeS) {
      const state = finiteFieldStateAt(solution, Math.min(timeS, solution.durationS));
      return {
        time: state.timeS,
        markers: state ? [{ id: 'A', label: 'A', color: COLORS[0], x: state.position.x, y: state.position.y }] : [],
        loops: [],
        rods: null,
        observables: {
          timeS: value(state?.timeS, 's', '全局时间'),
          x: value(state?.position.x, 'm', 'x 坐标'),
          y: value(state?.position.y, 'm', 'y 坐标'),
          speed: value(state?.speedMps, 'm/s', '速率'),
          region: value(null, '', state?.region ?? '未知', '当前区域'),
        },
      };
    },
  });
}

function buildP05(input: WholeProblemBuildInput): WholeProblemModel {
  const leftBz = pick(input, 'leftBz');
  const rightBz = pick(input, 'rightBz');
  const launchDelayS = Math.max(0, pick(input, 'launchDelayS'));
  const aSpeed = Math.max(0.1, pick(input, 'aSpeedMps'));
  const scene = p05SceneFromSeeds(
    { boundaries: [0], fields: [leftBz, rightBz] },
    [
      { position: { x: 0, y: 0 }, velocity: { x: aSpeed, y: 0 }, chargeC: 1, massKg: 1, visible: true, showTrail: true },
      { position: { x: 0, y: 0 }, velocity: { x: 1, y: 0 }, chargeC: 1, massKg: 1, visible: true, showTrail: true, launchTimeSec: launchDelayS },
    ],
  );
  const a = scene.particles[0];
  const b = scene.particles[1];
  const solutionA = p05SolutionFor(scene.field, a, 7);
  const solutionB = p05SolutionFor(scene.field, b, 7);
  const duration = Math.max(solutionA.durationS, launchDelayS + solutionB.durationS, 1);
  const traceA = particleTrace('A', '粒子 A', COLORS[0], 0, solutionA.durationS, (tau) => alternatingStateAt(solutionA, tau));
  const traceB = particleTrace('B', '粒子 B', COLORS[1], launchDelayS, solutionB.durationS, (tau) => alternatingStateAt(solutionB, tau));
  const firstA = solutionA.events.find((event) => event.kind === 'crossing');
  const crossingsA = solutionA.events.filter((event) => event.kind === 'crossing');
  const firstB = solutionB.events.find((event) => event.kind === 'crossing');
  const events: WholeProblemEvent[] = [
    { id: 'a-start', t: 0, kind: 'start', label: '粒子 A 从原点发射', x: 0, y: 0 },
    ...crossingsA.map((event, index) => ({
      id: `a-cross-${index + 1}`,
      t: event.timeS,
      kind: event.kind,
      label: `粒子 A 第 ${index + 1} 次跨界`,
      x: event.position.x,
      y: event.position.y,
    })),
    { id: 'b-start', t: launchDelayS, kind: 'start', label: '粒子 B 延迟发射', x: 0, y: 0 },
    ...(firstB ? [{ id: 'b-cross-1', t: launchDelayS + firstB.timeS, kind: firstB.kind, label: '粒子 B 第一次跨界', x: firstB.position.x, y: firstB.position.y }] : []),
  ];
  const answers: WholeProblemObservables = {
    aFirstCrossTimeS: value(firstA?.timeS, 's', 'A 第一次跨界时间'),
    aSecondCrossY: value(crossingsA[1]?.position.y, 'm', 'A 第二次跨界 y 坐标'),
    bFirstCrossGlobalS: value(firstB ? launchDelayS + firstB.timeS : null, 's', 'B 第一次跨界的全局时间'),
  };
  return baseModel(input, {
    durationS: duration,
    geometry: baseGeometry({
      viewBox: (() => {
        const points = [...traceA.points, ...traceB.points];
        const yMin = Math.min(...points.map((point) => point.y), 0) - 0.6;
        const yMax = Math.max(...points.map((point) => point.y), 0) + 0.6;
        const xWidth = Math.max(1.2, ...points.map((point) => Math.abs(point.x))) + 0.4;
        return { xMin: -xWidth, xMax: xWidth, yMin, yMax };
      })(),
      bands: [
        { x0: -1.4, x1: 0, label: `Bz=${leftBz} T`, color: leftBz >= 0 ? '#dbeafe' : '#fee2e2', glyph: leftBz >= 0 ? '+' : '-' },
        { x0: 0, x1: 1.4, label: `Bz=${rightBz} T`, color: rightBz >= 0 ? '#dbeafe' : '#fee2e2', glyph: rightBz >= 0 ? '+' : '-' },
      ],
      verticalGuides: [{ x: 0, label: '界面 x=0' }],
    }),
    traces: [traceA, traceB],
    events,
    charts: [],
    observations: {
      timeS: value(0, 's', '全局时间'),
      aX: value(0, 'm', 'A 的 x'),
      aY: value(0, 'm', 'A 的 y'),
      bX: value(null, 'm', 'B 的 x'),
      bY: value(null, 'm', 'B 的 y'),
    },
    answers,
    issue: solutionA.issue ?? solutionB.issue,
    frameAt(timeS) {
      const tauA = particleTau(scene.runtimeById[a.id], timeS);
      const tauB = particleTau(scene.runtimeById[b.id], timeS);
      const stateA = tauA === null ? null : alternatingStateAt(solutionA, tauA);
      const stateB = tauB === null ? null : alternatingStateAt(solutionB, tauB);
      const markers = [];
      if (stateA) markers.push({ id: 'A', label: 'A', color: COLORS[0], x: stateA.position.x, y: stateA.position.y });
      if (stateB) markers.push({ id: 'B', label: 'B', color: COLORS[1], x: stateB.position.x, y: stateB.position.y });
      return {
        time: timeS,
        markers,
        loops: [],
        rods: null,
        observables: {
          timeS: value(timeS, 's', '全局时间'),
          aX: value(stateA?.position.x, 'm', 'A 的 x'),
          aY: value(stateA?.position.y, 'm', 'A 的 y'),
          bX: value(stateB?.position.x, 'm', 'B 的 x'),
          bY: value(stateB?.position.y, 'm', 'B 的 y'),
          sameTimeDistance: value(
            stateA && stateB ? Math.hypot(stateA.position.x - stateB.position.x, stateA.position.y - stateB.position.y) : null,
            'm',
            '同一 tGlobal 下 A/B 距离',
          ),
        },
      };
    },
  });
}

function buildP07(input: WholeProblemBuildInput): WholeProblemModel {
  const isC07 = input.caseId === 'case-c07-analyzer-critical';
  const baseApparatus = isC07
    ? {
        ...P07_APPARATUS_DEFAULT,
        selector: { ...P07_APPARATUS_DEFAULT.selector },
        analyzer: { x0: 2, x1: 3, Bz: -1 },
        deflector: { x0: 3, x1: 4, Ey: 0 },
        entranceSlit: { x: 0, yCenter: 0, halfWidth: 0.12 },
        exitSlit: { x: 2, yCenter: 0, halfWidth: 0.12 },
        screen: { x: 4, yMin: -2.5, yMax: 2.5 },
      }
    : P07_PRESETS['p07-standard'].field;
  const apparatus = {
    acceleration: { ...baseApparatus.acceleration },
    selector: { ...baseApparatus.selector },
    analyzer: { ...baseApparatus.analyzer, Bz: pick(input, 'analyzerBz') },
    deflector: { ...baseApparatus.deflector },
    entranceSlit: { ...baseApparatus.entranceSlit },
    exitSlit: { ...baseApparatus.exitSlit },
    screen: {
      ...baseApparatus.screen,
      x: isC07 ? pick(input, 'screenX') : baseApparatus.screen.x,
      yMax: isC07 ? baseApparatus.screen.yMax : pick(input, 'screenYMax'),
    },
  };
  const speed = isC07 ? 2 : pick(input, 'incidentSpeedMps');
  const particle = p07SeedFromDisplay({
    massKg: 1,
    chargeC: 1,
    speedMps: speed,
    directionDeg: 0,
    startX: -2,
    startY: 0,
  });
  const solution = p07SolutionFor(apparatus, {
    ...particle,
    id: 'A',
    label: 'A',
    color: COLORS[0],
    lineStyle: 'solid',
  });
  const trace = particleTrace('A', '粒子 A', COLORS[0], 0, solution.durationS, (tau) => beamlineStateAt(solution, tau));
  const slitPasses = solution.events.filter((event) => event.kind === 'slit-pass');
  const eventViews: WholeProblemEvent[] = solution.events.map((event, index) => {
    let id = `p07-${index}-${event.kind}`;
    if (event.kind === 'slit-pass') id = index === 0 ? 'entry-slit' : 'exit-slit';
    if (event.kind === 'enter-region') id = 'analyzer-exit';
    if (event.kind === 'screen-hit' || event.kind === 'screen-outside') id = 'screen';
    if (event.kind === 'absorbed-at-slit') id = 'absorbed';
    return { id, t: event.timeS, kind: event.kind, label: event.explanation, x: event.position.x, y: event.position.y };
  });
  const entryEvent = solution.events.find((event) => event.kind === 'enter-region');
  const selectorPass = slitPasses.length >= 2 ? slitPasses[1] : null;
  const analyzerEntrySpeed = entryEvent ? Math.hypot(entryEvent.velocity.x, entryEvent.velocity.y) : null;
  const analyzerRadiusM = analyzerEntrySpeed !== null && Math.abs(apparatus.analyzer.Bz) > 1e-12
    ? analyzerEntrySpeed / Math.abs(apparatus.analyzer.Bz)
    : null;
  const analyzerSpan = Math.abs(apparatus.analyzer.x1 - apparatus.analyzer.x0);
  const criticalAnalyzerB = analyzerEntrySpeed !== null && analyzerSpan > 1e-12
    ? analyzerEntrySpeed / analyzerSpan
    : null;
  const screenY = solution.detection?.yHit ?? solution.screenCrossing?.yHit ?? null;
  const answers: WholeProblemObservables = isC07
    ? {
        screenY: value(screenY, 'm', '标准 B 下的屏幕落点 y'),
        screenYOpposite: value(screenY === null ? null : -screenY, 'm', 'B 反号后的屏幕落点 y'),
        criticalAnalyzerB: value(criticalAnalyzerB, 'T', '到达分析区出口的临界 |B|'),
      }
    : {
        selectorExitSpeed: value(selectorPass ? Math.hypot(selectorPass.velocity.x, selectorPass.velocity.y) : null, 'm/s', '通过选速器出口的速率'),
        analyzerRadiusM: value(analyzerRadiusM, 'm', '磁分析区半径'),
        arrivalTimeS: value(solution.detection?.localTimeS ?? solution.screenCrossing?.localTimeS ?? null, 's', '屏幕到达时间'),
        screenY: value(screenY, 'm', '屏幕落点 y'),
      };
  const screen = { x: apparatus.screen.x, yMin: apparatus.screen.yMin, yMax: apparatus.screen.yMax };
  return baseModel(input, {
    durationS: solution.durationS,
    geometry: baseGeometry({
      viewBox: { xMin: -2.5, xMax: Math.max(5.4, apparatus.screen.x + 0.4), yMin: -3, yMax: 3 },
      bands: [
        { x0: apparatus.selector.x0, x1: apparatus.selector.x1, label: '选速 E+B', color: '#fef3c7', glyph: '0' },
        { x0: apparatus.analyzer.x0, x1: apparatus.analyzer.x1, label: '磁分析', color: apparatus.analyzer.Bz >= 0 ? '#dbeafe' : '#fee2e2', glyph: apparatus.analyzer.Bz >= 0 ? '+' : '-' },
        { x0: apparatus.deflector.x0, x1: apparatus.deflector.x1, label: '末段电场', color: '#ede9fe', glyph: '0' },
      ],
      verticalGuides: [
        { x: apparatus.entranceSlit.x, label: '入口' },
        { x: apparatus.exitSlit.x, label: '出口' },
        { x: screen.x, label: '屏幕' },
      ],
      slits: [apparatus.entranceSlit, apparatus.exitSlit],
      screen,
    }),
    traces: [trace],
    events: eventViews,
    charts: [],
    observations: {
      timeS: value(0, 's', '全局时间'),
      x: value(-2, 'm', 'x 坐标'),
      y: value(0, 'm', 'y 坐标'),
      speed: value(speed, 'm/s', '速率'),
      outcome: value(null, '', solution.outcome, '最终结果'),
    },
    answers,
    issue: solution.issue,
    frameAt(timeS) {
      const state = beamlineStateAt(solution, Math.min(timeS, solution.durationS)) ?? solution.finalState;
      return {
        time: state.timeS,
        markers: [{ id: 'A', label: 'A', color: COLORS[0], x: state.position.x, y: state.position.y }],
        loops: [],
        rods: null,
        observables: {
          timeS: value(state.timeS, 's', '全局时间'),
          x: value(state.position.x, 'm', 'x 坐标'),
          y: value(state.position.y, 'm', 'y 坐标'),
          vx: value(state.velocity.x, 'm/s', 'vx'),
          vy: value(state.velocity.y, 'm/s', 'vy'),
          speed: value(state.speed, 'm/s', '速率'),
          energy: value(state.kineticEnergyJ, 'J', '动能'),
          region: value(null, '', state.regionLabel, '所在区域'),
        },
      };
    },
  });
}

function buildI03(input: WholeProblemBuildInput): WholeProblemModel {
  const preset = I03_PRESETS['i03-default'];
  const bz = pick(input, 'bz');
  const speed = pick(input, 'speedMps');
  const params = i03EngineParams({
    ...preset,
    BzSign: bz < 0 ? -1 : 1,
    BzMagnitudeT: Math.abs(bz) || 1e-6,
    initialSpeedMps: speed,
  });
  const simulation = simulateLoop(params);
  const duration = simulation.durationS;
  const stateAt = (time: number) => stateAtTime(simulation, Math.min(time, duration));
  const initial = stateAt(0);
  const answerState = stateAt(0.1);
  const answers: WholeProblemObservables = {
    fluxWb: value(answerState.fluxWb, 'Wb', 't=0.1 s 的磁通量'),
    emfV: value(answerState.emfV, 'V', 't=0.1 s 的电动势'),
    currentA: value(answerState.currentA, 'A', 't=0.1 s 的电流'),
  };
  const events: WholeProblemEvent[] = simulation.events.map((event, index) => ({
    id: index === 0 ? 'enter' : index === 1 ? 'inside' : index === 2 ? 'leave' : 'after',
    t: event.tS,
    kind: event.phase,
    label: event.label,
    x: event.xM,
    y: 0,
  }));
  return baseModel(input, {
    durationS: duration,
    geometry: baseGeometry({
      mode: 'loop',
      viewBox: { xMin: -0.3, xMax: 1.1, yMin: -0.6, yMax: 0.6 },
      bands: [{ x0: params.fieldLeftM, x1: params.fieldRightM, label: `Bz=${params.BzTesla} T`, color: params.BzTesla >= 0 ? '#dbeafe' : '#fee2e2', glyph: params.BzTesla >= 0 ? '+' : '-' }],
      verticalGuides: [{ x: params.fieldLeftM, label: '磁场左边界' }, { x: params.fieldRightM, label: '磁场右边界' }],
      loop: { widthM: params.loopWidthM, heightM: params.loopHeightM },
    }),
    traces: [],
    events,
    charts: [
      {
        id: 'flux',
        title: '磁通量 Φ',
        unit: 'Wb',
        color: '#0f766e',
        points: simulation.samples.map((sample) => ({ tS: sample.tS, value: sample.fluxWb })),
      },
      {
        id: 'current',
        title: '感应电流 I',
        unit: 'A',
        color: '#b91c1c',
        points: simulation.samples.map((sample) => ({ tS: sample.tS, value: sample.currentA })),
      },
    ],
    observations: {
      timeS: value(0, 's', '全局时间'),
      x: value(initial.xM, 'm', '线框左边 x'),
      flux: value(initial.fluxWb, 'Wb', '磁通量'),
      emf: value(initial.emfV, 'V', '电动势'),
      current: value(initial.currentA, 'A', '电流'),
    },
    answers,
    issue: simulation.issue,
    frameAt(timeS) {
      const state = stateAt(timeS);
      return {
        time: state.tS,
        markers: [],
        loops: [{ id: 'loop', label: '线框', xM: state.xM, color: '#0f766e' }],
        rods: null,
        observables: {
          timeS: value(state.tS, 's', '全局时间'),
          x: value(state.xM, 'm', '线框左边 x'),
          phase: value(null, '', state.phase, '阶段'),
          flux: value(state.fluxWb, 'Wb', '磁通量 Φ'),
          emf: value(state.emfV, 'V', '电动势 ε'),
          current: value(state.currentA, 'A', '电流 I'),
          force: value(state.forceXN, 'N', '安培力 Fx'),
          heat: value(simulation.jouleHeatJ, 'J', '累计焦耳热'),
        },
      };
    },
  });
}

function buildI05(input: WholeProblemBuildInput): WholeProblemModel {
  const preset = I05_PRESETS['i05-reinforce'];
  const slope = pick(input, 'bSlope');
  const speed = pick(input, 'initialSpeedMps');
  const params = {
    ...preset,
    initialSpeedMps: speed,
    waveform: { ...preset.waveform, slopeTeslaPerS: slope },
  };
  const solution = solveI05(params);
  const stateAt = (time: number) => stateAtI05Time(solution, Math.min(time, solution.durationS));
  const at05 = stateAt(0.5);
  const answers: WholeProblemObservables = {
    emfTransformerV: value(at05.emfTransformerV, 'V', 't=0.5 s 的感生电动势'),
    emfTotalV: value(at05.emfTotalV, 'V', 't=0.5 s 的总电动势'),
    joulePowerW: value(at05.joulePowerW, 'W', 't=0.5 s 的焦耳功率'),
  };
  const events: WholeProblemEvent[] = solution.events.map((event, index) => ({
    id: event.kind === 'geometry' ? `geometry-${index}` : event.kind === 'start' ? 'start' : event.kind === 'end' ? 'end' : `i05-${index}-${event.kind}`,
    t: event.timeS,
    kind: event.kind,
    label: event.label,
    x: event.xM,
    y: 0,
  }));
  return baseModel(input, {
    durationS: solution.durationS,
    geometry: baseGeometry({
      mode: 'loop',
      viewBox: { xMin: -1.4, xMax: 4.2, yMin: -1.4, yMax: 1.4 },
      bands: [{ x0: params.fieldLeftM, x1: params.fieldRightM, label: 'B(t) 区域', color: '#dbeafe', glyph: '+' }],
      verticalGuides: [{ x: params.fieldLeftM, label: 'a' }, { x: params.fieldRightM, label: 'b' }],
      loop: { widthM: params.widthM, heightM: params.heightM },
    }),
    traces: [],
    events,
    charts: [
      {
        id: 'emf',
        title: '电动势 ε',
        unit: 'V',
        color: '#b91c1c',
        points: solution.samples.map((sample) => ({ tS: sample.timeS, value: sample.emfTotalV ?? 0 })),
      },
      {
        id: 'current',
        title: '电流 I',
        unit: 'A',
        color: '#0f766e',
        points: solution.samples.map((sample) => ({ tS: sample.timeS, value: sample.currentA ?? 0 })),
      },
      {
        id: 'joule',
        title: '焦耳热 Q_J',
        unit: 'J',
        color: '#7e22ce',
        points: solution.samples.map((sample) => ({ tS: sample.timeS, value: sample.jouleHeatJ })),
      },
    ],
    observations: {
      timeS: value(0, 's', '全局时间'),
      x: value(params.startXM, 'm', '线框左边 x'),
      emfT: value(solution.initial.emfTransformerV, 'V', '感生电动势'),
      emfTotal: value(solution.initial.emfTotalV, 'V', '总电动势'),
      current: value(solution.initial.currentA, 'A', '电流'),
    },
    answers,
    issue: solution.issue,
    frameAt(timeS) {
      const state = stateAt(timeS);
      return {
        time: state.timeS,
        markers: [],
        loops: [{ id: 'loop', label: '线框', xM: state.xM, color: '#0f766e' }],
        rods: null,
        observables: {
          timeS: value(state.timeS, 's', '全局时间'),
          x: value(state.xM, 'm', '线框左边 x'),
          B: value(state.Bz, 'T', 'B(t)'),
          overlap: value(state.overlapLengthM, 'm', '重叠长度'),
          emfT: value(state.emfTransformerV, 'V', '感生电动势'),
          emfM: value(state.emfMotionalV, 'V', '动生电动势'),
          emfTotal: value(state.emfTotalV, 'V', '总电动势'),
          current: value(state.currentA, 'A', '电流'),
          force: value(state.magneticForceX, 'N', '磁场力 Fx'),
          joulePower: value(state.joulePowerW, 'W', '焦耳功率'),
          heat: value(state.jouleHeatJ, 'J', '累计焦耳热'),
          sourceWork: value(state.transformerSourceWorkJ, 'J', '磁场源供能'),
        },
      };
    },
  });
}

function buildI07(input: WholeProblemBuildInput): WholeProblemModel {
  const preset = I07_PRESETS['i07-interface'];
  const restitution = pick(input, 'restitution');
  const field2Bz = pick(input, 'field2Bz');
  const params = {
    ...preset,
    mode: 'free' as const,
    initialSpeedMps: 8,
    durationS: 3,
    wallEnabled: true,
    wallXM: 3.2,
    restitution,
    field2Bz,
  };
  const solution = solveI07(params);
  const wallEvent = solution.events.find((event) => event.kind === 'wall-bounce' || event.kind === 'wall-stop');
  const initial = computeI07Snapshot(params, 0, params.startXM, params.initialSpeedMps, {
    jouleHeatJ: 0,
    externalWorkJ: 0,
    impactLossJ: 0,
  });
  const atWall = wallEvent ? stateAtI07Time(solution, wallEvent.timeS) : null;
  const answers: WholeProblemObservables = {
    initialEmfV: value(initial.emfV, 'V', '初始时刻的感应电动势'),
    jouleHeatAtBounceJ: value(atWall?.jouleHeatJ, 'J', '首次碰板时的累计焦耳热'),
    impactLossJ: value(wallEvent?.impactLossJ, 'J', '挡板碰撞损失'),
    postBounceSpeedMps: value(wallEvent?.velocityAfterMps, 'm/s', '反弹后速度'),
  };
  let geometryIndex = 0;
  const events: WholeProblemEvent[] = solution.events.map((event, index) => {
    let id = `i07-${index}-${event.kind}`;
    if (event.kind === 'start') id = 'start';
    else if (event.kind === 'wall-bounce' || event.kind === 'wall-stop') id = 'wall-bounce';
    else if (event.kind === 'geometry') {
      geometryIndex += 1;
      id = geometryIndex === 1 ? 'interface' : geometryIndex === 2 ? 'field-exit' : geometryIndex === 3 ? 're-enter' : `re-enter-${geometryIndex}`;
    }
    return { id, t: event.timeS, kind: event.kind, label: event.label, x: event.xM, y: 0 };
  });
  const stateAt = (time: number) => stateAtI07Time(solution, Math.min(time, solution.durationS));
  return baseModel(input, {
    durationS: solution.durationS,
    geometry: baseGeometry({
      mode: 'loop',
      viewBox: { xMin: -0.2, xMax: 3.6, yMin: -1.5, yMax: 1.5 },
      bands: [
        { x0: params.field1LeftM, x1: params.field1RightM, label: `B₁=${params.field1Bz} T`, color: '#dbeafe', glyph: '+' },
        { x0: params.field2LeftM, x1: params.field2RightM, label: `B₂=${params.field2Bz} T`, color: '#fee2e2', glyph: '-' },
      ],
      verticalGuides: [{ x: params.field1RightM, label: '场界' }, { x: params.wallXM, label: '挡板' }],
      wall: { x: params.wallXM },
      loop: { widthM: params.widthM, heightM: params.heightM },
    }),
    traces: [],
    events,
    charts: [
      { id: 'current', title: '感应电流 I', unit: 'A', color: '#0f766e', points: solution.samples.map((sample) => ({ tS: sample.timeS, value: sample.currentA ?? 0 })) },
      { id: 'heat', title: '焦耳热 Q_J', unit: 'J', color: '#7e22ce', points: solution.samples.map((sample) => ({ tS: sample.timeS, value: sample.jouleHeatJ })) },
    ],
    observations: {
      timeS: value(0, 's', '全局时间'),
      x: value(initial.xM, 'm', '线框左边 x'),
      emf: value(initial.emfV, 'V', '电动势'),
      current: value(initial.currentA, 'A', '电流'),
      impact: value(0, 'J', '累计冲击损失'),
    },
    answers,
    issue: solution.issue,
    frameAt(timeS) {
      const state = stateAt(timeS);
      return {
        time: state.timeS,
        markers: [],
        loops: [{ id: 'loop', label: '线框', xM: state.xM, color: '#0f766e' }],
        rods: null,
        observables: {
          timeS: value(state.timeS, 's', '全局时间'),
          x: value(state.xM, 'm', '线框左边 x'),
          velocity: value(state.velocityMps, 'm/s', '速度'),
          flux: value(state.fluxWb, 'Wb', '磁通量 Φ'),
          S: value(state.S, 'T·m', '有效场因子 S'),
          emf: value(state.emfV, 'V', '电动势'),
          current: value(state.currentA, 'A', '电流'),
          force: value(state.magneticForceN, 'N', '磁场力'),
          heat: value(state.jouleHeatJ, 'J', '焦耳热 Q_J'),
          impact: value(state.impactLossJ, 'J', '冲击损失 Q_impact'),
          wallGap: value(state.wallGapM, 'm', '距挡板间隙'),
        },
      };
    },
  });
}

const A17_STAGE_LABELS = {
  'electric-acceleration': '阶段 A · 匀强电场加速',
  'magnetic-strip': '阶段 B · 有限磁场偏转',
  'free-drift': '阶段 C · 无场自由漂移',
} as const;

function buildA17(input: WholeProblemBuildInput): WholeProblemModel {
  const electricFieldXVPerM = pick(input, 'electricFieldX');
  const magneticFieldZT = pick(input, 'magneticFieldZ');
  const magneticWidthM = pick(input, 'magneticWidthM');
  const screenGapM = pick(input, 'screenGapM');
  const compositeInput = {
    ...A17_DEFAULT_INPUT,
    electricFieldXVPerM,
    magneticFieldZT,
    magneticWidthM,
    screenGapM,
  };
  const solution = solveElectricMagneticScreen(compositeInput);
  const screenX = compositeInput.boundaryXM + magneticWidthM + screenGapM;
  const exitA = solution.exitAElectric;
  const exitB = solution.exitBMagnetic;
  const acceptedScreen = solution.screen?.accepted ? solution.screen : null;
  const answer: WholeProblemObservables = {
    accelerationExitSpeedMps: value(exitA?.speedMps, 'm/s', 'A 阶段到达电场边界的速率'),
    accelerationTimeS: value(exitA ? solution.stageTimings.electricS : null, 's', 'A 阶段加速时间'),
    magneticExitTimeS: value(exitB ? solution.stageTimings.magneticS : null, 's', 'B 阶段磁场内运动时间'),
    magneticExitY: value(exitB?.position.y, 'm', 'B 阶段出射点的 y 坐标'),
    magneticExitVx: value(exitB?.velocity.x, 'm/s', 'B 阶段出射速度的 x 分量'),
    magneticExitVy: value(exitB?.velocity.y, 'm/s', 'B 阶段出射速度的 y 分量'),
    screenY: value(acceptedScreen?.position.y, 'm', '屏幕有效接收区的落点 y'),
    totalTimeS: value(acceptedScreen?.timeS, 's', '从出发到命中屏幕的总时间'),
  };
  const points = solution.trace;
  const yValues = [
    ...points.map((point) => point.y),
    ...solution.events.map((event) => event.position.y),
    0,
  ].filter(Number.isFinite);
  const xValues = [
    ...points.map((point) => point.x),
    ...solution.events.map((event) => event.position.x),
    0,
    screenX,
  ].filter(Number.isFinite);
  const yMin = Math.min(...yValues) - 0.5;
  const yMax = Math.max(...yValues) + 0.5;
  const xMin = Math.min(-0.2, ...xValues) - 0.3;
  const xMax = Math.max(...xValues, screenX) + 0.4;
  const trace: WholeProblemTrace = {
    id: 'A',
    label: '粒子 A',
    color: COLORS[0],
    points: points.map((point) => ({ t: point.t, x: point.x, y: point.y })),
  };
  const events: WholeProblemEvent[] = solution.events.map((event) => ({
    id: event.id,
    t: event.tGlobalS,
    kind: event.kind,
    label: event.label,
    x: event.position.x,
    y: event.position.y,
  }));
  const handoffNotes = solution.handoffs.map((handoff) => ({
    id: `handoff-${handoff.to}`,
    t: handoff.atGlobalTimeS,
    kind: 'handoff',
    label: `${handoff.from} → ${handoff.to}：位置误差 ${handoff.positionErrorM.toExponential(2)} m，速度误差 ${handoff.velocityErrorMps.toExponential(2)} m/s。`,
    x: handoff.to === 'magnetic-strip' ? exitA?.position.x : exitB?.position.x,
    y: handoff.to === 'magnetic-strip' ? exitA?.position.y : exitB?.position.y,
  }));
  const initial = solution.stateAt(0);
  return baseModel(input, {
    durationS: Math.max(solution.durationS, 0.1),
    geometry: baseGeometry({
      viewBox: { xMin, xMax, yMin, yMax },
      bands: [
        {
          x0: compositeInput.startPosition.x,
          x1: compositeInput.boundaryXM,
          label: `Eₓ=${electricFieldXVPerM} V/m`,
          color: '#ede9fe',
          glyph: '0',
        },
        {
          x0: compositeInput.boundaryXM,
          x1: compositeInput.boundaryXM + magneticWidthM,
          label: `Bz=${magneticFieldZT} T`,
          color: magneticFieldZT >= 0 ? '#dbeafe' : '#fee2e2',
          glyph: magneticFieldZT >= 0 ? '+' : '-',
        },
      ],
      verticalGuides: [
        { x: compositeInput.boundaryXM, label: '电场边界 / 入场' },
        { x: compositeInput.boundaryXM + magneticWidthM, label: '磁场右边界' },
        { x: screenX, label: '探测屏' },
      ],
      screen: { x: screenX, yMin: -compositeInput.screenHalfHeightM, yMax: compositeInput.screenHalfHeightM },
    }),
    traces: [trace],
    events: [...events, ...handoffNotes].sort((left, right) => left.t - right.t),
    charts: [],
    observations: {
      timeS: value(0, 's', '全局时间'),
      x: value(initial.position.x, 'm', 'x 坐标'),
      y: value(initial.position.y, 'm', 'y 坐标'),
      speed: value(initial.speedMps, 'm/s', '速率'),
      stage: value(null, '', '当前阶段', A17_STAGE_LABELS[initial.stage]),
    },
    answers: answer,
    issue: solution.issue,
    frameAt(timeS) {
      const state = solution.stateAt(timeS);
      return {
        time: state.globalTimeS,
        markers: [{ id: 'A', label: 'A', color: COLORS[0], x: state.position.x, y: state.position.y }],
        loops: [],
        rods: null,
        observables: {
          timeS: value(state.globalTimeS, 's', '全局时间'),
          x: value(state.position.x, 'm', 'x 坐标'),
          y: value(state.position.y, 'm', 'y 坐标'),
          vx: value(state.velocity.x, 'm/s', 'vx'),
          vy: value(state.velocity.y, 'm/s', 'vy'),
          speed: value(state.speedMps, 'm/s', '速率'),
          kinetic: value(state.kineticEnergyJ, 'J', '动能'),
          stage: value(null, '', '当前阶段', A17_STAGE_LABELS[state.stage]),
        },
      };
    },
  });
}

function buildI06(input: WholeProblemBuildInput): WholeProblemModel {
  const initialSpeed = pick(input, 'initialSpeedMps');
  const bz = pick(input, 'bz');
  const params = {
    ...DUAL_ROD_DEFAULT,
    x1M: 0,
    x2M: 1,
    v1Mps: initialSpeed,
    v2Mps: 0,
    durationS: 3,
    BzTesla: bz,
  };
  const solution = solveDualRod(params);
  const initial = stateAtDualRodTime(solution, 0);
  const contact = solution.contactTimeS !== null ? stateAtDualRodTime(solution, solution.contactTimeS) : null;
  const answers: WholeProblemObservables = {
    initialCurrentA: value(initial.currentA, 'A', '初始共享电流'),
    contactTimeS: value(solution.contactTimeS, 's', '接触时间'),
    contactHeatJ: value(contact?.jouleHeatJ, 'J', '接触时的累计焦耳热'),
  };
  const events: WholeProblemEvent[] = solution.events.map((event, index) => ({
    id: event.kind === 'contact' ? 'contact' : event.kind === 'start' ? 'start' : event.kind === 'end' ? 'end' : `i06-${index}-${event.kind}`,
    t: event.timeS,
    kind: event.kind,
    label: event.label,
    x: (stateAtDualRodTime(solution, event.timeS).rod1.x + stateAtDualRodTime(solution, event.timeS).rod2.x) / 2,
    y: 0,
  }));
  return baseModel(input, {
    durationS: solution.durationS,
    geometry: baseGeometry({
      mode: 'rods',
      viewBox: { xMin: -0.6, xMax: 2.6, yMin: -1, yMax: 1 },
      bands: [{ x0: -0.6, x1: 2.6, label: `Bz=${bz} T`, color: bz >= 0 ? '#dbeafe' : '#fee2e2', glyph: bz >= 0 ? '+' : '-' }],
      verticalGuides: [],
      rods: { railMinM: -0.6, railMaxM: 2.6, yM: 0 },
    }),
    traces: [],
    events,
    charts: [
      { id: 'current', title: '共享电流 I', unit: 'A', color: '#0f766e', points: solution.samples.map((sample) => ({ tS: sample.timeS, value: sample.currentA })) },
      { id: 'heat', title: '焦耳热 Q_J', unit: 'J', color: '#7e22ce', points: solution.samples.map((sample) => ({ tS: sample.timeS, value: sample.jouleHeatJ })) },
    ],
    observations: {
      timeS: value(0, 's', '全局时间'),
      x1: value(initial.rod1.x, 'm', '杆 1 位置'),
      x2: value(initial.rod2.x, 'm', '杆 2 位置'),
      current: value(initial.currentA, 'A', '共享电流'),
      heat: value(0, 'J', '焦耳热'),
    },
    answers,
    issue: solution.issue,
    frameAt(timeS) {
      const state = stateAtDualRodTime(solution, Math.min(timeS, solution.durationS));
      return {
        time: state.timeS,
        markers: [],
        loops: [],
        rods: [
          { id: 'rod1', label: '杆 1', xM: state.rod1.x, color: COLORS[0] },
          { id: 'rod2', label: '杆 2', xM: state.rod2.x, color: COLORS[1] },
        ],
        observables: {
          timeS: value(state.timeS, 's', '全局时间'),
          x1: value(state.rod1.x, 'm', '杆 1 位置'),
          x2: value(state.rod2.x, 'm', '杆 2 位置'),
          v1: value(state.rod1.v, 'm/s', '杆 1 速度'),
          v2: value(state.rod2.v, 'm/s', '杆 2 速度'),
          current: value(state.currentA, 'A', '共享电流'),
          emf: value(state.emfTotalV, 'V', '总电动势'),
          force1: value(state.forceRod1N, 'N', '杆 1 磁场力'),
          heat: value(state.jouleHeatJ, 'J', '焦耳热'),
          contact: value(null, '', state.status, '接触状态'),
        },
      };
    },
  });
}

export function buildWholeProblemModel(input: WholeProblemBuildInput): WholeProblemModel {
  switch (input.adapterId) {
    case 'p04-boundary':
      return buildP04(input);
    case 'p05-multizone':
      return buildP05(input);
    case 'p07-beamline':
      return buildP07(input);
    case 'i03-loop-entry':
      return buildI03(input);
    case 'i05-loop-field':
      return buildI05(input);
    case 'i07-opposite-wall':
      return buildI07(input);
    case 'i06-dual-rod':
      return buildI06(input);
    case 'a17-electric-magnetic-screen':
      return buildA17(input);
    default:
      throw new Error(`Unknown whole-problem adapter: ${input.adapterId}`);
  }
}
