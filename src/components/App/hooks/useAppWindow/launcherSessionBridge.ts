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

function areCommandApprovalsEquivalent(left: CommandApproval | null, right: CommandApproval | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'file-change' && right.kind === 'file-change') {
    return left.toolCallId === right.toolCallId
      && left.summary === right.summary
      && left.fileDiffs === right.fileDiffs;
  }

  if (left.kind === 'topic-change' && right.kind === 'topic-change') {
    return left.reason === right.reason
      && left.startNewConversationLabel === right.startNewConversationLabel
      && left.continueConversationLabel === right.continueConversationLabel;
  }

  return 'command' in left
    && 'command' in right
    && left.command === right.command
    && left.toolCallId === right.toolCallId
    && left.reason === right.reason;
}

function areBlockMetaMapsEquivalent(
  left: Record<string, TerminalBlockSharedMeta>,
  right: Record<string, TerminalBlockSharedMeta>
) {
  if (left === right) {
    return true;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    const leftMeta = left[key];
    const rightMeta = right[key];
    if (!rightMeta) {
      return false;
    }

    if (
      leftMeta === rightMeta
    ) {
      continue;
    }

    if (
      leftMeta.presentation !== rightMeta.presentation
      || leftMeta.source !== rightMeta.source
      || leftMeta.conversationId !== rightMeta.conversationId
      || leftMeta.conversationTitle !== rightMeta.conversationTitle
    ) {
      return false;
    }
  }

  return true;
}

function areTerminalCommandBlocksEquivalent(left: TerminalCommandBlock[], right: TerminalCommandBlock[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftBlock = left[index];
    const rightBlock = right[index];

    if (leftBlock === rightBlock) {
      continue;
    }

    if (
      leftBlock.id !== rightBlock.id
      || leftBlock.command !== rightBlock.command
      || leftBlock.output !== rightBlock.output
      || leftBlock.startedAt !== rightBlock.startedAt
      || leftBlock.finishedAt !== rightBlock.finishedAt
      || leftBlock.exitCode !== rightBlock.exitCode
      || leftBlock.durationMs !== rightBlock.durationMs
      || leftBlock.status !== rightBlock.status
      || leftBlock.presentation !== rightBlock.presentation
      || leftBlock.source !== rightBlock.source
      || leftBlock.conversationId !== rightBlock.conversationId
      || leftBlock.conversationTitle !== rightBlock.conversationTitle
    ) {
      return false;
    }
  }

  return true;
}

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

  const activeLauncherSessionId = activePaneId ? resolveLauncherSessionIdForPane(activePaneId) : null;
  const activeSession = useMemo(() => {
    if (!activeLauncherSessionId) {
      return null;
    }

    return terminalSessions[activeLauncherSessionId] ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);
  }, [activeLauncherSessionId, defaultWorkingDirectory, terminalSessions]);

  const activeConversationId = activeSession?.activeConversationId ?? null;

  const activePaneContext = useMemo<WorkspaceActivePaneContext>(() => {
    return {
      tabKind: selectedTab.kind,
      paneId: activePaneId,
      launcherSessionId: activeLauncherSessionId,
      workingDirectory: selectedTab.kind === 'terminal'
        ? activeSession?.workingDirectory ?? defaultWorkingDirectory
        : defaultWorkingDirectory,
      composerSurface: selectedTab.kind === 'terminal' ? activeSession?.composerSurface ?? null : null,
      activeConversationId: selectedTab.kind === 'terminal' ? activeSession?.activeConversationId ?? null : null,
      canShowGitDiff: selectedTab.kind === 'terminal'
    };
  }, [activeLauncherSessionId, activePaneId, activeSession, defaultWorkingDirectory, selectedTab.kind]);

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
      areCommandApprovalsEquivalent(session.pendingApproval, approval) ? session : { ...session, pendingApproval: approval }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalBlockMetaChange = useCallback((
    paneId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      areBlockMetaMapsEquivalent(session.terminalBlockMetaById, terminalBlockMetaById)
        ? session
        : { ...session, terminalBlockMetaById }
    ));
  }, [updateLauncherSessionForPane]);

  const handleAgentTerminalBlockMetaChange = useCallback((
    paneId: string,
    terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      areBlockMetaMapsEquivalent(session.agentTerminalBlockMetaById, terminalBlockMetaById)
        ? session
        : { ...session, agentTerminalBlockMetaById: terminalBlockMetaById }
    ));
  }, [updateLauncherSessionForPane]);

  const handleTerminalBlocksChange = useCallback((
    paneId: string,
    terminalBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      areTerminalCommandBlocksEquivalent(session.terminalBlocks ?? [], terminalBlocks)
        ? session
        : { ...session, terminalBlocks }
    ));
  }, [updateLauncherSessionForPane]);

  const handleAgentTerminalBlocksChange = useCallback((
    paneId: string,
    terminalBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      areTerminalCommandBlocksEquivalent(session.agentTerminalBlocks ?? [], terminalBlocks)
        ? session
        : { ...session, agentTerminalBlocks: terminalBlocks }
    ));
  }, [updateLauncherSessionForPane]);

  const handleSyntheticBlocksChange = useCallback((
    paneId: string,
    syntheticBlocks: TerminalCommandBlock[]
  ) => {
    updateLauncherSessionForPane(paneId, (session) => (
      areTerminalCommandBlocksEquivalent(session.syntheticBlocks, syntheticBlocks)
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
    return `pane-${paneId}`;
  }, []);

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
