import { Code2, MoreHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditorStore } from '../../stores/editorStore';
import { MonacoEditor } from './MonacoEditor';
import './Editor.css';

type MarkdownViewMode = 'rendered' | 'raw';

export function EditorWorkspace() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeAllTabs } = useEditorStore();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const isArtifactMarkdownMode = activeTab?.presentation === 'artifact-markdown' && activeTab.language === 'markdown';
  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>('rendered');

  useEffect(() => {
    if (isArtifactMarkdownMode) {
      setMarkdownViewMode('rendered');
      return;
    }

    setMarkdownViewMode('raw');
  }, [activeTabId, isArtifactMarkdownMode]);

  const markdownTitle = useMemo(() => {
    if (!activeTab) {
      return '';
    }

    return extractMarkdownTitle(activeTab.content, activeTab.name);
  }, [activeTab]);

  return (
    <div className="editor-workspace">
      {activeTab && (
        isArtifactMarkdownMode ? (
          <header className="editor-chrome editor-chrome-markdown">
            <div className="editor-markdown-title" title={markdownTitle}>{markdownTitle}</div>
            <div className="editor-markdown-actions">
              <div className="editor-markdown-mode-toggle" role="tablist" aria-label="Markdown mode">
                <button
                  type="button"
                  className={`editor-markdown-mode-btn ${markdownViewMode === 'rendered' ? 'active' : ''}`}
                  onClick={() => setMarkdownViewMode('rendered')}
                >
                  Rendered
                </button>
                <button
                  type="button"
                  className={`editor-markdown-mode-btn ${markdownViewMode === 'raw' ? 'active' : ''}`}
                  onClick={() => setMarkdownViewMode('raw')}
                >
                  Raw
                </button>
              </div>
              <button
                type="button"
                className="editor-chrome-action"
                aria-label="Close markdown view"
                onClick={() => closeTab(activeTab.id)}
              >
                <X size={14} />
              </button>
            </div>
          </header>
        ) : (
          <header className="editor-chrome editor-chrome-files">
            <div className="editor-file-tabs" role="tablist" aria-label="Open files">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`editor-file-tab ${activeTabId === tab.id ? 'active' : ''}`}
                  title={tab.name}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="editor-file-tab-name">{tab.name}</span>
                  {tab.isDirty && <span className="editor-file-tab-dirty" />}
                  <button
                    type="button"
                    className="editor-file-tab-close"
                    aria-label={`Close ${tab.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X size={12} />
                  </button>
                </button>
              ))}
            </div>

            <div className="editor-file-actions">
              <button
                type="button"
                className="editor-chrome-action"
                aria-label="More file actions"
                title="More file actions"
              >
                <MoreHorizontal size={14} />
              </button>
              <button
                type="button"
                className="editor-chrome-action"
                aria-label="Close file view"
                onClick={closeAllTabs}
              >
                <X size={14} />
              </button>
            </div>
          </header>
        )
      )}

      <div className="editor-container">
        {activeTab ? (
          isArtifactMarkdownMode && markdownViewMode === 'rendered' ? (
            <div className="editor-markdown-preview-shell">
              <div className="editor-markdown-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {activeTab.content || ''}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <MonacoEditor
              key={activeTab.id}
              tabId={activeTab.id}
              path={activeTab.path}
              content={activeTab.content || ''}
              language={activeTab.language || 'plaintext'}
              readOnly={activeTab.readOnly}
            />
          )
        ) : (
          <div className="editor-empty">
            <Code2 size={64} className="editor-empty-icon" />
            <div className="editor-empty-text">Select a file to edit</div>
          </div>
        )}
      </div>
    </div>
  );
}

function extractMarkdownTitle(content: string | undefined, fallback: string) {
  if (!content) {
    return fallback;
  }

  const headingLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));

  if (!headingLine) {
    return fallback;
  }

  return headingLine.replace(/^#\s+/, '').trim() || fallback;
}
