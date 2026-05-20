import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { LauncherProps } from '../components/Layout/Launcher/hooks';
import { initialWorkspaceChromeTabs } from '../components/App/chrome';
import type { TerminalSessionState } from '../components/App/utils';
import { getPanelMode } from '../lib/utils';
import { useMemoryStore } from '../stores/memoryStore';
import type { MemoryWorkspaceSnapshot } from '../types/memory';
import type { CommandApproval, TerminalBlockSharedMeta } from '../types/terminal';
import type { TerminalCommandBlock } from '../types/terminal';
import type { PanelMode } from '../types/ui';
import { createDefaultPaneLayout } from '../components/App/utils';

const EMPTY_META: Record<string, TerminalBlockSharedMeta> = {};

function createEmptyTerminalSession(): TerminalSessionState {
  return {
    activeConversationId: null,
    composerSurface: 'terminal',
    workingDirectory: null,
    terminalSessionId: null,
    agentTerminalSessionId: null,
    terminalTarget: null,
    agentTerminalTarget: null,
    pendingApproval: null,
    terminalBlockMetaById: {},
    agentTerminalBlockMetaById: {},
    syntheticBlocks: []
  };
}

function normalizeTerminalSession(
  session: Partial<TerminalSessionState> | null | undefined
): TerminalSessionState {
  return {
    ...createEmptyTerminalSession(),
    ...session,
    composerSurface: session?.composerSurface
      ?? ((session?.activeConversationId ?? null) ? 'agent' : 'terminal'),
    terminalBlockMetaById: session?.terminalBlockMetaById ?? {},
    agentTerminalBlockMetaById: session?.agentTerminalBlockMetaById ?? {},
    syntheticBlocks: session?.syntheticBlocks ?? []
  };
}

function buildWorkspaceForLauncher(
  workspace: MemoryWorkspaceSnapshot | null
): MemoryWorkspaceSnapshot {
  return workspace ?? {
    id: 'workspace-main',
    schemaVersion: 1,
    tabs: initialWorkspaceChromeTabs,
    selectedTabId: 'terminal-main',
    launcherTabId: 'terminal-main',
    paneLayoutsByTabId: {
      'terminal-main': createDefaultPaneLayout('terminal-main')
    },
    conversations: [],
    terminalSessions: {
      'terminal-main': createEmptyTerminalSession()
    },
    activeSectionId: null,
    expandedGroupIds: [],
    isSidebarOpen: false,
    isAgentsActive: false,
    nextTerminalIndex: 2,
    nextConversationIndex: 1,
    updatedAt: new Date().toISOString()
  };
}

type UseLauncherAppStateResult = {
  handleOnboardingComplete: () => void;
  isOnboardingCompleted: boolean;
  launcherProps: LauncherProps;
  panelMode: PanelMode;
};

export function useLauncherAppState(): UseLauncherAppStateResult {
  const panelMode = getPanelMode();
  const bootstrapMemory = useMemoryStore((state) => state.bootstrap);
  const memoryWorkspace = useMemoryStore((state) => state.workspace);
  const saveWorkspace = useMemoryStore((state) => state.saveWorkspace);
  const pendingLauncherSessionSaveRef = useRef<{
    session: TerminalSessionState;
    tabId: string;
  } | null>(null);
  const launcherSessionSaveTimeoutRef = useRef<number | null>(null);
  const [isLauncherWindowVisible, setIsLauncherWindowVisible] = useState(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return true;
    }

    return document.visibilityState !== 'hidden';
  });
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(() => {
    return localStorage.getItem('onboarding_completed') === 'true';
  });

  useEffect(() => {
    void bootstrapMemory();
  }, [bootstrapMemory]);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    let cancelled = false;
    let intervalId = 0;

    const syncVisibility = async () => {
      const currentWindow = getCurrentWindow();
      const visible = await currentWindow.isVisible().catch(() => document.visibilityState !== 'hidden');
      if (!cancelled) {
        setIsLauncherWindowVisible(visible);
      }
    };

    void syncVisibility();
    intervalId = window.setInterval(() => {
      void syncVisibility();
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (panelMode !== 'launcher' || !memoryWorkspace) {
      return;
    }

    const hasLinkedLauncherTab = Boolean(
      memoryWorkspace.launcherTabId
      && memoryWorkspace.tabs.some((tab) => tab.id === memoryWorkspace.launcherTabId)
    );

    if (hasLinkedLauncherTab) {
      return;
    }

    const latestWorkspace = buildWorkspaceForLauncher(useMemoryStore.getState().workspace);

    if (
      latestWorkspace.launcherTabId
      && latestWorkspace.tabs.some((tab) => tab.id === latestWorkspace.launcherTabId)
    ) {
      return;
    }

    const terminalTabs = latestWorkspace.tabs.filter((tab) => tab.kind === 'terminal');
    const nextTerminalIndex = Math.max(
      latestWorkspace.nextTerminalIndex || 1,
      terminalTabs.length + 1
    );
    const nextTabId = `terminal-${String(nextTerminalIndex).padStart(2, '0')}`;

    void saveWorkspace({
      ...latestWorkspace,
      tabs: [
        ...latestWorkspace.tabs,
        {
          id: nextTabId,
          label: '~',
          kind: 'terminal'
        }
      ],
      launcherTabId: nextTabId,
      selectedTabId: nextTabId,
      paneLayoutsByTabId: {
        ...(latestWorkspace.paneLayoutsByTabId ?? {}),
        [nextTabId]: createDefaultPaneLayout(nextTabId)
      },
      nextTerminalIndex: Math.max(
        latestWorkspace.nextTerminalIndex || 1,
        nextTerminalIndex + 1
      ),
      terminalSessions: {
        ...(latestWorkspace.terminalSessions ?? {}),
        [nextTabId]: createEmptyTerminalSession()
      },
      updatedAt: new Date().toISOString()
    });
  }, [memoryWorkspace, panelMode, saveWorkspace]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'onboarding_completed') {
        setIsOnboardingCompleted(event.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem('onboarding_completed', 'true');
    setIsOnboardingCompleted(true);
  }, []);

  const launcherWorkspace = buildWorkspaceForLauncher(memoryWorkspace);
  const launcherTabId = launcherWorkspace.launcherTabId ?? null;
  const launcherSession = launcherTabId
    ? launcherWorkspace.terminalSessions?.[launcherTabId] ?? null
    : null;
  const isLinkedToWorkspace = Boolean(
    launcherTabId && launcherWorkspace.tabs.some((tab) => tab.id === launcherTabId)
  );
  const canSpotlightControlWorkspace = panelMode === 'launcher' && isLinkedToWorkspace && isLauncherWindowVisible;
  const [launcherSessionOverride, setLauncherSessionOverride] = useState<TerminalSessionState | null>(null);

  const effectiveLauncherSession = useMemo(() => {
    if (launcherSessionOverride) {
      return launcherSessionOverride;
    }

    return launcherSession ? normalizeTerminalSession(launcherSession) : null;
  }, [launcherSession, launcherSessionOverride]);

  useEffect(() => {
    if (!launcherTabId) {
      setLauncherSessionOverride(null);
      return;
    }

    const nextSession = launcherSession ? normalizeTerminalSession(launcherSession) : null;

    setLauncherSessionOverride((current) => {
      if (JSON.stringify(current) === JSON.stringify(nextSession)) {
        return current;
      }

      return nextSession;
    });
  }, [launcherSession, launcherTabId]);

  const flushLauncherSessionSave = useCallback(async () => {
    const pendingSave = pendingLauncherSessionSaveRef.current;
    pendingLauncherSessionSaveRef.current = null;
    launcherSessionSaveTimeoutRef.current = null;

    if (!pendingSave || !canSpotlightControlWorkspace) {
      return;
    }

    const currentWorkspace = buildWorkspaceForLauncher(useMemoryStore.getState().workspace);
    if (!currentWorkspace.tabs.some((tab) => tab.id === pendingSave.tabId)) {
      return;
    }

    await saveWorkspace({
      ...currentWorkspace,
      terminalSessions: {
        ...(currentWorkspace.terminalSessions ?? {}),
        [pendingSave.tabId]: pendingSave.session
      },
      updatedAt: new Date().toISOString()
    });
  }, [canSpotlightControlWorkspace, saveWorkspace]);

  useEffect(() => {
    return () => {
      if (launcherSessionSaveTimeoutRef.current !== null) {
        window.clearTimeout(launcherSessionSaveTimeoutRef.current);
      }
      void flushLauncherSessionSave();
    };
  }, [flushLauncherSessionSave]);

  const scheduleLauncherSessionSave = useCallback((session: TerminalSessionState, tabId: string) => {
    if (!canSpotlightControlWorkspace) {
      return;
    }

    pendingLauncherSessionSaveRef.current = { session, tabId };

    if (launcherSessionSaveTimeoutRef.current !== null) {
      window.clearTimeout(launcherSessionSaveTimeoutRef.current);
    }

    launcherSessionSaveTimeoutRef.current = window.setTimeout(() => {
      void flushLauncherSessionSave();
    }, 120);
  }, [canSpotlightControlWorkspace, flushLauncherSessionSave]);

  const updateLauncherSession = useCallback((
    updater: (session: TerminalSessionState) => TerminalSessionState
  ) => {
    if (!canSpotlightControlWorkspace || !launcherTabId) {
      return;
    }

    setLauncherSessionOverride((current) => {
      const baseSession = current ?? normalizeTerminalSession(launcherSession);
      const nextSession = normalizeTerminalSession(updater(baseSession));
      scheduleLauncherSessionSave(nextSession, launcherTabId);
      return nextSession;
    });
  }, [canSpotlightControlWorkspace, launcherSession, launcherTabId, scheduleLauncherSessionSave]);

  const handleLauncherConversationChange = useCallback((conversationId: string | null) => {
    updateLauncherSession((session) => ({
      ...session,
      activeConversationId: conversationId,
      composerSurface: conversationId ? 'agent' : 'terminal'
    }));
  }, [updateLauncherSession]);

  const handleLauncherNewConversation = useCallback(() => {
    if (!canSpotlightControlWorkspace || !launcherTabId) {
      return null;
    }

    const conversationId = `conv_${Date.now()}`;
    updateLauncherSession((session) => ({
      ...session,
      activeConversationId: conversationId,
      composerSurface: 'agent'
    }));
    return conversationId;
  }, [canSpotlightControlWorkspace, launcherTabId, updateLauncherSession]);

  const handleLauncherComposerSurfaceChange = useCallback((composerSurface: 'agent' | 'terminal') => {
    updateLauncherSession((session) => ({
      ...session,
      composerSurface
    }));
  }, [updateLauncherSession]);

  const handleLauncherTerminalSessionChange = useCallback((sessionId: string | null) => {
    updateLauncherSession((session) => ({
      ...session,
      terminalSessionId: sessionId
    }));
  }, [updateLauncherSession]);

  const handleLauncherAgentTerminalSessionChange = useCallback((sessionId: string | null) => {
    updateLauncherSession((session) => ({
      ...session,
      agentTerminalSessionId: sessionId
    }));
  }, [updateLauncherSession]);

  const handleLauncherWorkingDirectoryChange = useCallback((path: string | null) => {
    updateLauncherSession((session) => ({
      ...session,
      workingDirectory: path
    }));
  }, [updateLauncherSession]);

  const handleLauncherPendingApprovalChange = useCallback((approval: CommandApproval | null) => {
    updateLauncherSession((session) => ({
      ...session,
      pendingApproval: approval
    }));
  }, [updateLauncherSession]);

  const handleLauncherTerminalBlockMetaChange = useCallback((
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    updateLauncherSession((session) => ({
      ...session,
      terminalBlockMetaById
    }));
  }, [updateLauncherSession]);

  const handleLauncherAgentTerminalBlockMetaChange = useCallback((
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    updateLauncherSession((session) => ({
      ...session,
      agentTerminalBlockMetaById: terminalBlockMetaById
    }));
  }, [updateLauncherSession]);

  const handleLauncherSyntheticBlocksChange = useCallback((
    syntheticBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSession((session) => ({
      ...session,
      syntheticBlocks
    }));
  }, [updateLauncherSession]);

  const launcherProps: LauncherProps = useMemo(() => ({
    active: isLauncherWindowVisible,
    conversationId: canSpotlightControlWorkspace ? effectiveLauncherSession?.activeConversationId ?? null : undefined,
    initialComposerSurface: canSpotlightControlWorkspace ? effectiveLauncherSession?.composerSurface ?? 'terminal' : 'terminal',
    initialTerminalSessionId: canSpotlightControlWorkspace ? effectiveLauncherSession?.terminalSessionId ?? null : null,
    initialAgentTerminalSessionId: canSpotlightControlWorkspace ? effectiveLauncherSession?.agentTerminalSessionId ?? null : null,
    terminalTarget: canSpotlightControlWorkspace ? effectiveLauncherSession?.terminalTarget ?? null : null,
    agentTerminalTarget: canSpotlightControlWorkspace ? effectiveLauncherSession?.agentTerminalTarget ?? null : null,
    initialWorkingDirectory: canSpotlightControlWorkspace ? effectiveLauncherSession?.workingDirectory ?? null : null,
    onConversationChange: handleLauncherConversationChange,
    onComposerSurfaceChange: handleLauncherComposerSurfaceChange,
    onNewConversation: handleLauncherNewConversation,
    onPendingApprovalChange: handleLauncherPendingApprovalChange,
    onTerminalBlockMetaChange: handleLauncherTerminalBlockMetaChange,
    onSyntheticBlocksChange: handleLauncherSyntheticBlocksChange,
    onTerminalSessionChange: handleLauncherTerminalSessionChange,
    onAgentTerminalBlockMetaChange: handleLauncherAgentTerminalBlockMetaChange,
    onAgentTerminalSessionChange: handleLauncherAgentTerminalSessionChange,
    onWorkingDirectoryChange: handleLauncherWorkingDirectoryChange,
    pendingApproval: canSpotlightControlWorkspace ? effectiveLauncherSession?.pendingApproval ?? null : undefined,
    persistWorkingDirectory: !canSpotlightControlWorkspace,
    persistTerminalSession: canSpotlightControlWorkspace,
    sharedTerminalBlockMetaById: canSpotlightControlWorkspace ? effectiveLauncherSession?.terminalBlockMetaById ?? EMPTY_META : undefined,
    sharedSyntheticBlocks: canSpotlightControlWorkspace ? effectiveLauncherSession?.syntheticBlocks ?? [] : undefined,
    sharedAgentTerminalBlockMetaById: canSpotlightControlWorkspace ? effectiveLauncherSession?.agentTerminalBlockMetaById ?? EMPTY_META : undefined
  }), [
    canSpotlightControlWorkspace,
    effectiveLauncherSession,
    handleLauncherAgentTerminalBlockMetaChange,
    handleLauncherAgentTerminalSessionChange,
    handleLauncherComposerSurfaceChange,
    handleLauncherConversationChange,
    handleLauncherNewConversation,
    handleLauncherPendingApprovalChange,
    handleLauncherSyntheticBlocksChange,
    handleLauncherTerminalBlockMetaChange,
    handleLauncherTerminalSessionChange,
    handleLauncherWorkingDirectoryChange,
    isLauncherWindowVisible
  ]);

  return {
    handleOnboardingComplete,
    isOnboardingCompleted,
    launcherProps,
    panelMode
  };
}
