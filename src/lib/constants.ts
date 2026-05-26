import { Bot, FileText, MessagesSquare, Sparkles, Code2, Settings, Cloud, Clipboard, FolderOpen, GitBranch, User, Server } from 'lucide-react';
import { getPrimaryModifierLabel } from './platform';
import type { HelpItem, CommandItem } from '../types/ui';

const primaryModifier = getPrimaryModifierLabel();

export const HELP_ITEMS: HelpItem[] = [
  { keys: ['!'], label: 'input shell command' },
  { keys: [primaryModifier, 'I'], label: 'toggle shell mode' },
  { keys: ['/'], label: 'for slash commands' },
  { keys: ['@'], label: 'for file paths and attaching other context' },
  { keys: ['⇧', primaryModifier, '+'], label: 'open code review' },
  { keys: ['⇧', primaryModifier, 'A'], label: 'toggle conversation list' },
  { keys: [primaryModifier, 'Y'], label: 'search and continue conversations' },
  { keys: [primaryModifier, '↩'], label: 'start a new conversation' },
  { keys: ['⇧', primaryModifier, 'I'], label: 'toggle auto-accept' },
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
  { label: '/tab-configs', detail: 'Browse installed tab config layouts', icon: Server },
  { label: '/create-tab-config', detail: 'Create a new tab config layout', icon: Code2 },
  { label: '/update-tab-config', detail: 'Edit an existing tab config layout', icon: Code2 },
  { label: '/profile', detail: 'Inspect or update an agent profile', icon: User },
  { label: '/plan', detail: 'Prompt the agent to research and create a plan', icon: Code2 },
  { label: '/create-mcp', detail: 'Create or configure an MCP server', icon: Code2 },
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

export const COMPOSER_PLACEHOLDERS = [
  "Octomus anything e.g. Find and fix race conditions in my Python application",
  "Octomus anything e.g. Migrate MySQL database to Postgres",
  "Octomus anything e.g. Optimize the performance of my database queries",
  "Octomus anything e.g. Refactor this legacy class component to functional",
  "Octomus anything e.g. Rewrite this component using React Hooks",
  "Octomus anything e.g. Set up a Dockerfile for my Node.js application",
  "Octomus anything e.g. Help me write a custom hook for API polling",
  "Octomus anything e.g. Add TypeScript types to this JavaScript object",
  "Octomus anything e.g. Setup a GitHub Actions CI/CD pipeline",
  "Octomus anything e.g. Debug the memory leak in my Go worker",
  "Octomus anything e.g. Create a bash script to backup logs to AWS S3"
];
