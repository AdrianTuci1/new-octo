import { create } from 'zustand';
import type { ComposerMode } from '../types/ui';
import type { HistoryEntry, HistoryTab } from '../types/history';
import type { CommandApproval } from '../types/terminal';

interface LauncherState {
  composerSurface: 'agent' | 'terminal';
  modeLock: ComposerMode | null;
  autodetectedShellLatch: boolean;
  allowSingleCharacterCommandPrediction: boolean;
  terminalAutoDetectEnabled: boolean;
  historyTab: HistoryTab;
  selectedHistoryIndex: number;
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
  setModelTab: (tab: 'all' | 'saved' | ((prev: 'all' | 'saved') => 'all' | 'saved')) => void;
  setSelectedModelIndex: (index: number | ((prev: number) => number)) => void;
  setLocalConversationId: (id: string | null) => void;
  setConversationSearchQuery: (query: string) => void;
  setSavedPromptEntries: (entries: HistoryEntry[]) => void;
  setLocalPendingApproval: (approval: CommandApproval | null) => void;

  reset: (initialComposerSurface: 'agent' | 'terminal') => void;
}

export const useLauncherStore = create<LauncherState>((set) => ({
  composerSurface: 'terminal',
  modeLock: null,
  autodetectedShellLatch: false,
  allowSingleCharacterCommandPrediction: false,
  terminalAutoDetectEnabled: true,
  historyTab: 'all',
  selectedHistoryIndex: 0,
  modelTab: 'all',
  selectedModelIndex: 0,
  localConversationId: null,
  conversationSearchQuery: '',
  savedPromptEntries: [],
  localPendingApproval: null,

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

  reset: (initialComposerSurface) => set({
    composerSurface: initialComposerSurface,
    localPendingApproval: null,
    modeLock: null,
    autodetectedShellLatch: false,
    allowSingleCharacterCommandPrediction: false,
    terminalAutoDetectEnabled: true,
    historyTab: 'all',
    selectedHistoryIndex: 0,
    modelTab: 'all',
    selectedModelIndex: 0,
  })
}));
