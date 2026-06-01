import { formatCompactPathLabel } from '../../../lib/pathLabels';
import type { MemoryConversationRecord, MemoryConversationSummary } from '../../../types';
import type { WorkspaceChromeTab, WorkspacePaneLayout } from '../chrome';
import type { TerminalSessionState } from '../utils';
import { latestFinishedCommandStatus, latestUserPromptTitle } from '../hooks/useAppWindow/helpers';

export type GetLauncherSessionForPane = (paneId: string | null) => TerminalSessionState | null;

export class TabViewModel {
  constructor(
    public readonly tabs: WorkspaceChromeTab[],
    public readonly paneLayoutsByTabId: Record<string, WorkspacePaneLayout>,
    public readonly terminalSessions: Record<string, TerminalSessionState>,
    public readonly getLauncherSessionForPane: GetLauncherSessionForPane,
    public readonly memoryConversationsById: Map<string, MemoryConversationSummary>,
    public readonly memoryConversationRecords: Record<string, MemoryConversationRecord>,
    public readonly defaultWorkingDirectory: string | null,
    public readonly pathContextHomeDir: string | null | undefined,
    public readonly useLatestPromptTabNames: boolean
  ) {}

  getDisplayTabs(): WorkspaceChromeTab[] {
    return this.tabs.map((tab) => {
      if (tab.kind !== 'terminal') {
        return tab;
      }

      const activePaneIdForTab = this.paneLayoutsByTabId[tab.id]?.activePaneId ?? tab.id;
      const session = this.getLauncherSessionForPane(activePaneIdForTab);
      const conversationId = session?.activeConversationId ?? null;
      const activeConversation = conversationId
        ? this.memoryConversationsById.get(conversationId) ?? null
        : null;
      const activeConversationRecord = conversationId
        ? this.memoryConversationRecords[conversationId] ?? null
        : null;
      const latestPromptTitle = this.useLatestPromptTabNames
        ? latestUserPromptTitle(activeConversationRecord)
        : null;
      const pathLabel = formatCompactPathLabel(
        session?.workingDirectory ?? this.defaultWorkingDirectory,
        this.pathContextHomeDir ?? null
      );

      return {
        ...tab,
        label: tab.customLabel?.trim()
          || latestPromptTitle
          || activeConversation?.title
          || (conversationId ? 'New agent conversation' : pathLabel),
        lastExecutionStatus: latestFinishedCommandStatus(
          session ?? undefined,
          activeConversation?.status ?? null
        )
      };
    });
  }

  getDisplayTabLabelsById(): Map<string, string> {
    return new Map(this.getDisplayTabs().map((tab) => [tab.id, tab.label]));
  }
}
