import { memo } from 'react';
import type { TerminalCommandBlock } from '../../../types/terminal';
import { TerminalBlockDetail } from './TerminalBlockDetail';
import { TerminalBlockSummary } from './TerminalBlockSummary';

type TerminalBlockCardProps = {
  block: TerminalCommandBlock;
  isExpanded: boolean;
  isSelected: boolean;
  onCollapse: (blockId: string) => void;
  onExpand: (blockId: string) => void;
  onSelect: (blockId: string | null) => void;
  onOpenConversation?: (conversationId: string) => void;
  workingDirectory?: string | null;
};

function TerminalBlockCardComponent({
  block,
  isExpanded,
  isSelected,
  onCollapse,
  onExpand,
  onSelect,
  onOpenConversation,
  workingDirectory
}: TerminalBlockCardProps) {
  if (block.presentation === 'conversation-link' && block.conversationId) {
    return <TerminalBlockSummary block={block} onOpen={() => onOpenConversation?.(block.conversationId!)} />;
  }

  const failed = block.status === 'finished' && typeof block.exitCode === 'number' && block.exitCode !== 0;
  const succeeded = block.status === 'finished' && !failed;
  const shouldCollapse = succeeded && block.source !== 'user' && !isExpanded && !isSelected;

  if (shouldCollapse) {
    return <TerminalBlockSummary key={`summary-${block.id}`} block={block} onOpen={() => onExpand(block.id)} />;
  }

  return (
    <TerminalBlockDetail
      key={`detail-${block.id}`}
      block={block}
      failed={failed}
      isSelected={isSelected}
      onClose={() => onCollapse(block.id)}
      onSelect={() => onSelect(block.id)}
      workingDirectory={workingDirectory}
    />
  );
}

export const TerminalBlockCard = memo(TerminalBlockCardComponent, (prev, next) => (
  prev.block === next.block
  && prev.isExpanded === next.isExpanded
  && prev.isSelected === next.isSelected
  && prev.onCollapse === next.onCollapse
  && prev.onExpand === next.onExpand
  && prev.onSelect === next.onSelect
  && prev.onOpenConversation === next.onOpenConversation
  && prev.workingDirectory === next.workingDirectory
));
