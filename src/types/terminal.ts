import type { FileDiff } from './diff';

export type TerminalStatus =
  | 'starting'
  | 'connecting'
  | 'running'
  | 'connected'
  | 'exited'
  | 'error'
  | 'disconnected';

export type TerminalSessionKind = 'local' | 'cloud';
export type TerminalSessionProvider = 'local' | 'custom-vm' | 'modal';

export type TerminalSessionInfo = {
  id: string;
  shell: string;
  kind: TerminalSessionKind;
  provider: TerminalSessionProvider;
  status: TerminalStatus;
  cwd?: string | null;
  profileId?: string | null;
};

export type TerminalSessionTarget = {
  kind?: TerminalSessionKind;
  provider?: TerminalSessionProvider;
  profileId?: string | null;
  environment?: string | null;
  host?: string | null;
  username?: string | null;
  connectionMethod?: string | null;
};

export type TerminalDataEvent = {
  sessionId: string;
  data: number[];
};

export type TerminalExitEvent = {
  sessionId: string;
  exitCode?: number | null;
};

export type TerminalSessionCwdEvent = {
  sessionId: string;
  cwd?: string | null;
};

export type TerminalSessionStateEvent = {
  sessionId: string;
  kind: TerminalSessionKind;
  provider: TerminalSessionProvider;
  status: TerminalStatus;
  cwd?: string | null;
  profileId?: string | null;
};

export type TerminalCompletionsFormat = 'raw' | 'incrementally_typed';

export type TerminalShellCompletion = {
  name: string;
  description?: string | null;
};

export type TerminalCompletionsStartedEvent = {
  sessionId: string;
  format: TerminalCompletionsFormat;
};

export type TerminalCompletionsFinishedEvent = {
  sessionId: string;
  data: TerminalShellCompletion[];
};

export type TerminalCompletionResultEvent = {
  sessionId: string;
  completion: TerminalShellCompletion;
};

export type TerminalCompletionUpdateEvent = {
  sessionId: string;
  value: string;
};

export type TerminalCompletionsPromptEvent = {
  sessionId: string;
};

export type TerminalCompletionStatus = 'idle' | 'running' | 'finished';

export type TerminalCompletionState = {
  status: TerminalCompletionStatus;
  format: TerminalCompletionsFormat | null;
  promptVisible: boolean;
  completions: TerminalShellCompletion[];
  lastValue: string | null;
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
  pending?: boolean;
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
  toolCallId?: string;
  refineLabel?: string;
  editLabel?: string;
  acceptLabel?: string;
};

export type RemoteCliInstallApproval = {
  kind: 'remote-cli-install';
  command: string;
  toolCallId?: string;
  reason?: string;
  username?: string | null;
  host?: string | null;
  provider?: TerminalSessionProvider | string | null;
  dismissStorageKey?: string | null;
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
} | FileChangeApproval | RemoteCliInstallApproval;
