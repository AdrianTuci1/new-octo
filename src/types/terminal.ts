export type TerminalStatus = 'starting' | 'running' | 'exited' | 'error';

export type TerminalSessionInfo = {
  id: string;
  shell: string;
  cwd?: string | null;
};

export type TerminalDataEvent = {
  sessionId: string;
  data: number[];
};

export type TerminalExitEvent = {
  sessionId: string;
  exitCode?: number | null;
};

export type TerminalBlock = {
  id: string;
  command: string;
  output?: string;
  startedAt: string;
  finishedAt?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
};

export type TerminalCommandPresentation = 'command' | 'conversation-link';
export type TerminalCommandSource = 'user' | 'assistant';

export type TerminalBlockEvent = {
  sessionId: string;
  kind: 'started' | 'finished';
  block: TerminalBlock;
};

export type TerminalBlockOutputEvent = {
  sessionId: string;
  blockId: string;
  data: string;
};

export type TerminalRunCommandResponse = {
  block: TerminalBlock;
  output: string;
};

export type TerminalRuntimeContext = {
  nodeVersion?: string | null;
};

export type TerminalBlockSharedMeta = {
  presentation?: TerminalCommandPresentation;
  source?: TerminalCommandSource;
  conversationId?: string;
  conversationTitle?: string;
};

export type TerminalCommandBlock = TerminalBlock & {
  output: string;
  status: 'running' | 'finished';
  presentation?: TerminalCommandPresentation;
  source?: TerminalCommandSource;
  conversationId?: string;
  conversationTitle?: string;
};

export type CommandApproval = {
  command: string;
  toolCallId?: string;
  reason?: string;
};

export type FilesystemEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export type FilesystemDirectoryListing = {
  currentPath: string;
  parentPath: string | null;
  entries: FilesystemEntry[];
};

export type FilesystemPathContext = {
  homeDir: string;
  currentDir: string;
};
