import './AppWindow.css';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { Launcher } from '../Layout/Launcher';
import {
  initialWorkspaceConversations,
  WorkspacePanelPlaceholder,
  WorkspaceTopbar,
  defaultWorkspaceChromeTabId,
  initialWorkspaceChromeTabs
} from './chrome';
import { SettingsContent } from './settings/SettingsContent';
import { SettingsSidebar } from './settings/SettingsSidebar';
import { WorkspaceSidebar } from './chrome/WorkspaceSidebar';
import { AgentsView } from './agents/AgentsView';
import { formatCompactPathLabel } from '../../lib/pathLabels';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from './settings/settingsData';
import type { FilesystemPathContext } from '../../types/filesystem';
import type { WorkspaceChromeTab, WorkspaceConversation } from './chrome';

function buildTerminalTab(index: number, label: string): WorkspaceChromeTab {
  const suffix = String(index).padStart(2, '0');
  return {
    id: `terminal-${suffix}`,
    label,
    kind: 'terminal'
  };
}

function buildConversationTab(index: number): WorkspaceChromeTab {
  const suffix = String(index).padStart(2, '0');
  return {
    id: `conversation-${suffix}`,
    label: 'New agent conversation',
    kind: 'conversation'
  };
}

function buildConversation(id: string): WorkspaceConversation {
  return {
    id,
    title: 'New agent conversation',
    branchLabel: '~',
    timeLabel: 'just now'
  };
}

export function AppWindow() {
  const [tabs, setTabs] = useState<WorkspaceChromeTab[]>(initialWorkspaceChromeTabs);
  const [selectedTabId, setSelectedTabId] = useState(defaultWorkspaceChromeTabId);
  const [conversations, setConversations] = useState<WorkspaceConversation[]>(initialWorkspaceConversations);
  const [activeSectionId, setActiveSectionId] = useState(settingsDefaultSectionId);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>(settingsDefaultExpandedGroupIds);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [nextTerminalIndex, setNextTerminalIndex] = useState(1);
  const [nextConversationIndex, setNextConversationIndex] = useState(1);
  const [pathContext, setPathContext] = useState<FilesystemPathContext | null>(null);
  const [isAgentsActive, setIsAgentsActive] = useState(false);

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0];
  const activeConversationId = selectedTab.kind === 'conversation' ? selectedTab.id : null;
  const isSettingsView = selectedTab.kind === 'settings';
  const isLauncherView = !isAgentsActive && (selectedTab.kind === 'conversation' || selectedTab.kind === 'terminal');
  const launcherInstanceId = `${selectedTab.kind}:${selectedTab.id}`;
  const terminalTabLabel = formatCompactPathLabel(pathContext?.currentDir ?? null, pathContext?.homeDir ?? null);

  useEffect(() => {
    void invoke<FilesystemPathContext>('terminal_get_path_context')
      .then((context) => {
        setPathContext(context);
        setTabs((current) => current.map((tab) => (
          tab.id === 'terminal-main' && tab.kind === 'terminal'
            ? { ...tab, label: formatCompactPathLabel(context.currentDir, context.homeDir) }
            : tab
        )));
      })
      .catch((error) => {
        console.warn('[AppWindow] failed to load path context', error);
      });
  }, []);

  const createTerminalTab = () => {
    const nextTab = buildTerminalTab(nextTerminalIndex, terminalTabLabel);
    setTabs((current) => [...current, nextTab]);
    setNextTerminalIndex((value) => value + 1);
    return nextTab;
  };

  const onToggleGroup = (groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const onSelectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
  };

  const onSelectTab = (tabId: string) => {
    setSelectedTabId(tabId);
  };

  const onNewTerminalTab = () => {
    const nextTab = createTerminalTab();
    setSelectedTabId(nextTab.id);
  };

  const onSelectConversation = (conversationId: string) => {
    if (!tabs.some((tab) => tab.id === conversationId && tab.kind === 'conversation')) {
      return;
    }

    setSelectedTabId(conversationId);
  };

  const onNewConversation = () => {
    const nextConversationTab = buildConversationTab(nextConversationIndex);
    const nextConversation = buildConversation(nextConversationTab.id);

    setTabs((current) => [...current, nextConversationTab]);
    setConversations((current) => [nextConversation, ...current]);
    setNextConversationIndex((value) => value + 1);
    setSelectedTabId(nextConversationTab.id);
  };

  const onCloseTab = (tabId: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        return current;
      }

      const closingTab = current.find((tab) => tab.id === tabId);
      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (nextTabs.length === 0) {
        return current;
      }

      if (closingTab?.kind === 'conversation') {
        setConversations((existing) => existing.filter((conversation) => conversation.id !== tabId));
      }

      const fallbackTabId = nextTabs[0]?.id ?? defaultWorkspaceChromeTabId;
      setSelectedTabId((active) => active === tabId ? fallbackTabId : active);

      return nextTabs;
    });
  };

  const handleTerminalWorkingDirectoryLabelChange = (label: string) => {
    setTabs((current) => current.map((tab) => (
      tab.id === selectedTab.id && tab.kind === 'terminal' && tab.label !== label
        ? { ...tab, label }
        : tab
    )));
  };

  return (
    <div className="app-window">
      <WorkspaceTopbar
        activeTabId={selectedTab.id}
        tabs={tabs}
        onSelectTab={onSelectTab}
        onNewTerminalTab={onNewTerminalTab}
        onCloseTab={onCloseTab}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
        isAgentsActive={isAgentsActive}
        onToggleAgents={() => setIsAgentsActive(!isAgentsActive)}
      />

      <div className="app-window-container">
        <WorkspaceSidebar
          activeConversationId={activeConversationId}
          conversations={conversations}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onNewConversation={onNewConversation}
          onSelectConversation={onSelectConversation}
        />
        
        <div className="app-window-main">
          {isSettingsView && (
            <div className="app-window-header">
              <span className="app-window-header-title">Settings</span>
            </div>
          )}

          {isSettingsView ? (
            <div className="app-window-settings-body">
              <SettingsSidebar
                activeSectionId={activeSectionId}
                expandedGroupIds={expandedGroupIds}
                onSelectSection={onSelectSection}
                onToggleGroup={onToggleGroup}
              />
              <SettingsContent sectionId={activeSectionId} />
            </div>
          ) : isAgentsActive ? (
            <AgentsView />
          ) : isLauncherView ? (
            <div className="app-window-workspace">
              <Launcher
                key={launcherInstanceId}
                chatMode="always-open"
                initialComposerSurface={selectedTab.kind === 'conversation' ? 'agent' : 'terminal'}
                onWorkingDirectoryLabelChange={selectedTab.kind === 'terminal' ? handleTerminalWorkingDirectoryLabelChange : undefined}
                resetOnMount={true}
                variant="workspace"
              />
            </div>
          ) : (
            <div className="app-window-panel">
              <WorkspacePanelPlaceholder
                eyebrow={selectedTab.label}
                title={selectedTab.label}
                description={
                  selectedTab.kind === 'tools'
                    ? 'This tools panel will host shared utilities, quick actions, and launcher-wide commands.'
                    : selectedTab.kind === 'agents'
                      ? 'This agent management panel will hold orchestration, profiles, and runtime controls.'
                      : `Workspace for ${selectedTab.label.toLowerCase()} is still a placeholder.`
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
