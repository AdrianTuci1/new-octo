import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useMemoryStore } from '../stores/memoryStore';
import type { AgentProviderStatus } from '../types/chat';
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
  supportsAttachments?: unknown;
};

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function buildModelFromSettings(
  selectedModelId: string | null,
  memorySettings: ReturnType<typeof useMemoryStore.getState>['settings'],
  providerStatus: AgentProviderStatus | null,
  isConfigured: boolean
): ModelSpec | null {
  if (!isConfigured || !selectedModelId) {
    return null;
  }

  const configuredModels = (memorySettings?.values.configuredModels as ConfiguredModelRecord[] | undefined) ?? [];
  const selectedConfiguredModel = configuredModels.find((model) => model.id === selectedModelId);
  const providerLabel = readString(memorySettings?.values.aiProviderLabel)
    ?? (providerStatus?.provider === 'openai-compatible' ? 'OpenAI' : readString(providerStatus?.provider))
    ?? 'Connected provider';
  const friendlyName = readString(memorySettings?.values.aiModelFriendlyName)
    ?? readString(selectedConfiguredModel?.friendlyName);
  const baseUrl = readString(memorySettings?.values.aiModelBaseUrl)
    ?? readString(selectedConfiguredModel?.baseUrl)
    ?? (providerStatus?.baseUrl && providerStatus.baseUrl !== 'local' ? providerStatus.baseUrl : null);
  const modelId = readString(selectedConfiguredModel?.modelId)
    ?? readString(providerStatus?.modelId)
    ?? selectedModelId;
  const supportsAttachments = readBoolean(selectedConfiguredModel?.supportsAttachments) ?? false;

  return {
    id: selectedModelId,
    modelId,
    label: friendlyName ?? modelId ?? selectedModelId,
    provider: providerLabel,
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
  const [isProviderStatusLoaded, setIsProviderStatusLoaded] = useState(false);
  const memorySettings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);

  useEffect(() => {
    void invoke<AgentProviderStatus>('agent_provider_status')
      .then((status) => {
        setProviderStatus(status);
        setIsProviderStatusLoaded(true);

        if (
          status.hasApiKey
          && status.source !== 'environment'
          && typeof window !== 'undefined'
          && !window.localStorage.getItem(STORAGE_KEY)
          && !memorySettings?.values.selectedModelId
        ) {
          setSelectedModelId(status.modelId ?? null);
        }
      })
      .catch((error) => {
        console.warn('[model-selection] failed to load provider status', error);
        setIsProviderStatusLoaded(true);
      });
  }, [memorySettings?.values.selectedModelId]);

  useEffect(() => {
    const memoryModelId = memorySettings?.values.selectedModelId;
    if (typeof memoryModelId === 'string' && memoryModelId.trim().length > 0) {
      setSelectedModelId(memoryModelId);
    }
  }, [memorySettings?.values.selectedModelId]);

  const isConfigured = isProviderStatusLoaded
    && Boolean(providerStatus?.hasApiKey)
    && providerStatus?.source !== 'environment';
  const resolvedSelectedModelId = isConfigured
    ? (selectedModelId ?? providerStatus?.modelId ?? null)
    : null;

  const selectedModel = useMemo(
    () => buildModelFromSettings(resolvedSelectedModelId, memorySettings, providerStatus, isConfigured),
    [isConfigured, memorySettings, providerStatus, resolvedSelectedModelId]
  );

  const models = useMemo(() => (selectedModel ? [selectedModel] : []), [selectedModel]);
  const requiresModelSetup = isProviderStatusLoaded && !isConfigured;
  const selectedModelLabel = selectedModel?.label ?? "You don't have any model";
  const selectedModelApiId = selectedModel?.modelId ?? selectedModel?.id ?? null;
  const selectedModelSupportsAttachments = selectedModel?.supportsAttachments ?? false;

  const selectModel = (modelId: string, persist = false) => {
    setSelectedModelId(modelId);
    void saveSettings({ selectedModelId: modelId }, true);
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
    selectModel
  };
}
