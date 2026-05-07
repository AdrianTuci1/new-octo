
import { useCallback } from 'react';
import { useEditorStore } from '../../../../../stores/editorStore';
import { createConversationId } from '../../utils';
import { runCommandInSurface } from '../../utils/terminal';
import { consumeShellModeActivator } from '../../../../../lib';
import type { LauncherProps } from '../types';
import type { CommandApproval, FileChangeApproval } from '../../../../../types';
import type { FileDiff } from '../../../../../types/diff';

function getFileContentForDiff(diff: FileDiff) {
  if (diff.diffType.kind === 'create') {
    return diff.diffType.delta.insertion;
  }

  if (diff.diffType.kind === 'update') {
    return diff.originalContent ?? diff.diffType.deltas.map((delta) => delta.insertion).join('\n');
  }

  return diff.originalContent ?? '';
}

function openFileDiffsInEditor(diffs: FileDiff[]) {
  const { openFile } = useEditorStore.getState();
  diffs.forEach((diff) => {
    const fileName = diff.filePath.split('/').pop() || diff.filePath;
    openFile(diff.filePath, fileName, getFileContentForDiff(diff));
  });
}

function buildFileChangeRefinePrompt(approval: FileChangeApproval) {
  const fileList = approval.fileDiffs.map((diff) => `- ${diff.filePath}`).join('\n');
  return [
    approval.summary?.trim() || 'Refine the proposed file changes.',
    fileList ? `Affected files:\n${fileList}` : '',
    'Please revise the proposal and keep the same intent while improving the implementation.'
  ].filter(Boolean).join('\n\n');
}

function buildCommandRefinePrompt(command: string) {
  return [
    'Refine the following terminal command so it is safer, clearer, and still solves the same task:',
    command.trim()
  ].filter(Boolean).join('\n\n');
}

export function useLauncherHandlers({
  store, tray, props, runtime, 
  seededConversationAnchorTimesRef, pendingConversationAnchorRef,
  launchAgentComposer, clearTerminalSurface, 
}: {
  store: any;
  tray: any;
  props: LauncherProps;
  runtime: any;
  seededConversationAnchorTimesRef: any;
  pendingConversationAnchorRef: any;
  launchAgentComposer: any;
  clearTerminalSurface: any;
}) {
  const { 
    chat, 
    terminal, 
    agentTerminal, 
    resolvedConversationId, 
    resolvedPendingApproval, 
    setResolvedPendingApproval,
    memoryStore,
    hasControlledConversation
  } = runtime;

  const memoryConversations = memoryStore.conversations;
  const saveSettings = memoryStore.saveSettings;

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
    setResolvedPendingApproval(null);
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
    setResolvedPendingApproval,
    store.setComposerSurface,
    store.setConversationSearchQuery,
    store.setLocalConversationId,
    store.setModeLock,
    tray.closeTray
  ]);

  const handlePendingTopicChangeStartNewConversation = useCallback(() => {
    handleNewConversation();
  }, [handleNewConversation]);

  const handlePendingTopicChangeContinueConversation = useCallback(() => {
    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');
    store.setModeLock(null);
  }, [setResolvedPendingApproval, store.setComposerSurface, store.setModeLock]);

  const handlePendingApprovalRefine = useCallback((approval: CommandApproval) => {
    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');
    store.setModeLock(null);

    if (approval.kind === 'file-change') {
      void chat.submitQuery(buildFileChangeRefinePrompt(approval));
      return;
    }

    if ('command' in approval) {
      void chat.submitQuery(buildCommandRefinePrompt(approval.command));
    }
  }, [chat, setResolvedPendingApproval, store.setComposerSurface, store.setModeLock]);

  const handlePendingApprovalEdit = useCallback((approval: CommandApproval) => {
    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');

    if (approval.kind === 'file-change') {
      store.setModeLock(null);
      openFileDiffsInEditor(approval.fileDiffs);
      return;
    }

    if ('command' in approval) {
      store.setModeLock('shell');
      chat.setQuery(approval.command);
    }
  }, [chat.setQuery, setResolvedPendingApproval, store.setComposerSurface, store.setModeLock]);

  const handlePendingApprovalAccept = useCallback(async (approval: CommandApproval) => {
    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');

    if (approval.kind === 'file-change') {
      store.setModeLock(null);
      return;
    }

    if ('command' in approval) {
      const toolCallId = approval.toolCallId ?? resolvedPendingApproval?.toolCallId;
      const result = await runCommandInSurface(
        approval.command,
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
          'command',
          approval.command
        );
      }
    }
  }, [
    agentTerminal,
    chat.submitToolResult,
    clearTerminalSurface,
    resolvedPendingApproval?.toolCallId,
    setResolvedPendingApproval,
    store.setComposerSurface,
    store.setModeLock,
    terminal
  ]);

  const handlePendingApprovalAutoApprove = useCallback((approval: CommandApproval) => {
    void handlePendingApprovalAccept(approval);
  }, [handlePendingApprovalAccept]);

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
    chat.setQuery('');
    void chat.submitQuery(action.value);
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
    chat.setQuery(action.value);
  }, [chat.setQuery]);

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
    handlePendingTopicChangeStartNewConversation,
    handlePendingTopicChangeContinueConversation,
    handlePendingApprovalRefine,
    handlePendingApprovalEdit,
    handlePendingApprovalAccept,
    handlePendingApprovalAutoApprove,
    handleTerminalQueryChange,
    handleComposerQueryChange,
    handleTerminalRecommendationClick,
    handleComposerRecommendationClick,
    handleToggleCommands,
    handleToggleTerminalAutoDetect,
    handleHistoryEntrySelect
  };
}
