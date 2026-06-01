import type { TimelineItem } from '../utils/timeline';

type TerminalErrorRowProps = {
  item: Extract<TimelineItem, { kind: 'terminal-error' }>;
};

export function TerminalErrorRow({ item }: TerminalErrorRowProps) {
  return (
    <div className="terminal-error-row">
      <div className="role-avatar-container" />
      <div className="terminal-inline-error">{item.error}</div>
    </div>
  );
}
