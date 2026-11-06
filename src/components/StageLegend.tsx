export interface LegendItem {
  label: string;
  color: string;
  variant?: 'solid' | 'dashed' | 'dot' | 'field';
}

export function StageLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="stage-legend" aria-label="图例">
      {items.map((item) => (
        <span className="legend-item" key={item.label}>
          <span
            className={`legend-swatch legend-${item.variant ?? 'solid'}`}
            style={{ color: item.color, borderColor: item.color, background: item.color }}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
