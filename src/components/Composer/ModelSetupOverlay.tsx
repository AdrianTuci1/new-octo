import { memo } from 'react';
import './ModelSetupOverlay.css';
import { Command } from 'lucide-react';
import type { LauncherViewModel } from '../Layout/Launcher/hooks';

type ModelSetupOverlayProps = {
  view: LauncherViewModel['views']['modelSetupOverlay'];
};

export const ModelSetupOverlay = memo(function ModelSetupOverlay({ view }: ModelSetupOverlayProps) {
  const { onBack, onOpenModelSettings } = view;

  return (
    <section className="composer-setup-overlay" aria-label="Model setup required">
      <div className="composer-setup-overlay-content" role="status" aria-live="polite">
        <p className="composer-setup-overlay-title">You don't have a configured model</p>

        <button
          className="composer-setup-overlay-hint"
          type="button"
          onClick={onBack}
          aria-label="Go Back"
        >
          <span className="composer-setup-overlay-hint-text">
            <span className="keycap">esc</span>
            <span>to go back</span>
          </span>
        </button>

        <button
          className="composer-setup-overlay-hint"
          type="button"
          onClick={onOpenModelSettings}
          aria-label="Add API Key"
        >
          <span className="composer-setup-overlay-hint-text">
            <span className="keycap">
              <Command size={10} aria-hidden="true" />
            </span>
            <span className="keycap">x</span>
            <span>add API key</span>
          </span>
        </button>

      </div>
    </section>
  );
});
