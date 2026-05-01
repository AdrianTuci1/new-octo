import { useRef, useState } from 'react';
import { ChatPanel } from '../Chat';
import { CommandApprovalComposer, ComposerBar } from '../Composer';
import { TrayPanel } from '../Tray';
import { useChat } from '../../hooks/useChat';
import { useTray } from '../../hooks/useTray';
import { useWindowSync } from '../../hooks/useWindowSync';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useTerminalCommandBlocks } from '../../hooks/useTerminalCommandBlocks';
import { HELP_ITEMS, COMMAND_ITEMS } from '../../lib/constants';
import type { CommandApproval } from '../../types/terminal';

export function Launcher() {
  const { query, setQuery, messages } = useChat();
  const { isTrayOpen, activeTrayMode, toggleTray } = useTray();
  const terminal = useTerminalCommandBlocks();
  const [pendingApproval, setPendingApproval] = useState<CommandApproval | null>(null);
  const { handleKeyDown } = useKeyboardShortcuts({
    onCommandApproval: (command) => requestCommandApproval(command),
    onNewChat: () => {
      setPendingApproval(null);
      terminal.clearBlocks();
    },
    onTerminalCommand: (command) => {
      void terminal.runCommand(command);
    }
  });
  
  const shellRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  useWindowSync(shellRef);

  const isChatOpen = messages.length > 0 || terminal.blocks.length > 0 || Boolean(terminal.error);
  const isChatVisible = isChatOpen && !isTrayOpen;
  const isExpanded = isTrayOpen || isChatOpen;

  const requestCommandApproval = (command: string) => {
    const normalized = command.trim();
    if (!normalized) return;

    setPendingApproval({
      id: `command-approval-${Date.now()}`,
      command: normalized
    });
  };

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
              expandedTerminalBlockIds={terminal.expandedBlockIds}
              onCollapseTerminalBlock={terminal.collapseBlock}
              onExpandTerminalBlock={terminal.expandBlock}
              onRequestCommandApproval={requestCommandApproval}
              onSelectTerminalBlock={terminal.setSelectedBlockId}
              selectedTerminalBlockId={terminal.selectedBlockId}
              terminalBlocks={terminal.blocks}
              terminalError={terminal.error}
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
            onToggleCommands={() => {
              const willOpen = !isTrayOpen || activeTrayMode !== 'commands';
              setQuery(willOpen ? '/' : '');
              toggleTray('commands');
            }}
            onToggleHelp={() => toggleTray('help')}
            onToggleConversations={() => toggleTray('conversations')}
          />

          {pendingApproval ? (
            <CommandApprovalComposer
              approval={pendingApproval}
              onEdit={(command) => {
                setPendingApproval(null);
                setQuery(`! ${command}`);
              }}
              onReject={() => setPendingApproval(null)}
              onRun={(command) => {
                setPendingApproval(null);
                void terminal.runCommand(command);
              }}
            />
          ) : (
            <ComposerBar
              onKeyDown={handleKeyDown}
              onHeightChange={() => {}}
              onQueryChange={(val) => {
                setQuery(val);
                if (val === '/' && !isTrayOpen) {
                  toggleTray('commands');
                } else if ((val === '' || val === '//') && isTrayOpen && activeTrayMode === 'commands') {
                  toggleTray('commands');
                }
              }}
              placeholder="Ask Octomus, or run terminal commands with ! git status"
              query={query}
            />
          )}
        </div>
      </section>
    </main>
  );
}
