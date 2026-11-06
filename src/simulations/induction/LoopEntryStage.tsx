import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LOOP_PHASE_LABEL,
  stateAtTime,
  type LoopSample,
  type LoopSimulation,
} from '../../physics/induction/loopField';
import { clamp } from '../../physics/core/vec2';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatLength, formatNumber, formatSI, formatTime } from '../../lib/format';
import type { I03Params } from './params';

export interface I03Layers {
  field: boolean;
  flux: boolean;
  current: boolean;
  vectors: boolean;
  ghosts: boolean;
}

export const I03_DEFAULT_LAYERS: I03Layers = {
  field: true,
  flux: true,
  current: true,
  vectors: true,
  ghosts: true,
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

const PHASE_SHORT: Record<string, string> = {
  before: '未进入',
  entering: '进入中',
  inside: '完全进入',
  spanning: '跨越磁场',
  leaving: '离开中',
  after: '已离开',
};

interface LoopEntryStageProps {
  sim: LoopSimulation;
  snapshot: LoopSample;
  params: I03Params;
  layers: I03Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  onParamsChange: (patch: Partial<I03Params>) => void;
  onSceneInteractionStart: () => void;
}

export function LoopEntryStage({
  sim,
  snapshot,
  params,
  layers,
  stageMode,
  onStageModeChange,
  onParamsChange,
  onSceneInteractionStart,
}: LoopEntryStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 800, height: 480 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [interacting, setInteracting] = useState(false);
  const lastFitSignature = useRef<string | null>(null);
  const loopDrag = useRef<{ pointerId: number; grabX: number; startXM: number } | null>(null);
  const fieldDrag = useRef<{ pointerId: number; grabX: number; startWidth: number } | null>(null);

  const fieldRight = params.fieldLeftM + params.fieldWidthM;
  const loopHeight = params.loopHeightM;
  const loopWidth = params.loopWidthM;
  const bounds = useMemo<StageBounds>(() => {
    const minX = Math.min(params.startXM, params.fieldLeftM) - 0.08;
    const maxX = Math.max(fieldRight + loopWidth, params.startXM + loopWidth) + 0.1;
    const halfY = Math.max(loopHeight * 0.95, 0.13);
    return { minX, minY: -halfY, maxX, maxY: halfY };
  }, [fieldRight, loopHeight, loopWidth, params.fieldLeftM, params.startXM]);
  const fitSignature = `${params.startXM}|${params.loopWidthM}|${params.loopHeightM}|${params.fieldLeftM}|${params.fieldWidthM}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

  useEffect(() => {
    if (interacting) return;
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 34);
  }, [bounds, fitBounds, fitSignature, interacting]);

  const fitNow = () => {
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 34);
  };

  const fieldLeftScreen = toScreen({ x: params.fieldLeftM, y: 0 }).x;
  const fieldRightScreen = toScreen({ x: fieldRight, y: 0 }).x;
  const loopTopLeft = toScreen({ x: snapshot.xM, y: params.loopHeightM / 2 });
  const loopBottomRight = toScreen({
    x: snapshot.xM + loopWidth,
    y: -params.loopHeightM / 2,
  });
  const loopScreenX = Math.min(loopTopLeft.x, loopBottomRight.x);
  const loopScreenY = Math.min(loopTopLeft.y, loopBottomRight.y);
  const loopScreenW = Math.abs(loopBottomRight.x - loopTopLeft.x);
  const loopScreenH = Math.abs(loopBottomRight.y - loopTopLeft.y);
  const loopCenterY = loopScreenY + loopScreenH / 2;
  const loopCenterX = loopScreenX + loopScreenW / 2;

  const overlapScreenLeft = toScreen({ x: Math.max(snapshot.xM, params.fieldLeftM), y: 0 }).x;
  const overlapScreenRight = toScreen({ x: Math.min(snapshot.xM + loopWidth, fieldRight), y: 0 }).x;
  const hasOverlap = snapshot.overlapWidthM > 1e-9;

  const currentPositive = snapshot.currentA > 1e-10;
  const currentNegative = snapshot.currentA < -1e-10;
  const hasCurrent = currentPositive || currentNegative;
  const currentEdges = useMemo(() => {
    if (!currentPositive && !currentNegative) return [];
    const ccw = currentPositive;
    const midX = loopScreenX + loopScreenW / 2;
    const midY = loopScreenY + loopScreenH / 2;
    const arrowHalf = Math.min(16, loopScreenW / 5, loopScreenH / 5);
    return [
      { x1: midX + (ccw ? arrowHalf : -arrowHalf), y1: loopScreenY, x2: midX + (ccw ? -arrowHalf : arrowHalf), y2: loopScreenY },
      { x1: midX + (ccw ? -arrowHalf : arrowHalf), y1: loopScreenY + loopScreenH, x2: midX + (ccw ? arrowHalf : -arrowHalf), y2: loopScreenY + loopScreenH },
      { x1: loopScreenX + loopScreenW, y1: midY + (ccw ? arrowHalf : -arrowHalf), x2: loopScreenX + loopScreenW, y2: midY + (ccw ? -arrowHalf : arrowHalf) },
      { x1: loopScreenX, y1: midY + (ccw ? -arrowHalf : arrowHalf), x2: loopScreenX, y2: midY + (ccw ? arrowHalf : -arrowHalf) },
    ];
  }, [currentNegative, currentPositive, loopScreenH, loopScreenW, loopScreenX, loopScreenY]);

  const fieldStep = niceStep(62 / view.scale);
  const fieldGlyphs = useMemo(() => {
    if (!layers.field || params.BzMagnitudeT === 0) return [];
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: size.width, y: size.height });
    const visibleMinX = Math.min(topLeft.x, bottomRight.x);
    const visibleMaxX = Math.max(topLeft.x, bottomRight.x);
    const visibleMinY = Math.min(topLeft.y, bottomRight.y);
    const visibleMaxY = Math.max(topLeft.y, bottomRight.y);
    const minX = Math.max(params.fieldLeftM, visibleMinX);
    const maxX = Math.min(fieldRight, visibleMaxX);
    if (maxX <= minX) return [];
    const items: Array<{ x: number; y: number }> = [];
    const startX = Math.ceil(minX / fieldStep) * fieldStep;
    const startY = Math.ceil(visibleMinY / fieldStep) * fieldStep;
    for (let x = startX; x <= maxX; x += fieldStep) {
      for (let y = startY; y <= visibleMaxY; y += fieldStep) {
        items.push(toScreen({ x, y }));
        if (items.length > 400) return items;
      }
    }
    return items;
  }, [
    fieldRight,
    fieldStep,
    layers.field,
    params.BzMagnitudeT,
    params.fieldLeftM,
    size.height,
    size.width,
    toScreen,
    toWorld,
  ]);

  const ghostLoops = useMemo(() => {
    if (!layers.ghosts || snapshot.tS <= 0) return [];
    const result: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (let index = 1; index <= 4; index++) {
      const t = snapshot.tS * (1 - index / 5);
      const past = stateAtTime(sim, t);
      const p1 = toScreen({ x: past.xM, y: params.loopHeightM / 2 });
      const p2 = toScreen({ x: past.xM + loopWidth, y: -params.loopHeightM / 2 });
      result.push({
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        w: Math.abs(p2.x - p1.x),
        h: Math.abs(p2.y - p1.y),
      });
    }
    return result;
  }, [layers.ghosts, loopWidth, params.loopHeightM, sim, snapshot.tS, toScreen]);

  const scaleBarStep = niceStep(84 / view.scale);
  const scaleBarWidth = scaleBarStep * view.scale;
  const forceBaseSide = snapshot.forceXN !== 0
    ? snapshot.rightSideInside && !snapshot.leftSideInside
      ? 'right'
      : snapshot.leftSideInside && !snapshot.rightSideInside
        ? 'left'
        : null
    : null;
  const forceBaseX = forceBaseSide === 'right' ? loopScreenX + loopScreenW : loopScreenX;
  const forceBaseY = loopScreenY + loopScreenH * 0.66;
  const maxAbsForce = useMemo(
    () => Math.max(1e-9, sim.samples.reduce((max, sample) => Math.max(max, Math.abs(sample.forceXN)), 0)),
    [sim],
  );
  const forceArrowLength = clamp(28, 96, 22 + (Math.abs(snapshot.forceXN) / maxAbsForce) * 70);
  const forceDirection = snapshot.forceXN >= 0 ? 1 : -1;
  const velocityArrowLength = 30 + clamp(0, 1, snapshot.velocityMps / Math.max(params.initialSpeedMps, 1e-9)) * 56;

  const fieldOut = params.BzSign > 0;

  const beginLoopDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    loopDrag.current = { pointerId: event.pointerId, grabX: world.x, startXM: params.startXM };
    setInteracting(true);
    onSceneInteractionStart();
  };

  const moveLoopDrag = (event: React.PointerEvent<SVGGElement>) => {
    const drag = loopDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const next = clamp(drag.startXM + (world.x - drag.grabX), -1.2, 1.2);
    onParamsChange({ startXM: Number(next.toFixed(3)) });
  };

  const endLoopDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (loopDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    loopDrag.current = null;
    setInteracting(false);
  };

  const beginFieldDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (stageMode !== 'interact') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    fieldDrag.current = { pointerId: event.pointerId, grabX: world.x, startWidth: params.fieldWidthM };
    setInteracting(true);
    onSceneInteractionStart();
  };

  const moveFieldDrag = (event: React.PointerEvent<SVGGElement>) => {
    const drag = fieldDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const next = clamp(drag.startWidth + (world.x - drag.grabX), 0.06, 1.4);
    onParamsChange({ fieldWidthM: Number(next.toFixed(2)) });
  };

  const endFieldDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (fieldDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    fieldDrag.current = null;
    setInteracting(false);
  };

  return (
    <div className="stage-card">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
      />
      <div className="stage-wrap" ref={ref} data-testid="i03-stage" data-view-scale={view.scale.toFixed(3)}>
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`矩形线框进出磁场。当前状态：${LOOP_PHASE_LABEL[snapshot.phase]}；磁通量 ${formatSI(snapshot.fluxWb, 'Wb')}；感应电动势 ${formatSI(snapshot.emfV, 'V')}。`}
          data-testid="i03-stage-svg"
          {...stageHandlers}
        >
          <defs>
            <marker id="i03-current-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--current)" />
            </marker>
            <marker id="i03-velocity-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--velocity)" />
            </marker>
            <marker id="i03-force-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--force)" />
            </marker>
            <linearGradient id="i03-field-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--field-soft)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--field-soft)" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          <rect width={size.width} height={size.height} fill="transparent" />

          <rect
            x={Math.min(fieldLeftScreen, fieldRightScreen)}
            y={0}
            width={Math.abs(fieldRightScreen - fieldLeftScreen)}
            height={size.height}
            fill="url(#i03-field-fill)"
            aria-hidden="true"
          />
          {[fieldLeftScreen, fieldRightScreen].map((x, index) => (
            <line
              key={index}
              x1={x}
              x2={x}
              y1={0}
              y2={size.height}
              stroke="var(--field)"
              strokeWidth={1.6}
              strokeDasharray="8 6"
              opacity={0.8}
            />
          ))}

          {fieldGlyphs.map((glyph, index) => (
            <g
              key={index}
              transform={`translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`}
              opacity={0.46}
              aria-hidden="true"
            >
              <circle r={6.4} fill="none" stroke="var(--field)" strokeWidth={1.1} />
              {fieldOut ? (
                <circle r={1.8} fill="var(--field)" />
              ) : (
                <path d="M-2.7,-2.7L2.7,2.7M2.7,-2.7L-2.7,2.7" stroke="var(--field)" strokeWidth={1.2} />
              )}
            </g>
          ))}

          <line
            x1={0}
            x2={size.width}
            y1={toScreen({ x: 0, y: 0 }).y}
            y2={toScreen({ x: 0, y: 0 }).y}
            stroke="var(--ink-faint)"
            strokeWidth={1}
            strokeDasharray="3 9"
            aria-hidden="true"
          />

          {ghostLoops.map((ghost, index) => (
            <rect
              key={index}
              x={ghost.x}
              y={ghost.y}
              width={ghost.w}
              height={ghost.h}
              fill="none"
              stroke="var(--ghost)"
              strokeWidth={1.4}
              strokeDasharray="5 5"
              opacity={0.2 + index * 0.1}
              aria-hidden="true"
            />
          ))}

          {layers.flux && hasOverlap ? (
            <g aria-hidden="true">
              <rect
                x={Math.min(overlapScreenLeft, overlapScreenRight)}
                y={loopScreenY}
                width={Math.abs(overlapScreenRight - overlapScreenLeft)}
                height={loopScreenH}
                fill="var(--flux-soft)"
                stroke="var(--flux)"
                strokeWidth={1.4}
                strokeDasharray="5 4"
              />
              {Math.abs(overlapScreenRight - overlapScreenLeft) > 78 && loopScreenH > 40 ? (
                <text
                  x={(overlapScreenLeft + overlapScreenRight) / 2}
                  y={loopScreenY + loopScreenH / 2 + 4}
                  textAnchor="middle"
                  className="svg-text svg-text-small"
                  fill="var(--flux-strong)"
                >
                  有效面积
                </text>
              ) : null}
            </g>
          ) : null}

          <g aria-hidden="true">
            <rect
              x={loopScreenX}
              y={loopScreenY}
              width={loopScreenW}
              height={loopScreenH}
              rx={3}
              fill="var(--surface)"
              fillOpacity={0.2}
              stroke="var(--conductor)"
              strokeWidth={5}
              strokeLinejoin="round"
            />
            <rect
              x={loopScreenX + 2}
              y={loopScreenY + 2}
              width={Math.max(0, loopScreenW - 4)}
              height={Math.max(0, loopScreenH - 4)}
              rx={2}
              fill="none"
              stroke="var(--conductor-light)"
              strokeWidth={1}
              opacity={0.65}
            />
          </g>

          {layers.current && hasCurrent
            ? currentEdges.map((edge, index) => (
                <line
                  key={index}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke="var(--current)"
                  strokeWidth={2.6}
                  markerEnd="url(#i03-current-arrow)"
                  strokeLinecap="round"
                  aria-hidden="true"
                />
              ))
            : null}
          {layers.current && hasCurrent ? (
            <text
              x={loopCenterX}
              y={loopScreenY - 8}
              textAnchor="middle"
              className="svg-text svg-text-small"
              fill="var(--current-strong)"
            >
              I {currentPositive ? '逆时针' : '顺时针'}
            </text>
          ) : null}

          {layers.vectors && snapshot.velocityMps > 1e-9 ? (
            <g aria-hidden="true">
              <line
                x1={loopCenterX - 20}
                y1={loopCenterY}
                x2={loopCenterX - 20 + velocityArrowLength}
                y2={loopCenterY}
                stroke="var(--velocity)"
                strokeWidth={2.8}
                markerEnd="url(#i03-velocity-arrow)"
                strokeLinecap="round"
              />
              <text
                x={loopCenterX - 24 + velocityArrowLength}
                y={loopCenterY + 4}
                textAnchor="middle"
                className="svg-text svg-text-small"
                fill="var(--velocity)"
              >
                v
              </text>
            </g>
          ) : null}

          {layers.vectors && forceBaseSide && snapshot.forceXN !== 0 ? (
            <g aria-hidden="true">
              <line
                x1={forceBaseX}
                y1={forceBaseY}
                x2={forceBaseX + forceDirection * (8 + forceArrowLength)}
                y2={forceBaseY}
                stroke="var(--force)"
                strokeWidth={2.8}
                strokeDasharray="6 4"
                markerEnd="url(#i03-force-arrow)"
                strokeLinecap="round"
              />
              <text
                x={forceBaseX + forceDirection * (28 + forceArrowLength)}
                y={forceBaseY + 4}
                textAnchor="middle"
                className="svg-text svg-text-small"
                fill="var(--force)"
              >
                F安
              </text>
            </g>
          ) : null}

          {stageMode === 'interact' ? (
            <g
              className="stage-handle loop-drag-handle"
              transform={`translate(${loopCenterX} ${Math.min(size.height - 30, loopScreenY + loopScreenH + 34)})`}
              onPointerDown={beginLoopDrag}
              onPointerMove={moveLoopDrag}
              onPointerUp={endLoopDrag}
              onPointerCancel={endLoopDrag}
              data-testid="i03-loop-handle"
            >
              <rect x={-72} y={-22} width={144} height={44} rx={22} className="handle-pill" />
              <text x={0} y={4} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">
                ↔ 拖动线框
              </text>
            </g>
          ) : null}

          {stageMode === 'interact' ? (
            <g
              className="stage-handle"
              transform={`translate(${fieldRightScreen} ${Math.max(56, size.height * 0.12)})`}
              onPointerDown={beginFieldDrag}
              onPointerMove={moveFieldDrag}
              onPointerUp={endFieldDrag}
              onPointerCancel={endFieldDrag}
              data-testid="i03-field-handle"
            >
              <circle r={28} fill="transparent" />
              <circle r={14} className="handle-ring" />
              <path d="M-5,-3L-5,3M5,-3L5,3" className="handle-grip" />
              <text x={0} y={30} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">
                拖磁场边界
              </text>
            </g>
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
            B {formatNumber(params.BzMagnitudeT, 2)} T · {fieldOut ? '出纸面' : '入纸面'}
          </span>
          <span className={`hud-chip phase-chip phase-${snapshot.phase}`}>
            {PHASE_SHORT[snapshot.phase] ?? LOOP_PHASE_LABEL[snapshot.phase]}
          </span>
          <span className="hud-chip">
            {snapshot.currentA === 0 ? 'I = 0' : `I ${currentPositive ? '逆时针' : '顺时针'}`}
          </span>
          <span className="hud-chip hud-chip-quiet">
            {params.mode === 'uniform' ? '匀速驱动' : '自由滑行'}
          </span>
        </div>

        {snapshot.tS <= 1e-12 && stageMode === 'interact' ? (
          <div className="stage-drag-hint">
            拖动线框与磁场边界 · 双指缩放 / 平移
          </div>
        ) : null}

        {sim.issue ? (
          <div className="stage-alert" role="status">
            {sim.issue}
          </div>
        ) : null}

      </div>
      <StageLegend
        items={[
          { label: '有效面积（Φ）', color: 'var(--flux)', variant: 'dashed' },
          { label: '感应电流 I', color: 'var(--current)', variant: 'solid' },
          { label: '速度 v', color: 'var(--velocity)', variant: 'solid' },
          { label: '安培力 F安', color: 'var(--force)', variant: 'dashed' },
          { label: '磁场 B（⊙ 出 / × 入）', color: 'var(--field)', variant: 'field' },
          { label: '历史位置', color: 'var(--ghost)', variant: 'dashed' },
        ]}
      />
      <span hidden data-testid="i03-phase-value">{snapshot.phase}</span>
      <span hidden data-testid="i03-emf-value">{snapshot.emfV}</span>
      <span hidden data-testid="i03-current-value">{snapshot.currentA}</span>
      <span hidden data-testid="i03-force-value">{snapshot.forceXN}</span>
      <span hidden data-testid="i03-time-value">{formatTime(snapshot.tS)}</span>
      <span hidden data-testid="i03-flux-value">{snapshot.fluxWb}</span>
    </div>
  );
}
