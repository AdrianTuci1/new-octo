import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { StoreApi } from 'zustand/vanilla';
import type { AgentState } from '../../stores/AgentStore';
import type {
  TerminalCommandBlock,
  TerminalSessionInfo,
  TerminalCompletionState,
  TerminalBlockSharedMeta,
  TerminalBlock,
  TerminalBlockEvent,
  TerminalBlockOutputEvent,
  TerminalExitEvent,
  TerminalSessionCwdEvent,
  TerminalSessionStateEvent,
  TerminalCompletionsStartedEvent,
  TerminalCompletionsFinishedEvent,
  TerminalCompletionResultEvent,
  TerminalCompletionUpdateEvent,
  TerminalCompletionsPromptEvent,
  TerminalRunCommandResponse,
  TerminalCommandSource,
  TerminalSessionTarget,
} from '../../types/terminal';

export type TerminalServiceRunOptions = {
  source?: TerminalCommandSource;
  waitForCompletion?: boolean;
};

/**
 * Manages terminal session lifecycle, block management, output buffering,
 * and Tauri event listeners.
 *
 * This is a thin wrapper that delegates to the existing useTerminalCommandBlocks
 * hook for now. The hook logic will be incrementally migrated to pure TS.
 */
export class AgentTerminalService {
  private unlisteners: Array<() => void> = [];
  private session: TerminalSessionInfo | null = null;
  private sessionPromise: Promise<TerminalSessionInfo> | null = null;
  private persistedSessionId: string | null = null;
  private sessionOriginCwd: string | null = null;
  private commandBlocks: TerminalCommandBlock[] = [];
  private syntheticBlocks: TerminalCommandBlock[] = [];
  private activeBlockId: string | null = null;
  private commandInFlight = false;
  private pendingCommandOutput = '';
  private pendingOutput: Record<string, string> = {};
  private outputBuffer: Record<string, string> = {};
  private outputFlushFrame: number | null = null;
  private blockOptions: Record<string, TerminalServiceRunOptions> = {};
  private pendingBlockReconcileTimeouts: Record<string, number> = {};
  private sharedBlockMeta: Record<string, TerminalBlockSharedMeta> = {};

  private onBlockMetaChange?: (metaById: Record<string, TerminalBlockSharedMeta>) => void;
  private onCommandBlocksChange?: (blocks: TerminalCommandBlock[]) => void;
  private onSyntheticBlocksChange?: (blocks: TerminalCommandBlock[]) => void;
  private onSessionChange?: (sessionId: string | null) => void;

  constructor(
    private readonly store: StoreApi<AgentState>,
    private readonly surface: 'terminal' | 'agent',
    private readonly options: {
      cwd?: string | null;
      initialSessionId?: string | null;
      target?: TerminalSessionTarget | null;
      persistSession?: boolean;
      onBlockMetaChange?: (metaById: Record<string, TerminalBlockSharedMeta>) => void;
      onCommandBlocksChange?: (blocks: TerminalCommandBlock[]) => void;
      onSyntheticBlocksChange?: (blocks: TerminalCommandBlock[]) => void;
      onSessionChange?: (sessionId: string | null) => void;
    } = {},
  ) {
    this.persistedSessionId = options.initialSessionId ?? null;
    this.onBlockMetaChange = options.onBlockMetaChange;
    this.onCommandBlocksChange = options.onCommandBlocksChange;
    this.onSyntheticBlocksChange = options.onSyntheticBlocksChange;
    this.onSessionChange = options.onSessionChange;
  }

  // ── Getters from store ─────────────────────────────────────────

  get blocks(): TerminalCommandBlock[] {
    return this.surface === 'terminal'
      ? this.store.getState().terminalBlocks
      : this.store.getState().agentTerminalBlocks;
  }

  get expandedBlockIds(): string[] {
    return this.surface === 'terminal'
      ? this.store.getState().terminalExpandedBlockIds
      : this.store.getState().agentTerminalExpandedBlockIds;
  }

  get selectedBlockId(): string | null {
    return this.surface === 'terminal'
      ? this.store.getState().terminalSelectedBlockId
      : this.store.getState().agentTerminalSelectedBlockId;
  }

  get error(): string | null {
    return this.surface === 'terminal'
      ? this.store.getState().terminalError
      : this.store.getState().agentTerminalError;
  }

  get sessionCwd(): string | null {
    return this.surface === 'terminal'
      ? this.store.getState().terminalSessionCwd
      : this.store.getState().agentTerminalSessionCwd;
  }

  get sessionId(): string | null {
    return this.persistedSessionId;
  }

  get sessionInfo(): TerminalSessionInfo | null {
    return this.session;
  }

  get completionState(): TerminalCompletionState | null {
    return this.surface === 'terminal'
      ? this.store.getState().terminalCompletionState
      : this.store.getState().agentTerminalCompletionState;
  }

  // ── Session management ────────────────────────────────────────

  async ensureSession(): Promise<TerminalSessionInfo> {
    if (this.session) return this.session;
    if (this.sessionPromise) return this.sessionPromise;

    this.sessionPromise = invoke<TerminalSessionInfo>('terminal_create_session', {
      request: {
        sessionId: this.persistedSessionId,
        rows: 24,
        cols: 120,
        cwd: this.options.cwd ?? null,
        target: this.options.target ?? undefined,
      },
    })
      .then((session) => {
        this.session = session;
        this.setSessionInfo(session);
        this.setSessionCwd(session.cwd ?? null);
        this.sessionOriginCwd = session.cwd ?? this.options.cwd ?? null;
        if (this.persistedSessionId !== session.id) {
          this.persistedSessionId = session.id;
          this.onSessionChange?.(session.id);
        }
        return session;
      })
      .finally(() => {
        this.sessionPromise = null;
      });

    return this.sessionPromise;
  }

  // ── Run command ───────────────────────────────────────────────

  async runCommand(
    command: string,
    options: TerminalServiceRunOptions = {},
  ): Promise<TerminalRunCommandResponse | null> {
    const normalized = command.trim();
    if (!normalized) return null;

    try {
      this.setError(null);
      this.commandInFlight = true;
      this.pendingCommandOutput = '';
      this.blockOptions['PENDING'] = options;
      const session = await this.ensureSession();
      const response = await invoke<TerminalRunCommandResponse>('terminal_run_command', {
        request: {
          sessionId: session.id,
          command: normalized,
          waitForCompletion: options.waitForCompletion ?? options.source !== 'user',
        },
      });
      this.blockOptions[response.block.id] = options;
      delete this.blockOptions['PENDING'];
      if (options.source) {
        this.upsertBlockMeta(response.block.id, {
          presentation: 'command',
          source: options.source,
        });
      }
      this.activeBlockId = response.block.finishedAt ? null : response.block.id;
      this.commandInFlight = false;
      this.upsertBlock(response.block);
      if (response.pending && !response.block.finishedAt) {
        this.schedulePendingBlockReconcile(session.id, response.block.id);
      }
      return response;
    } catch (reason) {
      this.commandInFlight = false;
      delete this.blockOptions['PENDING'];
      this.setError(String(reason));
      return null;
    }
  }

  // ── Block management ──────────────────────────────────────────

  clearBlocks(): void {
    this.activeBlockId = null;
    this.commandBlocks = [];
    this.syntheticBlocks = [];
    this.commandInFlight = false;
    this.pendingCommandOutput = '';
    this.pendingOutput = {};
    this.outputBuffer = {};
    if (this.outputFlushFrame !== null) {
      cancelAnimationFrame(this.outputFlushFrame);
      this.outputFlushFrame = null;
    }
    this.blockOptions = {};
    this.session = null;
    this.sessionPromise = null;
    this.persistedSessionId = null;
    this.sessionOriginCwd = this.options.cwd ?? null;
    this.setSessionInfo(null);
    this.setSessionCwd(null);
    this.setCompletionState(null);
    this.onBlockMetaChange?.({});
    this.onSyntheticBlocksChange?.([]);
    this.onSessionChange?.(null);
    this.commitTimeline([], []);
  }

  expandBlock(blockId: string): void {
    const setter = this.surface === 'terminal'
      ? this.store.getState().setTerminalExpandedBlockIds
      : this.store.getState().setAgentTerminalExpandedBlockIds;
    setter((ids) => ids.includes(blockId) ? ids : [...ids, blockId]);
  }

  collapseBlock(blockId: string): void {
    const expandSetter = this.surface === 'terminal'
      ? this.store.getState().setTerminalExpandedBlockIds
      : this.store.getState().setAgentTerminalExpandedBlockIds;
    const selectSetter = this.surface === 'terminal'
      ? this.store.getState().setTerminalSelectedBlockId
      : this.store.getState().setAgentTerminalSelectedBlockId;
    expandSetter((ids) => ids.filter((id) => id !== blockId));
    selectSetter((id) => id === blockId ? null : id);
  }

  setSelectedBlockId(id: string | null): void {
    const setter = this.surface === 'terminal'
      ? this.store.getState().setTerminalSelectedBlockId
      : this.store.getState().setAgentTerminalSelectedBlockId;
    setter(id);
  }

  upsertSyntheticBlock(block: TerminalCommandBlock): void {
    const syntheticBlock = this.applySharedMeta({
      ...block,
      presentation: block.presentation ?? 'conversation-link',
    });
    this.upsertBlockMeta(syntheticBlock.id, {
      presentation: syntheticBlock.presentation,
      source: syntheticBlock.source,
      conversationId: syntheticBlock.conversationId,
      conversationTitle: syntheticBlock.conversationTitle,
    });

    const existingIndex = this.syntheticBlocks.findIndex((b) => b.id === syntheticBlock.id);
    const nextSynthetic = existingIndex >= 0
      ? this.syntheticBlocks.map((b) => (b.id === syntheticBlock.id ? syntheticBlock : b))
      : [...this.syntheticBlocks, syntheticBlock].slice(-80);
    this.onSyntheticBlocksChange?.(nextSynthetic);
    this.commitTimeline(this.commandBlocks, nextSynthetic);
  }

  replaceBlocks(blocks: TerminalCommandBlock[]): void {
    const normalized = blocks.map((b) => this.applySharedMeta({
      ...b,
      presentation: b.presentation ?? 'command',
    }));
    const running = normalized.filter((b) => b.status === 'running');
    this.activeBlockId = running[running.length - 1]?.id ?? null;
    this.pendingCommandOutput = '';
    this.pendingOutput = {};
    this.outputBuffer = {};
    if (this.outputFlushFrame !== null) {
      cancelAnimationFrame(this.outputFlushFrame);
      this.outputFlushFrame = null;
    }
    this.blockOptions = Object.fromEntries(
      normalized.map((b) => [b.id, { source: b.source }]),
    );
    this.commitTimeline(normalized);
    const expandSetter = this.surface === 'terminal'
      ? this.store.getState().setTerminalExpandedBlockIds
      : this.store.getState().setAgentTerminalExpandedBlockIds;
    const selectSetter = this.surface === 'terminal'
      ? this.store.getState().setTerminalSelectedBlockId
      : this.store.getState().setAgentTerminalSelectedBlockId;
    expandSetter([]);
    selectSetter(null);
    this.setError(null);
    this.setCompletionState(null);
  }

  // ── Tauri event listeners ─────────────────────────────────────

  async start(): Promise<void> {
    const unlisteners = await Promise.all([
      listen<TerminalBlockEvent>('terminal:block', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.upsertBlock(event.payload.block);
      }),
      listen<TerminalBlockOutputEvent>('terminal:block-output', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.appendOutput(event.payload.blockId, event.payload.data);
      }),
      listen<TerminalExitEvent>('terminal:exit', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.session = null;
        this.setSessionInfo(null);
        this.setSessionCwd(null);
        this.setCompletionState(null);
        this.setError(
          typeof event.payload.exitCode === 'number'
            ? `Terminal session exited with code ${event.payload.exitCode}.`
            : 'Terminal session exited.',
        );
      }),
      listen<TerminalSessionCwdEvent>('terminal:session-cwd', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.sessionOriginCwd = event.payload.cwd ?? null;
        this.session = { ...this.session!, cwd: event.payload.cwd ?? null };
        this.setSessionInfo(this.session);
        this.setSessionCwd(event.payload.cwd ?? null);
      }),
      listen<TerminalSessionStateEvent>('terminal:session-state', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        const next: TerminalSessionInfo = {
          ...this.session!,
          kind: event.payload.kind,
          provider: event.payload.provider,
          status: event.payload.status,
          cwd: event.payload.cwd ?? this.session!.cwd ?? null,
          profileId: event.payload.profileId ?? this.session!.profileId ?? null,
        };
        this.session = next;
        this.setSessionInfo(next);
        if (event.payload.cwd !== undefined) {
          this.sessionOriginCwd = event.payload.cwd ?? null;
          this.setSessionCwd(event.payload.cwd ?? null);
        }
      }),
      listen<TerminalCompletionsStartedEvent>('terminal:completions-started', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.setCompletionState({
          status: 'running',
          format: event.payload.format,
          promptVisible: false,
          completions: [],
          lastValue: null,
        });
      }),
      listen<TerminalCompletionsFinishedEvent>('terminal:completions-finished', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        const last = event.payload.data[event.payload.data.length - 1] ?? null;
        this.setCompletionState((current) => ({
          status: 'finished',
          format: current?.format ?? null,
          promptVisible: false,
          completions: event.payload.data,
          lastValue: last?.description ?? last?.name ?? null,
        }));
      }),
      listen<TerminalCompletionResultEvent>('terminal:completion-result', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.setCompletionState((current) => {
          if (!current) {
            return {
              status: 'running',
              format: null,
              promptVisible: false,
              completions: [event.payload.completion],
              lastValue: event.payload.completion.description ?? event.payload.completion.name,
            };
          }
          const existing = current.completions.findIndex((c) => c.name === event.payload.completion.name);
          const nextCompletions = existing >= 0
            ? current.completions.map((c, i) => (i === existing ? event.payload.completion : c))
            : [...current.completions, event.payload.completion];
          return { ...current, completions: nextCompletions, lastValue: event.payload.completion.description ?? event.payload.completion.name };
        });
      }),
      listen<TerminalCompletionUpdateEvent>('terminal:completion-update', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.setCompletionState((current) => {
          if (!current || current.completions.length === 0) return current;
          const next = [...current.completions];
          next[next.length - 1] = { ...next[next.length - 1], description: event.payload.value };
          return { ...current, completions: next, lastValue: event.payload.value };
        });
      }),
      listen<TerminalCompletionsPromptEvent>('terminal:completions-prompt', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.setCompletionState((current) => {
          if (!current) {
            return { status: 'running', format: null, promptVisible: true, completions: [], lastValue: null };
          }
          return { ...current, status: current.status === 'finished' ? 'running' : current.status, promptVisible: true };
        });
      }),
    ]);

    // Call unlisten functions for cleanup
    const unlistenFns = unlisteners.map((u) => () => { try { u(); } catch {} });
    this.unlisteners = unlistenFns;
  }

  stop(): void {
    this.unlisteners.forEach((unlisten) => { try { unlisten(); } catch {} });
    this.unlisteners = [];

    const activeSession = this.session;
    if (activeSession) {
      void invoke(
        this.options.persistSession ? 'terminal_release_session' : 'terminal_kill_session',
        { request: { sessionId: activeSession.id } },
      );
    }
    this.session = null;
    this.setSessionInfo(null);
    this.setCompletionState(null);
    this.outputBuffer = {};
    if (this.outputFlushFrame !== null) {
      cancelAnimationFrame(this.outputFlushFrame);
      this.outputFlushFrame = null;
    }
    Object.values(this.pendingBlockReconcileTimeouts).forEach((id) => clearTimeout(id));
    this.pendingBlockReconcileTimeouts = {};
  }

  // ── Private helpers ───────────────────────────────────────────

  private setError(error: string | null): void {
    if (this.surface === 'terminal') {
      this.store.getState().setTerminalError(error);
    } else {
      this.store.getState().setAgentTerminalError(error);
    }
  }

  private setSessionInfo(info: TerminalSessionInfo | null): void {
    if (this.surface === 'terminal') {
      this.store.getState().setTerminalSessionInfo(info);
    } else {
      this.store.getState().setAgentTerminalSessionInfo(info);
    }
  }

  private setSessionCwd(cwd: string | null): void {
    if (this.surface === 'terminal') {
      this.store.getState().setTerminalSessionCwd(cwd);
    } else {
      this.store.getState().setAgentTerminalSessionCwd(cwd);
    }
  }

  private setCompletionState(
    next: TerminalCompletionState | null | ((prev: TerminalCompletionState | null) => TerminalCompletionState | null),
  ): void {
    if (this.surface === 'terminal') {
      this.store.getState().setTerminalCompletionState(next);
    } else {
      this.store.getState().setAgentTerminalCompletionState(next);
    }
  }

  private applySharedMeta(block: TerminalCommandBlock): TerminalCommandBlock {
    return {
      ...block,
      ...this.sharedBlockMeta[block.id],
      presentation: this.sharedBlockMeta[block.id]?.presentation ?? block.presentation ?? 'command',
    };
  }

  private sortBlocks(blocks: TerminalCommandBlock[]): TerminalCommandBlock[] {
    return [...blocks].sort((a, b) => {
      const aTime = Date.parse(a.startedAt || '') || 0;
      const bTime = Date.parse(b.startedAt || '') || 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });
  }

  private commitTimeline(
    nextCommand: TerminalCommandBlock[],
    nextSynthetic: TerminalCommandBlock[] = this.syntheticBlocks,
  ): void {
    const normCmd = this.sortBlocks(nextCommand.map((b) => this.applySharedMeta(b)));
    const normSynth = this.sortBlocks(nextSynthetic.map((b) => this.applySharedMeta(b)));
    this.commandBlocks = normCmd;
    this.syntheticBlocks = normSynth;
    this.onCommandBlocksChange?.(this.sortBlocks(normCmd));
    const all = this.sortBlocks([...normCmd, ...normSynth]);
    if (this.surface === 'terminal') {
      this.store.getState().setTerminalBlocks(all);
    } else {
      this.store.getState().setAgentTerminalBlocks(all);
    }
  }

  private upsertBlock(block: TerminalBlock): void {
    const existing = this.commandBlocks.find((b) => b.id === block.id);
    const pendingCmdOutput = this.commandInFlight ? this.pendingCommandOutput : '';
    const buffered = this.outputBuffer[block.id] ?? '';
    delete this.outputBuffer[block.id];
    const pendingOut = `${this.pendingOutput[block.id] ?? ''}${pendingCmdOutput}${buffered}`;
    const canonical = existing?.finishedAt && !block.finishedAt ? existing : block;
    const source = existing?.source
      ?? this.sharedBlockMeta[block.id]?.source
      ?? this.blockOptions[block.id]?.source
      ?? (this.commandInFlight && this.pendingCommandOutput === '' ? this.blockOptions['PENDING']?.source : undefined);

    const nextBlock = this.applySharedMeta({
      ...this.mergeBlock(canonical, `${existing?.output ?? ''}${pendingOut}`, this.sharedBlockMeta[block.id]),
      source,
    });

    if (pendingOut) {
      delete this.pendingOutput[block.id];
      this.pendingCommandOutput = '';
    }

    if (nextBlock.status === 'running') {
      this.activeBlockId = nextBlock.id;
      this.commandInFlight = false;
    } else if (this.activeBlockId === nextBlock.id) {
      this.activeBlockId = null;
    }
    if (nextBlock.status === 'finished') {
      const timeoutId = this.pendingBlockReconcileTimeouts[nextBlock.id];
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        delete this.pendingBlockReconcileTimeouts[nextBlock.id];
      }
    }

    const nextCommandBlocks = existing
      ? this.commandBlocks.map((b) => (b.id === nextBlock.id ? nextBlock : b))
      : [...this.commandBlocks, nextBlock].slice(-80);
    this.commitTimeline(nextCommandBlocks);
  }

  private mergeBlock(
    block: TerminalBlock,
    output = '',
    meta?: TerminalBlockSharedMeta,
  ): TerminalCommandBlock {
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

  private appendOutput(blockId: string, data: string): void {
    if (!data) return;
    this.outputBuffer[blockId] = `${this.outputBuffer[blockId] ?? ''}${data}`;
    this.scheduleOutputFlush();
  }

  private scheduleOutputFlush(): void {
    if (this.outputFlushFrame !== null) return;
    this.outputFlushFrame = requestAnimationFrame(() => {
      this.outputFlushFrame = null;
      this.flushBufferedOutputs();
    });
  }

  private flushBufferedOutputs(): void {
    const entries = Object.entries(this.outputBuffer);
    if (entries.length === 0) return;

    const currentBuffer = this.outputBuffer;
    const nextBuffer: Record<string, string> = {};
    const currentIds = new Set(this.commandBlocks.map((b) => b.id));
    const nextCommand = this.commandBlocks.map((b) => {
      const addition = currentBuffer[b.id];
      if (!addition) return b;
      return { ...b, output: `${b.output}${addition}` };
    });

    entries.forEach(([blockId, addition]) => {
      if (!currentIds.has(blockId)) nextBuffer[blockId] = addition;
    });

    this.outputBuffer = nextBuffer;

    if (!nextCommand.some((b, i) => b !== this.commandBlocks[i])) return;
    this.commitTimeline(nextCommand);
  }

  private upsertBlockMeta(blockId: string, meta: TerminalBlockSharedMeta): void {
    this.sharedBlockMeta = {
      ...this.sharedBlockMeta,
      [blockId]: { ...(this.sharedBlockMeta[blockId] ?? {}), ...meta },
    };
    this.onBlockMetaChange?.(this.sharedBlockMeta);
    this.commitTimeline(this.commandBlocks, this.syntheticBlocks);
  }

  private schedulePendingBlockReconcile(
    sessionId: string,
    blockId: string,
    attempt = 0,
  ): void {
    const existingTimeout = this.pendingBlockReconcileTimeouts[blockId];
    if (existingTimeout !== undefined) clearTimeout(existingTimeout);

    const delayMs = attempt < 2 ? 250 : 1000;
    this.pendingBlockReconcileTimeouts[blockId] = window.setTimeout(() => {
      void invoke<TerminalBlock[]>('terminal_get_blocks', { request: { sessionId } })
        .then((latestBlocks) => {
          if (!this.session || this.session.id !== sessionId) {
            delete this.pendingBlockReconcileTimeouts[blockId];
            return;
          }
          const latestBlock = latestBlocks.find((b) => b.id === blockId);
          if (latestBlock?.finishedAt) {
            delete this.pendingBlockReconcileTimeouts[blockId];
            this.reconcileBlocksFromSession(latestBlocks);
            return;
          }
          const localBlock = this.commandBlocks.find((b) => b.id === blockId);
          if (localBlock?.status === 'running' && attempt < 5) {
            this.schedulePendingBlockReconcile(sessionId, blockId, attempt + 1);
            return;
          }
          delete this.pendingBlockReconcileTimeouts[blockId];
        })
        .catch(() => {
          if (attempt < 5) {
            this.schedulePendingBlockReconcile(sessionId, blockId, attempt + 1);
            return;
          }
          delete this.pendingBlockReconcileTimeouts[blockId];
        });
    }, delayMs);
  }

  private reconcileBlocksFromSession(nextBlocks: TerminalBlock[]): void {
    const normalized = nextBlocks.map((b) => this.applySharedMeta({
      ...this.mergeBlock(b, '', this.sharedBlockMeta[b.id]),
      presentation: this.blockOptions[b.id]?.source ? 'command' : undefined,
    }));
    const running = normalized.filter((b) => b.status === 'running');
    this.activeBlockId = running[running.length - 1]?.id ?? null;
    this.pendingCommandOutput = '';
    this.pendingOutput = {};
    this.outputBuffer = {};
    if (this.outputFlushFrame !== null) {
      cancelAnimationFrame(this.outputFlushFrame);
      this.outputFlushFrame = null;
    }
    this.blockOptions = Object.fromEntries(
      normalized.map((b) => [b.id, { source: b.source }]),
    );
    this.commitTimeline(normalized);
    this.setError(null);
  }
}
