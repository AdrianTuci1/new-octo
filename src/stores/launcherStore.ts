import { createContext, createElement, useContext, type ReactNode } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ComposerMode } from '../types/ui';
import type { HistoryEntry, HistoryTab } from '../types/history';
import type { CommandApproval } from '../types/terminal';

export interface LauncherState {
  composerSurface: 'agent' | 'terminal';
  modeLock: ComposerMode | null;
  autodetectedShellLatch: boolean;
  allowSingleCharacterCommandPrediction: boolean;
  terminalAutoDetectEnabled: boolean;
  historyTab: HistoryTab;
  selectedHistoryIndex: number;
  selectedCommandIndex: number;
  modelTab: 'all' | 'saved';
  selectedModelIndex: number;
  localConversationId: string | null;
  conversationSearchQuery: string;
  savedPromptEntries: HistoryEntry[];
  localPendingApproval: CommandApproval | null;

  // Actions
  setComposerSurface: (surface: 'agent' | 'terminal') => void;
  setModeLock: (mode: ComposerMode | null) => void;
  setAutodetectedShellLatch: (latch: boolean) => void;
  setAllowSingleCharacterCommandPrediction: (allow: boolean) => void;
  setTerminalAutoDetectEnabled: (enabled: boolean) => void;
  setHistoryTab: (tab: HistoryTab | ((prev: HistoryTab) => HistoryTab)) => void;
  setSelectedHistoryIndex: (index: number | ((prev: number) => number)) => void;
  setSelectedCommandIndex: (index: number | ((prev: number) => number)) => void;
  setModelTab: (tab: 'all' | 'saved' | ((prev: 'all' | 'saved') => 'all' | 'saved')) => void;
  setSelectedModelIndex: (index: number | ((prev: number) => number)) => void;
  setLocalConversationId: (id: string | null) => void;
  setConversationSearchQuery: (query: string) => void;
  setSavedPromptEntries: (entries: HistoryEntry[]) => void;
  setLocalPendingApproval: (approval: CommandApproval | null) => void;

  reset: (initialComposerSurface: 'agent' | 'terminal') => void;
}

export type LauncherStoreApi = StoreApi<LauncherState>;

function buildInitialState(initialComposerSurface: 'agent' | 'terminal' = 'terminal') {
  return {
    composerSurface: initialComposerSurface,
    modeLock: null,
    autodetectedShellLatch: false,
    allowSingleCharacterCommandPrediction: false,
    terminalAutoDetectEnabled: true,
    historyTab: 'all' as const,
    selectedHistoryIndex: 0,
    selectedCommandIndex: 0,
    modelTab: 'all' as const,
    selectedModelIndex: 0,
    localConversationId: null,
    conversationSearchQuery: '',
    savedPromptEntries: [],
    localPendingApproval: null
  };
}

export function createLauncherStore(
  initialComposerSurface: 'agent' | 'terminal' = 'terminal'
): LauncherStoreApi {
  return createStore<LauncherState>((set) => ({
    ...buildInitialState(initialComposerSurface),

    setComposerSurface: (surface) => set({ composerSurface: surface }),
    setModeLock: (mode) => set({ modeLock: mode }),
    setAutodetectedShellLatch: (latch) => set({ autodetectedShellLatch: latch }),
    setAllowSingleCharacterCommandPrediction: (allow) => set({ allowSingleCharacterCommandPrediction: allow }),
    setTerminalAutoDetectEnabled: (enabled) => set({ terminalAutoDetectEnabled: enabled }),
    setHistoryTab: (tab) => set((state) => ({
      historyTab: typeof tab === 'function' ? tab(state.historyTab) : tab
    })),
    setSelectedHistoryIndex: (index) => set((state) => ({
      selectedHistoryIndex: typeof index === 'function' ? index(state.selectedHistoryIndex) : index
    })),
    setSelectedCommandIndex: (index) => set((state) => ({
      selectedCommandIndex: typeof index === 'function' ? index(state.selectedCommandIndex) : index
    })),
    setModelTab: (tab) => set((state) => ({
      modelTab: typeof tab === 'function' ? tab(state.modelTab) : tab
    })),
    setSelectedModelIndex: (index) => set((state) => ({
      selectedModelIndex: typeof index === 'function' ? index(state.selectedModelIndex) : index
    })),
    setLocalConversationId: (id) => set({ localConversationId: id }),
    setConversationSearchQuery: (query) => set({ conversationSearchQuery: query }),
    setSavedPromptEntries: (entries) => set({ savedPromptEntries: entries }),
    setLocalPendingApproval: (approval) => set({ localPendingApproval: approval }),

    reset: (nextComposerSurface) => set({
      ...buildInitialState(nextComposerSurface)
    })
  }));
}

const globalLauncherStore = createLauncherStore();
const LauncherStoreContext = createContext<LauncherStoreApi | null>(null);

export function LauncherStoreProvider(props: {
  children: ReactNode;
  store: LauncherStoreApi;
}) {
  return createElement(LauncherStoreContext.Provider, { value: props.store }, props.children);
}

export function useLauncherStore(): LauncherState;
export function useLauncherStore<T>(selector: (state: LauncherState) => T): T;
export function useLauncherStore<T>(selector?: (state: LauncherState) => T) {
  const scopedStore = useContext(LauncherStoreContext);
  const store = scopedStore ?? globalLauncherStore;
  return selector
    ? useStore(store, selector)
    : useStore(store, ((state: LauncherState) => state) as (state: LauncherState) => T);
}
