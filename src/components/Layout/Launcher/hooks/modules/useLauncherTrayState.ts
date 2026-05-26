
/**
 * Module: useLauncherTrayState
 * 
 * Dictionary:
 * - isTrayOpen: Boolean flag for any tray being visible.
 * - activeTrayMode: Specifies which tray is open ('history', 'models', 'help', 'commands').
 * - toggleTray: Opens or closes a specific tray mode.
 * - closeTray: Safety method to close all trays.
 */
import { useState, useCallback } from 'react';

export type TrayMode = 'history' | 'models' | 'help' | 'commands' | 'conversations';

export function useLauncherTrayState() {
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [activeTrayMode, setActiveTrayMode] = useState<TrayMode>('history');

  const toggleTray = useCallback((mode: TrayMode) => {
    setIsTrayOpen(prev => {
      if (prev && activeTrayMode === mode) return false;
      setActiveTrayMode(mode);
      return true;
    });
  }, [activeTrayMode]);

  const closeTray = useCallback(() => setIsTrayOpen(false), []);
  const openHistory = useCallback(() => { setActiveTrayMode('history'); setIsTrayOpen(true); }, []);
  const openModels = useCallback(() => { setActiveTrayMode('models'); setIsTrayOpen(true); }, []);
  const openHelp = useCallback(() => { setActiveTrayMode('help'); setIsTrayOpen(true); }, []);
  const openConversations = useCallback(() => { setActiveTrayMode('conversations'); setIsTrayOpen(true); }, []);

  return {
    isTrayOpen,
    activeTrayMode,
    toggleTray,
    closeTray,
    openHistory,
    openModels,
    openHelp,
    openConversations
  };
}
