import { Maximize2 } from 'lucide-react';

interface SettingsHeaderProps {
  onToggleFullscreen: () => void;
}

export function SettingsHeader(props: SettingsHeaderProps) {
  return (
    <div className="app-window-header">
      <span className="app-window-header-title">Settings</span>
      <div className="app-window-header-actions">
        <button
          className="app-window-header-action"
          type="button"
          aria-label="Toggle fullscreen"
          onClick={() => {
            void props.onToggleFullscreen();
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
