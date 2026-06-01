import { CommandApprovalComposer } from '../../Composer';
import type { useChatPanelController } from '../hooks/useChatPanelController';
import type { ChatPanelView } from './types';

type CommandApprovalRowProps = {
  approval: ReturnType<typeof useChatPanelController>['activePendingApproval'];
  view: ChatPanelView;
};

export function CommandApprovalRow({ approval, view }: CommandApprovalRowProps) {
  if (!approval) {
    return null;
  }

  return (
    <div className="command-approval-row">
      <CommandApprovalComposer
        approval={approval}
        onEdit={() => view.onEditPendingApproval?.(approval)}
        onSaveEdit={(nextApproval) => view.onSaveEditPendingApproval?.(nextApproval)}
        onReject={(nextApproval) => view.onRejectPendingApproval?.(nextApproval)}
        onAccept={(nextApproval) => view.onAcceptPendingApproval?.(nextApproval)}
        onAutoApprove={(nextApproval) => view.onAutoApprovePendingApproval?.(nextApproval)}
        onStartNewConversation={approval.kind === 'topic-change' ? view.onStartNewConversationPendingApproval : undefined}
        onContinueCurrentConversation={approval.kind === 'topic-change' ? view.onContinueCurrentConversationPendingApproval : undefined}
      />
    </div>
  );
}
