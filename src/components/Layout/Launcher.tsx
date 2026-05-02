import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChatPanel } from '../Chat';
import { CommandApprovalComposer, ComposerBar, TerminalComposer } from '../Composer';
import { TrayPanel } from '../Tray';
import { useChat } from '../../hooks/useChat';
import { useCommandHistory } from '../../hooks/useCommandHistory';
import { useGitContext } from '../../hooks/useGitContext';
import { useModelSelection } from '../../hooks/useModelSelection';
import { useTerminalRuntimeContext } from '../../hooks/useTerminalRuntimeContext';
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
import { formatCompactPathLabel } from '../../lib/pathLabels';
import type { CommandApproval } from '../../types/terminal';
import type { HistoryEntry, HistoryTab } from '../../types/history';
import type { ComposerMode, ShellModeSource } from '../../types/ui';

type LauncherVariant = 'panel' | 'workspace';

type LauncherProps = {
  variant?: LauncherVariant;
  initialComposerSurface?: 'agent' | 'terminal';
  chatMode?: 'auto' | 'always-open';
  onWorkingDirectoryLabelChange?: (label: string) => void;
  resetOnMount?: boolean;
};

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

export function Launcher({
  variant = 'panel',
  initialComposerSurface = 'agent',
  chatMode = 'auto',
  onWorkingDirectoryLabelChange,
  resetOnMount = false
}: LauncherProps) {
  const [composerSurface, setComposerSurface] = useState<'agent' | 'terminal'>(initialComposerSurface);
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
  const runtimeContext = useTerminalRuntimeContext(workingDirectory.currentPath);
  const commandHistory = useCommandHistory();
  const modelSelection = useModelSelection();
  const { query, setQuery, messages, submitQuery, submitToolResult, clearMessages } = useChat({
    cwd: workingDirectory.currentPath,
    modelId: modelSelection.selectedModelId,
    onCommandApproval: (approval) => requestCommandApproval(approval)
  });
  const { isTrayOpen, activeTrayMode, toggleTray, setTrayMode, closeTray } = useTray();
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
  const terminalFailureCount = useMemo(() => {
    let failures = 0;

    for (let index = terminal.blocks.length - 1; index >= 0; index -= 1) {
      const block = terminal.blocks[index];
      if (block.status !== 'finished') {
        continue;
      }

      if (typeof block.exitCode === 'number' && block.exitCode !== 0) {
        failures += 1;
        continue;
      }

      break;
    }

    return failures;
  }, [terminal.blocks]);
  const terminalComposerAction = useMemo(() => {
    if (terminalFailureCount < 2) {
      return null;
    }

    const lastFailedBlock = [...terminal.blocks]
      .reverse()
      .find((block) => block.status === 'finished' && typeof block.exitCode === 'number' && block.exitCode !== 0);

    if (!lastFailedBlock) {
      return null;
    }

    return {
      id: 'terminal-ask-agent',
      label: 'Ask the agent about recent failures',
      value: `Explain why \`${lastFailedBlock.command}\` failed repeatedly and suggest the safest next step.`,
      description: 'Start an agent conversation from the latest terminal failures.',
      mode: 'chat' as const
    };
  }, [terminal.blocks, terminalFailureCount]);
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
  const isTerminalSurface = composerSurface === 'terminal';
  const isTerminalCommandsTrayOpen = isTerminalSurface && isTrayOpen && activeTrayMode === 'commands';

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
    disableTrayShortcuts: isTerminalCommandsTrayOpen,
    onCommandApproval: (command) => requestCommandApproval(command),
    onNewChat: () => {
      setPendingApproval(null);
      setModeLock(null);
      setComposerSurface('agent');
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
  const didResetOnMountRef = useRef(false);
  useWindowSync(shellRef);

  useEffect(() => {
    setComposerSurface(initialComposerSurface);
  }, [initialComposerSurface]);

  useEffect(() => {
    onWorkingDirectoryLabelChange?.(
      formatCompactPathLabel(workingDirectory.currentPath, workingDirectory.homeDir)
    );
  }, [onWorkingDirectoryLabelChange, workingDirectory.currentPath, workingDirectory.homeDir]);

  useEffect(() => {
    if (!resetOnMount || didResetOnMountRef.current) {
      return;
    }

    didResetOnMountRef.current = true;
    clearMessages();
    setQuery('');
    closeTray();
    terminal.clearBlocks();
    setComposerSurface(initialComposerSurface);
    setPendingApproval(null);
    setModeLock(null);
    setAutodetectedShellLatch(false);
    setAllowSingleCharacterCommandPrediction(false);
    setTerminalAutoDetectEnabled(true);
    setHistoryTab('all');
    setSelectedHistoryIndex(0);
    setModelTab('all');
    setSelectedModelIndex(0);
  }, [clearMessages, closeTray, initialComposerSurface, resetOnMount, setQuery, terminal]);

  const hasChatContent = messages.length > 0 || terminal.blocks.length > 0 || Boolean(terminal.error);
  const isChatOpen = chatMode === 'always-open' ? true : hasChatContent;
  const isChatVisible = chatMode === 'always-open' ? true : hasChatContent && !isTrayOpen;
  const isExpanded = chatMode === 'always-open' ? true : isTrayOpen || hasChatContent;
  const launcherRootClassName = variant === 'workspace' ? 'launcher-workspace-root' : 'prototype-root';
  const launcherShellClassName = [
    'launcher-shell',
    variant === 'workspace' ? 'workspace-shell' : 'panel-shell',
    isChatVisible ? 'chat-active' : '',
    isTrayOpen ? 'tray-active' : '',
    isExpanded ? 'expanded' : 'collapsed'
  ].filter(Boolean).join(' ');
  const launchAgentComposer = useCallback(() => {
    setPendingApproval(null);
    setModeLock(null);
    closeTray();
    setComposerSurface('agent');
    setQuery('');
  }, [closeTray, setQuery]);
  const openCommandsTray = useCallback(() => {
    setSelectedHistoryIndex(0);
    setTrayMode('commands');
  }, [setTrayMode]);
  const toggleComposerSurface = useCallback(() => {
    closeTray();
    setComposerSurface((current) => current === 'agent' ? 'terminal' : 'agent');
  }, [closeTray]);

  const requestCommandApproval = (approval: CommandApproval) => {
    console.log('[Launcher] requestCommandApproval called for:', approval.command);
    setPendingApproval({
      command: approval.command,
      toolCallId: approval.toolCallId,
      reason: approval.reason
    });
  };

  useEffect(() => {
    if (!isTerminalSurface || !isTrayOpen) {
      return;
    }

    if (activeTrayMode !== 'commands') {
      closeTray();
    }
  }, [activeTrayMode, closeTray, isTerminalSurface, isTrayOpen]);

  useEffect(() => {
    const handleGlobalEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest('.working-directory-menu, .git-branch-menu')) {
        return;
      }

       if (isTrayOpen) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeTray();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleComposerSurface();
    };

    window.addEventListener('keydown', handleGlobalEscape, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalEscape, true);
    };
  }, [closeTray, isTrayOpen, toggleComposerSurface]);

  useEffect(() => {
    if (!isTrayOpen || (activeTrayMode !== 'history' && activeTrayMode !== 'models')) {
      return;
    }

    if (isTerminalSurface) {
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
        event.stopPropagation();
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
    isTerminalSurface,
    selectedHistoryIndex,
    selectedModelIndex,
    setQuery,
    toggleTray,
    visibleModels
  ]);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      toggleComposerSurface();
      return;
    }

    if (isTerminalSurface) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const command = query.trim();
        if (!command) {
          return;
        }

        void terminal.runCommand(command).then(() => {
          setQuery('');
        });
        return;
      }

      return;
    }

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
    <main className={launcherRootClassName}>
      <section
        ref={shellRef}
        className={launcherShellClassName}
      >
        {isChatOpen && (
          <div className="chat-stack">
            <ChatPanel
              emptyStateVariant={variant === 'workspace' ? 'workspace' : 'default'}
              isOpen={true}
              messages={messages}
              showEmptyTopbar={variant === 'workspace' && composerSurface !== 'terminal' && composerMode !== 'shell'}
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
          {(!isTerminalSurface || isTerminalCommandsTrayOpen) && (
            <TrayPanel
              activeMode={activeTrayMode}
              commandItems={COMMAND_ITEMS}
              helpItems={HELP_ITEMS}
              historyEntries={historyEntries}
              historyTab={historyTab}
              inputMode={composerMode}
              isOpen={isTrayOpen}
              showFooter={!isTerminalSurface || activeTrayMode === 'commands'}
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
          )}

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
          ) : composerSurface === 'terminal' ? (
            <TerminalComposer
              gitBranchMenuOpen={gitContext.isBranchMenuOpen}
              gitContext={gitContext.gitContext}
              onLaunchAgentComposer={launchAgentComposer}
              onOpenCommandsTray={openCommandsTray}
              onCloseGitBranchMenu={() => gitContext.setIsBranchMenuOpen(false)}
              onCloseWorkingDirectoryPicker={workingDirectory.closePicker}
              onHeightChange={() => {}}
              onKeyDown={handleComposerKeyDown}
              onNavigateToParentDirectory={workingDirectory.navigateToParent}
              onQueryChange={(value) => {
                setQuery(value);
                setSelectedHistoryIndex(0);

                if (value === '/') {
                  setTrayMode('commands');
                  return;
                }

                if ((value === '' || value === '//') && isTrayOpen && activeTrayMode === 'commands') {
                  closeTray();
                }
              }}
              onRecommendedActionClick={(action) => {
                setComposerSurface('agent');
                setModeLock(null);
                setQuery(action.value);
                window.requestAnimationFrame(() => {
                  void submitQuery();
                });
              }}
              onSelectGitBranch={gitContext.switchBranch}
              onSelectWorkingDirectory={workingDirectory.selectDirectory}
              onToggleGitBranchMenu={gitContext.toggleBranchMenu}
              onToggleWorkingDirectoryPicker={workingDirectory.togglePicker}
              onWorkingDirectorySearchChange={workingDirectory.setSearchQuery}
              query={query}
              recommendedAction={terminalComposerAction}
              runtimeNodeVersion={runtimeContext?.nodeVersion ?? null}
              workingDirectory={workingDirectory.currentPath}
              workingDirectoryLabel={workingDirectory.buttonLabel}
              workingDirectoryListing={workingDirectory.listing}
              workingDirectoryPickerOpen={workingDirectory.isPickerOpen}
              workingDirectorySearch={workingDirectory.searchQuery}
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
                setComposerSurface('agent');
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
