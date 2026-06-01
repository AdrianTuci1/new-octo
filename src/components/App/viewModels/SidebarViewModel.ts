import type { WorkspaceConversation } from '../chrome';

export class SidebarViewModel {
  constructor(
    public readonly workspaceConversations: WorkspaceConversation[],
    public readonly selectedOpenConversationId: string | null,
    public readonly openConversationIds: string[]
  ) {}

  getWorkspaceConversations(): WorkspaceConversation[] {
    return this.workspaceConversations;
  }

  getOpenConversationIds(): string[] {
    return this.openConversationIds;
  }

  getSelectedOpenConversationId(): string | null {
    return this.selectedOpenConversationId;
  }

  buildConversationLabel(conversation: WorkspaceConversation): string {
    const title = conversation.title || 'New agent conversation';
    const parts: string[] = [title];

    if (conversation.branchLabel && conversation.branchLabel !== '~') {
      parts.push(conversation.branchLabel);
    }

    if (conversation.timeLabel && conversation.timeLabel !== 'just now' && conversation.timeLabel !== 'recently') {
      parts.push(conversation.timeLabel);
    }

    return parts.join(' · ');
  }
}
