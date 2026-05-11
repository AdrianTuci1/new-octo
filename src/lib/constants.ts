import { Bot, FileText, MessagesSquare, Sparkles, Code2, Settings, Cloud, Clipboard, FolderOpen, GitBranch, User } from 'lucide-react';
import type { HelpItem, CommandItem } from '../types/ui';

export const HELP_ITEMS: HelpItem[] = [
  { keys: ['!'], label: 'input shell command' },
  { keys: ['⌘', 'I'], label: 'toggle shell mode' },
  { keys: ['/'], label: 'for slash commands' },
  { keys: ['@'], label: 'for file paths and attaching other context' },
  { keys: ['⇧', '⌘', '+'], label: 'open code review' },
  { keys: ['⇧', '⌘', 'A'], label: 'toggle conversation list' },
  { keys: ['⌘', 'Y'], label: 'search and continue conversations' },
  { keys: ['⌘', '↩'], label: 'start a new conversation' },
  { keys: ['⇧', '⌘', 'I'], label: 'toggle auto-accept' },
  { keys: ['^', 'C'], label: 'pause agent' },
  { keys: ['esc'], label: 'go back to terminal' }
];

export const COMMAND_ITEMS: CommandItem[] = [
  { label: '/agent', detail: 'Start an assisted coding conversation', icon: Bot },
  { label: '/compact', detail: 'Summarize the current thread compactly', icon: Sparkles },
  { label: '/fork', detail: 'Branch the work into a new path', icon: GitBranch },
  { label: '/fork-from', detail: 'Branch work from a specific point', icon: GitBranch },
  { label: '/fork-and-compact', detail: 'Fork the work and leave a compact handoff', icon: GitBranch },
  { label: '/export-to-file', detail: 'Prepare or write the current output to a file', icon: FileText },
  { label: '/export-to-clipboard', detail: 'Format output for quick copy', icon: Clipboard },
  { label: '/create-new-project', detail: 'Create a new project with guided setup', icon: Code2 },
  { label: '/add-prompt', detail: 'Create a reusable prompt entry', icon: Sparkles },
  { label: '/create-environment', detail: 'Create a new environment via guided setup', icon: Code2 },
  { label: '/open-file', detail: 'Open a file in the code editor', icon: FileText },
  { label: '/open-repo', detail: 'Open or orient to a repository', icon: FolderOpen },
  { label: '/cloud-agent', detail: 'Start a new cloud-based coding session', icon: Cloud },
  { label: '/conversations', detail: 'Open conversation history', icon: MessagesSquare },
  { label: '/prompts', detail: 'Search saved prompts', icon: Sparkles },
  { label: '/open-skill', detail: 'Open or inspect a skill', icon: Settings },
  { label: '/open-settings-file', detail: 'Open a local Octomus settings file', icon: Settings },
  { label: '/profile', detail: 'Inspect or update an agent profile', icon: User },
  { label: '/plan', detail: 'Prompt the agent to research and create a plan', icon: Code2 },
  { label: '/create-mcp', detail: 'Placeholder for MCP creation flow', icon: Code2 },
  { label: '/new', detail: 'Reset the current conversation shell', icon: Sparkles }
];

export function filterCommandItems(items: CommandItem[], query: string) {
  const trimmed = query.trim();
  if (!trimmed.startsWith('/')) {
    return items;
  }

  const searchToken = trimmed.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
  if (searchToken.length <= 1) {
    return items;
  }

  return items.filter((item) => {
    const label = item.label.toLowerCase();
    const detail = item.detail.toLowerCase();
    return label.includes(searchToken) || detail.includes(searchToken.slice(1));
  });
}
