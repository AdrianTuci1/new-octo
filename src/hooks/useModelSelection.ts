import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getModelProviderPreset, inferModelProviderId } from '../lib/modelProviders';
import { useMemoryStore } from '../stores/memoryStore';
import type { AgentModelSourceStatus, AgentProviderStatus } from '../types/chat';
import type { ModelSpec } from '../types/model';

const STORAGE_KEY = 'octomus.selectedModelId';

function readString(value: unknown) {
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

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function buildModelFromSettings(
  modelRecord: ConfiguredModelRecord,
  memorySettings: ReturnType<typeof useMemoryStore.getState>['settings'],
  providerStatus: AgentProviderStatus | null
): ModelSpec | null {
  const selectedModelId = readString(modelRecord.id);
  if (!selectedModelId) {
    return null;
  }

  const providerLabel = readString(modelRecord?.providerLabel)
    ?? readString(memorySettings?.values.aiProviderLabel)
    ?? readString(providerStatus?.provider)
    ?? 'Connected provider';
  const friendlyName = readString(memorySettings?.values.aiModelFriendlyName)
    ?? readString(modelRecord?.friendlyName);
  const baseUrl = readString(memorySettings?.values.aiModelBaseUrl)
    ?? readString(modelRecord?.baseUrl)
    ?? (providerStatus?.baseUrl && providerStatus.baseUrl !== 'local' ? providerStatus.baseUrl : null);
  const modelId = readString(modelRecord?.modelId)
    ?? readString(providerStatus?.modelId)
    ?? selectedModelId;
  const providerId = inferModelProviderId({
    providerId: modelRecord?.providerId ?? providerStatus?.providerId,
    providerLabel,
    baseUrl
  });
  const supportsAttachments = readBoolean(modelRecord?.supportsAttachments)
    ?? getModelProviderPreset(providerId).defaultSupportsAttachments;

  return {
    id: selectedModelId,
    modelId,
    label: friendlyName ?? modelId ?? selectedModelId,
    provider: providerLabel,
    providerId,
    baseUrl,
    note: modelId ? `Model ID: ${modelId}` : (baseUrl ? `Base URL: ${baseUrl}` : 'Stored securely on this device.'),
    supportsAttachments
  };
}

export function useModelSelection() {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem(STORAGE_KEY);
  });
  const [providerStatus, setProviderStatus] = useState<AgentProviderStatus | null>(null);
  const [sourceStatuses, setSourceStatuses] = useState<AgentModelSourceStatus[]>([]);
  const [isProviderStatusLoaded, setIsProviderStatusLoaded] = useState(false);
  const memorySettings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);

  useEffect(() => {
    void Promise.all([
      invoke<AgentProviderStatus>('agent_provider_status')
        .then((status) => {
          setProviderStatus(status);
          return status;
        })
        .catch((error) => {
          console.warn('[model-selection] failed to load provider status', error);
          return null;
        }),
      invoke<AgentModelSourceStatus[]>('agent_list_model_sources')
        .then((statuses) => {
          setSourceStatuses(statuses);
          return statuses;
        })
        .catch((error) => {
          console.warn('[model-selection] failed to load model sources', error);
          return [] as AgentModelSourceStatus[];
        })
    ]).then(([status]) => {
      setIsProviderStatusLoaded(true);

      if (
        status?.hasApiKey
        && status.source !== 'environment'
        && typeof window !== 'undefined'
        && !window.localStorage.getItem(STORAGE_KEY)
        && !memorySettings?.values.selectedModelId
      ) {
        setSelectedModelId(status.modelId ?? null);
      }
    });
  }, [memorySettings?.values.selectedModelId]);

  useEffect(() => {
    const memoryModelId = memorySettings?.values.selectedModelId;
    if (typeof memoryModelId === 'string' && memoryModelId.trim().length > 0) {
      setSelectedModelId(memoryModelId);
    }
  }, [memorySettings?.values.selectedModelId]);

  const configuredModels = useMemo(() => {
    const models = (memorySettings?.values.configuredModels as ConfiguredModelRecord[] | undefined) ?? [];
    const normalized = models
      .map((model) => buildModelFromSettings(model, memorySettings, providerStatus))
      .filter((model): model is ModelSpec => Boolean(model));

    if (normalized.length > 0) {
      return normalized;
    }

    if (
      providerStatus?.hasApiKey
      && providerStatus.source !== 'environment'
      && providerStatus.modelId
    ) {
      const legacyRecord: ConfiguredModelRecord = {
        id: providerStatus.modelId,
        modelId: providerStatus.modelId,
        providerId: providerStatus.providerId,
        providerLabel: providerStatus.provider,
        baseUrl: providerStatus.baseUrl,
        supportsAttachments: getModelProviderPreset(
          inferModelProviderId({
            providerId: providerStatus.providerId,
            providerLabel: providerStatus.provider,
            baseUrl: providerStatus.baseUrl
          })
        ).defaultSupportsAttachments
      };
      const legacyModel = buildModelFromSettings(legacyRecord, memorySettings, providerStatus);
      return legacyModel ? [legacyModel] : [];
    }

    return [];
  }, [memorySettings, providerStatus]);

  const sourceModels = useMemo(() => {
    return sourceStatuses
      .filter((status) => status.connected)
      .flatMap((status) => status.models.map((model) => ({
        id: model.id,
        modelId: model.modelId,
        label: model.label,
        provider: model.provider,
        providerId: model.providerId ?? 'custom',
        baseUrl: null,
        note: model.note,
        supportsAttachments: model.supportsAttachments
      } satisfies ModelSpec)));
  }, [sourceStatuses]);

  const models = useMemo(() => {
    const byId = new Map<string, ModelSpec>();
    [...sourceModels, ...configuredModels].forEach((model) => {
      if (!byId.has(model.id)) {
        byId.set(model.id, model);
      }
    });
    return Array.from(byId.values());
  }, [configuredModels, sourceModels]);

  const resolvedSelectedModelId = models.some((model) => model.id === selectedModelId)
    ? selectedModelId
    : (memorySettings?.values.selectedModelId && models.some((model) => model.id === memorySettings.values.selectedModelId)
      ? memorySettings.values.selectedModelId
      : models[0]?.id ?? null);
  const selectedModel = useMemo(
    () => models.find((model) => model.id === resolvedSelectedModelId) ?? null,
    [models, resolvedSelectedModelId]
  );

  const isConfigured = isProviderStatusLoaded && models.length > 0;
  const requiresModelSetup = isProviderStatusLoaded && models.length === 0;
  const selectedModelLabel = selectedModel?.label ?? "You don't have any model";
  const selectedModelApiId = selectedModel?.modelId ?? selectedModel?.id ?? null;
  const selectedModelSupportsAttachments = selectedModel?.supportsAttachments ?? false;

  const selectModel = (modelId: string, persist = false) => {
    setSelectedModelId(modelId);
    void saveSettings({ selectedModelId: modelId }, true);
    const configuredModel = ((memorySettings?.values.configuredModels as ConfiguredModelRecord[] | undefined) ?? [])
      .find((model) => readString(model.id) === modelId);
    if (configuredModel) {
      const nextProviderId = inferModelProviderId({
        providerId: configuredModel.providerId,
        providerLabel: configuredModel.providerLabel,
        baseUrl: configuredModel.baseUrl
      });
      void invoke('agent_configure_openai_compatible', {
        request: {
          providerId: nextProviderId,
          apiKey: '',
          baseUrl: readString(configuredModel.baseUrl),
          modelId: readString(configuredModel.modelId)
        }
      }).catch((error) => {
        console.warn('[model-selection] failed to activate configured model', error);
      });
    }
    if (persist && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, modelId);
    }
  };

  return {
    models,
    selectedModel,
    selectedModelId: resolvedSelectedModelId,
    selectedModelApiId,
    selectedModelLabel,
    selectedModelSupportsAttachments,
    isConfigured,
    isProviderStatusLoaded,
    requiresModelSetup,
    sourceStatuses,
    selectModel
  };
}
