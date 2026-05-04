import './App.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Launcher } from './components/Layout/Launcher';
import { AppWindow } from './components/App';
import { initialWorkspaceChromeTabs } from './components/App/chrome';
import type { TerminalSessionState } from './components/App/utils';
import { Onboarding } from './components/Onboarding/Onboarding';
import { getPanelMode } from './lib/utils';
import { useMemoryStore } from './stores/memoryStore';
import type { MemoryWorkspaceSnapshot } from './types/memory';
import type { CommandApproval, TerminalBlockSharedMeta } from './types/terminal';
import type { TerminalCommandBlock } from './types/terminal';

function buildWorkspaceForLauncher(
  workspace: MemoryWorkspaceSnapshot | null
): MemoryWorkspaceSnapshot | null {
  return workspace ?? {
    id: 'workspace-main',
    schemaVersion: 1,
    tabs: initialWorkspaceChromeTabs,
    selectedTabId: 'terminal-main',
    launcherTabId: 'terminal-main',
    conversations: [],
    terminalSessions: {
      'terminal-main': {
        activeConversationId: null,
        composerSurface: 'terminal',
        workingDirectory: null,
        terminalSessionId: null,
        agentTerminalSessionId: null,
        pendingApproval: null,
        terminalBlockMetaById: {},
        agentTerminalBlockMetaById: {},
        syntheticBlocks: []
      }
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

function buildLauncherTerminalSession(
  workspace: MemoryWorkspaceSnapshot,
  tabId: string
) {
  const session = workspace.terminalSessions?.[tabId];
  return {
    activeConversationId: session?.activeConversationId ?? null,
    composerSurface: session?.composerSurface ?? (session?.activeConversationId ? 'agent' : 'terminal'),
    workingDirectory: session?.workingDirectory ?? null,
    terminalSessionId: session?.terminalSessionId ?? null,
    agentTerminalSessionId: session?.agentTerminalSessionId ?? null,
    pendingApproval: session?.pendingApproval ?? null,
    terminalBlockMetaById: session?.terminalBlockMetaById ?? {},
    agentTerminalBlockMetaById: session?.agentTerminalBlockMetaById ?? {},
    syntheticBlocks: session?.syntheticBlocks ?? []
  };
}

export function App() {
  const panelMode = getPanelMode();
  const bootstrapMemory = useMemoryStore((state) => state.bootstrap);
  const memoryWorkspace = useMemoryStore((state) => state.workspace);
  const saveWorkspace = useMemoryStore((state) => state.saveWorkspace);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(() => {
    return localStorage.getItem('onboarding_completed') === 'true';
  });

  useEffect(() => {
    void bootstrapMemory();
  }, [bootstrapMemory]);

  useEffect(() => {
    if (panelMode !== 'launcher') {
      return;
    }

    if (!memoryWorkspace) {
      return;
    }

    const hasLinkedLauncherTab = Boolean(
      memoryWorkspace.launcherTabId
      && memoryWorkspace.tabs.some((tab) => tab.id === memoryWorkspace.launcherTabId)
    );

    if (hasLinkedLauncherTab) {
      return;
    }

    const terminalTabs = memoryWorkspace.tabs.filter((tab) => tab.kind === 'terminal');
    const nextTerminalIndex = Math.max(
      memoryWorkspace.nextTerminalIndex || 1,
      terminalTabs.length + 1
    );
    const nextTabId = `terminal-${String(nextTerminalIndex).padStart(2, '0')}`;

    void saveWorkspace({
      ...memoryWorkspace,
      tabs: [
        ...memoryWorkspace.tabs,
        {
          id: nextTabId,
          label: '~',
          kind: 'terminal'
        }
      ],
      launcherTabId: nextTabId,
      selectedTabId: nextTabId,
      nextTerminalIndex: nextTerminalIndex + 1,
      terminalSessions: {
        ...(memoryWorkspace.terminalSessions ?? {}),
        [nextTabId]: {
          activeConversationId: null,
          composerSurface: 'terminal',
          workingDirectory: null,
          terminalSessionId: null,
          agentTerminalSessionId: null,
          pendingApproval: null,
          terminalBlockMetaById: {},
          agentTerminalBlockMetaById: {},
          syntheticBlocks: []
        }
      },
      updatedAt: new Date().toISOString()
    });
  }, [memoryWorkspace, panelMode, saveWorkspace]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'onboarding_completed') {
        setIsOnboardingCompleted(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('onboarding_completed', 'true');
    setIsOnboardingCompleted(true);
  };

  if (!isOnboardingCompleted) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (panelMode === 'settings') {
    return <AppWindow />;
  }

  const launcherWorkspace = buildWorkspaceForLauncher(memoryWorkspace);
  const launcherTabId = launcherWorkspace?.launcherTabId ?? null;
  const launcherSession = launcherTabId
    ? launcherWorkspace?.terminalSessions?.[launcherTabId] ?? null
    : null;
  const isLinkedToWorkspace = Boolean(launcherTabId && launcherWorkspace?.tabs.some((tab) => tab.id === launcherTabId));
  const launcherWorkspaceDraftRef = useRef<MemoryWorkspaceSnapshot | null>(launcherWorkspace);
  const [launcherSessionOverride, setLauncherSessionOverride] = useState<TerminalSessionState | null>(null);

  const effectiveLauncherSession = useMemo(() => {
    if (launcherSessionOverride) {
      return launcherSessionOverride;
    }

    return launcherSession
      ? {
          ...launcherSession,
          composerSurface: launcherSession.composerSurface ?? (launcherSession.activeConversationId ? 'agent' : 'terminal'),
          workingDirectory: launcherSession.workingDirectory ?? null,
          terminalSessionId: launcherSession.terminalSessionId ?? null,
          agentTerminalSessionId: launcherSession.agentTerminalSessionId ?? null,
          pendingApproval: launcherSession.pendingApproval ?? null,
          terminalBlockMetaById: launcherSession.terminalBlockMetaById ?? {},
          agentTerminalBlockMetaById: launcherSession.agentTerminalBlockMetaById ?? {},
          syntheticBlocks: launcherSession.syntheticBlocks ?? []
        }
      : null;
  }, [launcherSession, launcherSessionOverride]);

  useEffect(() => {
    launcherWorkspaceDraftRef.current = launcherWorkspace;
  }, [launcherWorkspace]);

  useEffect(() => {
    if (!launcherTabId) {
      setLauncherSessionOverride(null);
      return;
    }

    const nextSession = launcherSession
      ? {
          ...launcherSession,
          composerSurface: launcherSession.composerSurface ?? (launcherSession.activeConversationId ? 'agent' : 'terminal'),
          workingDirectory: launcherSession.workingDirectory ?? null,
          terminalSessionId: launcherSession.terminalSessionId ?? null,
          agentTerminalSessionId: launcherSession.agentTerminalSessionId ?? null,
          pendingApproval: launcherSession.pendingApproval ?? null,
          terminalBlockMetaById: launcherSession.terminalBlockMetaById ?? {},
          agentTerminalBlockMetaById: launcherSession.agentTerminalBlockMetaById ?? {},
          syntheticBlocks: launcherSession.syntheticBlocks ?? []
        }
      : null;

    setLauncherSessionOverride((current) => {
      if (JSON.stringify(current) === JSON.stringify(nextSession)) {
        return current;
      }

      return nextSession;
    });
  }, [launcherSession, launcherTabId]);

  const updateLauncherWorkspace = useCallback(async (
    updater: (workspace: MemoryWorkspaceSnapshot) => MemoryWorkspaceSnapshot
  ) => {
    const current = launcherWorkspaceDraftRef.current
      ?? buildWorkspaceForLauncher(useMemoryStore.getState().workspace);
    if (!current) {
      return;
    }

    const nextWorkspace = updater(current);
    launcherWorkspaceDraftRef.current = nextWorkspace;
    await saveWorkspace(nextWorkspace);
  }, [saveWorkspace]);

  const updateLauncherSession = useCallback((
    updater: (session: TerminalSessionState) => TerminalSessionState
  ) => {
    if (!isLinkedToWorkspace || !launcherTabId) {
      return;
    }

    setLauncherSessionOverride((current) => {
      const baseSession = current ?? (
        launcherSession
          ? {
              ...launcherSession,
              composerSurface: launcherSession.composerSurface ?? (launcherSession.activeConversationId ? 'agent' : 'terminal'),
              workingDirectory: launcherSession.workingDirectory ?? null,
              terminalSessionId: launcherSession.terminalSessionId ?? null,
              agentTerminalSessionId: launcherSession.agentTerminalSessionId ?? null,
              pendingApproval: launcherSession.pendingApproval ?? null,
              terminalBlockMetaById: launcherSession.terminalBlockMetaById ?? {},
              agentTerminalBlockMetaById: launcherSession.agentTerminalBlockMetaById ?? {},
              syntheticBlocks: launcherSession.syntheticBlocks ?? []
            }
          : {
              activeConversationId: null,
              composerSurface: 'terminal',
              workingDirectory: null,
              terminalSessionId: null,
              agentTerminalSessionId: null,
              pendingApproval: null,
              terminalBlockMetaById: {},
              agentTerminalBlockMetaById: {},
              syntheticBlocks: []
            }
      );
      const nextSession = updater(baseSession);

      void updateLauncherWorkspace((workspace) => ({
        ...workspace,
        terminalSessions: {
          ...(workspace.terminalSessions ?? {}),
          [launcherTabId]: nextSession
        }
      }));

      return nextSession;
    });
  }, [isLinkedToWorkspace, launcherSession, launcherTabId, updateLauncherWorkspace]);

  const handleLauncherConversationChange = useCallback((conversationId: string | null) => {
    updateLauncherSession((session) => ({
      ...session,
      activeConversationId: conversationId,
      composerSurface: conversationId ? 'agent' : 'terminal'
    }));
  }, [updateLauncherSession]);

  const handleLauncherNewConversation = useCallback(() => {
    if (!isLinkedToWorkspace || !launcherTabId) {
      return null;
    }

    const conversationId = `conv_${Date.now()}`;
    updateLauncherSession((session) => ({
      ...session,
      activeConversationId: conversationId,
      composerSurface: 'agent'
    }));
    return conversationId;
  }, [isLinkedToWorkspace, launcherTabId, updateLauncherSession]);

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

const EMPTY_META: Record<string, TerminalBlockSharedMeta> = {};

  return (
    <Launcher
      active={true}
      conversationId={isLinkedToWorkspace ? effectiveLauncherSession?.activeConversationId ?? null : undefined}
      initialComposerSurface={isLinkedToWorkspace ? effectiveLauncherSession?.composerSurface ?? 'terminal' : 'terminal'}
      initialTerminalSessionId={isLinkedToWorkspace ? effectiveLauncherSession?.terminalSessionId ?? null : null}
      initialAgentTerminalSessionId={isLinkedToWorkspace ? effectiveLauncherSession?.agentTerminalSessionId ?? null : null}
      initialWorkingDirectory={isLinkedToWorkspace ? effectiveLauncherSession?.workingDirectory ?? null : null}
      onConversationChange={handleLauncherConversationChange}
      onComposerSurfaceChange={handleLauncherComposerSurfaceChange}
      onNewConversation={handleLauncherNewConversation}
      onPendingApprovalChange={handleLauncherPendingApprovalChange}
      onTerminalBlockMetaChange={handleLauncherTerminalBlockMetaChange}
      onSyntheticBlocksChange={handleLauncherSyntheticBlocksChange}
      onTerminalSessionChange={handleLauncherTerminalSessionChange}
      onAgentTerminalBlockMetaChange={handleLauncherAgentTerminalBlockMetaChange}
      onAgentTerminalSessionChange={handleLauncherAgentTerminalSessionChange}
      onWorkingDirectoryChange={handleLauncherWorkingDirectoryChange}
      pendingApproval={isLinkedToWorkspace ? effectiveLauncherSession?.pendingApproval ?? null : undefined}
      persistWorkingDirectory={!isLinkedToWorkspace}
      persistTerminalSession={isLinkedToWorkspace}
      sharedTerminalBlockMetaById={isLinkedToWorkspace ? effectiveLauncherSession?.terminalBlockMetaById ?? EMPTY_META : undefined}
      sharedSyntheticBlocks={isLinkedToWorkspace ? effectiveLauncherSession?.syntheticBlocks ?? [] : undefined}
      sharedAgentTerminalBlockMetaById={isLinkedToWorkspace ? effectiveLauncherSession?.agentTerminalBlockMetaById ?? EMPTY_META : undefined}
    />
  );
}

export default App;
