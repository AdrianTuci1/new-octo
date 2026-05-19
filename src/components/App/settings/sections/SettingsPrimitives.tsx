import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function SettingsToggle({ checked = false, onChange }: { checked?: boolean; onChange?: () => void }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'active' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="settings-section-header">
      <h2 className="settings-section-title">{title}</h2>
    </div>
  );
}

export function SettingsRow({
  title,
  description,
  action
}: {
  title: ReactNode;
  description?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <div className="settings-row-title">{title}</div>
        {description ? <div className="settings-row-description">{description}</div> : null}
      </div>
      <div className="settings-row-action">
        {action}
      </div>
    </div>
  );
}

export function SettingsSelect({
  value,
  options,
  onChange,
  minWidth = 120
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  minWidth?: number;
}) {
  return (
    <label className="settings-select-native" style={{ minWidth }}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  );
}
