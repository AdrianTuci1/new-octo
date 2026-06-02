
import { useEffect } from 'react';
import type { LauncherProps } from '../types';

type ResolveLocalConversationIdSyncParams = {
  controlledConversationId: string | null | undefined;
  initialComposerSurface?: LauncherProps['initialComposerSurface'];
  localConversationId: string | null;
};

export function resolveLocalConversationIdSyncTarget({
  controlledConversationId,
  initialComposerSurface = 'terminal',
  localConversationId
}: ResolveLocalConversationIdSyncParams): string | null {
  if (controlledConversationId === undefined) {
    return localConversationId;
  }

  if (controlledConversationId === null) {
    return initialComposerSurface === 'terminal'
      ? null
      : localConversationId;
  }

  return controlledConversationId;
}

export function useLauncherMemorySync({
  store, props, runtime
}: {
  store: any;
  props: LauncherProps;
  runtime: any;
}) {
  const { 
    agentTerminal, 
    memoryStore, 
    resolvedConversationId,
  } = runtime;

  const { conversations: memoryConversations, status: memoryStatus } = memoryStore;

  // 1. Sync Terminal Session from Memory
  useEffect(() => {
    if (memoryStatus !== 'ready' || !resolvedConversationId) {
      return;
    }

    const conversationSummary = memoryConversations.find((conversation: any) => conversation.id === resolvedConversationId);
    if (!conversationSummary || !conversationSummary.terminalSessionId) {
      return;
    }

    // CRITICAL: Guard the setter to prevent infinite loops
    if (agentTerminal.sessionId !== conversationSummary.terminalSessionId) {
      agentTerminal.setSessionId(conversationSummary.terminalSessionId);
    }
  }, [memoryConversations, memoryStatus, resolvedConversationId, agentTerminal.sessionId, agentTerminal.setSessionId]);

  // 2. Local Conversation ID Sync
  useEffect(() => {
    const nextLocalConversationId = resolveLocalConversationIdSyncTarget({
      controlledConversationId: props.conversationId,
      initialComposerSurface: props.initialComposerSurface,
      localConversationId: store.localConversationId
    });

    if (store.localConversationId === nextLocalConversationId) {
      return;
    }

    store.setLocalConversationId(nextLocalConversationId);
  }, [
    props.conversationId,
    props.initialComposerSurface,
    store.localConversationId,
    store.setLocalConversationId
  ]);

  // 3. Pending Approval Sync
  useEffect(() => {
    if (props.pendingApproval === undefined || store.localPendingApproval === props.pendingApproval) {
      return;
    }
    store.setLocalPendingApproval(props.pendingApproval);
  }, [props.pendingApproval, store.localPendingApproval, store.setLocalPendingApproval]);
}
