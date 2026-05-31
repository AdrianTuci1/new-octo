import { memo, useEffect, useMemo, useRef } from 'react';
import { CodeDiffView } from './CodeDiffView';
import {
  FileArtifactBlock,
  ImplementationPlanBlock,
  ThinkingBlock,
  WebSearchBlock,
  WorkspaceExplorationBlock
} from './blocks';
import { extractInlineFileChangeApproval, visibleChatMessageBody } from '../../hooks/useChat';
import type { ChatMessage } from '../../types/chat';
import type { CommandApproval } from '../../types/terminal';
import type { FileDiff } from '../../types/diff';
import { type FileDiffPreviewStatus } from '../../lib/fileDiffs';
import { ProfileAvatar } from '../App/profile/ProfileAvatar';
import type { UserProfileSettings } from '../App/settings/profileSettings';
import type { OpenEditorFileOptions } from '../../stores/editorStore';
import { openExecutionPlanInEditor } from './messageBubble/executionPlan';
import { extractFileProposalFromMarkdown } from './messageBubble/fileProposals';
import {
  createMarkdownComponents,
  MarkdownRenderer,
  openMarkdownLink
} from './messageBubble/markdownRenderer';

type MessageBubbleProps = {
  message: ChatMessage;
  profile: UserProfileSettings;
  openFile: (path: string, name: string, content?: string, options?: OpenEditorFileOptions) => void;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
};

function MessageBubbleComponent({ message, onRequestCommandApproval, profile, openFile }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const rawVisibleBodyWithArtifacts = message.role === 'assistant'
    ? visibleChatMessageBody(message.body)
    : message.body;
  const inlineFileChangeApproval = useMemo(() => (
    message.role === 'assistant' && !message.isStreaming
      ? extractInlineFileChangeApproval(message.body).approval
      : undefined
  ), [message.body, message.isStreaming, message.role]);
  const extractedFileProposal = useMemo(() => (
    message.role === 'assistant' && !message.isStreaming
      ? extractFileProposalFromMarkdown(rawVisibleBodyWithArtifacts)
      : { visibleBody: rawVisibleBodyWithArtifacts, fileDiffs: [] as FileDiff[] }
  ), [message.isStreaming, message.role, rawVisibleBodyWithArtifacts]);
  const displayFileDiffs = message.fileDiffs?.length
    ? message.fileDiffs
    : extractedFileProposal.fileDiffs;
  const filePreviewStatus: FileDiffPreviewStatus = message.fileChangeStatus
    ?? (message.toolKind === 'file-change'
      ? 'accepted'
      : displayFileDiffs.length > 0
        ? 'pending'
        : 'pending');
  const emittedFileProposalIdsRef = useRef(new Set<string>());
  const rawVisibleBody = extractedFileProposal.visibleBody;
  const visibleBody = rawVisibleBody;
  const showStreamingHint = message.role === 'assistant'
    && message.isStreaming
    && !visibleBody.trim()
    && !message.hasNativeThinking;

  useEffect(() => {
    if (!onRequestCommandApproval) return;
    if (message.role !== 'assistant' || message.isStreaming) return;
    if (message.fileDiffs?.length) return;
    if (emittedFileProposalIdsRef.current.has(message.id)) return;

    if (inlineFileChangeApproval) {
      emittedFileProposalIdsRef.current.add(message.id);
      onRequestCommandApproval(inlineFileChangeApproval);
      return;
    }

    if (extractedFileProposal.fileDiffs.length === 0) return;

    emittedFileProposalIdsRef.current.add(message.id);
    onRequestCommandApproval({
      kind: 'file-change',
      summary: `Review proposed changes across ${extractedFileProposal.fileDiffs.length} ${extractedFileProposal.fileDiffs.length === 1 ? 'file' : 'files'}`,
      fileDiffs: extractedFileProposal.fileDiffs
    });
  }, [
    extractedFileProposal.fileDiffs,
    inlineFileChangeApproval,
    message.fileDiffs?.length,
    message.id,
    message.isStreaming,
    message.role,
    onRequestCommandApproval
  ]);

  const markdownComponents = useMemo(() => createMarkdownComponents({
    openFile,
    onRequestCommandApproval
  }), [openFile, onRequestCommandApproval]);

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="role-avatar-container">
        {isUser && (
          <ProfileAvatar profile={profile} size={24} showInitials={Boolean(profile.avatarDataUrl)} />
        )}
      </div>

      <div className="message-content">
        {message.messageKind === 'reasoning' ? (
          <ThinkingBlock 
            body={visibleBody} 
            isStreaming={message.isStreaming} 
            durationSeconds={message.thinkingDurationSeconds}
          />
        ) : showStreamingHint ? (
          <div className="message-streaming-hint">
            <span className="thinking-dot-animation">Thinking</span>
            {message.status && message.status !== 'queued' && (
              <span className="status-badge"> ({message.status})</span>
            )}
          </div>
        ) : message.role === 'tool' ? (
          message.toolKind === 'web-search'
            ? (
                <div className="tool-output-web-search">
                  <WebSearchBlock
                    status={message.webSearchStatus}
                    results={message.webSearchResults ?? []}
                    query={message.webSearchQuery}
                    onOpenResult={(url) => {
                      void openMarkdownLink(url, openFile);
                    }}
                  />
                  {(!message.webSearchResults || message.webSearchResults.length === 0) && message.body.trim().length > 0 && (
                    <MarkdownRenderer
                      body={message.body}
                      className="tool-output-raw tool-output-web-search-fallback"
                      components={markdownComponents}
                    />
                  )}
                </div>
              )
            : message.toolKind === 'workspace-exploration' && message.workspaceExploration
              ? (
                  <div className="tool-output-workspace-exploration">
                    <WorkspaceExplorationBlock
                      exploration={message.workspaceExploration}
                      isStreaming={message.isStreaming}
                    />
                  </div>
                )
            : message.toolKind === 'plan' && message.executionPlan
              ? (
                  <div className="tool-output-plan">
                    {(() => {
                      const executionPlan = message.executionPlan;
                      return (
                    <ImplementationPlanBlock
                      title={executionPlan.title}
                      version={executionPlan.version ?? 'v1'}
                      onClick={() => {
                        openExecutionPlanInEditor(executionPlan, openFile);
                      }}
                    />
                      );
                    })()}
                  </div>
                )
            : message.toolKind === 'file-change' && message.fileDiffs?.length
              ? null
            : (
                <MarkdownRenderer
                  body={message.body}
                  className="tool-output-raw"
                  components={markdownComponents}
                />
              )
        ) : (
          <MarkdownRenderer body={visibleBody} components={markdownComponents} />
        )}

        {displayFileDiffs.length > 0 && (
          <div className="message-diffs">
            <FileDiffPreviewGroup
              diffs={displayFileDiffs}
              status={filePreviewStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent, (prev, next) => (
  prev.message === next.message
  && prev.profile === next.profile
  && prev.openFile === next.openFile
  && prev.onRequestCommandApproval === next.onRequestCommandApproval
));

function FileDiffPreviewGroup({
  diffs,
  status
}: {
  diffs: FileDiff[];
  status: FileDiffPreviewStatus;
}) {
  const createDiffs = diffs.filter((diff) => diff.diffType.kind === 'create');
  const nonCreateDiffs = diffs.filter((diff) => diff.diffType.kind !== 'create');

  return (
    <>
      {createDiffs.length > 0 ? (
        <FileArtifactBlock
          key={`create:${createDiffs.map((diff) => diff.filePath).join('|')}:${status}`}
          diffs={createDiffs}
          status={status}
        />
      ) : null}
      {nonCreateDiffs.length > 0 ? (
        <CodeDiffView diffs={nonCreateDiffs} status={status} />
      ) : null}
    </>
  );
}
