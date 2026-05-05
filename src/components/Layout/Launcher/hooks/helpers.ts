
import type { ChatMessage } from '../../../../types/chat';

/**
 * Generates a title for a conversation link based on existing summary or first message content.
 */
export function buildConversationLinkTitle(
  conversationId: string,
  messages: ChatMessage[],
  memoryConversations: Array<{ id: string; title: string }>
) {
  const summaryTitle = memoryConversations.find((conversation) => conversation.id === conversationId)?.title?.trim();
  if (summaryTitle) {
    return summaryTitle;
  }

  const firstMeaningfulMessage = messages.find((message) => (
    (message.role === 'assistant' || message.role === 'user')
    && message.body.trim().length > 0
  ));
  const fallbackTitle = firstMeaningfulMessage?.body
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!fallbackTitle) {
    return 'Return to AI conversation';
  }

  return fallbackTitle.length > 80 ? `${fallbackTitle.slice(0, 77)}...` : fallbackTitle;
}
