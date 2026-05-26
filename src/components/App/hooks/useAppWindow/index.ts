import { useCallback, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useUIStore } from '../../../../stores';
import { useMemoryStore } from '../../../../stores/memoryStore';
import { initialWorkspaceChromeTabs } from '../../chrome';
import { normalizeAgentSettings } from '../../settings/agentSettings';
import * as Utils from '../../utils';
import type { TerminalSessionState } from '../../utils';
import { useAppWindowEffects } from './effects';
import { appearanceFlag } from './helpers';
import { useAppWindowConversationActions } from './conversationActions';
import { useAppWindowLauncherProps } from './launcherProps';
import { useAppWindowLauncherSessionBridge } from './launcherSessionBridge';
import { createAppWindowStore } from './store';
import { useAppWindowTabActions } from './tabActions';
import type { ComparableSnapshot } from './types';
import { useAppWindowViewModels } from './viewModels';

export function useAppWindow() {
  const storeRef = useRef<ReturnType<typeof createAppWindowStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = createAppWindowStore();
  }

  const store = storeRef.current;
  const tabs = useStore(store, (state) => state.tabs);
  const selectedTabId = useStore(store, (state) => state.selectedTabId);
  const launcherTabId = useStore(store, (state) => state.launcherTabId);
  const paneLayoutsByTabId = useStore(store, (state) => state.paneLayoutsByTabId);
  const paneSessionBindingsByPaneId = useStore(store, (state) => state.paneSessionBindingsByPaneId);
  const activeSectionId = useStore(store, (state) => state.activeSectionId);
  const expandedGroupIds = useStore(store, (state) => state.expandedGroupIds);
  const isSidebarOpen = useStore(store, (state) => state.isSidebarOpen);
  const nextTerminalIndex = useStore(store, (state) => state.nextTerminalIndex);
  const terminalSessions = useStore(store, (state) => state.terminalSessions);
  const paneStartupCommandsByPaneId = useStore(store, (state) => state.paneStartupCommandsByPaneId);
  const pathContext = useStore(store, (state) => state.pathContext);
  const isAgentsActive = useStore(store, (state) => state.isAgentsActive);
  const isSpotlightVisible = useStore(store, (state) => state.isSpotlightVisible);
  const openPastConversationBaselineById = useStore(store, (state) => state.openPastConversationBaselineById);
  const setTabs = useStore(store, (state) => state.setTabs);
  const setSelectedTabId = useStore(store, (state) => state.setSelectedTabId);
  const setLauncherTabId = useStore(store, (state) => state.setLauncherTabId);
  const setPaneLayoutsByTabId = useStore(store, (state) => state.setPaneLayoutsByTabId);
  const setPaneSessionBindingsByPaneId = useStore(store, (state) => state.setPaneSessionBindingsByPaneId);
  const setActiveSectionId = useStore(store, (state) => state.setActiveSectionId);
  const setExpandedGroupIds = useStore(store, (state) => state.setExpandedGroupIds);
  const setIsSidebarOpen = useStore(store, (state) => state.setIsSidebarOpen);
  const setNextTerminalIndex = useStore(store, (state) => state.setNextTerminalIndex);
  const setTerminalSessions = useStore(store, (state) => state.setTerminalSessions);
  const setPaneStartupCommandsByPaneId = useStore(store, (state) => state.setPaneStartupCommandsByPaneId);
  const setIsAgentsActive = useStore(store, (state) => state.setIsAgentsActive);
  const setOpenPastConversationBaselineById = useStore(store, (state) => state.setOpenPastConversationBaselineById);
  const didRestoreWorkspaceRef = useRef(false);
  const isClosingWorkspaceRef = useRef(false);
  const latestLocalWorkspaceComparableRef = useRef<ComparableSnapshot | null>(null);
  const lastSavedWorkspaceSignatureRef = useRef<string | null>(null);
  const memoryStatus = useMemoryStore((state) => state.status);
  const memoryWorkspace = useMemoryStore((state) => state.workspace);
  const memoryConversations = useMemoryStore((state) => state.conversations);
  const memoryConversationRecords = useMemoryStore((state) => state.conversationRecords);
  const memorySettings = useMemoryStore((state) => state.settings);
  const saveWorkspace = useMemoryStore((state) => state.saveWorkspace);
  const deleteConversation = useMemoryStore((state) => state.deleteConversation);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const setIsCloudProfileDrawerOpen = useUIStore((state) => state.setIsCloudProfileDrawerOpen);
  const setSelectedCloudProfileIdForEdit = useUIStore((state) => state.setSelectedCloudProfileIdForEdit);
  const memoryConversationsById = useMemo(() => new Map(memoryConversations.map((conversation) => [conversation.id, conversation])), [memoryConversations]);
  const preserveActiveTabColor = appearanceFlag(memorySettings, 'preserveTabColor');
  const useLatestPromptTabNames = appearanceFlag(memorySettings, 'latestPromptTabNames');
  const preferredConversationLayout = normalizeAgentSettings(memorySettings?.values).other.preferredConversationLayout;

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0] ?? initialWorkspaceChromeTabs[0];
  const selectedPaneLayout = selectedTab.kind === 'terminal'
    ? paneLayoutsByTabId[selectedTab.id] ?? Utils.createDefaultPaneLayout(selectedTab.id)
    : null;
  const selectedPaneIds = selectedPaneLayout ? Utils.collectPaneIdsFromLayout(selectedPaneLayout) : [];
  const activePaneId = selectedPaneLayout?.activePaneId ?? selectedPaneIds[0] ?? null;
  const defaultWorkingDirectory = pathContext?.currentDir ?? pathContext?.homeDir ?? null;
  const {
    activeConversationId,
    activePaneContext,
    getLauncherIdentityKey,
    getLauncherSessionForPane,
    handleAgentTerminalBlockMetaChange,
    handleAgentTerminalBlocksChange,
    handleAgentTerminalSessionChange,
    handleSyntheticBlocksChange,
    handleTerminalBlockMetaChange,
    handleTerminalBlocksChange,
    handleTerminalComposerSurfaceChange,
    handleTerminalConversationChange,
    handleTerminalPendingApprovalChange,
    handleTerminalSessionChange,
    handleTerminalWorkingDirectoryChange
  } = useAppWindowLauncherSessionBridge({
    store,
    activePaneId,
    defaultWorkingDirectory,
    paneSessionBindingsByPaneId,
    selectedTab,
    terminalSessions
  });
  const isSettingsView = selectedTab.kind === 'settings';
  const isLauncherView = !isAgentsActive && selectedTab.kind === 'terminal';
  const {
    dedupedOrderedConversationIds,
    displayTabLabelsById,
    displayTabs,
    openConversationIdSet,
    openConversationIds,
    selectedOpenConversationId,
    workspaceConversations
  } = useAppWindowViewModels({
    activeConversationId,
    defaultWorkingDirectory,
    getLauncherSessionForPane,
    memoryConversationRecords,
    memoryConversations,
    memoryConversationsById,
    openPastConversationBaselineById,
    paneLayoutsByTabId,
    pathContextHomeDir: pathContext?.homeDir,
    tabs,
    terminalSessions,
    useLatestPromptTabNames
  });

  const createTerminalTab = useCallback((options: {
    label?: string;
    terminalSession?: TerminalSessionState;
  } = {}) => {
    const nextTab = {
      ...Utils.buildTerminalTab(nextTerminalIndex, options.label ?? '~'),
      tintColor: preserveActiveTabColor ? selectedTab.tintColor ?? null : null
    };
    setTabs((current) => [...current, nextTab]);
    setPaneLayoutsByTabId((current) => ({
      ...current,
      [nextTab.id]: Utils.createDefaultPaneLayout(nextTab.id)
    }));
    setPaneSessionBindingsByPaneId((current) => ({
      ...current,
      [nextTab.id]: nextTab.id
    }));
    setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: options.terminalSession ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory)
    }));
    setNextTerminalIndex((value) => value + 1);
    return nextTab;
  }, [defaultWorkingDirectory, nextTerminalIndex, preserveActiveTabColor, selectedTab.tintColor]);
  const {
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
    resolvePaneId,
    resolveTerminalTabId,
    startCloudAgentTab
  } = useAppWindowTabActions({
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
    memorySettingsValues: memorySettings?.values,
    paneLayoutsByTabId,
    pathContextHomeDir: pathContext?.homeDir,
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
  });

  const {
    handleDeleteConversation,
    handleForkConversationInNewPane,
    handleForkConversationInNewTab,
    onNewConversation,
    onNewConversationInNewTab,
    onSelectConversation
  } = useAppWindowConversationActions({
    createTerminalTab,
    defaultWorkingDirectory,
    deleteConversation,
    getLauncherSessionForPane,
    memoryConversationsById,
    paneLayoutsByTabId,
    paneSessionBindingsByPaneId,
    preferredConversationLayout,
    resolvePaneId,
    resolveTerminalTabId,
    selectedTab,
    selectedTabId,
    setOpenPastConversationBaselineById,
    setPaneLayoutsByTabId,
    setPaneSessionBindingsByPaneId,
    setSelectedTabId,
    setTerminalSessions
  });
  useAppWindowEffects({
    store,
    memoryStatus,
    memoryWorkspace,
    pathContextHomeDir: pathContext?.homeDir,
    defaultWorkingDirectory,
    tabs,
    selectedTabId,
    launcherTabId,
    paneLayoutsByTabId,
    terminalSessions,
    activeSectionId,
    expandedGroupIds,
    isSidebarOpen,
    isAgentsActive,
    nextTerminalIndex,
    workspaceConversations,
    openConversationIdSet,
    dedupedOrderedConversationIds,
    memoryConversationsById,
    saveWorkspace,
    onOpenSettingsSection,
    onSelectConversation,
    setIsCloudProfileDrawerOpen,
    setSelectedCloudProfileIdForEdit,
    didRestoreWorkspaceRef,
    isClosingWorkspaceRef,
    latestLocalWorkspaceComparableRef,
    lastSavedWorkspaceSignatureRef
  });

  const getLauncherProps = useAppWindowLauncherProps({
    activePaneId,
    defaultWorkingDirectory,
    displayTabLabelsById,
    paneStartupCommandsByPaneId,
    selectedTabId: selectedTab.id,
    startCloudAgentTab,
    getLauncherSessionForPane,
    handleAgentTerminalBlockMetaChange,
    handleAgentTerminalBlocksChange,
    handleAgentTerminalSessionChange,
    handleSyntheticBlocksChange,
    handleTerminalBlockMetaChange,
    handleTerminalBlocksChange,
    handleTerminalComposerSurfaceChange,
    handleTerminalConversationChange,
    handleTerminalPendingApprovalChange,
    handleTerminalSessionChange,
    handleTerminalWorkingDirectoryChange,
    onNewConversation,
    onSelectConversation,
    setPaneStartupCommandsByPaneId
  });

  return {
    chrome: {
      displayTabs,
      isAgentsActive,
      isSidebarOpen,
      isSpotlightVisible,
      launcherTabId,
      selectedTab,
      activeWorkingDirectory: activePaneContext.workingDirectory,
      activePaneContext
    },
    workspace: {
      activePaneId,
      isLauncherView,
      isSettingsView,
      paneLayout: selectedPaneLayout,
      tabs
    },
    sidebar: {
      openConversationIds,
      selectedOpenConversationId,
      workspaceConversations
    },
    settings: {
      activeSectionId,
      expandedGroupIds
    },
    actions: {
      getLauncherProps,
      getLauncherIdentityKey,
      handleCloseOtherTabs,
      handleCloseTabsToRight,
      handleDeleteConversation,
      handleForkConversationInNewPane,
      handleForkConversationInNewTab,
      handleMoveTab,
      handleRenameTab,
      handleSaveTabAsConfig,
      handleSetTabTint,
      handleOpenTabConfig,
      onCloseTab,
      onClosePane,
      onNewConversation,
      onNewConversationInNewTab,
      onNewCloudTerminalTab,
      onNewCloudAgentTab: startCloudAgentTab,
      onNewTerminalTab,
      onFocusPane,
      onSplitTerminal,
      onSelectConversation,
      onSelectSection,
      onSelectTab,
      onToggleGroup,
      onRemoveTabFromLauncher: handleRemoveTabFromLauncher,
      onToggleAgents,
      onToggleSidebar,
      setLauncherTabId,
      onOpenSettingsSection
    }
  };
}
