import { Bot, FileText, MessagesSquare, Sparkles, Code2 } from 'lucide-react';
import type { HelpItem, CommandItem } from '../types/ui';

export const HELP_ITEMS: HelpItem[] = [
  { keys: ['!'], label: 'input shell command' },
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
  { label: '/create-environment', detail: 'Create an Oz environment via guided setup', icon: Code2 },
  { label: '/open-file', detail: 'Open a file in the code editor', icon: FileText },
  { label: '/conversations', detail: 'Open conversation history', icon: MessagesSquare },
  { label: '/prompts', detail: 'Search saved prompts', icon: Sparkles },
  { label: '/plan', detail: 'Prompt the agent to research and create a plan', icon: Code2 },
  { label: '/create mcp', detail: 'Placeholder for MCP creation flow', icon: Code2 },
  { label: '/new', detail: 'Reset the current conversation shell', icon: Sparkles }
];
