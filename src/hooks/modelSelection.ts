import { useEffect } from 'react';
import { useModelSelectionStore } from '../stores/modelSelectionStore';
import { ModelSelectionService } from '../services/Model/ModelSelectionService';

export function useModelSelection() {
  const models = useModelSelectionStore((s) => s.models);
  const selectedModel = useModelSelectionStore((s) => s.selectedModel);
  const selectedModelId = useModelSelectionStore((s) => s.selectedModelId);
  const selectedModelApiId = useModelSelectionStore((s) => s.selectedModelApiId);
  const selectedModelLabel = useModelSelectionStore((s) => s.selectedModelLabel);
  const selectedModelSupportsAttachments = useModelSelectionStore((s) => s.selectedModelSupportsAttachments);
  const isConfigured = useModelSelectionStore((s) => s.isConfigured);
  const isProviderStatusLoaded = useModelSelectionStore((s) => s.isProviderStatusLoaded);
  const requiresModelSetup = useModelSelectionStore((s) => s.requiresModelSetup);
  const sourceStatuses = useModelSelectionStore((s) => s.sourceStatuses);

  useEffect(() => {
    void ModelSelectionService.getInstance().load();
  }, []);

  const selectModel = (modelId: string) => {
    void ModelSelectionService.getInstance().selectModel(modelId);
  };

  return {
    models,
    selectedModel,
    selectedModelId,
    selectedModelApiId,
    selectedModelLabel,
    selectedModelSupportsAttachments,
    isConfigured,
    isProviderStatusLoaded,
    requiresModelSetup,
    sourceStatuses,
    selectModel,
  };
}
