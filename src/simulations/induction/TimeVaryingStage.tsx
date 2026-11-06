import { useEffect, useMemo, useRef, useState } from 'react';
import { clamp } from '../../physics/core/vec2';
import type { InductionSnapshot } from '../../physics/induction/timeVaryingField';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatLength, formatNumber, formatSI } from '../../lib/format';
import type { I04Params } from './timeVaryingParams';

export interface I04Layers {
  field: boolean;
  normal: boolean;
  flux: boolean;
  current: boolean;
  inducedField: boolean;
  dbdt: boolean;
}

export const I04_DEFAULT_LAYERS: I04Layers = {
  field: true,
  normal: true,
  flux: true,
  current: true,
  inducedField: true,
  dbdt: true,
};

interface TimeVaryingStageProps {
  params: I04Params;
  snapshot: InductionSnapshot;
  timeS: number;
  playing: boolean;
  manualMode: boolean;
  manualEnabled: boolean;
  manualTargetBzTesla: number;
  manualLimited: boolean;
  layers: I04Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  onManualTarget: (target: number) => void;
  onManualBlocked: () => void;
}

const FIELD_MIN = -2;
const FIELD_MAX = 2;

function fieldGlyphs(
  toScreen: (point: { x: number; y: number }) => { x: number; y: number },
  toWorld: (point: { x: number; y: number }) => { x: number; y: number },
  width: number,
  height: number,
  coilWidth: number,
  coilHeight: number,
  stepWorld: number,
): Array<{ x: number; y: number }> {
  const topLeft = toWorld({ x: 0, y: 0 });
  const bottomRight = toWorld({ x: width, y: height });
  const minX = Math.min(topLeft.x, bottomRight.x) - stepWorld;
  const maxX = Math.max(topLeft.x, bottomRight.x) + stepWorld;
  const minY = Math.min(topLeft.y, bottomRight.y) - stepWorld;
  const maxY = Math.max(topLeft.y, bottomRight.y) + stepWorld;
  const coilLeft = -coilWidth / 2;
  const coilRight = coilWidth / 2;
  const coilBottom = -coilHeight / 2;
  const coilTop = coilHeight / 2;
  const items: Array<{ x: number; y: number }> = [];
  const startX = Math.ceil(minX / stepWorld) * stepWorld;
  const startY = Math.ceil(minY / stepWorld) * stepWorld;
  for (let x = startX; x <= maxX; x += stepWorld) {
    for (let y = startY; y <= maxY; y += stepWorld) {
      if (x > coilLeft - stepWorld * 0.4 && x < coilRight + stepWorld * 0.4 &&
          y > coilBottom - stepWorld * 0.4 && y < coilTop + stepWorld * 0.4) {
        continue;
      }
      items.push(toScreen({ x, y }));
      if (items.length > 460) return items;
    }
  }
  return items;
}

export function TimeVaryingStage({
  params,
  snapshot,
  timeS,
  playing,
  manualMode,
  manualEnabled,
  manualTargetBzTesla,
  manualLimited,
  layers,
  stageMode,
  onStageModeChange,
  onManualTarget,
  onManualBlocked,
}: TimeVaryingStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 800, height: 480 });
  const { view, toScreen, toWorld, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const [leverDragging, setLeverDragging] = useState(false);
  const leverDrag = useRef<{ pointerId: number; startY: number; startB: number } | null>(null);
  const lastFitSignature = useRef<string | null>(null);

  const bounds = useMemo<StageBounds>(() => {
    const halfWidth = params.loopWidthM / 2 + 0.13;
    const halfHeight = params.loopHeightM / 2 + 0.13;
    return { minX: -halfWidth, maxX: halfWidth, minY: -halfHeight, maxY: halfHeight };
  }, [params.loopHeightM, params.loopWidthM]);
  const fitSignature = `${params.loopWidthM}|${params.loopHeightM}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

  useEffect(() => {
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 44);
  }, [bounds, fitBounds, fitSignature]);

  const fitNow = () => {
    lastFitSignature.current = fitSignature;
    fitBounds(bounds, 44);
  };

  const screenCenter = toScreen({ x: 0, y: 0 });
  const screenTopLeft = toScreen({ x: -params.loopWidthM / 2, y: params.loopHeightM / 2 });
  const screenBottomRight = toScreen({ x: params.loopWidthM / 2, y: -params.loopHeightM / 2 });
  const loopLeft = Math.min(screenTopLeft.x, screenBottomRight.x);
  const loopRight = Math.max(screenTopLeft.x, screenBottomRight.x);
  const loopTop = Math.min(screenTopLeft.y, screenBottomRight.y);
  const loopBottom = Math.max(screenTopLeft.y, screenBottomRight.y);
  const loopWidth = Math.max(10, loopRight - loopLeft);
  const loopHeight = Math.max(10, loopBottom - loopTop);

  const currentPositive = snapshot.currentA !== null && snapshot.currentA > 1e-12;
  const currentNegative = snapshot.currentA !== null && snapshot.currentA < -1e-12;
  const hasCurrent = currentPositive || currentNegative;
  const gapHalf = Math.min(loopWidth * 0.13, 30);
  const conductorPath = params.circuitClosed
    ? `M${loopLeft},${loopTop} H${loopRight} V${loopBottom} H${loopLeft} Z`
    : `M${loopLeft},${loopTop} H${screenCenter.x - gapHalf} M${screenCenter.x + gapHalf},${loopTop} H${loopRight} V${loopBottom} H${loopLeft} V${loopTop}`;

  const glyphStep = Math.max(0.035, 64 / Math.max(view.scale, 1));
  const glyphs = useMemo(() => {
    if (!layers.field) return [];
    return fieldGlyphs(
      toScreen,
      toWorld,
      size.width,
      size.height,
      params.loopWidthM,
      params.loopHeightM,
      glyphStep,
    );
  }, [
    glyphStep,
    layers.field,
    params.loopHeightM,
    params.loopWidthM,
    size.height,
    size.width,
    toScreen,
    toWorld,
  ]);

  const inward = loopWidth * 0.14;
  const arrowHalf = Math.min(22, loopWidth * 0.16, loopHeight * 0.22);
  const arrowEdges = useMemo(() => {
    if (!hasCurrent) return [];
    const ccw = currentPositive;
    const midX = (loopLeft + loopRight) / 2;
    const midY = (loopTop + loopBottom) / 2;
    const topY = loopTop + inward;
    const bottomY = loopBottom - inward;
    const leftX = loopLeft + inward;
    const rightX = loopRight - inward;
    return [
      {
        x1: midX + (ccw ? arrowHalf : -arrowHalf),
        y1: topY,
        x2: midX + (ccw ? -arrowHalf : arrowHalf),
        y2: topY,
      },
      {
        x1: rightX,
        y1: midY + (ccw ? arrowHalf : -arrowHalf),
        x2: rightX,
        y2: midY + (ccw ? -arrowHalf : arrowHalf),
      },
      {
        x1: midX + (ccw ? -arrowHalf : arrowHalf),
        y1: bottomY,
        x2: midX + (ccw ? arrowHalf : -arrowHalf),
        y2: bottomY,
      },
      {
        x1: leftX,
        y1: midY + (ccw ? -arrowHalf : arrowHalf),
        x2: leftX,
        y2: midY + (ccw ? arrowHalf : -arrowHalf),
      },
    ];
  }, [arrowHalf, currentPositive, hasCurrent, inward, loopBottom, loopLeft, loopRight, loopTop]);

  const manualPercent = clamp(((snapshot.bzTesla - FIELD_MIN) / (FIELD_MAX - FIELD_MIN)) * 100, 0, 100);
  const targetPercent = clamp(((manualTargetBzTesla - FIELD_MIN) / (FIELD_MAX - FIELD_MIN)) * 100, 0, 100);
  const leverHeight = clamp(Math.round(Math.min(250, size.height * 0.56)), 160, 250);

  const beginLever = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!manualMode || !manualEnabled || !playing) {
      onManualBlocked();
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    leverDrag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startB: snapshot.bzTesla,
    };
    setLeverDragging(true);
  };

  const moveLever = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = leverDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const target = clamp(
      drag.startB + ((drag.startY - event.clientY) / leverHeight) * (FIELD_MAX - FIELD_MIN),
      FIELD_MIN,
      FIELD_MAX,
    );
    onManualTarget(target);
  };

  const endLever = (event: React.PointerEvent<HTMLDivElement>) => {
    if (leverDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    leverDrag.current = null;
    setLeverDragging(false);
  };

  const dbdtLabel =
    snapshot.dbdt === null
      ? '折点'
      : Math.abs(snapshot.dbdt) < 1e-12
        ? '0 T/s'
        : `${formatNumber(snapshot.dbdt, 3)} T/s`;
  const bDirection = snapshot.bzTesla > 1e-12 ? 'out-of-page' : snapshot.bzTesla < -1e-12 ? 'into-page' : 'zero';
  const fieldLabel =
    bDirection === 'zero'
      ? 'B = 0'
      : `B ${formatNumber(Math.abs(snapshot.bzTesla), 3)} T · ${bDirection === 'out-of-page' ? '出纸面' : '入纸面'}`;
  const directionLabel =
    snapshot.currentDirection === 'undefined'
      ? '折点'
      : snapshot.currentDirection === 'none'
        ? '无感应电流'
        : currentPositive
          ? 'I 逆时针'
          : 'I 顺时针';

  return (
    <div className="stage-card i04-stage-card">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        extra={
          <span className="stage-toolbar-chip">
            {manualMode ? '手动调磁 · 1× 实时' : '预设波形'}
          </span>
        }
      />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="i04-stage"
        data-mode={manualMode ? 'manual' : 'waveform'}
        data-time-s={timeS}
        data-bz={snapshot.bzTesla}
        data-dbdt={snapshot.dbdt ?? 'kink'}
        data-emf={snapshot.emfV ?? 'kink'}
        data-current={snapshot.currentA ?? 'kink'}
        data-current-direction={snapshot.currentDirection}
        data-circuit-closed={params.circuitClosed}
        data-manual-target={manualTargetBzTesla}
        data-view-scale={view.scale.toFixed(3)}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`时变磁场中的静止线圈。${fieldLabel}；感应电动势 ${snapshot.emfV === null ? '折点不唯一' : formatSI(snapshot.emfV, 'V')}；${directionLabel}。`}
          data-testid="i04-stage-svg"
          {...stageHandlers}
        >
          <defs>
            <marker id="i04-current-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--current)" />
            </marker>
            <linearGradient id="i04-coil-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--surface)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--surface)" stopOpacity="0.55" />
            </linearGradient>
            <radialGradient id="i04-flux-fill" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="var(--flux-soft)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--flux-soft)" stopOpacity="0.3" />
            </radialGradient>
          </defs>

          <rect width={size.width} height={size.height} fill="transparent" />

          {layers.flux && Math.abs(snapshot.fluxPerTurnWb) > 1e-15 ? (
            <rect
              x={loopLeft}
              y={loopTop}
              width={loopWidth}
              height={loopHeight}
              fill="url(#i04-flux-fill)"
              opacity={clamp(0.22 + Math.abs(snapshot.bzTesla) / 2, 0.22, 1)}
              aria-hidden="true"
            />
          ) : null}

          {glyphs.map((glyph, index) => (
            <g
              key={index}
              transform={`translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`}
              opacity={bDirection === 'zero' ? 0.1 : 0.46}
              aria-hidden="true"
              data-testid={index === 0 ? 'i04-field-glyph' : undefined}
            >
              <circle r={6.6} fill="none" stroke="var(--field)" strokeWidth={1.1} />
              {bDirection !== 'into-page' ? (
                <circle r={1.9} fill="var(--field)" />
              ) : (
                <path d="M-2.8,-2.8L2.8,2.8M2.8,-2.8L-2.8,2.8" stroke="var(--field)" strokeWidth={1.25} />
              )}
            </g>
          ))}

          {layers.normal ? (
            <g transform={`translate(28 ${Math.max(96, size.height - 92)})`} aria-hidden="true">
              <circle r={13} fill="var(--surface)" stroke="var(--aux-strong)" strokeWidth={1.2} strokeDasharray="3 3" />
              <circle r={2.4} fill="var(--aux-strong)" />
              <text x={20} y={4} className="svg-text svg-text-small" fill="var(--aux-strong)">
                +z 法线（出纸面）
              </text>
            </g>
          ) : null}

          <path
            d={conductorPath}
            fill="none"
            stroke="var(--conductor)"
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          />
          <path
            d={conductorPath}
            fill="none"
            stroke="var(--conductor-light)"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.72}
            aria-hidden="true"
          />

          {!params.circuitClosed ? (
            <g aria-hidden="true" data-testid="i04-circuit-gap">
              <line
                x1={screenCenter.x - gapHalf}
                y1={loopTop}
                x2={screenCenter.x - 7}
                y2={loopTop - 18}
                stroke="var(--aux-strong)"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle cx={screenCenter.x + 7} cy={loopTop - 18} r={3.4} fill="var(--surface)" stroke="var(--aux-strong)" strokeWidth={2} />
              <text x={screenCenter.x} y={loopTop - 27} textAnchor="middle" className="svg-text svg-text-small" fill="var(--danger)">
                回路断开 · I = 0
              </text>
            </g>
          ) : null}

          {layers.current && hasCurrent
            ? arrowEdges.map((edge, index) => (
                <line
                  key={index}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke="var(--current)"
                  strokeWidth={2.8}
                  markerEnd="url(#i04-current-arrow)"
                  strokeLinecap="round"
                  aria-hidden="true"
                />
              ))
            : null}

          {layers.current && hasCurrent ? (
            <text
              x={screenCenter.x}
              y={loopTop + loopHeight * 0.5 + 4}
              textAnchor="middle"
              className="svg-text svg-text-small"
              fill="var(--current-strong)"
            >
              I {currentPositive ? '逆时针' : '顺时针'}
            </text>
          ) : null}

          {layers.inducedField && hasCurrent ? (
            <g transform={`translate(${loopRight + Math.min(90, size.width * 0.13)} ${screenCenter.y})`} aria-hidden="true" data-testid="i04-induced-field">
              <circle r={29} fill="none" stroke="var(--current)" strokeWidth={1.3} strokeDasharray="5 4" opacity={0.8} />
              <circle r={22} fill="var(--surface)" fillOpacity={0.66} />
              {currentPositive ? (
                <circle r={4} fill="var(--current)" />
              ) : (
                <path d="M-6,-6L6,6M6,-6L-6,6" stroke="var(--current)" strokeWidth={2.1} />
              )}
              <text x={0} y={40} textAnchor="middle" className="svg-text svg-text-small" fill="var(--current-strong)">
                感应磁场（定性）
              </text>
            </g>
          ) : null}

          {layers.flux ? (
            <text
              x={loopLeft}
              y={loopBottom + 22}
              className="svg-text svg-text-small"
              fill="var(--flux-strong)"
            >
              Φ = {formatSI(snapshot.fluxPerTurnWb, 'Wb')}
            </text>
          ) : null}

          {layers.dbdt ? (
            <g transform={`translate(${loopLeft} ${loopTop - 52})`} aria-hidden="true">
              <rect x={0} y={-15} width={156} height={24} rx={12} fill="var(--surface)" stroke="var(--line-strong)" opacity={0.92} />
              <text x={10} y={1} className="svg-text svg-text-small" fill={snapshot.dbdt === null ? 'var(--warning)' : 'var(--ink-muted)'}>
                dB/dt {dbdtLabel}
              </text>
            </g>
          ) : null}

          <g transform={`translate(${loopLeft} ${loopBottom + 46})`} aria-hidden="true">
            <text className="svg-text svg-text-small" fill="var(--ink-muted)">
              {formatLength(params.loopWidthM)} × {formatLength(params.loopHeightM)} · {params.turns} 匝等效
            </text>
          </g>

          <g transform={`translate(20 ${Math.max(56, size.height - 24)})`} aria-hidden="true">
            <line x1={0} y1={0} x2={82} y2={0} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <line x1={82} y1={-4} x2={82} y2={4} stroke="var(--ink-muted)" strokeWidth={2} />
            <text x={90} y={4} className="svg-text svg-text-small" fill="var(--ink-muted)">
              视野比例
            </text>
          </g>
        </svg>

        {manualMode ? (
          <div
            className={`i04-manual-lever ${manualEnabled && playing ? 'is-enabled' : 'is-disabled'} ${leverDragging ? 'is-dragging' : ''}`}
            style={{ height: leverHeight }}
            data-testid="i04-manual-lever"
          >
            <span className="i04-lever-title">手动 B</span>
            <span className="i04-lever-range">{FIELD_MAX} T</span>
            <div
              className="i04-lever-track"
              data-testid="i04-manual-track"
              onPointerDown={beginLever}
              onPointerMove={moveLever}
              onPointerUp={endLever}
              onPointerCancel={endLever}
            >
              <span className="i04-lever-hairline" style={{ bottom: `${targetPercent}%` }} aria-hidden="true" />
              <div
                className="i04-lever-handle-hit"
                style={{ bottom: `calc(${manualPercent}% - 26px)` }}
                role="slider"
                tabIndex={0}
                aria-label="手动调磁 B 控制柄"
                aria-valuemin={FIELD_MIN}
                aria-valuemax={FIELD_MAX}
                aria-valuenow={Number(snapshot.bzTesla.toFixed(3))}
                aria-valuetext={`${snapshot.bzTesla.toFixed(3)} T`}
                data-testid="i04-manual-handle-hit"
                onKeyDown={(event) => {
                  if (!manualEnabled || !playing) return;
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    const delta = event.key === 'ArrowUp' ? 0.08 : -0.08;
                    onManualTarget(clamp(snapshot.bzTesla + delta, FIELD_MIN, FIELD_MAX));
                  }
                }}
              >
                <span className="i04-lever-handle" />
              </div>
            </div>
            <span className="i04-lever-range">{FIELD_MIN} T</span>
            <span className="i04-lever-value">{formatNumber(snapshot.bzTesla, 2)} T</span>
            <span className="i04-lever-target">目标 {formatNumber(manualTargetBzTesla, 2)} T</span>
            {manualLimited ? <span className="i04-lever-limited">已限速</span> : null}
          </div>
        ) : null}

        <div className="stage-hud">
          <span className="hud-chip hud-field">
            <span className="hud-glyph">{bDirection === 'into-page' ? '×' : bDirection === 'out-of-page' ? '⊙' : '0'}</span>
            {fieldLabel}
          </span>
          <span className="hud-chip">{manualMode ? '手动模式' : '预设波形'}</span>
          <span className="hud-chip hud-chip-quiet">
            {params.circuitClosed ? '回路闭合' : '回路断开'}
          </span>
          <span className="hud-chip" data-testid="i04-current-direction">
            {directionLabel}
          </span>
        </div>

        <div className="stage-drag-hint">
          {manualMode
            ? playing
              ? '上下拖动右侧 B 手柄 · 双指缩放不会改变 B'
              : '暂停中不记录手动调磁 · 按播放后拖动 B 手柄'
            : '播放中修改波形参数会从新配置重新演示 · 双指缩放 / 平移'}
        </div>
      </div>

      <StageLegend
        items={[
          { label: '外加磁场 B（⊙ 出 / × 入）', color: 'var(--field)', variant: 'field' },
          { label: '单匝磁通量 Φ', color: 'var(--flux)', variant: 'dashed' },
          { label: '感应电流 I', color: 'var(--current)', variant: 'solid' },
          { label: '感应磁场（定性）', color: 'var(--current)', variant: 'dashed' },
          { label: '回路法线 +z', color: 'var(--aux-strong)', variant: 'dashed' },
        ]}
      />
      <span hidden data-testid="i04-b-value">{snapshot.bzTesla}</span>
      <span hidden data-testid="i04-dbdt-value">{snapshot.dbdt ?? 'kink'}</span>
      <span hidden data-testid="i04-emf-value">{snapshot.emfV ?? 'kink'}</span>
      <span hidden data-testid="i04-current-value">{snapshot.currentA ?? 'kink'}</span>
      <span hidden data-testid="i04-mode-value">{manualMode ? 'manual' : 'waveform'}</span>
    </div>
  );
}
