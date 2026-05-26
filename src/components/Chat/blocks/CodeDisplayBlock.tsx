import { Copy } from 'lucide-react';
import './CodeDisplayBlock.css';
import type { FileDiffPreviewStatus } from '../../../lib/fileDiffs';

export type CodeDisplayBlockProps = {
  code?: string;
  title?: string;
  status?: FileDiffPreviewStatus;
  detail?: string;
};

export function CodeDisplayBlock({
  code = 'const fetchArchitecture = async () => {\n  return await api.get("/patterns");\n};',
  title,
  status = 'pending',
  detail
}: CodeDisplayBlockProps) {
  const statusLabel = status === 'accepted'
    ? 'Applied'
    : status === 'rejected'
      ? 'Request canceled'
      : 'Proposed';

  return (
    <div className={`code-display-block ${status}`}>
      {(title || detail) ? (
        <div className="code-display-header">
          <div className="code-display-meta">
            {title ? <div className="code-display-title">{title}</div> : null}
            {detail ? <div className="code-display-detail">{detail}</div> : null}
          </div>
          <div className={`code-display-status ${status}`}>{statusLabel}</div>
        </div>
      ) : null}
      <pre className="code-display-pre">
        {code}
      </pre>
      <button 
        type="button" 
        className="code-action-btn code-display-copy-btn"
        title="Copy code"
        onClick={() => {
          void navigator.clipboard?.writeText(code).catch(() => {});
        }}
      >
        <Copy size={14} />
      </button>
    </div>
  );
}
