import type { ChatMessage } from '../types/chat';
import type { TerminalCommandBlock } from '../types/terminal';
import type { ComposerMode } from '../types/ui';

const SHELL_COMMAND_PREFIXES = new Set([
  'git',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'cargo',
  'docker',
  'kubectl',
  'rg',
  'ls',
  'cat',
  'cd',
  'mkdir',
  'touch',
  'cp',
  'mv',
  'rm',
  'find',
  'grep',
  'node',
  'python',
  'python3',
  'uv',
  'make',
  'just',
  'ssh',
  'scp',
  'curl',
  'wget'
]);

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

export function resolveComposerMode(query: string, lockedMode: ComposerMode | null): ComposerMode {
  if (lockedMode) {
    return lockedMode;
  }

  return isLikelyShellCommand(query.trim()) ? 'shell' : 'chat';
}

export function getShellPrediction(query: string, blocks: TerminalCommandBlock[]): ShellPrediction | null {
  const input = query.trim();
  if (!input || input.includes('\n')) {
    return null;
  }

  const lastFinishedBlock = [...blocks].reverse().find((block) => block.status === 'finished');
  const candidates = getPredictionCandidates(input, lastFinishedBlock?.command);
  const normalizedInput = input.toLowerCase();
  const fullCommand = candidates.find((candidate) => {
    const normalizedCandidate = candidate.toLowerCase();
    return normalizedCandidate.startsWith(normalizedInput) && normalizedCandidate !== normalizedInput;
  });

  if (!fullCommand) {
    return null;
  }

  return {
    fullCommand,
    completionText: fullCommand.slice(input.length),
    hint: 'Press Tab to complete'
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
  if (mode !== 'chat' || query.trim().length > 0) {
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
      value: '/create mcp ',
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

function isLikelyShellCommand(query: string) {
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

  if (!/^[A-Za-z0-9_./:@~"'=+\- ]+$/.test(query)) {
    return false;
  }

  return SHELL_COMMAND_PREFIXES.has(tokens[0].toLowerCase());
}

function getPredictionCandidates(input: string, lastCommand?: string | null) {
  const firstToken = input.split(/\s+/)[0]?.toLowerCase();

  if (firstToken === 'git') {
    const contextualFirst = lastCommand?.startsWith('git add')
      ? 'git commit -m "describe changes"'
      : lastCommand?.startsWith('git commit')
        ? 'git push -u origin HEAD'
        : 'git status';
    return dedupe([
      contextualFirst,
      'git status',
      'git add .',
      'git commit -m "describe changes"',
      'git push -u origin HEAD',
      'git checkout -b feature/name'
    ]);
  }

  if (firstToken === 'npm') {
    return ['npm run dev', 'npm test', 'npm install'];
  }

  if (firstToken === 'pnpm') {
    return ['pnpm dev', 'pnpm test', 'pnpm install'];
  }

  if (firstToken === 'cargo') {
    return ['cargo test', 'cargo run', 'cargo fmt', 'cargo clippy'];
  }

  if (firstToken === 'rg') {
    return ['rg --files', 'rg TODO src', 'rg "useEffect" src'];
  }

  if (firstToken === 'ls') {
    return ['ls -la', 'ls src', 'ls src-tauri'];
  }

  if (firstToken === 'docker') {
    return ['docker ps', 'docker compose up', 'docker compose logs'];
  }

  return [];
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}
