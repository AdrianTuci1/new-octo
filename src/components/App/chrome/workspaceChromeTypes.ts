export type WorkspaceChromeTabKind = 'tools' | 'agents' | 'terminal' | 'conversation' | 'settings';

export type WorkspaceChromeTab = {
  id: string;
  label: string;
  kind: WorkspaceChromeTabKind;
  subtitle?: string;
};

export type WorkspaceConversation = {
  id: string;
  title: string;
  timeLabel: string;
  branchLabel?: string;
};
