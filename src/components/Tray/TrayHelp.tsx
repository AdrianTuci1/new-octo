import './TrayHelp.css';
import type { HelpItem } from '../../types/ui';

type TrayHelpProps = {
  items: HelpItem[];
};

export function TrayHelp({ items }: TrayHelpProps) {
  return (
    <section className="tray-pane tray-help" aria-label="Tray help">
      <div className="tray-pane-scroll">
        <div className="help-list">
          {items.map((item) => (
            <div key={item.label} className="help-row">
              <div className="help-keys" aria-hidden="true">
                {item.keys.map((key) => (
                  <span key={`${item.label}-${key}`} className="keycap">
                    {key}
                  </span>
                ))}
              </div>
              <span className="help-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
