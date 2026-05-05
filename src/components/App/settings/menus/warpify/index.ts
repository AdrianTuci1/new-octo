import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const warpifySidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'warpify',
  label: 'Warpify'
};

export const warpifySectionMeta: Record<'warpify', SettingsSectionMeta> = {
  warpify: {
    title: 'Warpify',
    description: 'Workspace automation and accelerator preferences go here.',
    contentKind: 'placeholder'
  }
};

