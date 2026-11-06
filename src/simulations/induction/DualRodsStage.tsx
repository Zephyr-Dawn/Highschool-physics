import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatNumber, formatSI } from '../../lib/format';
import { clamp } from '../../physics/core/vec2';
import type { DualRodParams, DualRodSnapshot } from '../../physics/induction/dualRodCoupling';
import type { I06Layers } from './i06Scene';

interface DualRodsStageProps {
  params: DualRodParams;
  snapshot: DualRodSnapshot;
  history: DualRodSnapshot[];
  layers: I06Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  initialDragEnabled: boolean;
  manualEnabled: boolean;
  manualDragging: boolean;
  onInitialChange: (rod: 1 | 2, xM: number) => void;
  onManualStart: (rod: 1 | 2, xM: number) => void;
  onManualChange: (xM: number) => void;
  onManualEnd: () => void;
  onManualCancel: () => void;
}

function fieldGlyphs(
  toScreen: (point: { x: number; y: number }) => { x: number; y: number },
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  step: number,
): Array<{ x: number; y: number }> {
  const items: Array<{ x: number; y: number }> = [];
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      items.push(toScreen({ x, y }));
      if (items.length > 360) return items;
    }
  }
  return items;
}

export function DualRodsStage({
  params,
  snapshot,
  history,
  layers,
  stageMode,
  onStageModeChange,
  initialDragEnabled,
  manualEnabled,
  manualDragging,
  onInitialChange,
  onManualStart,
  onManualChange,
  onManualEnd,
  onManualCancel,
}: DualRodsStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 900, height: 520 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [interacting, setInteracting] = useState(false);
  const drag = useRef<{ pointerId: number; rod: 1 | 2; grabX: number; startX: number } | null>(null);
  const lastFit = useRef<string | null>(null);
  const manualMode = params.mode === 'manual-rod1' || params.mode === 'manual-rod2';
  const draggedRod: 1 | 2 = params.mode === 'manual-rod2' ? 2 : 1;
  const clampedRod: 1 | 2 = draggedRod === 1 ? 2 : 1;
  const allX = [params.x1M, params.x2M, snapshot.rod1.x, snapshot.rod2.x, ...history.flatMap((item) => [item.rod1.x, item.rod2.x])];
  const bounds = useMemo<StageBounds>(() => {
    const minX = Math.min(...allX) - 0.4;
    const maxX = Math.max(...allX) + 0.4;
    const halfY = Math.max(params.lengthM * 0.85, 0.25);
    return { minX, minY: -halfY, maxX, maxY: halfY };
  }, [allX, params.lengthM]);
  const fitSignature = `${params.x1M}|${params.x2M}|${params.lengthM}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;
  useEffect(() => {
    if (interacting || lastFit.current === fitSignature) return;
    lastFit.current = fitSignature;
    fitBounds(bounds, 40);
  }, [bounds, fitBounds, fitSignature, interacting]);
  const fitNow = () => {
    lastFit.current = fitSignature;
    fitBounds(bounds, 40);
  };

  const railTop = toScreen({ x: 0, y: params.lengthM });
  const railBottom = toScreen({ x: 0, y: 0 });
  const rod1Top = toScreen({ x: snapshot.rod1.x, y: params.lengthM });
  const rod1Bottom = toScreen({ x: snapshot.rod1.x, y: 0 });
  const rod2Top = toScreen({ x: snapshot.rod2.x, y: params.lengthM });
  const rod2Bottom = toScreen({ x: snapshot.rod2.x, y: 0 });
  const rodW = 7;
  const currentPositive = snapshot.currentA > 1e-12;
  const hasCurrent = Math.abs(snapshot.currentA) > 1e-12 && params.circuitClosed;
  const loopTop = Math.min(railTop.y, railBottom.y);
  const loopBottom = Math.max(railTop.y, railBottom.y);
  const loopLeft = rod1Top.x;
  const loopRight = rod2Top.x;
  const midY = (loopTop + loopBottom) / 2;
  const midX = (loopLeft + loopRight) / 2;
  const arrowHalf = Math.min(20, Math.abs(loopRight - loopLeft) / 5, Math.abs(loopBottom - loopTop) / 5);

  const currentArrows = useMemo(() => {
    if (!hasCurrent) return [];
    // Positive current is CCW: bottom rail left→right, right rod up,
    // top rail right→left, left rod down.
    if (currentPositive) {
      return [
        { x1: loopLeft, y1: loopBottom, x2: loopLeft + arrowHalf * 2, y2: loopBottom },
        { x1: loopRight, y1: loopBottom - arrowHalf, x2: loopRight, y2: loopBottom - arrowHalf * 2 },
        { x1: loopRight, y1: loopTop, x2: loopRight - arrowHalf * 2, y2: loopTop },
        { x1: loopLeft, y1: loopTop + arrowHalf, x2: loopLeft, y2: loopTop + arrowHalf * 2 },
      ];
    }
    return [
      { x1: loopRight, y1: loopBottom, x2: loopRight - arrowHalf * 2, y2: loopBottom },
      { x1: loopRight, y1: loopTop + arrowHalf, x2: loopRight, y2: loopTop + arrowHalf * 2 },
      { x1: loopLeft, y1: loopTop, x2: loopLeft + arrowHalf * 2, y2: loopTop },
      { x1: loopLeft, y1: loopBottom - arrowHalf, x2: loopLeft, y2: loopBottom - arrowHalf * 2 },
    ];
  }, [arrowHalf, currentPositive, hasCurrent, loopBottom, loopLeft, loopRight, loopTop]);

  const fieldStep = Math.max(0.05, 70 / Math.max(1, view.scale));
  const glyphs = useMemo(() => {
    if (!layers.field || Math.abs(params.BzTesla) <= 1e-15) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    return fieldGlyphs(
      toScreen,
      Math.min(topLeft.x, bottomRight.x),
      Math.max(topLeft.x, bottomRight.x),
      Math.min(topLeft.y, bottomRight.y),
      Math.max(topLeft.y, bottomRight.y),
      fieldStep,
    );
  }, [fieldStep, layers.field, params.BzTesla, size.height, size.width, toScreen, toWorld]);

  const beginDrag = (rod: 1 | 2) => (event: React.PointerEvent<SVGRectElement>) => {
    if (stageMode !== 'interact') return;
    if (manualMode) {
      if (rod !== draggedRod) return;
      if (!manualEnabled) return;
    } else if (!initialDragEnabled) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    drag.current = {
      pointerId: event.pointerId,
      rod,
      grabX: world.x,
      startX: rod === 1 ? snapshot.rod1.x : snapshot.rod2.x,
    };
    setInteracting(true);
    if (manualMode) onManualStart(rod, rod === 1 ? snapshot.rod1.x : snapshot.rod2.x);
  };

  const moveDrag = (event: React.PointerEvent<SVGRectElement>) => {
    const item = drag.current;
    if (!item || item.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const next = clamp(item.startX + (world.x - item.grabX), -1e6, 1e6);
    if (manualMode) onManualChange(next);
    else onInitialChange(item.rod, next);
  };

  const endDrag = (event: React.PointerEvent<SVGRectElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setInteracting(false);
    if (manualMode) onManualEnd();
  };

  const cancelDrag = (event: React.PointerEvent<SVGRectElement>) => {
    if (!drag.current) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setInteracting(false);
    if (manualMode) onManualCancel();
  };

  const forceLength = (force: number) => clamp(24, 92, 28 + Math.min(60, Math.abs(force) * 14));
  const force1Direction = (snapshot.forceRod1N ?? 0) >= 0 ? 1 : -1;
  const force2Direction = (snapshot.forceRod2N ?? 0) >= 0 ? 1 : -1;
  const velocityLength = (v: number) => clamp(24, 88, 26 + Math.min(56, Math.abs(v) * 18));
  const showAnswers = !layers.maskAnswers;

  return (
    <div className="stage-card">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
      />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="i06-stage"
        data-mode={params.mode}
        data-x1={snapshot.rod1.x}
        data-x2={snapshot.rod2.x}
        data-v1={snapshot.rod1.v}
        data-v2={snapshot.rod2.v}
        data-emf={snapshot.emfTotalV}
        data-current={snapshot.currentA}
        data-force1={snapshot.forceRod1N}
        data-force2={snapshot.forceRod2N}
        data-separation={snapshot.separationM}
        data-status={snapshot.status}
        data-contact={snapshot.status === 'contact-stop'}
        data-clamped-rod={manualMode ? clampedRod : ''}
        data-manual-dragging={manualDragging}
        data-history-count={history.length}
        data-relative-v={snapshot.relativeVelocityMS}
        data-vcm={snapshot.centerOfMassVelocityMS}
        data-momentum={snapshot.totalMomentumKgMS}
        data-kinetic={snapshot.kineticEnergyJ}
        data-heat={snapshot.jouleHeatJ}
        data-ext-work={snapshot.externalWorkJ}
        data-residual={snapshot.energyResidualJ ?? ""}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`双导体棒。x₁=${formatNumber(snapshot.rod1.x, 3)} m，x₂=${formatNumber(snapshot.rod2.x, 3)} m；总电动势 ${formatSI(snapshot.emfTotalV, 'V')}；电流 ${formatSI(snapshot.currentA, 'A')}。`}
          data-testid="i06-stage-svg"
          {...stageHandlers}
          onPointerDownCapture={(event) => {
            if (drag.current && event.pointerId !== drag.current.pointerId) {
              event.stopPropagation();
              drag.current = null;
              setInteracting(false);
              if (manualMode) onManualCancel();
            }
          }}
        >
          <defs>
            <marker id="i06-current-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--current)" />
            </marker>
            <marker id="i06-force-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" />
            </marker>
            <marker id="i06-velocity-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" />
            </marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />
          {layers.field ? (
            <g data-testid="i06-field-glyphs" aria-hidden="true">
              {glyphs.map((item, index) => (
                <g key={index} transform={`translate(${item.x} ${item.y})`} stroke="var(--field)" fill="none" opacity={0.3 + Math.min(0.35, Math.abs(params.BzTesla) / 10)}>
                  <circle r="3.2" />
                  {params.BzTesla >= 0 ? <circle r="0.9" fill="var(--field)" stroke="none" /> : <path d="M-2,-2L2,2M2,-2L-2,2" strokeWidth="1" />}
                </g>
              ))}
            </g>
          ) : null}
          {layers.flux ? (
            <rect
              data-testid="i06-flux-area"
              x={loopLeft}
              y={loopTop}
              width={Math.max(0, loopRight - loopLeft)}
              height={loopBottom - loopTop}
              fill="rgba(124,58,237,.10)"
              stroke="var(--flux)"
              strokeWidth="1"
              strokeDasharray="4 4"
              aria-hidden="true"
            />
          ) : null}
          <line x1={-10000} x2={10000} y1={railTop.y} y2={railTop.y} stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
          <line x1={-10000} x2={10000} y1={railBottom.y} y2={railBottom.y} stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
          <line x1={loopLeft} x2={loopRight} y1={loopTop} y2={loopTop} stroke={hasCurrent ? 'var(--current)' : 'var(--ink-muted)'} strokeWidth={3} strokeDasharray={params.circuitClosed ? undefined : '8 6'} />
          <line x1={loopLeft} x2={loopRight} y1={loopBottom} y2={loopBottom} stroke={hasCurrent ? 'var(--current)' : 'var(--ink-muted)'} strokeWidth={3} strokeDasharray={params.circuitClosed ? undefined : '8 6'} />
          {layers.current && hasCurrent && !layers.maskAnswers ? (
            <g data-testid="i06-current-arrows" markerEnd="url(#i06-current-arrow)" stroke="var(--current)" strokeWidth="2.2" fill="none">
              {currentArrows.map((arrow, index) => (
                <line key={index} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} />
              ))}
            </g>
          ) : null}
          {[1, 2].map((rodNumber) => {
            const rod = rodNumber === 1 ? snapshot.rod1 : snapshot.rod2;
            const top = rodNumber === 1 ? rod1Top : rod2Top;
            const bottom = rodNumber === 1 ? rod1Bottom : rod2Bottom;
            const isClamped = manualMode && rodNumber === clampedRod;
            const color = rodNumber === 1 ? 'var(--velocity)' : 'var(--accent)';
            return (
              <g key={rodNumber} data-testid={`i06-rod-${rodNumber}`} data-x={rod.x} data-v={rod.v}>
                <line
                  x1={top.x}
                  x2={bottom.x}
                  y1={top.y}
                  y2={bottom.y}
                  stroke={isClamped ? 'var(--ink-muted)' : 'var(--current)'}
                  strokeWidth={rodW}
                  strokeLinecap="round"
                />
                <line x1={top.x} x2={bottom.x} y1={top.y} y2={bottom.y} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
                <text x={top.x - 12} y={loopTop - 12} textAnchor="end" className="svg-text svg-text-small" fill={color}>
                  杆 {rodNumber}{isClamped ? ' · 夹持' : ''}
                </text>
                {layers.velocity && Math.abs(rod.v) > 1e-12 ? (
                  <g markerEnd="url(#i06-velocity-arrow)" stroke={color} strokeWidth="2.6">
                    <line x1={top.x} y1={loopBottom + 26} x2={top.x + Math.sign(rod.v) * velocityLength(rod.v)} y2={loopBottom + 26} />
                    <text x={top.x} y={loopBottom + 44} textAnchor="middle" className="svg-text svg-text-small" fill={color}>v{rodNumber} {formatNumber(rod.v, 2)} m/s</text>
                  </g>
                ) : null}
                {layers.force && Math.abs(rodNumber === 1 ? snapshot.forceRod1N : snapshot.forceRod2N) > 1e-12 && showAnswers ? (
                  <g markerEnd="url(#i06-force-arrow)" stroke="var(--force)" strokeWidth="2.6">
                    <line
                      x1={top.x}
                      y1={midY - 20}
                      x2={top.x + (rodNumber === 1 ? force1Direction : force2Direction) * forceLength(rodNumber === 1 ? snapshot.forceRod1N : snapshot.forceRod2N)}
                      y2={midY - 20}
                    />
                    <text x={top.x + 12} y={midY - 36} textAnchor="start" className="svg-text svg-text-small" fill="var(--force)">
                      F{rodNumber} {formatNumber(rodNumber === 1 ? snapshot.forceRod1N : snapshot.forceRod2N, 2)} N
                    </text>
                  </g>
                ) : null}
                <rect
                  data-testid={`i06-rod-${rodNumber}-hit`}
                  x={top.x - 22}
                  y={loopTop - 22}
                  width={44}
                  height={loopBottom - loopTop + 44}
                  fill="transparent"
                  style={{ touchAction: 'none', cursor: manualMode ? (rodNumber === draggedRod ? 'grab' : 'not-allowed') : initialDragEnabled ? 'ew-resize' : 'not-allowed' }}
                  onPointerDown={beginDrag(rodNumber as 1 | 2)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onLostPointerCapture={cancelDrag}
                  aria-label={`拖动杆 ${rodNumber}`}
                />
              </g>
            );
          })}
          <text x={midX} y={loopTop - 30} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">
            d = {snapshot.status === 'contact-stop' ? '0' : formatNumber(snapshot.separationM, 3)} m · Δv = {formatNumber(snapshot.relativeVelocityMS, 3)} m/s
          </text>
          {!params.circuitClosed ? (
            <text x={midX} y={loopBottom + 64} textAnchor="middle" className="svg-text svg-text-small" fill="var(--current)">开路：EMF 存在，I = F_B = Q_J = 0</text>
          ) : null}
          {snapshot.status === 'contact-stop' ? (
            <g data-testid="i06-contact-marker">
              <line x1={loopLeft} x2={loopRight} y1={midY} y2={midY} stroke="var(--force)" strokeWidth={2} strokeDasharray="4 4" />
              <text x={midX} y={loopBottom + 84} textAnchor="middle" className="svg-text svg-text-small" fill="var(--force)">接触停止 · 不模拟碰撞</text>
            </g>
          ) : null}
          <text x={16} y={size.height - 12} className="svg-text svg-text-small" fill="var(--ink-muted)">
            {manualMode
              ? manualEnabled
                ? `拖动杆 ${draggedRod}；杆 ${clampedRod} 由外部夹持固定`
                : `先按播放，再拖动杆 ${draggedRod}`
              : initialDragEnabled
                ? '拖动任一杆修改初始位置（会重置 t=0）'
                : '初态手柄在暂停或 t=0 时可拖动'}
          </text>
        </svg>
        <div className="i05-stage-status" data-testid="i06-stage-status">
          <strong>
            {layers.maskAnswers
              ? '答案已遮蔽：先预测电流方向、两杆受力与速度趋同'
              : `ε₁ ${formatSI(snapshot.emfRod1V, 'V')} · ε₂ ${formatSI(snapshot.emfRod2V, 'V')} · ε ${formatSI(snapshot.emfTotalV, 'V')} · I ${formatSI(snapshot.currentA, 'A')}`}
          </strong>
          <span>{snapshot.status === 'open-circuit' ? '开路' : snapshot.status === 'contact-stop' ? '接触停止' : `p = ${formatNumber(snapshot.totalMomentumKgMS, 2)} kg·m/s`}</span>
        </div>
      </div>
      <StageLegend
        items={[
          { color: 'var(--field)', label: '匀强 B' },
          { color: 'var(--flux)', label: '回路面积' },
          { color: 'var(--current)', label: '同一回路电流' },
          { color: 'var(--velocity)', label: 'v₁ / v₂' },
          { color: 'var(--force)', label: 'F_B1 / F_B2' },
        ]}
      />
    </div>
  );
}
