import { useRef, useEffect } from 'react';
import './ChatPanel.css';
import { MessageBubble } from './MessageBubble';
import { TerminalBlockCard } from './TerminalBlockCard';
import type { ChatMessage } from '../../types/chat';
import type { CommandApproval, TerminalCommandBlock } from '../../types/terminal';

type ChatPanelProps = {
  messages: ChatMessage[];
  terminalBlocks?: TerminalCommandBlock[];
  terminalError?: string | null;
  expandedTerminalBlockIds?: string[];
  selectedTerminalBlockId?: string | null;
  isOpen: boolean;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
  onCollapseTerminalBlock?: (blockId: string) => void;
  onExpandTerminalBlock?: (blockId: string) => void;
  onSelectTerminalBlock?: (blockId: string | null) => void;
};

type TimelineItem =
  | { id: string; kind: 'message'; at: number; order: number; message: ChatMessage }
  | { id: string; kind: 'terminal-block'; at: number; order: number; block: TerminalCommandBlock }
  | { id: string; kind: 'terminal-error'; at: number; order: number; error: string };

function timeFromMessage(message: ChatMessage) {
  if (message.createdAt) {
    const createdAt = Date.parse(message.createdAt);
    if (Number.isFinite(createdAt)) return createdAt;
  }

  const idParts = message.id.split('-');
  const timestamp = Number(idParts[idParts.length - 1]);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function timeFromBlock(block: TerminalCommandBlock) {
  const timestamp = Date.parse(block.startedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function ChatPanel({
  messages,
  terminalBlocks = [],
  terminalError,
  expandedTerminalBlockIds = [],
  selectedTerminalBlockId,
  isOpen,
  onRequestCommandApproval,
  onCollapseTerminalBlock,
  onExpandTerminalBlock,
  onSelectTerminalBlock
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasContent = messages.length > 0 || terminalBlocks.length > 0 || Boolean(terminalError);
  const messageItems = messages
    .filter(m => m.role !== 'tool') // Don't show tool outputs as bubbles, terminal blocks handle them
    .map((message, order) => ({
      id: message.id,
      kind: 'message' as const,
      at: timeFromMessage(message),
      order,
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
  const timelineItems: TimelineItem[] = [
    ...messageItems,
    ...blockItems,
    ...terminalErrorItem
  ].sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    return left.order - right.order;
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, terminalBlocks]);

  return (
    <div className={`chat-region ${isOpen ? 'open' : 'closed'}`}>
      {hasContent ? (
        <div ref={scrollRef} className="chat-scroll">
          <div className="chat-spacer" />
          {timelineItems.map((item) => {
            if (item.kind === 'message') {
              return (
                <MessageBubble
                  key={item.id}
                  message={item.message}
                  onRequestCommandApproval={onRequestCommandApproval}
                />
              );
            }

            if (item.kind === 'terminal-block') {
              return (
                <div key={item.id} className="terminal-block-row">
                  <div className="role-avatar-container" />
                  <TerminalBlockCard
                    block={item.block}
                    isExpanded={expandedTerminalBlockIds.includes(item.block.id)}
                    isSelected={selectedTerminalBlockId === item.block.id}
                    onCollapse={(blockId) => onCollapseTerminalBlock?.(blockId)}
                    onExpand={(blockId) => onExpandTerminalBlock?.(blockId)}
                    onSelect={(blockId) => onSelectTerminalBlock?.(blockId)}
                  />
                </div>
              );
            }

            return (
              <div key={item.id} className="terminal-error-row">
                <div className="role-avatar-container" />
                <div className="terminal-inline-error">{item.error}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="chat-empty">
          <div className="chat-empty-kicker">Octomus AI</div>
          <h1>How can I help you today?</h1>
          <p>
            Ask a question, find a command, or troubleshoot an issue.
            Octomus AI is here to help you move faster.
          </p>
          <div className="suggestions-row">
            <button className="suggestion-chip">How do I undo a git commit?</button>
            <button className="suggestion-chip">Find all files larger than 1GB</button>
            <button className="suggestion-chip">Explain my last terminal error</button>
          </div>
        </div>
      )}
    </div>
  );
}
