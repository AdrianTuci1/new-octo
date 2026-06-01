import type { useChatPanelController } from '../hooks/useChatPanelController';
import { ChatPanelPresenter } from './ChatPanelPresenter';
import { CommandApprovalRow } from './CommandApprovalRow';
import { MessageTimelineRow } from './MessageTimelineRow';
import { MultiAgentTimelineRow } from './MultiAgentTimelineRow';
import { TerminalErrorRow } from './TerminalErrorRow';
import { TerminalTimelineRow } from './TerminalTimelineRow';
import type { ChatPanelProfile, ChatPanelView, OpenFileHandler } from './types';

type ChatTimelineProps = {
  controller: ReturnType<typeof useChatPanelController>;
  openFile: OpenFileHandler;
  presenter: ChatPanelPresenter;
  profile: ChatPanelProfile;
  view: ChatPanelView;
};

export function ChatTimeline({
  controller,
  openFile,
  presenter,
  profile,
  view
}: ChatTimelineProps) {
  return (
    <div ref={controller.scrollRef} className="chat-scroll" onScroll={controller.handleScroll}>
      <div className="chat-spacer" />
      {controller.timelineItems.map((item, itemIndex) => {
        if (item.kind === 'message') {
          return (
            <MessageTimelineRow
              key={item.id}
              item={item}
              openFile={openFile}
              profile={profile}
              view={view}
            />
          );
        }

        if (item.kind === 'terminal-block') {
          return (
            <TerminalTimelineRow
              key={item.id}
              item={item}
              nextItem={controller.timelineItems[itemIndex + 1]}
              presenter={presenter}
              profile={profile}
              view={view}
            />
          );
        }

        if (item.kind === 'multi-agent-block') {
          return <MultiAgentTimelineRow key={item.id} item={item} />;
        }

        return <TerminalErrorRow key={item.id} item={item} />;
      })}
      <CommandApprovalRow approval={controller.activePendingApproval} view={view} />
    </div>
  );
}
