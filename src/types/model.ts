import type { ModelProviderId } from '../lib/modelProviders';

export type ModelSpec = {
  id: string;
  modelId?: string | null;
  label: string;
  provider: string;
  providerId?: ModelProviderId;
  note?: string;
  baseUrl?: string | null;
  supportsAttachments?: boolean;
};
