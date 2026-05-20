import type {
  SettingsSectionMeta,
  SettingsSidebarGroupItem,
  SettingsSidebarItem
} from './settingsTypes';
import { accountSectionMeta, accountSidebarItem } from './menus/account';
import { agentsSectionMeta, agentsSidebarItem } from './menus/agents';
import { appearanceSectionMeta, appearanceSidebarItem } from './menus/appearance';
import { cloudPlatformSectionMeta, cloudPlatformSidebarItem } from './menus/cloud-platform';
import { codeSectionMeta, codeSidebarItem } from './menus/code';
import { keyboardShortcutsSectionMeta, keyboardShortcutsSidebarItem } from './menus/keyboard-shortcuts';

export type {
  SettingsSectionContentKind,
  SettingsSectionMeta,
  SettingsSidebarGroupItem,
  SettingsSidebarHeadingItem,
  SettingsSidebarItem,
  SettingsSidebarLeafItem
} from './settingsTypes';

export const settingsSidebarItems: SettingsSidebarItem[] = [
  accountSidebarItem,
  agentsSidebarItem,
  codeSidebarItem,
  cloudPlatformSidebarItem,
  appearanceSidebarItem,
  keyboardShortcutsSidebarItem,
];

export const settingsDefaultExpandedGroupIds = settingsSidebarItems
  .filter((item): item is SettingsSidebarGroupItem => item.kind === 'group' && item.defaultExpanded !== false)
  .map((item) => item.id);

export const settingsDefaultSectionId = 'profile';

export const settingsSectionMetaById: Record<string, SettingsSectionMeta> = {
  ...accountSectionMeta,
  ...agentsSectionMeta,
  ...codeSectionMeta,
  ...cloudPlatformSectionMeta,
  ...appearanceSectionMeta,
  ...keyboardShortcutsSectionMeta
};

export function getSettingsSectionMeta(sectionId: string): SettingsSectionMeta {
  const meta = settingsSectionMetaById[sectionId];
  if (meta) return meta;

  // Fallback for Octo Agent if ID mapping is slightly off
  if (sectionId === 'agents/octo-agent' || sectionId === 'agents/warp-agent') {
    return {
      title: 'Octo Agent',
      description: 'Configure default agent behavior and task routing.',
      contentKind: 'octo-agent'
    };
  }

  if (sectionId === 'account') {
    return accountSectionMeta.profile;
  }

  return {
    title: 'Settings',
    description: 'Choose a section from the sidebar.',
    contentKind: 'placeholder'
  };
}
