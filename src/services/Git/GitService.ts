import { invoke } from '@tauri-apps/api/core';
import type { GitRepoContext } from '../../types/git';

/**
 * GitService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Facade** (wraps Tauri git calls behind a path-keyed cache)
 * Access point for git context per working directory. Supports branch switching.
 */
export class GitService {
  private contexts = new Map<string | null, GitRepoContext | null>();

  get(path: string | null): GitRepoContext | null {
    return this.contexts.get(path) ?? null;
  }

  async refresh(path: string | null): Promise<GitRepoContext | null> {
    if (!path) {
      this.contexts.set(path, null);
      return null;
    }
    try {
      const context = await invoke<GitRepoContext | null>('terminal_get_git_context', {
        request: { path }
      });
      this.contexts.set(path, context);
      return context;
    } catch (error) {
      console.warn('[git-context] failed to load repo context', error);
      this.contexts.set(path, null);
      return null;
    }
  }

  async switchBranch(path: string | null, branch: string): Promise<void> {
    if (!path) return;
    try {
      const nextContext = await invoke<GitRepoContext | null>('terminal_switch_git_branch', {
        request: { path, branch }
      });
      this.contexts.set(path, nextContext);
    } catch (error) {
      console.warn('[git-context] failed to switch branch', error);
    }
  }

  static getInstance(): GitService {
    if (!instance) {
      instance = new GitService();
    }
    return instance;
  }
}

let instance: GitService | null = null;
