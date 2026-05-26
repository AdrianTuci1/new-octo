import { isMacPlatform } from './platform';
import type { ComposerMode, ShellModeSource } from '../types/ui';

export type ShellPrediction = {
  completionText: string;
  fullCommand: string;
  hint: string;
  suggestions?: string[];
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

const KNOWN_SHELL_COMMAND_PREFIXES = new Set([
  'git',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'cargo',
  'docker',
  'docker-compose',
  'kubectl',
  'npx',
  'uv',
  'python',
  'python3',
  'node',
  'make',
  'cmake',
  'ls',
  'cd',
  'pwd',
  'cat',
  'rg',
  'grep',
  'mkdir',
  'rm',
  'mv',
  'cp',
  'touch',
  'chmod',
  'chown',
  'echo',
  'sed',
  'awk',
  'tail',
  'head',
  'clear'
]);

const NATURAL_LANGUAGE_FIRST_TOKENS = new Set([
  'what',
  'why',
  'how',
  'can',
  'could',
  'would',
  'should',
  'please',
  'help',
  'explain',
  'tell',
  'describe'
]);

export function consumeShellModeActivator(value: string): { consumed: boolean; value: string } {
  const match = value.match(/^\s*[!$]\s?(.*)$/s);
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

export function isImmediateShellCommandCandidate(query: string, availableCommands: string[]) {
  const trimmed = query.trim();
  if (!trimmed || trimmed.startsWith('/')) {
    return false;
  }

  if (/[?!]\s*$/.test(trimmed) || /\b(please|thanks)\b/i.test(trimmed)) {
    return false;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }

  const normalizedCommands = new Set(availableCommands.map((command) => command.toLowerCase()));
  const firstToken = resolveExecutableToken(tokens);
  if (!firstToken) {
    return false;
  }

  if (NATURAL_LANGUAGE_FIRST_TOKENS.has(firstToken)) {
    return false;
  }

  if (looksLikeShellPath(firstToken)) {
    return true;
  }

  if (trimmed.includes('&&') || trimmed.includes('||') || trimmed.includes('|') || /(^|\s)[<>]/.test(trimmed)) {
    return true;
  }

  if (KNOWN_SHELL_COMMAND_PREFIXES.has(firstToken)) {
    return true;
  }

  if (tokens.length === 1) {
    return normalizedCommands.has(firstToken);
  }

  return false;
}

function resolveExecutableToken(tokens: string[]) {
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    index += 1;
  }

  if (tokens[index]?.toLowerCase() === 'sudo') {
    index += 1;
  }

  return tokens[index]?.toLowerCase() ?? null;
}

function looksLikeShellPath(token: string) {
  return token.startsWith('./')
    || token.startsWith('../')
    || token.startsWith('/')
    || token.startsWith('~/');
}
