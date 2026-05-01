import './TrayCommands.css';
import type { CommandItem } from '../../types/ui';

type TrayCommandsProps = {
  items: CommandItem[];
  onInsertCommand: (command: string) => void;
};

export function TrayCommands({ items, onInsertCommand }: TrayCommandsProps) {
  return (
    <section className="tray-pane tray-commands" aria-label="Tray commands">
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
                <div className="command-keys">
                  <span className="keycap">
                    <Icon size={12} strokeWidth={2} />
                  </span>
                </div>
                <div className="command-text">
                  <span className="command-label">{item.label}</span>
                  <span className="command-detail">{item.detail}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
