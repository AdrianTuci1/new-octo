import { useEffect, useState, type RefObject } from 'react';
import { clearChatHighlights, performChatHighlight } from '../utils/highlight';

const FIND_INPUT_ID = 'chat-find-input';

type UseChatPanelFindArgs = {
  scrollRef: RefObject<HTMLDivElement | null>;
  messages: unknown;
  terminalBlocks: unknown;
  pendingApproval: unknown;
};

export function useChatPanelFind({
  scrollRef,
  messages,
  terminalBlocks,
  pendingApproval
}: UseChatPanelFindArgs) {
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<HTMLSpanElement[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    if (!isFindOpen || !searchQuery) {
      clearChatHighlights(scrollRef.current);
      setMatches([]);
      setActiveIndex(-1);
      return;
    }

    const foundSpans = performChatHighlight(
      scrollRef.current,
      searchQuery,
      caseSensitive,
      useRegex,
      wholeWord
    );

    setMatches(foundSpans);
    setActiveIndex(foundSpans.length > 0 ? 0 : -1);
  }, [caseSensitive, isFindOpen, messages, pendingApproval, scrollRef, searchQuery, terminalBlocks, useRegex, wholeWord]);

  useEffect(() => {
    matches.forEach((span) => span.classList.remove('active'));

    if (activeIndex >= 0 && activeIndex < matches.length) {
      const activeSpan = matches[activeIndex];
      activeSpan.classList.add('active');
      activeSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, matches]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (isFindShortcut) {
        event.preventDefault();
        openFind();
        return;
      }

      if (event.key === 'Escape' && isFindOpen) {
        event.preventDefault();
        closeFind();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFindOpen]);

  const openFind = () => {
    setIsFindOpen(true);
    focusFindInput();
  };

  const closeFind = () => {
    setIsFindOpen(false);
    setSearchQuery('');
  };

  const selectNextMatch = () => {
    if (matches.length === 0) {
      return;
    }
    setActiveIndex((previous) => (previous + 1) % matches.length);
  };

  const selectPreviousMatch = () => {
    if (matches.length === 0) {
      return;
    }
    setActiveIndex((previous) => (previous - 1 + matches.length) % matches.length);
  };

  return {
    activeIndex,
    caseSensitive,
    closeFind,
    isFindOpen,
    matches,
    searchQuery,
    selectNextMatch,
    selectPreviousMatch,
    setCaseSensitive,
    setSearchQuery,
    setUseRegex,
    setWholeWord,
    useRegex,
    wholeWord
  };
}

function focusFindInput() {
  window.setTimeout(() => {
    const input = document.getElementById(FIND_INPUT_ID);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.focus();
    input.select();
  }, 50);
}
