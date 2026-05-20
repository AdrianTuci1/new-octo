import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerDownLeft, PencilLine, Check, X, Save } from 'lucide-react';
import { CodeDiffView } from '../Chat/CodeDiffView';
import type { CommandApproval } from '../../types/terminal';
import './ComposerBar.css';

type CommandApprovalComposerProps = {
  approval: CommandApproval;
  onEdit: () => void;
  onSaveEdit?: (approval: CommandApproval) => void;
  onReject?: (approval: CommandApproval) => void;
  onAccept: (approval: CommandApproval) => void;
  onAutoApprove?: (approval: CommandApproval) => void;
  onStartNewConversation?: () => void;
  onContinueCurrentConversation?: () => void;
};

export function CommandApprovalComposer({
  approval,
  onEdit,
  onSaveEdit,
  onReject,
  onAccept,
  onAutoApprove,
  onStartNewConversation,
  onContinueCurrentConversation
}: CommandApprovalComposerProps) {
  const [isAcceptMenuOpen, setIsAcceptMenuOpen] = useState(false);
  const [isEditingCommand, setIsEditingCommand] = useState(false);
  const [draftCommand, setDraftCommand] = useState('command' in approval ? approval.command : '');
  const acceptMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if ('command' in approval) {
      setDraftCommand(approval.command);
    }
    setIsEditingCommand(false);
  }, [approval]);

  useEffect(() => {
    if (!isAcceptMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (acceptMenuRef.current?.contains(event.target as Node)) return;
      setIsAcceptMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAcceptMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isAcceptMenuOpen]);

  if (approval.kind === 'topic-change') {
    return (
      <section className="command-approval-shell command-approval-topic-shell" aria-label="Conversation topic change">
        <div className="command-approval-top command-approval-topic-top">
          <div className="command-approval-question command-approval-topic-question">
            <span className="command-approval-marker" />
            <span className="command-approval-question-text">
              {approval.reason ?? 'It seems like the topic changed. Would you like to make a new conversation?'}
            </span>
          </div>
        </div>

        <div className="command-approval-topic-actions">
          <button
            type="button"
            className="command-approval-topic-btn primary"
            onClick={onStartNewConversation}
          >
            {approval.startNewConversationLabel ?? 'Start a new conversation'}
            <span className="command-approval-topic-keycap">
              <CornerDownLeft size={12} />
            </span>
          </button>
          <button
            type="button"
            className="command-approval-topic-btn"
            onClick={onContinueCurrentConversation}
          >
            {approval.continueConversationLabel ?? 'Continue current conversation'}
          </button>
        </div>
      </section>
    );
  }

  if (approval.kind === 'file-change') {
    const summary = approval.summary ?? 'Created or updated files need review';
    const fileCountLabel = `${approval.fileDiffs.length} ${approval.fileDiffs.length === 1 ? 'file' : 'files'}`;

    return (
      <section className="command-approval-shell command-approval-file-shell" aria-label="Approval">
        <div className="command-approval-top">
          <div className="command-approval-question">
            <span className="command-approval-marker" />
            <span className="command-approval-question-text">{summary}</span>
            <span className="command-approval-file-count">{fileCountLabel}</span>
          </div>

          <div className="command-approval-actions">
            <button type="button" className="command-approval-text-btn" onClick={() => onReject?.(approval)}>
              <X size={12} />
              Reject
            </button>
            <button type="button" className="command-approval-text-btn" onClick={onEdit}>
              Edit
              <span className="keycap">⌘</span>
              <span className="keycap">E</span>
            </button>
            <div ref={acceptMenuRef} className="command-approval-accept-group">
              <button type="button" className="command-approval-accept" onClick={() => onAccept(approval)}>
                Accept
                <span className="keycap">
                  <CornerDownLeft size={10} />
                </span>
              </button>
              <button
                type="button"
                className="command-approval-accept-chevron"
                title="More accept options"
                onClick={() => setIsAcceptMenuOpen((current) => !current)}
              >
                <ChevronDown size={16} />
              </button>

              {isAcceptMenuOpen && (
                <div className="command-approval-accept-menu" role="menu">
                  <button
                    type="button"
                    className="command-approval-accept-menu-item primary"
                    onClick={() => {
                      setIsAcceptMenuOpen(false);
                      onAccept(approval);
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="command-approval-accept-menu-item"
                    onClick={() => {
                      setIsAcceptMenuOpen(false);
                      (onAutoApprove ?? onAccept)(approval);
                    }}
                  >
                    Auto-approve
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="command-approval-preview">
          <div className="command-approval-diffs">
            <CodeDiffView diffs={approval.fileDiffs} showHeader />
          </div>
        </div>
      </section>
    );
  }

  const summary = approval.reason ?? 'Am cerut accesul pentru a rula această comandă și a verifica rezultatul.';
  const editedApproval = 'command' in approval
    ? { ...approval, command: draftCommand.trim() || approval.command }
    : approval;
  const handleEditOrSave = () => {
    if (!isEditingCommand) {
      setDraftCommand(approval.command);
      setIsEditingCommand(true);
      onEdit();
      return;
    }

    onSaveEdit?.(editedApproval);
    setIsEditingCommand(false);
  };

  return (
    <section className="command-approval-shell" aria-label="Approval">
      <div className="command-approval-top">
        <div className="command-approval-question">
          <span className="command-approval-marker" />
          <span className="command-approval-question-text">{summary}</span>
        </div>

        <div className="command-approval-actions">
          <button type="button" className="command-approval-text-btn" onClick={() => onReject?.(editedApproval)}>
            <X size={12} />
            Reject
          </button>
          <button type="button" className="command-approval-text-btn" onClick={handleEditOrSave}>
            {isEditingCommand ? <Save size={12} /> : <PencilLine size={12} />}
            {isEditingCommand ? 'Save' : 'Edit'}
            <span className="keycap">⌘</span>
            <span className="keycap">E</span>
          </button>
          <div ref={acceptMenuRef} className="command-approval-accept-group">
            <button type="button" className="command-approval-accept" onClick={() => {
              onSaveEdit?.(editedApproval);
              onAccept(editedApproval);
            }}>
              <Check size={12} />
              Accept
            </button>
            <button
              type="button"
              className="command-approval-accept-chevron"
              title="More accept options"
              onClick={() => setIsAcceptMenuOpen((current) => !current)}
            >
              <ChevronDown size={16} />
            </button>

            {isAcceptMenuOpen && (
              <div className="command-approval-accept-menu" role="menu">
                <button
                  type="button"
                  className="command-approval-accept-menu-item primary"
                  onClick={() => {
                    setIsAcceptMenuOpen(false);
                    onSaveEdit?.(editedApproval);
                    onAccept(editedApproval);
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="command-approval-accept-menu-item"
                  onClick={() => {
                    setIsAcceptMenuOpen(false);
                    onSaveEdit?.(editedApproval);
                    (onAutoApprove ?? onAccept)(editedApproval);
                  }}
                >
                  Auto-approve
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="command-approval-preview">
        {isEditingCommand ? (
          <textarea
            className="command-approval-command command-approval-command-editor"
            value={draftCommand}
            onChange={(event) => setDraftCommand(event.target.value)}
            rows={Math.max(2, draftCommand.split('\n').length)}
            autoFocus
          />
        ) : (
          <pre className="command-approval-command">{approval.command}</pre>
        )}
      </div>
    </section>
  );
}
