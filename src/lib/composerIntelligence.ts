import type { ChatMessage } from '../types/chat';
import type { TerminalCommandBlock } from '../types/terminal';
import type { ComposerMode, ShellModeSource } from '../types/ui';

const NATURAL_LANGUAGE_TOKENS = new Set([
  'cum',
  'ce',
  'de',
  'nu',
  'sa',
  'sunt',
  'este',
  'vreau',
  'putem',
  'please',
  'how',
  'what',
  'why',
  'can',
  'could'
]);

const SHELL_PATTERN_PREFIXES = [
  /^~(?:\/|$)/,
  /^\.\.?(?:\/|$)/,
  /^[#$]/,
  /^\*[\w./-]/
];

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

export function resolveComposerState(
  query: string,
  lockedMode: ComposerMode | null,
  availableCommands: string[] = [],
  autodetectEnabled = true
): ComposerModeResolution {
  if (lockedMode === 'shell') {
    return {
      mode: 'shell',
      shellSource: 'manual'
    };
  }

  if (lockedMode === 'chat') {
    return {
      mode: 'chat',
      shellSource: null
    };
  }

  if (!autodetectEnabled) {
    return {
      mode: 'chat',
      shellSource: null
    };
  }

  return isLikelyShellCommand(query.trim(), availableCommands)
    ? {
      mode: 'shell',
      shellSource: 'autodetected'
    }
    : {
      mode: 'chat',
      shellSource: null
    };
}

export function getShellPrediction(
  query: string,
  blocks: TerminalCommandBlock[],
  availableCommands: string[] = [],
  historyStrings: string[] = [],
  options: { allowSingleCharacterCommand?: boolean } = {}
): ShellPrediction | null {
  const input = query.trim();
  if (!input || input.includes('\n')) {
    return null;
  }

  const recentCommands = getRecentCommands(blocks, historyStrings);
  const candidates = getPredictionCandidates(
    input,
    recentCommands,
    availableCommands,
    options.allowSingleCharacterCommand ?? false
  );
  
  const normalizedInput = input.toLowerCase();
  
  // Strategy:
  // 1. Find all history matches that start with the input
  // 2. Filter for those that have spaces (multi-word) and pick the longest/most relevant one
  // 3. Fall back to the most recent history match
  // 4. Fall back to system executables
  
  const matches = candidates.filter(c => c.toLowerCase().startsWith(normalizedInput) && c.toLowerCase() !== normalizedInput);
  
  let fullCommand = matches.find(c => c.includes(' '));
  
  if (!fullCommand && matches.length > 0) {
    fullCommand = matches[0];
  }

  if (!fullCommand) {
    return null;
  }

  // Use query.length instead of input.length to avoid double spaces when the user has already typed a trailing space
  return {
    fullCommand,
    completionText: fullCommand.slice(query.length),
    hint: 'Press Right Arrow to complete'
  };
}

export function getRecommendedComposerAction(options: {
  mode: ComposerMode;
  query: string;
  messages: ChatMessage[];
  terminalBlocks: TerminalCommandBlock[];
  terminalError: string | null;
}): RecommendedComposerAction | null {
  const { mode, query, messages, terminalBlocks, terminalError } = options;
  if (mode !== 'chat' || query.trim().length > 0 || messages.length === 0) {
    return null;
  }

  const lastFinishedBlock = [...terminalBlocks].reverse().find((block) => block.status === 'finished');
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');

  if (terminalError) {
    return {
      id: 'inspect-terminal-session-error',
      label: 'Explain terminal session issue',
      value: 'Explain the latest terminal session error and suggest the safest fix.',
      description: terminalError,
      mode: 'chat'
    };
  }

  if (lastFinishedBlock && typeof lastFinishedBlock.exitCode === 'number' && lastFinishedBlock.exitCode !== 0) {
    return {
      id: 'explain-last-command-failure',
      label: 'Explain last failure',
      value: `Explain why \`${lastFinishedBlock.command}\` failed and suggest the safest next step.`,
      description: 'Turn the latest failed command into an actionable explanation.',
      mode: 'chat'
    };
  }

  if (lastFinishedBlock?.command.startsWith('git status')) {
    return {
      id: 'summarize-git-status',
      label: 'Summarize repo status',
      value: 'Summarize the current git status and recommend the next safe command.',
      description: 'Use the latest git status block as context.',
      mode: 'chat'
    };
  }

  if (lastFinishedBlock?.command.startsWith('cargo test') || lastFinishedBlock?.command.startsWith('npm test')) {
    return {
      id: 'review-latest-tests',
      label: 'Review test results',
      value: 'Review the latest test output and point out the most important failures first.',
      description: 'Useful after a recent test run.',
      mode: 'chat'
    };
  }

  if (lastUserMessage && /\bmcp\b/i.test(lastUserMessage.body)) {
    return {
      id: 'continue-mcp-setup',
      label: 'Continue MCP setup',
      value: '/create-mcp ',
      description: 'Resume the MCP setup flow from the chat composer.',
      mode: 'chat'
    };
  }

  return {
    id: 'plan-next-step',
    label: 'Recommend the next step',
    value: 'Review this repository and recommend the next high-impact improvement.',
    description: 'A lightweight prompt when the composer is idle.',
    mode: 'chat'
  };
}

export function getShellToggleShortcutTokens() {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform.toLowerCase();
  if (platform.includes('mac')) {
    return ['⌘', 'I'];
  }

  return ['Ctrl', 'I'];
}

function isLikelyShellCommand(query: string, availableCommands: string[]) {
  if (!query || query.includes('\n')) {
    return false;
  }

  if (query.includes('?') || /[ăâîșşțţ]/i.test(query)) {
    return false;
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return false;
  }

  if (tokens.some((token) => NATURAL_LANGUAGE_TOKENS.has(token.toLowerCase()))) {
    return false;
  }

  if (!/^[A-Za-z0-9_./:@~"'=+\- *#$&|<>]+$/.test(query)) {
    return false;
  }

  if (
    SHELL_PATTERN_PREFIXES.some((pattern) => pattern.test(query)) ||
    query.includes(' && ') ||
    query.includes(' | ') ||
    query.includes(' > ') ||
    query.includes(' < ')
  ) {
    return true;
  }

  const firstToken = tokens[0].toLowerCase();
  const normalizedCommands = new Set(availableCommands.map((command) => command.toLowerCase()));
  if (normalizedCommands.has(firstToken)) {
    return true;
  }

  // If it's a multi-word command and doesn't contain common natural language words,
  // it's very likely a shell command even if the executable is not in our known list.
  if (tokens.length > 1) {
    // If the first token looks like an executable or path
    if (/^[A-Za-z0-9._\-\/]+$/.test(firstToken)) {
      return true;
    }
  }

  if (tokens.length === 1 && firstToken.length >= 2) {
    return availableCommands.some((command) => command.toLowerCase().startsWith(firstToken));
  }

  return false;
}

function getPredictionCandidates(
  input: string,
  recentCommands: string[],
  availableCommands: string[],
  allowSingleCharacterCommand: boolean
) {
  const trimmed = input.trim();
  const lowerInput = trimmed.toLowerCase();
  const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  const hasWhitespace = /\s/.test(input);

  const historyMatches = recentCommands.filter((command) => command.toLowerCase().startsWith(lowerInput));

  if (hasWhitespace) {
    return dedupe(historyMatches);
  }

  if (firstToken.length < 2 && !allowSingleCharacterCommand) {
    return [];
  }

  const executableMatches = availableCommands
    .filter((command) => command.toLowerCase().startsWith(lowerInput))
    .sort(compareCommandCandidates);
  const exactExecutable = executableMatches.find((command) => command.toLowerCase() === lowerInput);
  const historyForExecutable = exactExecutable
    ? recentCommands.filter((command) => command.toLowerCase().startsWith(`${firstToken} `))
    : [];
  const systemMatches = exactExecutable ? [] : executableMatches;

  return dedupe([
    ...historyMatches,
    ...historyForExecutable,
    ...systemMatches
  ]);
}

function getRecentCommands(blocks: TerminalCommandBlock[], globalHistory: string[] = []) {
  const sessionCommands = [...blocks]
    .reverse()
    .filter((block) => block.status === 'finished')
    .map((block) => block.command.trim())
    .filter(Boolean);

  return dedupe([...sessionCommands, ...globalHistory]);
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function compareCommandCandidates(left: string, right: string) {
  return scoreCommandCandidate(left) - scoreCommandCandidate(right)
    || left.length - right.length
    || left.localeCompare(right);
}

function scoreCommandCandidate(command: string) {
  return /^[a-z][a-z0-9-]*$/i.test(command) ? 0 : 1;
}
