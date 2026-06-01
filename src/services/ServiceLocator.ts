import { getShellStore, type ShellStoreApi } from '../stores/ShellStore';
import { ShellWindowService } from './Shell/ShellWindowService';

let locator: ServiceLocator | null = null;

export class ServiceLocator {
  readonly shellStore: ShellStoreApi;
  readonly shellWindow: ShellWindowService;

  constructor() {
    this.shellStore = getShellStore();
    this.shellWindow = new ShellWindowService(this.shellStore);
  }

  static init(): ServiceLocator {
    locator = new ServiceLocator();
    return locator;
  }

  static get(): ServiceLocator {
    if (!locator) {
      throw new Error('ServiceLocator not initialized. Call ServiceLocator.init() first.');
    }
    return locator;
  }
}
