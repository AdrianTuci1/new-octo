import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import { initialWorkspaceChromeTabs, defaultWorkspaceChromeTabId } from '../chrome';
import { settingsDefaultExpandedGroupIds, settingsDefaultSectionId } from '../settings/settingsData';
import { formatCompactPathLabel } from '../../../lib/pathLabels';
import { useMemoryStore } from '../../../stores/memoryStore';
import type { FilesystemPathContext } from '../../../types/filesystem';
import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock } from '../../../types/terminal';
import type { WorkspaceChromeTab, WorkspaceConversation } from '../chrome';
import * as Utils from '../utils';
import type { TerminalSessionState } from '../utils';

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

export function useAppWindow() {
  const [tabs, setTabs] = useState<WorkspaceChromeTab[]>(initialWorkspaceChromeTabs);
  const [selectedTabId, setSelectedTabId] = useState(defaultWorkspaceChromeTabId);
  const [launcherTabId, setLauncherTabId] = useState<string | null>('terminal-main');
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
  const didRestoreWorkspaceRef = useRef(false);
  const isClosingWorkspaceRef = useRef(false);
  const memoryStatus = useMemoryStore((state) => state.status);
  const memoryWorkspace = useMemoryStore((state) => state.workspace);
  const memoryConversations = useMemoryStore((state) => state.conversations);
  const saveWorkspace = useMemoryStore((state) => state.saveWorkspace);
  const deleteConversation = useMemoryStore((state) => state.deleteConversation);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const memoryConversationsById = new Map(memoryConversations.map((conversation) => [conversation.id, conversation]));

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0] ?? initialWorkspaceChromeTabs[0];
  const activeConversationId = selectedTab.kind === 'terminal'
    ? terminalSessions[selectedTab.id]?.activeConversationId ?? null
    : null;
  const isSettingsView = selectedTab.kind === 'settings';
  const isLauncherView = !isAgentsActive && selectedTab.kind === 'terminal';
  const orderedConversationIds = tabs
    .filter((tab) => tab.kind === 'terminal')
    .map((tab) => terminalSessions[tab.id]?.activeConversationId ?? null)
    .filter((conversationId): conversationId is string => Boolean(conversationId));
  const dedupedOrderedConversationIds = Array.from(new Set(orderedConversationIds));
  const openConversationIds = dedupedOrderedConversationIds;
  const openConversationIdSet = new Set(openConversationIds);

  const workspaceConversations = [
    // First, map the active conversations (the ones in tabs)
    ...dedupedOrderedConversationIds.map((conversationId) => {
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
  ];

  const selectedOpenConversationId = activeConversationId && memoryConversationsById.has(activeConversationId)
    ? activeConversationId
    : activeConversationId && workspaceConversations.some((conversation) => conversation.id === activeConversationId)
      ? activeConversationId
      : null;
  const displayTabs = tabs.map((tab) => {
    if (tab.kind !== 'terminal') {
      return tab;
    }

    const session = terminalSessions[tab.id];
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
  });

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
    const currentComparable = Utils.buildWorkspaceComparableSnapshot(
      tabs,
      selectedTabId,
      launcherTabId,
      terminalSessions,
      activeSectionId,
      expandedGroupIds,
      isSidebarOpen,
      isAgentsActive,
      nextTerminalIndex
    );

    if (didRestoreWorkspaceRef.current && JSON.stringify(currentComparable) === JSON.stringify(nextComparable)) {
      return;
    }

    didRestoreWorkspaceRef.current = true;
    setTabs(nextComparable.tabs);
    setSelectedTabId(nextComparable.selectedTabId);
    setLauncherTabId(nextComparable.launcherTabId);
    setActiveSectionId(nextComparable.activeSectionId);
    setExpandedGroupIds(nextComparable.expandedGroupIds);
    setIsSidebarOpen(nextComparable.isSidebarOpen);
    setIsAgentsActive(nextComparable.isAgentsActive);
    setNextTerminalIndex(nextComparable.nextTerminalIndex);
    setTerminalSessions(nextComparable.terminalSessions);
  }, [memoryStatus, memoryWorkspace, pathContext?.homeDir]);

  useEffect(() => {
    if (memoryStatus !== 'ready' || !didRestoreWorkspaceRef.current || isClosingWorkspaceRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveWorkspace({
        id: 'workspace-main',
        schemaVersion: 1,
        tabs,
        selectedTabId,
        launcherTabId,
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
    activeSectionId,
    expandedGroupIds,
    isAgentsActive,
    isSidebarOpen,
    memoryStatus,
    nextTerminalIndex,
    saveWorkspace,
    selectedTabId,
    launcherTabId,
    terminalSessions,
    tabs
  ]);

  const createTerminalTab = () => {
    const nextTab = Utils.buildTerminalTab(nextTerminalIndex, '~');
    setTabs((current) => [...current, nextTab]);
    setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        activeConversationId: null,
        composerSurface: 'terminal',
        workingDirectory: pathContext?.homeDir ?? null,
        terminalSessionId: null,
        agentTerminalSessionId: null,
        pendingApproval: null,
        terminalBlockMetaById: {},
        agentTerminalBlockMetaById: {},
        syntheticBlocks: []
      }
    }));
    setNextTerminalIndex((value) => value + 1);
    return nextTab;
  };

  const closeAppWindowWithFreshWorkspace = async () => {
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
  };

  const resolveTerminalTabId = () => {
    if (selectedTab.kind === 'terminal') {
      return selectedTab.id;
    }

    const firstTerminalTab = tabs.find((tab) => tab.kind === 'terminal');
    if (firstTerminalTab) {
      setSelectedTabId(firstTerminalTab.id);
      return firstTerminalTab.id;
    }

    const nextTab = createTerminalTab();
    setSelectedTabId(nextTab.id);
    return nextTab.id;
  };

  const onToggleGroup = (groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const onSelectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
  };

  const onSelectTab = (tabId: string) => {
    setSelectedTabId(tabId);
  };

  const onNewTerminalTab = () => {
    const nextTab = createTerminalTab();
    setSelectedTabId(nextTab.id);
  };

  const onSelectConversation = (conversationId: string) => {
    const existingTab = tabs.find((tab) =>
      tab.kind === 'terminal' && terminalSessions[tab.id]?.activeConversationId === conversationId
    );

    if (existingTab) {
      setSelectedTabId(existingTab.id);
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
  };

  const onNewConversation = (options?: { seedPrompt?: string }) => {
    const nextConversationId = Utils.createConversationId();
    const terminalTabId = resolveTerminalTabId();

    setTerminalSessions((current) => ({
      ...current,
      [terminalTabId]: {
        ...current[terminalTabId],
        activeConversationId: nextConversationId,
        composerSurface: 'agent'
      }
    }));
    void options?.seedPrompt;
    return nextConversationId;
  };

  const onNewConversationInNewTab = (options?: { seedPrompt?: string }) => {
    const nextConversationId = Utils.createConversationId();
    const nextTab = createTerminalTab();

    setTerminalSessions((current) => ({
      ...current,
      [nextTab.id]: {
        ...current[nextTab.id],
        activeConversationId: nextConversationId,
        composerSurface: 'agent'
      }
    }));
    setSelectedTabId(nextTab.id);
    void options?.seedPrompt;
    return nextConversationId;
  };

  const onCloseTab = (tabId: string) => {
    if (tabs.length <= 1) {
      void closeAppWindowWithFreshWorkspace();
      return;
    }

    const closingSessionIds = [
      terminalSessions[tabId]?.terminalSessionId ?? null,
      terminalSessions[tabId]?.agentTerminalSessionId ?? null
    ].filter((sessionId): sessionId is string => Boolean(sessionId));

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
      setSelectedTabId((active) => active === tabId ? fallbackTabId : active);

      return nextTabs;
    });
    setLauncherTabId((current) => {
      if (current !== tabId) {
        return current;
      }

      const fallbackTerminal = tabs.find((tab) => tab.id !== tabId && tab.kind === 'terminal');
      return fallbackTerminal?.id ?? null;
    });
    setTerminalSessions((current) => {
      const nextSessions = { ...current };
      delete nextSessions[tabId];
      return nextSessions;
    });
  };

  const handleTerminalWorkingDirectoryChange = (tabId: string, path: string | null) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        workingDirectory: path
      }
    }));
  };

  const handleTerminalSessionChange = (tabId: string, sessionId: string | null) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        terminalSessionId: sessionId
      }
    }));
  };

  const handleAgentTerminalSessionChange = (tabId: string, sessionId: string | null) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        agentTerminalSessionId: sessionId
      }
    }));
  };

  const handleTerminalPendingApprovalChange = (tabId: string, approval: CommandApproval | null) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        pendingApproval: approval
      }
    }));
  };

  const handleTerminalBlockMetaChange = (
    tabId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        terminalBlockMetaById
      }
    }));
  };

  const handleAgentTerminalBlockMetaChange = (
    tabId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        agentTerminalBlockMetaById: terminalBlockMetaById
      }
    }));
  };

  const handleSyntheticBlocksChange = (
    tabId: string,
    syntheticBlocks: TerminalCommandBlock[]
  ) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        syntheticBlocks
      }
    }));
  };

  const handleTerminalConversationChange = (tabId: string, conversationId: string | null) => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        activeConversationId: conversationId,
        composerSurface: conversationId ? 'agent' : 'terminal'
      }
    }));
  };

  const handleTerminalComposerSurfaceChange = (tabId: string, composerSurface: 'agent' | 'terminal') => {
    setTerminalSessions((current) => ({
      ...current,
      [tabId]: {
        ...current[tabId],
        composerSurface
      }
    }));
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await deleteConversation(conversationId);
    setTerminalSessions((current) => Object.fromEntries(
      Object.entries(current).map(([tabId, session]) => [
        tabId,
        {
          ...session,
          activeConversationId: session.activeConversationId === conversationId ? null : session.activeConversationId,
          composerSurface: session.activeConversationId === conversationId ? 'terminal' : session.composerSurface
        } satisfies TerminalSessionState
      ])
    ));
  };

  const handleForkConversationInNewTab = (conversationId: string) => {
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
  };

  const handleRenameTab = (tabId: string) => {
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
  };

  const handleMoveTab = (tabId: string, direction: 'left' | 'right') => {
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
  };

  const handleCloseOtherTabs = (tabId: string) => {
    setTabs((current) => current.filter((tab) => tab.id === tabId));
    setSelectedTabId(tabId);
    setTerminalSessions((current) => (
      current[tabId]
        ? { [tabId]: current[tabId] }
        : {}
    ));
    setLauncherTabId((current) => current === tabId ? current : null);
  };

  const handleCloseTabsToRight = (tabId: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) {
        return current;
      }

      return current.slice(0, index + 1);
    });
    setTerminalSessions((current) => {
      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      const keptTabIds = new Set(tabs.slice(0, tabIndex + 1).map((tab) => tab.id));
      return Object.fromEntries(
        Object.entries(current).filter(([id]) => keptTabIds.has(id))
      );
    });
    setLauncherTabId((current) => {
      if (!current) {
        return null;
      }

      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      const keptTabIds = new Set(tabs.slice(0, tabIndex + 1).map((tab) => tab.id));
      return keptTabIds.has(current) ? current : null;
    });
  };

  const handleSaveTabAsConfig = (tabId: string) => {
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
      terminalSession: terminalSessions[tabId] ?? null
    };

    void saveSettings({
      savedWorkspaceTabConfigs: [nextConfig, ...savedConfigs].slice(0, 24)
    }, true);
  };

  const handleSetTabTint = (tabId: string, tintColor: string | null) => {
    setTabs((current) => current.map((tab) => (
      tab.id === tabId ? { ...tab, tintColor } : tab
    )));
  };

  const getLauncherProps = (tab: WorkspaceChromeTab) => ({
    active: tab.id === selectedTab.id,
    chatMode: 'always-open' as const,
    conversationId: terminalSessions[tab.id]?.activeConversationId ?? null,
    initialComposerSurface: terminalSessions[tab.id]?.composerSurface ?? ((terminalSessions[tab.id]?.activeConversationId ?? null) ? 'agent' as const : 'terminal' as const),
    initialTerminalSessionId: terminalSessions[tab.id]?.terminalSessionId ?? null,
    initialAgentTerminalSessionId: terminalSessions[tab.id]?.agentTerminalSessionId ?? null,
    initialWorkingDirectory: terminalSessions[tab.id]?.workingDirectory ?? pathContext?.homeDir ?? null,
    onComposerSurfaceChange: (composerSurface: 'agent' | 'terminal') => handleTerminalComposerSurfaceChange(tab.id, composerSurface),
    onConversationChange: (conversationId: string | null) => handleTerminalConversationChange(tab.id, conversationId),
    onNewConversation,
    onPendingApprovalChange: (approval: CommandApproval | null) => handleTerminalPendingApprovalChange(tab.id, approval),
    onSelectConversation,
    onSyntheticBlocksChange: (syntheticBlocks: TerminalCommandBlock[]) => handleSyntheticBlocksChange(tab.id, syntheticBlocks),
    onTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => handleTerminalBlockMetaChange(tab.id, terminalBlockMetaById),
    onTerminalSessionChange: (sessionId: string | null) => handleTerminalSessionChange(tab.id, sessionId),
    onAgentTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => handleAgentTerminalBlockMetaChange(tab.id, terminalBlockMetaById),
    onAgentTerminalSessionChange: (sessionId: string | null) => handleAgentTerminalSessionChange(tab.id, sessionId),
    onWorkingDirectoryChange: (path: string | null) => handleTerminalWorkingDirectoryChange(tab.id, path),
    pendingApproval: terminalSessions[tab.id]?.pendingApproval ?? null,
    persistWorkingDirectory: false,
    persistTerminalSession: true,
    resetOnMount: true,
    sharedTerminalBlockMetaById: terminalSessions[tab.id]?.terminalBlockMetaById ?? Utils.EMPTY_META,
    sharedSyntheticBlocks: terminalSessions[tab.id]?.syntheticBlocks ?? [],
    sharedAgentTerminalBlockMetaById: terminalSessions[tab.id]?.agentTerminalBlockMetaById ?? Utils.EMPTY_META,
    title: displayTabs.find((t) => t.id === tab.id)?.label,
    variant: 'workspace' as const
  });

  return {
    chrome: {
      displayTabs,
      isAgentsActive,
      isSidebarOpen,
      isSpotlightVisible,
      launcherTabId,
      selectedTab
    },
    workspace: {
      isLauncherView,
      isSettingsView,
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
      handleForkConversationInNewTab,
      handleMoveTab,
      handleRenameTab,
      handleSaveTabAsConfig,
      handleSetTabTint,
      onCloseTab,
      onNewConversation,
      onNewConversationInNewTab,
      onNewTerminalTab,
      onSelectConversation,
      onSelectSection,
      onSelectTab,
      onToggleGroup,
      setIsAgentsActive,
      setIsSidebarOpen,
      setLauncherTabId
    }
  };
}
