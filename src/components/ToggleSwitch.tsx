import { useId } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, label, description, disabled }: ToggleSwitchProps) {
  const id = useId();
  return (
    <div className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <label htmlFor={id} className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description ? <span className="toggle-description">{description}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch ${checked ? 'switch-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
