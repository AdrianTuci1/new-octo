import { listen } from '@tauri-apps/api/event';
import type { StoreApi } from 'zustand/vanilla';
import type { AgentState } from '../../stores/AgentStore';
import type { BackendShortcutCommandEvent } from '../../types/keybindings';

/**
 * Manages keyboard shortcuts and Tauri command event listeners.
 * Handles tray navigation, composer mode toggling, and app window commands.
 */
export class AgentShortcutService {
  private active = true;
  private variant: 'panel' | 'workspace' = 'panel';
  private unlisteners: Array<() => void> = [];

  constructor(private readonly store: StoreApi<AgentState>) {}

  // ── Setters ────────────────────────────────────────────────────

  setActive(active: boolean): void {
    this.active = active;
  }

  setVariant(variant: 'panel' | 'workspace'): void {
    this.variant = variant;
  }

  // ── Global event listeners ─────────────────────────────────────

  async startGlobalListeners(openAppWindow: () => void): Promise<void> {
    if (this.variant === 'workspace') return;

    // Tauri keybinding:command event
    if (typeof (window as any).__TAURI_INTERNALS__ !== 'undefined') {
      try {
        const unlisten = await listen<BackendShortcutCommandEvent>(
          'keybinding:command',
          (event) => {
            if (document.visibilityState === 'hidden') return;
            if (event.payload.commandId === 'app.open-workspace-window') {
              openAppWindow();
            }
          },
        );
        this.unlisteners.push(() => { try { unlisten(); } catch {} });
      } catch {}
    }
  }

  stop(): void {
    this.unlisteners.forEach((fn) => { try { fn(); } catch {} });
    this.unlisteners = [];
  }
}
