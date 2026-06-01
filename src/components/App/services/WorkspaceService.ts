import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initialWorkspaceChromeTabs, type WorkspaceChromeTab, type WorkspacePaneLayout } from '../chrome';
import * as Utils from '../utils';
import type { TerminalSessionState } from '../utils';
import type { AppWindowStoreApi } from '../hooks/useAppWindow/store';
import { buildEmptyWorkspaceSnapshot } from '../hooks/useAppWindow/helpers';

const DEFAULT_TAB_LABEL = '~';

export class WorkspaceService {
  private store: AppWindowStoreApi;

  constructor(store: AppWindowStoreApi) {
    this.store = store;
  }

  private resolvePaneId(tabId: string): string | null {
    const state = this.store.getState();
    const paneLayout = state.paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId);
    const paneIds = Utils.collectPaneIdsFromLayout(paneLayout);
    return paneLayout.activePaneId ?? paneIds[0] ?? null;
  }

  private resolveLauncherSessionId(paneId: string): string {
    const state = this.store.getState();
    return state.paneSessionBindingsByPaneId[paneId] ?? paneId;
  }

  private getSessionForPane(paneId: string): TerminalSessionState | null {
    const state = this.store.getState();
    const launcherSessionId = this.resolveLauncherSessionId(paneId);
    if (!launcherSessionId) {
      return null;
    }
    const pathContext = state.pathContext;
    const workingDirectory = pathContext?.homeDir ?? pathContext?.currentDir ?? null;
    return state.terminalSessions[launcherSessionId] ?? Utils.createEmptyTerminalSession(workingDirectory);
  }

  private defaultWorkingDirectory(): string | null {
    const state = this.store.getState();
    const pathContext = state.pathContext;
    return pathContext?.homeDir ?? pathContext?.currentDir ?? null;
  }

  /** Create a new terminal tab and wire up its pane layout, session binding, and terminal session. */
  createTerminalTab(options?: {
    label?: string;
    terminalSession?: TerminalSessionState;
    workingDirectory?: string | null;
  }): WorkspaceChromeTab {
    const state = this.store.getState();
    const { nextTerminalIndex, selectedTabId, paneLayoutsByTabId, activeSectionId, expandedGroupIds, isSidebarOpen, isAgentsActive } = state;

    const activePaneId = this.resolvePaneId(selectedTabId);
    const resolvedWorkingDirectory =
      options?.workingDirectory ??
      options?.terminalSession?.workingDirectory ??
      (activePaneId ? this.getSessionForPane(activePaneId)?.workingDirectory ?? null : null) ??
      this.defaultWorkingDirectory();

    const terminalSession = options?.terminalSession
      ? {
          ...options.terminalSession,
          workingDirectory: options.terminalSession.workingDirectory ?? resolvedWorkingDirectory
        }
      : Utils.createEmptyTerminalSession(resolvedWorkingDirectory);

    const nextTab = Utils.buildTerminalTab(nextTerminalIndex, options?.label ?? DEFAULT_TAB_LABEL);

    state.setTabs((current) => [...current, nextTab]);
    state.setPaneLayoutsByTabId((current) => ({
      ...current,
      [nextTab.id]: Utils.createDefaultPaneLayout(nextTab.id)
    }));
    state.setPaneSessionBindingsByPaneId((current) => ({
      ...current,
      [nextTab.id]: nextTab.id
    }));
    state.setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: terminalSession
    }));
    state.setNextTerminalIndex((value) => value + 1);

    return nextTab;
  }

  /** Close a tab. If it's the last tab, close the window with a fresh workspace. */
  async closeTab(tabId: string): Promise<void> {
    const state = this.store.getState();
    const { tabs, selectedTabId, paneLayoutsByTabId } = state;

    if (tabs.length <= 1) {
      await this.closeWindowWithFreshWorkspace();
      return;
    }

    const paneLayout = paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId);
    const paneIds = Utils.collectPaneIdsFromLayout(paneLayout);

    // Kill terminal sessions for this tab's panes
    const closingSessionIds = paneIds.flatMap((paneId) => {
      const session = this.getSessionForPane(paneId);
      return [session?.terminalSessionId ?? null, session?.agentTerminalSessionId ?? null];
    }).filter((sessionId): sessionId is string => Boolean(sessionId));

    closingSessionIds.forEach((sessionId) => {
      void invoke('terminal_kill_session', { request: { sessionId } }).catch(() => {});
    });

    state.setTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (nextTabs.length === 0) {
        return current;
      }
      if (selectedTabId === tabId && nextTabs.length > 0) {
        state.setSelectedTabId(nextTabs[0]?.id ?? 'terminal-main');
      }
      return nextTabs;
    });

    state.setLauncherTabId((current) => {
      if (current !== tabId) return current;
      const stateNow = this.store.getState();
      const fallbackTerminal = stateNow.tabs.find((tab) => tab.id !== tabId && tab.kind === 'terminal');
      return fallbackTerminal?.id ?? null;
    });

    state.setPaneLayoutsByTabId((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    state.setPaneSessionBindingsByPaneId((current) => {
      const next = { ...current };
      paneIds.forEach((paneId) => { delete next[paneId]; });
      return next;
    });

    state.setTerminalSessions((current) => {
      const next = { ...current };
      paneIds.forEach((paneId) => { delete next[paneId]; });
      return next;
    });

    state.setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      paneIds.forEach((paneId) => { delete next[paneId]; });
      return next;
    });
  }

  /** Close all tabs except tabId. */
  closeAllTabsBut(tabId: string): void {
    const state = this.store.getState();
    const { paneLayoutsByTabId } = state;

    const keptPaneIds = new Set(
      Utils.collectPaneIdsFromLayout(paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId))
    );

    state.setTabs((current) => current.filter((tab) => tab.id === tabId));
    state.setSelectedTabId(tabId);
    state.setPaneLayoutsByTabId((current) =>
      current[tabId] ? { [tabId]: current[tabId] } : {}
    );
    state.setTerminalSessions((current) =>
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId)))
    );
    state.setPaneSessionBindingsByPaneId((current) =>
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId)))
    );
    state.setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      Object.keys(next).forEach((paneId) => {
        if (!keptPaneIds.has(paneId)) delete next[paneId];
      });
      return next;
    });
    state.setLauncherTabId((current) => (current === tabId ? current : null));
  }

  /** Close all tabs to the right of tabId. */
  closeTabsToRight(tabId: string): void {
    const state = this.store.getState();
    const { tabs, paneLayoutsByTabId } = state;

    const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0) return;

    const keptTabIds = new Set(tabs.slice(0, tabIndex + 1).map((tab) => tab.id));
    const keptPaneIds = new Set(
      Array.from(keptTabIds).flatMap((keptId) =>
        Utils.collectPaneIdsFromLayout(paneLayoutsByTabId[keptId] ?? Utils.createDefaultPaneLayout(keptId))
      )
    );

    state.setTabs((current) => current.slice(0, tabIndex + 1));
    state.setPaneLayoutsByTabId((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => keptTabIds.has(id)))
    );
    state.setTerminalSessions((current) =>
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId)))
    );
    state.setPaneSessionBindingsByPaneId((current) =>
      Object.fromEntries(Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId)))
    );
    state.setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      Object.keys(next).forEach((paneId) => {
        if (!keptPaneIds.has(paneId)) delete next[paneId];
      });
      return next;
    });
    state.setLauncherTabId((current) => {
      if (!current) return null;
      return keptTabIds.has(current) ? current : null;
    });
  }

  /** Split a terminal pane within the given tab. */
  splitPane(direction: 'right' | 'up', tabId?: string): void {
    const state = this.store.getState();
    const { selectedTabId, paneLayoutsByTabId } = state;

    const targetTabId = tabId ?? selectedTabId;
    const targetTab = state.tabs.find((tab) => tab.id === targetTabId);
    if (!targetTab || targetTab.kind !== 'terminal') return;

    const sourcePaneId = this.resolvePaneId(targetTabId);
    if (!sourcePaneId) return;

    const nextPaneId = Utils.buildPaneId(
      targetTabId,
      Object.values(paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );

    const sourceSession = this.getSessionForPane(sourcePaneId) ?? Utils.createEmptyTerminalSession(this.defaultWorkingDirectory());

    state.setPaneLayoutsByTabId((current) => ({
      ...current,
      [targetTabId]: Utils.splitPaneLayout(
        current[targetTabId] ?? Utils.createDefaultPaneLayout(targetTabId),
        sourcePaneId,
        direction === 'up' ? 'vertical' : 'horizontal',
        nextPaneId
      )
    }));

    state.setTerminalSessions((current) => ({
      ...current,
      [nextPaneId]: {
        ...Utils.createEmptyTerminalSession(sourceSession.workingDirectory),
        workingDirectory: sourceSession.workingDirectory
      }
    }));

    state.setPaneSessionBindingsByPaneId((current) => ({
      ...current,
      [nextPaneId]: nextPaneId
    }));

    state.setSelectedTabId(targetTabId);
  }

  /** Move a tab left or right in the tab bar. */
  moveTab(tabId: string, direction: 'left' | 'right'): void {
    const state = this.store.getState();
    state.setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) return current;

      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const nextTabs = [...current];
      const [movedTab] = nextTabs.splice(index, 1);
      nextTabs.splice(targetIndex, 0, movedTab);
      return nextTabs;
    });
  }

  /** Prompt to rename a tab. */
  renameTab(tabId: string): void {
    const state = this.store.getState();
    const tab = state.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;

    const nextLabel = window.prompt('Rename tab', tab.customLabel?.trim() || tab.label);
    if (nextLabel === null) return;

    const normalized = nextLabel.trim();
    state.setTabs((current) =>
      current.map((candidate) =>
        candidate.id === tabId
          ? { ...candidate, customLabel: normalized.length > 0 ? normalized : null }
          : candidate
      )
    );
  }

  /** Set a tab's tint color. */
  setTabTint(tabId: string, color: string | null): void {
    const state = this.store.getState();
    state.setTabs((current) =>
      current.map((tab) => (tab.id === tabId ? { ...tab, tintColor: color } : tab))
    );
  }

  /** Set which tab is the "launcher" tab. */
  setLauncherTabId(tabId: string): void {
    this.store.getState().setLauncherTabId(tabId);
  }

  /** Close a single pane within a tab. */
  closePane(paneId: string): void {
    const state = this.store.getState();
    const { paneLayoutsByTabId } = state;

    const tabId = Utils.findTabIdForPane(paneLayoutsByTabId, paneId);
    if (!tabId) return;

    const layout = paneLayoutsByTabId[tabId];
    if (!layout) return;

    const paneIds = Utils.collectPaneIdsFromLayout(layout);
    if (paneIds.length <= 1) {
      this.closeTab(tabId);
      return;
    }

    const session = this.getSessionForPane(paneId);
    if (session) {
      const closingIds = [session.terminalSessionId, session.agentTerminalSessionId]
        .filter((id): id is string => Boolean(id));
      closingIds.forEach((sessionId) => {
        void invoke('terminal_kill_session', { request: { sessionId } }).catch(() => {});
      });
    }

    state.setPaneLayoutsByTabId((current) => {
      const nextLayout = Utils.removePaneFromLayout(layout, paneId);
      return {
        ...current,
        [tabId]: nextLayout ?? Utils.createDefaultPaneLayout(tabId)
      };
    });

    state.setTerminalSessions((current) => {
      const next = { ...current };
      delete next[paneId];
      return next;
    });

    state.setPaneSessionBindingsByPaneId((current) => {
      const next = { ...current };
      delete next[paneId];
      return next;
    });

    state.setPaneStartupCommandsByPaneId((current) => {
      const next = { ...current };
      delete next[paneId];
      return next;
    });
  }

  /** Set the active (focused) pane within a tab. */
  focusPane(paneId: string): void {
    const state = this.store.getState();
    const { selectedTabId, paneLayoutsByTabId } = state;

    const selectedTab = state.tabs.find((tab) => tab.id === selectedTabId);
    if (!selectedTab || selectedTab.kind !== 'terminal') return;

    const layout = paneLayoutsByTabId[selectedTab.id];
    if (!layout) return;

    const activePaneId = layout.activePaneId ?? Utils.collectPaneIdsFromLayout(layout)[0];
    if (activePaneId === paneId) return;

    state.setPaneLayoutsByTabId((current) => ({
      ...current,
      [selectedTab.id]: {
        ...(current[selectedTab.id] ?? Utils.createDefaultPaneLayout(selectedTab.id)),
        activePaneId: paneId
      }
    }));
  }

  private async closeWindowWithFreshWorkspace(): Promise<void> {
    const state = this.store.getState();
    const { terminalSessions, activeSectionId, expandedGroupIds, isAgentsActive, isSidebarOpen } = state;

    const sessionIds = Object.values(terminalSessions)
      .flatMap((session) => [session.terminalSessionId, session.agentTerminalSessionId])
      .filter((sessionId): sessionId is string => Boolean(sessionId));

    await Promise.all(
      sessionIds.map((sessionId) =>
        invoke('terminal_kill_session', { request: { sessionId } }).catch(() => null)
      )
    );

    const { useMemoryStore } = await import('../../../stores/memoryStore');
    const saveWorkspace = useMemoryStore.getState().saveWorkspace;

    await saveWorkspace(
      buildEmptyWorkspaceSnapshot({ activeSectionId, expandedGroupIds, isAgentsActive, isSidebarOpen })
    );

    if ((window as any).__TAURI_INTERNALS__) {
      await getCurrentWindow().close();
    }
  }
}
