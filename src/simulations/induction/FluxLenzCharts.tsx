import { useMemo } from 'react';
import type { FluxLenzSnapshot } from '../../physics/induction/fluxLenz';
import { SeriesChart } from '../../components/SeriesChart';
import { formatSI } from '../../lib/format';

interface FluxLenzChartsProps {
  samples: readonly FluxLenzSnapshot[];
  snapshot: FluxLenzSnapshot;
  duration: number;
  time: number;
  estimated: boolean;
}

function downsample(samples: readonly FluxLenzSnapshot[], maxPoints = 220): FluxLenzSnapshot[] {
  if (samples.length <= maxPoints) return [...samples];
  const stride = (samples.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => samples[Math.round(index * stride)]);
}

export function FluxLenzCharts({ samples, snapshot, duration, time, estimated }: FluxLenzChartsProps) {
  const chartSamples = useMemo(() => downsample(samples), [samples]);
  const flux = chartSamples.map((sample) => ({ tS: sample.timeS, value: sample.phiWb }));
  const emf = chartSamples
    .map((sample) => ({ tS: sample.timeS, value: sample.emfV }))
    .filter((point): point is { tS: number; value: number } => point.value !== null);
  const current = chartSamples
    .map((sample) => ({ tS: sample.timeS, value: sample.currentA }))
    .filter((point): point is { tS: number; value: number } => point.value !== null);
  const prefix = estimated ? '≈ ' : '';

  return (
    <section className="moving-rod-charts" data-testid="i01-chart-stack" aria-label="I01 磁通量、电动势与电流图像">
      <div className="moving-rod-chart-tabs">
        <span className="moving-rod-estimated-badge">{estimated ? '手动导数估算' : '解析/记录'}</span>
        <span className="muted-text">同一时间轴；曲线上限约 220 点</span>
      </div>
      <div className="moving-rod-chart-grid">
        <div data-testid="i01-chart-flux">
          <SeriesChart title="磁通量 Φ" unit="Wb" color="var(--flux)" points={flux} duration={duration} time={time} currentValue={snapshot.phiWb} formatValue={(value) => formatSI(value, 'Wb')} />
        </div>
        <div data-testid="i01-chart-emf">
          <SeriesChart title={`电动势 ε${estimated ? '（估算）' : ''}`} unit="V" color="var(--emf)" points={emf} duration={duration} time={time} currentValue={snapshot.emfV ?? 0} formatValue={(value) => `${prefix}${formatSI(value, 'V')}`} />
        </div>
        <div data-testid="i01-chart-current">
          <SeriesChart title={`电流 I${estimated ? '（估算）' : ''}`} unit="A" color="var(--current)" points={current} duration={duration} time={time} currentValue={snapshot.currentA ?? 0} formatValue={(value) => `${prefix}${formatSI(value, 'A')}`} />
        </div>
      </div>
      <p className="moving-rod-energy-residual">Ψ = NΦ 与 dΦ/dt 在数据面板中给出；历史由真实时间序列记录，不由当前参数反推。</p>
    </section>
  );
}
