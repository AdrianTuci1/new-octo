import { invoke } from '@tauri-apps/api/core';
import { useMemoryStore } from '../../../stores/memoryStore';
import type { WorkspaceChromeTab, WorkspacePaneLayout } from '../chrome';
import { getDefaultReadyCloudProfile, toTerminalTarget } from '../settings/cloudProfiles';
import * as Utils from '../utils';
import type { SavedWorkspaceTabConfig, TerminalSessionState } from '../utils';
import {
  buildTabConfigLaunchPlan,
  parseTabConfigToml
} from '../utils/tabConfigs';
import {
  buildTabConfigTabId,
  fileNameFromPath,
  promptForTabConfigVariables
} from '../hooks/useAppWindow/helpers';

export class TabConfigService {
  /** Open a tab config .toml file, creating all necessary tabs/panes/sessions. */
  static async openTabConfig(configPath: string): Promise<void> {
    try {
      const contents = await invoke<string>('terminal_read_file', {
        request: { path: configPath }
      });
      const fallbackName = fileNameFromPath(configPath).replace(/\.toml$/i, '') || 'Tab config';
      const parsed = parseTabConfigToml(contents, fallbackName);
      const resolvedVariables = promptForTabConfigVariables(parsed);

      const memorySettingsValues = useMemoryStore.getState().settings?.values;
      const readyCloudProfile = getDefaultReadyCloudProfile(memorySettingsValues);
      const cloudTarget = readyCloudProfile ? toTerminalTarget(readyCloudProfile) : null;

      const tabId = buildTabConfigTabId(fileNameFromPath(configPath) ?? parsed.name);
      const plan = buildTabConfigLaunchPlan(parsed, {
        tabId,
        homeDir: null,
        cloudTarget,
        resolvedVariables
      });

      // These setter functions would need store access, so this static method
      // is designed to be called from a context where store setters are available.
      // The caller must pass a callback to apply the plan.
      console.warn(
        '[TabConfigService] openTabConfig returns a plan; call applyTabConfigPlan to apply it.',
        plan
      );
    } catch (error) {
      console.warn('[TabConfigService] failed to open tab config', error);
    }
  }

  /** Build a tab config launch plan without applying it. For use by WorkspaceService consumers. */
  static async buildTabConfigPlan(configPath: string): Promise<{
    plan: ReturnType<typeof buildTabConfigLaunchPlan>;
    resolvedVariables: Record<string, string>;
  }> {
    const contents = await invoke<string>('terminal_read_file', {
      request: { path: configPath }
    });
    const fallbackName = fileNameFromPath(configPath).replace(/\.toml$/i, '') || 'Tab config';
    const parsed = parseTabConfigToml(contents, fallbackName);
    const resolvedVariables = promptForTabConfigVariables(parsed);

    const memorySettingsValues = useMemoryStore.getState().settings?.values;
    const readyCloudProfile = getDefaultReadyCloudProfile(memorySettingsValues);
    const cloudTarget = readyCloudProfile ? toTerminalTarget(readyCloudProfile) : null;

    const tabId = buildTabConfigTabId(fileNameFromPath(configPath) ?? parsed.name);
    const plan = buildTabConfigLaunchPlan(parsed, {
      tabId,
      homeDir: null,
      cloudTarget,
      resolvedVariables
    });

    return { plan, resolvedVariables };
  }

  /** Apply a tab config plan into the store. */
  static applyTabConfigPlan(
    plan: ReturnType<typeof buildTabConfigLaunchPlan>,
    apply: {
      setTabs: (updater: WorkspaceChromeTab[] | ((current: WorkspaceChromeTab[]) => WorkspaceChromeTab[])) => void;
      setPaneLayoutsByTabId: (updater: Record<string, WorkspacePaneLayout> | ((current: Record<string, WorkspacePaneLayout>) => Record<string, WorkspacePaneLayout>)) => void;
      setPaneSessionBindingsByPaneId: (updater: Utils.WorkspacePaneSessionBindings | ((current: Utils.WorkspacePaneSessionBindings) => Utils.WorkspacePaneSessionBindings)) => void;
      setTerminalSessions: (updater: Record<string, TerminalSessionState> | ((current: Record<string, TerminalSessionState>) => Record<string, TerminalSessionState>)) => void;
      setPaneStartupCommandsByPaneId: (updater: Record<string, string[]> | ((current: Record<string, string[]>) => Record<string, string[]>)) => void;
      setSelectedTabId: (updater: string | ((current: string) => string)) => void;
      setLauncherTabId: (updater: string | null | ((current: string | null) => string | null)) => void;
    }
  ): void {
    apply.setTabs((current) => [...current, plan.tab]);
    apply.setPaneLayoutsByTabId((current) => ({
      ...current,
      [plan.tab.id]: plan.paneLayout
    }));
    apply.setPaneSessionBindingsByPaneId((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.keys(plan.paneStateByPaneId).map((paneId) => [paneId, paneId])
      )
    }));
    apply.setTerminalSessions((current) => ({
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
    apply.setPaneStartupCommandsByPaneId((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(plan.paneStateByPaneId).map(([paneId, state]) => [
          paneId,
          state.startupCommands
        ])
      )
    }));
    apply.setSelectedTabId(plan.tab.id);
    apply.setLauncherTabId(plan.tab.id);
  }

  /** Save the current tab state as a named config. */
  static saveTabAsConfig(
    tabId: string,
    options: {
      tabs: WorkspaceChromeTab[];
      paneLayoutsByTabId: Record<string, WorkspacePaneLayout>;
      displayTabs: WorkspaceChromeTab[];
      getLauncherSessionForPane: (paneId: string | null) => TerminalSessionState | null;
    }
  ): void {
    const tab = options.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;

    const nextName = window.prompt(
      'Config name',
      options.displayTabs.find((item) => item.id === tabId)?.label || tab.label
    );
    if (!nextName || nextName.trim().length === 0) return;

    const savedConfigs = Array.isArray(useMemoryStore.getState().settings?.values.savedWorkspaceTabConfigs)
      ? useMemoryStore.getState().settings?.values.savedWorkspaceTabConfigs as SavedWorkspaceTabConfig[]
      : [];

    const nextConfig: SavedWorkspaceTabConfig = {
      id: `workspace-config-${Date.now()}`,
      name: nextName.trim(),
      createdAt: new Date().toISOString(),
      tab,
      terminalSession:
        options.getLauncherSessionForPane(
          options.paneLayoutsByTabId[tabId]?.activePaneId ?? tabId
        ) ?? null
    };

    void useMemoryStore.getState().saveSettings(
      {
        savedWorkspaceTabConfigs: [nextConfig, ...savedConfigs].slice(0, 24)
      } as any,
      true
    );
  }
}
