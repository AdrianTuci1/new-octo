import { useMemo } from 'react';
import { ProfileAvatar } from '../../App/profile/ProfileAvatar';
import { createMarkdownComponents } from './markdownRenderer';
import { FileDiffPreviewGroup } from './FileDiffPreviewGroup';
import { MessageBubbleContent } from './MessageBubbleContent';
import { MessageBubblePresenter } from './MessageBubblePresenter';
import { useFileProposalApproval } from './useFileProposalApproval';
import type { MessageBubbleProps } from './types';

export function MessageBubbleFacade({
  message,
  onRequestCommandApproval,
  profile,
  openFile
}: MessageBubbleProps) {
  const viewModel = useMemo(() => MessageBubblePresenter.create(message), [message]);
  const markdownComponents = useMemo(() => createMarkdownComponents({
    openFile,
    onRequestCommandApproval
  }), [openFile, onRequestCommandApproval]);

  useFileProposalApproval({
    message,
    onRequestCommandApproval,
    viewModel
  });

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="role-avatar-container">
        {viewModel.isUser && (
          <ProfileAvatar profile={profile} size={24} showInitials={Boolean(profile.avatarDataUrl)} />
        )}
      </div>

      <div className="message-content">
        <MessageBubbleContent
          components={markdownComponents}
          message={message}
          openFile={openFile}
          viewModel={viewModel}
        />

        {viewModel.displayFileDiffs.length > 0 && (
          <div className="message-diffs">
            <FileDiffPreviewGroup
              diffs={viewModel.displayFileDiffs}
              status={viewModel.filePreviewStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}
