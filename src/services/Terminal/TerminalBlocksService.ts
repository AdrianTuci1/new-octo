import { invoke } from '@tauri-apps/api/core';
import type {
  TerminalBlock,
  TerminalBlockSharedMeta,
  TerminalCommandBlock,
  TerminalSessionInfo,
  TerminalSessionTarget,
} from '../../types/terminal';

export function mergeBlock(block: TerminalBlock, output = '', meta?: TerminalBlockSharedMeta): TerminalCommandBlock {
  return {
    ...block,
    output: output || block.output || '',
    status: block.finishedAt ? 'finished' : 'running',
    presentation: meta?.presentation ?? 'command',
    source: meta?.source,
    conversationId: meta?.conversationId,
    conversationTitle: meta?.conversationTitle,
  };
}

export function sortTimelineBlocks(blocks: TerminalCommandBlock[]): TerminalCommandBlock[] {
  return [...blocks].sort((left, right) => {
    const leftTime = Date.parse(left.startedAt || '') || 0;
    const rightTime = Date.parse(right.startedAt || '') || 0;
    return leftTime !== rightTime ? leftTime - rightTime : left.id.localeCompare(right.id);
  });
}

/**
 * TerminalBlocksService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Command** (encapsulates terminal operations as service methods)
 * Manages terminal session lifecycle: create, run commands, fetch blocks, terminate.
 * Pure function helpers `mergeBlock` and `sortTimelineBlocks` operate on plain data.
 */
export class TerminalBlocksService {
  private sessionRef: TerminalSessionInfo | null = null;
  private sessionPromiseRef: Promise<TerminalSessionInfo> | null = null;
  private persistedSessionIdRef: string | null = null;
  private sessionOriginCwdRef: string | null = null;

  get session(): TerminalSessionInfo | null { return this.sessionRef; }
  get persistedSessionId(): string | null { return this.persistedSessionIdRef; }

  async ensureSession(
    cwd: string | null,
    target: TerminalSessionTarget | null,
    onSessionChange?: (id: string | null) => void
  ): Promise<TerminalSessionInfo> {
    if (this.sessionRef) return this.sessionRef;
    if (this.sessionPromiseRef) return this.sessionPromiseRef;

    this.sessionPromiseRef = invoke<TerminalSessionInfo>('terminal_create_session', {
      request: { sessionId: this.persistedSessionIdRef, rows: 24, cols: 120, cwd: cwd ?? null, target: target ?? undefined },
    }).then((session) => {
      this.sessionRef = session;
      this.sessionOriginCwdRef = session.cwd ?? cwd;
      if (this.persistedSessionIdRef !== session.id) {
        this.persistedSessionIdRef = session.id;
        onSessionChange?.(session.id);
      }
      return session;
    }).finally(() => { this.sessionPromiseRef = null; });

    return this.sessionPromiseRef;
  }

  async runCommand(sessionId: string, command: string): Promise<{ block: TerminalBlock; pending: boolean }> {
    const response = await invoke<{ block: TerminalBlock; pending: boolean }>('terminal_run_command', {
      request: { sessionId, command: command.trim(), waitForCompletion: false },
    });
    return response;
  }

  async fetchBlocks(sessionId: string): Promise<TerminalBlock[]> {
    return invoke<TerminalBlock[]>('terminal_get_blocks', { request: { sessionId } });
  }

  async terminateSession(sessionId: string, persist: boolean): Promise<void> {
    await invoke(persist ? 'terminal_release_session' : 'terminal_kill_session', {
      request: { sessionId },
    }).catch(() => {});
    this.sessionRef = null;
    this.sessionPromiseRef = null;
    this.persistedSessionIdRef = null;
  }

  setPersistedSessionId(id: string | null): void {
    this.persistedSessionIdRef = id;
  }

  reset(): void {
    this.sessionRef = null;
    this.sessionPromiseRef = null;
    this.persistedSessionIdRef = null;
    this.sessionOriginCwdRef = null;
  }

  static getInstance(): TerminalBlocksService {
    if (!instance) instance = new TerminalBlocksService();
    return instance;
  }
}

let instance: TerminalBlocksService | null = null;
