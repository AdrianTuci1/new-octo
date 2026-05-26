import { createStore, type StoreApi } from 'zustand/vanilla';
import type { FilesystemPathContext } from '../../../../types/filesystem';
import { initialWorkspaceChromeTabs, defaultWorkspaceChromeTabId } from '../../chrome';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from '../../settings/settingsData';
import * as Utils from '../../utils';
import type { TerminalSessionState } from '../../utils';
import { resolveUpdater, type Updater } from './types';

type AppWindowState = {
  tabs: typeof initialWorkspaceChromeTabs;
  selectedTabId: string;
  launcherTabId: string | null;
  paneLayoutsByTabId: Record<string, ReturnType<typeof Utils.createDefaultPaneLayout>>;
  paneSessionBindingsByPaneId: Utils.WorkspacePaneSessionBindings;
  activeSectionId: string;
  expandedGroupIds: string[];
  isSidebarOpen: boolean;
  nextTerminalIndex: number;
  terminalSessions: Record<string, TerminalSessionState>;
  paneStartupCommandsByPaneId: Record<string, string[]>;
  pathContext: FilesystemPathContext | null;
  isAgentsActive: boolean;
  isSpotlightVisible: boolean;
  openPastConversationBaselineById: Record<string, number>;
  setTabs: (next: Updater<typeof initialWorkspaceChromeTabs>) => void;
  setSelectedTabId: (next: Updater<string>) => void;
  setLauncherTabId: (next: Updater<string | null>) => void;
  setPaneLayoutsByTabId: (next: Updater<Record<string, ReturnType<typeof Utils.createDefaultPaneLayout>>>) => void;
  setPaneSessionBindingsByPaneId: (next: Updater<Utils.WorkspacePaneSessionBindings>) => void;
  setActiveSectionId: (next: Updater<string>) => void;
  setExpandedGroupIds: (next: Updater<string[]>) => void;
  setIsSidebarOpen: (next: Updater<boolean>) => void;
  setNextTerminalIndex: (next: Updater<number>) => void;
  setTerminalSessions: (next: Updater<Record<string, TerminalSessionState>>) => void;
  setPaneStartupCommandsByPaneId: (next: Updater<Record<string, string[]>>) => void;
  setPathContext: (next: Updater<FilesystemPathContext | null>) => void;
  setIsAgentsActive: (next: Updater<boolean>) => void;
  setIsSpotlightVisible: (next: Updater<boolean>) => void;
  setOpenPastConversationBaselineById: (next: Updater<Record<string, number>>) => void;
};

export type AppWindowStoreApi = StoreApi<AppWindowState>;

function buildInitialState(): Omit<
  AppWindowState,
  | 'setTabs'
  | 'setSelectedTabId'
  | 'setLauncherTabId'
  | 'setPaneLayoutsByTabId'
  | 'setPaneSessionBindingsByPaneId'
  | 'setActiveSectionId'
  | 'setExpandedGroupIds'
  | 'setIsSidebarOpen'
  | 'setNextTerminalIndex'
  | 'setTerminalSessions'
  | 'setPaneStartupCommandsByPaneId'
  | 'setPathContext'
  | 'setIsAgentsActive'
  | 'setIsSpotlightVisible'
  | 'setOpenPastConversationBaselineById'
> {
  return {
    tabs: initialWorkspaceChromeTabs,
    selectedTabId: defaultWorkspaceChromeTabId,
    launcherTabId: 'terminal-main',
    paneLayoutsByTabId: {
      'terminal-main': Utils.createDefaultPaneLayout('terminal-main')
    },
    paneSessionBindingsByPaneId: {
      'terminal-main': 'terminal-main'
    },
    activeSectionId: settingsDefaultSectionId,
    expandedGroupIds: settingsDefaultExpandedGroupIds,
    isSidebarOpen: false,
    nextTerminalIndex: 1,
    terminalSessions: Utils.buildTerminalSessionState(initialWorkspaceChromeTabs),
    paneStartupCommandsByPaneId: {},
    pathContext: null,
    isAgentsActive: false,
    isSpotlightVisible: false,
    openPastConversationBaselineById: {}
  };
}

export function createAppWindowStore(): AppWindowStoreApi {
  return createStore<AppWindowState>((set) => ({
    ...buildInitialState(),
    setTabs: (next) => set((state) => ({ tabs: resolveUpdater(state.tabs, next) })),
    setSelectedTabId: (next) => set((state) => ({ selectedTabId: resolveUpdater(state.selectedTabId, next) })),
    setLauncherTabId: (next) => set((state) => ({ launcherTabId: resolveUpdater(state.launcherTabId, next) })),
    setPaneLayoutsByTabId: (next) => set((state) => ({ paneLayoutsByTabId: resolveUpdater(state.paneLayoutsByTabId, next) })),
    setPaneSessionBindingsByPaneId: (next) => set((state) => ({ paneSessionBindingsByPaneId: resolveUpdater(state.paneSessionBindingsByPaneId, next) })),
    setActiveSectionId: (next) => set((state) => ({ activeSectionId: resolveUpdater(state.activeSectionId, next) })),
    setExpandedGroupIds: (next) => set((state) => ({ expandedGroupIds: resolveUpdater(state.expandedGroupIds, next) })),
    setIsSidebarOpen: (next) => set((state) => ({ isSidebarOpen: resolveUpdater(state.isSidebarOpen, next) })),
    setNextTerminalIndex: (next) => set((state) => ({ nextTerminalIndex: resolveUpdater(state.nextTerminalIndex, next) })),
    setTerminalSessions: (next) => set((state) => ({ terminalSessions: resolveUpdater(state.terminalSessions, next) })),
    setPaneStartupCommandsByPaneId: (next) => set((state) => ({ paneStartupCommandsByPaneId: resolveUpdater(state.paneStartupCommandsByPaneId, next) })),
    setPathContext: (next) => set((state) => ({ pathContext: resolveUpdater(state.pathContext, next) })),
    setIsAgentsActive: (next) => set((state) => ({ isAgentsActive: resolveUpdater(state.isAgentsActive, next) })),
    setIsSpotlightVisible: (next) => set((state) => ({ isSpotlightVisible: resolveUpdater(state.isSpotlightVisible, next) })),
    setOpenPastConversationBaselineById: (next) => set((state) => ({ openPastConversationBaselineById: resolveUpdater(state.openPastConversationBaselineById, next) }))
  }));
}
