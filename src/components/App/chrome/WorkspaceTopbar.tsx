import './WorkspaceTopbar.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDown, CircleUserRound, Inbox, LayoutGrid, PanelLeftOpen, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { WorkspaceChromeTab } from './workspaceChromeTypes';

const TAB_TINTS = ['#334155', '#134e4a', '#365314', '#7c2d12', '#6b21a8', '#1d4ed8'];

type WorkspaceTopbarProps = {
  activeTabId: string;
  launcherTabId: string | null;
  tabs: WorkspaceChromeTab[];
  onBringTabInLauncher: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onNewTerminalTab: () => void;
  onCloseTab: (tabId: string) => void;
  onMoveTab: (tabId: string, direction: 'left' | 'right') => void;
  onRemoveTabFromLauncher: (tabId: string) => void;
  onRenameTab: (tabId: string) => void;
  onSaveTabAsConfig: (tabId: string) => void;
  onSetTabTint: (tabId: string, tintColor: string | null) => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  isAgentsActive: boolean;
  onToggleAgents: () => void;
};

export function WorkspaceTopbar({
  activeTabId,
  launcherTabId,
  tabs,
  onBringTabInLauncher,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onSelectTab,
  onNewTerminalTab,
  onCloseTab,
  onMoveTab,
  onRemoveTabFromLauncher,
  onRenameTab,
  onSaveTabAsConfig,
  onSetTabTint,
  onToggleSidebar,
  isSidebarOpen,
  isAgentsActive,
  onToggleAgents
}: WorkspaceTopbarProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const dragSpacerRef = useRef<HTMLDivElement | null>(null);
  const [menuState, setMenuState] = useState<{ tabId: string; left: number; top: number } | null>(null);

  const menuTab = useMemo(
    () => tabs.find((tab) => tab.id === menuState?.tabId) ?? null,
    [menuState?.tabId, tabs]
  );
  const menuIndex = menuTab ? tabs.findIndex((tab) => tab.id === menuTab.id) : -1;

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

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.workspace-topbar-tab-menu')) {
        return;
      }

      setMenuState(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [menuState]);

  const openMenu = (tabId: string, element: HTMLElement) => {
    const headerRect = headerRef.current?.getBoundingClientRect();
    const triggerRect = element.getBoundingClientRect();
    setMenuState({
      tabId,
      left: triggerRect.left - (headerRect?.left ?? 0),
      top: triggerRect.bottom - (headerRect?.top ?? 0) + 6
    });
  };

  return (
    <header ref={headerRef} className="workspace-topbar" aria-label="Workspace tabs">
      <div className="workspace-topbar-left">
        <button 
          className={`workspace-topbar-icon-button ${isSidebarOpen ? 'active' : ''}`} 
          type="button" 
          title="Tools panel"
          onClick={onToggleSidebar}
        >
          <PanelLeftOpen size={16} strokeWidth={1.8} />
        </button>
        <button 
          className={`workspace-topbar-icon-button ${isAgentsActive ? 'active' : ''}`} 
          type="button" 
          title="Agent management panel"
          onClick={onToggleAgents}
        >
          <LayoutGrid size={16} strokeWidth={1.8} />
        </button>
        <div className="workspace-topbar-vertical-divider" />
      </div>

      <div className="workspace-topbar-tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isInLauncher = tab.id === launcherTabId;
          return (
            <div
              key={tab.id}
              className={`workspace-tab ${isActive ? 'active' : ''} ${isInLauncher ? 'launcher-bound' : ''}`}
              style={{
                '--tab-tint': tab.tintColor ?? 'transparent'
              } as CSSProperties}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(tab.id, event.currentTarget);
              }}
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
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          );
        })}
      </div>

      {menuState && menuTab && (
        <div
          className="workspace-topbar-tab-menu"
          style={{
            left: `${menuState.left}px`,
            top: `${menuState.top}px`
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMenuState(null);
              if (launcherTabId === menuTab.id) {
                onRemoveTabFromLauncher(menuTab.id);
              } else {
                onBringTabInLauncher(menuTab.id);
              }
            }}
          >
            {launcherTabId === menuTab.id ? 'Remove from launcher' : 'Bring in launcher'}
          </button>
          <button type="button" onClick={() => { setMenuState(null); onRenameTab(menuTab.id); }}>
            Rename tab
          </button>
          {menuIndex > 0 && (
            <button type="button" onClick={() => { setMenuState(null); onMoveTab(menuTab.id, 'left'); }}>
              Move tab left
            </button>
          )}
          {menuIndex >= 0 && menuIndex < tabs.length - 1 && (
            <button type="button" onClick={() => { setMenuState(null); onMoveTab(menuTab.id, 'right'); }}>
              Move tab right
            </button>
          )}
          <button type="button" onClick={() => { setMenuState(null); onCloseTab(menuTab.id); }}>
            Close tab
          </button>
          {tabs.length > 1 && (
            <button type="button" onClick={() => { setMenuState(null); onCloseOtherTabs(menuTab.id); }}>
              Close other tabs
            </button>
          )}
          {menuIndex >= 0 && menuIndex < tabs.length - 1 && (
            <button type="button" onClick={() => { setMenuState(null); onCloseTabsToRight(menuTab.id); }}>
              Close tabs to the right
            </button>
          )}
          <button type="button" onClick={() => { setMenuState(null); onSaveTabAsConfig(menuTab.id); }}>
            Save as new config
          </button>
          <div className="workspace-topbar-tab-menu-swatches">
            <button
              className={`workspace-topbar-swatch workspace-topbar-swatch-clear ${menuTab.tintColor ? '' : 'selected'}`}
              type="button"
              onClick={() => onSetTabTint(menuTab.id, null)}
              aria-label="Disable tab color"
            />
            {TAB_TINTS.map((color) => (
              <button
                key={color}
                className={`workspace-topbar-swatch ${menuTab.tintColor === color ? 'selected' : ''}`}
                type="button"
                style={{ '--swatch-color': color } as CSSProperties}
                onClick={() => onSetTabTint(menuTab.id, color)}
                aria-label={`Set tab color ${color}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="workspace-topbar-plus-group">
        <button
          className="workspace-topbar-plus-action"
          type="button"
          onClick={onNewTerminalTab}
          title="New terminal workspace"
        >
          <Plus size={18} strokeWidth={2.2} />
        </button>
        <button className="workspace-topbar-plus-menu" type="button" title="Tab options">
          <ChevronDown size={12} strokeWidth={1.8} />
        </button>
      </div>

      <div
        ref={dragSpacerRef}
        className="workspace-topbar-drag-spacer"
        aria-hidden="true"
      />


      <div className="workspace-topbar-right workspace-topbar-right-compact">
        <button className="workspace-topbar-icon-button" type="button" title="Notifications">
          <Inbox size={16} strokeWidth={1.8} />
        </button>
        <button className="workspace-topbar-icon-button" type="button" title="Account">
          <CircleUserRound size={16} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
