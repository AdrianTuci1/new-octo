import { FileText, Check, X, ChevronRight } from 'lucide-react';
import './CodeDiffView.css';
import type { FileDiff } from '../../types/diff';

type CodeDiffViewProps = {
  diff: FileDiff;
  onAccept?: (diff: FileDiff) => void;
  onReject?: (diff: FileDiff) => void;
  showActions?: boolean;
};

export function CodeDiffView({ diff, onAccept, onReject, showActions = true }: CodeDiffViewProps) {
  const fileName = diff.filePath.split('/').pop() || diff.filePath;

  return (
    <div className="code-diff-view">
      <div className="code-diff-header">
        <div className="code-diff-file-info">
          <FileText size={14} className="code-diff-file-icon" />
          <span className="code-diff-file-path">{fileName}</span>
          <ChevronRight size={12} style={{ opacity: 0.3 }} />
          <span style={{ opacity: 0.5, fontSize: '11px' }}>{diff.filePath}</span>
        </div>
        {showActions && (
          <div className="code-diff-actions">
            <button className="code-diff-btn reject" onClick={() => onReject?.(diff)}>
              <X size={12} />
              Reject
            </button>
            <button className="code-diff-btn accept" onClick={() => onAccept?.(diff)}>
              <Check size={12} />
              Accept
            </button>
          </div>
        )}
      </div>
      <div className="code-diff-content">
        {renderDiffLines(diff)}
      </div>
    </div>
  );
}

function renderDiffLines(diff: FileDiff) {
  // This is a simplified renderer for demonstration.
  // In a real app, you'd use the computed deltas to show exactly what changed.
  
  if (diff.diffType.kind === 'update') {
    return diff.diffType.deltas.map((delta, i) => (
      <div key={i} className="code-diff-hunk">
        {/* Placeholder for actual diff rendering logic */}
        <div className="code-diff-line deletion">
          <span className="code-diff-line-number">...</span>
          <span className="code-diff-prefix"></span>
          <span className="code-diff-line-content">Old content placeholder</span>
        </div>
        <div className="code-diff-line addition">
          <span className="code-diff-line-number">...</span>
          <span className="code-diff-prefix"></span>
          <span className="code-diff-line-content">{delta.insertion}</span>
        </div>
      </div>
    ));
  }

  if (diff.diffType.kind === 'create') {
    return diff.diffType.delta.insertion.split('\n').map((line, i) => (
      <div key={i} className="code-diff-line addition">
        <span className="code-diff-line-number">{i + 1}</span>
        <span className="code-diff-prefix"></span>
        <span className="code-diff-line-content">{line}</span>
      </div>
    ));
  }

  return null;
}
