import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Trash2, X } from 'lucide-react';
import { useMemoryStore, useUIStore } from '../../../stores';
import type { AgentProviderStatus } from '../../../types/chat';
import './ModelManagementDrawer.css';

const DEFAULT_PROVIDER_LABEL = 'OpenAI';
const DEFAULT_MODEL_ID = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export function ModelManagementDrawer() {
  const setIsModelDrawerOpen = useUIStore((state) => state.setIsModelDrawerOpen);
  const memorySelectedModelId = useMemoryStore((state) => state.settings?.values.selectedModelId ?? null);
  const saveSettings = useMemoryStore((state) => state.saveSettings);

  const [providerLabel, setProviderLabel] = useState(DEFAULT_PROVIDER_LABEL);
  const [modelId, setModelId] = useState(memorySelectedModelId ?? DEFAULT_MODEL_ID);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    void invoke<AgentProviderStatus>('agent_provider_status')
      .then((status) => {
        if (status.source !== 'environment' && status.provider === 'openai-compatible') {
          setProviderLabel(DEFAULT_PROVIDER_LABEL);
        }

        if (status.hasApiKey && status.source !== 'environment' && status.modelId) {
          setModelId(status.modelId);
        } else if (memorySelectedModelId) {
          setModelId(memorySelectedModelId);
        }

        if (status.source !== 'environment' && status.baseUrl && status.baseUrl !== 'local') {
          setBaseUrl(status.baseUrl);
        }

        setHasApiKey(status.hasApiKey && status.source !== 'environment');
      })
      .catch((error) => {
        console.warn('[model-management] failed to load provider status', error);
      });
  }, [memorySelectedModelId]);

  const handleSave = async () => {
    const trimmedModelId = modelId.trim();
    const trimmedBaseUrl = baseUrl.trim();
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
      const status = await invoke<AgentProviderStatus>('agent_configure_openai_compatible', {
        request: {
          apiKey: trimmedApiKey,
          baseUrl: trimmedBaseUrl,
          modelId: trimmedModelId
        }
      });

      await saveSettings(
        {
          selectedModelId: status.modelId,
          aiProviderLabel: providerLabel,
          aiModelFriendlyName: friendlyName.trim() || null,
          aiModelBaseUrl: status.baseUrl
        },
        true
      );

      setHasApiKey(status.hasApiKey);
      setApiKey('');
      setStatusMessage('Saved securely in the OS keychain.');
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
      await invoke('agent_clear_openai_compatible');
      await saveSettings(
        {
          selectedModelId: DEFAULT_MODEL_ID,
          aiProviderLabel: DEFAULT_PROVIDER_LABEL,
          aiModelFriendlyName: null,
          aiModelBaseUrl: DEFAULT_BASE_URL
        },
        true
      );

      setApiKey('');
      setHasApiKey(false);
      setModelId(DEFAULT_MODEL_ID);
      setBaseUrl(DEFAULT_BASE_URL);
      setFriendlyName('');
      setProviderLabel(DEFAULT_PROVIDER_LABEL);
      setStatusMessage('Secure credential removed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="model-mgmt-drawer">
      <header className="model-mgmt-header">
        <div className="header-left">
          <h2 className="header-title">Add new model</h2>
        </div>
        <button className="close-btn" onClick={() => setIsModelDrawerOpen(false)} type="button">
          <X size={18} />
        </button>
      </header>

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
            <select value={providerLabel} onChange={(event) => setProviderLabel(event.target.value)}>
              <option>OpenAI</option>
              <option>Anthropic</option>
              <option>Google Gemini</option>
              <option>Ollama (Local)</option>
              <option>OpenRouter</option>
              <option>Custom (OpenAI Compatible)</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Model ID</label>
          <input
            type="text"
            placeholder="e.g. gpt-4o-mini"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Base URL</label>
          <input
            type="text"
            placeholder="https://api.openai.com/v1"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>

        <div className="form-group">
          <label>API Key</label>
          <div className="input-with-icon">
            <Key size={14} className="input-icon" />
            <input
              type="password"
              placeholder={hasApiKey ? 'Stored securely, leave blank to keep it' : 'sk-...'}
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
            <span>{isDeleting ? 'Deleting...' : 'Delete secure credential'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
