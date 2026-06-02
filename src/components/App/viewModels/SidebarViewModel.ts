import type { MemoryConversationSummary } from '../../../types';
import type { WorkspaceChromeTab, WorkspaceConversation, WorkspacePaneLayout } from '../chrome';
import * as Utils from '../utils';
import type { TerminalSessionState } from '../utils';

type SidebarViewModelParams = {
  tabs: WorkspaceChromeTab[];
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>;
  getLauncherSessionForPane: (paneId: string | null) => TerminalSessionState | null;
  memoryConversations: MemoryConversationSummary[];
  memoryConversationsById: Map<string, MemoryConversationSummary>;
  terminalSessions: Record<string, TerminalSessionState>;
  activeConversationId: string | null;
};

export class SidebarViewModel {
  constructor(private readonly params: SidebarViewModelParams) {}

  getOrderedConversationIds(): string[] {
    const {
      tabs,
      paneLayoutsByTabId,
      getLauncherSessionForPane
    } = this.params;

    return tabs
      .filter((tab) => tab.kind === 'terminal')
      .flatMap((tab) => Utils.collectPaneIdsFromLayout(
        paneLayoutsByTabId[tab.id] ?? Utils.createDefaultPaneLayout(tab.id)
      ))
      .map((paneId) => {
        const session = getLauncherSessionForPane(paneId);
        return session?.composerSurface === 'agent'
          ? session.activeConversationId ?? null
          : null;
      })
      .filter((conversationId): conversationId is string => Boolean(conversationId));
  }

  getOpenConversationIds(): string[] {
    return Array.from(new Set(this.getOrderedConversationIds()));
  }

  getOpenConversationIdSet(): Set<string> {
    return new Set(this.getOpenConversationIds());
  }

  getWorkspaceConversations(): WorkspaceConversation[] {
    const {
      memoryConversations,
      memoryConversationsById
    } = this.params;
    const openConversationIds = this.getOpenConversationIds();
    const openConversationIdSet = new Set(openConversationIds);

    return [
      ...openConversationIds.map((conversationId) => {
        const summary = memoryConversationsById.get(conversationId);
        if (summary) {
          return Utils.buildConversationFromSummary(summary);
        }

        return this.buildUnsavedConversation(conversationId);
      }),
      ...memoryConversations
        .filter((summary) => !openConversationIdSet.has(summary.id))
        .map((summary) => Utils.buildConversationFromSummary(summary))
    ];
  }

  getSelectedOpenConversationId(): string | null {
    const { activeConversationId } = this.params;
    if (!activeConversationId) {
      return null;
    }

    return this.getOpenConversationIdSet().has(activeConversationId)
      ? activeConversationId
      : null;
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

  private buildUnsavedConversation(conversationId: string): WorkspaceConversation {
    const { terminalSessions } = this.params;
    const hostingSession = Object.values(terminalSessions)
      .find((session) => session.activeConversationId === conversationId) ?? null;
    const cwdSegments = hostingSession?.workingDirectory?.split('/').filter(Boolean) ?? [];

    return {
      id: conversationId,
      title: 'New agent conversation',
      branchLabel: cwdSegments[cwdSegments.length - 1] ?? '~',
      timeLabel: 'just now'
    };
  }
}
