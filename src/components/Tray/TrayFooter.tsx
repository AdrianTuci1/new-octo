import { ChevronDown, ChevronUp, Command, MessagesSquare } from 'lucide-react';
import './TrayFooter.css';
import type { ComposerMode, ShellModeSource, TrayContentMode } from '../../types/ui';

type TrayFooterProps = {
  activeMode: TrayContentMode;
  inputMode: ComposerMode;
  isOpen: boolean;
  shellShortcutTokens: string[];
  shellSource: ShellModeSource | null;
  onExitShellMode: () => void;
  onToggleCommands: () => void;
  onToggleConversations: () => void;
  onToggleHelp: () => void;
};

function ShellFooter({
  shellShortcutTokens,
  shellSource,
  onExitShellMode
}: Pick<TrayFooterProps, 'shellShortcutTokens' | 'shellSource' | 'onExitShellMode'>) {
  if (shellSource === 'autodetected') {
    return (
      <div className="tray-switcher">
        <div className="tray-switch-item">
          <span className="tray-switch-label">autodetected shell command,</span>
          {shellShortcutTokens.map((token) => (
            <div key={token} className="mode-button active tray-shortcut-token">
              {token}
            </div>
          ))}
          <span className="tray-switch-label">to override</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tray-switcher">
      <div className="tray-switch-item">
        <button className="mode-button active" onClick={onExitShellMode} type="button">
          ⌫
        </button>
        <span className="tray-switch-label">to exit shell mode</span>
      </div>
      <div className="tray-switch-item">
        {shellShortcutTokens.map((token) => (
          <div key={token} className="mode-button active tray-shortcut-token">
            {token}
          </div>
        ))}
        <span className="tray-switch-label">toggle input</span>
      </div>
    </div>
  );
}

export function TrayFooter(props: TrayFooterProps) {
  const {
    activeMode,
    inputMode,
    isOpen,
    onExitShellMode,
    onToggleCommands,
    onToggleConversations,
    onToggleHelp,
    shellShortcutTokens,
    shellSource
  } = props;

  if (inputMode === 'shell') {
    return <ShellFooter onExitShellMode={onExitShellMode} shellShortcutTokens={shellShortcutTokens} shellSource={shellSource} />;
  }

  if (!isOpen) {
    return (
      <div className="tray-switcher">
        <div className="tray-switch-item">
          <button className={`mode-button ${activeMode === 'help' ? 'active' : ''}`} onClick={onToggleHelp} type="button">?</button>
          <span className="tray-switch-label">for help</span>
        </div>
        <div className="tray-switch-item">
          <button className={`mode-button ${activeMode === 'commands' ? 'active' : ''}`} onClick={onToggleCommands} type="button">/</button>
          <span className="tray-switch-label">for commands</span>
        </div>
        <div className="tray-switch-item">
          <button className={`mode-button ${activeMode === 'conversations' ? 'active' : ''}`} onClick={onToggleConversations} type="button">
            <Command size={10} />
          </button>
          <button className={`mode-button ${activeMode === 'conversations' ? 'active' : ''}`} onClick={onToggleConversations} type="button">Y</button>
          <span className="tray-switch-label">open conversation</span>
        </div>
      </div>
    );
  }

  return (
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
            <div className="mode-button active tray-wide-key">Esc</div>
            <span className="tray-switch-label">to dismiss</span>
          </div>
        </>
      )}

      {activeMode === 'history' && (
        <>
          <div className="tray-switch-item">
            <div className="mode-button active"><ChevronUp size={10} /></div>
            <div className="mode-button active"><ChevronDown size={10} /></div>
            <span className="tray-switch-label">to navigate</span>
          </div>
          <div className="tray-switch-item">
            <div className="mode-button active tray-wide-key">⇧</div>
            <div className="mode-button active tray-wide-key">Tab</div>
            <span className="tray-switch-label">to cycle tabs</span>
          </div>
          <div className="tray-switch-item">
            <div className="mode-button active tray-wide-key">Esc</div>
            <span className="tray-switch-label">to dismiss</span>
          </div>
        </>
      )}

      {activeMode === 'models' && (
        <>
          <div className="tray-switch-item">
            <div className="mode-button active tray-wide-key">↩</div>
            <span className="tray-switch-label">to select</span>
          </div>
          <div className="tray-switch-item">
            <div className="mode-button active tray-wide-key">⌘</div>
            <div className="mode-button active tray-wide-key">↩</div>
            <span className="tray-switch-label">select and save to profile</span>
          </div>
          <div className="tray-switch-item">
            <div className="mode-button active tray-wide-key">⇧</div>
            <div className="mode-button active tray-wide-key">Tab</div>
            <span className="tray-switch-label">to cycle tabs</span>
          </div>
          <div className="tray-switch-item">
            <div className="mode-button active tray-wide-key">Esc</div>
            <span className="tray-switch-label">to dismiss</span>
          </div>
        </>
      )}

      {activeMode === 'conversations' && (
        <>
          <div className="tray-switch-item">
            <div className="mode-button active"><MessagesSquare size={10} /></div>
            <span className="tray-switch-label highlight">continue in this plane</span>
          </div>
          <div className="tray-switch-item">
            <div className="mode-button active"><ChevronUp size={10} /></div>
            <div className="mode-button active"><ChevronDown size={10} /></div>
            <span className="tray-switch-label">to navigate</span>
          </div>
          <div className="tray-switch-item">
            <div className="mode-button active tray-wide-key">Esc</div>
            <span className="tray-switch-label">to dismiss</span>
          </div>
        </>
      )}
    </div>
  );
}
