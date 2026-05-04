/**
 * `useLauncherShortcuts` - Manages global and component-level keyboard shortcuts.
 * 
 * Responsibilities:
 * 1. Listen for global "Escape" keydowns to return to terminal mode or close trays.
 * 2. Listen for tray navigation shortcuts (Arrow keys, Enter, Shift+Tab) for history and models.
 * 3. Intercept `handleComposerKeyDown` to intercept terminal submissions or navigate the tray directly from the input.
 */
import { useEffect, type KeyboardEvent } from 'react';
import { runCommandInSurface } from '../utils';

export function useLauncherShortcuts({
  active, chat, tray, store, terminal, agentTerminal,
  historyEntries, modelSelection, isTerminalSurface,
  dockRef, saveSettings, visibleModels, toggleComposerSurface,
  clearTerminalSurface, handleKeyDown, openAppWindow, variant
}: any) {
  useEffect(() => {
    if (!active || variant !== 'panel' || !openAppWindow) {
      return;
    }

    const handleOpenAppShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'x') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openAppWindow();
    };

    window.addEventListener('keydown', handleOpenAppShortcut, true);
    return () => {
      window.removeEventListener('keydown', handleOpenAppShortcut, true);
    };
  }, [active, openAppWindow, variant]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleGlobalEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest('.working-directory-menu, .git-branch-menu')) {
        return;
      }
      if (
        target instanceof HTMLTextAreaElement
        || target instanceof HTMLInputElement
        || target?.isContentEditable
        || target?.closest('textarea, input, [contenteditable="true"]')
      ) {
        return;
      }

      if (tray.isTrayOpen) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        tray.closeTray();
        return;
      }

      if (isTerminalSurface) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleComposerSurface();
    };

    window.addEventListener('keydown', handleGlobalEscape, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalEscape, true);
    };
  }, [active, isTerminalSurface, tray.closeTray, tray.isTrayOpen, toggleComposerSurface]);

  useEffect(() => {
    if (!active) {
      return;
    }

    if (!tray.isTrayOpen || (tray.activeTrayMode !== 'history' && tray.activeTrayMode !== 'models')) {
      return;
    }

    if (isTerminalSurface) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (tray.activeTrayMode === 'history') {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          store.setSelectedHistoryIndex((index: number) => Math.min(index + 1, Math.max(0, historyEntries.length - 1)));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          store.setSelectedHistoryIndex((index: number) => Math.max(index - 1, 0));
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const entry = historyEntries[store.selectedHistoryIndex];
          if (entry) {
            store.setModeLock(entry.kind === 'command' ? 'shell' : 'chat');
            chat.setQuery(entry.label);
            tray.toggleTray('history');
          }
          return;
        }

        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          store.setHistoryTab((tab: any) => tab === 'all' ? 'commands' : tab === 'commands' ? 'prompts' : 'all');
          return;
        }
      }

      if (tray.activeTrayMode === 'models') {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          store.setSelectedModelIndex((index: number) => Math.min(index + 1, Math.max(0, visibleModels.length - 1)));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          store.setSelectedModelIndex((index: number) => Math.max(index - 1, 0));
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const model = visibleModels[store.selectedModelIndex];
          if (model) {
            modelSelection.selectModel(model.id, event.metaKey || event.ctrlKey);
            tray.toggleTray('models');
          }
          return;
        }

        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          store.setModelTab((tab: any) => tab === 'all' ? 'saved' : 'all');
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        tray.toggleTray(tray.activeTrayMode);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [
    active,
    tray.activeTrayMode,
    historyEntries,
    tray.isTrayOpen,
    modelSelection,
    isTerminalSurface,
    dockRef,
    store.modeLock,
    saveSettings,
    store.selectedHistoryIndex,
    store.selectedModelIndex,
    chat.setQuery,
    tray.toggleTray,
    visibleModels
  ]);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (tray.isTrayOpen) {
        tray.closeTray();
        return;
      }

      if (isTerminalSurface) {
        return;
      }

      toggleComposerSurface();
      return;
    }

    if (isTerminalSurface) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const command = chat.query.trim();
        if (!command) {
          return;
        }

        if (command === 'clear') {
          clearTerminalSurface();
          chat.setQuery('');
          return;
        }

        void runCommandInSurface(
          command,
          'terminal',
          terminal,
          agentTerminal,
          clearTerminalSurface,
          'user'
        ).then(() => {
          chat.setQuery('');
        });
        return;
      }

      return;
    }

    if (tray.isTrayOpen && tray.activeTrayMode === 'history') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        store.setSelectedHistoryIndex((index: number) => Math.min(index + 1, Math.max(0, historyEntries.length - 1)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        store.setSelectedHistoryIndex((index: number) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const entry = historyEntries[store.selectedHistoryIndex];
        if (entry) {
          store.setModeLock(entry.kind === 'command' ? 'shell' : 'chat');
          chat.setQuery(entry.label);
          tray.toggleTray('history');
        }
        return;
      }

      if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        store.setHistoryTab((tab: any) => tab === 'all' ? 'commands' : tab === 'commands' ? 'prompts' : 'all');
        return;
      }
    }

    if (tray.isTrayOpen && tray.activeTrayMode === 'models') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        store.setSelectedModelIndex((index: number) => Math.min(index + 1, Math.max(0, visibleModels.length - 1)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        store.setSelectedModelIndex((index: number) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const model = visibleModels[store.selectedModelIndex];
        if (model) {
          modelSelection.selectModel(model.id, event.metaKey || event.ctrlKey);
          tray.toggleTray('models');
        }
        return;
      }

      if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        store.setModelTab((tab: any) => tab === 'all' ? 'saved' : 'all');
        return;
      }
    }

    if (event.key === 'ArrowUp' && !event.shiftKey && chat.query.trim().length === 0 && !tray.isTrayOpen) {
      event.preventDefault();
      store.setSelectedHistoryIndex(0);
      tray.toggleTray('history');
      return;
    }

    handleKeyDown(event);
  };


  return { handleComposerKeyDown };
}
