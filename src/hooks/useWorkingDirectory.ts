import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FilesystemDirectoryListing, FilesystemPathContext } from '../types/filesystem';

type DirectoryListingRequest = {
  path?: string | null;
  query?: string | null;
  directoriesOnly?: boolean;
};

function compactPathLabel(path: string | null, homeDir: string | null) {
  const segments = path?.split('/').filter(Boolean) ?? [];
  const lastSegment = segments[segments.length - 1] ?? path ?? '~';

  if (!path) return '~';
  if (!homeDir) return path;
  if (path === homeDir) return '~';
  if (path.startsWith(`${homeDir}/`)) {
    return `~/${lastSegment}`;
  }

  return lastSegment;
}

export function useWorkingDirectory() {
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [browserPath, setBrowserPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [listing, setListing] = useState<FilesystemDirectoryListing | null>(null);

  useEffect(() => {
    void invoke<FilesystemPathContext>('terminal_get_path_context')
      .then((context) => {
        setHomeDir(context.homeDir);
        setCurrentPath(context.currentDir);
        setBrowserPath(context.currentDir);
      })
      .catch((error) => {
        console.warn('[working-directory] failed to load path context', error);
      });
  }, []);

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

  const selectDirectory = useCallback((path: string) => {
    setCurrentPath(path);
    setBrowserPath(path);
    setIsPickerOpen(false);
    setSearchQuery('');
  }, []);

  const buttonLabel = useMemo(
    () => compactPathLabel(currentPath, homeDir),
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
    togglePicker
  };
}
