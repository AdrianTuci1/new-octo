import { type KeyboardEvent } from 'react';
import { useChat } from './useChat';
import { useTray } from './useTray';
import type { CommandApproval } from '../types/terminal';

type KeyboardShortcutOptions = {
  onCommandApproval?: (approval: CommandApproval) => void;
  onNewChat?: () => void;
  onTerminalCommand?: (command: string) => void;
};

function parseTerminalCommand(query: string) {
  const trimmed = query.trim();
  if (!trimmed.startsWith('!') && !trimmed.startsWith('$')) return null;

  return trimmed.slice(1).trim();
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}) {
  const { query, setQuery, submitQuery } = useChat({
    onCommandApproval: options.onCommandApproval,
    onNewChat: options.onNewChat
  });
  const { toggleTray, closeTray } = useTray();

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const terminalCommand = parseTerminalCommand(query);

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
