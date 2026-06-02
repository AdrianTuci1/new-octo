
/**
 * Module: useLauncherShortcuts
 */
import { listen } from '@tauri-apps/api/event';
import { useEffect, type KeyboardEvent } from 'react';
import {
  COMMAND_ITEMS,
  consumeShellModeActivator,
  filterCommandItems,
  isImmediateShellCommandCandidate
} from '../../../../../lib';
import * as Hooks from '../../../../../hooks';
import type { BackendShortcutCommandEvent } from '../../../../../types/keybindings';
import * as Utils from '../../utils';
import type { LauncherProps } from '../types';

export function useLauncherShortcuts({
  active, store, tray, props, runtime, history, ui, handlers, refs, actions, composer
}: {
  active: boolean;
  store: any;
  tray: any;
  props: LauncherProps;
  runtime: any;
  history: any;
  ui: any;
  handlers: any;
  refs: any;
  actions: any;
  composer: any;
}) {
  const { chat, terminal, agentTerminal, workingDirectory, modelSelection, requestCommandApproval, setResolvedPendingApproval } = runtime;
  const { historyEntries } = history;
  const { visibleModels } = ui;
  const { clearTerminalSurface, openAppWindow, launchAgentComposer } = actions;
  const { variant = 'panel' } = props;
  const visibleCommandItems = filterCommandItems(COMMAND_ITEMS, chat.query);
  const removeShellActivator = (query: string) => consumeShellModeActivator(query).value;
  const autodetectEnabled = store.terminalAutoDetectEnabled
    && runtime.agentSettings?.enabled !== false
    && runtime.agentSettings?.input?.autodetectTerminalCommandsInAgent !== false;
  const shouldTreatComposerQueryAsShell = store.composerSurface === 'terminal'
    || store.modeLock === 'shell'
    || runtime.hasShellActivator
    || ui.composerMode === 'shell'
    || store.autodetectedShellLatch
    || (autodetectEnabled && isImmediateShellCommandCandidate(runtime.queryWithoutActivator, runtime.availableShellCommands));

  const toggleShellModeOverride = () => {
    const current = chat.query;
    const consumed = consumeShellModeActivator(current);

    if (consumed.consumed) {
      chat.setQuery(consumed.value);
      store.setModeLock(null);
      store.setAutodetectedShellLatch(false);
      return;
    }

    if (store.modeLock === 'shell') {
      store.setModeLock('chat');
      store.setAutodetectedShellLatch(false);
      return;
    }

    if (store.modeLock === 'chat') {
      store.setModeLock('shell');
      store.setAutodetectedShellLatch(false);
      return;
    }

    store.setModeLock(ui.composerMode === 'shell' || store.autodetectedShellLatch ? 'chat' : 'shell');
    store.setAutodetectedShellLatch(false);
  };

  // 1. Internal Keyboard Logic (Advanced Keyboard Shortcuts)
  const { handleKeyDown } = Hooks.useKeyboardShortcuts({
    query: chat.query,
    setQuery: chat.setQuery,
    submitQuery: chat.submitQuery,
    cwd: workingDirectory.currentPath,
    modelId: modelSelection.selectedModelId,
    disableTrayShortcuts: store.composerSurface === 'terminal' && tray.isTrayOpen && tray.activeTrayMode === 'commands',
    onCommandApproval: requestCommandApproval,
    onNewChat: () => {
      setResolvedPendingApproval(null);
      refs.suppressComposerShellAutodetectRef.current = null;
      store.setModeLock(null);
      store.setComposerSurface('agent');
      clearTerminalSurface();
    },
    onTerminalCommand: (cmd) => {
      const result = Utils.runCommandInSurface(
        cmd,
        'agent',
        terminal,
        agentTerminal,
        clearTerminalSurface,
        'user'
      );
      store.setModeLock(null);
      store.setAutodetectedShellLatch(false);
      return result;
    },
    isShellMode: shouldTreatComposerQueryAsShell,
    isManualShellMode: store.composerSurface !== 'terminal' && store.modeLock === 'shell',
    hasPrediction: Boolean(ui.activeShellPrediction?.completionText),
    onAcceptPrediction: () => {
      const fullCommand = ui.activeShellPrediction?.fullCommand ?? '';
      if (fullCommand) {
        chat.setQuery(fullCommand);
      }
    }, 
    onCyclePrediction: composer.composerIntelligence.cyclePrediction,
    onExitShellMode: () => {
      chat.setQuery(removeShellActivator(chat.query));
      store.setModeLock(null);
      store.setAutodetectedShellLatch(false);
    },
    onToggleShellMode: toggleShellModeOverride,
    onCloseTray: tray.closeTray,
    onToggleHelpTray: tray.openHelp,
    onToggleConversationsTray: tray.openConversations
  });

  // 2. Global Event Listeners
  useEffect(() => {
    if (!active || variant === 'workspace' || !openAppWindow) return;
    const handleOpenAppShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'x') return;
      event.preventDefault();
      event.stopPropagation();
      openAppWindow();
    };
    window.addEventListener('keydown', handleOpenAppShortcut, true);
    return () => window.removeEventListener('keydown', handleOpenAppShortcut, true);
  }, [active, openAppWindow, variant]);

  useEffect(() => {
    if (!active || variant === 'workspace' || !openAppWindow || !(window as any).__TAURI_INTERNALS__) {
      return;
    }

    const unlistenPromise = listen<BackendShortcutCommandEvent>('keybinding:command', (event) => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      if (event.payload.commandId === 'app.open-workspace-window') {
        openAppWindow();
      }
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [active, openAppWindow, variant]);

  // 3. UI Interaction Handlers
  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (tray.isTrayOpen) {
        tray.closeTray();
        return;
      }
      if (store.composerSurface === 'terminal') {
        handlers.toggleComposerSurface();
        return;
      }
      handlers.toggleComposerSurface();
      return;
    }

    if (tray.isTrayOpen && tray.activeTrayMode === 'commands') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        store.setSelectedCommandIndex((index: number) => Math.min(index + 1, Math.max(0, visibleCommandItems.length - 1)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        store.setSelectedCommandIndex((index: number) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const item = visibleCommandItems[store.selectedCommandIndex] ?? visibleCommandItems[0];
        if (!item) {
          return;
        }

        if (event.metaKey || event.ctrlKey) {
          tray.closeTray();
          if (store.composerSurface === 'terminal') {
            launchAgentComposer(item.label, true);
          } else {
            chat.setQuery(item.label);
            void chat.submitQuery(item.label);
          }
          return;
        }

        chat.setQuery(`${item.label} `);
        tray.closeTray();
        return;
      }
    }

    // Tray Navigation
    if (tray.isTrayOpen && (tray.activeTrayMode === 'history' || tray.activeTrayMode === 'models')) {
      const items = tray.activeTrayMode === 'history' ? historyEntries : visibleModels;
      const setter = tray.activeTrayMode === 'history' ? store.setSelectedHistoryIndex : store.setSelectedModelIndex;
      const index = tray.activeTrayMode === 'history' ? store.selectedHistoryIndex : store.selectedModelIndex;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setter((i: number) => Math.min(i + 1, Math.max(0, items.length - 1)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setter((i: number) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = items[index];
        if (item) {
          if (tray.activeTrayMode === 'history') {
            store.setModeLock(item.kind === 'command' ? 'shell' : 'chat');
            chat.setQuery(item.label);
          } else {
            modelSelection.selectModel(item.id, event.metaKey || event.ctrlKey);
          }
          tray.toggleTray(tray.activeTrayMode);
        }
        return;
      }
    }

    if (event.key === 'ArrowUp' && !event.shiftKey && !tray.isTrayOpen) {
      const shouldOpenShellHistory = shouldTreatComposerQueryAsShell
        && (Boolean(ui.activeShellPrediction?.completionText) || removeShellActivator(chat.query).trim().length > 0);
      const shouldOpenAllHistory = store.composerSurface !== 'terminal' && chat.query.trim().length === 0;

      if (shouldOpenShellHistory || shouldOpenAllHistory) {
        event.preventDefault();
        store.setSelectedHistoryIndex(0);
        store.setHistoryTab(shouldOpenShellHistory ? 'commands' : 'all');
        tray.toggleTray('history');
        return;
      }
    }

    if (store.composerSurface === 'terminal') {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const command = consumeShellModeActivator(chat.query).value.trim();
        if (!command) return;
        if (command.startsWith('/')) {
          launchAgentComposer(command, true);
          return;
        }
        if (command === 'clear') {
          clearTerminalSurface();
          chat.setQuery('');
          return;
        }
        void Utils.runCommandInSurface(command, 'terminal', terminal, agentTerminal, clearTerminalSurface, 'user').then(() => chat.setQuery(''));
        return;
      }

      handleKeyDown(event);
      return;
    }

    handleKeyDown(event);
  };

  return { handleComposerKeyDown };
}
