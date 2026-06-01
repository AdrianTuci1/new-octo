import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { FilesystemPathContext } from '../types/filesystem';
import {
  initialWorkspaceChromeTabs,
  defaultWorkspaceChromeTabId,
  type WorkspaceChromeTab,
} from '../components/App/chrome';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from '../components/App/settings/settingsData';
import * as Utils from '../components/App/utils';
import type { TerminalSessionState } from '../components/App/utils';

type Updater<T> = T | ((current: T) => T);

function resolveUpdater<T>(current: T, next: Updater<T>): T {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
}

export type ShellState = {
  tabs: WorkspaceChromeTab[];
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

  setTabs: (next: Updater<WorkspaceChromeTab[]>) => void;
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

export type ShellStoreApi = StoreApi<ShellState>;

type ShellDataState = Omit<ShellState, 'setTabs' | 'setSelectedTabId' | 'setLauncherTabId' | 'setPaneLayoutsByTabId' | 'setPaneSessionBindingsByPaneId' | 'setActiveSectionId' | 'setExpandedGroupIds' | 'setIsSidebarOpen' | 'setNextTerminalIndex' | 'setTerminalSessions' | 'setPaneStartupCommandsByPaneId' | 'setPathContext' | 'setIsAgentsActive' | 'setIsSpotlightVisible' | 'setOpenPastConversationBaselineById'>;

function buildInitialState(): ShellDataState {
  return {
    tabs: initialWorkspaceChromeTabs,
    selectedTabId: defaultWorkspaceChromeTabId,
    launcherTabId: 'terminal-main',
    paneLayoutsByTabId: { 'terminal-main': Utils.createDefaultPaneLayout('terminal-main') },
    paneSessionBindingsByPaneId: { 'terminal-main': 'terminal-main' },
    activeSectionId: settingsDefaultSectionId,
    expandedGroupIds: settingsDefaultExpandedGroupIds,
    isSidebarOpen: false,
    nextTerminalIndex: 1,
    terminalSessions: Utils.buildTerminalSessionState(initialWorkspaceChromeTabs),
    paneStartupCommandsByPaneId: {},
    pathContext: null,
    isAgentsActive: false,
    isSpotlightVisible: false,
    openPastConversationBaselineById: {},
  };
}

export function createShellStore(): ShellStoreApi {
  return createStore<ShellState>((set) => ({
    ...buildInitialState(),
    setTabs: (next) => set((s) => ({ tabs: resolveUpdater(s.tabs, next) })),
    setSelectedTabId: (next) => set((s) => ({ selectedTabId: resolveUpdater(s.selectedTabId, next) })),
    setLauncherTabId: (next) => set((s) => ({ launcherTabId: resolveUpdater(s.launcherTabId, next) })),
    setPaneLayoutsByTabId: (next) => set((s) => ({ paneLayoutsByTabId: resolveUpdater(s.paneLayoutsByTabId, next) })),
    setPaneSessionBindingsByPaneId: (next) => set((s) => ({ paneSessionBindingsByPaneId: resolveUpdater(s.paneSessionBindingsByPaneId, next) })),
    setActiveSectionId: (next) => set((s) => ({ activeSectionId: resolveUpdater(s.activeSectionId, next) })),
    setExpandedGroupIds: (next) => set((s) => ({ expandedGroupIds: resolveUpdater(s.expandedGroupIds, next) })),
    setIsSidebarOpen: (next) => set((s) => ({ isSidebarOpen: resolveUpdater(s.isSidebarOpen, next) })),
    setNextTerminalIndex: (next) => set((s) => ({ nextTerminalIndex: resolveUpdater(s.nextTerminalIndex, next) })),
    setTerminalSessions: (next) => set((s) => ({ terminalSessions: resolveUpdater(s.terminalSessions, next) })),
    setPaneStartupCommandsByPaneId: (next) => set((s) => ({ paneStartupCommandsByPaneId: resolveUpdater(s.paneStartupCommandsByPaneId, next) })),
    setPathContext: (next) => set((s) => ({ pathContext: resolveUpdater(s.pathContext, next) })),
    setIsAgentsActive: (next) => set((s) => ({ isAgentsActive: resolveUpdater(s.isAgentsActive, next) })),
    setIsSpotlightVisible: (next) => set((s) => ({ isSpotlightVisible: resolveUpdater(s.isSpotlightVisible, next) })),
    setOpenPastConversationBaselineById: (next) => set((s) => ({ openPastConversationBaselineById: resolveUpdater(s.openPastConversationBaselineById, next) })),
  }));
}

// Singleton instance
let shellStoreInstance: ShellStoreApi | null = null;

export function getShellStore(): ShellStoreApi {
  if (!shellStoreInstance) {
    shellStoreInstance = createShellStore();
  }
  return shellStoreInstance;
}

// React hook for component subscriptions
export function useShellStore(): ShellState;
export function useShellStore<T>(selector: (state: ShellState) => T): T;
export function useShellStore<T>(selector?: (state: ShellState) => T): ShellState | T {
  const store = getShellStore();
  if (selector) return useStore(store, selector);
  return useStore(store, (s) => s);
}
