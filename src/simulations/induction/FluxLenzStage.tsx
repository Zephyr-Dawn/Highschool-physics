import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clamp } from '../../physics/core/vec2';
import type { FluxLenzSnapshot } from '../../physics/induction/fluxLenz';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatArea, formatNumber, formatSI } from '../../lib/format';
import type { I01Mode, I01Params } from './fluxLenzParams';

export interface I01Layers {
  field: boolean;
  normal: boolean;
  flux: boolean;
  current: boolean;
  inducedField: boolean;
  rates: boolean;
  magnitude: boolean;
  geometry: boolean;
}

export const I01_DEFAULT_LAYERS: I01Layers = {
  field: true,
  normal: true,
  flux: true,
  current: true,
  inducedField: true,
  rates: true,
  magnitude: true,
  geometry: true,
};

interface FluxLenzStageProps {
  mode: I01Mode;
  snapshot: FluxLenzSnapshot;
  params: I01Params;
  layers: I01Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  answersHidden: boolean;
  historyCount: number;
  notice: string | null;
  fieldTargetBz: number;
  fieldDragging: boolean;
  fieldEnabled: boolean;
  onFieldStart: () => void;
  onFieldChange: (targetBz: number) => void;
  onFieldEnd: () => void;
  fieldAuto: boolean;
  areaDragging: boolean;
  areaEnabled: boolean;
  onAreaStart: () => void;
  onAreaChange: (widthM: number) => void;
  onAreaEnd: () => void;
  onAreaCancel: () => void;
  areaAuto: boolean;
  angleDragging: boolean;
  angleEnabled: boolean;
  onAngleStart: () => void;
  onAngleChange: (rawAngle: number) => void;
  onAngleEnd: () => void;
  onAngleCancel: () => void;
  angleAuto: boolean;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface Point2 {
  x: number;
  y: number;
}

const AREA_LEFT = -1.15;
const AREA_VISUAL_WIDTH = 2 / 1.2;
const MIN_WIDTH = 0.05;
const MAX_WIDTH = 1.2;
const FIELD_RANGE_T = 2;

function project3(point: Point3): Point2 {
  return { x: point.x - point.z * 0.58, y: -point.y + point.z * 0.42 };
}

function currentArrowPoints(points: Point2[], positive: boolean): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const arrows: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const from = positive ? a : b;
    const to = positive ? b : a;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 8) continue;
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const half = Math.min(20, length * 0.24);
    arrows.push({
      x1: mx - (dx / length) * half,
      y1: my - (dy / length) * half,
      x2: mx + (dx / length) * half,
      y2: my + (dy / length) * half,
    });
  }
  return arrows;
}

export function FluxLenzStage({
  mode,
  snapshot,
  params,
  layers,
  stageMode,
  onStageModeChange,
  answersHidden,
  historyCount,
  notice,
  fieldTargetBz,
  fieldDragging,
  fieldEnabled,
  onFieldStart,
  onFieldChange,
  onFieldEnd,
  fieldAuto,
  areaDragging,
  areaEnabled,
  onAreaStart,
  onAreaChange,
  onAreaEnd,
  onAreaCancel,
  areaAuto,
  angleDragging,
  angleEnabled,
  onAngleStart,
  onAngleChange,
  onAngleEnd,
  onAngleCancel,
  angleAuto,
}: FluxLenzStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 820, height: 520 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const lastFit = useRef<string | null>(null);
  const [interacting, setInteracting] = useState(false);
  const fieldDrag = useRef<{ pointerId: number; startY: number; startB: number } | null>(null);
  const areaDrag = useRef<{ pointerId: number; startWorldX: number; startWidth: number } | null>(null);
  const angleDrag = useRef<{ pointerId: number; startWorldX: number; startAngle: number } | null>(null);
  const fitSignature = `${mode}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

  useEffect(() => {
    if (lastFit.current === fitSignature) return;
    lastFit.current = fitSignature;
    const bounds: StageBounds = mode === 'angle'
      ? { minX: -2.3, minY: -2.1, maxX: 2.4, maxY: 2.1 }
      : { minX: -1.7, minY: -1.6, maxX: 2.5, maxY: 1.6 };
    fitBounds(bounds, 38);
  }, [fitBounds, fitSignature, mode]);

  const widthM = params.lengthM > 0 ? snapshot.areaM2 / params.lengthM : 0;
  const theta = snapshot.thetaRad;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const u: Point3 = { x: cos, y: 0, z: -sin };
  const v: Point3 = { x: 0, y: 1, z: 0 };
  const n: Point3 = { x: sin, y: 0, z: cos };
  const halfW = clamp(widthM * 0.85, 0.28, 1.02);
  const halfH = clamp(params.lengthM * 0.7, 0.28, 0.95);
  const localCorners: Point3[] = [
    { x: -halfW * u.x - halfH * v.x, y: -halfW * u.y - halfH * v.y, z: -halfW * u.z - halfH * v.z },
    { x: halfW * u.x - halfH * v.x, y: halfW * u.y - halfH * v.y, z: halfW * u.z - halfH * v.z },
    { x: halfW * u.x + halfH * v.x, y: halfW * u.y + halfH * v.y, z: halfW * u.z + halfH * v.z },
    { x: -halfW * u.x + halfH * v.x, y: -halfW * u.y + halfH * v.y, z: -halfW * u.z + halfH * v.z },
  ];
  const areaCorners: Point2[] = mode === 'area'
    ? [
        { x: AREA_LEFT, y: -0.72 },
        { x: AREA_LEFT + clamp(widthM, MIN_WIDTH, MAX_WIDTH) * AREA_VISUAL_WIDTH, y: -0.72 },
        { x: AREA_LEFT + clamp(widthM, MIN_WIDTH, MAX_WIDTH) * AREA_VISUAL_WIDTH, y: 0.72 },
        { x: AREA_LEFT, y: 0.72 },
      ]
    : localCorners.map(project3);
  const screenCorners = areaCorners.map((point) => toScreen(point));
  const center2D = areaCorners.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  const centerScreen = toScreen(center2D);
  const coilPath = screenCorners.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ') + ' Z';
  const currentPositive = (snapshot.currentA ?? 0) > 1e-12;
  const hasCurrent = Math.abs(snapshot.currentA ?? 0) > 1e-12 && snapshot.circuitClosed;
  const showCurrent = layers.current && !answersHidden && hasCurrent;
  const showInduced = layers.inducedField && !answersHidden && hasCurrent;
  const currentArrows = currentArrowPoints(screenCorners, currentPositive);
  const normalEnd = toScreen(project3({ x: n.x * 1.25, y: n.y * 1.25, z: n.z * 1.25 }));
  const normalBase = toScreen(project3({ x: 0, y: 0, z: 0 }));
  const normalIsScreenOut = Math.abs(sin) < 0.02 && cos > 0;
  const normalIsScreenIn = Math.abs(sin) < 0.02 && cos < 0;
  const fieldOut = snapshot.Bz >= 0;
  const fieldArrowZ = snapshot.Bz >= 0 ? 1.2 : -1.2;
  const fieldGlyphs = useMemo(() => {
    if (!layers.field || Math.abs(snapshot.Bz) < 1e-12 || mode === 'angle') return [];
    const left = mode === 'area' ? AREA_LEFT : -halfW;
    const right = mode === 'area' ? AREA_LEFT + clamp(widthM, MIN_WIDTH, MAX_WIDTH) * AREA_VISUAL_WIDTH : halfW;
    const top = mode === 'area' ? 0.72 : halfH;
    const bottom = mode === 'area' ? -0.72 : -halfH;
    const step = Math.max(0.18, Math.min(0.3, (right - left) / 5));
    const items: Array<{ x: number; y: number }> = [];
    for (let x = left + step * 0.55; x < right - step * 0.2; x += step) {
      for (let y = bottom + step * 0.55; y < top - step * 0.2; y += step) {
        items.push(toScreen({ x, y }));
        if (items.length > 80) return items;
      }
    }
    return items;
  }, [halfH, halfW, layers.field, mode, snapshot.Bz, toScreen, widthM]);

  const fieldTrackTop = toScreen({ x: 2.1, y: 1.25 }).y;
  const fieldTrackBottom = toScreen({ x: 2.1, y: -1.25 }).y;
  const fieldB = clamp(snapshot.Bz, -FIELD_RANGE_T, FIELD_RANGE_T);
  const fieldY = fieldTrackBottom + ((fieldB + FIELD_RANGE_T) / (2 * FIELD_RANGE_T)) * (fieldTrackTop - fieldTrackBottom);
  const fieldTargetY = fieldTrackBottom + ((clamp(fieldTargetBz, -FIELD_RANGE_T, FIELD_RANGE_T) + FIELD_RANGE_T) / (2 * FIELD_RANGE_T)) * (fieldTrackTop - fieldTrackBottom);
  const areaHandle = toScreen({ x: AREA_LEFT + clamp(widthM, MIN_WIDTH, MAX_WIDTH) * AREA_VISUAL_WIDTH, y: -0.72 });
  const angleHandle = toScreen(project3({ x: 0, y: halfH + 0.28, z: 0 }));

  const worldX = (event: ReactPointerEvent<SVGGElement>): number | null => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return null;
    return toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }).x;
  };

  const beginField = (event: ReactPointerEvent<SVGGElement>) => {
    if (mode !== 'field' || stageMode !== 'interact' || !fieldEnabled) return;
    if (fieldDrag.current) {
      if (event.pointerId !== fieldDrag.current.pointerId) {
        fieldDrag.current = null;
        setInteracting(false);
        onFieldEnd();
      }
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    fieldDrag.current = { pointerId: event.pointerId, startY: event.clientY, startB: snapshot.Bz };
    setInteracting(true);
    onFieldStart();
  };
  const moveField = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = fieldDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const trackHeight = Math.max(20, fieldTrackBottom - fieldTrackTop);
    const target = drag.startB + ((drag.startY - event.clientY) / trackHeight) * (2 * FIELD_RANGE_T);
    onFieldChange(clamp(target, -FIELD_RANGE_T, FIELD_RANGE_T));
  };
  const endField = (event: ReactPointerEvent<SVGGElement>) => {
    if (fieldDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    fieldDrag.current = null;
    setInteracting(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onFieldEnd();
  };

  const beginArea = (event: ReactPointerEvent<SVGGElement>) => {
    if (mode !== 'area' || stageMode !== 'interact' || !areaEnabled) return;
    if (areaDrag.current) {
      if (event.pointerId !== areaDrag.current.pointerId) {
        areaDrag.current = null;
        setInteracting(false);
        onAreaCancel();
      }
      return;
    }
    event.stopPropagation();
    const world = worldX(event);
    if (world === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    areaDrag.current = { pointerId: event.pointerId, startWorldX: world, startWidth: widthM };
    setInteracting(true);
    onAreaStart();
  };
  const moveArea = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = areaDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const world = worldX(event);
    if (world === null) return;
    const next = clamp(drag.startWidth + (world - drag.startWorldX) / AREA_VISUAL_WIDTH, MIN_WIDTH, MAX_WIDTH);
    onAreaChange(next);
  };
  const endArea = (event: ReactPointerEvent<SVGGElement>) => {
    if (areaDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    areaDrag.current = null;
    setInteracting(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onAreaEnd();
  };
  const cancelArea = (event: ReactPointerEvent<SVGGElement>) => {
    if (areaDrag.current?.pointerId !== event.pointerId) return;
    areaDrag.current = null;
    setInteracting(false);
    onAreaCancel();
  };

  const beginAngle = (event: ReactPointerEvent<SVGGElement>) => {
    if (mode !== 'angle' || stageMode !== 'interact' || !angleEnabled) return;
    if (angleDrag.current) {
      if (event.pointerId !== angleDrag.current.pointerId) {
        angleDrag.current = null;
        setInteracting(false);
        onAngleCancel();
      }
      return;
    }
    event.stopPropagation();
    const world = worldX(event);
    if (world === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    angleDrag.current = { pointerId: event.pointerId, startWorldX: world, startAngle: snapshot.thetaRad };
    setInteracting(true);
    onAngleStart();
  };
  const moveAngle = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = angleDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const world = worldX(event);
    if (world === null) return;
    onAngleChange(drag.startAngle + (world - drag.startWorldX) * 0.85);
  };
  const endAngle = (event: ReactPointerEvent<SVGGElement>) => {
    if (angleDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    angleDrag.current = null;
    setInteracting(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onAngleEnd();
  };
  const cancelAngle = (event: ReactPointerEvent<SVGGElement>) => {
    if (angleDrag.current?.pointerId !== event.pointerId) return;
    angleDrag.current = null;
    setInteracting(false);
    onAngleCancel();
  };

  const handleStagePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (fieldDrag.current && event.pointerId !== fieldDrag.current.pointerId) {
      fieldDrag.current = null;
      setInteracting(false);
      onFieldEnd();
    }
    if (areaDrag.current && event.pointerId !== areaDrag.current.pointerId) {
      areaDrag.current = null;
      setInteracting(false);
      onAreaCancel();
    }
    if (angleDrag.current && event.pointerId !== angleDrag.current.pointerId) {
      angleDrag.current = null;
      setInteracting(false);
      onAngleCancel();
    }
    stageHandlers.onPointerDown(event);
  };

  const modeLabel = mode === 'field' ? '改变磁场' : mode === 'area' ? '改变面积' : '转动线圈';
  const driveAuto = mode === 'field' ? fieldAuto : mode === 'area' ? areaAuto : angleAuto;
  const currentAngleLabel =
    snapshot.currentSense === 'counterclockwise-relative-normal'
      ? '从 +n 看逆时针'
      : snapshot.currentSense === 'clockwise-relative-normal'
        ? '从 +n 看顺时针'
        : snapshot.currentSense === 'open-no-current'
          ? '开路：无持续电流'
          : '无电流';
  const answerHidden = answersHidden;
  const inducedLabel =
    snapshot.inducedFieldDirection === 'along-normal'
      ? '感应场沿 +n'
      : snapshot.inducedFieldDirection === 'opposite-normal'
        ? '感应场沿 −n'
        : '无感应场方向';

  return (
    <div className="stage-card flux-lenz-stage">
      <StageToolbar mode={stageMode} onModeChange={onStageModeChange} onFit={() => fitBounds(mode === 'angle' ? { minX: -2.3, minY: -2.1, maxX: 2.4, maxY: 2.1 } : { minX: -1.7, minY: -1.6, maxX: 2.5, maxY: 1.6 }, 38)} onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="i01-stage"
        data-mode={mode}
        data-view-scale={view.scale.toFixed(3)}
        data-bz={snapshot.Bz}
        data-area={snapshot.areaM2}
        data-theta={snapshot.thetaRad}
        data-flux={snapshot.phiWb}
        data-emf={snapshot.emfV ?? ''}
        data-current={snapshot.currentA ?? ''}
        data-current-sense={snapshot.currentSense}
        data-induced-field={snapshot.inducedFieldDirection}
        data-closed={snapshot.circuitClosed}
        data-derivative-quality={snapshot.derivativeQuality}
        data-history-count={historyCount}
        data-answers-hidden={answersHidden}
        data-drive={driveAuto ? 'auto' : 'manual'}
        data-field-dragging={fieldDragging}
        data-area-dragging={areaDragging}
        data-angle-dragging={angleDragging}
        data-interacting={interacting}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`I01 ${modeLabel}。${snapshot.circuitClosed ? '闭合回路' : '开路'}；Φ ${formatSI(snapshot.phiWb, 'Wb')}；ε ${snapshot.emfV === null ? '不可用' : formatSI(snapshot.emfV, 'V')}。`}
          data-testid="i01-stage-svg"
          {...stageHandlers}
          onPointerDown={handleStagePointerDown}
        >
          <defs>
            <marker id="i01-current-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" fill="var(--current)" /></marker>
            <marker id="i01-field-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0,0L9,4.5L0,9z" fill="var(--field)" /></marker>
            <marker id="i01-normal-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0,0L9,4.5L0,9z" fill="var(--flux)" /></marker>
            <marker id="i01-induced-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0,0L9,4.5L0,9z" fill="var(--flux-strong)" /></marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />

          {layers.geometry ? (
            <text x={18} y={22} className="svg-text svg-text-small" fill="var(--ink-muted)">
              {modeLabel} · {driveAuto ? '自动驱动' : '手动操作'} · {snapshot.circuitClosed ? '闭合' : '开路'}
            </text>
          ) : null}

          {layers.flux ? <path d={coilPath} fill="var(--flux-soft)" stroke="none" opacity={0.7} /> : null}
          {fieldGlyphs.map((glyph, index) => (
            <g key={index} transform={`translate(${glyph.x} ${glyph.y})`} opacity={0.48} aria-hidden="true">
              <circle r={5.8} fill="none" stroke="var(--field)" strokeWidth={1} />
              {fieldOut ? <circle r={1.6} fill="var(--field)" /> : <path d="M-2.3,-2.3L2.3,2.3M2.3,-2.3L-2.3,2.3" stroke="var(--field)" strokeWidth={1.1} />}
            </g>
          ))}

          <path d={coilPath} fill="none" stroke="var(--conductor)" strokeWidth={5} strokeLinejoin="round" />
          {!snapshot.circuitClosed ? (
            <g>
              <rect x={screenCorners[3].x - 8} y={(screenCorners[3].y + screenCorners[0].y) / 2 - 10} width={16} height={20} fill="var(--surface)" />
              <text x={screenCorners[3].x - 10} y={(screenCorners[3].y + screenCorners[0].y) / 2 + 3} textAnchor="end" className="svg-text svg-text-small" fill="var(--danger)">开路</text>
            </g>
          ) : null}

          {showCurrent ? (
            <g aria-hidden="true" data-testid="i01-current-arrow">
              {currentArrows.map((arrow, index) => (
                <line key={index} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke="var(--current)" strokeWidth={2.6} markerEnd="url(#i01-current-arrow)" strokeLinecap="round" />
              ))}
            </g>
          ) : null}

          {layers.normal ? (
            normalIsScreenOut || normalIsScreenIn ? (
              <g aria-hidden="true">
                <circle cx={centerScreen.x} cy={centerScreen.y} r={12} fill="var(--surface)" stroke="var(--flux)" strokeWidth={1.5} />
                {normalIsScreenOut ? (
                  <circle cx={centerScreen.x} cy={centerScreen.y} r={2.3} fill="var(--flux-strong)" />
                ) : (
                  <path d={`M${centerScreen.x - 3.4},${centerScreen.y - 3.4}L${centerScreen.x + 3.4},${centerScreen.y + 3.4}M${centerScreen.x + 3.4},${centerScreen.y - 3.4}L${centerScreen.x - 3.4},${centerScreen.y + 3.4}`} stroke="var(--flux-strong)" strokeWidth={1.6} />
                )}
                <text x={centerScreen.x + 16} y={centerScreen.y + 4} className="svg-text svg-text-small" fill="var(--flux-strong)">
                  +n {normalIsScreenOut ? '出纸面' : '入纸面'}
                </text>
              </g>
            ) : (
              <g aria-hidden="true">
                <line x1={normalBase.x} y1={normalBase.y} x2={normalEnd.x} y2={normalEnd.y} stroke="var(--flux)" strokeWidth={2.4} markerEnd="url(#i01-normal-arrow)" />
                <text x={normalEnd.x + 7} y={normalEnd.y - 5} className="svg-text svg-text-small" fill="var(--flux-strong)">+n</text>
              </g>
            )
          ) : null}

          {showInduced ? (
            <g aria-hidden="true">
              <line
                x1={centerScreen.x}
                y1={centerScreen.y}
                x2={toScreen(project3({
                  x: n.x * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  y: n.y * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  z: n.z * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                })).x}
                y2={toScreen(project3({
                  x: n.x * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  y: n.y * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  z: n.z * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                })).y}
                stroke="var(--flux-strong)"
                strokeWidth={2}
                strokeDasharray="5 4"
                markerEnd="url(#i01-induced-arrow)"
              />
              <text
                x={toScreen(project3({
                  x: n.x * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  y: n.y * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  z: n.z * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                })).x + 8}
                y={toScreen(project3({
                  x: n.x * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  y: n.y * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                  z: n.z * (snapshot.inducedFieldDirection === 'along-normal' ? 1 : -1) * 1.05,
                })).y - 4}
                className="svg-text svg-text-small"
                fill="var(--flux-strong)"
              >
                B_ind
              </text>
            </g>
          ) : null}

          {!answersHidden && mode === 'angle' ? (
            <g aria-hidden="true">
              <line x1={toScreen(project3({ x: 1.5, y: 1.3, z: 0 })).x} y1={toScreen(project3({ x: 1.5, y: 1.3, z: 0 })).y} x2={toScreen(project3({ x: 1.5, y: 1.3, z: fieldArrowZ })).x} y2={toScreen(project3({ x: 1.5, y: 1.3, z: fieldArrowZ })).y} stroke="var(--field)" strokeWidth={2.4} markerEnd="url(#i01-field-arrow)" />
              <text x={toScreen(project3({ x: 1.5, y: 1.3, z: fieldArrowZ * 1.12 })).x} y={toScreen(project3({ x: 1.5, y: 1.3, z: fieldArrowZ * 1.12 })).y} className="svg-text svg-text-small" fill="var(--field)">B</text>
            </g>
          ) : null}

          {mode === 'field' ? (
            <g
              className={`stage-handle ${fieldEnabled ? '' : 'is-disabled'}`}
              data-testid="i01-field-handle"
              onPointerDown={beginField}
              onPointerMove={moveField}
              onPointerUp={endField}
              onPointerCancel={(event) => {
                if (fieldDrag.current?.pointerId === event.pointerId) {
                  fieldDrag.current = null;
                  setInteracting(false);
                  onFieldEnd();
                }
              }}
            >
              <rect
                x={toScreen({ x: 2.1, y: 1.25 }).x - 22}
                y={fieldTrackTop - 22}
                width={44}
                height={fieldTrackBottom - fieldTrackTop + 44}
                fill="transparent"
                data-testid="i01-field-handle-hit"
              />
              <line x1={toScreen({ x: 2.1, y: 1.25 }).x} y1={fieldTrackTop} x2={toScreen({ x: 2.1, y: 1.25 }).x} y2={fieldTrackBottom} stroke="var(--line-strong)" strokeWidth={5} strokeLinecap="round" />
              {[-2, -1, 0, 1, 2].map((value) => (
                <g key={value}>
                  <line x1={toScreen({ x: 2.1, y: 1.25 }).x - 6} y1={fieldTrackBottom + ((value + FIELD_RANGE_T) / (2 * FIELD_RANGE_T)) * (fieldTrackTop - fieldTrackBottom)} x2={toScreen({ x: 2.1, y: 1.25 }).x + 6} y2={fieldTrackBottom + ((value + FIELD_RANGE_T) / (2 * FIELD_RANGE_T)) * (fieldTrackTop - fieldTrackBottom)} stroke="var(--ink-faint)" strokeWidth={1} />
                  <text x={toScreen({ x: 2.1, y: 1.25 }).x + 12} y={fieldTrackBottom + ((value + FIELD_RANGE_T) / (2 * FIELD_RANGE_T)) * (fieldTrackTop - fieldTrackBottom) + 3} className="svg-text svg-text-small" fill="var(--ink-faint)">{value} T</text>
                </g>
              ))}
              <line x1={toScreen({ x: 2.1, y: 1.25 }).x - 14} y1={fieldTargetY} x2={toScreen({ x: 2.1, y: 1.25 }).x + 14} y2={fieldTargetY} stroke="var(--flux)" strokeWidth={1.4} strokeDasharray="4 3" />
              <circle cx={toScreen({ x: 2.1, y: 1.25 }).x} cy={fieldY} r={24} fill="transparent" />
              <circle cx={toScreen({ x: 2.1, y: 1.25 }).x} cy={fieldY} r={16} fill="var(--field-soft)" stroke="var(--field)" strokeWidth={2} />
              <text x={toScreen({ x: 2.1, y: 1.25 }).x} y={fieldY + 4} textAnchor="middle" className="svg-text svg-text-small" fill="var(--field)">B</text>
              <text x={toScreen({ x: 2.1, y: 1.25 }).x} y={fieldTrackTop - 18} textAnchor="middle" className="svg-text svg-text-small" fill="var(--field)">拖动改变 B</text>
              <text x={toScreen({ x: 2.1, y: 1.25 }).x} y={fieldTrackBottom + 24} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">目标 {formatNumber(fieldTargetBz, 2)} T</text>
            </g>
          ) : null}

          {mode === 'area' ? (
            <g
              className={`stage-handle ${areaEnabled ? '' : 'is-disabled'}`}
              data-testid="i01-area-handle"
              transform={`translate(${areaHandle.x} ${areaHandle.y})`}
              onPointerDown={beginArea}
              onPointerMove={moveArea}
              onPointerUp={endArea}
              onPointerCancel={cancelArea}
            >
              <rect x={-22} y={-30} width={44} height={60} fill="transparent" />
              <circle r={15} fill="var(--flux-soft)" stroke="var(--flux-strong)" strokeWidth={2} />
              <path d="M-4,0H4M0,-4V4" stroke="var(--flux-strong)" strokeWidth={1.6} />
              <text x={0} y={29} textAnchor="middle" className="svg-text svg-text-small" fill="var(--flux-strong)">拖动改变面积</text>
            </g>
          ) : null}

          {mode === 'angle' ? (
            <g
              className={`stage-handle ${angleEnabled ? '' : 'is-disabled'}`}
              data-testid="i01-angle-handle"
              transform={`translate(${angleHandle.x} ${angleHandle.y})`}
              onPointerDown={beginAngle}
              onPointerMove={moveAngle}
              onPointerUp={endAngle}
              onPointerCancel={cancelAngle}
            >
              <rect x={-58} y={-22} width={116} height={44} fill="transparent" />
              <rect x={-52} y={-17} width={104} height={34} rx={17} className="handle-pill" />
              <text x={0} y={4} textAnchor="middle" className="svg-text svg-text-small" fill="var(--ink-muted)">↔ 转动线圈</text>
            </g>
          ) : null}

          {layers.magnitude ? (
            <g>
              <text x={18} y={size.height - 46} className="svg-text svg-text-small" fill="var(--ink-soft)">
                Φ {formatSI(snapshot.phiWb, 'Wb')} · ε {snapshot.emfV === null ? '—' : formatSI(snapshot.emfV, 'V')} · I {snapshot.currentA === null ? '—' : formatSI(snapshot.currentA, 'A')}
              </text>
              <text x={18} y={size.height - 26} className="svg-text svg-text-small" fill="var(--ink-muted)">
                A {formatArea(snapshot.areaM2)} · θ {formatNumber((snapshot.thetaRad * 180) / Math.PI, 1)}° · {snapshot.derivativeQuality === 'estimated' ? '导数为手势估算' : snapshot.derivativeQuality === 'undefined' ? '导数不可用' : '解析驱动'}
              </text>
            </g>
          ) : null}
          {layers.rates ? (
            <g>
              <text x={18} y={size.height - 68} className="svg-text svg-text-small" fill="var(--ink-muted)">
                dB/dt {formatNumber(snapshot.dBdt, 3)} T/s · dA/dt {formatNumber(snapshot.dAdt, 4)} m²/s · dθ/dt {formatNumber(snapshot.dThetaDt, 3)} rad/s
              </text>
            </g>
          ) : null}
        </svg>

        <div className="stage-hud" aria-hidden="true">
          <span className="hud-chip hud-field">{fieldOut ? '⊙' : '×'} B {formatSI(snapshot.Bz, 'T')} · {answerHidden ? '方向已遮蔽' : '楞次方向可见'}</span>
          <span className="hud-chip">{modeLabel} · {driveAuto ? '自动' : '手动'}</span>
          <span className="hud-chip">{snapshot.circuitClosed ? (hasCurrent ? currentAngleLabel : '闭合 · I=0') : '开路 · I=0'}</span>
          <span className="hud-chip">历史 {historyCount} 点</span>
        </div>

        {fieldDragging || areaDragging || angleDragging ? (
          <div className="stage-drag-hint">拖动中 · 实时记录时间戳；松手后由外部约束停止</div>
        ) : null}
        {notice ? <div className="stage-alert" role="status" data-testid="i01-notice">{notice}</div> : null}
        {answersHidden ? (
          <div className="condition-notice" role="status" data-testid="i01-answer-masked">
            当前遮蔽电流/感应场方向，请先预测再揭示。
          </div>
        ) : null}
        <span hidden data-testid="i01-bz-value">{snapshot.Bz}</span>
        <span hidden data-testid="i01-area-value">{snapshot.areaM2}</span>
        <span hidden data-testid="i01-theta-value">{snapshot.thetaRad}</span>
        <span hidden data-testid="i01-flux-value">{snapshot.phiWb}</span>
        <span hidden data-testid="i01-emf-value">{snapshot.emfV ?? ''}</span>
        <span hidden data-testid="i01-current-value">{snapshot.currentA ?? ''}</span>
        <span hidden data-testid="i01-current-sense">{snapshot.currentSense}</span>
        <span hidden data-testid="i01-induced-field-value">{snapshot.inducedFieldDirection}</span>
        <span hidden data-testid="i01-direction-label">{currentAngleLabel} · {inducedLabel}</span>
      </div>
      <StageLegend
        items={[
          { label: '正法向 +n', color: 'var(--flux)', variant: 'solid' },
          { label: '感应电流 I', color: 'var(--current)', variant: 'solid' },
          { label: '感应场 B_ind', color: 'var(--flux-strong)', variant: 'dashed' },
          { label: '外磁场 B', color: 'var(--field)', variant: 'field' },
          { label: '有效磁通面积', color: 'var(--flux)', variant: 'dashed' },
        ]}
      />
    </div>
  );
}
