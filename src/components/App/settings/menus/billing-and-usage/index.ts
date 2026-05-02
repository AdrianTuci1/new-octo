import type { SettingsSectionMeta, SettingsSidebarLeafItem } from '../../settingsTypes';

export const billingSidebarItem: SettingsSidebarLeafItem = {
  kind: 'leaf',
  id: 'billing',
  label: 'Billing and usage'
};

export const billingSectionMeta: Record<'billing', SettingsSectionMeta> = {
  billing: {
    title: 'Billing and usage',
    description: 'Track consumption, invoices, and workspace spend.',
    contentKind: 'placeholder'
  }
};
