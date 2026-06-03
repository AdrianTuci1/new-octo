import { useLayoutEffect } from 'react';
import { WindowSyncService } from '../services/Window/WindowSyncService';

export function useWindowSync(elementRef: React.RefObject<HTMLElement>, enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const element = elementRef.current;
    if (!element) return;
    WindowSyncService.getInstance().attach(element);
    return () => WindowSyncService.getInstance().detach();
  }, [elementRef, enabled]);
}
