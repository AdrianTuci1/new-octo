export type WorkspaceChromeTabKind = 'tools' | 'agents' | 'session' | 'settings';

export type WorkspaceChromeTab = {
  id: string;
  label: string;
  kind: WorkspaceChromeTabKind;
  subtitle?: string;
};

