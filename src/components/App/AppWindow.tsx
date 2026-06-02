import { useAppResize } from './hooks/useAppResize';
import './AppWindow.css';
import { WorkspacePanelPlaceholder, WorkspaceTopbar } from './chrome';
import { SettingsContent } from './settings/SettingsContent';
import { SettingsSidebar } from './settings/SettingsSidebar';
import { WorkspaceSidebar } from './chrome/WorkspaceSidebar';
import { useAppWindowController } from './hooks/useAppWindowController';
import { AgentsView } from './agents/AgentsView';
import { useEditorStore } from '../../stores/editorStore';
import { useCallback, useEffect, useState } from 'react';
import { useMemoryStore } from '../../stores/memoryStore';
import { AppWindowDrawers } from './drawers/AppWindowDrawers';
import { useBackendShortcutActions } from './hooks/useBackendShortcutActions';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WorkspacePaneTree } from './panes';
import { SettingsHeader } from './headers';
import { applyAppearanceSettings } from './services/appearance';

export function AppWindow() {
  const app = useAppWindowController();
  const { tabs } = useEditorStore();
  const appearanceSettings = useMemoryStore((state) => state.settings?.values.appearance);
  const isEditorOpen = tabs.length > 0;
  const [isKeyboardShortcutsDrawerOpen, setIsKeyboardShortcutsDrawerOpen] = useState(false);
  const isSpotlightOwned = app.chrome.selectedTab.id === app.chrome.launcherTabId && app.chrome.isSpotlightVisible;

  const toggleFullscreen = useCallback(async () => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    const currentWindow = getCurrentWindow();
    const isFullscreen = await currentWindow.isFullscreen().catch(() => false);

    if (isFullscreen) {
      await currentWindow.setSimpleFullscreen(false).catch(() => {});
      await currentWindow.unmaximize().catch(() => {});
      return;
    }

    await currentWindow.setSimpleFullscreen(true).catch(async () => {
      await currentWindow.setFullscreen(true).catch(async () => {
        await currentWindow.maximize().catch(() => {});
      });
    });
  }, []);

  const { width: sidebarWidth, isResizing: isResizingSidebarState, startResizing: startResizingSidebar } = useAppResize({
    initialWidth: 240,
    minWidth: 150,
    maxWidth: 500,
    direction: 'left'
  });

  const handleOpenSettingsTab = useCallback(() => {
    app.actions.onOpenSettingsSection();
  }, [app.actions]);

  useEffect(() => {
    applyAppearanceSettings(appearanceSettings);
  }, [appearanceSettings]);

  useBackendShortcutActions({
    activeTabId: app.chrome.selectedTab.id,
    onCloseActiveTab: app.actions.onCloseTab,
    onNewConversationTab: app.actions.onNewConversationInNewTab,
    onNewTerminalTab: app.actions.onNewTerminalTab,
    onOpenKeyboardShortcuts: () => setIsKeyboardShortcutsDrawerOpen(true),
    onOpenSettingsTab: handleOpenSettingsTab,
    onSplitTerminal: app.actions.onSplitTerminal,
    onToggleAgents: app.actions.onToggleAgents,
    onToggleSidebar: app.actions.onToggleSidebar
  });

  return (
    <div className={`app-window ${isEditorOpen ? 'with-editor' : ''}`}>
      <WorkspaceTopbar
        activeTabId={app.chrome.selectedTab.id}
        launcherTabId={app.chrome.launcherTabId}
        tabs={app.chrome.displayTabs}
        activePaneContext={app.chrome.activePaneContext}
        onBringTabInLauncher={app.actions.setLauncherTabId}
        onCloseOtherTabs={app.actions.handleCloseOtherTabs}
        onCloseTabsToRight={app.actions.handleCloseTabsToRight}
        onSelectTab={app.actions.onSelectTab}
        onOpenKeyboardShortcutsDrawer={() => setIsKeyboardShortcutsDrawerOpen(true)}
        onNewAgentTab={app.actions.onNewConversationInNewTab}
        onNewTerminalTab={app.actions.onNewTerminalTab}
        onNewCloudTerminalTab={app.actions.onNewCloudTerminalTab}
        onNewCloudAgentTab={app.actions.onNewCloudAgentTab}
        onCloseTab={app.actions.onCloseTab}
        onMoveTab={app.actions.handleMoveTab}
        onRemoveTabFromLauncher={app.actions.onRemoveTabFromLauncher}
        onRenameTab={app.actions.handleRenameTab}
        onSaveTabAsConfig={app.actions.handleSaveTabAsConfig}
        onSetTabTint={app.actions.handleSetTabTint}
        onOpenTabConfig={app.actions.handleOpenTabConfig}
        onToggleSidebar={app.actions.onToggleSidebar}
        isSidebarOpen={app.chrome.isSidebarOpen}
        isAgentsActive={app.chrome.isAgentsActive}
        onToggleAgents={app.actions.onToggleAgents}
        onOpenSettingsSection={app.actions.onOpenSettingsSection}
      />

      <div className="app-window-container">
        <div
          className="sidebar-wrapper"
          style={{
            width: app.chrome.isSidebarOpen ? sidebarWidth : 0,
            transition: isResizingSidebarState ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div className="sidebar-clip-container">
            <WorkspaceSidebar
              isOpen={app.chrome.isSidebarOpen}
              onClose={app.actions.onToggleSidebar}
              conversations={app.sidebar.workspaceConversations}
              openConversationIds={app.sidebar.openConversationIds}
              selectedConversationId={app.sidebar.selectedOpenConversationId}
              onSelectConversation={app.actions.onSelectConversation}
              onNewConversation={app.actions.onNewConversationInNewTab}
              onDeleteConversation={app.actions.handleDeleteConversation}
              onForkConversationInNewTab={app.actions.handleForkConversationInNewTab}
              onForkConversationInNewPane={app.actions.handleForkConversationInNewPane}
              activeWorkingDirectory={app.chrome.activeWorkingDirectory}
            />
          </div>
          {app.chrome.isSidebarOpen && (
            <div className="resize-handle sidebar-handle" onMouseDown={startResizingSidebar} />
          )}
        </div>

        <div className="app-window-main">
          {app.workspace.isSettingsView && (
            <SettingsHeader onToggleFullscreen={() => { void toggleFullscreen(); }} />
          )}

          <div className="app-window-content-wrapper">
            <div className="app-window-workspace-container">
              <div className="app-window-workspace" style={{ display: app.workspace.isLauncherView ? 'flex' : 'none' }}>
                <div className="app-window-workspace-panes">
                  {isSpotlightOwned ? (
                    <div className="app-window-spotlight-overlay">
                      <div className="app-window-spotlight-overlay-title">
                        This tab is controlled by spotlight. Close spotlight or switch to another workspace tab.
                      </div>
                    </div>
                  ) : (
                    <WorkspacePaneTree
                      paneLayout={app.workspace.paneLayout}
                      activePaneId={app.workspace.activePaneId}
                      selectedTabId={app.chrome.selectedTab.id}
                      getLauncherProps={app.actions.getLauncherProps}
                      getLauncherIdentityKey={app.actions.getLauncherIdentityKey}
                      onFocusPane={app.actions.onFocusPane}
                      onClosePane={app.actions.onClosePane}
                    />
                  )}
                </div>
              </div>

              {app.workspace.isSettingsView ? (
                <div className="app-window-settings-body">
                  <SettingsSidebar
                    activeSectionId={app.settings.activeSectionId}
                    expandedGroupIds={app.settings.expandedGroupIds}
                    onSelectSection={app.actions.onSelectSection}
                    onToggleGroup={app.actions.onToggleGroup}
                  />
                  <SettingsContent sectionId={app.settings.activeSectionId} />
                </div>
              ) : app.workspace.isLauncherView ? null : (
                <div className="app-window-panel">
                  <WorkspacePanelPlaceholder
                    eyebrow={app.chrome.selectedTab.label}
                    title={app.chrome.selectedTab.label}
                    description={
                      app.chrome.selectedTab.kind === 'tools'
                        ? 'This tools panel will host shared utilities, quick actions, and launcher-wide commands.'
                        : app.chrome.selectedTab.kind === 'agents'
                          ? 'This agent management panel will hold orchestration, profiles, and runtime controls.'
                          : `Workspace for ${app.chrome.selectedTab.label.toLowerCase()} is still a placeholder.`
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <AppWindowDrawers
            isEditorOpen={isEditorOpen}
            isKeyboardShortcutsDrawerOpen={isKeyboardShortcutsDrawerOpen}
            activeWorkingDirectory={app.chrome.activeWorkingDirectory}
            onCloseKeyboardShortcutsDrawer={() => setIsKeyboardShortcutsDrawerOpen(false)}
          />

          {app.chrome.isAgentsActive && (
            <div className="app-window-overlay" role="presentation">
              <div className="app-window-overlay-panel">
                <AgentsView
                  conversations={app.sidebar.workspaceConversations}
                  openConversationIds={app.sidebar.openConversationIds}
                  selectedConversationId={app.sidebar.selectedOpenConversationId}
                  onNewConversation={app.actions.onNewConversationInNewTab}
                  onSelectConversation={app.actions.onSelectConversation}
                  onClose={app.actions.onToggleAgents}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
