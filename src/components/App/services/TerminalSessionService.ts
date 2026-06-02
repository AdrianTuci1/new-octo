import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock } from '../../../types/terminal';
import type { AppWindowStoreApi } from '../appWindow/store';
import * as Utils from '../utils';
import type { TerminalSessionState } from '../utils';

function areCommandApprovalsEquivalent(left: CommandApproval | null, right: CommandApproval | null): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;

  if (left.kind !== right.kind) return false;

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
): boolean {
  if (left === right) return true;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    const leftMeta = left[key];
    const rightMeta = right[key];
    if (!rightMeta) return false;
    if (leftMeta === rightMeta) continue;

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

function areTerminalCommandBlocksEquivalent(left: TerminalCommandBlock[], right: TerminalCommandBlock[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftBlock = left[index];
    const rightBlock = right[index];
    if (leftBlock === rightBlock) continue;

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

export class TerminalSessionService {
  private store: AppWindowStoreApi;

  constructor(store: AppWindowStoreApi) {
    this.store = store;
  }

  private resolveSessionId(paneId: string): string {
    const state = this.store.getState();
    return state.paneSessionBindingsByPaneId[paneId] ?? paneId;
  }

  private updateSession(paneId: string, updater: (session: TerminalSessionState) => TerminalSessionState): void {
    const state = this.store.getState();
    const pathContext = state.pathContext;
    const defaultWorkingDirectory = pathContext?.homeDir ?? pathContext?.currentDir ?? null;

    state.setTerminalSessions((current) => {
      const launcherSessionId = state.paneSessionBindingsByPaneId[paneId] ?? paneId;
      const currentSession = current[launcherSessionId] ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);
      const nextSession = updater(currentSession);
      if (nextSession === currentSession) return current;
      return { ...current, [launcherSessionId]: nextSession };
    });
  }

  updateWorkingDirectory(paneId: string, path: string | null): void {
    this.updateSession(paneId, (session) =>
      session.workingDirectory === path ? session : { ...session, workingDirectory: path }
    );
  }

  updateSessionId(paneId: string, id: string | null): void {
    this.updateSession(paneId, (session) =>
      session.terminalSessionId === id ? session : { ...session, terminalSessionId: id }
    );
  }

  updateAgentSessionId(paneId: string, id: string | null): void {
    this.updateSession(paneId, (session) =>
      session.agentTerminalSessionId === id ? session : { ...session, agentTerminalSessionId: id }
    );
  }

  updateTerminalBlocks(paneId: string, blocks: TerminalCommandBlock[]): void {
    this.updateSession(paneId, (session) =>
      areTerminalCommandBlocksEquivalent(session.terminalBlocks ?? [], blocks)
        ? session
        : { ...session, terminalBlocks: blocks }
    );
  }

  updateAgentTerminalBlocks(paneId: string, blocks: TerminalCommandBlock[]): void {
    this.updateSession(paneId, (session) =>
      areTerminalCommandBlocksEquivalent(session.agentTerminalBlocks ?? [], blocks)
        ? session
        : { ...session, agentTerminalBlocks: blocks }
    );
  }

  updateSyntheticBlocks(paneId: string, blocks: TerminalCommandBlock[]): void {
    this.updateSession(paneId, (session) =>
      areTerminalCommandBlocksEquivalent(session.syntheticBlocks, blocks)
        ? session
        : { ...session, syntheticBlocks: blocks }
    );
  }

  updateTerminalMeta(paneId: string, meta: Record<string, TerminalBlockSharedMeta>): void {
    this.updateSession(paneId, (session) =>
      areBlockMetaMapsEquivalent(session.terminalBlockMetaById, meta)
        ? session
        : { ...session, terminalBlockMetaById: meta }
    );
  }

  updateAgentTerminalMeta(paneId: string, meta: Record<string, TerminalBlockSharedMeta>): void {
    this.updateSession(paneId, (session) =>
      areBlockMetaMapsEquivalent(session.agentTerminalBlockMetaById, meta)
        ? session
        : { ...session, agentTerminalBlockMetaById: meta }
    );
  }

  updateConversationId(paneId: string, id: string | null): void {
    this.updateSession(paneId, (session) =>
      session.activeConversationId === id
        ? session
        : {
            ...session,
            activeConversationId: id,
            composerSurface: id ? 'agent' : 'terminal'
          }
    );
  }

  updateComposerSurface(paneId: string, surface: 'agent' | 'terminal'): void {
    this.updateSession(paneId, (session) =>
      session.composerSurface === surface ? session : { ...session, composerSurface: surface }
    );
  }

  updatePendingApproval(paneId: string, approval: CommandApproval | null): void {
    this.updateSession(paneId, (session) =>
      areCommandApprovalsEquivalent(session.pendingApproval, approval)
        ? session
        : { ...session, pendingApproval: approval }
    );
  }

  getSession(paneId: string): TerminalSessionState | null {
    const state = this.store.getState();
    const pathContext = state.pathContext;
    const defaultWorkingDirectory = pathContext?.homeDir ?? pathContext?.currentDir ?? null;
    const launcherSessionId = state.paneSessionBindingsByPaneId[paneId] ?? paneId;
    if (!launcherSessionId) return null;
    return state.terminalSessions[launcherSessionId] ?? Utils.createEmptyTerminalSession(defaultWorkingDirectory);
  }

  async killSession(sessionId: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('terminal_kill_session', { request: { sessionId } });
    } catch {
      // Session may already be dead
    }
  }
}
