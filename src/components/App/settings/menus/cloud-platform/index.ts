import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const cloudPlatformSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'cloud-platform/cloud',
  label: 'Cloud'
};

export const cloudPlatformSectionMeta: Record<
  'cloud-platform/cloud',
  SettingsSectionMeta
> = {
  'cloud-platform/cloud': {
    title: 'Cloud',
    description: 'Configure cloud profiles, connection details, and credential bridging.',
    contentKind: 'cloud-terminals'
  }
};
