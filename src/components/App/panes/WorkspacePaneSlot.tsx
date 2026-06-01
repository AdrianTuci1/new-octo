import { useRef } from 'react';
import { Launcher } from '../../Layout/Launcher';
import { LauncherStoreProvider, createLauncherStore, type LauncherStoreApi } from '../../../stores';
import { X } from 'lucide-react';

type LauncherProps = Record<string, unknown> & {
  initialComposerSurface?: 'agent' | 'terminal';
};

interface WorkspacePaneSlotProps {
  paneId: string;
  tabId: string;
  active: boolean;
  launcherIdentityKey: string;
  onFocusPane: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  hasMultiplePanes?: boolean;
  launcherProps: LauncherProps;
}

export function WorkspacePaneSlot(props: WorkspacePaneSlotProps) {
  const storeRef = useRef<LauncherStoreApi | null>(null);

  if (!storeRef.current) {
    storeRef.current = createLauncherStore(props.launcherProps.initialComposerSurface ?? 'terminal');
  }

  return (
    <div
      className={`app-window-launcher-slot ${props.active ? 'active' : ''}`}
      onMouseDown={() => props.onFocusPane(props.paneId)}
      onMouseEnter={() => {
        if (document.body.classList.contains('appearance-focus-follows-mouse')) {
          props.onFocusPane(props.paneId);
        }
      }}
    >
      {props.hasMultiplePanes && (
        <div className="app-window-launcher-pane-header">
          {props.onClosePane && (
            <button
              className="app-window-launcher-pane-close"
              type="button"
              aria-label="Close window"
              onClick={(e) => {
                e.stopPropagation();
                props.onClosePane?.(props.paneId);
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="app-window-launcher-slot-content">
        <LauncherStoreProvider store={storeRef.current}>
          <Launcher {...props.launcherProps} />
        </LauncherStoreProvider>
      </div>
    </div>
  );
}
