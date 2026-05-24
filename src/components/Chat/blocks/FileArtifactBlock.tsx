import { DiffEditor } from '@monaco-editor/react';
import { Check, ChevronDown, FileCode2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { applyFileDiffToContent, getFileDiffBaseContent, type FileDiffPreviewStatus } from '../../../lib/fileDiffs';
import type { FileDiff } from '../../../types/diff';
import { getLanguageFromPath } from '../../../lib/fileLanguage';
import { configureWarpDarkTheme } from '../../Editor/monacoTheme';
import './TerminalBlockSummary.css';
import './FileArtifactBlock.css';

export type FileArtifactBlockProps = {
  diffs: FileDiff[];
  status?: FileDiffPreviewStatus;
};

function fileNameFromPath(path: string) {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalized.split('/').pop() || normalized;
}

export function FileArtifactBlock({
  diffs,
  status = 'pending'
}: FileArtifactBlockProps) {
  const [isExpanded, setIsExpanded] = useState(status !== 'rejected');
  const [activeDiffIndex, setActiveDiffIndex] = useState(0);
  const activeDiff = diffs[activeDiffIndex] ?? diffs[0];
  const path = activeDiff?.filePath ?? '';
  const language = useMemo(() => getLanguageFromPath(path), [path]);
  const originalCode = useMemo(
    () => (activeDiff ? getFileDiffBaseContent(activeDiff) : ''),
    [activeDiff]
  );
  const code = useMemo(
    () => (activeDiff ? applyFileDiffToContent(originalCode, activeDiff) : ''),
    [activeDiff, originalCode]
  );

  useEffect(() => {
    setActiveDiffIndex((current) => {
      if (diffs.length === 0) {
        return 0;
      }
      return Math.min(current, diffs.length - 1);
    });
  }, [diffs]);

  const title = useMemo(() => {
    if (diffs.length > 1) {
      if (status === 'accepted') {
        return `Created ${diffs.length} files`;
      }
      if (status === 'rejected') {
        return `Files not created`;
      }
      return `Proposed ${diffs.length} files`;
    }

    const fileName = fileNameFromPath(path || 'file');
    if (status === 'accepted') {
      return `Created ${fileName}`;
    }
    if (status === 'rejected') {
      return `File not created`;
    }
    return `Proposed ${fileName}`;
  }, [diffs.length, path, status]);

  const StatusIcon = status === 'accepted'
    ? Check
    : status === 'rejected'
      ? X
      : FileCode2;

  return (
    <div className={`file-artifact-container ${status} ${isExpanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="terminal-block-summary file-artifact-header"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="terminal-summary-icon file-artifact-icon">
          <StatusIcon size={14} />
        </span>
        <span className="terminal-summary-command file-artifact-title">
          {title}
        </span>
        <div className="terminal-summary-chevron file-artifact-meta">
          <ChevronDown
            size={14}
            className={`file-artifact-chevron ${isExpanded ? 'expanded' : ''}`}
          />
        </div>
      </button>

      {isExpanded && activeDiff && (
        <div className="file-artifact-body">
          {diffs.length > 1 ? (
            <div className="file-artifact-tabs" role="tablist" aria-label="Files">
              {diffs.map((diff, index) => {
                const label = fileNameFromPath(diff.filePath);
                return (
                  <button
                    key={`${diff.filePath}-${index}`}
                    type="button"
                    className={`file-artifact-tab ${index === activeDiffIndex ? 'active' : ''}`}
                    onClick={() => setActiveDiffIndex(index)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="file-artifact-path">{path}</div>
          <div className="file-artifact-editor-shell">
            <DiffEditor
              key={`${path}:${status}`}
              height="320px"
              language={language}
              original={originalCode}
              modified={code}
              onMount={(_editor, monaco) => {
                configureWarpDarkTheme(monaco);
              }}
              options={{
                readOnly: true,
                domReadOnly: true,
                renderSideBySide: false,
                compactMode: true,
                originalEditable: false,
                diffWordWrap: 'on',
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                scrollBeyondLastLine: false,
                renderIndicators: false,
                renderMarginRevertIcon: false,
                renderGutterMenu: false,
                renderOverviewRuler: false,
                glyphMargin: false,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 2,
                renderLineHighlight: 'none',
                cursorStyle: 'line-thin',
                cursorBlinking: 'solid',
                scrollbar: {
                  vertical: 'visible',
                  horizontal: 'visible',
                  useShadows: false,
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10,
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
