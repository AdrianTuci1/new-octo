import { DiffEditor } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerDownLeft, PencilLine, Check, X, Save } from 'lucide-react';
import { CodeDiffView } from '../Chat/CodeDiffView';
import type { CommandApproval } from '../../types/terminal';
import type { FileDiff } from '../../types/diff';
import { applyFileDiffToContent, buildEditedFileDiff, canEditFileDiffInline, getFileDiffBaseContent } from '../../lib/fileDiffs';
import { getLanguageFromPath } from '../../lib/fileLanguage';
import { configureWarpDarkTheme } from '../Editor/monacoTheme';
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
  ...props
}: CommandApprovalComposerProps) {
  return <CommandApprovalComposerContent key={getApprovalComposerKey(props.approval)} {...props} />;
}

function CommandApprovalComposerContent({
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
  const [isEditingFileChanges, setIsEditingFileChanges] = useState(false);
  const [draftCommand, setDraftCommand] = useState('command' in approval ? approval.command : '');
  const [activeDraftFileIndex, setActiveDraftFileIndex] = useState(0);
  const [draftFileDiffs, setDraftFileDiffs] = useState<FileDiff[]>(approval.kind === 'file-change' ? approval.fileDiffs : []);
  const acceptMenuRef = useRef<HTMLDivElement | null>(null);
  const diffEditorCleanupRef = useRef<(() => void) | null>(null);

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

  useEffect(() => () => {
    diffEditorCleanupRef.current?.();
  }, []);

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
    const effectiveDraftFileDiffs = draftFileDiffs.length > 0 ? draftFileDiffs : approval.fileDiffs;
    const editedApproval = {
      ...approval,
      fileDiffs: effectiveDraftFileDiffs
    };
    const activeDiff = effectiveDraftFileDiffs[activeDraftFileIndex] ?? effectiveDraftFileDiffs[0];
    const activeDiffEditable = activeDiff ? canEditFileDiffInline(activeDiff) : false;
    const activeDiffContent = activeDiff
      ? applyFileDiffToContent(getFileDiffBaseContent(activeDiff), activeDiff)
      : '';

    const handleFileChangeEditOrSave = () => {
      if (!isEditingFileChanges) {
        setDraftFileDiffs(approval.fileDiffs);
        setIsEditingFileChanges(true);
        onEdit();
        return;
      }

      onSaveEdit?.(editedApproval);
      setIsEditingFileChanges(false);
    };

    return (
      <section className="command-approval-shell command-approval-file-shell" aria-label="Approval">
        <div className="command-approval-top">
          <div className="command-approval-question">
            <span className="command-approval-marker" />
            <span className="command-approval-question-text">{summary}</span>
            <span className="command-approval-file-count">{fileCountLabel}</span>
          </div>

          <div className="command-approval-actions">
            <button type="button" className="command-approval-text-btn" onClick={() => onReject?.(editedApproval)}>
              <X size={12} />
              Reject
            </button>
            <button type="button" className="command-approval-text-btn" onClick={handleFileChangeEditOrSave}>
              {isEditingFileChanges ? <Save size={12} /> : <PencilLine size={12} />}
              {isEditingFileChanges ? 'Save' : 'Edit'}
              <span className="keycap">⌘</span>
              <span className="keycap">E</span>
            </button>
            <div ref={acceptMenuRef} className="command-approval-accept-group">
              <button type="button" className="command-approval-accept" onClick={() => {
                onSaveEdit?.(editedApproval);
                onAccept(editedApproval);
              }}>
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
          <div className="command-approval-diffs">
            {isEditingFileChanges && activeDiff ? (
              <div className="command-approval-file-editor">
                <div className="command-approval-file-tabs">
                  {effectiveDraftFileDiffs.map((diff, index) => {
                    const label = diff.filePath.split('/').pop() || diff.filePath;
                    return (
                      <button
                        key={`${diff.filePath}-${index}`}
                        type="button"
                        className={`command-approval-file-tab ${index === activeDraftFileIndex ? 'active' : ''}`}
                        onClick={() => setActiveDraftFileIndex(index)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="command-approval-file-editor-meta">
                  <span className="command-approval-file-editor-path">{activeDiff.filePath}</span>
                  {!activeDiffEditable ? (
                    <span className="command-approval-file-editor-note">
                      Inline edit is available for new files and diffs that include original content.
                    </span>
                  ) : null}
                </div>
                <div className="command-approval-monaco-shell">
                  <DiffEditor
                    key={activeDiff.filePath}
                    theme="warp-dark"
                    height="320px"
                    language={getLanguageFromPath(activeDiff.filePath)}
                    original={getFileDiffBaseContent(activeDiff)}
                    modified={activeDiffContent}
                    onMount={(editor, monaco) => {
                      configureWarpDarkTheme(monaco);
                      diffEditorCleanupRef.current?.();

                      if (!activeDiffEditable) {
                        diffEditorCleanupRef.current = null;
                        return;
                      }

                      const modifiedEditor = editor.getModifiedEditor();
                      const subscription = modifiedEditor.onDidChangeModelContent(() => {
                        const nextContent = modifiedEditor.getValue();
                        setDraftFileDiffs((current) => current.map((diff, index) => (
                          index === activeDraftFileIndex
                            ? buildEditedFileDiff(diff, nextContent)
                            : diff
                        )));
                      });

                      diffEditorCleanupRef.current = () => subscription.dispose();
                    }}
                    options={{
                      renderSideBySide: false,
                      compactMode: true,
                      originalEditable: false,
                      minimap: { enabled: false },
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      roundedSelection: false,
                      scrollBeyondLastLine: false,
                      readOnly: !activeDiffEditable,
                      automaticLayout: true,
                      diffWordWrap: 'on',
                      renderIndicators: false,
                      renderMarginRevertIcon: false,
                      renderGutterMenu: false,
                      lineNumbersMinChars: 2,
                      renderOverviewRuler: false
                    }}
                  />
                </div>
              </div>
            ) : (
              <CodeDiffView diffs={effectiveDraftFileDiffs} showHeader />
            )}
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

function getApprovalComposerKey(approval: CommandApproval) {
  if (approval.kind === 'topic-change') {
    return `topic:${approval.reason ?? ''}:${approval.startNewConversationLabel ?? ''}:${approval.continueConversationLabel ?? ''}`;
  }

  if (approval.kind === 'file-change') {
    return `file:${approval.toolCallId ?? ''}:${approval.fileDiffs.map((diff) => `${diff.filePath}:${diff.diffType.kind}`).join('|')}`;
  }

  return `command:${approval.toolCallId ?? ''}:${approval.command}`;
}
