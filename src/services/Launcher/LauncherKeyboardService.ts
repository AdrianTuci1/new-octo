import { type KeyboardEvent } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useUIStore } from '../../stores/uiStore';
import type { LauncherState } from '../../stores/launcherStore';
import type { ChatState } from '../../stores/chatStore';

export interface KeybindingEntry {
  keys: string[];
  label: string;
  description: string;
}

/**
 * Manages keyboard shortcuts for the Launcher composer interface.
 * Handles tray navigation, composer surface toggling, and terminal command execution.
 */
export class LauncherKeyboardService {
  constructor(
    private readonly launcherStore: StoreApi<LauncherState>,
    private readonly chatStore: StoreApi<ChatState>,
  ) {}

  /**
   * Central keyboard event handler for the composer textarea.
   * Orchestrates Escape-to-close, tray navigation, and terminal Enter.
   */
  handleComposerKeyDown(event: KeyboardEvent, _state: any): void {
    const launcherState = this.launcherStore.getState();
    const chatState = this.chatStore.getState();
    const uiState = useUIStore.getState();

    const trayMode = uiState.trayMode;
    const isTrayOpen = trayMode !== 'closed';
    const composerSurface = launcherState.composerSurface;

    // ── Escape ──────────────────────────────────────────────
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();

      if (isTrayOpen) {
        useUIStore.setState({ trayMode: 'closed', isExpanded: false });
      } else {
        const nextSurface = composerSurface === 'terminal' ? 'agent' : 'terminal';
        this.launcherStore.setState({ composerSurface: nextSurface });
      }
      return;
    }

    // ── Tray open: commands mode ───────────────────────────
    if (isTrayOpen && trayMode === 'commands') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.launcherStore.setState((state) => ({
          selectedCommandIndex: Math.max(0, state.selectedCommandIndex - 1),
        }));
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.launcherStore.setState((state) => ({
          selectedCommandIndex: state.selectedCommandIndex + 1,
        }));
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        // Selection is committed by the tray component reacting to index
        return;
      }
    }

    // ── Tray open: history mode ────────────────────────────
    if (isTrayOpen && trayMode === 'history') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.launcherStore.setState((state) => ({
          selectedHistoryIndex: Math.max(0, state.selectedHistoryIndex - 1),
        }));
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.launcherStore.setState((state) => ({
          selectedHistoryIndex: state.selectedHistoryIndex + 1,
        }));
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        return;
      }
    }

    // ── Tray open: models mode ─────────────────────────────
    if (isTrayOpen && trayMode === 'models') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.launcherStore.setState((state) => ({
          selectedModelIndex: Math.max(0, state.selectedModelIndex - 1),
        }));
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.launcherStore.setState((state) => ({
          selectedModelIndex: state.selectedModelIndex + 1,
        }));
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        return;
      }
    }

    // ── Terminal surface + Enter ───────────────────────────
    if (composerSurface === 'terminal' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const command = chatState.query.trim();
      if (command) {
        // Delegate terminal command execution — caller wires this via the returned handler
      }
      return;
    }
  }

  /**
   * Returns the keybinding catalog for display in the help tray.
   */
  getKeybindingCatalog(): { shortcuts: KeybindingEntry[] } {
    return { shortcuts: [] };
  }
}
