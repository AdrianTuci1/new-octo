import './AppWindow.css';
import { Launcher } from '../Layout/Launcher';
import { WorkspacePanelPlaceholder, WorkspaceTopbar } from './chrome';
import { SettingsContent } from './settings/SettingsContent';
import { SettingsSidebar } from './settings/SettingsSidebar';
import { WorkspaceSidebar } from './chrome/WorkspaceSidebar';
import { useAppWindow } from './hooks/useAppWindow';

export function AppWindow() {
  const app = useAppWindow();

  return (
    <div className="app-window">
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
        onRemoveTabFromLauncher={(tabId) => app.actions.setLauncherTabId((current) => current === tabId ? null : current)}
        onRenameTab={app.actions.handleRenameTab}
        onSaveTabAsConfig={app.actions.handleSaveTabAsConfig}
        onSetTabTint={app.actions.handleSetTabTint}
        onToggleSidebar={() => app.actions.setIsSidebarOpen(!app.chrome.isSidebarOpen)}
        isSidebarOpen={app.chrome.isSidebarOpen}
        isAgentsActive={app.chrome.isAgentsActive}
        onToggleAgents={() => app.actions.setIsAgentsActive(!app.chrome.isAgentsActive)}
      />

      <div className="app-window-container">
        <WorkspaceSidebar
          conversations={app.sidebar.workspaceConversations}
          isOpen={app.chrome.isSidebarOpen}
          openConversationIds={app.sidebar.openConversationIds}
          onClose={() => app.actions.setIsSidebarOpen(false)}
          onNewConversation={app.actions.onNewConversationInNewTab}
          onDeleteConversation={app.actions.handleDeleteConversation}
          onForkConversationInNewPane={app.actions.handleForkConversationInNewTab}
          onForkConversationInNewTab={app.actions.handleForkConversationInNewTab}
          onSelectConversation={app.actions.onSelectConversation}
          selectedConversationId={app.sidebar.selectedOpenConversationId}
        />

        <div className="app-window-main">
          {app.workspace.isSettingsView && (
            <div className="app-window-header">
              <span className="app-window-header-title">Settings</span>
            </div>
          )}

          <div className="app-window-workspace" style={{ display: app.workspace.isLauncherView ? 'flex' : 'none' }}>
            {app.workspace.tabs
              .filter((tab) => tab.kind === 'terminal')
              .map((tab) => (
                <div
                  key={tab.id}
                  className="app-window-launcher-slot"
                  style={{ display: tab.id === app.chrome.selectedTab.id ? 'flex' : 'none' }}
                >
                  {tab.id === app.chrome.launcherTabId && app.chrome.isSpotlightVisible ? (
                    <div className="app-window-spotlight-overlay">
                      <div className="app-window-spotlight-overlay-title">
                        Close spotlight to see tab here
                      </div>
                    </div>
                  ) : (
                    <Launcher {...app.actions.getLauncherProps(tab)} />
                  )}
                </div>
              ))}
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
    </div>
  );
}
