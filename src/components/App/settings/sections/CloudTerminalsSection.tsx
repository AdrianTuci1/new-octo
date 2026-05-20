import { Plus } from 'lucide-react';
import { useMemoryStore, useUIStore } from '../../../../stores';
import { cloudConnectionMethodLabels, normalizeCloudProfiles } from '../cloudProfiles';

export function CloudTerminalsSection() {
  const setIsCloudProfileDrawerOpen = useUIStore((state) => state.setIsCloudProfileDrawerOpen);
  const setSelectedCloudProfileIdForEdit = useUIStore((state) => state.setSelectedCloudProfileIdForEdit);
  const settings = useMemoryStore((state) => state.settings);
  const cloudProfiles = normalizeCloudProfiles(settings?.values);

  const openCloudProfileDrawer = (profileId: string | null) => {
    setSelectedCloudProfileIdForEdit(profileId);
    setIsCloudProfileDrawerOpen(true);
  };

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h1>Cloud</h1>
      </div>

      <p className="settings-panel-description">
        Configure real cloud terminal profiles for Custom VM and Modal runtimes. Secrets are stored by the OS secure store and profiles only keep references.
        Durable agent work also needs the Octomus CLI runner installed on the cloud instance so sessions can continue after the desktop window closes.
      </p>

      <div className="settings-group">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Profiles</h2>
        </div>

        <div className="settings-models-list">
          {cloudProfiles.length === 0 ? (
            <div className="settings-model-card">
              <div className="settings-model-card-info">
                <div className="settings-model-card-name">No cloud profiles configured</div>
                <div className="settings-model-card-provider">Add a Custom VM or Modal profile to launch cloud terminals.</div>
              </div>
              <div className="settings-model-card-status">Setup</div>
            </div>
          ) : null}

          {cloudProfiles.map((profile) => (
            <div
              key={profile.id}
              className="settings-model-card"
              onClick={() => openCloudProfileDrawer(profile.id)}
            >
              <div className="settings-model-card-info">
                <div className="settings-model-card-name">{profile.title}</div>
                <div className="settings-model-card-provider">
                  {profile.provider === 'custom-vm' ? 'Custom VM' : 'Modal'}
                  {profile.connectionMethod ? ` · ${cloudConnectionMethodLabels[profile.connectionMethod]}` : ''}
                  {profile.runtime ? ` · ${profile.runtime}` : ''}
                </div>
              </div>
              <div className={`settings-model-card-status ${profile.status === 'Ready' ? 'active' : ''}`}>
                {profile.status}
              </div>
            </div>
          ))}

          <button className="settings-add-model-btn" type="button" onClick={() => openCloudProfileDrawer(null)}>
            <div className="add-icon-wrapper">
              <Plus size={16} />
            </div>
            <span>Add cloud profile</span>
          </button>
        </div>
      </div>
    </section>
  );
}
