import { invoke } from '@tauri-apps/api/core';
import type { TerminalRuntimeContext } from '../../types/terminal';

/**
 * TerminalRuntimeContextService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Cache-Aside** (path-keyed lazy cache)
 * Loads runtime context per path on first access, caches forever, never reloads.
 */
export class TerminalRuntimeContextService {
  private contexts = new Map<string | null, TerminalRuntimeContext | null>();

  get(path: string | null): TerminalRuntimeContext | null {
    return this.contexts.get(path) ?? null;
  }

  async load(path: string | null): Promise<TerminalRuntimeContext | null> {
    if (this.contexts.has(path)) {
      return this.contexts.get(path)!;
    }
    if (!path) {
      this.contexts.set(path, null);
      return null;
    }
    try {
      const context = await invoke<TerminalRuntimeContext>('terminal_get_runtime_context', {
        request: { path }
      });
      this.contexts.set(path, context);
      return context;
    } catch (error) {
      console.warn('[runtime-context] failed to load runtime context', error);
      this.contexts.set(path, null);
      return null;
    }
  }

  static getInstance(): TerminalRuntimeContextService {
    if (!instance) {
      instance = new TerminalRuntimeContextService();
    }
    return instance;
  }
}

let instance: TerminalRuntimeContextService | null = null;
