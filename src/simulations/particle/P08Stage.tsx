import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatNumber, formatSI } from '../../lib/format';
import { clamp, type Vec2 } from '../../physics/core/vec2';
import type { CrossedFieldState } from '../../physics/particles/crossedFields';
import type {
  ConstraintSolution,
  TargetSegment,
} from '../../physics/particles/fieldConstraintEvents';
import type { ParticleInitialState } from '../../physics/particles/multiParticle';
import type { P08Field, P08Layers } from './p08Scene';

export interface P08TrajectoryPoint {
  timeS: number;
  position: Vec2;
}

export interface P08EvaluatedParticle {
  particle: ParticleInitialState;
  tau: number | null;
  state: CrossedFieldState | null;
  solution: ConstraintSolution;
  trajectory: P08TrajectoryPoint[];
}

interface P08StageProps {
  field: P08Field;
  target: TargetSegment;
  evaluated: P08EvaluatedParticle[];
  selectedId: string;
  layers: P08Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  onSelectParticle: (id: string) => void;
  onTargetChange: (patch: Partial<TargetSegment>) => void;
  onTargetDragCancel: () => void;
  conditionNotice: string | null;
}

const E_COLOR = '#0f766e';
const B_COLOR = '#7e22ce';

type DragKind = 'line' | 'min' | 'max';

function fieldGlyphs(
  toScreen: (point: Vec2) => Vec2,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  step: number,
): Vec2[] {
  const items: Vec2[] = [];
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      items.push(toScreen({ x, y }));
      if (items.length > 240) return items;
    }
  }
  return items;
}

function arrow(x1: number, y1: number, x2: number, y2: number, color: string, marker: string, width = 2) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} markerEnd={`url(#${marker})`} />;
}

export function P08Stage({
  field,
  target,
  evaluated,
  selectedId,
  layers,
  stageMode,
  onStageModeChange,
  onSelectParticle,
  onTargetChange,
  onTargetDragCancel,
  conditionNotice,
}: P08StageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 900, height: 520 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [interacting, setInteracting] = useState(false);
  const drag = useRef<{ pointerId: number; kind: DragKind; offset: number } | null>(null);
  const lastFit = useRef<string | null>(null);

  const bounds = useMemo<StageBounds>(() => {
    const xs: number[] = [0, target.coordinate];
    const ys: number[] = [0, target.coordinate];
    if (target.orientation === 'vertical') {
      ys.push(target.min, target.max);
    } else {
      xs.push(target.min, target.max);
    }
    for (const item of evaluated) {
      for (const point of item.trajectory) {
        xs.push(point.position.x);
        ys.push(point.position.y);
      }
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX: minX - Math.max(0.4, (maxX - minX) * 0.12),
      maxX: maxX + Math.max(0.4, (maxX - minX) * 0.12),
      minY: minY - Math.max(0.4, (maxY - minY) * 0.15),
      maxY: maxY + Math.max(0.4, (maxY - minY) * 0.15),
    };
  }, [evaluated, target]);

  const particleSignature = evaluated.map((item) => `${item.particle.id}:${item.particle.position.x},${item.particle.position.y},${item.particle.velocity.x},${item.particle.velocity.y},${item.particle.chargeC},${item.particle.massKg}`).join('|');
  const fitSignature = `${particleSignature}|${field.Ex}|${field.Ey}|${field.Bz}|${target.orientation}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

  useEffect(() => {
    if (interacting || lastFit.current === fitSignature) return;
    lastFit.current = fitSignature;
    fitBounds(bounds, 42);
  }, [bounds, fitBounds, fitSignature, interacting]);

  const fitNow = () => {
    lastFit.current = fitSignature;
    fitBounds(bounds, 42);
  };

  const selected = evaluated.find((item) => item.particle.id === selectedId) ?? evaluated[0] ?? null;
  const selectedState = selected?.state ?? null;

  const viewTopLeft = toWorld({ x: 0, y: 0 });
  const viewBottomRight = toWorld({ x: size.width, y: size.height });
  const minVisibleX = Math.min(viewTopLeft.x, viewBottomRight.x);
  const maxVisibleX = Math.max(viewTopLeft.x, viewBottomRight.x);
  const minVisibleY = Math.min(viewTopLeft.y, viewBottomRight.y);
  const maxVisibleY = Math.max(viewTopLeft.y, viewBottomRight.y);
  const glyphStep = Math.max(0.1, 70 / Math.max(1, view.scale));
  const glyphs = useMemo(
    () => fieldGlyphs(toScreen, minVisibleX, maxVisibleX, minVisibleY, maxVisibleY, glyphStep),
    [glyphStep, maxVisibleX, maxVisibleY, minVisibleX, minVisibleY, toScreen],
  );

  const targetStart = target.orientation === 'vertical'
    ? toScreen({ x: target.coordinate, y: target.min })
    : toScreen({ x: target.min, y: target.coordinate });
  const targetEnd = target.orientation === 'vertical'
    ? toScreen({ x: target.coordinate, y: target.max })
    : toScreen({ x: target.max, y: target.coordinate });
  const targetCenter = { x: (targetStart.x + targetEnd.x) / 2, y: (targetStart.y + targetEnd.y) / 2 };
  const targetLength = Math.hypot(targetEnd.x - targetStart.x, targetEnd.y - targetStart.y);
  const targetHitWidth = 44;

  const startDrag = (kind: DragKind) => (event: React.PointerEvent<SVGElement>) => {
    if (stageMode !== 'interact') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    drag.current = {
      pointerId: event.pointerId,
      kind,
      offset: target.orientation === 'vertical'
        ? world.x - target.coordinate
        : world.y - target.coordinate,
    };
    setInteracting(true);
  };

  const moveDrag = (event: React.PointerEvent<SVGElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (target.orientation === 'vertical') {
      if (active.kind === 'line') {
        onTargetChange({ coordinate: clamp(world.x - active.offset, -1e4, 1e4) });
      } else if (active.kind === 'min') {
        onTargetChange({ min: Math.min(world.y, target.max - 1e-6) });
      } else {
        onTargetChange({ max: Math.max(world.y, target.min + 1e-6) });
      }
    } else if (active.kind === 'line') {
      onTargetChange({ coordinate: clamp(world.y - active.offset, -1e4, 1e4) });
    } else if (active.kind === 'min') {
      onTargetChange({ min: Math.min(world.x, target.max - 1e-6) });
    } else {
      onTargetChange({ max: Math.max(world.x, target.min + 1e-6) });
    }
  };

  const endDrag = (event: React.PointerEvent<SVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setInteracting(false);
  };

  const cancelDrag = () => {
    drag.current = null;
    setInteracting(false);
    onTargetDragCancel();
  };

  const handleCaptureDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current && drag.current.pointerId !== event.pointerId) {
      cancelDrag();
    }
  };

  const stageHandlersWithCancel = {
    ...stageHandlers,
    onPointerDownCapture: handleCaptureDown,
  };

  const forceScale = 58;
  const maxForce = selectedState
    ? Math.max(1e-9, selectedState.forceE.x ** 2 + selectedState.forceE.y ** 2,
      selectedState.forceB.x ** 2 + selectedState.forceB.y ** 2,
      selectedState.force.x ** 2 + selectedState.force.y ** 2)
    : 1;
  const scaleForce = forceScale / Math.sqrt(maxForce);

  return (
    <div className="stage-card p08-stage-card" ref={ref} data-testid="p08-stage">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.22)}
        onZoomOut={() => zoomBy(1 / 1.22)}
        extra={<span className="stage-status-pill">拖动目标线段只重评约束，不重置粒子轨迹</span>}
      />
      <div className="stage-wrap">
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          data-testid="p08-stage-svg"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label="P08 复合场目标约束舞台"
          {...stageHandlersWithCancel}
        >
          <defs>
            <marker id="p08-arrow-e" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={E_COLOR} />
            </marker>
            <marker id="p08-arrow-force" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--force)" />
            </marker>
            <marker id="p08-arrow-velocity" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--velocity)" />
            </marker>
            <marker id="p08-arrow-target" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--warning)" />
            </marker>
          </defs>
          <rect x={0} y={0} width={size.width} height={size.height} fill="var(--surface-2)" />

          {layers.fieldE ? (
            <g opacity={0.55}>
              {glyphs.map((point, index) => {
                const magnitude = Math.hypot(field.Ex, field.Ey);
                if (magnitude <= 1e-12) return null;
                const ux = field.Ex / magnitude;
                const uy = field.Ey / magnitude;
                return (
                  <g key={`e-${index}`}>
                    {arrow(
                      point.x - ux * 7,
                      point.y + uy * 7,
                      point.x + ux * 7,
                      point.y - uy * 7,
                      E_COLOR,
                      'p08-arrow-e',
                      1.3,
                    )}
                  </g>
                );
              })}
              <text x={16} y={24} className="stage-label" fill={E_COLOR}>
                E = ({formatNumber(field.Ex, 2)}, {formatNumber(field.Ey, 2)}) V/m
              </text>
            </g>
          ) : null}

          {layers.fieldB ? (
            <g>
              {Math.abs(field.Bz) > 1e-12
                ? glyphs.filter((_, index) => index % 3 === 0).map((point, index) => (
                    <text key={`b-${index}`} x={point.x} y={point.y} textAnchor="middle" className="field-glyph" fill={B_COLOR}>
                      {field.Bz > 0 ? '⊙' : '×'}
                    </text>
                  ))
                : null}
              <text x={16} y={42} className="stage-label" fill={B_COLOR}>
                Bz = {formatNumber(field.Bz, 3)} T {field.Bz > 0 ? '⊙' : field.Bz < 0 ? '×' : ''}
              </text>
            </g>
          ) : null}

          {layers.predicted
            ? evaluated.filter((item) => item.particle.visible).map((item) => {
                const path = item.trajectory
                  .map((point, index) => {
                    const screen = toScreen(point.position);
                    return `${index === 0 ? 'M' : 'L'}${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <path
                    key={`pred-${item.particle.id}`}
                    d={path}
                    fill="none"
                    stroke={item.particle.color}
                    strokeWidth={1.2}
                    strokeDasharray="4 4"
                    opacity={0.45}
                    data-testid={`p08-predicted-${item.particle.label}`}
                  />
                );
              })
            : null}

          {layers.trail
            ? evaluated.filter((item) => item.particle.visible).map((item) => {
                if (item.tau === null) return null;
                const trail = item.trajectory.filter((point) => point.timeS <= item.tau! + 1e-9);
                if (trail.length < 2) return null;
                const path = trail
                  .map((point, index) => {
                    const screen = toScreen(point.position);
                    return `${index === 0 ? 'M' : 'L'}${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <path
                    key={`trail-${item.particle.id}`}
                    d={path}
                    fill="none"
                    stroke={item.particle.color}
                    strokeWidth={item.particle.id === selectedId ? 2.6 : 1.8}
                    data-testid={`p08-trail-${item.particle.label}`}
                  />
                );
              })
            : null}

          {layers.events
            ? evaluated.map((item) =>
                item.solution.events
                  .filter((event) => event.timeS <= (item.tau ?? 0) + 1e-9)
                  .map((event, index) => {
                    const point = toScreen(event.position);
                    const isTangent = event.kind === 'tangent-touch';
                    if (isTangent && !layers.accepted) return null;
                    return (
                      <g key={`ev-${item.particle.id}-${index}`} data-testid={isTangent ? 'p08-tangent-marker' : 'p08-event-marker'}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={isTangent ? 6 : 4.5}
                          fill={event.accepted ? 'var(--success)' : isTangent ? 'var(--warning)' : 'var(--danger)'}
                          stroke="var(--surface)"
                          strokeWidth={1.4}
                        />
                        <text x={point.x + 8} y={point.y - 6} className="stage-label">
                          {isTangent ? '相切' : event.accepted ? '穿越' : event.flags.includes('wrong-direction') ? '方向不符' : event.flags.includes('outside-window') ? '超时' : event.flags.includes('outside-segment') ? '线外' : '交点'}
                        </text>
                      </g>
                    );
                  }),
              )
            : null}

          {layers.target ? (
            <g data-testid="p08-target-line">
              <line
                x1={targetStart.x}
                y1={targetStart.y}
                x2={targetEnd.x}
                y2={targetEnd.y}
                stroke="var(--warning)"
                strokeWidth={4}
                strokeDasharray="8 5"
              />
              <text x={targetCenter.x + 10} y={targetCenter.y - 8} className="stage-label">
                目标 {target.orientation === 'vertical' ? `x=${formatNumber(target.coordinate, 2)} m` : `y=${formatNumber(target.coordinate, 2)} m`}
              </text>
              {stageMode === 'interact' ? (
                <>
                  <rect
                    x={target.orientation === 'vertical' ? targetCenter.x - targetHitWidth / 2 : Math.min(targetStart.x, targetEnd.x) - 10}
                    y={target.orientation === 'vertical' ? Math.min(targetStart.y, targetEnd.y) - 10 : targetCenter.y - targetHitWidth / 2}
                    width={target.orientation === 'vertical' ? targetHitWidth : Math.max(20, targetLength + 20)}
                    height={target.orientation === 'vertical' ? Math.max(20, targetLength + 20) : targetHitWidth}
                    fill="transparent"
                    style={{ cursor: 'grab' }}
                    data-testid="p08-target-hit"
                    onPointerDown={startDrag('line')}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={cancelDrag}
                  />
                  <circle cx={targetStart.x} cy={targetStart.y} r={22} fill="transparent" data-testid="p08-target-end-min" onPointerDown={startDrag('min')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} />
                  <circle cx={targetStart.x} cy={targetStart.y} r={9} fill="var(--warning)" opacity={0.9} pointerEvents="none" />
                  <circle cx={targetEnd.x} cy={targetEnd.y} r={22} fill="transparent" data-testid="p08-target-end-max" onPointerDown={startDrag('max')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} />
                  <circle cx={targetEnd.x} cy={targetEnd.y} r={9} fill="var(--warning)" opacity={0.9} pointerEvents="none" />
                </>
              ) : null}
              <text x={targetCenter.x + 10} y={targetCenter.y + 14} className="stage-label">
                窗口 {formatNumber(target.min, 2)} … {formatNumber(target.max, 2)}
              </text>
            </g>
          ) : null}

          {evaluated.filter((item) => item.particle.visible).map((item) => {
            if (!item.state) return null;
            const point = toScreen(item.state.position);
            return (
              <g
                key={`particle-${item.particle.id}`}
                data-testid={`p08-particle-${item.particle.label}`}
                data-x={item.state.position.x.toFixed(9)}
                data-y={item.state.position.y.toFixed(9)}
                data-vx={item.state.velocity.x.toFixed(9)}
                data-vy={item.state.velocity.y.toFixed(9)}
                data-status={item.solution.status}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectParticle(item.particle.id);
                }}
              >
                <circle cx={point.x} cy={point.y} r={item.particle.id === selectedId ? 12 : 9} fill={item.particle.color} opacity={0.18} />
                <circle cx={point.x} cy={point.y} r={item.particle.id === selectedId ? 7 : 5.5} fill={item.particle.color} stroke="var(--surface)" strokeWidth={2} />
                <text x={point.x + 10} y={point.y - 8} className="stage-label" fill={item.particle.color}>
                  {item.particle.label}
                </text>
                {layers.velocity ? arrow(
                  point.x,
                  point.y,
                  point.x + item.state.velocity.x * 16,
                  point.y - item.state.velocity.y * 16,
                  item.particle.color,
                  'p08-arrow-velocity',
                  1.8,
                ) : null}
              </g>
            );
          })}

          {layers.force && selectedState ? (() => {
            const point = toScreen(selectedState.position);
            return (
              <g data-testid="p08-force-vectors">
                {arrow(point.x, point.y, point.x + selectedState.forceE.x * scaleForce, point.y - selectedState.forceE.y * scaleForce, E_COLOR, 'p08-arrow-force', 2)}
                {arrow(point.x, point.y, point.x + selectedState.forceB.x * scaleForce, point.y - selectedState.forceB.y * scaleForce, B_COLOR, 'p08-arrow-force', 2)}
                {arrow(point.x, point.y, point.x + selectedState.force.x * scaleForce, point.y - selectedState.force.y * scaleForce, 'var(--force)', 'p08-arrow-force', 2.6)}
              </g>
            );
          })() : null}

          {layers.aux && selectedState ? (() => {
            const point = toScreen(selectedState.position);
            const normal = target.orientation === 'vertical'
              ? { x: toScreen({ x: target.coordinate, y: selectedState.position.y }).x, y: point.y }
              : { x: point.x, y: toScreen({ x: selectedState.position.x, y: target.coordinate }).y };
            return (
              <g>
                <line x1={point.x} y1={point.y} x2={normal.x} y2={normal.y} stroke="var(--ink-muted)" strokeDasharray="3 3" />
                <text x={(point.x + normal.x) / 2} y={(point.y + normal.y) / 2 - 6} textAnchor="middle" className="stage-label">
                  法向距离
                </text>
              </g>
            );
          })() : null}
        </svg>

        {conditionNotice ? (
          <div className="stage-condition-notice" role="status" data-testid="p08-condition-notice">
            {conditionNotice}
          </div>
        ) : null}

        <div className="p08-hud">
          <div><span>场</span><strong>E=({formatNumber(field.Ex, 2)}, {formatNumber(field.Ey, 2)}) · Bz={formatNumber(field.Bz, 2)}</strong></div>
          <div><span>时间窗</span><strong>{formatNumber(target.coordinate, 2)} · {formatNumber(target.min, 2)}…{formatNumber(target.max, 2)}</strong></div>
          <div><span>选中状态</span><strong data-testid="p08-selected-status">{selected?.solution.status ?? '—'}</strong></div>
          <div><span>速度</span><strong>{selectedState ? `${formatNumber(selectedState.speed, 3)} m/s` : '未发射'}</strong></div>
          <div><span>目标距离</span><strong>{selectedState ? formatSI(
            target.orientation === 'vertical'
              ? Math.abs(selectedState.position.x - target.coordinate)
              : Math.abs(selectedState.position.y - target.coordinate),
            'm',
            3,
          ) : '—'}</strong></div>
        </div>

        <StageLegend
          items={[
            { color: E_COLOR, label: '电场 E' },
            { color: B_COLOR, label: '磁场 Bz' },
            { color: 'var(--warning)', label: '目标线段 / 相切' },
            { color: 'var(--success)', label: '已接受穿越' },
            { color: 'var(--danger)', label: '未接受交点' },
            { color: 'var(--velocity)', label: '速度' },
            { color: 'var(--force)', label: '合力' },
          ]}
        />
      </div>
    </div>
  );
}
