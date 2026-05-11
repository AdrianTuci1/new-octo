import type { ChatMessage } from '../../../types/chat';
import type { TerminalCommandBlock } from '../../../types/terminal';
import { visibleChatMessageBody } from '../../../hooks/useChat';

export type TimelineItem =
  | { id: string; kind: 'message'; at: number; order: number; message: ChatMessage }
  | { id: string; kind: 'terminal-block'; at: number; order: number; block: TerminalCommandBlock }
  | { id: string; kind: 'multi-agent-block'; at: number; order: number; block: { parentName: string; status: 'running'|'completed'|'idle'; subAgents: any[] } }
  | { id: string; kind: 'terminal-error'; at: number; order: number; error: string };

export function timeFromMessage(message: ChatMessage) {
  if (message.createdAt) {
    const createdAt = Date.parse(message.createdAt);
    if (Number.isFinite(createdAt)) return createdAt;
  }

  const idParts = message.id.split('-');
  const timestamp = Number(idParts[idParts.length - 1]);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function timeFromBlock(block: TerminalCommandBlock) {
  const timestamp = Date.parse(block.startedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function shouldRenderCollapsedBlock(
  block: TerminalCommandBlock,
  isExpanded: boolean,
  isSelected: boolean
) {
  if (block.presentation === 'conversation-link') {
    return true;
  }

  const failed = block.status === 'finished' && typeof block.exitCode === 'number' && block.exitCode !== 0;
  const succeeded = block.status === 'finished' && !failed;
  return succeeded && block.source !== 'user' && !isExpanded && !isSelected;
}

export function buildTimelineItems(
  messages: ChatMessage[],
  terminalBlocks: TerminalCommandBlock[],
  terminalError?: string | null
): TimelineItem[] {
  const messageOrderById = new Map(messages.map((message, index) => [message.id, index]));

  const messageItems = messages
    .filter(m => {
      if (m.role === 'tool' && m.toolKind === 'command') {
        return false;
      }
      if (m.role === 'assistant') {
        const visibleBody = visibleChatMessageBody(m.body);
        const isStreamingHint = m.isStreaming && !visibleBody.trim();
        const hasDiffs = m.fileDiffs && m.fileDiffs.length > 0;
        if (!visibleBody.trim() && !isStreamingHint && !hasDiffs) {
          return false;
        }
      }
      return true;
    })
    .map((message, order) => ({
      id: message.id,
      kind: 'message' as const,
      at: timeFromMessage(message),
      order: message.messageKind === 'reasoning' && message.parentMessageId
        ? (messageOrderById.get(message.parentMessageId) ?? order) - 0.5
        : order,
      message
    }));

  const blockItems = terminalBlocks.map((block, order) => ({
    id: block.id,
    kind: 'terminal-block' as const,
    at: timeFromBlock(block),
    order: messages.length + order,
    block
  }));

  const terminalErrorItem = terminalError
    ? [{
      id: 'terminal-error',
      kind: 'terminal-error' as const,
      at: Number.MAX_SAFE_INTEGER,
      order: messages.length + terminalBlocks.length,
      error: terminalError
    }]
    : [];

  return [
    ...messageItems,
    ...blockItems,
    ...terminalErrorItem
  ].sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    return left.order - right.order;
  });
}
