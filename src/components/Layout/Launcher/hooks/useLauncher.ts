
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as SubModules from './submodules';
import * as Hooks from '../../../../hooks';
import { useMemoryStore } from '../../../../stores';
import { consumeShellModeActivator, getShellToggleShortcutTokens } from '../../../../lib';
import * as Utils from '../utils';

import type { CommandApproval, TerminalBlockSharedMeta, ShellModeSource } from '../../../../types';
import type { ChatMessage } from '../../../../types/chat';

type LauncherVariant = 'panel' | 'workspace';

export type LauncherProps = {
  variant?: LauncherVariant;
  initialComposerSurface?: 'agent' | 'terminal';
  initialWorkingDirectory?: string | null;
  initialTerminalSessionId?: string | null;
  initialAgentTerminalSessionId?: string | null;
  persistWorkingDirectory?: boolean;
  persistTerminalSession?: boolean;
  chatMode?: 'auto' | 'always-open';
  conversationId?: string | null;
  active?: boolean;
  onSelectConversation?: (conversationId: string) => void;
  onConversationChange?: (conversationId: string | null) => void;
  onComposerSurfaceChange?: (composerSurface: 'agent' | 'terminal') => void;
  onNewConversation?: (options?: { seedPrompt?: string }) => string | null | void;
  onExitAgentToTerminal?: () => void;
  onPendingApprovalChange?: (approval: CommandApproval | null) => void;
  onTerminalBlockMetaChange?: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => void;
  onSyntheticBlocksChange?: (syntheticBlocks: import('../../../../types').TerminalCommandBlock[]) => void;
  onTerminalSessionChange?: (sessionId: string | null) => void;
  onAgentTerminalBlockMetaChange?: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => void;
  onAgentTerminalSessionChange?: (sessionId: string | null) => void;
  onWorkingDirectoryChange?: (path: string | null) => void;
  pendingApproval?: CommandApproval | null;
  resetOnMount?: boolean;
  sharedTerminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
  sharedSyntheticBlocks?: import('../../../../types').TerminalCommandBlock[];
  sharedAgentTerminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
  title?: string;
};

function buildConversationLinkTitle(
  conversationId: string,
  messages: ChatMessage[],
  memoryConversations: Array<{ id: string; title: string }>
) {
  const summaryTitle = memoryConversations.find((conversation) => conversation.id === conversationId)?.title?.trim();
  if (summaryTitle) {
    return summaryTitle;
  }

  const firstMeaningfulMessage = messages.find((message) => (
    (message.role === 'assistant' || message.role === 'user')
    && message.body.trim().length > 0
  ));
  const fallbackTitle = firstMeaningfulMessage?.body
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!fallbackTitle) {
    return 'Return to AI conversation';
  }

  return fallbackTitle.length > 80 ? `${fallbackTitle.slice(0, 77)}...` : fallbackTitle;
}

/**
 * `useLauncher` - Main orchestrator hook for the Launcher component.
 * 
 * Following SOLID principles, this hook delegates specialized logic to sub-modules:
 * - `useLauncherHistory`: Manages history state and deduplication.
 * - `utils/terminal`: Terminal execution and block management.
 * - `utils/history`: History string formatting and deduplication utilities.
 * 
 * Responsibilities of this hook:
 * 1. Initialize global states via Zustand (`useLauncherStore`, `useMemoryStore`)
 * 2. Connect external dependencies (`useChat`, `useTerminalCommandBlocks`, `useKeyboardShortcuts`)
 * 3. Compose them together and expose a clean, unified interface for `Launcher.tsx`.
 */
export function useLauncher(props: LauncherProps) {
  const {
    variant = 'panel',
    initialComposerSurface = 'terminal',
    initialWorkingDirectory = null,
    initialTerminalSessionId = null,
    initialAgentTerminalSessionId = null,
    persistWorkingDirectory = true,
    persistTerminalSession = false,
    chatMode = 'auto',
    active = true,
    resetOnMount = false
  } = props;
  const store = SubModules.useLauncherState(initialComposerSurface);



  const pendingConversationAnchorRef = useRef<{ conversationId: string; startedAt: string } | null>(null);
  const seededConversationAnchorTimesRef = useRef<Record<string, string>>({});
  const pendingAutoSubmitPromptRef = useRef<string | null>(null);
  const lastReportedComposerSurfaceRef = useRef<'agent' | 'terminal' | null>(null);
  const suppressComposerSurfaceReportRef = useRef(false);
  const lastReportedWorkingDirectoryRef = useRef<string | null>(null);
  const terminalAutoDetectSetting = useMemoryStore((state) => state.settings?.values.terminalAutoDetectEnabled);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const memoryStatus = useMemoryStore((state) => state.status);
  const memoryConversations = useMemoryStore((state) => state.conversations);
  const workingDirectory = Hooks.useWorkingDirectory({
    initialPath: initialWorkingDirectory,
    rememberSelection: persistWorkingDirectory
  });
  const gitContext = Hooks.useGitContext(workingDirectory.currentPath);
  const runtimeContext = Hooks.useTerminalRuntimeContext(workingDirectory.currentPath);
  const commandHistory = Hooks.useCommandHistory();
  const modelSelection = Hooks.useModelSelection();
  const hasControlledConversation = props.conversationId !== undefined;
  const resolvedConversationId = hasControlledConversation
    ? (props.conversationId ?? store.localConversationId ?? null)
    : store.localConversationId;
  const hasControlledPendingApproval = props.pendingApproval !== undefined;
  const resolvedPendingApproval = hasControlledPendingApproval
    ? (props.pendingApproval ?? store.localPendingApproval ?? null)
    : store.localPendingApproval;
  const setResolvedPendingApproval = useCallback((approval: CommandApproval | null) => {
    store.setLocalPendingApproval(approval);
    if (hasControlledPendingApproval) {
      props.onPendingApprovalChange?.(approval);
      return;
    }
  }, [hasControlledPendingApproval, props.onPendingApprovalChange, store.setLocalPendingApproval]);
  const requestCommandApproval = useCallback((approval: CommandApproval) => {
    setResolvedPendingApproval({
      command: approval.command,
      toolCallId: approval.toolCallId,
      reason: approval.reason
    });
  }, [setResolvedPendingApproval]);
  const terminal = Hooks.useTerminalCommandBlocks({
    cwd: workingDirectory.currentPath,
    initialSessionId: initialTerminalSessionId,
    persistSession: persistTerminalSession,
    sharedBlockMetaById: props.sharedTerminalBlockMetaById,
    sharedSyntheticBlocks: props.sharedSyntheticBlocks,
    onBlockMetaChange: props.onTerminalBlockMetaChange,
    onSyntheticBlocksChange: props.onSyntheticBlocksChange,
    onSessionChange: props.onTerminalSessionChange
  });
  const agentTerminal = Hooks.useTerminalCommandBlocks({
    cwd: workingDirectory.currentPath,
    initialSessionId: initialAgentTerminalSessionId,
    persistSession: persistTerminalSession,
    sharedBlockMetaById: props.sharedAgentTerminalBlockMetaById,
    onBlockMetaChange: props.onAgentTerminalBlockMetaChange,
    onSessionChange: props.onAgentTerminalSessionChange
  });
  const tray = SubModules.useLauncherTrayState();
  const { isTrayOpen, activeTrayMode, closeTray } = tray;

  const chat = Hooks.useChat({

    conversationId: resolvedConversationId,
    cwd: workingDirectory.currentPath,
    modelId: modelSelection.selectedModelId,
    onCloseTray: closeTray,
    terminalBlocks: agentTerminal.blocks,
    onCommandApproval: requestCommandApproval,
    onConversationCreated: (nextConversationId) => {
      if (pendingConversationAnchorRef.current) {
        pendingConversationAnchorRef.current = {
          ...pendingConversationAnchorRef.current,
          conversationId: nextConversationId
        };
      }
      store.setLocalConversationId(nextConversationId);
      if (hasControlledConversation) {
        props.onConversationChange?.(nextConversationId);
        return;
      }
    },
    onNewChat: () => {
      if (props.onNewConversation) {
        props.onNewConversation();
      } else if (hasControlledConversation) {
        props.onConversationChange?.(Utils.createConversationId());
      } else {
        store.setLocalConversationId(Utils.createConversationId());
      }
      agentTerminal.replaceBlocks([]);
      store.setComposerSurface('agent');
      store.setModeLock(null);
    },
    active
  });
  const { query, setQuery, messages, submitQuery, submitToolResult, clearMessages } = chat;
  const availableShellCommands = Hooks.useShellCommandIndex();
  const terminalCommandBlocks = useMemo(
    () => terminal.blocks.filter(Utils.isCommandBlock),
    [terminal.blocks]
  );
  const agentTerminalCommandBlocks = useMemo(
    () => agentTerminal.blocks.filter(Utils.isCommandBlock),
    [agentTerminal.blocks]
  );
  const isTerminalSurface = store.composerSurface === 'terminal';
  const activeTimelineBlocks = store.composerSurface === 'agent' ? agentTerminal.blocks : terminal.blocks;
  const activeTimelineError = store.composerSurface === 'agent' ? agentTerminal.error : terminal.error;
  const activeMessages = store.composerSurface === 'agent' ? messages : [];
  const intelligenceTerminalBlocks = isTerminalSurface ? terminalCommandBlocks : agentTerminalCommandBlocks;
  const composerIntelligenceContextKey = isTerminalSurface
    ? `terminal:${terminal.sessionId ?? 'local'}:${workingDirectory.currentPath ?? ''}`
    : `composer:${resolvedConversationId ?? 'none'}:${agentTerminal.sessionId ?? 'local'}:${workingDirectory.currentPath ?? ''}`;
  const uiState = SubModules.useLauncherUIState({
    store, tray, props, modelSelection, memoryConversations,
    activeMessages, activeTimelineBlocks, activeTimelineError,
    chatMode
  });
  const { visibleModels } = uiState;
  const clearTerminalSurface = useCallback(() => {
    pendingConversationAnchorRef.current = null;
    seededConversationAnchorTimesRef.current = {};
    terminal.clearBlocks();
  }, [terminal.clearBlocks]);
  const { value: queryWithoutActivator } = consumeShellModeActivator(query);
  const composerIntelligence = Hooks.useComposerIntelligence({
    contextKey: composerIntelligenceContextKey,
    query: queryWithoutActivator,
    cwd: workingDirectory.currentPath,
    availableCommands: availableShellCommands,
    historyEntries: commandHistory,
    terminalBlocks: intelligenceTerminalBlocks,
    messages: activeMessages,
    lockedMode: store.modeLock,
    autodetectEnabled: store.terminalAutoDetectEnabled,
    allowSingleCharacterPrediction: store.allowSingleCharacterCommandPrediction,
    forceShellMode: isTerminalSurface,
    enableZeroStatePrediction: isTerminalSurface,
    surface: isTerminalSurface ? 'terminal' : 'composerBar'
  });
  const baseComposerState = {
    mode: composerIntelligence.mode,
    shellSource: composerIntelligence.shellSource
  };
  const composerState = store.modeLock === null
    && store.autodetectedShellLatch
    && baseComposerState.mode === 'chat'
    && Utils.isSingleTokenShellCandidate(query)
    ? {
      mode: 'shell' as const,
      shellSource: 'autodetected' as const
    }
    : baseComposerState;
  const composerMode = composerState.mode;
  const shellSource: ShellModeSource | null = composerState.shellSource;
  const activeShellPrediction = composerIntelligence.prediction;
  const recommendedAction = !isTerminalSurface ? composerIntelligence.recommendedAction : null;
  const terminalComposerAction = isTerminalSurface ? composerIntelligence.recommendedAction : null;
  const shellShortcutTokens = getShellToggleShortcutTokens();
  const historyState = SubModules.useLauncherHistory(
    messages,
    queryWithoutActivator,
    store.savedPromptEntries,
    terminalCommandBlocks,
    commandHistory,
    store.historyTab
  );
  const { historyEntries } = historyState;
  const isTerminalCommandsTrayOpen = isTerminalSurface && isTrayOpen && activeTrayMode === 'commands';

  SubModules.useLauncherMemorySync({
    store, props, agentTerminal, memoryConversations, memoryStatus,
    hasControlledConversation, hasControlledPendingApproval, resolvedConversationId
  });
  useEffect(() => {
    if (!store.terminalAutoDetectEnabled || store.modeLock !== null || query.trim().length === 0) {
      store.setAutodetectedShellLatch(false);
      return;
    }

    if (baseComposerState.mode === 'shell' && baseComposerState.shellSource === 'autodetected') {
      store.setAutodetectedShellLatch(true);
      return;
    }

    if (!Utils.isSingleTokenShellCandidate(query)) {
      store.setAutodetectedShellLatch(false);
    }
  }, [baseComposerState.mode, baseComposerState.shellSource, store.modeLock, query, store.terminalAutoDetectEnabled]);

  useEffect(() => {
    if (composerMode !== 'shell' || query.trim().length === 0) {
      store.setAllowSingleCharacterCommandPrediction(false);
      return;
    }

    const firstToken = query.trim().split(/\s+/)[0] ?? '';
    if (firstToken.length >= 2) {
      store.setAllowSingleCharacterCommandPrediction(true);
    }
  }, [composerMode, query]);

  useEffect(() => {
    store.setSelectedHistoryIndex((index: number) => Math.min(index, Math.max(0, historyEntries.length - 1)));
  }, [historyEntries.length]);

  useEffect(() => {
    const nextIndex = visibleModels.findIndex((model: any) => model.id === modelSelection.selectedModelId);
    store.setSelectedModelIndex(nextIndex >= 0 ? nextIndex : 0);
  }, [modelSelection.selectedModelId, visibleModels]);

  const { handleKeyDown } = Hooks.useKeyboardShortcuts({
    query,
    setQuery,
    submitQuery,
    cwd: workingDirectory.currentPath,
    modelId: modelSelection.selectedModelId,
    disableTrayShortcuts: isTerminalCommandsTrayOpen,
    onCommandApproval: (command: any) => requestCommandApproval(command),
    onNewChat: () => {
      setResolvedPendingApproval(null);
      store.setModeLock(null);
      store.setComposerSurface('agent');
      clearTerminalSurface();
    },
    onTerminalCommand: (command: any) => {
      void Utils.runCommandInSurface(
        command,
        store.composerSurface,
        terminal,
        agentTerminal,
        clearTerminalSurface,
        'user'
      );
    },
    isShellMode: isTerminalSurface || composerMode === 'shell',
    isManualShellMode: !isTerminalSurface && shellSource === 'manual',
    hasPrediction: Boolean(activeShellPrediction),
    onAcceptPrediction: () => {
      if (activeShellPrediction) {
        setQuery(activeShellPrediction.fullCommand);
      }
    },
    onCyclePrediction: composerIntelligence.cyclePrediction,
    onExitShellMode: () => {
      store.setModeLock(query.trim().length > 0 ? 'chat' : null);
    },
    onToggleShellMode: () => {
      if (composerMode === 'shell') {
        store.setModeLock('chat');
      } else {
        store.setModeLock('shell');
      }
    },
    onCloseTray: closeTray,
    onToggleHelpTray: tray.openHelp,
    onToggleConversationsTray: tray.openConversations
  });

  const shellRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const didResetOnMountRef = useRef(false);
  Hooks.useWindowSync(shellRef, active);

  useEffect(() => {
    if (store.composerSurface === initialComposerSurface) {
      return;
    }

    suppressComposerSurfaceReportRef.current = true;
    store.setComposerSurface(initialComposerSurface);
  }, [initialComposerSurface, store.composerSurface]);

  useEffect(() => {
    const pendingPrompt = pendingAutoSubmitPromptRef.current;
    if (
      !pendingPrompt
      || store.composerSurface !== 'agent'
      || query.trim() !== pendingPrompt
    ) {
      return;
    }

    pendingAutoSubmitPromptRef.current = null;
    window.requestAnimationFrame(() => {
      void submitQuery();
    });
  }, [query, store.composerSurface, submitQuery]);

  useEffect(() => {
    if (typeof terminalAutoDetectSetting === 'boolean') {
      store.setTerminalAutoDetectEnabled(terminalAutoDetectSetting);
    }
  }, [terminalAutoDetectSetting]);

  useEffect(() => {
    if (suppressComposerSurfaceReportRef.current) {
      suppressComposerSurfaceReportRef.current = false;
      lastReportedComposerSurfaceRef.current = store.composerSurface;
      return;
    }

    if (lastReportedComposerSurfaceRef.current === store.composerSurface) {
      return;
    }

    lastReportedComposerSurfaceRef.current = store.composerSurface;
    props.onComposerSurfaceChange?.(store.composerSurface);
  }, [props.onComposerSurfaceChange, store.composerSurface]);

  useEffect(() => {
    if (lastReportedWorkingDirectoryRef.current === workingDirectory.currentPath) {
      return;
    }

    lastReportedWorkingDirectoryRef.current = workingDirectory.currentPath;
    props.onWorkingDirectoryChange?.(workingDirectory.currentPath);
  }, [props.onWorkingDirectoryChange, workingDirectory.currentPath]);

  useEffect(() => {
    if (!resetOnMount || didResetOnMountRef.current) {
      return;
    }

    didResetOnMountRef.current = true;
    const shouldClearRuntimeSessions = !persistTerminalSession && !initialTerminalSessionId && !initialAgentTerminalSessionId;
    if (!resolvedConversationId) {
      clearMessages();
    }
    setQuery('');
    closeTray();
    if (shouldClearRuntimeSessions) {
      clearTerminalSurface();
      agentTerminal.clearBlocks();
    } else {
      pendingConversationAnchorRef.current = null;
      seededConversationAnchorTimesRef.current = {};
    }
    suppressComposerSurfaceReportRef.current = true;
    store.setComposerSurface(initialComposerSurface);
    if (!hasControlledPendingApproval) {
      setResolvedPendingApproval(null);
    }
    store.setModeLock(null);
    store.setAutodetectedShellLatch(false);
    store.setAllowSingleCharacterCommandPrediction(false);
    store.setTerminalAutoDetectEnabled(true);
    store.setHistoryTab('all');
    store.setSelectedHistoryIndex(0);
    store.setModelTab('all');
    store.setSelectedModelIndex(0);
  }, [
    agentTerminal.clearBlocks,
    clearMessages,
    closeTray,
    hasControlledPendingApproval,
    initialAgentTerminalSessionId,
    initialComposerSurface,
    initialTerminalSessionId,
    persistTerminalSession,
    resetOnMount,
    resolvedConversationId,
    setResolvedPendingApproval,
    setQuery,
    clearTerminalSurface
  ]);



  useEffect(() => {
    const pendingAnchor = pendingConversationAnchorRef.current;
    if (!pendingAnchor || resolvedConversationId !== pendingAnchor.conversationId || messages.length === 0) {
      return;
    }

    seededConversationAnchorTimesRef.current[pendingAnchor.conversationId] = pendingAnchor.startedAt;
    terminal.upsertSyntheticBlock({
      id: `conversation-link-${pendingAnchor.conversationId}`,
      command: '',
      output: '',
      startedAt: pendingAnchor.startedAt,
      finishedAt: pendingAnchor.startedAt,
      status: 'finished',
      presentation: 'conversation-link',
      conversationId: pendingAnchor.conversationId,
      conversationTitle: buildConversationLinkTitle(
        pendingAnchor.conversationId,
        messages,
        memoryConversations
      )
    });
    pendingConversationAnchorRef.current = null;
  }, [memoryConversations, messages, messages.length, resolvedConversationId, terminal.upsertSyntheticBlock]);

  const launchAgentComposer = useCallback((seedPrompt?: string, autoSubmit = false) => {
    const trimmedSeedPrompt = seedPrompt?.trim();
    const hasExplicitPrompt = Boolean(trimmedSeedPrompt && trimmedSeedPrompt !== '/agent');
    const nextPrompt = hasExplicitPrompt
      ? trimmedSeedPrompt!
      : '';

    const requestedConversationId = props.onNewConversation?.({ seedPrompt: nextPrompt }) ?? null;
    const nextConversationId = requestedConversationId || Utils.createConversationId();
    pendingConversationAnchorRef.current = {
      conversationId: nextConversationId,
      startedAt: new Date().toISOString()
    };
    pendingAutoSubmitPromptRef.current = autoSubmit && hasExplicitPrompt
      ? nextPrompt
      : null;

    void chat.saveCurrentConversation?.();
    agentTerminal.replaceBlocks([]);
    store.setLocalConversationId(nextConversationId);
    if (hasControlledConversation) {
      props.onConversationChange?.(nextConversationId);
    } else {
      store.setLocalConversationId(nextConversationId);
    }
    setResolvedPendingApproval(null);
    store.setModeLock(null);
    closeTray();
    store.setComposerSurface('agent');
    clearMessages();
    setQuery(nextPrompt);
  }, [
    agentTerminal.replaceBlocks,
    chat.saveCurrentConversation,
    clearMessages,
    closeTray,
    hasControlledConversation,
    props.onConversationChange,
    props.onNewConversation,
    setQuery,
    terminalCommandBlocks
  ]);
  const handlers = SubModules.useLauncherHandlers({
    store, chat, tray, props, terminal, agentTerminal,
    resolvedConversationId, memoryConversations,
    seededConversationAnchorTimesRef, pendingConversationAnchorRef,
    setResolvedPendingApproval, launchAgentComposer, clearTerminalSurface,
    resolvedPendingApproval, saveSettings
  });
  useEffect(() => {
    if (!isTerminalSurface || !isTrayOpen) {
      return;
    }

    if (activeTrayMode !== 'commands') {
      closeTray();
    }
  }, [activeTrayMode, closeTray, isTerminalSurface, isTrayOpen]);

  const openAppWindow = useCallback(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    void invoke('show_app_window').catch((error) => {
      console.warn('[Launcher] failed to open app window', error);
    });
  }, []);

  const shortcuts = SubModules.useLauncherShortcuts({
    active, chat, tray, store, terminal, agentTerminal,
    historyEntries, modelSelection, isTerminalSurface,
    dockRef, saveSettings, visibleModels, toggleComposerSurface: handlers.toggleComposerSurface,
    clearTerminalSurface, handleKeyDown, openAppWindow, variant
  });

  const launcherTerminal = {
    agentTerminal,
    terminal,
    activeTimelineBlocks,
    activeTimelineError,
    shellRef,
    shellSource,
    terminalComposerAction,
    shellShortcutTokens,
    clearTerminalSurface
  };

  const launcherHistory = {
    ...historyState
  };

  const launcherUI = {
    ...uiState,
    chatMode,
    isTerminalCommandsTrayOpen,
    isTerminalSurface,
    variant,
    workingDirectory,
    gitContext,
    runtimeContext,
    dockRef,
    modelSelection,
    activeShellPrediction,
    recommendedAction,
    activeMessages,
    composerMode,
    resolvedConversationId,
    resolvedPendingApproval
  };

  const launcherActions = {
    ...handlers,
    ...shortcuts,
    openAppWindow,
    requestCommandApproval,
    setResolvedPendingApproval,
    saveSettings,
    launchAgentComposer
  };

  return {
    store,
    chat,
    tray,
    terminal: launcherTerminal,
    history: launcherHistory,
    ui: launcherUI,
    actions: launcherActions
  };
}
