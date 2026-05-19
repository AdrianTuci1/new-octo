
import { useMemo, useEffect } from 'react';
import * as Hooks from '../../../../../hooks';
import * as Utils from '../../utils';
import type { ShellModeSource } from '../../../../../types';

const FOLLOW_UP_MIN_CONFIDENCE = 0.7;

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
    queryWithoutActivator,
    agentSettings
  } = runtime;

  const isTerminalSurface = store.composerSurface === 'terminal';
  const activeAiEnabled = agentSettings?.enabled !== false;
  const nextCommandEnabled = activeAiEnabled && agentSettings?.activeAi?.nextCommand !== false;
  const promptSuggestionsEnabled = activeAiEnabled && agentSettings?.activeAi?.promptSuggestions !== false;
  const autodetectEnabled = activeAiEnabled &&
    store.terminalAutoDetectEnabled &&
    agentSettings?.input?.autodetectTerminalCommandsInAgent !== false &&
    !isNaturalLanguageDenylisted(queryWithoutActivator, agentSettings?.input?.naturalLanguageDenylist);
  const intelligenceTerminalBlocks = isTerminalSurface ? terminalCommandBlocks : agentTerminalCommandBlocks;
  const terminalSurfaceCwd = terminal.cwd ?? workingDirectory.currentPath;
  const activeMessages = isTerminalSurface
    ? []
    : chat.messages.filter((message: any) => !(message.role === 'tool' && message.toolKind === 'web-search'));

  const composerIntelligenceContextKey = useMemo(() => {
    return isTerminalSurface
      ? `terminal:${terminal.sessionId ?? 'local'}:${terminalSurfaceCwd ?? ''}`
      : `composer:${resolvedConversationId ?? 'none'}:${agentTerminal.sessionId ?? 'local'}:${workingDirectory.currentPath ?? ''}`;
  }, [isTerminalSurface, terminal.sessionId, terminalSurfaceCwd, workingDirectory.currentPath, resolvedConversationId, agentTerminal.sessionId]);

  const composerIntelligence = Hooks.useComposerIntelligence({
    contextKey: composerIntelligenceContextKey,
    query: queryWithoutActivator,
    cwd: isTerminalSurface ? terminalSurfaceCwd : workingDirectory.currentPath,
    sessionId: isTerminalSurface ? terminal.sessionId : agentTerminal.sessionId,
    gitBranch: gitContext.gitContext?.currentBranch ?? null,
    availableCommands: availableShellCommands,
    historyEntries: commandHistory,
    terminalBlocks: intelligenceTerminalBlocks,
    messages: activeMessages,
    lockedMode: store.modeLock,
    autodetectEnabled,
    allowSingleCharacterPrediction: store.allowSingleCharacterCommandPrediction,
    forceShellMode: isTerminalSurface,
    enableZeroStatePrediction: isTerminalSurface && nextCommandEnabled,
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

  const getCompletionPrediction = (q: string, completions: any[]) => {
    if (!completions || completions.length === 0) return null;
    const firstCompletion = completions[0].name;
    const tokens = q.split(/\s+/);
    const lastToken = tokens[tokens.length - 1] ?? '';
    if (lastToken && firstCompletion.startsWith(lastToken)) {
      const suffix = firstCompletion.slice(lastToken.length);
      return {
        fullCommand: q + suffix,
        completionText: suffix,
        hint: 'Tab or Right Arrow to accept'
      };
    }
    return null;
  };

  const completionState = isTerminalSurface ? terminal.completionState : agentTerminal.completionState;
  const rawPrediction = composerMode === 'shell' && nextCommandEnabled ? composerIntelligence.prediction : null;
  const activeShellPrediction = rawPrediction || (completionState?.completions ? getCompletionPrediction(chat.query, completionState.completions) : null);

  const latestAssistantFollowUp = useMemo(() => {
    if (isTerminalSurface || !promptSuggestionsEnabled) return null;

    for (let index = activeMessages.length - 1; index >= 0; index -= 1) {
      const message = activeMessages[index];
      if (
        message?.role === 'assistant' &&
        !message.isError &&
        (isFollowUpSuggestionEligible(message.followUpSuggestion) || isFollowUpSuggestionEligible(Hooks.followUpSuggestionFromMessageBody(message.body)))
      ) {
        const followUpSuggestion = isFollowUpSuggestionEligible(message.followUpSuggestion)
          ? message.followUpSuggestion
          : Hooks.followUpSuggestionFromMessageBody(message.body);
        if (!isFollowUpSuggestionEligible(followUpSuggestion)) continue;

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
  }, [isTerminalSurface, promptSuggestionsEnabled, activeMessages]);

  const recommendedAction = useMemo(() => {
    if (isTerminalSurface || !promptSuggestionsEnabled) return null;
    return latestAssistantFollowUp ?? composerIntelligence.recommendedAction;
  }, [isTerminalSurface, promptSuggestionsEnabled, latestAssistantFollowUp, composerIntelligence.recommendedAction]);

  const terminalComposerAction = isTerminalSurface && nextCommandEnabled ? composerIntelligence.recommendedAction : null;

  // Sync effects from main hook
  useEffect(() => {
    if (!autodetectEnabled || store.modeLock !== null || chat.query.trim().length === 0) {
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
  }, [composerIntelligence.mode, composerIntelligence.shellSource, store.modeLock, chat.query, autodetectEnabled, store.autodetectedShellLatch, store.setAutodetectedShellLatch]);

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

function isFollowUpSuggestionEligible(
  suggestion: { value?: string; confidence?: number } | null | undefined
) {
  if (!suggestion?.value?.trim()) return false;
  if (typeof suggestion.confidence !== 'number') return true;
  return suggestion.confidence >= FOLLOW_UP_MIN_CONFIDENCE;
}

function isNaturalLanguageDenylisted(query: string, denylist?: string) {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery || !denylist?.trim()) return false;

  const firstToken = trimmedQuery.split(/\s+/)[0] ?? '';
  return denylist
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      if (entry.startsWith('/') && entry.endsWith('/') && entry.length > 2) {
        try {
          return new RegExp(entry.slice(1, -1), 'i').test(query);
        } catch {
          return false;
        }
      }

      const normalizedEntry = entry.toLowerCase();
      return firstToken === normalizedEntry || trimmedQuery.startsWith(`${normalizedEntry} `);
    });
}
