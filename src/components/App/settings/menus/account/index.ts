import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const accountSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'profile',
  label: 'Profile'
};

export const accountSectionMeta: Record<'profile', SettingsSectionMeta> = {
  profile: {
    title: 'Profile',
    description: 'Manage your local workspace identity and avatar.',
    contentKind: 'profile'
  }
};
