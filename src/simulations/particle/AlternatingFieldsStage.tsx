import { useEffect, useMemo, useRef, useState } from 'react';
import {
  alternatingRegionAtX,
  alternatingStateAt,
  type AlternatingSegment,
  type AlternatingSolution,
} from '../../physics/particles/alternatingMagneticRegions';
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
import type { P05Field } from './p05Scene';

export interface P05Layers {
  predicted: boolean;
  trail: boolean;
  center: boolean;
  vectors: boolean;
  force: boolean;
  field: boolean;
  markers: boolean;
  allAux: boolean;
  allVectors: boolean;
}

export const P05_DEFAULT_LAYERS: P05Layers = {
  predicted: true,
  trail: true,
  center: true,
  vectors: true,
  force: true,
  field: true,
  markers: true,
  allAux: false,
  allVectors: false,
};

export interface P05EvaluatedParticle {
  particle: ParticleInitialState;
  solution: AlternatingSolution;
  runtime: ParticleRuntime;
  state: ReturnType<typeof alternatingStateAt> | null;
}

export interface P05DraftPreview {
  particle: ParticleInitialState;
  solution: AlternatingSolution;
  state: ReturnType<typeof alternatingStateAt>;
}

export interface P05ConditionNotice {
  text: string;
  tone: 'preview' | 'recalculated';
}

interface AlternatingFieldsStageProps {
  particles: P05EvaluatedParticle[];
  field: P05Field;
  selectedId: string;
  draft: P05DraftPreview | null;
  layers: P05Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  onSelectParticle: (id: string) => void;
  onDraftStart: () => void;
  onDraftChange: (patch: { startX?: number; startY?: number; directionDeg?: number }) => void;
  onDraftEnd: () => void;
  onDraftCancel: () => void;
  conditionNotice: P05ConditionNotice | null;
  trailResetById: Record<string, number>;
}

export const P05_STATUS_LABEL: Record<AlternatingSolution['status'], string> = {
  crossed: '已跨界',
  'tangent-only': '仅相切 · 未跨界',
  'no-crossing': '窗口内未跨界',
  'event-limited': '事件上限截断',
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

function sampleSegmentWorld(segment: AlternatingSegment, count: number): Vec2[] {
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

function solutionBounds(solution: AlternatingSolution, field: P05Field): StageBounds {
  const points: Vec2[] = [solution.input.startPosition];
  for (const boundary of field.boundaries) points.push({ x: boundary, y: 0 });
  for (const event of solution.events) points.push(event.position);
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
    minY: minY - spanY * 0.18 - 0.015,
    maxY: maxY + spanY * 0.18 + 0.015,
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

function regionLabel(index: number): string {
  return `区域 ${String.fromCharCode(65 + index)}`;
}

function regionBzLabel(Bz: number): string {
  if (Math.abs(Bz) < 1e-12) return 'B = 0';
  return `${Bz > 0 ? '⊙' : '×'} ${formatNumber(Bz, 2)} T`;
}

export function AlternatingFieldsStage({
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
}: AlternatingFieldsStageProps) {
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
    () => [JSON.stringify(field), size.width.toFixed(0), size.height.toFixed(0), ...particles.map((item) => `${item.particle.id}:${item.solution.status}:${item.solution.durationS.toFixed(5)}`)].join('|'),
    [field, particles, size.height, size.width],
  );
  useEffect(() => {
    if (editingKind) return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 38);
  }, [bounds, editingKind, fitBounds, fitSignature]);

  const selectedLaunchScreen = selectedSolution ? toScreen(selectedSolution.input.startPosition) : null;
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

  const visibleRect = useMemo(() => {
    const a = toWorld({ x: 0, y: 0 });
    const b = toWorld({ x: size.width, y: size.height });
    return {
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
    };
  }, [size.height, size.width, toWorld]);

  const regionBands = useMemo(() => {
    const edges = [-Infinity, ...field.boundaries, Infinity];
    return field.fields.map((Bz, index) => {
      const start = Math.max(visibleRect.minX, edges[index]);
      const end = Math.min(visibleRect.maxX, edges[index + 1]);
      return { index, Bz, start, end };
    }).filter((band) => band.end > band.start);
  }, [field, visibleRect]);

  const fieldGlyphs = useMemo(() => {
    if (!layers.field) return [];
    const step = niceStep(68 / view.scale);
    const startX = Math.ceil(visibleRect.minX / step) * step;
    const startY = Math.ceil(visibleRect.minY / step) * step;
    const glyphs: Array<{ point: Vec2; region: number }> = [];
    for (let x = startX; x <= visibleRect.maxX; x += step) {
      for (let y = startY; y <= visibleRect.maxY; y += step) {
        glyphs.push({ point: toScreen({ x, y }), region: alternatingRegionAtX(field, x) });
        if (glyphs.length >= 360) return glyphs;
      }
    }
    return glyphs;
  }, [field, layers.field, toScreen, view.scale, visibleRect]);

  const predictedFor = (solution: AlternatingSolution, color: string, lineStyle: ParticleLineStyle, selectedOne: boolean, testId?: string) => (
    <g data-testid={testId} data-status={solution.status} data-crossings={solution.crossingCount}>
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

  const trailFor = (item: P05EvaluatedParticle) => {
    if (!layers.trail || !item.state || item.state.timeS <= 1e-12 || !item.particle.showTrail || !item.particle.visible) return null;
    const reset = trailResetById[item.particle.id];
    const from = reset === undefined ? 0 : Math.max(0, reset - item.runtime.launchTimeSec);
    if (item.state.timeS <= from + 1e-12) return null;
    const n = 100;
    const points: Vec2[] = [];
    for (let index = 0; index <= n; index++) {
      points.push(alternatingStateAt(item.solution, from + ((item.state.timeS - from) * index) / n).position);
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

  const selectedTau = draft ? 0 : selected?.state?.timeS ?? null;
  const selectedLaunch = selected?.runtime.launchTimeSec ?? 0;
  const selectedStatus = selectedSolution?.status ?? 'invalid';

  return (
    <div className="stage-card multi-stage-card p05-stage-card">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        extra={<span className="stage-toolbar-chip">区域 {field.fields.length} · 粒子 {particles.length}/5</span>}
      />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="p05-stage"
        data-view-scale={view.scale.toFixed(3)}
        data-editing={editingKind !== null}
        data-selected-id={selectedId}
        data-particle-count={particles.length}
        data-status={selectedStatus}
        data-crossings={selectedSolution?.crossingCount ?? 0}
        data-tangents={selectedSolution?.tangentCount ?? 0}
        data-region-times={selectedSolution?.regionTimesS.map((time) => time.toFixed(4)).join(',') ?? ''}
        data-checkpoint-times={selectedSolution?.events.map((event) => event.timeS.toFixed(4)).join(',') ?? ''}
        data-start-x={(selectedParticle?.position.x ?? 0).toFixed(4)}
        data-start-y={(selectedParticle?.position.y ?? 0).toFixed(4)}
        data-direction-deg={(selectedDisplay?.directionDeg ?? 0).toFixed(1)}
        data-selected-tau={selectedTau ?? ''}
        data-selected-launch-time={selectedLaunch}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`P05 交替磁场。共 ${particles.length} 个粒子，选中 ${selectedParticle?.label ?? '—'}，状态 ${P05_STATUS_LABEL[selectedStatus]}。`}
          data-testid="p05-stage-svg"
          onPointerDownCapture={onSvgPointerDownCapture}
          onPointerUpCapture={onSvgPointerEndCapture}
          onPointerCancelCapture={onSvgPointerEndCapture}
          {...stageHandlers}
        >
          <defs>
            <marker id="p05-arrow-v" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" /></marker>
            <marker id="p05-arrow-f" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" /></marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />
          {layers.field ? regionBands.map((band) => {
            const xStart = toScreen({ x: band.start, y: 0 }).x;
            const xEnd = toScreen({ x: band.end, y: 0 }).x;
            return (
              <rect
                key={band.index}
                x={xStart}
                y={0}
                width={Math.max(0, xEnd - xStart)}
                height={size.height}
                fill={band.index % 2 === 0 ? 'var(--field-soft)' : 'rgba(79,70,229,0.055)'}
                opacity={band.Bz === 0 ? 0.28 : 0.72}
                aria-hidden="true"
              />
            );
          }) : null}
          {field.boundaries.map((boundary, index) => {
            const x = toScreen({ x: boundary, y: 0 }).x;
            return (
              <g key={boundary}>
                <line x1={x} y1={0} x2={x} y2={size.height} stroke="var(--field)" strokeWidth={2} strokeDasharray="8 6" aria-hidden="true" />
                <text x={x + 6} y={22} className="svg-text svg-text-small" fill="var(--field)" aria-hidden="true">{`交界 ${index + 1}`}</text>
              </g>
            );
          })}
          {layers.field ? fieldGlyphs.map((glyph, index) => {
            const Bz = field.fields[glyph.region] ?? 0;
            return (
              <g key={index} transform={`translate(${glyph.point.x.toFixed(1)} ${glyph.point.y.toFixed(1)})`} opacity={0.38} aria-hidden="true">
                <circle r={6.4} fill="none" stroke="var(--field)" strokeWidth={1.1} />
                {Math.abs(Bz) < 1e-12 ? <text x={-3} y={4} className="svg-text svg-text-small" fill="var(--field)">0</text> : Bz > 0 ? <circle r={1.8} fill="var(--field)" /> : <path d="M-2.7,-2.7L2.7,2.7M2.7,-2.7L-2.7,2.7" stroke="var(--field)" strokeWidth={1.2} />}
              </g>
            );
          }) : null}
          {layers.field ? regionBands.map((band) => {
            const x = toScreen({ x: (band.start + band.end) / 2, y: 0 }).x;
            return (
              <text key={`label-${band.index}`} x={x} y={size.height - 18} textAnchor="middle" className="svg-text svg-text-small" fill="var(--field)" aria-hidden="true">
                {regionLabel(band.index)} · {regionBzLabel(band.Bz)}
              </text>
            );
          }) : null}

          {particles.map((item) => {
            const isSelected = item.particle.id === selectedId;
            if (isSelected && draft) return null;
            const itemState = item.state;
            const itemPosition = itemState?.position ?? item.solution.input.startPosition;
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
                data-testid={`p05-particle-${item.particle.label}`}
                data-status={item.solution.status}
                data-crossings={item.solution.crossingCount}
                data-tangents={item.solution.tangentCount}
                data-launch-time={item.runtime.launchTimeSec}
                data-tau={itemState?.timeS ?? ''}
                data-x={itemState?.position.x ?? ''}
                data-y={itemState?.position.y ?? ''}
                data-vx={itemState?.velocity.x ?? ''}
                data-vy={itemState?.velocity.y ?? ''}
                data-region={itemState?.regionIndex ?? ''}
                data-region-times={item.solution.regionTimesS.map((time) => time.toFixed(4)).join(',')}
                opacity={item.particle.visible ? 1 : 0.16}
              >
                {layers.predicted && !isSelected ? predictedFor(item.solution, item.particle.color, item.particle.lineStyle, false) : null}
                {path ? <path d={path} fill="none" stroke={item.particle.color} strokeWidth={isSelected ? 3.6 : 2.6} strokeDasharray={DASH[item.particle.lineStyle]} opacity={isSelected ? 0.95 : 0.55} strokeLinecap="round" aria-hidden="true" /> : null}
                {layers.center && item.solution.segments.find((segment) => segment.kind === 'arc')?.center && (isSelected || layers.allAux) ? (
                  <g transform={`translate(${toScreen(item.solution.segments.find((segment) => segment.kind === 'arc')!.center!).x} ${toScreen(item.solution.segments.find((segment) => segment.kind === 'arc')!.center!).y})`} aria-hidden="true">
                    <circle r={isSelected ? 4.3 : 3} fill="var(--surface)" stroke={item.particle.color} strokeWidth={1.7} />
                  </g>
                ) : null}
                {layers.markers && !isSelected ? item.solution.events.filter((event) => event.kind === 'crossing' || event.kind === 'tangent').map((event, index) => {
                  const p = toScreen(event.position);
                  return <circle key={`${event.kind}-${index}`} cx={p.x} cy={p.y} r={event.kind === 'tangent' ? 5 : 4} fill={event.kind === 'tangent' ? 'none' : 'var(--surface)'} stroke={item.particle.color} strokeWidth={1.8} strokeDasharray={event.kind === 'tangent' ? '3 3' : undefined} />;
                }) : null}
                {showVectors && layers.vectors && itemState ? <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + vDir.x * 48} y2={itemScreen.y + vDir.y * 48} stroke={item.particle.color} strokeWidth={2.2} markerEnd="url(#p05-arrow-v)" opacity={0.75} aria-hidden="true" /> : null}
                {showVectors && layers.force && itemState && fMagnitude > 1e-12 ? <line x1={itemScreen.x} y1={itemScreen.y} x2={itemScreen.x + fDir.x * fLength} y2={itemScreen.y + fDir.y * fLength} stroke={item.particle.color} strokeWidth={2.1} strokeDasharray="6 4" markerEnd="url(#p05-arrow-f)" opacity={0.8} aria-hidden="true" /> : null}
                <circle cx={itemScreen.x} cy={itemScreen.y} r={isSelected ? 9 : 7} fill={item.particle.color} stroke="var(--surface)" strokeWidth={2} opacity={itemState ? 1 : 0.32} aria-hidden="true" />
                <text x={itemScreen.x + 12} y={itemScreen.y - 10} className="svg-text svg-text-small" fill={item.particle.color} aria-hidden="true">{item.particle.label}</text>
                {stageMode === 'interact' && !isSelected && !editingKind ? <circle cx={itemScreen.x} cy={itemScreen.y} r={26} fill="transparent" onPointerDown={(event) => { event.stopPropagation(); onSelectParticle(item.particle.id); }} style={{ cursor: 'pointer' }} data-testid={`p05-particle-hit-${item.particle.label}`} /> : null}
              </g>
            );
          })}

          {selectedSolution ? (
            <g>
              {predictedFor(selectedSolution, selectedParticle?.color ?? 'var(--preview)', selectedParticle?.lineStyle ?? 'solid', true, 'p05-preview-path')}
              {selectedSolution.events.filter((event) => event.kind === 'crossing' || event.kind === 'tangent').map((event, index) => {
                const p = toScreen(event.position);
                return (
                  <g key={`${event.kind}-${index}`} transform={`translate(${p.x} ${p.y})`} data-testid={`p05-event-marker-${index}`}>
                    {event.kind === 'tangent' ? <circle r={6} fill="none" stroke="var(--warning)" strokeWidth={2} strokeDasharray="3 3" /> : <rect x={-5} y={-5} width={10} height={10} rx={2} fill="var(--surface)" stroke={selectedParticle?.color ?? 'var(--accent)'} strokeWidth={2} transform="rotate(45)" />}
                    <text x={9} y={-9} className="svg-text svg-text-small" fill={event.kind === 'tangent' ? 'var(--warning)' : 'var(--ink-muted)'}>{formatTime(event.timeS)}</text>
                  </g>
                );
              })}
            </g>
          ) : null}

          {stageMode === 'interact' && selectedParticle && selectedLaunchScreen ? (
            <g className="stage-handle stage-handle-start" transform={`translate(${selectedLaunchScreen.x} ${selectedLaunchScreen.y})`} onPointerDown={beginDrag('start')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p05-start-handle">
              <circle r={26} fill="transparent" data-testid="p05-start-handle-hit" />
              <circle r={19} className="handle-ring" style={{ stroke: selectedParticle.color }} />
              <text x={-58} y={-26} className="svg-text svg-text-small" fill={selectedParticle.color}>{selectedParticle.label} 发射点</text>
            </g>
          ) : null}
          {stageMode === 'interact' && selectedParticle && velocityHandleScreen ? (
            <g className="stage-handle" transform={`translate(${velocityHandleScreen.x} ${velocityHandleScreen.y})`} onPointerDown={beginDrag('velocity')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} data-testid="p05-velocity-handle">
              <circle r={26} fill="transparent" data-testid="p05-velocity-handle-hit" />
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
          <span className="hud-chip hud-field">分区 {field.fields.map((Bz) => `${Bz > 0 ? '⊙' : Bz < 0 ? '×' : '0'}${formatNumber(Bz, 1)}`).join(' / ')} T</span>
          <span className={`hud-chip p05-status-chip status-${selectedStatus === 'crossed' ? 'ok' : selectedStatus === 'invalid' ? 'warn' : 'quiet'}`}>{P05_STATUS_LABEL[selectedStatus]}</span>
          <span className="hud-chip hud-chip-quiet">粒子 {particles.length}/5 · 选中 {selectedParticle?.label ?? '—'}</span>
          <span className="hud-chip hud-chip-quiet">τ {selectedTau === null ? '未发射' : formatTime(selectedTau)}</span>
        </div>
        {conditionNotice ? <div className={`condition-notice condition-notice-${conditionNotice.tone}`} data-testid="p05-condition-notice" role="status" aria-live="polite">{conditionNotice.text}</div> : null}
        {!conditionNotice && stageMode === 'interact' ? <div className="stage-drag-hint">选中粒子的手柄可编辑 · 区域参数用右侧控件 · 双指缩放</div> : null}
      </div>
      <StageLegend
        items={[
          { label: '彩色轨迹 = 已走路径', color: 'var(--trajectory)', variant: 'solid' },
          { label: '细虚线 = 完整预测轨迹', color: 'var(--preview)', variant: 'dashed' },
          { label: '跨界事件 = 时间标记', color: 'var(--field)', variant: 'dot' },
          { label: '竖直分区 = 各区 Bz', color: 'var(--field)', variant: 'field' },
        ]}
      />
    </div>
  );
}
