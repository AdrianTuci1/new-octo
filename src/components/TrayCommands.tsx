import './TrayCommands.css';
import { Grid3X3 } from 'lucide-react';
import type { CommandItem } from './trayTypes';

type TrayCommandsProps = {
  items: CommandItem[];
  onInsertCommand: (command: string) => void;
};

export function TrayCommands({ items, onInsertCommand }: TrayCommandsProps) {
  return (
    <section className="tray-pane tray-commands" aria-label="Tray commands">
      <div className="tray-header">
        <span className="tray-title">/COMMANDS</span>
        <Grid3X3 className="tray-header-icon" size={12} strokeWidth={1.7} />
      </div>

      <div className="tray-pane-scroll">
        <div className="command-list">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className="command-row"
                onClick={() => onInsertCommand(item.label)}
                type="button"
              >
                <span className="command-row-icon" aria-hidden="true">
                  <Icon size={12} strokeWidth={1.8} />
                </span>
                <span className="command-row-label">{item.label}</span>
                <span className="command-row-detail">{item.detail}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
