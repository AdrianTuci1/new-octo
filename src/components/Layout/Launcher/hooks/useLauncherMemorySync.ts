/**
 * `useLauncherMemorySync` - Synchronizes the local React state with the global Memory/Zustand store.
 * 
 * Responsibilities:
 * 1. Bind external prop changes (like `props.conversationId`, `props.pendingApproval`) to local store changes.
 * 2. Load the active conversation's terminal blocks into the agent view on change.
 * 3. Fetch past conversations and format them into `prompt` history entries for autocomplete.
 */
import { useEffect } from 'react';
import { useMemoryStore } from '../../../../stores';
import { formatHistoryDetail, dedupeHistoryEntries } from '../utils';

export function useLauncherMemorySync({
  store, props, agentTerminal, memoryConversations, memoryStatus,
  hasControlledConversation, hasControlledPendingApproval, resolvedConversationId
}: any) {
  useEffect(() => {
    if (!hasControlledConversation) {
      return;
    }

    store.setLocalConversationId(props.conversationId ?? null);
  }, [props.conversationId, hasControlledConversation]);

  useEffect(() => {
    if (!hasControlledPendingApproval) {
      return;
    }

    store.setLocalPendingApproval(props.pendingApproval ?? null);
  }, [hasControlledPendingApproval, props.pendingApproval]);

  useEffect(() => {
    const nextConversationId = resolvedConversationId?.trim();
    let cancelled = false;

    if (!nextConversationId) {
      agentTerminal.replaceBlocks([]);
      return;
    }

    void useMemoryStore.getState().loadConversation(nextConversationId).then((conversation: any) => {
      if (cancelled) {
        return;
      }

      agentTerminal.replaceBlocks(conversation?.terminalBlocks ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [agentTerminal.replaceBlocks, resolvedConversationId]);

  useEffect(() => {
    if (memoryStatus !== 'ready' || memoryConversations.length === 0) {
      store.setSavedPromptEntries([]);
      return;
    }

    let cancelled = false;

    void Promise.all(
      memoryConversations
        .slice(0, 16)
        .map((conversation: any) => useMemoryStore.getState().loadConversation(conversation.id))
    ).then((conversationRecords) => {
      if (cancelled) {
        return;
      }

      const nextEntries = dedupeHistoryEntries(
        conversationRecords
          .flatMap((conversation: any) => {
            if (!conversation) {
              return [];
            }

            return conversation.messages
              .filter((message: any) => message.role === 'user' && message.body.trim().length > 0)
              .map((message: any) => ({
                id: message.id,
                label: message.body,
                detail: `${conversation.title} · ${formatHistoryDetail(message.createdAt ?? conversation.updatedAt)}`,
                kind: 'prompt' as const,
                createdAt: message.createdAt ?? conversation.updatedAt
              }));
          })
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        60
      );

      store.setSavedPromptEntries(nextEntries);
    });

    return () => {
      cancelled = true;
    };
  }, [memoryConversations, memoryStatus]);


}
