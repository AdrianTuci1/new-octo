import type { StoreApi } from 'zustand/vanilla';
import type { LauncherStoreState } from '../../stores/launcherStore';
import type { ChatStoreState } from '../../stores/chatStore';
import type { MemoryStoreState } from '../../stores/memoryStore';
import { LauncherAppStateService } from './LauncherAppStateService';
import { LauncherChatService } from './LauncherChatService';
import { LauncherComposerService } from './LauncherComposerService';
import { LauncherEffectsService } from './LauncherEffectsService';
import { LauncherHistoryService } from './LauncherHistoryService';
import { LauncherKeyboardService } from './LauncherKeyboardService';
import { LauncherRuntimeService } from './LauncherRuntimeService';
import { LauncherTrayService } from './LauncherTrayService';
import { LauncherApprovalService } from './LauncherApprovalService';
import { LauncherTerminalService } from './LauncherTerminalService';

/**
 * LauncherService — Mediator that orchestrates all sub-services
 * for the Launcher surface and exposes a unified public API.
 * Mirrors AgentPanelService structure.
 */
export class LauncherService {
  readonly appState: LauncherAppStateService;
  readonly chat: LauncherChatService;
  readonly composer: LauncherComposerService;
  readonly effects: LauncherEffectsService;
  readonly history: LauncherHistoryService;
  readonly keyboard: LauncherKeyboardService;
  readonly runtime: LauncherRuntimeService;
  readonly tray: LauncherTrayService;
  readonly approval: LauncherApprovalService;
  readonly terminal: LauncherTerminalService;

  constructor(
    readonly launcherStore: StoreApi<LauncherStoreState>,
    readonly chatStore: StoreApi<ChatStoreState>,
    readonly memoryStore: StoreApi<MemoryStoreState>,
  ) {
    this.appState = new LauncherAppStateService(launcherStore, memoryStore);
    this.chat = new LauncherChatService(chatStore);
    this.composer = new LauncherComposerService(chatStore);
    this.effects = new LauncherEffectsService(launcherStore, chatStore);
    this.history = new LauncherHistoryService(launcherStore, memoryStore);
    this.keyboard = new LauncherKeyboardService(launcherStore, chatStore);
    this.runtime = new LauncherRuntimeService(launcherStore, memoryStore);
    this.tray = new LauncherTrayService(launcherStore);
    this.approval = new LauncherApprovalService(chatStore);
    this.terminal = new LauncherTerminalService(launcherStore);
  }

  // ── Composer surface ──────────────────────────────────────────

  get composerSurface(): 'agent' | 'terminal' {
    return this.launcherStore.getState().composerSurface;
  }

  setComposerSurface(surface: 'agent' | 'terminal'): void {
    this.launcherStore.getState().setComposerSurface(surface);
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.terminal.start();
  }

  stop(): void {
    this.terminal.stop();
  }
}
