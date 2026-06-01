import type { TerminalBlockSharedMeta, TerminalCommandBlock, TerminalSessionTarget, CommandApproval } from '../../../types/terminal';
import type { TerminalSessionState } from '../utils';

export class TerminalSession {
  public readonly activeConversationId: string | null;
  public readonly composerSurface: 'agent' | 'terminal';
  public readonly workingDirectory: string | null;
  public readonly terminalSessionId: string | null;
  public readonly agentTerminalSessionId: string | null;
  public readonly terminalTarget: TerminalSessionTarget | null;
  public readonly agentTerminalTarget: TerminalSessionTarget | null;
  public readonly pendingApproval: CommandApproval | null;
  public readonly terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>;
  public readonly agentTerminalBlockMetaById: Record<string, TerminalBlockSharedMeta>;
  public readonly terminalBlocks: TerminalCommandBlock[];
  public readonly agentTerminalBlocks: TerminalCommandBlock[];
  public readonly syntheticBlocks: TerminalCommandBlock[];

  constructor(state: TerminalSessionState) {
    this.activeConversationId = state.activeConversationId;
    this.composerSurface = state.composerSurface;
    this.workingDirectory = state.workingDirectory;
    this.terminalSessionId = state.terminalSessionId;
    this.agentTerminalSessionId = state.agentTerminalSessionId;
    this.terminalTarget = state.terminalTarget;
    this.agentTerminalTarget = state.agentTerminalTarget;
    this.pendingApproval = state.pendingApproval;
    this.terminalBlockMetaById = state.terminalBlockMetaById;
    this.agentTerminalBlockMetaById = state.agentTerminalBlockMetaById;
    this.terminalBlocks = state.terminalBlocks;
    this.agentTerminalBlocks = state.agentTerminalBlocks;
    this.syntheticBlocks = state.syntheticBlocks;
  }

  withWorkingDirectory(dir: string | null): TerminalSession {
    return new TerminalSession({ ...this.toState(), workingDirectory: dir });
  }

  withConversationId(id: string | null): TerminalSession {
    const surface = id ? 'agent' as const : 'terminal' as const;
    return new TerminalSession({ ...this.toState(), activeConversationId: id, composerSurface: surface });
  }

  withSessionId(id: string | null): TerminalSession {
    return new TerminalSession({ ...this.toState(), terminalSessionId: id });
  }

  withAgentSessionId(id: string | null): TerminalSession {
    return new TerminalSession({ ...this.toState(), agentTerminalSessionId: id });
  }

  withTarget(target: TerminalSessionTarget | null): TerminalSession {
    return new TerminalSession({ ...this.toState(), terminalTarget: target });
  }

  withAgentTarget(target: TerminalSessionTarget | null): TerminalSession {
    return new TerminalSession({ ...this.toState(), agentTerminalTarget: target });
  }

  withBlocks(blocks: TerminalCommandBlock[]): TerminalSession {
    return new TerminalSession({ ...this.toState(), terminalBlocks: blocks });
  }

  withAgentBlocks(blocks: TerminalCommandBlock[]): TerminalSession {
    return new TerminalSession({ ...this.toState(), agentTerminalBlocks: blocks });
  }

  withSyntheticBlocks(blocks: TerminalCommandBlock[]): TerminalSession {
    return new TerminalSession({ ...this.toState(), syntheticBlocks: blocks });
  }

  withMeta(meta: Record<string, TerminalBlockSharedMeta>): TerminalSession {
    return new TerminalSession({ ...this.toState(), terminalBlockMetaById: meta });
  }

  withAgentMeta(meta: Record<string, TerminalBlockSharedMeta>): TerminalSession {
    return new TerminalSession({ ...this.toState(), agentTerminalBlockMetaById: meta });
  }

  withPendingApproval(approval: CommandApproval | null): TerminalSession {
    return new TerminalSession({ ...this.toState(), pendingApproval: approval });
  }

  withComposerSurface(surface: 'agent' | 'terminal'): TerminalSession {
    return new TerminalSession({ ...this.toState(), composerSurface: surface });
  }

  toState(): TerminalSessionState {
    return {
      activeConversationId: this.activeConversationId,
      composerSurface: this.composerSurface,
      workingDirectory: this.workingDirectory,
      terminalSessionId: this.terminalSessionId,
      agentTerminalSessionId: this.agentTerminalSessionId,
      terminalTarget: this.terminalTarget,
      agentTerminalTarget: this.agentTerminalTarget,
      pendingApproval: this.pendingApproval,
      terminalBlockMetaById: this.terminalBlockMetaById,
      agentTerminalBlockMetaById: this.agentTerminalBlockMetaById,
      terminalBlocks: this.terminalBlocks,
      agentTerminalBlocks: this.agentTerminalBlocks,
      syntheticBlocks: this.syntheticBlocks,
    };
  }

  static fromState(state: TerminalSessionState): TerminalSession {
    return new TerminalSession(state);
  }

  static createEmpty(workingDirectory: string | null = null): TerminalSession {
    return new TerminalSession({
      activeConversationId: null,
      composerSurface: 'terminal',
      workingDirectory,
      terminalSessionId: null,
      agentTerminalSessionId: null,
      terminalTarget: null,
      agentTerminalTarget: null,
      pendingApproval: null,
      terminalBlockMetaById: {},
      agentTerminalBlockMetaById: {},
      terminalBlocks: [],
      agentTerminalBlocks: [],
      syntheticBlocks: [],
    });
  }
}
