import { useLayoutEffect, useRef } from 'react';

type UseComposerBarOptions = {
  autoFocus?: boolean;
};

export function useComposerBar(
  query: string,
  onHeightChange?: (height: number) => void,
  options: UseComposerBarOptions = {}
) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const autoFocus = options.autoFocus ?? false;

  useLayoutEffect(() => {
    if (!autoFocus) return;

    const element = inputRef.current;
    if (!element) return;

    const rafId = window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      const valueLength = element.value.length;
      try {
        element.setSelectionRange(valueLength, valueLength);
      } catch {
        // Some browsers / input states can reject selection changes; ignore.
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [autoFocus]);

  // Auto-resize textarea
  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    
    if (query === '') {
      element.style.height = '';
      return;
    }
 
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [query]);

  // Notify height changes to parent
  useLayoutEffect(() => {
    if (!onHeightChange) return;

    const element = shellRef.current;
    if (!element) return;

    const updateHeight = () => {
      onHeightChange(Math.ceil(element.getBoundingClientRect().height));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => observer.disconnect();
  }, [onHeightChange]);

  return { inputRef, shellRef };
}
