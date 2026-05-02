import './SettingsWindow.css';
import { useState } from 'react';
import {
  WorkspacePanelPlaceholder,
  WorkspaceTopbar,
  defaultWorkspaceChromeTabId,
  initialWorkspaceChromeTabs
} from './chrome';
import { SettingsContent } from './SettingsContent';
import { SettingsSidebar } from './SettingsSidebar';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from './settingsData';
import type { WorkspaceChromeTab } from './chrome';

export function SettingsWindow() {
  const [tabs, setTabs] = useState<WorkspaceChromeTab[]>(initialWorkspaceChromeTabs);
  const [activeTabId, setActiveTabId] = useState(defaultWorkspaceChromeTabId);
  const [activeSectionId, setActiveSectionId] = useState(settingsDefaultSectionId);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>(settingsDefaultExpandedGroupIds);
  const [nextSessionIndex, setNextSessionIndex] = useState(4);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const onToggleGroup = (groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const onSelectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
  };

  const onNewTab = () => {
    const nextLabel = `Session ${String(nextSessionIndex).padStart(2, '0')}`;
    const nextTab: WorkspaceChromeTab = {
      id: `session-${String(nextSessionIndex).padStart(2, '0')}`,
      label: nextLabel,
      kind: 'session'
    };

    setTabs((current) => [...current, nextTab]);
    setActiveTabId(nextTab.id);
    setNextSessionIndex((value) => value + 1);
  };

  const onCloseTab = (tabId: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        return current;
      }

      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (nextTabs.length === 0) {
        return current;
      }

      setActiveTabId((active) => {
        if (active !== tabId) {
          return active;
        }

        return nextTabs[0]?.id ?? defaultWorkspaceChromeTabId;
      });

      return nextTabs;
    });
  };

  return (
    <div className="settings-window">
      <WorkspaceTopbar
        activeTabId={activeTab.id}
        tabs={tabs}
        onSelectTab={setActiveTabId}
        onNewTab={onNewTab}
        onCloseTab={onCloseTab}
      />

      {activeTab.kind === 'settings' && (
        <div className="settings-header">
          <span className="settings-header-title">Settings</span>
        </div>
      )}
      <div className="settings-window-body">
        {activeTab.kind === 'settings' ? (
          <>
            <SettingsSidebar
              activeSectionId={activeSectionId}
              expandedGroupIds={expandedGroupIds}
              onSelectSection={onSelectSection}
              onToggleGroup={onToggleGroup}
            />
            <SettingsContent sectionId={activeSectionId} />
          </>
        ) : (
          <WorkspacePanelPlaceholder
            eyebrow={activeTab.label}
            title={activeTab.label}
            description={
              activeTab.kind === 'tools'
                ? 'This tools panel will host shared utilities, quick actions, and launcher-wide commands.'
                : activeTab.kind === 'agents'
                  ? 'This agent management panel will hold orchestration, profiles, and runtime controls.'
                  : `Terminal workspace for ${activeTab.label.toLowerCase()} is still a placeholder.`
            }
          />
        )}
      </div>
    </div>
  );
}
