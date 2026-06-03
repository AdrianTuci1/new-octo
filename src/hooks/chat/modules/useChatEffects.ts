import { useEffect, useRef } from 'react';
import type { UseChatOptions } from '../types';
import type { ExecutionPlanArtifact, PlanExecutionUpdate } from '../../../types/chat';
import type { useChatState } from './useChatState';
import { ensureAgentEventBridge, setAssistantRegistration, deleteOwnerRegistrations } from '../bridge';
import { useMemoryStore } from '../../../stores/memoryStore';
import { sameMessages } from '../helpers';
import type { TerminalCommandBlock } from '../../../types/terminal';

type UseChatEffectsProps = {
  options: UseChatOptions;
  state: ReturnType<typeof useChatState>;
  actions: {
    saveCurrentConversation: () => Promise<any>;
    submitPlanProposal: (toolCallId: string, plan: ExecutionPlanArtifact) => void;
    submitPlanExecution: (toolCallId: string, update: PlanExecutionUpdate) => void;
  };
  onCommandApprovalRef: React.MutableRefObject<UseChatOptions['onCommandApproval']>;
  onFileChangeApprovalRef: React.MutableRefObject<UseChatOptions['onFileChangeApproval']>;
  onWebSearchRef: React.MutableRefObject<UseChatOptions['onWebSearch']>;
  onWorkspaceExplorationRef: React.MutableRefObject<UseChatOptions['onWorkspaceExploration']>;
  onWorkspaceFileReadRef: React.MutableRefObject<UseChatOptions['onWorkspaceFileRead']>;
  onCloudAgentLaunchRef: React.MutableRefObject<UseChatOptions['onCloudAgentLaunch']>;
};

function terminalBlocksSignature(blocks: TerminalCommandBlock[] | undefined) {
  return (blocks ?? []).map((block) => [
    block.id,
    block.command,
    block.output,
    block.startedAt,
    block.finishedAt ?? '',
    block.exitCode ?? '',
    block.status,
    block.presentation ?? '',
    block.source ?? '',
    block.conversationId ?? '',
    block.conversationTitle ?? ''
  ].join('\u0000')).join('\u0001');
}

export function useChatEffects({
  options,
  state,
  actions,
  onCommandApprovalRef,
  onFileChangeApprovalRef,
  onWebSearchRef,
  onWorkspaceExplorationRef,
  onWorkspaceFileReadRef,
  onCloudAgentLaunchRef
}: UseChatEffectsProps) {
  const onConversationLoadedRef = useRef(options.onConversationLoaded);

  useEffect(() => {
    onConversationLoadedRef.current = options.onConversationLoaded;
  }, [options.onConversationLoaded]);
  const conversationRecord = useMemoryStore((s: any) => options.conversationId ? s.conversationRecords[options.conversationId] : undefined);
  const terminalBlocksSaveSignature = terminalBlocksSignature(options.terminalBlocks);

  useEffect(() => {
    void ensureAgentEventBridge();
  }, []);

  useEffect(() => {
    state.activeConversationIdRef.current = state.activeConversationId;
  }, [state.activeConversationId, state.activeConversationIdRef]);

  useEffect(() => {
    state.activeRunIdRef.current = state.activeRunId;
  }, [state.activeRunId, state.activeRunIdRef]);

  useEffect(() => {
    onCommandApprovalRef.current = options.onCommandApproval;
  }, [options.onCommandApproval, onCommandApprovalRef]);

  useEffect(() => {
    onFileChangeApprovalRef.current = options.onFileChangeApproval;
  }, [options.onFileChangeApproval, onFileChangeApprovalRef]);

  useEffect(() => {
    onWebSearchRef.current = options.onWebSearch;
  }, [options.onWebSearch, onWebSearchRef]);

  useEffect(() => {
    onWorkspaceExplorationRef.current = options.onWorkspaceExploration;
  }, [options.onWorkspaceExploration, onWorkspaceExplorationRef]);

  useEffect(() => {
    onWorkspaceFileReadRef.current = options.onWorkspaceFileRead;
  }, [options.onWorkspaceFileRead, onWorkspaceFileReadRef]);

  useEffect(() => {
    onCloudAgentLaunchRef.current = options.onCloudAgentLaunch;
  }, [options.onCloudAgentLaunch, onCloudAgentLaunchRef]);

  useEffect(() => {
    const owner = state.instanceIdRef.current;
    const streamingMessageIds = state.messages
      .filter((message) => message.role === 'assistant' && message.isStreaming)
      .map((message) => message.id);

    for (const assistantMessageId of streamingMessageIds) {
      setAssistantRegistration(assistantMessageId, {
        owner,
        append: (text) => state.appendToMessage(assistantMessageId, text),
        update: (updater) => state.updateMessage(assistantMessageId, updater),
        upsertReasoning: (payload) => state.upsertReasoningMessage(assistantMessageId, payload),
        finalizeReasoning: () => state.finalizeReasoningMessage(assistantMessageId),
        showPlan: (plan, toolCallId) => actions.submitPlanProposal(toolCallId, plan),
        applyPlanExecution: (update, toolCallId) => actions.submitPlanExecution(toolCallId, update),
        onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval),
        onFileChangeApproval: (approval) => onFileChangeApprovalRef.current?.(approval),
        onWebSearch: (request) => onWebSearchRef.current?.(request),
        onWorkspaceExploration: (request) => onWorkspaceExplorationRef.current?.(request),
        onWorkspaceFileRead: (request) => onWorkspaceFileReadRef.current?.(request),
        onCloudAgentLaunch: (request) => onCloudAgentLaunchRef.current?.(request)
      });
    }
  }, [actions, state.appendToMessage, state.messages, state.updateMessage, state.upsertReasoningMessage, onCommandApprovalRef, onFileChangeApprovalRef, onWebSearchRef, onWorkspaceExplorationRef, onWorkspaceFileReadRef, onCloudAgentLaunchRef, state.instanceIdRef]);

  useEffect(() => {
    const owner = state.instanceIdRef.current;
    return () => {
      deleteOwnerRegistrations(owner);
    };
  }, [state.instanceIdRef]);

  useEffect(() => {
    const conversationId = options.conversationId?.trim();
    if (!conversationId) {
      if (state.hydratedConversationRef.current !== null) {
        state.hydratedConversationRef.current = null;
        state.clearMessages();
      }
      return;
    }

    if (state.hydratedConversationRef.current === conversationId && state.activeConversationIdRef.current === conversationId) {
      return;
    }

    state.hydratedConversationRef.current = conversationId;
    state.activeConversationIdRef.current = conversationId;
    state.activeRunIdRef.current = null;
    state.setActiveConversationId(conversationId);
    state.setActiveRunId(null);
    state.setMessages([]);
    let isCancelled = false;

    void useMemoryStore.getState().loadConversation(conversationId).then((conversation: any) => {
      if (isCancelled || state.hydratedConversationRef.current !== conversationId) {
        return;
      }

      if (state.messagesRef.current.length > 0) {
        return;
      }

      state.setMessages(conversation?.messages ?? []);

      if (conversation && onConversationLoadedRef.current) {
        onConversationLoadedRef.current(conversation);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [state.clearMessages, options.conversationId, state.setMessages, state.activeConversationIdRef, state.activeRunIdRef, state.hydratedConversationRef, state.messagesRef, state.setActiveConversationId, state.setActiveRunId]);

  useEffect(() => {
    const conversationId = options.conversationId?.trim();
    if (!conversationId || !conversationRecord) {
      return;
    }

    if (state.messagesRef.current.some((message) => message.isStreaming)) {
      return;
    }

    if (sameMessages(state.messagesRef.current, conversationRecord.messages)) {
      return;
    }

    state.setMessages(conversationRecord.messages);
  }, [conversationRecord, options.conversationId, state.setMessages, state.messagesRef]);

  const saveCurrentConversationRef = useRef(actions.saveCurrentConversation);

  useEffect(() => {
    saveCurrentConversationRef.current = actions.saveCurrentConversation;
  }, [actions.saveCurrentConversation]);

  useEffect(() => {
    return () => {
      void saveCurrentConversationRef.current();
    };
  }, []);

  useEffect(() => {
    if (options.active === false) {
      void saveCurrentConversationRef.current();
    }
  }, [options.active]);

  useEffect(() => {
    return () => {
      void saveCurrentConversationRef.current();
    };
  }, [options.conversationId]);

  useEffect(() => {
    if (state.messages.length === 0 && (options.terminalBlocks?.length ?? 0) === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void actions.saveCurrentConversation();
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state.messages, terminalBlocksSaveSignature, options.terminalBlocks?.length, actions.saveCurrentConversation]);
}
