import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useLauncherAppStateStore } from '../stores/launcherAppStateStore';
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
    terminalBlocks: [],
    agentTerminalBlocks: [],
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
    terminalBlocks: session?.terminalBlocks ?? [],
    agentTerminalBlocks: session?.agentTerminalBlocks ?? [],
    syntheticBlocks: session?.syntheticBlocks ?? []
  };
}

function areTerminalSessionsEquivalent(
  left: TerminalSessionState | null,
  right: TerminalSessionState | null
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return left.activeConversationId === right.activeConversationId
    && left.composerSurface === right.composerSurface
    && left.workingDirectory === right.workingDirectory
    && left.terminalSessionId === right.terminalSessionId
    && left.agentTerminalSessionId === right.agentTerminalSessionId
    && left.terminalTarget === right.terminalTarget
    && left.agentTerminalTarget === right.agentTerminalTarget
    && left.pendingApproval === right.pendingApproval
    && left.terminalBlockMetaById === right.terminalBlockMetaById
    && left.agentTerminalBlockMetaById === right.agentTerminalBlockMetaById
    && left.terminalBlocks === right.terminalBlocks
    && left.agentTerminalBlocks === right.agentTerminalBlocks
    && left.syntheticBlocks === right.syntheticBlocks;
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
  const bootstrapMemory = useMemoryStore((s) => s.bootstrap);
  const memoryWorkspace = useMemoryStore((s) => s.workspace);
  const saveWorkspace = useMemoryStore((s) => s.saveWorkspace);
  const isLauncherWindowVisible = useStore(
    useLauncherAppStateStore,
    (s) => s.isLauncherWindowVisible
  );
  const isOnboardingCompleted = useStore(
    useLauncherAppStateStore,
    (s) => s.isOnboardingCompleted
  );
  const store = useLauncherAppStateStore;
  const pendingLauncherSessionSaveRef = useRef<{
    session: TerminalSessionState;
    tabId: string;
  } | null>(null);
  const launcherSessionSaveTimeoutRef = useRef<number | null>(null);
  const launcherSessionOverrideRef = useRef<TerminalSessionState | null>(null);
  const sessionOverrideTickRef = useRef(0);
  const [_rerender, forceRerender] = useState(0);

  useEffect(() => { void bootstrapMemory(); }, [bootstrapMemory]);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let cancelled = false;
    let intervalId = 0;
    const sync = async () => {
      const visible = await getCurrentWindow().isVisible().catch(() => document.visibilityState !== 'hidden');
      if (!cancelled) store.setState({ isLauncherWindowVisible: visible });
    };
    void sync();
    intervalId = window.setInterval(() => { void sync(); }, 250);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);

  useEffect(() => {
    if (panelMode !== 'launcher' || !memoryWorkspace) return;
    if (memoryWorkspace.launcherTabId && memoryWorkspace.tabs.some((t) => t.id === memoryWorkspace.launcherTabId)) return;
    const latestWorkspace = buildWorkspaceForLauncher(useMemoryStore.getState().workspace);
    if (latestWorkspace.launcherTabId && latestWorkspace.tabs.some((t) => t.id === latestWorkspace.launcherTabId)) return;
    const terminalTabs = latestWorkspace.tabs.filter((t) => t.kind === 'terminal');
    const nextTerminalIndex = Math.max(latestWorkspace.nextTerminalIndex || 1, terminalTabs.length + 1);
    const nextTabId = `terminal-${String(nextTerminalIndex).padStart(2, '0')}`;
    void saveWorkspace({
      ...latestWorkspace,
      tabs: [...latestWorkspace.tabs, { id: nextTabId, label: '~', kind: 'terminal' }],
      launcherTabId: nextTabId, selectedTabId: nextTabId,
      paneLayoutsByTabId: { ...(latestWorkspace.paneLayoutsByTabId ?? {}), [nextTabId]: createDefaultPaneLayout(nextTabId) },
      nextTerminalIndex: Math.max(latestWorkspace.nextTerminalIndex || 1, nextTerminalIndex + 1),
      terminalSessions: { ...(latestWorkspace.terminalSessions ?? {}), [nextTabId]: createEmptyTerminalSession() },
      updatedAt: new Date().toISOString(),
    });
  }, [memoryWorkspace, panelMode, saveWorkspace]);

  useEffect(() => {
    const h = (e: StorageEvent) => { if (e.key === 'onboarding_completed') store.setState({ isOnboardingCompleted: e.newValue === 'true' }); };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem('onboarding_completed', 'true');
    store.setState({ isOnboardingCompleted: true });
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
  const lastHydratedLauncherTabIdRef = useRef<string | null>(null);

  const effectiveLauncherSession = useMemo(() => {
    if (launcherSessionOverrideRef.current) return launcherSessionOverrideRef.current;
    return launcherSession ? normalizeTerminalSession(launcherSession) : null;
  }, [launcherSession, _rerender]);

  useEffect(() => {
    if (!launcherTabId) {
      lastHydratedLauncherTabIdRef.current = null;
      launcherSessionOverrideRef.current = null;
      return;
    }
    const nextSession = launcherSession ? normalizeTerminalSession(launcherSession) : null;
    const current = launcherSessionOverrideRef.current;
    if (lastHydratedLauncherTabIdRef.current !== launcherTabId) {
      lastHydratedLauncherTabIdRef.current = launcherTabId;
      launcherSessionOverrideRef.current = nextSession;
      return;
    }
    if (canSpotlightControlWorkspace && current) return;
    if (areTerminalSessionsEquivalent(current, nextSession)) return;
    launcherSessionOverrideRef.current = nextSession;
  }, [canSpotlightControlWorkspace, launcherSession, launcherTabId]);

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
    if (!canSpotlightControlWorkspace || !launcherTabId) return;
    const baseSession = launcherSessionOverrideRef.current ?? normalizeTerminalSession(launcherSession);
    const nextSession = normalizeTerminalSession(updater(baseSession));
    launcherSessionOverrideRef.current = nextSession;
    scheduleLauncherSessionSave(nextSession, launcherTabId);
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

  const handleLauncherTerminalBlocksChange = useCallback((
    terminalBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSession((session) => ({
      ...session,
      terminalBlocks
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

  const handleLauncherAgentTerminalBlocksChange = useCallback((
    terminalBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSession((session) => ({
      ...session,
      agentTerminalBlocks: terminalBlocks
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
    onTerminalBlocksChange: handleLauncherTerminalBlocksChange,
    onSyntheticBlocksChange: handleLauncherSyntheticBlocksChange,
    onTerminalSessionChange: handleLauncherTerminalSessionChange,
    onAgentTerminalBlockMetaChange: handleLauncherAgentTerminalBlockMetaChange,
    onAgentTerminalBlocksChange: handleLauncherAgentTerminalBlocksChange,
    onAgentTerminalSessionChange: handleLauncherAgentTerminalSessionChange,
    onWorkingDirectoryChange: handleLauncherWorkingDirectoryChange,
    pendingApproval: canSpotlightControlWorkspace ? effectiveLauncherSession?.pendingApproval ?? null : undefined,
    persistWorkingDirectory: !canSpotlightControlWorkspace,
    persistTerminalSession: canSpotlightControlWorkspace,
    sharedTerminalBlockMetaById: canSpotlightControlWorkspace ? effectiveLauncherSession?.terminalBlockMetaById ?? EMPTY_META : undefined,
    sharedTerminalBlocks: canSpotlightControlWorkspace ? effectiveLauncherSession?.terminalBlocks ?? [] : undefined,
    sharedSyntheticBlocks: canSpotlightControlWorkspace ? effectiveLauncherSession?.syntheticBlocks ?? [] : undefined,
    sharedAgentTerminalBlockMetaById: canSpotlightControlWorkspace ? effectiveLauncherSession?.agentTerminalBlockMetaById ?? EMPTY_META : undefined,
    sharedAgentTerminalBlocks: canSpotlightControlWorkspace ? effectiveLauncherSession?.agentTerminalBlocks ?? [] : undefined
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
    handleLauncherTerminalBlocksChange,
    handleLauncherTerminalSessionChange,
    handleLauncherWorkingDirectoryChange,
    handleLauncherAgentTerminalBlocksChange,
    isLauncherWindowVisible
  ]);

  return {
    handleOnboardingComplete,
    isOnboardingCompleted,
    launcherProps,
    panelMode
  };
}
