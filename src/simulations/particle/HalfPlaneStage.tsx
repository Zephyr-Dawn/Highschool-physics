import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sampleHalfPlaneTrajectory,
  type BoundaryEvent,
  type HalfPlaneParticleState,
  type HalfPlaneSegment,
  type HalfPlaneSolution,
} from '../../physics/particles/halfPlane';
import {
  CHARGE_UNIT_C,
  SPEED_UNIT_MPS,
} from '../../physics/particles/uniformB';
import { add, clamp, length, normalize, scale, type Vec2 } from '../../physics/core/vec2';
import {
  type ParticleInitialState,
  type ParticleLineStyle,
  type ParticleRuntime,
} from '../../physics/particles/multiParticle';
import { useElementSize } from '../../hooks/useElementSize';
import { boundsFromPoints, useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatLength, formatNumber, formatTime } from '../../lib/format';
import type { P03Field } from './p03Scene';

export interface P03Layers {
  predicted: boolean;
  trail: boolean;
  center: boolean;
  radii: boolean;
  chord: boolean;
  angle: boolean;
  vectors: boolean;
  force: boolean;
  field: boolean;
  markers: boolean;
  allAux: boolean;
  allVectors: boolean;
}

export const P03_DEFAULT_LAYERS: P03Layers = {
  predicted: true,
  trail: true,
  center: true,
  radii: true,
  chord: true,
  angle: true,
  vectors: true,
  force: true,
  field: true,
  markers: true,
  allAux: false,
  allVectors: false,
};

export interface P03EvaluatedParticle {
  particle: ParticleInitialState;
  solution: HalfPlaneSolution;
  runtime: ParticleRuntime;
  state: HalfPlaneParticleState | null;
}

export interface P03DraftPreview {
  particle: ParticleInitialState;
  solution: HalfPlaneSolution;
  state: HalfPlaneParticleState;
}

export interface P03ConditionNotice {
  text: string;
  tone: 'preview' | 'recalculated';
}

interface HalfPlaneStageProps {
  particles: P03EvaluatedParticle[];
  field: P03Field;
  selectedId: string;
  draft: P03DraftPreview | null;
  layers: P03Layers;
  stageMode: StageMode;
  fieldEditing: boolean;
  onStageModeChange: (mode: StageMode) => void;
  onSelectParticle: (id: string) => void;
  onDraftStart: () => void;
  onDraftChange: (patch: { startX?: number; startY?: number; directionDeg?: number }) => void;
  onDraftEnd: () => void;
  onDraftCancel: () => void;
  onFieldEditStart: () => void;
  onFieldEditChange: (boundaryX: number) => void;
  onFieldEditEnd: () => void;
  onFieldEditCancel: () => void;
  conditionNotice: P03ConditionNotice | null;
  trailResetById: Record<string, number>;
}

export const P03_STATUS_LABEL: Record<HalfPlaneSolution['status'], string> = {
  'entered-and-exited': '已进入并出场',
  'entered-no-exit': '已入场 · 无出场',
  'tangent-no-exit': '相切 · 无出场',
  'starts-inside-and-exited': '场内出发 · 已出场',
  'starts-inside-no-exit': '场内出发 · 无出场',
  'no-entry': '无有效入场',
  'no-magnetic-field': '无磁场偏转',
  stationary: '静止',
  invalid: '输入无效',
};

const DASH: Record<ParticleLineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 6',
  dotted: '2 5',
  'dash-dot': '10 5 2 5',
  'long-dash': '15 7',
};
const NICE_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];

function niceStep(targetWorld: number): number {
  let best = NICE_STEPS[0];
  let bestDiff = Infinity;
  for (const step of NICE_STEPS) {
    const diff = Math.abs(step - targetWorld);
    if (diff < bestDiff) {
      best = step;
      bestDiff = diff;
    }
  }
  return best;
}

function sampleSegmentWorld(segment: HalfPlaneSegment, count: number): Vec2[] {
  if (segment.kind === 'line') {
    const duration = segment.endTimeS - segment.startTimeS;
    return [segment.position, add(segment.position, scale(segment.velocity, duration))];
  }
  const n = Math.max(8, count);
  const points: Vec2[] = [];
  const duration = segment.endTimeS - segment.startTimeS;
  for (let index = 0; index <= n; index++) {
    const t = segment.startTimeS + (duration * index) / n;
    const tau = t - segment.startTimeS;
    const angle = segment.omegaRadPerS * tau;
    const radial = {
      x: segment.startPosition.x - segment.center.x,
      y: segment.startPosition.y - segment.center.y,
    };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.push({
      x: segment.center.x + radial.x * cos - radial.y * sin,
      y: segment.center.y + radial.x * sin + radial.y * cos,
    });
  }
  return points;
}

function pointsToPath(points: Vec2[], toScreen: (point: Vec2) => Vec2): string {
  return points
    .map((point, index) => {
      const screen = toScreen(point);
      return `${index === 0 ? 'M' : 'L'}${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
    })
    .join(' ');
}

function solutionBounds(solution: HalfPlaneSolution): StageBounds {
  const points: Vec2[] = [solution.launchPoint, solution.input.boundaryPoint];
  if (solution.entry?.position) points.push(solution.entry.position);
  if (solution.exit?.position) points.push(solution.exit.position);
  if (solution.tangent?.position) points.push(solution.tangent.position);
  for (const segment of solution.segments) {
    points.push(...sampleSegmentWorld(segment, segment.kind === 'arc' ? 60 : 2));
  }
  if (points.every((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return boundsFromPoints([{ x: 0, y: 0 }], 0.2);
  }
  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));
  minX = Math.min(minX, solution.input.boundaryPoint.x - 0.02);
  maxX = Math.max(maxX, solution.input.boundaryPoint.x + 0.12);
  const spanX = Math.max(0.1, maxX - minX);
  const spanY = Math.max(0.1, maxY - minY);
  return {
    minX: minX - spanX * 0.15 - 0.015,
    maxX: maxX + spanX * 0.15 + 0.015,
    minY: Math.min(minY, -spanY * 0.25) - spanY * 0.16 - 0.015,
    maxY: Math.max(maxY, spanY * 0.25) + spanY * 0.16 + 0.015,
  };
}

function unionBounds(items: StageBounds[]): StageBounds {
  if (items.length === 0) return { minX: -0.3, minY: -0.3, maxX: 0.3, maxY: 0.3 };
  return {
    minX: Math.min(...items.map((item) => item.minX)),
    minY: Math.min(...items.map((item) => item.minY)),
    maxX: Math.max(...items.map((item) => item.maxX)),
    maxY: Math.max(...items.map((item) => item.maxY)),
  };
}

function statusTone(status: HalfPlaneSolution['status']): string {
  if (status === 'entered-and-exited' || status === 'starts-inside-and-exited') return 'ok';
  if (status === 'no-entry' || status === 'invalid') return 'warn';
  if (status === 'tangent-no-exit' || status === 'entered-no-exit' || status === 'starts-inside-no-exit') return 'tangent';
  return 'quiet';
}

function eventMarker(
  event: BoundaryEvent | null,
  color: string,
  kind: 'entry' | 'exit' | 'tangent',
  toScreen: (point: Vec2) => Vec2,
  showLabel: boolean,
  testId?: string,
) {
  if (!event?.position) return null;
  const screen = toScreen(event.position);
  if (kind === 'exit') {
    return (
      <g transform={`translate(${screen.x} ${screen.y})`} data-testid={testId}>
        <rect x={-5} y={-5} width={10} height={10} rx={2} fill="var(--surface)" stroke={color} strokeWidth={2} transform="rotate(45)" />
        {showLabel ? <text x={9} y={-9} className="svg-text svg-text-small" fill={color}>出射</text> : null}
      </g>
    );
  }
  if (kind === 'tangent') {
    return (
      <g transform={`translate(${screen.x} ${screen.y})`} data-testid={testId}>
        <circle r={6} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" />
        {showLabel ? <text x={9} y={17} className="svg-text svg-text-small" fill={color}>相切</text> : null}
      </g>
    );
  }
  return (
    <g transform={`translate(${screen.x} ${screen.y})`} data-testid={testId}>
      <circle r={5} fill="var(--surface)" stroke={color} strokeWidth={2} />
      <circle r={1.7} fill={color} />
      {showLabel ? <text x={9} y={16} className="svg-text svg-text-small" fill={color}>入射</text> : null}
    </g>
  );
}

export function HalfPlaneStage({
  particles,
  field,
  selectedId,
  draft,
  layers,
  stageMode,
  fieldEditing,
  onStageModeChange,
  onSelectParticle,
  onDraftStart,
  onDraftChange,
  onDraftEnd,
  onDraftCancel,
  onFieldEditStart,
  onFieldEditChange,
  onFieldEditEnd,
  onFieldEditCancel,
  conditionNotice,
  trailResetById,
}: HalfPlaneStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 800, height: 480 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [editingKind, setEditingKind] = useState<'start' | 'velocity' | 'boundary' | null>(null);
  const activePointers = useRef(new Set<number>());
  const lastFitSignature = useRef<string | null>(null);

  const selected = particles.find((item) => item.particle.id === selectedId) ?? particles[0];
  const selectedParticle = draft?.particle ?? selected?.particle ?? null;
  const selectedSolution = draft?.solution ?? selected?.solution ?? null;
  const selectedState = draft?.state ?? selected?.state ?? null;
  const selectedDisplay = selectedParticle ? {
    startX: selectedParticle.position.x,
    startY: selectedParticle.position.y,
    directionDeg:
      ((Math.atan2(selectedParticle.velocity.y, selectedParticle.velocity.x) * 180) / Math.PI + 360) % 360,
  } : null;

  const bounds = useMemo(
    () => unionBounds([...particles.map((item) => solutionBounds(item.solution)), ...(draft ? [solutionBounds(draft.solution)] : [])]),
    [draft, particles],
  );
  const fitSignature = useMemo(
    () =>
      [
        field.boundaryX,
        size.width.toFixed(0),
        size.height.toFixed(0),
        ...particles.map(
          (item) =>
            `${item.particle.id}:${item.solution.status}:${item.solution.durationS.toFixed(6)}:${item.particle.position.x.toFixed(4)},${item.particle.position.y.toFixed(4)}`,
        ),
      ].join('|'),
    [field.boundaryX, particles, size.height, size.width],
  );
  useEffect(() => {
    if (editingKind === 'start' || editingKind === 'velocity') return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 38);
  }, [bounds, editingKind, fitBounds, fitSignature]);

  const boundaryScreenX = toScreen({ x: field.boundaryX, y: 0 }).x;
  const selectedLaunchScreen = selectedSolution ? toScreen(selectedSolution.launchPoint) : null;
  const selectedParticleScreen = selectedState ? toScreen(selectedState.position) : null;
  const velocityDir = selectedState
    ? normalize({ x: selectedState.velocity.x, y: -selectedState.velocity.y })
    : selectedParticle
      ? normalize({ x: selectedParticle.velocity.x, y: -selectedParticle.velocity.y })
      : { x: 1, y: 0 };
  const velocityHandleScreen = selectedParticleScreen
    ? add(selectedParticleScreen, scale(velocityDir, 94))
    : selectedLaunchScreen
      ? add(selectedLaunchScreen, scale(velocityDir, 94))
      : null;

  const boundaryHandleYRef = useRef(Math.max(80, size.height * 0.82));
  if (editingKind !== 'boundary') {
    const markers = particles.flatMap((item) => [
      item.solution.launchPoint,
      item.solution.entry?.position,
      item.solution.exit?.position,
      item.solution.tangent?.position,
      item.solution.circle?.center,
    ]).filter((point): point is Vec2 => Boolean(point)).map((point) => toScreen(point).y);
    const candidates = [0.2, 0.36, 0.52, 0.68, 0.84].map((fraction) => clamp(size.height * fraction, 70, Math.max(70, size.height - 60)));
    let best = candidates[0];
    let bestDistance = -1;
    for (const candidate of candidates) {
      const nearest = markers.length > 0 ? Math.min(...markers.map((marker) => Math.abs(candidate - marker))) : Infinity;
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    boundaryHandleYRef.current = best;
  }
  const boundaryHandleY = boundaryHandleYRef.current;

  const fieldGlyphs = useMemo(() => {
    if (!layers.field || field.fieldMag === 0) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const visibleMinX = Math.max(field.boundaryX, Math.min(topLeft.x, bottomRight.x));
    const visibleMaxX = Math.max(topLeft.x, bottomRight.x);
    const visibleMinY = Math.min(topLeft.y, bottomRight.y);
    const visibleMaxY = Math.max(topLeft.y, bottomRight.y);
    if (visibleMinX >= visibleMaxX) return [];
    const step = niceStep(62 / view.scale);
    const startGridX = Math.ceil(visibleMinX / step) * step;
    const startGridY = Math.ceil(visibleMinY / step) * step;
    const glyphs: Vec2[] = [];
    for (let x = startGridX; x <= visibleMaxX; x += step) {
      for (let y = startGridY; y <= visibleMaxY; y += step) {
        glyphs.push(toScreen({ x, y }));
        if (glyphs.length >= 400) return glyphs;
      }
    }
    return glyphs;
  }, [field.boundaryX, field.fieldMag, layers.field, size.height, size.width, toScreen, toWorld, view.scale]);

  const predictedFor = (solution: HalfPlaneSolution, color: string, lineStyle: ParticleLineStyle, selectedOne: boolean, testId?: string) => (
    <g data-testid={testId} data-status={solution.status} aria-hidden="true">
      {solution.segments.map((segment, index) => (
        <path
          key={index}
          d={pointsToPath(sampleSegmentWorld(segment, segment.kind === 'arc' ? 90 : 2), toScreen)}
          fill="none"
          stroke={color}
          strokeWidth={selectedOne ? 1.8 : 1.2}
          strokeDasharray={selectedOne ? '6 7' : DASH[lineStyle] ?? '4 7'}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={selectedOne ? 0.9 : 0.35}
        />
      ))}
    </g>
  );

  const trailFor = (item: P03EvaluatedParticle) => {
    if (!layers.trail || !item.state || item.state.timeS <= 1e-12 || !item.particle.showTrail || !item.particle.visible) return null;
    const reset = trailResetById[item.particle.id];
    const from = reset === undefined ? 0 : Math.max(0, reset - item.runtime.launchTimeSec);
    if (item.state.timeS <= from + 1e-12) return null;
    const n = 100;
    const points: Vec2[] = [];
    for (let index = 0; index <= n; index++) {
      points.push(sampleHalfPlaneTrajectory(item.solution, from + ((item.state.timeS - from) * index) / n).position);
    }
    return pointsToPath(points, toScreen);
  };

  const beginParticleDrag = (kind: 'start' | 'velocity') => (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact' || activePointers.current.size > 1) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setEditingKind(kind);
    onDraftStart();
  };

  const beginBoundaryDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact' || activePointers.current.size > 1) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setEditingKind('boundary');
    onFieldEditStart();
  };

  const moveDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editingKind || activePointers.current.size > 1) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (editingKind === 'start') {
      onDraftChange({
        startX: Number(clamp(world.x, -0.6, 0.6).toFixed(4)),
        startY: Number(clamp(world.y, -0.5, 0.5).toFixed(4)),
      });
    } else if (editingKind === 'boundary') {
      onFieldEditChange(Number(clamp(world.x, -0.3, 0.3).toFixed(4)));
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
    const kind = editingKind;
    setEditingKind(null);
    if (kind === 'boundary') onFieldEditEnd();
    else onDraftEnd();
  };

  const cancelDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editingKind) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const kind = editingKind;
    setEditingKind(null);
    if (kind === 'boundary') onFieldEditCancel();
    else onDraftCancel();
  };

  const onSvgPointerDownCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.add(event.pointerId);
    if (activePointers.current.size > 1 && editingKind) {
      const kind = editingKind;
      setEditingKind(null);
      if (kind === 'boundary') onFieldEditCancel();
      else onDraftCancel();
    }
  };
  const onSvgPointerEndCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.delete(event.pointerId);
  };

  const fitNow = () => {
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 38);
  };

  const scaleBarStep = niceStep(84 / view.scale);
  const scaleBarWidth = scaleBarStep * view.scale;
  const fieldOut = field.fieldDir > 0;
  const selectedTau = draft ? 0 : selected?.state?.timeS ?? null;
  const selectedLaunch = selected?.runtime.launchTimeSec ?? 0;
  const selectedStatus = selectedSolution?.status ?? 'invalid';

  return (
    <div className="stage-card multi-stage-card">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        extra={<span className="stage-toolbar-chip">多粒子 · {particles.length}/5</span>}
      />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="p03-stage"
        data-view-scale={view.scale.toFixed(3)}
        data-editing={editingKind !== null}
        data-field-editing={fieldEditing}
        data-selected-id={selectedId}
        data-particle-count={particles.length}
        data-status={selectedStatus}
        data-entry-time-s={selectedSolution?.entryTimeS ?? ''}
        data-exit-time-s={selectedSolution?.exitTimeS ?? ''}
        data-field-time-s={selectedSolution?.fieldTimeS ?? ''}
        data-start-x={(selectedParticle?.position.x ?? 0).toFixed(4)}
        data-start-y={(selectedParticle?.position.y ?? 0).toFixed(4)}
        data-direction-deg={(selectedDisplay?.directionDeg ?? 0).toFixed(1)}
        data-boundary-x={field.boundaryX.toFixed(4)}
        data-selected-tau={selectedTau ?? ''}
        data-selected-launch-time={selectedLaunch}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`多粒子半平面磁场。共 ${particles.length} 个粒子，选中 ${selectedParticle?.label ?? '—'}，状态 ${P03_STATUS_LABEL[selectedStatus]}。`}
          data-testid="p03-stage-svg"
          onPointerDownCapture={onSvgPointerDownCapture}
          onPointerUpCapture={onSvgPointerEndCapture}
          onPointerCancelCapture={onSvgPointerEndCapture}
          {...stageHandlers}
        >
          <defs>
            <linearGradient id="p03-multi-field-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--field-soft)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--field-soft)" stopOpacity="0.5" />
            </linearGradient>
            <marker id="p03-multi-arrow-v" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" />
            </marker>
            <marker id="p03-multi-arrow-f" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" />
            </marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />
          {layers.field ? (
            <rect x={boundaryScreenX} y={0} width={Math.max(0, size.width - boundaryScreenX)} height={size.height} fill="url(#p03-multi-field-fill)" aria-hidden="true" />
          ) : null}
          {fieldGlyphs.map((glyph, index) => (
            <g key={index} transform={`translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`} opacity={0.38} aria-hidden="true">
              <circle r={6.4} fill="none" stroke="var(--field)" strokeWidth={1.1} />
              {fieldOut ? <circle r={1.8} fill="var(--field)" /> : <path d="M-2.7,-2.7L2.7,2.7M2.7,-2.7L-2.7,2.7" stroke="var(--field)" strokeWidth={1.2} />}
            </g>
          ))}
          <line x1={boundaryScreenX} y1={0} x2={boundaryScreenX} y2={size.height} stroke="var(--field)" strokeWidth={2} strokeDasharray="8 6" aria-hidden="true" />
          {size.width - boundaryScreenX > 100 ? (
            <text x={size.width - 12} y={24} textAnchor="end" className="svg-text svg-text-small" fill="var(--field)">有场区 →</text>
          ) : null}

          {particles.map((item) => {
            const isSelected = item.particle.id === selectedId;
            if (isSelected && draft) return null;
            const showVectors = layers.allVectors || isSelected;
            const path = trailFor(item);
            const itemVelocityDir = item.state ? normalize({ x: item.state.velocity.x, y: -item.state.velocity.y }) : normalize({ x: item.particle.velocity.x, y: -item.particle.velocity.y });
            const itemForceDir = item.state ? normalize({ x: item.state.force.x, y: -item.state.force.y }) : { x: 0, y: 0 };
            const itemForceMagnitude = item.state ? length(item.state.force) : 0;
            const itemForceLength = clamp(22, 90, 68 * (itemForceMagnitude / (CHARGE_UNIT_C * SPEED_UNIT_MPS)));
            const itemScreen = item.state ? toScreen(item.state.position) : toScreen(item.solution.launchPoint);
            const center = item.solution.circle ? toScreen(item.solution.circle.center) : null;
            return (
              <g
                key={item.particle.id}
                data-testid={`p03-particle-${item.particle.label}`}
                data-particle-id={item.particle.id}
                data-label={item.particle.label}
                data-status={item.solution.status}
                data-entry-time-s={item.solution.entryTimeS ?? ''}
                data-exit-time-s={item.solution.exitTimeS ?? ''}
                data-field-time-s={item.solution.fieldTimeS ?? ''}
                data-launch-time={item.runtime.launchTimeSec}
                data-start-x={item.particle.position.x.toFixed(6)}
                data-start-y={item.particle.position.y.toFixed(6)}
                data-vx0={item.particle.velocity.x.toFixed(3)}
                data-vy0={item.particle.velocity.y.toFixed(3)}
                data-charge-c={item.particle.chargeC}
                data-mass-kg={item.particle.massKg}
                data-tau={item.state?.timeS ?? ''}
                data-region={item.state?.region ?? ''}
                data-x={item.state?.position.x.toFixed(6) ?? ''}
                data-y={item.state?.position.y.toFixed(6) ?? ''}
                opacity={item.particle.visible ? 1 : 0.16}
              >
                {layers.predicted && !isSelected ? predictedFor(item.solution, item.particle.color, item.particle.lineStyle, false) : null}
                {path ? <path d={path} fill="none" stroke={item.particle.color} strokeWidth={isSelected ? 3.6 : 2.6} strokeDasharray={DASH[item.particle.lineStyle]} opacity={isSelected ? 0.95 : 0.55} strokeLinecap="round" aria-hidden="true" /> : null}
                {layers.center && center && (isSelected || layers.allAux) ? (
                  <g transform={`translate(${center.x} ${center.y})`} aria-hidden="true">
                    <circle r={isSelected ? 4.3 : 3} fill="var(--surface)" stroke={item.particle.color} strokeWidth={1.7} />
                    {isSelected ? <path d="M-10,0H10M0,-10V10" stroke={item.particle.color} strokeWidth={1} opacity={0.6} /> : null}
                  </g>
                ) : null}
                {isSelected && layers.radii && center && item.solution.circle ? (
                  <g aria-hidden="true">
                    <line x1={center.x} y1={center.y} x2={toScreen(item.solution.entry?.position ?? item.solution.launchPoint).x} y2={toScreen(item.solution.entry?.position ?? item.solution.launchPoint).y} stroke={item.particle.color} strokeWidth={1.7} />
                    {item.solution.exit?.position ? <line x1={center.x} y1={center.y} x2={toScreen(item.solution.exit.position).x} y2={toScreen(item.solution.exit.position).y} stroke={item.particle.color} strokeWidth={1.7} /> : null}
                  </g>
                ) : null}
                {isSelected && layers.chord && item.solution.entry?.position && item.solution.exit?.position ? (
                  <line x1={toScreen(item.solution.entry.position).x} y1={toScreen(item.solution.entry.position).y} x2={toScreen(item.solution.exit.position).x} y2={toScreen(item.solution.exit.position).y} stroke="var(--flux)" strokeWidth={1.4} strokeDasharray="5 5" aria-hidden="true" />
                ) : null}
                {layers.markers && !isSelected ? (
                  <g aria-hidden="true">
                    {eventMarker(item.solution.entry, item.particle.color, 'entry', toScreen, false, `p03-particle-${item.particle.label}-entry`)}
                    {eventMarker(item.solution.exit, item.particle.color, 'exit', toScreen, false, `p03-particle-${item.particle.label}-exit`)}
                    {eventMarker(item.solution.tangent, item.particle.color, 'tangent', toScreen, false, `p03-particle-${item.particle.label}-tangent`)}
                  </g>
                ) : null}
                {showVectors && layers.vectors && item.state ? (
                  <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + itemVelocityDir.x * 48} y2={itemScreen.y + itemVelocityDir.y * 48} stroke={item.particle.color} strokeWidth={2.2} markerEnd="url(#p03-multi-arrow-v)" opacity={0.75} aria-hidden="true" />
                ) : null}
                {showVectors && layers.force && item.state && itemForceMagnitude > 1e-24 ? (
                  <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + itemForceDir.x * itemForceLength} y2={itemScreen.y + itemForceDir.y * itemForceLength} stroke={item.particle.color} strokeWidth={2.1} strokeDasharray="6 4" markerEnd="url(#p03-multi-arrow-f)" opacity={0.8} aria-hidden="true" />
                ) : null}
                <circle cx={itemScreen.x} cy={itemScreen.y} r={isSelected ? 9 : 7} fill={item.particle.color} stroke="var(--surface)" strokeWidth={2} opacity={item.state ? 1 : 0.32} aria-hidden="true" />
                <text x={itemScreen.x + 12} y={itemScreen.y - 10} className="svg-text svg-text-small" fill={item.particle.color} aria-hidden="true">{item.particle.label}</text>
                {stageMode === 'interact' && !isSelected && !editingKind ? (
                  <circle cx={itemScreen.x} cy={itemScreen.y} r={26} fill="transparent" onPointerDown={(event) => { event.stopPropagation(); onSelectParticle(item.particle.id); }} style={{ cursor: 'pointer' }} data-testid={`p03-particle-hit-${item.particle.label}`} />
                ) : null}
              </g>
            );
          })}

          {draft && selectedSolution ? (
            <g data-testid="p03-preview-path" data-status={selectedSolution.status} data-entry-time-s={selectedSolution.entryTimeS ?? ''} data-exit-time-s={selectedSolution.exitTimeS ?? ''} data-boundary-x={field.boundaryX.toFixed(4)} aria-hidden="true">
              {selectedSolution.segments.map((segment, index) => (
                <path key={index} d={pointsToPath(sampleSegmentWorld(segment, segment.kind === 'arc' ? 100 : 2), toScreen)} fill="none" stroke={draft.particle.color} strokeWidth={2.4} strokeDasharray="6 7" strokeLinecap="round" />
              ))}
              <text x={(selectedLaunchScreen?.x ?? 0) + 14} y={(selectedLaunchScreen?.y ?? 0) - 18} className="svg-text svg-text-small" fill={draft.particle.color}>{draft.particle.label} 新初态</text>
            </g>
          ) : null}

          {!draft && selectedSolution ? (
            <g data-testid="p03-preview-path" data-status={selectedSolution.status} data-entry-time-s={selectedSolution.entryTimeS ?? ''} data-exit-time-s={selectedSolution.exitTimeS ?? ''} data-boundary-x={field.boundaryX.toFixed(4)} aria-hidden="true">
              {selectedSolution.segments.map((segment, index) => (
                <path key={index} d={pointsToPath(sampleSegmentWorld(segment, segment.kind === 'arc' ? 90 : 2), toScreen)} fill="none" stroke={selectedParticle?.color ?? 'var(--preview)'} strokeWidth={1.6} strokeDasharray="4 7" opacity={0.5} strokeLinecap="round" />
              ))}
            </g>
          ) : null}

          {selectedSolution ? (
            <g aria-hidden="true">
              {eventMarker(selectedSolution.entry, selectedParticle?.color ?? 'var(--field)', 'entry', toScreen, true, 'p03-entry-marker')}
              {eventMarker(selectedSolution.exit, selectedParticle?.color ?? 'var(--accent)', 'exit', toScreen, true, 'p03-exit-marker')}
              {eventMarker(selectedSolution.tangent, selectedParticle?.color ?? 'var(--warning)', 'tangent', toScreen, true, 'p03-tangent-marker')}
            </g>
          ) : null}

          {stageMode === 'interact' && selectedParticle && selectedLaunchScreen ? (
            <g className="stage-handle stage-handle-start" transform={`translate(${selectedLaunchScreen.x} ${selectedLaunchScreen.y})`} onPointerDown={beginParticleDrag('start')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p03-start-handle">
              <circle r={26} fill="transparent" data-testid="p03-start-handle-hit" />
              <circle r={19} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <text x={-58} y={-26} className="svg-text svg-text-small" fill={selectedParticle.color}>{selectedParticle.label} 发射点</text>
            </g>
          ) : null}

          {stageMode === 'interact' && selectedParticle && velocityHandleScreen ? (
            <g className="stage-handle" transform={`translate(${velocityHandleScreen.x} ${velocityHandleScreen.y})`} onPointerDown={beginParticleDrag('velocity')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p03-velocity-handle">
              <circle r={26} fill="transparent" data-testid="p03-velocity-handle-hit" />
              <circle r={13} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <path d="M-4,-3L4,5M-4,5L4,-3" className="handle-grip" />
              <text x={18} y={-18} className="svg-text svg-text-small" fill={selectedParticle.color}>拖方向</text>
            </g>
          ) : null}

          {stageMode === 'interact' ? (
            <g className="stage-handle stage-handle-boundary" transform={`translate(${boundaryScreenX} ${boundaryHandleY})`} onPointerDown={beginBoundaryDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p03-boundary-handle">
              <circle r={26} fill="transparent" data-testid="p03-boundary-handle-hit" />
              <rect x={-12} y={-18} width={24} height={36} rx={8} className="handle-pill" />
              <path d="M-4,-8L4,-8M-4,0L4,0M-4,8L4,8" className="handle-grip" />
              <text x={0} y={-28} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">拖共享边界</text>
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
          <span className="hud-chip hud-field"><span className="hud-glyph">{fieldOut ? '⊙' : '×'}</span>B {field.fieldMag === 0 ? '= 0' : `${fieldOut ? '出纸面' : '入纸面'} · ${formatNumber(field.fieldMag, 2)} T`}</span>
          <span className={`hud-chip p03-status-chip status-${statusTone(selectedStatus)}`}>{P03_STATUS_LABEL[selectedStatus]}</span>
          <span className="hud-chip hud-chip-quiet">粒子 {particles.length}/5 · 选中 {selectedParticle?.label ?? '—'}</span>
          <span className="hud-chip hud-chip-quiet">τ {selectedTau === null ? '未发射' : formatTime(selectedTau)}</span>
        </div>

        {conditionNotice ? (
          <div className={`condition-notice condition-notice-${conditionNotice.tone}`} data-testid="p03-condition-notice" role="status" aria-live="polite">{conditionNotice.text}</div>
        ) : null}
        {!conditionNotice && stageMode === 'interact' ? (
          <div className="stage-drag-hint">选中粒子的手柄可编辑 · 拖边界只改共享场 · 双指缩放</div>
        ) : null}
      </div>
      <StageLegend
        items={[
          { label: '彩色轨迹 = 各粒子已走路径', color: 'var(--trajectory)', variant: 'solid' },
          { label: '细虚线 = 完整预测轨迹', color: 'var(--preview)', variant: 'dashed' },
          { label: '入射 / 出射 / 相切', color: 'var(--field)', variant: 'dot' },
          { label: '圆心 / 半径 / 弦', color: 'var(--aux-strong)', variant: 'dashed' },
          { label: '磁场 B（⊙ 出 / × 入）', color: 'var(--field)', variant: 'field' },
        ]}
      />
    </div>
  );
}
