import * as monaco from 'monaco-editor';
import { configureWarpDarkTheme } from '../components/Editor/monacoTheme';

type MonacoLanguageLoader = () => Promise<unknown>;

const languageLoaders: Record<string, MonacoLanguageLoader> = {
  css: () => import('monaco-editor/esm/vs/basic-languages/css/css.contribution'),
  go: () => import('monaco-editor/esm/vs/basic-languages/go/go.contribution'),
  html: () => import('monaco-editor/esm/vs/basic-languages/html/html.contribution'),
  javascript: () => import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'),
  json: () => import('monaco-editor/esm/vs/language/json/monaco.contribution'),
  markdown: () => import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'),
  plaintext: () => Promise.resolve(),
  python: () => import('monaco-editor/esm/vs/basic-languages/python/python.contribution'),
  rust: () => import('monaco-editor/esm/vs/basic-languages/rust/rust.contribution'),
  shell: () => import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution'),
  typescript: () => import('monaco-editor/esm/vs/language/typescript/monaco.contribution'),
  yaml: () => import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution')
};

const loadedLanguages = new Set<string>();
let bootstrapPromise: Promise<void> | null = null;

async function bootstrapMonaco() {
  configureWarpDarkTheme(monaco);
}

async function ensureLanguage(languageId: string) {
  const normalized = languageId || 'plaintext';
  if (loadedLanguages.has(normalized)) {
    return;
  }

  const loader = languageLoaders[normalized] ?? languageLoaders.plaintext;
  await loader();
  loadedLanguages.add(normalized);
}

export async function ensureMonacoHighlighter(languageId: string) {
  bootstrapPromise ??= bootstrapMonaco();
  await bootstrapPromise;
  await ensureLanguage(languageId);
}

export async function colorizeMonacoText(text: string, languageId: string, tabSize = 2) {
  await ensureMonacoHighlighter(languageId);
  return monaco.editor.colorize(text, languageId || 'plaintext', { tabSize });
}
