import type { StoreApi } from 'zustand/vanilla';
import type { AgentModelSelection, AgentModelEntry, AgentState } from '../../stores/AgentStore';
import type { MemoryStoreState } from '../../stores/memoryStore';

/**
 * Manages model list, selection, and profile-based model resolution.
 * Reads model data from the memory store settings.
 */
export class AgentModelService {
  constructor(
    private readonly store: StoreApi<AgentState>,
    private readonly memoryStore: StoreApi<MemoryStoreState>,
  ) {}

  get modelSelection(): AgentModelSelection {
    return this.store.getState().modelSelection;
  }

  get selectedModelId(): string | null {
    return this.store.getState().modelSelection.selectedModelId;
  }

  get models(): AgentModelEntry[] {
    return this.store.getState().modelSelection.models;
  }

  get requiresModelSetup(): boolean {
    return this.store.getState().modelSelection.requiresModelSetup;
  }

  get isConfigured(): boolean {
    return this.store.getState().modelSelection.isConfigured;
  }

  /**
   * Resolve the profile base model ID.
   * Falls back to the selected model API ID if profile model is "auto" or empty.
   */
  resolveProfileModelId(
    profileModel: string | null | undefined,
    fallback: string | null,
  ): string | null {
    const value = profileModel?.trim();
    if (!value || value.toLowerCase() === 'auto') {
      return fallback;
    }
    return value;
  }
}
