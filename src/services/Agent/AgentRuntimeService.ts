import { invoke } from '@tauri-apps/api/core';
import type { StoreApi } from 'zustand/vanilla';
import type { AgentWorkingDirectory, AgentState } from '../../stores/AgentStore';
import type { MemoryStoreState } from '../../stores/memoryStore';
import type { FilesystemDirectoryListing, FilesystemPathContext } from '../../types/filesystem';

/**
 * Manages working directory, git context, terminal runtime context,
 * code indexing, shell commands, and command history.
 */
export class AgentRuntimeService {
  private autoIndexedPaths = new Set<string>();

  constructor(
    private readonly store: StoreApi<AgentState>,
    private readonly memoryStore: StoreApi<MemoryStoreState>,
  ) {}

  // ── Working Directory ────────────────────────────────────────────

  get workingDirectory(): AgentWorkingDirectory {
    return this.store.getState().workingDirectory;
  }

  get currentPath(): string | null {
    return this.store.getState().workingDirectory.currentPath;
  }

  get homeDir(): string | null {
    return this.store.getState().workingDirectory.homeDir;
  }

  /** Initialize working directory from Tauri path context */
  async initWorkingDirectory(
    initialPath?: string | null,
    rememberSelection = true,
  ): Promise<void> {
    try {
      const context = await invoke<FilesystemPathContext>('terminal_get_path_context');
      const { setWorkingDirectory } = this.store.getState();
      const remembered = rememberSelection
        ? this.memoryStore.getState().settings?.values.lastWorkingDirectory?.trim() || null
        : null;

      const preferredPath = initialPath?.trim() || remembered || context.homeDir || context.currentDir;

      setWorkingDirectory((prev) => ({
        ...prev,
        homeDir: context.homeDir,
        currentPath: prev.currentPath ?? preferredPath,
        browserPath: prev.browserPath ?? preferredPath,
        buttonLabel: preferredPath ? this.formatButtonLabel(preferredPath, context.homeDir) : '~',
      }));
    } catch (error) {
      console.warn('[AgentRuntimeService] failed to load path context', error);
    }
  }

  syncCurrentPath(path: string): void {
    const normalized = path.trim();
    if (!normalized) return;

    this.store.getState().setWorkingDirectory((prev) => ({
      ...prev,
      currentPath: normalized,
      browserPath: normalized,
    }));
  }

  openPicker(): void {
    const { setWorkingDirectory } = this.store.getState();
    const current = this.store.getState().workingDirectory;
    setWorkingDirectory((prev) => ({
      ...prev,
      browserPath: prev.currentPath,
      searchQuery: '',
      isPickerOpen: true,
    }));
  }

  closePicker(): void {
    this.store.getState().setWorkingDirectory((prev) => ({
      ...prev,
      isPickerOpen: false,
      searchQuery: '',
    }));
  }

  togglePicker(): void {
    const current = this.store.getState().workingDirectory;
    if (current.isPickerOpen) {
      this.closePicker();
    } else {
      this.store.getState().setWorkingDirectory((prev) => ({
        ...prev,
        browserPath: prev.currentPath,
        searchQuery: '',
        isPickerOpen: true,
      }));
    }
  }

  setBrowserSearchQuery(query: string): void {
    this.store.getState().setWorkingDirectory((prev) => ({
      ...prev,
      searchQuery: query,
    }));
  }

  async listDirectory(path: string, query = ''): Promise<void> {
    try {
      const fsListing = await invoke<FilesystemDirectoryListing>(
        'terminal_list_directory_entries',
        {
          request: { path, query: query || null, directoriesOnly: true },
        },
      );
      this.store.getState().setWorkingDirectory((prev) => ({
        ...prev,
        listing: {
          path: fsListing.currentPath,
          items: fsListing.entries.map((e) => e.name),
          parentPath: fsListing.parentPath,
        },
      }));
    } catch (error) {
      console.warn('[AgentRuntimeService] failed to list directory', error);
    }
  }

  navigateToParent(): void {
    const parentPath = this.store.getState().workingDirectory.listing?.parentPath?.trim();
    if (!parentPath) return;

    this.store.getState().setWorkingDirectory((prev) => ({
      ...prev,
      browserPath: parentPath,
      searchQuery: '',
    }));
  }

  async selectDirectory(path: string, rememberSelection = true): Promise<void> {
    this.syncCurrentPath(path);
    this.closePicker();

    if (rememberSelection) {
      try {
        await this.memoryStore.getState().saveSettings(
          { lastWorkingDirectory: path },
          true,
        );
      } catch (_) {}
    }
  }

  // ── Code Indexing ────────────────────────────────────────────────

  /** Auto-index a working directory for code search */
  async autoIndexPath(path: string, indexNewFoldersByDefault: boolean): Promise<void> {
    if (!path.trim()) return;
    if (!indexNewFoldersByDefault || this.autoIndexedPaths.has(path)) return;

    this.autoIndexedPaths.add(path);
    try {
      await invoke('code_index_index_project', { path });
    } catch (error) {
      this.autoIndexedPaths.delete(path);
      console.warn('[AgentRuntimeService] failed to auto-index', error);
    }
  }

  // ── Shell commands ───────────────────────────────────────────────

  get shellCommands(): string[] {
    return this.store.getState().shellCommands;
  }

  setShellCommands(commands: string[]): void {
    this.store.getState().setShellCommands(commands);
  }

  // ── Utilities ────────────────────────────────────────────────────

  private formatButtonLabel(path: string | null, homeDir: string | null): string {
    if (!path) return '~';
    if (homeDir && path === homeDir) return '~';
    if (homeDir && path.startsWith(homeDir + '/')) {
      return '~/' + path.slice(homeDir.length + 1);
    }
    return path;
  }
}
