import { create } from 'zustand';
import type { AgentModelSourceStatus, AgentProviderStatus } from '../types/chat';
import type { ModelSpec } from '../types/model';

export type ModelSelectionState = {
  selectedModelId: string | null;
  providerStatus: AgentProviderStatus | null;
  sourceStatuses: AgentModelSourceStatus[];
  isProviderStatusLoaded: boolean;
  models: ModelSpec[];
  selectedModel: ModelSpec | null;
  selectedModelApiId: string | null;
  selectedModelLabel: string;
  selectedModelSupportsAttachments: boolean;
  isConfigured: boolean;
  requiresModelSetup: boolean;
};

export type ModelSelectionActions = {
  setProviderData: (
    providerStatus: AgentProviderStatus | null,
    sourceStatuses: AgentModelSourceStatus[],
    models: ModelSpec[],
    viewModel: {
      selectedModelId: string | null;
      selectedModel: ModelSpec | null;
      selectedModelApiId: string | null;
      selectedModelLabel: string;
      selectedModelSupportsAttachments: boolean;
      isConfigured: boolean;
      requiresModelSetup: boolean;
    }
  ) => void;
  setSelectedModelId: (modelId: string | null) => void;
};

export const useModelSelectionStore = create<ModelSelectionState & ModelSelectionActions>((set) => ({
  selectedModelId: null,
  providerStatus: null,
  sourceStatuses: [],
  isProviderStatusLoaded: false,
  models: [],
  selectedModel: null,
  selectedModelApiId: null,
  selectedModelLabel: "You don't have any model",
  selectedModelSupportsAttachments: false,
  isConfigured: false,
  requiresModelSetup: false,

  setProviderData: (providerStatus, sourceStatuses, models, vm) =>
    set({
      providerStatus,
      sourceStatuses,
      models,
      isProviderStatusLoaded: true,
      selectedModelId: vm.selectedModelId,
      selectedModel: vm.selectedModel,
      selectedModelApiId: vm.selectedModelApiId,
      selectedModelLabel: vm.selectedModelLabel,
      selectedModelSupportsAttachments: vm.selectedModelSupportsAttachments,
      isConfigured: vm.isConfigured,
      requiresModelSetup: vm.requiresModelSetup,
    }),

  setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
}));
