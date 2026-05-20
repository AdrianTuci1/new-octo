import { useEffect, useMemo, useState } from 'react';
import { colorizeMonacoText } from '../lib/monacoHighlighter';

const highlightedLineCache = new Map<string, Promise<string>>();

function cacheKey(languageId: string, text: string) {
  return `${languageId}\u0000${text}`;
}

function colorizeCached(text: string, languageId: string) {
  const key = cacheKey(languageId, text);
  const existing = highlightedLineCache.get(key);
  if (existing) {
    return existing;
  }

  const promise = colorizeMonacoText(text, languageId)
    .catch(() => escapeHtml(text))
    .then((value) => value || '&nbsp;');

  highlightedLineCache.set(key, promise);
  return promise;
}

export function useMonacoColorizedLines(languageId: string, lines: string[]) {
  const stableLines = useMemo(() => lines, [lines]);
  const [highlightedLines, setHighlightedLines] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHighlightedLines(null);

    void Promise.all(stableLines.map((line) => colorizeCached(line, languageId))).then((result) => {
      if (!cancelled) {
        setHighlightedLines(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [languageId, stableLines]);

  return highlightedLines;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
