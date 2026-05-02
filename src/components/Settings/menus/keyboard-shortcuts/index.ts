import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const keyboardShortcutsSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'keyboard-shortcuts',
  label: 'Keyboard shortcuts'
};

export const keyboardShortcutsSectionMeta: Record<'keyboard-shortcuts', SettingsSectionMeta> = {
  'keyboard-shortcuts': {
    title: 'Keyboard shortcuts',
    description: 'Customize launcher and workspace shortcuts.',
    contentKind: 'placeholder'
  }
};

