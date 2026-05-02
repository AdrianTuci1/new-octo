import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const accountSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'account',
  label: 'Account'
};

export const accountSectionMeta: Record<'account', SettingsSectionMeta> = {
  account: {
    title: 'Account',
    description: 'Manage the workspace identity, sync preferences, and release channel.',
    contentKind: 'account'
  }
};

