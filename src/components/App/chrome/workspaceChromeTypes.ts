export type WorkspaceChromeTabKind = 'tools' | 'agents' | 'terminal' | 'conversation' | 'settings';
export type WorkspacePaneDirection = 'horizontal' | 'vertical';

export type WorkspaceChromeTab = {
  id: string;
  label: string;
  kind: WorkspaceChromeTabKind;
  subtitle?: string;
  customLabel?: string | null;
  tintColor?: string | null;
};

export type WorkspaceConversation = {
  id: string;
  title: string;
  timeLabel: string;
  branchLabel?: string;
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
