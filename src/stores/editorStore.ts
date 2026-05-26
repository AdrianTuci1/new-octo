import { create } from 'zustand';
import { getLanguageFromPath } from '../lib/fileLanguage';

export type EditorTabPresentation = 'file' | 'artifact-markdown';

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  isDirty: boolean;
  content?: string;
  language?: string;
  presentation: EditorTabPresentation;
  readOnly: boolean;
}

export interface OpenEditorFileOptions {
  presentation?: EditorTabPresentation;
  readOnly?: boolean;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  
  // Actions
  openFile: (path: string, name: string, content?: string, options?: OpenEditorFileOptions) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  setDirty: (id: string, isDirty: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  activeTabId: null,

  openFile: (path, name, content, options) => set((state) => {
    const presentation = options?.presentation ?? 'file';
    const readOnly = options?.readOnly ?? presentation === 'artifact-markdown';
    const isArtifactMarkdown = presentation === 'artifact-markdown';
    const nextTabsBase = isArtifactMarkdown
      ? []
      : state.tabs.filter((tab) => tab.presentation !== 'artifact-markdown');
    const existingTab = nextTabsBase.find((tab) => tab.path === path && tab.presentation === presentation);

    if (existingTab) {
      return { activeTabId: existingTab.id };
    }

    const newTab: EditorTab = {
      id: Math.random().toString(36).substring(7),
      path,
      name,
      isDirty: false,
      content,
      language: getLanguageFromPath(path),
      presentation,
      readOnly
    };

    return {
      tabs: [...nextTabsBase, newTab],
      activeTabId: newTab.id
    };
  }),

  closeTab: (id) => set((state) => {
    const newTabs = state.tabs.filter((tab) => tab.id !== id);
    let newActiveTabId = state.activeTabId;
    
    if (state.activeTabId === id) {
      newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }
    
    return {
      tabs: newTabs,
      activeTabId: newActiveTabId
    };
  }),

  closeAllTabs: () => set({
    tabs: [],
    activeTabId: null
  }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) => set((state) => ({
    tabs: state.tabs.map((tab) => 
      tab.id === id ? { ...tab, content, isDirty: true } : tab
    )
  })),

  setDirty: (id, isDirty) => set((state) => ({
    tabs: state.tabs.map((tab) => 
      tab.id === id ? { ...tab, isDirty } : tab
    )
  }))
}));
