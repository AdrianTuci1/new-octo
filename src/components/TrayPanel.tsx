import './TrayPanel.css';
import { TrayCommands } from './TrayCommands';
import { TrayHelp } from './TrayHelp';
import type { CommandItem, HelpItem, TrayContentMode } from './trayTypes';

type TrayPanelProps = {
  isOpen: boolean;
  activeMode: TrayContentMode;
  helpItems: HelpItem[];
  commandItems: CommandItem[];
  onToggleHelp: () => void;
  onToggleCommands: () => void;
  onInsertCommand: (command: string) => void;
};

export function TrayPanel({
  isOpen,
  activeMode,
  helpItems,
  commandItems,
  onToggleHelp,
  onToggleCommands,
  onInsertCommand
}: TrayPanelProps) {
  const isHelp = activeMode === 'help';

  return (
    <div className={`tray-region ${isOpen ? 'open' : 'closed'}`}>
      <div className="tray-body">
        {isHelp ? (
          <TrayHelp items={helpItems} />
        ) : (
          <TrayCommands items={commandItems} onInsertCommand={onInsertCommand} />
        )}
      </div>

      <div className={`tray-footer ${isOpen ? 'expanded' : 'collapsed'}`}>
        <div className="tray-switcher">
          <div className="tray-switch-item">
            <button className={`mode-button ${isHelp ? 'active' : ''}`} onClick={onToggleHelp} type="button">
              ?
            </button>
            <span className="tray-switch-label">for help</span>
          </div>
          <div className="tray-switch-item">
            <button
              className={`mode-button ${!isHelp ? 'active' : ''}`}
              onClick={onToggleCommands}
              type="button"
            >
              /
            </button>
            <span className="tray-switch-label">for commands</span>
          </div>
        </div>

        <div className="tray-footer-divider" aria-hidden="true" />

        {isOpen && (
          <div className="tray-footer-copy">
            <span className="tray-footer-icon">{isHelp ? '?' : '/'}</span>
            <span className="tray-footer-title">{isHelp ? 'System' : 'Tools'}</span>
            <span className="tray-footer-subtitle">
              {isHelp ? 'Help shortcuts and system actions' : 'Command presets and quick actions'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
