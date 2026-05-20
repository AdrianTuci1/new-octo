import './TrayCommands.css';
import { Command, CornerDownLeft } from 'lucide-react';
import { filterCommandItems } from '../../lib/constants';
import type { CommandItem } from '../../types/ui';

type TrayCommandsProps = {
  items: CommandItem[];
  query: string;
  selectedIndex: number;
  onInsertCommand: (command: string) => void;
};

export function TrayCommands({ items, query, selectedIndex, onInsertCommand }: TrayCommandsProps) {
  const visibleItems = filterCommandItems(items, query);

  return (
    <section className="tray-pane tray-commands" aria-label="Tray commands">
      <div className="tray-pane-scroll">
        <div className="command-list">
          {visibleItems.map((item, index) => {
            const Icon = item.icon;
            const isSelected = index === selectedIndex;

            return (
              <button
                key={item.label}
                className={`command-row ${isSelected ? 'selected' : ''}`}
                onClick={() => onInsertCommand(item.label)}
                type="button"
              >
                <div className="command-keys">
                  <span className="keycap">
                    <Icon size={12} strokeWidth={2} />
                  </span>
                </div>
                <span className="command-label">{item.label}</span>
                {isSelected && (
                  <span className="command-shortcut-hint" aria-hidden="true">
                    <span className="command-shortcut-key">
                      <Command size={10} />
                    </span>
                    <span className="command-shortcut-key">
                      <CornerDownLeft size={10} />
                    </span>
                  </span>
                )}
                <span className="command-detail">{item.detail}</span>
              </button>
            );
          })}

          {visibleItems.length === 0 && (
            <div className="command-empty-state">
              No matching commands.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
