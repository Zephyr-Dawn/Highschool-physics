import type { InverseSolution } from '../../physics/particles/fieldConstraintInverse';
import { formatNumber } from '../../lib/format';

const WIDTH = 340;
const HEIGHT = 128;
const MARGIN = { left: 10, right: 12, top: 12, bottom: 18 };

export function P08ConstraintChart({ inverse }: { inverse: InverseSolution | null }) {
  if (!inverse || inverse.scan.length < 2) {
    return (
      <div className="p08-constraint-chart is-empty" data-testid="p08-residual-chart">
        <p>点击“开始反求”后显示残差随参数变化；无事件区间会断线，不会被填成 0。</p>
      </div>
    );
  }
  const { min, max } = inverse.request;
  const values = inverse.scan
    .map((point) => point.residualM)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const absMax = Math.max(1e-9, ...values.map((value) => Math.abs(value)));
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xFor = (value: number) => MARGIN.left + ((value - min) / Math.max(1e-12, max - min)) * plotW;
  const yFor = (value: number) => MARGIN.top + plotH / 2 - (value / absMax) * (plotH / 2);
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of inverse.scan) {
    if (point.residualM === null || !Number.isFinite(point.residualM)) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      continue;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${xFor(point.parameterValue).toFixed(1)},${yFor(point.residualM).toFixed(1)}`);
  }
  if (current.length > 1) segments.push(current.join(' '));
  return (
    <div className="p08-constraint-chart" data-testid="p08-residual-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="反求残差随参数变化图">
        <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yFor(0)} y2={yFor(0)} className="chart-zero" />
        {segments.map((path, index) => (
          <path key={index} d={path} fill="none" stroke="#1d4ed8" strokeWidth={2} />
        ))}
        {inverse.candidates.map((candidate, index) => (
          <g key={`${candidate.status}-${candidate.parameterValue}-${index}`}>
            <circle
              cx={xFor(candidate.parameterValue)}
              cy={yFor(Number.isFinite(candidate.residualM) ? candidate.residualM : 0)}
              r={4}
              fill={candidate.status === 'confirmed' ? '#15803d' : candidate.status === 'tangent-critical' ? '#b45309' : '#64748b'}
              stroke="var(--surface)"
              strokeWidth={1.2}
            />
          </g>
        ))}
        <text x={MARGIN.left} y={HEIGHT - 4} className="chart-axis-label">{formatNumber(min, 2)}</text>
        <text x={WIDTH - MARGIN.right} y={HEIGHT - 4} textAnchor="end" className="chart-axis-label">{formatNumber(max, 2)}</text>
        <text x={MARGIN.left} y={MARGIN.top + 8} className="chart-axis-label">g(p)</text>
      </svg>
      <p className="param-description">
        蓝线为有效正向交点的残差；断线表示该参数没有正向交事件。绿点为正向复核通过的候选，橙点为相切临界。
      </p>
    </div>
  );
}
