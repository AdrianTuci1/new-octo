import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const featuresSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'features',
  label: 'Features'
};

export const featuresSectionMeta: Record<'features', SettingsSectionMeta> = {
  features: {
    title: 'Features',
    description: 'Feature flags and experimental capabilities will be configured here.',
    contentKind: 'placeholder'
  }
};

