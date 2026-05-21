import type { ChatMessage, WorkspaceExplorationArtifact } from '../../../types/chat';
import type { TerminalCommandBlock } from '../../../types/terminal';
import { extractInlineFileChangeApproval, visibleChatMessageBody } from '../../../hooks/useChat';

export type TimelineItem =
  | { id: string; kind: 'message'; at: number; order: number; message: ChatMessage }
  | { id: string; kind: 'terminal-block'; at: number; order: number; block: TerminalCommandBlock }
  | { id: string; kind: 'multi-agent-block'; at: number; order: number; block: { agentName: string; status: 'running'|'completed'|'idle'; taskSummary: string; colorScheme?: string } }
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
  const messageById = new Map(messages.map((message) => [message.id, message]));

  const messageItems = messages
    .filter(m => {
      if (m.role === 'tool' && m.toolKind === 'command') {
        return false;
      }
      if (m.role === 'assistant') {
        const visibleBody = visibleChatMessageBody(m.body);
        const isStreamingHint = m.isStreaming && !visibleBody.trim();
        const hasInlineFileChangeApproval = Boolean(extractInlineFileChangeApproval(m.body).approval);
        const hasDiffs = m.fileDiffs && m.fileDiffs.length > 0;
        if (!visibleBody.trim() && !isStreamingHint && !hasDiffs && !hasInlineFileChangeApproval) {
          return false;
        }
      }
      return true;
    })
    .map((message, order) => {
      const messageIndex = messageOrderById.get(message.id) ?? order;

      if (message.messageKind === 'reasoning' && message.parentMessageId) {
        const parentOrder = messageOrderById.get(message.parentMessageId) ?? messageIndex;
        const parentMessage = messageById.get(message.parentMessageId);
        const parentAt = parentMessage ? timeFromMessage(parentMessage) : timeFromMessage(message);
        const isBeforeParent = messageIndex < parentOrder;
        const positionOffset = messageIndex / 1_000_000;

        return {
          id: message.id,
          kind: 'message' as const,
          at: parentAt + (isBeforeParent ? -1 : 1) + positionOffset,
          order: messageIndex,
          message
        };
      }

      return {
        id: message.id,
        kind: 'message' as const,
        at: timeFromMessage(message),
        order: messageIndex,
        message
      };
    });
  const compressedMessageItems = mergeAdjacentWorkspaceExplorationMessageItems(messageItems);

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
    ...compressedMessageItems,
    ...blockItems,
    ...terminalErrorItem
  ].sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    return left.order - right.order;
  });
}

function mergeAdjacentWorkspaceExplorationMessageItems(items: TimelineItem[]): TimelineItem[] {
  const merged: TimelineItem[] = [];

  for (const item of items) {
    if (
      item.kind === 'message'
      && item.message.role === 'tool'
      && item.message.toolKind === 'workspace-exploration'
      && item.message.workspaceExploration
    ) {
      const previous = merged[merged.length - 1];
      if (
        previous?.kind === 'message'
        && previous.message.role === 'tool'
        && previous.message.toolKind === 'workspace-exploration'
        && previous.message.workspaceExploration
      ) {
        merged[merged.length - 1] = {
          ...previous,
          id: previous.id,
          at: Math.min(previous.at, item.at),
          order: previous.order,
          message: mergeWorkspaceExplorationMessages(previous.message, item.message)
        };
        continue;
      }
    }

    merged.push(item);
  }

  return merged;
}

function mergeWorkspaceExplorationMessages(
  current: ChatMessage,
  incoming: ChatMessage
): ChatMessage {
  const currentArtifact = current.workspaceExploration;
  const incomingArtifact = incoming.workspaceExploration;
  if (!currentArtifact || !incomingArtifact) {
    return incoming;
  }

  return {
    ...current,
    body: [current.body.trim(), incoming.body.trim()].filter(Boolean).join('\n\n'),
    isStreaming: incoming.isStreaming ?? current.isStreaming,
    status: incoming.status ?? current.status,
    isError: incoming.isError ?? current.isError,
    workspaceExploration: mergeWorkspaceExplorationArtifacts(currentArtifact, incomingArtifact)
  };
}

function mergeWorkspaceExplorationArtifacts(
  current: WorkspaceExplorationArtifact,
  incoming: WorkspaceExplorationArtifact
): WorkspaceExplorationArtifact {
  const currentSegments = current.segments ?? [];
  const incomingSegments = incoming.segments ?? [];
  const mergedSegments = [...currentSegments, ...incomingSegments];
  const mergedSearches = mergedSegments.flatMap((segment) => segment.searches);
  const mergedFiles = mergedSegments.flatMap((segment) => segment.files);

  return {
    query: incoming.query || current.query,
    summary: incoming.summary?.trim() || current.summary,
    segments: mergedSegments,
    searches: mergedSearches,
    files: mergedFiles
  };
}
