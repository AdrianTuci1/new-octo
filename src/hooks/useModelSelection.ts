import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AgentProviderStatus } from '../types/chat';
import type { ModelSpec } from '../types/model';

const STORAGE_KEY = 'octomus.selectedModelId';

export const MODEL_CATALOG: ModelSpec[] = [
  { id: 'gpt-5.3-codex-medium', label: 'gpt-5.3 codex (medium reasoning)', provider: 'OpenAI', intelligence: 78, speed: 62, cost: 44, note: 'Balanced coding model for daily work.' },
  { id: 'gpt-5.3-codex-high', label: 'gpt-5.3 codex (high)', provider: 'OpenAI', intelligence: 87, speed: 48, cost: 58, note: 'Higher reasoning for more complex implementation work.' },
  { id: 'gpt-5.3-codex-xhigh', label: 'gpt-5.3 codex (xhigh)', provider: 'OpenAI', intelligence: 92, speed: 36, cost: 74, note: 'Best suited for hard debugging and architectural tasks.' },
  { id: 'kimi-k2.5', label: 'kimi k2.5', provider: 'Moonshot', intelligence: 66, speed: 73, cost: 35, note: 'Fast general-purpose model with good long-context behavior.' },
  { id: 'kimi-k2.6', label: 'kimi k2.6', provider: 'Moonshot', intelligence: 70, speed: 70, cost: 38, note: 'Updated Kimi variant with stronger coding consistency.' },
  { id: 'minimax-2.7', label: 'minimax 2.7', provider: 'MiniMax', intelligence: 61, speed: 84, cost: 18, note: 'Responsive low-cost option for lightweight tasks.' },
  { id: 'qwen-3.6-plus', label: 'qwen 3.6 plus', provider: 'Qwen', intelligence: 74, speed: 64, cost: 28, note: 'Solid multimodal-capable model with good throughput.' },
  { id: 'auto-responsive', label: 'auto (responsive)', provider: 'Octomus', intelligence: 60, speed: 90, cost: 22, note: 'Biases toward speed and lower latency.', },
  { id: 'auto-genius', label: 'auto (genius)', provider: 'Octomus', intelligence: 88, speed: 40, cost: 66, note: 'Biases toward depth and model quality.' }
];

export function useModelSelection() {
  const [selectedModelId, setSelectedModelId] = useState<string>('gpt-5.3-codex-medium');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSelectedModelId(stored);
      return;
    }

    void invoke<AgentProviderStatus>('agent_provider_status')
      .then((status) => {
        if (status.modelId) {
          setSelectedModelId(status.modelId);
        }
      })
      .catch((error) => {
        console.warn('[model-selection] failed to load provider status', error);
      });
  }, []);

  const selectedModel = useMemo(
    () => MODEL_CATALOG.find((model) => model.id === selectedModelId)
      ?? MODEL_CATALOG.find((model) => model.label === selectedModelId)
      ?? MODEL_CATALOG[0],
    [selectedModelId]
  );

  const selectModel = (modelId: string, persist = false) => {
    setSelectedModelId(modelId);
    if (persist) {
      window.localStorage.setItem(STORAGE_KEY, modelId);
    }
  };

  return {
    models: MODEL_CATALOG,
    selectedModel,
    selectedModelId,
    selectModel
  };
}
