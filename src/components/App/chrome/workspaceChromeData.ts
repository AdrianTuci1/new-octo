import type { WorkspaceChromeTab } from './workspaceChromeTypes';

export const initialWorkspaceChromeTabs: WorkspaceChromeTab[] = [
  {
    id: 'terminal-main',
    label: '../launcher-rs-react',
    kind: 'session'
  },
  {
    id: 'settings',
    label: 'Settings',
    kind: 'settings'
  }
];

export const defaultWorkspaceChromeTabId = 'settings';
