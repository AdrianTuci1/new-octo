export type ModelProviderId = 'openai' | 'google' | 'openrouter' | 'custom';

export type ModelProviderPreset = {
  id: ModelProviderId;
  label: string;
  defaultBaseUrl: string;
  baseUrlLocked: boolean;
  defaultSupportsAttachments: boolean;
  apiKeyPlaceholder: string;
};

const MODEL_PROVIDER_PRESETS: Record<ModelProviderId, ModelProviderPreset> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlLocked: true,
    defaultSupportsAttachments: true,
    apiKeyPlaceholder: 'sk-...'
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseUrlLocked: true,
    defaultSupportsAttachments: true,
    apiKeyPlaceholder: 'AIza...'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    baseUrlLocked: false,
    defaultSupportsAttachments: false,
    apiKeyPlaceholder: 'sk-or-v1-...'
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI Compatible)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlLocked: false,
    defaultSupportsAttachments: false,
    apiKeyPlaceholder: 'API key'
  }
};

export function isModelProviderId(value: unknown): value is ModelProviderId {
  return value === 'openai' || value === 'google' || value === 'openrouter' || value === 'custom';
}

export function getModelProviderPreset(providerId: ModelProviderId): ModelProviderPreset {
  return MODEL_PROVIDER_PRESETS[providerId];
}

export function listModelProviderPresets() {
  return [
    MODEL_PROVIDER_PRESETS.openai,
    MODEL_PROVIDER_PRESETS.google,
    MODEL_PROVIDER_PRESETS.openrouter,
    MODEL_PROVIDER_PRESETS.custom
  ];
}

export function inferModelProviderId(input: {
  providerId?: unknown;
  providerLabel?: unknown;
  baseUrl?: unknown;
}): ModelProviderId {
  if (isModelProviderId(input.providerId)) {
    return input.providerId;
  }

  const providerLabel = typeof input.providerLabel === 'string'
    ? input.providerLabel.trim().toLowerCase()
    : '';
  if (providerLabel.includes('google') || providerLabel.includes('gemini')) {
    return 'google';
  }
  if (providerLabel.includes('openrouter')) {
    return 'openrouter';
  }
  if (providerLabel.includes('openai')) {
    return 'openai';
  }

  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim().toLowerCase() : '';
  if (baseUrl.includes('generativelanguage.googleapis.com')) {
    return 'google';
  }
  if (baseUrl.includes('openrouter.ai')) {
    return 'openrouter';
  }
  if (baseUrl.includes('api.openai.com')) {
    return 'openai';
  }

  return 'custom';
}
