import type { WorkspaceActivePaneContext, WorkspaceChromeTab, WorkspacePaneLayout } from '../chrome';

export class WorkspaceViewModel {
  constructor(
    public readonly selectedTab: WorkspaceChromeTab,
    public readonly isAgentsActive: boolean,
    public readonly selectedPaneLayout: WorkspacePaneLayout | null,
    public readonly activePaneId: string | null,
    public readonly activePaneContext: WorkspaceActivePaneContext
  ) {}

  getActivePaneId(): string | null {
    return this.activePaneId;
  }

  isLauncherView(): boolean {
    return !this.isAgentsActive && this.selectedTab.kind === 'terminal';
  }

  isSettingsView(): boolean {
    return this.selectedTab.kind === 'settings';
  }

  getPaneLayout(): WorkspacePaneLayout | null {
    return this.selectedPaneLayout;
  }
}
