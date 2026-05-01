import { Check, ChevronDown, Download, Filter, MoreVertical, Paperclip, Terminal } from 'lucide-react';
import type { TerminalCommandBlock } from '../../types/terminal';

type TerminalBlockDetailProps = {
  block: TerminalCommandBlock;
  failed: boolean;
  isSelected: boolean;
  onClose: () => void;
  onSelect: () => void;
};

function formatDuration(durationMs?: number | null) {
  if (typeof durationMs !== 'number') return 'running';
  if (durationMs < 1000) return `${(durationMs / 1000).toFixed(3)}s`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function outputFor(block: TerminalCommandBlock) {
  const output = block.output.trimEnd();
  const withoutEcho = output.startsWith(block.command)
    ? output.slice(block.command.length).replace(/^\s*\n?/, '')
    : output;

  return withoutEcho || (block.status === 'running' ? 'Running command...' : 'No output.');
}

export function TerminalBlockDetail({
  block,
  failed,
  isSelected,
  onClose,
  onSelect
}: TerminalBlockDetailProps) {
  const className = [
    'terminal-block-detail',
    failed ? 'failed' : '',
    isSelected ? 'selected' : ''
  ].filter(Boolean).join(' ');

  return (
    <article className={className} onClick={onSelect}>
      {!failed && (
        <button className={`terminal-detail-top-bar ${isSelected ? 'selected' : ''}`} type="button" onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}>
            <span className="terminal-detail-top-title">
              {isSelected ? <Check size={17} /> : <Terminal size={15} />}
              {isSelected ? 'Viewing command detail' : block.command}
            </span>
            <ChevronDown size={20} />
          </button>
      )}

      <div className="terminal-detail-body">
        {!isSelected && failed && <span className="terminal-detail-failure-rail" />}

        <header className="terminal-detail-header">
          <div className="terminal-detail-title">
            <span>~</span>
            <span>({formatDuration(block.durationMs)})</span>
          </div>

          <div
            className="terminal-block-actions"
            aria-label="Terminal block actions"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" title="Attach to agent context">
              <Paperclip size={18} />
            </button>
            <button type="button" title="Save as workflow">
              <Download size={18} />
            </button>
            <button type="button" title="Filter block output">
              <Filter size={19} />
            </button>
            <button type="button" title="More actions">
              <MoreVertical size={19} />
            </button>
          </div>
        </header>

        <pre className="terminal-block-output">
          <strong>{block.command}</strong>
          {'\n'}
          {outputFor(block)}
        </pre>
      </div>
    </article>
  );
}
