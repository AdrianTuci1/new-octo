import { create } from 'zustand';

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  isDirty: boolean;
  content?: string;
  language?: string;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  
  // Actions
  openFile: (path: string, name: string, content?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  setDirty: (id: string, isDirty: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  activeTabId: null,

  openFile: (path, name, content) => set((state) => {
    const existingTab = state.tabs.find((tab) => tab.path === path);
    if (existingTab) {
      return { activeTabId: existingTab.id };
    }

    const newTab: EditorTab = {
      id: Math.random().toString(36).substring(7),
      path,
      name,
      isDirty: false,
      content,
      language: getLanguageFromPath(path)
    };

    return {
      tabs: [...state.tabs, newTab],
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

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx': return 'typescript';
    case 'js':
    case 'jsx': return 'javascript';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'css': return 'css';
    case 'html': return 'html';
    case 'rs': return 'rust';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'sh': return 'shell';
    case 'yml':
    case 'yaml': return 'yaml';
    default: return 'plaintext';
  }
}
