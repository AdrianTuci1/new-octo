import type { StoreApi } from 'zustand/vanilla';
import type { AgentState } from '../../stores/AgentStore';

export type TrayMode = AgentState['activeTrayMode'];

/**
 * Manages tray open/close state and active tray mode.
 * Pure state management with no external dependencies.
 */
export class AgentTrayService {
  constructor(private readonly store: StoreApi<AgentState>) {}

  get isTrayOpen(): boolean {
    return this.store.getState().isTrayOpen;
  }

  get activeTrayMode(): TrayMode {
    return this.store.getState().activeTrayMode;
  }

  toggleTray(mode: TrayMode): void {
    const { setActiveTrayMode, setIsTrayOpen } = this.store.getState();
    const current = this.store.getState();

    if (current.isTrayOpen && current.activeTrayMode === mode) {
      setIsTrayOpen(false);
    } else {
      setActiveTrayMode(mode);
      setIsTrayOpen(true);
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
