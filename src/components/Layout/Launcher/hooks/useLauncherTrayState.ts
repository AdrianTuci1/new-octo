import { useCallback, useState } from 'react';
import type { TrayContentMode, TrayMode } from '../../../../types/ui';

export function useLauncherTrayState() {
  const [trayMode, setTrayModeState] = useState<TrayMode>('closed');
  const [lastTrayMode, setLastTrayMode] = useState<TrayContentMode>('help');

  const setTrayMode = useCallback((mode: TrayMode) => {
    setTrayModeState(mode);
    if (mode !== 'closed') {
      setLastTrayMode(mode);
    }
  }, []);

  const toggleTray = useCallback((mode: TrayContentMode) => {
    setTrayModeState((currentMode) => {
      const nextMode: TrayMode = currentMode === mode ? 'closed' : mode;
      if (nextMode !== 'closed') {
        setLastTrayMode(mode);
      }
      return nextMode;
    });
  }, []);

  const closeTray = useCallback(() => {
    setTrayModeState('closed');
  }, []);

  return {
    trayMode,
    lastTrayMode,
    isTrayOpen: trayMode !== 'closed',
    activeTrayMode: trayMode === 'closed' ? lastTrayMode : trayMode,
    setTrayMode,
    toggleTray,
    closeTray,
    openHelp: () => toggleTray('help'),
    openCommands: () => toggleTray('commands'),
    openConversations: () => toggleTray('conversations'),
    openHistory: () => toggleTray('history'),
    openModels: () => toggleTray('models')
  };
}
