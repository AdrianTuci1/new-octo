import { CheckCircle2, Circle, MessageSquare, Plus } from 'lucide-react';
import './TrayConversations.css';

export type TrayConversationEntry = {
  id: string;
  title: string;
  timeLabel: string;
  branchLabel?: string | null;
};

type TrayConversationsProps = {
  conversations: TrayConversationEntry[];
  activeConversationId: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
};

export function TrayConversations({
  conversations,
  activeConversationId,
  searchQuery,
  onSearchQueryChange,
  onSelectConversation,
  onNewConversation
}: TrayConversationsProps) {
  const activeConversation = activeConversationId
    ? conversations.find((conversation) => conversation.id === activeConversationId) ?? null
    : null;
  const pastConversations = conversations.filter((conversation) => conversation.id !== activeConversation?.id);

  return (
    <section className="tray-pane tray-conversations" aria-label="Tray conversations">
      <div className="tray-conversations-toolbar">
        <button className="tray-conversations-new-btn" type="button" onClick={onNewConversation}>
          <Plus size={14} strokeWidth={2} />
          <span>New conversation</span>
        </button>
      </div>

      <div className="tray-conversations-search">
        <div className="tray-conversations-search-shell">
          <MessageSquare size={14} strokeWidth={1.8} />
          <input
            className="tray-conversations-search-input"
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search conversations"
          />
        </div>
      </div>

      <div className="tray-pane-scroll">
        <div className="tray-conversations-list">
          {activeConversation && (
            <>
              <div className="tray-conversations-group-label">CURRENT</div>
              <button
                className="tray-conversations-row active"
                type="button"
                onClick={() => onSelectConversation(activeConversation.id)}
              >
                <div className="tray-conversations-icon">
                  <Circle size={14} fill="#c084fc" color="#c084fc" />
                </div>
                <div className="tray-conversations-copy">
                  <span className="tray-conversations-title">{activeConversation.title}</span>
                  <div className="tray-conversations-meta">
                    <span>{activeConversation.branchLabel ?? '~'}</span>
                    <span>{activeConversation.timeLabel}</span>
                  </div>
                </div>
              </button>
            </>
          )}

          {pastConversations.length > 0 && (
            <>
              <div className="tray-conversations-group-label">PAST</div>
              {pastConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="tray-conversations-row"
                  type="button"
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <div className="tray-conversations-icon">
                    <CheckCircle2 size={14} color="#5ef1a1" />
                  </div>
                  <div className="tray-conversations-copy">
                    <span className="tray-conversations-title">{conversation.title}</span>
                    <div className="tray-conversations-meta">
                      <span>{conversation.branchLabel ?? '~'}</span>
                      <span>{conversation.timeLabel}</span>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {!activeConversation && pastConversations.length === 0 && (
            <div className="tray-conversations-empty">No conversations yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}
