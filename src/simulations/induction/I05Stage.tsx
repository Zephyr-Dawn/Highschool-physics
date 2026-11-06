import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatNumber, formatSI } from '../../lib/format';
import { clamp } from '../../physics/core/vec2';
import type { I05Snapshot, I05Solution } from '../../physics/induction/movingLoopTimeField';
import type { I05Layers } from './i05Scene';

interface I05StageProps {
  params: {
    mode: string;
    widthM: number;
    heightM: number;
    fieldLeftM: number;
    fieldRightM: number;
    circuitClosed: boolean;
    startXM: number;
  };
  snapshot: I05Snapshot;
  solution: I05Solution;
  layers: I05Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  initialDragEnabled: boolean;
  manualEnabled: boolean;
  manualDragging: boolean;
  onInitialLoopChange: (xM: number) => void;
  onManualStart: (xM: number) => void;
  onManualChange: (xM: number) => void;
  onManualEnd: () => void;
  onManualCancel: () => void;
  onManualBTarget: (target: number) => void;
  bTarget: number;
}

const B_TRACK_MIN = -10;
const B_TRACK_MAX = 10;

function fieldGlyphs(
  toScreen: (point: { x: number; y: number }) => { x: number; y: number },
  a: number,
  b: number,
  minY: number,
  maxY: number,
  step: number,
): Array<{ x: number; y: number }> {
  const items: Array<{ x: number; y: number }> = [];
  const startX = Math.ceil(a / step) * step;
  const startY = Math.ceil(minY / step) * step;
  for (let x = startX; x <= b; x += step) {
    for (let y = startY; y <= maxY; y += step) {
      items.push(toScreen({ x, y }));
      if (items.length > 320) return items;
    }
  }
  return items;
}

export function I05Stage({
  params,
  snapshot,
  solution,
  layers,
  stageMode,
  onStageModeChange,
  initialDragEnabled,
  manualEnabled,
  manualDragging,
  onInitialLoopChange,
  onManualStart,
  onManualChange,
  onManualEnd,
  onManualCancel,
  onManualBTarget,
  bTarget,
}: I05StageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 900, height: 520 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [interacting, setInteracting] = useState(false);
  const loopDrag = useRef<{ pointerId: number; grabX: number; startX: number } | null>(null);
  const bDrag = useRef<{ pointerId: number; startY: number; startTarget: number } | null>(null);
  const lastFit = useRef<string | null>(null);
  const lastBTargetAt = useRef(0);

  const manualMode = params.mode === 'manual-x';
  const bManualMode = params.mode === 'manual-b';
  const historyXs = solution.samples.map((sample) => sample.xM);
  const bounds = useMemo<StageBounds>(() => {
    const xs = [params.fieldLeftM, params.fieldRightM, params.startXM, snapshot.xM, ...historyXs];
    const minX = Math.min(...xs) - 0.25;
    const maxX = Math.max(...xs.map((x) => x + params.widthM)) + 0.25;
    const halfY = Math.max(params.heightM * 0.9, 0.25);
    return { minX, minY: -halfY, maxX, maxY: halfY };
  }, [historyXs, params.fieldLeftM, params.fieldRightM, params.heightM, params.startXM, params.widthM, snapshot.xM]);
  const fitSignature = `${params.fieldLeftM}|${params.fieldRightM}|${params.widthM}|${params.heightM}|${params.startXM}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

  useEffect(() => {
    if (interacting || lastFit.current === fitSignature) return;
    lastFit.current = fitSignature;
    fitBounds(bounds, 38);
  }, [bounds, fitBounds, fitSignature, interacting]);

  const fitNow = () => {
    lastFit.current = fitSignature;
    fitBounds(bounds, 38);
  };

  const loopTopLeft = toScreen({ x: snapshot.xM, y: params.heightM / 2 });
  const loopBottomRight = toScreen({ x: snapshot.xM + params.widthM, y: -params.heightM / 2 });
  const loopX = Math.min(loopTopLeft.x, loopBottomRight.x);
  const loopY = Math.min(loopTopLeft.y, loopBottomRight.y);
  const loopW = Math.abs(loopBottomRight.x - loopTopLeft.x);
  const loopH = Math.abs(loopBottomRight.y - loopTopLeft.y);
  const loopCenterX = loopX + loopW / 2;
  const loopCenterY = loopY + loopH / 2;
  const fieldLeftScreen = toScreen({ x: params.fieldLeftM, y: 0 }).x;
  const fieldRightScreen = toScreen({ x: params.fieldRightM, y: 0 }).x;
  const overlapLeft = Math.max(snapshot.xM, params.fieldLeftM);
  const overlapRight = Math.min(snapshot.xM + params.widthM, params.fieldRightM);
  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const overlapScreenLeft = toScreen({ x: overlapLeft, y: 0 }).x;
  const overlapScreenRight = toScreen({ x: overlapRight, y: 0 }).x;
  const hasOverlap = overlapWidth > 1e-9;
  const hasCurrent = snapshot.currentA !== null && Math.abs(snapshot.currentA) > 1e-12 && params.circuitClosed;
  const showAnswers = !layers.maskAnswers;
  const currentPositive = (snapshot.currentA ?? 0) > 0;
  const currentColor = 'var(--current)';
  const arrowHalf = Math.min(18, loopW / 5, loopH / 5);

  const currentArrows = useMemo(() => {
    if (!hasCurrent) return [];
    const topY = loopY;
    const bottomY = loopY + loopH;
    const leftX = loopX;
    const rightX = loopX + loopW;
    const midX = loopCenterX;
    const midY = loopCenterY;
    if (currentPositive) {
      // CCW: top left, left down, bottom right, right up.
      return [
        { x1: midX + arrowHalf, y1: topY, x2: midX - arrowHalf, y2: topY },
        { x1: leftX, y1: midY + arrowHalf, x2: leftX, y2: midY - arrowHalf },
        { x1: midX - arrowHalf, y1: bottomY, x2: midX + arrowHalf, y2: bottomY },
        { x1: rightX, y1: midY - arrowHalf, x2: rightX, y2: midY + arrowHalf },
      ];
    }
    return [
      { x1: midX - arrowHalf, y1: topY, x2: midX + arrowHalf, y2: topY },
      { x1: leftX, y1: midY - arrowHalf, x2: leftX, y2: midY + arrowHalf },
      { x1: midX + arrowHalf, y1: bottomY, x2: midX - arrowHalf, y2: bottomY },
      { x1: rightX, y1: midY + arrowHalf, x2: rightX, y2: midY - arrowHalf },
    ];
  }, [arrowHalf, currentPositive, hasCurrent, loopCenterX, loopCenterY, loopH, loopW, loopX, loopY]);

  const fieldStep = Math.max(0.05, 66 / Math.max(1, view.scale));
  const glyphs = useMemo(() => {
    if (!layers.field || Math.abs(snapshot.Bz) <= 1e-15) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    return fieldGlyphs(
      toScreen,
      params.fieldLeftM,
      params.fieldRightM,
      minY,
      maxY,
      fieldStep,
    );
  }, [fieldStep, layers.field, params.fieldLeftM, params.fieldRightM, size.height, size.width, snapshot.Bz, toScreen, toWorld]);

  const ghosts = useMemo(() => {
    if (!layers.overlap || solution.samples.length < 2) return [];
    const result: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (let index = 1; index <= 4; index++) {
      const time = snapshot.timeS * (1 - index / 5);
      if (time < 0) continue;
      let nearest = solution.samples[0];
      for (const sample of solution.samples) {
        if (sample.timeS <= time) nearest = sample;
        else break;
      }
      const p1 = toScreen({ x: nearest.xM, y: params.heightM / 2 });
      const p2 = toScreen({ x: nearest.xM + params.widthM, y: -params.heightM / 2 });
      result.push({
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        w: Math.abs(p2.x - p1.x),
        h: Math.abs(p2.y - p1.y),
      });
    }
    return result;
  }, [layers.overlap, params.heightM, params.widthM, snapshot.timeS, solution.samples, toScreen]);

  const forceBaseSide = snapshot.overlapSlope === 1
    ? 'right'
    : snapshot.overlapSlope === -1
      ? 'left'
      : null;
  const forceBaseX = forceBaseSide === 'right' ? loopX + loopW : forceBaseSide === 'left' ? loopX : loopCenterX;
  const forceArrowLength = clamp(24, 92, 30 + Math.min(60, Math.abs(snapshot.magneticForceX ?? 0) * 16));
  const velocityArrowLength = clamp(24, 92, 26 + Math.min(58, Math.abs(snapshot.velocityMps) * 22));
  const bTrackX = size.width - 34;
  const bTrackTop = 64;
  const bTrackBottom = size.height - 62;
  const bTrackY = (value: number) => bTrackBottom - ((value - B_TRACK_MIN) / (B_TRACK_MAX - B_TRACK_MIN)) * (bTrackBottom - bTrackTop);

  const eventScreenXs = [
    { label: 'a', x: fieldLeftScreen, id: 'a' },
    { label: 'b', x: fieldRightScreen, id: 'b' },
  ];

  const startManual = (event: React.PointerEvent<SVGRectElement>) => {
    if (!manualMode || !manualEnabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    loopDrag.current = { pointerId: event.pointerId, grabX: world.x, startX: snapshot.xM };
    setInteracting(true);
    onManualStart(snapshot.xM);
  };

  const moveManual = (event: React.PointerEvent<SVGRectElement>) => {
    const drag = loopDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    onManualChange(drag.startX + (world.x - drag.grabX));
  };

  const endManual = (event: React.PointerEvent<SVGRectElement>) => {
    if (loopDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    loopDrag.current = null;
    setInteracting(false);
    onManualEnd();
  };

  const cancelManual = (event: React.PointerEvent<SVGRectElement>) => {
    if (!loopDrag.current) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    loopDrag.current = null;
    setInteracting(false);
    onManualCancel();
  };

  const startInitial = (event: React.PointerEvent<SVGRectElement>) => {
    if (manualMode || !initialDragEnabled || stageMode !== 'interact') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    loopDrag.current = { pointerId: event.pointerId, grabX: world.x, startX: params.startXM };
    setInteracting(true);
  };

  const moveInitial = (event: React.PointerEvent<SVGRectElement>) => {
    const drag = loopDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || manualMode) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    onInitialLoopChange(clamp(drag.startX + (world.x - drag.grabX), -1e6, 1e6));
  };

  const endInitial = (event: React.PointerEvent<SVGRectElement>) => {
    if (loopDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    loopDrag.current = null;
    setInteracting(false);
  };

  const startB = (event: React.PointerEvent<SVGRectElement>) => {
    if (!bManualMode || !manualEnabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    bDrag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTarget: bTarget,
    };
    setInteracting(true);
  };

  const moveB = (event: React.PointerEvent<SVGRectElement>) => {
    const drag = bDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const now = performance.now();
    if (now - lastBTargetAt.current < 45) return;
    lastBTargetAt.current = now;
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const range = B_TRACK_MAX - B_TRACK_MIN;
    const value = B_TRACK_MIN + ((bTrackBottom - world.y) / (bTrackBottom - bTrackTop)) * range;
    onManualBTarget(clamp(value, B_TRACK_MIN, B_TRACK_MAX));
  };

  const endB = (event: React.PointerEvent<SVGRectElement>) => {
    if (bDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    bDrag.current = null;
    setInteracting(false);
  };

  const statusText = !params.circuitClosed
    ? '开路：EMF 存在，I = F_B = P_J = 0'
    : snapshot.emfTotalV === null
      ? '折点：瞬时 EMF 无唯一值'
      : `ε_t ${formatSI(snapshot.emfTransformerV ?? 0, 'V')} · ε_m ${formatSI(snapshot.emfMotionalV ?? 0, 'V')} · ε ${formatSI(snapshot.emfTotalV, 'V')}`;

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
        data-testid="i05-stage"
        data-view-scale={view.scale.toFixed(3)}
        data-mode={params.mode}
        data-x={snapshot.xM}
        data-v={snapshot.velocityMps}
        data-bz={snapshot.Bz}
        data-emf-total={snapshot.emfTotalV ?? ''}
        data-emf-transformer={snapshot.emfTransformerV ?? ''}
        data-emf-motional={snapshot.emfMotionalV ?? ''}
        data-current={snapshot.currentA ?? ''}
        data-force={snapshot.magneticForceX ?? ''}
        data-overlap={snapshot.overlapLengthM}
        data-status={snapshot.status}
        data-manual-dragging={manualDragging}
        data-history-count={solution.samples.length}
        data-b-target={bTarget}
        data-kinetic={snapshot.kineticEnergyJ}
        data-heat={snapshot.jouleHeatJ}
        data-ext-work={snapshot.externalWorkJ}
        data-source-work={snapshot.transformerSourceWorkJ}
        data-residual={snapshot.energyResidualJ ?? ""}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`时变磁场运动线框。位置 ${formatNumber(snapshot.xM, 3)} m；总电动势 ${snapshot.emfTotalV === null ? '不可用' : formatSI(snapshot.emfTotalV, 'V')}；电流 ${snapshot.currentA === null ? '不可用' : formatSI(snapshot.currentA, 'A')}。`}
          data-testid="i05-stage-svg"
          {...stageHandlers}
          onPointerDownCapture={(event) => {
            if (loopDrag.current && event.pointerId !== loopDrag.current.pointerId) {
              event.stopPropagation();
              loopDrag.current = null;
              setInteracting(false);
              onManualCancel();
            }
            if (bDrag.current && event.pointerId !== bDrag.current.pointerId) {
              event.stopPropagation();
              bDrag.current = null;
              setInteracting(false);
            }
          }}
        >
          <defs>
            <marker id="i05-current-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill={currentColor} />
            </marker>
            <marker id="i05-velocity-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" />
            </marker>
            <marker id="i05-force-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" />
            </marker>
            <linearGradient id="i05-field-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--field-soft)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--field-soft)" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />
          <rect
            x={Math.min(fieldLeftScreen, fieldRightScreen)}
            y={0}
            width={Math.abs(fieldRightScreen - fieldLeftScreen)}
            height={size.height}
            fill="url(#i05-field-fill)"
            aria-hidden="true"
          />
          {eventScreenXs.map((item) => (
            <g key={item.id}>
              <line x1={item.x} x2={item.x} y1={0} y2={size.height} stroke="var(--field)" strokeWidth={1.5} strokeDasharray="8 6" opacity={0.75} />
              <text x={item.x + 5} y={18} className="svg-text svg-text-small" fill="var(--field)">{item.label}</text>
            </g>
          ))}
          {layers.field ? (
            <g data-testid="i05-field-glyphs" aria-hidden="true">
              {glyphs.map((item, index) => (
                <g key={index} transform={`translate(${item.x} ${item.y})`} stroke="var(--field)" fill="none" opacity={0.4 + Math.min(0.35, Math.abs(snapshot.Bz) / 20)}>
                  <circle r="3.2" />
                  {snapshot.Bz >= 0 ? <circle r="0.9" fill="var(--field)" stroke="none" /> : <path d="M-2,-2L2,2M2,-2L-2,2" strokeWidth="1" />}
                </g>
              ))}
            </g>
          ) : null}
          {hasOverlap && layers.overlap ? (
            <rect
              data-testid="i05-overlap"
              x={Math.min(overlapScreenLeft, overlapScreenRight)}
              y={loopY}
              width={Math.abs(overlapScreenRight - overlapScreenLeft)}
              height={loopH}
              fill="rgba(124,58,237,.22)"
              stroke="var(--flux)"
              strokeWidth="1.2"
              strokeDasharray="4 4"
              aria-hidden="true"
            />
          ) : null}
          {layers.overlap
            ? ghosts.map((ghost, index) => (
                <rect key={index} x={ghost.x} y={ghost.y} width={ghost.w} height={ghost.h} fill="none" stroke="var(--ink-faint)" strokeWidth="1" strokeDasharray="3 5" opacity={0.18 + index * 0.05} aria-hidden="true" />
              ))
            : null}
          {!params.circuitClosed ? (
            <g aria-hidden="true">
              <line x1={loopX} y1={loopY} x2={loopX} y2={loopY + loopH} stroke="var(--current)" strokeWidth="3" />
              <line x1={loopX} y1={loopY + loopH} x2={loopX + loopW} y2={loopY + loopH} stroke="var(--current)" strokeWidth="3" />
              <line x1={loopX + loopW} y1={loopY + loopH} x2={loopX + loopW} y2={loopY} stroke="var(--current)" strokeWidth="3" />
              <line x1={loopX} y1={loopY} x2={loopCenterX - 18} y2={loopY} stroke="var(--current)" strokeWidth="3" />
              <line x1={loopCenterX + 18} y1={loopY} x2={loopX + loopW} y2={loopY} stroke="var(--current)" strokeWidth="3" />
              <text x={loopCenterX} y={loopCenterY + 4} textAnchor="middle" className="svg-text svg-text-small" fill="var(--current)">开路间隙 · I = 0</text>
            </g>
          ) : (
            <rect data-testid="i05-loop" x={loopX} y={loopY} width={loopW} height={loopH} fill="rgba(180,83,9,.04)" stroke="var(--current)" strokeWidth="3.2" rx="2" />
          )}
          {layers.current && hasCurrent && showAnswers ? (
            <g data-testid="i05-current-arrows" markerEnd="url(#i05-current-arrow)" stroke={currentColor} strokeWidth="2.2" fill="none" aria-hidden="true">
              {currentArrows.map((arrow, index) => (
                <line key={index} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} />
              ))}
            </g>
          ) : null}
          {layers.emfDecomposition && showAnswers ? (
            <g className="i05-emf-labels">
              <text x={loopX} y={loopY - 26} className="svg-text svg-text-small" fill="var(--emf)">ε_t {snapshot.emfTransformerV === null ? '—' : formatSI(snapshot.emfTransformerV, 'V')}</text>
              <text x={loopX} y={loopY - 12} className="svg-text svg-text-small" fill="var(--velocity)">ε_m {snapshot.emfMotionalV === null ? '—' : formatSI(snapshot.emfMotionalV, 'V')}</text>
            </g>
          ) : null}
          {layers.velocity ? (
            <g data-testid="i05-velocity-arrow" markerEnd="url(#i05-velocity-arrow)" stroke="var(--velocity)" strokeWidth="3" aria-hidden="true">
              <line
                x1={loopCenterX - Math.sign(snapshot.velocityMps || 1) * 8}
                y1={loopY + loopH + 18}
                x2={loopCenterX + Math.sign(snapshot.velocityMps || 1) * velocityArrowLength}
                y2={loopY + loopH + 18}
              />
              <text x={loopCenterX} y={loopY + loopH + 36} textAnchor="middle" className="svg-text svg-text-small" fill="var(--velocity)">vx {formatNumber(snapshot.velocityMps, 3)} m/s</text>
            </g>
          ) : null}
          {layers.force && showAnswers && Math.abs(snapshot.magneticForceX ?? 0) > 1e-12 ? (
            <g data-testid="i05-force-arrow" markerEnd="url(#i05-force-arrow)" stroke="var(--force)" strokeWidth="3" aria-hidden="true">
              <line
                x1={forceBaseX}
                y1={loopCenterY - 18}
                x2={forceBaseX + Math.sign(snapshot.magneticForceX ?? 1) * forceArrowLength}
                y2={loopCenterY - 18}
              />
              <text x={forceBaseX} y={loopCenterY - 34} textAnchor="middle" className="svg-text svg-text-small" fill="var(--force)">F_Bx {formatSI(snapshot.magneticForceX ?? 0, 'N')}</text>
            </g>
          ) : null}
          {layers.energy ? (
            <g>
              <text x={size.width - 150} y={size.height - 18} className="svg-text svg-text-small" fill="var(--ink-muted)">
                K {formatSI(snapshot.kineticEnergyJ, 'J')} · Q_J {formatSI(snapshot.jouleHeatJ, 'J')}
              </text>
            </g>
          ) : null}
          <rect
            data-testid={manualMode ? 'i05-manual-handle-hit' : 'i05-start-handle-hit'}
            x={loopX - 22}
            y={loopY - 22}
            width={loopW + 44}
            height={loopH + 44}
            fill="transparent"
            style={{ touchAction: 'none', cursor: manualMode ? 'grab' : initialDragEnabled ? 'ew-resize' : 'not-allowed' }}
            onPointerDown={manualMode ? startManual : startInitial}
            onPointerMove={manualMode ? moveManual : moveInitial}
            onPointerUp={manualMode ? endManual : endInitial}
            onPointerCancel={manualMode ? cancelManual : endInitial}
            onLostPointerCapture={manualMode ? cancelManual : endInitial}
            aria-label={manualMode ? '拖动线框（单指）；第二指取消' : '拖动线框初始位置'}
          />
          {bManualMode ? (
            <g data-testid="i05-b-track">
              <line x1={bTrackX} x2={bTrackX} y1={bTrackTop} y2={bTrackBottom} stroke="var(--field)" strokeWidth={2} />
              <line x1={bTrackX - 7} x2={bTrackX + 7} y1={bTrackTop} y2={bTrackTop} stroke="var(--field)" />
              <line x1={bTrackX - 7} x2={bTrackX + 7} y1={bTrackBottom} y2={bTrackBottom} stroke="var(--field)" />
              <text x={bTrackX + 12} y={bTrackTop + 4} className="svg-text svg-text-small" fill="var(--field)">+10 T</text>
              <text x={bTrackX + 12} y={bTrackBottom + 4} className="svg-text svg-text-small" fill="var(--field)">−10 T</text>
              <rect
                data-testid="i05-b-handle-hit"
                x={bTrackX - 22}
                y={bTrackY(snapshot.Bz) - 22}
                width={44}
                height={44}
                fill="transparent"
                style={{ touchAction: 'none', cursor: manualEnabled ? 'ns-resize' : 'not-allowed' }}
                onPointerDown={startB}
                onPointerMove={moveB}
                onPointerUp={endB}
                onPointerCancel={endB}
                onLostPointerCapture={endB}
                aria-label="拖动实时目标磁场"
              />
              <circle cx={bTrackX} cy={bTrackY(snapshot.Bz)} r={9} fill="var(--surface)" stroke="var(--field)" strokeWidth={3} />
              <text x={bTrackX - 16} y={bTrackY(snapshot.Bz) - 12} textAnchor="end" className="svg-text svg-text-small" fill="var(--field)">
                B {formatNumber(snapshot.Bz, 2)} T
              </text>
            </g>
          ) : null}
          <text x={16} y={size.height - 12} className="svg-text svg-text-small" fill="var(--ink-muted)">
            {manualMode
              ? manualEnabled
                ? '单指拖动线框；第二指取消；松手后线框由外部保持静止'
                : '先按播放，再拖动线框'
              : initialDragEnabled
                ? '可拖动线框修改初始位置（会重置 t=0）'
                : '初态手柄在暂停或 t=0 时可拖动'}
          </text>
        </svg>
        {layers.events ? (
          <div className="i05-stage-status" data-testid="i05-stage-status">
            <strong>{showAnswers ? statusText : '答案已遮蔽：先预测电流方向与 ε_t / ε_m 符号'}</strong>
            <span>{snapshot.status === 'at-boundary' ? '边界单侧斜率' : snapshot.slopeOneSided ? '当前为单侧导数' : '平滑段'}</span>
          </div>
        ) : null}
      </div>
      <StageLegend
        items={[
          { color: 'var(--field)', label: '磁场条带' },
          { color: 'var(--flux)', label: '有效重叠面积' },
          { color: 'var(--current)', label: '感应电流' },
          { color: 'var(--velocity)', label: '速度 / 动生 EMF' },
          { color: 'var(--force)', label: '磁场力' },
        ]}
      />
    </div>
  );
}
