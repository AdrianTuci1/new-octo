import { create } from 'zustand';
import type { TrayMode, TrayContentMode } from '../types/ui';

interface UIState {
  trayMode: TrayMode;
  lastTrayMode: TrayContentMode;
  isExpanded: boolean;
  isModelDrawerOpen: boolean;
  isProfileDrawerOpen: boolean;
  isRulesDrawerOpen: boolean;
  activeProfileName: string;
  
  // Actions
  setTrayMode: (mode: TrayMode) => void;
  toggleTray: (mode: TrayContentMode) => void;
  setExpanded: (expanded: boolean) => void;
  setIsModelDrawerOpen: (open: boolean) => void;
  openModelDrawer: () => void;
  closeModelDrawer: () => void;
  setIsProfileDrawerOpen: (open: boolean) => void;
  openProfileDrawer: () => void;
  closeProfileDrawer: () => void;
  setIsRulesDrawerOpen: (open: boolean) => void;
  openRulesDrawer: () => void;
  closeRulesDrawer: () => void;
  setActiveProfileName: (name: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  trayMode: 'closed',
  lastTrayMode: 'help',
  isExpanded: false,
  isModelDrawerOpen: false,
  isProfileDrawerOpen: false,
  isRulesDrawerOpen: false,
  activeProfileName: 'Default',

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
  openModelDrawer: () => set({ isModelDrawerOpen: true }),
  closeModelDrawer: () => set({ isModelDrawerOpen: false }),
  setIsProfileDrawerOpen: (open) => set({ isProfileDrawerOpen: open }),
  openProfileDrawer: () => set({ isProfileDrawerOpen: true }),
  closeProfileDrawer: () => set({ isProfileDrawerOpen: false }),
  setIsRulesDrawerOpen: (open) => set({ isRulesDrawerOpen: open }),
  openRulesDrawer: () => set({ isRulesDrawerOpen: true }),
  closeRulesDrawer: () => set({ isRulesDrawerOpen: false }),
  setActiveProfileName: (name) => set({ activeProfileName: name })
}));
