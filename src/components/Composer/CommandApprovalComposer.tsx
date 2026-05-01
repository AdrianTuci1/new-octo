import { ChevronDown, CornerDownLeft, Play, X } from 'lucide-react';
import type { CommandApproval } from '../../types/terminal';

type CommandApprovalComposerProps = {
  approval: CommandApproval;
  onReject: () => void;
  onEdit: (command: string) => void;
  onRun: (command: string) => void;
};

export function CommandApprovalComposer({
  approval,
  onReject,
  onEdit,
  onRun
}: CommandApprovalComposerProps) {
  return (
    <section className="command-approval-shell" aria-label="Command approval">
      <div className="command-approval-top">
        <div className="command-approval-question">
          <span className="command-approval-marker" />
          <span className="command-approval-question-text">
            {approval.reason ?? 'Am cerut accesul pentru a rula această comandă și a verifica rezultatul.'}
          </span>
        </div>

        <div className="command-approval-actions">
          <button type="button" className="command-approval-text-btn" onClick={onReject}>
            Reject
            <span className="keycap">
              <X size={10} />
            </span>
          </button>
          <button type="button" className="command-approval-text-btn" onClick={() => onEdit(approval.command)}>
            Edit
            <span className="keycap">⌘</span>
            <span className="keycap">E</span>
          </button>
          <div className="command-approval-run-group">
            <button type="button" className="command-approval-run" onClick={() => onRun(approval.command)}>
              Run
              <span className="keycap run-key">
                <CornerDownLeft size={12} />
              </span>
            </button>
            <button type="button" className="command-approval-chevron" title="More run options">
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      </div>

      <pre className="command-approval-command">{approval.command}</pre>
    </section>
  );
}
