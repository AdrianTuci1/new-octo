import { invoke } from '@tauri-apps/api/core';
import type { StoreApi } from 'zustand/vanilla';
import type { MemoryStoreState } from '../../stores/memoryStore';
import type { RuntimeStoreState } from '../../stores/RuntimeStore';
import type { FilesystemDirectoryListing } from '../../types/filesystem';

interface GitRepoContext {
  rootPath: string;
  currentBranch: string;
  branches: string[];
}

interface TerminalRuntimeContext {
  nodeVersion: string | null;
  targetOs: string;
  targetArch: string;
}

// ── Service ─────────────────────────────────────────────────────────

export class LauncherRuntimeService {
  constructor(
    private readonly store: StoreApi<RuntimeStoreState>,
    private readonly memoryStore: StoreApi<MemoryStoreState>,
  ) {}

  // ── Working Directory ──────────────────────────────────────────

  get workingDirectory(): RuntimeStoreState['workingDirectory'] {
    return this.store.getState().workingDirectory;
  }

  get currentPath(): string | null {
    return this.store.getState().workingDirectory.currentPath;
  }

  /** Initialize working directory from Tauri or fall back to process.cwd() */
  async initWorkingDirectory(): Promise<void> {
    try {
      let cwd: string;
      try {
        const ctx = await invoke<{ homeDir: string; currentDir: string }>('terminal_get_path_context');
        cwd = ctx.currentDir;
      } catch {
        cwd = '/';
      }

      this.store.getState().setWorkingDirectory((prev) => ({
        ...prev,
        currentPath: prev.currentPath ?? cwd,
        browserPath: cwd,
      }));
    } catch (error) {
      console.warn('[LauncherRuntimeService] failed to initialize working directory', error);
    }
  }

  /** Update the working directory and re-initialize git context */
  async setWorkingDirectory(path: string): Promise<void> {
    const normalized = path.trim();
    if (!normalized) return;

    this.store.getState().setWorkingDirectory((prev) => ({
      ...prev,
      currentPath: normalized,
    }));

    // Re-init git context for the new directory
    await this.initGitContext();
  }

  /** List directory entries via Tauri invoke */
  async getWorkingDirectoryListing(path: string): Promise<FilesystemDirectoryListing> {
    const listing = await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
      request: { path }
    });
    this.store.getState().setWorkingDirectory((prev) => ({
      ...prev,
      listing: listing.entries.map((e) => e.path),
    }));
    return listing;
  }

  // ── Git Context ────────────────────────────────────────────────

  /** Initialize git context: current branch + all branches */
  async initGitContext(): Promise<void> {
    try {
      const currentPath = this.store.getState().workingDirectory.currentPath;
      const context = await invoke<GitRepoContext | null>('terminal_get_git_context', {
        request: { path: currentPath }
      });

      this.store.getState().setGitContext({
        gitContext: context ? { currentBranch: context.currentBranch } : null,
        currentBranch: context?.currentBranch ?? null,
        isBranchMenuOpen: false,
      });
    } catch {
      // Not a git repository — clear context silently
      this.store.getState().setGitContext({
        gitContext: null,
        currentBranch: null,
        isBranchMenuOpen: false,
      });
    }
  }

  /** Switch to a different branch and refresh git context */
  async switchBranch(branch: string): Promise<void> {
    try {
      const currentPath = this.store.getState().workingDirectory.currentPath;
      await invoke<GitRepoContext | null>('terminal_switch_git_branch', {
        request: { path: currentPath, branch }
      });
      await this.initGitContext();
    } catch (error) {
      console.warn('[LauncherRuntimeService] failed to switch branch', error);
    }
  }

  // ── Runtime Context ────────────────────────────────────────────

  get runtimeContext(): { nodeVersion?: string | null } | null {
    return this.store.getState().runtimeContext;
  }

  /** Initialize runtime context — detect node version */
  async initRuntimeContext(): Promise<void> {
    try {
      const currentPath = this.store.getState().workingDirectory.currentPath;
      const ctx = await invoke<TerminalRuntimeContext>('terminal_get_runtime_context', {
        request: { path: currentPath }
      });

      this.store.getState().setRuntimeContext({
        nodeVersion: ctx.nodeVersion || null,
      });
    } catch {
      // Node not available — clear context
      this.store.getState().setRuntimeContext(null);
    }
  }
}
