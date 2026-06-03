import { invoke } from '@tauri-apps/api/core';
import type { ChatMessage } from '../../types/chat';
import type { ShellHistoryEntry } from '../../types/history';
import type { ComposerMode, ShellModeSource } from '../../types/ui';

export type BackendPrediction = { suggestion: string; suggestions: string[]; kind: string };
export type BackendRecommendedAction = { id: string; label: string; value: string; description: string; mode: ComposerMode };
export type BackendResponse = { mode: ComposerMode; shellSource: ShellModeSource | null; prediction: BackendPrediction | null; recommendedAction: BackendRecommendedAction | null };
type BackendGhostPrediction = { input: string; suggestion: string; suggestions?: string[]; confidence: number; kind: string };

export const DEFAULT_RESPONSE: BackendResponse = { mode: 'chat', shellSource: null, prediction: null, recommendedAction: null };

const MAX_MSG = 8, MAX_MSG_CHARS = 1500, MAX_BLOCKS = 5, MAX_OUTPUT_HEAD = 1200, MAX_OUTPUT_TAIL = 1200;

export type ComposerIntelligenceRequest = {
  contextKey: string; query: string; cwd: string | null; sessionId?: string | null;
  gitBranch?: string | null; availableCommands: string[]; historyEntries: ShellHistoryEntry[];
  terminalBlocks: any[]; messages: ChatMessage[]; lockedMode: ComposerMode | null;
  autodetectEnabled: boolean; allowSingleCharacterPrediction: boolean;
  forceShellMode: boolean; enableZeroStatePrediction: boolean; surface: 'terminal' | 'composerBar';
};

/**
 * ComposerIntelligenceService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Adapter** (bridges frontend data → backend composer intelligence API)
 * Generational tracking prevents stale responses; static methods compact chat history & terminal blocks.
 */
export class ComposerIntelligenceService {
  private generation = 0;

  nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  getGeneration(): number { return this.generation; }

  async fetchTerminalPrediction(sessionId: string | null, input: string, cwd: string | null, availableCommands: string[]): Promise<BackendGhostPrediction | null> {
    return invoke<BackendGhostPrediction | null>('terminal_get_prediction', { request: { sessionId, input, cwd, availableCommands } }).catch(() => null);
  }

  async fetchComposerIntelligence(request: ComposerIntelligenceRequest): Promise<BackendResponse> {
    return invoke<BackendResponse>('terminal_get_composer_intelligence', { request });
  }

  static compactMessages(messages: ChatMessage[]) {
    return messages.slice(-MAX_MSG).map((m) => ({ role: m.role, body: compactText(m.body, MAX_MSG_CHARS) }));
  }

  static compactTerminalBlocks(terminalBlocks: any[]) {
    return terminalBlocks.slice(-MAX_BLOCKS).map((b) => ({
      command: b.command, output: compactTerminalOutput(b.output),
      exitCode: b.exitCode ?? null, status: b.status,
    }));
  }

  static normalizeGhostSuggestions(prediction: BackendGhostPrediction): string[] {
    const seen = new Set<string>();
    return [prediction.suggestion, ...(prediction.suggestions ?? [])]
      .map((s) => s.trim())
      .filter((s) => { if (!s || seen.has(s)) return false; seen.add(s); return true; });
  }

  static getInstance(): ComposerIntelligenceService {
    if (!instance) instance = new ComposerIntelligenceService();
    return instance;
  }
}

function compactText(v: string, max: number) {
  const t = v.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}\n…`;
}

function compactTerminalOutput(o?: string | null) {
  const n = (o ?? '').trim();
  return n.length <= MAX_OUTPUT_HEAD + MAX_OUTPUT_TAIL
    ? n
    : `${n.slice(0, MAX_OUTPUT_HEAD).trimEnd()}\n…\n${n.slice(Math.max(0, n.length - MAX_OUTPUT_TAIL)).trimStart()}`;
}

let instance: ComposerIntelligenceService | null = null;
