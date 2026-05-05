import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const appearanceSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'appearance',
  label: 'Appearance'
};

export const appearanceSectionMeta: Record<'appearance', SettingsSectionMeta> = {
  appearance: {
    title: 'Appearance',
    description: 'Theme, density, and visual preferences will live here.',
    contentKind: 'placeholder'
  }
};

