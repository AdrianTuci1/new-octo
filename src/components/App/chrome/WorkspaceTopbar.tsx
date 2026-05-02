import './WorkspaceTopbar.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDown, CircleUserRound, Inbox, LayoutGrid, PanelLeftOpen, Plus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { WorkspaceChromeTab } from './workspaceChromeTypes';

type WorkspaceTopbarProps = {
  activeTabId: string;
  tabs: WorkspaceChromeTab[];
  onSelectTab: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  onToggleSidebar: () => void;
};

export function WorkspaceTopbar({
  activeTabId,
  tabs,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onToggleSidebar
}: WorkspaceTopbarProps) {
  const dragSpacerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = dragSpacerRef.current;
    if (!element) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.buttons !== 1) {
        return;
      }

      event.preventDefault();
      void getCurrentWindow().startDragging().catch(() => {
        // Best-effort drag. If the window refuses the drag, we leave it alone.
      });
    };

    element.addEventListener('mousedown', onMouseDown);
    return () => element.removeEventListener('mousedown', onMouseDown);
  }, []);

  return (
    <header className="workspace-topbar" aria-label="Workspace tabs">
      <div className="workspace-topbar-left">
        <button 
          className="workspace-topbar-icon-button" 
          type="button" 
          title="Tools panel"
          onClick={onToggleSidebar}
        >
          <PanelLeftOpen size={14} strokeWidth={1.8} />
        </button>
        <button className="workspace-topbar-icon-button" type="button" title="Agent management panel">
          <LayoutGrid size={14} strokeWidth={1.8} />
        </button>
        <div className="workspace-topbar-vertical-divider" />
      </div>

      <div className="workspace-topbar-tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`workspace-tab ${isActive ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectTab(tab.id);
                }
              }}
            >
              <span className="workspace-tab-label">{tab.label}</span>
              <button
                className="workspace-tab-close"
                type="button"
                aria-label={`Close ${tab.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="workspace-topbar-plus-group">
        <button className="workspace-topbar-plus-action" type="button" onClick={onNewTab} title="New tab">
          <Plus size={16} strokeWidth={2.2} />
        </button>
        <button className="workspace-topbar-plus-menu" type="button" title="Tab options">
          <ChevronDown size={10} strokeWidth={1.8} />
        </button>
      </div>

      <div
        ref={dragSpacerRef}
        className="workspace-topbar-drag-spacer"
        aria-hidden="true"
      />


      <div className="workspace-topbar-right workspace-topbar-right-compact">
        <button className="workspace-topbar-icon-button" type="button" title="Notifications">
          <Inbox size={14} strokeWidth={1.8} />
        </button>
        <button className="workspace-topbar-icon-button" type="button" title="Account">
          <CircleUserRound size={14} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
