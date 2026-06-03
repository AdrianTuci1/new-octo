import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ComposerIntelligenceService, DEFAULT_RESPONSE } from '../services/Terminal/ComposerIntelligenceService';
import type { BackendPrediction, BackendResponse } from '../services/Terminal/ComposerIntelligenceService';
import type { RecommendedComposerAction, ShellPrediction } from '../lib/composerIntelligence';
import type { ChatMessage } from '../types/chat';
import type { ShellHistoryEntry } from '../types/history';
import type { TerminalCommandBlock } from '../types/terminal';
import type { ComposerMode, ShellModeSource } from '../types/ui';

type ComposerIntelligenceOptions = {
  contextKey: string;
  query: string;
  cwd: string | null;
  sessionId?: string | null;
  gitBranch?: string | null;
  availableCommands: string[];
  historyEntries: ShellHistoryEntry[];
  terminalBlocks: TerminalCommandBlock[];
  messages: ChatMessage[];
  lockedMode: ComposerMode | null;
  autodetectEnabled: boolean;
  allowSingleCharacterPrediction: boolean;
  forceShellMode: boolean;
  enableZeroStatePrediction: boolean;
  surface: 'terminal' | 'composerBar';
};

type BackendRecommendedAction = {
  id: string;
  label: string;
  value: string;
  description: string;
  mode: ComposerMode;
};

type BackendGhostPrediction = {
  input: string;
  suggestion: string;
  suggestions?: string[];
  confidence: number;
  kind: string;
};

export function useComposerIntelligence(options: ComposerIntelligenceOptions) {
  const {
    contextKey,
    query,
    cwd,
    sessionId = null,
    gitBranch = null,
    availableCommands,
    historyEntries,
    terminalBlocks,
    messages,
    lockedMode,
    autodetectEnabled,
    allowSingleCharacterPrediction,
    forceShellMode,
    enableZeroStatePrediction,
    surface
  } = options;
  const [response, setResponse] = useState<BackendResponse>(forceShellMode ? {
    ...DEFAULT_RESPONSE,
    mode: 'shell',
    shellSource: 'manual'
  } : DEFAULT_RESPONSE);
  const [selectedPredictionIndex, setSelectedPredictionIndex] = useState(0);
  const generationRef = useRef(0);
  const trimmedQuery = query.trim();

  useEffect(() => {
    generationRef.current += 1;
    setSelectedPredictionIndex(0);
    setResponse(forceShellMode ? {
      ...DEFAULT_RESPONSE,
      mode: 'shell',
      shellSource: 'manual'
    } : DEFAULT_RESPONSE);
  }, [contextKey, forceShellMode, surface]);

  const activePredictionSuggestion = useMemo(() => {
    const suggestions = response.prediction?.suggestions ?? [];
    if (!suggestions.length) {
      return response.prediction?.suggestion ?? null;
    }

    return suggestions[Math.min(selectedPredictionIndex, suggestions.length - 1)] ?? suggestions[0] ?? null;
  }, [response.prediction, selectedPredictionIndex]);

  const prediction = useMemo<ShellPrediction | null>(() => {
    if (!activePredictionSuggestion) {
      return null;
    }

    if (surface === 'composerBar' && trimmedQuery.length === 0) {
      return null;
    }

    if (!activePredictionSuggestion.startsWith(query) || activePredictionSuggestion.length <= query.length) {
      return null;
    }

    return {
      fullCommand: activePredictionSuggestion,
      completionText: activePredictionSuggestion.slice(query.length),
      suggestions: response.prediction?.suggestions ?? [activePredictionSuggestion],
      hint: (response.prediction?.suggestions?.length ?? 0) > 1
        ? 'Tab, Right Arrow, or Down Arrow to accept'
        : 'Tab or Right Arrow to accept'
    };
  }, [activePredictionSuggestion, query, trimmedQuery.length, response.prediction?.suggestions, surface]);

  useEffect(() => {
    setSelectedPredictionIndex(0);
  }, [contextKey, cwd, terminalBlocks.length]);

  const compactMessages = useMemo(() => ComposerIntelligenceService.compactMessages(messages), [messages]);
  const compactTerminalBlocks = useMemo(() => ComposerIntelligenceService.compactTerminalBlocks(terminalBlocks), [terminalBlocks]);
  const shouldRequestComposerGhostPrediction = useMemo(() => (
    surface === 'composerBar'
      && trimmedQuery.length > 0
      && !query.trimStart().startsWith('/')
      && (forceShellMode || lockedMode === 'shell' || autodetectEnabled)
  ), [autodetectEnabled, forceShellMode, lockedMode, query, surface, trimmedQuery.length]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    const timer = window.setTimeout(() => {
      if (surface === 'terminal') {
        void invoke<BackendGhostPrediction | null>('terminal_get_prediction', {
          request: {
            sessionId,
            input: query,
            cwd,
            availableCommands
          }
        })
          .then((nextPrediction) => {
            if (generationRef.current !== generation) {
              return;
            }

            setResponse({
              mode: 'shell',
              shellSource: 'manual',
              prediction: nextPrediction
                ? {
                    suggestion: nextPrediction.suggestion,
                    suggestions: ComposerIntelligenceService.normalizeGhostSuggestions(nextPrediction),
                    kind: nextPrediction.kind
                  }
                : null,
              recommendedAction: null
            });
            setSelectedPredictionIndex(0);
          })
          .catch(() => {
            if (generationRef.current !== generation) {
              return;
            }

            setResponse({
              mode: 'shell',
              shellSource: 'manual',
              prediction: null,
              recommendedAction: null
            });
          });
        return;
      }

      const composerIntelligenceRequest = {
        contextKey,
        query,
        cwd,
        gitBranch,
        availableCommands,
        historyEntries,
        terminalBlocks: compactTerminalBlocks,
        messages: compactMessages,
        lockedMode,
        autodetectEnabled,
        allowSingleCharacterPrediction,
        forceShellMode,
        enableZeroStatePrediction,
        surface
      };

      const composerIntelligencePromise = invoke<BackendResponse>('terminal_get_composer_intelligence', {
        request: composerIntelligenceRequest
      });
      const composerGhostPromise = shouldRequestComposerGhostPrediction
        ? invoke<BackendGhostPrediction | null>('terminal_get_prediction', {
            request: {
              sessionId,
              input: query,
              cwd,
              availableCommands
            }
          }).catch(() => null)
        : Promise.resolve(null);

      void Promise.all([composerIntelligencePromise, composerGhostPromise])
        .then(([nextResponse, nextGhostPrediction]) => {
          if (generationRef.current !== generation) {
            return;
          }

          setResponse({
            ...nextResponse,
            prediction: nextGhostPrediction
              ? {
                  suggestion: nextGhostPrediction.suggestion,
                  suggestions: ComposerIntelligenceService.normalizeGhostSuggestions(nextGhostPrediction),
                  kind: nextGhostPrediction.kind
                }
              : nextResponse.prediction
          });
          setSelectedPredictionIndex(0);
        })
        .catch(() => {
          if (generationRef.current !== generation) {
            return;
          }

          setResponse((current) => ({
            ...current,
            prediction: null,
            recommendedAction: trimmedQuery.length === 0 ? current.recommendedAction : null
          }));
        });
    }, trimmedQuery.length === 0 ? 50 : 90);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    allowSingleCharacterPrediction,
    autodetectEnabled,
    availableCommands,
    contextKey,
    cwd,
    gitBranch,
    enableZeroStatePrediction,
    forceShellMode,
    historyEntries,
    lockedMode,
    compactMessages,
    query,
    trimmedQuery.length,
    sessionId,
    surface,
    shouldRequestComposerGhostPrediction,
    compactTerminalBlocks
  ]);

  useEffect(() => {
    setSelectedPredictionIndex((currentIndex) => {
      const maxIndex = Math.max(0, (response.prediction?.suggestions.length ?? 1) - 1);
      return Math.min(currentIndex, maxIndex);
    });
  }, [response.prediction?.suggestions.length]);

  return {
    mode: response.mode,
    shellSource: response.shellSource,
    prediction,
    recommendedAction: response.recommendedAction,
    cyclePrediction: () => {
      const count = response.prediction?.suggestions.length ?? 0;
      if (count <= 1) {
        return;
      }

      setSelectedPredictionIndex((currentIndex) => (currentIndex + 1) % count);
    }
  };
}
