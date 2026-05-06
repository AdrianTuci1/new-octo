import { useLayoutEffect, useRef } from 'react';
import type { CommandApproval } from '../../../types/terminal';
import type { ChatMessage } from '../../../types/chat';
import type { TerminalCommandBlock } from '../../../types/terminal';

type UseChatPanelScrollProps = {
  messages: ChatMessage[];
  terminalBlocks: TerminalCommandBlock[];
  terminalError?: string | null;
  pendingApproval?: CommandApproval | null;
  isOpen: boolean;
  expandedTerminalBlockIds: string[];
  selectedTerminalBlockId?: string | null;
};

export function useChatPanelScroll({
  messages,
  terminalBlocks,
  terminalError,
  pendingApproval,
  isOpen,
  expandedTerminalBlockIds,
  selectedTerminalBlockId
}: UseChatPanelScrollProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollEnabled = useRef(true);
  const hadPendingApproval = useRef(false);
  const rafId = useRef<number | null>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
    isAutoScrollEnabled.current = isAtBottom;
  };

  useLayoutEffect(() => {
    const approvalJustCleared = hadPendingApproval.current && !pendingApproval;
    hadPendingApproval.current = Boolean(pendingApproval);

    const scrollContainer = scrollRef.current;
    if (!scrollContainer || !isOpen) return;

    if (isAutoScrollEnabled.current || approvalJustCleared) {
      if (rafId.current) cancelAnimationFrame(rafId.current);

      rafId.current = requestAnimationFrame(() => {
        if (scrollRef.current && (isAutoScrollEnabled.current || approvalJustCleared)) {
          const container = scrollRef.current;
          const isAlreadyAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 5;

          if (!isAlreadyAtBottom || approvalJustCleared) {
            if (approvalJustCleared) {
              isAutoScrollEnabled.current = true;
            }
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth'
            });
          }
        }
      });
    }

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [messages, terminalBlocks, terminalError, pendingApproval, isOpen, expandedTerminalBlockIds, selectedTerminalBlockId]);

  return { scrollRef, handleScroll };
}
