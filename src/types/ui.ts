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

export type ComposerMode = 'chat' | 'shell';
export type ShellModeSource = 'manual' | 'autodetected';
export type TrayContentMode = 'help' | 'commands' | 'conversations';
export type TrayMode = 'closed' | TrayContentMode;

export type PanelMode = 'launcher' | 'settings' | 'onboarding';
