import { useUIStore } from '../../stores/uiStore';
import type { TrayContentMode, TrayMode } from '../../types/ui';

/**
 * TrayService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Facade** (thin wrapper over Zustand uiStore)
 * Domain-level API for tray panel state: open/close, toggle, current mode.
 */
export class TrayService {
  private readonly store = useUIStore;

  get trayMode(): TrayMode {
    return this.store.getState().trayMode;
  }

  get lastTrayMode(): TrayContentMode {
    return this.store.getState().lastTrayMode;
  }

  get isTrayOpen(): boolean {
    return this.trayMode !== 'closed';
  }

  get activeTrayMode(): TrayContentMode {
    return this.trayMode === 'closed' ? this.lastTrayMode : this.trayMode as TrayContentMode;
  }

  toggleTray(mode: TrayContentMode): void {
    this.store.getState().toggleTray(mode);
  }

  setTrayMode(mode: TrayContentMode): void {
    this.store.getState().setTrayMode(mode);
  }

  closeTray(): void {
    this.store.getState().setTrayMode('closed');
  }

  static getInstance(): TrayService {
    if (!instance) {
      instance = new TrayService();
    }
    return instance;
  }
}

let instance: TrayService | null = null;
