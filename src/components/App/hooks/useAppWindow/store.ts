import { createStore, type StoreApi, type StateCreator } from 'zustand/vanilla';
import type { FilesystemPathContext } from '../../../../types/filesystem';
import { initialWorkspaceChromeTabs, defaultWorkspaceChromeTabId } from '../../chrome';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from '../../settings/settingsData';
import * as Utils from '../../utils';
import type { TerminalSessionState } from '../../utils';
import { resolveUpdater, type Updater } from './types';

// ─── Slice type definitions ───────────────────────────────────────

type TabSlice = {
  tabs: typeof initialWorkspaceChromeTabs;
  selectedTabId: string;
  launcherTabId: string | null;
  setTabs: (next: Updater<typeof initialWorkspaceChromeTabs>) => void;
  setSelectedTabId: (next: Updater<string>) => void;
  setLauncherTabId: (next: Updater<string | null>) => void;
};

type PaneSlice = {
  paneLayoutsByTabId: Record<string, ReturnType<typeof Utils.createDefaultPaneLayout>>;
  paneSessionBindingsByPaneId: Utils.WorkspacePaneSessionBindings;
  setPaneLayoutsByTabId: (next: Updater<Record<string, ReturnType<typeof Utils.createDefaultPaneLayout>>>) => void;
  setPaneSessionBindingsByPaneId: (next: Updater<Utils.WorkspacePaneSessionBindings>) => void;
};

type SessionSlice = {
  terminalSessions: Record<string, TerminalSessionState>;
  paneStartupCommandsByPaneId: Record<string, string[]>;
  pathContext: FilesystemPathContext | null;
  setTerminalSessions: (next: Updater<Record<string, TerminalSessionState>>) => void;
  setPaneStartupCommandsByPaneId: (next: Updater<Record<string, string[]>>) => void;
  setPathContext: (next: Updater<FilesystemPathContext | null>) => void;
};

type UISlice = {
  isSidebarOpen: boolean;
  isAgentsActive: boolean;
  isSpotlightVisible: boolean;
  openPastConversationBaselineById: Record<string, number>;
  setIsSidebarOpen: (next: Updater<boolean>) => void;
  setIsAgentsActive: (next: Updater<boolean>) => void;
  setIsSpotlightVisible: (next: Updater<boolean>) => void;
  setOpenPastConversationBaselineById: (next: Updater<Record<string, number>>) => void;
  activeSectionId: string;
  expandedGroupIds: string[];
  setActiveSectionId: (next: Updater<string>) => void;
  setExpandedGroupIds: (next: Updater<string[]>) => void;
  nextTerminalIndex: number;
  setNextTerminalIndex: (next: Updater<number>) => void;
};

// ─── Combined state (unchanged contract) ──────────────────────────

type AppWindowState = TabSlice & PaneSlice & SessionSlice & UISlice;

export type AppWindowStoreApi = StoreApi<AppWindowState>;

// ─── Slice creators ───────────────────────────────────────────────

const createTabSlice: StateCreator<AppWindowState, [], [], TabSlice> = (set) => ({
  tabs: initialWorkspaceChromeTabs,
  selectedTabId: defaultWorkspaceChromeTabId,
  launcherTabId: 'terminal-main',
  setTabs: (next) => set((state) => ({ tabs: resolveUpdater(state.tabs, next) })),
  setSelectedTabId: (next) => set((state) => ({ selectedTabId: resolveUpdater(state.selectedTabId, next) })),
  setLauncherTabId: (next) => set((state) => ({ launcherTabId: resolveUpdater(state.launcherTabId, next) }))
});

const createPaneSlice: StateCreator<AppWindowState, [], [], PaneSlice> = (set) => ({
  paneLayoutsByTabId: {
    'terminal-main': Utils.createDefaultPaneLayout('terminal-main')
  },
  paneSessionBindingsByPaneId: {
    'terminal-main': 'terminal-main'
  },
  setPaneLayoutsByTabId: (next) => set((state) => ({
    paneLayoutsByTabId: resolveUpdater(state.paneLayoutsByTabId, next)
  })),
  setPaneSessionBindingsByPaneId: (next) => set((state) => ({
    paneSessionBindingsByPaneId: resolveUpdater(state.paneSessionBindingsByPaneId, next)
  }))
});

const createSessionSlice: StateCreator<AppWindowState, [], [], SessionSlice> = (set) => ({
  terminalSessions: Utils.buildTerminalSessionState(initialWorkspaceChromeTabs),
  paneStartupCommandsByPaneId: {},
  pathContext: null,
  setTerminalSessions: (next) => set((state) => ({
    terminalSessions: resolveUpdater(state.terminalSessions, next)
  })),
  setPaneStartupCommandsByPaneId: (next) => set((state) => ({
    paneStartupCommandsByPaneId: resolveUpdater(state.paneStartupCommandsByPaneId, next)
  })),
  setPathContext: (next) => set((state) => ({
    pathContext: resolveUpdater(state.pathContext, next)
  }))
});

const createUISlice: StateCreator<AppWindowState, [], [], UISlice> = (set) => ({
  isSidebarOpen: false,
  isAgentsActive: false,
  isSpotlightVisible: false,
  openPastConversationBaselineById: {},
  setIsSidebarOpen: (next) => set((state) => ({ isSidebarOpen: resolveUpdater(state.isSidebarOpen, next) })),
  setIsAgentsActive: (next) => set((state) => ({ isAgentsActive: resolveUpdater(state.isAgentsActive, next) })),
  setIsSpotlightVisible: (next) => set((state) => ({ isSpotlightVisible: resolveUpdater(state.isSpotlightVisible, next) })),
  setOpenPastConversationBaselineById: (next) => set((state) => ({
    openPastConversationBaselineById: resolveUpdater(state.openPastConversationBaselineById, next)
  })),
  activeSectionId: settingsDefaultSectionId,
  expandedGroupIds: settingsDefaultExpandedGroupIds,
  setActiveSectionId: (next) => set((state) => ({ activeSectionId: resolveUpdater(state.activeSectionId, next) })),
  setExpandedGroupIds: (next) => set((state) => ({ expandedGroupIds: resolveUpdater(state.expandedGroupIds, next) })),
  nextTerminalIndex: 1,
  setNextTerminalIndex: (next) => set((state) => ({ nextTerminalIndex: resolveUpdater(state.nextTerminalIndex, next) }))
});

// ─── Store factory ─────────────────────────────────────────────────

export function createAppWindowStore(): AppWindowStoreApi {
  return createStore<AppWindowState>()((...args) => ({
    ...createTabSlice(...args),
    ...createPaneSlice(...args),
    ...createSessionSlice(...args),
    ...createUISlice(...args)
  }));
}
