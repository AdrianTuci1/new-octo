import { type KeyboardEvent } from 'react';
import { useChat } from './useChat';
import { useTray } from './useTray';
import type { CommandApproval } from '../types/terminal';

type KeyboardShortcutOptions = {
  onCommandApproval?: (approval: CommandApproval) => void;
  onNewChat?: () => void;
  onTerminalCommand?: (command: string) => void;
  cwd?: string | null;
  isShellMode?: boolean;
  isManualShellMode?: boolean;
  hasPrediction?: boolean;
  onAcceptPrediction?: () => void;
  onExitShellMode?: () => void;
  onToggleShellMode?: () => void;
};

function parseTerminalCommand(query: string, isShellMode?: boolean) {
  const trimmed = query.trim();
  if (isShellMode) return trimmed;
  if (!trimmed.startsWith('!') && !trimmed.startsWith('$')) return null;

  return trimmed.slice(1).trim();
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}) {
  const { query, setQuery, submitQuery } = useChat({
    cwd: options.cwd,
    onCommandApproval: options.onCommandApproval,
    onNewChat: options.onNewChat
  });
  const { toggleTray, closeTray } = useTray();

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      options.onToggleShellMode?.();
      return;
    }

    if (event.key === 'ArrowRight' && options.isShellMode && options.hasPrediction) {
      event.preventDefault();
      options.onAcceptPrediction?.();
      return;
    }

    if (event.key === 'Backspace' && options.isManualShellMode && query.length === 0) {
      event.preventDefault();
      options.onExitShellMode?.();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const terminalCommand = parseTerminalCommand(query, options.isShellMode);

      if (terminalCommand) {
        options.onTerminalCommand?.(terminalCommand);
        setQuery('');
        closeTray();
        return;
      }

      submitQuery();
      return;
    }

    if (event.key === 'Escape') {
      if (options.isManualShellMode && query.length === 0) {
        options.onExitShellMode?.();
      }
      closeTray();
      return;
    }

    if (event.key === '?' && query.length === 0) {
      event.preventDefault();
      toggleTray('help');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      toggleTray('conversations');
    }
  };

  return { handleKeyDown };
}
