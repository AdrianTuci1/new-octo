import type { StoreApi } from 'zustand/vanilla';
import type { ChatStoreState } from '../../stores/chatStore';
import type { CommandApproval, FileChangeApproval } from '../../types/terminal';

/**
 * Manages pending approval state for the Launcher surface.
 * Mirrors AgentApprovalService but uses chatStore instead of AgentStore.
 */
export class LauncherApprovalService {
  constructor(private readonly store: StoreApi<ChatStoreState>) {}

  setPendingApproval(approval: CommandApproval | null): void {
    this.store.getState().setLocalPendingApproval(approval);
  }

  clearApproval(): void {
    this.store.getState().setLocalPendingApproval(null);
  }

  requestCommandApproval(approval: CommandApproval): void {
    this.setPendingApproval(approval);
  }

  requestFileChangeApproval(approval: FileChangeApproval): void {
    this.setPendingApproval(approval);
  }
}
