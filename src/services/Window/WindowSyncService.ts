import { getCurrentWindow, currentMonitor, primaryMonitor } from '@tauri-apps/api/window';
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';

interface WindowDimensions {
  width: number;
  height: number;
}

/**
 * WindowSyncService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Facade** (wraps Tauri window APIs)
 * Attaches a ResizeObserver to an HTMLElement and synchronizes Tauri window position & size.
 */
export class WindowSyncService {
  private elementRef: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private rafId = 0;
  private lastSize: WindowDimensions = { width: 0, height: 0 };

  attach(element: HTMLElement): void {
    this.detach();
    const currentWindow = (window as any).__TAURI_INTERNALS__ ? getCurrentWindow() : null;
    if (!currentWindow) {
      console.warn('[window-sync] Tauri internals not found, skipping sync');
      return;
    }

    this.elementRef = element;

    const syncWindow = async () => {
      const el = this.elementRef;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scaleFactor = await currentWindow.scaleFactor();
      const physicalSize = new LogicalSize(Math.ceil(rect.width), Math.ceil(rect.height)).toPhysical(scaleFactor);

      if (this.lastSize.width === physicalSize.width && this.lastSize.height === physicalSize.height) {
        return;
      }
      this.lastSize = { width: physicalSize.width, height: physicalSize.height };

      const outerSize = await currentWindow.outerSize();
      const monitor = await currentMonitor();
      const workingMonitor = monitor ?? (await primaryMonitor());
      if (!workingMonitor) return;
      const { position, size } = workingMonitor.workArea;
      const x = position.x + Math.max(0, Math.floor((size.width - outerSize.width) / 2));
      const y = position.y + Math.max(0, size.height - outerSize.height - 68);
      await currentWindow.setPosition(new PhysicalPosition(x, y));
    };

    this.observer = new ResizeObserver(() => {
      cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => {
        void syncWindow();
      });
    });

    this.observer.observe(element);
    void syncWindow();
  }

  detach(): void {
    cancelAnimationFrame(this.rafId);
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.elementRef = null;
    this.lastSize = { width: 0, height: 0 };
  }

  static getInstance(): WindowSyncService {
    if (!instance) {
      instance = new WindowSyncService();
    }
    return instance;
  }
}

let instance: WindowSyncService | null = null;
