import type { WorkspaceActivePaneContext, WorkspaceChromeTab } from '../chrome';
import { SidebarViewModel, TabViewModel, WorkspaceViewModel } from '../viewModels';

export type AppWindowControllerActions = {
  getLauncherProps: (tabId: string, paneId: string) => Record<string, unknown>;
  getLauncherIdentityKey: (paneId: string) => string;
  handleCloseOtherTabs: (tabId: string) => void;
  handleCloseTabsToRight: (tabId: string) => void;
  handleDeleteConversation: (conversationId: string) => Promise<void> | void;
  handleForkConversationInNewPane: (conversationId: string) => void;
  handleForkConversationInNewTab: (conversationId: string) => void;
  handleMoveTab: (tabId: string, direction: 'left' | 'right') => void;
  handleRenameTab: (tabId: string, label?: string | null) => void;
  handleSaveTabAsConfig: (tabId: string) => void;
  handleSetTabTint: (tabId: string, tintColor: string | null) => void;
  handleOpenTabConfig: (configPath: string) => Promise<void> | void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onClosePane: (paneId: string) => void;
  onNewConversation: (_options?: { seedPrompt?: string }) => string;
  onNewConversationInNewTab: (_options?: { seedPrompt?: string }) => string;
  onNewCloudTerminalTab: () => void;
  onNewCloudAgentTab: (options?: {
    prompt?: string | null;
    cwd?: string | null;
    repo?: string | null;
    baseBranch?: string | null;
    workBranch?: string | null;
    profileId?: string | null;
    syncStrategy?: 'git' | 'patch' | 'none' | null;
    commitMessage?: string | null;
    artifactPath?: string | null;
  }) => Promise<unknown> | unknown;
  onNewTerminalTab: () => void;
  onFocusPane: (paneId: string) => void;
  onSplitTerminal: (direction: 'right' | 'up') => void;
  onSelectConversation: (conversationId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onSelectTab: (tabId: string) => void;
  onToggleGroup: (groupId: string) => void;
  onRemoveTabFromLauncher: (tabId: string) => void;
  onToggleAgents: () => void;
  onToggleSidebar: () => void;
  setLauncherTabId: (tabId: string) => void;
  onOpenSettingsSection: (sectionId?: string) => void;
};

type AppWindowControllerParams = {
  selectedTab: WorkspaceChromeTab;
  launcherTabId: string | null;
  isAgentsActive: boolean;
  isSidebarOpen: boolean;
  isSpotlightVisible: boolean;
  activePaneContext: WorkspaceActivePaneContext;
  tabs: WorkspaceChromeTab[];
  activeSectionId: string;
  expandedGroupIds: string[];
  tabViewModel: TabViewModel;
  sidebarViewModel: SidebarViewModel;
  workspaceViewModel: WorkspaceViewModel;
  actions: AppWindowControllerActions;
};

export class AppWindowController {
  constructor(private readonly params: AppWindowControllerParams) {}

  get chrome() {
    return {
      displayTabs: this.params.tabViewModel.getDisplayTabs(),
      isAgentsActive: this.params.isAgentsActive,
      isSidebarOpen: this.params.isSidebarOpen,
      isSpotlightVisible: this.params.isSpotlightVisible,
      launcherTabId: this.params.launcherTabId,
      selectedTab: this.params.selectedTab,
      activeWorkingDirectory: this.params.activePaneContext.workingDirectory,
      activePaneContext: this.params.activePaneContext
    };
  }

  get workspace() {
    return {
      activePaneId: this.params.workspaceViewModel.getActivePaneId(),
      isLauncherView: this.params.workspaceViewModel.isLauncherView(),
      isSettingsView: this.params.workspaceViewModel.isSettingsView(),
      paneLayout: this.params.workspaceViewModel.getPaneLayout(),
      tabs: this.params.tabs
    };
  }

  get sidebar() {
    return {
      openConversationIds: this.params.sidebarViewModel.getOpenConversationIds(),
      selectedOpenConversationId: this.params.sidebarViewModel.getSelectedOpenConversationId(),
      workspaceConversations: this.params.sidebarViewModel.getWorkspaceConversations()
    };
  }

  get settings() {
    return {
      activeSectionId: this.params.activeSectionId,
      expandedGroupIds: this.params.expandedGroupIds
    };
  }

  get actions(): AppWindowControllerActions {
    return this.params.actions;
  }

  toViewState() {
    return {
      chrome: this.chrome,
      workspace: this.workspace,
      sidebar: this.sidebar,
      settings: this.settings,
      actions: this.actions
    };
  }
}
