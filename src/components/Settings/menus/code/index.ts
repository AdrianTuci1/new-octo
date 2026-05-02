import type { SettingsSectionMeta, SettingsSidebarGroupItem } from '../../settingsTypes';

export const codeSidebarItem: SettingsSidebarGroupItem = {
  kind: 'group',
  id: 'code',
  label: 'Code',
  defaultExpanded: true,
  children: [
    { kind: 'leaf', id: 'code/indexing-and-projects', label: 'Indexing and projects' },
    { kind: 'leaf', id: 'code/editor-and-code-review', label: 'Editor and Code Review' }
  ]
};

export const codeSectionMeta: Record<
  'code/indexing-and-projects' | 'code/editor-and-code-review',
  SettingsSectionMeta
> = {
  'code/indexing-and-projects': {
    title: 'Indexing and projects',
    description: 'Tune project indexing and repository discovery behavior.',
    contentKind: 'placeholder'
  },
  'code/editor-and-code-review': {
    title: 'Editor and Code Review',
    description: 'Configure code editing, review flows, and inline suggestions.',
    contentKind: 'placeholder'
  }
};

