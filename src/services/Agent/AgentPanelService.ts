import type { StoreApi } from 'zustand/vanilla';
import type { AgentState } from '../../stores/AgentStore';
import type { MemoryStoreState } from '../../stores/memoryStore';
import { AgentTrayService } from './AgentTrayService';
import { AgentModelService } from './AgentModelService';
import { AgentApprovalService } from './AgentApprovalService';
import { AgentRuntimeService } from './AgentRuntimeService';
import { AgentHistoryService } from './AgentHistoryService';
import { AgentTerminalService } from './AgentTerminalService';
import { AgentChatService } from './AgentChatService';
import { AgentComposerService } from './AgentComposerService';
import { AgentShortcutService } from './AgentShortcutService';

/**
 * AgentPanelService — Mediator that orchestrates all sub-services
 * for the agent panel and exposes a unified public API.
 */
export class AgentPanelService {
  readonly tray: AgentTrayService;
  readonly model: AgentModelService;
  readonly approval: AgentApprovalService;
  readonly runtime: AgentRuntimeService;
  readonly history: AgentHistoryService;
  readonly terminal: AgentTerminalService;
  readonly agentTerminal: AgentTerminalService;
  readonly chat: AgentChatService;
  readonly composer: AgentComposerService;
  readonly shortcuts: AgentShortcutService;

  constructor(
    readonly store: StoreApi<AgentState>,
    readonly memoryStore: StoreApi<MemoryStoreState>,
  ) {
    this.tray = new AgentTrayService(store);
    this.model = new AgentModelService(store, memoryStore);
    this.approval = new AgentApprovalService(store);
    this.runtime = new AgentRuntimeService(store, memoryStore);
    this.history = new AgentHistoryService(store, memoryStore);
    this.terminal = new AgentTerminalService(store, 'terminal');
    this.agentTerminal = new AgentTerminalService(store, 'agent');
    this.chat = new AgentChatService();
    this.composer = new AgentComposerService(store);
    this.shortcuts = new AgentShortcutService(store);
  }

  // ── Composer surface ──────────────────────────────────────────

  get composerSurface(): 'agent' | 'terminal' {
    return this.store.getState().composerSurface;
  }

  setComposerSurface(surface: 'agent' | 'terminal'): void {
    this.store.getState().setComposerSurface(surface);
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /** Start terminal event listeners for both terminal services */
  async start(): Promise<void> {
    await Promise.all([
      this.terminal.start(),
      this.agentTerminal.start(),
    ]);
  }

  /** Cleanup terminal services and shortcuts */
  stop(): void {
    this.terminal.stop();
    this.agentTerminal.stop();
    this.shortcuts.stop();
    this.composer.cleanup();
  }
}
