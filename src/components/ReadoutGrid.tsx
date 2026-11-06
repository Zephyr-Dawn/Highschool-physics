import type { ReactNode } from 'react';

export interface ReadoutItem {
  label: string;
  value: ReactNode;
  hint?: string;
  testId?: string;
}

export function ReadoutGrid({ items }: { items: ReadoutItem[] }) {
  return (
    <div className="readout-grid">
      {items.map((item) => (
        <div className="readout" key={item.label} data-testid={item.testId}>
          <span className="readout-label">{item.label}</span>
          <strong className="readout-value">{item.value}</strong>
          {item.hint ? <span className="readout-hint">{item.hint}</span> : null}
        </div>
      ))}
    </div>
  );
}
