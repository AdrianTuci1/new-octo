import { extractInlineFileChangeApproval, visibleChatMessageBody } from '../../../hooks/chat';
import type { FileDiff } from '../../../types/diff';
import type { ChatMessage } from '../../../types/chat';
import { extractFileProposalFromMarkdown } from './fileProposals';
import type { MessageBubbleViewModel } from './types';

export class MessageBubblePresenter {
  static create(message: ChatMessage): MessageBubbleViewModel {
    const isAssistant = message.role === 'assistant';
    const rawVisibleBodyWithArtifacts = isAssistant
      ? visibleChatMessageBody(message.body)
      : message.body;
    const shouldExtractFinalAssistantArtifacts = isAssistant && !message.isStreaming;
    const inlineFileChangeApproval = shouldExtractFinalAssistantArtifacts
      ? extractInlineFileChangeApproval(message.body).approval
      : undefined;
    const extractedFileProposal = shouldExtractFinalAssistantArtifacts
      ? extractFileProposalFromMarkdown(rawVisibleBodyWithArtifacts)
      : { visibleBody: rawVisibleBodyWithArtifacts, fileDiffs: [] as FileDiff[] };
    const displayFileDiffs = message.fileDiffs?.length
      ? message.fileDiffs
      : extractedFileProposal.fileDiffs;
    const filePreviewStatus = message.fileChangeStatus
      ?? (message.toolKind === 'file-change'
        ? 'accepted'
        : displayFileDiffs.length > 0
          ? 'pending'
          : 'pending');
    const visibleBody = extractedFileProposal.visibleBody;

    return {
      displayFileDiffs,
      extractedFileDiffs: extractedFileProposal.fileDiffs,
      filePreviewStatus,
      inlineFileChangeApproval,
      isUser: message.role === 'user',
      rawVisibleBody: visibleBody,
      showStreamingHint: isAssistant
        && Boolean(message.isStreaming)
        && !visibleBody.trim()
        && !message.hasNativeThinking,
      visibleBody
    };
  }
}
