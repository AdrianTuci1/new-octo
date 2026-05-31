import { useCallback, useRef, useState } from 'react';
import type { ChatAttachment, ChatMessage } from '../../../types/chat';
import { extractFollowUpSuggestion, extractInlinePlanArtifact, visibleChatMessageBody } from '../parsers';
import { pendingFollowUpPayloads } from '../bridge';

const pendingInlinePlanPayloads: Record<string, string> = {};

function summarizeReasoningText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const summary = sentences.length > 0
    ? sentences.slice(0, 2).join(' ')
    : normalized;

  if (summary.length <= 180) {
    return summary;
  }

  const clipped = summary.slice(0, 177).replace(/\s+\S*$/, '');
  return `${clipped}...`;
}

function formatPlanBody(message: ChatMessage) {
  const plan = message.executionPlan;
  if (!plan) {
    return message.body;
  }

  return [
    plan.summary?.trim() || 'Execution plan proposed.',
    ...plan.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.label}`),
    ...(plan.workstreams?.length
      ? [
          '',
          ...plan.workstreams.map((workstream) => `WS [${workstream.status}] ${workstream.title}`)
        ]
      : [])
  ].filter(Boolean).join('\n');
}

function findLatestReasoningIndex(messages: ChatMessage[], assistantMessageId: string) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.messageKind === 'reasoning' && message.parentMessageId === assistantMessageId) {
      return index;
    }
  }

  return -1;
}

function shouldInsertReasoningAfterAssistant(assistantMessage: ChatMessage | null) {
  if (!assistantMessage) {
    return false;
  }

  return visibleChatMessageBody(assistantMessage.body).trim().length > 0;
}

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
  const [attachments, setAttachmentsState] = useState<ChatAttachment[]>([]);

  const calculateThinkingDurationSeconds = useCallback((startedAt?: string) => {
    if (!startedAt) {
      return 1;
    }

    const startedMs = Date.parse(startedAt);
    if (Number.isNaN(startedMs)) {
      return 1;
    }

    const elapsedSeconds = (Date.now() - startedMs) / 1000;
    return Math.max(1, Math.round(elapsedSeconds));
  }, []);

  const setMessages = useCallback((nextMessages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState((currentMessages) => {
      const resolvedMessages = typeof nextMessages === 'function' ? nextMessages(currentMessages) : nextMessages;
      messagesRef.current = resolvedMessages;
      return resolvedMessages;
    });
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((currentMessages) => {
      if (currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
        return currentMessages;
      }

      return [...currentMessages, message];
    });
  }, [setMessages]);

  const updateMessage = useCallback((messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
    const hasMessage = messagesRef.current.some((message) => message.id === messageId);
    if (!hasMessage) {
      return false;
    }

    setMessages((currentMessages) => currentMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      return updater(message);
    }));

    return true;
  }, [messagesRef, setMessages]);

  const appendToMessage = useCallback((messageId: string, text: string) => {
    const hasMessage = messagesRef.current.some((message) => message.id === messageId);
    if (!hasMessage) {
      return false;
    }

    setMessages((currentMessages) => {
      const messageIndex = currentMessages.findIndex((message) => message.id === messageId);
      if (messageIndex < 0) {
        return currentMessages;
      }

      const nextMessages = [...currentMessages];
      const currentMessage = nextMessages[messageIndex];
      const bufferedPlan = pendingInlinePlanPayloads[messageId] ?? '';
      const bufferedFollowUp = pendingFollowUpPayloads[messageId] ?? '';
      const isDuplicateFullToken = text.length > 40
        && !bufferedPlan
        && !bufferedFollowUp
        && currentMessage.body.endsWith(text);
      if (isDuplicateFullToken) {
        return currentMessages;
      }

      const existingRaw = `${currentMessage.body}${bufferedPlan}${bufferedFollowUp}`;
      let incomingText = text;
      if (incomingText.length > 0 && incomingText.startsWith(existingRaw)) {
        incomingText = incomingText.slice(existingRaw.length);
      }

      const normalizedExistingRaw = existingRaw.replace(/\r\n/g, '\n').trim();
      const normalizedIncomingText = incomingText.replace(/\r\n/g, '\n').trim();
      const isDuplicateToken = incomingText.length === 0
        || (
          incomingText.length > 40
          && normalizedExistingRaw.length > 0
          && normalizedExistingRaw === normalizedIncomingText
        );
      if (isDuplicateToken) {
        return currentMessages;
      }

      const combinedRaw = `${existingRaw}${incomingText}`;

      const extractedFollowUp = extractFollowUpSuggestion(combinedRaw);
      if (extractedFollowUp.pendingPayload) {
        pendingFollowUpPayloads[messageId] = extractedFollowUp.pendingPayload;
      } else {
        delete pendingFollowUpPayloads[messageId];
      }

      const extractedPlan = extractInlinePlanArtifact(extractedFollowUp.visibleBody);
      if (extractedPlan.pendingPayload) {
        pendingInlinePlanPayloads[messageId] = extractedPlan.pendingPayload;
      } else {
        delete pendingInlinePlanPayloads[messageId];
      }

      nextMessages[messageIndex] = {
        ...currentMessage,
        body: extractedPlan.visibleBody,
        followUpSuggestion: extractedFollowUp.suggestion ?? currentMessage.followUpSuggestion
      };

      if (!extractedPlan.plan) {
        return nextMessages;
      }

      const syntheticPlanMessageId = `${messageId}::inline-plan`;
      const syntheticPlanMessage: ChatMessage = {
        id: syntheticPlanMessageId,
        role: 'tool',
        title: 'Execution Plan',
        body: formatPlanBody({
          ...currentMessage,
          executionPlan: extractedPlan.plan
        }),
        conversationId: currentMessage.conversationId,
        createdAt: currentMessage.createdAt ?? new Date().toISOString(),
        toolCallId: syntheticPlanMessageId,
        toolKind: 'plan',
        executionPlan: extractedPlan.plan
      };

      const existingPlanIndex = nextMessages.findIndex((message) => message.id === syntheticPlanMessageId);
      if (existingPlanIndex >= 0) {
        nextMessages[existingPlanIndex] = syntheticPlanMessage;
      } else {
        nextMessages.splice(messageIndex + 1, 0, syntheticPlanMessage);
      }

      return nextMessages;
    });

    return true;
  }, [messagesRef, setMessages]);

  const upsertReasoningMessage = useCallback((
    assistantMessageId: string,
    payload: { text: string; isComplete?: boolean }
  ) => {
    const text = summarizeReasoningText(payload.text);
    if (!text) {
      return;
    }

    setMessages((currentMessages) => {
      const existingIndex = findLatestReasoningIndex(currentMessages, assistantMessageId);

      if (existingIndex >= 0) {
        const existingMessage = currentMessages[existingIndex];
        const shouldStartNewSegment = existingMessage.status === 'completed' && payload.isComplete !== true;

        if (!shouldStartNewSegment) {
          return currentMessages.map((message, index) => (
            index === existingIndex
              ? {
                  ...message,
                  body: text,
                  isStreaming: payload.isComplete !== true,
                  status: payload.isComplete ? 'completed' : 'running',
                  thinkingDurationSeconds: payload.isComplete
                    ? calculateThinkingDurationSeconds(existingMessage.createdAt)
                    : message.thinkingDurationSeconds
                }
              : message.id === assistantMessageId
                ? {
                    ...message,
                    hasNativeThinking: true
                  }
                : message
          ));
        }

        const assistantIndex = currentMessages.findIndex((message) => message.id === assistantMessageId);
        const assistantMessage = assistantIndex >= 0 ? currentMessages[assistantIndex] : null;
        const insertAfterAssistant = shouldInsertReasoningAfterAssistant(assistantMessage);
        const createdAt = new Date().toISOString();
        const segmentIndex = currentMessages.filter((message) => (
          message.messageKind === 'reasoning' && message.parentMessageId === assistantMessageId
        )).length + 1;
        const reasoningMessage = {
          id: `${assistantMessageId}::reasoning-${segmentIndex}`,
          role: 'assistant' as const,
          title: 'Thinking',
          body: text,
          messageKind: 'reasoning' as const,
          parentMessageId: assistantMessageId,
          isStreaming: payload.isComplete !== true,
          status: payload.isComplete ? 'completed' as const : 'running' as const,
          thinkingDurationSeconds: payload.isComplete
            ? calculateThinkingDurationSeconds(createdAt)
            : undefined,
          createdAt
        };

        if (assistantIndex < 0) {
          return [...currentMessages, reasoningMessage];
        }

        const nextMessages = [...currentMessages];
        nextMessages[assistantIndex] = {
          ...nextMessages[assistantIndex],
          hasNativeThinking: true
        };
        nextMessages.splice(insertAfterAssistant ? assistantIndex + 1 : assistantIndex, 0, reasoningMessage);
        return nextMessages;
      }

      const assistantIndex = currentMessages.findIndex((message) => message.id === assistantMessageId);
      const assistantMessage = assistantIndex >= 0 ? currentMessages[assistantIndex] : null;
      const insertAfterAssistant = shouldInsertReasoningAfterAssistant(assistantMessage);
      const createdAt = assistantMessage?.createdAt ?? new Date().toISOString();
      const segmentIndex = currentMessages.filter((message) => (
        message.messageKind === 'reasoning' && message.parentMessageId === assistantMessageId
      )).length + 1;
      const reasoningMessage = {
        id: segmentIndex === 1
          ? `${assistantMessageId}::reasoning`
          : `${assistantMessageId}::reasoning-${segmentIndex}`,
        role: 'assistant' as const,
        title: 'Thinking',
        body: text,
        messageKind: 'reasoning' as const,
        parentMessageId: assistantMessageId,
        isStreaming: payload.isComplete !== true,
        status: payload.isComplete ? 'completed' as const : 'running' as const,
        thinkingDurationSeconds: payload.isComplete
          ? calculateThinkingDurationSeconds(createdAt)
          : undefined,
        createdAt
      };

      if (assistantIndex < 0) {
        return [...currentMessages, reasoningMessage];
      }

      const nextMessages = [...currentMessages];
      if (assistantIndex >= 0) {
        nextMessages[assistantIndex] = {
          ...nextMessages[assistantIndex],
          hasNativeThinking: true
        };
      }
      nextMessages.splice(insertAfterAssistant ? assistantIndex + 1 : assistantIndex, 0, reasoningMessage);
      return nextMessages;
    });
  }, [calculateThinkingDurationSeconds, setMessages]);

  const finalizeReasoningMessage = useCallback((assistantMessageId: string) => {
    setMessages((currentMessages) => {
      const reasoningIndex = findLatestReasoningIndex(currentMessages, assistantMessageId);

      if (reasoningIndex < 0) {
        return currentMessages.map((message) => (
          message.id === assistantMessageId
            ? { ...message, hasNativeThinking: true }
            : message
        ));
      }

      const reasoningMessage = currentMessages[reasoningIndex];
      const duration = reasoningMessage.thinkingDurationSeconds
        ?? calculateThinkingDurationSeconds(reasoningMessage.createdAt);

      return currentMessages.map((message, index) => {
        if (index === reasoningIndex) {
          return {
            ...message,
            isStreaming: false,
            status: 'completed',
            body: summarizeReasoningText(message.body),
            thinkingDurationSeconds: duration
          };
        }

        if (message.id === assistantMessageId) {
          return {
            ...message,
            hasNativeThinking: true
          };
        }

        return message;
      });
    });
  }, [calculateThinkingDurationSeconds, setMessages]);

  const clearMessages = useCallback(() => {
    activeConversationIdRef.current = null;
    activeRunIdRef.current = null;
    setActiveConversationId(null);
    setActiveRunId(null);
    setMessages([]);
    setAttachmentsState([]);
  }, [setMessages]);

  const addAttachments = useCallback((nextAttachments: ChatAttachment[]) => {
    if (nextAttachments.length === 0) {
      return;
    }

    setAttachmentsState((current) => [...current, ...nextAttachments]);
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachmentsState((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachmentsState([]);
  }, []);

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
    attachments,
    setMessages,
    addMessage,
    updateMessage,
    appendToMessage,
    upsertReasoningMessage,
    finalizeReasoningMessage,
    clearMessages,
    addAttachments,
    removeAttachment,
    clearAttachments
  };
}
