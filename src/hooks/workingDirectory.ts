import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilesystemService } from '../services/Filesystem/FilesystemService';
import { useMemoryStore } from '../stores/memoryStore';
import type { FilesystemDirectoryListing } from '../types/filesystem';

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
    const filesystem = FilesystemService.getInstance();
    void filesystem.loadPathContext().then((context) => {
      if (!context) return;
      setHomeDir(context.homeDir);
      const preferredPath = normalizedInitialPath
        ?? (rememberSelection ? rememberedDirectory?.trim() || null : null)
        ?? context.homeDir
        ?? context.currentDir;
      setCurrentPath((current) => current ?? preferredPath);
      setBrowserPath((current) => current ?? preferredPath);
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
    if (!browserPath || !isPickerOpen) return;
    void FilesystemService.getInstance()
      .listDirectoryEntries(browserPath, searchQuery || null)
      .then(setListing);
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
    () => FilesystemService.getInstance().formatPathLabel(currentPath),
    [currentPath]
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
