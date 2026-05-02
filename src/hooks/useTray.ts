import { useUIStore } from '../stores/uiStore';
import type { TrayContentMode } from '../types/ui';

export function useTray() {
  const { trayMode, lastTrayMode, toggleTray, setTrayMode } = useUIStore();

  const isTrayOpen = trayMode !== 'closed';
  const activeTrayMode = trayMode === 'closed' ? lastTrayMode : trayMode;

  return {
    isTrayOpen,
    activeTrayMode,
    toggleTray,
    setTrayMode,
    openHelp: () => toggleTray('help'),
    openCommands: () => toggleTray('commands'),
    openConversations: () => toggleTray('conversations'),
    openHistory: () => toggleTray('history'),
    openModels: () => toggleTray('models'),
    closeTray: () => setTrayMode('closed')
  };
}
