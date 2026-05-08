import './WorkspaceTopbar.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDown, Inbox, LayoutGrid, PanelLeftOpen, Plus, X, GitBranch, ChevronRight, Rocket } from 'lucide-react';
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
  onOpenSettingsSection: (sectionId?: string) => void;
  onOpenKeyboardShortcutsDrawer: () => void;
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
  onToggleAgents,
  onOpenSettingsSection,
  onOpenKeyboardShortcutsDrawer
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

  const [accountMenuState, setAccountMenuState] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!accountMenuState) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.workspace-topbar-account-menu')) {
        return;
      }

      setAccountMenuState(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [accountMenuState]);

  const openAccountMenu = (element: HTMLElement) => {
    const headerRect = headerRef.current?.getBoundingClientRect();
    const triggerRect = element.getBoundingClientRect();
    setAccountMenuState({
      left: triggerRect.right - (headerRect?.left ?? 0) - 180,
      top: triggerRect.bottom - (headerRect?.top ?? 0) + 6
    });
  };

  const [plusMenuState, setPlusMenuState] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!plusMenuState) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.workspace-topbar-plus-context-menu')) {
        return;
      }

      setPlusMenuState(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [plusMenuState]);

  const openPlusMenu = (element: HTMLElement) => {
    const headerRect = headerRef.current?.getBoundingClientRect();
    const triggerRect = element.getBoundingClientRect();
    setPlusMenuState({
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
              {isInLauncher && <Rocket size={10} className="workspace-tab-rocket-icon" />}
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
        <button
          className="workspace-topbar-plus-menu"
          type="button"
          title="Tab options"
          onClick={(e) => openPlusMenu(e.currentTarget)}
        >
          <ChevronDown size={12} strokeWidth={1.8} />
        </button>
      </div>

      {plusMenuState && (
        <div
          className="workspace-topbar-plus-context-menu"
          style={{
            left: `${plusMenuState.left}px`,
            top: `${plusMenuState.top}px`
          }}
        >
          <div className="plus-context-menu-main">
            <button type="button" className="active" onClick={() => setPlusMenuState(null)}>
              <span className="plus-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 3v18" />
                </svg>
              </span>
              <span className="plus-menu-label">Agent</span>
            </button>
            <button type="button" onClick={() => { setPlusMenuState(null); onNewTerminalTab(); }}>
              <span className="plus-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 3v18" />
                </svg>
              </span>
              <span className="plus-menu-label">Terminal</span>
              <span className="plus-menu-shortcut">⌘T</span>
            </button>
            <button type="button" onClick={() => setPlusMenuState(null)}>
              <span className="plus-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 3v18" />
                </svg>
              </span>
              <span className="plus-menu-label">Cloud Oz</span>
            </button>
            <button type="button" onClick={() => setPlusMenuState(null)}>
              <span className="plus-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 3v18" />
                </svg>
              </span>
              <span className="plus-menu-label">My Tab Config</span>
            </button>
            <button type="button" onClick={() => setPlusMenuState(null)}>
              <span className="plus-menu-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 3v18" />
                </svg>
              </span>
              <span className="plus-menu-label">New tab: adriantucicovenco</span>
            </button>
            <div className="plus-context-menu-divider" />
            <button type="button" onClick={() => setPlusMenuState(null)}>
              <span className="plus-menu-icon">
                <GitBranch size={14} />
              </span>
              <span className="plus-menu-label">New worktree config</span>
              <span className="plus-menu-chevron">
                <ChevronRight size={12} />
              </span>
            </button>
            <button type="button" onClick={() => setPlusMenuState(null)}>
              <span className="plus-menu-icon">
                <Plus size={14} />
              </span>
              <span className="plus-menu-label">New tab config</span>
            </button>
          </div>
          
          <div className="plus-context-menu-sidebar">
            <div className="plus-sidebar-title">Agent</div>
            <button type="button" className="make-default-btn" onClick={() => setPlusMenuState(null)}>
              Make default
            </button>
          </div>
        </div>
      )}

      <div
        ref={dragSpacerRef}
        className="workspace-topbar-drag-spacer"
        aria-hidden="true"
      />


      {accountMenuState && (
        <div
          className="workspace-topbar-account-menu"
          style={{
            left: `${accountMenuState.left}px`,
            top: `${accountMenuState.top}px`
          }}
        >
          <button type="button" onClick={() => { setAccountMenuState(null); console.log("What's New clicked"); }}>
            What's New
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountMenuState(null);
              onOpenSettingsSection();
            }}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountMenuState(null);
              onOpenKeyboardShortcutsDrawer();
            }}
          >
            Keyboard Shortcuts
          </button>
          <button type="button" onClick={() => { setAccountMenuState(null); console.log("View Logs clicked"); }}>
            View Logs
          </button>
          <div className="workspace-topbar-account-menu-divider" />
          <button type="button" className="sign-out-btn" onClick={() => { setAccountMenuState(null); console.log("Sign In/Sign Out clicked"); }}>
            Sign Out
          </button>
        </div>
      )}

      <div className="workspace-topbar-right workspace-topbar-right-compact">
        <button className="workspace-topbar-icon-button" type="button" title="Notifications">
          <Inbox size={16} strokeWidth={1.8} />
        </button>
        <button
          className="workspace-topbar-avatar-button"
          type="button"
          title="Account options"
          onClick={(e) => openAccountMenu(e.currentTarget)}
        >
          <div className="workspace-topbar-avatar">AT</div>
        </button>
      </div>
    </header>
  );
}
