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

export function getShellToggleShortcutTokens() {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform.toLowerCase();
  if (platform.includes('mac')) {
    return ['⌘', 'I'];
  }

  return ['Ctrl', 'I'];
}
