import { invoke } from '@tauri-apps/api/core';
import { CloudOff, FolderPlus, Info, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMemoryStore } from '../../../../stores/memoryStore';
import type { CodeIndexProject, CodeIndexSearchResult } from '../../../../types/codeIndex';
import type { FilesystemPathContext } from '../../../../types/filesystem';
import { buildCodeSettingsValues, normalizeCodeSettings, type CodeSettings } from '../codeSettings';
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
  const [projects, setProjects] = useState<CodeIndexProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [indexingPath, setIndexingPath] = useState<string | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CodeIndexSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const nextProjects = await invoke<CodeIndexProject[]>('code_index_list_projects');
      setProjects(nextProjects);
    } catch (error) {
      console.warn('[settings] failed to load code index projects', error);
      setIndexError(String(error));
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || projects.length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void invoke<CodeIndexSearchResult[]>('code_index_search', {
        query,
        maxResults: 8
      })
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
          }
        })
        .catch((error) => {
          console.warn('[settings] failed to search code index', error);
          if (!cancelled) {
            setSearchResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearching(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [projects.length, searchQuery]);

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

    if (!path || projects.some((project) => project.path === path)) {
      return;
    }

    await indexPath(path);
  };

  const indexPath = async (path: string) => {
    setIndexError(null);
    setIndexingPath(path);
    try {
      await invoke<CodeIndexProject>('code_index_index_project', { path });
      await loadProjects();
    } catch (error) {
      console.warn('[settings] failed to index project', error);
      setIndexError(String(error));
      await loadProjects();
    } finally {
      setIndexingPath(null);
    }
  };

  const removeProject = async (projectId: string) => {
    setIndexError(null);
    try {
      await invoke('code_index_remove_project', { projectId });
      await loadProjects();
    } catch (error) {
      console.warn('[settings] failed to remove indexed project', error);
      setIndexError(String(error));
    }
  };

  return (
    <section className="settings-panel code-settings-panel">
      <div className="settings-panel-header">
        <h1>Codebase Indexing</h1>
      </div>

      <div className="settings-group code-settings-group">
        <CodeSettingsRow
          title="Codebase indexing"
          description="Octomus can automatically index code repositories as you navigate them, helping agents quickly understand context and provide solutions. Code is never stored on the server. If a codebase is unable to be indexed, Octomus can still navigate your codebase and gain insights via grep and find tool calling."
          action={<SettingsToggle checked={codeSettings.indexing.enabled} onChange={() => patchIndexing({ enabled: !codeSettings.indexing.enabled })} />}
        />

        <CodeSettingsRow
          title="Index new folders by default"
          description="When set to true, Octomus will automatically index code repositories as you navigate them - helping agents quickly understand context and provide targeted solutions."
          action={<SettingsToggle checked={codeSettings.indexing.indexNewFoldersByDefault} onChange={() => patchIndexing({ indexNewFoldersByDefault: !codeSettings.indexing.indexNewFoldersByDefault })} />}
        />
      </div>

      <div className="code-indexed-folders-header">
        <h2>Initialized / indexed folders</h2>
        <button className="code-outline-action" type="button" onClick={handleIndexNewFolder} disabled={Boolean(indexingPath) || !codeSettings.indexing.enabled}>
          <FolderPlus size={18} aria-hidden="true" />
          <span>{indexingPath ? 'Indexing...' : 'Index new folder'}</span>
        </button>
      </div>

      <label className="code-index-search">
        <Search size={15} aria-hidden="true" />
        <input
          value={searchQuery}
          placeholder="Search indexed code"
          onChange={(event) => setSearchQuery(event.target.value)}
          disabled={projects.length === 0}
        />
      </label>

      {indexError ? <div className="code-index-error">{indexError}</div> : null}

      {searchQuery.trim() ? (
        <div className="code-index-search-results">
          <div className="code-index-search-title">
            {isSearching ? 'Searching...' : `${searchResults.length} indexed result${searchResults.length === 1 ? '' : 's'}`}
          </div>
          {searchResults.map((result) => (
            <div key={`${result.projectId}-${result.path}`} className="code-index-search-result">
              <div className="code-index-result-path">{result.relativePath}</div>
              <div className="code-index-result-meta">{result.projectName} · {result.language} · score {result.score}</div>
              {result.snippet ? <div className="code-index-result-snippet">{result.snippet}</div> : null}
            </div>
          ))}
          {!isSearching && searchResults.length === 0 ? <p className="code-empty-copy compact">No indexed matches found.</p> : null}
        </div>
      ) : null}

      {projects.length > 0 ? (
        <div className="code-indexed-folder-list">
          {projects.map((project) => (
            <div className="code-indexed-folder-item" key={project.id}>
              <div>
                <div className="code-indexed-folder-path">{project.path}</div>
                <div className="code-indexed-folder-meta">
                  {project.status === 'indexed' ? 'Indexed' : project.status === 'failed' ? 'Failed' : 'Indexing'} · {project.fileCount.toLocaleString()} files · {formatBytes(project.totalBytes)} · {formatIndexedAt(project.lastIndexedAt)}
                  {project.error ? ` · ${project.error}` : ''}
                </div>
              </div>
              <div className="code-index-folder-actions">
                <button className="code-folder-remove" type="button" onClick={() => indexPath(project.path)} disabled={Boolean(indexingPath)}>
                  <RefreshCw size={14} />
                  <span>Reindex</span>
                </button>
                <button className="code-folder-remove" type="button" onClick={() => removeProject(project.id)} disabled={Boolean(indexingPath)}>
                  <Trash2 size={14} />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : isLoadingProjects ? (
        <p className="code-empty-copy">Loading indexed folders...</p>
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
              minWidth={220}
              value={codeSettings.editor.fileLinksEditor}
              options={[
                { value: 'Default App', label: 'Default App' },
                { value: 'Warp', label: 'Octomus' }
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
              minWidth={220}
              value={codeSettings.editor.codeReviewEditor}
              options={[
                { value: 'Warp', label: 'Octomus' },
                { value: 'Default App', label: 'Default App' }
              ]}
              onChange={(value) => patchEditor({ codeReviewEditor: value as CodeSettings['editor']['codeReviewEditor'] })}
            />
          )}
        />

        <CodeSettingsRow
          title="Choose a layout to open files in Octomus"
          action={(
            <SettingsSelect
              minWidth={220}
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
              Open Markdown files in Octomus's Markdown Viewer by default
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

function formatIndexedAt(value?: string | null) {
  if (!value) return 'never';
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

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}
