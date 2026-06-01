import { useMemo, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useAgentStore } from '../../stores/AgentStore';
import { ServiceLocator } from '../../services/ServiceLocator';
import { ChatPanel } from '../../components/Chat';
import { ComposerBar, ModelSetupOverlay, TerminalComposer } from '../../components/Composer';
import { TrayPanel } from '../../components/Tray';
import { AgentStatusBar } from '../../components/Layout/Launcher/AgentStatusBar';
import {
  COMPOSER_PLACEHOLDERS,
  COMMAND_ITEMS,
  HELP_ITEMS,
  consumeShellModeActivator,
  filterCommandItems,
} from '../../lib';
import type { AgentState } from '../../stores/AgentStore';

// ── Props ─────────────────────────────────────────────────────────

export type AgentPanelProps = {
  variant?: 'panel' | 'workspace';
  title?: string;
  chatMode?: 'auto' | 'always-open';
  showOpenInApp?: boolean;
  onOpenAppWindow?: () => void;
  onOpenModelDrawer?: () => void;
  onCloseModelDrawer?: () => void;
};

// ── Derived helper ────────────────────────────────────────────────

function isAgentActive(state: AgentState): boolean {
  return Boolean(
    !state.localPendingApproval &&
    state.activeRunId &&
    state.messages.some((m) => m.role === 'assistant' && (m as any).isStreaming),
  );
}

// ── View object builders ──────────────────────────────────────────

function buildChatPanelView(
  state: AgentState,
  variant: 'panel' | 'workspace',
  title?: string,
) {
  const isTerminalSurface = state.composerSurface === 'terminal';
  const blocks =
    isTerminalSurface ? state.terminalBlocks : state.agentTerminalBlocks;
  const expandedBlockIds =
    isTerminalSurface ? state.terminalExpandedBlockIds : state.agentTerminalExpandedBlockIds;
  const selectedBlockId =
    isTerminalSurface ? state.terminalSelectedBlockId : state.agentTerminalSelectedBlockId;
  const error =
    isTerminalSurface ? state.terminalError : state.agentTerminalError;
  const sessionCwd =
    isTerminalSurface ? state.terminalSessionCwd : state.agentTerminalSessionCwd;

  return {
    messages: state.messages,
    terminalBlocks: blocks,
    terminalError: error,
    workingDirectory: sessionCwd ?? state.workingDirectory.currentPath,
    expandedTerminalBlockIds: expandedBlockIds,
    selectedTerminalBlockId: selectedBlockId,
    isOpen: true,
    emptyStateVariant: variant === 'workspace' ? ('workspace' as const) : ('default' as const),
    showEmptyTopbar: variant === 'workspace' && isTerminalSurface,
    pendingApproval: state.localPendingApproval,
    title: title ?? 'New agent conversation',
    onRequestCommandApproval: undefined,
    onEditPendingApproval: undefined,
    onSaveEditPendingApproval: undefined,
    onRejectPendingApproval: undefined,
    onAcceptPendingApproval: undefined,
    onAutoApprovePendingApproval: undefined,
    onStartNewConversationPendingApproval: undefined,
    onContinueCurrentConversationPendingApproval: undefined,
    onCollapseTerminalBlock: (blockId: string) => {
      const setFn = isTerminalSurface
        ? state.setTerminalExpandedBlockIds
        : state.setAgentTerminalExpandedBlockIds;
      setFn((ids) => ids.filter((id) => id !== blockId));
    },
    onExpandTerminalBlock: (blockId: string) => {
      const setFn = isTerminalSurface
        ? state.setTerminalExpandedBlockIds
        : state.setAgentTerminalExpandedBlockIds;
      setFn((ids) => (ids.includes(blockId) ? ids : [...ids, blockId]));
    },
    onSelectTerminalBlock: (blockId: string | null) => {
      isTerminalSurface
        ? state.setTerminalSelectedBlockId(blockId)
        : state.setAgentTerminalSelectedBlockId(blockId);
    },
    onOpenConversationBlock: undefined,
  };
}

function buildTrayPanelView(
  state: AgentState,
  _variant: 'panel' | 'workspace',
  showOpenInApp: boolean,
  onOpenAppWindow?: () => void,
  onOpenModelDrawer?: () => void,
) {
  const isTerminalSurface = state.composerSurface === 'terminal';
  return {
    isOpen: state.isTrayOpen,
    showFooter: !isTerminalSurface ||
      state.activeTrayMode === 'commands' ||
      state.activeTrayMode === 'history' ||
      state.activeTrayMode === 'conversations',
    showOpenInApp,
    activeMode: state.activeTrayMode,
    commandSearchQuery: state.query,
    helpItems: [] as any[],
    commandItems: [] as any[],
    selectedCommandIndex: state.selectedCommandIndex,
    historyEntries: state.historyEntries,
    conversations: [] as any[],
    activeConversationId: state.activeConversationId,
    conversationSearchQuery: state.conversationSearchQuery,
    historyTab: state.historyTab,
    modelTab: state.modelTab,
    modelEntries: state.modelSelection.models,
    selectedHistoryIndex: state.selectedHistoryIndex,
    selectedModelId: state.modelSelection.selectedModelId,
    selectedModelIndex: state.selectedModelIndex,
    inputMode: state.modeLock ?? 'auto',
    shellSource: null,
    shellShortcutTokens: [],
    onExitShellMode: () => {
      state.setModeLock(state.query.trim().length > 0 ? 'chat' : null);
    },
    onHistoryTabChange: state.setHistoryTab,
    onSelectHistoryEntry: undefined,
    onSelectConversation: undefined,
    onConversationSearchChange: state.setConversationSearchQuery,
    onNewConversation: undefined,
    onSelectModel: (modelId: string) => {
      state.setModelSelection((prev) => {
        const model = prev.models.find((m) => m.id === modelId || m.apiId === modelId);
        return {
          ...prev,
          selectedModelId: modelId,
          selectedModelApiId: model?.apiId ?? null,
          selectedModelLabel: model?.label ?? 'Auto',
          selectedModelSupportsAttachments: model?.supportsAttachments ?? false,
        };
      });
    },
    onModelTabChange: state.setModelTab,
    onToggleHelp: () => {
      state.setActiveTrayMode(state.isTrayOpen && state.activeTrayMode === 'help' ? 'history' : 'help');
      state.setIsTrayOpen(true);
    },
    onToggleCommands: () => {
      state.setActiveTrayMode(state.isTrayOpen && state.activeTrayMode === 'commands' ? 'history' : 'commands');
      state.setIsTrayOpen(true);
    },
    onToggleConversations: () => {
      state.setActiveTrayMode(state.isTrayOpen && state.activeTrayMode === 'conversations' ? 'history' : 'conversations');
      state.setIsTrayOpen(true);
    },
    onInsertCommand: (command: string) => {
      state.setQuery(`${command} `);
      state.setIsTrayOpen(false);
    },
    onOpenApp: onOpenAppWindow,
    onOpenModelSettings: onOpenModelDrawer,
  };
}

type ComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => void;

function buildTerminalComposerView(
  state: AgentState,
  showOpenInApp: boolean,
  onOpenAppWindow: (() => void) | undefined,
  launchAgentComposer: (seedPrompt?: string, autoSubmit?: boolean) => void,
  onComposerKeyDown: ComposerKeyDown,
) {
  const wd = state.workingDirectory;
  const gc = state.gitContext;
  const completionState = state.terminalCompletionState;
  return {
    query: state.query,
    gitContext: gc.gitContext,
    gitBranchMenuOpen: gc.isBranchMenuOpen,
    workingDirectory: state.activeSurfaceWorkingDirectory ?? wd.currentPath,
    workingDirectoryLabel: wd.buttonLabel,
    workingDirectoryPickerOpen: wd.isPickerOpen,
    workingDirectoryListing: wd.listing,
    workingDirectorySearch: wd.searchQuery,
    runtimeNodeVersion: state.runtimeContext?.nodeVersion ?? null,
    prediction: null,
    recommendedAction: null,
    completionState,
    showOpenInApp,
    onQueryChange: (q: string) => state.setQuery(q),
    onKeyDown: onComposerKeyDown,
    onRecommendedActionClick: undefined,
    onToggleWorkingDirectoryPicker: () => {
      const current = state.workingDirectory;
      state.setWorkingDirectory((prev) => ({
        ...prev,
        browserPath: current.currentPath,
        searchQuery: '',
        isPickerOpen: !prev.isPickerOpen,
      }));
    },
    onCloseWorkingDirectoryPicker: () =>
      state.setWorkingDirectory((prev) => ({ ...prev, isPickerOpen: false, searchQuery: '' })),
    onWorkingDirectorySearchChange: (q: string) =>
      state.setWorkingDirectory((prev) => ({ ...prev, searchQuery: q })),
    onNavigateToParentDirectory: () => {
      const parentPath = state.workingDirectory.listing?.parentPath?.trim();
      if (parentPath) {
        state.setWorkingDirectory((prev) => ({ ...prev, browserPath: parentPath, searchQuery: '' }));
      }
    },
    onSelectWorkingDirectory: (path: string) => {
      state.setWorkingDirectory((prev) => ({
        ...prev,
        currentPath: path,
        browserPath: path,
        isPickerOpen: false,
        searchQuery: '',
      }));
    },
    onToggleGitBranchMenu: () =>
      state.setGitContext((prev) => ({ ...prev, isBranchMenuOpen: !prev.isBranchMenuOpen })),
    onCloseGitBranchMenu: () =>
      state.setGitContext((prev) => ({ ...prev, isBranchMenuOpen: false })),
    onSelectGitBranch: (branch: string) => {
      if (state.gitContext.gitContext) {
        state.setGitContext((prev) => ({
          ...prev,
          currentBranch: branch,
          isBranchMenuOpen: false,
          gitContext: { ...prev.gitContext!, currentBranch: branch },
        }));
      }
    },
    onOpenCommandsTray: () => {
      state.setActiveTrayMode('commands');
      state.setIsTrayOpen(true);
    },
    onLaunchAgentComposer: launchAgentComposer,
    onOpenApp: showOpenInApp ? onOpenAppWindow : undefined,
  };
}

function buildComposerBarView(
  state: AgentState,
  showOpenInApp: boolean,
  onOpenAppWindow: (() => void) | undefined,
  onOpenModelDrawer: (() => void) | undefined,
  onCloseModelDrawer: (() => void) | undefined,
  onComposerKeyDown: ComposerKeyDown,
) {
  const wd = state.workingDirectory;
  const gc = state.gitContext;
  const isTerminalSurface = state.composerSurface === 'terminal';
  const modelSetupRequired = state.modelSelection.requiresModelSetup;
  const composerMode = state.modeLock ?? 'auto';

  return {
    mode: composerMode,
    shellSource: null,
    restrictActions: false,
    query: state.query,
    prediction: null,
    recommendedAction: null,
    gitContext: gc.gitContext,
    gitBranchMenuOpen: gc.isBranchMenuOpen,
    workingDirectory: state.activeSurfaceWorkingDirectory ?? wd.currentPath,
    workingDirectoryLabel: wd.buttonLabel,
    workingDirectoryPickerOpen: wd.isPickerOpen,
    workingDirectoryListing: wd.listing,
    workingDirectorySearch: wd.searchQuery,
    selectedModelLabel: state.modelSelection.selectedModelLabel,
    contextIndicatorTitle: state.activeSurfaceWorkingDirectory ?? wd.currentPath ?? 'Workspace context',
    contextIndicatorTone: isTerminalSurface || composerMode === 'shell' ? ('terminal' as const) : ('agent' as const),
    contextUsageProgress: 0,
    contextUsageTitle: 'Context window: 0 / 128,000 tokens',
    selectedModelSupportsAttachments: state.modelSelection.selectedModelSupportsAttachments,
    attachedFiles: state.attachments,
    onAttachFiles: undefined,
    onRemoveAttachedFile: undefined,
    onClearAttachments: undefined,
    terminalAutoDetectEnabled: state.terminalAutoDetectEnabled,
    modelSetupRequired,
    onQueryChange: (q: string) => state.setQuery(q),
    onKeyDown: onComposerKeyDown,
    onRecommendedActionClick: undefined,
    onToggleWorkingDirectoryPicker: () => {
      const current = state.workingDirectory;
      state.setWorkingDirectory((prev) => ({
        ...prev,
        browserPath: current.currentPath,
        searchQuery: '',
        isPickerOpen: !prev.isPickerOpen,
      }));
    },
    onToggleSingleCharacterPrediction: () =>
      state.setAllowSingleCharacterCommandPrediction(!state.allowSingleCharacterCommandPrediction),
    onCloseWorkingDirectoryPicker: () =>
      state.setWorkingDirectory((prev) => ({ ...prev, isPickerOpen: false, searchQuery: '' })),
    onWorkingDirectorySearchChange: (q: string) =>
      state.setWorkingDirectory((prev) => ({ ...prev, searchQuery: q })),
    onNavigateToParentDirectory: () => {
      const parentPath = state.workingDirectory.listing?.parentPath?.trim();
      if (parentPath) {
        state.setWorkingDirectory((prev) => ({ ...prev, browserPath: parentPath, searchQuery: '' }));
      }
    },
    onSelectWorkingDirectory: (path: string) => {
      state.setWorkingDirectory((prev) => ({
        ...prev,
        currentPath: path,
        browserPath: path,
        isPickerOpen: false,
        searchQuery: '',
      }));
    },
    onToggleTerminalAutoDetect: () =>
      state.setTerminalAutoDetectEnabled(!state.terminalAutoDetectEnabled),
    onToggleGitBranchMenu: () =>
      state.setGitContext((prev) => ({ ...prev, isBranchMenuOpen: !prev.isBranchMenuOpen })),
    onToggleModelTray: () => {
      if (modelSetupRequired) {
        onOpenModelDrawer?.();
      } else {
        state.setActiveTrayMode(state.isTrayOpen && state.activeTrayMode === 'models' ? 'history' : 'models');
        state.setIsTrayOpen(true);
      }
    },
    onCloseGitBranchMenu: () =>
      state.setGitContext((prev) => ({ ...prev, isBranchMenuOpen: false })),
    onSelectGitBranch: (branch: string) => {
      if (state.gitContext.gitContext) {
        state.setGitContext((prev) => ({
          ...prev,
          currentBranch: branch,
          isBranchMenuOpen: false,
          gitContext: { ...prev.gitContext!, currentBranch: branch },
        }));
      }
    },
    onExecuteTerminalCommand: undefined,
    onBackFromModelSetup: () => {
      onCloseModelDrawer?.();
      state.setComposerSurface('terminal');
      state.setIsTrayOpen(false);
    },
    onOpenModelSettings: () => {
      onOpenAppWindow?.();
      onOpenModelDrawer?.();
    },
  };
}

// ── Component ─────────────────────────────────────────────────────

export function AgentPanel(props: AgentPanelProps) {
  const {
    variant = 'panel',
    title,
    chatMode = 'auto',
    showOpenInApp = true,
    onOpenAppWindow,
    onOpenModelDrawer,
    onCloseModelDrawer,
  } = props;

  // Lifecycle — start/stop terminal event listeners
  useEffect(() => {
    const agent = ServiceLocator.get().agent;
    void agent.start();
    return () => {
      agent.stop();
    };
  }, []);

  // Store selectors (granular to avoid full re-renders)
  const composerSurface = useAgentStore((s) => s.composerSurface);
  const isTrayOpen = useAgentStore((s) => s.isTrayOpen);
  const activeTrayMode = useAgentStore((s) => s.activeTrayMode);
  const messages = useAgentStore((s) => s.messages);
  const activeRunId = useAgentStore((s) => s.activeRunId);
  const localPendingApproval = useAgentStore((s) => s.localPendingApproval);
  const modelSetupRequired = useAgentStore((s) => s.modelSelection.requiresModelSetup);
  const activeConversationId = useAgentStore((s) => s.activeConversationId);

  // Full state snapshot for view builders (cheap since Zustand uses reference equality)
  const state = useAgentStore((s) => s);

  const isTerminalSurface = composerSurface === 'terminal';
  const isTerminalTrayOpen = isTerminalSurface && isTrayOpen &&
    (activeTrayMode === 'commands' || activeTrayMode === 'history');

  const agentActive = isAgentActive(state);

  const launcherRootClassName = `launcher-root${isTerminalSurface ? ' terminal-surface' : ''}`;
  const launcherShellClassName = `launcher-shell${isTerminalSurface ? ' terminal' : ''}`;

  // UI helpers
  const isChatOpen = chatMode === 'always-open' || composerSurface === 'agent';

  // ── Launch agent composer from terminal surface ───────────────

  const launchAgentComposer = useCallback((seedPrompt?: string, _autoSubmit?: boolean) => {
    const nextPrompt = seedPrompt?.trim() && seedPrompt.trim() !== '/agent' ? seedPrompt.trim() : '';

    // Sync CWD from terminal to agent surface
    const terminalCwd =
      state.terminalSessionCwd?.trim()
      || state.activeSurfaceWorkingDirectory?.trim()
      || state.workingDirectory.currentPath?.trim()
      || null;
    if (terminalCwd) {
      state.setWorkingDirectory((prev) => ({
        ...prev,
        currentPath: terminalCwd,
        browserPath: terminalCwd,
      }));
    }
    state.setAgentTerminalBlocks([]);

    // Switch to agent surface
    state.setComposerSurface('agent');
    state.setModeLock(null);
    state.setAutodetectedShellLatch(false);
    state.setAllowSingleCharacterCommandPrediction(false);
    state.setIsTrayOpen(false);
    state.setLocalPendingApproval(null);
    state.setQuery(nextPrompt);
    state.setMessages([]);
  }, [state]);

  // ── Keyboard handler ──────────────────────────────────────

  const handleComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isTerminal = state.composerSurface === 'terminal';
    const trayOpen = state.isTrayOpen;
    const trayMode = state.activeTrayMode;
    const query = state.query;

    // ── Escape ──────────────────────────────────────────────
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (trayOpen) {
        state.setIsTrayOpen(false);
        return;
      }
      if (isTerminal) return;
      state.setComposerSurface(isTerminal ? 'agent' : 'terminal');
      return;
    }

    // ── Commands tray navigation ────────────────────────────
    if (trayOpen && trayMode === 'commands') {
      const visible = filterCommandItems(COMMAND_ITEMS, query);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.setSelectedCommandIndex((i: number) =>
          Math.min(i + 1, Math.max(0, visible.length - 1)),
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.setSelectedCommandIndex((i: number) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = visible[state.selectedCommandIndex] ?? visible[0];
        if (!item) return;
        if (event.metaKey || event.ctrlKey) {
          state.setIsTrayOpen(false);
          if (isTerminal) {
            launchAgentComposer(item.label, true);
          } else {
            state.setQuery(item.label);
          }
          return;
        }
        state.setQuery(`${item.label} `);
        state.setIsTrayOpen(false);
        return;
      }
    }

    // ── History / Models tray navigation ────────────────────
    if (trayOpen && (trayMode === 'history' || trayMode === 'models')) {
      const items =
        trayMode === 'history'
          ? state.historyEntries
          : state.modelSelection.models;
      const setter =
        trayMode === 'history'
          ? state.setSelectedHistoryIndex
          : state.setSelectedModelIndex;
      const idx =
        trayMode === 'history'
          ? state.selectedHistoryIndex
          : state.selectedModelIndex;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setter((i: number) => Math.min(i + 1, Math.max(0, items.length - 1)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setter((i: number) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = items[idx];
        if (item) {
          if (trayMode === 'history') {
            state.setModeLock((item as any).kind === 'command' ? 'shell' : 'chat');
            state.setQuery((item as any).label);
          } else {
            state.setModelSelection((prev) => {
              const model = prev.models.find(
                (m) => m.id === (item as any).id || m.apiId === (item as any).apiId,
              );
              return {
                ...prev,
                selectedModelId: (item as any).id,
                selectedModelApiId: model?.apiId ?? null,
                selectedModelLabel: model?.label ?? 'Auto',
                selectedModelSupportsAttachments: model?.supportsAttachments ?? false,
              };
            });
          }
          state.setIsTrayOpen(false);
        }
        return;
      }
    }

    // ── ArrowUp opens history tray ──────────────────────────
    if (event.key === 'ArrowUp' && !event.shiftKey && !trayOpen) {
      const isShellMode =
        isTerminal ||
        state.modeLock === 'shell' ||
        state.autodetectedShellLatch;
      const shellQuery = consumeShellModeActivator(query).value.trim();
      if (isShellMode && shellQuery.length > 0) {
        event.preventDefault();
        state.setSelectedHistoryIndex(0);
        state.setHistoryTab('commands');
        state.setActiveTrayMode('history');
        state.setIsTrayOpen(true);
        return;
      }
      if (!isTerminal && query.trim().length === 0) {
        event.preventDefault();
        state.setSelectedHistoryIndex(0);
        state.setHistoryTab('all');
        state.setActiveTrayMode('history');
        state.setIsTrayOpen(true);
        return;
      }
    }

    // ── Terminal surface: Enter to run command ───────────────
    if (isTerminal) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const command = consumeShellModeActivator(query).value.trim();
        if (!command) return;
        if (command.startsWith('/')) {
          launchAgentComposer(command, true);
          return;
        }
        if (command === 'clear') {
          const agent = ServiceLocator.get().agent;
          agent.terminal.clearBlocks();
          agent.agentTerminal.clearBlocks();
          state.setQuery('');
          return;
        }
        const agent = ServiceLocator.get().agent;
        void agent.terminal.runCommand(command, { source: 'user' }).then(() =>
          state.setQuery(''),
        );
        return;
      }
      // ArrowRight / Tab / ArrowDown → prediction fallback (no-op for now)
      return;
    }
  }, [state, launchAgentComposer]);

  // View objects (memoized by the state reference)
  const chatPanelView = useMemo(
    () => buildChatPanelView(state, variant, title),
    [state, variant, title],
  );
  const trayPanelView = useMemo(
    () => buildTrayPanelView(state, variant, showOpenInApp, onOpenAppWindow, onOpenModelDrawer),
    [state, variant, showOpenInApp, onOpenAppWindow, onOpenModelDrawer],
  );
  const terminalComposerView = useMemo(
    () => buildTerminalComposerView(state, showOpenInApp, onOpenAppWindow, launchAgentComposer, handleComposerKeyDown),
    [state, showOpenInApp, onOpenAppWindow, launchAgentComposer, handleComposerKeyDown],
  );
  const composerBarView = useMemo(
    () => buildComposerBarView(state, showOpenInApp, onOpenAppWindow, onOpenModelDrawer, onCloseModelDrawer, handleComposerKeyDown),
    [state, showOpenInApp, onOpenAppWindow, onOpenModelDrawer, onCloseModelDrawer, handleComposerKeyDown],
  );
  const modelSetupOverlayView = useMemo(
    () => ({
      onBack: () => {
        onCloseModelDrawer?.();
        state.setComposerSurface('terminal');
        state.setIsTrayOpen(false);
      },
      onOpenModelSettings: () => {
        onOpenAppWindow?.();
        onOpenModelDrawer?.();
      },
    }),
    [state, onOpenAppWindow, onOpenModelDrawer, onCloseModelDrawer],
  );

  // Placeholder for composer bar
  const placeholder = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * COMPOSER_PLACEHOLDERS.length);
    return COMPOSER_PLACEHOLDERS[randomIndex];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // Simplified launcher object for AgentStatusBar
  const agentStatusLauncher = useMemo(() => ({
    chat: { activeRunId },
    terminal: {
      agentTerminal: {
        blocks: state.agentTerminalBlocks,
      },
    },
    actions: {
      toggleComposerSurface: () =>
        state.setComposerSurface(composerSurface === 'agent' ? 'terminal' : 'agent'),
    },
    tray: {
      toggleTray: (mode: string) => {
        state.setActiveTrayMode(mode as any);
        state.setIsTrayOpen(true);
      },
    },
  }), [activeRunId, composerSurface, state]);

  return (
    <main className={launcherRootClassName}>
      <section className={launcherShellClassName}>
        {isChatOpen && (
          <div className="chat-stack">
            <ChatPanel view={chatPanelView as any} />
          </div>
        )}

        <div className="dock-stack">
          {agentActive && <AgentStatusBar launcher={agentStatusLauncher} />}

          {!modelSetupRequired && !state.localPendingApproval && (!isTerminalSurface || isTerminalTrayOpen) && (
            <TrayPanel view={trayPanelView as any} />
          )}

          {state.localPendingApproval ? null : composerSurface === 'terminal' ? (
            <TerminalComposer view={terminalComposerView as any} />
          ) : modelSetupRequired ? (
            <ModelSetupOverlay view={modelSetupOverlayView as any} />
          ) : (
            <ComposerBar
              composerPlaceholder={placeholder}
              showInputHintText={true}
              view={composerBarView as any}
            />
          )}
        </div>
      </section>
    </main>
  );
}
