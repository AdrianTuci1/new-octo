import { invoke } from '@tauri-apps/api/core';
import { getModelProviderPreset, inferModelProviderId } from '../../lib/modelProviders';
import { useMemoryStore } from '../../stores/memoryStore';
import { useModelSelectionStore } from '../../stores/modelSelectionStore';
import { ModelSelectionViewModel } from '../../viewModels/ModelSelectionViewModel';
import type { AgentModelSourceStatus, AgentProviderStatus } from '../../types/chat';
import type { ModelSpec } from '../../types/model';

const STORAGE_KEY = 'octomus.selectedModelId';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

type ConfiguredModelRecord = {
  id?: unknown;
  modelId?: unknown;
  friendlyName?: unknown;
  baseUrl?: unknown;
  providerId?: unknown;
  providerLabel?: unknown;
  supportsAttachments?: unknown;
};

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * ModelSelectionService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Facade** (orchestrates Zustand stores + Tauri backend)
 * Loads provider status, model sources, and configured models; resolves the active model.
 */
export class ModelSelectionService {
  private readonly memoryStore = useMemoryStore;
  private readonly store = useModelSelectionStore;
  private loaded = false;

  get memorySettings() {
    return this.memoryStore.getState().settings;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    const results = await Promise.all([
      invoke<AgentProviderStatus>('agent_provider_status').catch((error) => {
        console.warn('[model-selection] failed to load provider status', error);
        return null;
      }),
      invoke<AgentModelSourceStatus[]>('agent_list_model_sources').catch((error) => {
        console.warn('[model-selection] failed to load model sources', error);
        return [] as AgentModelSourceStatus[];
      }),
    ]);

    const [status, statuses] = results;

    let selectedModelId = this.store.getState().selectedModelId;
    if (!selectedModelId && typeof window !== 'undefined') {
      selectedModelId = window.localStorage.getItem(STORAGE_KEY);
    }
    if (
      status?.hasApiKey &&
      status.source !== 'environment' &&
      typeof window !== 'undefined' &&
      !window.localStorage.getItem(STORAGE_KEY) &&
      !this.memorySettings?.values.selectedModelId
    ) {
      selectedModelId = status.modelId ?? null;
    }
    const memoryModelId = this.memorySettings?.values.selectedModelId;
    if (typeof memoryModelId === 'string' && memoryModelId.trim().length > 0) {
      selectedModelId = memoryModelId;
    }

    const models = this.getAllModels(status, statuses);
    const resolvedModelId = this.resolveSelectedModelId(models, selectedModelId);
    const selectedModel = models.find((m) => m.id === resolvedModelId) ?? null;
    const vm = new ModelSelectionViewModel(models, resolvedModelId, true);

    this.store.getState().setProviderData(status, statuses, models, {
      selectedModelId: resolvedModelId,
      selectedModel,
      selectedModelApiId: selectedModel?.modelId ?? selectedModel?.id ?? null,
      selectedModelLabel: selectedModel?.label ?? "You don't have any model",
      selectedModelSupportsAttachments: selectedModel?.supportsAttachments ?? false,
      isConfigured: models.length > 0,
      requiresModelSetup: models.length === 0,
    });
    this.loaded = true;
  }

  syncFromMemory(): void {
    const memoryModelId = this.memorySettings?.values.selectedModelId;
    if (typeof memoryModelId === 'string' && memoryModelId.trim().length > 0) {
      this.store.getState().setSelectedModelId(memoryModelId);
    }
  }

  async selectModel(modelId: string): Promise<void> {
    this.store.getState().setSelectedModelId(modelId);
    await this.memoryStore.getState().saveSettings({ selectedModelId: modelId }, true);

    const configuredModel = (
      (this.memorySettings?.values.configuredModels as ConfiguredModelRecord[] | undefined) ?? []
    ).find((model) => readString(model.id) === modelId);

    if (configuredModel) {
      const nextProviderId = inferModelProviderId({
        providerId: configuredModel.providerId,
        providerLabel: configuredModel.providerLabel,
        baseUrl: configuredModel.baseUrl,
      });
      await invoke('agent_configure_openai_compatible', {
        request: {
          providerId: nextProviderId,
          apiKey: '',
          baseUrl: readString(configuredModel.baseUrl),
          modelId: readString(configuredModel.modelId),
        },
      }).catch((error) => {
        console.warn('[model-selection] failed to activate configured model', error);
      });
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, modelId);
    }
  }

  private getAllModels(
    providerStatus: AgentProviderStatus | null,
    sourceStatuses: AgentModelSourceStatus[]
  ): ModelSpec[] {
    const sourceModels = sourceStatuses
      .filter((s) => s.connected)
      .flatMap((s) =>
        s.models.map((m): ModelSpec => ({
          id: m.id, modelId: m.modelId, label: m.label,
          provider: m.provider, providerId: m.providerId ?? 'custom',
          baseUrl: null, note: m.note, supportsAttachments: m.supportsAttachments,
        }))
      );
    const configuredModels = this.buildConfiguredModels(providerStatus);
    const byId = new Map<string, ModelSpec>();
    [...sourceModels, ...configuredModels].forEach((m) => { if (!byId.has(m.id)) byId.set(m.id, m); });
    return Array.from(byId.values());
  }

  private resolveSelectedModelId(models: ModelSpec[], selectedModelId: string | null): string | null {
    if (models.some((m) => m.id === selectedModelId)) return selectedModelId;
    const memoryModelId = this.memorySettings?.values.selectedModelId;
    if (memoryModelId && models.some((m) => m.id === memoryModelId)) return memoryModelId;
    return models[0]?.id ?? null;
  }

  private buildConfiguredModels(providerStatus: AgentProviderStatus | null): ModelSpec[] {
    const models = (this.memorySettings?.values.configuredModels as ConfiguredModelRecord[] | undefined) ?? [];
    const normalized = models
      .map((model) => this.buildModelFromSettings(model, providerStatus))
      .filter((m): m is ModelSpec => Boolean(m));
    if (normalized.length > 0) return normalized;

    if (providerStatus?.hasApiKey && providerStatus.source !== 'environment' && providerStatus.modelId) {
      const legacyModel = this.buildModelFromSettings({
        id: providerStatus.modelId, modelId: providerStatus.modelId,
        providerId: providerStatus.providerId, providerLabel: providerStatus.provider,
        baseUrl: providerStatus.baseUrl,
        supportsAttachments: getModelProviderPreset(
          inferModelProviderId({ providerId: providerStatus.providerId, providerLabel: providerStatus.provider, baseUrl: providerStatus.baseUrl })
        ).defaultSupportsAttachments,
      }, providerStatus);
      return legacyModel ? [legacyModel] : [];
    }
    return [];
  }

  private buildModelFromSettings(modelRecord: ConfiguredModelRecord, providerStatus: AgentProviderStatus | null): ModelSpec | null {
    const selectedModelId = readString(modelRecord.id);
    if (!selectedModelId) return null;
    const providerLabel =
      readString(modelRecord?.providerLabel) ?? readString(this.memorySettings?.values.aiProviderLabel)
      ?? readString(providerStatus?.provider) ?? 'Connected provider';
    const friendlyName = readString(this.memorySettings?.values.aiModelFriendlyName) ?? readString(modelRecord?.friendlyName);
    const baseUrl = readString(this.memorySettings?.values.aiModelBaseUrl) ?? readString(modelRecord?.baseUrl)
      ?? (providerStatus?.baseUrl && providerStatus.baseUrl !== 'local' ? providerStatus.baseUrl : null);
    const modelId = readString(modelRecord?.modelId) ?? readString(providerStatus?.modelId) ?? selectedModelId;
    const providerId = inferModelProviderId({ providerId: modelRecord?.providerId ?? providerStatus?.providerId, providerLabel, baseUrl });
    const supportsAttachments = readBoolean(modelRecord?.supportsAttachments) ?? getModelProviderPreset(providerId).defaultSupportsAttachments;
    return { id: selectedModelId, modelId, label: friendlyName ?? modelId ?? selectedModelId, provider: providerLabel, providerId, baseUrl, note: modelId ? `Model ID: ${modelId}` : baseUrl ? `Base URL: ${baseUrl}` : 'Stored securely on this device.', supportsAttachments };
  }

  static getInstance(): ModelSelectionService { if (!instance) { instance = new ModelSelectionService(); } return instance; }
}

let instance: ModelSelectionService | null = null;
