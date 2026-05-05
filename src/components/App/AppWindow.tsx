import { useAppResize } from './hooks/useAppResize';
import './AppWindow.css';
import { Launcher } from '../Layout/Launcher';
import { WorkspacePanelPlaceholder, WorkspaceTopbar } from './chrome';
import { SettingsContent } from './settings/SettingsContent';
import { SettingsSidebar } from './settings/SettingsSidebar';
import { WorkspaceSidebar } from './chrome/WorkspaceSidebar';
import { useAppWindow } from './hooks/useAppWindow';
import { EditorWorkspace } from '../Editor/EditorWorkspace';
import { AgentsView } from './agents/AgentsView';
import { useEditorStore } from '../../stores/editorStore';
import { useUIStore } from '../../stores';
import { ModelManagementDrawer } from './settings/ModelManagementDrawer';

export function AppWindow() {
  const app = useAppWindow();
  const { tabs } = useEditorStore();
  const isEditorOpen = tabs.length > 0;
  const selectedLauncherTab = app.workspace.tabs.find(
    (tab) => tab.kind === 'terminal' && tab.id === app.chrome.selectedTab.id
  );
  const selectedTabIsSpotlightOwned = Boolean(
    selectedLauncherTab && selectedLauncherTab.id === app.chrome.launcherTabId && app.chrome.isSpotlightVisible
  );

  const { width: sidebarWidth, isResizing: isResizingSidebarState, startResizing: startResizingSidebar } = useAppResize({
    initialWidth: 240,
    minWidth: 150,
    maxWidth: 500,
    direction: 'left'
  });

  const { width: editorWidth, isResizing: isResizingEditorState, startResizing: startResizingEditor } = useAppResize({
    initialWidth: 600,
    minWidth: 300,
    maxWidth: window.innerWidth * 0.8,
    direction: 'right'
  });

  const { width: modelDrawerWidth, isResizing: isResizingModelDrawerState, startResizing: startResizingModelDrawer } = useAppResize({
    initialWidth: 450,
    minWidth: 300,
    maxWidth: 800,
    direction: 'right'
  });

  const isModelDrawerOpen = useUIStore((state) => state.isModelDrawerOpen);

  return (
    <div className={`app-window ${isEditorOpen ? 'with-editor' : ''}`}>
      <WorkspaceTopbar
        activeTabId={app.chrome.selectedTab.id}
        launcherTabId={app.chrome.launcherTabId}
        tabs={app.chrome.displayTabs}
        onBringTabInLauncher={app.actions.setLauncherTabId}
        onCloseOtherTabs={app.actions.handleCloseOtherTabs}
        onCloseTabsToRight={app.actions.handleCloseTabsToRight}
        onSelectTab={app.actions.onSelectTab}
        onNewTerminalTab={app.actions.onNewTerminalTab}
        onCloseTab={app.actions.onCloseTab}
        onMoveTab={app.actions.handleMoveTab}
        onRemoveTabFromLauncher={app.actions.onRemoveTabFromLauncher}
        onRenameTab={app.actions.handleRenameTab}
        onSaveTabAsConfig={app.actions.handleSaveTabAsConfig}
        onSetTabTint={app.actions.handleSetTabTint}
        onToggleSidebar={app.actions.onToggleSidebar}
        isSidebarOpen={app.chrome.isSidebarOpen}
        isAgentsActive={app.chrome.isAgentsActive}
        onToggleAgents={app.actions.onToggleAgents}
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
              conversations={app.sidebar.workspaceConversations}
              isOpen={app.chrome.isSidebarOpen}
              openConversationIds={app.sidebar.openConversationIds}
              onClose={app.actions.onToggleSidebar}
              onNewConversation={app.actions.onNewConversationInNewTab}
              onDeleteConversation={app.actions.handleDeleteConversation}
              onForkConversationInNewPane={app.actions.handleForkConversationInNewTab}
              onForkConversationInNewTab={app.actions.handleForkConversationInNewTab}
              onSelectConversation={app.actions.onSelectConversation}
              selectedConversationId={app.sidebar.selectedOpenConversationId}
              activeWorkingDirectory={app.chrome.activeWorkingDirectory}
            />
          </div>
          {app.chrome.isSidebarOpen && (
            <div className="resize-handle sidebar-handle" onMouseDown={startResizingSidebar} />
          )}
        </div>

        <div className="app-window-main">
          {app.workspace.isSettingsView && (
            <div className="app-window-header">
              <span className="app-window-header-title">Settings</span>
            </div>
          )}

          <div className="app-window-content-wrapper">
            <div className="app-window-workspace-container">
              <div className="app-window-workspace" style={{ display: app.workspace.isLauncherView ? 'flex' : 'none' }}>
                {selectedLauncherTab && (
                  <div
                    key={selectedLauncherTab.id}
                    className="app-window-launcher-slot"
                    style={{ display: 'flex' }}
                  >
                    {selectedTabIsSpotlightOwned ? (
                      <div className="app-window-spotlight-overlay">
                        <div className="app-window-spotlight-overlay-title">
                          This tab is controlled by spotlight. Close spotlight or switch to another workspace tab.
                        </div>
                      </div>
                    ) : (
                      <Launcher key={selectedLauncherTab.id} {...app.actions.getLauncherProps(selectedLauncherTab)} />
                    )}
                  </div>
                )}
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

            {isEditorOpen && (
              <div
                className="app-window-editor-drawer-wrapper"
                style={{
                  width: editorWidth,
                  transition: isResizingEditorState ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <div className="resize-handle editor-handle" onMouseDown={startResizingEditor} />
                <div className="app-window-editor-drawer">
                  <EditorWorkspace />
                </div>
              </div>
            )}

            {isModelDrawerOpen && (
              <div
                className="app-window-editor-drawer-wrapper model-drawer-wrapper"
                style={{
                  width: modelDrawerWidth,
                  transition: isResizingModelDrawerState ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  zIndex: 20
                }}
              >
                <div className="resize-handle editor-handle" onMouseDown={startResizingModelDrawer} />
                <div className="app-window-editor-drawer">
                  <ModelManagementDrawer />
                </div>
              </div>
            )}
          </div>

          {app.chrome.isAgentsActive && (
            <div className="app-window-overlay" role="presentation">
              <div className="app-window-overlay-panel">
                <AgentsView />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
