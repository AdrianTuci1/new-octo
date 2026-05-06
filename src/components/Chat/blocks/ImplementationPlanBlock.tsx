import { Compass, ExternalLink } from 'lucide-react';
import './ImplementationPlanBlock.css';

export type ImplementationPlanBlockProps = {
  title?: string;
  version?: string;
  onClick?: () => void;
};

export function ImplementationPlanBlock({ title = 'Multi-Provider AI Application Implementation Plan', version = 'v1', onClick }: ImplementationPlanBlockProps) {
  return (
    <button
      className="terminal-block-summary"
      type="button"
      onClick={onClick}
    >
      <span className="terminal-summary-icon implementation-plan-icon">
        <Compass size={14} />
      </span>
      <span className="terminal-summary-command implementation-plan-title">
        {title}
      </span>
      <div className="terminal-summary-chevron implementation-plan-chevron-group">
        <span className="implementation-plan-version">{version}</span>
        <ExternalLink size={15} />
      </div>
    </button>
  );
}
