import { Copy, Info } from 'lucide-react';
import type { ReactNode } from 'react';

function SettingsRow({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-title">
          {title}
          {title === 'Settings sync' && <Info size={12} style={{ opacity: 0.6 }} />}
        </div>
        <div className="settings-row-description">{description}</div>
      </div>
      {action}
    </div>
  );
}

function SettingsToggle() {
  return (
    <button
      className="settings-toggle"
      type="button"
      aria-label="Settings sync enabled"
      aria-pressed="true"
    >
      <span />
    </button>
  );
}

export function AccountSection() {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h1>Account</h1>
      </div>

      <div className="settings-profile">
        <div className="settings-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
        </div>
        <div className="settings-brand-info">
          <div className="settings-profile-name">staticlabs</div>
          <div className="settings-profile-email">hello@staticlabs.ro</div>
        </div>
      </div>

      <SettingsRow
        title="Settings sync"
        description=""
        action={<SettingsToggle />}
      />

      <SettingsRow
        title=""
        description="Earn rewards by sharing Warp with friends & colleagues"
        action={<button className="settings-link" type="button">Refer a friend</button>}
      />

      <div className="settings-row settings-row-link">
        <div>
          <div className="settings-row-title">Version</div>
          <div className="settings-row-description version-display">
            <Copy size={12} style={{ opacity: 0.6 }} /> v0.2026.04.27.15.32.stable_03
          </div>
        </div>
        <div className="settings-version-actions">
          <button className="settings-link" type="button">Check for updates</button>
          <span className="settings-version-status">Up to date</span>
        </div>
      </div>

      <div className="settings-actions">
        <button className="settings-primary-button" type="button">Log out</button>
      </div>
    </section>
  );
}
