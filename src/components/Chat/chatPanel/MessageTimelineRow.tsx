import { MessageBubble } from '../MessageBubble';
import type { TimelineItem } from '../utils/timeline';
import type { ChatPanelProfile, ChatPanelView, OpenFileHandler } from './types';

type MessageTimelineRowProps = {
  item: Extract<TimelineItem, { kind: 'message' }>;
  openFile: OpenFileHandler;
  profile: ChatPanelProfile;
  view: ChatPanelView;
};

export function MessageTimelineRow({ item, openFile, profile, view }: MessageTimelineRowProps) {
  return (
    <MessageBubble
      message={item.message}
      profile={profile}
      openFile={openFile}
      onRequestCommandApproval={view.onRequestCommandApproval}
    />
  );
}
