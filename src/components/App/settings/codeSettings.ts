import type { MemorySettingsValues } from '../../../types/memory';

export type CodeSettings = {
  indexing: {
    enabled: boolean;
    indexNewFoldersByDefault: boolean;
  };
  editor: {
    fileLinksEditor: 'Default App' | 'Warp';
    codeReviewEditor: 'Default App' | 'Warp';
    warpOpenLayout: 'Split Pane' | 'Current Pane' | 'New Tab';
    groupFilesIntoSingleEditorPane: boolean;
    openMarkdownInViewer: boolean;
    autoOpenCodeReviewPanel: boolean;
    showCodeReviewButton: boolean;
    showDiffStatsOnCodeReviewButton: boolean;
    projectExplorer: boolean;
    globalFileSearch: boolean;
  };
};

export const DEFAULT_CODE_SETTINGS: CodeSettings = {
  indexing: {
    enabled: true,
    indexNewFoldersByDefault: false
  },
  editor: {
    fileLinksEditor: 'Default App',
    codeReviewEditor: 'Warp',
    warpOpenLayout: 'Split Pane',
    groupFilesIntoSingleEditorPane: true,
    openMarkdownInViewer: true,
    autoOpenCodeReviewPanel: false,
    showCodeReviewButton: true,
    showDiffStatsOnCodeReviewButton: true,
    projectExplorer: true,
    globalFileSearch: true
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizeCodeSettings(values?: MemorySettingsValues | null): CodeSettings {
  const rawCode = isRecord(values?.code) ? values.code : {};
  const rawIndexing = isRecord(rawCode.indexing) ? rawCode.indexing : {};
  const rawEditor = isRecord(rawCode.editor) ? rawCode.editor : {};

  return {
    indexing: {
      enabled: booleanValue(rawIndexing.enabled, DEFAULT_CODE_SETTINGS.indexing.enabled),
      indexNewFoldersByDefault: booleanValue(rawIndexing.indexNewFoldersByDefault, DEFAULT_CODE_SETTINGS.indexing.indexNewFoldersByDefault)
    },
    editor: {
      fileLinksEditor: stringValue(rawEditor.fileLinksEditor, ['Default App', 'Warp'] as const, DEFAULT_CODE_SETTINGS.editor.fileLinksEditor),
      codeReviewEditor: stringValue(rawEditor.codeReviewEditor, ['Default App', 'Warp'] as const, DEFAULT_CODE_SETTINGS.editor.codeReviewEditor),
      warpOpenLayout: stringValue(rawEditor.warpOpenLayout, ['Split Pane', 'Current Pane', 'New Tab'] as const, DEFAULT_CODE_SETTINGS.editor.warpOpenLayout),
      groupFilesIntoSingleEditorPane: booleanValue(rawEditor.groupFilesIntoSingleEditorPane, DEFAULT_CODE_SETTINGS.editor.groupFilesIntoSingleEditorPane),
      openMarkdownInViewer: booleanValue(rawEditor.openMarkdownInViewer, DEFAULT_CODE_SETTINGS.editor.openMarkdownInViewer),
      autoOpenCodeReviewPanel: booleanValue(rawEditor.autoOpenCodeReviewPanel, DEFAULT_CODE_SETTINGS.editor.autoOpenCodeReviewPanel),
      showCodeReviewButton: booleanValue(rawEditor.showCodeReviewButton, DEFAULT_CODE_SETTINGS.editor.showCodeReviewButton),
      showDiffStatsOnCodeReviewButton: booleanValue(rawEditor.showDiffStatsOnCodeReviewButton, DEFAULT_CODE_SETTINGS.editor.showDiffStatsOnCodeReviewButton),
      projectExplorer: booleanValue(rawEditor.projectExplorer, DEFAULT_CODE_SETTINGS.editor.projectExplorer),
      globalFileSearch: booleanValue(rawEditor.globalFileSearch, DEFAULT_CODE_SETTINGS.editor.globalFileSearch)
    }
  };
}

export function buildCodeSettingsValues(code: CodeSettings): MemorySettingsValues {
  return { code };
}
