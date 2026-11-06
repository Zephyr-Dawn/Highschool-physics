import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { rodStateAt, type RodSnapshot, type RodSolution } from '../../physics/induction/movingRod';
import { clamp } from '../../physics/core/vec2';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatForce, formatSI, formatTime } from '../../lib/format';
import type { I02Params } from './movingRodParams';

export interface I02Layers {
  field: boolean;
  flux: boolean;
  current: boolean;
  vectors: boolean;
  ghosts: boolean;
  normal: boolean;
  power: boolean;
  energy: boolean;
}

export const I02_DEFAULT_LAYERS: I02Layers = {
  field: true,
  flux: true,
  current: true,
  vectors: true,
  ghosts: true,
  normal: true,
  power: true,
  energy: true,
};

const NICE_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
const MANUAL_MIN_X = 0.02;

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

interface MovingRodStageProps {
  solution: RodSolution;
  snapshot: RodSnapshot;
  params: I02Params;
  layers: I02Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  initialDragging: boolean;
  onInitialDragStart: () => void;
  onInitialDragChange: (xM: number) => void;
  onInitialDragEnd: () => void;
  onInitialDragCancel: () => void;
  manualMode: boolean;
  manualDragging: boolean;
  manualResetToken: string;
  manualHistory: readonly RodSnapshot[];
  manualNotice: string | null;
  onManualStart: (xM: number) => void;
  onManualMove: (xM: number) => void;
  onManualEnd: () => void;
  onManualCancel: () => void;
}

export function MovingRodStage({
  solution,
  snapshot,
  params,
  layers,
  stageMode,
  onStageModeChange,
  initialDragging,
  onInitialDragStart,
  onInitialDragChange,
  onInitialDragEnd,
  onInitialDragCancel,
  manualMode,
  manualDragging,
  manualResetToken,
  manualHistory,
  manualNotice,
  onManualStart,
  onManualMove,
  onManualEnd,
  onManualCancel,
}: MovingRodStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 820, height: 500 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [interacting, setInteracting] = useState(false);
  const lastFitSignature = useRef<string | null>(null);
  const manualDrag = useRef<{ pointerId: number; grabWorldX: number; startX: number } | null>(null);
  const initialDrag = useRef<{ pointerId: number; grabWorldX: number; startX: number } | null>(null);

  const seriesMaxX = useMemo(() => {
    if (manualMode) return params.startXM + 5;
    return solution.samples.reduce((max, sample) => Math.max(max, sample.xM), params.startXM);
  }, [manualMode, params.startXM, solution.samples]);

  const bounds = useMemo<StageBounds>(() => {
    const halfY = Math.max(params.lengthM * 0.86, 0.42);
    return {
      minX: -0.18,
      minY: -halfY,
      maxX: Math.max(seriesMaxX, snapshot.xM, params.startXM) + 0.45,
      maxY: halfY,
    };
  }, [params.lengthM, params.startXM, seriesMaxX, snapshot.xM]);
  const fitSignature = `${params.mode}|${params.startXM}|${params.lengthM}|${seriesMaxX.toFixed(3)}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

  useEffect(() => {
    if (interacting) return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 42);
  }, [bounds, fitBounds, fitSignature, interacting]);

  const fitNow = () => {
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 42);
  };

  useEffect(() => {
    if (!manualDrag.current) return;
    manualDrag.current = null;
    setInteracting(false);
  }, [manualResetToken]);

  useEffect(() => {
    if (!manualDragging && manualDrag.current) {
      manualDrag.current = null;
      setInteracting(false);
    }
  }, [manualDragging]);

  const topRailY = params.lengthM / 2;
  const bottomRailY = -params.lengthM / 2;
  const railLeft = toScreen({ x: 0, y: 0 });
  const railRight = toScreen({ x: Math.max(bounds.maxX, snapshot.xM + 1), y: 0 });
  const topY = toScreen({ x: 0, y: topRailY }).y;
  const bottomY = toScreen({ x: 0, y: bottomRailY }).y;
  const rodX = toScreen({ x: snapshot.xM, y: 0 }).x;
  const resistorX = railLeft.x;
  const middleY = (topY + bottomY) / 2;
  const loopWidthPx = Math.max(0, rodX - resistorX);
  const railStartX = Math.max(0, Math.min(resistorX, railRight.x) - 8);
  const railEndX = Math.min(size.width, Math.max(rodX + 80, railRight.x));

  const fieldOut = params.BzSign > 0;
  const fieldStep = niceStep(64 / view.scale);
  const fieldGlyphs = useMemo(() => {
    if (!layers.field || params.BzMagnitudeT === 0) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    const items: Array<{ x: number; y: number }> = [];
    const startX = Math.ceil(minX / fieldStep) * fieldStep;
    const startY = Math.ceil(minY / fieldStep) * fieldStep;
    for (let x = startX; x <= maxX; x += fieldStep) {
      for (let y = startY; y <= maxY; y += fieldStep) {
        items.push(toScreen({ x, y }));
        if (items.length > 360) return items;
      }
    }
    return items;
  }, [fieldStep, layers.field, params.BzMagnitudeT, size.height, size.width, toScreen, toWorld]);

  const ghostXs = useMemo(() => {
    if (!layers.ghosts) return [];
    if (manualMode) {
      const past = manualHistory.filter((point) => point.tS < snapshot.tS - 1e-9);
      if (past.length === 0) return [];
      const count = Math.min(7, past.length);
      const stride = Math.max(1, Math.floor(past.length / count));
      return past
        .filter((_, index) => index % stride === 0)
        .slice(-count)
        .map((point) => point.xM)
        .filter((x, index, array) => x > MANUAL_MIN_X && array.indexOf(x) === index);
    }
    if (snapshot.tS <= 0.03) return [];
    const values: number[] = [];
    for (const fraction of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      const past = rodStateAt(solution, snapshot.tS * fraction);
      if (past.xM > 0.005) values.push(past.xM);
    }
    return values;
  }, [layers.ghosts, manualHistory, manualMode, snapshot.tS, solution]);

  const maxSpeed = useMemo(
    () =>
      Math.max(
        1e-9,
        manualMode
          ? manualHistory.reduce((max, point) => Math.max(max, Math.abs(point.velocityMps)), Math.abs(snapshot.velocityMps))
          : solution.samples.reduce((max, point) => Math.max(max, Math.abs(point.velocityMps)), Math.abs(snapshot.velocityMps)),
      ),
    [manualHistory, manualMode, snapshot.velocityMps, solution.samples],
  );
  const maxForce = useMemo(
    () =>
      Math.max(
        1e-9,
        manualMode
          ? manualHistory.reduce((max, point) => Math.max(max, Math.abs(point.magneticForceXN)), Math.abs(snapshot.magneticForceXN))
          : solution.samples.reduce((max, point) => Math.max(max, Math.abs(point.magneticForceXN)), Math.abs(snapshot.magneticForceXN)),
      ),
    [manualHistory, manualMode, snapshot.magneticForceXN, solution.samples],
  );

  const velocityLength = 24 + Math.min(1, Math.abs(snapshot.velocityMps) / maxSpeed) * 62;
  const forceLength = 20 + Math.min(1, Math.abs(snapshot.magneticForceXN) / maxForce) * 50;
  const externalForce = snapshot.externalForceN;
  const externalLength =
    externalForce === null ? 0 : 20 + Math.min(1, Math.abs(externalForce) / Math.max(1e-9, Math.abs(snapshot.externalForceN ?? 0))) * 46;
  const hasCurrent = Math.abs(snapshot.currentA) > 1e-10 && params.circuitClosed;
  const currentUp = snapshot.currentA > 0;
  const hasBoundary = snapshot.status === 'boundary-stop';
  const startHandleY = Math.min(size.height - 26, bottomY + 36);
  const startMarkerVisible = Math.abs(snapshot.xM - params.startXM) > 1e-7 || initialDragging;
  const startXScreen = toScreen({ x: params.startXM, y: 0 }).x;

  const pointerWorldX = (event: ReactPointerEvent<SVGGElement>): number | null => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return null;
    return toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }).x;
  };

  const cancelManual = () => {
    const drag = manualDrag.current;
    if (!drag) return;
    manualDrag.current = null;
    setInteracting(false);
    onManualCancel();
  };

  const beginManual = (event: ReactPointerEvent<SVGGElement>) => {
    if (!manualMode || stageMode !== 'interact') return;
    if (manualDrag.current) {
      if (event.pointerId !== manualDrag.current.pointerId) cancelManual();
      return;
    }
    event.stopPropagation();
    const worldX = pointerWorldX(event);
    if (worldX === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    manualDrag.current = {
      pointerId: event.pointerId,
      grabWorldX: worldX,
      startX: snapshot.xM,
    };
    setInteracting(true);
    onManualStart(snapshot.xM);
  };

  const moveManual = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = manualDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const worldX = pointerWorldX(event);
    if (worldX === null) return;
    const next = clamp(drag.startX + (worldX - drag.grabWorldX), MANUAL_MIN_X, Math.max(MANUAL_MIN_X + 0.1, bounds.maxX - 0.05));
    onManualMove(next);
  };

  const endManual = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = manualDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    manualDrag.current = null;
    setInteracting(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onManualEnd();
  };

  const beginInitial = (event: ReactPointerEvent<SVGGElement>) => {
    if (manualMode || stageMode !== 'interact') return;
    if (initialDrag.current) {
      if (event.pointerId !== initialDrag.current.pointerId) {
        event.currentTarget.releasePointerCapture?.(initialDrag.current.pointerId);
        initialDrag.current = null;
        setInteracting(false);
        onInitialDragCancel();
      }
      return;
    }
    event.stopPropagation();
    const worldX = pointerWorldX(event);
    if (worldX === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    initialDrag.current = { pointerId: event.pointerId, grabWorldX: worldX, startX: params.startXM };
    setInteracting(true);
    onInitialDragStart();
  };

  const moveInitial = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = initialDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const worldX = pointerWorldX(event);
    if (worldX === null) return;
    const next = clamp(drag.startX + (worldX - drag.grabWorldX), 0.05, Math.max(0.2, bounds.maxX - 0.2));
    onInitialDragChange(next);
  };

  const endInitial = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = initialDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    initialDrag.current = null;
    setInteracting(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onInitialDragEnd();
  };

  const cancelInitial = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = initialDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    initialDrag.current = null;
    setInteracting(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onInitialDragCancel();
  };

  const handleStagePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (manualDrag.current && event.pointerId !== manualDrag.current.pointerId) {
      cancelManual();
    }
    if (initialDrag.current && event.pointerId !== initialDrag.current.pointerId) {
      initialDrag.current = null;
      setInteracting(false);
      onInitialDragCancel();
    }
    stageHandlers.onPointerDown(event);
  };

  const powerText =
    params.mode === 'manual-drag'
      ? `手势功率积分 Q_J ≈ ${formatSI(snapshot.jouleHeatJ ?? 0, 'J')}`
      : params.circuitClosed
        ? `P_ext ${formatSI(snapshot.externalPowerW ?? 0, 'W')} · P_J ${formatSI(snapshot.joulePowerW, 'W')} · P_B = −P_J`
        : '开路：I=0，P_J=0，ε 仍由 BLv 给出';
  const energyText =
    params.mode === 'manual-drag'
      ? '手势模式：不计算外力功与能量残差'
      : `K ${formatSI(snapshot.kineticEnergyJ, 'J')} · Q_J ${formatSI(snapshot.jouleHeatJ ?? 0, 'J')} · W_ext ${formatSI(snapshot.externalWorkJ ?? 0, 'J')}`;
  const statusLabel = hasBoundary
    ? '左端接触停止'
    : snapshot.status === 'rest'
      ? '静止'
      : manualMode
        ? '手势驱动（估算）'
        : '运动中';
  const manualCurrentRange = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const point of manualHistory) {
      min = Math.min(min, point.currentA);
      max = Math.max(max, point.currentA);
    }
    return { min, max };
  }, [manualHistory]);

  return (
    <div className="stage-card moving-rod-stage">
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
        data-testid="i02-stage"
        data-mode={params.mode}
        data-view-scale={view.scale.toFixed(3)}
        data-x={snapshot.xM}
        data-v={snapshot.velocityMps}
        data-emf={snapshot.emfV}
        data-current={snapshot.currentA}
        data-force={snapshot.magneticForceXN}
        data-power={snapshot.joulePowerW}
        data-heat={snapshot.jouleHeatJ ?? ''}
        data-time={snapshot.tS}
        data-status={snapshot.status}
        data-estimated={snapshot.estimated}
        data-manual-dragging={manualDragging}
        data-initial-dragging={initialDragging}
        data-history-count={manualHistory.length}
        data-history-min-current={manualCurrentRange.min}
        data-history-max-current={manualCurrentRange.max}
        data-boundary-time={solution.boundaryTimeS ?? ''}
        data-field={params.BzSign * params.BzMagnitudeT}
        data-circuit-closed={params.circuitClosed}
        data-start-x={params.startXM}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`单导体棒切割磁感线。${statusLabel}；电动势 ${formatSI(snapshot.emfV, 'V')}；电流 ${formatSI(snapshot.currentA, 'A')}；安培力 ${formatForce(snapshot.magneticForceXN)}。`}
          data-testid="i02-stage-svg"
          {...stageHandlers}
          onPointerDown={handleStagePointerDown}
        >
          <defs>
            <marker id="i02-current-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--current)" />
            </marker>
            <marker id="i02-velocity-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" />
            </marker>
            <marker id="i02-force-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" />
            </marker>
            <marker id="i02-external-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--navy-soft)" />
            </marker>
          </defs>

          <rect width={size.width} height={size.height} fill="transparent" />
          <rect
            x={Math.min(0, railStartX)}
            y={0}
            width={size.width}
            height={size.height}
            fill="var(--surface-2)"
            opacity={0.3}
            aria-hidden="true"
          />

          {fieldGlyphs.map((glyph, index) => (
            <g
              key={index}
              transform={`translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`}
              opacity={0.35}
              aria-hidden="true"
            >
              <circle r={6.2} fill="none" stroke="var(--field)" strokeWidth={1.1} />
              {fieldOut ? (
                <circle r={1.7} fill="var(--field)" />
              ) : (
                <path d="M-2.5,-2.5L2.5,2.5M2.5,-2.5L-2.5,2.5" stroke="var(--field)" strokeWidth={1.1} />
              )}
            </g>
          ))}

          {layers.flux && snapshot.xM > 0.005 ? (
            <rect
              x={resistorX}
              y={Math.min(topY, bottomY)}
              width={loopWidthPx}
              height={Math.abs(bottomY - topY)}
              fill="var(--flux-soft)"
              stroke="var(--flux)"
              strokeWidth={1.2}
              strokeDasharray="5 4"
              aria-hidden="true"
            />
          ) : null}

          {ghostXs.map((x, index) => (
            <line
              key={`${x}-${index}`}
              x1={toScreen({ x, y: 0 }).x}
              x2={toScreen({ x, y: 0 }).x}
              y1={topY}
              y2={bottomY}
              stroke="var(--ghost)"
              strokeWidth={2}
              strokeDasharray="5 5"
              opacity={0.18 + index * 0.05}
              aria-hidden="true"
            />
          ))}

          <g aria-hidden="true">
            <line x1={railStartX} x2={railEndX} y1={topY} y2={topY} stroke="var(--conductor)" strokeWidth={4} strokeLinecap="round" />
            <line x1={railStartX} x2={railEndX} y1={bottomY} y2={bottomY} stroke="var(--conductor)" strokeWidth={4} strokeLinecap="round" />
            <line x1={resistorX} x2={resistorX} y1={topY} y2={middleY - 28} stroke="var(--conductor)" strokeWidth={4} />
            <line x1={resistorX} x2={resistorX} y1={middleY + 28} y2={bottomY} stroke="var(--conductor)" strokeWidth={4} />
            <rect
              x={resistorX - 13}
              y={middleY - 28}
              width={26}
              height={56}
              rx={5}
              fill="var(--surface)"
              stroke={params.circuitClosed ? 'var(--conductor)' : 'var(--danger)'}
              strokeWidth={2.4}
              strokeDasharray={params.circuitClosed ? undefined : '6 5'}
            />
            <text x={resistorX} y={middleY + 4} textAnchor="middle" className="svg-text svg-text-small" fill="var(--conductor)">
              R
            </text>
            {!params.circuitClosed ? (
              <text
                x={resistorX}
                y={middleY + 48}
                textAnchor="middle"
                className="svg-text svg-text-small"
                fill="var(--danger)"
                data-testid="i02-open-circuit-label"
              >
                开路
              </text>
            ) : null}
          </g>

          {startMarkerVisible ? (
            <line
              x1={startXScreen}
              x2={startXScreen}
              y1={topY}
              y2={bottomY}
              stroke="var(--preview)"
              strokeWidth={2}
              strokeDasharray="6 5"
              opacity={0.7}
              aria-hidden="true"
              data-testid="i02-initial-preview"
            />
          ) : null}

          <g
            data-testid="i02-rod"
            transform={`translate(${rodX} 0)`}
            className={manualMode && stageMode === 'interact' ? 'moving-rod-drag-zone' : undefined}
          >
            <line
              x1={0}
              x2={0}
              y1={topY}
              y2={bottomY}
              stroke="var(--conductor)"
              strokeWidth={7}
              strokeLinecap="round"
              data-testid="i02-rod-line"
            />
            <line x1={0} x2={0} y1={topY + 3} y2={bottomY - 3} stroke="var(--conductor-light)" strokeWidth={1.6} opacity={0.8} />
            {manualMode && stageMode === 'interact' ? (
              <g
                data-testid="i02-rod-handle"
                onPointerDown={beginManual}
                onPointerMove={moveManual}
                onPointerUp={endManual}
                onPointerCancel={(event) => {
                  if (manualDrag.current?.pointerId === event.pointerId) cancelManual();
                }}
                onLostPointerCapture={() => {
                  if (manualDrag.current) cancelManual();
                }}
              >
                <rect
                  x={-23}
                  y={topY - 16}
                  width={46}
                  height={Math.max(56, bottomY - topY + 32)}
                  fill="transparent"
                  pointerEvents="all"
                />
                <rect x={-48} y={middleY - 19} width={96} height={38} rx={19} className="handle-pill" opacity={0.96} />
                <text x={0} y={middleY + 4} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">
                  ↔ 推拉导体棒
                </text>
              </g>
            ) : null}
          </g>

          {layers.current && hasCurrent ? (
            <g aria-hidden="true" data-testid="i02-current-arrow">
              <line
                x1={rodX + 12}
                x2={rodX + 12}
                y1={currentUp ? middleY + 34 : middleY - 34}
                y2={currentUp ? middleY - 34 : middleY + 34}
                stroke="var(--current)"
                strokeWidth={2.8}
                markerEnd="url(#i02-current-arrow)"
                strokeLinecap="round"
              />
              <text x={rodX + 22} y={middleY - 4} className="svg-text svg-text-small" fill="var(--current-strong)">
                I {currentUp ? '↑' : '↓'}
              </text>
            </g>
          ) : null}

          {layers.vectors && Math.abs(snapshot.velocityMps) > 1e-9 ? (
            <g aria-hidden="true">
              <line
                x1={rodX}
                y1={middleY + 26}
                x2={rodX + Math.sign(snapshot.velocityMps) * velocityLength}
                y2={middleY + 26}
                stroke="var(--velocity)"
                strokeWidth={3}
                markerEnd="url(#i02-velocity-arrow)"
                strokeLinecap="round"
              />
              <text
                x={rodX + Math.sign(snapshot.velocityMps) * (velocityLength + 20)}
                y={middleY + 30}
                textAnchor="middle"
                className="svg-text svg-text-small"
                fill="var(--velocity)"
              >
                v
              </text>
            </g>
          ) : null}

          {layers.vectors && Math.abs(snapshot.magneticForceXN) > 1e-9 ? (
            <g aria-hidden="true">
              <line
                x1={rodX}
                y1={middleY - 28}
                x2={rodX + Math.sign(snapshot.magneticForceXN) * forceLength}
                y2={middleY - 28}
                stroke="var(--force)"
                strokeWidth={2.8}
                strokeDasharray="6 4"
                markerEnd="url(#i02-force-arrow)"
                strokeLinecap="round"
              />
              <text
                x={rodX + Math.sign(snapshot.magneticForceXN) * (forceLength + 24)}
                y={middleY - 24}
                textAnchor="middle"
                className="svg-text svg-text-small"
                fill="var(--force)"
              >
                F安
              </text>
            </g>
          ) : null}

          {layers.vectors && externalForce !== null && Math.abs(externalForce) > 1e-9 ? (
            <g aria-hidden="true">
              <line
                x1={rodX}
                y1={middleY + 58}
                x2={rodX + Math.sign(externalForce) * externalLength}
                y2={middleY + 58}
                stroke="var(--navy-soft)"
                strokeWidth={2.6}
                strokeDasharray="3 4"
                markerEnd="url(#i02-external-arrow)"
                strokeLinecap="round"
              />
              <text
                x={rodX + Math.sign(externalForce) * (externalLength + 24)}
                y={middleY + 62}
                textAnchor="middle"
                className="svg-text svg-text-small"
                fill="var(--navy-soft)"
              >
                F外
              </text>
            </g>
          ) : null}

          {layers.normal ? (
            <g transform={`translate(${Math.max(resistorX + 28, Math.min(rodX - 28, resistorX + loopWidthPx / 2))} ${middleY})`} aria-hidden="true">
              <circle r={10} fill="var(--surface)" stroke="var(--field)" strokeWidth={1.3} opacity={0.9} />
              <circle r={2.2} fill="var(--field)" />
              <text x={14} y={4} className="svg-text svg-text-small" fill="var(--field)">
                +z 法线
              </text>
            </g>
          ) : null}

          {!manualMode && stageMode === 'interact' ? (
            <g
              transform={`translate(${startXScreen} ${startHandleY})`}
              className="stage-handle"
              data-testid="i02-start-handle"
              onPointerDown={beginInitial}
              onPointerMove={moveInitial}
              onPointerUp={endInitial}
              onPointerCancel={cancelInitial}
              onLostPointerCapture={() => {
                if (initialDrag.current) {
                  initialDrag.current = null;
                  setInteracting(false);
                  onInitialDragCancel();
                }
              }}
            >
              <rect x={-58} y={-21} width={116} height={42} rx={21} className="handle-pill" />
              <text x={0} y={4} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">
                拖动初始位置
              </text>
            </g>
          ) : null}

          <g transform={`translate(20 ${Math.max(48, size.height - 22)})`} aria-hidden="true">
            <line x1={0} y1={0} x2={niceStep(86 / view.scale) * view.scale} y2={0} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <line
              x1={niceStep(86 / view.scale) * view.scale}
              y1={-4}
              x2={niceStep(86 / view.scale) * view.scale}
              y2={4}
              stroke="var(--ink-muted)"
              strokeWidth={2}
            />
            <text x={niceStep(86 / view.scale) * view.scale + 7} y={4} className="svg-text svg-text-small" fill="var(--ink-muted)">
              {formatSI(niceStep(86 / view.scale), 'm')}
            </text>
          </g>
        </svg>

        <div className="stage-hud" aria-hidden="true">
          <span className="hud-chip hud-field">
            <span className="hud-glyph">{fieldOut ? '⊙' : '×'}</span>
            B {formatSI(params.BzMagnitudeT, 'T')} · {fieldOut ? '出纸面' : '入纸面'}
          </span>
          <span className={`hud-chip ${hasBoundary ? 'phase-chip' : ''}`}>{statusLabel}</span>
          <span className="hud-chip">{hasCurrent ? `I ${currentUp ? '向上 ↑' : '向下 ↓'}` : 'I = 0'}</span>
          <span className="hud-chip hud-chip-quiet">{formatSI(snapshot.velocityMps, 'm/s')}</span>
        </div>

        {layers.power ? (
          <div className="moving-rod-power-dock" data-testid="i02-power-dock">
            <span>功率流</span>
            <strong>{powerText}</strong>
          </div>
        ) : null}
        {layers.energy ? (
          <div className="moving-rod-energy-dock" data-testid="i02-energy-dock">
            <span>能量</span>
            <strong>{energyText}</strong>
          </div>
        ) : null}

        {manualMode ? (
          <div className="stage-drag-hint">
            {manualDragging
              ? '松手后规定运动停止；ε、I、F 由最近约 120 ms 的手势位置估计'
              : '直接拖动导体棒；拖动会继续当前实验时钟，不重置时间'}
          </div>
        ) : null}

        {snapshot.status === 'boundary-stop' ? (
          <div className="stage-alert" role="status" data-testid="i02-boundary-alert">
            导体棒到达左端 x = 0，外部接触使运动停止；接触耗散不计入焦耳热。
          </div>
        ) : null}

        {manualNotice ? (
          <div className="stage-alert" role="status" data-testid="i02-manual-notice">
            {manualNotice}
          </div>
        ) : null}

        {solution.issue ? (
          <div className="stage-alert" role="status">
            {solution.issue}
          </div>
        ) : null}

        <span hidden data-testid="i02-mode-value">{params.mode}</span>
        <span hidden data-testid="i02-emf-value">{snapshot.emfV}</span>
        <span hidden data-testid="i02-current-value">{snapshot.currentA}</span>
        <span hidden data-testid="i02-force-value">{snapshot.magneticForceXN}</span>
        <span hidden data-testid="i02-flux-value">{snapshot.fluxWb}</span>
        <span hidden data-testid="i02-velocity-value">{snapshot.velocityMps}</span>
        <span hidden data-testid="i02-x-value">{snapshot.xM}</span>
        <span hidden data-testid="i02-time-value">{formatTime(snapshot.tS)}</span>
        <span hidden data-testid="i02-estimated-value">{snapshot.estimated ? 'true' : 'false'}</span>
      </div>
      <StageLegend
        items={[
          { label: '导体棒', color: 'var(--conductor)', variant: 'solid' },
          { label: '速度 v', color: 'var(--velocity)', variant: 'solid' },
          { label: '安培力 F安', color: 'var(--force)', variant: 'dashed' },
          { label: '外力 F外', color: 'var(--navy-soft)', variant: 'dashed' },
          { label: '感应电流 I', color: 'var(--current)', variant: 'solid' },
          { label: '磁通量区域 Φ', color: 'var(--flux)', variant: 'dashed' },
        ]}
      />
    </div>
  );
}
