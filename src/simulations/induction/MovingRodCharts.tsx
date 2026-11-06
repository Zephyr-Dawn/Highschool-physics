import { useMemo, useState } from 'react';
import type { RodSnapshot } from '../../physics/induction/movingRod';
import { SeriesChart } from '../../components/SeriesChart';
import { formatSI } from '../../lib/format';

type ChartGroup = 'motion' | 'electromagnetic' | 'energy';

interface MovingRodChartsProps {
  samples: readonly RodSnapshot[];
  snapshot: RodSnapshot;
  duration: number;
  time: number;
  manual: boolean;
}

const GROUP_LABEL: Record<ChartGroup, string> = {
  motion: '运动与力',
  electromagnetic: '电磁量',
  energy: '能量',
};

function downsample(samples: readonly RodSnapshot[], maxPoints = 220): RodSnapshot[] {
  if (samples.length <= maxPoints) return [...samples];
  const stride = (samples.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => samples[Math.round(index * stride)]);
}

export function MovingRodCharts({ samples, snapshot, duration, time, manual }: MovingRodChartsProps) {
  const [group, setGroup] = useState<ChartGroup>('electromagnetic');
  const chartSamples = useMemo(() => downsample(samples), [samples]);

  const pointSeries = (read: (sample: RodSnapshot) => number | null) =>
    chartSamples
      .map((sample) => ({ tS: sample.tS, value: read(sample) }))
      .filter((point): point is { tS: number; value: number } => point.value !== null && Number.isFinite(point.value));

  const motion = useMemo(
    () => ({
      x: pointSeries((sample) => sample.xM),
      velocity: pointSeries((sample) => sample.velocityMps),
      force: pointSeries((sample) => sample.magneticForceXN),
    }),
    [chartSamples],
  );
  const electromagnetic = useMemo(
    () => ({
      flux: pointSeries((sample) => sample.fluxWb),
      emf: pointSeries((sample) => sample.emfV),
      current: pointSeries((sample) => sample.currentA),
    }),
    [chartSamples],
  );
  const energy = useMemo(
    () => ({
      kinetic: pointSeries((sample) => sample.kineticEnergyJ),
      heat: pointSeries((sample) => sample.jouleHeatJ),
      work: pointSeries((sample) => sample.externalWorkJ),
    }),
    [chartSamples],
  );

  const chartTime = Math.min(time, duration);
  const estimatedPrefix = manual ? '≈ ' : '';

  return (
    <section className="moving-rod-charts" data-testid="i02-chart-stack" aria-label="I02 联动图像">
      <div className="moving-rod-chart-tabs" role="group" aria-label="图像主题">
        {(Object.keys(GROUP_LABEL) as ChartGroup[]).map((key) => (
          <button
            key={key}
            type="button"
            className="chip-button"
            aria-pressed={group === key}
            onClick={() => setGroup(key)}
            data-testid={`i02-chart-group-${key}`}
          >
            {GROUP_LABEL[key]}
          </button>
        ))}
        {manual ? <span className="moving-rod-estimated-badge">手势估算</span> : null}
      </div>

      {group === 'motion' ? (
        <div className="moving-rod-chart-grid">
          <div data-testid="i02-chart-x">
            <SeriesChart
              title="导体棒位置 x"
              unit="m"
              color="var(--trajectory)"
              points={motion.x}
              duration={duration}
              time={chartTime}
              currentValue={snapshot.xM}
              formatValue={(value) => formatSI(value, 'm')}
              signed={false}
            />
          </div>
          <div data-testid="i02-chart-v">
            <SeriesChart
              title={`导体棒速度 v${manual ? '（估算）' : ''}`}
              unit="m/s"
              color="var(--velocity)"
              points={motion.velocity}
              duration={duration}
              time={chartTime}
              currentValue={snapshot.velocityMps}
              formatValue={(value) => `${estimatedPrefix}${formatSI(value, 'm/s')}`}
            />
          </div>
          <div data-testid="i02-chart-force">
            <SeriesChart
              title={`安培力 F安${manual ? '（估算）' : ''}`}
              unit="N"
              color="var(--force)"
              points={motion.force}
              duration={duration}
              time={chartTime}
              currentValue={snapshot.magneticForceXN}
              formatValue={(value) => `${estimatedPrefix}${formatSI(value, 'N')}`}
            />
          </div>
        </div>
      ) : null}

      {group === 'electromagnetic' ? (
        <div className="moving-rod-chart-grid">
          <div data-testid="i02-chart-flux">
            <SeriesChart
              title="磁通量 Φ"
              unit="Wb"
              color="var(--flux)"
              points={electromagnetic.flux}
              duration={duration}
              time={chartTime}
              currentValue={snapshot.fluxWb}
              formatValue={(value) => formatSI(value, 'Wb')}
            />
          </div>
          <div data-testid="i02-chart-emf">
            <SeriesChart
              title={`电动势 ε${manual ? '（估算）' : ''}`}
              unit="V"
              color="var(--emf)"
              points={electromagnetic.emf}
              duration={duration}
              time={chartTime}
              currentValue={snapshot.emfV}
              formatValue={(value) => `${estimatedPrefix}${formatSI(value, 'V')}`}
            />
          </div>
          <div data-testid="i02-chart-current">
            <SeriesChart
              title={`电流 I${manual ? '（估算）' : ''}`}
              unit="A"
              color="var(--current)"
              points={electromagnetic.current}
              duration={duration}
              time={chartTime}
              currentValue={snapshot.currentA}
              formatValue={(value) => `${estimatedPrefix}${formatSI(value, 'A')}`}
            />
          </div>
        </div>
      ) : null}

      {group === 'energy' ? (
        <div className="moving-rod-chart-grid">
          {!manual ? (
            <div data-testid="i02-chart-kinetic">
              <SeriesChart
                title="动能 K"
                unit="J"
                color="var(--velocity)"
                points={energy.kinetic}
                duration={duration}
                time={chartTime}
                currentValue={snapshot.kineticEnergyJ}
                formatValue={(value) => formatSI(value, 'J')}
                signed={false}
              />
            </div>
          ) : null}
          <div data-testid="i02-chart-heat">
            <SeriesChart
              title={`焦耳热 Q_J${manual ? '（手势积分估算）' : ''}`}
              unit="J"
              color="var(--force)"
              points={energy.heat}
              duration={duration}
              time={chartTime}
              currentValue={snapshot.jouleHeatJ ?? 0}
              formatValue={(value) => `${estimatedPrefix}${formatSI(value, 'J')}`}
              signed={false}
            />
          </div>
          {!manual ? (
            <div data-testid="i02-chart-work">
              <SeriesChart
                title="外力功 W_ext"
                unit="J"
                color="var(--flux)"
                points={energy.work}
                duration={duration}
                time={chartTime}
                currentValue={snapshot.externalWorkJ ?? 0}
                formatValue={(value) => formatSI(value, 'J')}
              />
            </div>
          ) : null}
          {!manual && snapshot.energyResidualJ !== null ? (
            <p className="moving-rod-energy-residual" data-testid="i02-energy-residual">
              能量残差 W_ext − ΔK − Q_J ≈ {formatSI(snapshot.energyResidualJ, 'J')}（仅接触前适用）
            </p>
          ) : null}
          {manual ? (
            <p className="moving-rod-energy-residual" data-testid="i02-chart-estimated-note">
              手势模式只展示由 P_J≈k v² 对时间积分得到的焦耳热；不展示外力功、机械能残差或伪精确加速度。
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
