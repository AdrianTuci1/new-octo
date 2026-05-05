import './WorkspaceSidebar.css';
import {
  MessageSquare,
  Folder,
  Search,
  History,
  X,
  Plus,
  ChevronDown,
  Circle,
  CheckCircle2,
  MoreHorizontal
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { WorkspaceConversation } from './workspaceChromeTypes';
import { FileExplorer } from './FileExplorer';
import { useEditorStore } from '../../../stores/editorStore';

interface WorkspaceSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: WorkspaceConversation[];
  openConversationIds: string[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onForkConversationInNewTab: (id: string) => void;
  onForkConversationInNewPane: (id: string) => void;
  activeWorkingDirectory?: string | null;
}

type SidebarMenu = 'chat' | 'files' | 'search' | 'history';

export function WorkspaceSidebar({
  isOpen,
  onClose,
  conversations,
  openConversationIds,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onForkConversationInNewPane,
  onForkConversationInNewTab,
  activeWorkingDirectory
}: WorkspaceSidebarProps) {
  const [activeMenu, setActiveMenu] = useState<SidebarMenu>('chat');
  const openFile = useEditorStore((state) => state.openFile);
  const [menuConversationId, setMenuConversationId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openConversationIdSet = new Set(openConversationIds);
  const activeConversations = conversations.filter((conversation) => openConversationIdSet.has(conversation.id));
  const pastConversations = conversations.filter((conversation) => !openConversationIdSet.has(conversation.id));

  useEffect(() => {
    if (!menuConversationId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setMenuConversationId(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [menuConversationId]);

  const renderConversationItem = (
    conversation: WorkspaceConversation,
    options?: { isActiveGroup?: boolean; isSelected?: boolean }
  ) => (
    <div
      key={conversation.id}
      className={`workspace-sidebar-item ${options?.isSelected ? 'active' : ''}`}
    >
      <button
        className="workspace-sidebar-item-button"
        type="button"
        onClick={() => onSelectConversation(conversation.id)}
      >
        <div className="item-icon-container">
          {options?.isActiveGroup ? (
            <Circle size={14} fill="#c084fc" color="#c084fc" />
          ) : (
            <CheckCircle2 size={14} color="#5ef1a1" />
          )}
        </div>
        <div className="item-details">
          <span className="item-title">{conversation.title}</span>
          <div className="item-meta">
            <span className="item-prefix">{conversation.branchLabel ?? '~'}</span>
            <span className="item-time">{conversation.timeLabel}</span>
          </div>
        </div>
      </button>

      <div className="workspace-sidebar-item-menu-anchor">
        <button
          className="workspace-sidebar-item-menu-button"
          type="button"
          aria-label={`More actions for ${conversation.title}`}
          onClick={(event) => {
            event.stopPropagation();
            setMenuConversationId((current) => current === conversation.id ? null : conversation.id);
          }}
        >
          <MoreHorizontal size={14} />
        </button>

        {menuConversationId === conversation.id && (
          <div ref={menuRef} className="workspace-sidebar-context-menu">
            <button
              type="button"
              onClick={() => {
                setMenuConversationId(null);
                onDeleteConversation(conversation.id);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuConversationId(null);
                onForkConversationInNewPane(conversation.id);
              }}
            >
              Fork in new pane
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuConversationId(null);
                onForkConversationInNewTab(conversation.id);
              }}
            >
              Fork in new tab
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`workspace-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="workspace-sidebar-header">
        <div className="workspace-sidebar-nav">
          <button
            className={`workspace-sidebar-nav-btn ${activeMenu === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveMenu('chat')}
          >
            <MessageSquare size={18} strokeWidth={1.8} />
          </button>
          <button
            className={`workspace-sidebar-nav-btn ${activeMenu === 'files' ? 'active' : ''}`}
            onClick={() => setActiveMenu('files')}
          >
            <Folder size={18} strokeWidth={1.8} />
          </button>
          <button
            className={`workspace-sidebar-nav-btn ${activeMenu === 'search' ? 'active' : ''}`}
            onClick={() => setActiveMenu('search')}
          >
            <Search size={18} strokeWidth={1.8} />
          </button>
          <button
            className={`workspace-sidebar-nav-btn ${activeMenu === 'history' ? 'active' : ''}`}
            onClick={() => setActiveMenu('history')}
          >
            <History size={18} strokeWidth={1.8} />
          </button>
        </div>
        <button className="workspace-sidebar-close" onClick={onClose}>
          <X size={18} strokeWidth={1.8} />
        </button>
      </div>

      {activeMenu === 'chat' && (
        <>
          <div className="workspace-sidebar-search">
            <div className="workspace-sidebar-search-container">
              <input type="text" placeholder="Search" className="workspace-sidebar-search-input" />
            </div>
          </div>

          <div className="workspace-sidebar-content">
            {activeConversations.length > 0 && (
              <div className="workspace-sidebar-group">
                <div className="workspace-sidebar-group-header">
                  <ChevronDown size={14} className="group-chevron" />
                  <span>ACTIVE</span>
                </div>

                {activeConversations.map((conversation) => (
                  renderConversationItem(conversation, {
                    isActiveGroup: true,
                    isSelected: conversation.id === selectedConversationId
                  })
                ))}
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

                {pastConversations.map((conversation) => renderConversationItem(conversation, {
                  isSelected: conversation.id === selectedConversationId
                }))}
              </div>
            )}
          </div>
        </>
      )}

      {activeMenu === 'files' && (
        <div className="workspace-sidebar-content no-padding">
          <FileExplorer 
            onFileClick={openFile} 
            initialPath={activeWorkingDirectory}
          />
        </div>
      )}

      {activeMenu === 'search' && (
        <div className="workspace-sidebar-content">
          <div className="workspace-sidebar-placeholder">Search coming soon</div>
        </div>
      )}

      {activeMenu === 'history' && (
        <div className="workspace-sidebar-content">
          <div className="workspace-sidebar-placeholder">History coming soon</div>
        </div>
      )}
    </div>
  );
}
