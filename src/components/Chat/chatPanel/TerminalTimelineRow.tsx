import { ProfileAvatar } from '../../App/profile/ProfileAvatar';
import { TerminalBlockCard } from '../blocks/TerminalBlockCard';
import type { TimelineItem } from '../utils/timeline';
import type { ChatPanelPresenter } from './ChatPanelPresenter';
import type { ChatPanelProfile, ChatPanelView } from './types';

type TerminalTimelineRowProps = {
  item: Extract<TimelineItem, { kind: 'terminal-block' }>;
  nextItem?: TimelineItem;
  presenter: ChatPanelPresenter;
  profile: ChatPanelProfile;
  view: ChatPanelView;
};

export function TerminalTimelineRow({
  item,
  nextItem,
  presenter,
  profile,
  view
}: TerminalTimelineRowProps) {
  const row = presenter.terminalRowModel(item, nextItem);

  return (
    <div className={row.className}>
      <div className="role-avatar-container">
        {row.hasUserAvatar ? (
          <ProfileAvatar profile={profile} size={24} showInitials={Boolean(profile.avatarDataUrl)} />
        ) : null}
      </div>
      <TerminalBlockCard
        block={item.block}
        isExpanded={row.isExpanded}
        isSelected={row.isSelected}
        onCollapse={(blockId) => view.onCollapseTerminalBlock?.(blockId)}
        onExpand={(blockId) => view.onExpandTerminalBlock?.(blockId)}
        onOpenConversation={view.onOpenConversationBlock}
        onSelect={(blockId) => view.onSelectTerminalBlock?.(blockId)}
        workingDirectory={view.workingDirectory}
      />
    </div>
  );
}
