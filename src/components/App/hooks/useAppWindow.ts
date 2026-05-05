import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const memoryConversationsById = useMemo(() => new Map(memoryConversations.map((conversation) => [conversation.id, conversation])), [memoryConversations]);

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0] ?? initialWorkspaceChromeTabs[0];
  const activeConversationId = selectedTab.kind === 'terminal'
    ? terminalSessions[selectedTab.id]?.activeConversationId ?? null
    : null;
  const isSettingsView = selectedTab.kind === 'settings';
  const isLauncherView = !isAgentsActive && selectedTab.kind === 'terminal';
  const orderedConversationIds = useMemo(() => tabs
    .filter((tab) => tab.kind === 'terminal')
    .map((tab) => terminalSessions[tab.id]?.activeConversationId ?? null)
    .filter((conversationId): conversationId is string => Boolean(conversationId)), [tabs, terminalSessions]);
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
  }), [tabs, terminalSessions, memoryConversationsById, pathContext]);

  useEffect(() => {
    latestLocalWorkspaceComparableRef.current = Utils.buildWorkspaceComparableSnapshot(
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
  }, [
    activeSectionId,
    expandedGroupIds,
    isAgentsActive,
    isSidebarOpen,
    launcherTabId,
    nextTerminalIndex,
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
    selectedTabId,
    tabs,
    terminalSessions,
    workspaceConversations,
    openConversationIdSet
  ]);

  const createTerminalTab = useCallback(() => {
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
    const existingTab = tabs.find((tab) =>
      tab.kind === 'terminal' && terminalSessions[tab.id]?.activeConversationId === conversationId
    );
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

    if (existingTab) {
      if (selectedTabId !== existingTab.id) setSelectedTabId(existingTab.id);
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
  }, [createTerminalTab, memoryConversationsById, selectedTabId, tabs, terminalSessions]);

  const onNewConversation = useCallback((_options?: { seedPrompt?: string }) => {
    const nextConversationId = Utils.createConversationId();
    const terminalTabId = resolveTerminalTabId();

    setOpenPastConversationBaselineById((current) => {
      if (!(nextConversationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[nextConversationId];
      return next;
    });

    setTerminalSessions((current) => {
      if (current[terminalTabId]?.activeConversationId === nextConversationId) return current;
      return {
        ...current,
        [terminalTabId]: {
          ...current[terminalTabId],
          activeConversationId: nextConversationId,
          composerSurface: 'agent'
        }
      };
    });
    return nextConversationId;
  }, [resolveTerminalTabId]);

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

  const onCloseTab = useCallback((tabId: string) => {
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
    setTerminalSessions((current) => {
      const nextSessions = { ...current };
      delete nextSessions[tabId];
      return nextSessions;
    });
  }, [closeAppWindowWithFreshWorkspace, tabs, terminalSessions, selectedTabId]);

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
    setOpenPastConversationBaselineById((current) => {
      if (!(conversationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[conversationId];
      return next;
    });
    setTerminalSessions((current) => {
      const next = Object.fromEntries(
        Object.entries(current).map(([tabId, session]) => [
          tabId,
          {
            ...session,
            activeConversationId: session.activeConversationId === conversationId ? null : session.activeConversationId,
            composerSurface: session.activeConversationId === conversationId ? 'terminal' : session.composerSurface
          } satisfies TerminalSessionState
        ])
      );
      if (JSON.stringify(current) === JSON.stringify(next)) return current;
      return next;
    });
  }, [deleteConversation]);

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
    setTerminalSessions((current) => (
      current[tabId]
        ? { [tabId]: current[tabId] }
        : {}
    ));
    setLauncherTabId((current) => current === tabId ? current : null);
  }, []);

  const handleCloseTabsToRight = useCallback((tabId: string) => {
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
  }, [tabs]);

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
      terminalSession: terminalSessions[tabId] ?? null
    };

    void saveSettings({
      savedWorkspaceTabConfigs: [nextConfig, ...savedConfigs].slice(0, 24)
    }, true);
  }, [displayTabs, saveSettings, tabs, terminalSessions]);

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

  const getLauncherProps = useCallback((tab: WorkspaceChromeTab) => ({
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
    sharedSyntheticBlocks: terminalSessions[tab.id]?.syntheticBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
    sharedAgentTerminalBlockMetaById: terminalSessions[tab.id]?.agentTerminalBlockMetaById ?? Utils.EMPTY_META,
    title: displayTabs.find((t) => t.id === tab.id)?.label,
    variant: 'workspace' as const
  }), [
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
        ? terminalSessions[selectedTab.id]?.workingDirectory ?? pathContext?.homeDir ?? null
        : pathContext?.homeDir ?? null
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
      onRemoveTabFromLauncher: handleRemoveTabFromLauncher,
      onToggleAgents,
      onToggleSidebar,
      setLauncherTabId
    }
  };
}
