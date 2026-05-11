import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initialWorkspaceChromeTabs, defaultWorkspaceChromeTabId } from '../chrome';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from '../settings/settingsData';
import { formatCompactPathLabel } from '../../../lib/pathLabels';
import { useUIStore } from '../../../stores';
import { useMemoryStore } from '../../../stores/memoryStore';
import type { FilesystemPathContext } from '../../../types/filesystem';
import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock } from '../../../types/terminal';
import type { WorkspaceChromeTab, WorkspaceConversation, WorkspacePaneLayout } from '../chrome';
import * as Utils from '../utils';
import type { TerminalSessionState } from '../utils';

const OPEN_CLOUD_PROFILE_DRAWER_EVENT = 'octomus:open-cloud-profile-drawer';

type OpenCloudProfileDrawerPayload = {
  profileId: string;
  sectionId: string;
};

function buildEmptyWorkspaceSnapshot(options: {
  activeSectionId: string;
  expandedGroupIds: string[];
  isAgentsActive: boolean;
  isSidebarOpen: boolean;
}) {
  return {
    id: 'workspace-main',
    schemaVersion: 1,
    tabs: [],
    selectedTabId: null,
    launcherTabId: null,
    paneLayoutsByTabId: {},
    conversations: [],
    terminalSessions: {},
    activeSectionId: options.activeSectionId,
    expandedGroupIds: options.expandedGroupIds,
    isSidebarOpen: options.isSidebarOpen,
    isAgentsActive: options.isAgentsActive,
    nextTerminalIndex: 1,
    nextConversationIndex: 1,
    updatedAt: new Date().toISOString()
  };
}

const SETTINGS_TAB_ID = 'settings';

export function useAppWindow() {
  const [tabs, setTabs] = useState<WorkspaceChromeTab[]>(initialWorkspaceChromeTabs);
  const [selectedTabId, setSelectedTabId] = useState(defaultWorkspaceChromeTabId);
  const [launcherTabId, setLauncherTabId] = useState<string | null>('terminal-main');
  const [paneLayoutsByTabId, setPaneLayoutsByTabId] = useState<Record<string, WorkspacePaneLayout>>({
    'terminal-main': Utils.createDefaultPaneLayout('terminal-main')
  });
  const [activeSectionId, setActiveSectionId] = useState(settingsDefaultSectionId);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>(settingsDefaultExpandedGroupIds);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [nextTerminalIndex, setNextTerminalIndex] = useState(1);
  const [terminalSessions, setTerminalSessions] = useState<Record<string, TerminalSessionState>>(
    Utils.buildTerminalSessionState(initialWorkspaceChromeTabs)
  );
  const [pathContext, setPathContext] = useState<FilesystemPathContext | null>(null);
  const [isAgentsActive, setIsAgentsActive] = useState(false);
  const [isSpotlightVisible, setIsSpotlightVisible] = useState(false);
  const [openPastConversationBaselineById, setOpenPastConversationBaselineById] = useState<Record<string, number>>({});
  const didRestoreWorkspaceRef = useRef(false);
  const isClosingWorkspaceRef = useRef(false);
  const latestLocalWorkspaceComparableRef = useRef<ReturnType<typeof Utils.buildWorkspaceComparableSnapshot> | null>(null);
  const lastSavedWorkspaceSignatureRef = useRef<string | null>(null);
  const memoryStatus = useMemoryStore((state) => state.status);
  const memoryWorkspace = useMemoryStore((state) => state.workspace);
  const memoryConversations = useMemoryStore((state) => state.conversations);
  const saveWorkspace = useMemoryStore((state) => state.saveWorkspace);
  const deleteConversation = useMemoryStore((state) => state.deleteConversation);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const setIsCloudProfileDrawerOpen = useUIStore((state) => state.setIsCloudProfileDrawerOpen);
  const setSelectedCloudProfileIdForEdit = useUIStore((state) => state.setSelectedCloudProfileIdForEdit);
  const memoryConversationsById = useMemo(() => new Map(memoryConversations.map((conversation) => [conversation.id, conversation])), [memoryConversations]);

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0] ?? initialWorkspaceChromeTabs[0];
  const selectedPaneLayout = selectedTab.kind === 'terminal'
    ? paneLayoutsByTabId[selectedTab.id] ?? Utils.createDefaultPaneLayout(selectedTab.id)
    : null;
  const selectedPaneIds = selectedPaneLayout ? Utils.collectPaneIdsFromLayout(selectedPaneLayout) : [];
  const activePaneId = selectedPaneLayout?.activePaneId ?? selectedPaneIds[0] ?? null;
  const activeConversationId = activePaneId
    ? terminalSessions[activePaneId]?.activeConversationId ?? null
    : null;
  const isSettingsView = selectedTab.kind === 'settings';
  const isLauncherView = !isAgentsActive && selectedTab.kind === 'terminal';
  const orderedConversationIds = useMemo(() => tabs
    .filter((tab) => tab.kind === 'terminal')
    .flatMap((tab) => Utils.collectPaneIdsFromLayout(
      paneLayoutsByTabId[tab.id] ?? Utils.createDefaultPaneLayout(tab.id)
    ))
    .map((paneId) => terminalSessions[paneId]?.activeConversationId ?? null)
    .filter((conversationId): conversationId is string => Boolean(conversationId)), [paneLayoutsByTabId, tabs, terminalSessions]);
  const dedupedOrderedConversationIds = useMemo(() => Array.from(new Set(orderedConversationIds)), [orderedConversationIds]);
  const openConversationIds = useMemo(
    () => dedupedOrderedConversationIds.filter((conversationId) => !(conversationId in openPastConversationBaselineById)),
    [dedupedOrderedConversationIds, openPastConversationBaselineById]
  );
  const openConversationIdSet = useMemo(() => new Set(openConversationIds), [openConversationIds]);

  const workspaceConversations = useMemo(() => [
    // First, map the active conversations (the ones in tabs)
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
    // Then, add all other conversations from memory that aren't currently open in a tab
    ...memoryConversations
      .filter((summary) => !openConversationIdSet.has(summary.id))
      .map((summary) => Utils.buildConversationFromSummary(summary))
  ], [memoryConversations, memoryConversationsById, openConversationIdSet, openConversationIds, terminalSessions]);

  const selectedOpenConversationId = activeConversationId && memoryConversationsById.has(activeConversationId)
    ? activeConversationId
    : activeConversationId && workspaceConversations.some((conversation) => conversation.id === activeConversationId)
      ? activeConversationId
      : null;

  useEffect(() => {
    const openConversationIdSet = new Set(dedupedOrderedConversationIds);

    setOpenPastConversationBaselineById((current) => {
      let changed = false;
      let next = current;

      Object.entries(current).forEach(([conversationId, baselineMessageCount]) => {
        const summary = memoryConversationsById.get(conversationId);
        const currentMessageCount = summary?.messageCount ?? baselineMessageCount;
        const shouldRemove = !openConversationIdSet.has(conversationId) || currentMessageCount > baselineMessageCount;

        if (!shouldRemove) {
          return;
        }

        if (!changed) {
          next = { ...current };
          changed = true;
        }

        delete next[conversationId];
      });

      return changed ? next : current;
    });
  }, [dedupedOrderedConversationIds, memoryConversationsById]);

  const displayTabs = useMemo(() => tabs.map((tab) => {
    if (tab.kind !== 'terminal') {
      return tab;
    }

    const activePaneIdForTab = paneLayoutsByTabId[tab.id]?.activePaneId ?? tab.id;
    const session = terminalSessions[activePaneIdForTab];
    const activeConversation = session?.activeConversationId
      ? memoryConversationsById.get(session.activeConversationId) ?? null
      : null;
    const pathLabel = formatCompactPathLabel(
      session?.workingDirectory ?? pathContext?.homeDir ?? pathContext?.currentDir ?? null,
      pathContext?.homeDir ?? null
    );

    return {
      ...tab,
      label: tab.customLabel?.trim() || activeConversation?.title || (session?.activeConversationId ? 'New agent conversation' : pathLabel)
    };
  }), [tabs, terminalSessions, memoryConversationsById, paneLayoutsByTabId, pathContext]);

  useEffect(() => {
    latestLocalWorkspaceComparableRef.current = Utils.buildWorkspaceComparableSnapshot(
      tabs,
      selectedTabId,
      launcherTabId,
      paneLayoutsByTabId,
      terminalSessions,
      activeSectionId,
      expandedGroupIds,
      isSidebarOpen,
      isAgentsActive,
      nextTerminalIndex
    );
  }, [
    activeSectionId,
    expandedGroupIds,
    isAgentsActive,
    isSidebarOpen,
    launcherTabId,
    nextTerminalIndex,
    paneLayoutsByTabId,
    selectedTabId,
    tabs,
    terminalSessions
  ]);

  useEffect(() => {
    void invoke<FilesystemPathContext>('terminal_get_path_context')
      .then((context) => {
        setPathContext(context);
        setTerminalSessions((current) => Object.fromEntries(
          Object.entries(current).map(([tabId, session]) => [
            tabId,
            {
              ...session,
              workingDirectory: session.workingDirectory ?? context.homeDir
            } satisfies TerminalSessionState
          ])
        ));
      })
      .catch((error) => {
        console.warn('[AppWindow] failed to load path context', error);
      });
  }, []);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    let cancelled = false;
    let intervalId = 0;

    const syncSpotlightVisibility = async () => {
      const spotlightWindow = await Window.getByLabel('main').catch(() => null);
      const visible = await spotlightWindow?.isVisible().catch(() => false) ?? false;
      if (!cancelled) {
        setIsSpotlightVisible(visible);
      }
    };

    void syncSpotlightVisibility();
    intervalId = window.setInterval(() => {
      void syncSpotlightVisibility();
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (memoryStatus !== 'ready' || !memoryWorkspace) {
      return;
    }

    const nextComparable = Utils.buildComparableFromWorkspace(memoryWorkspace, pathContext?.homeDir ?? null);
    const currentComparable = latestLocalWorkspaceComparableRef.current;
    const nextSignature = JSON.stringify(nextComparable);

    if (didRestoreWorkspaceRef.current && currentComparable && JSON.stringify(currentComparable) === nextSignature) {
      return;
    }

    didRestoreWorkspaceRef.current = true;
    lastSavedWorkspaceSignatureRef.current = nextSignature;
    setTabs(nextComparable.tabs);
    setSelectedTabId(nextComparable.selectedTabId);
    setLauncherTabId(nextComparable.launcherTabId);
    setPaneLayoutsByTabId(nextComparable.paneLayoutsByTabId);
    setActiveSectionId(nextComparable.activeSectionId);
    setExpandedGroupIds(nextComparable.expandedGroupIds);
    setIsSidebarOpen(nextComparable.isSidebarOpen);
    setIsAgentsActive(nextComparable.isAgentsActive);
    setNextTerminalIndex(nextComparable.nextTerminalIndex);
    setTerminalSessions(nextComparable.terminalSessions);
  }, [memoryStatus, memoryWorkspace, pathContext?.homeDir]);

  useEffect(() => {
    const normalizedPaneLayouts = Utils.normalizePaneLayoutsByTabId(tabs, paneLayoutsByTabId);
    const normalizedPaneIds = new Set(
      Object.values(normalizedPaneLayouts).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );

    if (JSON.stringify(normalizedPaneLayouts) !== JSON.stringify(paneLayoutsByTabId)) {
      setPaneLayoutsByTabId(normalizedPaneLayouts);
      return;
    }

    setTerminalSessions((current) => {
      const nextSessions = Object.fromEntries(
        Object.entries(current).filter(([paneId]) => normalizedPaneIds.has(paneId))
      ) as Record<string, TerminalSessionState>;

      let changed = Object.keys(nextSessions).length !== Object.keys(current).length;

      normalizedPaneIds.forEach((paneId) => {
        if (nextSessions[paneId]) {
          return;
        }

        nextSessions[paneId] = Utils.createEmptyTerminalSession(pathContext?.homeDir ?? null);
        changed = true;
      });

      return changed ? nextSessions : current;
    });
  }, [paneLayoutsByTabId, pathContext?.homeDir, tabs]);

  useEffect(() => {
    if (memoryStatus !== 'ready' || !didRestoreWorkspaceRef.current || isClosingWorkspaceRef.current) {
      return;
    }

    const comparable = latestLocalWorkspaceComparableRef.current;
    if (!comparable) {
      return;
    }

    const comparableSignature = JSON.stringify(comparable);
    if (lastSavedWorkspaceSignatureRef.current === comparableSignature) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastSavedWorkspaceSignatureRef.current = comparableSignature;
      void saveWorkspace({
        id: 'workspace-main',
        schemaVersion: 1,
        tabs,
        selectedTabId,
        launcherTabId,
        paneLayoutsByTabId,
        conversations: workspaceConversations.filter((c) => openConversationIdSet.has(c.id)),
        terminalSessions,
        activeSectionId,
        expandedGroupIds,
        isSidebarOpen,
        isAgentsActive,
        nextTerminalIndex,
        nextConversationIndex: 1,
        updatedAt: new Date().toISOString()
      });
    }, 75);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    memoryStatus,
    activeSectionId,
    expandedGroupIds,
    isAgentsActive,
    isSidebarOpen,
    saveWorkspace,
    launcherTabId,
    nextTerminalIndex,
    paneLayoutsByTabId,
    selectedTabId,
    tabs,
    terminalSessions,
    workspaceConversations,
    openConversationIdSet
  ]);

  const createTerminalTab = useCallback(() => {
    const nextTab = Utils.buildTerminalTab(nextTerminalIndex, '~');
    setTabs((current) => [...current, nextTab]);
    setPaneLayoutsByTabId((current) => ({
      ...current,
      [nextTab.id]: Utils.createDefaultPaneLayout(nextTab.id)
    }));
    setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: Utils.createEmptyTerminalSession(pathContext?.homeDir ?? null)
    }));
    setNextTerminalIndex((value) => value + 1);
    return nextTab;
  }, [nextTerminalIndex, pathContext]);

  const closeAppWindowWithFreshWorkspace = useCallback(async () => {
    isClosingWorkspaceRef.current = true;
    const sessionIds = Object.values(terminalSessions)
      .flatMap((session) => [session.terminalSessionId, session.agentTerminalSessionId])
      .filter((sessionId): sessionId is string => Boolean(sessionId));

    await Promise.all(
      sessionIds.map((sessionId) => invoke('terminal_kill_session', {
        request: { sessionId }
      }).catch(() => null))
    );

    await saveWorkspace(buildEmptyWorkspaceSnapshot({
      activeSectionId,
      expandedGroupIds,
      isAgentsActive,
      isSidebarOpen
    }));

    if ((window as any).__TAURI_INTERNALS__) {
      await getCurrentWindow().close();
    }
  }, [terminalSessions, saveWorkspace, activeSectionId, expandedGroupIds, isAgentsActive, isSidebarOpen]);

  const resolveTerminalTabId = useCallback(() => {
    if (selectedTab.kind === 'terminal' && (!isSpotlightVisible || selectedTab.id !== launcherTabId)) {
      return selectedTab.id;
    }

    const firstTerminalTab = tabs.find((tab) => (
      tab.kind === 'terminal' && (!isSpotlightVisible || tab.id !== launcherTabId)
    ));
    if (firstTerminalTab) {
      setSelectedTabId(firstTerminalTab.id);
      return firstTerminalTab.id;
    }

    const nextTab = createTerminalTab();
    setSelectedTabId(nextTab.id);
    return nextTab.id;
  }, [createTerminalTab, isSpotlightVisible, launcherTabId, selectedTab, tabs]);

  const resolvePaneId = useCallback((tabId: string) => {
    const paneLayout = paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId);
    const paneIds = Utils.collectPaneIdsFromLayout(paneLayout);
    return paneLayout.activePaneId ?? paneIds[0] ?? tabId;
  }, [paneLayoutsByTabId]);

  const onToggleGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  }, []);

  const onSelectSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
  }, []);

  const onSelectTab = useCallback((tabId: string) => {
    if (selectedTabId === tabId) return;
    setSelectedTabId(tabId);
  }, [selectedTabId]);

  const onNewTerminalTab = useCallback(() => {
    const nextTab = createTerminalTab();
    setSelectedTabId(nextTab.id);
  }, [createTerminalTab]);

  const onSelectConversation = useCallback((conversationId: string) => {
    const existingPaneId = Object.entries(terminalSessions).find(([, session]) => (
      session.activeConversationId === conversationId
    ))?.[0] ?? null;
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
  }, [createTerminalTab, memoryConversationsById, paneLayoutsByTabId, selectedTabId, terminalSessions]);

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
      if (current[paneId]?.activeConversationId === nextConversationId) return current;
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
  }, [resolvePaneId, resolveTerminalTabId]);

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
  }, [createTerminalTab]);

  const onFocusPane = useCallback((paneId: string) => {
    if (selectedTab.kind !== 'terminal' || activePaneId === paneId) {
      return;
    }

    setPaneLayoutsByTabId((current) => ({
      ...current,
      [selectedTab.id]: {
        ...(current[selectedTab.id] ?? Utils.createDefaultPaneLayout(selectedTab.id)),
        activePaneId: paneId
      }
    }));
  }, [activePaneId, selectedTab]);

  const onSplitTerminal = useCallback((direction: 'right' | 'up') => {
    const tabId = selectedTab.kind === 'terminal' ? selectedTab.id : resolveTerminalTabId();
    const sourcePaneId = resolvePaneId(tabId);
    const nextPaneId = Utils.buildPaneId(
      tabId,
      Object.values(paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );
    const sourceSession = terminalSessions[sourcePaneId] ?? Utils.createEmptyTerminalSession(pathContext?.homeDir ?? null);

    setPaneLayoutsByTabId((current) => ({
      ...current,
      [tabId]: Utils.splitPaneLayout(
        current[tabId] ?? Utils.createDefaultPaneLayout(tabId),
        sourcePaneId,
        direction === 'up' ? 'vertical' : 'horizontal',
        nextPaneId
      )
    }));
    setTerminalSessions((current) => ({
      ...current,
      [nextPaneId]: {
        ...Utils.createEmptyTerminalSession(sourceSession.workingDirectory),
        workingDirectory: sourceSession.workingDirectory
      }
    }));
    setSelectedTabId(tabId);
  }, [paneLayoutsByTabId, pathContext?.homeDir, resolvePaneId, resolveTerminalTabId, selectedTab, terminalSessions]);

  const onCloseTab = useCallback((tabId: string) => {
    if (tabs.length <= 1) {
      void closeAppWindowWithFreshWorkspace();
      return;
    }

    const paneIds = Utils.collectPaneIdsFromLayout(
      paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId)
    );
    const closingSessionIds = paneIds
      .flatMap((paneId) => [
        terminalSessions[paneId]?.terminalSessionId ?? null,
        terminalSessions[paneId]?.agentTerminalSessionId ?? null
      ])
      .filter((sessionId): sessionId is string => Boolean(sessionId));

    closingSessionIds.forEach((sessionId) => {
      void invoke('terminal_kill_session', {
        request: { sessionId }
      }).catch(() => {});
    });

    setTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (nextTabs.length === 0) {
        return current;
      }

      const fallbackTabId = nextTabs[0]?.id ?? defaultWorkspaceChromeTabId;
      if (selectedTabId === tabId) setSelectedTabId(fallbackTabId);

      return nextTabs;
    });
    setLauncherTabId((current) => {
      if (current !== tabId) {
        return current;
      }

      const fallbackTerminal = tabs.find((tab) => tab.id !== tabId && tab.kind === 'terminal');
      return fallbackTerminal?.id ?? null;
    });
    setPaneLayoutsByTabId((current) => {
      const nextLayouts = { ...current };
      delete nextLayouts[tabId];
      return nextLayouts;
    });
    setTerminalSessions((current) => {
      const nextSessions = { ...current };
      paneIds.forEach((paneId) => {
        delete nextSessions[paneId];
      });
      return nextSessions;
    });
  }, [closeAppWindowWithFreshWorkspace, paneLayoutsByTabId, tabs, terminalSessions, selectedTabId]);

  const onClosePane = useCallback((paneId: string) => {
    const tabId = Utils.findTabIdForPane(paneLayoutsByTabId, paneId);
    if (!tabId) {
      return;
    }

    const paneIds = Utils.collectPaneIdsFromLayout(paneLayoutsByTabId[tabId]);
    if (paneIds.length <= 1) {
      onCloseTab(tabId);
      return;
    }

    const session = terminalSessions[paneId];
    if (session) {
      const closingSessionIds = [session.terminalSessionId, session.agentTerminalSessionId].filter(
        (id): id is string => Boolean(id)
      );
      closingSessionIds.forEach((sessionId) => {
        void invoke('terminal_kill_session', {
          request: { sessionId }
        }).catch(() => {});
      });
    }

    setPaneLayoutsByTabId((current) => {
      const layout = current[tabId];
      if (!layout) {
        return current;
      }
      const nextLayout = Utils.removePaneFromLayout(layout, paneId);
      return {
        ...current,
        [tabId]: nextLayout ?? Utils.createDefaultPaneLayout(tabId)
      };
    });

    setTerminalSessions((current) => {
      const next = { ...current };
      delete next[paneId];
      return next;
    });
  }, [paneLayoutsByTabId, onCloseTab, terminalSessions]);

  const handleTerminalWorkingDirectoryChange = useCallback((tabId: string, path: string | null) => {
    setTerminalSessions((current) => {
      if (current[tabId]?.workingDirectory === path) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          workingDirectory: path
        }
      };
    });
  }, []);

  const handleTerminalSessionChange = useCallback((tabId: string, sessionId: string | null) => {
    setTerminalSessions((current) => {
      if (current[tabId]?.terminalSessionId === sessionId) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          terminalSessionId: sessionId
        }
      };
    });
  }, []);

  const handleAgentTerminalSessionChange = useCallback((tabId: string, sessionId: string | null) => {
    setTerminalSessions((current) => {
      if (current[tabId]?.agentTerminalSessionId === sessionId) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          agentTerminalSessionId: sessionId
        }
      };
    });
  }, []);

  const handleTerminalPendingApprovalChange = useCallback((tabId: string, approval: CommandApproval | null) => {
    setTerminalSessions((current) => {
      if (JSON.stringify(current[tabId]?.pendingApproval) === JSON.stringify(approval)) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          pendingApproval: approval
        }
      };
    });
  }, []);

  const handleTerminalBlockMetaChange = useCallback((
    tabId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    setTerminalSessions((current) => {
      if (JSON.stringify(current[tabId]?.terminalBlockMetaById) === JSON.stringify(terminalBlockMetaById)) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          terminalBlockMetaById
        }
      };
    });
  }, []);

  const handleAgentTerminalBlockMetaChange = useCallback((
    tabId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    setTerminalSessions((current) => {
      if (JSON.stringify(current[tabId]?.agentTerminalBlockMetaById) === JSON.stringify(terminalBlockMetaById)) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          agentTerminalBlockMetaById: terminalBlockMetaById
        }
      };
    });
  }, []);

  const handleSyntheticBlocksChange = useCallback((
    tabId: string,
    syntheticBlocks: TerminalCommandBlock[]
  ) => {
    setTerminalSessions((current) => {
      if (current[tabId]?.syntheticBlocks.length === syntheticBlocks.length && JSON.stringify(current[tabId]?.syntheticBlocks) === JSON.stringify(syntheticBlocks)) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          syntheticBlocks
        }
      };
    });
  }, []);

  const handleTerminalConversationChange = useCallback((tabId: string, conversationId: string | null) => {
    setTerminalSessions((current) => {
      if (current[tabId]?.activeConversationId === conversationId) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          activeConversationId: conversationId,
          composerSurface: conversationId ? 'agent' : 'terminal'
        }
      };
    });
  }, []);

  const handleTerminalComposerSurfaceChange = useCallback((tabId: string, composerSurface: 'agent' | 'terminal') => {
    setTerminalSessions((current) => {
      if (current[tabId]?.composerSurface === composerSurface) return current;
      return {
        ...current,
        [tabId]: {
          ...current[tabId],
          composerSurface
        }
      };
    });
  }, []);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    await deleteConversation(conversationId);
    const matchingPaneIds = Object.entries(terminalSessions)
      .filter(([, session]) => session.activeConversationId === conversationId)
      .map(([paneId]) => paneId);

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
  }, [deleteConversation, terminalSessions]);

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
  }, [createTerminalTab]);

  const handleForkConversationInNewPane = useCallback((conversationId: string) => {
    const tabId = selectedTab.kind === 'terminal' ? selectedTab.id : resolveTerminalTabId();
    const sourcePaneId = resolvePaneId(tabId);
    const nextPaneId = Utils.buildPaneId(
      tabId,
      Object.values(paneLayoutsByTabId).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );
    const sourceSession = terminalSessions[sourcePaneId] ?? Utils.createEmptyTerminalSession(pathContext?.homeDir ?? null);

    setTerminalSessions((current) => ({
      ...current,
      [nextPaneId]: {
        ...Utils.createEmptyTerminalSession(sourceSession.workingDirectory),
        activeConversationId: conversationId,
        composerSurface: 'agent'
      }
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
  }, [paneLayoutsByTabId, pathContext?.homeDir, resolvePaneId, resolveTerminalTabId, selectedTab, terminalSessions]);

  const handleRenameTab = useCallback((tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }

    const nextLabel = window.prompt('Rename tab', tab.customLabel?.trim() || displayTabs.find((item) => item.id === tabId)?.label || tab.label);
    if (nextLabel === null) {
      return;
    }

    const normalized = nextLabel.trim();
    setTabs((current) => current.map((candidate) => (
      candidate.id === tabId
        ? { ...candidate, customLabel: normalized.length > 0 ? normalized : null }
        : candidate
    )));
  }, [displayTabs, tabs]);

  const handleMoveTab = useCallback((tabId: string, direction: 'left' | 'right') => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) {
        return current;
      }

      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const nextTabs = [...current];
      const [tab] = nextTabs.splice(index, 1);
      nextTabs.splice(targetIndex, 0, tab);
      return nextTabs;
    });
  }, []);

  const handleCloseOtherTabs = useCallback((tabId: string) => {
    setTabs((current) => current.filter((tab) => tab.id === tabId));
    setSelectedTabId(tabId);
    setPaneLayoutsByTabId((current) => (
      current[tabId]
        ? { [tabId]: current[tabId] }
        : {}
    ));
    setTerminalSessions((current) => {
      const keptPaneIds = new Set(Utils.collectPaneIdsFromLayout(
        paneLayoutsByTabId[tabId] ?? Utils.createDefaultPaneLayout(tabId)
      ));

      return Object.fromEntries(
        Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId))
      ) as Record<string, TerminalSessionState>;
    });
    setLauncherTabId((current) => current === tabId ? current : null);
  }, [paneLayoutsByTabId]);

  const handleCloseTabsToRight = useCallback((tabId: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) {
        return current;
      }

      return current.slice(0, index + 1);
    });
    setPaneLayoutsByTabId((current) => {
      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      const keptTabIds = new Set(tabs.slice(0, tabIndex + 1).map((tab) => tab.id));
      return Object.fromEntries(
        Object.entries(current).filter(([id]) => keptTabIds.has(id))
      );
    });
    setTerminalSessions((current) => {
      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      const keptTabIds = new Set(tabs.slice(0, tabIndex + 1).map((tab) => tab.id));
      const keptPaneIds = new Set(
        Array.from(keptTabIds).flatMap((keptId) => Utils.collectPaneIdsFromLayout(
          paneLayoutsByTabId[keptId] ?? Utils.createDefaultPaneLayout(keptId)
        ))
      );
      return Object.fromEntries(
        Object.entries(current).filter(([paneId]) => keptPaneIds.has(paneId))
      ) as Record<string, TerminalSessionState>;
    });
    setLauncherTabId((current) => {
      if (!current) {
        return null;
      }

      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      const keptTabIds = new Set(tabs.slice(0, tabIndex + 1).map((tab) => tab.id));
      return keptTabIds.has(current) ? current : null;
    });
  }, [paneLayoutsByTabId, tabs]);

  const handleSaveTabAsConfig = useCallback((tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }

    const nextName = window.prompt('Config name', displayTabs.find((item) => item.id === tabId)?.label || tab.label);
    if (!nextName || nextName.trim().length === 0) {
      return;
    }

    const savedConfigs = Array.isArray(useMemoryStore.getState().settings?.values.savedWorkspaceTabConfigs)
      ? useMemoryStore.getState().settings?.values.savedWorkspaceTabConfigs as Utils.SavedWorkspaceTabConfig[]
      : [];

    const nextConfig: Utils.SavedWorkspaceTabConfig = {
      id: `workspace-config-${Date.now()}`,
      name: nextName.trim(),
      createdAt: new Date().toISOString(),
      tab,
      terminalSession: terminalSessions[paneLayoutsByTabId[tabId]?.activePaneId ?? tabId] ?? null
    };

    void saveSettings({
      savedWorkspaceTabConfigs: [nextConfig, ...savedConfigs].slice(0, 24)
    }, true);
  }, [displayTabs, paneLayoutsByTabId, saveSettings, tabs, terminalSessions]);

  const handleSetTabTint = useCallback((tabId: string, tintColor: string | null) => {
    setTabs((current) => current.map((tab) => (
      tab.id === tabId ? { ...tab, tintColor } : tab
    )));
  }, []);

  const handleRemoveTabFromLauncher = useCallback((tabId: string) => {
    setLauncherTabId((current) => current === tabId ? null : current);
  }, []);

  const onToggleSidebar = useCallback(() => {
    setIsSidebarOpen((current) => !current);
  }, []);

  const onToggleAgents = useCallback(() => {
    setIsAgentsActive((current) => !current);
  }, []);

  const onOpenSettingsSection = useCallback((sectionId?: string) => {
    setTabs((current) => {
      const hasSettingsTab = current.some((tab) => tab.id === SETTINGS_TAB_ID);
      if (hasSettingsTab) {
        return current;
      }

      const settingsTab = initialWorkspaceChromeTabs.find((tab) => tab.id === SETTINGS_TAB_ID) ?? {
        id: SETTINGS_TAB_ID,
        label: 'Settings',
        kind: 'settings' as const
      };

      const nextTabs = [...current];
      const insertAt = Math.min(1, nextTabs.length);
      nextTabs.splice(insertAt, 0, settingsTab);
      return nextTabs;
    });

    if (sectionId) {
      setActiveSectionId(sectionId);
    }

    setSelectedTabId(SETTINGS_TAB_ID);
  }, []);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    let cancelled = false;
    let unlistenPromise: Promise<(() => void) | void> | null = null;

    const applyCloudProfileDrawerRequest = (payload: OpenCloudProfileDrawerPayload | null | undefined) => {
      if (!payload?.profileId) {
        return;
      }

      onOpenSettingsSection(payload.sectionId || 'cloud-platform/cloud');
      setSelectedCloudProfileIdForEdit(payload.profileId);
      setIsCloudProfileDrawerOpen(true);
    };

    const setupListener = async () => {
      const currentWindow = getCurrentWindow();
      const currentLabel = currentWindow.label;
      if (currentLabel !== 'settings') {
        return;
      }

      const pendingPayload = await invoke<OpenCloudProfileDrawerPayload | null>('consume_pending_cloud_profile_drawer_request');
      if (!cancelled) {
        applyCloudProfileDrawerRequest(pendingPayload);
      }

      unlistenPromise = listen<OpenCloudProfileDrawerPayload>(OPEN_CLOUD_PROFILE_DRAWER_EVENT, (event) => {
        if (cancelled) {
          return;
        }

        applyCloudProfileDrawerRequest(event.payload);
      });
    };

    void setupListener().catch((error) => {
      console.warn('[AppWindow] failed to subscribe to cloud profile drawer event', error);
    });

    return () => {
      cancelled = true;
      void unlistenPromise?.then((unlisten) => unlisten?.());
    };
  }, [onOpenSettingsSection, setIsCloudProfileDrawerOpen, setSelectedCloudProfileIdForEdit]);

  const getLauncherProps = useCallback((tabId: string, paneId: string) => ({
    active: tabId === selectedTab.id && paneId === activePaneId,
    chatMode: 'always-open' as const,
    conversationId: terminalSessions[paneId]?.activeConversationId ?? null,
    initialComposerSurface: terminalSessions[paneId]?.composerSurface ?? ((terminalSessions[paneId]?.activeConversationId ?? null) ? 'agent' as const : 'terminal' as const),
    initialTerminalSessionId: terminalSessions[paneId]?.terminalSessionId ?? null,
    initialAgentTerminalSessionId: terminalSessions[paneId]?.agentTerminalSessionId ?? null,
    initialWorkingDirectory: terminalSessions[paneId]?.workingDirectory ?? pathContext?.homeDir ?? null,
    onComposerSurfaceChange: (composerSurface: 'agent' | 'terminal') => handleTerminalComposerSurfaceChange(paneId, composerSurface),
    onConversationChange: (conversationId: string | null) => handleTerminalConversationChange(paneId, conversationId),
    onNewConversation,
    onPendingApprovalChange: (approval: CommandApproval | null) => handleTerminalPendingApprovalChange(paneId, approval),
    onSelectConversation,
    onSyntheticBlocksChange: (syntheticBlocks: TerminalCommandBlock[]) => handleSyntheticBlocksChange(paneId, syntheticBlocks),
    onTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => handleTerminalBlockMetaChange(paneId, terminalBlockMetaById),
    onTerminalSessionChange: (sessionId: string | null) => handleTerminalSessionChange(paneId, sessionId),
    onAgentTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => handleAgentTerminalBlockMetaChange(paneId, terminalBlockMetaById),
    onAgentTerminalSessionChange: (sessionId: string | null) => handleAgentTerminalSessionChange(paneId, sessionId),
    onWorkingDirectoryChange: (path: string | null) => handleTerminalWorkingDirectoryChange(paneId, path),
    pendingApproval: terminalSessions[paneId]?.pendingApproval ?? null,
    persistWorkingDirectory: false,
    persistTerminalSession: true,
    resetOnMount: true,
    sharedTerminalBlockMetaById: terminalSessions[paneId]?.terminalBlockMetaById ?? Utils.EMPTY_META,
    sharedSyntheticBlocks: terminalSessions[paneId]?.syntheticBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
    sharedAgentTerminalBlockMetaById: terminalSessions[paneId]?.agentTerminalBlockMetaById ?? Utils.EMPTY_META,
    title: displayTabs.find((t) => t.id === tabId)?.label,
    variant: 'workspace' as const
  }), [
    activePaneId,
    displayTabs,
    handleAgentTerminalBlockMetaChange,
    handleAgentTerminalSessionChange,
    handleSyntheticBlocksChange,
    handleTerminalBlockMetaChange,
    handleTerminalComposerSurfaceChange,
    handleTerminalConversationChange,
    handleTerminalPendingApprovalChange,
    handleTerminalSessionChange,
    handleTerminalWorkingDirectoryChange,
    onNewConversation,
    onSelectConversation,
    pathContext?.homeDir,
    selectedTab.id,
    terminalSessions
  ]);

  return {
    chrome: {
      displayTabs,
      isAgentsActive,
      isSidebarOpen,
      isSpotlightVisible,
      launcherTabId,
      selectedTab,
      activeWorkingDirectory: selectedTab.kind === 'terminal' 
        ? terminalSessions[activePaneId ?? selectedTab.id]?.workingDirectory ?? pathContext?.homeDir ?? null
        : pathContext?.homeDir ?? null
    },
    workspace: {
      activePaneId,
      isLauncherView,
      isSettingsView,
      paneLayout: selectedPaneLayout,
      tabs
    },
    sidebar: {
      openConversationIds,
      selectedOpenConversationId,
      workspaceConversations
    },
    settings: {
      activeSectionId,
      expandedGroupIds
    },
    actions: {
      getLauncherProps,
      handleCloseOtherTabs,
      handleCloseTabsToRight,
      handleDeleteConversation,
      handleForkConversationInNewPane,
      handleForkConversationInNewTab,
      handleMoveTab,
      handleRenameTab,
      handleSaveTabAsConfig,
      handleSetTabTint,
      onCloseTab,
      onClosePane,
      onNewConversation,
      onNewConversationInNewTab,
      onNewTerminalTab,
      onFocusPane,
      onSplitTerminal,
      onSelectConversation,
      onSelectSection,
      onSelectTab,
      onToggleGroup,
      onRemoveTabFromLauncher: handleRemoveTabFromLauncher,
      onToggleAgents,
      onToggleSidebar,
      setLauncherTabId,
      onOpenSettingsSection
    }
  };
}
