import { useMemo, useState } from 'react';
import { SeriesChart } from '../../components/SeriesChart';
import { Segmented } from '../../components/Segmented';
import { formatNumber, formatSI } from '../../lib/format';
import type { GeneratorSnapshot } from '../../physics/induction/acGenerator';

type ChartGroup = 'flux' | 'emf' | 'power' | 'energy';

const OPTIONS: Array<{ value: ChartGroup; label: string }> = [
  { value: 'flux', label: 'Φ / Ψ' },
  { value: 'emf', label: 'ε / I' },
  { value: 'power', label: '功率 / 力矩' },
  { value: 'energy', label: '能量累计' },
];

function points(samples: GeneratorSnapshot[], select: (sample: GeneratorSnapshot) => number) {
  return samples.map((sample) => ({ tS: sample.timeS, value: select(sample) }));
}

export function I08Charts({
  history,
  snapshot,
  duration,
}: {
  history: GeneratorSnapshot[];
  snapshot: GeneratorSnapshot;
  duration: number;
}) {
  const [group, setGroup] = useState<ChartGroup>('flux');
  const samples = useMemo(() => {
    if (history.length <= 360) return history;
    const step = (history.length - 1) / 359;
    return Array.from({ length: 360 }, (_, index) => history[Math.round(index * step)]);
  }, [history]);
  const time = Math.max(0, Math.min(duration, snapshot.timeS));

  return (
    <section className="chart-stack i08-charts" data-testid="i08-charts" aria-label="I08 实时图像">
      <div className="chart-stack-head">
        <Segmented<ChartGroup> value={group} onChange={setGroup} options={OPTIONS} ariaLabel="I08 图像分组" />
      </div>
      {group === 'flux' ? (
        <div className="chart-grid">
          <SeriesChart title="单匝磁通 Φ" unit="Wb" color="#7e22ce" points={points(samples, (item) => item.fluxWb)} duration={duration} time={time} currentValue={snapshot.fluxWb} formatValue={(value) => formatNumber(value, 3)} />
          <SeriesChart title="磁链 Ψ" unit="Wb·turn" color="#6d28d9" points={points(samples, (item) => item.linkageWbTurn)} duration={duration} time={time} currentValue={snapshot.linkageWbTurn} formatValue={(value) => formatNumber(value, 3)} />
        </div>
      ) : null}
      {group === 'emf' ? (
        <div className="chart-grid">
          <SeriesChart title="电动势 ε" unit="V" color="#c2410c" points={points(samples, (item) => item.emfV)} duration={duration} time={time} currentValue={snapshot.emfV} formatValue={(value) => formatNumber(value, 3)} />
          <SeriesChart title="电流 I" unit="A" color="#1d4ed8" points={points(samples, (item) => item.currentA ?? 0)} duration={duration} time={time} currentValue={snapshot.currentA ?? 0} formatValue={(value) => formatNumber(value, 3)} />
        </div>
      ) : null}
      {group === 'power' ? (
        <div className="chart-grid">
          <SeriesChart title="机械输入功率 P_drive" unit="W" color="#0f766e" signed={false} points={points(samples, (item) => item.pDriveW)} duration={duration} time={time} currentValue={snapshot.pDriveW} formatValue={(value) => formatNumber(value, 3)} />
          <SeriesChart title="负载功率 P_L" unit="W" color="#b45309" signed={false} points={points(samples, (item) => item.pLoadW)} duration={duration} time={time} currentValue={snapshot.pLoadW} formatValue={(value) => formatNumber(value, 3)} />
          <SeriesChart title="内阻发热 P_r" unit="W" color="#b91c1c" signed={false} points={points(samples, (item) => item.pInternalW)} duration={duration} time={time} currentValue={snapshot.pInternalW} formatValue={(value) => formatNumber(value, 3)} />
          <SeriesChart title="电磁阻力矩 τ_em" unit="N·m" color="#7e22ce" points={points(samples, (item) => item.torqueEmNm)} duration={duration} time={time} currentValue={snapshot.torqueEmNm} formatValue={(value) => formatNumber(value, 3)} />
        </div>
      ) : null}
      {group === 'energy' ? (
        <div className="chart-grid">
          <SeriesChart title="机械输入功 W_drive" unit="J" color="#0f766e" signed={false} points={points(samples, (item) => item.energy.driveJ)} duration={duration} time={time} currentValue={snapshot.energy.driveJ} formatValue={(value) => formatSI(value, 'J', 2)} />
          <SeriesChart title="负载热量 Q_L" unit="J" color="#b45309" signed={false} points={points(samples, (item) => item.energy.loadJ)} duration={duration} time={time} currentValue={snapshot.energy.loadJ} formatValue={(value) => formatSI(value, 'J', 2)} />
          <SeriesChart title="内阻热量 Q_r" unit="J" color="#b91c1c" signed={false} points={points(samples, (item) => item.energy.internalJ)} duration={duration} time={time} currentValue={snapshot.energy.internalJ} formatValue={(value) => formatSI(value, 'J', 2)} />
        </div>
      ) : null}
    </section>
  );
}
