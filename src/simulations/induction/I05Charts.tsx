import { useMemo, useState } from 'react';
import { SeriesChart } from '../../components/SeriesChart';
import { formatNumber, formatSI } from '../../lib/format';
import { downsampleI05Samples } from '../../physics/induction/movingLoopSolver';
import type { I05Snapshot, I05Solution } from '../../physics/induction/movingLoopTimeField';

type I05ChartGroup = 'flux' | 'emf' | 'motion' | 'energy';

const GROUPS: Array<{ id: I05ChartGroup; label: string }> = [
  { id: 'flux', label: '场与磁通' },
  { id: 'emf', label: 'EMF 分解' },
  { id: 'motion', label: '运动与力' },
  { id: 'energy', label: '能量账本' },
];

interface I05ChartsProps {
  solution: I05Solution;
  snapshot: I05Snapshot;
  timeS: number;
  testId?: string;
}

export function I05Charts({ solution, snapshot, timeS, testId = 'i05-charts' }: I05ChartsProps) {
  const [group, setGroup] = useState<I05ChartGroup>('flux');
  const samples = useMemo(() => downsampleI05Samples(solution.samples, 260), [solution.samples]);
  const duration = Math.max(solution.durationS, 1e-9);
  const points = (pick: (sample: I05Snapshot) => number | null) =>
    samples
      .filter((sample) => {
        const value = pick(sample);
        return value !== null && Number.isFinite(value);
      })
      .map((sample) => ({ tS: sample.timeS, value: pick(sample) as number }));

  const lanes = {
    flux: [
      { title: '外加磁场 Bz', unit: 'T', color: 'var(--field)', points: points((s) => s.Bz), current: snapshot.Bz, format: (v: number) => formatSI(v, 'T') },
      { title: '重叠长度 ℓ', unit: 'm', color: 'var(--velocity)', points: points((s) => s.overlapLengthM), current: snapshot.overlapLengthM, format: (v: number) => formatNumber(v, 3) },
      { title: '单匝磁通 Φ', unit: 'Wb', color: 'var(--flux)', points: points((s) => s.fluxWb), current: snapshot.fluxWb, format: (v: number) => formatSI(v, 'Wb') },
      { title: 'N 匝磁链 Ψ', unit: 'Wb·turn', color: 'var(--accent)', points: points((s) => s.linkageWbTurn), current: snapshot.linkageWbTurn, format: (v: number) => formatNumber(v, 4) },
    ],
    emf: [
      { title: '感生 ε_t', unit: 'V', color: 'var(--emf)', points: points((s) => s.emfTransformerV), current: snapshot.emfTransformerV ?? 0, format: (v: number) => formatSI(v, 'V') },
      { title: '动生 ε_m', unit: 'V', color: 'var(--velocity)', points: points((s) => s.emfMotionalV), current: snapshot.emfMotionalV ?? 0, format: (v: number) => formatSI(v, 'V') },
      { title: '总 ε', unit: 'V', color: 'var(--accent)', points: points((s) => s.emfTotalV), current: snapshot.emfTotalV ?? 0, format: (v: number) => formatSI(v, 'V') },
      { title: '电流 I', unit: 'A', color: 'var(--current)', points: points((s) => s.currentA), current: snapshot.currentA ?? 0, format: (v: number) => formatSI(v, 'A') },
    ],
    motion: [
      { title: '位置 x', unit: 'm', color: 'var(--velocity)', points: points((s) => s.xM), current: snapshot.xM, format: (v: number) => formatNumber(v, 3) },
      { title: '速度 vx', unit: 'm/s', color: 'var(--accent)', points: points((s) => s.velocityMps), current: snapshot.velocityMps, format: (v: number) => formatNumber(v, 3) },
      { title: '磁场力 F_Bx', unit: 'N', color: 'var(--force)', points: points((s) => s.magneticForceX), current: snapshot.magneticForceX ?? 0, format: (v: number) => formatSI(v, 'N') },
      { title: '外力 F_ext', unit: 'N', color: 'var(--ink-muted)', points: points((s) => s.externalForceRequiredN), current: snapshot.externalForceRequiredN ?? 0, format: (v: number) => formatSI(v, 'N') },
    ],
    energy: [
      { title: '动能 K', unit: 'J', color: 'var(--velocity)', points: points((s) => s.kineticEnergyJ), current: snapshot.kineticEnergyJ, format: (v: number) => formatSI(v, 'J') },
      { title: '焦耳热 Q_J', unit: 'J', color: 'var(--force)', points: points((s) => s.jouleHeatJ), current: snapshot.jouleHeatJ, format: (v: number) => formatSI(v, 'J') },
      { title: '外力功 W_ext', unit: 'J', color: 'var(--accent)', points: points((s) => s.externalWorkJ), current: snapshot.externalWorkJ, format: (v: number) => formatSI(v, 'J') },
      { title: '场源交换 W_ts', unit: 'J', color: 'var(--flux)', points: points((s) => s.transformerSourceWorkJ), current: snapshot.transformerSourceWorkJ, format: (v: number) => formatSI(v, 'J') },
    ],
  }[group];

  return (
    <section className="i05-charts" aria-label="I05 图像组" data-testid={testId}>
      <div className="chart-group-tabs" role="tablist" aria-label="I05 图像分组">
        {GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={group === item.id}
            className={`chart-group-tab ${group === item.id ? 'is-active' : ''}`}
            onClick={() => setGroup(item.id)}
            data-testid={`${testId}-tab-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="chart-lane-grid">
        {lanes.map((lane) => (
          <SeriesChart
            key={lane.title}
            title={lane.title}
            unit={lane.unit}
            color={lane.color}
            points={lane.points}
            duration={duration}
            time={timeS}
            currentValue={lane.current}
            formatValue={lane.format}
          />
        ))}
      </div>
      {group === 'energy' ? (
        <p className={`i05-residual ${Math.abs(snapshot.energyResidualJ ?? 0) > 1e-4 ? 'is-warning' : ''}`} data-testid="i05-chart-energy-residual">
          能量残差 = (K−K₀) + Q_J − W_ext − W_ts = {snapshot.energyResidualJ === null ? '不适用（手动拖动）' : `${formatSI(snapshot.energyResidualJ, 'J')}`}
        </p>
      ) : (
        <p className="chart-note">
          共用时间光标；几何阈值与 B(t) 折点标记见事件表。折点处 dB/dt 不唯一时，电动势显示为“不可用”而不伪造单值。
        </p>
      )}
    </section>
  );
}
