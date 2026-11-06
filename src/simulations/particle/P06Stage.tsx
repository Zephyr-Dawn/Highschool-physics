import { useEffect, useMemo, useRef, useState } from 'react';
import {
  crossedStateAt,
  sampleCrossedTrajectory,
  type CrossedFieldModel,
} from '../../physics/particles/crossedFields';
import {
  segmentedStateAt,
  type SegmentedEvent,
  type SegmentedSolution,
} from '../../physics/particles/segmentedFields';
import {
  type ParticleInitialState,
  type ParticleLineStyle,
} from '../../physics/particles/multiParticle';
import { add, clamp, length, normalize, scale, type Vec2 } from '../../physics/core/vec2';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatLength, formatNumber } from '../../lib/format';
import type { P06Field, P06ParticleModel, P06UnifiedState } from './p06Scene';

export interface P06Layers {
  predicted: boolean;
  trail: boolean;
  regions: boolean;
  fieldE: boolean;
  fieldB: boolean;
  velocity: boolean;
  forceE: boolean;
  forceB: boolean;
  resultant: boolean;
  allVectors: boolean;
  events: boolean;
  aux: boolean;
}

export const P06_DEFAULT_LAYERS: P06Layers = {
  predicted: true,
  trail: true,
  regions: true,
  fieldE: true,
  fieldB: true,
  velocity: true,
  forceE: true,
  forceB: true,
  resultant: true,
  allVectors: false,
  events: true,
  aux: true,
};

export interface P06EvaluatedParticle extends P06ParticleModel {
  state: P06UnifiedState | null;
}

export interface P06DraftPreview {
  particle: ParticleInitialState;
  modelA: CrossedFieldModel | null;
  solutionB: SegmentedSolution | null;
  state: P06UnifiedState;
}

export interface P06ConditionNotice {
  text: string;
  tone: 'preview' | 'recalculated';
}

interface P06StageProps {
  particles: P06EvaluatedParticle[];
  field: P06Field;
  selectedId: string;
  draft: P06DraftPreview | null;
  layers: P06Layers;
  stageMode: StageMode;
  fieldEditing: boolean;
  onStageModeChange: (mode: StageMode) => void;
  onSelectParticle: (id: string) => void;
  onDraftStart: () => void;
  onDraftChange: (patch: { startX?: number; startY?: number; directionDeg?: number }) => void;
  onDraftEnd: () => void;
  onDraftCancel: () => void;
  onFieldEditStart: () => void;
  onFieldEditChange: (dM: number) => void;
  onFieldEditEnd: () => void;
  onFieldEditCancel: () => void;
  conditionNotice: P06ConditionNotice | null;
  trailResetById: Record<string, number>;
}

const NICE_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
const DASH_PATTERNS: Record<ParticleLineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 6',
  dotted: '2 5',
  'dash-dot': '10 5 2 5',
  'long-dash': '15 7',
};

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

function pointsToPath(points: Vec2[], toScreen: (point: Vec2) => Vec2): string {
  return points
    .map((point, index) => {
      const screen = toScreen(point);
      return `${index === 0 ? 'M' : 'L'}${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
    })
    .join(' ');
}

function sampleAInterval(model: CrossedFieldModel, from: number, to: number, count: number): Vec2[] {
  const start = Math.max(0, from);
  const end = Math.max(start, to);
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i++) points.push(crossedStateAt(model, start + ((end - start) * i) / n).position);
  return points;
}

function sampleBInterval(solution: SegmentedSolution, from: number, to: number, count: number): Vec2[] {
  const start = Math.max(0, Math.min(solution.durationS, from));
  const end = Math.max(start, Math.min(solution.durationS, to));
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i++) points.push(segmentedStateAt(solution, start + ((end - start) * i) / n).position);
  return points;
}

function predictedPoints(item: P06EvaluatedParticle, mode: 'crossed' | 'segmented', windowS = 8): Vec2[] {
  if (mode === 'crossed' && item.modelA) return sampleCrossedTrajectory(item.modelA, windowS, 160);
  if (mode === 'segmented' && item.solutionB) {
    return sampleBInterval(item.solutionB, 0, item.solutionB.durationS, 160);
  }
  return [];
}

function boundsFor(particles: P06EvaluatedParticle[], field: P06Field, draft: P06DraftPreview | null): StageBounds {
  const points: Vec2[] = [];
  for (const item of particles) {
    points.push(item.particle.position);
    if (item.state) points.push(item.state.position);
    points.push(...predictedPoints(item, field.mode));
  }
  if (draft) {
    points.push(draft.particle.position);
    if (draft.modelA) points.push(...sampleCrossedTrajectory(draft.modelA, 8, 160));
    if (draft.solutionB) points.push(...sampleBInterval(draft.solutionB, 0, draft.solutionB.durationS, 160));
  }
  if (field.mode === 'segmented') {
    points.push({ x: -field.dM, y: 0 }, { x: 0, y: 0 });
  }
  if (points.length === 0) return { minX: -2, minY: -2, maxX: 2, maxY: 2 };
  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));
  if (field.mode === 'segmented') {
    minX = Math.min(minX, -field.dM - 0.5);
    maxX = Math.max(maxX, 0.5);
  }
  const spanX = Math.max(0.4, maxX - minX);
  const spanY = Math.max(0.4, maxY - minY);
  return {
    minX: minX - spanX * 0.14 - 0.05,
    maxX: maxX + spanX * 0.14 + 0.05,
    minY: minY - spanY * 0.16 - 0.05,
    maxY: maxY + spanY * 0.16 + 0.05,
  };
}

function regionLabel(region: P06UnifiedState['region']): string {
  if (region === 'free') return '自由区';
  if (region === 'electric') return '电场区';
  if (region === 'magnetic') return '磁场区';
  return '同区 E+B';
}

function vectorPoint(base: Vec2, vector: Vec2, pixels: number): Vec2 {
  const direction = normalize(vector);
  return { x: base.x + direction.x * pixels, y: base.y + direction.y * pixels };
}

function eventMarker(
  event: SegmentedEvent,
  color: string,
  toScreen: (point: Vec2) => Vec2,
  showLabel: boolean,
  testId?: string,
) {
  if (event.kind !== 'crossing' && event.kind !== 'tangent') return null;
  const screen = toScreen(event.position);
  if (event.kind === 'tangent') {
    return (
      <g key={`${event.timeS}-${event.kind}`} transform={`translate(${screen.x} ${screen.y})`} data-testid={testId}>
        <circle r={5} fill="none" stroke={color} strokeWidth={1.8} strokeDasharray="2 3" />
        {showLabel ? <text x={7} y={-8} className="svg-text svg-text-small" fill={color}>相切</text> : null}
      </g>
    );
  }
  return (
    <g key={`${event.timeS}-${event.fromRegion}-${event.toRegion}`} transform={`translate(${screen.x} ${screen.y})`} data-testid={testId}>
      <rect x={-4} y={-4} width={8} height={8} rx={1.5} fill="var(--surface)" stroke={color} strokeWidth={1.8} transform="rotate(45)" />
      {showLabel ? (
        <text x={7} y={-8} className="svg-text svg-text-small" fill={color}>
          {event.toRegion === 'magnetic' ? '入磁' : event.fromRegion === 'magnetic' ? '出磁' : '跨界'}
        </text>
      ) : null}
    </g>
  );
}

export function P06Stage({
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
}: P06StageProps) {
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
  const selectedState = draft?.state ?? selected?.state ?? null;
  const selectedSolutionB = draft?.solutionB ?? selected?.solutionB ?? null;
  const bounds = useMemo(() => boundsFor(particles, field, draft), [draft, field, particles]);
  const fitSignature = useMemo(
    () =>
      [
        field.mode,
        field.Ex,
        field.Ey,
        field.Bz,
        field.dM,
        size.width.toFixed(0),
        size.height.toFixed(0),
        ...particles.map((item) => `${item.particle.id}:${item.particle.position.x.toFixed(4)},${item.particle.position.y.toFixed(4)}`),
      ].join('|'),
    [field, particles, size.height, size.width],
  );
  useEffect(() => {
    if (editingKind === 'start' || editingKind === 'velocity' || editingKind === 'boundary') return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 42);
  }, [bounds, editingKind, fitBounds, fitSignature]);

  const dScreen = toScreen({ x: -field.dM, y: 0 }).x;
  const bScreen = toScreen({ x: 0, y: 0 }).x;
  const boundaryHandleYRef = useRef(Math.max(70, size.height * 0.78));
  if (editingKind !== 'boundary') {
    const markerYs = particles.flatMap((item) => [
      toScreen(item.particle.position).y,
      item.state ? toScreen(item.state.position).y : null,
      ...(item.solutionB?.events ?? [])
        .filter((event) => (event.kind === 'crossing' || event.kind === 'tangent') && event.position)
        .map((event) => toScreen(event.position!).y),
    ]).filter((value): value is number => value !== null && Number.isFinite(value));
    const candidates = [0.2, 0.36, 0.52, 0.68, 0.84].map((fraction) =>
      clamp(size.height * fraction, 70, Math.max(70, size.height - 60)),
    );
    let best = candidates[0];
    let bestDistance = -1;
    for (const candidate of candidates) {
      const nearest = markerYs.length > 0 ? Math.min(...markerYs.map((markerY) => Math.abs(candidate - markerY))) : Infinity;
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    boundaryHandleYRef.current = best;
  }
  const boundaryHandleY = boundaryHandleYRef.current;
  const selectedLaunchScreen = selectedParticle ? toScreen(selectedParticle.position) : null;
  const selectedParticleScreen = selectedState ? toScreen(selectedState.position) : selectedLaunchScreen;
  const selectedVelocityDir = selectedState
    ? normalize({ x: selectedState.velocity.x, y: -selectedState.velocity.y })
    : selectedParticle
      ? normalize({ x: selectedParticle.velocity.x, y: -selectedParticle.velocity.y })
      : { x: 1, y: 0 };
  const velocityHandleScreen = selectedParticleScreen
    ? add(selectedParticleScreen, scale(selectedVelocityDir, 92))
    : null;

  const fieldStep = niceStep(75 / view.scale);
  const fieldArrows = useMemo(() => {
    if (!layers.fieldE || (Math.abs(field.Ex) < 1e-12 && Math.abs(field.Ey) < 1e-12)) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    const startX = Math.ceil(minX / fieldStep) * fieldStep;
    const startY = Math.ceil(minY / fieldStep) * fieldStep;
    const arrows: Array<{ from: Vec2; to: Vec2 }> = [];
    for (let x = startX; x <= maxX; x += fieldStep) {
      for (let y = startY; y <= maxY; y += fieldStep) {
        if (field.mode === 'segmented' && (x < -field.dM || x > 0)) continue;
        const from = toScreen({ x, y });
        const to = vectorPoint(from, { x: field.Ex, y: -field.Ey }, 20);
        arrows.push({ from, to });
        if (arrows.length >= 220) return arrows;
      }
    }
    return arrows;
  }, [field, fieldStep, layers.fieldE, size.height, size.width, toScreen, toWorld]);

  const fieldGlyphs = useMemo(() => {
    if (!layers.fieldB || Math.abs(field.Bz) < 1e-12) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    const step = niceStep(68 / view.scale);
    const startX = Math.ceil(minX / step) * step;
    const startY = Math.ceil(minY / step) * step;
    const glyphs: Vec2[] = [];
    for (let x = startX; x <= maxX; x += step) {
      for (let y = startY; y <= maxY; y += step) {
        if (field.mode === 'segmented' && x < 0) continue;
        glyphs.push(toScreen({ x, y }));
        if (glyphs.length >= 220) return glyphs;
      }
    }
    return glyphs;
  }, [field.Bz, field.mode, layers.fieldB, size.height, size.width, toScreen, toWorld, view.scale]);

  const predicted = useMemo(
    () =>
      particles
        .filter((item) => layers.predicted && !(draft && item.particle.id === selectedId))
        .map((item) => ({
          id: item.particle.id,
          color: item.particle.color,
          path: pointsToPath(predictedPoints(item, field.mode), toScreen),
        })),
    [draft, field.mode, layers.predicted, particles, selectedId, toScreen],
  );

  const draftPath = useMemo(() => {
    if (!draft) return '';
    const points = draft.modelA
      ? sampleCrossedTrajectory(draft.modelA, 8, 160)
      : draft.solutionB
        ? sampleBInterval(draft.solutionB, 0, draft.solutionB.durationS, 160)
        : [];
    return pointsToPath(points, toScreen);
  }, [draft, toScreen]);

  const trails = useMemo(
    () =>
      particles
        .filter((item) => layers.trail && item.particle.showTrail && item.particle.visible && !(draft && item.particle.id === selectedId))
        .map((item) => {
          if (!item.state || item.state.timeS <= 1e-12) return null;
          const reset = trailResetById[item.particle.id];
          const from = reset === undefined ? 0 : Math.max(0, reset - item.runtime.launchTimeSec);
          if (item.state.timeS <= from + 1e-12) return null;
          const points = item.modelA
            ? sampleAInterval(item.modelA, from, item.state.timeS, 130)
            : item.solutionB
              ? sampleBInterval(item.solutionB, from, item.state.timeS, 130)
              : [];
          return { id: item.particle.id, color: item.particle.color, path: pointsToPath(points, toScreen) };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [layers.trail, particles, toScreen, trailResetById],
  );

  const beginParticleDrag = (kind: 'start' | 'velocity') => (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact' || activePointers.current.size > 1) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setEditingKind(kind);
    onDraftStart();
  };
  const beginBoundaryDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact' || activePointers.current.size > 1 || field.mode !== 'segmented') return;
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
        startX: Number(clamp(world.x, -6, 6).toFixed(4)),
        startY: Number(clamp(world.y, -5, 5).toFixed(4)),
      });
    } else if (editingKind === 'boundary') {
      onFieldEditChange(Number(clamp(-world.x, 0.3, 6).toFixed(4)));
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
    fitBounds(bounds, 42);
  };

  const scaleStep = niceStep(84 / view.scale);
  const selectedForceScale = Math.max(
    1e-9,
    selectedState ? Math.max(length(selectedState.forceE), length(selectedState.forceB), length(selectedState.force)) : 1,
  );
  const forceLength = (force: Vec2) => clamp(20, 92, 22 + (length(force) / selectedForceScale) * 68);

  return (
    <div className="stage-card p06-stage-card">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        extra={<span className="stage-toolbar-chip">{field.mode === 'crossed' ? '同区 E+B' : 'E → B 分区'} · {particles.length}/5</span>}
      />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="p06-stage"
        data-mode={field.mode}
        data-view-scale={view.scale.toFixed(3)}
        data-particle-count={particles.length}
        data-selected-id={selectedId}
        data-editing={editingKind !== null}
        data-field-editing={fieldEditing}
        data-boundary-x={field.mode === 'segmented' ? (-field.dM).toFixed(4) : ''}
        data-d={field.dM}
        data-selected-tau={selectedState?.timeS ?? ''}
        data-selected-launch-time={selected?.runtime.launchTimeSec ?? 0}
        data-selected-start-x={selectedParticle?.position.x.toFixed(4) ?? ''}
        data-selected-start-y={selectedParticle?.position.y.toFixed(4) ?? ''}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`P06 ${field.mode === 'crossed' ? '同区电磁叠加场' : '电场到磁场分区'} 多粒子实验，共 ${particles.length} 个粒子。`}
          data-testid="p06-stage-svg"
          onPointerDownCapture={onSvgPointerDownCapture}
          onPointerUpCapture={onSvgPointerEndCapture}
          onPointerCancelCapture={onSvgPointerEndCapture}
          {...stageHandlers}
        >
          <defs>
            <marker id="p06-arrow-v" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--velocity)" />
            </marker>
            <marker id="p06-arrow-e" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--force)" />
            </marker>
            <marker id="p06-arrow-b" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--field)" />
            </marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />
          {field.mode === 'segmented' ? (
            <g aria-hidden="true" data-testid="p06-regions">
              <rect x={0} y={0} width={Math.max(0, dScreen)} height={size.height} fill="var(--surface)" opacity={0.25} />
              <rect x={Math.min(dScreen, bScreen)} y={0} width={Math.abs(bScreen - dScreen)} height={size.height} fill="var(--field-soft)" opacity={0.55} />
              <rect x={Math.max(0, bScreen)} y={0} width={Math.max(0, size.width - bScreen)} height={size.height} fill="var(--flux-soft)" opacity={0.42} />
              <line x1={dScreen} y1={0} x2={dScreen} y2={size.height} stroke="var(--field)" strokeWidth={1.8} strokeDasharray="7 5" />
              <line x1={bScreen} y1={0} x2={bScreen} y2={size.height} stroke="var(--flux)" strokeWidth={1.8} strokeDasharray="7 5" />
              <text x={dScreen - 7} y={20} textAnchor="end" className="svg-text svg-text-small" fill="var(--ink-muted)">x = −d</text>
              <text x={bScreen + 7} y={20} className="svg-text svg-text-small" fill="var(--flux-strong)">x = 0</text>
              <text x={Math.max(8, (dScreen + bScreen) / 2)} y={size.height - 20} textAnchor="middle" className="svg-text svg-text-small" fill="var(--field)">电场区 E</text>
              <text x={Math.max(bScreen + 8, size.width - 12)} y={size.height - 20} textAnchor="end" className="svg-text svg-text-small" fill="var(--flux-strong)">磁场区 B</text>
            </g>
          ) : null}

          {fieldArrows.map((arrow, index) => (
            <line key={`ea-${index}`} x1={arrow.from.x} y1={arrow.from.y} x2={arrow.to.x} y2={arrow.to.y} stroke="var(--force)" strokeWidth={1.2} opacity={0.28} markerEnd="url(#p06-arrow-e)" aria-hidden="true" />
          ))}
          {fieldGlyphs.map((glyph, index) => (
            <g key={`bg-${index}`} transform={`translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`} opacity={0.37} aria-hidden="true">
              <circle r={6} fill="none" stroke="var(--field)" strokeWidth={1.1} />
              {field.Bz > 0 ? <circle r={1.7} fill="var(--field)" /> : <path d="M-2.5,-2.5L2.5,2.5M2.5,-2.5L-2.5,2.5" stroke="var(--field)" strokeWidth={1.2} />}
            </g>
          ))}

          {predicted.map((path) => (
            <path key={`p06-pred-${path.id}`} d={path.path} fill="none" stroke={path.color} strokeWidth={1.2} strokeDasharray="5 7" opacity={path.id === selectedId ? 0.55 : 0.26} strokeLinecap="round" aria-hidden="true" />
          ))}
          {draft ? (
            <g data-testid="p06-preview-path" aria-hidden="true">
              <path d={draftPath} fill="none" stroke={draft.particle.color} strokeWidth={2.4} strokeDasharray="7 7" strokeLinecap="round" />
              <text x={(selectedParticleScreen?.x ?? 0) + 14} y={(selectedParticleScreen?.y ?? 0) - 18} className="svg-text svg-text-small" fill={draft.particle.color}>
                {draft.particle.label} 新初态
              </text>
            </g>
          ) : null}

          {trails.map((trail) => (
            <path key={`p06-trail-${trail.id}`} d={trail.path} fill="none" stroke={trail.color} strokeWidth={trail.id === selectedId ? 3.3 : 2.4} strokeDasharray={DASH_PATTERNS[particles.find((p) => p.particle.id === trail.id)?.particle.lineStyle ?? 'solid']} opacity={trail.id === selectedId ? 0.95 : 0.55} strokeLinecap="round" aria-hidden="true" />
          ))}

          {particles.map((item) => {
            if (draft && item.particle.id === selectedId) return null;
            const isSelected = item.particle.id === selectedId;
            const itemScreen = item.state ? toScreen(item.state.position) : toScreen(item.particle.position);
            const start = toScreen(item.particle.position);
            const showVectors = layers.allVectors || isSelected;
            const itemVelocityDir = item.state ? normalize({ x: item.state.velocity.x, y: -item.state.velocity.y }) : normalize({ x: item.particle.velocity.x, y: -item.particle.velocity.y });
            const itemEvents = item.solutionB?.events.filter((event) => event.kind === 'crossing' || event.kind === 'tangent') ?? [];
            return (
              <g
                key={item.particle.id}
                data-testid={`p06-particle-${item.particle.label}`}
                data-particle-id={item.particle.id}
                data-mode={field.mode}
                data-region={item.state?.region ?? ''}
                data-launch-time={item.runtime.launchTimeSec}
                data-tau={item.state?.timeS ?? ''}
                data-start-x={item.particle.position.x.toFixed(5)}
                data-start-y={item.particle.position.y.toFixed(5)}
                data-vx0={item.particle.velocity.x.toFixed(4)}
                data-vy0={item.particle.velocity.y.toFixed(4)}
                data-charge-c={item.particle.chargeC}
                data-mass-kg={item.particle.massKg}
                data-x={item.state?.position.x.toFixed(6) ?? ''}
                data-y={item.state?.position.y.toFixed(6) ?? ''}
                data-kinetic-j={item.state?.kineticEnergyJ.toFixed(6) ?? ''}
                data-speed={item.state?.speed.toFixed(6) ?? ''}
                data-force-e={item.state ? Math.hypot(item.state.forceE.x, item.state.forceE.y).toFixed(6) : ''}
                data-force-b={item.state ? Math.hypot(item.state.forceB.x, item.state.forceB.y).toFixed(6) : ''}
                data-force={item.state ? Math.hypot(item.state.force.x, item.state.force.y).toFixed(6) : ''}
                data-selector-matched={item.state?.selectorMatched ?? false}
                data-selected={isSelected}
                opacity={item.particle.visible ? 1 : 0.16}
              >
                {item.particle.visible ? (
                  <>
                    <circle cx={start.x} cy={start.y} r={5} fill="var(--surface)" stroke={item.particle.color} strokeWidth={1.7} strokeDasharray={item.state ? undefined : '2 3'} opacity={item.state ? 0.65 : 0.35} aria-hidden="true" />
                    {layers.events && item.solutionB && !isSelected ? itemEvents.map((event, index) => eventMarker(event, item.particle.color, toScreen, false, `p06-particle-${item.particle.label}-event-${index}`)) : null}
                    {showVectors && item.state ? (
                      <>
                        {layers.velocity ? (
                          <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + itemVelocityDir.x * 45} y2={itemScreen.y + itemVelocityDir.y * 45} stroke="var(--velocity)" strokeWidth={2.2} markerEnd="url(#p06-arrow-v)" opacity={0.8} aria-hidden="true" />
                        ) : null}
                        {layers.forceE ? (
                          <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + normalize({ x: item.state.forceE.x, y: -item.state.forceE.y }).x * forceLength(item.state.forceE)} y2={itemScreen.y + normalize({ x: item.state.forceE.x, y: -item.state.forceE.y }).y * forceLength(item.state.forceE)} stroke="var(--force)" strokeWidth={2.1} strokeDasharray="6 4" markerEnd="url(#p06-arrow-e)" opacity={0.8} aria-hidden="true" />
                        ) : null}
                        {layers.forceB ? (
                          <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + normalize({ x: item.state.forceB.x, y: -item.state.forceB.y }).x * forceLength(item.state.forceB)} y2={itemScreen.y + normalize({ x: item.state.forceB.x, y: -item.state.forceB.y }).y * forceLength(item.state.forceB)} stroke="var(--field)" strokeWidth={2.1} strokeDasharray="3 4" markerEnd="url(#p06-arrow-b)" opacity={0.8} aria-hidden="true" />
                        ) : null}
                        {layers.resultant ? (
                          <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + normalize({ x: item.state.force.x, y: -item.state.force.y }).x * forceLength(item.state.force)} y2={itemScreen.y + normalize({ x: item.state.force.x, y: -item.state.force.y }).y * forceLength(item.state.force)} stroke="var(--danger)" strokeWidth={2.5} markerEnd="url(#p06-arrow-e)" opacity={0.9} aria-hidden="true" />
                        ) : null}
                      </>
                    ) : null}
                    <circle cx={itemScreen.x} cy={itemScreen.y} r={isSelected ? 9 : 7} fill={item.particle.color} stroke="var(--surface)" strokeWidth={2} opacity={item.state ? 1 : 0.3} aria-hidden="true" />
                    <text x={itemScreen.x + 12} y={itemScreen.y - 10} className="svg-text svg-text-small" fill={item.particle.color} aria-hidden="true">{item.particle.label}</text>
                    {stageMode === 'interact' && !isSelected && !editingKind ? (
                      <circle cx={itemScreen.x} cy={itemScreen.y} r={26} fill="transparent" onPointerDown={(event) => { event.stopPropagation(); onSelectParticle(item.particle.id); }} style={{ cursor: 'pointer' }} data-testid={`p06-particle-hit-${item.particle.label}`} />
                    ) : null}
                  </>
                ) : null}
              </g>
            );
          })}

          {selectedSolutionB?.events.filter((event) => event.kind === 'crossing' || event.kind === 'tangent').map((event, index) => {
            const isEntry = event.toRegion === 'magnetic';
            const isExit = event.fromRegion === 'magnetic';
            const id = event.kind === 'tangent' ? 'p06-tangent-marker' : isEntry ? 'p06-entry-marker' : isExit ? 'p06-exit-marker' : `p06-crossing-marker-${index}`;
            return eventMarker(event, selectedParticle?.color ?? 'var(--field)', toScreen, true, id);
          })}

          {layers.aux && selectedSolutionB?.segments.some((segment) => segment.kind === 'arc' && segment.center) ? (
            <g aria-hidden="true">
              {(() => {
                const arc = selectedSolutionB.segments.find((segment) => segment.kind === 'arc' && segment.center)!;
                const center = toScreen(arc.center!);
                const entryEvent = selectedSolutionB.events.find((event) => event.toRegion === 'magnetic' && event.position);
                const point = toScreen(entryEvent?.position ?? selectedSolutionB.input.initialPosition);
                return (
                  <>
                    <circle cx={center.x} cy={center.y} r={(arc.radiusM ?? 0) * view.scale} fill="none" stroke="var(--aux)" strokeWidth={1.2} strokeDasharray="6 7" />
                    <line x1={center.x} y1={center.y} x2={point.x} y2={point.y} stroke="var(--aux-strong)" strokeWidth={1.5} />
                    <circle cx={center.x} cy={center.y} r={4} fill="var(--surface)" stroke="var(--aux-strong)" strokeWidth={1.6} />
                  </>
                );
              })()}
            </g>
          ) : null}

          {stageMode === 'interact' && selectedParticle && selectedLaunchScreen ? (
            <g className="stage-handle stage-handle-start" transform={`translate(${selectedLaunchScreen.x} ${selectedLaunchScreen.y})`} onPointerDown={beginParticleDrag('start')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p06-start-handle">
              <circle r={26} fill="transparent" data-testid="p06-start-handle-hit" />
              <circle r={19} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <text x={-58} y={-26} className="svg-text svg-text-small" fill={selectedParticle.color}>{selectedParticle.label} 初始位置</text>
            </g>
          ) : null}

          {stageMode === 'interact' && selectedParticle && velocityHandleScreen ? (
            <g className="stage-handle" transform={`translate(${velocityHandleScreen.x} ${velocityHandleScreen.y})`} onPointerDown={beginParticleDrag('velocity')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p06-velocity-handle">
              <circle r={26} fill="transparent" data-testid="p06-velocity-handle-hit" />
              <circle r={13} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <path d="M-4,-3L4,5M-4,5L4,-3" className="handle-grip" />
              <text x={18} y={-18} className="svg-text svg-text-small" fill={selectedParticle.color}>拖方向</text>
            </g>
          ) : null}

          {stageMode === 'interact' && field.mode === 'segmented' ? (
            <g className="stage-handle stage-handle-boundary" transform={`translate(${dScreen} ${boundaryHandleY})`} onPointerDown={beginBoundaryDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p06-boundary-handle">
              <circle r={26} fill="transparent" data-testid="p06-boundary-handle-hit" />
              <rect x={-12} y={-18} width={24} height={36} rx={8} className="handle-pill" />
              <path d="M-4,-8L4,-8M-4,0L4,0M-4,8L4,8" className="handle-grip" />
              <text x={0} y={-28} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">拖电场边界</text>
            </g>
          ) : null}

          <g transform={`translate(20 ${Math.max(50, size.height - 24)})`} aria-hidden="true">
            <line x1={0} y1={0} x2={scaleStep * view.scale} y2={0} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={scaleStep * view.scale} y1={-4} x2={scaleStep * view.scale} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <text x={scaleStep * view.scale + 8} y={4} className="svg-text svg-text-small" fill="var(--ink-muted)">{formatLength(scaleStep)}</text>
          </g>
        </svg>

        <div className="stage-hud" aria-hidden="true">
          <span className="hud-chip hud-field">
            <span className="hud-glyph">{field.Bz > 0 ? '⊙' : field.Bz < 0 ? '×' : '0'}</span>
            E ({formatNumber(field.Ex, 2)}, {formatNumber(field.Ey, 2)}) V/m · Bz {formatNumber(field.Bz, 2)} T
          </span>
          <span className="hud-chip">{field.mode === 'crossed' ? '同区叠加场' : `电场区 d = ${formatLength(field.dM)}`}</span>
          <span className="hud-chip hud-chip-quiet">粒子 {particles.length}/5 · 选中 {selectedParticle?.label ?? '—'}</span>
          <span className="hud-chip hud-chip-quiet">{selectedState ? regionLabel(selectedState.region) : '待发射'}</span>
        </div>

        {conditionNotice ? (
          <div className={`condition-notice condition-notice-${conditionNotice.tone}`} data-testid="p06-condition-notice" role="status" aria-live="polite">{conditionNotice.text}</div>
        ) : null}
        {!conditionNotice && stageMode === 'interact' ? (
          <div className="stage-drag-hint">选中粒子手柄编辑初态 · 拖边界改共享场 · 双指缩放</div>
        ) : null}
      </div>
      <StageLegend
        items={[
          { label: '彩色轨迹 = 已走路径', color: 'var(--trajectory)', variant: 'solid' },
          { label: '细虚线 = 预测轨迹', color: 'var(--preview)', variant: 'dashed' },
          { label: '速度 v', color: 'var(--velocity)', variant: 'solid' },
          { label: 'F_E 电场力', color: 'var(--force)', variant: 'dashed' },
          { label: 'F_B 磁场力', color: 'var(--field)', variant: 'dashed' },
          { label: '合力 F', color: 'var(--danger)', variant: 'solid' },
          { label: '场区边界与事件', color: 'var(--flux-strong)', variant: 'dot' },
        ]}
      />
    </div>
  );
}
