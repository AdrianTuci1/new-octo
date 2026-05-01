import { type KeyboardEvent } from 'react';
import { useChat } from './useChat';
import { useTray } from './useTray';

export function useKeyboardShortcuts() {
  const { query, submitQuery } = useChat();
  const { toggleTray, closeTray } = useTray();

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
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

    if (event.key === '/' && query.length === 0) {
      event.preventDefault();
      toggleTray('commands');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      toggleTray('conversations');
    }
  };

  return { handleKeyDown };
}
