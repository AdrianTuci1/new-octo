import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { StoreApi } from 'zustand/vanilla';
import type { LauncherState } from '../../stores/launcherStore';
import type {
  TerminalCommandBlock,
  TerminalSessionInfo,
  TerminalCompletionState,
  TerminalBlock,
  TerminalBlockEvent,
  TerminalBlockOutputEvent,
  TerminalExitEvent,
  TerminalSessionCwdEvent,
  TerminalSessionStateEvent,
  TerminalRunCommandResponse,
  TerminalCommandSource,
  TerminalSessionTarget,
} from '../../types/terminal';

export type TerminalServiceRunOptions = {
  source?: TerminalCommandSource;
  waitForCompletion?: boolean;
};

/**
 * Lightweight terminal service for the Launcher surface.
 * Manages session lifecycle, block management, and Tauri event listeners.
 */
export class LauncherTerminalService {
  private unlisteners: Array<() => void> = [];
  private session: TerminalSessionInfo | null = null;
  private sessionPromise: Promise<TerminalSessionInfo> | null = null;
  private persistedSessionId: string | null = null;
  private commandBlocks: TerminalCommandBlock[] = [];
  private syntheticBlocks: TerminalCommandBlock[] = [];
  private activeBlockId: string | null = null;
  private commandInFlight = false;
  private outputBuffer: Record<string, string> = {};

  private onSessionChange?: (sessionId: string | null) => void;

  constructor(
    private readonly store: StoreApi<LauncherState>,
    private readonly options: {
      cwd?: string | null;
      initialSessionId?: string | null;
      target?: TerminalSessionTarget | null;
      persistSession?: boolean;
      onSessionChange?: (sessionId: string | null) => void;
    } = {},
  ) {
    this.persistedSessionId = options.initialSessionId ?? null;
    this.onSessionChange = options.onSessionChange;
  }

  // ── Getters ──────────────────────────────────────────────────

  get blocks(): TerminalCommandBlock[] {
    return this.commandBlocks;
  }

  get sessionId(): string | null {
    return this.persistedSessionId;
  }

  get sessionInfo(): TerminalSessionInfo | null {
    return this.session;
  }

  // ── Session management ───────────────────────────────────────

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

  // ── Run command ──────────────────────────────────────────────

  async runCommand(
    command: string,
    options: TerminalServiceRunOptions = {},
  ): Promise<TerminalRunCommandResponse | null> {
    const normalized = command.trim();
    if (!normalized) return null;

    try {
      this.commandInFlight = true;
      const session = await this.ensureSession();
      const response = await invoke<TerminalRunCommandResponse>('terminal_run_command', {
        request: {
          sessionId: session.id,
          command: normalized,
          waitForCompletion: options.waitForCompletion ?? options.source !== 'user',
        },
      });

      this.activeBlockId = response.block.finishedAt ? null : response.block.id;
      this.commandInFlight = false;

      const status: TerminalCommandBlock['status'] = response.block.finishedAt ? 'finished' : 'running';
      const existingIndex = this.commandBlocks.findIndex((b) => b.id === response.block.id);
      const nextBlocks = existingIndex >= 0
        ? this.commandBlocks.map((b) => (b.id === response.block.id ? { ...b, ...response.block, status } : b))
        : [...this.commandBlocks, { ...response.block, output: '', status }].slice(-80);

      this.commandBlocks = nextBlocks;
      return response;
    } catch (reason) {
      this.commandInFlight = false;
      console.warn('[LauncherTerminalService] runCommand failed', reason);
      return null;
    }
  }

  // ── Block management ────────────────────────────────────────

  clearBlocks(): void {
    this.activeBlockId = null;
    this.commandBlocks = [];
    this.syntheticBlocks = [];
    this.commandInFlight = false;
    this.outputBuffer = {};
    this.session = null;
    this.sessionPromise = null;
    this.persistedSessionId = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────

  async start(): Promise<void> {
    const unlisteners = await Promise.all([
      listen<TerminalBlockEvent>('terminal:block', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        const block = event.payload.block;
        const status: TerminalCommandBlock['status'] = block.finishedAt ? 'finished' : 'running';
        const existingIndex = this.commandBlocks.findIndex((b) => b.id === block.id);
        const nextBlocks = existingIndex >= 0
          ? this.commandBlocks.map((b) => (b.id === block.id ? { ...b, ...block, status, output: b.output } : b))
          : [...this.commandBlocks, { ...block, status, output: '' }].slice(-80);
        this.commandBlocks = nextBlocks;
      }),
      listen<TerminalBlockOutputEvent>('terminal:block-output', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.commandBlocks = this.commandBlocks.map((b) =>
          b.id === event.payload.blockId
            ? { ...b, output: `${b.output}${event.payload.data}` }
            : b,
        );
      }),
      listen<TerminalExitEvent>('terminal:exit', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.session = null;
      }),
      listen<TerminalSessionCwdEvent>('terminal:session-cwd', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.session = { ...this.session!, cwd: event.payload.cwd ?? null };
      }),
      listen<TerminalSessionStateEvent>('terminal:session-state', (event) => {
        if (this.session?.id !== event.payload.sessionId) return;
        this.session = {
          ...this.session!,
          kind: event.payload.kind,
          provider: event.payload.provider,
          status: event.payload.status,
          cwd: event.payload.cwd ?? this.session!.cwd ?? null,
          profileId: event.payload.profileId ?? this.session!.profileId ?? null,
        };
      }),
    ]);

    const unlistenFns = unlisteners.map((u) => () => { try { u(); } catch {} });
    this.unlisteners = unlistenFns;
  }

  stop(): void {
    this.unlisteners.forEach((unlisten) => { try { unlisten(); } catch {} });
    this.unlisteners = [];

    if (this.session) {
      void invoke(
        this.options.persistSession ? 'terminal_release_session' : 'terminal_kill_session',
        { request: { sessionId: this.session.id } },
      );
    }
    this.session = null;
    this.outputBuffer = {};
  }
}
