import { useState, useCallback, useRef } from 'react';
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

export function AppWindow() {
  const app = useAppWindow();
  const { tabs } = useEditorStore();
  const isEditorOpen = tabs.length > 0;

  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [editorWidth, setEditorWidth] = useState(600);
  const [isResizingSidebarState, setIsResizingSidebarState] = useState(false);
  const [isResizingEditorState, setIsResizingEditorState] = useState(false);
  
  const isResizingSidebar = useRef(false);
  const isResizingEditor = useRef(false);

  const startResizingSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    setIsResizingSidebarState(true);
    document.addEventListener('mousemove', handleSidebarResize);
    document.addEventListener('mouseup', stopResizingSidebar);
    document.body.style.cursor = 'col-resize';
  }, []);

  const handleSidebarResize = useCallback((e: MouseEvent) => {
    if (!isResizingSidebar.current) return;
    const newWidth = e.clientX;
    if (newWidth > 150 && newWidth < 500) {
      setSidebarWidth(newWidth);
    }
  }, []);

  const stopResizingSidebar = useCallback(() => {
    isResizingSidebar.current = false;
    setIsResizingSidebarState(false);
    document.removeEventListener('mousemove', handleSidebarResize);
    document.removeEventListener('mouseup', stopResizingSidebar);
    document.body.style.cursor = 'default';
  }, [handleSidebarResize]);

  const startResizingEditor = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingEditor.current = true;
    setIsResizingEditorState(true);
    document.addEventListener('mousemove', handleEditorResize);
    document.addEventListener('mouseup', stopResizingEditor);
    document.body.style.cursor = 'col-resize';
  }, []);

  const handleEditorResize = useCallback((e: MouseEvent) => {
    if (!isResizingEditor.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
      setEditorWidth(newWidth);
    }
  }, []);

  const stopResizingEditor = useCallback(() => {
    isResizingEditor.current = false;
    setIsResizingEditorState(false);
    document.removeEventListener('mousemove', handleEditorResize);
    document.removeEventListener('mouseup', stopResizingEditor);
    document.body.style.cursor = 'default';
  }, [handleEditorResize]);

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
              onClose={() => app.actions.setIsSidebarOpen(false)}
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
