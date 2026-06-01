import { create } from 'zustand';
import type { TrayMode, TrayContentMode } from '../types/ui';

interface UIState {
  trayMode: TrayMode;
  lastTrayMode: TrayContentMode;
  isExpanded: boolean;
  isModelDrawerOpen: boolean;
  isCloudProfileDrawerOpen: boolean;
  isProfileDrawerOpen: boolean;
  isRulesDrawerOpen: boolean;
  isCodeReviewDrawerOpen: boolean;
  activeProfileName: string;
  selectedModelIdForEdit: string | null;
  selectedCloudProfileIdForEdit: string | null;
  isChatHidden: boolean;
  
  // Actions
  setTrayMode: (mode: TrayMode) => void;
  toggleTray: (mode: TrayContentMode) => void;
  setExpanded: (expanded: boolean) => void;
  setIsModelDrawerOpen: (open: boolean) => void;
  setSelectedModelIdForEdit: (id: string | null) => void;
  openModelDrawer: () => void;
  closeModelDrawer: () => void;
  setIsCloudProfileDrawerOpen: (open: boolean) => void;
  setSelectedCloudProfileIdForEdit: (id: string | null) => void;
  openCloudProfileDrawer: () => void;
  closeCloudProfileDrawer: () => void;
  setIsProfileDrawerOpen: (open: boolean) => void;
  openProfileDrawer: () => void;
  closeProfileDrawer: () => void;
  setIsRulesDrawerOpen: (open: boolean) => void;
  openRulesDrawer: () => void;
  closeRulesDrawer: () => void;
  setIsCodeReviewDrawerOpen: (open: boolean) => void;
  openCodeReviewDrawer: () => void;
  closeCodeReviewDrawer: () => void;
  toggleCodeReviewDrawer: () => void;
  setActiveProfileName: (name: string) => void;
  setIsChatHidden: (hidden: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  trayMode: 'closed',
  lastTrayMode: 'help',
  isExpanded: false,
  isModelDrawerOpen: false,
  isCloudProfileDrawerOpen: false,
  isProfileDrawerOpen: false,
  isRulesDrawerOpen: false,
  isCodeReviewDrawerOpen: false,
  activeProfileName: 'Default',
  selectedModelIdForEdit: null,
  selectedCloudProfileIdForEdit: null,
  isChatHidden: false,

  setTrayMode: (mode) => set((state) => {
    if (state.trayMode === mode) {
      return state;
    }

    return {
      trayMode: mode,
      isExpanded: mode !== 'closed'
    };
  }),

  toggleTray: (mode) => set((state) => {
    const nextMode = state.trayMode === mode ? 'closed' : mode;
    return {
      trayMode: nextMode,
      lastTrayMode: mode,
      isExpanded: nextMode !== 'closed'
    };
  }),

  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setIsModelDrawerOpen: (open) => set({ isModelDrawerOpen: open }),
  setSelectedModelIdForEdit: (id) => set({ selectedModelIdForEdit: id }),
  openModelDrawer: () => set({ isModelDrawerOpen: true }),
  closeModelDrawer: () => set({ isModelDrawerOpen: false }),
  setIsCloudProfileDrawerOpen: (open) => set({ isCloudProfileDrawerOpen: open }),
  setSelectedCloudProfileIdForEdit: (id) => set({ selectedCloudProfileIdForEdit: id }),
  openCloudProfileDrawer: () => set({ isCloudProfileDrawerOpen: true }),
  closeCloudProfileDrawer: () => set({ isCloudProfileDrawerOpen: false }),
  setIsProfileDrawerOpen: (open) => set({ isProfileDrawerOpen: open }),
  openProfileDrawer: () => set({ isProfileDrawerOpen: true }),
  closeProfileDrawer: () => set({ isProfileDrawerOpen: false }),
  setIsRulesDrawerOpen: (open) => set({ isRulesDrawerOpen: open }),
  openRulesDrawer: () => set({ isRulesDrawerOpen: true }),
  closeRulesDrawer: () => set({ isRulesDrawerOpen: false }),
  setIsCodeReviewDrawerOpen: (open) => set({ isCodeReviewDrawerOpen: open }),
  openCodeReviewDrawer: () => set({ isCodeReviewDrawerOpen: true }),
  closeCodeReviewDrawer: () => set({ isCodeReviewDrawerOpen: false }),
  toggleCodeReviewDrawer: () => set((state) => ({ isCodeReviewDrawerOpen: !state.isCodeReviewDrawerOpen })),
  setActiveProfileName: (name) => set({ activeProfileName: name }),
  setIsChatHidden: (hidden) => set({ isChatHidden: hidden })
}));
