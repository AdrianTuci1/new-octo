import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronRight, Copy, FileCode2, RefreshCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUIStore } from '../../../stores';
import type { GitWorktreeDiff, GitWorktreeDiffFile } from '../../../types/gitDiff';
import { DrawerHeader } from './DrawerHeader';
import './CodeReviewDrawer.css';

type CodeReviewDrawerProps = {
  workingDirectory: string | null;
};

type RenderedDiffLine = {
  key: string;
  kind: 'addition' | 'deletion' | 'context' | 'hunk' | 'meta';
  lineNumber: string;
  prefix: string;
  content: string;
};

const MAX_DEFAULT_RENDERED_LINES = 260;

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
  const lines = useMemo(() => parseUnifiedDiff(file.patch), [file.patch]);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const renderedLines = showFullDiff ? lines : lines.slice(0, MAX_DEFAULT_RENDERED_LINES);
  const isTruncated = !showFullDiff && lines.length > MAX_DEFAULT_RENDERED_LINES;

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
        <div className="code-review-file-diff">
          {renderedLines.length > 0 ? renderedLines.map((line) => (
            <div key={line.key} className={`code-review-diff-line ${line.kind}`}>
              <span className="code-review-diff-gutter">{line.lineNumber}</span>
              <span className="code-review-diff-prefix">{line.prefix}</span>
              <code className="code-review-diff-content">{line.content || ' '}</code>
            </div>
          )) : (
            <div className="code-review-empty-file">No text diff available for this file.</div>
          )}
          {isTruncated ? (
            <button
              className="code-review-show-full"
              type="button"
              onClick={() => setShowFullDiff(true)}
            >
              Show full diff ({lines.length - MAX_DEFAULT_RENDERED_LINES} more lines)
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function parseUnifiedDiff(patch: string): RenderedDiffLine[] {
  if (!patch.trim()) return [];

  let oldLine = 0;
  let newLine = 0;
  let sequence = 0;

  return patch
    .split('\n')
    .flatMap<RenderedDiffLine>((line) => {
      sequence += 1;

      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file mode') || line.startsWith('deleted file mode')) {
        return [];
      }

      if (line.startsWith('--- ') || line.startsWith('+++ ')) {
        return [{
          key: `${sequence}:meta`,
          kind: 'meta' as const,
          lineNumber: '',
          prefix: '',
          content: line
        }];
      }

      if (line.startsWith('@@')) {
        const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLine = Number(match[1]);
          newLine = Number(match[2]);
        }
        return [{
          key: `${sequence}:hunk`,
          kind: 'hunk' as const,
          lineNumber: '',
          prefix: '',
          content: line
        }];
      }

      if (line.startsWith('+')) {
        const rendered = {
          key: `${sequence}:add`,
          kind: 'addition' as const,
          lineNumber: String(newLine),
          prefix: '+',
          content: line.slice(1)
        };
        newLine += 1;
        return [rendered];
      }

      if (line.startsWith('-')) {
        const rendered = {
          key: `${sequence}:del`,
          kind: 'deletion' as const,
          lineNumber: String(oldLine),
          prefix: '-',
          content: line.slice(1)
        };
        oldLine += 1;
        return [rendered];
      }

      if (line.startsWith('\\')) {
        return [{
          key: `${sequence}:meta-note`,
          kind: 'meta' as const,
          lineNumber: '',
          prefix: '',
          content: line
        }];
      }

      const rendered = {
        key: `${sequence}:ctx`,
        kind: 'context' as const,
        lineNumber: newLine > 0 ? String(newLine) : oldLine > 0 ? String(oldLine) : '',
        prefix: ' ',
        content: line.startsWith(' ') ? line.slice(1) : line
      };
      oldLine += oldLine > 0 ? 1 : 0;
      newLine += newLine > 0 ? 1 : 0;
      return [rendered];
    });
}
