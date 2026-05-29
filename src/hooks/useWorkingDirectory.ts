import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { formatCompactPathLabel } from '../lib/pathLabels';
import { useMemoryStore } from '../stores/memoryStore';
import type { FilesystemDirectoryListing, FilesystemPathContext } from '../types/filesystem';

type DirectoryListingRequest = {
  path?: string | null;
  query?: string | null;
  directoriesOnly?: boolean;
};

type UseWorkingDirectoryOptions = {
  initialPath?: string | null;
  rememberSelection?: boolean;
};

export function useWorkingDirectory(options: UseWorkingDirectoryOptions = {}) {
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [browserPath, setBrowserPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [listing, setListing] = useState<FilesystemDirectoryListing | null>(null);
  const didApplyRememberedDirectoryRef = useRef(false);
  const didApplyInitialPathRef = useRef(false);
  const rememberedDirectory = useMemoryStore((state) => state.settings?.values.lastWorkingDirectory);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const rememberSelection = options.rememberSelection ?? true;
  const normalizedInitialPath = options.initialPath?.trim() || null;

  useEffect(() => {
    void invoke<FilesystemPathContext>('terminal_get_path_context')
      .then((context) => {
        setHomeDir(context.homeDir);
        const preferredPath = normalizedInitialPath
          ?? (rememberSelection ? rememberedDirectory?.trim() || null : null)
          ?? context.homeDir
          ?? context.currentDir;

        setCurrentPath((current) => current ?? preferredPath);
        setBrowserPath((current) => current ?? preferredPath);
      })
      .catch((error) => {
        console.warn('[working-directory] failed to load path context', error);
      });
  }, [normalizedInitialPath, rememberSelection, rememberedDirectory]);

  useEffect(() => {
    if (didApplyInitialPathRef.current || !normalizedInitialPath) {
      return;
    }

    didApplyInitialPathRef.current = true;
    setCurrentPath(normalizedInitialPath);
    setBrowserPath(normalizedInitialPath);
  }, [normalizedInitialPath]);

  useEffect(() => {
    if (!rememberSelection || didApplyRememberedDirectoryRef.current) {
      return;
    }

    if (typeof rememberedDirectory !== 'string' || rememberedDirectory.trim().length === 0) {
      return;
    }

    didApplyRememberedDirectoryRef.current = true;
    setCurrentPath(rememberedDirectory);
    setBrowserPath(rememberedDirectory);
  }, [rememberSelection, rememberedDirectory]);

  useEffect(() => {
    if (!browserPath || !isPickerOpen) {
      return;
    }

    void invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
      request: {
        path: browserPath,
        query: searchQuery || null,
        directoriesOnly: true
      } satisfies DirectoryListingRequest
    })
      .then((nextListing) => {
        setListing(nextListing);
      })
      .catch((error) => {
        console.warn('[working-directory] failed to list directories', error);
      });
  }, [browserPath, isPickerOpen, searchQuery]);

  const openPicker = useCallback(() => {
    setBrowserPath(currentPath);
    setSearchQuery('');
    setIsPickerOpen(true);
  }, [currentPath]);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
    setSearchQuery('');
  }, []);

  const togglePicker = useCallback(() => {
    setIsPickerOpen((open) => {
      if (!open) {
        setBrowserPath(currentPath);
        setSearchQuery('');
      }
      return !open;
    });
  }, [currentPath]);

  const navigateToParent = useCallback(() => {
    if (listing?.parentPath) {
      setBrowserPath(listing.parentPath);
      setSearchQuery('');
    }
  }, [listing?.parentPath]);

  const syncCurrentPath = useCallback((path: string | null) => {
    const normalizedPath = path?.trim() || null;
    if (!normalizedPath) {
      return;
    }

    didApplyRememberedDirectoryRef.current = true;
    didApplyInitialPathRef.current = true;
    setCurrentPath((current) => (current === normalizedPath ? current : normalizedPath));
    setBrowserPath((current) => (current === normalizedPath ? current : normalizedPath));
  }, []);

  const selectDirectory = useCallback((path: string) => {
    syncCurrentPath(path);
    setIsPickerOpen(false);
    setSearchQuery('');
    if (rememberSelection) {
      void saveSettings({ lastWorkingDirectory: path }, true);
    }
  }, [rememberSelection, saveSettings, syncCurrentPath]);

  const buttonLabel = useMemo(
    () => formatCompactPathLabel(currentPath, homeDir),
    [currentPath, homeDir]
  );

  return {
    browserPath,
    buttonLabel,
    closePicker,
    currentPath,
    homeDir,
    isPickerOpen,
    listing,
    navigateToParent,
    openPicker,
    searchQuery,
    selectDirectory,
    setSearchQuery,
    syncCurrentPath,
    togglePicker
  };
}
