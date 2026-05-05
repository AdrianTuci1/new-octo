import { type KeyboardEvent } from 'react';
import type { CommandApproval } from '../types/terminal';

type KeyboardShortcutOptions = {
  query: string;
  setQuery: (query: string) => void;
  submitQuery: () => void | Promise<void>;
  onCommandApproval?: (approval: CommandApproval) => void;
  onNewChat?: () => void;
  onTerminalCommand?: (command: string) => void;
  disableTrayShortcuts?: boolean;
  cwd?: string | null;
  modelId?: string | null;
  isShellMode?: boolean;
  isManualShellMode?: boolean;
  hasPrediction?: boolean;
  onAcceptPrediction?: () => void;
  onCyclePrediction?: () => void;
  onExitShellMode?: () => void;
  onToggleShellMode?: () => void;
  onCloseTray?: () => void;
  onToggleHelpTray?: () => void;
  onToggleConversationsTray?: () => void;
};

function parseTerminalCommand(query: string, isShellMode?: boolean) {
  const trimmed = query.trim();
  if (isShellMode) return trimmed;
  if (!trimmed.startsWith('!') && !trimmed.startsWith('$')) return null;

  return trimmed.slice(1).trim();
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions) {
  const { query, setQuery, submitQuery } = options;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      options.onToggleShellMode?.();
      return;
    }

    if ((event.key === 'ArrowRight' || event.key === 'Tab') && options.isShellMode && options.hasPrediction) {
      event.preventDefault();
      options.onAcceptPrediction?.();
      return;
    }

    if (event.key === 'ArrowDown' && options.isShellMode && options.hasPrediction) {
      event.preventDefault();
      options.onCyclePrediction?.();
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
        options.onCloseTray?.();
        return;
      }

      submitQuery();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (options.isManualShellMode && query.length === 0) {
        options.onExitShellMode?.();
      }
      options.onCloseTray?.();
      return;
    }

    if (!options.disableTrayShortcuts && event.key === '?' && query.length === 0) {
      event.preventDefault();
      options.onToggleHelpTray?.();
      return;
    }

    if (!options.disableTrayShortcuts && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      options.onToggleConversationsTray?.();
    }
  };

  return { handleKeyDown };
}
