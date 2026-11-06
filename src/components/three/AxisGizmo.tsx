import type { Vec3 } from '../../physics/particles/lorentzForce';

const AXES: Array<{ label: string; vector: Vec3; color: string }> = [
  { label: 'x', vector: { x: 1, y: 0, z: 0 }, color: '#dc2626' },
  { label: 'y', vector: { x: 0, y: 1, z: 0 }, color: '#059669' },
  { label: 'z', vector: { x: 0, y: 0, z: 1 }, color: '#2563eb' },
];

export function AxisGizmo({
  cameraRight,
  cameraUp,
  azimuthDeg,
  polarDeg,
}: {
  cameraRight: Vec3;
  cameraUp: Vec3;
  azimuthDeg: number;
  polarDeg: number;
}) {
  const center = 38;
  const radius = 24;
  return (
    <div className="p01-3d-gizmo" data-testid="p01-3d-gizmo" aria-label="世界坐标轴方向指示器">
      <svg viewBox="0 0 76 76" role="img" aria-label={`相机方位角 ${azimuthDeg.toFixed(0)}°，极角 ${polarDeg.toFixed(0)}°`}>
        <circle cx={center} cy={center} r={34} fill="rgba(248,250,252,0.88)" stroke="rgba(148,163,184,0.55)" />
        {AXES.map((axis) => {
          const x = axis.vector.x * cameraRight.x + axis.vector.y * cameraRight.y + axis.vector.z * cameraRight.z;
          const y = -(axis.vector.x * cameraUp.x + axis.vector.y * cameraUp.y + axis.vector.z * cameraUp.z);
          const length = Math.hypot(x, y);
          const endX = center + (length > 1e-8 ? (x / length) * radius : 0);
          const endY = center + (length > 1e-8 ? (y / length) * radius : 0);
          return (
            <g key={axis.label}>
              <line x1={center} y1={center} x2={endX} y2={endY} stroke={axis.color} strokeWidth={2.2} strokeLinecap="round" />
              <circle cx={endX} cy={endY} r={2.6} fill={axis.color} />
              <text
                x={center + (endX - center) * 1.2}
                y={center + (endY - center) * 1.2 + 3}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={axis.color}
              >
                {axis.label}
              </text>
            </g>
          );
        })}
        <circle cx={center} cy={center} r={2.2} fill="#475569" />
      </svg>
    </div>
  );
}
