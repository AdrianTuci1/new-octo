import { useCallback } from 'react';
import { useMemoryStore } from '../../../../stores/memoryStore';
import type { WorkspaceChromeTab, WorkspacePaneLayout } from '../../chrome';
import * as Utils from '../../utils';
import type { TerminalSessionState } from '../../utils';

type UseAppWindowConversationActionsParams = {
  createTerminalTab: (options?: { label?: string; terminalSession?: TerminalSessionState }) => WorkspaceChromeTab;
  defaultWorkingDirectory: string | null;
  deleteConversation: ReturnType<typeof useMemoryStore.getState>['deleteConversation'];
  getLauncherSessionForPane: (paneId: string | null) => TerminalSessionState | null;
  memoryConversationsById: Map<string, { messageCount?: number }>;
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>;
  paneSessionBindingsByPaneId: Utils.WorkspacePaneSessionBindings;
  preferredConversationLayout: string;
  resolvePaneId: (tabId: string) => string;
  resolveTerminalTabId: () => string;
  selectedTab: WorkspaceChromeTab;
  selectedTabId: string;
  setOpenPastConversationBaselineById: (updater: Record<string, number> | ((current: Record<string, number>) => Record<string, number>)) => void;
  setPaneLayoutsByTabId: (updater: Record<string, WorkspacePaneLayout> | ((current: Record<string, WorkspacePaneLayout>) => Record<string, WorkspacePaneLayout>)) => void;
  setPaneSessionBindingsByPaneId: (updater: Utils.WorkspacePaneSessionBindings | ((current: Utils.WorkspacePaneSessionBindings) => Utils.WorkspacePaneSessionBindings)) => void;
  setSelectedTabId: (updater: string | ((current: string) => string)) => void;
  setTerminalSessions: (updater: Record<string, TerminalSessionState> | ((current: Record<string, TerminalSessionState>) => Record<string, TerminalSessionState>)) => void;
};

export function useAppWindowConversationActions({
  createTerminalTab,
  defaultWorkingDirectory,
  deleteConversation,
  getLauncherSessionForPane,
  memoryConversationsById,
  paneLayoutsByTabId,
  paneSessionBindingsByPaneId,
  preferredConversationLayout,
  resolvePaneId,
  resolveTerminalTabId,
  selectedTab,
  selectedTabId,
  setOpenPastConversationBaselineById,
  setPaneLayoutsByTabId,
  setPaneSessionBindingsByPaneId,
  setSelectedTabId,
  setTerminalSessions
}: UseAppWindowConversationActionsParams) {
  const onSelectConversation = useCallback((conversationId: string) => {
    const existingPaneId = Object.keys(paneSessionBindingsByPaneId).find((paneId) => (
      getLauncherSessionForPane(paneId)?.activeConversationId === conversationId
    )) ?? null;
    const existingTabId = existingPaneId
      ? Utils.findTabIdForPane(paneLayoutsByTabId, existingPaneId)
      : null;
    const shouldKeepConversationInPast = memoryConversationsById.has(conversationId);

    if (shouldKeepConversationInPast) {
      const baselineMessageCount = memoryConversationsById.get(conversationId)?.messageCount ?? 0;
      setOpenPastConversationBaselineById((current) => (
        current[conversationId] === baselineMessageCount
          ? current
          : {
              ...current,
              [conversationId]: baselineMessageCount
            }
      ));
    }

    if (existingPaneId && existingTabId) {
      if (selectedTabId !== existingTabId) {
        setSelectedTabId(existingTabId);
      }
      setPaneLayoutsByTabId((current) => ({
        ...current,
        [existingTabId]: {
          ...(current[existingTabId] ?? Utils.createDefaultPaneLayout(existingTabId)),
          activePaneId: existingPaneId
        }
      }));
      return;
    }

    if (preferredConversationLayout === 'current-pane') {
      const tabId = resolveTerminalTabId();
      const paneId = resolvePaneId(tabId);
      setTerminalSessions((current) => ({
        ...current,
        [paneId]: {
          ...current[paneId],
          activeConversationId: conversationId,
          composerSurface: 'agent'
        }
      }));
      setSelectedTabId(tabId);
      return;
    }

    if (preferredConversationLayout === 'split-pane') {
      const tabId = selectedTab.kind === 'terminal' ? selectedTab.id : resolveTerminalTabId();
      const sourcePaneId = resolvePaneId(tabId);
      const nextPaneId = Utils.buildPaneId(
        tabId,
        Object.values(paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
      );
      const sourceSession = getLauncherSessionForPane(sourcePaneId) ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);

      setTerminalSessions((current) => ({
        ...current,
        [nextPaneId]: {
          ...Utils.createEmptyTerminalSession(sourceSession.workingDirectory),
          activeConversationId: conversationId,
          composerSurface: 'agent'
        }
      }));
      setPaneSessionBindingsByPaneId((current) => ({
        ...current,
        [nextPaneId]: nextPaneId
      }));
      setPaneLayoutsByTabId((current) => ({
        ...current,
        [tabId]: Utils.splitPaneLayout(
          current[tabId] ?? Utils.createDefaultPaneLayout(tabId),
          sourcePaneId,
          'horizontal',
          nextPaneId
        )
      }));
      setSelectedTabId(tabId);
      return;
    }

    const nextTab = createTerminalTab();
    setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        ...current[nextTab.id],
        activeConversationId: conversationId,
        composerSurface: 'agent'
      }
    }));
    setSelectedTabId(nextTab.id);
  }, [
    createTerminalTab,
    defaultWorkingDirectory,
    getLauncherSessionForPane,
    memoryConversationsById,
    paneLayoutsByTabId,
    paneSessionBindingsByPaneId,
    preferredConversationLayout,
    resolvePaneId,
    resolveTerminalTabId,
    selectedTab,
    selectedTabId,
    setOpenPastConversationBaselineById,
    setPaneLayoutsByTabId,
    setPaneSessionBindingsByPaneId,
    setSelectedTabId,
    setTerminalSessions
  ]);

  const onNewConversation = useCallback((_options?: { seedPrompt?: string }) => {
    const nextConversationId = Utils.createConversationId();
    const terminalTabId = resolveTerminalTabId();
    const paneId = resolvePaneId(terminalTabId);

    setOpenPastConversationBaselineById((current) => {
      if (!(nextConversationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[nextConversationId];
      return next;
    });

    setTerminalSessions((current) => {
      if (current[paneId]?.activeConversationId === nextConversationId) {
        return current;
      }
      return {
        ...current,
        [paneId]: {
          ...current[paneId],
          activeConversationId: nextConversationId,
          composerSurface: 'agent'
        }
      };
    });
    return nextConversationId;
  }, [resolvePaneId, resolveTerminalTabId, setOpenPastConversationBaselineById, setTerminalSessions]);

  const onNewConversationInNewTab = useCallback((_options?: { seedPrompt?: string }) => {
    const nextConversationId = Utils.createConversationId();
    const nextTab = createTerminalTab();

    setOpenPastConversationBaselineById((current) => {
      if (!(nextConversationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[nextConversationId];
      return next;
    });

    setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        ...current[nextTab.id],
        activeConversationId: nextConversationId,
        composerSurface: 'agent'
      }
    }));
    setSelectedTabId(nextTab.id);
    return nextConversationId;
  }, [createTerminalTab, setOpenPastConversationBaselineById, setSelectedTabId, setTerminalSessions]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    await deleteConversation(conversationId);
    const matchingPaneIds = Object.keys(paneSessionBindingsByPaneId)
      .filter((paneId) => getLauncherSessionForPane(paneId)?.activeConversationId === conversationId);

    setOpenPastConversationBaselineById((current) => {
      if (!(conversationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[conversationId];
      return next;
    });
    if (matchingPaneIds.length === 0) {
      return;
    }
    setTerminalSessions((current) => {
      const next = { ...current };
      matchingPaneIds.forEach((paneId) => {
        next[paneId] = {
          ...next[paneId],
          activeConversationId: null,
          composerSurface: 'terminal'
        };
      });
      return next;
    });
  }, [deleteConversation, getLauncherSessionForPane, paneSessionBindingsByPaneId, setOpenPastConversationBaselineById, setTerminalSessions]);

  const handleForkConversationInNewTab = useCallback((conversationId: string) => {
    const nextTab = createTerminalTab();
    setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        ...current[nextTab.id],
        activeConversationId: conversationId,
        composerSurface: 'agent'
      }
    }));
    setSelectedTabId(nextTab.id);
  }, [createTerminalTab, setSelectedTabId, setTerminalSessions]);

  const handleForkConversationInNewPane = useCallback((conversationId: string) => {
    const tabId = selectedTab.kind === 'terminal' ? selectedTab.id : resolveTerminalTabId();
    const sourcePaneId = resolvePaneId(tabId);
    const nextPaneId = Utils.buildPaneId(
      tabId,
      Object.values(paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );
    const sourceSession = getLauncherSessionForPane(sourcePaneId) ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);

    setTerminalSessions((current) => ({
      ...current,
      [nextPaneId]: {
        ...Utils.createEmptyTerminalSession(sourceSession.workingDirectory),
        activeConversationId: conversationId,
        composerSurface: 'agent'
      }
    }));
    setPaneSessionBindingsByPaneId((current) => ({
      ...current,
      [nextPaneId]: nextPaneId
    }));
    setPaneLayoutsByTabId((current) => ({
      ...current,
      [tabId]: Utils.splitPaneLayout(
        current[tabId] ?? Utils.createDefaultPaneLayout(tabId),
        sourcePaneId,
        'horizontal',
        nextPaneId
      )
    }));
    setSelectedTabId(tabId);
  }, [
    defaultWorkingDirectory,
    getLauncherSessionForPane,
    paneLayoutsByTabId,
    resolvePaneId,
    resolveTerminalTabId,
    selectedTab,
    setPaneLayoutsByTabId,
    setPaneSessionBindingsByPaneId,
    setSelectedTabId,
    setTerminalSessions
  ]);

  return {
    handleDeleteConversation,
    handleForkConversationInNewPane,
    handleForkConversationInNewTab,
    onNewConversation,
    onNewConversationInNewTab,
    onSelectConversation
  };
}
