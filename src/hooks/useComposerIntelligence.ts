import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

type BackendPrediction = {
  suggestion: string;
  suggestions: string[];
  kind: string;
};

type BackendRecommendedAction = {
  id: string;
  label: string;
  value: string;
  description: string;
  mode: ComposerMode;
};

type BackendResponse = {
  mode: ComposerMode;
  shellSource: ShellModeSource | null;
  prediction: BackendPrediction | null;
  recommendedAction: BackendRecommendedAction | null;
};

type BackendGhostPrediction = {
  input: string;
  suggestion: string;
  confidence: number;
  kind: string;
};

const DEFAULT_RESPONSE: BackendResponse = {
  mode: 'chat',
  shellSource: null,
  prediction: null,
  recommendedAction: null
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

    return {
      fullCommand: activePredictionSuggestion,
      completionText: activePredictionSuggestion.slice(query.length),
      hint: (response.prediction?.suggestions?.length ?? 0) > 1
        ? 'Tab, Right Arrow, or Down Arrow to accept'
        : 'Tab or Right Arrow to accept'
    };
  }, [activePredictionSuggestion, query.length, response.prediction?.suggestions?.length]);

  useEffect(() => {
    setSelectedPredictionIndex(0);
  }, [contextKey, cwd, terminalBlocks.length]);

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
                    suggestions: [nextPrediction.suggestion],
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

      void invoke<BackendResponse>('terminal_get_composer_intelligence', {
        request: {
          contextKey,
          query,
          cwd,
          gitBranch,
          availableCommands,
          historyEntries,
          terminalBlocks: terminalBlocks.map((block) => ({
            command: block.command,
            output: block.output,
            exitCode: block.exitCode ?? null,
            status: block.status
          })),
          messages: messages.map((message) => ({
            role: message.role,
            body: message.body
          })),
          lockedMode,
          autodetectEnabled,
          allowSingleCharacterPrediction,
          forceShellMode,
          enableZeroStatePrediction,
          surface
        }
      })
        .then((nextResponse) => {
          if (generationRef.current !== generation) {
            return;
          }

          setResponse(nextResponse);
          setSelectedPredictionIndex(0);
        })
        .catch(() => {
          if (generationRef.current !== generation) {
            return;
          }

          setResponse((current) => ({
            ...current,
            prediction: null,
            recommendedAction: query.trim().length === 0 ? current.recommendedAction : null
          }));
        });
    }, query.trim().length === 0 ? 50 : 90);

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
    messages,
    query,
    surface,
    terminalBlocks
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
