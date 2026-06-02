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
  Check,
  AlertTriangle,
  Ban
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FileExplorer } from './FileExplorer';
import { useEditorStore } from '../../../stores/editorStore';
import { useAppWindowController } from '../hooks/useAppWindowController';
import type { WorkspaceConversation } from './workspaceChromeTypes';

interface WorkspaceSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  conversations?: WorkspaceConversation[];
  openConversationIds?: string[];
  selectedConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
  onDeleteConversation?: (id: string) => void;
  onForkConversationInNewTab?: (id: string) => void;
  onForkConversationInNewPane?: (id: string) => void;
  activeWorkingDirectory?: string | null;
}

type SidebarMenu = 'chat' | 'files' | 'search' | 'history';

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  // Standalone consumers may resolve their own controller.
  // AppWindow must pass the shared state explicitly so the sidebar stays bound to the live workspace store.
  const app = props.isOpen !== undefined ? null : useAppWindowController();
  const isOpen = props.isOpen ?? (app ? app.chrome.isSidebarOpen : false);
  const onClose = props.onClose ?? (app ? app.actions.onToggleSidebar : () => {});
  const conversations = props.conversations ?? (app ? app.sidebar.workspaceConversations : []);
  const openConversationIds = props.openConversationIds ?? (app ? app.sidebar.openConversationIds : []);
  const selectedConversationId = props.selectedConversationId ?? (app ? app.sidebar.selectedOpenConversationId : null);
  const onSelectConversation = props.onSelectConversation ?? (app ? app.actions.onSelectConversation : () => {});
  const onNewConversation = props.onNewConversation ?? (app ? app.actions.onNewConversationInNewTab : () => {});
  const onDeleteConversation = props.onDeleteConversation ?? (app ? app.actions.handleDeleteConversation : () => {});
  const onForkConversationInNewTab = props.onForkConversationInNewTab ?? (app ? app.actions.handleForkConversationInNewTab : () => {});
  const onForkConversationInNewPane = props.onForkConversationInNewPane ?? (app ? app.actions.handleForkConversationInNewPane : () => {});
  const activeWorkingDirectory = props.activeWorkingDirectory ?? (app ? app.chrome.activeWorkingDirectory : null);
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
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuConversationId(conversation.id);
      }}
    >
      <button
        className="workspace-sidebar-item-button"
        type="button"
        onClick={() => onSelectConversation(conversation.id)}
      >
        <div className="sidebar-item-icon-box">
          {options?.isActiveGroup ? (
            <Circle size={10} fill="#c084fc" color="#c084fc" />
          ) : (
            <>
              {conversation.status === 'failed' && <AlertTriangle size={10} color="#ef4444" />}
              {conversation.status === 'cancelled' && <Ban size={10} color="#94a3b8" />}
              {(!conversation.status || (conversation.status !== 'failed' && conversation.status !== 'cancelled')) && (
                <Check size={10} color="#10b981" />
              )}
            </>
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
              <button className="workspace-sidebar-new-btn" type="button" onClick={() => { onNewConversation(); }}>
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
