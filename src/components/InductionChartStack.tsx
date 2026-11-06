import { useMemo } from 'react';
import type {
  InductionSeriesPoint,
  InductionSnapshot,
  WaveformEvent,
} from '../physics/induction/timeVaryingField';
import { formatSI } from '../lib/format';

interface InductionChartStackProps {
  points: InductionSeriesPoint[];
  events: WaveformEvent[];
  duration: number;
  time: number;
  snapshot: InductionSnapshot;
  compact?: boolean;
  testId?: string;
}

const WIDTH = 320;
const LANE_HEIGHT = 62;
const MARGIN = { left: 8, right: 8, top: 7, bottom: 7 };

interface LaneDefinition {
  key: 'b' | 'flux' | 'emf' | 'current';
  title: string;
  unit: string;
  color: string;
  value: (point: InductionSeriesPoint) => number | null;
  currentValue: number | null;
  currentLeft: number | null;
  currentRight: number | null;
  format: (value: number) => string;
}

function pathFor(
  points: InductionSeriesPoint[],
  value: (point: InductionSeriesPoint) => number | null,
  xFor: (timeS: number) => number,
  yFor: (value: number) => number,
): string {
  let path = '';
  let drawing = false;
  for (const point of points) {
    const yValue = value(point);
    if (yValue === null || !Number.isFinite(yValue)) {
      drawing = false;
      continue;
    }
    const command = drawing ? 'L' : 'M';
    path += `${command}${xFor(point.tS).toFixed(2)},${yFor(yValue).toFixed(2)} `;
    drawing = true;
  }
  return path.trim();
}

function Lane({
  lane,
  points,
  duration,
  time,
  events,
  index,
  testPrefix,
}: {
  lane: LaneDefinition;
  points: InductionSeriesPoint[];
  duration: number;
  time: number;
  events: WaveformEvent[];
  index: number;
  testPrefix: string;
}) {
  const durationSafe = Math.max(1e-9, duration);
  const xFor = (timeS: number) =>
    MARGIN.left + (Math.max(0, Math.min(durationSafe, timeS)) / durationSafe) * (WIDTH - MARGIN.left - MARGIN.right);
  const markerX = xFor(time);

  const { path, zeroY, yFor, maxAbs } = useMemo(() => {
    let max = 1e-12;
    for (const point of points) {
      const value = lane.value(point);
      if (value !== null && Number.isFinite(value)) max = Math.max(max, Math.abs(value));
    }
    const plotH = LANE_HEIGHT - MARGIN.top - MARGIN.bottom;
    const yForFn = (value: number) =>
      MARGIN.top + plotH / 2 - (Math.max(-max, Math.min(max, value)) / max) * (plotH / 2);
    return {
      path: pathFor(points, lane.value, xFor, yForFn),
      zeroY: yForFn(0),
      yFor: yForFn,
      maxAbs: max,
    };
  }, [durationSafe, lane, points]);

  const currentY = lane.currentValue === null ? null : yFor(lane.currentValue);
  const leftY = lane.currentLeft === null ? null : yFor(lane.currentLeft);
  const rightY = lane.currentRight === null ? null : yFor(lane.currentRight);
  const currentLabel =
    lane.currentValue === null
      ? '折点'
      : lane.format(lane.currentValue);

  return (
    <div className="induction-chart-lane" data-testid={`${testPrefix}-${lane.key}`}>
      <div className="induction-chart-lane-head">
        <span className="induction-chart-lane-title" style={{ color: lane.color }}>
          {lane.title}
          <span className="induction-chart-lane-unit">{lane.unit}</span>
        </span>
        <strong style={{ color: lane.color }}>{currentLabel}</strong>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${LANE_HEIGHT}`}
        role="img"
        aria-label={`${lane.title} 随时间变化，当前 ${currentLabel}`}
      >
        <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zeroY} y2={zeroY} className="chart-zero" />
        {events.map((event, eventIndex) => (
          <line
            key={`${event.timeS}-${event.kind}-${eventIndex}`}
            x1={xFor(event.timeS)}
            x2={xFor(event.timeS)}
            y1={MARGIN.top}
            y2={LANE_HEIGHT - MARGIN.bottom}
            className={event.kind === 'kink' ? 'chart-event-line chart-kink-line' : 'chart-event-line'}
          />
        ))}
        {path ? (
          <path
            d={path}
            fill="none"
            stroke={lane.color}
            strokeWidth={1.8}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ) : null}
        <line
          x1={markerX}
          x2={markerX}
          y1={MARGIN.top}
          y2={LANE_HEIGHT - MARGIN.bottom}
          className="chart-marker"
        />
        {currentY !== null ? (
          <circle cx={markerX} cy={currentY} r={3.1} fill={lane.color} stroke="var(--surface)" strokeWidth={1.4} />
        ) : null}
        {currentY === null && leftY !== null && rightY !== null && Math.abs(leftY - rightY) > 0.5 ? (
          <>
            <circle cx={markerX} cy={leftY} r={2.5} fill={lane.color} />
            <circle cx={markerX} cy={rightY} r={2.5} fill={lane.color} />
          </>
        ) : null}
        <text x={MARGIN.left} y={MARGIN.top + 7} className="chart-axis-label" textAnchor="start">
          {maxAbs <= 1e-12 ? '0' : lane.format(maxAbs)}
        </text>
        <text x={MARGIN.left} y={LANE_HEIGHT - MARGIN.bottom} className="chart-axis-label" textAnchor="start">
          {maxAbs <= 1e-12 ? '0' : lane.format(-maxAbs)}
        </text>
        {index === 0 && time >= 0 ? (
          <text x={markerX + 4} y={MARGIN.top + 7} className="chart-time-label">
            t
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export function InductionChartStack({
  points,
  events,
  duration,
  time,
  snapshot,
  compact = false,
  testId = 'i04-chart-stack',
}: InductionChartStackProps) {
  const lanes: LaneDefinition[] = [
    {
      key: 'b',
      title: 'Bz 外加磁场',
      unit: 'T',
      color: 'var(--field)',
      value: (point) => point.bzTesla,
      currentValue: snapshot.bzTesla,
      currentLeft: snapshot.bzTesla,
      currentRight: snapshot.bzTesla,
      format: (value) => formatSI(value, 'T'),
    },
    {
      key: 'flux',
      title: 'Φ 单匝磁通量',
      unit: 'Wb',
      color: 'var(--flux)',
      value: (point) => point.fluxPerTurnWb,
      currentValue: snapshot.fluxPerTurnWb,
      currentLeft: snapshot.fluxPerTurnWb,
      currentRight: snapshot.fluxPerTurnWb,
      format: (value) => formatSI(value, 'Wb'),
    },
    {
      key: 'emf',
      title: 'ε 感应电动势',
      unit: 'V',
      color: 'var(--emf)',
      value: (point) => point.emfV,
      currentValue: snapshot.emfV,
      currentLeft: snapshot.emfLeftV,
      currentRight: snapshot.emfRightV,
      format: (value) => formatSI(value, 'V'),
    },
    {
      key: 'current',
      title: 'I 感应电流',
      unit: 'A',
      color: 'var(--current)',
      value: (point) => point.currentA,
      currentValue: snapshot.currentA,
      currentLeft: snapshot.currentLeftA,
      currentRight: snapshot.currentRightA,
      format: (value) => formatSI(value, 'A'),
    },
  ];

  const testPrefix = testId === 'i04-chart-panel' ? 'i04-chart-panel' : 'i04-chart';
  return (
    <section
      className={`induction-chart-stack ${compact ? 'is-compact' : ''}`}
      aria-label="B、Φ、ε、I 联动图像"
      data-testid={testId}
    >
      <div className="induction-chart-legend">
        <span>同一仿真时间轴</span>
        <span>虚线 = 波形事件 / 折点</span>
      </div>
      {lanes.map((lane, index) => (
        <Lane
          key={lane.key}
          lane={lane}
          points={points}
          duration={duration}
          time={time}
          events={events}
          index={index}
          testPrefix={testPrefix}
        />
      ))}
      <div className="induction-chart-axis" aria-hidden="true">
        <span>0 s</span>
        <span>{duration.toFixed(2)} s</span>
      </div>
    </section>
  );
}
