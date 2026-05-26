import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
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
  const lastCommandHandledAtRef = useRef<Record<string, number>>({});
  const lastSplitCommandHandledAtRef = useRef<number>(0);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    const unlistenPromise = listen<BackendShortcutCommandEvent>('keybinding:command', (event) => {
      const commandId = event.payload.commandId;
      const now = Date.now();
      const lastHandledAt = lastCommandHandledAtRef.current[commandId] ?? 0;
      if (now - lastHandledAt < 250) {
        return;
      }
      if (document.visibilityState === 'hidden') {
        return;
      }

      switch (commandId) {
        case 'app.open-workspace-window':
          lastCommandHandledAtRef.current[commandId] = now;
          onOpenSettingsTab();
          break;
        case 'workspace.new-terminal-tab':
          if (now - lastSplitCommandHandledAtRef.current < 300) {
            return;
          }
          lastCommandHandledAtRef.current[commandId] = now;
          onNewTerminalTab();
          break;
        case 'workspace.new-conversation-tab':
          lastCommandHandledAtRef.current[commandId] = now;
          onNewConversationTab();
          break;
        case 'workspace.split-terminal-right':
          lastCommandHandledAtRef.current[commandId] = now;
          lastSplitCommandHandledAtRef.current = now;
          onSplitTerminal('right');
          break;
        case 'workspace.split-terminal-up':
          lastCommandHandledAtRef.current[commandId] = now;
          lastSplitCommandHandledAtRef.current = now;
          onSplitTerminal('up');
          break;
        case 'workspace.close-active-tab':
          lastCommandHandledAtRef.current[commandId] = now;
          onCloseActiveTab(activeTabId);
          break;
        case 'workspace.toggle-sidebar':
          lastCommandHandledAtRef.current[commandId] = now;
          onToggleSidebar();
          break;
        case 'workspace.toggle-agents':
          lastCommandHandledAtRef.current[commandId] = now;
          onToggleAgents();
          break;
        case 'workspace.show-keyboard-shortcuts':
          lastCommandHandledAtRef.current[commandId] = now;
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
