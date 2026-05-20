export type ModelSpec = {
  id: string;
  modelId?: string | null;
  label: string;
  provider: string;
  note?: string;
  baseUrl?: string | null;
  supportsAttachments?: boolean;
};
