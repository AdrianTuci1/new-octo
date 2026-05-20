import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Copy, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ProfileAvatar } from '../../profile/ProfileAvatar';
import { createAvatarSeed } from '../profileSettings';
import { useProfileSettings } from '../useProfileSettings';

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
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-description">{description}</div>
      </div>
      {action}
    </div>
  );
}

export function ProfileSection() {
  const { profile, saveProfile } = useProfileSettings();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [updateState, setUpdateState] = useState<AppUpdateStateSnapshot | null>(null);

  useEffect(() => {
    setDisplayName(profile.displayName);
  }, [profile.displayName]);

  useEffect(() => {
    let mounted = true;

    void invoke<AppUpdateStateSnapshot>('app_updates_get_state')
      .then((state) => {
        if (mounted) {
          setUpdateState(state);
        }
      })
      .catch((error) => {
        console.warn('[profile-settings] failed to load updater state', error);
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

  const handleSaveName = () => {
    const nextName = displayName.trim() || profile.displayName;
    setDisplayName(nextName);
    void saveProfile({
      ...profile,
      displayName: nextName
    });
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const avatarDataUrl = await readAvatarFile(file);
      void saveProfile({
        ...profile,
        avatarDataUrl
      });
    } catch (error) {
      console.warn('[profile-settings] failed to load avatar image', error);
    }
  };

  const handleRegenerateAvatar = () => {
    void saveProfile({
      ...profile,
      avatarDataUrl: null,
      avatarSeed: createAvatarSeed()
    });
  };

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
      console.warn('[profile-settings] updater action failed', error);
    }
  };

  return (
    <section className="settings-panel profile-settings-panel">
      <div className="settings-panel-header">
        <h1>Profile</h1>
      </div>

      <div className="settings-profile profile-settings-card">
        <ProfileAvatar profile={profile} size={72} showInitials={Boolean(profile.avatarDataUrl)} />
        <div className="settings-brand-info profile-settings-info">
          <div className="settings-profile-name">{profile.displayName}</div>
          <div className="settings-profile-email">Local workspace profile</div>
          <div className="profile-avatar-actions">
            <button className="settings-secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} />
              <span>Upload photo</span>
            </button>
            <button className="settings-secondary-button" type="button" onClick={handleRegenerateAvatar}>
              <RefreshCw size={14} />
              <span>Generate mosaic</span>
            </button>
          </div>
          <input ref={fileInputRef} className="profile-avatar-input" type="file" accept="image/*" onChange={handleAvatarUpload} />
        </div>
      </div>

      <SettingsRow
        title="Display name"
        description="Shown in local workspace surfaces and used for avatar initials when needed."
        action={(
          <div className="profile-name-editor">
            <input
              className="settings-text-input profile-name-input"
              value={displayName}
              onBlur={handleSaveName}
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
            <button className="settings-link" type="button" onClick={handleSaveName}>Save</button>
          </div>
        )}
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
    </section>
  );
}

export const AccountSection = ProfileSection;

function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Unable to decode image'));
      image.onload = () => {
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Unable to prepare image'));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}
