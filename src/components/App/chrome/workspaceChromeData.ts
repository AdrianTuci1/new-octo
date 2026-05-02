import type { WorkspaceChromeTab, WorkspaceConversation } from './workspaceChromeTypes';

export const initialWorkspaceChromeTabs: WorkspaceChromeTab[] = [
  {
    id: 'terminal-main',
    label: '~',
    kind: 'terminal'
  },
  {
    id: 'settings',
    label: 'Settings',
    kind: 'settings'
  }
];

export const defaultWorkspaceChromeTabId = 'settings';

export const initialWorkspaceConversations: WorkspaceConversation[] = [];
