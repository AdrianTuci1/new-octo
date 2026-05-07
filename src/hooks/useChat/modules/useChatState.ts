import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '../../../types/chat';
import { extractFollowUpSuggestion } from '../parsers';
import { pendingFollowUpPayloads } from '../bridge';

export function useChatState() {
  const instanceIdRef = useRef(Symbol('useChatInstance'));
  const hydratedConversationRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);

  const setMessages = useCallback((nextMessages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState((currentMessages) => {
      const resolvedMessages = typeof nextMessages === 'function' ? nextMessages(currentMessages) : nextMessages;
      messagesRef.current = resolvedMessages;
      return resolvedMessages;
    });
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((currentMessages) => [...currentMessages, message]);
  }, [setMessages]);

  const updateMessage = useCallback((messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
    let didUpdate = false;

    setMessages((currentMessages) => currentMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      didUpdate = true;
      return updater(message);
    }));

    return didUpdate;
  }, [setMessages]);

  const appendToMessage = useCallback((messageId: string, text: string) => {
    let didAppend = false;

    setMessages((currentMessages) => currentMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      didAppend = true;
      const bufferedFollowUp = pendingFollowUpPayloads[messageId] ?? '';
      const combinedRaw = bufferedFollowUp
        ? `${bufferedFollowUp}${text}`
        : `${message.body}${text}`;
      const extracted = extractFollowUpSuggestion(combinedRaw);
      if (!extracted) {
        return {
          ...message,
          body: `${message.body}${text}`
        };
      }

      if (extracted.pendingPayload) {
        pendingFollowUpPayloads[messageId] = extracted.pendingPayload;
      } else {
        delete pendingFollowUpPayloads[messageId];
      }

      return {
        ...message,
        body: bufferedFollowUp
          ? `${message.body}${extracted.visibleBody}`
          : extracted.visibleBody,
        followUpSuggestion: extracted.suggestion ?? message.followUpSuggestion
      };
    }));

    return didAppend;
  }, [setMessages]);

  const upsertReasoningMessage = useCallback((
    assistantMessageId: string,
    payload: { text: string; isComplete?: boolean }
  ) => {
    const text = payload.text.trim();
    if (!text) {
      return;
    }

    setMessages((currentMessages) => {
      const existingIndex = currentMessages.findIndex((message) => (
        message.messageKind === 'reasoning' && message.parentMessageId === assistantMessageId
      ));

      if (existingIndex >= 0) {
        return currentMessages.map((message, index) => (
          index === existingIndex
            ? {
                ...message,
                body: text,
                isStreaming: payload.isComplete !== true,
                status: payload.isComplete ? 'completed' : 'running'
              }
            : message
        ));
      }

      const assistantIndex = currentMessages.findIndex((message) => message.id === assistantMessageId);
      const reasoningMessage = {
        id: `${assistantMessageId}::reasoning`,
        role: 'assistant' as const,
        title: 'Thinking',
        body: text,
        messageKind: 'reasoning' as const,
        parentMessageId: assistantMessageId,
        isStreaming: payload.isComplete !== true,
        status: payload.isComplete ? 'completed' as const : 'running' as const,
        createdAt: new Date().toISOString()
      };

      if (assistantIndex < 0) {
        return [...currentMessages, reasoningMessage];
      }

      const nextMessages = [...currentMessages];
      nextMessages.splice(assistantIndex, 0, reasoningMessage);
      return nextMessages;
    });
  }, [setMessages]);

  const clearMessages = useCallback(() => {
    activeConversationIdRef.current = null;
    activeRunIdRef.current = null;
    setActiveConversationId(null);
    setActiveRunId(null);
    setMessages([]);
  }, [setMessages]);

  return {
    instanceIdRef,
    hydratedConversationRef,
    messagesRef,
    activeConversationIdRef,
    activeRunIdRef,
    activeConversationId,
    setActiveConversationId,
    activeRunId,
    setActiveRunId,
    query,
    setQuery,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    appendToMessage,
    upsertReasoningMessage,
    clearMessages
  };
}
