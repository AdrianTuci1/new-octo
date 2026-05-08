import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import type { BackendShortcutCommandEvent } from '../../../types/keybindings';

type UseBackendShortcutActionsOptions = {
  activeTabId: string;
  onCloseActiveTab: (tabId: string) => void;
  onNewConversationTab: () => void;
  onNewTerminalTab: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettingsTab: () => void;
  onSplitTerminal: (direction: 'right' | 'up') => void;
  onToggleAgents: () => void;
  onToggleSidebar: () => void;
};

export function useBackendShortcutActions({
  activeTabId,
  onCloseActiveTab,
  onNewConversationTab,
  onNewTerminalTab,
  onOpenKeyboardShortcuts,
  onOpenSettingsTab,
  onSplitTerminal,
  onToggleAgents,
  onToggleSidebar
}: UseBackendShortcutActionsOptions) {
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    const unlistenPromise = listen<BackendShortcutCommandEvent>('keybinding:command', (event) => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      switch (event.payload.commandId) {
        case 'app.open-workspace-window':
          onOpenSettingsTab();
          break;
        case 'workspace.new-terminal-tab':
          onNewTerminalTab();
          break;
        case 'workspace.new-conversation-tab':
          onNewConversationTab();
          break;
        case 'workspace.split-terminal-right':
          onSplitTerminal('right');
          break;
        case 'workspace.split-terminal-up':
          onSplitTerminal('up');
          break;
        case 'workspace.close-active-tab':
          onCloseActiveTab(activeTabId);
          break;
        case 'workspace.toggle-sidebar':
          onToggleSidebar();
          break;
        case 'workspace.toggle-agents':
          onToggleAgents();
          break;
        case 'workspace.show-keyboard-shortcuts':
          onOpenKeyboardShortcuts();
          break;
        default:
          break;
      }
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [
    activeTabId,
    onCloseActiveTab,
    onNewConversationTab,
    onNewTerminalTab,
    onOpenKeyboardShortcuts,
    onOpenSettingsTab,
    onSplitTerminal,
    onToggleAgents,
    onToggleSidebar
  ]);
}
