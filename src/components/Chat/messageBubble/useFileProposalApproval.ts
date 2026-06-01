import { useEffect, useRef } from 'react';
import type { CommandApproval } from '../../../types/terminal';
import type { ChatMessage } from '../../../types/chat';
import type { MessageBubbleViewModel } from './types';

type UseFileProposalApprovalInput = {
  message: ChatMessage;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
  viewModel: MessageBubbleViewModel;
};

export function useFileProposalApproval({
  message,
  onRequestCommandApproval,
  viewModel
}: UseFileProposalApprovalInput) {
  const emittedFileProposalIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!onRequestCommandApproval) return;
    if (message.role !== 'assistant' || message.isStreaming) return;
    if (message.fileDiffs?.length) return;
    if (emittedFileProposalIdsRef.current.has(message.id)) return;

    if (viewModel.inlineFileChangeApproval) {
      emittedFileProposalIdsRef.current.add(message.id);
      onRequestCommandApproval(viewModel.inlineFileChangeApproval);
      return;
    }

    if (viewModel.extractedFileDiffs.length === 0) return;

    emittedFileProposalIdsRef.current.add(message.id);
    onRequestCommandApproval({
      kind: 'file-change',
      summary: `Review proposed changes across ${viewModel.extractedFileDiffs.length} ${viewModel.extractedFileDiffs.length === 1 ? 'file' : 'files'}`,
      fileDiffs: viewModel.extractedFileDiffs
    });
  }, [
    message.fileDiffs?.length,
    message.id,
    message.isStreaming,
    message.role,
    onRequestCommandApproval,
    viewModel.extractedFileDiffs,
    viewModel.inlineFileChangeApproval
  ]);
}
