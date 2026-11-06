import { useEffect, useMemo, useRef, useState } from 'react';
import {
  finiteFieldBoundarySegments,
  finiteFieldContains,
  finiteFieldStateAt,
  type FiniteFieldEvent,
  type FiniteFieldSegment,
  type FiniteFieldSolution,
} from '../../physics/particles/finiteMagneticRegion';
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
  type ParticleRuntime,
} from '../../physics/particles/multiParticle';
import { useElementSize } from '../../hooks/useElementSize';
import { boundsFromPoints, useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatLength, formatNumber, formatTime } from '../../lib/format';
import type { P04Field } from './p04Scene';

export interface P04Layers {
  predicted: boolean;
  trail: boolean;
  center: boolean;
  radii: boolean;
  vectors: boolean;
  force: boolean;
  field: boolean;
  markers: boolean;
  allAux: boolean;
  allVectors: boolean;
}

export const P04_DEFAULT_LAYERS: P04Layers = {
  predicted: true,
  trail: true,
  center: true,
  radii: true,
  vectors: true,
  force: true,
  field: true,
  markers: true,
  allAux: false,
  allVectors: false,
};

export interface P04EvaluatedParticle {
  particle: ParticleInitialState;
  solution: FiniteFieldSolution;
  runtime: ParticleRuntime;
  state: ReturnType<typeof finiteFieldStateAt> | null;
}

export interface P04DraftPreview {
  particle: ParticleInitialState;
  solution: FiniteFieldSolution;
  state: ReturnType<typeof finiteFieldStateAt>;
}

export interface P04ConditionNotice {
  text: string;
  tone: 'preview' | 'recalculated';
}

interface FiniteFieldStageProps {
  particles: P04EvaluatedParticle[];
  field: P04Field;
  selectedId: string;
  draft: P04DraftPreview | null;
  layers: P04Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  onSelectParticle: (id: string) => void;
  onDraftStart: () => void;
  onDraftChange: (patch: { startX?: number; startY?: number; directionDeg?: number }) => void;
  onDraftEnd: () => void;
  onDraftCancel: () => void;
  conditionNotice: P04ConditionNotice | null;
  trailResetById: Record<string, number>;
}

export const P04_STATUS_LABEL: Record<FiniteFieldSolution['status'], string> = {
  'entered-and-exited': '已入场并出场',
  'starts-inside-and-exited': '场内出发 · 已出场',
  'entered-no-exit': '已入场 · 窗口内无出场',
  'starts-inside-no-exit': '场内出发 · 无出场',
  'tangent-no-exit': '场内 · 相切无出场',
  'tangent-no-entry': '场外 · 相切无入场',
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

function sampleSegmentWorld(segment: FiniteFieldSegment, count: number): Vec2[] {
  if (segment.kind === 'line' || !segment.center || segment.radiusM === null) {
    const duration = segment.endTimeS - segment.startTimeS;
    return [segment.startPosition, add(segment.startPosition, scale(segment.startVelocity, duration))];
  }
  const n = Math.max(8, count);
  const points: Vec2[] = [];
  const duration = segment.endTimeS - segment.startTimeS;
  for (let index = 0; index <= n; index++) {
    const tau = (duration * index) / n;
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

function geometryCorners(field: P04Field): Vec2[] {
  const { geometry } = field;
  if (geometry.kind === 'strip') {
    return [
      { x: geometry.xMin, y: -1 },
      { x: geometry.xMax, y: 1 },
    ];
  }
  return [
    { x: geometry.xMin, y: geometry.yMin },
    { x: geometry.xMin, y: geometry.yMax },
    { x: geometry.xMax, y: geometry.yMin },
    { x: geometry.xMax, y: geometry.yMax },
  ];
}

function solutionBounds(solution: FiniteFieldSolution, field: P04Field): StageBounds {
  const points: Vec2[] = [solution.launchPoint, ...geometryCorners(field)];
  if (solution.entry?.position) points.push(solution.entry.position);
  if (solution.exit?.position) points.push(solution.exit.position);
  if (solution.tangent?.position) points.push(solution.tangent.position);
  for (const segment of solution.segments) {
    points.push(...sampleSegmentWorld(segment, segment.kind === 'arc' ? 60 : 2));
  }
  if (points.every((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return boundsFromPoints([{ x: 0, y: 0 }], 0.2);
  }
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(0.2, maxX - minX);
  const spanY = Math.max(0.2, maxY - minY);
  return {
    minX: minX - spanX * 0.12 - 0.015,
    maxX: maxX + spanX * 0.12 + 0.015,
    minY: minY - spanY * 0.16 - 0.015,
    maxY: maxY + spanY * 0.16 + 0.015,
  };
}

function unionBounds(items: StageBounds[]): StageBounds {
  if (items.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return {
    minX: Math.min(...items.map((item) => item.minX)),
    minY: Math.min(...items.map((item) => item.minY)),
    maxX: Math.max(...items.map((item) => item.maxX)),
    maxY: Math.max(...items.map((item) => item.maxY)),
  };
}

function statusTone(status: FiniteFieldSolution['status']): string {
  if (status === 'entered-and-exited' || status === 'starts-inside-and-exited') return 'ok';
  if (status === 'no-entry' || status === 'invalid') return 'warn';
  if (status === 'tangent-no-exit' || status === 'tangent-no-entry') return 'tangent';
  return 'quiet';
}

function eventMarker(
  event: FiniteFieldEvent | null,
  color: string,
  toScreen: (point: Vec2) => Vec2,
  showLabel: boolean,
  testId?: string,
) {
  if (!event?.position) return null;
  const screen = toScreen(event.position);
  const isExit = event.kind === 'exit' || event.kind === 'corner-contact';
  const isTangent = event.kind === 'tangent';
  return (
    <g transform={`translate(${screen.x} ${screen.y})`} data-testid={testId}>
      {isExit ? (
        <rect x={-5} y={-5} width={10} height={10} rx={2} fill="var(--surface)" stroke={color} strokeWidth={2} transform="rotate(45)" />
      ) : isTangent ? (
        <circle r={6} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" />
      ) : (
        <>
          <circle r={5} fill="var(--surface)" stroke={color} strokeWidth={2} />
          <circle r={1.7} fill={color} />
        </>
      )}
      {showLabel ? (
        <text x={9} y={isTangent ? 17 : -9} className="svg-text svg-text-small" fill={color}>
          {isExit ? (event.kind === 'corner-contact' ? '角点' : '出射') : isTangent ? '相切' : '入射'}
        </text>
      ) : null}
    </g>
  );
}

export function FiniteFieldStage({
  particles,
  field,
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
}: FiniteFieldStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 800, height: 480 });
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
  const selectedDisplay = selectedParticle ? {
    startX: selectedParticle.position.x,
    startY: selectedParticle.position.y,
    directionDeg:
      ((Math.atan2(selectedParticle.velocity.y, selectedParticle.velocity.x) * 180) / Math.PI + 360) % 360,
  } : null;

  const bounds = useMemo(
    () => unionBounds([
      ...particles.map((item) => solutionBounds(item.solution, field)),
      ...(draft ? [solutionBounds(draft.solution, field)] : []),
    ]),
    [draft, field, particles],
  );
  const fitSignature = useMemo(
    () => [
      JSON.stringify(field),
      size.width.toFixed(0),
      size.height.toFixed(0),
      ...particles.map((item) => `${item.particle.id}:${item.solution.status}:${item.solution.durationS.toFixed(5)}`),
    ].join('|'),
    [field, particles, size.height, size.width],
  );
  useEffect(() => {
    if (editingKind) return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 38);
  }, [bounds, editingKind, fitBounds, fitSignature]);

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

  const fieldBoundarySegments = useMemo(() => finiteFieldBoundarySegments(field.geometry), [field.geometry]);
  const fieldGlyphs = useMemo(() => {
    if (!layers.field || field.Bz === 0) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const step = niceStep(66 / view.scale);
    const startX = Math.ceil(Math.min(topLeft.x, bottomRight.x) / step) * step;
    const startY = Math.ceil(Math.min(topLeft.y, bottomRight.y) / step) * step;
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    const glyphs: Vec2[] = [];
    for (let x = startX; x <= maxX; x += step) {
      for (let y = startY; y <= maxY; y += step) {
        if (finiteFieldContains(field.geometry, { x, y })) {
          glyphs.push(toScreen({ x, y }));
          if (glyphs.length >= 260) return glyphs;
        }
      }
    }
    return glyphs;
  }, [field, layers.field, size.height, size.width, toScreen, toWorld, view.scale]);

  const predictedFor = (solution: FiniteFieldSolution, color: string, lineStyle: ParticleLineStyle, selectedOne: boolean, testId?: string) => (
    <g data-testid={testId} data-status={solution.status} data-entry-time-s={solution.entryTimeS ?? ''} data-exit-time-s={solution.exitTimeS ?? ''}>
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

  const trailFor = (item: P04EvaluatedParticle) => {
    if (!layers.trail || !item.state || item.state.timeS <= 1e-12 || !item.particle.showTrail || !item.particle.visible) return null;
    const reset = trailResetById[item.particle.id];
    const from = reset === undefined ? 0 : Math.max(0, reset - item.runtime.launchTimeSec);
    if (item.state.timeS <= from + 1e-12) return null;
    const n = 100;
    const points: Vec2[] = [];
    for (let index = 0; index <= n; index++) {
      points.push(finiteFieldStateAt(item.solution, from + ((item.state.timeS - from) * index) / n).position);
    }
    return pointsToPath(points, toScreen);
  };

  const beginDrag = (kind: 'start' | 'velocity') => (event: React.PointerEvent<SVGGElement>) => {
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
        startX: Number(clamp(world.x, -8, 8).toFixed(4)),
        startY: Number(clamp(world.y, -8, 8).toFixed(4)),
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
    fitBounds(bounds, 38);
  };
  const fieldOut = field.Bz > 0;
  const selectedTau = draft ? 0 : selected?.state?.timeS ?? null;
  const selectedLaunch = selected?.runtime.launchTimeSec ?? 0;
  const selectedStatus = selectedSolution?.status ?? 'invalid';
  const geometry = field.geometry;
  const geometryScreen = geometry.kind === 'strip'
    ? {
        x: toScreen({ x: geometry.xMin, y: 0 }).x,
        width: Math.max(0, toScreen({ x: geometry.xMax, y: 0 }).x - toScreen({ x: geometry.xMin, y: 0 }).x),
      }
    : {
        x: toScreen({ x: geometry.xMin, y: geometry.yMin }).x,
        y: toScreen({ x: geometry.xMin, y: geometry.yMin }).y,
        width: Math.max(0, toScreen({ x: geometry.xMax, y: geometry.yMin }).x - toScreen({ x: geometry.xMin, y: geometry.yMin }).x),
        height: Math.max(0, toScreen({ x: geometry.xMin, y: geometry.yMin }).y - toScreen({ x: geometry.xMin, y: geometry.yMax }).y),
      };

  return (
    <div className="stage-card multi-stage-card p04-stage-card">
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
        data-testid="p04-stage"
        data-view-scale={view.scale.toFixed(3)}
        data-editing={editingKind !== null}
        data-selected-id={selectedId}
        data-particle-count={particles.length}
        data-status={selectedStatus}
        data-entry-time-s={selectedSolution?.entryTimeS ?? ''}
        data-exit-time-s={selectedSolution?.exitTimeS ?? ''}
        data-field-time-s={selectedSolution?.fieldTimeS ?? ''}
        data-start-x={(selectedParticle?.position.x ?? 0).toFixed(4)}
        data-start-y={(selectedParticle?.position.y ?? 0).toFixed(4)}
        data-direction-deg={(selectedDisplay?.directionDeg ?? 0).toFixed(1)}
        data-boundary-ids={(selectedSolution?.exit?.boundaryIds ?? []).join(',')}
        data-selected-tau={selectedTau ?? ''}
        data-selected-launch-time={selectedLaunch}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`P04 有限磁场。共 ${particles.length} 个粒子，选中 ${selectedParticle?.label ?? '—'}，状态 ${P04_STATUS_LABEL[selectedStatus]}。`}
          data-testid="p04-stage-svg"
          onPointerDownCapture={onSvgPointerDownCapture}
          onPointerUpCapture={onSvgPointerEndCapture}
          onPointerCancelCapture={onSvgPointerEndCapture}
          {...stageHandlers}
        >
          <defs>
            <linearGradient id="p04-field-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--field-soft)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--field-soft)" stopOpacity="0.5" />
            </linearGradient>
            <marker id="p04-arrow-v" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" />
            </marker>
            <marker id="p04-arrow-f" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" />
            </marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />
          {layers.field ? (
            geometry.kind === 'strip' ? (
              <rect x={geometryScreen.x} y={0} width={geometryScreen.width} height={size.height} fill="url(#p04-field-fill)" aria-hidden="true" />
            ) : (
              <rect x={(geometryScreen as { x: number }).x} y={(geometryScreen as { y: number }).y} width={geometryScreen.width} height={geometryScreen.height} fill="url(#p04-field-fill)" aria-hidden="true" />
            )
          ) : null}
          {fieldBoundarySegments.map((segment) => {
            const from = segment.axis === 'x'
              ? { x: segment.fixed, y: Number.isFinite(segment.min) ? segment.min : toWorld({ x: 0, y: size.height }).y }
              : { x: Number.isFinite(segment.min) ? segment.min : toWorld({ x: 0, y: 0 }).x, y: segment.fixed };
            const to = segment.axis === 'x'
              ? { x: segment.fixed, y: Number.isFinite(segment.max) ? segment.max : toWorld({ x: 0, y: 0 }).y }
              : { x: Number.isFinite(segment.max) ? segment.max : toWorld({ x: size.width, y: 0 }).x, y: segment.fixed };
            const a = toScreen(from);
            const b = toScreen(to);
            return (
              <line key={segment.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--field)" strokeWidth={2} strokeDasharray="8 6" aria-hidden="true" />
            );
          })}
          {fieldGlyphs.map((glyph, index) => (
            <g key={index} transform={`translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`} opacity={0.34} aria-hidden="true">
              <circle r={6.4} fill="none" stroke="var(--field)" strokeWidth={1.1} />
              {fieldOut ? <circle r={1.8} fill="var(--field)" /> : <path d="M-2.7,-2.7L2.7,2.7M2.7,-2.7L-2.7,2.7" stroke="var(--field)" strokeWidth={1.2} />}
            </g>
          ))}

          {particles.map((item) => {
            const isSelected = item.particle.id === selectedId;
            if (isSelected && draft) return null;
            const itemState = item.state;
            const itemPosition = itemState?.position ?? item.solution.launchPoint;
            const itemScreen = toScreen(itemPosition);
            const path = trailFor(item);
            const showVectors = layers.allVectors || isSelected;
            const vDir = itemState ? normalize({ x: itemState.velocity.x, y: -itemState.velocity.y }) : normalize({ x: item.particle.velocity.x, y: -item.particle.velocity.y });
            const fDir = itemState ? normalize({ x: itemState.force.x, y: -itemState.force.y }) : { x: 0, y: 0 };
            const fMagnitude = itemState ? length(itemState.force) : 0;
            const fLength = clamp(22, 90, 52 * fMagnitude);
            return (
              <g
                key={item.particle.id}
                data-testid={`p04-particle-${item.particle.label}`}
                data-status={item.solution.status}
                data-entry-time-s={item.solution.entryTimeS ?? ''}
                data-exit-time-s={item.solution.exitTimeS ?? ''}
                data-field-time-s={item.solution.fieldTimeS ?? ''}
                data-launch-time={item.runtime.launchTimeSec}
                data-tau={itemState?.timeS ?? ''}
                data-in-field={itemState?.inField ?? false}
                data-x={itemState?.position.x ?? ''}
                data-y={itemState?.position.y ?? ''}
                data-vx={itemState?.velocity.x ?? ''}
                data-vy={itemState?.velocity.y ?? ''}
                data-exit-boundary-ids={(item.solution.exit?.boundaryIds ?? []).join(',')}
                opacity={item.particle.visible ? 1 : 0.16}
              >
                {layers.predicted && !isSelected ? predictedFor(item.solution, item.particle.color, item.particle.lineStyle, false) : null}
                {path ? <path d={path} fill="none" stroke={item.particle.color} strokeWidth={isSelected ? 3.6 : 2.6} strokeDasharray={DASH[item.particle.lineStyle]} opacity={isSelected ? 0.95 : 0.55} strokeLinecap="round" aria-hidden="true" /> : null}
                {layers.center && item.solution.segments.find((segment) => segment.kind === 'arc')?.center && (isSelected || layers.allAux) ? (
                  <g transform={`translate(${toScreen(item.solution.segments.find((segment) => segment.kind === 'arc')!.center!).x} ${toScreen(item.solution.segments.find((segment) => segment.kind === 'arc')!.center!).y})`} aria-hidden="true">
                    <circle r={isSelected ? 4.3 : 3} fill="var(--surface)" stroke={item.particle.color} strokeWidth={1.7} />
                  </g>
                ) : null}
                {layers.markers && !isSelected ? (
                  <g aria-hidden="true">
                    {eventMarker(item.solution.entry, item.particle.color, toScreen, false, `p04-particle-${item.particle.label}-entry`)}
                    {eventMarker(item.solution.exit, item.particle.color, toScreen, false, `p04-particle-${item.particle.label}-exit`)}
                    {eventMarker(item.solution.tangent, item.particle.color, toScreen, false, `p04-particle-${item.particle.label}-tangent`)}
                  </g>
                ) : null}
                {showVectors && layers.vectors && itemState ? (
                  <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + vDir.x * 48} y2={itemScreen.y + vDir.y * 48} stroke={item.particle.color} strokeWidth={2.2} markerEnd="url(#p04-arrow-v)" opacity={0.75} aria-hidden="true" />
                ) : null}
                {showVectors && layers.force && itemState && fMagnitude > 1e-12 ? (
                  <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + fDir.x * fLength} y2={itemScreen.y + fDir.y * fLength} stroke={item.particle.color} strokeWidth={2.1} strokeDasharray="6 4" markerEnd="url(#p04-arrow-f)" opacity={0.8} aria-hidden="true" />
                ) : null}
                <circle cx={itemScreen.x} cy={itemScreen.y} r={isSelected ? 9 : 7} fill={item.particle.color} stroke="var(--surface)" strokeWidth={2} opacity={itemState ? 1 : 0.32} aria-hidden="true" />
                <text x={itemScreen.x + 12} y={itemScreen.y - 10} className="svg-text svg-text-small" fill={item.particle.color} aria-hidden="true">{item.particle.label}</text>
                {stageMode === 'interact' && !isSelected && !editingKind ? (
                  <circle cx={itemScreen.x} cy={itemScreen.y} r={26} fill="transparent" onPointerDown={(event) => { event.stopPropagation(); onSelectParticle(item.particle.id); }} style={{ cursor: 'pointer' }} data-testid={`p04-particle-hit-${item.particle.label}`} />
                ) : null}
              </g>
            );
          })}

          {selectedSolution ? (
            <g>
              {predictedFor(selectedSolution, selectedParticle?.color ?? 'var(--preview)', selectedParticle?.lineStyle ?? 'solid', true, 'p04-preview-path')}
              {eventMarker(selectedSolution.entry, selectedParticle?.color ?? 'var(--field)', toScreen, true, 'p04-entry-marker')}
              {eventMarker(selectedSolution.exit, selectedParticle?.color ?? 'var(--accent)', toScreen, true, 'p04-exit-marker')}
              {eventMarker(selectedSolution.tangent, selectedParticle?.color ?? 'var(--warning)', toScreen, true, 'p04-tangent-marker')}
            </g>
          ) : null}

          {stageMode === 'interact' && selectedParticle && selectedLaunchScreen ? (
            <g className="stage-handle stage-handle-start" transform={`translate(${selectedLaunchScreen.x} ${selectedLaunchScreen.y})`} onPointerDown={beginDrag('start')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p04-start-handle">
              <circle r={26} fill="transparent" data-testid="p04-start-handle-hit" />
              <circle r={19} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <text x={-58} y={-26} className="svg-text svg-text-small" fill={selectedParticle.color}>{selectedParticle.label} 发射点</text>
            </g>
          ) : null}
          {stageMode === 'interact' && selectedParticle && velocityHandleScreen ? (
            <g className="stage-handle" transform={`translate(${velocityHandleScreen.x} ${velocityHandleScreen.y})`} onPointerDown={beginDrag('velocity')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p04-velocity-handle">
              <circle r={26} fill="transparent" data-testid="p04-velocity-handle-hit" />
              <circle r={13} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <path d="M-4,-3L4,5M-4,5L4,-3" className="handle-grip" />
              <text x={18} y={-18} className="svg-text svg-text-small" fill={selectedParticle.color}>拖方向</text>
            </g>
          ) : null}

          <g transform={`translate(20 ${Math.max(50, size.height - 24)})`} aria-hidden="true">
            <line x1={0} y1={0} x2={80} y2={0} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={80} y1={-4} x2={80} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <text x={88} y={4} className="svg-text svg-text-small" fill="var(--ink-muted)">{formatLength(niceStep(80 / view.scale))}</text>
          </g>
        </svg>

        <div className="stage-hud" aria-hidden="true">
          <span className="hud-chip hud-field">
            <span className="hud-glyph">{fieldOut ? '⊙' : '×'}</span>
            B {field.Bz === 0 ? '= 0' : `${fieldOut ? '出纸面' : '入纸面'} · ${formatNumber(field.Bz, 2)} T`}
          </span>
          <span className={`hud-chip p04-status-chip status-${statusTone(selectedStatus)}`}>{P04_STATUS_LABEL[selectedStatus]}</span>
          <span className="hud-chip hud-chip-quiet">粒子 {particles.length}/5 · 选中 {selectedParticle?.label ?? '—'}</span>
          <span className="hud-chip hud-chip-quiet">τ {selectedTau === null ? '未发射' : formatTime(selectedTau)}</span>
        </div>
        {conditionNotice ? (
          <div className={`condition-notice condition-notice-${conditionNotice.tone}`} data-testid="p04-condition-notice" role="status" aria-live="polite">{conditionNotice.text}</div>
        ) : null}
        {!conditionNotice && stageMode === 'interact' ? (
          <div className="stage-drag-hint">选中粒子的手柄可编辑 · 区域参数用右侧控件 · 双指缩放</div>
        ) : null}
      </div>
      <StageLegend
        items={[
          { label: '彩色轨迹 = 已走路径', color: 'var(--trajectory)', variant: 'solid' },
          { label: '细虚线 = 完整预测轨迹', color: 'var(--preview)', variant: 'dashed' },
          { label: '入射 / 出射 / 相切 / 角点', color: 'var(--field)', variant: 'dot' },
          { label: '有限磁场区域', color: 'var(--field)', variant: 'field' },
        ]}
      />
    </div>
  );
}
