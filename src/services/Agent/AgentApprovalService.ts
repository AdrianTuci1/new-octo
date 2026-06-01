import type { StoreApi } from 'zustand/vanilla';
import type { AgentState } from '../../stores/AgentStore';
import type { CommandApproval, FileChangeApproval } from '../../types/terminal';

/**
 * Manages pending approval state and auto-approve logic.
 */
export class AgentApprovalService {
  constructor(private readonly store: StoreApi<AgentState>) {}

  get localPendingApproval(): CommandApproval | null {
    return this.store.getState().localPendingApproval;
  }

  get autoApproveAgentLoop(): boolean {
    return this.store.getState().autoApproveAgentLoop;
  }

  setPendingApproval(approval: CommandApproval | null): void {
    this.store.getState().setLocalPendingApproval(approval);
  }

  setAutoApproveAgentLoop(value: boolean): void {
    this.store.getState().setAutoApproveAgentLoop(value);
  }

  requestCommandApproval(approval: CommandApproval): void {
    this.setPendingApproval(approval);
  }

  requestFileChangeApproval(approval: FileChangeApproval): void {
    this.setPendingApproval(approval);
  }

  clearApproval(): void {
    this.setPendingApproval(null);
  }
}
