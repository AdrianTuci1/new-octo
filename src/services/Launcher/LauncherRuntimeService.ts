import { invoke } from '@tauri-apps/api/core';
import { execSync } from 'child_process';
import type { StoreApi } from 'zustand/vanilla';
import type { MemoryStoreState } from '../../stores/memoryStore';
import type { RuntimeStoreState } from '../../stores/RuntimeStore';
import type { FilesystemDirectoryListing } from '../../types/filesystem';

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
        cwd = await invoke<string>('get_current_dir');
      } catch {
        cwd = process.cwd();
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
    const listing = await invoke<FilesystemDirectoryListing>('list_directory', { path });
    this.store.getState().setWorkingDirectory((prev) => ({
      ...prev,
      listing: listing.items,
    }));
    return listing;
  }

  // ── Git Context ────────────────────────────────────────────────

  /** Initialize git context: current branch + all branches */
  async initGitContext(): Promise<void> {
    try {
      const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();

      this.store.getState().setGitContext({
        gitContext: currentBranch ? { currentBranch } : null,
        currentBranch: currentBranch || null,
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
      execSync(`git checkout ${branch}`, { encoding: 'utf-8' });
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
      const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();

      this.store.getState().setRuntimeContext({
        nodeVersion: nodeVersion || null,
      });
    } catch {
      // Node not available — clear context
      this.store.getState().setRuntimeContext(null);
    }
  }
}
