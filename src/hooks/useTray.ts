import { useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { TrayContentMode } from '../types/ui';

export function useTray() {
  const { trayMode, lastTrayMode, toggleTray, setTrayMode } = useUIStore();

  const isTrayOpen = trayMode !== 'closed';
  const activeTrayMode = trayMode === 'closed' ? lastTrayMode : trayMode;
  const openHelp = useCallback(() => {
    toggleTray('help');
  }, [toggleTray]);
  const openCommands = useCallback(() => {
    toggleTray('commands');
  }, [toggleTray]);
  const openConversations = useCallback(() => {
    toggleTray('conversations');
  }, [toggleTray]);
  const openHistory = useCallback(() => {
    toggleTray('history');
  }, [toggleTray]);
  const openModels = useCallback(() => {
    toggleTray('models');
  }, [toggleTray]);
  const closeTray = useCallback(() => {
    setTrayMode('closed');
  }, [setTrayMode]);

  return {
    isTrayOpen,
    activeTrayMode,
    toggleTray,
    setTrayMode,
    openHelp,
    openCommands,
    openConversations,
    openHistory,
    openModels,
    closeTray
  };
}
