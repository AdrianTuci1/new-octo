import { useRef } from 'react';
import { ChatPanel } from '../Chat';
import { ComposerBar } from '../Composer';
import { TrayPanel } from '../Tray';
import { useChat } from '../../hooks/useChat';
import { useTray } from '../../hooks/useTray';
import { useWindowSync } from '../../hooks/useWindowSync';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { HELP_ITEMS, COMMAND_ITEMS } from '../../lib/constants';

export function Launcher() {
  const { query, setQuery, messages } = useChat();
  const { isTrayOpen, activeTrayMode, toggleTray } = useTray();
  const { handleKeyDown } = useKeyboardShortcuts();
  
  const shellRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  useWindowSync(shellRef);

  const isChatOpen = messages.length > 0;
  const isExpanded = isTrayOpen || isChatOpen;

  const isChatVisible = isChatOpen && !isTrayOpen;

  return (
    <main className="prototype-root">
      <section
        ref={shellRef}
        className={`launcher-shell ${isChatVisible ? 'chat-active' : ''} ${isTrayOpen ? 'tray-active' : ''} ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        {isChatOpen && !isTrayOpen && (
          <div className="chat-stack">
            <ChatPanel
              isOpen={true}
              messages={messages}
            />
          </div>
        )}

        <div ref={dockRef} className="dock-stack">
          <TrayPanel
            activeMode={activeTrayMode}
            commandItems={COMMAND_ITEMS}
            helpItems={HELP_ITEMS}
            isOpen={isTrayOpen}
            onInsertCommand={(command) => setQuery(`${command} `)}
            onToggleCommands={() => toggleTray('commands')}
            onToggleHelp={() => toggleTray('help')}
            onToggleConversations={() => toggleTray('conversations')}
          />

          <ComposerBar
            onKeyDown={handleKeyDown}
            onHeightChange={() => {}}
            onQueryChange={setQuery}
            query={query}
          />
        </div>
      </section>
    </main>
  );
}
