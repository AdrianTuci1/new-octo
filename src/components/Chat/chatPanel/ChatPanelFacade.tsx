import { useMemo } from 'react';
import { useProfileSettings } from '../../App/settings/useProfileSettings';
import { useEditorStore } from '../../../stores/editorStore';
import { ChatEmptyState, ChatTopbar } from '../layout';
import { useChatPanelController } from '../hooks/useChatPanelController';
import { ChatFindOverlay } from './ChatFindOverlay';
import { ChatPanelPresenter } from './ChatPanelPresenter';
import { ChatTimeline } from './ChatTimeline';
import type { ChatPanelView } from './types';

type ChatPanelFacadeProps = {
  view: ChatPanelView;
};

export function ChatPanelFacade({ view }: ChatPanelFacadeProps) {
  const controller = useChatPanelController(view);
  const { profile } = useProfileSettings();
  const openFile = useEditorStore((state) => state.openFile);
  const presenter = useMemo(() => new ChatPanelPresenter(view), [view]);

  return (
    <div className={`chat-region ${view.isOpen ? 'open' : 'closed'}`}>
      <ChatTopbar title={view.title} show={view.emptyStateVariant === 'workspace' && view.showEmptyTopbar} />
      <ChatFindOverlay find={controller.find} />

      {controller.hasContent ? (
        <ChatTimeline
          controller={controller}
          openFile={openFile}
          presenter={presenter}
          profile={profile}
          view={view}
        />
      ) : (
        <ChatEmptyState variant={view.emptyStateVariant} />
      )}
    </div>
  );
}
