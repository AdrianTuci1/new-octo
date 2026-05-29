import { ChevronDown, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../../../stores/editorStore';
import type { WorkspaceFileReadArtifact } from '../../../types/chat';
import './WorkspaceFileReadBlock.css';

type WorkspaceFileReadBlockProps = {
  artifact: WorkspaceFileReadArtifact;
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
    console.warn('[chat] failed to open file read artifact', { path, error });
  }
}

export function WorkspaceFileReadBlock({
  artifact,
  isStreaming = false
}: WorkspaceFileReadBlockProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  const lineSummary = useMemo(() => {
    if (!artifact.startLine && !artifact.endLine) {
      return null;
    }

    return `${artifact.startLine ?? 1}-${artifact.endLine ?? 'end'}`;
  }, [artifact.endLine, artifact.startLine]);

  const title = `Read ${fileNameFromPath(artifact.path)}`;

  return (
    <div className={`workspace-file-read-block ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="workspace-file-read-header"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="workspace-file-read-icon">
          <FileText size={13} />
        </span>
        <span className="workspace-file-read-title">{title}</span>
        <span className={`workspace-file-read-chevron ${isExpanded ? 'expanded' : ''}`}>
          <ChevronDown size={13} />
        </span>
      </button>

      {isExpanded && (
        <div className="workspace-file-read-body">
          <button
            type="button"
            className="workspace-file-read-path"
            onClick={() => {
              void openWorkspaceFile(artifact.path);
            }}
          >
            {artifact.displayPath}
          </button>
          {(lineSummary || artifact.truncated) && (
            <div className="workspace-file-read-meta">
              {lineSummary ? `Lines ${lineSummary}` : ''}
              {lineSummary && artifact.truncated ? ' • ' : ''}
              {artifact.truncated ? 'Truncated for context size' : ''}
            </div>
          )}
          <pre className="workspace-file-read-snippet">
            <code>{artifact.content}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
