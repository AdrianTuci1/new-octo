import './WorkspaceTopbar.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDown, ChevronRight, Cloud, GitBranch, LayoutGrid, Minus, PanelLeftOpen, Plus, Search, Server, Sparkles, TerminalSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../../stores';
import { useEditorStore } from '../../../stores/editorStore';
import type { GitWorktreeDiff } from '../../../types/gitDiff';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { useProfileSettings } from '../settings/useProfileSettings';
import type { WorkspaceActivePaneContext, WorkspaceChromeTab } from './workspaceChromeTypes';
import { WorkspaceTopbarTab } from './WorkspaceTopbarTab';
import { WorkspaceTopbarTabMenu } from './WorkspaceTopbarTabMenu';
import type { LucideIcon } from 'lucide-react';

type TabConfigSummary = {
  displayName: string;
  fileName: string;
  path: string;
};

type PlusMenuItem = {
  id: 'agent' | 'terminal' | 'cloud-term' | 'cloud-agent' | 'create-tab-config' | 'update-tab-config' | 'tab-configs' | 'worktree-config';
  label: string;
  action: 'new-terminal' | 'new-cloud-terminal' | 'new-cloud-agent' | 'save-current-config' | 'none';
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
    action: 'new-cloud-terminal',
    icon: Cloud
  },
  {
    id: 'cloud-agent',
    label: 'Cloud agent',
    action: 'new-cloud-agent',
    icon: Sparkles
  },
  {
    id: 'create-tab-config',
    label: 'Create tab config',
    action: 'save-current-config',
    icon: Plus
  },
  {
    id: 'update-tab-config',
    label: 'Update tab config',
    action: 'none',
    icon: Server,
    hasChevron: true
  },
  {
    id: 'tab-configs',
    label: 'Tab configs',
    action: 'none',
    icon: Server,
    hasChevron: true
  },
  {
    id: 'worktree-config',
    label: 'New worktree config',
    action: 'none',
    icon: GitBranch,
    hasChevron: true
  }
];

const DEFAULT_PLUS_ITEM_ID: PlusMenuItem['id'] = 'terminal';

type WorkspaceTopbarProps = {
  activeTabId: string;
  launcherTabId: string | null;
  tabs: WorkspaceChromeTab[];
  activePaneContext: WorkspaceActivePaneContext | null;
  onBringTabInLauncher: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onNewTerminalTab: () => void;
  onNewCloudTerminalTab: () => void;
  onNewCloudAgentTab: () => void;
  onCloseTab: (tabId: string) => void;
  onMoveTab: (tabId: string, direction: 'left' | 'right') => void;
  onRemoveTabFromLauncher: (tabId: string) => void;
  onRenameTab: (tabId: string) => void;
  onSaveTabAsConfig: (tabId: string) => void;
  onSetTabTint: (tabId: string, tintColor: string | null) => void;
  onOpenTabConfig: (configPath: string) => void;
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
  activePaneContext,
  onBringTabInLauncher,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onSelectTab,
  onNewTerminalTab,
  onNewCloudTerminalTab,
  onNewCloudAgentTab,
  onCloseTab,
  onMoveTab,
  onRemoveTabFromLauncher,
  onRenameTab,
  onSaveTabAsConfig,
  onSetTabTint,
  onOpenTabConfig,
  onToggleSidebar,
  isSidebarOpen,
  isAgentsActive,
  onToggleAgents,
  onOpenSettingsSection,
  onOpenKeyboardShortcutsDrawer
}: WorkspaceTopbarProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const dragSpacerRef = useRef<HTMLDivElement | null>(null);
  const { profile } = useProfileSettings();
  const openEditorFile = useEditorStore((state) => state.openFile);
  const isCodeReviewDrawerOpen = useUIStore((state) => state.isCodeReviewDrawerOpen);
  const toggleCodeReviewDrawer = useUIStore((state) => state.toggleCodeReviewDrawer);
  const [menuState, setMenuState] = useState<{ tabId: string; left: number; top: number } | null>(null);
  const [gitDiffSummary, setGitDiffSummary] = useState<GitWorktreeDiff | null>(null);
  const [tabConfigs, setTabConfigs] = useState<TabConfigSummary[]>([]);
  const [isTabConfigsLoading, setIsTabConfigsLoading] = useState(true);
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs]
  );
  const shouldShowGitDiff = activePaneContext?.canShowGitDiff ?? (activeTab?.kind !== 'settings');

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
    let cancelled = false;

    const refreshDiffSummary = async () => {
      if (!activePaneContext?.workingDirectory || !shouldShowGitDiff) {
        setGitDiffSummary(null);
        return;
      }

      try {
        const summary = await invoke<GitWorktreeDiff>('terminal_get_worktree_diff', {
          request: { path: activePaneContext.workingDirectory, includePatch: false }
        });
        if (!cancelled) {
          setGitDiffSummary(summary);
        }
      } catch {
        if (!cancelled) {
          setGitDiffSummary(null);
        }
      }
    };

    const initialTimeoutId = window.setTimeout(() => {
      void refreshDiffSummary();
    }, 200);
    const handleFocus = () => void refreshDiffSummary();
    const intervalId = window.setInterval(() => void refreshDiffSummary(), 8000);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activePaneContext?.workingDirectory, shouldShowGitDiff]);

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
  const [tabConfigPanelMode, setTabConfigPanelMode] = useState<'browse' | 'edit'>('browse');

  const loadTabConfigs = useCallback(async () => {
    setIsTabConfigsLoading(true);
    try {
      const nextConfigs = await invoke<TabConfigSummary[]>('octomus_list_tab_configs');
      setTabConfigs(nextConfigs);
    } catch (error) {
      console.warn('[WorkspaceTopbar] failed to load tab configs', error);
      setTabConfigs([]);
    } finally {
      setIsTabConfigsLoading(false);
    }
  }, []);

  const handleOpenTabConfigInEditor = useCallback(async (configPath: string, fileName: string) => {
    try {
      const contents = await invoke<string>('terminal_read_file', {
        request: { path: configPath }
      });
      openEditorFile(configPath, fileName, contents);
    } catch (error) {
      console.warn('[WorkspaceTopbar] failed to open tab config in editor', error);
    }
  }, [openEditorFile]);

  useEffect(() => {
    void loadTabConfigs();
  }, [loadTabConfigs]);

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
    setTabConfigPanelMode('browse');
    void loadTabConfigs();
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
  const isTabConfigPanelOpen = plusMenuState && (selectedPlusItemId === 'tab-configs' || selectedPlusItemId === 'update-tab-config');
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

    if (item.action === 'new-cloud-terminal') {
      setPlusMenuState(null);
      onNewCloudTerminalTab();
      return;
    }

    if (item.action === 'new-cloud-agent') {
      setPlusMenuState(null);
      onNewCloudAgentTab();
      return;
    }

    if (item.action === 'save-current-config') {
      setPlusMenuState(null);
      onSaveTabAsConfig(activeTabId);
      return;
    }

    setSelectedPlusItemId(item.id);
    if (item.id === 'update-tab-config') {
      setTabConfigPanelMode('edit');
      return;
    }

    if (item.id === 'tab-configs') {
      setTabConfigPanelMode('browse');
      return;
    }

    if (item.id !== 'worktree-config') {
      setPlusMenuState(null);
    }
  };

  const handleMakeDefault = () => {
    if (selectedPlusItem.id === 'worktree-config' || selectedPlusItem.id === 'update-tab-config' || selectedPlusItem.id === 'tab-configs' || selectedPlusItem.id === defaultPlusItemId) {
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
    () => PLUS_MENU_ITEMS.filter((item) => item.id !== 'worktree-config' && item.id !== 'update-tab-config' && item.id !== 'tab-configs'),
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
            {renderPlusMenuItem(PLUS_MENU_ITEMS.find((item) => item.id === 'tab-configs') ?? PLUS_MENU_ITEMS[0])}
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
          ) : isTabConfigPanelOpen ? (
            <div
              className="plus-context-menu-sidebar plus-context-menu-sidebar-tab-configs"
              onMouseEnter={() => setSelectedPlusItemId(tabConfigPanelMode === 'edit' ? 'update-tab-config' : 'tab-configs')}
            >
              <div className="plus-sidebar-title">Tab configs</div>
              <div className="plus-tab-config-actions">
                <button
                  type="button"
                  className={tabConfigPanelMode === 'browse' ? 'selected' : ''}
                  onClick={() => {
                    setSelectedPlusItemId('tab-configs');
                    setTabConfigPanelMode('browse');
                  }}
                >
                  Browse
                </button>
                <button
                  type="button"
                  className={tabConfigPanelMode === 'edit' ? 'selected' : ''}
                  onClick={() => {
                    setSelectedPlusItemId('update-tab-config');
                    setTabConfigPanelMode('edit');
                  }}
                >
                  Update
                </button>
              </div>
              <div className="plus-tab-config-list">
                {isTabConfigsLoading ? (
                  <div className="plus-sidebar-empty">Loading tab configs...</div>
                ) : tabConfigs.length > 0 ? (
                  tabConfigs.map((config) => (
                    <button
                      key={config.path}
                      type="button"
                      className="plus-tab-config-item"
                      onClick={() => {
                        setPlusMenuState(null);
                        if (tabConfigPanelMode === 'edit') {
                          void handleOpenTabConfigInEditor(config.path, config.fileName);
                        } else {
                          onOpenTabConfig(config.path);
                        }
                      }}
                    >
                      <span className="plus-tab-config-name">{config.fileName}</span>
                      <span className="plus-tab-config-meta">{tabConfigPanelMode === 'edit' ? 'Open in editor' : 'Launch layout'}</span>
                    </button>
                  ))
                ) : (
                  <div className="plus-sidebar-empty">No tab configs found.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="plus-context-menu-sidebar">
              <div className="plus-sidebar-title">{selectedPlusItem.label}</div>
              <button
                type="button"
                className="make-default-btn"
                onClick={handleMakeDefault}
                disabled={selectedPlusItem.id === defaultPlusItemId || selectedPlusItem.id === 'worktree-config' || selectedPlusItem.id === 'tab-configs' || selectedPlusItem.id === 'update-tab-config'}
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
          <div className="workspace-topbar-account-menu-profile">
            <ProfileAvatar profile={profile} size={28} showInitials={Boolean(profile.avatarDataUrl)} />
            <div>
              <div className="workspace-topbar-account-menu-name">{profile.displayName}</div>
              <div className="workspace-topbar-account-menu-subtitle">Local profile</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAccountMenuState(null);
              onOpenSettingsSection('profile');
            }}
          >
            Profile
          </button>
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
        </div>
      )}

      <div className="workspace-topbar-right workspace-topbar-right-compact">
        {shouldShowGitDiff ? (
          <button
            className={`workspace-topbar-icon-button workspace-topbar-diff-button ${isCodeReviewDrawerOpen ? 'active' : ''}`}
            type="button"
            title="Code review"
            onClick={toggleCodeReviewDrawer}
          >
            <span className="workspace-topbar-diff-mark" aria-hidden="true">
              <Plus size={13} strokeWidth={2.4} />
              <Minus size={13} strokeWidth={2.4} />
            </span>
            {gitDiffSummary?.isRepo ? (
              <span className="workspace-topbar-diff-stats">
                <span className="workspace-topbar-diff-additions">+{gitDiffSummary.additions}</span>
                <span className="workspace-topbar-diff-deletions">-{gitDiffSummary.deletions}</span>
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          className="workspace-topbar-avatar-button"
          type="button"
          title="Profile options"
          onClick={(e) => openAccountMenu(e.currentTarget)}
        >
          <ProfileAvatar profile={profile} size={18} />
        </button>
      </div>
    </header>
  );
}
