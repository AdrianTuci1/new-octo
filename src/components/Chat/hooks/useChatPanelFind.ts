import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useStore } from 'zustand';
import { clearChatHighlights, performChatHighlight } from '../utils/highlight';
import { createChatFindStore } from './useChatFindStore';

const FIND_INPUT_ID = 'chat-find-input';

type UseChatPanelFindArgs = {
  scrollRef: RefObject<HTMLDivElement | null>;
  documentRevision: string;
};

export function useChatPanelFind({
  scrollRef,
  documentRevision
}: UseChatPanelFindArgs) {
  const storeRef = useRef(createChatFindStore());
  const matchesRef = useRef<HTMLSpanElement[]>([]);
  const highlightKeyRef = useRef('');
  const isFindOpen = useStore(storeRef.current, (state) => state.isFindOpen);
  const searchQuery = useStore(storeRef.current, (state) => state.searchQuery);
  const caseSensitive = useStore(storeRef.current, (state) => state.caseSensitive);
  const useRegex = useStore(storeRef.current, (state) => state.useRegex);
  const wholeWord = useStore(storeRef.current, (state) => state.wholeWord);
  const matchCount = useStore(storeRef.current, (state) => state.matchCount);
  const activeIndex = useStore(storeRef.current, (state) => state.activeIndex);
  const openFind = useStore(storeRef.current, (state) => state.openFind);
  const closeFind = useStore(storeRef.current, (state) => state.closeFind);
  const setSearchQuery = useStore(storeRef.current, (state) => state.setSearchQuery);
  const setCaseSensitive = useStore(storeRef.current, (state) => state.setCaseSensitive);
  const setUseRegex = useStore(storeRef.current, (state) => state.setUseRegex);
  const setWholeWord = useStore(storeRef.current, (state) => state.setWholeWord);
  const setMatchCount = useStore(storeRef.current, (state) => state.setMatchCount);
  const setActiveIndex = useStore(storeRef.current, (state) => state.setActiveIndex);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    if (!isFindOpen || !searchQuery) {
      if (highlightKeyRef.current || matchesRef.current.length > 0) {
        clearChatHighlights(container);
      }
      highlightKeyRef.current = '';
      matchesRef.current = [];
      if (matchCount !== 0) {
        setMatchCount(0);
      }
      if (activeIndex !== -1) {
        setActiveIndex(-1);
      }
      return;
    }

    const nextHighlightKey = [
      searchQuery,
      caseSensitive ? '1' : '0',
      useRegex ? '1' : '0',
      wholeWord ? '1' : '0',
      documentRevision
    ].join('|');

    if (highlightKeyRef.current !== nextHighlightKey) {
      matchesRef.current = performChatHighlight(container, searchQuery, caseSensitive, useRegex, wholeWord);
      highlightKeyRef.current = nextHighlightKey;

      if (matchCount !== matchesRef.current.length) {
        setMatchCount(matchesRef.current.length);
      }

      const nextActiveIndex = matchesRef.current.length <= 0
        ? -1
        : Math.min(Math.max(activeIndex, 0), matchesRef.current.length - 1);

      if (activeIndex !== nextActiveIndex) {
        setActiveIndex(nextActiveIndex);
        return;
      }
    }

    matchesRef.current.forEach((span) => span.classList.remove('active'));
    if (activeIndex >= 0 && activeIndex < matchesRef.current.length) {
      const activeSpan = matchesRef.current[activeIndex];
      activeSpan.classList.add('active');
      activeSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [
    activeIndex,
    caseSensitive,
    documentRevision,
    isFindOpen,
    matchCount,
    scrollRef,
    searchQuery,
    setActiveIndex,
    setMatchCount,
    useRegex,
    wholeWord
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (isFindShortcut) {
        event.preventDefault();
        storeRef.current.getState().openFind();
        focusFindInput();
        return;
      }

      if (event.key === 'Escape' && storeRef.current.getState().isFindOpen) {
        event.preventDefault();
        storeRef.current.getState().closeFind();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const openFindAndFocus = () => {
    openFind();
    focusFindInput();
  };

  const selectNextMatch = () => {
    if (matchCount === 0) {
      return;
    }

    setActiveIndex((previous) => (previous + 1) % matchCount);
  };

  const selectPreviousMatch = () => {
    if (matchCount === 0) {
      return;
    }

    setActiveIndex((previous) => (previous - 1 + matchCount) % matchCount);
  };

  return {
    activeIndex,
    caseSensitive,
    closeFind,
    isFindOpen,
    matchCount,
    openFind: openFindAndFocus,
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
