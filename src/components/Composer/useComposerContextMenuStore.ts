import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SkillCatalogItem } from '../../types/skills';
import type { ComposerContextMenuItem, ComposerContextMenuPanel } from './ComposerContextMenu';

type LoadingTarget = 'files' | 'code' | 'skills';

type ComposerContextMenuState = {
  isOpen: boolean;
  panel: ComposerContextMenuPanel;
  activeIndex: number;
  triggerKey: string | null;
  suppressedTriggerKey: string | null;
  filesLoading: boolean;
  codeLoading: boolean;
  skillsLoading: boolean;
  fileItems: ComposerContextMenuItem[];
  codeItems: ComposerContextMenuItem[];
  skillCatalog: SkillCatalogItem[];
  dismissedRecommendationKey: string | null;
  syncTrigger: (triggerKey: string | null) => void;
  close: (suppressedTriggerKey?: string | null) => void;
  setPanel: (panel: ComposerContextMenuPanel) => void;
  setActiveIndex: (index: number | ((current: number) => number)) => void;
  beginLoading: (...targets: LoadingTarget[]) => void;
  endLoading: (...targets: LoadingTarget[]) => void;
  setFileItems: (items: ComposerContextMenuItem[]) => void;
  setCodeItems: (items: ComposerContextMenuItem[]) => void;
  clearFileData: () => void;
  setSkillCatalog: (items: SkillCatalogItem[]) => void;
  dismissRecommendation: (key: string | null) => void;
};

export function createComposerContextMenuStore() {
  return createStore<ComposerContextMenuState>((set) => ({
    isOpen: false,
    panel: 'root',
    activeIndex: 0,
    triggerKey: null,
    suppressedTriggerKey: null,
    filesLoading: false,
    codeLoading: false,
    skillsLoading: false,
    fileItems: [],
    codeItems: [],
    skillCatalog: [],
    dismissedRecommendationKey: null,
    syncTrigger: (triggerKey) => set((state) => {
      if (!triggerKey) {
        return {
          ...state,
          isOpen: false,
          panel: 'root',
          activeIndex: 0,
          triggerKey: null,
          suppressedTriggerKey: null,
          filesLoading: false,
          codeLoading: false
        };
      }

      if (state.suppressedTriggerKey === triggerKey) {
        return state;
      }

      if (state.isOpen && state.triggerKey === triggerKey) {
        return {
          ...state,
          suppressedTriggerKey: null
        };
      }

      return {
        ...state,
        isOpen: true,
        panel: 'root',
        activeIndex: 0,
        triggerKey,
        suppressedTriggerKey: null
      };
    }),
    close: (suppressedTriggerKey = null) => set((state) => ({
      ...state,
      isOpen: false,
      panel: 'root',
      activeIndex: 0,
      triggerKey: null,
      suppressedTriggerKey
    })),
    setPanel: (panel) => set((state) => ({
      ...state,
      panel,
      activeIndex: 0
    })),
    setActiveIndex: (index) => set((state) => ({
      ...state,
      activeIndex: typeof index === 'function' ? index(state.activeIndex) : index
    })),
    beginLoading: (...targets) => set((state) => ({
      ...state,
      filesLoading: targets.includes('files') ? true : state.filesLoading,
      codeLoading: targets.includes('code') ? true : state.codeLoading,
      skillsLoading: targets.includes('skills') ? true : state.skillsLoading
    })),
    endLoading: (...targets) => set((state) => ({
      ...state,
      filesLoading: targets.includes('files') ? false : state.filesLoading,
      codeLoading: targets.includes('code') ? false : state.codeLoading,
      skillsLoading: targets.includes('skills') ? false : state.skillsLoading
    })),
    setFileItems: (items) => set((state) => ({
      ...state,
      fileItems: items
    })),
    setCodeItems: (items) => set((state) => ({
      ...state,
      codeItems: items
    })),
    clearFileData: () => set((state) => ({
      ...state,
      fileItems: [],
      codeItems: [],
      filesLoading: false,
      codeLoading: false
    })),
    setSkillCatalog: (items) => set((state) => ({
      ...state,
      skillCatalog: items
    })),
    dismissRecommendation: (key) => set((state) => ({
      ...state,
      dismissedRecommendationKey: key
    }))
  }));
}

export type ComposerContextMenuStoreApi = StoreApi<ComposerContextMenuState>;
