import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARGE_UNIT_C,
  SPEED_UNIT_MPS,
  particleStateAt,
  sampleTrajectory,
  type ParticleState,
  type UniformBModel,
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
import { p02SingleDuration, type P02Field } from './p02Scene';

export interface P02Layers {
  predicted: boolean;
  trail: boolean;
  aux: boolean;
  velocity: boolean;
  force: boolean;
  field: boolean;
  angle: boolean;
  allVectors: boolean;
}

export const P02_DEFAULT_LAYERS: P02Layers = {
  predicted: true,
  trail: true,
  aux: true,
  velocity: true,
  force: true,
  field: true,
  angle: true,
  allVectors: false,
};

export interface P02EvaluatedParticle {
  particle: ParticleInitialState;
  model: UniformBModel;
  runtime: ParticleRuntime;
  state: ParticleState | null;
}

export interface P02DraftPreview {
  particle: ParticleInitialState;
  model: UniformBModel;
  state: ParticleState;
}

export interface ConditionNotice {
  text: string;
  tone: 'preview' | 'recalculated';
}

interface UniformBStageProps {
  particles: P02EvaluatedParticle[];
  field: P02Field;
  selectedId: string;
  draft: P02DraftPreview | null;
  layers: P02Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  onSelectParticle: (id: string) => void;
  onDraftStart: (kind: 'start' | 'velocity') => void;
  onDraftChange: (patch: { startX?: number; startY?: number; directionDeg?: number }) => void;
  onDraftEnd: () => void;
  onDraftCancel: () => void;
  conditionNotice: ConditionNotice | null;
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

function modelBounds(model: UniformBModel): StageBounds {
  if (model.circular && model.center) {
    const r = model.radiusM;
    const margin = Math.max(r * 0.28, 0.006);
    return {
      minX: model.center.x - r - margin,
      minY: model.center.y - r - margin,
      maxX: model.center.x + r + margin,
      maxY: model.center.y + r + margin,
    };
  }
  const start = model.input.initialPosition;
  const speed = length(model.input.initialVelocity);
  if (speed < 1e-12) {
    return { minX: start.x - 0.15, minY: start.y - 0.12, maxX: start.x + 0.15, maxY: start.y + 0.12 };
  }
  const dir = normalize(model.input.initialVelocity);
  return boundsFromPoints(
    [
      { x: start.x - dir.x * 0.06, y: start.y - dir.y * 0.06 },
      { x: start.x + dir.x * 0.5, y: start.y + dir.y * 0.5 },
    ],
    0.06,
  );
}

function unionBounds(items: StageBounds[]): StageBounds {
  if (items.length === 0) return { minX: -0.2, minY: -0.2, maxX: 0.2, maxY: 0.2 };
  return {
    minX: Math.min(...items.map((item) => item.minX)),
    minY: Math.min(...items.map((item) => item.minY)),
    maxX: Math.max(...items.map((item) => item.maxX)),
    maxY: Math.max(...items.map((item) => item.maxY)),
  };
}

function sampleInterval(model: UniformBModel, fromLocal: number, toLocal: number, count: number): Vec2[] {
  const start = Math.max(0, fromLocal);
  const end = Math.max(start, toLocal);
  if (end - start < 1e-15) return [particleStateAt(model, end).position];
  const n = Math.max(2, Math.floor(count));
  const points: Vec2[] = [];
  for (let index = 0; index <= n; index++) {
    points.push(particleStateAt(model, start + ((end - start) * index) / n).position);
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

export function UniformBStage({
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
}: UniformBStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 800, height: 480 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [interacting, setInteracting] = useState(false);
  const [editKind, setEditKind] = useState<'start' | 'velocity' | null>(null);
  const lastFitSignature = useRef<string | null>(null);
  const activePointers = useRef(new Set<number>());

  const selected = particles.find((item) => item.particle.id === selectedId) ?? particles[0];
  const displayParticle = draft?.particle ?? selected?.particle ?? null;
  const displayModel = draft?.model ?? selected?.model ?? null;
  const displayState = draft?.state ?? selected?.state ?? null;
  const launchPoint = displayParticle?.position ?? { x: 0, y: 0 };
  const displayStart = draft?.particle.position ?? selected?.particle.position ?? launchPoint;

  const bounds = useMemo(
    () =>
      unionBounds([
        ...particles.map((item) => modelBounds(item.model)),
        ...(draft ? [modelBounds(draft.model)] : []),
      ]),
    [draft, particles],
  );
  const fitSignature = useMemo(
    () =>
      [
        field.fieldDir,
        field.fieldMag,
        size.width.toFixed(0),
        size.height.toFixed(0),
        ...particles.map(
          (item) =>
            `${item.particle.id}:${item.particle.position.x.toFixed(4)},${item.particle.position.y.toFixed(4)},${item.particle.velocity.x.toFixed(1)},${item.particle.velocity.y.toFixed(1)}`,
        ),
      ].join('|'),
    [field.fieldDir, field.fieldMag, particles, size.height, size.width],
  );

  useEffect(() => {
    if (interacting) return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 35);
  }, [bounds, fitBounds, fitSignature, interacting]);

  const fieldOut = field.fieldDir > 0;
  const fieldStep = niceStep(64 / view.scale);
  const fieldGlyphs = useMemo(() => {
    if (!layers.field || field.fieldMag === 0 || view.scale <= 0) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    const items: Vec2[] = [];
    const startX = Math.ceil(minX / fieldStep) * fieldStep;
    const startY = Math.ceil(minY / fieldStep) * fieldStep;
    for (let x = startX; x <= maxX; x += fieldStep) {
      for (let y = startY; y <= maxY; y += fieldStep) {
        items.push(toScreen({ x, y }));
        if (items.length >= 320) return items;
      }
    }
    return items;
  }, [field.fieldMag, fieldStep, layers.field, size.height, size.width, toScreen, toWorld, view.scale]);

  const predictedPaths = useMemo(() => {
    if (!layers.predicted) return [];
    return particles.map((item) => ({
      id: item.particle.id,
      path: pointsToPath(sampleTrajectory(item.model, Math.max(1e-12, p02SingleDuration(item.model)), 150), toScreen),
      color: item.particle.color,
      lineStyle: item.particle.lineStyle,
    }));
  }, [layers.predicted, particles, toScreen]);

  const trails = useMemo(() => {
    if (!layers.trail) return [];
    return particles.map((item) => {
      const tau = item.state?.timeS ?? null;
      if (tau === null || tau <= 1e-12 || !item.particle.showTrail || !item.particle.visible) return null;
      const reset = trailResetById[item.particle.id];
      const from = reset === undefined
        ? 0
        : Math.max(0, reset - item.runtime.launchTimeSec);
      if (tau <= from + 1e-12) return null;
      return {
        id: item.particle.id,
        path: pointsToPath(sampleInterval(item.model, from, tau, 120), toScreen),
        color: item.particle.color,
        lineStyle: item.particle.lineStyle,
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [layers.trail, particles, toScreen, trailResetById]);

  const draftPreviewPath = useMemo(() => {
    if (!draft) return '';
    return pointsToPath(
      sampleTrajectory(draft.model, Math.max(1e-12, p02SingleDuration(draft.model)), 160),
      toScreen,
    );
  }, [draft, toScreen]);

  const selectedScreen = displayState ? toScreen(displayState.position) : toScreen(displayStart);
  const centerScreen = displayModel?.circular && displayModel.center ? toScreen(displayModel.center) : null;
  const radiusPx = displayModel?.circular ? displayModel.radiusM * view.scale : 0;
  const displayStartScreen = toScreen(displayStart);
  const velocityScreen = displayState
    ? { x: displayState.velocity.x, y: -displayState.velocity.y }
    : displayModel
      ? { x: displayModel.input.initialVelocity.x, y: -displayModel.input.initialVelocity.y }
      : { x: 1, y: 0 };
  const velocityDir = normalize(velocityScreen);
  const velocityHandle = add(selectedScreen, scale(velocityDir, 94));

  const beginDrag = (kind: 'start' | 'velocity') => (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact' || activePointers.current.size > 1) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteracting(true);
    setEditKind(kind);
    onDraftStart(kind);
  };

  const moveDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editKind || activePointers.current.size > 1) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (editKind === 'start') {
      onDraftChange({
        startX: Number(clamp(world.x, -0.6, 0.6).toFixed(4)),
        startY: Number(clamp(world.y, -0.5, 0.5).toFixed(4)),
      });
    } else {
      const dx = world.x - displayStart.x;
      const dy = world.y - displayStart.y;
      if (Math.hypot(dx, dy) * view.scale < 12) return;
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      onDraftChange({ directionDeg: Number(angle.toFixed(1)) });
    }
  };

  const endDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editKind) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setInteracting(false);
    setEditKind(null);
    onDraftEnd();
  };

  const cancelDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!editKind) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setInteracting(false);
    setEditKind(null);
    onDraftCancel();
  };

  const onSvgPointerDownCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.add(event.pointerId);
    if (activePointers.current.size > 1 && editKind) {
      setInteracting(false);
      setEditKind(null);
      onDraftCancel();
    }
  };

  const onSvgPointerEndCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.delete(event.pointerId);
  };

  const fitNow = () => {
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 35);
  };

  const scaleBarStep = niceStep(84 / view.scale);
  const scaleBarWidth = scaleBarStep * view.scale;
  const selectedTau = draft ? 0 : selected?.state?.timeS ?? null;
  const selectedLaunch = selected?.runtime.launchTimeSec ?? 0;
  const selectedDisplay = selected ? selected.particle : null;

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
        data-testid="p02-stage"
        data-view-scale={view.scale.toFixed(3)}
        data-editing={interacting}
        data-selected-id={selectedId}
        data-particle-count={particles.length}
        data-selected-tau={selectedTau ?? ''}
        data-selected-launch-time={selectedLaunch}
        data-selected-start-x={displayParticle?.position.x.toFixed(4) ?? ''}
        data-selected-start-y={displayParticle?.position.y.toFixed(4) ?? ''}
        data-initial-start-x={displayParticle?.position.x.toFixed(4) ?? ''}
        data-initial-start-y={displayParticle?.position.y.toFixed(4) ?? ''}
        data-initial-direction-deg={
          displayModel
            ? ((Math.atan2(displayModel.input.initialVelocity.y, displayModel.input.initialVelocity.x) * 180) / Math.PI + 360) % 360
            : 0
        }
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`多粒子匀强磁场。当前共 ${particles.length} 个粒子，选中 ${selectedDisplay?.label ?? '—'}。`}
          data-testid="p02-stage-svg"
          onPointerDownCapture={onSvgPointerDownCapture}
          onPointerUpCapture={onSvgPointerEndCapture}
          onPointerCancelCapture={onSvgPointerEndCapture}
          {...stageHandlers}
        >
          <defs>
            <marker id="p02-multi-arrow-v" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" />
            </marker>
            <marker id="p02-multi-arrow-f" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" />
            </marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />
          {fieldGlyphs.map((glyph, index) => (
            <g key={index} transform={`translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`} opacity={0.38} aria-hidden="true">
              <circle r={6.6} fill="none" stroke="var(--field)" strokeWidth={1.1} />
              {fieldOut ? (
                <circle r={1.8} fill="var(--field)" />
              ) : (
                <path d="M-2.8,-2.8L2.8,2.8M2.8,-2.8L-2.8,2.8" stroke="var(--field)" strokeWidth={1.2} />
              )}
            </g>
          ))}

          {predictedPaths.map((path) => (
            <path
              key={`preview-${path.id}`}
              d={path.path}
              fill="none"
              stroke={path.color}
              strokeWidth={1.3}
              strokeDasharray={DASH_PATTERNS[path.lineStyle] ?? '5 7'}
              opacity={path.id === selectedId ? 0.5 : 0.24}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            />
          ))}

          {draft ? (
            <g
              data-testid="p02-preview-orbit"
              data-mode={draft.model.circular ? 'circle' : 'line'}
              data-center-x-m={(draft.model.center?.x ?? 0).toFixed(5)}
              data-center-y-m={(draft.model.center?.y ?? 0).toFixed(5)}
              data-radius-m={draft.model.radiusM.toFixed(6)}
              aria-hidden="true"
            >
              {draft.model.circular && draft.model.center ? (
                <circle
                  cx={toScreen(draft.model.center).x}
                  cy={toScreen(draft.model.center).y}
                  r={draft.model.radiusM * view.scale}
                  fill="none"
                  stroke={draft.particle.color}
                  strokeWidth={2.5}
                  strokeDasharray="7 7"
                />
              ) : (
                <path d={draftPreviewPath} fill="none" stroke={draft.particle.color} strokeWidth={2.5} strokeDasharray="7 7" />
              )}
              <text
                x={selectedScreen.x + 16}
                y={selectedScreen.y - 18}
                className="svg-text svg-text-small"
                fill={draft.particle.color}
              >
                {draft.particle.label} 新初态
              </text>
            </g>
          ) : null}

          {trails.map((trail) => (
            <path
              key={`trail-${trail.id}`}
              d={trail.path}
              fill="none"
              stroke={trail.color}
              strokeWidth={trail.id === selectedId ? 3.8 : 2.8}
              strokeDasharray={DASH_PATTERNS[trail.lineStyle]}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={trail.id === selectedId ? 0.95 : 0.62}
              aria-hidden="true"
            />
          ))}

          {layers.aux && centerScreen && displayModel?.circular ? (
            <g aria-hidden="true">
              <circle cx={centerScreen.x} cy={centerScreen.y} r={radiusPx} fill="none" stroke="var(--aux)" strokeWidth={1.3} strokeDasharray="7 8" />
              <line x1={displayStartScreen.x} y1={displayStartScreen.y} x2={centerScreen.x} y2={centerScreen.y} stroke="var(--aux-strong)" strokeWidth={1.3} strokeDasharray="4 5" opacity={0.65} />
              <line x1={selectedScreen.x} y1={selectedScreen.y} x2={centerScreen.x} y2={centerScreen.y} stroke="var(--aux-strong)" strokeWidth={1.9} />
              <g transform={`translate(${centerScreen.x} ${centerScreen.y})`}>
                <circle r={4.3} fill="var(--surface)" stroke="var(--aux-strong)" strokeWidth={1.7} />
                <path d="M-10,0H10M0,-10V10" stroke="var(--aux-strong)" strokeWidth={1} opacity={0.6} />
              </g>
              {layers.angle && displayState && Math.abs(displayState.angularVelocity * displayState.timeS) * 180 / Math.PI > 2 ? (
                <text x={centerScreen.x + 14} y={centerScreen.y + 22} className="svg-text svg-text-small" fill="var(--ink-muted)">
                  已转过 {formatNumber(Math.abs(displayState.angularVelocity * displayState.timeS) * 180 / Math.PI, 1)}°
                </text>
              ) : null}
            </g>
          ) : null}

          {particles.map((item) => {
            const isSelected = item.particle.id === selectedId;
            if (isSelected && draft) return null;
            const particleScreen = item.state ? toScreen(item.state.position) : toScreen(item.particle.position);
            const start = toScreen(item.particle.position);
            const selectedParticle = isSelected;
            const showVectors = (layers.velocity || layers.force) && (selectedParticle || layers.allVectors);
            const itemForce = item.state ? item.state.force : { x: 0, y: 0 };
            const itemForceMagnitude = item.state ? length(itemForce) : 0;
            const itemVelocityDir = item.state
              ? normalize({ x: item.state.velocity.x, y: -item.state.velocity.y })
              : normalize({ x: item.particle.velocity.x, y: -item.particle.velocity.y });
            const itemForceDir = normalize({ x: itemForce.x, y: -itemForce.y });
            const itemForceLength = clamp(22, 90, 68 * (itemForceMagnitude / (CHARGE_UNIT_C * SPEED_UNIT_MPS)));
            const launched = item.state !== null;
            return (
              <g
                key={item.particle.id}
                data-testid={`p02-particle-${item.particle.label}`}
                data-particle-id={item.particle.id}
                data-label={item.particle.label}
                data-visible={item.particle.visible}
                data-launch-time={item.runtime.launchTimeSec}
                data-start-x={item.particle.position.x.toFixed(6)}
                data-start-y={item.particle.position.y.toFixed(6)}
                data-vx0={item.particle.velocity.x.toFixed(3)}
                data-vy0={item.particle.velocity.y.toFixed(3)}
                data-charge-c={item.particle.chargeC}
                data-mass-kg={item.particle.massKg}
                data-tau={item.state?.timeS ?? ''}
                data-x={item.state?.position.x.toFixed(6) ?? ''}
                data-y={item.state?.position.y.toFixed(6) ?? ''}
                data-vx={item.state?.velocity.x.toFixed(3) ?? ''}
                data-vy={item.state?.velocity.y.toFixed(3) ?? ''}
                opacity={item.particle.visible ? 1 : 0.18}
              >
                {item.particle.visible ? (
                  <>
                    <circle cx={start.x} cy={start.y} r={5.5} fill="var(--surface)" stroke={item.particle.color} strokeWidth={1.8} strokeDasharray={launched ? undefined : '2 3'} opacity={launched ? 0.65 : 0.35} aria-hidden="true" />
                    {layers.force && showVectors && itemForceMagnitude > 0 && item.state ? (
                      <line
                        x1={particleScreen.x}
                        y1={particleScreen.y}
                        x2={particleScreen.x + itemForceDir.x * itemForceLength}
                        y2={particleScreen.y + itemForceDir.y * itemForceLength}
                        stroke={item.particle.color}
                        strokeWidth={2.2}
                        strokeDasharray="6 4"
                        markerEnd="url(#p02-multi-arrow-f)"
                        opacity={0.8}
                        aria-hidden="true"
                      />
                    ) : null}
                    {layers.velocity && showVectors ? (
                      <line
                        x1={particleScreen.x}
                        y1={particleScreen.y}
                        x2={particleScreen.x + itemVelocityDir.x * 48}
                        y2={particleScreen.y + itemVelocityDir.y * 48}
                        stroke={item.particle.color}
                        strokeWidth={2.4}
                        markerEnd="url(#p02-multi-arrow-v)"
                        opacity={launched ? 0.8 : 0.3}
                        aria-hidden="true"
                      />
                    ) : null}
                    <circle
                      cx={particleScreen.x}
                      cy={particleScreen.y}
                      r={selectedParticle ? 10 : 8}
                      fill={item.particle.color}
                      stroke="var(--surface)"
                      strokeWidth={2.2}
                      opacity={launched ? 1 : 0.32}
                      aria-hidden="true"
                    />
                    <text
                      x={particleScreen.x + 13}
                      y={particleScreen.y - 11}
                      className="svg-text svg-text-small"
                      fill={item.particle.color}
                      aria-hidden="true"
                    >
                      {item.particle.label}
                    </text>
                    {item.state && item.state.timeS > 1e-12 && !item.particle.showTrail ? null : null}
                    {stageMode === 'interact' ? (
                      <circle
                        cx={particleScreen.x}
                        cy={particleScreen.y}
                        r={26}
                        fill="transparent"
                        onPointerDown={(event) => {
                          if (selectedParticle || editKind) return;
                          event.stopPropagation();
                          onSelectParticle(item.particle.id);
                        }}
                        style={{ cursor: 'pointer' }}
                        data-testid={`p02-particle-hit-${item.particle.label}`}
                      />
                    ) : null}
                  </>
                ) : null}
              </g>
            );
          })}

          {stageMode === 'interact' && displayParticle ? (
            <>
              <g
                className="stage-handle stage-handle-start"
                transform={`translate(${displayStartScreen.x} ${displayStartScreen.y})`}
                onPointerDown={beginDrag('start')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                data-testid="p02-start-handle"
              >
                <circle r={26} fill="transparent" data-testid="p02-start-handle-hit" />
                <circle r={19} className="handle-ring" style={{ stroke: displayParticle.color }} />
                <text x={-48} y={-26} className="svg-text svg-text-small" fill={displayParticle.color}>
                  {displayParticle.label} 入射点
                </text>
              </g>
              <g
                className="stage-handle"
                transform={`translate(${velocityHandle.x} ${velocityHandle.y})`}
                onPointerDown={beginDrag('velocity')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                data-testid="p02-velocity-handle"
              >
                <circle r={26} fill="transparent" data-testid="p02-velocity-handle-hit" />
                <circle r={13} className="handle-ring" style={{ stroke: displayParticle.color }} />
                <path d="M-4,-3L4,5M-4,5L4,-3" className="handle-grip" />
                <text x={18} y={4} className="svg-text svg-text-small" fill={displayParticle.color}>
                  拖我改方向
                </text>
              </g>
            </>
          ) : null}

          <g transform={`translate(20 ${Math.max(50, size.height - 24)})`} aria-hidden="true">
            <line x1={0} y1={0} x2={scaleBarWidth} y2={0} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={scaleBarWidth} y1={-4} x2={scaleBarWidth} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <text x={scaleBarWidth + 8} y={4} className="svg-text svg-text-small" fill="var(--ink-muted)">
              {formatLength(scaleBarStep)}
            </text>
          </g>
        </svg>

        <div className="stage-hud" aria-hidden="true">
          <span className="hud-chip hud-field">
            <span className="hud-glyph">{fieldOut ? '⊙' : '×'}</span>
            B {field.fieldMag === 0 ? '= 0' : `${fieldOut ? '出纸面' : '入纸面'} · ${formatNumber(field.fieldMag, 2)} T`}
          </span>
          <span className="hud-chip">粒子 {particles.length}/5 · 选中 {selectedDisplay?.label ?? '—'}</span>
          <span className="hud-chip hud-chip-quiet">
            {selectedTau === null ? '未发射' : `τ = ${formatTime(selectedTau)}`}
          </span>
        </div>

        {conditionNotice ? (
          <div
            className={`condition-notice condition-notice-${conditionNotice.tone}`}
            data-testid="p02-condition-notice"
            role="status"
            aria-live="polite"
          >
            {conditionNotice.text}
          </div>
        ) : null}

        {!conditionNotice && stageMode === 'interact' ? (
          <div className="stage-drag-hint">
            选中粒子的手柄可编辑 · 其他粒子继续运动 · 双指缩放
          </div>
        ) : null}
      </div>
      <StageLegend
        items={[
          { label: '彩色实线 / 虚线 = 各自已走轨迹', color: 'var(--trajectory)', variant: 'solid' },
          { label: '细虚线 = 完整预测轨迹', color: 'var(--preview)', variant: 'dashed' },
          { label: '粒子标记 = A–E', color: 'var(--positive)', variant: 'dot' },
          { label: '磁场 B（⊙ 出 / × 入）', color: 'var(--field)', variant: 'field' },
        ]}
      />
    </div>
  );
}
