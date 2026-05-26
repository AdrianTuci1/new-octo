import { createStore } from 'zustand/vanilla';

type ChatFindState = {
  isFindOpen: boolean;
  searchQuery: string;
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
  matchCount: number;
  activeIndex: number;
  openFind: () => void;
  closeFind: () => void;
  setSearchQuery: (query: string) => void;
  setCaseSensitive: (value: boolean) => void;
  setUseRegex: (value: boolean) => void;
  setWholeWord: (value: boolean) => void;
  setMatchCount: (count: number) => void;
  setActiveIndex: (index: number | ((previous: number) => number)) => void;
};

export function createChatFindStore() {
  return createStore<ChatFindState>((set) => ({
    isFindOpen: false,
    searchQuery: '',
    caseSensitive: false,
    useRegex: false,
    wholeWord: false,
    matchCount: 0,
    activeIndex: -1,
    openFind: () => set((state) => ({
      ...state,
      isFindOpen: true
    })),
    closeFind: () => set((state) => ({
      ...state,
      isFindOpen: false,
      searchQuery: '',
      matchCount: 0,
      activeIndex: -1
    })),
    setSearchQuery: (searchQuery) => set((state) => ({
      ...state,
      searchQuery,
      activeIndex: searchQuery ? state.activeIndex : -1
    })),
    setCaseSensitive: (caseSensitive) => set((state) => ({
      ...state,
      caseSensitive
    })),
    setUseRegex: (useRegex) => set((state) => ({
      ...state,
      useRegex
    })),
    setWholeWord: (wholeWord) => set((state) => ({
      ...state,
      wholeWord
    })),
    setMatchCount: (matchCount) => set((state) => ({
      ...state,
      matchCount
    })),
    setActiveIndex: (index) => set((state) => ({
      ...state,
      activeIndex: typeof index === 'function' ? index(state.activeIndex) : index
    }))
  }));
}
