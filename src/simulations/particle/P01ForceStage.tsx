import { useEffect, useMemo, useRef } from 'react';
import {
  dot3,
  magnitude3,
  normalize3,
  scale3,
  type LorentzForceSnapshot,
  type Vec3,
} from '../../physics/particles/lorentzForce';
import { clamp } from '../../physics/core/vec2';
import { useElementSize } from '../../hooks/useElementSize';
import { useStageView } from '../../hooks/useStageView';
import { StageToolbar, type StageMode } from '../../components/StageToolbar';
import { StageLegend } from '../../components/StageLegend';
import { formatNumber, formatSI } from '../../lib/format';
import type { P01ForceParticle, P01ForceScene } from './p01ForceScene';

export interface P01ForceLayers {
  field: boolean;
  velocity: boolean;
  force: boolean;
  angle: boolean;
  magnitude: boolean;
  projection: boolean;
  axes: boolean;
}

export const P01_FORCE_DEFAULT_LAYERS: P01ForceLayers = {
  field: true,
  velocity: true,
  force: true,
  angle: true,
  magnitude: true,
  projection: false,
  axes: true,
};

interface P01ForceStageProps {
  scene: P01ForceScene;
  particle: P01ForceParticle;
  snapshot: LorentzForceSnapshot;
  layers: P01ForceLayers;
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
}

interface Projected {
  x: number;
  y: number;
}

function project3(vector: Vec3): Projected {
  return {
    x: vector.x - vector.z * 0.58,
    y: -vector.y + vector.z * 0.42,
  };
}

function directionArrow(vector: Vec3): Vec3 | null {
  const unit = normalize3(vector);
  return unit ? scale3(unit, 1.75) : null;
}

function angleArc(v: Vec3, B: Vec3, radius: number): Projected[] {
  const u = normalize3(v);
  const b = normalize3(B);
  if (!u || !b) return [];
  const dot = clamp(dot3(u, b), -1, 1);
  const theta = Math.acos(dot);
  if (!Number.isFinite(theta) || theta < 0.02 || Math.PI - theta < 0.02) return [];
  const w = normalize3(scale3(u, -dot));
  const perpendicular = normalize3({
    x: b.x + (w?.x ?? 0),
    y: b.y + (w?.y ?? 0),
    z: b.z + (w?.z ?? 0),
  });
  if (!perpendicular) return [];
  const points: Projected[] = [];
  for (let index = 0; index <= 20; index++) {
    const t = (theta * index) / 20;
    points.push(
      project3({
        x: (u.x * Math.cos(t) + perpendicular.x * Math.sin(t)) * radius,
        y: (u.y * Math.cos(t) + perpendicular.y * Math.sin(t)) * radius,
        z: (u.z * Math.cos(t) + perpendicular.z * Math.sin(t)) * radius,
      }),
    );
  }
  return points;
}

export function P01ForceStage({
  scene,
  particle,
  snapshot,
  layers,
  stageMode,
  onStageModeChange,
}: P01ForceStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 820, height: 520 });
  const { view, toScreen, fitBounds, zoomBy, stageHandlers } = useStageView({
    width: size.width,
    height: size.height,
    panEnabled: stageMode === 'pan',
  });
  const lastFitSignature = useRef<string | null>(null);
  const fitSignature = `${size.width.toFixed(0)}x${size.height.toFixed(0)}`;
  useEffect(() => {
    if (lastFitSignature.current === fitSignature) return;
    lastFitSignature.current = fitSignature;
    fitBounds({ minX: -3.2, minY: -3.0, maxX: 3.2, maxY: 3.0 }, 34);
  }, [fitBounds, fitSignature]);

  const origin = toScreen({ x: 0, y: 0 });
  const BVec = scene.field.B;
  const vArrow = directionArrow(snapshot.velocity);
  const bArrow = directionArrow(BVec);
  const fArrow = directionArrow(snapshot.force);
  const vLength = vArrow ? 1.25 : 0;
  const bLength = bArrow ? 1.35 : 0;
  const fLength = fArrow ? 1.2 + 0.65 * clamp(snapshot.magnitude / 50, 0, 1) : 0;
  const selectedColor = particle.color;
  const forceVisible = layers.force && snapshot.zeroForceReason === 'none';
  const arc = useMemo(
    () => (layers.angle ? angleArc(snapshot.velocity, BVec, 0.8) : []),
    [BVec, layers.angle, snapshot.velocity],
  );
  const fieldLabel = magnitude3(BVec) > 1e-12 ? formatSI(magnitude3(BVec), 'T') : '0 T';
  const zeroLabel =
    snapshot.zeroForceReason === 'none'
      ? ''
      : snapshot.zeroForceReason === 'parallel'
        ? 'v ∥ B'
        : snapshot.zeroForceReason === 'anti-parallel'
          ? 'v 反平行 B'
          : snapshot.zeroForceReason === 'zero-charge'
            ? 'q = 0'
            : snapshot.zeroForceReason === 'zero-field'
              ? 'B = 0'
              : snapshot.zeroForceReason === 'zero-velocity'
                ? 'v = 0'
                : '输入无效';

  const drawVector = (
    vector: Vec3,
    length: number,
    color: string,
    label: string,
    dashed = false,
    opacity = 1,
  ) => {
    const direction = directionArrow(vector);
    if (!direction) return null;
    const endpoint = scale3(direction, length / 1.75);
    const end = toScreen(project3(endpoint));
    const markerKey = dashed ? 'proj' : label.startsWith('F') ? 'F' : label.startsWith('v') ? 'v' : 'B';
    const markerId = `p01-force-arrow-${markerKey}`;
    return (
      <g key={label} opacity={opacity}>
        <line
          x1={origin.x}
          y1={origin.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={dashed ? 1.5 : 3}
          strokeDasharray={dashed ? '6 5' : undefined}
          markerEnd={`url(#${markerId})`}
          strokeLinecap="round"
        />
        <text x={end.x + 8} y={end.y - 6} className="svg-text svg-text-small" fill={color}>
          {label}
        </text>
      </g>
    );
  };

  return (
    <div className="stage-card p01-force-stage">
      <StageToolbar
        mode={stageMode}
        onModeChange={onStageModeChange}
        onFit={() => fitBounds({ minX: -3.2, minY: -3.0, maxX: 3.2, maxY: 3.0 }, 34)}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
      />
      <div
        className="stage-wrap"
        ref={ref}
        data-testid="p01-force-stage"
        data-view-scale={view.scale.toFixed(3)}
        data-mode="force3d"
        data-selected={particle.label}
        data-particle-count={scene.particles.length}
        data-q={snapshot.chargeC}
        data-mass={snapshot.massKg}
        data-vx={snapshot.velocity.x}
        data-vy={snapshot.velocity.y}
        data-vz={snapshot.velocity.z}
        data-bx={BVec.x}
        data-by={BVec.y}
        data-bz={BVec.z}
        data-fx={snapshot.force.x}
        data-fy={snapshot.force.y}
        data-fz={snapshot.force.z}
        data-force-mag={snapshot.magnitude}
        data-theta-deg={snapshot.thetaDeg}
        data-zero-reason={snapshot.zeroForceReason}
        data-force-hidden={!forceVisible}
        data-projection={layers.projection}
      >
        <svg
          className={`stage-svg stage-svg-${stageMode}`}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`P01 三维瞬时洛伦兹力：${particle.label}，|F| ${formatNumber(snapshot.magnitude, 3)} N，夹角 ${formatNumber(snapshot.thetaDeg, 1)}°。`}
          data-testid="p01-force-stage-svg"
          {...stageHandlers}
        >
          <defs>
            {['v', 'B', 'F', 'proj'].map((key) => (
              <marker
                key={key}
                id={`p01-force-arrow-${key}`}
                markerWidth="8"
                markerHeight="8"
                refX="6.5"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill={key === 'v' ? 'var(--velocity)' : key === 'B' ? 'var(--field)' : key === 'F' ? 'var(--force)' : 'var(--ink-faint)'} />
              </marker>
            ))}
            <marker id="p01-force-axis-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-muted)" />
            </marker>
            <marker id="p01-force-arrow-proj" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-faint)" />
            </marker>
          </defs>
          <rect width={size.width} height={size.height} fill="transparent" />

          {layers.axes ? (
            <g aria-hidden="true">
              {[-2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5].map((value) => {
                const a = toScreen(project3({ x: value, y: -2.5, z: 0 }));
                const b = toScreen(project3({ x: value, y: 2.5, z: 0 }));
                const c = toScreen(project3({ x: -2.5, y: value, z: 0 }));
                const d = toScreen(project3({ x: 2.5, y: value, z: 0 }));
                return (
                  <g key={`grid-${value}`} stroke="var(--line)" strokeWidth={0.8} opacity={0.48}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                    <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} />
                  </g>
                );
              })}
              {([
                ['+x', 2.8, 0, 0],
                ['−x', -2.8, 0, 0],
                ['+y', 0, 2.8, 0],
                ['−y', 0, -2.8, 0],
                ['+z', 0, 0, 2.8],
                ['−z', 0, 0, -2.8],
              ] as Array<[string, number, number, number]>).map(([label, x, y, z]) => {
                const end = toScreen(project3({ x, y, z }));
                const positive = !label.startsWith('−');
                return (
                  <g key={label}>
                    <line
                      x1={origin.x}
                      y1={origin.y}
                      x2={end.x}
                      y2={end.y}
                      stroke="var(--ink-faint)"
                      strokeWidth={1.2}
                      strokeDasharray={positive ? undefined : '5 5'}
                      markerEnd={positive ? 'url(#p01-force-axis-arrow)' : undefined}
                    />
                    <text x={end.x + (x >= 0 ? 8 : -18)} y={end.y - 6} className="svg-text svg-text-small" fill="var(--ink-muted)">
                      {label}
                    </text>
                  </g>
                );
              })}
              <circle cx={origin.x} cy={origin.y} r={4} fill="var(--ink-faint)" />
              <text x={origin.x + 10} y={origin.y + 18} className="svg-text svg-text-small" fill="var(--ink-faint)">
                右手坐标 · +z 出屏
              </text>
            </g>
          ) : null}

          {arc.length > 1 ? (
            <polyline
              points={arc.map((point) => {
                const screen = toScreen(point);
                return `${screen.x},${screen.y}`;
              }).join(' ')}
              fill="none"
              stroke="var(--ink-muted)"
              strokeWidth={1.4}
              strokeDasharray="4 4"
              aria-hidden="true"
            />
          ) : null}

          {layers.field && magnitude3(BVec) > 1e-12 ? drawVector(BVec, bLength, 'var(--field)', 'B') : null}
          {layers.velocity && magnitude3(snapshot.velocity) > 1e-12 ? drawVector(snapshot.velocity, vLength, 'var(--velocity)', 'v') : null}
          {forceVisible && fArrow ? drawVector(snapshot.force, fLength, 'var(--force)', 'F_B') : null}

          {layers.projection ? (
            <g>
              {drawVector({ x: snapshot.velocity.x, y: snapshot.velocity.y, z: 0 }, vLength * 0.7, 'var(--velocity)', 'v_xy', true, 0.65)}
              {drawVector({ x: BVec.x, y: BVec.y, z: 0 }, bLength * 0.7, 'var(--field)', 'B_xy', true, 0.65)}
              {forceVisible && fArrow ? drawVector({ x: snapshot.force.x, y: snapshot.force.y, z: 0 }, fLength * 0.7, 'var(--force)', 'F_xy', true, 0.65) : null}
              <text x={20} y={size.height - 44} className="svg-text svg-text-small" fill="var(--ink-faint)">
                虚线为 xy 平面投影，只是矢量分解，不是三维运动轨迹。
              </text>
            </g>
          ) : null}

          <g aria-hidden="true">
            <circle cx={origin.x} cy={origin.y} r={8} fill={selectedColor} stroke="var(--surface)" strokeWidth={2.5} />
            <text x={origin.x + 12} y={origin.y + 4} className="svg-text" fill={selectedColor}>
              {particle.label}
            </text>
          </g>

          {layers.magnitude ? (
            <g>
              <text x={18} y={24} className="svg-text svg-text-small" fill="var(--ink-soft)">
                |F_B| = {formatNumber(snapshot.magnitude, 3)} N · θ = {formatNumber(snapshot.thetaDeg, 1)}°
              </text>
              <text x={18} y={42} className="svg-text svg-text-small" fill="var(--ink-muted)">
                q = {formatNumber(snapshot.chargeC, 2)} C · m = {formatNumber(snapshot.massKg, 2)} kg
              </text>
            </g>
          ) : null}

          {!forceVisible ? (
            <g>
              <rect x={18} y={size.height - 76} width={270} height={34} rx={12} className="handle-pill" />
              <text x={32} y={size.height - 54} className="svg-text svg-text-small" fill="var(--ink-muted)">
                {zeroLabel ? `零力：${zeroLabel}` : '力箭头已隐藏 · 先判断方向再揭示'}
              </text>
            </g>
          ) : null}
        </svg>

        <div className="stage-hud" aria-hidden="true">
          <span className="hud-chip hud-field">B = ({formatNumber(BVec.x, 2)}, {formatNumber(BVec.y, 2)}, {formatNumber(BVec.z, 2)}) T</span>
          <span className="hud-chip">选中 {particle.label} · {scene.particles.length}/5</span>
          <span className="hud-chip">θ = {formatNumber(snapshot.thetaDeg, 1)}°</span>
          <span className="hud-chip">{snapshot.zeroForceReason === 'none' ? `|F| ${formatNumber(snapshot.magnitude, 3)} N` : `零力 · ${zeroLabel}`}</span>
        </div>

        {snapshot.diagnostics.length > 0 ? (
          <div className="stage-drag-hint" role="status">
            {snapshot.diagnostics[0]}
          </div>
        ) : null}
      </div>
      <StageLegend
        items={[
          { label: '磁场 B', color: 'var(--field)', variant: 'solid' },
          { label: '速度 v', color: 'var(--velocity)', variant: 'solid' },
          { label: '洛伦兹力 F_B', color: 'var(--force)', variant: 'solid' },
          { label: '二维投影（非轨迹）', color: 'var(--ink-faint)', variant: 'dashed' },
        ]}
      />
      <span hidden data-testid="p01-force-zero-reason">{snapshot.zeroForceReason}</span>
      <span hidden data-testid="p01-force-magnitude">{snapshot.magnitude}</span>
      <span hidden data-testid="p01-force-theta">{snapshot.thetaDeg}</span>
      <span hidden data-testid="p01-force-turns">{formatSI(magnitude3(snapshot.B), 'T')} · {fieldLabel}</span>
    </div>
  );
}
