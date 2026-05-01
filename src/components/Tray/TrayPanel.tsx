import { ChevronUp, ChevronDown, Command, MessagesSquare } from 'lucide-react';
import './TrayPanel.css';
import { TrayCommands } from './TrayCommands';
import { TrayHelp } from './TrayHelp';
import type { CommandItem, HelpItem, TrayContentMode } from '../../types/ui';

type TrayPanelProps = {
  isOpen: boolean;
  activeMode: TrayContentMode;
  helpItems: HelpItem[];
  commandItems: CommandItem[];
  onToggleHelp: () => void;
  onToggleCommands: () => void;
  onToggleConversations: () => void;
  onInsertCommand: (command: string) => void;
};

export function TrayPanel({
  isOpen,
  activeMode,
  helpItems,
  commandItems,
  onToggleHelp,
  onToggleCommands,
  onToggleConversations,
  onInsertCommand
}: TrayPanelProps) {
  return (
    <div className={`tray-region ${isOpen ? 'open' : 'closed'}`}>
      <div className="tray-body">
        {activeMode === 'help' && <TrayHelp items={helpItems} />}
        {activeMode === 'commands' && <TrayCommands items={commandItems} onInsertCommand={onInsertCommand} />}
        {activeMode === 'conversations' && (
          <div className="tray-pane-placeholder">
            <MessagesSquare size={32} strokeWidth={1.5} className="tray-header-icon" />
            <p>Conversation history will appear here.</p>
          </div>
        )}
      </div>

      <div className={`tray-footer ${isOpen ? 'expanded' : 'collapsed'}`}>
        {!isOpen && (
          <div className="tray-switcher">
            <div className="tray-switch-item">
              <button
                className={`mode-button ${activeMode === 'help' ? 'active' : ''}`}
                onClick={onToggleHelp}
                type="button"
              >
                ?
              </button>
              <span className="tray-switch-label">for help</span>
            </div>
            <div className="tray-switch-item">
              <button
                className={`mode-button ${activeMode === 'commands' ? 'active' : ''}`}
                onClick={onToggleCommands}
                type="button"
              >
                /
              </button>
              <span className="tray-switch-label">for commands</span>
            </div>
            <div className="tray-switch-item">
              <button
                className={`mode-button ${activeMode === 'conversations' ? 'active' : ''}`}
                onClick={onToggleConversations}
                type="button"
              >
                <Command size={10} />
              </button>
              <button
                className={`mode-button ${activeMode === 'conversations' ? 'active' : ''}`}
                onClick={onToggleConversations}
                type="button"
              >
                Y
              </button>
              <span className="tray-switch-label">open conversation</span>
            </div>
          </div>
        )}

        {isOpen && (
          <>
            <div className="tray-footer-divider" aria-hidden="true" />
            <div className="tray-switcher">
              {activeMode === 'help' && (
                <div className="tray-switch-item">
                  <div className="mode-button active">?</div>
                  <span className="tray-switch-label">to hide help</span>
                </div>
              )}

              {activeMode === 'commands' && (
                <>
                  <div className="tray-switch-item">
                    <div className="mode-button active"><ChevronUp size={10} /></div>
                    <div className="mode-button active"><ChevronDown size={10} /></div>
                    <span className="tray-switch-label">to navigate</span>
                  </div>
                  <div className="tray-switch-item">
                    <div className="mode-button active" style={{ width: 'auto', padding: '0 4px' }}>Esc</div>
                    <span className="tray-switch-label">to dismiss</span>
                  </div>
                </>
              )}

              {activeMode === 'conversations' && (
                <>
                  <div className="tray-switch-item">
                    <div className="mode-button active"><MessagesSquare size={10} /></div>
                    <span className="tray-switch-label" style={{ color: 'var(--text-main)', fontWeight: 500 }}>continue in this plane</span>
                  </div>
                  <div className="tray-switch-item">
                    <div className="mode-button active"><ChevronUp size={10} /></div>
                    <div className="mode-button active"><ChevronDown size={10} /></div>
                    <span className="tray-switch-label">to navigate</span>
                  </div>
                  <div className="tray-switch-item">
                    <div className="mode-button active" style={{ width: 'auto', padding: '0 4px' }}>Esc</div>
                    <span className="tray-switch-label">to dismiss</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
