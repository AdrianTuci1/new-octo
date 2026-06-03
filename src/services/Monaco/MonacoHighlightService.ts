import { colorizeMonacoText } from '../../lib/monacoHighlighter';

const highlightedLineCache = new Map<string, Promise<string>>();

function cacheKey(languageId: string, text: string) {
  return `${languageId}\u0000${text}`;
}

/**
 * MonacoHighlightService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Cache-Aside** (module-level Promise cache per key)
 * Offloads Monaco tokenization off-thread; deduplicates concurrent requests for the same (languageId, text).
 */
export class MonacoHighlightService {
  async colorizeCached(text: string, languageId: string): Promise<string> {
    const key = cacheKey(languageId, text);
    const existing = highlightedLineCache.get(key);
    if (existing) return existing;

    const promise = colorizeMonacoText(text, languageId)
      .catch(() => escapeHtml(text))
      .then((value) => value || '&nbsp;');

    highlightedLineCache.set(key, promise);
    return promise;
  }

  async colorizeLines(languageId: string, lines: string[]): Promise<string[]> {
    return Promise.all(lines.map((line) => this.colorizeCached(line, languageId)));
  }

  static getInstance(): MonacoHighlightService {
    if (!instance) {
      instance = new MonacoHighlightService();
    }
    return instance;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let instance: MonacoHighlightService | null = null;
