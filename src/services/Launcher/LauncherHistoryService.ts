import type { StoreApi } from 'zustand/vanilla';
import type { HistoryEntry } from '../../types/history';
import type { TerminalCommandBlock } from '../../types/terminal';

/**
 * Aggregates terminal, agent-terminal, and persisted history for the
 * Launcher tray.  Reads from the primary launcher store and the
 * memory store, mirroring the pattern used by AgentHistoryService.
 */
export class LauncherHistoryService {
  constructor(
    private readonly store: StoreApi<any>,
    private readonly memoryStore: StoreApi<any>,
  ) {}

  // ── Load ─────────────────────────────────────────────────────────

  /**
   * Placeholder — loads persisted history from a backend or disk.
   * Returns an empty list until real persistence is wired up.
   */
  loadHistory(): HistoryEntry[] {
    return [];
  }

  // ── Aggregation ──────────────────────────────────────────────────

  /**
   * Aggregate terminal blocks and agent-terminal blocks from the
   * primary store into a single HistoryEntry array.
   *
   * Terminal blocks → command entries (kind `command`).
   * Agent blocks     → prompt-like entries (kind `prompt`).
   */
  aggregateEntries(): HistoryEntry[] {
    const state = this.store.getState();

    const terminalBlocks: TerminalCommandBlock[] =
      state.terminalBlocks ?? [];
    const agentBlocks: TerminalCommandBlock[] =
      state.agentTerminalBlocks ?? [];

    const terminalEntries: HistoryEntry[] = terminalBlocks
      .filter((block) => block.command.trim().length > 0)
      .map((block) => ({
        id: `launcher-term-${block.id}`,
        label: block.command,
        detail: `terminal · ${block.startedAt}`,
        kind: 'command' as const,
        createdAt: block.startedAt,
      }));

    const agentEntries: HistoryEntry[] = agentBlocks
      .filter((block) => block.command.trim().length > 0)
      .map((block) => ({
        id: `launcher-agent-${block.id}`,
        label: block.command,
        detail: `agent · ${block.startedAt}`,
        kind: 'prompt' as const,
        createdAt: block.startedAt,
      }));

    return [...terminalEntries, ...agentEntries].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );
  }

  // ── History reads ────────────────────────────────────────────────

  /**
   * Return the current history entries from the primary store.
   * Consumers call this after aggregateEntries has written the
   * combined list into the store.
   */
  getHistoryEntries(): HistoryEntry[] {
    return this.store.getState().historyEntries ?? [];
  }

  // ── Tray controls ────────────────────────────────────────────────

  /**
   * Toggle the launcher tray open/closed for a given mode.
   *
   * - If the tray is already open in the requested mode → close it.
   * - Otherwise → open it in the requested mode.
   */
  toggleTray(mode: string): void {
    const state = this.store.getState();
    const isOpen: boolean = state.isTrayOpen ?? false;
    const currentMode: string = state.activeTrayMode ?? 'history';

    if (isOpen && currentMode === mode) {
      if (typeof state.setIsTrayOpen === 'function') {
        state.setIsTrayOpen(false);
      }
    } else {
      if (typeof state.setActiveTrayMode === 'function') {
        state.setActiveTrayMode(mode);
      }
      if (typeof state.setIsTrayOpen === 'function') {
        state.setIsTrayOpen(true);
      }
    }
  }

  /**
   * Close the tray unconditionally.
   */
  closeTray(): void {
    const setter = this.store.getState().setIsTrayOpen;
    if (typeof setter === 'function') {
      setter(false);
    }
  }
}
