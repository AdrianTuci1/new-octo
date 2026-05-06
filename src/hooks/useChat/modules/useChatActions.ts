import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { UseChatOptions } from '../types';
import type { AgentStartResponse } from '../../../types/chat';
import { useMemoryStore } from '../../../stores/memoryStore';
import { chatHistoryFromMessages, titleFromConversationContent, statusFromConversationContent, buildToolResultFollowupPrompt } from '../helpers';
import { pendingTokenText, setAssistantRegistration } from '../bridge';
import type { useChatState } from './useChatState';

type UseChatActionsProps = {
  options: UseChatOptions;
  state: ReturnType<typeof useChatState>;
  onCommandApprovalRef: React.MutableRefObject<UseChatOptions['onCommandApproval']>;
  onFileChangeApprovalRef: React.MutableRefObject<UseChatOptions['onFileChangeApproval']>;
};

export function useChatActions({ options, state, onCommandApprovalRef, onFileChangeApprovalRef }: UseChatActionsProps) {
  const saveCurrentConversation = useCallback(async () => {
    const currentMessages = state.messagesRef.current;
    const terminalBlocks = options.terminalBlocks ?? [];
    if (currentMessages.length === 0 && terminalBlocks.length === 0) {
      return null;
    }

    const conversationId = state.activeConversationIdRef.current
      ?? options.conversationId
      ?? currentMessages.find((message) => message.conversationId)?.conversationId
      ?? null;

    if (!conversationId) {
      return null;
    }

    return useMemoryStore.getState().saveConversation({
      conversationId,
      title: titleFromConversationContent(currentMessages, terminalBlocks),
      modelId: options.modelId ?? null,
      cwd: options.cwd ?? null,
      status: statusFromConversationContent(currentMessages, terminalBlocks),
      messages: currentMessages,
      ...(terminalBlocks.length > 0 ? { terminalBlocks } : {})
    });
  }, [options.conversationId, options.cwd, options.modelId, options.terminalBlocks, state.messagesRef, state.activeConversationIdRef]);

  const submitQuery = async (promptOverride?: string) => {
    const prompt = typeof promptOverride === 'string' ? promptOverride : state.query;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    if (options.requiresModelSetup) {
      options.onRequireModelSetup?.();
      return;
    }

    if (trimmed === '/new') {
      await saveCurrentConversation();
      state.clearMessages();
      state.setQuery('');
      options.onCloseTray?.();
      options.onNewChat?.();
      return;
    }

    const ts = Date.now();
    const runId = `run_${ts}`;
    const conversationId = state.activeConversationIdRef.current ?? options.conversationId ?? `conv_${ts}`;
    const assistantMessageId = `assistant_${ts}`;

    state.activeRunIdRef.current = runId;
    state.activeConversationIdRef.current = conversationId;
    state.setActiveRunId(runId);
    state.setActiveConversationId(conversationId);
    options.onConversationCreated?.(conversationId);

    state.addMessage({
      id: `user-${ts}`,
      role: 'user',
      title: 'User',
      body: trimmed,
      conversationId,
      createdAt: new Date().toISOString()
    });

    state.addMessage({
      id: assistantMessageId,
      role: 'assistant',
      title: 'Octomus',
      body: pendingTokenText[assistantMessageId] ?? '',
      conversationId,
      runId,
      status: 'queued',
      isStreaming: true,
      createdAt: new Date().toISOString()
    });

    state.setQuery('');
    options.onCloseTray?.();

    const owner = state.instanceIdRef.current;
    setAssistantRegistration(assistantMessageId, {
      owner,
      append: (text) => state.appendToMessage(assistantMessageId, text),
      update: (updater) => state.updateMessage(assistantMessageId, updater),
      onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval),
      onFileChangeApproval: (approval) => onFileChangeApprovalRef.current?.(approval)
    });

    try {
      const requestMessages = chatHistoryFromMessages(state.messagesRef.current);

      const response = await invoke<AgentStartResponse>('agent_start', {
        request: {
          runId,
          conversationId,
          assistantMessageId,
          prompt: trimmed,
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
          messages: requestMessages
        }
      });

      const remainingTokens = pendingTokenText[response.assistantMessageId];
      if (remainingTokens) {
        state.appendToMessage(assistantMessageId, remainingTokens);
      }
      delete pendingTokenText[response.assistantMessageId];
      state.activeConversationIdRef.current = response.conversationId;
      state.activeRunIdRef.current = response.runId;
      state.setActiveConversationId(response.conversationId);
      state.setActiveRunId(response.runId);
      if (response.conversationId !== conversationId) {
        options.onConversationCreated?.(response.conversationId);
      }
      state.updateMessage(assistantMessageId, (message) => ({
        ...message,
        conversationId: response.conversationId,
        runId: response.runId
      }));
    } catch (error) {
      state.updateMessage(assistantMessageId, (message) => ({
        ...message,
        body: `Eroare: ${error}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  const submitToolResult = async (toolCallId: string, result: string, command?: string) => {
    const ts = Date.now();
    const conversationId = state.activeConversationIdRef.current;
    const runId = state.activeRunIdRef.current;

    if (!conversationId || !runId) return;

    state.addMessage({
      id: `tool-${ts}`,
      role: 'tool',
      title: 'Tool Output',
      body: result,
      conversationId,
      toolCallId
    });

    const nextAssistantMessageId = `assistant-followup-${ts}`;
    state.addMessage({
      id: nextAssistantMessageId,
      role: 'assistant',
      title: 'Octomus',
      body: '',
      conversationId,
      runId,
      isStreaming: true,
      status: 'running',
      createdAt: new Date().toISOString()
    });

    const owner = state.instanceIdRef.current;
    setAssistantRegistration(nextAssistantMessageId, {
      owner,
      append: (text) => state.appendToMessage(nextAssistantMessageId, text),
      update: (updater) => state.updateMessage(nextAssistantMessageId, updater),
      onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval),
      onFileChangeApproval: (approval) => onFileChangeApprovalRef.current?.(approval)
    });

    try {
      const requestMessages = chatHistoryFromMessages(state.messagesRef.current);

      const response = await invoke<AgentStartResponse>('agent_start', {
        request: {
          runId,
          conversationId,
          assistantMessageId: nextAssistantMessageId,
          prompt: buildToolResultFollowupPrompt(command),
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
          messages: requestMessages
        }
      });

      const remainingTokens = pendingTokenText[response.assistantMessageId];
      if (remainingTokens) {
        state.appendToMessage(nextAssistantMessageId, remainingTokens);
      }
      delete pendingTokenText[response.assistantMessageId];
      state.activeConversationIdRef.current = response.conversationId;
      state.activeRunIdRef.current = response.runId;
      state.setActiveConversationId(response.conversationId);
      state.setActiveRunId(response.runId);
      if (response.conversationId !== conversationId) {
        options.onConversationCreated?.(response.conversationId);
      }
      state.updateMessage(nextAssistantMessageId, (message) => ({
        ...message,
        conversationId: response.conversationId,
        runId: response.runId
      }));
    } catch (error) {
      state.updateMessage(nextAssistantMessageId, (message) => ({
        ...message,
        body: `Eroare la introspecție: ${error}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  return { saveCurrentConversation, submitQuery, submitToolResult };
}
