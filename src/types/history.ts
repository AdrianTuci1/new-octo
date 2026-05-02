export type ShellHistoryEntry = {
  value: string;
  executedAt: string;
  source: string;
};

export type HistoryTab = 'all' | 'commands' | 'prompts';

export type HistoryEntry = {
  id: string;
  label: string;
  detail: string;
  kind: 'command' | 'prompt';
  createdAt: string;
};
