import './WorkspaceTopbar.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDown, ChevronRight, Cloud, GitBranch, Inbox, LayoutGrid, PanelLeftOpen, Plus, Search, Server, Sparkles, TerminalSquare } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceChromeTab } from './workspaceChromeTypes';
import { WorkspaceTopbarTab } from './WorkspaceTopbarTab';
import { WorkspaceTopbarTabMenu } from './WorkspaceTopbarTabMenu';
import type { LucideIcon } from 'lucide-react';

type PlusMenuItem = {
  id: 'agent' | 'terminal' | 'cloud-term' | 'my-tab-config' | 'named-tab-config' | 'worktree-config' | 'tab-config';
  label: string;
  action: 'new-terminal' | 'open-cloud-settings' | 'none';
  shortcut?: string;
  icon: LucideIcon;
  hasChevron?: boolean;
};

const PLUS_MENU_ITEMS: PlusMenuItem[] = [
  {
    id: 'agent',
    label: 'Agent',
    action: 'new-terminal',
    icon: Sparkles
  },
  {
    id: 'terminal',
    label: 'Terminal',
    action: 'new-terminal',
    shortcut: '⌘T',
    icon: TerminalSquare
  },
  {
    id: 'cloud-term',
    label: 'Cloud term',
    action: 'open-cloud-settings',
    icon: Cloud
  },
  {
    id: 'my-tab-config',
    label: 'My tab config',
    action: 'none',
    icon: Server
  },
  {
    id: 'named-tab-config',
    label: 'New tab: adriantucicovenco',
    action: 'none',
    icon: Server
  },
  {
    id: 'worktree-config',
    label: 'New worktree config',
    action: 'none',
    icon: GitBranch,
    hasChevron: true
  },
  {
    id: 'tab-config',
    label: 'New tab config',
    action: 'none',
    icon: Plus
  }
];

const DEFAULT_PLUS_ITEM_ID: PlusMenuItem['id'] = 'terminal';

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
  const [selectedPlusItemId, setSelectedPlusItemId] = useState<PlusMenuItem['id']>('agent');
  const [defaultPlusItemId, setDefaultPlusItemId] = useState<PlusMenuItem['id']>(DEFAULT_PLUS_ITEM_ID);

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
    setSelectedPlusItemId(defaultPlusItemId);
    setPlusMenuState({
      left: triggerRect.left - (headerRect?.left ?? 0),
      top: triggerRect.bottom - (headerRect?.top ?? 0) + 6
    });
  };

  const defaultPlusItem = useMemo(
    () => PLUS_MENU_ITEMS.find((item) => item.id === defaultPlusItemId) ?? PLUS_MENU_ITEMS[0],
    [defaultPlusItemId]
  );
  const isWorktreeSubmenuOpen = plusMenuState && selectedPlusItemId === 'worktree-config';
  const selectedPlusItem = useMemo(
    () => PLUS_MENU_ITEMS.find((item) => item.id === selectedPlusItemId) ?? PLUS_MENU_ITEMS[0],
    [selectedPlusItemId]
  );

  const handlePlusItemAction = (item: PlusMenuItem) => {
    if (item.action === 'new-terminal') {
      setPlusMenuState(null);
      onNewTerminalTab();
      return;
    }

    if (item.action === 'open-cloud-settings') {
      setPlusMenuState(null);
      onOpenSettingsSection('cloud-platform/cloud');
      return;
    }

    setSelectedPlusItemId(item.id);
    if (item.id !== 'worktree-config') {
      setPlusMenuState(null);
    }
  };

  const handleMakeDefault = () => {
    if (selectedPlusItem.id === 'worktree-config' || selectedPlusItem.id === defaultPlusItemId) {
      return;
    }

    setDefaultPlusItemId(selectedPlusItem.id);
  };

  const handlePrimaryPlusAction = () => {
    handlePlusItemAction(defaultPlusItem);
  };

  const renderPlusMenuItem = (item: PlusMenuItem) => {
    const Icon = item.icon;
    const isSelected = item.id === selectedPlusItemId;

    return (
      <button
        key={item.id}
        type="button"
        className={isSelected ? 'active' : ''}
        onMouseEnter={() => setSelectedPlusItemId(item.id)}
        onFocus={() => setSelectedPlusItemId(item.id)}
        onClick={() => handlePlusItemAction(item)}
      >
        <span className="plus-menu-icon">
          <Icon size={14} />
        </span>
        <span className="plus-menu-label">{item.label}</span>
        {item.shortcut ? <span className="plus-menu-shortcut">{item.shortcut}</span> : null}
        {item.hasChevron ? (
          <span className="plus-menu-chevron">
            <ChevronRight size={12} />
          </span>
        ) : null}
      </button>
    );
  };

  const primaryPlusItems = useMemo(
    () => PLUS_MENU_ITEMS.filter((item) => item.id !== 'worktree-config' && item.id !== 'tab-config'),
    []
  );

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
        {tabs.map((tab) => (
          <WorkspaceTopbarTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isInLauncher={tab.id === launcherTabId}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onOpenContextMenu={openMenu}
          />
        ))}
      </div>

      <WorkspaceTopbarTabMenu
        tab={menuTab}
        tabIndex={menuIndex}
        tabsLength={tabs.length}
        launcherTabId={launcherTabId}
        position={menuState}
        onClose={() => setMenuState(null)}
        onBringTabInLauncher={onBringTabInLauncher}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseTabsToRight={onCloseTabsToRight}
        onMoveTab={onMoveTab}
        onCloseTab={onCloseTab}
        onRemoveTabFromLauncher={onRemoveTabFromLauncher}
        onRenameTab={onRenameTab}
        onSaveTabAsConfig={onSaveTabAsConfig}
        onSetTabTint={onSetTabTint}
      />

      <div className="workspace-topbar-plus-group">
        <button
          className="workspace-topbar-plus-action"
          type="button"
          onClick={handlePrimaryPlusAction}
          title={`New ${defaultPlusItem.label.toLowerCase()} workspace`}
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
            {primaryPlusItems.map((item) => renderPlusMenuItem(item))}
            <div className="plus-context-menu-divider" />
            {renderPlusMenuItem(PLUS_MENU_ITEMS.find((item) => item.id === 'worktree-config') ?? PLUS_MENU_ITEMS[0])}
            {renderPlusMenuItem(PLUS_MENU_ITEMS.find((item) => item.id === 'tab-config') ?? PLUS_MENU_ITEMS[0])}
          </div>

          {isWorktreeSubmenuOpen ? (
            <div
              className="plus-context-menu-submenu"
              onMouseEnter={() => setSelectedPlusItemId('worktree-config')}
            >
              <label className="plus-submenu-search">
                <Search size={15} className="plus-submenu-search-icon" />
                <input type="text" placeholder="Search repos" />
              </label>
              <button type="button" className="plus-submenu-action" onClick={() => setPlusMenuState(null)}>
                <Plus size={14} />
                <span>Add new repo</span>
              </button>
            </div>
          ) : (
            <div className="plus-context-menu-sidebar">
              <div className="plus-sidebar-title">{selectedPlusItem.label}</div>
              <button
                type="button"
                className="make-default-btn"
                onClick={handleMakeDefault}
                disabled={selectedPlusItem.id === defaultPlusItemId}
              >
                {selectedPlusItem.id === defaultPlusItemId ? 'Default' : 'Make default'}
              </button>
            </div>
          )}
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
