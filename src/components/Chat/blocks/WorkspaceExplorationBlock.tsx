import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../../../stores/editorStore';
import type {
  WorkspaceExplorationArtifact,
  WorkspaceExplorationEntry,
  WorkspaceExplorationSegment
} from '../../../types/chat';
import './WorkspaceExplorationBlock.css';

type WorkspaceExplorationBlockProps = {
  exploration: WorkspaceExplorationArtifact;
  isStreaming?: boolean;
};

function fileNameFromPath(path: string) {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalized.split('/').pop() || normalized;
}

async function openWorkspaceFile(path: string) {
  try {
    const content = await invoke<string>('terminal_read_file', {
      request: { path }
    });
    useEditorStore.getState().openFile(path, fileNameFromPath(path), content);
  } catch (error) {
    console.warn('[chat] failed to open workspace exploration file', { path, error });
  }
}

function buildFallbackSegment(exploration: WorkspaceExplorationArtifact): WorkspaceExplorationSegment | null {
  const entries: WorkspaceExplorationEntry[] = [];
  const createdAt = new Date().toISOString();
  const searches = exploration.searches ?? [];
  const files = exploration.files ?? [];

  searches.forEach((search, index) => {
    entries.push({
      id: `workspace-exploration-search-${index}`,
      kind: 'search',
      text: search.mode === 'list'
        ? `Listed ${search.path || '.'}`
        : `Searched for ${search.query}`,
      detail: search.mode === 'list'
        ? `${search.resultCount} entr${search.resultCount === 1 ? 'y' : 'ies'}`
        : `in ${search.source === 'code-index' ? 'code index' : 'workspace files'} (${search.resultCount} match${search.resultCount === 1 ? '' : 'es'})`,
      createdAt
    });
  });

  files.forEach((file, index) => {
    entries.push({
      id: `workspace-exploration-file-${index}`,
      kind: 'read',
      text: `Read ${fileNameFromPath(file.path)}`,
      detail: file.snippet?.trim() || undefined,
      path: file.path,
      createdAt
    });
  });

  if (entries.length === 0 && !exploration.summary?.trim()) {
    return null;
  }

  return {
    id: 'workspace-exploration-fallback',
    createdAt: new Date().toISOString(),
    summary: exploration.summary?.trim() || undefined,
    entries,
    searches,
    files,
    directories: []
  };
}

function formatSearchSummary(exploration: WorkspaceExplorationArtifact) {
  const fileCount = exploration.segments?.length > 0
    ? exploration.segments.reduce((total, segment) => total + (segment.files?.length ?? 0), 0)
    : exploration.files?.length ?? 0;
  const searchCount = exploration.segments?.length > 0
    ? exploration.segments.reduce((total, segment) => total + (segment.searches?.length ?? 0), 0)
    : exploration.searches?.length ?? 0;

  if (fileCount === 0 && searchCount === 0 && exploration.summary?.trim()) {
    return exploration.summary.trim();
  }

  return `Explored ${fileCount} file${fileCount === 1 ? '' : 's'}, ${searchCount} search${searchCount === 1 ? '' : 'es'}.`;
}

function getSegments(exploration: WorkspaceExplorationArtifact) {
  if (exploration.segments?.length > 0) {
    return exploration.segments.map((segment) => ({
      ...segment,
      entries: (segment.entries ?? []).filter((entry) => entry.kind === 'search' || entry.kind === 'read')
    })).filter((segment) => segment.entries.length > 0 || segment.summary?.trim());
  }

  const fallback = buildFallbackSegment(exploration);
  return fallback ? [fallback] : [];
}

function WorkspaceExplorationEntryRow({ entry }: { entry: WorkspaceExplorationEntry }) {
  const line = (
    <>
      <span className="workspace-exploration-entry-text">{entry.text}</span>
      {entry.detail?.trim() ? (
        <span className="workspace-exploration-entry-detail">
          {entry.detail.trim()}
        </span>
      ) : null}
    </>
  );

  const filePath = entry.kind === 'read' ? entry.path : undefined;

  if (filePath) {
    return (
      <button
        type="button"
        className="workspace-exploration-entry workspace-exploration-entry-button"
        onClick={() => {
          void openWorkspaceFile(filePath);
        }}
      >
        {line}
      </button>
    );
  }

  return (
    <div className="workspace-exploration-entry">
      {line}
    </div>
  );
}

export function WorkspaceExplorationBlock({ exploration, isStreaming = false }: WorkspaceExplorationBlockProps) {
  const defaultExpanded = useMemo(() => isStreaming, [isStreaming]);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setIsExpanded(isStreaming);
  }, [isStreaming]);

  const segments = useMemo(() => getSegments(exploration), [exploration]);

  if (segments.length === 0 && !exploration.summary?.trim() && !isStreaming) {
    return null;
  }

  const summary = formatSearchSummary(exploration);
  const title = isStreaming
    ? 'Exploring workspace...'
    : summary.replace(/\.$/, '');

  return (
    <div className={`workspace-exploration-block ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="workspace-exploration-header"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="workspace-exploration-icon">
          <Search size={13} />
        </span>
        <span className="workspace-exploration-title">
          {title}
        </span>
        <span className={`workspace-exploration-chevron ${isExpanded ? 'expanded' : ''}`}>
          <ChevronDown size={13} />
        </span>
      </button>

      {isExpanded && (
        <div className="workspace-exploration-body">
          {segments.map((segment, segmentIndex) => (
            <div
              key={segment.id}
              className={`workspace-exploration-segment ${segmentIndex > 0 ? 'workspace-exploration-segment-spaced' : ''}`}
            >
              {(segment.entries ?? []).map((entry) => (
                <WorkspaceExplorationEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
