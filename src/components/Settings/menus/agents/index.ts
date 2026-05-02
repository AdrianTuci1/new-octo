import type { SettingsSectionMeta, SettingsSidebarGroupItem } from '../../settingsTypes';

export const agentsSidebarItem: SettingsSidebarGroupItem = {
  kind: 'group',
  id: 'agents',
  label: 'Agents',
  defaultExpanded: true,
  children: [
    { kind: 'leaf', id: 'agents/warp-agent', label: 'Warp Agent' },
    { kind: 'leaf', id: 'agents/profiles', label: 'Profiles' },
    { kind: 'leaf', id: 'agents/mcp-servers', label: 'MCP servers' },
    { kind: 'leaf', id: 'agents/knowledge', label: 'Knowledge' },
    { kind: 'leaf', id: 'agents/third-party-cli-agents', label: 'Third party CLI agents' }
  ]
};

export const agentsSectionMeta: Record<
  | 'agents/warp-agent'
  | 'agents/profiles'
  | 'agents/mcp-servers'
  | 'agents/knowledge'
  | 'agents/third-party-cli-agents',
  SettingsSectionMeta
> = {
  'agents/warp-agent': {
    title: 'Warp Agent',
    description: 'Configure default agent behavior and task routing.',
    contentKind: 'placeholder'
  },
  'agents/profiles': {
    title: 'Profiles',
    description: 'Prepare saved personas and prompt presets for the agent runtime.',
    contentKind: 'placeholder'
  },
  'agents/mcp-servers': {
    title: 'MCP servers',
    description: 'Connect and organize model context protocol servers.',
    contentKind: 'placeholder'
  },
  'agents/knowledge': {
    title: 'Knowledge',
    description: 'Manage the shared knowledge base that agents can reference.',
    contentKind: 'placeholder'
  },
  'agents/third-party-cli-agents': {
    title: 'Third party CLI agents',
    description: 'Wire external CLI-based agents into the workspace.',
    contentKind: 'placeholder'
  }
};

