import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView, type StageBounds } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatNumber, formatSI } from '../../lib/format';
import { clamp } from '../../physics/core/vec2';
import type { GeneratorParams, GeneratorSnapshot } from '../../physics/induction/acGenerator';
import type { I08Layers, I08Mode } from './i08Scene';

interface I08StageProps {
  params: GeneratorParams;
  mode: I08Mode;
  snapshot: GeneratorSnapshot;
  history: GeneratorSnapshot[];
  layers: I08Layers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  manualEnabled: boolean;
  manualDragging: boolean;
  onManualStart: (thetaRad: number) => void;
  onManualChange: (thetaRad: number) => void;
  onManualEnd: () => void;
  onManualCancel: () => void;
  conditionNotice: string | null;
}

const B_COLOR = '#2563eb';
const NORMAL_COLOR = '#7e22ce';
const CURRENT_COLOR = '#b45309';
const LOAD_COLOR = '#0f766e';

function project(x: number, y: number, z: number) {
  return { x: x + 0.42 * z, y: y - 0.28 * z };
}

function arrow(x1: number, y1: number, x2: number, y2: number, color: string, marker: string, width = 2) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} markerEnd={`url(#${marker})`} />;
}

export function I08Stage({
  params,
  mode,
  snapshot,
  history,
  layers,
  stageMode,
  onStageModeChange,
  manualEnabled,
  manualDragging,
  onManualStart,
  onManualChange,
  onManualEnd,
  onManualCancel,
  conditionNotice,
}: I08StageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 900, height: 520 });
  const { toScreen, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
    initialScale: 220,
  });
  const [interacting, setInteracting] = useState(false);
  const dialDrag = useRef<{ pointerId: number } | null>(null);
  const lastFit = useRef<string | null>(null);
  const fitSignature = `${params.areaM2}|${params.turns}|${size.width.toFixed(0)}x${size.height.toFixed(0)}`;

  useEffect(() => {
    if (interacting || lastFit.current === fitSignature) return;
    lastFit.current = fitSignature;
    const bounds: StageBounds = { minX: -1.25, maxX: 1.25, minY: -0.95, maxY: 0.95 };
    fitBounds(bounds, 40);
  }, [fitBounds, fitSignature, interacting]);

  const fitNow = () => {
    lastFit.current = fitSignature;
    fitBounds({ minX: -1.25, maxX: 1.25, minY: -0.95, maxY: 0.95 }, 40);
  };

  const coilScale = clamp(0.25 + 0.9 * Math.sqrt(Math.max(0, params.areaM2)), 0.3, 0.82);
  const theta = snapshot.thetaRad;
  const u = { x: -Math.sin(theta), z: Math.cos(theta) };
  const n = { x: Math.cos(theta), z: Math.sin(theta) };
  const center = project(0, 0, 0);
  const corner = (su: number, sv: number) => {
    const world = project(u.x * coilScale * su, coilScale * sv, u.z * coilScale * su);
    return toScreen(world);
  };
  const c1 = corner(1, 1);
  const c2 = corner(-1, 1);
  const c3 = corner(-1, -1);
  const c4 = corner(1, -1);
  const coilPath = `M${c1.x},${c1.y} L${c2.x},${c2.y} L${c3.x},${c3.y} L${c4.x},${c4.y} Z`;
  const centerScreen = toScreen(center);
  const normalEnd = toScreen(project(n.x * coilScale * 1.75, 0, n.z * coilScale * 1.75));
  const current = snapshot.currentA ?? 0;
  const hasCurrent = params.circuitClosed && Math.abs(current) > 1e-12;
  const topStart = hasCurrent && current > 0 ? c2 : c1;
  const topEnd = hasCurrent && current > 0 ? c1 : c2;

  const glyphs = useMemo(() => {
    const items: Array<{ x: number; y: number }> = [];
    for (let ix = -2; ix <= 2; ix++) {
      for (let iy = -2; iy <= 2; iy++) {
        const point = toScreen(project(ix * 0.36, iy * 0.3, 0));
        items.push(point);
      }
    }
    return items;
  }, [toScreen]);

  const trail = useMemo(() => {
    if (history.length < 2) return '';
    return history
      .map((sample, index) => {
        const t = sample.thetaRad;
        const point = toScreen(project(Math.cos(t) * coilScale * 1.35, 0, Math.sin(t) * coilScale * 1.35));
        return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      })
      .join(' ');
  }, [coilScale, history, toScreen]);

  const dial = { x: 92, y: 112, r: 62 };
  const dialAngle = snapshot.thetaWrappedRad;
  const dialHandle = {
    x: dial.x + Math.cos(dialAngle) * dial.r,
    y: dial.y - Math.sin(dialAngle) * dial.r,
  };

  const localAngle = (event: React.PointerEvent<SVGElement>) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return 0;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const raw = Math.atan2(dial.y - y, x - dial.x);
    return raw < 0 ? raw + 2 * Math.PI : raw;
  };

  const startDrag = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!manualEnabled || stageMode !== 'interact') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dialDrag.current = { pointerId: event.pointerId };
    setInteracting(true);
    onManualStart(localAngle(event));
  };

  const moveDrag = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!dialDrag.current || dialDrag.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    onManualChange(localAngle(event));
  };

  const endDrag = (event: React.PointerEvent<SVGCircleElement>) => {
    if (dialDrag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dialDrag.current = null;
    setInteracting(false);
    onManualEnd();
  };

  const cancelDrag = () => {
    dialDrag.current = null;
    setInteracting(false);
    onManualCancel();
  };

  const handleCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dialDrag.current && dialDrag.current.pointerId !== event.pointerId) cancelDrag();
  };

  const stageHandlersWithCancel = {
    ...stageHandlers,
    onPointerDownCapture: handleCapture,
  };

  const showAnswers = !layers.maskAnswers;
  const clean = (value: number) => (Math.abs(value) < 1e-12 ? 0 : value);

  return (
    <div className="stage-card i08-stage-card" ref={ref} data-testid="i08-stage" data-mode={mode} data-theta={snapshot.thetaRad.toFixed(9)} data-omega={snapshot.omegaRadPerS.toFixed(9)} data-flux={snapshot.fluxWb.toFixed(9)} data-emf={snapshot.emfV.toFixed(9)} data-current={snapshot.currentA === null ? '' : snapshot.currentA.toFixed(9)} data-closed={params.circuitClosed ? 'true' : 'false'} data-status={snapshot.status}>
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={fitNow}
        onZoomIn={() => zoomBy(1.22)}
        onZoomOut={() => zoomBy(1 / 1.22)}
        extra={
          mode === 'manual' ? (
            <span className={`stage-status-pill ${manualDragging ? 'is-warn' : ''}`}>
              {manualDragging ? '正在转动：ω 来自真实时间戳估计' : '手动模式：转动左下角手柄，松手 ω→0'}
            </span>
          ) : (
            <span className="stage-status-pill">自动匀速：θ=θ₀+ωt</span>
          )
        }
      />
      <div className="stage-wrap">
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label="交流发电机：转动线圈、磁场与负载"
          data-testid="i08-stage-svg"
          {...stageHandlersWithCancel}
        >
          <defs>
            <marker id="i08-arrow-b" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={B_COLOR} />
            </marker>
            <marker id="i08-arrow-n" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={NORMAL_COLOR} />
            </marker>
            <marker id="i08-arrow-i" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={CURRENT_COLOR} />
            </marker>
            <marker id="i08-arrow-load" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={LOAD_COLOR} />
            </marker>
          </defs>
          <rect x={0} y={0} width={size.width} height={size.height} fill="var(--surface-2)" />

          {layers.field ? (
            <g opacity={0.55}>
              {glyphs.map((point, index) => (
                <g key={`b-${index}`}>
                  {arrow(
                    point.x - Math.sign(params.bTesla || 1) * 9,
                    point.y,
                    point.x + Math.sign(params.bTesla || 1) * 9,
                    point.y,
                    B_COLOR,
                    'i08-arrow-b',
                    1.2,
                  )}
                </g>
              ))}
              <text x={16} y={24} className="stage-label" fill={B_COLOR}>
                B = {formatNumber(params.bTesla, 3)} T（+x 参考方向）
              </text>
            </g>
          ) : null}

          {layers.coil ? (
            <>
              {trail ? <path d={trail} fill="none" stroke="rgba(126,34,206,.28)" strokeDasharray="4 4" /> : null}
              <path d={coilPath} fill="rgba(255,255,255,.5)" stroke="var(--ink)" strokeWidth={3} data-testid="i08-coil" />
              <text x={centerScreen.x} y={centerScreen.y + 4} textAnchor="middle" className="stage-label">
                {params.turns} 匝 · A={formatNumber(params.areaM2, 3)} m²
              </text>
            </>
          ) : null}

          {layers.normal ? (
            <g data-testid="i08-normal">
              {arrow(centerScreen.x, centerScreen.y, normalEnd.x, normalEnd.y, NORMAL_COLOR, 'i08-arrow-n', 2.2)}
              <text x={normalEnd.x + 6} y={normalEnd.y - 6} className="stage-label" fill={NORMAL_COLOR}>n</text>
            </g>
          ) : null}

          {hasCurrent && layers.current ? (
            <g data-testid="i08-current-arrow">
              {arrow(topStart.x, topStart.y, topEnd.x, topEnd.y, CURRENT_COLOR, 'i08-arrow-i', 2.8)}
              <text x={(topStart.x + topEnd.x) / 2} y={(topStart.y + topEnd.y) / 2 - 10} textAnchor="middle" className="stage-label" fill={CURRENT_COLOR}>
                I {showAnswers ? `= ${formatNumber(current, 4)} A` : ''}
              </text>
            </g>
          ) : null}

          {layers.load ? (
            <g data-testid="i08-load">
              <rect x={size.width - 190} y={size.height - 120} width={164} height={84} rx={12} fill="var(--surface)" stroke="var(--line-strong)" />
              <text x={size.width - 108} y={size.height - 96} textAnchor="middle" className="stage-label">
                R_L = {formatNumber(params.loadResistanceOhm, 2)} Ω
              </text>
              <text x={size.width - 108} y={size.height - 78} textAnchor="middle" className="stage-label">
                r = {formatNumber(params.internalResistanceOhm, 2)} Ω
              </text>
              <text x={size.width - 108} y={size.height - 58} textAnchor="middle" className="stage-label" fill={params.circuitClosed ? 'var(--success)' : 'var(--danger)'} data-testid="i08-switch-state">
                {params.circuitClosed ? '闭合 · 滑环输出交流' : '断开 · 无回路电流'}
              </text>
              <line x1={centerScreen.x + 20} y1={centerScreen.y + coilScale * 90} x2={size.width - 200} y2={size.height - 78} stroke={LOAD_COLOR} strokeWidth={1.5} strokeDasharray={params.circuitClosed ? undefined : '5 4'} />
              {!params.circuitClosed ? <text x={size.width - 228} y={size.height - 86} textAnchor="end" className="stage-label" fill="var(--danger)">断口</text> : null}
            </g>
          ) : null}

          {mode === 'manual' ? (
            <g data-testid="i08-angle-dial">
              <circle cx={dial.x} cy={dial.y} r={dial.r} fill="rgba(255,255,255,.78)" stroke="var(--line-strong)" />
              <line x1={dial.x} y1={dial.y} x2={dial.x + dial.r} y2={dial.y} stroke={B_COLOR} strokeWidth={2} />
              <line
                x1={dial.x}
                y1={dial.y}
                x2={dial.x + Math.cos(dialAngle) * dial.r}
                y2={dial.y - Math.sin(dialAngle) * dial.r}
                stroke={NORMAL_COLOR}
                strokeWidth={2.4}
                markerEnd="url(#i08-arrow-n)"
              />
              <text x={dial.x + 6} y={dial.y + 16} className="stage-label" fill={B_COLOR}>B</text>
              <text x={dial.x - 14} y={dial.y - 18} className="stage-label" fill={NORMAL_COLOR}>n</text>
              <circle
                cx={dialHandle.x}
                cy={dialHandle.y}
                r={22}
                fill="transparent"
                className="i08-angle-handle-hit"
                data-testid="i08-angle-handle"
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
              />
              <circle cx={dialHandle.x} cy={dialHandle.y} r={10} fill="var(--warning)" pointerEvents="none" />
              <text x={dial.x} y={dial.y - dial.r - 10} textAnchor="middle" className="stage-label">
                θ = {formatNumber((snapshot.thetaWrappedRad * 180) / Math.PI, 1)}°（法线与 B）
              </text>
            </g>
          ) : null}

          <g>
            <text x={size.width - 16} y={24} textAnchor="end" className="stage-label">
              {snapshot.periodS === null ? 'T = N/A · f = N/A' : `T = ${formatNumber(snapshot.periodS, 4)} s · f = ${formatNumber(snapshot.frequencyHz ?? 0, 4)} Hz`}
            </text>
            <text x={size.width - 16} y={42} textAnchor="end" className="stage-label">
              {snapshot.emfRmsV === null ? 'E_rms = N/A（手动估计）' : `E_rms = ${formatSI(snapshot.emfRmsV, 'V')}`}
            </text>
          </g>
        </svg>

        {conditionNotice ? (
          <div className="stage-condition-notice" role="status" data-testid="i08-condition-notice">
            {conditionNotice}
          </div>
        ) : null}

        <div className="i08-hud">
          <div><span>θ</span><strong>{formatNumber((snapshot.thetaWrappedRad * 180) / Math.PI, 1)}°</strong></div>
          <div><span>Φ</span><strong>{formatSI(clean(snapshot.fluxWb), 'Wb')}</strong></div>
          <div><span>ε</span><strong>{showAnswers ? formatSI(clean(snapshot.emfV), 'V') : '？'}</strong></div>
          <div><span>I</span><strong>{showAnswers ? formatSI(clean(snapshot.currentA ?? 0), 'A') : '？'}</strong></div>
          <div><span>P_drive</span><strong>{formatSI(clean(snapshot.pDriveW), 'W')}</strong></div>
          <div><span>τ_em</span><strong>{formatSI(clean(snapshot.torqueEmNm), 'N·m')}</strong></div>
        </div>

        <StageLegend
          items={[
            { color: B_COLOR, label: '磁场 B' },
            { color: NORMAL_COLOR, label: '线圈法线 n' },
            { color: CURRENT_COLOR, label: '感应电流（滑环交流）' },
            { color: LOAD_COLOR, label: '负载 / 内阻' },
            { color: 'var(--warning)', label: 'θ 手柄（手动）' },
          ]}
        />
      </div>
    </div>
  );
}
