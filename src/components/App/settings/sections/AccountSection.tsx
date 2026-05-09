import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Copy, Info } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

type AppUpdateRelease = {
  version: string;
  notes?: string | null;
  pubDate?: string | null;
  target: string;
};

type AppUpdateStateSnapshot = {
  currentVersion: string;
  enabled: boolean;
  stage: 'disabled' | 'idle' | 'checking' | 'updateReady' | 'downloading' | 'installing' | 'restartRequired' | 'error';
  availableUpdate?: AppUpdateRelease | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  downloadedBytes?: number | null;
  contentLength?: number | null;
};

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
      className="settings-toggle active"
      type="button"
      aria-label="Settings sync enabled"
      aria-pressed="true"
    >
      <span />
    </button>
  );
}

export function AccountSection() {
  const [updateState, setUpdateState] = useState<AppUpdateStateSnapshot | null>(null);

  useEffect(() => {
    let mounted = true;

    void invoke<AppUpdateStateSnapshot>('app_updates_get_state')
      .then((state) => {
        if (mounted) {
          setUpdateState(state);
        }
      })
      .catch((error) => {
        console.warn('[account-settings] failed to load updater state', error);
      });

    const unlistenPromise = listen<AppUpdateStateSnapshot>('app:update-state', (event) => {
      if (mounted) {
        setUpdateState(event.payload);
      }
    });

    return () => {
      mounted = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const updateActionLabel = useMemo(() => {
    if (!updateState) return 'Check for updates';
    switch (updateState.stage) {
      case 'checking':
        return 'Checking...';
      case 'downloading': {
        if (updateState.downloadedBytes && updateState.contentLength) {
          const percent = Math.min(
            100,
            Math.round((updateState.downloadedBytes / updateState.contentLength) * 100)
          );
          return `Downloading ${percent}%`;
        }
        return 'Downloading...';
      }
      case 'installing':
        return 'Installing...';
      case 'updateReady':
        return 'Install update';
      case 'restartRequired':
        return 'Restart to update';
      default:
        return 'Check for updates';
    }
  }, [updateState]);

  const updateStatusLabel = useMemo(() => {
    if (!updateState) return 'Checking updater availability';
    if (!updateState.enabled) return 'Updater not configured';
    if (updateState.lastError) return updateState.lastError;

    switch (updateState.stage) {
      case 'checking':
        return 'Checking for updates';
      case 'downloading':
        return 'Downloading update';
      case 'installing':
        return 'Installing update';
      case 'updateReady':
        return updateState.availableUpdate
          ? `Version ${updateState.availableUpdate.version} is ready to install`
          : 'Update available';
      case 'restartRequired':
        return 'Update installed. Restart to apply it';
      case 'idle':
        return updateState.lastCheckedAt ? 'Up to date' : 'Ready to check for updates';
      default:
        return 'Updater not configured';
    }
  }, [updateState]);

  const isUpdateActionBusy = updateState?.stage === 'checking'
    || updateState?.stage === 'downloading'
    || updateState?.stage === 'installing';

  const handleUpdateAction = async () => {
    try {
      if (updateState?.stage === 'updateReady') {
        const nextState = await invoke<AppUpdateStateSnapshot>('app_updates_install');
        setUpdateState(nextState);
        return;
      }

      if (updateState?.stage === 'restartRequired') {
        await invoke('app_updates_restart');
        return;
      }

      const nextState = await invoke<AppUpdateStateSnapshot>('app_updates_check');
      setUpdateState(nextState);
    } catch (error) {
      console.warn('[account-settings] updater action failed', error);
    }
  };

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
            <Copy size={12} style={{ opacity: 0.6 }} /> v{updateState?.currentVersion ?? '0.1.0'}
          </div>
        </div>
        <div className="settings-version-actions">
          <button
            className="settings-link"
            type="button"
            onClick={() => {
              void handleUpdateAction();
            }}
            disabled={isUpdateActionBusy}
          >
            {updateActionLabel}
          </button>
          <span className="settings-version-status" title={updateStatusLabel}>{updateStatusLabel}</span>
        </div>
      </div>

      <div className="settings-actions">
        <button className="settings-primary-button" type="button">Log out</button>
      </div>
    </section>
  );
}
