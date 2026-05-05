import { Check, ChevronRight, Play } from 'lucide-react';
import type { TerminalCommandBlock } from '../../types/terminal';

type TerminalBlockSummaryProps = {
  block: TerminalCommandBlock;
  onOpen: () => void;
};

export function TerminalBlockSummary({ block, onOpen }: TerminalBlockSummaryProps) {
  const isConversationLink = block.presentation === 'conversation-link';
  const label = block.presentation === 'conversation-link'
    ? block.conversationTitle ?? 'Return to AI conversation'
    : block.command;

  return (
    <button
      className={`terminal-block-summary ${isConversationLink ? 'inline-link' : ''}`}
      type="button"
      onClick={onOpen}
    >
      <span className="terminal-summary-icon">
        {isConversationLink ? <Play size={14} /> : <Check size={15} />}
      </span>
      <span className="terminal-summary-command">{label}</span>
      {!isConversationLink && <ChevronRight className="terminal-summary-chevron" size={17} />}
    </button>
  );
}
