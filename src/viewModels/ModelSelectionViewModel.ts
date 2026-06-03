import type { ModelSpec } from '../types/model';

/**
 * ModelSelectionViewModel
 * ───────────────────────────────────────────
 * Pattern: **ViewModel** (MVVM — read-only projection of model selection state)
 * Resolves selected model from a list; all fields are readonly derivations.
 */
export class ModelSelectionViewModel {
  readonly models: ModelSpec[];
  readonly selectedModelId: string | null;
  readonly selectedModel: ModelSpec | null;
  readonly selectedModelApiId: string | null;
  readonly selectedModelLabel: string;
  readonly selectedModelSupportsAttachments: boolean;
  readonly isConfigured: boolean;
  readonly isProviderStatusLoaded: boolean;
  readonly requiresModelSetup: boolean;

  constructor(models: ModelSpec[], selectedModelId: string | null, isProviderStatusLoaded: boolean) {
    const resolvedId = selectedModelId ?? models[0]?.id ?? null;
    const selectedModel = models.find((m) => m.id === resolvedId) ?? null;
    this.models = models;
    this.isProviderStatusLoaded = isProviderStatusLoaded;
    this.isConfigured = isProviderStatusLoaded && models.length > 0;
    this.requiresModelSetup = isProviderStatusLoaded && models.length === 0;
    this.selectedModelId = resolvedId;
    this.selectedModel = selectedModel;
    this.selectedModelApiId = selectedModel?.modelId ?? selectedModel?.id ?? null;
    this.selectedModelLabel = selectedModel?.label ?? "You don't have any model";
    this.selectedModelSupportsAttachments = selectedModel?.supportsAttachments ?? false;
  }
}
