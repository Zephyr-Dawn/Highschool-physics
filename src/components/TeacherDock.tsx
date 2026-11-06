import type { ReactNode } from 'react';
import { MathTex } from './MathTex';

export function TeacherDock({
  formula,
  stats,
  footnote,
  controls,
  formulaVisible = true,
}: {
  formula: string;
  stats: Array<{ label: string; value: ReactNode }>;
  footnote?: ReactNode;
  controls?: ReactNode;
  formulaVisible?: boolean;
}) {
  return (
    <section className="teacher-dock" aria-label="教师演示数据">
      <div className="teacher-stats">
        {stats.map((stat) => (
          <div className="teacher-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
      {formulaVisible ? (
        <div className="teacher-formula">
          <MathTex block>{formula}</MathTex>
          {footnote ? <p>{footnote}</p> : null}
        </div>
      ) : null}
      {controls ? <div className="teacher-controls">{controls}</div> : null}
    </section>
  );
}
