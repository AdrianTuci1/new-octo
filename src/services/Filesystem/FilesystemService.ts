import { invoke } from '@tauri-apps/api/core';
import { formatCompactPathLabel } from '../../lib/pathLabels';
import type { FilesystemDirectoryListing, FilesystemPathContext } from '../../types/filesystem';

type DirectoryListingRequest = {
  path?: string | null;
  query?: string | null;
  directoriesOnly?: boolean;
};

/**
 * FilesystemService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Facade** (Tauri filesystem API wrapper)
 * Central access point for directory browsing, path context, and label formatting.
 */
export class FilesystemService {
  private pathContext: FilesystemPathContext | null = null;
  private loaded = false;

  getPathContext(): FilesystemPathContext | null {
    return this.pathContext;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async loadPathContext(): Promise<FilesystemPathContext | null> {
    if (this.loaded) return this.pathContext;
    try {
      this.pathContext = await invoke<FilesystemPathContext>('terminal_get_path_context');
      this.loaded = true;
      return this.pathContext;
    } catch (error) {
      console.warn('[filesystem] failed to load path context', error);
      return null;
    }
  }

  async listDirectoryEntries(
    path: string,
    query: string | null = null,
    directoriesOnly = true
  ): Promise<FilesystemDirectoryListing | null> {
    try {
      return await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
        request: { path, query: query || null, directoriesOnly } satisfies DirectoryListingRequest
      });
    } catch (error) {
      console.warn('[filesystem] failed to list directories', error);
      return null;
    }
  }

  formatPathLabel(path: string | null): string {
    return formatCompactPathLabel(path, this.pathContext?.homeDir ?? null);
  }

  static getInstance(): FilesystemService {
    if (!instance) {
      instance = new FilesystemService();
    }
    return instance;
  }
}

let instance: FilesystemService | null = null;
