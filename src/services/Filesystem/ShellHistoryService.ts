import { invoke } from '@tauri-apps/api/core';
import type { ShellHistoryEntry } from '../../types/history';

/**
 * ShellHistoryService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Observer**
 * Caches shell history entries from the backend and pushes updates to listeners.
 */
export class ShellHistoryService {
  private entries: ShellHistoryEntry[] = [];
  private loaded = false;
  private listeners: Array<(entries: ShellHistoryEntry[]) => void> = [];

  getEntries(): ShellHistoryEntry[] {
    return this.entries;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  subscribe(listener: (entries: ShellHistoryEntry[]) => void): () => void {
    this.listeners.push(listener);
    if (this.loaded) {
      listener(this.entries);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async load(): Promise<ShellHistoryEntry[]> {
    if (this.loaded) return this.entries;
    try {
      this.entries = await invoke<ShellHistoryEntry[]>('terminal_get_recent_history');
    } catch (error) {
      console.warn('[command-history] failed to load shell history', error);
    }
    this.loaded = true;
    this.listeners.forEach((l) => l(this.entries));
    return this.entries;
  }

  static getInstance(): ShellHistoryService {
    if (!instance) {
      instance = new ShellHistoryService();
    }
    return instance;
  }
}

let instance: ShellHistoryService | null = null;
