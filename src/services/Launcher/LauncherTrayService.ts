import type { StoreApi } from 'zustand/vanilla';
import type { LauncherStoreState } from '../../stores/launcherStore';

/**
 * Manages tray open/close state and active tray mode for the Launcher.
 * Mirrors AgentTrayService but uses launcherStore instead of AgentStore.
 */
export class LauncherTrayService {
  constructor(private readonly store: StoreApi<LauncherStoreState>) {}

  toggleTray(mode: LauncherStoreState['activeTrayMode']): void {
    const state = this.store.getState();
    if (state.isTrayOpen && state.activeTrayMode === mode) {
      state.setIsTrayOpen(false);
    } else {
      state.setActiveTrayMode(mode);
      state.setIsTrayOpen(true);
    }
  }

  closeTray(): void {
    this.store.getState().setIsTrayOpen(false);
  }

  openHistory(): void {
    this.store.getState().setActiveTrayMode('history');
    this.store.getState().setIsTrayOpen(true);
  }

  openModels(): void {
    this.store.getState().setActiveTrayMode('models');
    this.store.getState().setIsTrayOpen(true);
  }

  openHelp(): void {
    this.store.getState().setActiveTrayMode('help');
    this.store.getState().setIsTrayOpen(true);
  }

  openConversations(): void {
    this.store.getState().setActiveTrayMode('conversations');
    this.store.getState().setIsTrayOpen(true);
  }
}
