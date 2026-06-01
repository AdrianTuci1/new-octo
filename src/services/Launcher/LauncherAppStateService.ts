import type { StoreApi } from 'zustand/vanilla';
import type { AgentModelEntry, AgentModelSelection } from '../../stores/AgentStore';

/**
 * Manages Launcher-level app state: settings, models, context usage, and
 * current conversation ID.  Reads from two stores — the primary launcher
 * store and a secondary (memory) store — matching the pattern used by
 * the Agent service layer.
 */
export class LauncherAppStateService {
  constructor(
    private readonly store: StoreApi<any>,
    private readonly memoryStore: StoreApi<any>,
  ) {}

  // ── Settings ─────────────────────────────────────────────────────

  /**
   * Placeholder — loads global launcher settings.
   * Returns sensible defaults until real persistence is wired up.
   */
  loadSettings(): Record<string, unknown> {
    return {
      theme: 'system',
      startup: 'last-state',
      autoApproveAgentCommands: false,
    };
  }

  // ── Models ───────────────────────────────────────────────────────

  /**
   * Return the list of known default models.
   * These are the models available in the launcher tray without
   * requiring configuration of an external provider.
   */
  getModels(): AgentModelEntry[] {
    return [
      {
        id: 'auto',
        apiId: null,
        label: 'Auto',
        providerLabel: 'Auto',
        supportsAttachments: false,
      },
      {
        id: 'deepseek-v4-pro',
        apiId: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        providerLabel: 'DeepSeek',
        supportsAttachments: false,
      },
      {
        id: 'claude-sonnet-4-5',
        apiId: 'claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        providerLabel: 'Anthropic',
        supportsAttachments: true,
      },
      {
        id: 'gpt-5',
        apiId: 'gpt-5',
        label: 'GPT-5',
        providerLabel: 'OpenAI',
        supportsAttachments: true,
      },
    ];
  }

  /**
   * Persist the selected model ID into the primary store.
   * Delegates to setModelSelection if present, or writes directly
   * to a `selectedModelId` key otherwise.
   */
  selectModel(modelId: string): void {
    const state = this.store.getState();

    if (typeof state.setModelSelection === 'function') {
      state.setModelSelection((current: AgentModelSelection) => ({
        ...current,
        selectedModelId: modelId,
        selectedModelApiId:
          this.getModels().find((m) => m.id === modelId)?.apiId ?? null,
      }));
    } else if (typeof state.setSelectedModelId === 'function') {
      state.setSelectedModelId(modelId);
    }
  }

  // ── Context usage ────────────────────────────────────────────────

  /**
   * Return a static context-usage snapshot.
   * When the backend exposes real token-usage data this method
   * will be taught to read it from the memory store instead.
   */
  getContextUsage(): { used: number; total: number } {
    return { used: 0, total: 128_000 };
  }

  // ── Conversation ─────────────────────────────────────────────────

  /**
   * Return the ID of the currently-active conversation.
   * Falls back to null when no conversation is linked.
   */
  getConversationId(): string | null {
    return this.store.getState().activeConversationId ?? null;
  }
}
