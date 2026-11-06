import type { ReactNode } from 'react';

export interface PanelTab<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface PanelTabsProps<T extends string> {
  tabs: PanelTab<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}

export function PanelTabs<T extends string>({ tabs, active, onChange, label }: PanelTabsProps<T>) {
  return (
    <div className="panel-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className="panel-tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {typeof tab.count === 'number' ? <span className="panel-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
