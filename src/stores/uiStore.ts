import { create } from 'zustand';
import type { TrayMode, TrayContentMode } from '../types/ui';

interface UIState {
  trayMode: TrayMode;
  lastTrayMode: TrayContentMode;
  isExpanded: boolean;
  isModelDrawerOpen: boolean;
  
  // Actions
  setTrayMode: (mode: TrayMode) => void;
  toggleTray: (mode: TrayContentMode) => void;
  setExpanded: (expanded: boolean) => void;
  setIsModelDrawerOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  trayMode: 'closed',
  lastTrayMode: 'help',
  isExpanded: false,
  isModelDrawerOpen: false,

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
  setIsModelDrawerOpen: (open) => set({ isModelDrawerOpen: open })
}));
