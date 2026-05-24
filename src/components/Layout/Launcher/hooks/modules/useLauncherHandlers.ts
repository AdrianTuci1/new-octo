
import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../../../../../stores/editorStore';
import { createConversationId } from '../../utils';
import { runCommandInSurface } from '../../utils/terminal';
import { consumeShellModeActivator } from '../../../../../lib';
import { normalizeCodeSettings } from '../../../../App/settings/codeSettings';
import { buildAgentSettingsValues, normalizeAgentSettings } from '../../../../App/settings/agentSettings';
import type { LauncherProps } from '../types';
import type { CommandApproval } from '../../../../../types';
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

function fileChangeVerb(diff: FileDiff) {
  if (diff.diffType.kind === 'create') return 'Created';
  if (diff.diffType.kind === 'delete') return 'Deleted';
  return 'Updated';
}

function appliedFileChangeBody(diffs: FileDiff[]) {
  const fileLines = diffs.map((diff) => `- ${fileChangeVerb(diff)} \`${diff.filePath}\``);
  return [
    diffs.length === 1
      ? `${fileChangeVerb(diffs[0])} file \`${diffs[0].filePath}\`.`
      : `Applied changes across ${diffs.length} files.`,
    fileLines.length > 1 ? fileLines.join('\n') : ''
  ].filter(Boolean).join('\n\n');
}

function appliedFileChangeSummary(diffs: FileDiff[], requestedSummary?: string) {
  if (diffs.length === 1) {
    const diff = diffs[0];
    const verb = fileChangeVerb(diff).toLowerCase();
    const detail = requestedSummary?.trim()
      ? ` ${requestedSummary.trim()}`
      : '';
    return `Am ${verb} fișierul \`${diff.filePath}\`.${detail}`;
  }

  return `Am aplicat modificările pentru ${diffs.length} fișiere.`;
}

function agentContinuationInstruction(kind: 'command' | 'file-change') {
  if (kind === 'file-change') {
    return [
      '[Invisible harness instruction]',
      'Continue toward the original user goal. If the user asked to run, test, or verify the created/edited file, immediately propose the next verification command with propose_terminal_command. Do not ask whether to rerun it.'
    ].join('\n');
  }

  return [
    '[Invisible harness instruction]',
    'Continue toward the original user goal. If this command failed and you can fix it, propose_file_change. If you just fixed something and need to confirm it, propose_terminal_command for the verification step. Do not ask whether to continue or rerun unless a real ambiguity blocks progress.'
  ].join('\n');
}

function terminalToolResult(command: string, result: { output?: string; block?: { exitCode?: number | null } }) {
  const exitCode = typeof result.block?.exitCode === 'number' ? result.block.exitCode : null;
  const output = result.output?.trim() || '(Comanda s-a executat fără output)';
  const failedByOutput = /\b(?:syntaxerror|traceback|error|failed|fail)\b/i.test(output);
  const failed = exitCode !== null ? exitCode !== 0 : failedByOutput;

  return [
    `[Terminal command result]`,
    `COMMAND: ${command}`,
    `EXIT_CODE: ${exitCode === null ? 'unknown' : exitCode}`,
    `STATUS: ${failed ? 'failed' : 'succeeded'}`,
    `OUTPUT:`,
    output,
    agentContinuationInstruction('command')
  ].join('\n');
}

function isAbsolutePath(path: string) {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

function normalizePathSegments(path: string) {
  const isAbsolute = path.startsWith('/');
  const parts = path.split('/').filter(Boolean);
  const stack: string[] = [];

  parts.forEach((part) => {
    if (part === '.') return;
    if (part === '..') {
      if (stack.length > 0) stack.pop();
      return;
    }
    stack.push(part);
  });

  return `${isAbsolute ? '/' : ''}${stack.join('/')}`;
}

function resolveWorkspaceFilePath(filePath: string, cwd?: string | null) {
  const trimmedPath = filePath.trim();
  if (!trimmedPath || isAbsolutePath(trimmedPath) || !cwd?.trim()) {
    return trimmedPath;
  }

  return normalizePathSegments(`${cwd.replace(/\/+$/, '')}/${trimmedPath.replace(/^\.\/+/, '')}`);
}

function withResolvedDiffPath(diff: FileDiff, cwd?: string | null): FileDiff {
  return {
    ...diff,
    filePath: resolveWorkspaceFilePath(diff.filePath, cwd)
  };
}

function openFileDiffsInEditor(diffs: FileDiff[], cwd?: string | null) {
  const { openFile } = useEditorStore.getState();
  diffs.forEach((diff) => {
    const resolvedPath = resolveWorkspaceFilePath(diff.filePath, cwd);
    const fileName = resolvedPath.split('/').pop() || resolvedPath;
    openFile(resolvedPath, fileName, getFileContentForDiff(diff));
  });
}

function exactCommandPattern(command: string) {
  return `^${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

function isCommandSearchQuery(value: string) {
  const trimmed = value.trimStart();
  return trimmed.startsWith('/') && !trimmed.includes(' ');
}

export function useLauncherHandlers({
  store, tray, props, runtime, 
  seededConversationAnchorTimesRef, pendingConversationAnchorRef,
  launchAgentComposer, clearTerminalSurface,
  suppressComposerShellAutodetectRef
}: {
  store: any;
  tray: any;
  props: LauncherProps;
  runtime: any;
  seededConversationAnchorTimesRef: any;
  pendingConversationAnchorRef: any;
  launchAgentComposer: any;
  clearTerminalSurface: any;
  suppressComposerShellAutodetectRef: any;
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
  const codeSettings = normalizeCodeSettings(memoryStore.settings?.values);

  const openCommandsTray = useCallback(() => {
    store.setSelectedHistoryIndex(0);
    store.setSelectedCommandIndex(0);
    if (!tray.isTrayOpen || tray.activeTrayMode !== 'commands') {
      tray.toggleTray('commands');
    }
  }, [store.setSelectedCommandIndex, store.setSelectedHistoryIndex, tray.activeTrayMode, tray.isTrayOpen, tray.toggleTray]);

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
    suppressComposerShellAutodetectRef.current = null;
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

  const handlePendingApprovalEdit = useCallback((approval: CommandApproval) => {
    if (approval.kind === 'file-change') {
      setResolvedPendingApproval(null);
      store.setComposerSurface('agent');
      store.setModeLock(null);
      openFileDiffsInEditor(approval.fileDiffs, runtime.workingDirectory.currentPath);
      return;
    }

    if ('command' in approval) {
      store.setComposerSurface('agent');
      store.setModeLock(null);
    }
  }, [
    runtime.workingDirectory.currentPath,
    setResolvedPendingApproval,
    store.setComposerSurface,
    store.setModeLock
  ]);

  const handlePendingApprovalSaveEdit = useCallback((approval: CommandApproval) => {
    setResolvedPendingApproval(approval);
    store.setComposerSurface('agent');
    store.setModeLock(null);
  }, [setResolvedPendingApproval, store.setComposerSurface, store.setModeLock]);

  const handlePendingApprovalReject = useCallback((approval: CommandApproval) => {
    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');
    store.setModeLock(null);

    const toolCallId = approval.kind === 'topic-change'
      ? null
      : approval.toolCallId ?? resolvedPendingApproval?.toolCallId ?? null;
    if (!toolCallId) {
      return;
    }

    const label = approval.kind === 'file-change'
      ? approval.summary
      : 'command' in approval
        ? approval.command
        : undefined;
    void chat.submitToolResult(
      toolCallId,
      approval.kind === 'file-change'
        ? 'The user rejected the proposed file changes.'
        : 'The user rejected the proposed command. Do not run it; suggest a safer alternative if needed.',
      'command',
      label
    );
  }, [
    chat.submitToolResult,
    resolvedPendingApproval?.toolCallId,
    setResolvedPendingApproval,
    store.setComposerSurface,
    store.setModeLock
  ]);

  const handlePendingApprovalAccept = useCallback(async (approval: CommandApproval) => {
    if (approval.kind === 'file-change') {
      try {
        for (const diff of approval.fileDiffs) {
          const resolvedDiff = withResolvedDiffPath(diff, runtime.workingDirectory.currentPath);
          await invoke('apply_file_diff', {
            filePath: resolvedDiff.filePath,
            diff: resolvedDiff.diffType
          });
        }

        const toolCallId = approval.toolCallId ?? resolvedPendingApproval?.toolCallId;

        setResolvedPendingApproval(null);
        store.setComposerSurface('agent');
        store.setModeLock(null);

        if (codeSettings.editor.autoOpenCodeReviewPanel && codeSettings.editor.codeReviewEditor === 'Warp') {
          openFileDiffsInEditor(approval.fileDiffs, runtime.workingDirectory.currentPath);
        }

        void chat.submitToolResult(
          toolCallId ?? `local-file-change-${Date.now()}`,
          [
            'Applied file changes successfully.',
            appliedFileChangeBody(approval.fileDiffs),
            agentContinuationInstruction('file-change')
          ].filter(Boolean).join('\n\n'),
          'file-change',
          approval.summary,
          undefined,
          {
            fileDiffs: approval.fileDiffs,
            deferFollowUp: !toolCallId,
            localAssistantSummary: !toolCallId
              ? appliedFileChangeSummary(approval.fileDiffs, approval.summary)
              : undefined
          }
        );
      } catch (error) {
        console.error('[Launcher] Failed to apply file changes:', error);
      }
      return;
    }

    setResolvedPendingApproval(null);
    store.setComposerSurface('agent');

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
          terminalToolResult(approval.command, result),
          'command',
          approval.command
        );
      }
    }
  }, [
    agentTerminal,
    chat.submitToolResult,
    clearTerminalSurface,
    codeSettings.editor.autoOpenCodeReviewPanel,
    codeSettings.editor.codeReviewEditor,
    resolvedPendingApproval?.toolCallId,
    runtime.workingDirectory.currentPath,
    setResolvedPendingApproval,
    store.setComposerSurface,
    store.setModeLock,
    terminal
  ]);

  const handlePendingApprovalAutoApprove = useCallback((approval: CommandApproval) => {
    if ('command' in approval) {
      const agentSettings = normalizeAgentSettings(memoryStore.settings?.values);
      const activeProfile = agentSettings.profiles.find((profile: any) => profile.id === agentSettings.activeProfileId)
        ?? agentSettings.profiles[0];
      const command = approval.command.trim();
      const pattern = command ? exactCommandPattern(command) : '';
      if (activeProfile && pattern && !activeProfile.commandAllowlist.includes(pattern)) {
        void saveSettings(buildAgentSettingsValues({
          ...agentSettings,
          profiles: agentSettings.profiles.map((profile: any) => profile.id === activeProfile.id
            ? {
                ...profile,
                commandAllowlist: [...profile.commandAllowlist, pattern]
              }
            : profile)
        }), true);
      }
    }

    void handlePendingApprovalAccept(approval);
  }, [handlePendingApprovalAccept, memoryStore.settings?.values, saveSettings]);

  const handleTerminalQueryChange = useCallback((value: string) => {
    chat.setQuery(value);
    store.setSelectedHistoryIndex(0);
    store.setSelectedCommandIndex(0);

    if (isCommandSearchQuery(value)) {
      if (!tray.isTrayOpen || tray.activeTrayMode !== 'commands') {
        tray.toggleTray('commands');
      }
      return;
    }

    if (tray.isTrayOpen && tray.activeTrayMode === 'commands') {
      tray.closeTray();
    }
  }, [
    chat.setQuery,
    store.setSelectedCommandIndex,
    store.setSelectedHistoryIndex,
    tray.activeTrayMode,
    tray.closeTray,
    tray.isTrayOpen,
    tray.toggleTray
  ]);

  const handleComposerQueryChange = useCallback((rawValue: string) => {
    const nextValue = consumeShellModeActivator(rawValue);
    if (suppressComposerShellAutodetectRef.current !== null) {
      suppressComposerShellAutodetectRef.current = null;
    }
    chat.setQuery(rawValue);
    store.setSelectedHistoryIndex(0);
    store.setSelectedCommandIndex(0);
    if (nextValue.consumed && store.modeLock === 'chat') {
      store.setModeLock(null);
    }

    if (isCommandSearchQuery(nextValue.value)) {
      if (!tray.isTrayOpen || tray.activeTrayMode !== 'commands') {
        tray.toggleTray('commands');
      }
    } else if (tray.isTrayOpen && tray.activeTrayMode === 'commands') {
      tray.closeTray();
    }
  }, [
    chat.setQuery,
    store.modeLock,
    store.setModeLock,
    store.setSelectedCommandIndex,
    store.setSelectedHistoryIndex,
    suppressComposerShellAutodetectRef,
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

  const executeTerminalCommand = useCallback((command: string) => {
    const normalized = command.trim();
    if (!normalized) {
      return;
    }

    void runCommandInSurface(
      normalized,
      store.composerSurface === 'agent' ? 'agent' : 'terminal',
      terminal,
      agentTerminal,
      clearTerminalSurface,
      'user'
    ).then(() => {
      chat.setQuery('');
      store.setModeLock(null);
      store.setAutodetectedShellLatch(false);
    });
  }, [
    agentTerminal,
    chat.setQuery,
    clearTerminalSurface,
    store.composerSurface,
    store.setAutodetectedShellLatch,
    store.setModeLock,
    terminal
  ]);

  const handleComposerRecommendationClick = useCallback((action: any) => {
    chat.setQuery(action.value);
  }, [chat.setQuery]);

  const handleToggleCommands = useCallback(() => {
    const willOpen = !tray.isTrayOpen || tray.activeTrayMode !== 'commands';
    store.setSelectedCommandIndex(0);
    chat.setQuery(willOpen ? '/' : '');
    tray.toggleTray('commands');
  }, [chat.setQuery, store.setSelectedCommandIndex, tray.activeTrayMode, tray.isTrayOpen, tray.toggleTray]);

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
    handlePendingApprovalEdit,
    handlePendingApprovalSaveEdit,
    handlePendingApprovalReject,
    handlePendingApprovalAccept,
    handlePendingApprovalAutoApprove,
    handleTerminalQueryChange,
    handleComposerQueryChange,
    handleTerminalRecommendationClick,
    handleComposerRecommendationClick,
    handleToggleCommands,
    handleToggleTerminalAutoDetect,
    handleHistoryEntrySelect,
    executeTerminalCommand
  };
}
