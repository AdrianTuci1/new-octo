import { useUIStore } from '../stores/uiStore';
import type { TrayContentMode } from '../types/ui';

/**
 * TrayViewModel
 * ───────────────────────────────────────────
 * Pattern: **ViewModel** (MVVM — reads Zustand store, exposes derived state + actions)
 * Bridges the uiStore (Model) to React components (View) without coupling to React.
 */
export class TrayViewModel {
  private readonly store = useUIStore;

  getState() {
    const state = this.store.getState();
    const isTrayOpen = state.trayMode !== 'closed';
    const activeTrayMode: TrayContentMode =
      state.trayMode === 'closed' ? state.lastTrayMode : state.trayMode;

    return {
      isTrayOpen,
      activeTrayMode,
      trayMode: state.trayMode,
      openHelp: () => state.toggleTray('help'),
      openCommands: () => state.toggleTray('commands'),
      openConversations: () => state.toggleTray('conversations'),
      openHistory: () => state.toggleTray('history'),
      openModels: () => state.toggleTray('models'),
      closeTray: () => state.setTrayMode('closed'),
    };
  }
}
