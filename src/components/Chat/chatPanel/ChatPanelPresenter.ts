import { shouldRenderCollapsedBlock, type TimelineItem } from '../utils/timeline';
import type { ChatPanelView } from './types';

export type TerminalTimelineRowModel = {
  className: string;
  hasUserAvatar: boolean;
  isExpanded: boolean;
  isSelected: boolean;
};

export class ChatPanelPresenter {
  constructor(private readonly view: ChatPanelView) {}

  terminalRowModel(item: Extract<TimelineItem, { kind: 'terminal-block' }>, nextItem?: TimelineItem): TerminalTimelineRowModel {
    const isExpanded = this.view.expandedTerminalBlockIds.includes(item.block.id);
    const isSelected = this.view.selectedTerminalBlockId === item.block.id;
    const isCollapsedBlock = shouldRenderCollapsedBlock(item.block, isExpanded, isSelected);
    const isConversationLink = item.block.presentation === 'conversation-link';
    const hasBottomDivider = item.block.source === 'user' && nextItem?.kind !== 'terminal-block';

    return {
      className: [
        'terminal-block-row',
        isCollapsedBlock && !isConversationLink ? '' : 'full-bleed',
        item.block.source === 'user' ? 'user-command' : 'assistant-command',
        isConversationLink ? 'conversation-link-row' : '',
        hasBottomDivider ? 'has-bottom-divider' : ''
      ].filter(Boolean).join(' '),
      hasUserAvatar: item.block.source === 'user',
      isExpanded,
      isSelected
    };
  }
}
