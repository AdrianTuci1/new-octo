import { Cloud, KeyRound, LockKeyhole, MonitorCog, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useMemoryStore } from '../../../../stores';
import { cloudConnectionMethodLabels, normalizeCloudProfiles } from '../cloudProfiles';

function SettingsToggle({ checked = false, onChange }: { checked?: boolean; onChange?: () => void }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'active' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

export function CloudCredentialsSection() {
  const [encryptLocally, setEncryptLocally] = useState(true);
  const [shareAcrossProfiles, setShareAcrossProfiles] = useState(true);
  const settings = useMemoryStore((state) => state.settings);
  const profiles = normalizeCloudProfiles(settings?.values);
  const customVmCount = profiles.filter((profile) => profile.provider === 'custom-vm' && profile.hasSecret).length;
  const modalCount = profiles.filter((profile) => profile.provider === 'modal' && profile.hasSecret).length;
  const credentialSources = [
    {
      title: 'Custom VM credentials',
      description: 'Store SSH material, bootstrap env values, and profile-level auth references for your own machines.',
      status: customVmCount > 0 ? `${customVmCount} configured` : 'Needs setup',
      icon: MonitorCog
    },
    {
      title: 'Modal credentials',
      description: 'Register provider tokens and runtime secrets used to start Modal-backed cloud terminals.',
      status: modalCount > 0 ? `${modalCount} configured` : 'Needs setup',
      icon: Cloud
    }
  ];
  const mappings = profiles
    .filter((profile) => profile.hasSecret)
    .map((profile) => ({
      title: profile.secretRef ?? profile.id,
      subtitle: `Mapped to ${profile.title}`,
      status: profile.status === 'Ready' ? 'Active' : 'Draft',
      tags: [
        profile.provider === 'custom-vm' ? 'SSH key pair' : 'API token',
        profile.provider === 'custom-vm' ? 'Custom VM' : 'Modal',
        profile.connectionMethod ? cloudConnectionMethodLabels[profile.connectionMethod] : null
      ].filter((tag): tag is string => Boolean(tag))
    }));

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h1>Provider credentials</h1>
      </div>

      <p className="settings-panel-description">
        Manage the secret material that cloud terminal providers depend on, while keeping launch profiles and
        runtime defaults separate from credential storage.
      </p>

      <div className="settings-group">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Credential sources</h2>
        </div>

        <div className="settings-cloud-grid">
          {credentialSources.map((source) => {
            const Icon = source.icon;
            return (
              <div key={source.title} className="settings-cloud-card static">
                <div className="settings-cloud-card-header">
                  <div className="settings-cloud-icon-shell">
                    <Icon size={16} />
                  </div>
                  <div className="settings-cloud-title-stack">
                    <div className="settings-cloud-card-title">{source.title}</div>
                    <div className="settings-cloud-card-meta">{source.status}</div>
                  </div>
                  <span className={`settings-cloud-badge ${source.status === 'Needs setup' ? 'soft' : 'success'}`}>
                    {source.status === 'Needs setup' ? 'Pending' : 'Ready'}
                  </span>
                </div>
                <div className="settings-cloud-card-description">{source.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Secrets handling</h2>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">
              <ShieldCheck size={14} />
              Encrypt cloud credentials locally
            </div>
            <div className="settings-row-description">
              Keep provider secrets outside ordinary profile payloads and prepare them for backend-managed routing.
            </div>
          </div>
          <div className="settings-row-action">
            <SettingsToggle checked={encryptLocally} onChange={() => setEncryptLocally((value) => !value)} />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">
              <LockKeyhole size={14} />
              Reuse credentials across profiles
            </div>
            <div className="settings-row-description">
              Allow multiple Custom VM or Modal profiles to reference the same secret entry without duplication.
            </div>
          </div>
          <div className="settings-row-action">
            <SettingsToggle checked={shareAcrossProfiles} onChange={() => setShareAcrossProfiles((value) => !value)} />
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Mapped credentials</h2>
        </div>

        <div className="settings-cloud-profile-list">
          {mappings.length === 0 ? (
            <div className="settings-cloud-profile-card">
              <div className="settings-cloud-profile-header">
                <div className="settings-cloud-title-stack">
                  <div className="settings-cloud-profile-title">No mapped credentials</div>
                  <div className="settings-cloud-profile-subtitle">Credentials appear here after a cloud profile stores a secret.</div>
                </div>
                <span className="settings-cloud-badge soft">Setup</span>
              </div>
            </div>
          ) : null}

          {mappings.map((mapping) => (
            <div key={mapping.title} className="settings-cloud-profile-card">
              <div className="settings-cloud-profile-header">
                <div className="settings-cloud-title-stack">
                  <div className="settings-cloud-profile-title">{mapping.title}</div>
                  <div className="settings-cloud-profile-subtitle">{mapping.subtitle}</div>
                </div>
                <span className={`settings-cloud-badge ${mapping.status === 'Active' ? 'success' : 'soft'}`}>
                  {mapping.status}
                </span>
              </div>

              <div className="settings-cloud-chip-row">
                <span className="settings-cloud-chip">
                  <KeyRound size={12} />
                  Secret reference
                </span>
                {mapping.tags.map((tag) => (
                  <span key={tag} className="settings-cloud-chip">{tag}</span>
                ))}
              </div>
            </div>
          ))}

          <button className="settings-add-model-btn" type="button">
            <div className="add-icon-wrapper">
              <Plus size={16} />
            </div>
            <span>Add provider credential</span>
          </button>
        </div>
      </div>
    </section>
  );
}
