import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Trash2, X } from 'lucide-react';
import {
  getModelProviderPreset,
  inferModelProviderId,
  isModelProviderId,
  listModelProviderPresets,
  type ModelProviderId
} from '../../../lib/modelProviders';
import { useMemoryStore, useUIStore } from '../../../stores';
import type { AgentProviderStatus, ConfiguredModel } from '../../../types/chat';
import { DrawerHeader } from '../drawers/DrawerHeader';
import './ModelManagementDrawer.css';

const DEFAULT_PROVIDER_ID: ModelProviderId = 'openai';

export function ModelManagementDrawer() {
  const setIsModelDrawerOpen = useUIStore((state) => state.setIsModelDrawerOpen);
  const selectedModelIdForEdit = useUIStore((state) => state.selectedModelIdForEdit);
  const setSelectedModelIdForEdit = useUIStore((state) => state.setSelectedModelIdForEdit);
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);

  const [providerId, setProviderId] = useState<ModelProviderId>(DEFAULT_PROVIDER_ID);
  const [modelId, setModelId] = useState('');
  const [baseUrl, setBaseUrl] = useState(getModelProviderPreset(DEFAULT_PROVIDER_ID).defaultBaseUrl);
  const [apiKey, setApiKey] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [supportsAttachments, setSupportsAttachments] = useState(
    getModelProviderPreset(DEFAULT_PROVIDER_ID).defaultSupportsAttachments
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const configuredModels = (settings?.values.configuredModels as ConfiguredModel[]) ?? [];
    if (selectedModelIdForEdit && selectedModelIdForEdit !== 'new') {
      const editingModel = configuredModels.find((m) => m.id === selectedModelIdForEdit);
      if (editingModel) {
        const nextProviderId = inferModelProviderId(editingModel);
        const preset = getModelProviderPreset(nextProviderId);
        setProviderId(nextProviderId);
        setModelId(editingModel.modelId);
        setBaseUrl(editingModel.baseUrl || preset.defaultBaseUrl);
        setFriendlyName(editingModel.friendlyName ?? '');
        setHasApiKey(editingModel.hasApiKey ?? true);
        setSupportsAttachments(editingModel.supportsAttachments ?? preset.defaultSupportsAttachments);
        setApiKey('');
      }
    } else {
      const preset = getModelProviderPreset(DEFAULT_PROVIDER_ID);
      setProviderId(DEFAULT_PROVIDER_ID);
      setModelId('');
      setBaseUrl(preset.defaultBaseUrl);
      setFriendlyName('');
      setHasApiKey(false);
      setSupportsAttachments(preset.defaultSupportsAttachments);
      setApiKey('');
    }
    setErrorMessage(null);
    setStatusMessage(null);
  }, [selectedModelIdForEdit, settings?.values.configuredModels]);

  const providerPreset = getModelProviderPreset(providerId);

  const handleProviderChange = (value: string) => {
    if (!isModelProviderId(value)) {
      return;
    }

    const nextPreset = getModelProviderPreset(value);
    setProviderId(value);
    setBaseUrl(nextPreset.defaultBaseUrl);
    setSupportsAttachments(nextPreset.defaultSupportsAttachments);
  };

  const handleSave = async () => {
    const trimmedModelId = modelId.trim();
    const trimmedBaseUrl = providerPreset.baseUrlLocked
      ? providerPreset.defaultBaseUrl
      : baseUrl.trim();
    const trimmedApiKey = apiKey.trim();

    if (!trimmedModelId) {
      setErrorMessage('Model ID is required.');
      return;
    }

    if (!trimmedBaseUrl) {
      setErrorMessage('Base URL is required.');
      return;
    }

    if (!trimmedApiKey && !hasApiKey) {
      setErrorMessage('API key is required for a new model.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      let hasKey = hasApiKey;
      if (trimmedApiKey) {
        const status = await invoke<AgentProviderStatus>('agent_configure_openai_compatible', {
          request: {
            providerId,
            apiKey: trimmedApiKey,
            baseUrl: trimmedBaseUrl,
            modelId: trimmedModelId
          }
        });
        hasKey = status.hasApiKey;
      } else {
        try {
          await invoke<AgentProviderStatus>('agent_configure_openai_compatible', {
            request: {
              providerId,
              apiKey: '',
              baseUrl: trimmedBaseUrl,
              modelId: trimmedModelId
            }
          });
        } catch (err) {
          console.warn('[model-management] failed to update backend active model', err);
        }
      }

      const existingModels = (settings?.values.configuredModels as ConfiguredModel[]) ?? [];
      const newId = selectedModelIdForEdit && selectedModelIdForEdit !== 'new' ? selectedModelIdForEdit : `model_${Date.now()}`;

      const updatedModel: ConfiguredModel = {
        id: newId,
        providerId,
        providerLabel: providerPreset.label,
        modelId: trimmedModelId,
        baseUrl: trimmedBaseUrl,
        friendlyName: friendlyName.trim() || undefined,
        hasApiKey: hasKey,
        supportsAttachments
      };

      let nextConfiguredModels: ConfiguredModel[] = [];
      if (selectedModelIdForEdit && selectedModelIdForEdit !== 'new') {
        nextConfiguredModels = existingModels.map((m) => m.id === selectedModelIdForEdit ? updatedModel : m);
      } else {
        nextConfiguredModels = [...existingModels, updatedModel];
      }

      await saveSettings(
        {
          configuredModels: nextConfiguredModels,
          selectedModelId: updatedModel.id,
          aiProviderLabel: updatedModel.providerLabel,
          aiProviderId: updatedModel.providerId,
          aiModelFriendlyName: updatedModel.friendlyName || null,
          aiModelBaseUrl: updatedModel.baseUrl
        },
        true
      );

      setHasApiKey(hasKey);
      setApiKey('');
      setSelectedModelIdForEdit(updatedModel.id);
      setStatusMessage('Saved securely and set as active model.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const existingModels = (settings?.values.configuredModels as ConfiguredModel[]) ?? [];
      const nextConfiguredModels = existingModels.filter((m) => m.id !== selectedModelIdForEdit);

      const nextActiveModel = nextConfiguredModels[0] || null;

      if (nextActiveModel) {
        try {
          await invoke('agent_configure_openai_compatible', {
            request: {
              providerId: nextActiveModel.providerId ?? inferModelProviderId(nextActiveModel),
              apiKey: '',
              baseUrl: nextActiveModel.baseUrl,
              modelId: nextActiveModel.modelId
            }
          });
        } catch (e) {
          console.warn('[model-management] failed to switch active backend model on delete', e);
        }

        await saveSettings(
          {
            configuredModels: nextConfiguredModels,
            selectedModelId: nextActiveModel.id,
            aiProviderLabel: nextActiveModel.providerLabel,
            aiProviderId: nextActiveModel.providerId ?? inferModelProviderId(nextActiveModel),
            aiModelFriendlyName: nextActiveModel.friendlyName || null,
            aiModelBaseUrl: nextActiveModel.baseUrl
          },
          true
        );
      } else {
        await invoke('agent_clear_openai_compatible');
        await saveSettings(
          {
            configuredModels: [],
            selectedModelId: '',
            aiProviderLabel: '',
            aiProviderId: '',
            aiModelFriendlyName: null,
            aiModelBaseUrl: ''
          },
          true
        );
      }

      setApiKey('');
      setHasApiKey(false);
      setFriendlyName('');
      setSelectedModelIdForEdit(null);
      setIsModelDrawerOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="model-mgmt-drawer">
      <DrawerHeader
        title={selectedModelIdForEdit && selectedModelIdForEdit !== 'new' ? "Edit model details" : "Add new model"}
        action={(
          <button
            className="drawer-header-action-button"
            onClick={() => setIsModelDrawerOpen(false)}
            type="button"
            aria-label="Close model drawer"
          >
            <X size={18} />
          </button>
        )}
      />

      <div className="model-mgmt-content">
        <div className="model-mgmt-status-row">
          <div className="model-mgmt-status-title">Secrets are stored locally by the OS</div>
          <div className="model-mgmt-status-copy">
            API keys never need to live in frontend state or plain JSON.
          </div>
        </div>

        <div className="form-group">
          <label>Provider</label>
          <div className="select-wrapper">
            <select value={providerId} onChange={(event) => handleProviderChange(event.target.value)}>
              {listModelProviderPresets().map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Model ID</label>
          <input
            type="text"
            placeholder="Enter a model ID"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Base URL</label>
          <input
            type="text"
            placeholder={providerPreset.defaultBaseUrl}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            disabled={providerPreset.baseUrlLocked}
          />
          <div className="model-mgmt-field-note">
            {providerPreset.baseUrlLocked
              ? `This provider uses a fixed API endpoint: ${providerPreset.defaultBaseUrl}`
              : 'Use the provider endpoint that exposes an OpenAI-compatible chat completions API.'}
          </div>
        </div>

        <div className="form-group">
          <label>API Key</label>
          <div className="input-with-icon">
            <Key size={14} className="input-icon" />
            <input
              type="password"
              placeholder={hasApiKey ? 'Stored securely, leave blank to keep it' : providerPreset.apiKeyPlaceholder}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Friendly Name</label>
          <input
            type="text"
            placeholder="My Work GPT"
            value={friendlyName}
            onChange={(event) => setFriendlyName(event.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Multimodal Input</label>
          <button
            className={`model-mgmt-checkbox ${supportsAttachments ? 'active' : ''}`}
            type="button"
            onClick={() => setSupportsAttachments((current) => !current)}
            role="switch"
            aria-checked={supportsAttachments}
          >
            <span className="model-mgmt-checkbox-track" aria-hidden="true">
              <span className="model-mgmt-checkbox-thumb" />
            </span>
            <span className="model-mgmt-checkbox-copy">
              Model accepts file or image inputs
            </span>
          </button>
          <div className="model-mgmt-field-note">
            OpenAI and Google presets start with this enabled. Turn it off only when a specific model is text-only.
          </div>
        </div>

        {errorMessage && <div className="model-mgmt-feedback error">{errorMessage}</div>}
        {statusMessage && <div className="model-mgmt-feedback success">{statusMessage}</div>}

        <div className="model-mgmt-actions">
          <button className="btn-save" type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save securely'}
          </button>
        </div>

        <div className="model-mgmt-danger-zone">
          <button className="btn-delete" type="button" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 size={14} />
            <span>{isDeleting ? 'Deleting...' : 'Delete model'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
