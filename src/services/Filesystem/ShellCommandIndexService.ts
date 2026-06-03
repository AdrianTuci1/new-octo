import { invoke } from '@tauri-apps/api/core';

/**
 * ShellCommandIndexService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** (global instance) + **Observer** (subscribe/listeners)
 * Loads shell commands from the Tauri backend once and notifies subscribers.
 * Subscribers receive a snapshot on registration and delta updates on reload.
 */
export class ShellCommandIndexService {
  private commands: string[] = [];
  private loaded = false;
  private listeners: Array<(commands: string[]) => void> = [];

  getCommands(): string[] {
    return this.commands;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  subscribe(listener: (commands: string[]) => void): () => void {
    this.listeners.push(listener);
    if (this.loaded) {
      listener(this.commands);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async load(): Promise<string[]> {
    if (this.loaded) return this.commands;
    try {
      this.commands = await invoke<string[]>('terminal_list_commands');
    } catch (error) {
      console.warn('[shell-command-index] failed to load commands', error);
    }
    this.loaded = true;
    this.listeners.forEach((l) => l(this.commands));
    return this.commands;
  }

  static getInstance(): ShellCommandIndexService {
    if (!instance) {
      instance = new ShellCommandIndexService();
    }
    return instance;
  }
}

let instance: ShellCommandIndexService | null = null;
