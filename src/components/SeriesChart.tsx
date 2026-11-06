import { useMemo } from 'react';

interface SeriesPoint {
  tS: number;
  value: number;
}

interface SeriesChartProps {
  title: string;
  unit: string;
  color: string;
  points: SeriesPoint[];
  duration: number;
  time: number;
  currentValue: number;
  formatValue: (value: number) => string;
  signed?: boolean;
}

const WIDTH = 320;
const HEIGHT = 96;
const MARGIN = { left: 8, right: 8, top: 10, bottom: 12 };

export function SeriesChart({
  title,
  unit,
  color,
  points,
  duration,
  time,
  currentValue,
  formatValue,
  signed = true,
}: SeriesChartProps) {
  const { path, zeroY, maxLabel, minLabel, yForValue } = useMemo(() => {
    let maxAbs = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const point of points) {
      maxAbs = Math.max(maxAbs, Math.abs(point.value));
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;
    if (signed) {
      maxAbs = Math.max(maxAbs, 1e-12);
    } else {
      maxAbs = Math.max(maxAbs, 1e-12);
    }
    const plotW = WIDTH - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const durationSafe = Math.max(duration, 1e-12);
    const yFor = (value: number) => {
      if (signed) {
        return MARGIN.top + plotH / 2 - (value / maxAbs) * (plotH / 2);
      }
      return MARGIN.top + plotH - (value / maxAbs) * plotH;
    };
    const xFor = (tS: number) => MARGIN.left + (Math.max(0, Math.min(durationSafe, tS)) / durationSafe) * plotW;
    const d = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${xFor(point.tS).toFixed(1)},${yFor(point.value).toFixed(1)}`)
      .join(' ');
    return {
      path: d,
      zeroY: yFor(0),
      maxLabel: formatValue(signed ? maxAbs : max),
      minLabel: formatValue(signed ? -maxAbs : 0),
      yForValue: yFor,
    };
  }, [duration, formatValue, points, signed]);

  const markerX = MARGIN.left + (Math.max(0, Math.min(duration, time)) / Math.max(duration, 1e-12)) * (WIDTH - MARGIN.left - MARGIN.right);
  const markerY = yForValue(currentValue);

  return (
    <div className="series-chart">
      <div className="series-chart-head">
        <div>
          <span className="series-chart-title">{title}</span>
          <span className="series-chart-unit">{unit}</span>
        </div>
        <strong style={{ color }}>{formatValue(currentValue)}</strong>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${title}随时间变化图，当前值 ${formatValue(currentValue)} ${unit}`}>
        <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zeroY} y2={zeroY} className="chart-zero" />
        {path ? <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
        <line
          x1={markerX}
          x2={markerX}
          y1={MARGIN.top}
          y2={HEIGHT - MARGIN.bottom}
          className="chart-marker"
        />
        <circle cx={markerX} cy={markerY} r={3.4} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
        <text x={WIDTH - MARGIN.right} y={MARGIN.top + 8} textAnchor="end" className="chart-axis-label">
          {maxLabel}
        </text>
        <text x={WIDTH - MARGIN.right} y={HEIGHT - MARGIN.bottom + 1} textAnchor="end" className="chart-axis-label">
          {minLabel}
        </text>
      </svg>
    </div>
  );
}
