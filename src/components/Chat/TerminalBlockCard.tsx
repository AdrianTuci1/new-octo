import type { TerminalCommandBlock } from '../../types/terminal';
import { TerminalBlockDetail } from './TerminalBlockDetail';
import { TerminalBlockSummary } from './TerminalBlockSummary';

type TerminalBlockCardProps = {
  block: TerminalCommandBlock;
  isExpanded: boolean;
  isSelected: boolean;
  onCollapse: (blockId: string) => void;
  onExpand: (blockId: string) => void;
  onSelect: (blockId: string | null) => void;
};

export function TerminalBlockCard({
  block,
  isExpanded,
  isSelected,
  onCollapse,
  onExpand,
  onSelect
}: TerminalBlockCardProps) {
  const failed = block.status === 'finished' && typeof block.exitCode === 'number' && block.exitCode !== 0;
  const succeeded = block.status === 'finished' && !failed;
  const shouldCollapse = succeeded && !isExpanded && !isSelected;

  if (shouldCollapse) {
    return <TerminalBlockSummary block={block} onOpen={() => onExpand(block.id)} />;
  }

  return (
    <TerminalBlockDetail
      block={block}
      failed={failed}
      isSelected={isSelected}
      onClose={() => onCollapse(block.id)}
      onSelect={() => onSelect(block.id)}
    />
  );
}
