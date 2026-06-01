import type { StoreApi } from 'zustand/vanilla';
import { consumeShellModeActivator, isImmediateShellCommandCandidate } from '../../lib';
import type { ChatMessage } from '../../types/chat';
import type { ComposerMode } from '../../types/ui';

export interface ChatStoreState {
  query: string;
  messages: ChatMessage[];
  modeLock: ComposerMode | null;
  autodetectedShellLatch: boolean;
  setQuery: (query: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setModeLock: (mode: ComposerMode | null) => void;
  setAutodetectedShellLatch: (latch: boolean) => void;
}

/**
 * Provides composer intelligence for the Launcher surface — mode detection,
 * shell activator checking, and prediction/recommendation stubs.
 */
export class LauncherComposerService {
  constructor(private readonly store: StoreApi<ChatStoreState>) {}

  /**
   * Detect the composer mode based on context.
   * - Terminal surfaces always return 'shell'.
   * - If a modeLock is active, honor it.
   * - Otherwise, default to 'auto'.
   */
  detectMode(
    _query: string,
    modeLock: ComposerMode | null,
    isTerminal: boolean,
  ): 'auto' | 'shell' | 'chat' {
    if (isTerminal) return 'shell';
    if (modeLock) return modeLock;
    return 'auto';
  }

  /**
   * Check if the query contains a shell mode activator prefix ('!' or '$').
   */
  hasShellActivator(query: string): boolean {
    return consumeShellModeActivator(query).consumed;
  }

  /**
   * Check if the query is an immediate shell command candidate.
   */
  isImmediateShellCandidate(query: string, commands: string[]): boolean {
    return isImmediateShellCommandCandidate(query, commands);
  }

  /**
   * Get a shell prediction for the given query. Placeholder — returns null.
   */
  getPrediction(_query: string, _modelId: string | null): null {
    return null;
  }

  /**
   * Get a recommended follow-up action. Placeholder — returns null.
   */
  getRecommendedAction(_messages: ChatMessage[]): null {
    return null;
  }
}
