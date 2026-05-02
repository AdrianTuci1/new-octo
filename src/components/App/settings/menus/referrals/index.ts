import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const referralsSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'referrals',
  label: 'Referrals'
};

export const referralsSectionMeta: Record<'referrals', SettingsSectionMeta> = {
  referrals: {
    title: 'Referrals',
    description: 'Track invites and rewards for the workspace.',
    contentKind: 'placeholder'
  }
};

