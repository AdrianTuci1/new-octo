import type { LucideIcon } from 'lucide-react';

export type HelpItem = {
  keys: string[];
  label: string;
};

export type CommandItem = {
  label: string;
  detail: string;
  icon: LucideIcon;
};

export type TrayContentMode = 'help' | 'commands';
