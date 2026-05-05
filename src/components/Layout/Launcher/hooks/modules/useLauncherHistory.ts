
import { useMemo } from 'react';
import type { HistoryEntry } from '../../../../../types';
import { formatHistoryDetail, dedupeHistoryEntries } from '../../utils';

export function useLauncherHistory({
  runtime, store
}: {
  runtime: any;
  store: any;
}) {
  const {
    chat,
    queryWithoutActivator,
    terminalCommandBlocks,
    commandHistory
  } = runtime;

  const { messages } = chat;
  const { savedPromptEntries, historyTab } = store;

  const promptHistoryEntries = useMemo<HistoryEntry[]>(
    () => {
      const currentPromptEntries = messages
        .filter((message: any) => {
          if (message.role !== 'user' || message.body.trim().length === 0) {
            return false;
          }

          if (queryWithoutActivator.trim().length === 0) {
            return true;
          }

          return message.body.toLowerCase().includes(queryWithoutActivator.toLowerCase());
        })
        .map((message: any) => ({
          id: message.id,
          label: message.body,
          detail: `current · ${formatHistoryDetail(message.createdAt ?? new Date().toISOString())}`,
          kind: 'prompt' as const,
          createdAt: message.createdAt ?? new Date().toISOString()
        }));

      const persistedPromptEntries = savedPromptEntries.filter((entry: any) => (
        queryWithoutActivator.trim().length === 0
        || entry.label.toLowerCase().includes(queryWithoutActivator.toLowerCase())
      ));

      return dedupeHistoryEntries(
        [...currentPromptEntries, ...persistedPromptEntries]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        60
      );
    },
    [messages, queryWithoutActivator, savedPromptEntries]
  );

  const commandHistoryEntries = useMemo<HistoryEntry[]>(
    () => {
      const currentTerminalEntries = terminalCommandBlocks
        .filter((block: any) => block.command.trim().length > 0)
        .map((block: any) => ({
          id: `octomus-${block.id}`,
          label: block.command,
          detail: `octomus · ${formatHistoryDetail(block.startedAt)}`,
          kind: 'command' as const,
          createdAt: block.startedAt
        }));

      const shellEntries = commandHistory.map((entry: any, index: number) => ({
        id: `${entry.source}-${entry.executedAt}-${index}`,
        label: entry.value,
        detail: `${entry.source} · ${formatHistoryDetail(entry.executedAt)}`,
        kind: 'command' as const,
        createdAt: entry.executedAt
      }));

      const filteredEntries = [...currentTerminalEntries, ...shellEntries]
        .filter((entry: any) => (
          queryWithoutActivator.trim().length === 0
          || entry.label.toLowerCase().includes(queryWithoutActivator.toLowerCase())
        ))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      return dedupeHistoryEntries(filteredEntries, 60);
    },
    [commandHistory, queryWithoutActivator, terminalCommandBlocks]
  );

  const historyEntries = useMemo(() => {
    if (historyTab === 'commands') {
      return commandHistoryEntries;
    }

    if (historyTab === 'prompts') {
      return promptHistoryEntries;
    }

    return [...commandHistoryEntries, ...promptHistoryEntries]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [commandHistoryEntries, historyTab, promptHistoryEntries]);

  return useMemo(() => ({ historyEntries }), [historyEntries]);
}
