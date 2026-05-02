export type SettingsSidebarLeafItem = {
  kind: 'leaf';
  id: string;
  label: string;
};

export type SettingsSidebarGroupItem = {
  kind: 'group';
  id: string;
  label: string;
  defaultExpanded?: boolean;
  children: SettingsSidebarLeafItem[];
};

export type SettingsSidebarHeadingItem = {
  kind: 'heading';
  label: string;
};

export type SettingsSidebarItem =
  | SettingsSidebarLeafItem
  | SettingsSidebarGroupItem
  | SettingsSidebarHeadingItem;

export type SettingsSectionContentKind = 'account' | 'placeholder';

export type SettingsSectionMeta = {
  title: string;
  description: string;
  contentKind: SettingsSectionContentKind;
};

