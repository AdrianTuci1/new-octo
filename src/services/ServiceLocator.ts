import { getShellStore, type ShellStoreApi } from '../stores/ShellStore';
import { getAgentStore } from '../stores/AgentStore';
import type { MemoryStoreState } from '../stores/memoryStore';
import type { StoreApi } from 'zustand/vanilla';
import { ShellWindowService } from './Shell/ShellWindowService';
import { AgentPanelService } from './Agent/AgentPanelService';
import { LauncherService } from './Launcher/LauncherService';
import { useChatStore } from '../stores/chatStore';
import { useLauncherStore } from '../stores/launcherStore';

let locator: ServiceLocator | null = null;

export class ServiceLocator {
  readonly shellStore: ShellStoreApi;
  readonly shellWindow: ShellWindowService;
  readonly agent: AgentPanelService;
  readonly launcher: LauncherService;

  constructor(memoryStore: StoreApi<MemoryStoreState>) {
    this.shellStore = getShellStore();
    this.shellWindow = new ShellWindowService(this.shellStore);
    this.agent = new AgentPanelService(getAgentStore(), memoryStore);
    this.launcher = new LauncherService(
      useLauncherStore as unknown as StoreApi<any>,
      useChatStore as unknown as StoreApi<any>,
      memoryStore,
    );
  }

  static init(memoryStore: StoreApi<MemoryStoreState>): ServiceLocator {
    locator = new ServiceLocator(memoryStore);
    return locator;
  }

  static get(): ServiceLocator {
    if (!locator) {
      throw new Error('ServiceLocator not initialized. Call ServiceLocator.init() first.');
    }
    return locator;
  }
}
