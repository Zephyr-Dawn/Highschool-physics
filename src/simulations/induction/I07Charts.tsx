import { useMemo, useState } from 'react';
import { SeriesChart } from '../../components/SeriesChart';
import { Segmented } from '../../components/Segmented';
import { formatNumber, formatSI } from '../../lib/format';
import { downsampleI07Samples, type I07Snapshot, type I07Solution } from '../../physics/induction/oppositeFieldsWallLoop';

type ChartGroup = 'motion' | 'flux' | 'force' | 'energy';

const GROUP_OPTIONS: Array<{ value: ChartGroup; label: string }> = [
  { value: 'motion', label: '位置 / 速度' },
  { value: 'flux', label: 'Φ / ε / I' },
  { value: 'force', label: '安培力 / 功率' },
  { value: 'energy', label: '能量 / 损失' },
];

function points(samples: I07Snapshot[], select: (sample: I07Snapshot) => number) {
  return samples.map((sample) => ({ tS: sample.timeS, value: select(sample) }));
}

export function I07Charts({
  solution,
  history,
  snapshot,
}: {
  solution: I07Solution;
  history: I07Snapshot[];
  snapshot: I07Snapshot;
}) {
  const [group, setGroup] = useState<ChartGroup>('motion');
  const samples = useMemo(() => {
    const source = history.length > 1 ? history : solution.samples;
    return downsampleI07Samples(source, 260);
  }, [history, solution.samples]);
  const duration = Math.max(0.25, samples[samples.length - 1]?.timeS ?? solution.durationS);
  const time = Math.max(0, Math.min(duration, snapshot.timeS));

  return (
    <section className="chart-stack i07-charts" data-testid="i07-charts" aria-label="I07 实时图像">
      <div className="chart-stack-head">
        <Segmented<ChartGroup> value={group} onChange={setGroup} options={GROUP_OPTIONS} ariaLabel="I07 图像分组" />
      </div>
      {group === 'motion' ? (
        <div className="chart-grid">
          <SeriesChart
            title="线框位置 x"
            unit="m"
            color="#1d4ed8"
            signed={false}
            points={points(samples, (sample) => sample.xM)}
            duration={duration}
            time={time}
            currentValue={snapshot.xM}
            formatValue={(value) => formatNumber(value, 2)}
          />
          <SeriesChart
            title="速度 v"
            unit="m/s"
            color="#0f766e"
            points={points(samples, (sample) => sample.velocityMps)}
            duration={duration}
            time={time}
            currentValue={snapshot.velocityMps}
            formatValue={(value) => formatNumber(value, 2)}
          />
        </div>
      ) : null}
      {group === 'flux' ? (
        <div className="chart-grid">
          <SeriesChart
            title="带符号磁通量 Φ"
            unit="Wb"
            color="#7e22ce"
            points={points(samples, (sample) => sample.fluxWb)}
            duration={duration}
            time={time}
            currentValue={snapshot.fluxWb}
            formatValue={(value) => formatNumber(value, 3)}
          />
          <SeriesChart
            title="感应电动势 ε"
            unit="V"
            color="#c2410c"
            points={points(samples, (sample) => sample.emfV)}
            duration={duration}
            time={time}
            currentValue={snapshot.emfV}
            formatValue={(value) => formatNumber(value, 3)}
          />
          <SeriesChart
            title="感应电流 I"
            unit="A"
            color="#1d4ed8"
            points={points(samples, (sample) => sample.currentA ?? 0)}
            duration={duration}
            time={time}
            currentValue={snapshot.currentA ?? 0}
            formatValue={(value) => formatNumber(value, 3)}
          />
        </div>
      ) : null}
      {group === 'force' ? (
        <div className="chart-grid">
          <SeriesChart
            title="安培力 F_Bx"
            unit="N"
            color="#b91c1c"
            points={points(samples, (sample) => sample.magneticForceN ?? 0)}
            duration={duration}
            time={time}
            currentValue={snapshot.magneticForceN ?? 0}
            formatValue={(value) => formatNumber(value, 3)}
          />
          <SeriesChart
            title="焦耳功率 P_J"
            unit="W"
            color="#c2410c"
            signed={false}
            points={points(samples, (sample) => sample.joulePowerW ?? 0)}
            duration={duration}
            time={time}
            currentValue={snapshot.joulePowerW ?? 0}
            formatValue={(value) => formatNumber(value, 3)}
          />
        </div>
      ) : null}
      {group === 'energy' ? (
        <div className="chart-grid">
          <SeriesChart
            title="动能 K"
            unit="J"
            color="#0f766e"
            signed={false}
            points={points(samples, (sample) => sample.kineticEnergyJ)}
            duration={duration}
            time={time}
            currentValue={snapshot.kineticEnergyJ}
            formatValue={(value) => formatSI(value, 'J', 2)}
          />
          <SeriesChart
            title="焦耳热 Q_J"
            unit="J"
            color="#c2410c"
            signed={false}
            points={points(samples, (sample) => sample.jouleHeatJ)}
            duration={duration}
            time={time}
            currentValue={snapshot.jouleHeatJ}
            formatValue={(value) => formatSI(value, 'J', 2)}
          />
          <SeriesChart
            title="冲击损失 Q_impact"
            unit="J"
            color="#b91c1c"
            signed={false}
            points={points(samples, (sample) => sample.impactLossJ)}
            duration={duration}
            time={time}
            currentValue={snapshot.impactLossJ}
            formatValue={(value) => formatSI(value, 'J', 2)}
          />
        </div>
      ) : null}
    </section>
  );
}
