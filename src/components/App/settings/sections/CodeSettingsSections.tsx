import { invoke } from '@tauri-apps/api/core';
import { CloudOff, FolderPlus, Info } from 'lucide-react';
import { useMemoryStore } from '../../../../stores/memoryStore';
import type { FilesystemPathContext } from '../../../../types/filesystem';
import { buildCodeSettingsValues, normalizeCodeSettings, type CodeIndexedFolder, type CodeSettings } from '../codeSettings';
import { SettingsSelect, SettingsToggle } from './SettingsPrimitives';
import './CodeSettingsSections.css';

function CodeSettingsRow({
  title,
  description,
  action
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="settings-row code-settings-row">
      <div className="settings-row-info">
        <div className="settings-row-title">{title}</div>
        {description ? <div className="settings-row-description">{description}</div> : null}
      </div>
      {action ? <div className="settings-row-action">{action}</div> : null}
    </div>
  );
}

export function CodebaseIndexingSection() {
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const codeSettings = normalizeCodeSettings(settings?.values);

  const saveCodeSettings = (nextSettings: CodeSettings) => {
    void saveSettings(buildCodeSettingsValues(nextSettings), true);
  };

  const patchIndexing = (patch: Partial<CodeSettings['indexing']>) => {
    saveCodeSettings({
      ...codeSettings,
      indexing: {
        ...codeSettings.indexing,
        ...patch
      }
    });
  };

  const handleIndexNewFolder = async () => {
    const rememberedDirectory = typeof settings?.values.lastWorkingDirectory === 'string'
      ? settings.values.lastWorkingDirectory.trim()
      : '';
    let path = rememberedDirectory;

    if (!path) {
      try {
        const context = await invoke<FilesystemPathContext>('terminal_get_path_context');
        path = context.currentDir || context.homeDir || '';
      } catch (error) {
        console.warn('[settings] failed to resolve folder for indexing', error);
      }
    }

    if (!path || codeSettings.indexing.indexedFolders.some((folder) => folder.path === path)) {
      return;
    }

    const nextFolder: CodeIndexedFolder = {
      id: `indexed_${Date.now()}`,
      path,
      status: codeSettings.indexing.enabled ? 'indexed' : 'disabled',
      lastIndexedAt: new Date().toISOString()
    };

    patchIndexing({
      indexedFolders: [...codeSettings.indexing.indexedFolders, nextFolder]
    });
  };

  return (
    <section className="settings-panel code-settings-panel">
      <div className="settings-panel-header">
        <h1>Codebase Indexing</h1>
      </div>

      <div className="settings-group code-settings-group">
        <CodeSettingsRow
          title="Codebase indexing"
          description="Warp can automatically index code repositories as you navigate them, helping agents quickly understand context and provide solutions. Code is never stored on the server. If a codebase is unable to be indexed, Warp can still navigate your codebase and gain insights via grep and find tool calling."
          action={<SettingsToggle checked={codeSettings.indexing.enabled} onChange={() => patchIndexing({ enabled: !codeSettings.indexing.enabled })} />}
        />

        <CodeSettingsRow
          title="Index new folders by default"
          description="When set to true, Warp will automatically index code repositories as you navigate them - helping agents quickly understand context and provide targeted solutions."
          action={<SettingsToggle checked={codeSettings.indexing.indexNewFoldersByDefault} onChange={() => patchIndexing({ indexNewFoldersByDefault: !codeSettings.indexing.indexNewFoldersByDefault })} />}
        />
      </div>

      <div className="code-indexed-folders-header">
        <h2>Initialized / indexed folders</h2>
        <button className="code-outline-action" type="button" onClick={handleIndexNewFolder}>
          <FolderPlus size={18} aria-hidden="true" />
          <span>Index new folder</span>
        </button>
      </div>

      {codeSettings.indexing.indexedFolders.length > 0 ? (
        <div className="code-indexed-folder-list">
          {codeSettings.indexing.indexedFolders.map((folder) => (
            <div className="code-indexed-folder-item" key={folder.id}>
              <div>
                <div className="code-indexed-folder-path">{folder.path}</div>
                <div className="code-indexed-folder-meta">
                  {folder.status === 'indexed' ? 'Indexed' : folder.status === 'queued' ? 'Queued' : 'Disabled'} · {formatIndexedAt(folder.lastIndexedAt)}
                </div>
              </div>
              <button
                className="code-folder-remove"
                type="button"
                onClick={() => patchIndexing({
                  indexedFolders: codeSettings.indexing.indexedFolders.filter((item) => item.id !== folder.id)
                })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="code-empty-copy">No folders have been initialized yet.</p>
      )}
    </section>
  );
}

export function EditorCodeReviewSection() {
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const codeSettings = normalizeCodeSettings(settings?.values);

  const saveCodeSettings = (nextSettings: CodeSettings) => {
    void saveSettings(buildCodeSettingsValues(nextSettings), true);
  };

  const patchEditor = (patch: Partial<CodeSettings['editor']>) => {
    saveCodeSettings({
      ...codeSettings,
      editor: {
        ...codeSettings.editor,
        ...patch
      }
    });
  };

  return (
    <section className="settings-panel code-settings-panel code-editor-panel">
      <div className="settings-panel-header">
        <h1>Editor and Code Review</h1>
      </div>

      <div className="settings-group code-settings-group">
        <CodeSettingsRow
          title={(
            <>
              Choose an editor to open file links
              <CloudOff size={15} className="code-muted-icon" aria-hidden="true" />
            </>
          )}
          action={(
            <SettingsSelect
              minWidth={250}
              value={codeSettings.editor.fileLinksEditor}
              options={[
                { value: 'Default App', label: 'Default App' },
                { value: 'Warp', label: 'Warp' }
              ]}
              onChange={(value) => patchEditor({ fileLinksEditor: value as CodeSettings['editor']['fileLinksEditor'] })}
            />
          )}
        />

        <CodeSettingsRow
          title={(
            <>
              Choose an editor to open files from the code review panel, project explorer, and global search
              <CloudOff size={15} className="code-muted-icon" aria-hidden="true" />
            </>
          )}
          action={(
            <SettingsSelect
              minWidth={250}
              value={codeSettings.editor.codeReviewEditor}
              options={[
                { value: 'Warp', label: 'Warp' },
                { value: 'Default App', label: 'Default App' }
              ]}
              onChange={(value) => patchEditor({ codeReviewEditor: value as CodeSettings['editor']['codeReviewEditor'] })}
            />
          )}
        />

        <CodeSettingsRow
          title="Choose a layout to open files in Warp"
          action={(
            <SettingsSelect
              minWidth={250}
              value={codeSettings.editor.warpOpenLayout}
              options={[
                { value: 'Split Pane', label: 'Split Pane' },
                { value: 'Current Pane', label: 'Current Pane' },
                { value: 'New Tab', label: 'New Tab' }
              ]}
              onChange={(value) => patchEditor({ warpOpenLayout: value as CodeSettings['editor']['warpOpenLayout'] })}
            />
          )}
        />

        <CodeSettingsRow
          title="Group files into single editor pane"
          description="When this setting is on, any files opened in the same tab will be automatically grouped into a single editor pane."
          action={<SettingsToggle checked={codeSettings.editor.groupFilesIntoSingleEditorPane} onChange={() => patchEditor({ groupFilesIntoSingleEditorPane: !codeSettings.editor.groupFilesIntoSingleEditorPane })} />}
        />

        <CodeSettingsRow
          title={(
            <>
              Open Markdown files in Warp's Markdown Viewer by default
              <Info size={15} className="code-info-icon" aria-hidden="true" />
            </>
          )}
          action={<SettingsToggle checked={codeSettings.editor.openMarkdownInViewer} onChange={() => patchEditor({ openMarkdownInViewer: !codeSettings.editor.openMarkdownInViewer })} />}
        />

        <CodeSettingsRow
          title="Auto open code review panel"
          description="When this setting is on, the code review panel will open on the first accepted diff of a conversation"
          action={<SettingsToggle checked={codeSettings.editor.autoOpenCodeReviewPanel} onChange={() => patchEditor({ autoOpenCodeReviewPanel: !codeSettings.editor.autoOpenCodeReviewPanel })} />}
        />

        <CodeSettingsRow
          title="Show code review button"
          description="Show a button in the top right of the window to toggle the code review panel."
          action={<SettingsToggle checked={codeSettings.editor.showCodeReviewButton} onChange={() => patchEditor({ showCodeReviewButton: !codeSettings.editor.showCodeReviewButton })} />}
        />

        <CodeSettingsRow
          title="Show diff stats on code review button"
          description="Show lines added and removed counts on the code review button."
          action={<SettingsToggle checked={codeSettings.editor.showDiffStatsOnCodeReviewButton} onChange={() => patchEditor({ showDiffStatsOnCodeReviewButton: !codeSettings.editor.showDiffStatsOnCodeReviewButton })} />}
        />

        <CodeSettingsRow
          title="Project explorer"
          description="Adds an IDE-style project explorer / file tree to the left side tools panel."
          action={<SettingsToggle checked={codeSettings.editor.projectExplorer} onChange={() => patchEditor({ projectExplorer: !codeSettings.editor.projectExplorer })} />}
        />

        <CodeSettingsRow
          title="Global file search"
          description="Adds global file search to the left side tools panel."
          action={<SettingsToggle checked={codeSettings.editor.globalFileSearch} onChange={() => patchEditor({ globalFileSearch: !codeSettings.editor.globalFileSearch })} />}
        />
      </div>
    </section>
  );
}

function formatIndexedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'just now';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
