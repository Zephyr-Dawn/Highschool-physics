import { useMemo, useState } from 'react';
import { SeriesChart } from '../../components/SeriesChart';
import { formatNumber, formatSI } from '../../lib/format';
import type { DualRodSnapshot } from '../../physics/induction/dualRodCoupling';

type I06ChartGroup = 'positions' | 'velocities' | 'emf' | 'energy';

const GROUPS: Array<{ id: I06ChartGroup; label: string }> = [
  { id: 'positions', label: '位置与间距' },
  { id: 'velocities', label: '速度收敛' },
  { id: 'emf', label: 'EMF / 电流 / 力' },
  { id: 'energy', label: '能量与动量' },
];

interface I06ChartsProps {
  samples: DualRodSnapshot[];
  snapshot: DualRodSnapshot;
  durationS: number;
  timeS: number;
  testId?: string;
}

export function I06Charts({ samples, snapshot, durationS, timeS, testId = 'i06-charts' }: I06ChartsProps) {
  const [group, setGroup] = useState<I06ChartGroup>('positions');
  const display = useMemo(() => {
    if (samples.length <= 280) return samples;
    const step = (samples.length - 1) / 279;
    return Array.from({ length: 280 }, (_, index) => samples[Math.round(index * step)]);
  }, [samples]);
  const points = (pick: (sample: DualRodSnapshot) => number) =>
    display.map((sample) => ({ tS: sample.timeS, value: pick(sample) }));

  const lanes = {
    positions: [
      { title: '杆 1 位置 x₁', unit: 'm', color: 'var(--velocity)', points: points((s) => s.rod1.x), current: snapshot.rod1.x, format: (v: number) => formatNumber(v, 3) },
      { title: '杆 2 位置 x₂', unit: 'm', color: 'var(--accent)', points: points((s) => s.rod2.x), current: snapshot.rod2.x, format: (v: number) => formatNumber(v, 3) },
      { title: '间距 d = x₂−x₁', unit: 'm', color: 'var(--force)', points: points((s) => s.separationM), current: snapshot.separationM, format: (v: number) => formatNumber(v, 3) },
    ],
    velocities: [
      { title: '杆 1 速度 v₁', unit: 'm/s', color: 'var(--velocity)', points: points((s) => s.rod1.v), current: snapshot.rod1.v, format: (v: number) => formatNumber(v, 3) },
      { title: '杆 2 速度 v₂', unit: 'm/s', color: 'var(--accent)', points: points((s) => s.rod2.v), current: snapshot.rod2.v, format: (v: number) => formatNumber(v, 3) },
      { title: '相对速度 Δv', unit: 'm/s', color: 'var(--emf)', points: points((s) => s.relativeVelocityMS), current: snapshot.relativeVelocityMS, format: (v: number) => formatNumber(v, 3) },
      { title: '质心速度 Vcm', unit: 'm/s', color: 'var(--ink-muted)', points: points((s) => s.centerOfMassVelocityMS), current: snapshot.centerOfMassVelocityMS, format: (v: number) => formatNumber(v, 3) },
    ],
    emf: [
      { title: '杆 1 EMF', unit: 'V', color: 'var(--velocity)', points: points((s) => s.emfRod1V), current: snapshot.emfRod1V, format: (v: number) => formatSI(v, 'V') },
      { title: '杆 2 EMF', unit: 'V', color: 'var(--accent)', points: points((s) => s.emfRod2V), current: snapshot.emfRod2V, format: (v: number) => formatSI(v, 'V') },
      { title: '总 EMF', unit: 'V', color: 'var(--emf)', points: points((s) => s.emfTotalV), current: snapshot.emfTotalV, format: (v: number) => formatSI(v, 'V') },
      { title: '电流 I', unit: 'A', color: 'var(--current)', points: points((s) => s.currentA), current: snapshot.currentA, format: (v: number) => formatSI(v, 'A') },
      { title: '杆 1 磁场力', unit: 'N', color: 'var(--force)', points: points((s) => s.forceRod1N), current: snapshot.forceRod1N, format: (v: number) => formatSI(v, 'N') },
      { title: '杆 2 磁场力', unit: 'N', color: 'var(--ink-muted)', points: points((s) => s.forceRod2N), current: snapshot.forceRod2N, format: (v: number) => formatSI(v, 'N') },
    ],
    energy: [
      { title: '动能 K', unit: 'J', color: 'var(--velocity)', points: points((s) => s.kineticEnergyJ), current: snapshot.kineticEnergyJ, format: (v: number) => formatSI(v, 'J') },
      { title: '焦耳热 Q_J', unit: 'J', color: 'var(--force)', points: points((s) => s.jouleHeatJ), current: snapshot.jouleHeatJ, format: (v: number) => formatSI(v, 'J') },
      { title: '外力功 W_ext', unit: 'J', color: 'var(--accent)', points: points((s) => s.externalWorkJ), current: snapshot.externalWorkJ, format: (v: number) => formatSI(v, 'J') },
      { title: '总动量 p', unit: 'kg·m/s', color: 'var(--flux)', points: points((s) => s.totalMomentumKgMS), current: snapshot.totalMomentumKgMS, format: (v: number) => formatNumber(v, 3) },
    ],
  }[group];

  return (
    <section className="i06-charts" aria-label="I06 图像组" data-testid={testId}>
      <div className="chart-group-tabs" role="tablist" aria-label="I06 图像分组">
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
            duration={Math.max(durationS, 1e-9)}
            time={timeS}
            currentValue={lane.current}
            formatValue={lane.format}
          />
        ))}
      </div>
      {group === 'energy' ? (
        <p className={`i06-residual ${Math.abs(snapshot.energyResidualJ ?? 0) > 1e-4 ? 'is-warning' : ''}`} data-testid="i06-chart-energy-residual">
          能量残差 = (K−K₀) + Q_J − W_ext = {snapshot.energyResidualJ === null ? '不适用（手动拖动）' : formatSI(snapshot.energyResidualJ, 'J')}
          {' · '}总动量 p = {formatNumber(snapshot.totalMomentumKgMS, 3)} kg·m/s
        </p>
      ) : (
        <p className="chart-note">
          共用时间光标；D1/D2 使用解析解，D4 手势速度为时间戳估计并关闭精确能量残差。
        </p>
      )}
    </section>
  );
}
