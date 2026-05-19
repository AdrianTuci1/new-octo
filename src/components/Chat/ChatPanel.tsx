import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { ChatEmptyState, ChatTopbar } from './layout';
import { useChatPanelScroll } from './hooks/useChatPanelScroll';
import { buildTimelineItems, shouldRenderCollapsedBlock } from './utils/timeline';
import { MessageBubble } from './MessageBubble';
import { TerminalBlockCard } from './blocks/TerminalBlockCard';
import { MultiAgentBlock } from './blocks/MultiAgentBlock';
import { CommandApprovalComposer } from '../Composer';
import { ProfileAvatar } from '../App/profile/ProfileAvatar';
import { useProfileSettings } from '../App/settings/useProfileSettings';
import { MOCK_PENDING_APPROVAL, MOCK_TIMELINE_ITEMS } from './MockTimelineItems';
import type { ChatMessage } from '../../types/chat';
import type { CommandApproval, TerminalCommandBlock } from '../../types/terminal';
import './ChatPanel.css';

const USE_MOCK = false; // Set to true only while tuning the mocked chat timeline

function performHighlight(
  container: HTMLElement,
  searchQuery: string,
  caseSensitive: boolean,
  useRegex: boolean,
  wholeWord: boolean
): HTMLSpanElement[] {
  // Remove previous highlights
  const existingHighlights = container.querySelectorAll('.chat-search-highlight');
  existingHighlights.forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
    }
  });
  container.normalize();

  if (!searchQuery) return [];

  let regex: RegExp;
  try {
    if (useRegex) {
      let pattern = searchQuery;
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    } else {
      let escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) {
        escaped = `\\b${escaped}\\b`;
      }
      regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    }
  } catch (e) {
    return [];
  }

  const highlightSpans: HTMLSpanElement[] = [];

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || '';
      if (!text.trim()) return;

      const parentElement = node.parentElement;
      if (parentElement) {
        const tagName = parentElement.tagName.toLowerCase();
        if (
          tagName === 'script' ||
          tagName === 'style' ||
          parentElement.classList.contains('chat-search-highlight') ||
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'button'
        ) {
          return;
        }
      }

      regex.lastIndex = 0;
      const matchesList: { start: number; end: number }[] = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
        matchesList.push({ start: match.index, end: match.index + match[0].length });
        if (!regex.global) break;
      }

      if (matchesList.length > 0 && parentElement) {
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        matchesList.forEach(({ start, end }) => {
          if (start > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, start)));
          }

          const span = document.createElement('span');
          span.className = 'chat-search-highlight';
          span.textContent = text.substring(start, end);
          fragment.appendChild(span);
          highlightSpans.push(span);

          lastIndex = end;
        });

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }

        parentElement.replaceChild(fragment, node);
      }
    } else {
      const children = Array.from(node.childNodes);
      children.forEach(traverse);
    }
  }

  traverse(container);
  return highlightSpans;
}


type EmptyStateVariant = 'default' | 'workspace';

export type ChatPanelProps = {
  messages: ChatMessage[];
  terminalBlocks?: TerminalCommandBlock[];
  terminalError?: string | null;
  expandedTerminalBlockIds?: string[];
  selectedTerminalBlockId?: string | null;
  isOpen: boolean;
  emptyStateVariant?: EmptyStateVariant;
  showEmptyTopbar?: boolean;
  pendingApproval?: CommandApproval | null;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
  onRefinePendingApproval?: (approval: CommandApproval) => void;
  onEditPendingApproval?: (approval: CommandApproval) => void;
  onAcceptPendingApproval?: (approval: CommandApproval) => void;
  onAutoApprovePendingApproval?: (approval: CommandApproval) => void;
  onStartNewConversationPendingApproval?: () => void;
  onContinueCurrentConversationPendingApproval?: () => void;
  onCollapseTerminalBlock?: (blockId: string) => void;
  onExpandTerminalBlock?: (blockId: string) => void;
  onSelectTerminalBlock?: (blockId: string | null) => void;
  onOpenConversationBlock?: (conversationId: string) => void;
  title?: string;
};

export function ChatPanel({
  messages,
  terminalBlocks = [],
  terminalError,
  expandedTerminalBlockIds = [],
  selectedTerminalBlockId,
  isOpen,
  emptyStateVariant = 'default',
  showEmptyTopbar = false,
  pendingApproval,
  onRequestCommandApproval,
  onRefinePendingApproval,
  onEditPendingApproval,
  onAcceptPendingApproval,
  onAutoApprovePendingApproval,
  onStartNewConversationPendingApproval,
  onContinueCurrentConversationPendingApproval,
  onCollapseTerminalBlock,
  onExpandTerminalBlock,
  onSelectTerminalBlock,
  onOpenConversationBlock,
  title = 'New agent conversation'
}: ChatPanelProps) {
  const { profile } = useProfileSettings();
  const baseTimelineItems = buildTimelineItems(messages, terminalBlocks, terminalError);
  const timelineItems = USE_MOCK ? MOCK_TIMELINE_ITEMS : baseTimelineItems;
  const activePendingApproval = USE_MOCK ? MOCK_PENDING_APPROVAL : pendingApproval;
  const hasContent = USE_MOCK || messages.length > 0 || terminalBlocks.length > 0 || Boolean(terminalError) || Boolean(activePendingApproval);

  const { scrollRef, handleScroll } = useChatPanelScroll({
    messages,
    terminalBlocks,
    terminalError,
    pendingApproval: activePendingApproval,
    isOpen,
    expandedTerminalBlockIds,
    selectedTerminalBlockId
  });

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<HTMLSpanElement[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Perform highlight whenever search parameters, messages, blocks, or pending approvals change
  useEffect(() => {
    if (!scrollRef.current) return;

    const foundSpans = performHighlight(
      scrollRef.current,
      searchQuery,
      caseSensitive,
      useRegex,
      wholeWord
    );

    setMatches(foundSpans);

    if (foundSpans.length > 0) {
      setActiveIndex(0);
    } else {
      setActiveIndex(-1);
    }
  }, [searchQuery, caseSensitive, useRegex, wholeWord, messages, terminalBlocks, activePendingApproval]);

  // Handle active match changes (scrolling and active class highlight)
  useEffect(() => {
    matches.forEach((span) => span.classList.remove('active'));

    if (activeIndex >= 0 && activeIndex < matches.length) {
      const activeSpan = matches[activeIndex];
      activeSpan.classList.add('active');
      activeSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, matches]);

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % matches.length);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  // Listen for Cmd+F / Ctrl+F and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdF = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f';
      if (isCmdF) {
        e.preventDefault();
        setIsFindOpen(true);
        setTimeout(() => {
          const input = document.getElementById('chat-find-input');
          if (input) {
            input.focus();
            (input as HTMLInputElement).select();
          }
        }, 50);
      } else if (e.key === 'Escape' && isFindOpen) {
        e.preventDefault();
        setIsFindOpen(false);
        setSearchQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFindOpen]);

  return (
    <div className={`chat-region ${isOpen ? 'open' : 'closed'}`}>
      <ChatTopbar title={title} show={emptyStateVariant === 'workspace' && showEmptyTopbar} />

      {isFindOpen && (
        <div className="chat-finder-overlay">
          <div className="chat-finder-input-container">
            <input
              id="chat-find-input"
              type="text"
              placeholder="Find"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    handlePrevMatch();
                  } else {
                    handleNextMatch();
                  }
                }
              }}
            />
            <div className="chat-finder-input-actions">
              <button
                type="button"
                className={`chat-finder-toggle-btn ${useRegex ? 'active' : ''}`}
                onClick={() => setUseRegex(!useRegex)}
                title="Use Regular Expression"
              >
                .*
              </button>
              <button
                type="button"
                className={`chat-finder-toggle-btn ${caseSensitive ? 'active' : ''}`}
                onClick={() => setCaseSensitive(!caseSensitive)}
                title="Match Case"
              >
                Aa
              </button>
              <button
                type="button"
                className={`chat-finder-toggle-btn ${wholeWord ? 'active' : ''}`}
                onClick={() => setWholeWord(!wholeWord)}
                title="Match Whole Word"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="chat-finder-count">
            {matches.length > 0 ? `${activeIndex + 1}/${matches.length}` : '0/0'}
          </div>
          <div className="chat-finder-nav-actions">
            <button
              type="button"
              className="chat-finder-nav-btn"
              onClick={handleNextMatch}
              disabled={matches.length === 0}
              title="Next Match (Enter)"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="chat-finder-nav-btn"
              onClick={handlePrevMatch}
              disabled={matches.length === 0}
              title="Previous Match (Shift+Enter)"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="chat-finder-nav-btn close"
              onClick={() => {
                setIsFindOpen(false);
                setSearchQuery('');
              }}
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {hasContent ? (
        <div ref={scrollRef} className="chat-scroll" onScroll={handleScroll}>
          <div className="chat-spacer" />
          {timelineItems.map((item, itemIndex) => {
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
              const nextItem = itemIndex >= 0 ? timelineItems[itemIndex + 1] : undefined;
              const isExpanded = expandedTerminalBlockIds.includes(item.block.id);
              const isSelected = selectedTerminalBlockId === item.block.id;
              const isCollapsedBlock = shouldRenderCollapsedBlock(item.block, isExpanded, isSelected);
              const isConversationLink = item.block.presentation === 'conversation-link';
              const hasBottomDivider = item.block.source === 'user' && nextItem?.kind !== 'terminal-block';

              return (
                <div
                  key={item.id}
                  className={[
                    'terminal-block-row',
                    isCollapsedBlock && !isConversationLink ? '' : 'full-bleed',
                    item.block.source === 'user' ? 'user-command' : 'assistant-command',
                    isConversationLink ? 'conversation-link-row' : '',
                    hasBottomDivider ? 'has-bottom-divider' : ''
                  ].filter(Boolean).join(' ')}
                >
                  <div className="role-avatar-container">
                    {item.block.source === 'user' ? <ProfileAvatar profile={profile} size={24} showInitials={Boolean(profile.avatarDataUrl)} /> : null}
                  </div>
                  <TerminalBlockCard
                    block={item.block}
                    isExpanded={isExpanded}
                    isSelected={isSelected}
                    onCollapse={(blockId) => onCollapseTerminalBlock?.(blockId)}
                    onExpand={(blockId) => onExpandTerminalBlock?.(blockId)}
                    onOpenConversation={onOpenConversationBlock}
                    onSelect={(blockId) => onSelectTerminalBlock?.(blockId)}
                  />
                </div>
              );
            }

            if (item.kind === 'multi-agent-block') {
              return (
                <div key={item.id} className="agent-block-row-standalone">
                  <MultiAgentBlock
                    agentName={item.block.agentName}
                    status={item.block.status}
                    taskSummary={item.block.taskSummary}
                    colorScheme={item.block.colorScheme}
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
          {activePendingApproval && (
            <div className="command-approval-row">
              <CommandApprovalComposer
                approval={activePendingApproval}
                onRefine={() => onRefinePendingApproval?.(activePendingApproval)}
                onEdit={() => onEditPendingApproval?.(activePendingApproval)}
                onAccept={() => onAcceptPendingApproval?.(activePendingApproval)}
                onAutoApprove={() => onAutoApprovePendingApproval?.(activePendingApproval)}
                onStartNewConversation={activePendingApproval.kind === 'topic-change' ? onStartNewConversationPendingApproval : undefined}
                onContinueCurrentConversation={activePendingApproval.kind === 'topic-change' ? onContinueCurrentConversationPendingApproval : undefined}
              />
            </div>
          )}
        </div>
      ) : (
        <ChatEmptyState variant={emptyStateVariant} />
      )}
    </div>
  );
}
