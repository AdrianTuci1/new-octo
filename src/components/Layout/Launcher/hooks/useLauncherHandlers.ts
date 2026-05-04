/**
 * `useLauncherHandlers` - Event handlers and callbacks for UI interactions.
 * 
 * Responsibilities:
 * 1. Provide actions to open/close surfaces (e.g. `closeAgentSurface`, `toggleComposerSurface`, `openCommandsTray`).
 * 2. Manage conversation transitions (`openConversationFromBlock`, `handleTrayConversationSelect`, `handleNewConversation`).
 * 3. Ensure proper state clearing and sync when switching views.
 */
import { useCallback } from 'react';
import { createConversationId } from '../utils';
import { runCommandInSurface } from '../utils/terminal';
import { consumeShellModeActivator } from '../../../../lib';

export function useLauncherHandlers({
  store, chat, tray, props, terminal, agentTerminal,
  resolvedConversationId, memoryConversations,
  seededConversationAnchorTimesRef, pendingConversationAnchorRef,
  setResolvedPendingApproval, launchAgentComposer, clearTerminalSurface,
  resolvedPendingApproval, saveSettings
}: any) {
  const hasControlledConversation = props.conversationId !== undefined;

  const openCommandsTray = useCallback(() => {
    store.setSelectedHistoryIndex(0);
    if (!tray.isTrayOpen || tray.activeTrayMode !== 'commands') {
      tray.toggleTray('commands');
    }
  }, [store.setSelectedHistoryIndex, tray.activeTrayMode, tray.isTrayOpen, tray.toggleTray]);
  const closeAgentSurface = useCallback(() => {
    void chat.saveCurrentConversation?.();

    if (resolvedConversationId && seededConversationAnchorTimesRef.current[resolvedConversationId]) {
      const conversationSummary = memoryConversations.find((conversation: any) => conversation.id === resolvedConversationId);
      terminal.upsertSyntheticBlock({
        id: `conversation-link-${resolvedConversationId}`,
        command: '',
        output: '',
        startedAt: seededConversationAnchorTimesRef.current[resolvedConversationId],
        finishedAt: seededConversationAnchorTimesRef.current[resolvedConversationId],
        status: 'finished',
        presentation: 'conversation-link',
        conversationId: resolvedConversationId,
        conversationTitle: conversationSummary?.title ?? 'Return to AI conversation'
      });
    }

    tray.closeTray();
    pendingConversationAnchorRef.current = null;
    store.setComposerSurface('terminal');
    store.setLocalConversationId(null);
    store.setModeLock(null);
    setResolvedPendingApproval(null);
    if (hasControlledConversation) {
      props.onConversationChange?.(null);
    }
    chat.setQuery('');
    props.onExitAgentToTerminal?.();
  }, [
    chat.saveCurrentConversation,
    chat.setQuery,
    hasControlledConversation,
    memoryConversations,
    props.onConversationChange,
    props.onExitAgentToTerminal,
    resolvedConversationId,
    setResolvedPendingApproval,
    store.setComposerSurface,
    store.setModeLock,
    terminal.upsertSyntheticBlock,
    tray.closeTray
  ]);

  const openConversationFromBlock = useCallback((nextConversationId: string) => {
    void chat.saveCurrentConversation?.();
    tray.closeTray();
    setResolvedPendingApproval(null);
    store.setModeLock(null);
    pendingConversationAnchorRef.current = null;
    if (hasControlledConversation) {
      store.setLocalConversationId(nextConversationId);
      if (props.onSelectConversation) {
        props.onSelectConversation(nextConversationId);
      } else {
        props.onConversationChange?.(nextConversationId);
      }
    } else {
      store.setLocalConversationId(nextConversationId);
    }
    store.setComposerSurface('agent');
  }, [
    chat.saveCurrentConversation,
    hasControlledConversation,
    props.onConversationChange,
    props.onSelectConversation,
    setResolvedPendingApproval,
    store.setComposerSurface,
    store.setLocalConversationId,
    store.setModeLock,
    tray.closeTray
  ]);

  const toggleComposerSurface = useCallback(() => {
    if (store.composerSurface === 'agent') {
      closeAgentSurface();
      return;
    }

    launchAgentComposer(chat.query.trim() || undefined);
  }, [chat.query, closeAgentSurface, store.composerSurface, launchAgentComposer]);



  const handleTrayConversationSelect = useCallback((nextConversationId: string) => {
    void chat.saveCurrentConversation?.();
    tray.closeTray();
    store.setSelectedHistoryIndex(0);
    store.setConversationSearchQuery('');
    chat.setQuery('');
    pendingConversationAnchorRef.current = null;
    if (props.onSelectConversation) {
      props.onSelectConversation(nextConversationId);
      return;
    }

    if (hasControlledConversation) {
      props.onConversationChange?.(nextConversationId);
    }

    store.setLocalConversationId(nextConversationId);
    store.setComposerSurface('agent');
    store.setModeLock(null);
  }, [
    chat.saveCurrentConversation,
    chat.setQuery,
    hasControlledConversation,
    props.onConversationChange,
    props.onSelectConversation,
    store.setComposerSurface,
    store.setConversationSearchQuery,
    store.setLocalConversationId,
    store.setModeLock,
    store.setSelectedHistoryIndex,
    tray.closeTray
  ]);

  const handleNewConversation = useCallback(() => {
    void chat.saveCurrentConversation?.();
    tray.closeTray();
    store.setConversationSearchQuery('');
    if (props.onNewConversation) {
      const nextConversationId = props.onNewConversation() ?? createConversationId();
      pendingConversationAnchorRef.current = {
        conversationId: nextConversationId,
        startedAt: new Date().toISOString()
      };
      store.setLocalConversationId(nextConversationId);
      chat.clearMessages();
      chat.setQuery('');
      store.setComposerSurface('agent');
      store.setModeLock(null);
      return;
    }

    const nextConversationId = createConversationId();
    pendingConversationAnchorRef.current = {
      conversationId: nextConversationId,
      startedAt: new Date().toISOString()
    };
    store.setLocalConversationId(nextConversationId);
    chat.clearMessages();
    chat.setQuery('');
    store.setComposerSurface('agent');
    store.setModeLock(null);
  }, [
    chat.clearMessages,
    chat.saveCurrentConversation,
    chat.setQuery,
    props.onNewConversation,
    store.setComposerSurface,
    store.setConversationSearchQuery,
    store.setLocalConversationId,
    store.setModeLock,
    tray.closeTray
  ]);

  const handleCommandApprovalReject = useCallback(() => {
    setResolvedPendingApproval(null);
  }, [setResolvedPendingApproval]);

  const handleCommandApprovalEdit = useCallback((command: string) => {
    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');
    store.setModeLock('shell');
    chat.setQuery(command);
  }, [chat.setQuery, setResolvedPendingApproval, store.setComposerSurface, store.setModeLock]);

  const handleCommandApprovalRun = useCallback(async (command: string) => {
    const toolCallId = resolvedPendingApproval?.toolCallId;
    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');

    const result = await runCommandInSurface(
      command,
      'agent',
      terminal,
      agentTerminal,
      clearTerminalSurface,
      'assistant'
    );

    if (toolCallId && result) {
      void chat.submitToolResult(
        toolCallId,
        result.output || '(Comanda s-a executat fără output)',
        command
      );
    }
  }, [
    agentTerminal,
    chat.submitToolResult,
    clearTerminalSurface,
    resolvedPendingApproval?.toolCallId,
    setResolvedPendingApproval,
    store.setComposerSurface,
    terminal
  ]);

  const handleTerminalQueryChange = useCallback((value: string) => {
    chat.setQuery(value);
    store.setSelectedHistoryIndex(0);

    if (value === '/') {
      if (!tray.isTrayOpen || tray.activeTrayMode !== 'commands') {
        tray.toggleTray('commands');
      }
      return;
    }

    if ((value === '' || value === '//') && tray.isTrayOpen && tray.activeTrayMode === 'commands') {
      tray.closeTray();
    }
  }, [
    chat.setQuery,
    store.setSelectedHistoryIndex,
    tray.activeTrayMode,
    tray.closeTray,
    tray.isTrayOpen,
    tray.toggleTray
  ]);

  const handleComposerQueryChange = useCallback((rawValue: string) => {
    const nextValue = consumeShellModeActivator(rawValue);
    chat.setQuery(nextValue.value);
    store.setSelectedHistoryIndex(0);
    if (nextValue.consumed) {
      store.setModeLock('shell');
    } else if (rawValue.length === 0 && store.modeLock === 'chat') {
      store.setModeLock(null);
    }

    if (nextValue.value === '/' && !tray.isTrayOpen) {
      tray.toggleTray('commands');
    } else if ((nextValue.value === '' || nextValue.value === '//') && tray.isTrayOpen && tray.activeTrayMode === 'commands') {
      tray.toggleTray('commands');
    }
  }, [
    chat.setQuery,
    store.modeLock,
    store.setModeLock,
    store.setSelectedHistoryIndex,
    tray.activeTrayMode,
    tray.isTrayOpen,
    tray.toggleTray
  ]);

  const handleTerminalRecommendationClick = useCallback((action: any) => {
    if (action.mode === 'shell') {
      void runCommandInSurface(
        action.value,
        'terminal',
        terminal,
        agentTerminal,
        clearTerminalSurface,
        'user'
      );
      chat.setQuery('');
      return;
    }

    store.setComposerSurface('agent');
    store.setModeLock(null);
    chat.setQuery(action.value);
    window.requestAnimationFrame(() => {
      void chat.submitQuery();
    });
  }, [
    agentTerminal,
    chat.setQuery,
    chat.submitQuery,
    clearTerminalSurface,
    store.setComposerSurface,
    store.setModeLock,
    terminal
  ]);

  const handleComposerRecommendationClick = useCallback((action: any) => {
    store.setComposerSurface('agent');
    store.setModeLock(action.mode === 'shell' ? 'shell' : null);
    chat.setQuery(action.value);
  }, [chat.setQuery, store.setComposerSurface, store.setModeLock]);

  const handleToggleCommands = useCallback(() => {
    const willOpen = !tray.isTrayOpen || tray.activeTrayMode !== 'commands';
    chat.setQuery(willOpen ? '/' : '');
    tray.toggleTray('commands');
  }, [chat.setQuery, tray.activeTrayMode, tray.isTrayOpen, tray.toggleTray]);

  const handleToggleTerminalAutoDetect = useCallback(() => {
    const nextValue = !store.terminalAutoDetectEnabled;
    void saveSettings({ terminalAutoDetectEnabled: nextValue }, true);
    store.setTerminalAutoDetectEnabled(nextValue);
  }, [saveSettings, store.terminalAutoDetectEnabled, store.setTerminalAutoDetectEnabled]);

  const handleHistoryEntrySelect = useCallback((entry: any) => {
    store.setModeLock(entry.kind === 'command' ? 'shell' : 'chat');
    chat.setQuery(entry.label);
    tray.toggleTray('history');
  }, [chat.setQuery, store.setModeLock, tray.toggleTray]);


  return {
    openCommandsTray,
    closeAgentSurface,
    openConversationFromBlock,
    toggleComposerSurface,
    handleTrayConversationSelect,
    handleNewConversation,
    handleCommandApprovalReject,
    handleCommandApprovalEdit,
    handleCommandApprovalRun,
    handleTerminalQueryChange,
    handleComposerQueryChange,
    handleTerminalRecommendationClick,
    handleComposerRecommendationClick,
    handleToggleCommands,
    handleToggleTerminalAutoDetect,
    handleHistoryEntrySelect
  };
}
