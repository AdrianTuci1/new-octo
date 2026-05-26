export type WorkspaceChromeTabKind = 'tools' | 'agents' | 'terminal' | 'conversation' | 'settings';
export type WorkspacePaneDirection = 'horizontal' | 'vertical';

export type WorkspaceChromeTab = {
  id: string;
  label: string;
  kind: WorkspaceChromeTabKind;
  subtitle?: string;
  customLabel?: string | null;
  tintColor?: string | null;
  lastExecutionStatus?: string | null;
};

export type WorkspaceConversation = {
  id: string;
  title: string;
  timeLabel: string;
  branchLabel?: string;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  messageCount?: number;
  modelId?: string | null;
  cwd?: string | null;
};

export type WorkspacePaneLeafNode = {
  type: 'leaf';
  paneId: string;
};

export type WorkspacePaneSplitNode = {
  type: 'split';
  direction: WorkspacePaneDirection;
  children: WorkspacePaneNode[];
};

export type WorkspacePaneNode = WorkspacePaneLeafNode | WorkspacePaneSplitNode;

export type WorkspacePaneLayout = {
  activePaneId: string;
  root: WorkspacePaneNode;
};

export type WorkspaceActivePaneContext = {
  tabKind: WorkspaceChromeTabKind;
  paneId: string | null;
  launcherSessionId: string | null;
  workingDirectory: string | null;
  composerSurface: 'agent' | 'terminal' | null;
  activeConversationId: string | null;
  canShowGitDiff: boolean;
};
