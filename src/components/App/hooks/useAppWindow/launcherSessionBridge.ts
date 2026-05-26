import { useCallback, useMemo } from 'react';
import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock } from '../../../../types/terminal';
import type { WorkspaceActivePaneContext, WorkspaceChromeTab } from '../../chrome';
import * as Utils from '../../utils';
import type { TerminalSessionState } from '../../utils';
import type { AppWindowStoreApi } from './store';

type UseAppWindowLauncherSessionBridgeParams = {
  store: AppWindowStoreApi;
  activePaneId: string | null;
  defaultWorkingDirectory: string | null;
  paneSessionBindingsByPaneId: Utils.WorkspacePaneSessionBindings;
  selectedTab: WorkspaceChromeTab;
  terminalSessions: Record<string, TerminalSessionState>;
};

export function useAppWindowLauncherSessionBridge({
  store,
  activePaneId,
  defaultWorkingDirectory,
  paneSessionBindingsByPaneId,
  selectedTab,
  terminalSessions
}: UseAppWindowLauncherSessionBridgeParams) {
  const resolveLauncherSessionIdForPane = useCallback((paneId: string | null) => {
    if (!paneId) {
      return null;
    }

    return paneSessionBindingsByPaneId[paneId] ?? paneId;
  }, [paneSessionBindingsByPaneId]);

  const getLauncherSessionForPane = useCallback((paneId: string | null) => {
    const launcherSessionId = resolveLauncherSessionIdForPane(paneId);
    if (!launcherSessionId) {
      return null;
    }

    return terminalSessions[launcherSessionId] ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);
  }, [defaultWorkingDirectory, resolveLauncherSessionIdForPane, terminalSessions]);

  const activeConversationId = activePaneId
    ? getLauncherSessionForPane(activePaneId)?.activeConversationId ?? null
    : null;

  const activePaneContext = useMemo<WorkspaceActivePaneContext>(() => {
    const activeSession = getLauncherSessionForPane(activePaneId);

    return {
      tabKind: selectedTab.kind,
      paneId: activePaneId,
      launcherSessionId: resolveLauncherSessionIdForPane(activePaneId),
      workingDirectory: selectedTab.kind === 'terminal'
        ? activeSession?.workingDirectory ?? defaultWorkingDirectory
        : defaultWorkingDirectory,
      composerSurface: selectedTab.kind === 'terminal' ? activeSession?.composerSurface ?? null : null,
      activeConversationId: selectedTab.kind === 'terminal' ? activeSession?.activeConversationId ?? null : null,
      canShowGitDiff: selectedTab.kind === 'terminal'
    };
  }, [activePaneId, defaultWorkingDirectory, getLauncherSessionForPane, resolveLauncherSessionIdForPane, selectedTab.kind]);

  const updateLauncherSessionForPane = useCallback((
    paneId: string,
    updater: (session: TerminalSessionState) => TerminalSessionState
  ) => {
    store.getState().setTerminalSessions((current) => {
      const launcherSessionId = paneSessionBindingsByPaneId[paneId] ?? paneId;
      const currentSession = current[launcherSessionId] ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);
      const nextSession = updater(currentSession);
      if (nextSession === currentSession) {
        return current;
      }

      return {
        ...current,
        [launcherSessionId]: nextSession
      };
    });
  }, [defaultWorkingDirectory, paneSessionBindingsByPaneId, store]);

  const handleTerminalWorkingDirectoryChange = useCallback((paneId: string, path: string | null) => {
    updateLauncherSessionForPane(paneId, (session) => (
      session.workingDirectory === path ? session : { ...session, workingDirectory: path }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalSessionChange = useCallback((paneId: string, sessionId: string | null) => {
    updateLauncherSessionForPane(paneId, (session) => (
      session.terminalSessionId === sessionId ? session : { ...session, terminalSessionId: sessionId }
    ));
  }, [updateLauncherSessionForPane]);

  const handleAgentTerminalSessionChange = useCallback((paneId: string, sessionId: string | null) => {
    updateLauncherSessionForPane(paneId, (session) => (
      session.agentTerminalSessionId === sessionId ? session : { ...session, agentTerminalSessionId: sessionId }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalPendingApprovalChange = useCallback((paneId: string, approval: CommandApproval | null) => {
    updateLauncherSessionForPane(paneId, (session) => (
      JSON.stringify(session.pendingApproval) === JSON.stringify(approval) ? session : { ...session, pendingApproval: approval }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalBlockMetaChange = useCallback((
    paneId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      JSON.stringify(session.terminalBlockMetaById) === JSON.stringify(terminalBlockMetaById)
        ? session
        : { ...session, terminalBlockMetaById }
    ));
  }, [updateLauncherSessionForPane]);

  const handleAgentTerminalBlockMetaChange = useCallback((
    paneId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      JSON.stringify(session.agentTerminalBlockMetaById) === JSON.stringify(terminalBlockMetaById)
        ? session
        : { ...session, agentTerminalBlockMetaById: terminalBlockMetaById }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalBlocksChange = useCallback((
    paneId: string,
    terminalBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      JSON.stringify(session.terminalBlocks ?? []) === JSON.stringify(terminalBlocks)
        ? session
        : { ...session, terminalBlocks }
    ));
  }, [updateLauncherSessionForPane]);

  const handleAgentTerminalBlocksChange = useCallback((
    paneId: string,
    terminalBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      JSON.stringify(session.agentTerminalBlocks ?? []) === JSON.stringify(terminalBlocks)
        ? session
        : { ...session, agentTerminalBlocks: terminalBlocks }
    ));
  }, [updateLauncherSessionForPane]);

  const handleSyntheticBlocksChange = useCallback((
    paneId: string,
    syntheticBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      session.syntheticBlocks.length === syntheticBlocks.length && JSON.stringify(session.syntheticBlocks) === JSON.stringify(syntheticBlocks)
        ? session
        : { ...session, syntheticBlocks }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalConversationChange = useCallback((paneId: string, conversationId: string | null) => {
    updateLauncherSessionForPane(paneId, (session) => (
      session.activeConversationId === conversationId
        ? session
        : {
            ...session,
            activeConversationId: conversationId,
            composerSurface: conversationId ? 'agent' : 'terminal'
          }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalComposerSurfaceChange = useCallback((paneId: string, composerSurface: 'agent' | 'terminal') => {
    updateLauncherSessionForPane(paneId, (session) => (
      session.composerSurface === composerSurface ? session : { ...session, composerSurface }
    ));
  }, [updateLauncherSessionForPane]);

  const getLauncherIdentityKey = useCallback((paneId: string) => {
    const session = getLauncherSessionForPane(paneId);
    return [
      paneId,
      resolveLauncherSessionIdForPane(paneId) ?? '',
      session?.activeConversationId ?? '',
      session?.terminalSessionId ?? '',
      session?.agentTerminalSessionId ?? '',
      session?.composerSurface ?? 'terminal'
    ].join('|');
  }, [getLauncherSessionForPane, resolveLauncherSessionIdForPane]);

  return {
    activeConversationId,
    activePaneContext,
    getLauncherIdentityKey,
    getLauncherSessionForPane,
    handleAgentTerminalBlockMetaChange,
    handleAgentTerminalBlocksChange,
    handleAgentTerminalSessionChange,
    handleSyntheticBlocksChange,
    handleTerminalBlockMetaChange,
    handleTerminalBlocksChange,
    handleTerminalComposerSurfaceChange,
    handleTerminalConversationChange,
    handleTerminalPendingApprovalChange,
    handleTerminalSessionChange,
    handleTerminalWorkingDirectoryChange,
    resolveLauncherSessionIdForPane
  };
}
