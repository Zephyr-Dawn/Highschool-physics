import { useEffect, useMemo, useRef, useState } from 'react';
import {
  beamlineStateAt,
  buildBeamlineRegions,
  type BeamRegion,
  type BeamState,
} from '../../physics/particles/beamline';
import {
  add,
  clamp,
  length,
  normalize,
  scale,
  type Vec2,
} from '../../physics/core/vec2';
import {
  type ParticleInitialState,
  type ParticleLineStyle,
} from '../../physics/particles/multiParticle';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatLength, formatNumber } from '../../lib/format';
import {
  p07DetectionGlobalTime,
  type P07Apparatus,
  type P07LiveOutcome,
  type P07ParticleEvaluation,
} from './p07Scene';

export interface P07Layers {
  predicted: boolean;
  trail: boolean;
  regions: boolean;
  fieldE: boolean;
  fieldB: boolean;
  slits: boolean;
  screen: boolean;
  velocity: boolean;
  forceE: boolean;
  forceB: boolean;
  resultant: boolean;
  allVectors: boolean;
  events: boolean;
  aux: boolean;
  detections: boolean;
  predictedDetection: boolean;
}

export const P07_DEFAULT_LAYERS: P07Layers = {
  predicted: true,
  trail: true,
  regions: true,
  fieldE: true,
  fieldB: true,
  slits: true,
  screen: true,
  velocity: true,
  forceE: true,
  forceB: true,
  resultant: true,
  allVectors: false,
  events: true,
  aux: true,
  detections: true,
  predictedDetection: false,
};

export interface P07EvaluatedParticle extends P07ParticleEvaluation {
  state: BeamState | null;
  liveOutcome: P07LiveOutcome;
}

export interface P07DraftPreview {
  particle: ParticleInitialState;
  solution: P07ParticleEvaluation['solution'];
  state: BeamState;
}

export interface P07ConditionNotice {
  text: string;
  tone: 'preview' | 'recalculated';
}

interface BeamlineStageProps {
  particles: P07EvaluatedParticle[];
  apparatus: P07Apparatus;
  selectedId: string;
  draft: P07DraftPreview | null;
  layers: P07Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  onSelectParticle: (id: string) => void;
  onDraftStart: () => void;
  onDraftChange: (patch: { startX?: number; startY?: number; directionDeg?: number }) => void;
  onDraftEnd: () => void;
  onDraftCancel: () => void;
  conditionNotice: P07ConditionNotice | null;
  trailResetById: Record<string, number>;
}

const DASH_PATTERNS: Record<ParticleLineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 6',
  dotted: '2 5',
  'dash-dot': '10 5 2 5',
  'long-dash': '15 7',
};

const OUTCOME_LABEL: Record<P07LiveOutcome, string> = {
  waiting: '待发射',
  flying: '飞行中',
  'screen-hit': '命中屏幕',
  'screen-outside': '屏幕越界',
  absorbed: '被吸收',
  'not-arrived': '未到达',
  'event-limited': '事件截断',
  invalid: '无效',
};

const REGION_FILL: Record<BeamRegion['kind'], string> = {
  free: 'rgba(148, 163, 184, 0.035)',
  acceleration: 'rgba(245, 158, 11, 0.10)',
  selector: 'rgba(37, 99, 235, 0.09)',
  analyzer: 'rgba(124, 58, 237, 0.10)',
  deflector: 'rgba(15, 118, 110, 0.09)',
};

const REGION_LABEL: Record<BeamRegion['kind'], string> = {
  free: '自由飞行',
  acceleration: '电场加速',
  selector: '速度选择器 E+B',
  analyzer: '磁分析区 B',
  deflector: '末段电偏转 E',
};

function pointsToPath(points: Vec2[], toScreen: (point: Vec2) => Vec2): string {
  return points
    .map((point, index) => {
      const screen = toScreen(point);
      return `${index === 0 ? 'M' : 'L'}${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
    })
    .join(' ');
}

function sampleSolution(
  solution: P07ParticleEvaluation['solution'],
  from: number,
  to: number,
  count: number,
): Vec2[] {
  const start = Math.max(0, Math.min(solution.durationS, from));
  const end = Math.max(start, Math.min(solution.durationS, to));
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let index = 0; index <= n; index++) {
    const state = beamlineStateAt(solution, start + ((end - start) * index) / n);
    points.push(state?.position ?? solution.finalState.position);
  }
  return points;
}

function predictedPoints(item: P07EvaluatedParticle): Vec2[] {
  return sampleSolution(item.solution, 0, item.solution.durationS, 220);
}

function stageBounds(
  particles: P07EvaluatedParticle[],
  apparatus: P07Apparatus,
  draft: P07DraftPreview | null,
): StageBounds {
  const points: Vec2[] = [];
  const stageXs = [
    apparatus.selector.x0,
    apparatus.selector.x1,
    apparatus.analyzer.x0,
    apparatus.analyzer.x1,
    apparatus.deflector.x0,
    apparatus.deflector.x1,
    apparatus.screen.x,
    apparatus.entranceSlit.x,
    apparatus.exitSlit.x,
  ];
  for (const x of stageXs) {
    points.push({ x, y: apparatus.screen.yMin }, { x, y: apparatus.screen.yMax });
  }
  points.push(
    { x: apparatus.entranceSlit.x, y: apparatus.entranceSlit.yCenter + apparatus.entranceSlit.halfWidth },
    { x: apparatus.entranceSlit.x, y: apparatus.entranceSlit.yCenter - apparatus.entranceSlit.halfWidth },
    { x: apparatus.exitSlit.x, y: apparatus.exitSlit.yCenter + apparatus.exitSlit.halfWidth },
    { x: apparatus.exitSlit.x, y: apparatus.exitSlit.yCenter - apparatus.exitSlit.halfWidth },
  );
  for (const item of particles) {
    points.push(item.particle.position);
    points.push(...predictedPoints(item));
    if (item.solution.detection) points.push({ x: apparatus.screen.x, y: item.solution.detection.yHit });
    if (item.solution.screenCrossing) points.push({ x: apparatus.screen.x, y: item.solution.screenCrossing.yHit });
    if (item.solution.absorption) points.push(item.solution.absorption.position);
  }
  if (draft) {
    points.push(draft.particle.position);
    points.push(...sampleSolution(draft.solution, 0, draft.solution.durationS, 220));
  }
  if (points.length === 0) return { minX: -2, minY: -2, maxX: 5, maxY: 2 };
  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));
  minX = Math.min(minX, apparatus.selector.x0 - 0.5);
  maxX = Math.max(maxX, apparatus.screen.x + 0.35);
  minY = Math.min(minY, -0.6);
  maxY = Math.max(maxY, 0.6);
  const spanX = Math.max(0.6, maxX - minX);
  const spanY = Math.max(0.6, maxY - minY);
  return {
    minX: minX - spanX * 0.04 - 0.03,
    maxX: maxX + spanX * 0.04 + 0.03,
    minY: minY - spanY * 0.06 - 0.03,
    maxY: maxY + spanY * 0.06 + 0.03,
  };
}

function niceStep(targetWorld: number): number {
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
  let best = steps[0];
  let bestDiff = Infinity;
  for (const step of steps) {
    const diff = Math.abs(step - targetWorld);
    if (diff < bestDiff) {
      best = step;
      bestDiff = diff;
    }
  }
  return best;
}

function eventMarker(
  event: P07ParticleEvaluation['solution']['events'][number],
  color: string,
  toScreen: (point: Vec2) => Vec2,
  label: boolean,
) {
  const screen = toScreen(event.position);
  if (event.kind === 'absorbed-at-slit') {
    return (
      <g key={`${event.kind}-${event.timeS}`} transform={`translate(${screen.x} ${screen.y})`} aria-hidden="true">
        <path d="M-6,-6L6,6M6,-6L-6,6" stroke="var(--danger)" strokeWidth={2.2} strokeLinecap="round" />
        {label ? <text x={9} y={-7} className="svg-text svg-text-small" fill="var(--danger)">吸收</text> : null}
      </g>
    );
  }
  if (event.kind === 'screen-hit' || event.kind === 'screen-outside') return null;
  if (event.kind === 'tangent') {
    return (
      <g key={`${event.kind}-${event.timeS}`} transform={`translate(${screen.x} ${screen.y})`} aria-hidden="true">
        <circle r={5} fill="none" stroke={color} strokeWidth={1.8} strokeDasharray="2 3" />
        {label ? <text x={7} y={-8} className="svg-text svg-text-small" fill={color}>相切</text> : null}
      </g>
    );
  }
  if (event.kind === 'turning') {
    return (
      <g key={`${event.kind}-${event.timeS}`} transform={`translate(${screen.x} ${screen.y})`} aria-hidden="true">
        <circle r={3} fill={color} opacity={0.8} />
      </g>
    );
  }
  return (
    <g key={`${event.kind}-${event.timeS}-${event.regionAfter}`} transform={`translate(${screen.x} ${screen.y})`} aria-hidden="true">
      <rect x={-3.5} y={-3.5} width={7} height={7} rx={1} fill="var(--surface)" stroke={color} strokeWidth={1.6} transform="rotate(45)" />
      {label ? <text x={7} y={-7} className="svg-text svg-text-small" fill={color}>{event.kind === 'slit-pass' ? '过缝' : '跨界'}</text> : null}
    </g>
  );
}

export function BeamlineStage({
  particles,
  apparatus,
  selectedId,
  draft,
  layers,
  stageMode,
  onStageModeChange,
  onSelectParticle,
  onDraftStart,
  onDraftChange,
  onDraftEnd,
  onDraftCancel,
  conditionNotice,
  trailResetById,
}: BeamlineStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 860, height: 500 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [editingKind, setEditingKind] = useState<'start' | 'velocity' | null>(null);
  const activePointers = useRef(new Set<number>());
  const lastFitSignature = useRef<string | null>(null);

  const selected = particles.find((item) => item.particle.id === selectedId) ?? particles[0];
  const selectedParticle = draft?.particle ?? selected?.particle ?? null;
  const selectedSolution = draft?.solution ?? selected?.solution ?? null;
  const selectedState = draft?.state ?? selected?.state ?? null;
  const selectedOutcome = draft
    ? '预演'
    : selected?.liveOutcome
      ? OUTCOME_LABEL[selected.liveOutcome]
      : '待发射';
  const selectedDetection = selectedSolution?.detection ?? null;
  const selectedAbsorption = selectedSolution?.absorption ?? null;
  const selectedCrossing = selectedSolution?.screenCrossing ?? null;
  const selectedTau = draft ? 0 : selected?.state?.timeS ?? null;
  const selectedLaunch = selected?.runtime.launchTimeSec ?? 0;
  const selectedGlobalHit = selected ? p07DetectionGlobalTime(selected) : null;
  const regions = useMemo(() => buildBeamlineRegions(apparatus), [apparatus]);
  const staticSignature = useMemo(
    () =>
      JSON.stringify(
        particles.map((item) => [
          item.particle.id,
          item.particle.position,
          item.particle.velocity,
          item.particle.visible,
          item.particle.showTrail,
          item.solution.outcome,
          item.solution.durationS,
          item.solution.detection?.yHit ?? null,
          item.solution.absorption?.slitId ?? null,
          item.solution.absorption?.timeS ?? null,
        ]),
      ),
    [particles],
  );
  const bounds = useMemo(
    () => stageBounds(particles, apparatus, draft),
    [apparatus, draft, staticSignature],
  );
  const fitSignature = useMemo(
    () => JSON.stringify({
      apparatus,
      size: [size.width.toFixed(0), size.height.toFixed(0)],
      particles: staticSignature,
      draft: draft ? [draft.particle.position, draft.particle.velocity, draft.solution.outcome] : null,
    }),
    [apparatus, draft, size.height, size.width, staticSignature],
  );
  useEffect(() => {
    if (editingKind !== null || draft) return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 40);
  }, [bounds, draft, editingKind, fitBounds, fitSignature]);

  const sourceScreen = selectedParticle ? toScreen(selectedParticle.position) : null;
  const velocityDir = selectedState
    ? normalize({ x: selectedState.velocity.x, y: -selectedState.velocity.y })
    : selectedParticle
      ? normalize({ x: selectedParticle.velocity.x, y: -selectedParticle.velocity.y })
      : { x: 1, y: 0 };
  const velocityHandleScreen = sourceScreen
    ? add(sourceScreen, scale(velocityDir, 92))
    : null;

  const visibleTopLeft = toWorld({ x: 0, y: 0 });
  const visibleBottomRight = toWorld({ x: size.width, y: size.height });
  const visibleMinX = Math.min(visibleTopLeft.x, visibleBottomRight.x);
  const visibleMaxX = Math.max(visibleTopLeft.x, visibleBottomRight.x);
  const visibleMinY = Math.min(visibleTopLeft.y, visibleBottomRight.y);
  const visibleMaxY = Math.max(visibleTopLeft.y, visibleBottomRight.y);

  const fieldGlyphs = useMemo(() => {
    const eArrows: Array<{ from: Vec2; to: Vec2 }> = [];
    const bGlyphs: Array<{ point: Vec2; bz: number }> = [];
    for (const region of regions) {
      if (region.kind === 'free') continue;
      const x0 = Math.max(region.x0, visibleMinX);
      const x1 = Math.min(region.x1, visibleMaxX);
      if (!(x1 > x0)) continue;
      if (layers.fieldE && (Math.abs(region.Ex) > 1e-12 || Math.abs(region.Ey) > 1e-12)) {
        const step = niceStep(58 / view.scale);
        const startX = Math.ceil(x0 / step) * step;
        const startY = Math.ceil(visibleMinY / step) * step;
        const direction = normalize({ x: region.Ex, y: -region.Ey });
        for (let x = startX; x <= x1; x += step) {
          for (let y = startY; y <= visibleMaxY; y += step) {
            const from = toScreen({ x, y });
            eArrows.push({ from, to: add(from, scale(direction, 16)) });
            if (eArrows.length >= 260) break;
          }
          if (eArrows.length >= 260) break;
        }
      }
      if (layers.fieldB && Math.abs(region.Bz) > 1e-12) {
        const step = niceStep(66 / view.scale);
        const startX = Math.ceil(x0 / step) * step;
        const startY = Math.ceil(visibleMinY / step) * step;
        for (let x = startX; x <= x1; x += step) {
          for (let y = startY; y <= visibleMaxY; y += step) {
            bGlyphs.push({ point: toScreen({ x, y }), bz: region.Bz });
            if (bGlyphs.length >= 220) break;
          }
          if (bGlyphs.length >= 220) break;
        }
      }
    }
    return { eArrows, bGlyphs };
  }, [layers.fieldB, layers.fieldE, regions, toScreen, view.scale, visibleMaxX, visibleMaxY, visibleMinX, visibleMinY]);

  const predicted = useMemo(
    () =>
      particles
        .filter((item) => layers.predicted && item.particle.visible && !(draft && item.particle.id === selectedId))
        .map((item) => ({
          id: item.particle.id,
          color: item.particle.color,
          path: pointsToPath(predictedPoints(item), toScreen),
        })),
    [draft, layers.predicted, selectedId, staticSignature, toScreen],
  );

  const draftPath = useMemo(
    () => (draft ? pointsToPath(sampleSolution(draft.solution, 0, draft.solution.durationS, 220), toScreen) : ''),
    [draft, toScreen],
  );

  const regionLayer = useMemo(() => {
    if (!layers.regions) return null;
    return (
      <g data-testid="p07-regions" aria-hidden="true">
        {regions.map((region) => {
          const x0 = Math.max(0, Math.min(size.width, toScreen({ x: region.x0, y: 0 }).x));
          const x1 = Math.max(0, Math.min(size.width, toScreen({ x: region.x1, y: 0 }).x));
          if (x1 - x0 < 0.5) return null;
          return (
            <g key={region.id}>
              <rect x={x0} y={0} width={x1 - x0} height={size.height} fill={REGION_FILL[region.kind]} />
              {region.kind !== 'free' && x1 - x0 > 52 ? (
                <text x={(x0 + x1) / 2} y={size.height - 10} textAnchor="middle" className="svg-text svg-text-small p07-region-label">
                  {REGION_LABEL[region.kind]}
                </text>
              ) : null}
            </g>
          );
        })}
        {[...new Set(regions.flatMap((region) => [region.x0, region.x1]))]
          .filter((x) => Math.abs(x) < 1e6)
          .map((x) => {
            const screenX = toScreen({ x, y: 0 }).x;
            if (screenX < -1 || screenX > size.width + 1) return null;
            return (
              <line key={`boundary-${x}`} x1={screenX} y1={0} x2={screenX} y2={size.height} stroke="var(--line-strong)" strokeWidth={1.2} strokeDasharray="6 6" opacity={0.55} />
            );
          })}
      </g>
    );
  }, [layers.regions, regions, size.height, size.width, toScreen]);

  const fieldLayer = useMemo(
    () => (
      <g aria-hidden="true">
        {fieldGlyphs.eArrows.map((arrow, index) => (
          <line key={`e-${index}`} x1={arrow.from.x} y1={arrow.from.y} x2={arrow.to.x} y2={arrow.to.y} stroke="var(--force)" strokeWidth={1.1} opacity={0.27} markerEnd="url(#p07-arrow-e)" />
        ))}
        {fieldGlyphs.bGlyphs.map((glyph, index) => (
          <g key={`b-${index}`} transform={`translate(${glyph.point.x.toFixed(1)} ${glyph.point.y.toFixed(1)})`} opacity={0.32}>
            <circle r={5.5} fill="none" stroke="var(--field)" strokeWidth={1} />
            {glyph.bz > 0 ? <circle r={1.6} fill="var(--field)" /> : <path d="M-2.3,-2.3L2.3,2.3M2.3,-2.3L-2.3,2.3" stroke="var(--field)" strokeWidth={1.1} />}
          </g>
        ))}
      </g>
    ),
    [fieldGlyphs],
  );

  const deviceLayer = useMemo(
    () => (
      <g aria-hidden="true">
        {layers.screen ? (
          <g data-testid="p07-screen">
            <line x1={toScreen({ x: apparatus.screen.x, y: apparatus.screen.yMin }).x} y1={0} x2={toScreen({ x: apparatus.screen.x, y: apparatus.screen.yMin }).x} y2={size.height} stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="4 7" opacity={0.45} />
            <line
              x1={toScreen({ x: apparatus.screen.x, y: apparatus.screen.yMin }).x}
              y1={toScreen({ x: apparatus.screen.x, y: apparatus.screen.yMin }).y}
              x2={toScreen({ x: apparatus.screen.x, y: apparatus.screen.yMax }).x}
              y2={toScreen({ x: apparatus.screen.x, y: apparatus.screen.yMax }).y}
              stroke="var(--flux-strong)"
              strokeWidth={5}
              strokeLinecap="round"
            />
            <text x={toScreen({ x: apparatus.screen.x, y: 0 }).x + 7} y={size.height - 30} className="svg-text svg-text-small" fill="var(--flux-strong)">
              探测屏
            </text>
          </g>
        ) : null}
        {layers.slits ? (
          <g data-testid="p07-slits">
            {[
              { slit: apparatus.entranceSlit, label: '入口狭缝', key: 'entrance' },
              { slit: apparatus.exitSlit, label: '出口狭缝', key: 'exit' },
            ].map(({ slit, label, key }) => {
              const screenX = toScreen({ x: slit.x, y: 0 }).x;
              const top = toScreen({ x: slit.x, y: slit.yCenter + slit.halfWidth }).y;
              const bottom = toScreen({ x: slit.x, y: slit.yCenter - slit.halfWidth }).y;
              const topPlate = Math.max(0, Math.min(size.height, top));
              const bottomPlate = Math.max(0, Math.min(size.height, bottom));
              const labelY = clamp((topPlate + bottomPlate) / 2 + 18, 18, size.height - 18);
              return (
                <g key={key}>
                  {topPlate > 1 ? <line x1={screenX} y1={0} x2={screenX} y2={topPlate} stroke="var(--ink-muted)" strokeWidth={7} strokeLinecap="round" opacity={0.85} /> : null}
                  {bottomPlate < size.height - 1 ? <line x1={screenX} y1={bottomPlate} x2={screenX} y2={size.height} stroke="var(--ink-muted)" strokeWidth={7} strokeLinecap="round" opacity={0.85} /> : null}
                  <line x1={screenX} y1={topPlate} x2={screenX + 11} y2={topPlate} stroke="var(--ink-strong)" strokeWidth={1.6} />
                  <line x1={screenX} y1={bottomPlate} x2={screenX + 11} y2={bottomPlate} stroke="var(--ink-strong)" strokeWidth={1.6} />
                  <text x={screenX + 12} y={labelY} className="svg-text svg-text-small" fill="var(--ink-muted)">{label}</text>
                </g>
              );
            })}
          </g>
        ) : null}
      </g>
    ),
    [apparatus, layers.screen, layers.slits, size.height, size.width, toScreen],
  );

  const predictedLayer = useMemo(
    () =>
      predicted.map((path) => (
        <path key={`p07-pred-${path.id}`} d={path.path} fill="none" stroke={path.color} strokeWidth={1.2} strokeDasharray="5 7" opacity={path.id === selectedId ? 0.55 : 0.24} strokeLinecap="round" aria-hidden="true" />
      )),
    [predicted, selectedId, toScreen],
  );

  const trails = useMemo(
    () =>
      particles
        .filter((item) => layers.trail && item.particle.showTrail && item.particle.visible && !(draft && item.particle.id === selectedId))
        .map((item) => {
          if (!item.state || item.state.timeS <= 1e-12) return null;
          const reset = trailResetById[item.particle.id];
          const from = reset === undefined ? 0 : Math.max(0, reset - item.runtime.launchTimeSec);
          if (item.state.timeS <= from + 1e-12) return null;
          const points = sampleSolution(item.solution, from, item.state.timeS, 120);
          return { id: item.particle.id, item, path: pointsToPath(points, toScreen) };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [draft, layers.trail, particles, selectedId, toScreen, trailResetById],
  );

  const detectorMarkers = particles
    .filter(() => layers.detections)
    .map((item) => {
      const detection = item.solution.detection;
      const crossing = item.solution.screenCrossing;
      const absorption = item.solution.absorption;
      if (detection) {
        const screen = toScreen({ x: apparatus.screen.x, y: detection.yHit });
        const visible = item.liveOutcome === 'screen-hit';
        if (!visible && !layers.predictedDetection) return null;
        return (
          <g key={`detector-${item.particle.id}`} transform={`translate(${screen.x} ${screen.y})`} data-testid={`p07-detection-${item.particle.label}`} aria-hidden="true">
            <circle r={visible ? 8 : 6} fill={visible ? item.particle.color : 'none'} opacity={visible ? 0.9 : 0.5} stroke="var(--surface)" strokeWidth={2} strokeDasharray={visible ? undefined : '3 3'} />
            <circle r={visible ? 12 : 9} fill="none" stroke={item.particle.color} strokeWidth={1.5} opacity={visible ? 0.6 : 0.35} />
            <text x={13} y={-10} className="svg-text svg-text-small" fill={item.particle.color}>{item.particle.label} {visible ? '命中' : '预计'}</text>
          </g>
        );
      }
      if (crossing) {
        const screen = toScreen({ x: apparatus.screen.x, y: crossing.yHit });
        const visible = item.liveOutcome === 'screen-outside';
        if (!visible && !layers.predictedDetection) return null;
        return (
          <g key={`outside-${item.particle.id}`} transform={`translate(${screen.x} ${screen.y})`} data-testid={`p07-outside-${item.particle.label}`} aria-hidden="true">
            <rect x={-5} y={-5} width={10} height={10} fill="none" stroke="var(--danger)" strokeWidth={1.7} strokeDasharray="3 3" opacity={visible ? 0.9 : 0.4} />
            <text x={11} y={-8} className="svg-text svg-text-small" fill="var(--danger)">{item.particle.label} 越界</text>
          </g>
        );
      }
      if (absorption) {
        const screen = toScreen(absorption.position);
        const visible = item.liveOutcome === 'absorbed';
        if (!visible && !layers.predictedDetection) return null;
        return (
          <g key={`absorb-${item.particle.id}`} transform={`translate(${screen.x} ${screen.y})`} data-testid={`p07-absorb-${item.particle.label}`} aria-hidden="true">
            <path d="M-6,-6L6,6M6,-6L-6,6" stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" opacity={visible ? 0.9 : 0.4} />
            <text x={9} y={-7} className="svg-text svg-text-small" fill="var(--danger)">{item.particle.label} 吸收</text>
          </g>
        );
      }
      return null;
    })
    .filter(Boolean);

  const beginParticleDrag = (kind: 'start' | 'velocity') => (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact' || activePointers.current.size > 1) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setEditingKind(kind);
    onDraftStart();
  };
  const moveDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editingKind || activePointers.current.size > 1) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (editingKind === 'start') {
      onDraftChange({
        startX: Number(clamp(world.x, -6, 0.6).toFixed(4)),
        startY: Number(clamp(world.y, -3, 3).toFixed(4)),
      });
    } else if (selectedParticle) {
      const dx = world.x - selectedParticle.position.x;
      const dy = world.y - selectedParticle.position.y;
      if (Math.hypot(dx, dy) * view.scale < 12) return;
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      onDraftChange({ directionDeg: Number(angle.toFixed(1)) });
    }
  };
  const endDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editingKind) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setEditingKind(null);
    onDraftEnd();
  };
  const cancelDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editingKind) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setEditingKind(null);
    onDraftCancel();
  };
  const onSvgPointerDownCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.add(event.pointerId);
    if (activePointers.current.size > 1 && editingKind) {
      setEditingKind(null);
      onDraftCancel();
    }
  };
  const onSvgPointerEndCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.delete(event.pointerId);
  };
  const fitNow = () => {
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 40);
  };

  const scaleBarStep = niceStep(84 / view.scale);
  const scaleBarWidth = scaleBarStep * view.scale;

  return (
    <div className="stage-card p07-stage-card">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        extra={<span className="stage-toolbar-chip">束线 · {particles.length}/5</span>}
      />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="p07-stage"
        data-view-scale={view.scale.toFixed(3)}
        data-particle-count={particles.length}
        data-selected-id={selectedId}
        data-editing={editingKind !== null}
        data-selected-outcome={selected?.liveOutcome ?? 'waiting'}
        data-selected-final-outcome={selectedSolution?.outcome ?? ''}
        data-selected-tau={selectedTau ?? ''}
        data-selected-launch-time={selectedLaunch}
        data-selected-start-x={selectedParticle?.position.x.toFixed(4) ?? ''}
        data-selected-start-y={selectedParticle?.position.y.toFixed(4) ?? ''}
        data-detection-y={selectedDetection?.yHit ?? ''}
        data-global-hit-time={selectedGlobalHit ?? ''}
        data-absorption-slit={selectedAbsorption?.slitId ?? ''}
        data-screen-crossing-y={selectedCrossing?.yHit ?? ''}
        data-selector-matched={selectedSolution?.selectorMatch?.matched ?? false}
        data-screen-x={apparatus.screen.x.toFixed(4)}
        data-entrance-aperture={apparatus.entranceSlit.halfWidth.toFixed(4)}
        data-exit-aperture={apparatus.exitSlit.halfWidth.toFixed(4)}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`P07 多级带电粒子束线，共 ${particles.length} 个粒子。选中 ${selectedParticle?.label ?? '—'}，当前 ${selectedOutcome}。`}
          data-testid="p07-stage-svg"
          onPointerDownCapture={onSvgPointerDownCapture}
          onPointerUpCapture={onSvgPointerEndCapture}
          onPointerCancelCapture={onSvgPointerEndCapture}
          {...stageHandlers}
        >
          <defs>
            <marker id="p07-arrow-v" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--velocity)" />
            </marker>
            <marker id="p07-arrow-e" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--force)" />
            </marker>
            <marker id="p07-arrow-b" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--field)" />
            </marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />

          {regionLayer}
          {fieldLayer}
          {deviceLayer}
          {predictedLayer}
          {draft ? (
            <g data-testid="p07-preview-path" aria-hidden="true">
              <path d={draftPath} fill="none" stroke={draft.particle.color} strokeWidth={2.3} strokeDasharray="7 7" strokeLinecap="round" />
              <text x={(sourceScreen?.x ?? 0) + 14} y={(sourceScreen?.y ?? 0) - 18} className="svg-text svg-text-small" fill={draft.particle.color}>
                {draft.particle.label} 新初态
              </text>
            </g>
          ) : null}

          {trails.map((trail) => (
            <path
              key={`p07-trail-${trail.id}`}
              d={trail.path}
              fill="none"
              stroke={trail.item.particle.color}
              strokeWidth={trail.id === selectedId ? 3.3 : 2.4}
              strokeDasharray={DASH_PATTERNS[trail.item.particle.lineStyle]}
              opacity={trail.id === selectedId ? 0.95 : 0.55}
              strokeLinecap="round"
              aria-hidden="true"
            />
          ))}

          {detectorMarkers}

          {particles.map((item) => {
            if (draft && item.particle.id === selectedId) return null;
            const isSelected = item.particle.id === selectedId;
            const state = item.state;
            const marker = state ? toScreen(state.position) : toScreen(item.particle.position);
            const source = toScreen(item.particle.position);
            const terminal = item.liveOutcome === 'screen-hit' || item.liveOutcome === 'screen-outside' || item.liveOutcome === 'absorbed';
            const showVectors = (layers.allVectors || isSelected) && !terminal;
            const itemVelocityDir = state
              ? normalize({ x: state.velocity.x, y: -state.velocity.y })
              : normalize({ x: item.particle.velocity.x, y: -item.particle.velocity.y });
            const itemForceScale = Math.max(
              1e-9,
              state ? Math.max(length(state.forceE), length(state.forceB), length(state.force)) : 1,
            );
            const itemForceLength = (force: Vec2) => clamp(16, 78, 18 + (length(force) / itemForceScale) * 56);
            return (
              <g
                key={item.particle.id}
                data-testid={`p07-particle-${item.particle.label}`}
                data-particle-id={item.particle.id}
                data-outcome={item.liveOutcome}
                data-final-outcome={item.solution.outcome}
                data-region={state?.regionId ?? ''}
                data-launch-time={item.runtime.launchTimeSec}
                data-tau={state?.timeS ?? ''}
                data-x={state?.position.x.toFixed(6) ?? ''}
                data-y={state?.position.y.toFixed(6) ?? ''}
                data-detection-y={item.solution.detection?.yHit ?? ''}
                data-global-hit-time={p07DetectionGlobalTime(item) ?? ''}
                data-absorption-slit={item.solution.absorption?.slitId ?? ''}
                data-absorption-time={item.solution.absorption?.timeS ?? ''}
                data-screen-crossing-y={item.solution.screenCrossing?.yHit ?? ''}
                data-speed={state?.speed.toFixed(6) ?? ''}
                data-kinetic-j={state?.kineticEnergyJ.toFixed(6) ?? ''}
                data-start-x={item.particle.position.x.toFixed(5)}
                data-start-y={item.particle.position.y.toFixed(5)}
                data-charge-c={item.particle.chargeC}
                data-mass-kg={item.particle.massKg}
                data-selector-matched={item.solution.selectorMatch?.matched ?? false}
                data-selected={isSelected}
                opacity={item.particle.visible ? 1 : 0.16}
              >
                {item.particle.visible ? (
                  <>
                    <circle cx={source.x} cy={source.y} r={4.5} fill="var(--surface)" stroke={item.particle.color} strokeWidth={1.5} strokeDasharray={state ? undefined : '2 3'} opacity={state ? 0.55 : 0.35} aria-hidden="true" />
                    {state ? (
                      <>
                        {terminal ? (
                          <circle r={10} fill="none" stroke={item.particle.color} strokeWidth={1.8} strokeDasharray="3 3" opacity={0.8} transform={`translate(${marker.x} ${marker.y})`} />
                        ) : null}
                        <circle cx={marker.x} cy={marker.y} r={isSelected ? 8.5 : 6.5} fill={item.particle.color} stroke="var(--surface)" strokeWidth={2} aria-hidden="true" />
                        <text x={marker.x + 11} y={marker.y - 9} className="svg-text svg-text-small" fill={item.particle.color} aria-hidden="true">
                          {item.particle.label}
                          {terminal ? ` · ${OUTCOME_LABEL[item.liveOutcome]}` : ''}
                        </text>
                        {showVectors ? (
                          <>
                            {layers.velocity ? (
                              <line x1={marker.x} y1={marker.y} x2={marker.x + itemVelocityDir.x * 42} y2={marker.y + itemVelocityDir.y * 42} stroke="var(--velocity)" strokeWidth={2} markerEnd="url(#p07-arrow-v)" opacity={0.8} aria-hidden="true" />
                            ) : null}
                            {layers.forceE && (Math.abs(state.forceE.x) > 1e-12 || Math.abs(state.forceE.y) > 1e-12) ? (
                              <line
                                x1={marker.x}
                                y1={marker.y}
                                x2={marker.x + normalize({ x: state.forceE.x, y: -state.forceE.y }).x * itemForceLength(state.forceE)}
                                y2={marker.y + normalize({ x: state.forceE.x, y: -state.forceE.y }).y * itemForceLength(state.forceE)}
                                stroke="var(--force)"
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                markerEnd="url(#p07-arrow-e)"
                                opacity={0.8}
                                aria-hidden="true"
                              />
                            ) : null}
                            {layers.forceB && (Math.abs(state.forceB.x) > 1e-12 || Math.abs(state.forceB.y) > 1e-12) ? (
                              <line
                                x1={marker.x}
                                y1={marker.y}
                                x2={marker.x + normalize({ x: state.forceB.x, y: -state.forceB.y }).x * itemForceLength(state.forceB)}
                                y2={marker.y + normalize({ x: state.forceB.x, y: -state.forceB.y }).y * itemForceLength(state.forceB)}
                                stroke="var(--field)"
                                strokeWidth={2}
                                strokeDasharray="3 4"
                                markerEnd="url(#p07-arrow-b)"
                                opacity={0.8}
                                aria-hidden="true"
                              />
                            ) : null}
                            {layers.resultant && (Math.abs(state.force.x) > 1e-12 || Math.abs(state.force.y) > 1e-12) ? (
                              <line
                                x1={marker.x}
                                y1={marker.y}
                                x2={marker.x + normalize({ x: state.force.x, y: -state.force.y }).x * itemForceLength(state.force)}
                                y2={marker.y + normalize({ x: state.force.x, y: -state.force.y }).y * itemForceLength(state.force)}
                                stroke="var(--danger)"
                                strokeWidth={2.4}
                                markerEnd="url(#p07-arrow-e)"
                                opacity={0.9}
                                aria-hidden="true"
                              />
                            ) : null}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <circle cx={source.x} cy={source.y} r={8} fill="none" stroke={item.particle.color} strokeWidth={1.6} strokeDasharray="3 4" opacity={0.6} aria-hidden="true" />
                        <text x={source.x + 12} y={source.y - 9} className="svg-text svg-text-small" fill={item.particle.color} aria-hidden="true">{item.particle.label} 待发射</text>
                      </>
                    )}
                    {stageMode === 'interact' && !isSelected ? (
                      <circle
                        cx={marker.x}
                        cy={marker.y}
                        r={26}
                        fill="transparent"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          onSelectParticle(item.particle.id);
                        }}
                        style={{ cursor: 'pointer' }}
                        data-testid={`p07-particle-hit-${item.particle.label}`}
                      />
                    ) : null}
                  </>
                ) : null}
              </g>
            );
          })}

          {draft ? (
            <g data-testid="p07-draft-particle" aria-hidden="true">
              <circle cx={sourceScreen?.x ?? 0} cy={sourceScreen?.y ?? 0} r={9} fill="none" stroke={draft.particle.color} strokeWidth={2.4} />
              <circle cx={sourceScreen?.x ?? 0} cy={sourceScreen?.y ?? 0} r={3} fill={draft.particle.color} />
              <text x={(sourceScreen?.x ?? 0) + 13} y={(sourceScreen?.y ?? 0) - 25} className="svg-text svg-text-small" fill={draft.particle.color}>{draft.particle.label} 预演</text>
            </g>
          ) : null}

          {layers.events
            ? selectedSolution?.events.map((event) => {
                const occurred = selectedTau !== null && selectedTau >= event.timeS - 1e-9;
                if (!occurred && !layers.predictedDetection) return null;
                return (
                  <g key={`${event.kind}-${event.timeS}-${event.regionAfter}`} opacity={occurred ? 1 : 0.28}>
                    {eventMarker(event, selectedParticle?.color ?? 'var(--field)', toScreen, occurred)}
                  </g>
                );
              })
            : null}

          {layers.aux && selectedSolution ? (() => {
            const arc = selectedSolution.segments.find((segment) => segment.regionKind === 'analyzer' && Math.abs(segment.Bz) > 1e-12);
            if (!arc) return null;
            const omega = -(selectedParticle?.chargeC ?? 1) * arc.Bz / (selectedParticle?.massKg ?? 1);
            if (Math.abs(omega) < 1e-12) return null;
            const radius = Math.hypot(arc.startVelocity.x, arc.startVelocity.y) / Math.abs(omega);
            const center = {
              x: arc.startPosition.x - arc.startVelocity.y / omega,
              y: arc.startPosition.y + arc.startVelocity.x / omega,
            };
            const centerScreen = toScreen(center);
            const startScreen = toScreen(arc.startPosition);
            return (
              <g aria-hidden="true" data-testid="p07-analyzer-circle">
                <circle cx={centerScreen.x} cy={centerScreen.y} r={radius * view.scale} fill="none" stroke="var(--aux)" strokeWidth={1.2} strokeDasharray="6 7" />
                <line x1={centerScreen.x} y1={centerScreen.y} x2={startScreen.x} y2={startScreen.y} stroke="var(--aux-strong)" strokeWidth={1.4} />
                <circle cx={centerScreen.x} cy={centerScreen.y} r={4} fill="var(--surface)" stroke="var(--aux-strong)" strokeWidth={1.6} />
              </g>
            );
          })() : null}

          {stageMode === 'interact' && selectedParticle && sourceScreen ? (
            <g className="stage-handle stage-handle-start" transform={`translate(${sourceScreen.x} ${sourceScreen.y})`} onPointerDown={beginParticleDrag('start')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p07-start-handle">
              <circle r={26} fill="transparent" data-testid="p07-start-handle-hit" />
              <circle r={19} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <text x={-58} y={-26} className="svg-text svg-text-small" fill={selectedParticle.color}>{selectedParticle.label} 源点</text>
            </g>
          ) : null}

          {stageMode === 'interact' && selectedParticle && velocityHandleScreen ? (
            <g className="stage-handle" transform={`translate(${velocityHandleScreen.x} ${velocityHandleScreen.y})`} onPointerDown={beginParticleDrag('velocity')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p07-velocity-handle">
              <circle r={26} fill="transparent" data-testid="p07-velocity-handle-hit" />
              <circle r={13} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <path d="M-4,-3L4,5M-4,5L4,-3" className="handle-grip" />
              <text x={18} y={-18} className="svg-text svg-text-small" fill={selectedParticle.color}>拖方向</text>
            </g>
          ) : null}

          <g transform={`translate(20 ${Math.max(50, size.height - 24)})`} aria-hidden="true">
            <line x1={0} y1={0} x2={scaleBarWidth} y2={0} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={scaleBarWidth} y1={-4} x2={scaleBarWidth} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <text x={scaleBarWidth + 8} y={4} className="svg-text svg-text-small" fill="var(--ink-muted)">{formatLength(scaleBarStep)}</text>
          </g>
        </svg>

        <div className="stage-hud" aria-hidden="true">
          <span className="hud-chip hud-field">
            选速 E_y {formatNumber(apparatus.selector.Ey, 2)} V/m · B_z {formatNumber(apparatus.selector.Bz, 2)} T
          </span>
          <span className="hud-chip hud-chip-quiet">
            分析 B {formatNumber(apparatus.analyzer.Bz, 2)} T · 末段 E_y {formatNumber(apparatus.deflector.Ey, 2)} V/m
          </span>
          <span className="hud-chip hud-chip-quiet">屏幕 x={formatLength(apparatus.screen.x)}</span>
          <span className="hud-chip hud-chip-quiet">粒子 {particles.length}/5 · 选中 {selectedParticle?.label ?? '—'}</span>
          <span className="hud-chip hud-chip-quiet">{selectedParticle?.label ?? '—'} · {selectedOutcome}</span>
        </div>

        {conditionNotice ? (
          <div className={`condition-notice condition-notice-${conditionNotice.tone}`} data-testid="p07-condition-notice" role="status" aria-live="polite">{conditionNotice.text}</div>
        ) : null}
        {!conditionNotice && stageMode === 'interact' ? (
          <div className="stage-drag-hint">拖源点/方向手柄编辑选中粒子 · 双指缩放 · 场与器件用右侧滑杆</div>
        ) : null}
      </div>
      <StageLegend
        items={[
          { label: '已走轨迹', color: 'var(--trajectory)', variant: 'solid' },
          { label: '完整预测', color: 'var(--preview)', variant: 'dashed' },
          { label: '速度 v', color: 'var(--velocity)', variant: 'solid' },
          { label: 'F_E 电场力', color: 'var(--force)', variant: 'dashed' },
          { label: 'F_B 磁场力', color: 'var(--field)', variant: 'dashed' },
          { label: '狭缝/吸收板', color: 'var(--ink-muted)', variant: 'dot' },
          { label: '屏幕探测', color: 'var(--flux-strong)', variant: 'dot' },
        ]}
      />
    </div>
  );
}
