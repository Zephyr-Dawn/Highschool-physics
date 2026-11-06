import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatNumber, formatSI } from '../../lib/format';
import { clamp } from '../../physics/core/vec2';
import {
  i07WallLimit,
  type I07Event,
  type I07Params,
  type I07Snapshot,
  type I07Solution,
} from '../../physics/induction/oppositeFieldsWallLoop';
import type { I07Layers } from './i07Scene';

interface I07StageProps {
  params: I07Params;
  solution: I07Solution;
  snapshot: I07Snapshot;
  history: I07Snapshot[];
  layers: I07Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  manualMode: boolean;
  manualEnabled: boolean;
  manualDragging: boolean;
  onManualStart: (xM: number) => void;
  onManualChange: (xM: number) => void;
  onManualEnd: () => void;
  onManualCancel: () => void;
  conditionNotice: string | null;
}

const B_SIGN_COLORS = { positive: '#2563eb', negative: '#dc2626' };

function glyphGrid(
  toScreen: (point: { x: number; y: number }) => { x: number; y: number },
  left: number,
  right: number,
  minY: number,
  maxY: number,
  step: number,
): Array<{ x: number; y: number }> {
  const items: Array<{ x: number; y: number }> = [];
  const startX = Math.ceil(left / step) * step;
  const startY = Math.ceil(minY / step) * step;
  for (let x = startX; x <= right; x += step) {
    for (let y = startY; y <= maxY; y += step) {
      items.push(toScreen({ x, y }));
      if (items.length > 260) return items;
    }
  }
  return items;
}

function eventLabel(event: I07Event): string {
  if (event.kind === 'wall-bounce') return '反弹';
  if (event.kind === 'wall-held') return '压墙';
  if (event.kind === 'wall-stop') return '挡板停止';
  if (event.kind === 'turning') return '速度过零';
  if (event.kind === 'geometry') return '场界';
  if (event.kind === 'start') return '起点';
  return '结束';
}

export function I07Stage({
  params,
  solution,
  snapshot,
  history,
  layers,
  stageMode,
  onStageModeChange,
  manualMode,
  manualEnabled,
  manualDragging,
  onManualStart,
  onManualChange,
  onManualEnd,
  onManualCancel,
  conditionNotice,
}: I07StageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 900, height: 520 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [interacting, setInteracting] = useState(false);
  const drag = useRef<{ pointerId: number; grabX: number; startX: number } | null>(null);
  const lastFit = useRef<string | null>(null);

  const wallLimit = i07WallLimit(params);
  const xs = [params.field1LeftM, params.field1RightM, params.field2LeftM, params.field2RightM, params.startXM, ...history.map((item) => item.xM)];
  if (wallLimit !== null) xs.push(wallLimit, params.wallXM);
  const bounds = useMemo<StageBounds>(() => {
    const minX = Math.min(...xs, params.startXM) - 0.35;
    const maxX = Math.max(...xs.map((x) => x + params.widthM), params.startXM + params.widthM) + 0.35;
    const halfY = Math.max(params.heightM * 0.9, 0.3);
    return { minX, minY: -halfY, maxX, maxY: halfY };
  }, [params.heightM, params.startXM, params.widthM, xs]);
  const fitSignature = `${params.field1LeftM}|${params.field1RightM}|${params.field2LeftM}|${params.field2RightM}|${params.widthM}|${params.heightM}|${params.startXM}|${wallLimit ?? 'none'}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

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
  const showAnswers = !layers.maskAnswers;

  const region1Left = toScreen({ x: params.field1LeftM, y: 0 }).x;
  const region1Right = toScreen({ x: params.field1RightM, y: 0 }).x;
  const region2Left = toScreen({ x: params.field2LeftM, y: 0 }).x;
  const region2Right = toScreen({ x: params.field2RightM, y: 0 }).x;
  const wallScreenX = wallLimit === null ? null : toScreen({ x: params.wallXM, y: 0 }).x;
  const wallLimitScreenX = wallLimit === null ? null : toScreen({ x: wallLimit, y: 0 }).x;

  const fieldStep = Math.max(0.08, 68 / Math.max(1, view.scale));
  const viewTopLeft = toWorld({ x: 0, y: 0 });
  const viewBottomRight = toWorld({ x: size.width, y: size.height });
  const minVisibleY = Math.min(viewTopLeft.y, viewBottomRight.y);
  const maxVisibleY = Math.max(viewTopLeft.y, viewBottomRight.y);
  const glyphs1 = useMemo(
    () =>
      layers.field && Math.abs(params.field1Bz) > 1e-15
        ? glyphGrid(toScreen, params.field1LeftM, params.field1RightM, minVisibleY, maxVisibleY, fieldStep)
        : [],
    [fieldStep, layers.field, maxVisibleY, minVisibleY, params.field1Bz, params.field1LeftM, params.field1RightM, toScreen],
  );
  const glyphs2 = useMemo(
    () =>
      layers.field && Math.abs(params.field2Bz) > 1e-15
        ? glyphGrid(toScreen, params.field2LeftM, params.field2RightM, minVisibleY, maxVisibleY, fieldStep)
        : [],
    [fieldStep, layers.field, maxVisibleY, minVisibleY, params.field2Bz, params.field2LeftM, params.field2RightM, toScreen],
  );

  const trail = useMemo(() => {
    if (!layers.overlap || history.length < 2) return '';
    return history
      .map((item, index) => {
        const point = toScreen({ x: item.xM + params.widthM / 2, y: 0 });
        return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      })
      .join(' ');
  }, [history, layers.overlap, params.widthM, toScreen]);

  const overlap1 = Math.max(0, Math.min(snapshot.xM + params.widthM, params.field1RightM) - Math.max(snapshot.xM, params.field1LeftM));
  const overlap2 = Math.max(0, Math.min(snapshot.xM + params.widthM, params.field2RightM) - Math.max(snapshot.xM, params.field2LeftM));
  const overlap1Screen = overlap1 > 1e-9
    ? {
        x1: toScreen({ x: Math.max(snapshot.xM, params.field1LeftM), y: 0 }).x,
        x2: toScreen({ x: Math.min(snapshot.xM + params.widthM, params.field1RightM), y: 0 }).x,
      }
    : null;
  const overlap2Screen = overlap2 > 1e-9
    ? {
        x1: toScreen({ x: Math.max(snapshot.xM, params.field2LeftM), y: 0 }).x,
        x2: toScreen({ x: Math.min(snapshot.xM + params.widthM, params.field2RightM), y: 0 }).x,
      }
    : null;

  const current = snapshot.currentA ?? 0;
  const hasCurrent = params.circuitClosed && Math.abs(current) > 1e-12;
  const arrowHalf = Math.min(18, loopW / 5, loopH / 5);
  const currentArrows = useMemo(() => {
    if (!hasCurrent) return [];
    const positive = current > 0;
    const topY = loopY;
    const bottomY = loopY + loopH;
    const leftX = loopX;
    const rightX = loopX + loopW;
    const midX = loopCenterX;
    const midY = loopCenterY;
    if (positive) {
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
  }, [arrowHalf, current, hasCurrent, loopCenterX, loopCenterY, loopH, loopW, loopX, loopY]);

  const velocityLength = clamp(24, 96, 28 + Math.min(64, Math.abs(snapshot.velocityMps) * 22));
  const magneticForce = snapshot.magneticForceN ?? 0;
  const externalForce = params.mode === 'prescribed'
    ? -(magneticForce)
    : params.mode === 'forces'
      ? params.externalForceN
      : null;
  const magneticLength = clamp(0, 96, Math.min(96, Math.abs(magneticForce) * 18));
  const externalLength = externalForce === null ? 0 : clamp(0, 96, Math.min(96, Math.abs(externalForce) * 18));

  const occurredEvents = solution.events.filter(
    (event) => event.timeS <= snapshot.timeS + 1e-9 && event.kind !== 'start' && event.kind !== 'end',
  );

  const startDrag = (event: React.PointerEvent<SVGRectElement>) => {
    if (!manualMode || !manualEnabled || stageMode !== 'interact') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    drag.current = { pointerId: event.pointerId, grabX: world.x, startX: snapshot.xM };
    setInteracting(true);
    onManualStart(snapshot.xM);
  };

  const moveDrag = (event: React.PointerEvent<SVGRectElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const world = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const raw = active.startX + (world.x - active.grabX);
    const upper = wallLimit === null ? 1e6 : wallLimit;
    onManualChange(clamp(raw, -1e6, upper));
  };

  const endDrag = (event: React.PointerEvent<SVGRectElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setInteracting(false);
    onManualEnd();
  };

  const cancelDrag = (event: React.PointerEvent<SVGRectElement>) => {
    if (!drag.current) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setInteracting(false);
    onManualCancel();
  };

  return (
    <div className="stage-card i07-stage-card" ref={ref} data-testid="i07-stage">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.22)}
        onZoomOut={() => zoomBy(1 / 1.22)}
        extra={
          manualMode ? (
            <span className={`stage-status-pill ${manualDragging ? 'is-warn' : ''}`}>
              {manualDragging ? '正在拖动线框：速度来自时间戳' : '手动模式：一指拖线框，松手外部保持静止'}
            </span>
          ) : null
        }
      />
      <div className="stage-wrap">
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          data-testid="i07-stage-svg"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label="相反磁场双区域、运动线框与挡板实验舞台"
          {...stageHandlers}
        >
          <defs>
            <marker id="i07-arrow-current" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--current)" />
            </marker>
            <marker id="i07-arrow-velocity" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--velocity)" />
            </marker>
            <marker id="i07-arrow-force" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--force)" />
            </marker>
            <marker id="i07-arrow-external" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
            </marker>
          </defs>
          <rect x={0} y={0} width={size.width} height={size.height} fill="var(--surface-2)" />

          {layers.field ? (
            <>
              {Math.abs(params.field1Bz) > 1e-12 ? (
                <rect
                  x={Math.min(region1Left, region1Right)}
                  y={8}
                  width={Math.abs(region1Right - region1Left)}
                  height={size.height - 16}
                  fill={params.field1Bz >= 0 ? B_SIGN_COLORS.positive : B_SIGN_COLORS.negative}
                  opacity={0.08}
                />
              ) : null}
              {Math.abs(params.field2Bz) > 1e-12 ? (
                <rect
                  x={Math.min(region2Left, region2Right)}
                  y={8}
                  width={Math.abs(region2Right - region2Left)}
                  height={size.height - 16}
                  fill={params.field2Bz >= 0 ? B_SIGN_COLORS.positive : B_SIGN_COLORS.negative}
                  opacity={0.08}
                />
              ) : null}
              {glyphs1.map((point, index) => (
                <text key={`g1-${index}`} x={point.x} y={point.y} textAnchor="middle" className="field-glyph" fill={B_SIGN_COLORS.positive}>
                  {params.field1Bz >= 0 ? '⊙' : '×'}
                </text>
              ))}
              {glyphs2.map((point, index) => (
                <text key={`g2-${index}`} x={point.x} y={point.y} textAnchor="middle" className="field-glyph" fill={B_SIGN_COLORS.negative}>
                  {params.field2Bz >= 0 ? '⊙' : '×'}
                </text>
              ))}
            </>
          ) : null}

          {wallScreenX !== null && layers.wall ? (
            <g data-testid="i07-wall">
              <line x1={wallScreenX} x2={wallScreenX} y1={16} y2={size.height - 16} stroke="var(--ink)" strokeWidth={6} />
              {wallLimitScreenX !== null ? (
                <line x1={wallLimitScreenX} x2={wallLimitScreenX} y1={16} y2={size.height - 16} stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="5 4" />
              ) : null}
              <text x={wallScreenX - 8} y={48} textAnchor="end" className="stage-label">
                挡板 x={formatNumber(params.wallXM, 2)} m · e={formatNumber(params.restitution, 2)}（左边缘 x={formatNumber(wallLimit ?? 0, 2)} m 时接触）
              </text>
            </g>
          ) : null}

          {layers.field ? (
            <>
              <text x={(region1Left + region1Right) / 2} y={26} textAnchor="middle" className="stage-label">
                B₁ = {formatNumber(params.field1Bz, 2)} T {Math.abs(params.field1Bz) > 1e-12 ? (params.field1Bz >= 0 ? '⊙' : '×') : '（无场）'}
              </text>
              <text x={(region2Left + region2Right) / 2} y={26} textAnchor="middle" className="stage-label">
                B₂ = {formatNumber(params.field2Bz, 2)} T {Math.abs(params.field2Bz) > 1e-12 ? (params.field2Bz >= 0 ? '⊙' : '×') : '（无场）'}
              </text>
            </>
          ) : null}

          {trail ? <path d={trail} className="i07-trail" fill="none" /> : null}

          {layers.overlap && overlap1Screen ? (
            <rect
              x={Math.min(overlap1Screen.x1, overlap1Screen.x2)}
              y={loopY}
              width={Math.abs(overlap1Screen.x2 - overlap1Screen.x1)}
              height={loopH}
              fill={params.field1Bz >= 0 ? B_SIGN_COLORS.positive : B_SIGN_COLORS.negative}
              opacity={0.16}
            />
          ) : null}
          {layers.overlap && overlap2Screen ? (
            <rect
              x={Math.min(overlap2Screen.x1, overlap2Screen.x2)}
              y={loopY}
              width={Math.abs(overlap2Screen.x2 - overlap2Screen.x1)}
              height={loopH}
              fill={params.field2Bz >= 0 ? B_SIGN_COLORS.positive : B_SIGN_COLORS.negative}
              opacity={0.16}
            />
          ) : null}

          <rect
            x={loopX}
            y={loopY}
            width={loopW}
            height={loopH}
            rx={4}
            className={`i07-loop ${manualMode ? 'is-manual' : ''}`}
            data-testid="i07-loop"
            data-x={snapshot.xM.toFixed(9)}
            data-v={snapshot.velocityMps.toFixed(9)}
            data-s={snapshot.S.toFixed(9)}
            data-flux={snapshot.fluxWb.toFixed(9)}
            data-emf={snapshot.emfV.toFixed(9)}
            data-current={snapshot.currentA === null ? '' : snapshot.currentA.toFixed(9)}
            data-joule={snapshot.jouleHeatJ.toFixed(9)}
            data-impact={snapshot.impactLossJ.toFixed(9)}
            data-status={snapshot.status}
          />

          {currentArrows.map((arrow, index) => (
            <line
              key={`i-${index}`}
              x1={arrow.x1}
              y1={arrow.y1}
              x2={arrow.x2}
              y2={arrow.y2}
              stroke="var(--current)"
              strokeWidth={2.6}
              markerEnd="url(#i07-arrow-current)"
              data-testid={index === 0 ? 'i07-current-arrow' : undefined}
            />
          ))}

          {layers.velocity ? (
            <g>
              <line
                x1={loopCenterX}
                y1={loopCenterY}
                x2={loopCenterX + Math.sign(snapshot.velocityMps || 1) * velocityLength}
                y2={loopCenterY}
                stroke="var(--velocity)"
                strokeWidth={2.4}
                markerEnd="url(#i07-arrow-velocity)"
              />
              <text x={loopCenterX + Math.sign(snapshot.velocityMps || 1) * (velocityLength + 8)} y={loopCenterY - 8} textAnchor="middle" className="stage-label">
                v = {showAnswers ? `${formatNumber(snapshot.velocityMps, 2)} m/s` : '？'}
              </text>
            </g>
          ) : null}

          {layers.magneticForce && magneticLength > 2 ? (
            <g>
              <line
                x1={loopCenterX}
                y1={loopCenterY + 14}
                x2={loopCenterX + Math.sign(magneticForce) * magneticLength}
                y2={loopCenterY + 14}
                stroke="var(--force)"
                strokeWidth={2.2}
                markerEnd="url(#i07-arrow-force)"
              />
              <text x={loopCenterX + Math.sign(magneticForce) * (magneticLength + 8)} y={loopCenterY + 26} textAnchor="middle" className="stage-label">
                F_B {showAnswers ? `= ${formatNumber(magneticForce, 2)} N` : ''}
              </text>
            </g>
          ) : null}

          {layers.externalForce && externalForce !== null && externalLength > 2 ? (
            <g>
              <line
                x1={loopCenterX}
                y1={loopCenterY - 18}
                x2={loopCenterX + Math.sign(externalForce) * externalLength}
                y2={loopCenterY - 18}
                stroke="var(--accent)"
                strokeWidth={2.2}
                markerEnd="url(#i07-arrow-external)"
              />
              <text x={loopCenterX + Math.sign(externalForce) * (externalLength + 8)} y={loopCenterY - 28} textAnchor="middle" className="stage-label">
                F_ext {showAnswers ? `= ${formatNumber(externalForce, 2)} N` : ''}
              </text>
            </g>
          ) : null}

          {layers.events
            ? occurredEvents.map((event, index) => {
                const point = toScreen({ x: event.xM, y: 0 });
                const isWall = event.kind.startsWith('wall');
                return (
                  <g key={`event-${index}`} data-testid={isWall ? 'i07-bounce-marker' : 'i07-event-marker'}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={5}
                      fill={isWall ? 'var(--warning)' : 'var(--accent)'}
                      stroke="var(--surface)"
                      strokeWidth={1.5}
                    />
                    <text x={point.x} y={point.y - 10} textAnchor="middle" className="stage-label">
                      {eventLabel(event)}
                    </text>
                  </g>
                );
              })
            : null}

          {manualMode ? (
            <rect
              x={loopX - 14}
              y={loopY - 14}
              width={loopW + 28}
              height={loopH + 28}
              fill="transparent"
              className="i07-loop-hit"
              data-testid="i07-loop-hit"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
            />
          ) : null}
        </svg>

        {conditionNotice ? (
          <div className="stage-condition-notice" role="status" data-testid="i07-condition-notice">
            {conditionNotice}
          </div>
        ) : null}

        <div className="i07-hud">
          <div><span>Φ</span><strong>{formatSI(snapshot.fluxWb, 'Wb')}</strong></div>
          <div><span>S</span><strong>{showAnswers ? formatNumber(snapshot.S, 3) : '？'}</strong></div>
          <div><span>ε</span><strong>{showAnswers ? formatSI(snapshot.emfV, 'V') : '？'}</strong></div>
          <div><span>I</span><strong>{showAnswers ? formatSI(snapshot.currentA ?? 0, 'A') : '？'}</strong></div>
          <div><span>Q_J</span><strong>{formatSI(snapshot.jouleHeatJ, 'J')}</strong></div>
          <div><span>Q_impact</span><strong>{formatSI(snapshot.impactLossJ, 'J')}</strong></div>
        </div>

        <StageLegend
          items={[
            { color: B_SIGN_COLORS.positive, label: 'B 出纸面 ⊙ / 正磁区' },
            { color: B_SIGN_COLORS.negative, label: 'B 入纸面 × / 负磁区' },
            { color: 'var(--current)', label: '感应电流方向' },
            { color: 'var(--velocity)', label: '线框速度' },
            { color: 'var(--force)', label: '安培力' },
            { color: 'var(--accent)', label: '外力 / 场界事件' },
          ]}
        />
      </div>
    </div>
  );
}
