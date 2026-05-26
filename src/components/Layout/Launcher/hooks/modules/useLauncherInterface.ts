
/**
 * Module: useLauncherInterface
 * 
 * Dictionary:
 * - terminal: Aggregated data for the terminal surface rendering.
 * - ui: Comprehensive flags and CSS classes for the component layout.
 * - actions: Unified command set for the UI (handlers + shortcuts + runtime actions).
 * - Assembler: This module takes the outputs of all other sub-hooks and shapes them into the standard Launcher interface.
 */
import { COMMAND_ITEMS, HELP_ITEMS, getShellToggleShortcutTokens } from '../../../../../lib';
import { formatCompactPathLabel } from '../../../../../lib/pathLabels';
import type { LauncherProps } from '../types';

export function useLauncherInterface(params: {
  props: LauncherProps;
  store: any;
  runtime: any;
  tray: any;
  composer: any;
  ui: any;
  history: any;
  handlers: any;
  shortcuts: any;
  shellRef: any;
  dockRef: any;
  clearTerminalSurface: any;
  launchAgentComposer: any;
  openAppWindow: any;
  openModelDrawer: any;
  closeModelDrawer: any;
}) {
  const { props, store, runtime, tray, composer, ui, history, handlers, shortcuts, shellRef, dockRef, clearTerminalSurface, launchAgentComposer, openAppWindow, openModelDrawer, closeModelDrawer } = params;
  const isAgentSurface = store.composerSurface === 'agent';
  const activeTerminalSurface = isAgentSurface ? runtime.agentTerminal : runtime.terminal;
  const variant = props.variant;
  const chatMode = props.chatMode;
  const resolvedConversationId = runtime.resolvedConversationId;
  const resolvedPendingApproval = runtime.resolvedPendingApproval;
  const isTerminalCommandsTrayOpen = store.composerSurface === 'terminal' && tray.isTrayOpen && tray.activeTrayMode === 'commands';
  const isTerminalTrayOpen = store.composerSurface === 'terminal'
    && tray.isTrayOpen
    && (tray.activeTrayMode === 'commands' || tray.activeTrayMode === 'history');
  const isTerminalSurface = store.composerSurface === 'terminal';
  const latestUsage = [...runtime.chat.messages]
    .reverse()
    .find((message: any) => message.role === 'assistant' && message.usage)?.usage ?? null;
  const promptTokens = typeof latestUsage?.promptTokens === 'number' ? latestUsage.promptTokens : 0;
  const estimatedContextWindow = 128000;
  const contextUsageProgress = Math.max(0, Math.min(1, promptTokens / estimatedContextWindow));
  const remainingContextTokens = Math.max(0, estimatedContextWindow - promptTokens);
  const contextUsageTitle = promptTokens > 0
    ? `Context window: ${promptTokens.toLocaleString()} / ${estimatedContextWindow.toLocaleString()} tokens (${Math.round(contextUsageProgress * 100)}% used, ${remainingContextTokens.toLocaleString()} remaining)`
    : `Context window: 0 / ${estimatedContextWindow.toLocaleString()} tokens`;
  const workingDirectory = runtime.workingDirectory;
  const gitContext = runtime.gitContext;
  const runtimeContext = runtime.runtimeContext;
  const agentSettings = runtime.agentSettings;
  const modelSelection = runtime.modelSelection;
  const activeShellPrediction = composer.activeShellPrediction;
  const recommendedAction = composer.recommendedAction;
  const activeMessages = store.composerSurface === 'agent' ? runtime.chat.messages : [];
  const composerMode = composer.composerMode;
  const activeSurfaceWorkingDirectory = runtime.activeSurfaceWorkingDirectory;
  const effectiveWorkingDirectory = runtime.effectiveWorkingDirectory ?? activeSurfaceWorkingDirectory ?? workingDirectory.currentPath;
  const effectiveWorkingDirectoryLabel = formatCompactPathLabel(
    effectiveWorkingDirectory,
    workingDirectory.homeDir ?? null
  );
  const showOpenInApp = variant !== 'workspace';
  const modelSetupRequired = modelSelection.requiresModelSetup;
  const terminalAutoDetectEnabled = store.terminalAutoDetectEnabled
    && agentSettings?.enabled !== false
    && agentSettings?.input?.autodetectTerminalCommandsInAgent !== false;

  return {
    store,
    chat: runtime.chat,
    tray,
    history,
    terminal: {
      agentTerminal: runtime.agentTerminal,
      terminal: runtime.terminal,
      activeTimelineBlocks: activeTerminalSurface.blocks,
      activeTimelineError: activeTerminalSurface.error,
      activeExpandedBlockIds: activeTerminalSurface.expandedBlockIds,
      activeSelectedBlockId: activeTerminalSurface.selectedBlockId,
      expandActiveTimelineBlock: activeTerminalSurface.expandBlock,
      collapseActiveTimelineBlock: activeTerminalSurface.collapseBlock,
      selectActiveTimelineBlock: activeTerminalSurface.setSelectedBlockId,
      completionState: activeTerminalSurface.completionState,
      shellRef,
      shellSource: composer.shellSource,
      terminalComposerAction: composer.terminalComposerAction,
      shellShortcutTokens: getShellToggleShortcutTokens(),
      clearTerminalSurface,
    },
    ui: {
      ...ui,
      variant,
      chatMode,
      resolvedConversationId,
      resolvedPendingApproval,
      isTerminalCommandsTrayOpen,
      isTerminalTrayOpen,
      isTerminalSurface,
      workingDirectory,
      gitContext,
      runtimeContext,
      agentSettings,
      dockRef,
      modelSelection,
      activeShellPrediction,
      recommendedAction,
      activeMessages,
      composerMode,
    },
    actions: {
      ...handlers,
      ...shortcuts,
      openAppWindow,
      requestCommandApproval: runtime.requestCommandApproval,
      setResolvedPendingApproval: runtime.setResolvedPendingApproval,
      saveSettings: runtime.memoryStore.saveSettings,
      launchAgentComposer,
      openModelDrawer,
      closeModelDrawer,
    },
    views: {
      chatPanel: {
        messages: activeMessages,
        terminalBlocks: activeTerminalSurface.blocks,
        terminalError: activeTerminalSurface.error,
        workingDirectory: activeSurfaceWorkingDirectory ?? workingDirectory.currentPath,
        expandedTerminalBlockIds: activeTerminalSurface.expandedBlockIds,
        selectedTerminalBlockId: activeTerminalSurface.selectedBlockId,
        isOpen: true,
        emptyStateVariant: variant === 'workspace' ? 'workspace' as const : 'default' as const,
        showEmptyTopbar: variant === 'workspace' && store.composerSurface !== 'terminal' && composerMode !== 'shell',
        pendingApproval: resolvedPendingApproval,
        title: props.title ?? 'New agent conversation',
        onRequestCommandApproval: runtime.requestCommandApproval,
        onEditPendingApproval: handlers.handlePendingApprovalEdit,
        onSaveEditPendingApproval: handlers.handlePendingApprovalSaveEdit,
        onRejectPendingApproval: handlers.handlePendingApprovalReject,
        onAcceptPendingApproval: handlers.handlePendingApprovalAccept,
        onAutoApprovePendingApproval: handlers.handlePendingApprovalAutoApprove,
        onStartNewConversationPendingApproval: handlers.handlePendingTopicChangeStartNewConversation,
        onContinueCurrentConversationPendingApproval: handlers.handlePendingTopicChangeContinueConversation,
        onCollapseTerminalBlock: activeTerminalSurface.collapseBlock,
        onExpandTerminalBlock: activeTerminalSurface.expandBlock,
        onSelectTerminalBlock: activeTerminalSurface.setSelectedBlockId,
        onOpenConversationBlock: handlers.openConversationFromBlock,
      },
      trayPanel: {
        isOpen: tray.isTrayOpen,
        showFooter: !isTerminalSurface || tray.activeTrayMode === 'commands' || tray.activeTrayMode === 'history' || tray.activeTrayMode === 'conversations',
        showOpenInApp,
        activeMode: tray.activeTrayMode,
        commandSearchQuery: runtime.chat.query,
        helpItems: HELP_ITEMS,
        commandItems: COMMAND_ITEMS,
        selectedCommandIndex: store.selectedCommandIndex,
        historyEntries: history.historyEntries,
        conversations: ui.visibleTrayConversations,
        activeConversationId: resolvedConversationId,
        conversationSearchQuery: store.conversationSearchQuery,
        historyTab: store.historyTab,
        modelTab: store.modelTab,
        modelEntries: ui.visibleModels,
        selectedHistoryIndex: store.selectedHistoryIndex,
        selectedModelId: modelSelection.selectedModelId,
        selectedModelIndex: store.selectedModelIndex,
        inputMode: composerMode,
        shellSource: composer.shellSource,
        shellShortcutTokens: getShellToggleShortcutTokens(),
        onExitShellMode: () => store.setModeLock(runtime.chat.query.trim().length > 0 ? 'chat' : null),
        onHistoryTabChange: store.setHistoryTab,
        onSelectHistoryEntry: handlers.handleHistoryEntrySelect,
        onSelectConversation: handlers.handleTrayConversationSelect,
        onConversationSearchChange: store.setConversationSearchQuery,
        onNewConversation: handlers.handleNewConversation,
        onSelectModel: (modelId: string) => modelSelection.selectModel(modelId, true),
        onModelTabChange: store.setModelTab,
        onToggleHelp: () => tray.toggleTray('help'),
        onToggleCommands: handlers.handleToggleCommands,
        onToggleConversations: () => tray.toggleTray('conversations'),
        onInsertCommand: (command: string) => {
          runtime.chat.setQuery(`${command} `);
          tray.closeTray();
        },
        onOpenApp: openAppWindow,
        onOpenModelSettings: openModelDrawer,
      },
      terminalComposer: {
        query: runtime.chat.query,
        gitContext: gitContext.gitContext,
        gitBranchMenuOpen: gitContext.isBranchMenuOpen,
        workingDirectory: effectiveWorkingDirectory,
        workingDirectoryLabel: effectiveWorkingDirectoryLabel,
        workingDirectoryPickerOpen: workingDirectory.isPickerOpen,
        workingDirectoryListing: workingDirectory.listing,
        workingDirectorySearch: workingDirectory.searchQuery,
        runtimeNodeVersion: runtimeContext?.nodeVersion ?? null,
        prediction: activeShellPrediction,
        recommendedAction: params.composer.terminalComposerAction,
        completionState: activeTerminalSurface.completionState,
        showOpenInApp,
        onQueryChange: handlers.handleTerminalQueryChange,
        onKeyDown: shortcuts.handleComposerKeyDown,
        onRecommendedActionClick: handlers.handleTerminalRecommendationClick,
        onToggleWorkingDirectoryPicker: workingDirectory.togglePicker,
        onCloseWorkingDirectoryPicker: workingDirectory.closePicker,
        onWorkingDirectorySearchChange: workingDirectory.setSearchQuery,
        onNavigateToParentDirectory: handlers.handleNavigateToParentDirectory,
        onSelectWorkingDirectory: handlers.handleSelectWorkingDirectory,
        onToggleGitBranchMenu: gitContext.toggleBranchMenu,
        onCloseGitBranchMenu: () => gitContext.setIsBranchMenuOpen(false),
        onSelectGitBranch: gitContext.switchBranch,
        onOpenCommandsTray: handlers.openCommandsTray,
        onLaunchAgentComposer: launchAgentComposer,
        onOpenApp: showOpenInApp ? openAppWindow : undefined,
      },
      modelSetupOverlay: {
        onBack: () => {
          closeModelDrawer();
          store.setComposerSurface('terminal');
          tray.closeTray();
        },
        onOpenModelSettings: () => {
          openAppWindow();
          openModelDrawer();
        },
      },
      composerBar: {
        mode: composerMode,
        shellSource: composer.shellSource,
        restrictActions: false,
        query: runtime.chat.query,
        prediction: activeShellPrediction,
        recommendedAction,
        gitContext: gitContext.gitContext,
        gitBranchMenuOpen: gitContext.isBranchMenuOpen,
        workingDirectory: effectiveWorkingDirectory,
        workingDirectoryLabel: effectiveWorkingDirectoryLabel,
        workingDirectoryPickerOpen: workingDirectory.isPickerOpen,
        workingDirectoryListing: workingDirectory.listing,
        workingDirectorySearch: workingDirectory.searchQuery,
        selectedModelLabel: modelSelection.selectedModelLabel,
        contextIndicatorTitle: effectiveWorkingDirectory ?? 'Workspace context',
        contextIndicatorTone: isTerminalSurface || composerMode === 'shell' ? 'terminal' : 'agent',
        contextUsageProgress,
        contextUsageTitle,
        selectedModelSupportsAttachments: modelSelection.selectedModelSupportsAttachments,
        attachedFiles: runtime.chat.attachments,
        onAttachFiles: runtime.chat.attachFiles,
        onRemoveAttachedFile: runtime.chat.removeAttachment,
        onClearAttachments: runtime.chat.clearAttachments,
        terminalAutoDetectEnabled,
        modelSetupRequired,
        onQueryChange: handlers.handleComposerQueryChange,
        onKeyDown: shortcuts.handleComposerKeyDown,
        onRecommendedActionClick: handlers.handleComposerRecommendationClick,
        onToggleWorkingDirectoryPicker: workingDirectory.togglePicker,
        onToggleSingleCharacterPrediction: () => store.setAllowSingleCharacterCommandPrediction(!store.allowSingleCharacterCommandPrediction),
        onCloseWorkingDirectoryPicker: workingDirectory.closePicker,
        onWorkingDirectorySearchChange: workingDirectory.setSearchQuery,
        onNavigateToParentDirectory: handlers.handleNavigateToParentDirectory,
        onSelectWorkingDirectory: handlers.handleSelectWorkingDirectory,
        onToggleTerminalAutoDetect: handlers.handleToggleTerminalAutoDetect,
        onToggleGitBranchMenu: gitContext.toggleBranchMenu,
        onToggleModelTray: () => (modelSetupRequired ? openModelDrawer() : tray.toggleTray('models')),
        onCloseGitBranchMenu: () => gitContext.setIsBranchMenuOpen(false),
        onSelectGitBranch: gitContext.switchBranch,
        onExecuteTerminalCommand: handlers.executeTerminalCommand,
        onBackFromModelSetup: () => {
          closeModelDrawer();
          store.setComposerSurface('terminal');
          tray.closeTray();
        },
        onOpenModelSettings: () => {
          openAppWindow();
          openModelDrawer();
        },
      },
    },
  };
}
