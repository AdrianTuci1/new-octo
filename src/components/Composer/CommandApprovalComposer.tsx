import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerDownLeft, Sparkles, PencilLine, Check } from 'lucide-react';
import { CodeDiffView } from '../Chat/CodeDiffView';
import type { CommandApproval } from '../../types/terminal';
import './ComposerBar.css';

type CommandApprovalComposerProps = {
  approval: CommandApproval;
  onRefine: () => void;
  onEdit: () => void;
  onAccept: () => void;
  onAutoApprove?: () => void;
  onStartNewConversation?: () => void;
  onContinueCurrentConversation?: () => void;
};

export function CommandApprovalComposer({
  approval,
  onRefine,
  onEdit,
  onAccept,
  onAutoApprove,
  onStartNewConversation,
  onContinueCurrentConversation
}: CommandApprovalComposerProps) {
  const [isAcceptMenuOpen, setIsAcceptMenuOpen] = useState(false);
  const acceptMenuRef = useRef<HTMLDivElement | null>(null);

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
          </div>

          <div className="command-approval-actions">
            <button type="button" className="command-approval-text-btn" onClick={onRefine}>
              Refine
              <span className="keycap">
                <CornerDownLeft size={10} />
              </span>
              <span className="keycap">C</span>
            </button>
            <button type="button" className="command-approval-text-btn" onClick={onEdit}>
              Edit
              <span className="keycap">⌘</span>
              <span className="keycap">E</span>
            </button>
            <div ref={acceptMenuRef} className="command-approval-accept-group">
              <button type="button" className="command-approval-accept" onClick={onAccept}>
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
                      onAccept();
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="command-approval-accept-menu-item"
                    onClick={() => {
                      setIsAcceptMenuOpen(false);
                      (onAutoApprove ?? onAccept)();
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
            <CodeDiffView diffs={approval.fileDiffs} showHeader={false} />
          </div>
        </div>
      </section>
    );
  }

  const summary = approval.reason ?? 'Am cerut accesul pentru a rula această comandă și a verifica rezultatul.';

  return (
    <section className="command-approval-shell" aria-label="Approval">
      <div className="command-approval-top">
        <div className="command-approval-question">
          <span className="command-approval-marker" />
          <span className="command-approval-question-text">{summary}</span>
        </div>

        <div className="command-approval-actions">
          <button type="button" className="command-approval-text-btn" onClick={onRefine}>
            <Sparkles size={12} />
            Refine
            <span className="keycap">
              <CornerDownLeft size={10} />
            </span>
            <span className="keycap">C</span>
          </button>
          <button type="button" className="command-approval-text-btn" onClick={onEdit}>
            <PencilLine size={12} />
            Edit
            <span className="keycap">⌘</span>
            <span className="keycap">E</span>
          </button>
          <div ref={acceptMenuRef} className="command-approval-accept-group">
            <button type="button" className="command-approval-accept" onClick={onAccept}>
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
                    onAccept();
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="command-approval-accept-menu-item"
                  onClick={() => {
                    setIsAcceptMenuOpen(false);
                    (onAutoApprove ?? onAccept)();
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
        <pre className="command-approval-command">{approval.command}</pre>
      </div>
    </section>
  );
}
