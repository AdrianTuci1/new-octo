import type { AppWindowStoreApi } from '../appWindow/store';
import type { WorkspaceService } from './WorkspaceService';
import * as Utils from '../utils';

export class ConversationService {
  private store: AppWindowStoreApi;
  private workspaceService: WorkspaceService;
  private preferredConversationLayout: 'new-tab' | 'current-pane' | 'split-pane';

  constructor(
    store: AppWindowStoreApi,
    workspaceService: WorkspaceService,
    preferredConversationLayout: 'new-tab' | 'current-pane' | 'split-pane' = 'new-tab'
  ) {
    this.store = store;
    this.workspaceService = workspaceService;
    this.preferredConversationLayout = preferredConversationLayout;
  }

  private resolvePaneId(tabId: string): string | null {
    const state = this.store.getState();
    const paneLayout = state.paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId);
    const paneIds = Utils.collectPaneIdsFromLayout(paneLayout);
    return paneLayout.activePaneId ?? paneIds[0] ?? null;
  }

  private resolveTerminalTabId(): string {
    const state = this.store.getState();
    const { selectedTabId, tabs, launcherTabId, isSpotlightVisible } = state;
    const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0];

    if (selectedTab && selectedTab.kind === 'terminal' && (!isSpotlightVisible || selectedTab.id !== launcherTabId)) {
      return selectedTab.id;
    }

    const firstTerminalTab = tabs.find((tab) =>
      tab.kind === 'terminal' && (!isSpotlightVisible || tab.id !== launcherTabId)
    );
    if (firstTerminalTab) {
      state.setSelectedTabId(firstTerminalTab.id);
      return firstTerminalTab.id;
    }

    const nextTab = this.workspaceService.createTerminalTab();
    state.setSelectedTabId(nextTab.id);
    return nextTab.id;
  }

  private getSessionForPane(paneId: string) {
    const state = this.store.getState();
    const pathContext = state.pathContext;
    const defaultWorkingDirectory = pathContext?.homeDir ?? pathContext?.currentDir ?? null;
    const launcherSessionId = state.paneSessionBindingsByPaneId[paneId] ?? paneId;
    return state.terminalSessions[launcherSessionId] ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);
  }

  /** Select an existing conversation: navigate to its pane/tab or open it per preferred layout. */
  selectConversation(conversationId: string): void {
    const state = this.store.getState();
    const { paneSessionBindingsByPaneId, paneLayoutsByTabId } = state;

    // Check if this conversation is already open in a pane
    const existingPaneId = Object.keys(paneSessionBindingsByPaneId).find((paneId) =>
      this.getSessionForPane(paneId)?.activeConversationId === conversationId
    ) ?? null;

    const existingTabId = existingPaneId
      ? Utils.findTabIdForPane(paneLayoutsByTabId, existingPaneId)
      : null;

    if (existingPaneId && existingTabId) {
      if (state.selectedTabId !== existingTabId) {
        state.setSelectedTabId(existingTabId);
      }
      state.setPaneLayoutsByTabId((current) => ({
        ...current,
        [existingTabId]: {
          ...(current[existingTabId] ?? Utils.createDefaultPaneLayout(existingTabId)),
          activePaneId: existingPaneId
        }
      }));
      return;
    }

    // Open per preferred layout
    if (this.preferredConversationLayout === 'current-pane') {
      const tabId = this.resolveTerminalTabId();
      const paneId = this.resolvePaneId(tabId);
      if (paneId) {
        state.setTerminalSessions((current) => ({
          ...current,
          [paneId]: {
            ...current[paneId],
            activeConversationId: conversationId,
            composerSurface: 'agent'
          }
        }));
        state.setSelectedTabId(tabId);
      }
      return;
    }

    if (this.preferredConversationLayout === 'split-pane') {
      const stateNow = this.store.getState();
      const selectedTab = stateNow.tabs.find((tab) => tab.id === stateNow.selectedTabId);
      const tabId = selectedTab?.kind === 'terminal' ? selectedTab.id : this.resolveTerminalTabId();
      const sourcePaneId = this.resolvePaneId(tabId);
      if (!sourcePaneId) return;

      const nextPaneId = Utils.buildPaneId(
        tabId,
        Object.values(stateNow.paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
      );
      const sourceSession = this.getSessionForPane(sourcePaneId);

      state.setTerminalSessions((current) => ({
        ...current,
        [nextPaneId]: {
          ...Utils.createEmptyTerminalSession(sourceSession?.workingDirectory ?? null),
          activeConversationId: conversationId,
          composerSurface: 'agent'
        }
      }));

      state.setPaneSessionBindingsByPaneId((current) => ({
        ...current,
        [nextPaneId]: nextPaneId
      }));

      state.setPaneLayoutsByTabId((current) => ({
        ...current,
        [tabId]: Utils.splitPaneLayout(
          current[tabId] ?? Utils.createDefaultPaneLayout(tabId),
          sourcePaneId,
          'horizontal',
          nextPaneId
        )
      }));

      state.setSelectedTabId(tabId);
      return;
    }

    // Default: new-tab
    const nextTab = this.workspaceService.createTerminalTab();
    state.setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        ...current[nextTab.id],
        activeConversationId: conversationId,
        composerSurface: 'agent'
      }
    }));
    state.setSelectedTabId(nextTab.id);
  }

  /** Start a new conversation in the current terminal pane. Returns the new conversation ID. */
  newConversation(_options?: { seedPrompt?: string }): string {
    const state = this.store.getState();
    const nextConversationId = Utils.createConversationId();
    const terminalTabId = this.resolveTerminalTabId();
    const paneId = this.resolvePaneId(terminalTabId);

    if (paneId) {
      state.setOpenPastConversationBaselineById((current) => {
        if (!(nextConversationId in current)) return current;
        const next = { ...current };
        delete next[nextConversationId];
        return next;
      });

      state.setTerminalSessions((current) => {
        if (current[paneId]?.activeConversationId === nextConversationId) return current;
        return {
          ...current,
          [paneId]: {
            ...current[paneId],
            activeConversationId: nextConversationId,
            composerSurface: 'agent'
          }
        };
      });
    }

    return nextConversationId;
  }

  /** Start a new conversation in a new terminal tab. Returns the new conversation ID. */
  newConversationInNewTab(_options?: { seedPrompt?: string }): string {
    const state = this.store.getState();
    const nextConversationId = Utils.createConversationId();
    const nextTab = this.workspaceService.createTerminalTab();

    state.setOpenPastConversationBaselineById((current) => {
      if (!(nextConversationId in current)) return current;
      const next = { ...current };
      delete next[nextConversationId];
      return next;
    });

    state.setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        ...current[nextTab.id],
        activeConversationId: nextConversationId,
        composerSurface: 'agent'
      }
    }));
    state.setSelectedTabId(nextTab.id);

    return nextConversationId;
  }

  /** Delete a conversation and clear it from any panes it's active in. */
  async deleteConversation(conversationId: string): Promise<void> {
    const state = this.store.getState();

    // Import memoryStore dynamically to avoid circular deps
    const { useMemoryStore } = await import('../../../stores/memoryStore');
    const deleteConversation = useMemoryStore.getState().deleteConversation;
    await deleteConversation(conversationId);

    const matchingPaneIds = Object.keys(state.paneSessionBindingsByPaneId)
      .filter((paneId) => this.getSessionForPane(paneId)?.activeConversationId === conversationId);

    state.setOpenPastConversationBaselineById((current) => {
      if (!(conversationId in current)) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });

    if (matchingPaneIds.length === 0) return;

    state.setTerminalSessions((current) => {
      const next = { ...current };
      matchingPaneIds.forEach((paneId) => {
        next[paneId] = {
          ...next[paneId],
          activeConversationId: null,
          composerSurface: 'terminal'
        };
      });
      return next;
    });
  }

  /** Fork a conversation into a new tab. */
  forkInNewTab(conversationId: string): void {
    const state = this.store.getState();
    const nextTab = this.workspaceService.createTerminalTab();

    state.setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        ...current[nextTab.id],
        activeConversationId: conversationId,
        composerSurface: 'agent'
      }
    }));
    state.setSelectedTabId(nextTab.id);
  }

  /** Fork a conversation into a new pane (horizontal split) in the current tab. */
  forkInNewPane(conversationId: string): void {
    const state = this.store.getState();
    const selectedTab = state.tabs.find((tab) => tab.id === state.selectedTabId);
    const tabId = selectedTab?.kind === 'terminal' ? selectedTab.id : this.resolveTerminalTabId();
    const sourcePaneId = this.resolvePaneId(tabId);
    if (!sourcePaneId) return;

    const nextPaneId = Utils.buildPaneId(
      tabId,
      Object.values(state.paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );
    const sourceSession = this.getSessionForPane(sourcePaneId);

    state.setTerminalSessions((current) => ({
      ...current,
      [nextPaneId]: {
        ...Utils.createEmptyTerminalSession(sourceSession?.workingDirectory ?? null),
        activeConversationId: conversationId,
        composerSurface: 'agent'
      }
    }));

    state.setPaneSessionBindingsByPaneId((current) => ({
      ...current,
      [nextPaneId]: nextPaneId
    }));

    state.setPaneLayoutsByTabId((current) => ({
      ...current,
      [tabId]: Utils.splitPaneLayout(
        current[tabId] ?? Utils.createDefaultPaneLayout(tabId),
        sourcePaneId,
        'horizontal',
        nextPaneId
      )
    }));

    state.setSelectedTabId(tabId);
  }
}
