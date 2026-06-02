import { useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useUIStore } from '../../../stores';
import { useMemoryStore } from '../../../stores/memoryStore';
import { AppWindowController } from '../controllers';
import { initialWorkspaceChromeTabs } from '../chrome';
import {
  ConversationService,
  LauncherPanePropsFactory,
  TerminalSessionService,
  WorkspaceLaunchService,
  WorkspaceService
} from '../services';
import { normalizeAgentSettings } from '../settings/agentSettings';
import * as Utils from '../utils';
import { SidebarViewModel, TabViewModel, WorkspaceViewModel } from '../viewModels';
import { appearanceFlag } from '../appWindow/helpers';
import { useAppWindowLifecycle } from '../appWindow/lifecycle';
import { useAppWindowSessionBridge } from '../appWindow/sessionBridge';
import { createAppWindowStore } from '../appWindow/store';
import type { ComparableSnapshot } from '../appWindow/types';

export function useAppWindowController() {
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
  const setIsCloudProfileDrawerOpen = useUIStore((state) => state.setIsCloudProfileDrawerOpen);
  const setSelectedCloudProfileIdForEdit = useUIStore((state) => state.setSelectedCloudProfileIdForEdit);

  const memoryConversationsById = useMemo(
    () => new Map(memoryConversations.map((conversation) => [conversation.id, conversation])),
    [memoryConversations]
  );
  const preserveActiveTabColor = appearanceFlag(memorySettings, 'preserveTabColor');
  const useLatestPromptTabNames = appearanceFlag(memorySettings, 'latestPromptTabNames');
  const preferredConversationLayout = normalizeAgentSettings(memorySettings?.values).other.preferredConversationLayout as 'new-tab' | 'current-pane' | 'split-pane';

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0] ?? initialWorkspaceChromeTabs[0];
  const selectedPaneLayout = selectedTab.kind === 'terminal'
    ? paneLayoutsByTabId[selectedTab.id] ?? Utils.createDefaultPaneLayout(selectedTab.id)
    : null;
  const selectedPaneIds = selectedPaneLayout ? Utils.collectPaneIdsFromLayout(selectedPaneLayout) : [];
  const activePaneId = selectedPaneLayout?.activePaneId ?? selectedPaneIds[0] ?? null;
  const defaultWorkingDirectory = pathContext?.homeDir ?? pathContext?.currentDir ?? null;

  const {
    activeConversationId,
    activePaneContext,
    getLauncherSessionForPane
  } = useAppWindowSessionBridge({
    store,
    activePaneId,
    defaultWorkingDirectory,
    paneSessionBindingsByPaneId,
    selectedTab,
    terminalSessions
  });

  const workspaceService = useMemo(
    () => new WorkspaceService(store, { inheritSelectedTabTint: preserveActiveTabColor }),
    [store, preserveActiveTabColor]
  );
  const terminalSessionService = useMemo(() => new TerminalSessionService(store), [store]);
  const conversationService = useMemo(
    () => new ConversationService(store, workspaceService, preferredConversationLayout),
    [store, workspaceService, preferredConversationLayout]
  );

  const tabViewModel = useMemo(() => new TabViewModel(
    tabs,
    paneLayoutsByTabId,
    terminalSessions,
    getLauncherSessionForPane,
    memoryConversationsById,
    memoryConversationRecords,
    defaultWorkingDirectory,
    pathContext?.homeDir,
    useLatestPromptTabNames
  ), [
    defaultWorkingDirectory,
    getLauncherSessionForPane,
    memoryConversationRecords,
    memoryConversationsById,
    paneLayoutsByTabId,
    pathContext?.homeDir,
    tabs,
    terminalSessions,
    useLatestPromptTabNames
  ]);
  const displayTabs = useMemo(() => tabViewModel.getDisplayTabs(), [tabViewModel]);
  const displayTabLabelsById = useMemo(() => tabViewModel.getDisplayTabLabelsById(), [tabViewModel]);

  const sidebarViewModel = useMemo(() => new SidebarViewModel({
    tabs,
    paneLayoutsByTabId,
    getLauncherSessionForPane,
    memoryConversations,
    memoryConversationsById,
    terminalSessions,
    activeConversationId
  }), [
    activeConversationId,
    getLauncherSessionForPane,
    memoryConversations,
    memoryConversationsById,
    paneLayoutsByTabId,
    tabs,
    terminalSessions
  ]);

  const workspaceViewModel = useMemo(() => new WorkspaceViewModel(
    selectedTab,
    isAgentsActive,
    selectedPaneLayout,
    activePaneId,
    activePaneContext
  ), [activePaneContext, activePaneId, isAgentsActive, selectedPaneLayout, selectedTab]);

  const workspaceLaunchService = useMemo(() => new WorkspaceLaunchService({
    store,
    workspaceService,
    getLauncherSessionForPane,
    displayTabs,
    memorySettingsValues: memorySettings?.values,
    setIsCloudProfileDrawerOpen,
    setSelectedCloudProfileIdForEdit
  }), [
    displayTabs,
    getLauncherSessionForPane,
    memorySettings?.values,
    setIsCloudProfileDrawerOpen,
    setSelectedCloudProfileIdForEdit,
    store,
    workspaceService
  ]);

  const launcherPanePropsFactory = useMemo(() => new LauncherPanePropsFactory({
    store,
    activePaneId,
    defaultWorkingDirectory,
    displayTabLabelsById,
    paneStartupCommandsByPaneId,
    selectedTabId: selectedTab.id,
    startCloudAgentTab: (options) => workspaceLaunchService.startCloudAgentTab(options),
    getLauncherSessionForPane,
    terminalSessionService,
    conversationService
  }), [
    activePaneId,
    conversationService,
    defaultWorkingDirectory,
    displayTabLabelsById,
    getLauncherSessionForPane,
    paneStartupCommandsByPaneId,
    selectedTab.id,
    store,
    terminalSessionService,
    workspaceLaunchService
  ]);

  const openConversationIds = useMemo(() => sidebarViewModel.getOpenConversationIds(), [sidebarViewModel]);
  const openConversationIdSet = useMemo(() => sidebarViewModel.getOpenConversationIdSet(), [sidebarViewModel]);
  const workspaceConversations = useMemo(() => sidebarViewModel.getWorkspaceConversations(), [sidebarViewModel]);

  useAppWindowLifecycle({
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
    dedupedOrderedConversationIds: openConversationIds,
    memoryConversationsById,
    saveWorkspace,
    onOpenSettingsSection: (sectionId?: string) => workspaceService.openSettingsSection(sectionId),
    onSelectConversation: (conversationId: string) => conversationService.selectConversation(conversationId),
    setIsCloudProfileDrawerOpen,
    setSelectedCloudProfileIdForEdit,
    didRestoreWorkspaceRef,
    isClosingWorkspaceRef,
    latestLocalWorkspaceComparableRef,
    lastSavedWorkspaceSignatureRef
  });

  const controller = useMemo(() => new AppWindowController({
    selectedTab,
    launcherTabId,
    isAgentsActive,
    isSidebarOpen,
    isSpotlightVisible,
    activePaneContext,
    tabs,
    activeSectionId,
    expandedGroupIds,
    tabViewModel,
    sidebarViewModel,
    workspaceViewModel,
    actions: {
      getLauncherProps: (tabId: string, paneId: string) => launcherPanePropsFactory.build(tabId, paneId),
      getLauncherIdentityKey: (paneId: string) => launcherPanePropsFactory.getLauncherIdentityKey(paneId),
      handleCloseOtherTabs: (tabId: string) => workspaceService.closeAllTabsBut(tabId),
      handleCloseTabsToRight: (tabId: string) => workspaceService.closeTabsToRight(tabId),
      handleDeleteConversation: (conversationId: string) => conversationService.deleteConversation(conversationId),
      handleForkConversationInNewPane: (conversationId: string) => conversationService.forkInNewPane(conversationId),
      handleForkConversationInNewTab: (conversationId: string) => conversationService.forkInNewTab(conversationId),
      handleMoveTab: (tabId: string, direction: 'left' | 'right') => workspaceService.moveTab(tabId, direction),
      handleRenameTab: (tabId: string, label?: string | null) => workspaceService.renameTab(tabId, label),
      handleSaveTabAsConfig: (tabId: string) => workspaceLaunchService.saveTabAsConfig(tabId),
      handleSetTabTint: (tabId: string, tintColor: string | null) => workspaceService.setTabTint(tabId, tintColor),
      handleOpenTabConfig: (configPath: string) => workspaceLaunchService.openTabConfig(configPath),
      onCloseTab: (tabId: string) => workspaceService.closeTab(tabId),
      onClosePane: (paneId: string) => workspaceService.closePane(paneId),
      onNewConversation: (options?: { seedPrompt?: string }) => conversationService.newConversation(options),
      onNewConversationInNewTab: (options?: { seedPrompt?: string }) => conversationService.newConversationInNewTab(options),
      onNewCloudTerminalTab: () => workspaceLaunchService.openCloudTerminalTab(),
      onNewCloudAgentTab: (options) => workspaceLaunchService.startCloudAgentTab(options),
      onNewTerminalTab: () => {
        const nextTab = workspaceService.createTerminalTab();
        workspaceService.selectTab(nextTab.id);
      },
      onFocusPane: (paneId: string) => workspaceService.focusPane(paneId),
      onSplitTerminal: (direction: 'right' | 'up') => workspaceService.splitPane(direction),
      onSelectConversation: (conversationId: string) => conversationService.selectConversation(conversationId),
      onSelectSection: (sectionId: string) => workspaceService.selectSection(sectionId),
      onSelectTab: (tabId: string) => workspaceService.selectTab(tabId),
      onToggleGroup: (groupId: string) => workspaceService.toggleGroup(groupId),
      onRemoveTabFromLauncher: (tabId: string) => workspaceService.removeTabFromLauncher(tabId),
      onToggleAgents: () => workspaceService.toggleAgents(),
      onToggleSidebar: () => workspaceService.toggleSidebar(),
      setLauncherTabId: (tabId: string) => workspaceService.setLauncherTabId(tabId),
      onOpenSettingsSection: (sectionId?: string) => workspaceService.openSettingsSection(sectionId)
    }
  }), [
    activePaneContext,
    activeSectionId,
    conversationService,
    expandedGroupIds,
    isAgentsActive,
    isSidebarOpen,
    isSpotlightVisible,
    launcherPanePropsFactory,
    launcherTabId,
    selectedTab,
    sidebarViewModel,
    tabViewModel,
    tabs,
    workspaceLaunchService,
    workspaceService,
    workspaceViewModel
  ]);

  return controller.toViewState();
}
