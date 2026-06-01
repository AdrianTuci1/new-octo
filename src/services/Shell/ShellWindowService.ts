import type { StoreApi } from 'zustand/vanilla';
import type { ShellState, ShellStoreApi } from '../../stores/ShellStore';
import { useMemoryStore } from '../../stores/memoryStore';
import { useUIStore } from '../../stores/uiStore';
import type { WorkspaceChromeTab, WorkspacePaneLayout, WorkspaceConversation, WorkspaceActivePaneContext, WorkspacePaneDirection } from '../../components/App/chrome';
import { initialWorkspaceChromeTabs, defaultWorkspaceChromeTabId } from '../../components/App/chrome';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from '../../components/App/settings/settingsData';
import { normalizeAgentSettings } from '../../components/App/settings/agentSettings';
import * as Utils from '../../components/App/utils';
import type { TerminalSessionState, WorkspacePaneSessionBindings } from '../../components/App/utils';
import type { MemorySettingsRecord } from '../../types/memory';
import { normalizeCodeSettings } from '../../components/App/settings/codeSettings';

/**
 * ShellWindowService — Owns all workspace-shell business logic.
 * Replaces the former `useAppWindow` hook and its sub-modules.
 * Pure TypeScript. No React dependencies except for store access.
 */
export class ShellWindowService {
  constructor(private readonly store: ShellStoreApi) {}

  // ── Store accessors (read) ────────────────────────────────────────

  get tabs(): WorkspaceChromeTab[] {
    return this.store.getState().tabs;
  }

  get selectedTabId(): string {
    return this.store.getState().selectedTabId;
  }

  get launcherTabId(): string | null {
    return this.store.getState().launcherTabId;
  }

  get paneLayoutsByTabId(): Record<string, ReturnType<typeof Utils.createDefaultPaneLayout>> {
    return this.store.getState().paneLayoutsByTabId;
  }

  get paneSessionBindingsByPaneId(): WorkspacePaneSessionBindings {
    return this.store.getState().paneSessionBindingsByPaneId;
  }

  get terminalSessions(): Record<string, TerminalSessionState> {
    return this.store.getState().terminalSessions;
  }

  get isSidebarOpen(): boolean {
    return this.store.getState().isSidebarOpen;
  }

  get isAgentsActive(): boolean {
    return this.store.getState().isAgentsActive;
  }

  get isSpotlightVisible(): boolean {
    return this.store.getState().isSpotlightVisible;
  }

  get activeSectionId(): string {
    return this.store.getState().activeSectionId;
  }

  get expandedGroupIds(): string[] {
    return this.store.getState().expandedGroupIds;
  }

  get pathContext(): { homeDir: string; currentDir: string } | null {
    return this.store.getState().pathContext;
  }

  get paneStartupCommandsByPaneId(): Record<string, string[]> {
    return this.store.getState().paneStartupCommandsByPaneId;
  }

  get nextTerminalIndex(): number {
    return this.store.getState().nextTerminalIndex;
  }

  get openPastConversationBaselineById(): Record<string, number> {
    return this.store.getState().openPastConversationBaselineById;
  }

  // ── Derived state ──────────────────────────────────────────────────

  get selectedTab(): WorkspaceChromeTab {
    const { tabs, selectedTabId } = this.store.getState();
    return tabs.find((t) => t.id === selectedTabId) ?? tabs[0] ?? initialWorkspaceChromeTabs[0];
  }

  get selectedPaneLayout(): WorkspacePaneLayout | null {
    const tab = this.selectedTab;
    if (tab.kind !== 'terminal') return null;
    const { paneLayoutsByTabId } = this.store.getState();
    return paneLayoutsByTabId[tab.id] ?? Utils.createDefaultPaneLayout(tab.id);
  }

  get activePaneId(): string | null {
    const layout = this.selectedPaneLayout;
    if (!layout) return null;
    const paneIds = Utils.collectPaneIdsFromLayout(layout);
    return layout.activePaneId ?? paneIds[0] ?? null;
  }

  get selectedPaneIds(): string[] {
    const layout = this.selectedPaneLayout;
    return layout ? Utils.collectPaneIdsFromLayout(layout) : [];
  }

  get defaultWorkingDirectory(): string | null {
    const ctx = this.store.getState().pathContext;
    return ctx?.homeDir ?? ctx?.currentDir ?? null;
  }

  get isSettingsView(): boolean {
    return this.selectedTab.kind === 'settings';
  }

  get isLauncherView(): boolean {
    return !this.isAgentsActive && this.selectedTab.kind === 'terminal';
  }

  get launcherSessionForPane(): (paneId: string) => TerminalSessionState | null {
    return (paneId: string) => {
      const { terminalSessions, paneSessionBindingsByPaneId } = this.store.getState();
      const bindingId = paneSessionBindingsByPaneId[paneId];
      if (!bindingId) return null;
      return terminalSessions[bindingId] ?? null;
    };
  }

  get activePaneContext(): WorkspaceActivePaneContext {
    const activePaneId = this.activePaneId;
    const session = activePaneId ? this.launcherSessionForPane(activePaneId) : null;
    return {
      tabKind: this.selectedTab.kind,
      paneId: activePaneId,
      launcherSessionId: session?.terminalSessionId ?? null,
      workingDirectory: session?.workingDirectory ?? this.defaultWorkingDirectory,
      composerSurface: session?.composerSurface ?? null,
      activeConversationId: session?.activeConversationId ?? null,
      canShowGitDiff: this.selectedTab.kind !== 'settings',
    };
  }

  get activeConversationId(): string | null {
    const activePaneId = this.activePaneId;
    if (!activePaneId) return null;
    const session = this.launcherSessionForPane(activePaneId);
    return session?.activeConversationId ?? null;
  }

  // ── Tab actions ────────────────────────────────────────────────────

  createTerminalTab(options: {
    label?: string;
    terminalSession?: TerminalSessionState;
    workingDirectory?: string | null;
  } = {}): WorkspaceChromeTab {
    const state = this.store.getState();
    const resolvedWd = options.workingDirectory
      ?? options.terminalSession?.workingDirectory
      ?? this.defaultWorkingDirectory;
    const session = options.terminalSession
      ? { ...options.terminalSession, workingDirectory: options.terminalSession.workingDirectory ?? resolvedWd }
      : Utils.createEmptyTerminalSession(resolvedWd);
    const nextTab = {
      ...Utils.buildTerminalTab(state.nextTerminalIndex, options.label ?? '~'),
      tintColor: this.selectedTab.tintColor ?? null,
    };

    this.store.setState((s) => ({
      tabs: [...s.tabs, nextTab],
      paneLayoutsByTabId: { ...s.paneLayoutsByTabId, [nextTab.id]: Utils.createDefaultPaneLayout(nextTab.id) },
      paneSessionBindingsByPaneId: { ...s.paneSessionBindingsByPaneId, [nextTab.id]: nextTab.id },
      terminalSessions: { ...s.terminalSessions, [nextTab.id]: session },
      nextTerminalIndex: s.nextTerminalIndex + 1,
    }));
    return nextTab;
  }

  selectTab(tabId: string): void {
    this.store.getState().setSelectedTabId(tabId);
  }

  closeTab(tabId: string): void {
    const state = this.store.getState();
    const nextTabs = state.tabs.filter((t) => t.id !== tabId);
    if (nextTabs.length === 0) return;
    const nextSelectedId = state.selectedTabId === tabId
      ? (nextTabs[0]?.id ?? state.selectedTabId)
      : state.selectedTabId;
    const nextPaneLayouts = { ...state.paneLayoutsByTabId };
    delete nextPaneLayouts[tabId];
    const nextSessions = { ...state.terminalSessions };
    delete nextSessions[tabId];

    this.store.setState({
      tabs: nextTabs,
      selectedTabId: nextSelectedId,
      paneLayoutsByTabId: nextPaneLayouts,
      terminalSessions: nextSessions,
    });
  }

  setLauncherTabId(tabId: string): void {
    this.store.getState().setLauncherTabId(tabId);
  }

  removeTabFromLauncher(tabId: string): void {
    const state = this.store.getState();
    if (state.launcherTabId !== tabId) return;
    const next = state.tabs.find((t) => t.id !== tabId && t.kind === 'terminal');
    this.store.getState().setLauncherTabId(next?.id ?? null);
  }

  renameTab(tabId: string, newLabel: string): void {
    this.store.getState().setTabs((tabs) =>
      tabs.map((t) => (t.id === tabId ? { ...t, label: newLabel, customLabel: newLabel } : t))
    );
  }

  setTabTint(tabId: string, tintColor: string | null): void {
    this.store.getState().setTabs((tabs) =>
      tabs.map((t) => (t.id === tabId ? { ...t, tintColor } : t))
    );
  }

  moveTab(tabId: string, direction: 'left' | 'right'): void {
    this.store.getState().setTabs((tabs) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx < 0) return tabs;
      const target = direction === 'left' ? idx - 1 : idx + 1;
      if (target < 0 || target >= tabs.length) return tabs;
      const next = [...tabs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  closeOtherTabs(tabId: string): void {
    this.store.setState((s) => {
      const keep = s.tabs.filter((t) => t.id === tabId || t.kind === 'settings');
      if (keep.length === 0) return {};
      return { tabs: keep, selectedTabId: tabId };
    });
  }

  closeTabsToRight(tabId: string): void {
    this.store.getState().setTabs((tabs) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx < 0) return tabs;
      return tabs.slice(0, idx + 1);
    });
  }

  // ── Pane actions ───────────────────────────────────────────────────

  focusPane(paneId: string): void {
    const layout = this.selectedPaneLayout;
    if (!layout) return;
    this.store.getState().setPaneLayoutsByTabId((layouts) => ({
      ...layouts,
      [this.selectedTab.id]: { ...layout, activePaneId: paneId },
    }));
  }

  closePane(paneId: string): void {
    const layout = this.selectedPaneLayout;
    if (!layout) return;
    const next = Utils.removePaneFromLayout(layout, paneId);
    if (!next) {
      this.closeTab(this.selectedTab.id);
      return;
    }
    this.store.getState().setPaneLayoutsByTabId((layouts) => ({
      ...layouts,
      [this.selectedTab.id]: next,
    }));
  }

  splitTerminal(direction: WorkspacePaneDirection): void {
    const layout = this.selectedPaneLayout;
    if (!layout || !this.activePaneId) return;
    const nextPaneId = Utils.buildPaneId(
      this.selectedTab.id,
      Utils.collectPaneIdsFromLayout(layout)
    );
    const nextLayout = Utils.splitPaneLayout(layout, this.activePaneId, direction, nextPaneId);

    this.store.getState().setPaneLayoutsByTabId((layouts) => ({
      ...layouts,
      [this.selectedTab.id]: nextLayout,
    }));
    this.store.getState().setPaneSessionBindingsByPaneId((bindings) => ({
      ...bindings,
      [nextPaneId]: (this.activePaneId ? this.store.getState().paneSessionBindingsByPaneId[this.activePaneId] : null) ?? nextPaneId,
    }));
    this.store.getState().setTerminalSessions((sessions) => ({
      ...sessions,
      [nextPaneId]: Utils.createEmptyTerminalSession(this.defaultWorkingDirectory),
    }));
  }

  // ── Sidebar / Agents ───────────────────────────────────────────────

  toggleSidebar(): void {
    this.store.getState().setIsSidebarOpen((v) => !v);
  }

  toggleAgents(): void {
    this.store.getState().setIsAgentsActive((v) => !v);
  }

  // ── Settings ───────────────────────────────────────────────────────

  openSettingsSection(sectionId?: string): void {
    const { tabs } = this.store.getState();
    const hasSettingsTab = tabs.some((t) => t.id === 'settings');
    if (!hasSettingsTab) {
      this.store.getState().setTabs((t) => [
        ...t,
        { id: 'settings', label: 'Settings', kind: 'settings' },
      ]);
    }
    this.store.getState().setSelectedTabId('settings');
    if (sectionId) {
      this.store.getState().setActiveSectionId(sectionId);
    }
  }

  selectSection(sectionId: string): void {
    this.store.getState().setActiveSectionId(sectionId);
  }

  toggleGroup(groupId: string): void {
    this.store.getState().setExpandedGroupIds((ids) =>
      ids.includes(groupId) ? ids.filter((id) => id !== groupId) : [...ids, groupId]
    );
  }

  // ── Launcher props (for pane rendering) ───────────────────────────

  getLauncherIdentityKey(paneId: string): string {
    return `pane-${paneId}`;
  }

  buildLauncherProps(tabId: string, paneId: string) {
    const state = this.store.getState();
    const bindingId = state.paneSessionBindingsByPaneId[paneId];
    const session = bindingId ? state.terminalSessions[bindingId] : null;
    const startupCommands = state.paneStartupCommandsByPaneId[paneId] ?? [];
    const defaultWd = this.defaultWorkingDirectory;

    return {
      variant: 'workspace' as const,
      chatMode: 'always-open' as const,
      resetOnMount: true,
      initialComposerSurface: (session?.composerSurface ?? 'terminal') as 'agent' | 'terminal',
      conversationId: session?.activeConversationId ?? undefined,
      initialWorkingDirectory: session?.workingDirectory ?? defaultWd,
      initialTerminalSessionId: session?.terminalSessionId ?? null,
      initialAgentTerminalSessionId: session?.agentTerminalSessionId ?? null,
      terminalTarget: session?.terminalTarget ?? null,
      agentTerminalTarget: session?.agentTerminalTarget ?? null,
      pendingApproval: session?.pendingApproval ?? undefined,
      persistWorkingDirectory: true,
      persistTerminalSession: true,
      sharedTerminalBlockMetaById: session?.terminalBlockMetaById ?? {},
      sharedTerminalBlocks: session?.terminalBlocks ?? [],
      sharedSyntheticBlocks: session?.syntheticBlocks ?? [],
      sharedAgentTerminalBlockMetaById: session?.agentTerminalBlockMetaById ?? {},
      sharedAgentTerminalBlocks: session?.agentTerminalBlocks ?? [],
      startupCommands,
      onComposerSurfaceChange: (composerSurface: 'agent' | 'terminal') => {
        this.updateLauncherSession(paneId, (s) => s.composerSurface === composerSurface ? s : { ...s, composerSurface });
      },
      onConversationChange: (conversationId: string | null) => {
        this.updateLauncherSession(paneId, (s) =>
          s.activeConversationId === conversationId
            ? s
            : { ...s, activeConversationId: conversationId, composerSurface: conversationId ? 'agent' : 'terminal' }
        );
      },
      onWorkingDirectoryChange: (path: string | null) => {
        this.updateLauncherSession(paneId, (s) => s.workingDirectory === path ? s : { ...s, workingDirectory: path });
      },
      onTerminalSessionChange: (sessionId: string | null) => {
        this.updateLauncherSession(paneId, (s) => s.terminalSessionId === sessionId ? s : { ...s, terminalSessionId: sessionId });
      },
      onAgentTerminalSessionChange: (sessionId: string | null) => {
        this.updateLauncherSession(paneId, (s) => s.agentTerminalSessionId === sessionId ? s : { ...s, agentTerminalSessionId: sessionId });
      },
      onPendingApprovalChange: (approval: unknown) => {
        this.updateLauncherSession(paneId, (s) => s.pendingApproval === approval ? s : { ...s, pendingApproval: approval as TerminalSessionState['pendingApproval'] });
      },
      onTerminalBlockMetaChange: (meta: Record<string, unknown>) => {
        this.updateLauncherSession(paneId, (s) => s.terminalBlockMetaById === meta ? s : { ...s, terminalBlockMetaById: meta as TerminalSessionState['terminalBlockMetaById'] });
      },
      onTerminalBlocksChange: (blocks: unknown[]) => {
        this.updateLauncherSession(paneId, (s) => s.terminalBlocks === blocks ? s : { ...s, terminalBlocks: blocks as TerminalSessionState['terminalBlocks'] });
      },
      onSyntheticBlocksChange: (blocks: unknown[]) => {
        this.updateLauncherSession(paneId, (s) => s.syntheticBlocks === blocks ? s : { ...s, syntheticBlocks: blocks as TerminalSessionState['syntheticBlocks'] });
      },
      onAgentTerminalBlockMetaChange: (meta: Record<string, unknown>) => {
        this.updateLauncherSession(paneId, (s) => s.agentTerminalBlockMetaById === meta ? s : { ...s, agentTerminalBlockMetaById: meta as TerminalSessionState['agentTerminalBlockMetaById'] });
      },
      onAgentTerminalBlocksChange: (blocks: unknown[]) => {
        this.updateLauncherSession(paneId, (s) => s.agentTerminalBlocks === blocks ? s : { ...s, agentTerminalBlocks: blocks as TerminalSessionState['agentTerminalBlocks'] });
      },
      onStartupCommandsConsumed: () => {
        this.store.getState().setPaneStartupCommandsByPaneId((current) => {
          if (!(paneId in current)) return current;
          const next = { ...current };
          delete next[paneId];
          return next;
        });
      },
    };
  }

  private updateLauncherSession(paneId: string, updater: (session: TerminalSessionState) => TerminalSessionState): void {
    const state = this.store.getState();
    const bindingId = state.paneSessionBindingsByPaneId[paneId] ?? paneId;
    const current = state.terminalSessions[bindingId] ?? Utils.createEmptyTerminalSession(this.defaultWorkingDirectory);
    const next = updater(current);
    if (next === current) return;
    this.store.getState().setTerminalSessions((sessions) => ({ ...sessions, [bindingId]: next }));
  }

  // ── Memory integration ─────────────────────────────────────────────

  saveCurrentWorkspace(): void {
    const state = this.store.getState();
    const memory = useMemoryStore.getState();
    if (!memory.saveWorkspace) return;

    const snapshot = {
      id: 'workspace-main',
      schemaVersion: 1,
      tabs: state.tabs,
      selectedTabId: state.selectedTabId,
      launcherTabId: state.launcherTabId,
      paneLayoutsByTabId: state.paneLayoutsByTabId,
      conversations: [],
      terminalSessions: state.terminalSessions,
      activeSectionId: state.activeSectionId,
      expandedGroupIds: state.expandedGroupIds,
      isSidebarOpen: state.isSidebarOpen,
      isAgentsActive: state.isAgentsActive,
      nextTerminalIndex: state.nextTerminalIndex,
      nextConversationIndex: 1,
      updatedAt: new Date().toISOString(),
    };
    void memory.saveWorkspace(snapshot);
  }
}
