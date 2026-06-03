import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronRight, Copy, FileCode2, RefreshCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMonacoColorizedLines } from '../../../hooks/monacoColorizedLines';
import { getLanguageFromPath } from '../../../lib/fileLanguage';
import { useUIStore } from '../../../stores';
import type { GitWorktreeDiff, GitWorktreeDiffFile } from '../../../types/gitDiff';
import { DrawerHeader } from './DrawerHeader';
import './CodeReviewDrawer.css';

type CodeReviewDrawerProps = {
  workingDirectory: string | null;
};

export function CodeReviewDrawer({ workingDirectory }: CodeReviewDrawerProps) {
  const closeCodeReviewDrawer = useUIStore((state) => state.closeCodeReviewDrawer);
  const [diff, setDiff] = useState<GitWorktreeDiff | null>(null);
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workingDirectory) {
      setDiff(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const nextDiff = await invoke<GitWorktreeDiff>('terminal_get_worktree_diff', {
        request: { path: workingDirectory, includePatch: true }
      });
      setDiff(nextDiff);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setOpenPaths(new Set(diff?.files.map((file) => file.path) ?? []));
  }, [diff?.files]);

  const titleMeta = useMemo(() => {
    if (!diff?.isRepo) return 'No repository';
    const fileLabel = `${diff.files.length} ${diff.files.length === 1 ? 'file' : 'files'}`;
    return `${diff.repoName ?? 'Repository'} · ${fileLabel}`;
  }, [diff]);

  const copyFullDiff = () => {
    const patch = diff?.files.map((file) => file.patch).filter(Boolean).join('\n\n') ?? '';
    if (!patch) return;
    void navigator.clipboard?.writeText(patch).catch(() => {});
  };

  const togglePath = (path: string) => {
    setOpenPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="code-review-drawer">
      <DrawerHeader
        title="Code review"
        action={(
          <div className="drawer-header-action-group">
            <button
              className="drawer-header-action-button"
              type="button"
              aria-label="Refresh diff"
              title="Refresh diff"
              onClick={() => void refresh()}
            >
              <RefreshCcw size={16} />
            </button>
            <button
              className="drawer-header-action-button"
              type="button"
              aria-label="Close code review drawer"
              onClick={closeCodeReviewDrawer}
            >
              <X size={18} />
            </button>
          </div>
        )}
      />

      <div className="code-review-drawer-toolbar">
        <div className="code-review-repo-line">
          <FileCode2 size={16} />
          <span className="code-review-repo-name">{titleMeta}</span>
          {diff?.branch ? <span className="code-review-branch">{diff.branch}</span> : null}
        </div>
        {diff?.isRepo ? (
          <div className="code-review-stats">
            <span className="code-review-additions">+{diff.additions}</span>
            <span className="code-review-deletions">-{diff.deletions}</span>
            <button
              className="code-review-toolbar-button"
              type="button"
              onClick={copyFullDiff}
              disabled={!diff.files.some((file) => file.patch)}
              title="Copy full diff"
            >
              <Copy size={14} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="code-review-drawer-body">
        {isLoading && !diff ? (
          <div className="code-review-empty-state">Loading repository diff...</div>
        ) : error ? (
          <div className="code-review-empty-state error">{error}</div>
        ) : !diff?.isRepo ? (
          <div className="code-review-empty-state">Current tab is not inside a git repository.</div>
        ) : diff.files.length === 0 ? (
          <div className="code-review-empty-state">No uncommitted changes.</div>
        ) : (
          <div className="code-review-file-list">
            {diff.files.map((file) => (
              <DiffFileSection
                key={file.path}
                file={file}
                isOpen={openPaths.has(file.path)}
                onToggle={() => togglePath(file.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffFileSection({
  file,
  isOpen,
  onToggle
}: {
  file: GitWorktreeDiffFile;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const patch = file.patch ?? '';
  const language = useMemo(() => getLanguageFromPath(file.path), [file.path]);
  const patchLines = useMemo(() => patch.split('\n'), [patch]);
  const parsedLines = useMemo(() => patchLines.map(parsePatchLine), [patchLines]);
  const syntaxLineInputs = useMemo(
    () => parsedLines.map((line) => (line.kind === 'addition' || line.kind === 'deletion' || line.kind === 'context' ? line.content : line.raw)),
    [parsedLines]
  );
  const highlightedLines = useMonacoColorizedLines(language, syntaxLineInputs);

  const copyPatch = () => {
    if (!file.patch) return;
    void navigator.clipboard?.writeText(file.patch).catch(() => {});
  };

  return (
    <section className="code-review-file-section">
      <button className="code-review-file-header" type="button" onClick={onToggle}>
        <span className="code-review-file-chevron">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="code-review-file-path">{file.path}</span>
        <span className="code-review-file-status">{file.status}</span>
        <span className="code-review-file-count additions">+{file.additions}</span>
        <span className="code-review-file-count deletions">-{file.deletions}</span>
        <span
          className="code-review-file-action"
          role="button"
          tabIndex={0}
          title="Copy file diff"
          onClick={(event) => {
            event.stopPropagation();
            copyPatch();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              copyPatch();
            }
          }}
        >
          <Copy size={14} />
        </span>
      </button>
      {isOpen ? (
        patch.trim() ? (
          <div className="code-review-file-diff">
            <div className="code-review-diff-lines">
              {parsedLines.map((line, index) => {
                const isSyntaxLine = line.kind === 'addition' || line.kind === 'deletion' || line.kind === 'context';
                const highlighted = highlightedLines?.[index] ?? escapeHtml(line.content);
                return (
                  <div key={`${file.path}:${index}:${line.raw}`} className={`code-review-diff-line ${line.kind}`}>
                    <div className="code-review-diff-gutter">{index + 1}</div>
                    <div className={`code-review-diff-prefix ${line.kind}`}>{line.prefix}</div>
                    <div
                      className={`code-review-diff-content ${isSyntaxLine ? 'syntax' : ''}`}
                      dangerouslySetInnerHTML={{ __html: isSyntaxLine ? highlighted : escapeHtml(line.raw) }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="code-review-file-diff">
            <div className="code-review-empty-file">No text diff available for this file.</div>
          </div>
        )
      ) : null}
    </section>
  );
}

type PatchLineKind = 'addition' | 'deletion' | 'context' | 'hunk' | 'meta';

type ParsedPatchLine = {
  kind: PatchLineKind;
  raw: string;
  prefix: string;
  content: string;
};

function parsePatchLine(line: string): ParsedPatchLine {
  if (line.startsWith('@@')) {
    return { kind: 'hunk', raw: line, prefix: '', content: line };
  }

  if (
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode') ||
    line.startsWith('\\')
  ) {
    return { kind: 'meta', raw: line, prefix: '', content: line };
  }

  if (line.startsWith('+')) {
    return { kind: 'addition', raw: line, prefix: '+', content: line.slice(1) };
  }

  if (line.startsWith('-')) {
    return { kind: 'deletion', raw: line, prefix: '-', content: line.slice(1) };
  }

  if (line.startsWith(' ')) {
    return { kind: 'context', raw: line, prefix: ' ', content: line.slice(1) };
  }

  return { kind: 'context', raw: line, prefix: ' ', content: line };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}
