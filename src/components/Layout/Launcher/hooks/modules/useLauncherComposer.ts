
import { useMemo, useEffect } from 'react';
import * as Hooks from '../../../../../hooks';
import * as Utils from '../../utils';
import type { ShellModeSource } from '../../../../../types';

export type ComposerStateParams = {
  store: any;
  runtime: any;
};

export function useLauncherComposer(params: ComposerStateParams) {
  const { store, runtime } = params;
  const {
    workingDirectory,
    gitContext,
    availableShellCommands,
    commandHistory,
    terminalCommandBlocks,
    agentTerminalCommandBlocks,
    chat,
    resolvedConversationId,
    agentTerminal,
    terminal,
    queryWithoutActivator
  } = runtime;

  const isTerminalSurface = store.composerSurface === 'terminal';
  const intelligenceTerminalBlocks = isTerminalSurface ? terminalCommandBlocks : agentTerminalCommandBlocks;
  const activeMessages = isTerminalSurface ? [] : chat.messages;

  const composerIntelligenceContextKey = useMemo(() => {
    return isTerminalSurface
      ? `terminal:${terminal.sessionId ?? 'local'}:${workingDirectory.currentPath ?? ''}`
      : `composer:${resolvedConversationId ?? 'none'}:${agentTerminal.sessionId ?? 'local'}:${workingDirectory.currentPath ?? ''}`;
  }, [isTerminalSurface, terminal.sessionId, workingDirectory.currentPath, resolvedConversationId, agentTerminal.sessionId]);

  const composerIntelligence = Hooks.useComposerIntelligence({
    contextKey: composerIntelligenceContextKey,
    query: queryWithoutActivator,
    cwd: workingDirectory.currentPath,
    gitBranch: gitContext.gitContext?.currentBranch ?? null,
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

  const composerState = useMemo(() => {
    const baseComposerState = {
      mode: composerIntelligence.mode,
      shellSource: composerIntelligence.shellSource
    };

    if (
      store.modeLock === null &&
      store.autodetectedShellLatch &&
      baseComposerState.mode === 'chat' &&
      Utils.isSingleTokenShellCandidate(chat.query)
    ) {
      return {
        mode: 'shell' as const,
        shellSource: 'autodetected' as const
      };
    }
    return baseComposerState;
  }, [composerIntelligence.mode, composerIntelligence.shellSource, store.modeLock, store.autodetectedShellLatch, chat.query]);

  const composerMode = composerState.mode;
  const shellSource: ShellModeSource | null = composerState.shellSource;
  const activeShellPrediction = composerMode === 'shell' ? composerIntelligence.prediction : null;

  const latestAssistantFollowUp = useMemo(() => {
    if (isTerminalSurface) return null;

    for (let index = activeMessages.length - 1; index >= 0; index -= 1) {
      const message = activeMessages[index];
      if (
        message?.role === 'assistant' &&
        !message.isError &&
        (message.followUpSuggestion?.value?.trim() || Hooks.followUpSuggestionFromMessageBody(message.body)?.value?.trim())
      ) {
        const followUpSuggestion = message.followUpSuggestion ?? Hooks.followUpSuggestionFromMessageBody(message.body);
        if (!followUpSuggestion?.value?.trim()) continue;

        return {
          id: `follow-up:${message.id}`,
          label: followUpSuggestion.label,
          value: followUpSuggestion.value,
          description: followUpSuggestion.description ?? 'Suggested follow-up',
          mode: 'chat' as const
        };
      }
    }
    return null;
  }, [isTerminalSurface, activeMessages]);

  const recommendedAction = useMemo(() => {
    if (isTerminalSurface) return null;
    return latestAssistantFollowUp ?? composerIntelligence.recommendedAction;
  }, [isTerminalSurface, latestAssistantFollowUp, composerIntelligence.recommendedAction]);

  const terminalComposerAction = isTerminalSurface ? composerIntelligence.recommendedAction : null;

  // Sync effects from main hook
  useEffect(() => {
    if (!store.terminalAutoDetectEnabled || store.modeLock !== null || chat.query.trim().length === 0) {
      if (store.autodetectedShellLatch !== false) {
        store.setAutodetectedShellLatch(false);
      }
      return;
    }

    if (composerIntelligence.mode === 'shell' && composerIntelligence.shellSource === 'autodetected') {
      if (store.autodetectedShellLatch !== true) {
        store.setAutodetectedShellLatch(true);
      }
      return;
    }

    if (!Utils.isSingleTokenShellCandidate(chat.query)) {
      if (store.autodetectedShellLatch !== false) {
        store.setAutodetectedShellLatch(false);
      }
    }
  }, [composerIntelligence.mode, composerIntelligence.shellSource, store.modeLock, chat.query, store.terminalAutoDetectEnabled, store.autodetectedShellLatch, store.setAutodetectedShellLatch]);

  useEffect(() => {
    if (composerMode !== 'shell' || chat.query.trim().length === 0) {
      if (store.allowSingleCharacterCommandPrediction !== false) {
        store.setAllowSingleCharacterCommandPrediction(false);
      }
      return;
    }

    const firstToken = chat.query.trim().split(/\s+/)[0] ?? '';
    if (firstToken.length >= 2) {
      if (store.allowSingleCharacterCommandPrediction !== true) {
        store.setAllowSingleCharacterCommandPrediction(true);
      }
    }
  }, [composerMode, chat.query, store.allowSingleCharacterCommandPrediction, store.setAllowSingleCharacterCommandPrediction]);

  return {
    composerMode,
    shellSource,
    activeShellPrediction,
    recommendedAction,
    terminalComposerAction,
    composerIntelligence,
  };
}
