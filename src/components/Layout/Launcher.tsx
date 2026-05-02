import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChatPanel } from '../Chat';
import { CommandApprovalComposer, ComposerBar } from '../Composer';
import { TrayPanel } from '../Tray';
import { useChat } from '../../hooks/useChat';
import { useCommandHistory } from '../../hooks/useCommandHistory';
import { useGitContext } from '../../hooks/useGitContext';
import { useModelSelection } from '../../hooks/useModelSelection';
import { useTray } from '../../hooks/useTray';
import { useWindowSync } from '../../hooks/useWindowSync';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useTerminalCommandBlocks } from '../../hooks/useTerminalCommandBlocks';
import { useShellCommandIndex } from '../../hooks/useShellCommandIndex';
import { useShellPathPrediction } from '../../hooks/useShellPathPrediction';
import { useUnifiedShellPrediction } from '../../hooks/useUnifiedShellPrediction';
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory';
import {
  consumeShellModeActivator,
  getRecommendedComposerAction,
  getShellToggleShortcutTokens,
  resolveComposerState
} from '../../lib/composerIntelligence';
import { HELP_ITEMS, COMMAND_ITEMS } from '../../lib/constants';
import type { CommandApproval } from '../../types/terminal';
import type { HistoryEntry, HistoryTab } from '../../types/history';
import type { ComposerMode, ShellModeSource } from '../../types/ui';

function formatHistoryDetail(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isSingleTokenShellCandidate(query: string) {
  const trimmed = query.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed) && /^[A-Za-z0-9._-]+$/.test(trimmed);
}

export function Launcher() {
  const [modeLock, setModeLock] = useState<ComposerMode | null>(null);
  const [autodetectedShellLatch, setAutodetectedShellLatch] = useState(false);
  const [allowSingleCharacterCommandPrediction, setAllowSingleCharacterCommandPrediction] = useState(false);
  const [terminalAutoDetectEnabled, setTerminalAutoDetectEnabled] = useState(true);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('all');
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(0);
  const [modelTab, setModelTab] = useState<'all' | 'saved'>('all');
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const workingDirectory = useWorkingDirectory();
  const gitContext = useGitContext(workingDirectory.currentPath);
  const commandHistory = useCommandHistory();
  const modelSelection = useModelSelection();
  const { query, setQuery, messages, submitToolResult } = useChat({
    cwd: workingDirectory.currentPath,
    modelId: modelSelection.selectedModelId,
    onCommandApproval: (approval) => requestCommandApproval(approval)
  });
  const { isTrayOpen, activeTrayMode, toggleTray } = useTray();
  const terminal = useTerminalCommandBlocks(workingDirectory.currentPath);
  const availableShellCommands = useShellCommandIndex();
  const [pendingApproval, setPendingApproval] = useState<CommandApproval | null>(null);
  const baseComposerState = resolveComposerState(
    query,
    modeLock,
    availableShellCommands,
    terminalAutoDetectEnabled
  );
  const { value: queryWithoutActivator } = consumeShellModeActivator(query);
  const composerState = modeLock === null
    && autodetectedShellLatch
    && baseComposerState.mode === 'chat'
    && isSingleTokenShellCandidate(query)
    ? {
      mode: 'shell' as const,
      shellSource: 'autodetected' as const
    }
    : baseComposerState;
  const composerMode = composerState.mode;
  const shellSource: ShellModeSource | null = composerState.shellSource;

  const shellPrediction = useUnifiedShellPrediction(
    queryWithoutActivator,
    composerMode,
    terminal.blocks,
    workingDirectory.currentPath ?? '',
    availableShellCommands,
    allowSingleCharacterCommandPrediction
  );


  const shellPathPrediction = useShellPathPrediction(
    query,
    composerMode === 'shell',
    workingDirectory.currentPath,
    workingDirectory.homeDir
  );

  const activeShellPrediction = shellPathPrediction ?? shellPrediction;

  const recommendedAction = getRecommendedComposerAction({
    mode: composerMode,
    query,
    messages,
    terminalBlocks: terminal.blocks,
    terminalError: terminal.error
  });
  const shellShortcutTokens = getShellToggleShortcutTokens();
  const promptHistoryEntries = useMemo<HistoryEntry[]>(
    () => {
      const filtered = queryWithoutActivator.trim().length > 0
        ? messages.filter(msg => 
            msg.role === 'user' && 
            msg.body.trim().length > 0 &&
            msg.body.toLowerCase().includes(queryWithoutActivator.toLowerCase())
          )
        : messages.filter(msg => msg.role === 'user' && msg.body.trim().length > 0);

      return filtered
        .map((message) => ({
          id: message.id,
          label: message.body,
          detail: formatHistoryDetail(message.createdAt ?? new Date().toISOString()),
          kind: 'prompt' as const,
          createdAt: message.createdAt ?? new Date().toISOString()
        }))
        .reverse();
    },
    [messages, queryWithoutActivator]
  );
  const commandHistoryEntries = useMemo<HistoryEntry[]>(
    () => {
      const filtered = queryWithoutActivator.trim().length > 0
        ? commandHistory.filter(entry => 
            entry.value.toLowerCase().includes(queryWithoutActivator.toLowerCase())
          )
        : commandHistory;

      return filtered.map((entry, index) => ({
        id: `${entry.source}-${entry.executedAt}-${index}`,
        label: entry.value,
        detail: `${entry.source} · ${formatHistoryDetail(entry.executedAt)}`,
        kind: 'command' as const,
        createdAt: entry.executedAt
      }));
    },
    [commandHistory, queryWithoutActivator]
  );
  const historyEntries = useMemo(() => {
    if (historyTab === 'commands') {
      return commandHistoryEntries;
    }

    if (historyTab === 'prompts') {
      return promptHistoryEntries;
    }

    return [...commandHistoryEntries, ...promptHistoryEntries]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [commandHistoryEntries, historyTab, promptHistoryEntries]);
  const visibleModels = useMemo(() => {
    if (modelTab !== 'saved') {
      return modelSelection.models;
    }

    const savedModels = modelSelection.models.filter((model) => model.id === modelSelection.selectedModelId);
    return savedModels.length > 0 ? savedModels : modelSelection.models;
  }, [modelSelection.models, modelSelection.selectedModelId, modelTab]);

  useEffect(() => {
    if (!terminalAutoDetectEnabled || modeLock !== null || query.trim().length === 0) {
      setAutodetectedShellLatch(false);
      return;
    }

    if (baseComposerState.mode === 'shell' && baseComposerState.shellSource === 'autodetected') {
      setAutodetectedShellLatch(true);
      return;
    }

    if (!isSingleTokenShellCandidate(query)) {
      setAutodetectedShellLatch(false);
    }
  }, [baseComposerState.mode, baseComposerState.shellSource, modeLock, query, terminalAutoDetectEnabled]);

  useEffect(() => {
    if (composerMode !== 'shell' || query.trim().length === 0) {
      setAllowSingleCharacterCommandPrediction(false);
      return;
    }

    const firstToken = query.trim().split(/\s+/)[0] ?? '';
    if (firstToken.length >= 2) {
      setAllowSingleCharacterCommandPrediction(true);
    }
  }, [composerMode, query]);

  useEffect(() => {
    setSelectedHistoryIndex((index) => Math.min(index, Math.max(0, historyEntries.length - 1)));
  }, [historyEntries.length]);

  useEffect(() => {
    const nextIndex = visibleModels.findIndex((model) => model.id === modelSelection.selectedModelId);
    setSelectedModelIndex(nextIndex >= 0 ? nextIndex : 0);
  }, [modelSelection.selectedModelId, visibleModels]);

  const { handleKeyDown } = useKeyboardShortcuts({
    cwd: workingDirectory.currentPath,
    modelId: modelSelection.selectedModelId,
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
    isManualShellMode: shellSource === 'manual',
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

  useEffect(() => {
    if (!isTrayOpen || (activeTrayMode !== 'history' && activeTrayMode !== 'models')) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (activeTrayMode === 'history') {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedHistoryIndex((index) => Math.min(index + 1, Math.max(0, historyEntries.length - 1)));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedHistoryIndex((index) => Math.max(index - 1, 0));
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const entry = historyEntries[selectedHistoryIndex];
          if (entry) {
            setModeLock(entry.kind === 'command' ? 'shell' : 'chat');
            setQuery(entry.label);
            toggleTray('history');
          }
          return;
        }

        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          setHistoryTab((tab) => tab === 'all' ? 'commands' : tab === 'commands' ? 'prompts' : 'all');
          return;
        }
      }

      if (activeTrayMode === 'models') {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedModelIndex((index) => Math.min(index + 1, Math.max(0, visibleModels.length - 1)));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedModelIndex((index) => Math.max(index - 1, 0));
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const model = visibleModels[selectedModelIndex];
          if (model) {
            modelSelection.selectModel(model.id, event.metaKey || event.ctrlKey);
            toggleTray('models');
          }
          return;
        }

        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          setModelTab((tab) => tab === 'all' ? 'saved' : 'all');
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        toggleTray(activeTrayMode);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [
    activeTrayMode,
    historyEntries,
    isTrayOpen,
    modelSelection,
    selectedHistoryIndex,
    selectedModelIndex,
    setQuery,
    toggleTray,
    visibleModels
  ]);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isTrayOpen && activeTrayMode === 'history') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedHistoryIndex((index) => Math.min(index + 1, Math.max(0, historyEntries.length - 1)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedHistoryIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const entry = historyEntries[selectedHistoryIndex];
        if (entry) {
          setModeLock(entry.kind === 'command' ? 'shell' : 'chat');
          setQuery(entry.label);
          toggleTray('history');
        }
        return;
      }

      if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        setHistoryTab((tab) => tab === 'all' ? 'commands' : tab === 'commands' ? 'prompts' : 'all');
        return;
      }
    }

    if (isTrayOpen && activeTrayMode === 'models') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedModelIndex((index) => Math.min(index + 1, Math.max(0, visibleModels.length - 1)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedModelIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const model = visibleModels[selectedModelIndex];
        if (model) {
          modelSelection.selectModel(model.id, event.metaKey || event.ctrlKey);
          toggleTray('models');
        }
        return;
      }

      if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        setModelTab((tab) => tab === 'all' ? 'saved' : 'all');
        return;
      }
    }

    if (event.key === 'ArrowUp' && !event.shiftKey && query.trim().length === 0 && !isTrayOpen) {
      event.preventDefault();
      setSelectedHistoryIndex(0);
      toggleTray('history');
      return;
    }

    handleKeyDown(event);
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
            historyEntries={historyEntries}
            historyTab={historyTab}
            inputMode={composerMode}
            isOpen={isTrayOpen}
            modelTab={modelTab}
            modelEntries={visibleModels}
            onExitShellMode={() => setModeLock(query.trim().length > 0 ? 'chat' : null)}
            onHistoryTabChange={setHistoryTab}
            onInsertCommand={(command) => setQuery(`${command} `)}
            onModelTabChange={setModelTab}
            onSelectHistoryEntry={(entry) => {
              setModeLock(entry.kind === 'command' ? 'shell' : 'chat');
              setQuery(entry.label);
              toggleTray('history');
            }}
            onSelectModel={(modelId) => modelSelection.selectModel(modelId, false)}
            shellSource={shellSource}
            shellShortcutTokens={shellShortcutTokens}
            selectedHistoryIndex={selectedHistoryIndex}
            selectedModelId={modelSelection.selectedModelId}
            selectedModelIndex={selectedModelIndex}
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
              shellSource={shellSource}
              gitBranchMenuOpen={gitContext.isBranchMenuOpen}
              gitContext={gitContext.gitContext}
              onCloseGitBranchMenu={() => gitContext.setIsBranchMenuOpen(false)}
              onKeyDown={handleComposerKeyDown}
              onHeightChange={() => { }}
              onQueryChange={(val) => {
                const nextValue = consumeShellModeActivator(val);
                if (nextValue.consumed) {
                  setModeLock('shell');
                } else if (val.length === 0 && modeLock === 'chat') {
                  setModeLock(null);
                }

                setQuery(nextValue.value);
                setSelectedHistoryIndex(0); // Reset tray selection on search

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
              onCloseWorkingDirectoryPicker={workingDirectory.closePicker}
              onSelectGitBranch={gitContext.switchBranch}
              onNavigateToParentDirectory={workingDirectory.navigateToParent}
              onToggleGitBranchMenu={gitContext.toggleBranchMenu}
              onToggleModelTray={() => toggleTray('models')}
              placeholder="Octomus anything e.g. Find and fix race conditions in my Python application"
              prediction={activeShellPrediction}
              query={query}
              recommendedAction={recommendedAction}
              selectedModelLabel={modelSelection.selectedModel.label}
              terminalAutoDetectEnabled={terminalAutoDetectEnabled}
              workingDirectory={workingDirectory.currentPath}
              workingDirectoryLabel={workingDirectory.buttonLabel}
              workingDirectoryListing={workingDirectory.listing}
              workingDirectoryPickerOpen={workingDirectory.isPickerOpen}
              workingDirectorySearch={workingDirectory.searchQuery}
              onSelectWorkingDirectory={workingDirectory.selectDirectory}
              onToggleTerminalAutoDetect={() => setTerminalAutoDetectEnabled((value) => !value)}
              onToggleWorkingDirectoryPicker={workingDirectory.togglePicker}
              onWorkingDirectorySearchChange={workingDirectory.setSearchQuery}
              onToggleSingleCharacterPrediction={() => setAllowSingleCharacterCommandPrediction(!allowSingleCharacterCommandPrediction)}
            />
          )}
        </div>
      </section>
    </main>
  );
}
