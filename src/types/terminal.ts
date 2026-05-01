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
  startedAt: string;
  finishedAt?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
};

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

export type TerminalCommandBlock = TerminalBlock & {
  output: string;
  status: 'running' | 'finished';
};

export type CommandApproval = {
  id: string;
  command: string;
  reason?: string;
};
