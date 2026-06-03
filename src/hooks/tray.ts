import { useUIStore } from '../stores/uiStore';
import type { TrayContentMode } from '../types/ui';

export function useTray() {
  const trayMode = useUIStore((s) => s.trayMode);
  const lastTrayMode = useUIStore((s) => s.lastTrayMode);
  const toggleTray = useUIStore((s) => s.toggleTray);
  const setTrayMode = useUIStore((s) => s.setTrayMode);

  return {
    isTrayOpen: trayMode !== 'closed',
    activeTrayMode: (trayMode === 'closed' ? lastTrayMode : trayMode) as TrayContentMode,
    toggleTray,
    setTrayMode,
    openHelp: () => toggleTray('help'),
    openCommands: () => toggleTray('commands'),
    openConversations: () => toggleTray('conversations'),
    openHistory: () => toggleTray('history'),
    openModels: () => toggleTray('models'),
    closeTray: () => setTrayMode('closed'),
  };
}
