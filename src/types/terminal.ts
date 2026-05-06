import type { FileDiff } from './diff';

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

export type FileChangeApproval = {
  kind: 'file-change';
  summary?: string;
  fileDiffs: FileDiff[];
  refineLabel?: string;
  editLabel?: string;
  acceptLabel?: string;
};

export type CommandApproval = {
  kind?: 'command';
  command: string;
  toolCallId?: string;
  reason?: string;
} | {
  kind: 'topic-change';
  reason?: string;
  startNewConversationLabel?: string;
  continueConversationLabel?: string;
} | FileChangeApproval;
