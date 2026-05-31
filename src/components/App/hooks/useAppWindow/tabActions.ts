import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback } from 'react';
import { useMemoryStore } from '../../../../stores/memoryStore';
import type { TerminalSessionInfo } from '../../../../types/terminal';
import { defaultWorkspaceChromeTabId, initialWorkspaceChromeTabs, type WorkspaceChromeTab, type WorkspacePaneLayout } from '../../chrome';
import { getDefaultReadyCloudProfile, toTerminalTarget } from '../../settings/cloudProfiles';
import * as Utils from '../../utils';
import { buildTabConfigLaunchPlan, parseTabConfigToml } from '../../utils/tabConfigs';
import type { TerminalSessionState } from '../../utils';
import {
  buildEmptyWorkspaceSnapshot,
  buildTabConfigTabId,
  fileNameFromPath,
  promptForTabConfigVariables,
  SETTINGS_TAB_ID
} from './helpers';

type UseAppWindowTabActionsParams = {
  activePaneId: string | null;
  activeSectionId: string;
  createTerminalTab: (options?: {
    label?: string;
    terminalSession?: TerminalSessionState;
    workingDirectory?: string | null;
  }) => WorkspaceChromeTab;
  defaultWorkingDirectory: string | null;
  displayTabs: WorkspaceChromeTab[];
  expandedGroupIds: string[];
  getLauncherSessionForPane: (paneId: string | null) => TerminalSessionState | null;
  isAgentsActive: boolean;
  isSidebarOpen: boolean;
  isSpotlightVisible: boolean;
  launcherTabId: string | null;
  memorySettingsValues: any;
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>;
  pathContextHomeDir: string | null | undefined;
  saveSettings: ReturnType<typeof useMemoryStore.getState>['saveSettings'];
  saveWorkspace: ReturnType<typeof useMemoryStore.getState>['saveWorkspace'];
  selectedTab: WorkspaceChromeTab;
  selectedTabId: string;
  setActiveSectionId: (updater: string | ((current: string) => string)) => void;
  setExpandedGroupIds: (updater: string[] | ((current: string[]) => string[])) => void;
  setIsAgentsActive: (updater: boolean | ((current: boolean) => boolean)) => void;
  setIsCloudProfileDrawerOpen: (open: boolean) => void;
  setIsSidebarOpen: (updater: boolean | ((current: boolean) => boolean)) => void;
  setLauncherTabId: (updater: string | null | ((current: string | null) => string | null)) => void;
  setNextTerminalIndex: (updater: number | ((current: number) => number)) => void;
  setPaneLayoutsByTabId: (updater: Record<string, WorkspacePaneLayout> | ((current: Record<string, WorkspacePaneLayout>) => Record<string, WorkspacePaneLayout>)) => void;
  setPaneSessionBindingsByPaneId: (updater: Utils.WorkspacePaneSessionBindings | ((current: Utils.WorkspacePaneSessionBindings) => Utils.WorkspacePaneSessionBindings)) => void;
  setPaneStartupCommandsByPaneId: (updater: Record<string, string[]> | ((current: Record<string, string[]>) => Record<string, string[]>)) => void;
  setSelectedCloudProfileIdForEdit: (id: string | null) => void;
  setSelectedTabId: (updater: string | ((current: string) => string)) => void;
  setTabs: (updater: WorkspaceChromeTab[] | ((current: WorkspaceChromeTab[]) => WorkspaceChromeTab[])) => void;
  setTerminalSessions: (updater: Record<string, TerminalSessionState> | ((current: Record<string, TerminalSessionState>) => Record<string, TerminalSessionState>)) => void;
  tabs: WorkspaceChromeTab[];
  terminalSessions: Record<string, TerminalSessionState>;
};

export function useAppWindowTabActions({
  activePaneId,
  activeSectionId,
  createTerminalTab,
  defaultWorkingDirectory,
  displayTabs,
  expandedGroupIds,
  getLauncherSessionForPane,
  isAgentsActive,
  isSidebarOpen,
  isSpotlightVisible,
  launcherTabId,
  memorySettingsValues,
  paneLayoutsByTabId,
  pathContextHomeDir,
  saveSettings,
  saveWorkspace,
  selectedTab,
  selectedTabId,
  setActiveSectionId,
  setExpandedGroupIds,
  setIsAgentsActive,
  setIsCloudProfileDrawerOpen,
  setIsSidebarOpen,
  setLauncherTabId,
  setNextTerminalIndex,
  setPaneLayoutsByTabId,
  setPaneSessionBindingsByPaneId,
  setPaneStartupCommandsByPaneId,
  setSelectedCloudProfileIdForEdit,
  setSelectedTabId,
  setTabs,
  setTerminalSessions,
  tabs,
  terminalSessions
}: UseAppWindowTabActionsParams) {
  const openSettingsSectionInternal = useCallback((sectionId?: string) => {
    setTabs((current) => {
      const hasSettingsTab = current.some((tab) => tab.id === SETTINGS_TAB_ID);
      if (hasSettingsTab) {
        return current;
      }

      const settingsTab = initialWorkspaceChromeTabs.find((tab) => tab.id === SETTINGS_TAB_ID) ?? {
        id: SETTINGS_TAB_ID,
        label: 'Settings',
        kind: 'settings' as const
      };

      const nextTabs = [...current];
      const insertAt = Math.min(1, nextTabs.length);
      nextTabs.splice(insertAt, 0, settingsTab);
      return nextTabs;
    });

    if (sectionId) {
      setActiveSectionId(sectionId);
    }

    setSelectedTabId(SETTINGS_TAB_ID);
  }, [setActiveSectionId, setSelectedTabId, setTabs]);

  const handleOpenTabConfig = useCallback(async (configPath: string) => {
    try {
      const contents = await invoke<string>('terminal_read_file', {
        request: { path: configPath }
      });
      const fallbackName = fileNameFromPath(configPath).replace(/\.toml$/i, '') || 'Tab config';
      const parsed = parseTabConfigToml(contents, fallbackName);
      const resolvedVariables = promptForTabConfigVariables(parsed);
      const readyCloudProfile = getDefaultReadyCloudProfile(memorySettingsValues);
      const cloudTarget = readyCloudProfile ? toTerminalTarget(readyCloudProfile) : null;
      const tabId = buildTabConfigTabId(fileNameFromPath(configPath) ?? parsed.name);
      const plan = buildTabConfigLaunchPlan(parsed, {
        tabId,
        homeDir: pathContextHomeDir ?? null,
        cloudTarget,
        resolvedVariables
      });

      setTabs((current) => [...current, plan.tab]);
      setPaneLayoutsByTabId((current) => ({
        ...current,
        [plan.tab.id]: plan.paneLayout
      }));
      setPaneSessionBindingsByPaneId((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.keys(plan.paneStateByPaneId).map((paneId) => [paneId, paneId])
        )
      }));
      setTerminalSessions((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(plan.paneStateByPaneId).map(([paneId, state]) => [
            paneId,
            {
              ...Utils.createEmptyTerminalSession(state.workingDirectory),
              workingDirectory: state.workingDirectory,
              composerSurface: state.initialComposerSurface,
              terminalTarget: state.terminalTarget,
              agentTerminalTarget: state.agentTerminalTarget
            } satisfies TerminalSessionState
          ])
        )
      }));
      setPaneStartupCommandsByPaneId((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(plan.paneStateByPaneId).map(([paneId, state]) => [
            paneId,
            state.startupCommands
          ])
        )
      }));
      setSelectedTabId(plan.tab.id);
      setLauncherTabId(plan.tab.id);
    } catch (error) {
      console.warn('[AppWindow] failed to open tab config', error);
    }
  }, [
    memorySettingsValues,
    pathContextHomeDir,
    setLauncherTabId,
    setPaneLayoutsByTabId,
    setPaneSessionBindingsByPaneId,
    setPaneStartupCommandsByPaneId,
    setSelectedTabId,
    setTabs,
    setTerminalSessions
  ]);

  const closeAppWindowWithFreshWorkspace = useCallback(async () => {
    const sessionIds = Object.values(terminalSessions)
      .flatMap((session) => [session.terminalSessionId, session.agentTerminalSessionId])
      .filter((sessionId): sessionId is string => Boolean(sessionId));

    await Promise.all(
      sessionIds.map((sessionId) => invoke('terminal_kill_session', {
        request: { sessionId }
      }).catch(() => null))
    );

    await saveWorkspace(buildEmptyWorkspaceSnapshot({
      activeSectionId,
      expandedGroupIds,
      isAgentsActive,
      isSidebarOpen
    }));

    if ((window as any).__TAURI_INTERNALS__) {
      await getCurrentWindow().close();
    }
  }, [activeSectionId, expandedGroupIds, isAgentsActive, isSidebarOpen, saveWorkspace, terminalSessions]);

  const resolveTerminalTabId = useCallback(() => {
    if (selectedTab.kind === 'terminal' && (!isSpotlightVisible || selectedTab.id !== launcherTabId)) {
      return selectedTab.id;
    }

    const firstTerminalTab = tabs.find((tab) => (
      tab.kind === 'terminal' && (!isSpotlightVisible || tab.id !== launcherTabId)
    ));
    if (firstTerminalTab) {
      setSelectedTabId(firstTerminalTab.id);
      return firstTerminalTab.id;
    }

    const nextTab = createTerminalTab();
    setSelectedTabId(nextTab.id);
    return nextTab.id;
  }, [createTerminalTab, isSpotlightVisible, launcherTabId, selectedTab, setSelectedTabId, tabs]);

  const resolvePaneId = useCallback((tabId: string) => {
    const paneLayout = paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId);
    const paneIds = Utils.collectPaneIdsFromLayout(paneLayout);
    return paneLayout.activePaneId ?? paneIds[0] ?? tabId;
  }, [paneLayoutsByTabId]);

  const onToggleGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  }, [setExpandedGroupIds]);

  const onSelectSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
  }, [setActiveSectionId]);

  const onSelectTab = useCallback((tabId: string) => {
    if (selectedTabId === tabId) {
      return;
    }
    setSelectedTabId(tabId);
  }, [selectedTabId, setSelectedTabId]);

  const onNewTerminalTab = useCallback(() => {
    const nextTab = createTerminalTab();
    setSelectedTabId(nextTab.id);
  }, [createTerminalTab, setSelectedTabId]);

  const onNewCloudTerminalTab = useCallback(() => {
    const profile = getDefaultReadyCloudProfile(memorySettingsValues);
    if (!profile) {
      openSettingsSectionInternal('cloud-platform/cloud');
      setIsCloudProfileDrawerOpen(true);
      setSelectedCloudProfileIdForEdit(null);
      return;
    }

    const session = {
      ...Utils.createEmptyTerminalSession(defaultWorkingDirectory),
      terminalTarget: toTerminalTarget(profile),
      agentTerminalTarget: toTerminalTarget(profile)
    };
    const nextTab = createTerminalTab({
      label: profile.title || 'Cloud',
      terminalSession: session
    });
    setSelectedTabId(nextTab.id);
  }, [
    createTerminalTab,
    defaultWorkingDirectory,
    memorySettingsValues,
    openSettingsSectionInternal,
    setIsCloudProfileDrawerOpen,
    setSelectedCloudProfileIdForEdit,
    setSelectedTabId
  ]);

  const startCloudAgentTab = useCallback(async (options: {
    prompt?: string | null;
    cwd?: string | null;
    repo?: string | null;
    baseBranch?: string | null;
    workBranch?: string | null;
    profileId?: string | null;
    syncStrategy?: 'git' | 'patch' | 'none' | null;
    commitMessage?: string | null;
    artifactPath?: string | null;
  } = {}) => {
    const profiles = getDefaultReadyCloudProfile(memorySettingsValues)
      ? [getDefaultReadyCloudProfile(memorySettingsValues)!]
      : [];
    const profile = options.profileId
      ? profiles.find((candidate) => candidate.id === options.profileId) ?? getDefaultReadyCloudProfile(memorySettingsValues)
      : getDefaultReadyCloudProfile(memorySettingsValues);

    if (!profile) {
      openSettingsSectionInternal('cloud-platform/cloud');
      setIsCloudProfileDrawerOpen(true);
      setSelectedCloudProfileIdForEdit(null);
      return null;
    }

    const prompt = options.prompt?.trim() || window.prompt('Cloud agent prompt', 'Inspect this workspace and report next steps.')?.trim() || '';
    if (!prompt) {
      return null;
    }

    const target = toTerminalTarget(profile);
    const workspacePath = options.cwd?.trim()
      || (activePaneId ? getLauncherSessionForPane(activePaneId)?.workingDirectory?.trim() || '' : '')
      || defaultWorkingDirectory
      || '/workspace';
    const sessionInfo = await invoke<TerminalSessionInfo>('cloud_runtime_start_run', {
      request: {
        sessionId: `cloud_run_${Date.now()}`,
        provider: profile.provider,
        harness: 'octomus',
        workspace: workspacePath,
        prompt,
        repo: options.repo?.trim() || null,
        baseBranch: options.baseBranch?.trim() || 'main',
        workBranch: options.workBranch?.trim() || null,
        syncStrategy: options.syncStrategy ?? (options.repo?.trim() ? 'git' : 'patch'),
        commitMessage: options.commitMessage?.trim() || null,
        artifactPath: options.artifactPath?.trim() || null,
        includeLlmCredentials: true,
        target
      }
    });

    const tab = createTerminalTab({
      label: `${profile.title || 'Cloud'} Agent`,
      terminalSession: {
        ...Utils.createEmptyTerminalSession(workspacePath),
        workingDirectory: workspacePath,
        composerSurface: 'agent',
        terminalTarget: target,
        agentTerminalTarget: target,
        agentTerminalSessionId: sessionInfo.id
      }
    });
    setSelectedTabId(tab.id);
    return sessionInfo;
  }, [
    activePaneId,
    createTerminalTab,
    defaultWorkingDirectory,
    getLauncherSessionForPane,
    memorySettingsValues,
    openSettingsSectionInternal,
    setIsCloudProfileDrawerOpen,
    setSelectedCloudProfileIdForEdit,
    setSelectedTabId
  ]);

  const onFocusPane = useCallback((paneId: string) => {
    if (selectedTab.kind !== 'terminal' || activePaneId === paneId) {
      return;
    }

    setPaneLayoutsByTabId((current) => ({
      ...current,
      [selectedTab.id]: {
        ...(current[selectedTab.id] ?? Utils.createDefaultPaneLayout(selectedTab.id)),
        activePaneId: paneId
      }
    }));
  }, [activePaneId, selectedTab, setPaneLayoutsByTabId]);

  const onSplitTerminal = useCallback((direction: 'right' | 'up') => {
    const tabId = selectedTab.kind === 'terminal' ? selectedTab.id : null;
    if (!tabId) {
      return;
    }

    const sourcePaneId = resolvePaneId(tabId);
    const nextPaneId = Utils.buildPaneId(
      tabId,
      Object.values(paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );
    const sourceSession = getLauncherSessionForPane(sourcePaneId) ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);

    setPaneLayoutsByTabId((current) => ({
      ...current,
      [tabId]: Utils.splitPaneLayout(
        current[tabId] ?? Utils.createDefaultPaneLayout(tabId),
        sourcePaneId,
        direction === 'up' ? 'vertical' : 'horizontal',
        nextPaneId
      )
    }));
    setTerminalSessions((current) => ({
      ...current,
      [nextPaneId]: {
        ...Utils.createEmptyTerminalSession(sourceSession.workingDirectory),
        workingDirectory: sourceSession.workingDirectory
      }
    }));
    setPaneSessionBindingsByPaneId((current) => ({
      ...current,
      [nextPaneId]: nextPaneId
    }));
    setSelectedTabId(tabId);
  }, [defaultWorkingDirectory, getLauncherSessionForPane, paneLayoutsByTabId, resolvePaneId, selectedTab, setPaneLayoutsByTabId, setPaneSessionBindingsByPaneId, setSelectedTabId, setTerminalSessions]);

  const onCloseTab = useCallback((tabId: string) => {
    if (tabs.length <= 1) {
      void closeAppWindowWithFreshWorkspace();
      return;
    }

    const paneIds = Utils.collectPaneIdsFromLayout(
      paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId)
    );
    const closingSessionIds = paneIds
      .flatMap((paneId) => {
        const session = getLauncherSessionForPane(paneId);
        return [session?.terminalSessionId ?? null, session?.agentTerminalSessionId ?? null];
      })
      .filter((sessionId): sessionId is string => Boolean(sessionId));

    closingSessionIds.forEach((sessionId) => {
      void invoke('terminal_kill_session', { request: { sessionId } }).catch(() => {});
    });

    setTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (nextTabs.length === 0) {
        return current;
      }

      const fallbackTabId = nextTabs[0]?.id ?? defaultWorkspaceChromeTabId;
      if (selectedTabId === tabId) {
        setSelectedTabId(fallbackTabId);
      }

      return nextTabs;
    });
    setLauncherTabId((current) => {
      if (current !== tabId) {
        return current;
      }

      const fallbackTerminal = tabs.find((tab) => tab.id !== tabId && tab.kind === 'terminal');
      return fallbackTerminal?.id ?? null;
    });
    setPaneLayoutsByTabId((current) => {
      const nextLayouts = { ...current };
      delete nextLayouts[tabId];
      return nextLayouts;
    });
    setPaneSessionBindingsByPaneId((current) => {
      const next = { ...current };
      paneIds.forEach((paneId) => {
        delete next[paneId];
      });
      return next;
    });
    setTerminalSessions((current) => {
      const nextSessions = { ...current };
      paneIds.forEach((paneId) => {
        delete nextSessions[paneId];
      });
      return nextSessions;
    });
    setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      paneIds.forEach((paneId) => {
        delete next[paneId];
      });
      return next;
    });
  }, [
    closeAppWindowWithFreshWorkspace,
    getLauncherSessionForPane,
    paneLayoutsByTabId,
    selectedTabId,
    setLauncherTabId,
    setPaneLayoutsByTabId,
    setPaneSessionBindingsByPaneId,
    setPaneStartupCommandsByPaneId,
    setSelectedTabId,
    setTabs,
    setTerminalSessions,
    tabs
  ]);

  const onClosePane = useCallback((paneId: string) => {
    const tabId = Utils.findTabIdForPane(paneLayoutsByTabId, paneId);
    if (!tabId) {
      return;
    }

    const paneIds = Utils.collectPaneIdsFromLayout(paneLayoutsByTabId[tabId]);
    if (paneIds.length <= 1) {
      onCloseTab(tabId);
      return;
    }

    const session = getLauncherSessionForPane(paneId);
    if (session) {
      const closingSessionIds = [session.terminalSessionId, session.agentTerminalSessionId].filter(
        (id): id is string => Boolean(id)
      );
      closingSessionIds.forEach((sessionId) => {
        void invoke('terminal_kill_session', { request: { sessionId } }).catch(() => {});
      });
    }

    setPaneLayoutsByTabId((current) => {
      const layout = current[tabId];
      if (!layout) {
        return current;
      }
      const nextLayout = Utils.removePaneFromLayout(layout, paneId);
      return {
        ...current,
        [tabId]: nextLayout ?? Utils.createDefaultPaneLayout(tabId)
      };
    });
    setTerminalSessions((current) => {
      const next = { ...current };
      delete next[paneId];
      return next;
    });
    setPaneSessionBindingsByPaneId((current) => {
      const next = { ...current };
      delete next[paneId];
      return next;
    });
    setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      delete next[paneId];
      return next;
    });
  }, [getLauncherSessionForPane, onCloseTab, paneLayoutsByTabId, setPaneLayoutsByTabId, setPaneSessionBindingsByPaneId, setPaneStartupCommandsByPaneId, setTerminalSessions]);

  const handleRenameTab = useCallback((tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }

    const nextLabel = window.prompt('Rename tab', tab.customLabel?.trim() || displayTabs.find((item) => item.id === tabId)?.label || tab.label);
    if (nextLabel === null) {
      return;
    }

    const normalized = nextLabel.trim();
    setTabs((current) => current.map((candidate) => (
      candidate.id === tabId
        ? { ...candidate, customLabel: normalized.length > 0 ? normalized : null }
        : candidate
    )));
  }, [displayTabs, setTabs, tabs]);

  const handleMoveTab = useCallback((tabId: string, direction: 'left' | 'right') => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) {
        return current;
      }

      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const nextTabs = [...current];
      const [tab] = nextTabs.splice(index, 1);
      nextTabs.splice(targetIndex, 0, tab);
      return nextTabs;
    });
  }, [setTabs]);

  const handleCloseOtherTabs = useCallback((tabId: string) => {
    const keptPaneIds = new Set(Utils.collectPaneIdsFromLayout(
      paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId)
    ));

    setTabs((current) => current.filter((tab) => tab.id === tabId));
    setSelectedTabId(tabId);
    setPaneLayoutsByTabId((current) => (
      current[tabId]
        ? { [tabId]: current[tabId] }
        : {}
    ));
    setTerminalSessions((current) => (
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId))) as Record<string, TerminalSessionState>
    ));
    setPaneSessionBindingsByPaneId((current) => (
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId))) as Utils.WorkspacePaneSessionBindings
    ));
    setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      Object.keys(next).forEach((paneId) => {
        if (!keptPaneIds.has(paneId)) {
          delete next[paneId];
        }
      });
      return next;
    });
    setLauncherTabId((current) => current === tabId ? current : null);
  }, [paneLayoutsByTabId, setLauncherTabId, setPaneLayoutsByTabId, setPaneSessionBindingsByPaneId, setPaneStartupCommandsByPaneId, setSelectedTabId, setTabs, setTerminalSessions]);

  const handleCloseTabsToRight = useCallback((tabId: string) => {
    const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
    const keptTabIds = new Set(tabs.slice(0, tabIndex + 1).map((tab) => tab.id));
    const keptPaneIds = new Set(
      Array.from(keptTabIds).flatMap((keptId) => Utils.collectPaneIdsFromLayout(
        paneLayoutsByTabId[keptId] ?? Utils.createDefaultPaneLayout(keptId)
      ))
    );

    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) {
        return current;
      }
      return current.slice(0, index + 1);
    });
    setPaneLayoutsByTabId((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => keptTabIds.has(id))
    ));
    setTerminalSessions((current) => (
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId))) as Record<string, TerminalSessionState>
    ));
    setPaneSessionBindingsByPaneId((current) => (
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId))) as Utils.WorkspacePaneSessionBindings
    ));
    setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      Object.keys(next).forEach((paneId) => {
        if (!keptPaneIds.has(paneId)) {
          delete next[paneId];
        }
      });
      return next;
    });
    setLauncherTabId((current) => {
      if (!current) {
        return null;
      }
      return keptTabIds.has(current) ? current : null;
    });
  }, [paneLayoutsByTabId, setLauncherTabId, setPaneLayoutsByTabId, setPaneSessionBindingsByPaneId, setPaneStartupCommandsByPaneId, setTabs, setTerminalSessions, tabs]);

  const handleSaveTabAsConfig = useCallback((tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }

    const nextName = window.prompt('Config name', displayTabs.find((item) => item.id === tabId)?.label || tab.label);
    if (!nextName || nextName.trim().length === 0) {
      return;
    }

    const savedConfigs = Array.isArray(useMemoryStore.getState().settings?.values.savedWorkspaceTabConfigs)
      ? useMemoryStore.getState().settings?.values.savedWorkspaceTabConfigs as Utils.SavedWorkspaceTabConfig[]
      : [];

    const nextConfig: Utils.SavedWorkspaceTabConfig = {
      id: `workspace-config-${Date.now()}`,
      name: nextName.trim(),
      createdAt: new Date().toISOString(),
      tab,
      terminalSession: getLauncherSessionForPane(paneLayoutsByTabId[tabId]?.activePaneId ?? tabId) ?? null
    };

    void saveSettings({
      savedWorkspaceTabConfigs: [nextConfig, ...savedConfigs].slice(0, 24)
    }, true);
  }, [displayTabs, getLauncherSessionForPane, paneLayoutsByTabId, saveSettings, tabs]);

  const handleSetTabTint = useCallback((tabId: string, tintColor: string | null) => {
    setTabs((current) => current.map((tab) => (
      tab.id === tabId ? { ...tab, tintColor } : tab
    )));
  }, [setTabs]);

  const handleRemoveTabFromLauncher = useCallback((tabId: string) => {
    setLauncherTabId((current) => current === tabId ? null : current);
  }, [setLauncherTabId]);

  const onToggleSidebar = useCallback(() => {
    setIsSidebarOpen((current) => !current);
  }, [setIsSidebarOpen]);

  const onToggleAgents = useCallback(() => {
    setIsAgentsActive((current) => !current);
  }, [setIsAgentsActive]);

  const onOpenSettingsSection = useCallback((sectionId?: string) => {
    openSettingsSectionInternal(sectionId);
  }, [openSettingsSectionInternal]);

  return {
    closeAppWindowWithFreshWorkspace,
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handleMoveTab,
    handleOpenTabConfig,
    handleRemoveTabFromLauncher,
    handleRenameTab,
    handleSaveTabAsConfig,
    handleSetTabTint,
    onClosePane,
    onCloseTab,
    onFocusPane,
    onNewCloudTerminalTab,
    onNewTerminalTab,
    onOpenSettingsSection,
    onSelectSection,
    onSelectTab,
    onSplitTerminal,
    onToggleAgents,
    onToggleGroup,
    onToggleSidebar,
    openSettingsSectionInternal,
    resolvePaneId,
    resolveTerminalTabId,
    startCloudAgentTab
  };
}
