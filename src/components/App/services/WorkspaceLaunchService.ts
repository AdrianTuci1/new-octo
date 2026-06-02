import { invoke } from '@tauri-apps/api/core';
import type { AppWindowStoreApi } from '../appWindow/store';
import { getDefaultReadyCloudProfile, toTerminalTarget } from '../settings/cloudProfiles';
import type { WorkspaceChromeTab } from '../chrome';
import * as Utils from '../utils';
import type { TerminalSessionState } from '../utils';
import type { TerminalSessionInfo } from '../../../types/terminal';
import { TabConfigService } from './TabConfigService';
import { WorkspaceService } from './WorkspaceService';

type StartCloudAgentOptions = {
  prompt?: string | null;
  cwd?: string | null;
  repo?: string | null;
  baseBranch?: string | null;
  workBranch?: string | null;
  profileId?: string | null;
  syncStrategy?: 'git' | 'patch' | 'none' | null;
  commitMessage?: string | null;
  artifactPath?: string | null;
};

type WorkspaceLaunchServiceParams = {
  store: AppWindowStoreApi;
  workspaceService: WorkspaceService;
  getLauncherSessionForPane: (paneId: string | null) => TerminalSessionState | null;
  displayTabs: WorkspaceChromeTab[];
  memorySettingsValues: any;
  setIsCloudProfileDrawerOpen: (open: boolean) => void;
  setSelectedCloudProfileIdForEdit: (id: string | null) => void;
};

export class WorkspaceLaunchService {
  constructor(private readonly params: WorkspaceLaunchServiceParams) {}

  async openTabConfig(configPath: string): Promise<void> {
    try {
      const homeDir = this.params.store.getState().pathContext?.homeDir ?? null;
      const { plan } = await TabConfigService.buildTabConfigPlan(configPath, { homeDir });
      const state = this.params.store.getState();

      TabConfigService.applyTabConfigPlan(plan, {
        setTabs: state.setTabs,
        setPaneLayoutsByTabId: state.setPaneLayoutsByTabId,
        setPaneSessionBindingsByPaneId: state.setPaneSessionBindingsByPaneId,
        setTerminalSessions: state.setTerminalSessions,
        setPaneStartupCommandsByPaneId: state.setPaneStartupCommandsByPaneId,
        setSelectedTabId: state.setSelectedTabId,
        setLauncherTabId: state.setLauncherTabId
      });
    } catch (error) {
      console.warn('[WorkspaceLaunchService] failed to open tab config', error);
    }
  }

  saveTabAsConfig(tabId: string): void {
    const state = this.params.store.getState();
    TabConfigService.saveTabAsConfig(tabId, {
      tabs: state.tabs,
      paneLayoutsByTabId: state.paneLayoutsByTabId,
      displayTabs: this.params.displayTabs,
      getLauncherSessionForPane: this.params.getLauncherSessionForPane
    });
  }

  openCloudTerminalTab(): void {
    const profile = getDefaultReadyCloudProfile(this.params.memorySettingsValues);
    if (!profile) {
      this.openCloudSettings();
      return;
    }

    const session = {
      ...Utils.createEmptyTerminalSession(this.defaultWorkingDirectory()),
      terminalTarget: toTerminalTarget(profile),
      agentTerminalTarget: toTerminalTarget(profile)
    };
    const nextTab = this.params.workspaceService.createTerminalTab({
      label: profile.title || 'Cloud',
      terminalSession: session
    });
    this.params.workspaceService.selectTab(nextTab.id);
  }

  async startCloudAgentTab(options: StartCloudAgentOptions = {}): Promise<TerminalSessionInfo | null> {
    const profiles = getDefaultReadyCloudProfile(this.params.memorySettingsValues)
      ? [getDefaultReadyCloudProfile(this.params.memorySettingsValues)!]
      : [];
    const profile = options.profileId
      ? profiles.find((candidate) => candidate.id === options.profileId) ?? getDefaultReadyCloudProfile(this.params.memorySettingsValues)
      : getDefaultReadyCloudProfile(this.params.memorySettingsValues);

    if (!profile) {
      this.openCloudSettings();
      return null;
    }

    const prompt = options.prompt?.trim()
      || window.prompt('Cloud agent prompt', 'Inspect this workspace and report next steps.')?.trim()
      || '';
    if (!prompt) {
      return null;
    }

    const target = toTerminalTarget(profile);
    const state = this.params.store.getState();
    const selectedTab = state.tabs.find((tab) => tab.id === state.selectedTabId) ?? null;
    const activePaneId = selectedTab?.kind === 'terminal'
      ? (state.paneLayoutsByTabId[selectedTab.id]?.activePaneId ?? selectedTab.id)
      : null;
    const workspacePath = options.cwd?.trim()
      || (activePaneId ? this.params.getLauncherSessionForPane(activePaneId)?.workingDirectory?.trim() || '' : '')
      || this.defaultWorkingDirectory()
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

    const tab = this.params.workspaceService.createTerminalTab({
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
    this.params.workspaceService.selectTab(tab.id);
    return sessionInfo;
  }

  private defaultWorkingDirectory(): string | null {
    const pathContext = this.params.store.getState().pathContext;
    return pathContext?.homeDir ?? pathContext?.currentDir ?? null;
  }

  private openCloudSettings(): void {
    this.params.workspaceService.openSettingsSection('cloud-platform/cloud');
    this.params.setIsCloudProfileDrawerOpen(true);
    this.params.setSelectedCloudProfileIdForEdit(null);
  }
}
