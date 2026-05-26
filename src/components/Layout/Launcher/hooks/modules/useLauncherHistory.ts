
import { useEffect, useMemo } from 'react';
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
    memoryStore,
    queryWithoutActivator,
    conversationTerminalBlocks,
    commandHistory
  } = runtime;

  const { messages } = chat;
  const { savedPromptEntries, historyTab } = store;

  useEffect(() => {
    if (memoryStore.status !== 'ready') {
      return;
    }

    const loadedRecords = memoryStore.conversationRecords ?? {};
    const missingConversations = (memoryStore.conversations ?? [])
      .filter((conversation: any) => !loadedRecords[conversation.id])
      .slice(0, 50);

    for (const conversation of missingConversations) {
      void memoryStore.loadConversation(conversation.id);
    }
  }, [
    memoryStore.status,
    memoryStore.conversations,
    memoryStore.conversationRecords,
    memoryStore.loadConversation
  ]);

  const promptHistoryEntries = useMemo<HistoryEntry[]>(
    () => {
      const normalizedQuery = queryWithoutActivator.trim().toLowerCase();
      const currentPromptEntries = messages
        .filter((message: any) => {
          if (message.role !== 'user' || message.body.trim().length === 0) {
            return false;
          }

          if (normalizedQuery.length === 0) {
            return true;
          }

          return message.body.toLowerCase().includes(normalizedQuery);
        })
        .map((message: any) => ({
          id: message.id,
          label: message.body,
          detail: `current · ${formatHistoryDetail(message.createdAt ?? new Date().toISOString())}`,
          kind: 'prompt' as const,
          createdAt: message.createdAt ?? new Date().toISOString()
        }));

      const persistedPromptEntries = savedPromptEntries.filter((entry: any) => (
        normalizedQuery.length === 0
        || entry.label.toLowerCase().includes(normalizedQuery)
      ));

      const conversationPromptEntries = Object.values(memoryStore.conversationRecords ?? {})
        .flatMap((conversation: any) => {
          const title = conversation.title?.trim() || 'conversation';
          const updatedAt = conversation.updatedAt ?? new Date().toISOString();

          return (conversation.messages ?? [])
            .filter((message: any) => message.role === 'user' && message.body.trim().length > 0)
            .filter((message: any) => (
              normalizedQuery.length === 0
              || message.body.toLowerCase().includes(normalizedQuery)
            ))
            .map((message: any) => ({
              id: `conversation-${conversation.id}-${message.id}`,
              label: message.body,
              detail: `${title} · ${formatHistoryDetail(message.createdAt ?? updatedAt)}`,
              kind: 'prompt' as const,
              createdAt: message.createdAt ?? updatedAt
            }));
        });

      return dedupeHistoryEntries(
        [...currentPromptEntries, ...conversationPromptEntries, ...persistedPromptEntries]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        60
      );
    },
    [messages, memoryStore.conversationRecords, queryWithoutActivator, savedPromptEntries]
  );

  const commandHistoryEntries = useMemo<HistoryEntry[]>(
    () => {
      const normalizedQuery = queryWithoutActivator.trim().toLowerCase();
      const currentTerminalEntries = conversationTerminalBlocks
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

      const filteredEntries = rankCommandHistoryEntries(
        [...currentTerminalEntries, ...shellEntries].filter((entry: any) => (
          commandMatchesHistoryQuery(entry.label, normalizedQuery)
        )),
        normalizedQuery
      );

      return filteredEntries.slice(0, 60);
    },
    [commandHistory, conversationTerminalBlocks, queryWithoutActivator]
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

function rankCommandHistoryEntries(entries: HistoryEntry[], normalizedQuery: string) {
  const aggregates = new Map<string, { entry: HistoryEntry; count: number }>();

  for (const entry of entries) {
    const key = `${entry.kind}:${entry.label.trim().toLowerCase()}`;
    const aggregate = aggregates.get(key);
    if (!aggregate) {
      aggregates.set(key, { entry, count: 1 });
      continue;
    }

    aggregate.count += 1;
    if (entry.createdAt.localeCompare(aggregate.entry.createdAt) > 0) {
      aggregate.entry = entry;
    }
  }

  return Array.from(aggregates.values())
    .sort((left, right) => {
      const frequency = right.count - left.count;
      if (frequency !== 0) {
        return frequency;
      }

      const recency = right.entry.createdAt.localeCompare(left.entry.createdAt);
      if (recency !== 0) {
        return recency;
      }

      if (normalizedQuery.length > 0) {
        return right.entry.label.length - left.entry.label.length;
      }

      return left.entry.label.localeCompare(right.entry.label);
    })
    .map((aggregate) => aggregate.entry);
}

function commandMatchesHistoryQuery(label: string, normalizedQuery: string) {
  if (normalizedQuery.length === 0) {
    return true;
  }

  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel.startsWith(normalizedQuery)) {
    return true;
  }

  const rootCommand = normalizedQuery.split(/\s+/)[0]?.trim();
  return Boolean(rootCommand) && normalizedLabel.startsWith(`${rootCommand} `);
}
