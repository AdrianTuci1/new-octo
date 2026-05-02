import { useLayoutEffect, useRef } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { PhysicalPosition, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';

export function useWindowSync(elementRef: React.RefObject<HTMLElement>) {
  const lastWindowSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const currentWindow = (window as any).__TAURI_INTERNALS__ ? getCurrentWindow() : null;
    if (!currentWindow) {
      console.warn('[useWindowSync] Tauri internals not found, skipping sync');
      return;
    }
    let rafId = 0;

    const syncWindow = async () => {
      const rect = element.getBoundingClientRect();
      const scaleFactor = await currentWindow.scaleFactor();
      const physicalSize = new LogicalSize(Math.ceil(rect.width), Math.ceil(rect.height)).toPhysical(scaleFactor);

      if (
        lastWindowSizeRef.current.width === physicalSize.width &&
        lastWindowSizeRef.current.height === physicalSize.height
      ) {
        return;
      }

      lastWindowSizeRef.current = { width: physicalSize.width, height: physicalSize.height };
      // No longer calling setSize as the window is now click-through natively

      const outerSize = await currentWindow.outerSize();
      const monitor = await currentMonitor();
      const workingMonitor = monitor ?? (await primaryMonitor());
      if (!workingMonitor) return;

      const { position, size } = workingMonitor.workArea;
      
      const x = position.x + Math.max(0, Math.floor((size.width - outerSize.width) / 2));
      const y = position.y + Math.max(0, size.height - outerSize.height - 68);
      await currentWindow.setPosition(new PhysicalPosition(x, y));
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        void syncWindow();
      });
    });

    observer.observe(element);
    void syncWindow();

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [elementRef]);
}
