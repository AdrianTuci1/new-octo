import type { StoreApi } from 'zustand/vanilla';
import type { UIState } from '../../stores/uiStore';
import type { TrayContentMode } from '../../types/ui';

/**
 * Manages tray open/close state and active tray mode for the Launcher.
 * Uses uiStore (the global tray state) instead of launcherStore.
 */
export class LauncherTrayService {
  constructor(private readonly store: StoreApi<UIState>) {}

  toggleTray(mode: TrayContentMode): void {
    const state = this.store.getState();
    if (state.trayMode !== 'closed' && state.trayMode === mode) {
      this.store.setState({ trayMode: 'closed', isExpanded: false });
    } else {
      this.store.setState({ trayMode: mode, isExpanded: true });
    }
  }

  closeTray(): void {
    this.store.setState({ trayMode: 'closed', isExpanded: false });
  }

  openHistory(): void {
    this.store.setState({ trayMode: 'history', isExpanded: true });
  }

  openModels(): void {
    this.store.setState({ trayMode: 'models', isExpanded: true });
  }

  openHelp(): void {
    this.store.setState({ trayMode: 'help', isExpanded: true });
  }

  openConversations(): void {
    this.store.setState({ trayMode: 'conversations', isExpanded: true });
  }
}
