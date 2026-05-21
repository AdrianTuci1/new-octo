import { isMacPlatform } from './platform';
import type { ComposerMode, ShellModeSource } from '../types/ui';

export type ShellPrediction = {
  completionText: string;
  fullCommand: string;
  hint: string;
};

export type RecommendedComposerAction = {
  id: string;
  label: string;
  value: string;
  description: string;
  mode: ComposerMode;
};

export type ComposerModeResolution = {
  mode: ComposerMode;
  shellSource: ShellModeSource | null;
};

export function consumeShellModeActivator(value: string): { consumed: boolean; value: string } {
  const match = value.match(/^\s*!\s?(.*)$/s);
  if (!match) {
    return { consumed: false, value };
  }

  return {
    consumed: true,
    value: match[1] ?? ''
  };
}

export function applyShellActivatorToPrediction(query: string, fullCommand: string) {
  const match = query.match(/^(\s*[!$]\s?)(.*)$/s);
  if (!match) {
    return fullCommand;
  }

  const activator = match[1] ?? '';
  return fullCommand.startsWith(activator) ? fullCommand : `${activator}${fullCommand}`;
}

export function getShellToggleShortcutTokens() {
  if (isMacPlatform()) {
    return ['⌘', 'I'];
  }

  return ['Ctrl', 'I'];
}
