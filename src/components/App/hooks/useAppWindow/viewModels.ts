import { useMemo } from 'react';
import { formatCompactPathLabel } from '../../../../lib/pathLabels';
import type { MemoryConversationRecord, MemoryConversationSummary } from '../../../../types';
import type { WorkspaceChromeTab, WorkspaceConversation, WorkspacePaneLayout } from '../../chrome';
import * as Utils from '../../utils';
import { latestFinishedCommandStatus, latestUserPromptTitle } from './helpers';

type UseAppWindowViewModelsParams = {
  activeConversationId: string | null;
  defaultWorkingDirectory: string | null;
  getLauncherSessionForPane: (paneId: string | null) => ReturnType<typeof Utils.createEmptyTerminalSession> | null;
  memoryConversationRecords: Record<string, MemoryConversationRecord>;
  memoryConversations: MemoryConversationSummary[];
  memoryConversationsById: Map<string, MemoryConversationSummary>;
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>;
  pathContextHomeDir: string | null | undefined;
  tabs: WorkspaceChromeTab[];
  terminalSessions: Record<string, ReturnType<typeof Utils.createEmptyTerminalSession>>;
  useLatestPromptTabNames: boolean;
};

export function useAppWindowViewModels({
  activeConversationId,
  defaultWorkingDirectory,
  getLauncherSessionForPane,
  memoryConversationRecords,
  memoryConversations,
  memoryConversationsById,
  paneLayoutsByTabId,
  pathContextHomeDir,
  tabs,
  terminalSessions,
  useLatestPromptTabNames
}: UseAppWindowViewModelsParams) {
  const orderedConversationIds = useMemo(() => tabs
    .filter((tab) => tab.kind === 'terminal')
    .flatMap((tab) => Utils.collectPaneIdsFromLayout(
      paneLayoutsByTabId[tab.id] ?? Utils.createDefaultPaneLayout(tab.id)
    ))
    .map((paneId) => getLauncherSessionForPane(paneId)?.activeConversationId ?? null)
    .filter((conversationId): conversationId is string => Boolean(conversationId)), [getLauncherSessionForPane, paneLayoutsByTabId, tabs]);

  const dedupedOrderedConversationIds = useMemo(
    () => Array.from(new Set(orderedConversationIds)),
    [orderedConversationIds]
  );

  const openConversationIds = useMemo(
    () => dedupedOrderedConversationIds,
    [dedupedOrderedConversationIds]
  );

  const openConversationIdSet = useMemo(
    () => new Set(openConversationIds),
    [openConversationIds]
  );

  const workspaceConversations = useMemo(() => [
    ...openConversationIds.map((conversationId) => {
      const summary = memoryConversationsById.get(conversationId);
      if (summary) {
        return Utils.buildConversationFromSummary(summary);
      }

      const hostingSession = Object.values(terminalSessions).find((session) => session.activeConversationId === conversationId) ?? null;
      const cwdSegments = hostingSession?.workingDirectory?.split('/').filter(Boolean) ?? [];
      return {
        id: conversationId,
        title: 'New agent conversation',
        branchLabel: cwdSegments[cwdSegments.length - 1] ?? '~',
        timeLabel: 'just now'
      } satisfies WorkspaceConversation;
    }),
    ...memoryConversations
      .filter((summary) => !openConversationIdSet.has(summary.id))
      .map((summary) => Utils.buildConversationFromSummary(summary))
  ], [memoryConversations, memoryConversationsById, openConversationIdSet, openConversationIds, terminalSessions]);

  const selectedOpenConversationId = activeConversationId && memoryConversationsById.has(activeConversationId)
    ? activeConversationId
    : activeConversationId && workspaceConversations.some((conversation) => conversation.id === activeConversationId)
      ? activeConversationId
      : null;

  const displayTabs = useMemo(() => tabs.map((tab) => {
    if (tab.kind !== 'terminal') {
      return tab;
    }

    const activePaneIdForTab = paneLayoutsByTabId[tab.id]?.activePaneId ?? tab.id;
    const session = getLauncherSessionForPane(activePaneIdForTab);
    const conversationId = session?.activeConversationId ?? null;
    const isAgentConversationActive = Boolean(conversationId && session?.composerSurface === 'agent');
    const activeConversation = isAgentConversationActive && conversationId
      ? memoryConversationsById.get(conversationId) ?? null
      : null;
    const activeConversationRecord = isAgentConversationActive && conversationId
      ? memoryConversationRecords[conversationId] ?? null
      : null;
    const latestPromptTitle = useLatestPromptTabNames ? latestUserPromptTitle(activeConversationRecord) : null;
    const pathLabel = formatCompactPathLabel(
      session?.workingDirectory ?? defaultWorkingDirectory,
      pathContextHomeDir ?? null
    );
    const conversationTitle = latestPromptTitle || activeConversation?.title || (conversationId ? 'New agent conversation' : null);

    return {
      ...tab,
      label: tab.customLabel?.trim() || (isAgentConversationActive ? conversationTitle : null) || pathLabel,
      subtitle: isAgentConversationActive ? pathLabel : undefined,
      lastExecutionStatus: latestFinishedCommandStatus(session ?? undefined, activeConversation?.status ?? null)
    };
  }), [
    defaultWorkingDirectory,
    getLauncherSessionForPane,
    memoryConversationRecords,
    memoryConversationsById,
    paneLayoutsByTabId,
    pathContextHomeDir,
    tabs,
    useLatestPromptTabNames
  ]);

  const displayTabLabelsById = useMemo(
    () => new Map(displayTabs.map((tab) => [tab.id, tab.label])),
    [displayTabs]
  );

  return {
    dedupedOrderedConversationIds,
    displayTabLabelsById,
    displayTabs,
    openConversationIdSet,
    openConversationIds,
    selectedOpenConversationId,
    workspaceConversations
  };
}
