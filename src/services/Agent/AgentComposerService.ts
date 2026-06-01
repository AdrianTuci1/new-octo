import { invoke } from '@tauri-apps/api/core';
import type { StoreApi } from 'zustand/vanilla';
import type { AgentState } from '../../stores/AgentStore';
import type { ComposerMode, ShellModeSource } from '../../types/ui';
import type { ChatMessage } from '../../types/chat';
import type { TerminalCommandBlock } from '../../types/terminal';
import type { ShellHistoryEntry } from '../../types/history';

export interface ShellPrediction {
  fullCommand: string;
  completionText: string;
  suggestions: string[];
  hint: string;
}

export interface RecommendedComposerAction {
  id: string;
  label: string;
  value: string;
  description: string;
  mode: ComposerMode;
}

type BackendResponse = {
  mode: ComposerMode;
  shellSource: ShellModeSource | null;
  prediction: { suggestion: string; suggestions: string[]; kind: string } | null;
  recommendedAction: RecommendedComposerAction | null;
};

type BackendGhostPrediction = {
  input: string;
  suggestion: string;
  suggestions?: string[];
  confidence: number;
  kind: string;
};

const DEFAULT_RESPONSE: BackendResponse = {
  mode: 'chat',
  shellSource: null,
  prediction: null,
  recommendedAction: null,
};

const MAX_INTELLIGENCE_MESSAGES = 8;
const MAX_INTELLIGENCE_MESSAGE_BODY_CHARS = 1_500;
const MAX_INTELLIGENCE_TERMINAL_BLOCKS = 5;
const MAX_INTELLIGENCE_TERMINAL_OUTPUT_HEAD_CHARS = 1_200;
const MAX_INTELLIGENCE_TERMINAL_OUTPUT_TAIL_CHARS = 1_200;

/**
 * Manages composer mode autodetect, shell latch, predictions, and follow-up suggestions.
 */
export class AgentComposerService {
  private generation = 0;
  private response: BackendResponse = { ...DEFAULT_RESPONSE };
  private selectedPredictionIndex = 0;
  private predictionTimer: number | null = null;

  constructor(private readonly store: StoreApi<AgentState>) {}

  // ── Read ─────────────────────────────────────────────────────────

  get mode(): ComposerMode {
    return this.response.mode;
  }

  get shellSource(): ShellModeSource | null {
    return this.response.shellSource;
  }

  get prediction(): ShellPrediction | null {
    const activeSuggestion = this.activePredictionSuggestion();
    if (!activeSuggestion) return null;

    const query = this.store.getState().query;
    if (!activeSuggestion.startsWith(query) || activeSuggestion.length <= query.length) {
      return null;
    }

    return {
      fullCommand: activeSuggestion,
      completionText: activeSuggestion.slice(query.length),
      suggestions: this.response.prediction?.suggestions ?? [activeSuggestion],
      hint: (this.response.prediction?.suggestions?.length ?? 0) > 1
        ? 'Tab, Right Arrow, or Down Arrow to accept'
        : 'Tab or Right Arrow to accept',
    };
  }

  get recommendedAction(): RecommendedComposerAction | null {
    return this.response.recommendedAction;
  }

  private activePredictionSuggestion(): string | null {
    const suggestions = this.response.prediction?.suggestions ?? [];
    if (!suggestions.length) {
      return this.response.prediction?.suggestion ?? null;
    }
    return suggestions[Math.min(this.selectedPredictionIndex, suggestions.length - 1)] ?? suggestions[0] ?? null;
  }

  cyclePrediction(): void {
    const count = this.response.prediction?.suggestions.length ?? 0;
    if (count <= 1) return;
    this.selectedPredictionIndex = (this.selectedPredictionIndex + 1) % count;
    this.store.getState().setQuery((q) => q); // trigger re-render
  }

  reset(): void {
    this.generation += 1;
    this.selectedPredictionIndex = 0;
    this.response = { ...DEFAULT_RESPONSE };
  }

  /** Request composer intelligence from the backend */
  request(params: {
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
  }): void {
    const generation = this.generation + 1;
    this.generation = generation;
    this.selectedPredictionIndex = 0;

    const trimmedQuery = params.query.trim();
    const forceShell = params.forceShellMode;
    const surface = params.surface;

    if (forceShell) {
      this.response = { ...DEFAULT_RESPONSE, mode: 'shell', shellSource: 'manual' };
    } else {
      this.response = { ...DEFAULT_RESPONSE };
    }

    if (this.predictionTimer !== null) {
      clearTimeout(this.predictionTimer);
    }

    this.predictionTimer = window.setTimeout(() => {
      if (surface === 'terminal') {
        this.requestTerminalPrediction(generation, {
          sessionId: params.sessionId,
          query: params.query,
          cwd: params.cwd,
          availableCommands: params.availableCommands,
        });
        return;
      }
      this.requestComposerPrediction(generation, params as Parameters<typeof this.requestComposerPrediction>[1]);
    }, trimmedQuery.length === 0 ? 50 : 90);
  }

  private async requestTerminalPrediction(
    generation: number,
    params: { sessionId?: string | null; query: string; cwd: string | null; availableCommands: string[] },
  ): Promise<void> {
    try {
      const nextPrediction = await invoke<BackendGhostPrediction | null>('terminal_get_prediction', {
        request: {
          sessionId: params.sessionId,
          input: params.query,
          cwd: params.cwd,
          availableCommands: params.availableCommands,
        },
      });
      if (this.generation !== generation) return;

      this.response = {
        mode: 'shell',
        shellSource: 'manual',
        prediction: nextPrediction
          ? {
              suggestion: nextPrediction.suggestion,
              suggestions: normalizeGhostSuggestions(nextPrediction),
              kind: nextPrediction.kind,
            }
          : null,
        recommendedAction: null,
      };
      this.selectedPredictionIndex = 0;
    } catch {
      if (this.generation !== generation) return;
      this.response = { mode: 'shell', shellSource: 'manual', prediction: null, recommendedAction: null };
    }
  }

  private async requestComposerPrediction(
    generation: number,
    params: {
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
      surface: 'composerBar';
    },
  ): Promise<void> {
    const compactMessages = params.messages.slice(-MAX_INTELLIGENCE_MESSAGES).map((m) => ({
      role: m.role,
      body: compactText(m.body, MAX_INTELLIGENCE_MESSAGE_BODY_CHARS),
    }));
    const compactTerminalBlocks = params.terminalBlocks.slice(-MAX_INTELLIGENCE_TERMINAL_BLOCKS).map((b) => ({
      command: b.command,
      output: compactTerminalOutput(b.output),
      exitCode: b.exitCode ?? null,
      status: b.status,
    }));

    const request = {
      contextKey: params.contextKey,
      query: params.query,
      cwd: params.cwd,
      gitBranch: params.gitBranch,
      availableCommands: params.availableCommands,
      historyEntries: params.historyEntries,
      terminalBlocks: compactTerminalBlocks,
      messages: compactMessages,
      lockedMode: params.lockedMode,
      autodetectEnabled: params.autodetectEnabled,
      allowSingleCharacterPrediction: params.allowSingleCharacterPrediction,
      forceShellMode: params.forceShellMode,
      enableZeroStatePrediction: params.enableZeroStatePrediction,
      surface: params.surface,
    };

    const shouldGhost = params.surface === 'composerBar'
      && params.query.trim().length > 0
      && !params.query.trimStart().startsWith('/')
      && (params.forceShellMode || params.lockedMode === 'shell' || params.autodetectEnabled);

    try {
      const [nextResponse, ghostPrediction] = await Promise.all([
        invoke<BackendResponse>('terminal_get_composer_intelligence', { request }),
        shouldGhost
          ? invoke<BackendGhostPrediction | null>('terminal_get_prediction', {
              request: { sessionId: params.sessionId, input: params.query, cwd: params.cwd, availableCommands: params.availableCommands },
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (this.generation !== generation) return;

      this.response = {
        ...nextResponse,
        prediction: ghostPrediction
          ? { suggestion: ghostPrediction.suggestion, suggestions: normalizeGhostSuggestions(ghostPrediction), kind: ghostPrediction.kind }
          : nextResponse.prediction,
      };
      this.selectedPredictionIndex = 0;
    } catch {
      if (this.generation !== generation) return;
      this.response = {
        ...this.response,
        prediction: null,
        recommendedAction: params.query.trim().length === 0 ? this.response.recommendedAction : null,
      };
    }
  }

  cleanup(): void {
    if (this.predictionTimer !== null) {
      clearTimeout(this.predictionTimer);
      this.predictionTimer = null;
    }
  }
}

function normalizeGhostSuggestions(prediction: BackendGhostPrediction): string[] {
  const seen = new Set<string>();
  const suggestions = [prediction.suggestion, ...(prediction.suggestions ?? [])]
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  return suggestions.length > 0 ? suggestions : [prediction.suggestion];
}

function compactText(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}\n…`;
}

function compactTerminalOutput(output?: string | null): string {
  const normalized = (output ?? '').trim();
  if (normalized.length <= MAX_INTELLIGENCE_TERMINAL_OUTPUT_HEAD_CHARS + MAX_INTELLIGENCE_TERMINAL_OUTPUT_TAIL_CHARS) {
    return normalized;
  }
  const head = normalized.slice(0, MAX_INTELLIGENCE_TERMINAL_OUTPUT_HEAD_CHARS).trimEnd();
  const tail = normalized.slice(Math.max(0, normalized.length - MAX_INTELLIGENCE_TERMINAL_OUTPUT_TAIL_CHARS)).trimStart();
  return `${head}\n…\n${tail}`;
}
