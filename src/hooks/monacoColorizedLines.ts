import { useEffect, useMemo, useState } from 'react';
import { MonacoHighlightService } from '../services/Monaco/MonacoHighlightService';

export function useMonacoColorizedLines(languageId: string, lines: string[]) {
  const stableLines = useMemo(() => lines, [lines]);
  const [highlightedLines, setHighlightedLines] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHighlightedLines(null);

    void MonacoHighlightService.getInstance()
      .colorizeLines(languageId, stableLines)
      .then((result) => {
        if (!cancelled) setHighlightedLines(result);
      });

    return () => { cancelled = true; };
  }, [languageId, stableLines]);

  return highlightedLines;
}
