import type { SettingsSectionMeta, SettingsSidebarGroupItem } from '../../settingsTypes';

export const cloudPlatformSidebarItem: SettingsSidebarGroupItem = {
  kind: 'group',
  id: 'cloud-platform',
  label: 'Cloud platform',
  defaultExpanded: true,
  children: [
    { kind: 'leaf', id: 'cloud-platform/environments', label: 'Environments' },
    { kind: 'leaf', id: 'cloud-platform/oz-cloud-api-keys', label: 'Oz Cloud API Keys' }
  ]
};

export const cloudPlatformSectionMeta: Record<
  'cloud-platform/environments' | 'cloud-platform/oz-cloud-api-keys',
  SettingsSectionMeta
> = {
  'cloud-platform/environments': {
    title: 'Environments',
    description: 'Prepare deployment environments and runtime mappings.',
    contentKind: 'placeholder'
  },
  'cloud-platform/oz-cloud-api-keys': {
    title: 'Oz Cloud API Keys',
    description: 'Store cloud credentials and key rotation settings.',
    contentKind: 'placeholder'
  }
};

