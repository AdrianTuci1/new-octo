import './WorkspaceSidebar.css';
import { 
  MessageSquare, 
  Layers, 
  Search, 
  History, 
  X, 
  Plus, 
  ChevronDown, 
  Circle, 
  CheckCircle2 
} from 'lucide-react';
import type { WorkspaceConversation } from './workspaceChromeTypes';

interface WorkspaceSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: WorkspaceConversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

export function WorkspaceSidebar({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation
}: WorkspaceSidebarProps) {
  const selectedConversation = activeConversationId
    ? conversations.find((conversation) => conversation.id === activeConversationId) ?? null
    : null;
  const pastConversations = conversations.filter((conversation) => conversation.id !== selectedConversation?.id);

  return (
    <div className={`workspace-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="workspace-sidebar-header">
        <div className="workspace-sidebar-nav">
          <button className="workspace-sidebar-nav-btn active">
            <MessageSquare size={18} strokeWidth={1.8} />
          </button>
          <button className="workspace-sidebar-nav-btn">
            <Layers size={18} strokeWidth={1.8} />
          </button>
          <button className="workspace-sidebar-nav-btn">
            <Search size={18} strokeWidth={1.8} />
          </button>
          <button className="workspace-sidebar-nav-btn">
            <History size={18} strokeWidth={1.8} />
          </button>
        </div>
        <button className="workspace-sidebar-close" onClick={onClose}>
          <X size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="workspace-sidebar-search">
        <div className="workspace-sidebar-search-container">
          <input type="text" placeholder="Search" className="workspace-sidebar-search-input" />
        </div>
      </div>

      <div className="workspace-sidebar-content">
        {selectedConversation && (
          <div className="workspace-sidebar-group">
            <div className="workspace-sidebar-group-header">
              <ChevronDown size={14} className="group-chevron" />
              <span>ACTIVE</span>
            </div>

            <button
              className="workspace-sidebar-item active"
              type="button"
              onClick={() => onSelectConversation(selectedConversation.id)}
            >
              <div className="item-icon-container">
                <Circle size={14} fill="#c084fc" color="#c084fc" />
              </div>
              <div className="item-details">
                <span className="item-title">{selectedConversation.title}</span>
                <div className="item-meta">
                  <span className="item-prefix">{selectedConversation.branchLabel ?? '~'}</span>
                  <span className="item-time">{selectedConversation.timeLabel}</span>
                </div>
              </div>
            </button>
          </div>
        )}

        <div className="workspace-sidebar-group">
          <button className="workspace-sidebar-new-btn" type="button" onClick={onNewConversation}>
            <Plus size={16} />
            <span>New conversation</span>
          </button>
        </div>

        {pastConversations.length > 0 && (
          <div className="workspace-sidebar-group">
            <div className="workspace-sidebar-group-header">
              <ChevronDown size={14} className="group-chevron" />
              <span>PAST</span>
            </div>

            {pastConversations.map((conversation) => (
              <button
                key={conversation.id}
                className="workspace-sidebar-item"
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
              >
                <div className="item-icon-container">
                  <CheckCircle2 size={14} color="#5ef1a1" />
                </div>
                <div className="item-details">
                  <span className="item-title">{conversation.title}</span>
                  <div className="item-meta">
                    <span className="item-prefix">{conversation.branchLabel ?? '~'}</span>
                    <span className="item-time">{conversation.timeLabel}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
