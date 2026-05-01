import { Check, ChevronRight } from 'lucide-react';
import type { TerminalCommandBlock } from '../../types/terminal';

type TerminalBlockSummaryProps = {
  block: TerminalCommandBlock;
  onOpen: () => void;
};

export function TerminalBlockSummary({ block, onOpen }: TerminalBlockSummaryProps) {
  return (
    <button className="terminal-block-summary" type="button" onClick={onOpen}>
      <span className="terminal-summary-icon">
        <Check size={15} />
      </span>
      <span className="terminal-summary-command">{block.command}</span>
      <ChevronRight className="terminal-summary-chevron" size={17} />
    </button>
  );
}
