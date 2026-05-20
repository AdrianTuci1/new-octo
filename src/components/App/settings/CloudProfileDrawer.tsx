import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMemoryStore, useUIStore } from '../../../stores';
import { DrawerHeader } from '../drawers/DrawerHeader';
import {
  buildCloudProfilesSettingsValues,
  cloudSecretAccount,
  createCloudProfile,
  normalizeCloudProfiles,
  type CloudConnectionMethod,
  type CloudProfile,
  type CloudProviderId
} from './cloudProfiles';
import './CloudProfileDrawer.css';

export function CloudProfileDrawer() {
  const setIsCloudProfileDrawerOpen = useUIStore((state) => state.setIsCloudProfileDrawerOpen);
  const setSelectedCloudProfileIdForEdit = useUIStore((state) => state.setSelectedCloudProfileIdForEdit);
  const selectedCloudProfileIdForEdit = useUIStore((state) => state.selectedCloudProfileIdForEdit);
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const cloudProfiles = useMemo(() => normalizeCloudProfiles(settings?.values), [settings?.values]);

  const profile = useMemo(
    () => {
      if (!selectedCloudProfileIdForEdit) {
        return null;
      }

      const existing = cloudProfiles.find((entry) => entry.id === selectedCloudProfileIdForEdit);
      if (existing) {
        return existing;
      }

      if (selectedCloudProfileIdForEdit === 'modal' || selectedCloudProfileIdForEdit === 'custom-vm') {
        return createCloudProfile(selectedCloudProfileIdForEdit);
      }

      return null;
    },
    [cloudProfiles, selectedCloudProfileIdForEdit]
  );

  const [profileName, setProfileName] = useState('New cloud profile');
  const [provider, setProvider] = useState<CloudProviderId>('custom-vm');
  const [environment, setEnvironment] = useState('dev');
  const [connectionMethod, setConnectionMethod] = useState<CloudConnectionMethod>('ssh-key');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('root');
  const [bootstrapPublicKey, setBootstrapPublicKey] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [modalToken, setModalToken] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const nextProvider = profile?.provider ?? 'custom-vm';
    setProfileName(profile?.title ?? 'New cloud profile');
    setProvider(nextProvider);
    setEnvironment(profile?.environment ?? (nextProvider === 'modal' ? 'main' : 'dev'));
    setConnectionMethod(profile?.connectionMethod ?? (nextProvider === 'modal' ? 'modal-token' : 'ssh-key'));
    setHost(profile?.host ?? '');
    setUsername(profile?.username ?? (nextProvider === 'modal' ? 'modal' : 'ubuntu'));
    setBootstrapPublicKey(profile?.bootstrapPublicKey ?? '');
    setSshPrivateKey('');
    setModalToken('');
    setHasSecret(Boolean(profile?.hasSecret));
    setSaveError(null);
  }, [profile]);

  const connectionOptions: Array<{ value: CloudConnectionMethod; label: string; description: string }> =
    provider === 'modal'
      ? [
          {
            value: 'modal-token',
            label: 'Modal token',
            description: 'Modal authenticates with an account token. Runtime secrets are handled separately.'
          }
        ]
      : [
          {
            value: 'ssh-key',
            label: 'SSH key bootstrap',
            description: 'Inject a public key during VM bootstrap so the machine is reachable before manual setup.'
          },
          {
            value: 'ssh-agent',
            label: 'SSH agent',
            description: 'Use agent forwarding after the VM already has SSH access.'
          }
        ];

  const environmentOptions = provider === 'modal' ? ['main', 'dev', 'prod'] : ['dev', 'staging', 'prod'];

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const existingId = profile?.id;
      const id = existingId && !['modal', 'custom-vm'].includes(existingId) ? existingId : `cloud_${Date.now()}`;
      const nextSecret = provider === 'modal' ? modalToken.trim() : sshPrivateKey.trim();
      const secretRef = cloudSecretAccount(id, provider);
      const nextHasSecret = Boolean(nextSecret || hasSecret);

      if (nextSecret) {
        await invoke('cloud_store_profile_secret', {
          request: {
            account: secretRef,
            secret: nextSecret
          }
        });
      }

      const nextProfile: CloudProfile = {
        id,
        title: profileName.trim() || (provider === 'modal' ? 'Modal profile' : 'Custom VM'),
        provider,
        environment,
        runtime: provider === 'modal' ? 'Modal Sandbox' : host.trim() ? `${username.trim() || 'user'}@${host.trim()}` : 'Configure host and credentials',
        connectionMethod,
        host: provider === 'custom-vm' ? host.trim() : '',
        username: username.trim() || (provider === 'modal' ? 'modal' : 'ubuntu'),
        bootstrapPublicKey: provider === 'custom-vm' ? bootstrapPublicKey.trim() : '',
        secretRef,
        hasSecret: nextHasSecret,
        status: provider === 'custom-vm'
          ? (host.trim() && username.trim() && (connectionMethod === 'ssh-agent' || nextHasSecret) ? 'Ready' : 'Draft')
          : (nextHasSecret ? 'Ready' : 'Draft')
      };

      const existingIndex = cloudProfiles.findIndex((entry) => entry.id === id);
      const nextProfiles = existingIndex >= 0
        ? cloudProfiles.map((entry) => entry.id === id ? nextProfile : entry)
        : [...cloudProfiles, nextProfile];

      await saveSettings(buildCloudProfilesSettingsValues(nextProfiles), true);
      setSelectedCloudProfileIdForEdit(null);
      setIsCloudProfileDrawerOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="cloud-profile-drawer">
      <DrawerHeader
        title={selectedCloudProfileIdForEdit ? 'Edit cloud configuration' : 'Add cloud configuration'}
        action={(
          <button
            className="drawer-header-action-button"
            onClick={() => {
              setSelectedCloudProfileIdForEdit(null);
              setIsCloudProfileDrawerOpen(false);
            }}
            type="button"
            aria-label="Close cloud drawer"
          >
            <X size={18} />
          </button>
        )}
      />

      <div className="cloud-profile-drawer-content">
        <div className="model-mgmt-status-row">
          <div className="model-mgmt-status-title">Bootstrap SSH first, then connect normally</div>
          <div className="model-mgmt-status-copy">
            Custom VMs need a public SSH key injected at creation. That keeps the machine reachable even when it starts
            out unconfigured. Modal uses account tokens instead of access/secret key pairs.
          </div>
        </div>

        <div className="form-group">
          <label>Profile name</label>
          <input
            type="text"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="Cloud profile"
          />
        </div>

        <div className="form-group">
          <label>Provider</label>
          <div className="select-wrapper">
            <select
              value={provider}
              onChange={(event) => {
                const nextProvider = event.target.value as CloudProviderId;
              setProvider(nextProvider);
              setEnvironment(nextProvider === 'modal' ? 'main' : 'dev');
              setConnectionMethod(nextProvider === 'modal' ? 'modal-token' : 'ssh-key');
              setHost('');
              setUsername(nextProvider === 'modal' ? 'modal' : 'root');
              setBootstrapPublicKey('');
              setSshPrivateKey('');
              setModalToken('');
              setHasSecret(false);
            }}
          >
              <option value="custom-vm">Custom VM</option>
              <option value="modal">Modal</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Environment</label>
          <div className="select-wrapper">
            <select value={environment} onChange={(event) => setEnvironment(event.target.value)}>
              {environmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'main' ? 'main' : option === 'dev' ? 'dev' : option === 'staging' ? 'staging' : 'prod'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {provider === 'custom-vm' ? (
          <>
            <div className="form-group">
              <label>Host / IP</label>
              <input
                type="text"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="203.0.113.10 or vm.example.com"
              />
            </div>

            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="root, ubuntu, or a custom user"
              />
            </div>

            <div className="form-group">
              <label>Connection method</label>
              <div className="select-wrapper">
                <select
                  value={connectionMethod}
                  onChange={(event) => setConnectionMethod(event.target.value as CloudConnectionMethod)}
                >
                  {connectionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cloud-profile-select-hint">
                {connectionOptions.find((option) => option.value === connectionMethod)?.description}
              </div>
            </div>

            <div className="form-group">
              <label>SSH private key</label>
              <textarea
                className="cloud-profile-textarea"
                value={sshPrivateKey}
                onChange={(event) => setSshPrivateKey(event.target.value)}
                placeholder={hasSecret ? 'Stored securely. Paste a replacement key to rotate.' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
              />
              <div className="cloud-profile-select-hint">
                The private key is written to the OS secure store and is never saved inside the settings payload.
              </div>
            </div>

            <div className="form-group">
              <label>Bootstrap SSH public key</label>
              <textarea
                className="cloud-profile-textarea"
                value={bootstrapPublicKey}
                onChange={(event) => setBootstrapPublicKey(event.target.value)}
                placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA..."
              />
              <div className="cloud-profile-select-hint">
                Paste the public key that should be injected during VM bootstrap. This is what makes a new VM reachable
                before any manual configuration. SSH agent can be used later once access exists.
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label>Modal token</label>
              <input
                type="password"
                value={modalToken}
                onChange={(event) => setModalToken(event.target.value)}
                placeholder={hasSecret ? 'Stored securely. Paste a replacement token to rotate.' : 'modal_token_...'}
              />
              <div className="cloud-profile-select-hint">
                Modal authenticates with an account token. The token is stored by the OS secure store, not in profile JSON.
              </div>
            </div>

            <div className="form-group">
              <label>Connection method</label>
              <div className="select-wrapper">
                <select
                  value={connectionMethod}
                  onChange={(event) => setConnectionMethod(event.target.value as CloudConnectionMethod)}
                >
                  <option value="modal-token">Modal token</option>
                </select>
              </div>
            </div>
          </>
        )}

        <div className="model-mgmt-actions">
          {saveError ? <div className="cloud-profile-select-hint">{saveError}</div> : null}
          <button className="btn-save" type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
