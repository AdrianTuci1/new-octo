import type { RefObject } from 'react';

export function requestComposerInputSelection(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  caret: number,
  focus = false
) {
  requestAnimationFrame(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    if (focus) {
      input.focus({ preventScroll: true });
    }

    try {
      input.setSelectionRange(caret, caret);
    } catch {
      // Ignore selection errors in browsers that reject programmatic ranges.
    }
  });
}
