import type { AgentRunStatus, ChatMessage } from '../../types/chat';

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
    ? sentences.slice(0, 3).join(' ')
    : normalized;

  if (summary.length <= 220) {
    return summary;
  }

  const clipped = summary.slice(0, 217).replace(/\s+\S*$/, '');
  return `${clipped}...`;
}

function calculateThinkingDurationSeconds(startedAt?: string, nowMs = Date.now()) {
  if (!startedAt) {
    return 1;
  }

  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) {
    return 1;
  }

  const elapsedSeconds = (nowMs - startedMs) / 1000;
  return Math.max(1, Math.round(elapsedSeconds));
}

function assistantIncludesToolCall(message: ChatMessage, toolCallId: string) {
  if (message.toolCallId === toolCallId) {
    return true;
  }

  return Array.isArray(message.toolCalls)
    && message.toolCalls.some((toolCall) => toolCall?.id === toolCallId);
}

export function settleAssistantMessagesForResolvedTool(
  messages: ChatMessage[],
  params: {
    toolCallId: string;
    assistantStatus?: Extract<AgentRunStatus, 'completed' | 'cancelled' | 'failed'>;
    nowMs?: number;
  }
) {
  const { toolCallId, assistantStatus = 'completed', nowMs = Date.now() } = params;

  let assistantMessageId: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' && assistantIncludesToolCall(message, toolCallId)) {
      assistantMessageId = message.id;
      break;
    }
  }

  if (!assistantMessageId) {
    return messages;
  }

  return messages.map((message) => {
    if (message.id === assistantMessageId) {
      return {
        ...message,
        status: assistantStatus,
        isStreaming: false,
        hasNativeThinking: true
      };
    }

    if (message.messageKind === 'reasoning' && message.parentMessageId === assistantMessageId) {
      return {
        ...message,
        body: summarizeReasoningText(message.body),
        isStreaming: false,
        status: 'completed' as const,
        thinkingDurationSeconds: message.thinkingDurationSeconds
          ?? calculateThinkingDurationSeconds(message.createdAt, nowMs)
      };
    }

    return message;
  });
}
