import { useRef, useState } from 'react';
import { ChatPanel } from '../Chat';
import { CommandApprovalComposer, ComposerBar } from '../Composer';
import { TrayPanel } from '../Tray';
import { useChat } from '../../hooks/useChat';
import { useTray } from '../../hooks/useTray';
import { useWindowSync } from '../../hooks/useWindowSync';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useTerminalCommandBlocks } from '../../hooks/useTerminalCommandBlocks';
import {
  consumeShellModeActivator,
  getRecommendedComposerAction,
  getShellPrediction,
  getShellToggleShortcutTokens,
  resolveComposerMode
} from '../../lib/composerIntelligence';
import { HELP_ITEMS, COMMAND_ITEMS } from '../../lib/constants';
import type { CommandApproval } from '../../types/terminal';
import type { ComposerMode } from '../../types/ui';

export function Launcher() {
  const [modeLock, setModeLock] = useState<ComposerMode | null>(null);
  const { query, setQuery, messages, submitToolResult } = useChat({
    onCommandApproval: (approval) => requestCommandApproval(approval)
  });
  const { isTrayOpen, activeTrayMode, toggleTray } = useTray();
  const terminal = useTerminalCommandBlocks();
  const [pendingApproval, setPendingApproval] = useState<CommandApproval | null>(null);
  const composerMode = resolveComposerMode(query, modeLock);
  const shellPrediction = composerMode === 'shell' ? getShellPrediction(query, terminal.blocks) : null;
  const recommendedAction = getRecommendedComposerAction({
    mode: composerMode,
    query,
    messages,
    terminalBlocks: terminal.blocks,
    terminalError: terminal.error
  });
  const shellShortcutTokens = getShellToggleShortcutTokens();
  const { handleKeyDown } = useKeyboardShortcuts({
    onCommandApproval: (command) => requestCommandApproval(command),
    onNewChat: () => {
      setPendingApproval(null);
      setModeLock(null);
      terminal.clearBlocks();
    },
    onTerminalCommand: (command) => {
      void terminal.runCommand(command);
    },
    isShellMode: composerMode === 'shell',
    hasPrediction: Boolean(shellPrediction),
    onAcceptPrediction: () => {
      if (shellPrediction) {
        setQuery(shellPrediction.fullCommand);
      }
    },
    onExitShellMode: () => {
      setModeLock(query.trim().length > 0 ? 'chat' : null);
    },
    onToggleShellMode: () => {
      if (composerMode === 'shell') {
        setModeLock('chat');
      } else {
        setModeLock('shell');
      }
    }
  });
  
  const shellRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  useWindowSync(shellRef);

  const isChatOpen = messages.length > 0 || terminal.blocks.length > 0 || Boolean(terminal.error);
  const isChatVisible = isChatOpen && !isTrayOpen;
  const isExpanded = isTrayOpen || isChatOpen;

  const requestCommandApproval = (approval: CommandApproval) => {
    console.log('[Launcher] requestCommandApproval called for:', approval.command);
    setPendingApproval({
      command: approval.command,
      toolCallId: approval.toolCallId,
      reason: approval.reason
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
            inputMode={composerMode}
            isOpen={isTrayOpen}
            onExitShellMode={() => setModeLock(query.trim().length > 0 ? 'chat' : null)}
            onInsertCommand={(command) => setQuery(`${command} `)}
            shellShortcutTokens={shellShortcutTokens}
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
                setModeLock('shell');
                setQuery(command);
              }}
              onReject={() => setPendingApproval(null)}
              onRun={async (command) => {
                const toolCallId = pendingApproval?.toolCallId;
                setPendingApproval(null);
                
                // Execute the command and get the output
                const result = await terminal.runCommand(command);
                
                // If this was an AI-proposed command, send the result back to continue the loop
                if (toolCallId && result) {
                  void submitToolResult(
                    toolCallId,
                    result.output || '(Comanda s-a executat fără output)',
                    command
                  );
                }
              }}
            />
          ) : (
            <ComposerBar
              mode={composerMode}
              onKeyDown={handleKeyDown}
              onHeightChange={() => {}}
              onQueryChange={(val) => {
                const nextValue = consumeShellModeActivator(val);
                if (nextValue.consumed) {
                  setModeLock('shell');
                } else if (val.length === 0 && modeLock === 'chat') {
                  setModeLock(null);
                }

                setQuery(nextValue.value);
                if (nextValue.value === '/' && !isTrayOpen) {
                  toggleTray('commands');
                } else if ((nextValue.value === '' || nextValue.value === '//') && isTrayOpen && activeTrayMode === 'commands') {
                  toggleTray('commands');
                }
              }}
              onRecommendedActionClick={(action) => {
                setModeLock(action.mode === 'shell' ? 'shell' : null);
                setQuery(action.value);
              }}
              placeholder="Ask Octomus, or run terminal commands with ! git status"
              prediction={shellPrediction}
              query={query}
              recommendedAction={recommendedAction}
            />
          )}
        </div>
      </section>
    </main>
  );
}
