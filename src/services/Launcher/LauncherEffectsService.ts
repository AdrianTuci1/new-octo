import type { StoreApi } from 'zustand/vanilla';

/**
 * Manages side effects for the Launcher surface.
 * Coordinates memory syncing and cleanup on lifecycle transitions.
 */
export class LauncherEffectsService {
  private started = false;

  constructor(
    private readonly launcherStore: StoreApi<any>,
    private readonly chatStore: StoreApi<any>,
  ) {}

  /**
   * Activate the service. No-op for now; flags the service as started.
   */
  start(): void {
    this.started = true;
  }

  /**
   * Deactivate the service and clean up any listeners or intervals.
   */
  stop(): void {
    this.started = false;
  }

  /**
   * Sync memory store state. No-op for now; reserved for future wiring.
   */
  syncMemoryStore(): void {
    // no-op
  }
}
