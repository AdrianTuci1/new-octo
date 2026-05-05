import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const teamsSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'teams',
  label: 'Teams'
};

export const teamsSectionMeta: Record<'teams', SettingsSectionMeta> = {
  teams: {
    title: 'Teams',
    description: 'Placeholder team settings for shared workspaces and access.',
    contentKind: 'placeholder'
  }
};

