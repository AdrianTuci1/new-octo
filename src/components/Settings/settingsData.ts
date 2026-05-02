import type {
  SettingsSectionMeta,
  SettingsSidebarGroupItem,
  SettingsSidebarItem
} from './settingsTypes';
import { accountSectionMeta, accountSidebarItem } from './menus/account';
import { agentsSectionMeta, agentsSidebarItem } from './menus/agents';
import { appearanceSectionMeta, appearanceSidebarItem } from './menus/appearance';
import { billingSectionMeta, billingSidebarItem } from './menus/billing-and-usage';
import { cloudPlatformSectionMeta, cloudPlatformSidebarItem } from './menus/cloud-platform';
import { codeSectionMeta, codeSidebarItem } from './menus/code';
import { featuresSectionMeta, featuresSidebarItem } from './menus/features';
import { keyboardShortcutsSectionMeta, keyboardShortcutsSidebarItem } from './menus/keyboard-shortcuts';
import { referralsSectionMeta, referralsSidebarItem } from './menus/referrals';
import { teamsSectionMeta, teamsSidebarItem } from './menus/teams';
import { warpifySectionMeta, warpifySidebarItem } from './menus/warpify';

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
  billingSidebarItem,
  codeSidebarItem,
  cloudPlatformSidebarItem,
  teamsSidebarItem,
  appearanceSidebarItem,
  featuresSidebarItem,
  keyboardShortcutsSidebarItem,
  warpifySidebarItem,
  referralsSidebarItem
];

export const settingsDefaultExpandedGroupIds = settingsSidebarItems
  .filter((item): item is SettingsSidebarGroupItem => item.kind === 'group' && item.defaultExpanded !== false)
  .map((item) => item.id);

export const settingsDefaultSectionId = 'account';

export const settingsSectionMetaById: Record<string, SettingsSectionMeta> = {
  ...accountSectionMeta,
  ...agentsSectionMeta,
  ...billingSectionMeta,
  ...codeSectionMeta,
  ...cloudPlatformSectionMeta,
  ...teamsSectionMeta,
  ...appearanceSectionMeta,
  ...featuresSectionMeta,
  ...keyboardShortcutsSectionMeta,
  ...warpifySectionMeta,
  ...referralsSectionMeta
};

export function getSettingsSectionMeta(sectionId: string): SettingsSectionMeta {
  return (
    settingsSectionMetaById[sectionId] ?? {
      title: 'Settings',
      description: 'Choose a section from the sidebar.',
      contentKind: 'placeholder'
    }
  );
}
